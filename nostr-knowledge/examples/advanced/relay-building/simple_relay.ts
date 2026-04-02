/**
 * simple_relay.ts — A minimal NOSTR relay implementation in TypeScript.
 *
 * This relay supports the core NOSTR protocol:
 *   - EVENT: receive and store events (with signature verification)
 *   - REQ: subscribe to events matching filters
 *   - CLOSE: cancel subscriptions
 *
 * It responds with OK, EOSE, EVENT, and NOTICE messages per NIP-01.
 *
 * Dependencies:
 *   npm install ws nostr-tools
 *   npm install -D @types/ws typescript
 *
 * Run:
 *   npx ts-node simple_relay.ts
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  validateEvent,
  verifyEvent,
  type Event as NostrEvent,
  type Filter,
} from "nostr-tools";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A subscription is a client-chosen ID plus one or more filters. */
interface Subscription {
  id: string;
  filters: Filter[];
}

/** Per-connection state. */
interface ClientState {
  subscriptions: Map<string, Subscription>;
}

// ---------------------------------------------------------------------------
// In-memory event store
// ---------------------------------------------------------------------------

class EventStore {
  /** All stored events keyed by event id. */
  private events: Map<string, NostrEvent> = new Map();

  /** Store an event. Returns true if it was new, false if duplicate. */
  add(event: NostrEvent): boolean {
    if (this.events.has(event.id)) {
      return false; // duplicate
    }
    this.events.set(event.id, event);
    return true;
  }

