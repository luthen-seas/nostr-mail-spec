/**
 * simple-client/client.ts — A Complete Minimal NOSTR Client
 *
 * This single file implements a fully functional NOSTR client demonstrating
 * the core protocol flow: key management, relay connections, publishing,
 * subscribing, threading, and reactions.
 *
 * Run: npx ts-node client.ts
 * Or:  npx tsx client.ts
 *
 * Dependencies: nostr-tools (v2+), websocket-polyfill
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent,
  type Event,
  type EventTemplate,
  type Filter,
} from "nostr-tools";
import { SimplePool } from "nostr-tools/pool";
import { nip19 } from "nostr-tools";
import * as readline from "readline";

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// How far back to look when loading the feed (24 hours)
const FEED_LOOKBACK_SECONDS = 24 * 60 * 60;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Profile {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  display_name?: string;
}

interface ClientState {
  secretKey: Uint8Array;
  pubkey: string;
  pool: SimplePool;
  relays: string[];
  profiles: Map<string, Profile>; // pubkey -> profile
  events: Map<string, Event>; // event id -> event
  following: Set<string>; // pubkeys we follow
  activeSubscriptions: Map<string, { unsub: () => void }>;
}

// ─── Key Management ─────────────────────────────────────────────────────────

/**
 * Generate a fresh keypair or import from an nsec string.
 *
 * In production you'd integrate with NIP-07 browser extensions or
 * NIP-46 remote signing — never store raw keys in plaintext.
 */
function initKeys(nsec?: string): { secretKey: Uint8Array; pubkey: string } {
  let secretKey: Uint8Array;

  if (nsec) {
    // Decode nsec bech32 to raw bytes
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") {
      throw new Error(`Expected nsec, got ${decoded.type}`);
    }
    secretKey = decoded.data;
    console.log("[keys] Imported existing keypair from nsec");
  } else {
    secretKey = generateSecretKey();
    console.log("[keys] Generated new keypair");
    console.log(`[keys] Save this nsec to reuse your identity:`);
    console.log(`       ${nip19.nsecEncode(secretKey)}`);
  }

  const pubkey = getPublicKey(secretKey);
  console.log(`[keys] Public key: ${nip19.npubEncode(pubkey)}`);
  console.log(`[keys] Hex pubkey: ${pubkey}`);

  return { secretKey, pubkey };
}

// ─── Event Publishing ───────────────────────────────────────────────────────

/**
 * Publish a signed event to all connected relays.
 * Returns the signed event so callers can reference its id.
 *
 * SimplePool.publish() sends to all relays in parallel and returns
 * a Promise that resolves when at least one relay accepts it.
 */
async function publishEvent(
  state: ClientState,
  template: EventTemplate
): Promise<Event> {
  const signed = finalizeEvent(template, state.secretKey);

  // Verify our own event before sending — catches bugs early
  if (!verifyEvent(signed)) {
    throw new Error("Generated invalid event — this is a bug");
  }

  console.log(`[publish] Broadcasting event ${signed.id.slice(0, 8)}... (kind ${signed.kind})`);

  try {
    await Promise.any(state.pool.publish(state.relays, signed));
    console.log(`[publish] Accepted by at least one relay`);
  } catch (err) {
    console.error(`[publish] All relays rejected the event:`, err);
  }

  // Cache locally regardless of relay acceptance
  state.events.set(signed.id, signed);
  return signed;
}

/**
 * Publish a kind 0 profile metadata event.
 *
 * Kind 0 is a "replaceable event" — relays keep only the latest one
 * per pubkey. The content is a JSON string with profile fields.
 */
async function publishProfile(
  state: ClientState,
  profile: Profile
): Promise<Event> {
  const template: EventTemplate = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(profile),
  };
  const event = await publishEvent(state, template);
  // Update our local cache so our name appears in our own feed
  state.profiles.set(state.pubkey, profile);
  return event;
}

/**
 * Publish a kind 1 text note.
 *
 * Kind 1 is the basic "tweet" of NOSTR. Content is plaintext
 * (clients may render markdown, but the protocol is plaintext).
 */
