/**
 * relay-from-scratch/relay.ts — A Complete Minimal NOSTR Relay
 *
 * Implements the core relay protocol (NIP-01) from scratch with:
 * - WebSocket server accepting NOSTR protocol messages
 * - In-memory event store with multi-key indexing
 * - Full filter matching per the protocol spec
 * - Per-connection subscription management
 * - NIP-11 relay information document over HTTP
 * - Basic rate limiting
 *
 * Run: npx tsx relay.ts
 * Connect with any NOSTR client: ws://localhost:7777
 *
 * Dependencies: ws (WebSocket server), nostr-tools (event verification)
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { verifyEvent, type Event, type Filter } from "nostr-tools";
import * as crypto from "crypto";

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 7777;
const MAX_SUBSCRIPTIONS_PER_CLIENT = 20;
const MAX_EVENT_SIZE_BYTES = 65536; // 64KB per NIP-01 recommendation
const RATE_LIMIT_EVENTS_PER_MINUTE = 60;
const MAX_FILTERS_PER_REQ = 10;

// ─── Event Store ────────────────────────────────────────────────────────────

/**
 * In-memory event store with indexes for efficient querying.
 *
 * A production relay would use SQLite, PostgreSQL, or LMDB here.
 * The indexing strategy matters enormously for performance — these
 * indexes mirror what you'd create as database indexes.
 */
class EventStore {
  // Primary storage: event id -> event
  private events: Map<string, Event> = new Map();

  // Indexes for efficient filter matching
  private byAuthor: Map<string, Set<string>> = new Map(); // pubkey -> event ids
  private byKind: Map<number, Set<string>> = new Map(); // kind -> event ids
  private byTag: Map<string, Set<string>> = new Map(); // "tagname:value" -> event ids

  /**
   * Store an event, replacing if it's a replaceable kind.
   * Returns true if the event was stored (new), false if duplicate.
   */
  store(event: Event): boolean {
    // Duplicate check
    if (this.events.has(event.id)) {
      return false;
    }

    // Handle replaceable events (kinds 0, 3, and 10000-19999):
    // Only the latest event per (pubkey, kind) is kept
    if (this.isReplaceable(event.kind)) {
      this.replaceExisting(event);
    }

    // Handle parameterized replaceable events (kinds 30000-39999):
    // Only the latest per (pubkey, kind, d-tag) is kept
    if (this.isParameterizedReplaceable(event.kind)) {
      this.replaceParameterized(event);
    }

    // Store the event
    this.events.set(event.id, event);

    // Update author index
    if (!this.byAuthor.has(event.pubkey)) {
      this.byAuthor.set(event.pubkey, new Set());
    }
    this.byAuthor.get(event.pubkey)!.add(event.id);

    // Update kind index
    if (!this.byKind.has(event.kind)) {
      this.byKind.set(event.kind, new Set());
    }
    this.byKind.get(event.kind)!.add(event.id);

    // Update tag indexes — we index all single-letter tags
    // because filters can query any of them (#e, #p, #t, etc.)
    for (const tag of event.tags) {
      if (tag.length >= 2 && tag[0].length === 1) {
        const key = `${tag[0]}:${tag[1]}`;
        if (!this.byTag.has(key)) {
          this.byTag.set(key, new Set());
        }
        this.byTag.get(key)!.add(event.id);
      }
    }

    return true;
  }

