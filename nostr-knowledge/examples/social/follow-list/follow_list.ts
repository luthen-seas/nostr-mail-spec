/**
 * Follow List / Contact List (Kind 3) — NIP-02
 *
 * Demonstrates how to:
 *   1. Publish a follow list (kind 3) with p-tags
 *   2. Fetch someone's follow list from relays
 *   3. Find mutual follows between two users
 *
 * Kind 3 is a replaceable event. Each p-tag represents a followed pubkey
 * and can optionally include a relay hint and a petname.
 *
 * Run:
 *   npx ts-node follow_list.ts
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

// Well-known pubkeys for demonstration
const KNOWN_PUBKEYS = {
  fiatjaf: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
  jb55: "32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245",
  odell: "04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9",
};

// ---------------------------------------------------------------------------
// 1. Publish a follow list (kind 3)
// ---------------------------------------------------------------------------

async function publishFollowList(): Promise<{
  sk: Uint8Array;
  pk: string;
}> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  console.log("=== Publish Follow List ===");
  console.log("Our pubkey:", pk, "\n");

  // Each p-tag has the format: ["p", <pubkey-hex>, <relay-url>, <petname>]
  // The relay hint tells other clients where to find that user's events.
  // The petname is a local nickname (rarely used in practice but defined in NIP-02).
  const followTags: string[][] = [
    ["p", KNOWN_PUBKEYS.fiatjaf, "wss://relay.damus.io", "fiatjaf"],
    ["p", KNOWN_PUBKEYS.jb55, "wss://relay.damus.io", "jb55"],
    ["p", KNOWN_PUBKEYS.odell, "wss://nos.lol", "odell"],
  ];

  // The content field of kind 3 can optionally hold a JSON object mapping
  // relay URLs to read/write policies. Many clients use this to store the
  // user's relay list (though NIP-65 kind 10002 is now preferred for that).
  const relayListContent = JSON.stringify({
    "wss://relay.damus.io": { read: true, write: true },
    "wss://nos.lol": { read: true, write: true },
    "wss://relay.nostr.band": { read: true, write: false },
  });

  const eventTemplate = {
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags: followTags,
    content: relayListContent,
  };

  const signedEvent = finalizeEvent(eventTemplate, sk);

  console.log("Event ID:", signedEvent.id);
  console.log("Following", signedEvent.tags.length, "accounts:");
  for (const tag of signedEvent.tags) {
    const petname = tag[3] || "(no petname)";
    const relay = tag[2] || "(no relay hint)";
    console.log(`  ${petname} — ${tag[1].slice(0, 16)}... via ${relay}`);
  }
  console.log();

  // Publish
  const pool = new SimplePool();
  try {
    const results = await Promise.allSettled(pool.publish(RELAYS, signedEvent));
    for (let i = 0; i < RELAYS.length; i++) {
      const r = results[i];
      console.log(
        r.status === "fulfilled"
          ? `[OK]   ${RELAYS[i]}`
          : `[FAIL] ${RELAYS[i]}: ${(r as PromiseRejectedResult).reason}`
      );
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
  return { sk, pk };
}

// ---------------------------------------------------------------------------
// 2. Fetch a user's follow list
// ---------------------------------------------------------------------------

async function fetchFollowList(pubkey: string): Promise<string[]> {
  console.log("=== Fetch Follow List ===");
  console.log("Pubkey:", pubkey.slice(0, 16) + "...\n");

  const pool = new SimplePool();
  let follows: string[] = [];

  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [3],
      authors: [pubkey],
      limit: 1,
    });

    if (events.length === 0) {
      console.log("No follow list found.");
      return [];
    }

    // Take the most recent kind 3 event
    const latest = events.reduce((a, b) =>
      a.created_at > b.created_at ? a : b
    );

    console.log("Event ID:", latest.id);
    console.log(
      "Updated:",
      new Date(latest.created_at * 1000).toISOString()
    );

    // Extract followed pubkeys from p-tags
    follows = latest.tags
      .filter((t) => t[0] === "p" && t[1])
      .map((t) => t[1]);

    console.log(`Following ${follows.length} accounts`);

    // Show first 10
    const preview = follows.slice(0, 10);
    for (const f of preview) {
      console.log(`  ${f.slice(0, 16)}...`);
    }
    if (follows.length > 10) {
      console.log(`  ... and ${follows.length - 10} more`);
    }

    // Parse relay list from content (if present)
    if (latest.content) {
      try {
        const relayMap = JSON.parse(latest.content);
        const relayUrls = Object.keys(relayMap);
        if (relayUrls.length > 0) {
          console.log(`\nRelay preferences (${relayUrls.length} relays):`);
          for (const url of relayUrls.slice(0, 5)) {
            const policy = relayMap[url];
            const flags = [];
            if (policy.read) flags.push("read");
            if (policy.write) flags.push("write");
            console.log(`  ${url} [${flags.join(", ")}]`);
          }
        }
      } catch {
        // Content might be empty or not valid JSON — that is fine
      }
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
  return follows;
}

// ---------------------------------------------------------------------------
// 3. Find mutual follows between two users
// ---------------------------------------------------------------------------

async function findMutualFollows(
  pubkeyA: string,
  pubkeyB: string
): Promise<void> {
  console.log("=== Find Mutual Follows ===");
  console.log("User A:", pubkeyA.slice(0, 16) + "...");
  console.log("User B:", pubkeyB.slice(0, 16) + "...\n");

  const pool = new SimplePool();

  try {
    // Fetch both follow lists in parallel
    const [eventsA, eventsB] = await Promise.all([
      pool.querySync(RELAYS, { kinds: [3], authors: [pubkeyA], limit: 1 }),
      pool.querySync(RELAYS, { kinds: [3], authors: [pubkeyB], limit: 1 }),
    ]);

    const extractFollows = (events: typeof eventsA): Set<string> => {
      if (events.length === 0) return new Set();
      const latest = events.reduce((a, b) =>
        a.created_at > b.created_at ? a : b
      );
      return new Set(
        latest.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1])
      );
    };

    const followsA = extractFollows(eventsA);
    const followsB = extractFollows(eventsB);

    console.log(`User A follows: ${followsA.size}`);
    console.log(`User B follows: ${followsB.size}`);

    // Intersection
    const mutual = [...followsA].filter((pk) => followsB.has(pk));

    console.log(`Mutual follows: ${mutual.length}\n`);

    // Show first 10 mutual follows
    for (const pk of mutual.slice(0, 10)) {
      console.log(`  ${pk.slice(0, 16)}...`);
    }
    if (mutual.length > 10) {
      console.log(`  ... and ${mutual.length - 10} more`);
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
  console.log("NOSTR Follow List (Kind 3) Example\n");
  console.log("===================================\n");

  // Publish our own follow list
  await publishFollowList();

  // Fetch fiatjaf's follow list
  const follows = await fetchFollowList(KNOWN_PUBKEYS.fiatjaf);

  // Find mutual follows between fiatjaf and jb55
  await findMutualFollows(KNOWN_PUBKEYS.fiatjaf, KNOWN_PUBKEYS.jb55);

  console.log("Done.");
}

main().catch(console.error);