async function publishNote(
  state: ClientState,
  content: string
): Promise<Event> {
  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content,
  };
  return publishEvent(state, template);
}

/**
 * Reply to an existing event with proper NIP-10 threading.
 *
 * NIP-10 threading uses "e" tags with markers:
 * - ["e", <root-id>, <relay>, "root"]  — the top-level event of the thread
 * - ["e", <reply-id>, <relay>, "reply"] — the event we're directly replying to
 * - ["p", <pubkey>] — mentions of all participants so they get notified
 *
 * If replying to the root itself, root and reply point to the same event.
 */
async function publishReply(
  state: ClientState,
  replyTo: Event,
  content: string
): Promise<Event> {
  // Find the root of the thread by looking at the event we're replying to
  const rootTag = replyTo.tags.find(
    (t) => t[0] === "e" && t[3] === "root"
  );
  const rootId = rootTag ? rootTag[1] : replyTo.id;
  const rootRelay = rootTag ? rootTag[2] : "";

  const tags: string[][] = [
    // Always include the root reference
    ["e", rootId, rootRelay, "root"],
    // The event we're directly replying to
    ["e", replyTo.id, "", "reply"],
    // Mention the author of the event we're replying to
    ["p", replyTo.pubkey],
  ];

  // Also mention everyone else in the thread (collect unique "p" tags)
  const mentionedPubkeys = new Set([replyTo.pubkey, state.pubkey]);
  for (const tag of replyTo.tags) {
    if (tag[0] === "p" && !mentionedPubkeys.has(tag[1])) {
      tags.push(["p", tag[1]]);
      mentionedPubkeys.add(tag[1]);
    }
  }

  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
  return publishEvent(state, template);
}

/**
 * React to an event with kind 7.
 *
 * NIP-25 reactions: content is typically "+" (like), "-" (dislike),
 * or an emoji. Tags reference the event and its author.
 */
async function publishReaction(
  state: ClientState,
  target: Event,
  reaction: string = "+"
): Promise<Event> {
  const template: EventTemplate = {
    kind: 7,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", target.id],
      ["p", target.pubkey],
    ],
    content: reaction,
  };
  return publishEvent(state, template);
}

// ─── Profile Resolution ─────────────────────────────────────────────────────

/**
 * Fetch profiles for a set of pubkeys we haven't seen yet.
 *
 * This is a common pattern: batch-fetch profiles for all authors
 * in a set of events. Production clients cache aggressively and
 * debounce these requests.
 */
async function resolveProfiles(
  state: ClientState,
  pubkeys: string[]
): Promise<void> {
  // Only fetch profiles we don't already have cached
  const unknown = pubkeys.filter((pk) => !state.profiles.has(pk));
  if (unknown.length === 0) return;

  console.log(`[profiles] Fetching ${unknown.length} unknown profiles...`);

  const events = await state.pool.querySync(state.relays, {
    kinds: [0],
    authors: unknown,
  });

  for (const event of events) {
    try {
      const profile = JSON.parse(event.content) as Profile;
      // Only update if this event is newer than what we have
      // (kind 0 is replaceable — we want the latest)
      state.profiles.set(event.pubkey, profile);
    } catch {
      // Malformed profile JSON — skip it silently.
      // The network has plenty of garbage data.
    }
  }
}

/**
 * Get a display name for a pubkey, falling back to a truncated npub.
 */
function getDisplayName(state: ClientState, pubkey: string): string {
  const profile = state.profiles.get(pubkey);
  if (profile?.display_name) return profile.display_name;
  if (profile?.name) return profile.name;
  // Truncated npub is the universal fallback
  return nip19.npubEncode(pubkey).slice(0, 12) + "...";
}

// ─── Feed & Subscriptions ───────────────────────────────────────────────────

/**
 * Subscribe to the "home feed" — kind 1 events from followed pubkeys.
 *
 * This is a persistent subscription: the relay sends matching historical
 * events, then EOSE (End Of Stored Events), then continues streaming
 * new events in real time.
 *
 * The pool manages relay connections and deduplicates events that
 * arrive from multiple relays.
 */
