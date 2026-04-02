/**
 * bot.ts — A NOSTR bot that monitors mentions, auto-replies, posts periodic
 * updates, and reacts to events matching keywords.
 *
 * Features:
 *   1. Generate or load bot keypair (from hex secret key in env).
 *   2. Connect to multiple relays via a pool.
 *   3. Subscribe to mentions (filter by p-tag matching bot pubkey).
 *   4. Auto-reply to mentions with a configurable message.
 *   5. Post periodic status updates on a timer.
 *   6. React (kind 7) to events containing specific keywords.
 *
 * Dependencies:
 *   npm install nostr-tools ws
 *   npm install -D typescript ts-node @types/node @types/ws
 *
 * Run:
 *   BOT_SECRET_KEY=<64-char-hex> npx ts-node bot.ts
 *
 * If BOT_SECRET_KEY is not set, a fresh keypair is generated each run.
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate,
  type Event as NostrEvent,
  type Filter,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { Relay } from "nostr-tools/relay";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Relays the bot connects to. */
const RELAY_URLS: string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

/** Keywords that trigger a reaction (kind 7). Case-insensitive. */
const REACTION_KEYWORDS: string[] = ["nostr", "bitcoin", "zap"];

/** How often to post a periodic update (milliseconds). */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Minimum seconds between replies to the same pubkey (simple rate limit). */
const REPLY_COOLDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

/**
 * Load the secret key from the environment, or generate a fresh one.
 * The secret key is 32 bytes, typically represented as 64 hex characters.
 */
function loadOrGenerateKeys(): { secretKey: Uint8Array; pubkey: string } {
  const envKey = process.env.BOT_SECRET_KEY;

  if (envKey) {
    console.log("[bot] Loading secret key from BOT_SECRET_KEY env var");
    const secretKey = hexToBytes(envKey);
    const pubkey = getPublicKey(secretKey);
    return { secretKey, pubkey };
  }

  console.log("[bot] No BOT_SECRET_KEY set — generating a fresh keypair");
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  console.log(`[bot] Public key: ${pubkey}`);
  console.log(
    `[bot] Secret key: ${bytesToHex(secretKey)} (save this to reuse the identity)`
  );
  return { secretKey, pubkey };
}

const { secretKey, pubkey } = loadOrGenerateKeys();

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Track the last reply time per pubkey to avoid spamming. */
const lastReplyTime: Map<string, number> = new Map();

function isRateLimited(authorPubkey: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const last = lastReplyTime.get(authorPubkey) || 0;
  if (now - last < REPLY_COOLDOWN_SECONDS) {
    return true;
  }
  lastReplyTime.set(authorPubkey, now);
  return false;
}

// ---------------------------------------------------------------------------
// Event creation helpers
// ---------------------------------------------------------------------------

/** Sign and finalize an event template. */
function signEvent(template: EventTemplate): NostrEvent {
  return finalizeEvent(template, secretKey);
}

/** Create a kind-1 text note. */
function createNote(content: string, tags: string[][] = []): NostrEvent {
  return signEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  });
}

/**
 * Create a reply to an event.
 * Follows NIP-10 reply conventions:
 *   - e tag with "reply" marker
 *   - p tag referencing the original author
 */
function createReply(
  replyContent: string,
  originalEvent: NostrEvent
): NostrEvent {
  // Build tags: reference the original event and author
  const tags: string[][] = [
    // Reply marker per NIP-10
    ["e", originalEvent.id, "", "reply"],
    // Mention the original author
    ["p", originalEvent.pubkey],
  ];

  return signEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: replyContent,
  });
}

/**
 * Create a kind-7 reaction to an event.
 * Per NIP-25, a reaction must include:
 *   - e tag referencing the reacted-to event
 *   - p tag referencing the reacted-to author
 *   - content is typically "+" (like), "-" (dislike), or an emoji
 */
function createReaction(
  targetEvent: NostrEvent,
  emoji: string = "+"
): NostrEvent {
  return signEvent({
    kind: 7,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", targetEvent.id],
      ["p", targetEvent.pubkey],
    ],
    content: emoji,
  });
}

// ---------------------------------------------------------------------------
// Relay connection and event publishing
// ---------------------------------------------------------------------------

/** Connected relay instances. */
const relays: Relay[] = [];

/** Connect to all configured relays. */
async function connectToRelays(): Promise<void> {
  for (const url of RELAY_URLS) {
    try {
      const relay = await Relay.connect(url);
      relays.push(relay);
      console.log(`[bot] Connected to ${url}`);
    } catch (err) {
      console.error(`[bot] Failed to connect to ${url}:`, (err as Error).message);
    }
  }

  if (relays.length === 0) {
    console.error("[bot] Could not connect to any relay. Exiting.");
    process.exit(1);
  }
}

