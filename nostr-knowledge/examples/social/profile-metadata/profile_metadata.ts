/**
 * Profile Metadata (Kind 0) — NIP-01, NIP-24
 *
 * Demonstrates how to:
 *   1. Build and publish a kind 0 (set_metadata) event
 *   2. Fetch another user's profile metadata from relays
 *
 * Kind 0 is a "replaceable event" — only the latest version is kept by relays.
 * The content field is a JSON string containing profile fields.
 *
 * Run:
 *   npx ts-node profile_metadata.ts
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { bytesToHex } from "@noble/hashes/utils";
import "websocket-polyfill";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// A well-known public key to fetch (fiatjaf — Nostr creator)
const FIATJAF_PUBKEY =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

// ---------------------------------------------------------------------------
// 1. Publish your own profile metadata (kind 0)
// ---------------------------------------------------------------------------

async function publishProfile(): Promise<void> {
  // Generate a fresh keypair (in production you would load an existing key)
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  console.log("=== Publish Profile Metadata ===");
  console.log("Public key (hex):", pk);
  console.log("Public key (npub): use nip19.npubEncode(pk) to convert\n");

  // Profile metadata is a JSON object serialized as a string.
  // Standard fields (NIP-01 + NIP-24):
  //   name        — display name
  //   about       — short bio
  //   picture     — avatar URL
  //   banner      — banner image URL
  //   nip05       — NIP-05 identifier (user@domain.com)
  //   lud16       — Lightning address for receiving zaps
  //   display_name — longer display name (NIP-24)
  //   website     — URL
  const metadata = {
    name: "nostr_explorer",
    display_name: "Nostr Explorer",
    about: "Building on the open social protocol. Learning NOSTR one event at a time.",
    picture: "https://robohash.org/nostr_explorer.png?set=set4",
    banner: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1200",
    nip05: "explorer@nostr-example.com",
    lud16: "explorer@getalby.com",
    website: "https://nostr-example.com",
  };

  // Create the kind 0 event
  const eventTemplate = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(metadata),
  };

  // Sign the event (finalizeEvent computes id, pubkey, sig)
  const signedEvent = finalizeEvent(eventTemplate, sk);

  // Verify locally before publishing
  const isValid = verifyEvent(signedEvent);
  console.log("Event valid:", isValid);
  console.log("Event ID:", signedEvent.id);
  console.log("Content preview:", signedEvent.content.slice(0, 80) + "...\n");

  // Publish to relays
  const pool = new SimplePool();

  try {
    const results = await Promise.allSettled(
      pool.publish(RELAYS, signedEvent)
    );

    for (let i = 0; i < RELAYS.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        console.log(`[OK]   Published to ${RELAYS[i]}`);
      } else {
        console.log(`[FAIL] ${RELAYS[i]}: ${r.reason}`);
      }
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
  return;
}

// ---------------------------------------------------------------------------
// 2. Fetch another user's profile metadata
// ---------------------------------------------------------------------------

async function fetchProfile(pubkey: string): Promise<void> {
  console.log("=== Fetch Profile Metadata ===");
  console.log("Looking up pubkey:", pubkey, "\n");

  const pool = new SimplePool();

  try {
    // For kind 0 (replaceable), we only need the most recent event.
    // querySync returns a list; for kind 0, relays should return at most one.
    const events = await pool.querySync(RELAYS, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    if (events.length === 0) {
      console.log("No profile found for this pubkey.");
      return;
    }

    // Take the most recent event (highest created_at)
    const latest = events.reduce((a, b) =>
      a.created_at > b.created_at ? a : b
    );

    console.log("Event ID:", latest.id);
    console.log("Created at:", new Date(latest.created_at * 1000).toISOString());
    console.log();

    // Parse the profile JSON
    const profile = JSON.parse(latest.content);

    console.log("--- Profile Fields ---");
    const fields = [
      "name",
      "display_name",
      "about",
      "picture",
      "banner",
      "nip05",
      "lud16",
      "website",
    ];

    for (const field of fields) {
      if (profile[field]) {
        const value =
          profile[field].length > 80
            ? profile[field].slice(0, 80) + "..."
            : profile[field];
        console.log(`  ${field}: ${value}`);
      }
    }

    // Show any extra fields not in our standard list
    const extraFields = Object.keys(profile).filter(
      (k) => !fields.includes(k)
    );
    if (extraFields.length > 0) {
      console.log("\n--- Additional Fields ---");
      for (const field of extraFields) {
        const val = String(profile[field]);
        console.log(
          `  ${field}: ${val.length > 80 ? val.slice(0, 80) + "..." : val}`
        );
      }
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
  console.log("NOSTR Profile Metadata (Kind 0) Example\n");
  console.log("========================================\n");

  // Publish a new profile
  await publishProfile();

  // Fetch a well-known profile
  await fetchProfile(FIATJAF_PUBKEY);

  console.log("Done.");
}

main().catch(console.error);
