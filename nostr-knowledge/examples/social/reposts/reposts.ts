/**
 * Reposts (Kind 6 and Kind 16) — NIP-18
 *
 * Demonstrates how to:
 *   1. Repost a text note (kind 6 — specific to kind 1 notes)
 *   2. Generic repost (kind 16 — repost any event kind)
 *   3. Quote repost using a "q" tag (NIP-18)
 *   4. Fetch reposts of an event
 *
 * Kind 6 is a "repost" of a kind 1 note. The content field contains the
 * JSON-stringified original event. Tags include "e" (event id) and "p"
 * (original author pubkey).
 *
 * Run:
 *   npx ts-node reposts.ts
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type Event,
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
// Helper: publish a kind 1 note for demonstration
// ---------------------------------------------------------------------------

function createTestNote(sk: Uint8Array): Event {
  return finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", "nostr"]],
      content:
        "Decentralized social media is the future. Build on NOSTR! #nostr",
    },
    sk
  );
}

// ---------------------------------------------------------------------------
// 1. Repost a kind 1 text note (kind 6)
// ---------------------------------------------------------------------------

async function repostNote(
  repostSk: Uint8Array,
  pool: SimplePool,
  originalEvent: Event
): Promise<void> {
  console.log("=== Repost a Text Note (Kind 6) ===");
  console.log("Original note ID:", originalEvent.id);
  console.log(
    "Original content:",
    originalEvent.content.slice(0, 60) + "...\n"
  );

  // Kind 6 repost:
  //   - kind: 6
  //   - content: JSON.stringify(originalEvent) — the full original event
  //   - tags:
  //       ["e", <original-event-id>, <relay-url>]  — reference to original
  //       ["p", <original-author-pubkey>]           — reference to author
  const repost = finalizeEvent(
    {
      kind: 6,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", originalEvent.id, RELAYS[0]],    // event reference with relay hint
        ["p", originalEvent.pubkey],            // author reference
      ],
      content: JSON.stringify(originalEvent),   // embed the full original event
    },
    repostSk
  );

  const results = await Promise.allSettled(pool.publish(RELAYS, repost));
  for (let i = 0; i < RELAYS.length; i++) {
    const r = results[i];
    console.log(
      r.status === "fulfilled"
        ? `[OK]   ${RELAYS[i]}`
        : `[FAIL] ${RELAYS[i]}: ${(r as PromiseRejectedResult).reason}`
    );
  }

  console.log("Repost event ID:", repost.id);
  console.log("Reposted by:", repost.pubkey.slice(0, 16) + "...\n");
}

// ---------------------------------------------------------------------------
// 2. Generic repost (kind 16) — repost any event kind
// ---------------------------------------------------------------------------

async function genericRepost(
  repostSk: Uint8Array,
  pool: SimplePool,
  originalEvent: Event
): Promise<void> {
  console.log("=== Generic Repost (Kind 16) ===");
  console.log("Original event kind:", originalEvent.kind);
  console.log("Original event ID:", originalEvent.id, "\n");

  // Kind 16 is for reposting events of any kind (not just kind 1).
  // The "k" tag indicates the kind of the original event.
  const repost = finalizeEvent(
    {
      kind: 16,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", originalEvent.id, RELAYS[0]],
        ["p", originalEvent.pubkey],
        ["k", String(originalEvent.kind)],       // kind tag (NIP-18)
      ],
      content: JSON.stringify(originalEvent),
    },
    repostSk
  );

  const results = await Promise.allSettled(pool.publish(RELAYS, repost));
  for (let i = 0; i < RELAYS.length; i++) {
    const r = results[i];
    console.log(
      r.status === "fulfilled"
        ? `[OK]   ${RELAYS[i]}`
        : `[FAIL] ${RELAYS[i]}: ${(r as PromiseRejectedResult).reason}`
    );
  }

  console.log("Generic repost event ID:", repost.id, "\n");
}

// ---------------------------------------------------------------------------
// 3. Quote repost with "q" tag
// ---------------------------------------------------------------------------

async function quoteRepost(
  quoteSk: Uint8Array,
  pool: SimplePool,
  originalEvent: Event
): Promise<void> {
  console.log("=== Quote Repost (q tag) ===");
  console.log("Quoting event:", originalEvent.id, "\n");

  // A "quote repost" is a kind 1 note that references another note using
  // a "q" tag. The content includes the author's commentary.
  // The "q" tag format: ["q", <event-id>, <relay-url>, <pubkey>]
  const quoteNote = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["q", originalEvent.id, RELAYS[0], originalEvent.pubkey],
        // Also include standard e and p tags for compatibility
        ["e", originalEvent.id, RELAYS[0], "mention"],
        ["p", originalEvent.pubkey],
      ],
      content: `Exactly this! The open protocol wins every time.\n\nnostr:${originalEvent.id}`,
    },
    quoteSk
  );

  const results = await Promise.allSettled(pool.publish(RELAYS, quoteNote));
  for (let i = 0; i < RELAYS.length; i++) {
    const r = results[i];
    console.log(
      r.status === "fulfilled"
        ? `[OK]   ${RELAYS[i]}`
        : `[FAIL] ${RELAYS[i]}: ${(r as PromiseRejectedResult).reason}`
    );
  }

  console.log("Quote repost event ID:", quoteNote.id);
  console.log("Content:", quoteNote.content, "\n");
}

// ---------------------------------------------------------------------------
// 4. Fetch reposts of an event
// ---------------------------------------------------------------------------

async function fetchReposts(targetEventId: string): Promise<void> {
  console.log("=== Fetch Reposts ===");
  console.log("Target event:", targetEventId, "\n");

  const pool = new SimplePool();

  try {
    // Fetch both kind 6 (note reposts) and kind 16 (generic reposts)
    const reposts = await pool.querySync(RELAYS, {
      kinds: [6, 16],
      "#e": [targetEventId],
    });

    console.log(`Found ${reposts.length} repost(s)\n`);

    for (const r of reposts.slice(0, 10)) {
      const time = new Date(r.created_at * 1000).toISOString();
      console.log(`  Kind ${r.kind} by ${r.pubkey.slice(0, 16)}... at ${time}`);

      // Optionally parse the embedded event from content
      if (r.content) {
        try {
          const embedded = JSON.parse(r.content);
          console.log(
            `    Original content: ${embedded.content?.slice(0, 50)}...`
          );
        } catch {
          // Content might not be valid JSON
        }
      }
    }

    // Also check for quote reposts (kind 1 notes with "q" tag)
    const quoteReposts = await pool.querySync(RELAYS, {
      kinds: [1],
      "#q": [targetEventId],
    });

    if (quoteReposts.length > 0) {
      console.log(`\nFound ${quoteReposts.length} quote repost(s)`);
      for (const qr of quoteReposts.slice(0, 5)) {
        console.log(
          `  By ${qr.pubkey.slice(0, 16)}...: ${qr.content.slice(0, 60)}...`
        );
      }
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Bonus: fetch reposts from the network
// ---------------------------------------------------------------------------

async function fetchRepostsFromNetwork(): Promise<void> {
  console.log("=== Fetch Reposts from Network ===\n");

  const pool = new SimplePool();

  try {
    // Find some recent reposts
    const reposts = await pool.querySync(RELAYS, {
      kinds: [6],
      limit: 5,
    });

    console.log(`Found ${reposts.length} recent repost(s) on network\n`);

    for (const r of reposts) {
      const time = new Date(r.created_at * 1000).toISOString();
      const eTags = r.tags.filter((t) => t[0] === "e");
      console.log(`Repost by ${r.pubkey.slice(0, 16)}... at ${time}`);
      if (eTags.length > 0) {
        console.log(`  Reposted event: ${eTags[0][1].slice(0, 16)}...`);
      }

      if (r.content) {
        try {
          const embedded = JSON.parse(r.content);
          console.log(
            `  Original: ${(embedded.content || "").slice(0, 60)}...`
          );
        } catch {
          // Not valid JSON
        }
      }
      console.log();
    }
  } finally {
    pool.close(RELAYS);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("NOSTR Reposts (Kind 6 / Kind 16) Example\n");
  console.log("=========================================\n");

  // Create keypairs
  const authorSk = generateSecretKey();
  const reposterSk = generateSecretKey();
  const quoterSk = generateSecretKey();

  const pool = new SimplePool();

  try {
    // Publish a test note
    const originalNote = createTestNote(authorSk);
    await Promise.allSettled(pool.publish(RELAYS, originalNote));
    console.log("Published original note:", originalNote.id);
    console.log("Content:", originalNote.content, "\n");

    // Repost it (kind 6)
    await repostNote(reposterSk, pool, originalNote);

    // Generic repost (kind 16)
    await genericRepost(reposterSk, pool, originalNote);

    // Quote repost
    await quoteRepost(quoterSk, pool, originalNote);
  } finally {
    pool.close(RELAYS);
  }

  // Fetch reposts from the live network
  await fetchRepostsFromNetwork();

  console.log("Done.");
}

main().catch(console.error);