  /**
   * Query events matching a filter.
   *
   * Filter matching per NIP-01: all specified fields must match (AND logic).
   * Within a field (e.g., multiple authors), any match suffices (OR logic).
   */
  query(filter: Filter): Event[] {
    // Start with the smallest candidate set to minimize scanning.
    // This is the key optimization — intersect indexed sets before
    // doing expensive per-event checks.
    let candidateIds: Set<string> | null = null;

    // Use ids index (most selective — usually returns 1 event)
    if (filter.ids && filter.ids.length > 0) {
      candidateIds = new Set<string>();
      for (const id of filter.ids) {
        // Support prefix matching: NIP-01 says ids can be prefixes
        if (id.length === 64) {
          if (this.events.has(id)) candidateIds.add(id);
        } else {
          // Prefix match — scan (a production relay would use a trie)
          for (const eventId of this.events.keys()) {
            if (eventId.startsWith(id)) candidateIds.add(eventId);
          }
        }
      }
    }

    // Use author index
    if (filter.authors && filter.authors.length > 0) {
      const authorMatches = new Set<string>();
      for (const author of filter.authors) {
        const ids = this.byAuthor.get(author);
        if (ids) {
          for (const id of ids) authorMatches.add(id);
        }
      }
      candidateIds = candidateIds
        ? this.intersect(candidateIds, authorMatches)
        : authorMatches;
    }

    // Use kind index
    if (filter.kinds && filter.kinds.length > 0) {
      const kindMatches = new Set<string>();
      for (const kind of filter.kinds) {
        const ids = this.byKind.get(kind);
        if (ids) {
          for (const id of ids) kindMatches.add(id);
        }
      }
      candidateIds = candidateIds
        ? this.intersect(candidateIds, kindMatches)
        : kindMatches;
    }

    // Use tag indexes (#e, #p, #t, etc.)
    // NIP-01: filter keys like "#e" mean "events with an 'e' tag matching one of these values"
    for (const [key, values] of Object.entries(filter)) {
      if (key.startsWith("#") && key.length === 2 && Array.isArray(values)) {
        const tagName = key.slice(1);
        const tagMatches = new Set<string>();
        for (const value of values) {
          const ids = this.byTag.get(`${tagName}:${value}`);
          if (ids) {
            for (const id of ids) tagMatches.add(id);
          }
        }
        candidateIds = candidateIds
          ? this.intersect(candidateIds, tagMatches)
          : tagMatches;
      }
    }

    // If no indexed fields were specified, scan everything
    if (candidateIds === null) {
      candidateIds = new Set(this.events.keys());
    }

    // Now do the expensive per-event checks (since, until) and collect results
    let results: Event[] = [];
    for (const id of candidateIds) {
      const event = this.events.get(id);
      if (!event) continue;

      if (filter.since && event.created_at < filter.since) continue;
      if (filter.until && event.created_at > filter.until) continue;

      results.push(event);
    }

    // Sort by created_at descending (newest first) — this is what clients expect
    results.sort((a, b) => b.created_at - a.created_at);

    // Apply limit
    if (filter.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  get size(): number {
    return this.events.size;
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private intersect(a: Set<string>, b: Set<string>): Set<string> {
    // Iterate the smaller set for efficiency
    const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
    const result = new Set<string>();
    for (const id of smaller) {
      if (larger.has(id)) result.add(id);
    }
    return result;
  }

  private isReplaceable(kind: number): boolean {
    return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
  }

  private isParameterizedReplaceable(kind: number): boolean {
    return kind >= 30000 && kind < 40000;
  }

  private replaceExisting(newEvent: Event): void {
    const authorEvents = this.byAuthor.get(newEvent.pubkey);
    if (!authorEvents) return;

    for (const existingId of authorEvents) {
      const existing = this.events.get(existingId);
      if (existing && existing.kind === newEvent.kind) {
        // Only replace if the new event is newer
        if (newEvent.created_at <= existing.created_at) return;
        this.removeEvent(existingId);
        break; // Only one replaceable event per (pubkey, kind)
      }
    }
  }

  private replaceParameterized(newEvent: Event): void {
    const dTag = newEvent.tags.find((t) => t[0] === "d")?.[1] ?? "";
    const authorEvents = this.byAuthor.get(newEvent.pubkey);
    if (!authorEvents) return;

    for (const existingId of authorEvents) {
      const existing = this.events.get(existingId);
      if (existing && existing.kind === newEvent.kind) {
        const existingD = existing.tags.find((t) => t[0] === "d")?.[1] ?? "";
        if (existingD === dTag) {
          if (newEvent.created_at <= existing.created_at) return;
          this.removeEvent(existingId);
          break;
        }
      }
    }
  }

  private removeEvent(id: string): void {
    const event = this.events.get(id);
    if (!event) return;

    this.events.delete(id);
    this.byAuthor.get(event.pubkey)?.delete(id);
    this.byKind.get(event.kind)?.delete(id);

    for (const tag of event.tags) {
      if (tag.length >= 2 && tag[0].length === 1) {
        this.byTag.get(`${tag[0]}:${tag[1]}`)?.delete(id);
      }
    }
  }
}

// ─── Rate Limiter ───────────────────────────────────────────────────────────

/**
 * Simple sliding-window rate limiter per client connection.
 *
 * A production relay would use token buckets or leaky buckets,
 * and rate-limit by IP address, pubkey, or both.
 */
class RateLimiter {
  private timestamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Returns true if the action is allowed, false if rate-limited.
   */
  check(): boolean {
    const now = Date.now();
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.limit) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}

// ─── Subscription Manager ───────────────────────────────────────────────────

interface Subscription {
  id: string;
  filters: Filter[];
}

/**
 * Track subscriptions per WebSocket connection.
 *
 * Each client can have multiple active subscriptions, each with
 * its own set of filters. When a new event is stored, we check
 * all subscriptions across all clients to see who should be notified.
 */
class ConnectionState {
  subscriptions: Map<string, Subscription> = new Map();
  rateLimiter: RateLimiter = new RateLimiter(RATE_LIMIT_EVENTS_PER_MINUTE);
  remoteAddress: string;

  constructor(remoteAddress: string) {
    this.remoteAddress = remoteAddress;
  }
}

// ─── Message Handling ───────────────────────────────────────────────────────

/**
 * The relay holds all state: the event store and a map of
 * active connections with their subscriptions.
 */
class NostrRelay {
  private store: EventStore = new EventStore();
  private connections: Map<WebSocket, ConnectionState> = new Map();

  /**
   * Handle a new WebSocket connection.
   */
  handleConnection(ws: WebSocket, remoteAddress: string): void {
    const connState = new ConnectionState(remoteAddress);
    this.connections.set(ws, connState);
    console.log(`[conn] New connection from ${remoteAddress} (${this.connections.size} total)`);

    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, connState, data);
    });

    ws.on("close", () => {
      this.connections.delete(ws);
      console.log(`[conn] Disconnected ${remoteAddress} (${this.connections.size} remaining)`);
    });

    ws.on("error", (err) => {
      console.error(`[conn] Error from ${remoteAddress}:`, err.message);
    });
  }