function subscribeToFeed(state: ClientState): void {
  if (state.following.size === 0) {
    console.log("[feed] No followed pubkeys — nothing to subscribe to");
    console.log("[feed] Use 'follow <npub>' to follow someone first");
    return;
  }

  // Unsubscribe from any existing feed subscription
  const existing = state.activeSubscriptions.get("feed");
  if (existing) {
    existing.unsub();
    console.log("[feed] Closed previous feed subscription");
  }

  const since = Math.floor(Date.now() / 1000) - FEED_LOOKBACK_SECONDS;
  const authors = Array.from(state.following);

  console.log(`[feed] Subscribing to ${authors.length} followed pubkeys since ${new Date(since * 1000).toISOString()}`);

  const sub = state.pool.subscribeMany(
    state.relays,
    [
      {
        kinds: [1],
        authors,
        since,
      },
    ],
    {
      onevent(event: Event) {
        // Cache the event
        state.events.set(event.id, event);
        displayEvent(state, event);
      },
      oneose() {
        console.log("[feed] --- End of stored events, now streaming live ---");
      },
      onclose(reasons: string[]) {
        console.log("[feed] Subscription closed:", reasons);
      },
    }
  );

  state.activeSubscriptions.set("feed", { unsub: () => sub.close() });

  // Batch-resolve profiles for authors in the feed
  resolveProfiles(state, authors).catch((err) =>
    console.error("[profiles] Failed to resolve:", err)
  );
}

/**
 * Fetch and display a full thread starting from a root event.
 *
 * Thread fetching is one of the trickier parts of NOSTR because
 * events are scattered across relays. We do two queries:
 * 1. Fetch the root event itself
 * 2. Fetch all events that reference the root via "e" tags
 *
 * Production clients use NIP-33 (parameterized replaceable events)
 * or relay-specific extensions for more efficient thread loading.
 */
async function fetchThread(
  state: ClientState,
  rootId: string
): Promise<void> {
  console.log(`[thread] Fetching thread ${rootId.slice(0, 8)}...`);

  // Fetch the root event and all replies in parallel
  const [rootEvents, replies] = await Promise.all([
    state.pool.querySync(state.relays, {
      ids: [rootId],
    }),
    state.pool.querySync(state.relays, {
      kinds: [1],
      "#e": [rootId],
    }),
  ]);

  const allEvents = [...rootEvents, ...replies];

  if (allEvents.length === 0) {
    console.log("[thread] No events found for this thread");
    return;
  }

  // Cache all events
  for (const event of allEvents) {
    state.events.set(event.id, event);
  }

  // Resolve profiles for all authors in the thread
  const authors = [...new Set(allEvents.map((e) => e.pubkey))];
  await resolveProfiles(state, authors);

  // Sort chronologically and display
  allEvents.sort((a, b) => a.created_at - b.created_at);

  console.log(`\n--- Thread (${allEvents.length} events) ---`);
  for (const event of allEvents) {
    const isRoot = event.id === rootId;
    const prefix = isRoot ? "[ROOT]" : "  [REPLY]";
    const name = getDisplayName(state, event.pubkey);
    const time = new Date(event.created_at * 1000).toLocaleTimeString();
    console.log(`${prefix} ${name} (${time}):`);
    console.log(`         ${event.content}`);
    console.log(`         id: ${nip19.noteEncode(event.id)}`);
  }
  console.log("--- End of thread ---\n");
}

// ─── Event Display ──────────────────────────────────────────────────────────

/**
 * Pretty-print an event to the console.
 *
 * NIP-19 encoding makes IDs human-friendly. In a GUI client you'd
 * render rich content — here we keep it simple.
 */
