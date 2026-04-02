/**
 * Long-Form Content (Kind 30023) — NIP-23
 *
 * Demonstrates how to:
 *   1. Publish a long-form article (kind 30023) with metadata tags
 *   2. Update an existing article (same d-tag replaces it)
 *   3. Fetch articles by author
 *   4. Fetch a specific article by d-tag (naddr)
 *
 * Kind 30023 is a "parameterized replaceable event" — identified by the
 * combination of pubkey + kind + d-tag. Publishing a new event with the
 * same d-tag replaces the old one.
 *
 * Run:
 *   npx ts-node long_form.ts
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
// 1. Publish a long-form article (kind 30023)
// ---------------------------------------------------------------------------

async function publishArticle(
  sk: Uint8Array,
  pool: SimplePool
): Promise<Event> {
  console.log("=== Publish Long-Form Article ===\n");

  const pk = getPublicKey(sk);
  const now = Math.floor(Date.now() / 1000);

  // The article content is Markdown in the content field
  const articleContent = `# Understanding NOSTR Relay Architecture

NOSTR relays are the backbone of the protocol. They store and forward events
between clients. Unlike centralized servers, anyone can run a relay, and clients
can connect to multiple relays simultaneously.

## How Relays Work

A relay is a WebSocket server that:

1. **Accepts events** — Clients send signed events via \`EVENT\` messages
2. **Stores events** — Relays persist events (with their own retention policies)
3. **Serves events** — Clients request events via \`REQ\` messages with filters
4. **Streams events** — Open subscriptions receive new matching events in real-time

## Relay Discovery

Users advertise their preferred relays via NIP-65 (kind 10002) events. Clients
use the "outbox model" to discover where to find a user's events:

- **Write relays** — Where a user publishes their events
- **Read relays** — Where a user reads events from others

## Running Your Own Relay

Popular relay implementations include:

- **strfry** (C++) — High performance, LMDB-backed
- **khatru** (Go) — Framework for building custom relays
- **nostream** (TypeScript) — Feature-rich, PostgreSQL-backed

Each has different trade-offs in terms of performance, storage, and customization.

## Conclusion

The relay model gives NOSTR its censorship-resistant properties. No single relay
can prevent your content from being accessible — if one relay drops you, your
events live on dozens of others.`;

  // Tags for the article (NIP-23):
  //   d         — unique identifier (makes it addressable and replaceable)
  //   title     — article title
  //   summary   — short description for previews
  //   image     — hero/cover image URL
  //   published_at — original publication timestamp
  //   t         — hashtags / topics
  const tags: string[][] = [
    ["d", "nostr-relay-architecture"],                        // d-tag: unique slug
    ["title", "Understanding NOSTR Relay Architecture"],
    ["summary", "A deep dive into how NOSTR relays work, relay discovery, and running your own relay."],
    ["image", "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200"],
    ["published_at", String(now)],
    ["t", "nostr"],
    ["t", "relay"],
    ["t", "decentralization"],
    ["t", "protocol"],
  ];

  const event = finalizeEvent(
    {
      kind: 30023,
      created_at: now,
      tags,
      content: articleContent,
    },
    sk
  );

  console.log("Article event ID:", event.id);
  console.log("Author:", pk.slice(0, 16) + "...");
  console.log("d-tag:", "nostr-relay-architecture");
  console.log(
    "Title:",
    event.tags.find((t) => t[0] === "title")?.[1] || "(none)"
  );
  console.log("Content length:", event.content.length, "chars\n");

  const results = await Promise.allSettled(pool.publish(RELAYS, event));
  for (let i = 0; i < RELAYS.length; i++) {
    const r = results[i];
    console.log(
      r.status === "fulfilled"
        ? `[OK]   ${RELAYS[i]}`
        : `[FAIL] ${RELAYS[i]}: ${(r as PromiseRejectedResult).reason}`
    );
  }

  console.log();
  return event;
}

// ---------------------------------------------------------------------------
// 2. Update an existing article (same d-tag)
// ---------------------------------------------------------------------------

async function updateArticle(
  sk: Uint8Array,
  pool: SimplePool,
  originalEvent: Event
): Promise<void> {
  console.log("=== Update Article ===\n");

  // To update, publish a new kind 30023 with the SAME d-tag.
  // The relay will replace the old version.
  const dTag = originalEvent.tags.find((t) => t[0] === "d")?.[1] || "";
  const now = Math.floor(Date.now() / 1000);

  // Get the original published_at, keep it the same
  const originalPublishedAt =
    originalEvent.tags.find((t) => t[0] === "published_at")?.[1] ||
    String(now);

  const updatedContent =
    originalEvent.content +
    `

## Update: Paid Relays

A growing trend in the NOSTR ecosystem is paid relays. By charging a small fee
(often via Lightning), relays can:

- Reduce spam
- Fund infrastructure costs
- Provide premium storage and performance

This creates a sustainable economic model for relay operators.`;

  const event = finalizeEvent(
    {
      kind: 30023,
      created_at: now,
      tags: [
        ["d", dTag],                                         // same d-tag = replacement
        ["title", "Understanding NOSTR Relay Architecture"],
        ["summary", "A deep dive into NOSTR relays, discovery, running your own, and the paid relay trend."],
        ["image", "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200"],
        ["published_at", originalPublishedAt],               // keep original publish date
        ["t", "nostr"],
        ["t", "relay"],
        ["t", "decentralization"],
        ["t", "protocol"],
        ["t", "paid-relays"],
      ],
      content: updatedContent,
    },
    sk
  );

  console.log("Updated article event ID:", event.id);
  console.log("Same d-tag:", dTag);
  console.log("New content length:", event.content.length, "chars");
  console.log("(Relay will replace the previous version)\n");

  await Promise.allSettled(pool.publish(RELAYS, event));
  console.log("Published update.\n");
}

// ---------------------------------------------------------------------------
// 3. Fetch articles by author
// ---------------------------------------------------------------------------

async function fetchArticlesByAuthor(pubkey: string): Promise<void> {
  console.log("=== Fetch Articles by Author ===");
  console.log("Author:", pubkey.slice(0, 16) + "...\n");

  const pool = new SimplePool();

  try {
    const articles = await pool.querySync(RELAYS, {
      kinds: [30023],
      authors: [pubkey],
      limit: 10,
    });

    console.log(`Found ${articles.length} article(s)\n`);

    for (const article of articles) {
      const title =
        article.tags.find((t) => t[0] === "title")?.[1] || "(untitled)";
      const summary =
        article.tags.find((t) => t[0] === "summary")?.[1] || "(no summary)";
      const dTag = article.tags.find((t) => t[0] === "d")?.[1] || "(no d-tag)";
      const publishedAt = article.tags.find(
        (t) => t[0] === "published_at"
      )?.[1];
      const hashtags = article.tags
        .filter((t) => t[0] === "t")
        .map((t) => t[1]);

      console.log(`Title: ${title}`);
      console.log(`d-tag: ${dTag}`);
      console.log(`Summary: ${summary.slice(0, 80)}...`);
      console.log(`Content length: ${article.content.length} chars`);
      if (publishedAt) {
        console.log(
          `Published: ${new Date(parseInt(publishedAt) * 1000).toISOString()}`
        );
      }
      if (hashtags.length > 0) {
        console.log(`Tags: ${hashtags.join(", ")}`);
      }
      console.log();
    }
  } finally {
    pool.close(RELAYS);
  }
}

// ---------------------------------------------------------------------------
// 4. Fetch a specific article by d-tag (addressable query)
// ---------------------------------------------------------------------------

async function fetchArticleByDTag(
  pubkey: string,
  dTag: string
): Promise<void> {
  console.log("=== Fetch Article by d-tag ===");
  console.log("Author:", pubkey.slice(0, 16) + "...");
  console.log("d-tag:", dTag, "\n");

  const pool = new SimplePool();

  try {
    // For parameterized replaceable events, use the #d filter
    const articles = await pool.querySync(RELAYS, {
      kinds: [30023],
      authors: [pubkey],
      "#d": [dTag],
      limit: 1,
    });

    if (articles.length === 0) {
      console.log("Article not found.");
      return;
    }

    const article = articles[0];
    const title =
      article.tags.find((t) => t[0] === "title")?.[1] || "(untitled)";

    console.log("Found article!");
    console.log(`Title: ${title}`);
    console.log(`Event ID: ${article.id}`);
    console.log(`Content length: ${article.content.length} chars`);
    console.log(
      `Updated: ${new Date(article.created_at * 1000).toISOString()}`
    );
    console.log();

    // Show content preview (first 200 chars)
    console.log("Content preview:");
    console.log(article.content.slice(0, 200) + "...");
  } finally {
    pool.close(RELAYS);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Bonus: fetch long-form articles from the network
// ---------------------------------------------------------------------------

async function fetchArticlesFromNetwork(): Promise<void> {
  console.log("=== Fetch Articles from Network ===\n");

  const pool = new SimplePool();

  try {
    const articles = await pool.querySync(RELAYS, {
      kinds: [30023],
      limit: 5,
    });

    console.log(`Found ${articles.length} article(s) on the network\n`);

    for (const article of articles) {
      const title =
        article.tags.find((t) => t[0] === "title")?.[1] || "(untitled)";
      const author = article.pubkey.slice(0, 16) + "...";
      const dTag =
        article.tags.find((t) => t[0] === "d")?.[1] || "(no d-tag)";
      const wordCount = article.content.split(/\s+/).length;

      console.log(`"${title}"`);
      console.log(`  Author: ${author}`);
      console.log(`  d-tag: ${dTag}`);
      console.log(`  Words: ~${wordCount}`);
      console.log(
        `  Updated: ${new Date(article.created_at * 1000).toISOString()}`
      );
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
  console.log("NOSTR Long-Form Content (Kind 30023) Example\n");
  console.log("=============================================\n");

  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const pool = new SimplePool();

  try {
    // Publish an article
    const article = await publishArticle(sk, pool);

    // Update the article (same d-tag, new content)
    await updateArticle(sk, pool, article);

    // Fetch our articles
    await fetchArticlesByAuthor(pk);

    // Fetch a specific article by d-tag
    await fetchArticleByDTag(pk, "nostr-relay-architecture");
  } finally {
    pool.close(RELAYS);
  }

  // Fetch articles from the live network
  await fetchArticlesFromNetwork();

  console.log("Done.");
}

main().catch(console.error);