  /**
   * Parse and route an incoming NOSTR protocol message.
   *
   * NIP-01 defines three client-to-relay message types:
   * - ["EVENT", <event>]
   * - ["REQ", <sub-id>, <filter1>, <filter2>, ...]
   * - ["CLOSE", <sub-id>]
   */
  private handleMessage(ws: WebSocket, conn: ConnectionState, data: Buffer): void {
    let msg: unknown[];
    try {
      const text = data.toString();
      if (text.length > MAX_EVENT_SIZE_BYTES) {
        this.sendNotice(ws, "Error: message too large");
        return;
      }
      msg = JSON.parse(text);
    } catch {
      this.sendNotice(ws, "Error: invalid JSON");
      return;
    }

    if (!Array.isArray(msg) || msg.length < 2) {
      this.sendNotice(ws, "Error: invalid message format");
      return;
    }

    const type = msg[0];

    switch (type) {
      case "EVENT":
        this.handleEvent(ws, conn, msg[1] as Event);
        break;
      case "REQ":
        this.handleReq(ws, conn, msg);
        break;
      case "CLOSE":
        this.handleClose(ws, conn, msg[1] as string);
        break;
      default:
        this.sendNotice(ws, `Error: unknown message type '${type}'`);
    }
  }

  /**
   * Handle EVENT message: validate, store, and notify subscribers.
   *
   * NIP-01 requires an OK response indicating success or failure:
   * ["OK", <event-id>, <accepted: bool>, <message>]
   */
  private handleEvent(ws: WebSocket, conn: ConnectionState, event: Event): void {
    // Rate limit check
    if (!conn.rateLimiter.check()) {
      this.sendOK(ws, event?.id ?? "", false, "rate-limited: slow down");
      return;
    }

    // ── Validation Pipeline ────────────────────────────────────────────

    // 1. Basic structure check
    if (!event || !event.id || !event.pubkey || !event.sig) {
      this.sendOK(ws, event?.id ?? "", false, "invalid: missing required fields");
      return;
    }

    // 2. Verify the id is the correct hash of the event content.
    //    This also verifies the schnorr signature against the pubkey.
    //    verifyEvent() from nostr-tools does both checks.
    if (!verifyEvent(event)) {
      this.sendOK(ws, event.id, false, "invalid: signature verification failed");
      return;
    }

    // 3. Reject events with timestamps too far in the future
    //    (prevents clients from publishing future-dated events to
    //    manipulate feed ordering)
    const now = Math.floor(Date.now() / 1000);
    if (event.created_at > now + 900) {
      // 15 minutes tolerance
      this.sendOK(ws, event.id, false, "invalid: event is too far in the future");
      return;
    }

    // ── Storage ────────────────────────────────────────────────────────

    const isNew = this.store.store(event);

    if (!isNew) {
      // Duplicate — accepted but not stored (this is normal)
      this.sendOK(ws, event.id, true, "duplicate: already have this event");
      return;
    }

    console.log(`[event] Stored kind ${event.kind} from ${event.pubkey.slice(0, 8)}... (${this.store.size} total)`);
    this.sendOK(ws, event.id, true, "");

    // ── Notify Subscribers ─────────────────────────────────────────────
    // Check every active subscription across all connections to see
    // if this new event matches any of their filters.

    for (const [clientWs, clientConn] of this.connections) {
      if (clientWs.readyState !== WebSocket.OPEN) continue;

      for (const [subId, sub] of clientConn.subscriptions) {
        if (this.eventMatchesFilters(event, sub.filters)) {
          this.sendEvent(clientWs, subId, event);
        }
      }
    }
  }