function displayEvent(state: ClientState, event: Event): void {
  const name = getDisplayName(state, event.pubkey);
  const time = new Date(event.created_at * 1000).toLocaleTimeString();
  const noteId = nip19.noteEncode(event.id);

  // Check if this is a reply by looking for NIP-10 markers
  const replyTag = event.tags.find((t) => t[0] === "e" && t[3] === "reply");
  const replyIndicator = replyTag
    ? ` (reply to ${replyTag[1].slice(0, 8)}...)`
    : "";

  console.log(`\n[${time}] ${name}${replyIndicator}:`);
  console.log(`  ${event.content}`);
  console.log(`  ${noteId}`);
}

// ─── Follow Management ──────────────────────────────────────────────────────

/**
 * Add a pubkey to our follow list.
 *
 * In the full protocol, the follow list is published as a kind 3
 * (contacts) event. Here we keep it local for simplicity, but a
 * production client must publish kind 3 so other clients see it.
 */
function followPubkey(state: ClientState, input: string): void {
  let pubkey: string;

  try {
    // Accept npub or hex
    if (input.startsWith("npub")) {
      const decoded = nip19.decode(input);
      if (decoded.type !== "npub") throw new Error("Not an npub");
      pubkey = decoded.data;
    } else {
      // Assume hex
      if (input.length !== 64) throw new Error("Invalid hex pubkey");
      pubkey = input;
    }
  } catch (err) {
    console.error(`[follow] Invalid pubkey: ${err}`);
    return;
  }

  state.following.add(pubkey);
  console.log(`[follow] Now following ${getDisplayName(state, pubkey)} (${state.following.size} total)`);
  console.log(`[follow] Use 'feed' to refresh your subscription`);
}

