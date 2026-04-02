/**
 * Reactions (Kind 7) — NIP-25
 *
 * Demonstrates how to:
 *   1. Send a "like" reaction (content "+")
 *   2. Send an emoji reaction (content is a Unicode emoji or custom emoji)
 *   3. Send a "dislike" reaction (content "-")
 *   4. Fetch all reactions for a given event
 *
 * Reactions reference the target event via an "e" tag and the target
 * author via a "p" tag. Optionally, a "k" tag specifies the target kind.
 *
 * Run:
 *   npx ts-node reactions.ts
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import "websocket-polyfill";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// ---------------------------------------------------------------------------
// Helper: create a kind 1 note to react to
// ---------------------------------------------------------------------------

async function publishTestNote(
  sk: Uint8Array,
  pool: SimplePool
): Promise<{ id: string; pubkey: string }> {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: "This is a test note for reaction examples. #nostr",
    },
    sk
  );

  await Promise.allSettled(pool.publish(RELAYS, event));
  console.log("Published test note:", event.id);
  console.log("Note author:", event.pubkey, "\n");
  return { id: event.id, pubkey: event.pubkey };
}

// ---------------------------------------------------------------------------
// 1. Send a "like" reaction (content: "+")
// ---------------------------------------------------------------------------

async function sendLike(
  sk: Uint8Array,
  pool: SimplePool,
  targetEventId: string,
  targetPubkey: string
): Promise<void> {
  console.log("=== Send Like ===");

  // A like reaction:
  //   - kind: 7
  //   - content: "+"
  //   - tags: ["e", <event-id>], ["p", <author-pubkey>], ["k", <target-kind>]
  const event = finalizeEvent(
    {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", targetEventId],     // reference to the target event
        ["p", targetPubkey],      // reference to the target event's author
        ["k", "1"],               // kind of the target event (NIP-25)
      ],
      content: "+",               // "+" means like / upvote
    },
    sk
  );

  await Promise.allSettled(pool.publish(RELAYS, event));
  console.log("Like sent! Event ID:", event.id, "\n");
}

// ---------------------------------------------------------------------------
// 2. Send an emoji reaction
// ---------------------------------------------------------------------------

async function sendEmojiReaction(
  sk: Uint8Array,
  pool: SimplePool,
  targetEventId: string,
  targetPubkey: string
): Promise<void> {
  console.log("=== Send Emoji Reaction ===");

  // Emoji reactions use a Unicode emoji or shortcode as the content.
  // For custom emojis (NIP-30), use an "emoji" tag and :shortcode: in content.
  const event = finalizeEvent(
    {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", targetEventId],
        ["p", targetPubkey],
        ["k", "1"],
      ],
      content: "\u{1F525}",     // Fire emoji reaction
    },
    sk
  );

  await Promise.allSettled(pool.publish(RELAYS, event));
  console.log("Emoji reaction sent! Content:", event.content);
  console.log("Event ID:", event.id, "\n");

  // Custom emoji reaction example (NIP-30)
  // Uses :shortcode: in content and an "emoji" tag with the image URL
  const customEmojiEvent = finalizeEvent(
    {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", targetEventId],
        ["p", targetPubkey],
        ["k", "1"],
        ["emoji", "ostrich", "https://nostrmedia.com/emoji/ostrich.png"],
      ],
      content: ":ostrich:",     // Custom emoji shortcode
    },
    sk
  );

  await Promise.allSettled(pool.publish(RELAYS, customEmojiEvent));
  console.log("Custom emoji reaction sent! Content:", customEmojiEvent.content);
  console.log("Event ID:", customEmojiEvent.id, "\n");
}

// ---------------------------------------------------------------------------
// 3. Send a "dislike" reaction
// ---------------------------------------------------------------------------

async function sendDislike(
  sk: Uint8Array,
  pool: SimplePool,
  targetEventId: string,
  targetPubkey: string
): Promise<void> {
  console.log("=== Send Dislike ===");

  // A dislike/downvote uses content "-"
  const event = finalizeEvent(
    {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", targetEventId],
        ["p", targetPubkey],
        ["k", "1"],
      ],
      content: "-",             // "-" means dislike / downvote
    },
    sk
  );

  await Promise.allSettled(pool.publish(RELAYS, event));
  console.log("Dislike sent! Event ID:", event.id, "\n");
}

// ---------------------------------------------------------------------------
// 4. Fetch reactions for an event
// ---------------------------------------------------------------------------

async function fetchReactions(targetEventId: string): Promise<void> {
  console.log("=== Fetch Reactions for Event ===");
  console.log("Target event:", targetEventId, "\n");

  const pool = new SimplePool();

  try {
    // Filter for kind 7 events that reference our target event via e-tag
    const reactions = await pool.querySync(RELAYS, {
      kinds: [7],
      "#e": [targetEventId],
    });

    console.log(`Found ${reactions.length} reaction(s)\n`);

    // Categorize reactions
    const likes: string[] = [];
    const dislikes: string[] = [];
    const emojis: Map<string, string[]> = new Map();

    for (const r of reactions) {
      if (r.content === "+") {
        likes.push(r.pubkey);
      } else if (r.content === "-") {
        dislikes.push(r.pubkey);
      } else {
        // Emoji or custom reaction
        const existing = emojis.get(r.content) || [];
        existing.push(r.pubkey);
        emojis.set(r.content, existing);
      }
    }

    console.log(`Likes (+): ${likes.length}`);
    console.log(`Dislikes (-): ${dislikes.length}`);

    if (emojis.size > 0) {
      console.log("Emoji reactions:");
      for (const [emoji, pubkeys] of emojis) {
        console.log(`  ${emoji}: ${pubkeys.length}`);
      }
    }

    // Show details
    if (reactions.length > 0) {
      console.log("\nDetailed reactions:");
      for (const r of reactions.slice(0, 10)) {
        const time = new Date(r.created_at * 1000).toISOString();
        console.log(
          `  [${r.content}] by ${r.pubkey.slice(0, 16)}... at ${time}`
        );
      }
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Bonus: fetch reactions on a real-world event from the network
// ---------------------------------------------------------------------------

async function fetchReactionsFromNetwork(): Promise<void> {
  console.log("=== Fetch Reactions from Network ===\n");

  const pool = new SimplePool();

  try {
    // First, find a recent popular note (kind 1)
    const notes = await pool.querySync(RELAYS, {
      kinds: [1],
      limit: 5,
    });

    if (notes.length === 0) {
      console.log("No notes found on relays.");
      return;
    }

    // Pick the first note and look for its reactions
    const note = notes[0];
    console.log("Checking reactions on note:", note.id.slice(0, 16) + "...");
    console.log(
      "Content preview:",
      note.content.slice(0, 60) + (note.content.length > 60 ? "..." : "")
    );
    console.log();

    const reactions = await pool.querySync(RELAYS, {
      kinds: [7],
      "#e": [note.id],
      limit: 50,
    });

    console.log(`Found ${reactions.length} reaction(s) on this note.`);

    // Tally
    const tally: Record<string, number> = {};
    for (const r of reactions) {
      const key = r.content || "(empty)";
      tally[key] = (tally[key] || 0) + 1;
    }

    for (const [content, count] of Object.entries(tally)) {
      console.log(`  ${content}: ${count}`);
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("NOSTR Reactions (Kind 7) Example\n");
  console.log("================================\n");

  const sk = generateSecretKey();
  const pool = new SimplePool();

  try {
    // Create a note to react to
    const { id: noteId, pubkey: notePubkey } = await publishTestNote(sk, pool);

    // React to it in different ways
    const reactorSk = generateSecretKey();
    await sendLike(reactorSk, pool, noteId, notePubkey);
    await sendEmojiReaction(reactorSk, pool, noteId, notePubkey);
    await sendDislike(generateSecretKey(), pool, noteId, notePubkey);
  } finally {
    pool.close(RELAYS);
  }

  // Fetch reactions (using a fresh pool)
  await fetchReactionsFromNetwork();

  console.log("Done.");
}

main().catch(console.error);