  /**
   * Handle REQ message: query historical events, send EOSE, then
   * keep the subscription active for future events.
   *
   * Format: ["REQ", <sub-id>, <filter1>, <filter2>, ...]
   * Response: ["EVENT", <sub-id>, <event>] for each match, then ["EOSE", <sub-id>]
   */
  private handleReq(ws: WebSocket, conn: ConnectionState, msg: unknown[]): void {
    const subId = msg[1] as string;

    if (typeof subId !== "string" || subId.length === 0 || subId.length > 64) {
      this.sendNotice(ws, "Error: invalid subscription id");
      return;
    }

    // Parse filters (everything after the subscription ID)
    const filters: Filter[] = [];
    for (let i = 2; i < msg.length; i++) {
      if (typeof msg[i] === "object" && msg[i] !== null) {
        filters.push(msg[i] as Filter);
      }
    }

    if (filters.length === 0) {
      this.sendNotice(ws, "Error: REQ must include at least one filter");
      return;
    }

    if (filters.length > MAX_FILTERS_PER_REQ) {
      this.sendNotice(ws, `Error: too many filters (max ${MAX_FILTERS_PER_REQ})`);
      return;
    }

    // Enforce subscription limit per connection
    if (
      !conn.subscriptions.has(subId) &&
      conn.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_CLIENT
    ) {
      this.sendNotice(ws, `Error: too many subscriptions (max ${MAX_SUBSCRIPTIONS_PER_CLIENT})`);
      return;
    }

    // If a subscription with this ID already exists, replace it
    // (this is standard NIP-01 behavior — clients reuse sub IDs)
    conn.subscriptions.set(subId, { id: subId, filters });

    // Query the store for each filter and send matching events.
    // Use a Set to deduplicate events that match multiple filters.
    const sentIds = new Set<string>();

    for (const filter of filters) {
      const events = this.store.query(filter);
      for (const event of events) {
        if (!sentIds.has(event.id)) {
          sentIds.add(event.id);
          this.sendEvent(ws, subId, event);
        }
      }
    }

    // EOSE (End Of Stored Events) tells the client that all historical
    // events have been sent. New events matching this subscription
    // will arrive as they come in.
    this.sendEOSE(ws, subId);

    console.log(`[req] Sub '${subId}' from ${conn.remoteAddress}: ${filters.length} filters, ${sentIds.size} historical events`);
  }

  /**
   * Handle CLOSE message: remove a subscription.
   */
  private handleClose(ws: WebSocket, conn: ConnectionState, subId: string): void {
    if (conn.subscriptions.has(subId)) {
      conn.subscriptions.delete(subId);
      console.log(`[close] Sub '${subId}' from ${conn.remoteAddress} closed`);
    }
  }

  // ─── Filter Matching ────────────────────────────────────────────────────

  /**
   * Check if an event matches any of the given filters.
   * Used for real-time subscription notifications.
   *
   * Per NIP-01: if multiple filters are provided, the event must match
   * at least one of them (OR between filters).
   */
  private eventMatchesFilters(event: Event, filters: Filter[]): boolean {
    return filters.some((filter) => this.eventMatchesFilter(event, filter));
  }