/** Publish an event to all connected relays. */
async function publishToAll(event: NostrEvent): Promise<void> {
  for (const relay of relays) {
    try {
      await relay.publish(event);
      console.log(
        `[bot] Published event ${event.id.slice(0, 8)}... to ${relay.url}`
      );
    } catch (err) {
      console.error(
        `[bot] Failed to publish to ${relay.url}:`,
        (err as Error).message
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Subscription: mentions
// ---------------------------------------------------------------------------

/**
 * Subscribe to events that mention the bot via a p-tag.
 * This catches replies and direct mentions.
 */
function subscribeToMentions(): void {
  const filter: Filter = {
    kinds: [1], // Text notes
    "#p": [pubkey], // Events that tag the bot's pubkey
    since: Math.floor(Date.now() / 1000), // Only new events from now
  };

  for (const relay of relays) {
    const sub = relay.subscribe([filter], {
      onevent(event: NostrEvent) {
        handleMention(event);
      },
      oneose() {
        console.log(`[bot] EOSE for mentions on ${relay.url}`);
      },
    });
    console.log(`[bot] Subscribed to mentions on ${relay.url}`);
  }
}

// ---------------------------------------------------------------------------
// Subscription: keyword monitoring
// ---------------------------------------------------------------------------

/**
 * Subscribe to all kind-1 events (text notes) and react to those
 * containing keywords of interest.
 *
 * In a production bot you would use more targeted filters or NIP-50
 * search to avoid downloading the entire firehose.
 */
function subscribeToKeywords(): void {
  const filter: Filter = {
    kinds: [1],
    since: Math.floor(Date.now() / 1000),
    limit: 50, // Only get recent events per batch
  };

  for (const relay of relays) {
    const sub = relay.subscribe([filter], {
      onevent(event: NostrEvent) {
        handleKeywordEvent(event);
      },
      oneose() {
        console.log(`[bot] EOSE for keyword stream on ${relay.url}`);
      },
    });
    console.log(`[bot] Subscribed to keyword stream on ${relay.url}`);
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Set of event IDs we have already processed (deduplication). */
const processedEvents: Set<string> = new Set();

/** Handle a mention: auto-reply to the user. */
async function handleMention(event: NostrEvent): Promise<void> {
  // Deduplicate (we may receive the same event from multiple relays)
  if (processedEvents.has(event.id)) return;
  processedEvents.add(event.id);

  // Do not reply to ourselves
  if (event.pubkey === pubkey) return;

  console.log(
    `[bot] Mentioned by ${event.pubkey.slice(0, 8)}...: "${event.content.slice(0, 80)}"`
  );

  // Rate limit
  if (isRateLimited(event.pubkey)) {
    console.log(`[bot] Rate limited — skipping reply to ${event.pubkey.slice(0, 8)}...`);
    return;
  }

  // Build and publish the reply
  const replyText =
    "Thanks for the mention! I am a bot running on NOSTR. " +
    "I can see your message and will keep an eye out for interesting topics.";

  const reply = createReply(replyText, event);
  await publishToAll(reply);
}

/** Handle a keyword event: react with a zap emoji. */
async function handleKeywordEvent(event: NostrEvent): Promise<void> {
  if (processedEvents.has(event.id)) return;
  processedEvents.add(event.id);

  // Do not react to our own events
  if (event.pubkey === pubkey) return;

  // Check if the content contains any keyword (case-insensitive)
  const contentLower = event.content.toLowerCase();
  const matchedKeyword = REACTION_KEYWORDS.find((kw) =>
    contentLower.includes(kw.toLowerCase())
  );

  if (!matchedKeyword) return;

  console.log(
    `[bot] Keyword "${matchedKeyword}" found in event ${event.id.slice(0, 8)}...`
  );

  // React with a lightning bolt emoji
  const reaction = createReaction(event, "\u26A1");
  await publishToAll(reaction);
}

// ---------------------------------------------------------------------------
// Periodic updates
// ---------------------------------------------------------------------------

/** Post a status update on a timer. */
function startPeriodicUpdates(): void {
  const post = async () => {
    const now = new Date().toISOString();
    const note = createNote(
      `Bot status update: I am alive and monitoring NOSTR. Current time: ${now}`
    );
    await publishToAll(note);
    console.log("[bot] Posted periodic update");
  };

  // Post once immediately, then on the interval
  post();
  setInterval(post, UPDATE_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[bot] Bot pubkey: ${pubkey}`);
  console.log(`[bot] Connecting to ${RELAY_URLS.length} relays...`);

  await connectToRelays();

  // Start subscriptions
  subscribeToMentions();
  subscribeToKeywords();

  // Start periodic posting
  startPeriodicUpdates();

  console.log("[bot] Bot is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[bot] Shutting down...");
  for (const relay of relays) {
    relay.close();
  }
  process.exit(0);
});