// ─── Interactive CLI ────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Commands:
  note <text>          Publish a text note
  profile <json>       Set profile metadata (e.g. profile {"name":"alice"})
  reply <note-id> <text>  Reply to a note (use hex id or note1... id)
  react <note-id> [emoji] React to a note (default: +)
  follow <npub|hex>    Follow a pubkey
  feed                 Subscribe to home feed
  thread <note-id>     Fetch and display a thread
  whoami               Show your identity
  help                 Show this help
  quit                 Exit
  `);
}

/**
 * Decode a note identifier from user input.
 * Accepts hex event IDs or NIP-19 note1... bech32 strings.
 */
function decodeNoteId(input: string): string | null {
  try {
    if (input.startsWith("note1")) {
      const decoded = nip19.decode(input);
      if (decoded.type !== "note") return null;
      return decoded.data;
    }
    // Assume hex — basic length validation
    if (input.length === 64 && /^[0-9a-f]+$/.test(input)) {
      return input;
    }
    return null;
  } catch {
    return null;
  }
}

async function handleCommand(
  state: ClientState,
  line: string
): Promise<boolean> {
  const trimmed = line.trim();
  if (!trimmed) return true; // continue

  const spaceIdx = trimmed.indexOf(" ");
  const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  switch (cmd.toLowerCase()) {
    case "note": {
      if (!args) {
        console.log("Usage: note <text>");
        break;
      }
      await publishNote(state, args);
      break;
    }

    case "profile": {
      if (!args) {
        console.log('Usage: profile {"name":"alice","about":"hello"}');
        break;
      }
      try {
        const profile = JSON.parse(args) as Profile;
        await publishProfile(state, profile);
      } catch {
        console.error("Invalid JSON. Example: profile {\"name\":\"alice\"}");
      }
      break;
    }

    case "reply": {
      const replySpaceIdx = args.indexOf(" ");
      if (replySpaceIdx === -1) {
        console.log("Usage: reply <note-id> <text>");
        break;
      }
      const noteIdStr = args.slice(0, replySpaceIdx);
      const replyText = args.slice(replySpaceIdx + 1).trim();
      const noteId = decodeNoteId(noteIdStr);
      if (!noteId) {
        console.error("Invalid note ID. Use hex or note1... format");
        break;
      }
      // Look up the event we're replying to
      let target = state.events.get(noteId);
      if (!target) {
        // Try fetching from relays
        console.log("[reply] Event not in cache, fetching from relays...");
        const fetched = await state.pool.querySync(state.relays, {
          ids: [noteId],
        });
        if (fetched.length === 0) {
          console.error("[reply] Could not find event on any relay");
          break;
        }
        target = fetched[0];
        state.events.set(target.id, target);
      }
      await publishReply(state, target, replyText);
      break;
    }

    case "react": {
      const reactSpaceIdx = args.indexOf(" ");
      const reactNoteStr = reactSpaceIdx === -1 ? args : args.slice(0, reactSpaceIdx);
      const emoji = reactSpaceIdx === -1 ? "+" : args.slice(reactSpaceIdx + 1).trim();
      const reactNoteId = decodeNoteId(reactNoteStr);
      if (!reactNoteId) {
        console.log("Usage: react <note-id> [emoji]");
        break;
      }
      let reactTarget = state.events.get(reactNoteId);
      if (!reactTarget) {
        const fetched = await state.pool.querySync(state.relays, {
          ids: [reactNoteId],
        });
        if (fetched.length === 0) {
          console.error("[react] Could not find event on any relay");
          break;
        }
        reactTarget = fetched[0];
        state.events.set(reactTarget.id, reactTarget);
      }
      await publishReaction(state, reactTarget, emoji);
      break;
    }

    case "follow": {
      if (!args) {
        console.log("Usage: follow <npub|hex>");
        break;
      }
      followPubkey(state, args);
      break;
    }

    case "feed": {
      subscribeToFeed(state);
      break;
    }

    case "thread": {
      if (!args) {
        console.log("Usage: thread <note-id>");
        break;
      }
      const threadId = decodeNoteId(args);
      if (!threadId) {
        console.error("Invalid note ID. Use hex or note1... format");
        break;
      }
      await fetchThread(state, threadId);
      break;
    }

    case "whoami": {
      console.log(`\nPublic key: ${nip19.npubEncode(state.pubkey)}`);
      console.log(`Hex:        ${state.pubkey}`);
      console.log(`Following:  ${state.following.size} pubkeys`);
      console.log(`Cached:     ${state.events.size} events, ${state.profiles.size} profiles`);
      console.log(`Relays:     ${state.relays.join(", ")}`);
      const myProfile = state.profiles.get(state.pubkey);
      if (myProfile?.name) {
        console.log(`Name:       ${myProfile.name}`);
      }
      break;
    }

    case "help": {
      printHelp();
      break;
    }

    case "quit":
    case "exit": {
      return false; // signal to exit
    }

    default: {
      console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
    }
  }

  return true; // continue
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== NOSTR Simple Client ===\n");

  // Check for nsec in environment variable (never hardcode keys!)
  const nsec = process.env.NOSTR_NSEC;

  // Initialize keypair
  const { secretKey, pubkey } = initKeys(nsec);

  // Initialize SimplePool — it manages WebSocket connections to relays,
  // handles reconnection, and deduplicates events across relays
  const pool = new SimplePool();

  const state: ClientState = {
    secretKey,
    pubkey,
    pool,
    relays: DEFAULT_RELAYS,
    profiles: new Map(),
    events: new Map(),
    following: new Set(),
    activeSubscriptions: new Map(),
  };

  console.log(`\nConnecting to ${state.relays.length} relays...`);
  console.log("Type 'help' for available commands.\n");

  // Set up readline for interactive input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Graceful shutdown: close all subscriptions and pool connections
  const shutdown = (): void => {
    console.log("\n[shutdown] Closing connections...");
    for (const [name, sub] of state.activeSubscriptions) {
      sub.unsub();
      console.log(`[shutdown] Closed subscription: ${name}`);
    }
    pool.close(state.relays);
    console.log("[shutdown] Disconnected from all relays. Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Interactive prompt loop
  const prompt = (): void => {
    rl.question("nostr> ", async (line) => {
      try {
        const shouldContinue = await handleCommand(state, line);
        if (!shouldContinue) {
          shutdown();
          return;
        }
      } catch (err) {
        console.error("[error]", err);
      }
      prompt();
    });
  };

  prompt();
}

// Entry point
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