  /**
   * Check if an event matches a single filter.
   *
   * All present conditions must be met (AND logic).
   * Within each condition, any value matching suffices (OR logic).
   */
  private eventMatchesFilter(event: Event, filter: Filter): boolean {
    // ids: event id must be in the list (or prefix-match)
    if (filter.ids && filter.ids.length > 0) {
      if (!filter.ids.some((id) => event.id.startsWith(id))) {
        return false;
      }
    }

    // authors: event pubkey must be in the list
    if (filter.authors && filter.authors.length > 0) {
      if (!filter.authors.some((a) => event.pubkey.startsWith(a))) {
        return false;
      }
    }

    // kinds: event kind must be in the list
    if (filter.kinds && filter.kinds.length > 0) {
      if (!filter.kinds.includes(event.kind)) {
        return false;
      }
    }

    // since: event must be created at or after this timestamp
    if (filter.since !== undefined && event.created_at < filter.since) {
      return false;
    }

    // until: event must be created at or before this timestamp
    if (filter.until !== undefined && event.created_at > filter.until) {
      return false;
    }

    // Tag filters (#e, #p, #t, etc.): event must have a matching tag
    for (const [key, values] of Object.entries(filter)) {
      if (key.startsWith("#") && key.length === 2 && Array.isArray(values) && values.length > 0) {
        const tagName = key.slice(1);
        const hasMatch = event.tags.some(
          (tag) => tag[0] === tagName && values.includes(tag[1])
        );
        if (!hasMatch) return false;
      }
    }

    return true;
  }

  // ─── Protocol Message Senders ─────────────────────────────────────────

  private sendEvent(ws: WebSocket, subId: string, event: Event): void {
    this.send(ws, ["EVENT", subId, event]);
  }

  private sendOK(ws: WebSocket, eventId: string, accepted: boolean, message: string): void {
    this.send(ws, ["OK", eventId, accepted, message]);
  }

  private sendEOSE(ws: WebSocket, subId: string): void {
    this.send(ws, ["EOSE", subId]);
  }

  private sendNotice(ws: WebSocket, message: string): void {
    this.send(ws, ["NOTICE", message]);
  }

  private send(ws: WebSocket, msg: unknown[]): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

// ─── NIP-11 Relay Information Document ──────────────────────────────────────

/**
 * NIP-11 defines an HTTP endpoint that returns relay metadata.
 * Clients fetch this before connecting to discover relay capabilities,
 * payment requirements, and contact information.
 */
function getRelayInfo(): object {
  return {
    name: "nostr-minimal-relay",
    description: "A minimal NOSTR relay built from scratch for educational purposes",
    pubkey: "", // Relay operator's pubkey — left blank for this example
    contact: "",
    supported_nips: [1, 11],
    software: "nostr-relay-from-scratch",
    version: "0.1.0",
    limitation: {
      max_message_length: MAX_EVENT_SIZE_BYTES,
      max_subscriptions: MAX_SUBSCRIPTIONS_PER_CLIENT,
      max_filters: MAX_FILTERS_PER_REQ,
      max_event_tags: 2000,
      auth_required: false,
      payment_required: false,
    },
  };
}

// ─── Server Setup ───────────────────────────────────────────────────────────

function startRelay(): void {
  const relay = new NostrRelay();

  // Create an HTTP server that serves NIP-11 for HTTP requests
  // and upgrades WebSocket requests to the NOSTR protocol.
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // NIP-11: return relay info when Accept header includes application/nostr+json
    // or when the path is / and it's a regular HTTP GET
    if (req.headers.accept?.includes("application/nostr+json") || req.url === "/") {
      res.writeHead(200, {
        "Content-Type": "application/nostr+json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Accept",
      });
      res.end(JSON.stringify(getRelayInfo(), null, 2));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  // WebSocket server piggybacks on the HTTP server
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const remoteAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    relay.handleConnection(ws, remoteAddress);
  });

  // ── Graceful Shutdown ───────────────────────────────────────────────

  const shutdown = (signal: string): void => {
    console.log(`\n[shutdown] Received ${signal}, closing gracefully...`);

    // Close all WebSocket connections with a "going away" code
    wss.clients.forEach((client) => {
      client.close(1001, "Relay shutting down");
    });

    // Close the HTTP server
    server.close(() => {
      console.log("[shutdown] Server closed. Goodbye!");
      process.exit(0);
    });

    // Force exit after 5 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error("[shutdown] Forced exit after timeout");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // ── Start Listening ─────────────────────────────────────────────────

  server.listen(PORT, () => {
    console.log("=== NOSTR Minimal Relay ===");
    console.log(`WebSocket: ws://localhost:${PORT}`);
    console.log(`NIP-11:    http://localhost:${PORT}`);
    console.log(`Limits:    ${RATE_LIMIT_EVENTS_PER_MINUTE} events/min, ${MAX_SUBSCRIPTIONS_PER_CLIENT} subs/client`);
    console.log("Waiting for connections...\n");
  });
}

// ─── Entry Point ────────────────────────────────────────────────────────────

startRelay();