  /**
   * Return all events that match a single filter.
   *
   * Filter matching rules (NIP-01):
   *   - Each filter field is a condition; ALL conditions must be satisfied.
   *   - ids: event.id starts with one of the given prefixes.
   *   - authors: event.pubkey starts with one of the given prefixes.
   *   - kinds: event.kind is in the list.
   *   - #<tag>: event has a tag whose first element is <tag> and whose
   *     second element is in the filter's list.
   *   - since: event.created_at >= since
   *   - until: event.created_at <= until
   *   - limit: return at most N events (newest first).
   */
  query(filter: Filter): NostrEvent[] {
    let results: NostrEvent[] = [];

    for (const event of this.events.values()) {
      if (this.matchesFilter(event, filter)) {
        results.push(event);
      }
    }

    // Sort newest-first (descending created_at)
    results.sort((a, b) => b.created_at - a.created_at);

    // Apply limit
    if (filter.limit !== undefined && filter.limit >= 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /** Check whether a single event matches a single filter. */
  matchesFilter(event: NostrEvent, filter: Filter): boolean {
    // --- ids (prefix match) ---
    if (filter.ids && filter.ids.length > 0) {
      if (!filter.ids.some((prefix) => event.id.startsWith(prefix))) {
        return false;
      }
    }

    // --- authors (prefix match) ---
    if (filter.authors && filter.authors.length > 0) {
      if (
        !filter.authors.some((prefix) => event.pubkey.startsWith(prefix))
      ) {
        return false;
      }
    }

    // --- kinds ---
    if (filter.kinds && filter.kinds.length > 0) {
      if (!filter.kinds.includes(event.kind)) {
        return false;
      }
    }

    // --- since / until ---
    if (filter.since !== undefined && event.created_at < filter.since) {
      return false;
    }
    if (filter.until !== undefined && event.created_at > filter.until) {
      return false;
    }

    // --- generic tag filters (#e, #p, #t, etc.) ---
    // In a Filter object from nostr-tools, tag filters appear as keys
    // like "#e", "#p", "#t", etc., each mapping to string[].
    for (const [key, values] of Object.entries(filter)) {
      if (key.startsWith("#") && Array.isArray(values) && values.length > 0) {
        const tagName = key.slice(1); // e.g. "e", "p", "t"
        const eventTagValues = event.tags
          .filter((t) => t[0] === tagName)
          .map((t) => t[1]);

        // The event must have at least one matching tag value
        if (!values.some((v: string) => eventTagValues.includes(v))) {
          return false;
        }
      }
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// Relay server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.RELAY_PORT || "7777", 10);
const store = new EventStore();

/** Map from WebSocket instance to its state. */
const clients: Map<WebSocket, ClientState> = new Map();

const wss = new WebSocketServer({ port: PORT });

console.log(`[relay] Listening on ws://localhost:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  console.log("[relay] New client connected");

  // Initialise per-client state
  const state: ClientState = {
    subscriptions: new Map(),
  };
  clients.set(ws, state);

  ws.on("message", (raw: Buffer) => {
    let msg: unknown;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendNotice(ws, "invalid JSON");
      return;
    }

    if (!Array.isArray(msg) || msg.length < 2) {
      sendNotice(ws, "invalid message format");
      return;
    }

    const type = msg[0] as string;

    switch (type) {
      case "EVENT":
        handleEvent(ws, msg[1] as NostrEvent);
        break;
      case "REQ":
        handleReq(ws, state, msg);
        break;
      case "CLOSE":
        handleClose(ws, state, msg[1] as string);
        break;
      default:
        sendNotice(ws, `unknown message type: ${type}`);
    }
  });

  ws.on("close", () => {
    console.log("[relay] Client disconnected");
    clients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("[relay] WebSocket error:", err.message);
  });
});

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

/**
 * Handle an EVENT message from a client.
 *
 * Flow:
 *   1. Validate the event structure (correct fields, valid id).
 *   2. Verify the Schnorr signature.
 *   3. Store the event.
 *   4. Reply with ["OK", <id>, true/false, "reason"].
 *   5. Broadcast the event to all subscribers whose filters match.
 */
function handleEvent(ws: WebSocket, event: NostrEvent): void {
  // Step 1 — Structural validation
  if (!validateEvent(event)) {
    send(ws, ["OK", event?.id ?? "", false, "invalid: bad event structure"]);
    return;
  }

  // Step 2 — Signature verification
  if (!verifyEvent(event)) {
    send(ws, ["OK", event.id, false, "invalid: bad signature"]);
    return;
  }

  // Step 3 — Store
  const isNew = store.add(event);

  if (!isNew) {
    // Duplicate — still OK per spec, just flag it
    send(ws, ["OK", event.id, true, "duplicate: already have this event"]);
    return;
  }

  // Step 4 — Acknowledge
  send(ws, ["OK", event.id, true, ""]);
  console.log(`[relay] Stored event ${event.id.slice(0, 8)}... kind=${event.kind}`);

  // Step 5 — Broadcast to matching subscribers on ALL connected clients
  for (const [clientWs, clientState] of clients.entries()) {
    if (clientWs.readyState !== WebSocket.OPEN) continue;

    for (const sub of clientState.subscriptions.values()) {
      const matches = sub.filters.some((f) => store.matchesFilter(event, f));
      if (matches) {
        send(clientWs, ["EVENT", sub.id, event]);
      }
    }
  }
}

/**
 * Handle a REQ message — create or replace a subscription.
 *
 * Message format: ["REQ", <subscription_id>, <filter1>, <filter2>, ...]
 *
 * Flow:
 *   1. Parse subscription ID and filters.
 *   2. Register the subscription (replacing any existing one with same ID).
 *   3. Query the store for matching historical events and send them.
 *   4. Send EOSE (End Of Stored Events).
 */
function handleReq(ws: WebSocket, state: ClientState, msg: unknown[]): void {
  if (msg.length < 3) {
    sendNotice(ws, "REQ must include subscription ID and at least one filter");
    return;
  }

  const subId = msg[1] as string;
  const filters = msg.slice(2) as Filter[];

  // Validate filters are objects
  for (const f of filters) {
    if (typeof f !== "object" || f === null || Array.isArray(f)) {
      sendNotice(ws, `invalid filter in subscription ${subId}`);
      return;
    }
  }

  // Register the subscription
  const subscription: Subscription = { id: subId, filters };
  state.subscriptions.set(subId, subscription);
  console.log(`[relay] Subscription ${subId}: ${filters.length} filter(s)`);

  // Send historical matches
  // We union the results from all filters, deduplicated by event id.
  const seen = new Set<string>();
  for (const filter of filters) {
    const events = store.query(filter);
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        send(ws, ["EVENT", subId, event]);
      }
    }
  }

  // End of stored events
  send(ws, ["EOSE", subId]);
}

/**
 * Handle a CLOSE message — remove a subscription.
 *
 * Message format: ["CLOSE", <subscription_id>]
 */
function handleClose(
  ws: WebSocket,
  state: ClientState,
  subId: string
): void {
  if (state.subscriptions.has(subId)) {
    state.subscriptions.delete(subId);
    console.log(`[relay] Closed subscription ${subId}`);
  } else {
    sendNotice(ws, `no such subscription: ${subId}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Send a JSON-encoded message to one client. */
function send(ws: WebSocket, message: unknown[]): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Send a NOTICE message. */
function sendNotice(ws: WebSocket, text: string): void {
  send(ws, ["NOTICE", text]);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
process.on("SIGINT", () => {
  console.log("\n[relay] Shutting down...");
  wss.close(() => {
    console.log("[relay] Server closed");
    process.exit(0);
  });
});
