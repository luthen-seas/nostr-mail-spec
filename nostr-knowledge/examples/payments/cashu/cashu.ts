/**
 * Cashu / Ecash on NOSTR (NIP-60, NIP-61, NIP-87) — TypeScript
 *
 * Demonstrates Cashu ecash integration with Nostr:
 *   1. Create a wallet event (kind 17375) — NIP-60
 *   2. Store token proofs (kind 7375) — NIP-60
 *   3. Create spending history entries (kind 7376) — NIP-60
 *   4. Create a nutzap (kind 9321) — NIP-61
 *   5. Discover mints (kind 38172) — NIP-87
 *
 * Cashu is a Chaumian ecash system. Tokens are bearer instruments backed
 * by Lightning bitcoin held at a mint. NIP-60 defines how to store your
 * Cashu wallet on Nostr relays (encrypted), and NIP-61 defines "nutzaps" —
 * sending ecash tokens as zaps via Nostr events.
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill @noble/hashes
 *
 * Run:
 *   npx ts-node cashu.ts
 *
 * References:
 *   - NIP-60: https://github.com/nostr-protocol/nips/blob/master/60.md
 *   - NIP-61: https://github.com/nostr-protocol/nips/blob/master/61.md
 *   - NIP-87: https://github.com/nostr-protocol/nips/blob/master/87.md
 *   - Cashu protocol: https://cashu.space
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent,
  type Event,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import * as nip44 from "nostr-tools/nip44";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import "websocket-polyfill";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// Example Cashu mint URL
const EXAMPLE_MINT = "https://mint.minibits.cash/Bitcoin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Cashu token proof — the fundamental unit of ecash */
interface CashuProof {
  id: string; // keyset ID from the mint
  amount: number; // denomination in satoshis
  secret: string; // the secret (blinding factor)
  C: string; // the signed point (blinded signature from the mint)
}

/** A Cashu token containing one or more proofs from a mint */
interface CashuToken {
  mint: string; // mint URL
  proofs: CashuProof[];
  memo?: string; // optional memo
}

/** Wallet metadata stored in the kind 17375 event */
interface WalletMeta {
  name: string;
  description?: string;
  mints: string[]; // mint URLs this wallet uses
  relays: string[]; // relays where wallet events are stored
  balance?: number; // cached balance in sats
}

// ---------------------------------------------------------------------------
// Encryption Helpers
// ---------------------------------------------------------------------------

/**
 * NIP-60 wallet data is encrypted to yourself using NIP-44.
 * The conversation key is derived from your own secret key and public key.
 * This means only you can decrypt your wallet data.
 */
function encryptToSelf(
  plaintext: string,
  sk: Uint8Array,
  pk: string
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(sk, pk);
  return nip44.v2.encrypt(plaintext, conversationKey);
}

function decryptFromSelf(
  ciphertext: string,
  sk: Uint8Array,
  pk: string
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(sk, pk);
  return nip44.v2.decrypt(ciphertext, conversationKey);
}

// ---------------------------------------------------------------------------
// 1. Create a Wallet Event (Kind 17375) — NIP-60
// ---------------------------------------------------------------------------

/**
 * Kind 17375 is the Cashu wallet event. It is a replaceable event (using "d" tag)
 * that stores wallet metadata. The content is NIP-44 encrypted to yourself.
 *
 * A user can have multiple wallets, each identified by a unique "d" tag.
 * One wallet can be marked as the default for receiving nutzaps.
 *
 * Tags:
 *   - ["d", "<wallet-id>"]           — unique identifier for this wallet
 *   - ["mint", "<mint-url>"]          — mint(s) this wallet uses (one per tag)
 *   - ["relay", "<relay-url>"]        — relay(s) where token events are stored
 *   - ["name", "<wallet-name>"]       — human-readable name (unencrypted)
 *   - ["unit", "sat"]                 — unit of account
 */
function createWalletEvent(
  sk: Uint8Array,
  walletId: string,
  walletName: string,
  mints: string[],
  relays: string[]
): Event {
  const pk = getPublicKey(sk);

  console.log("=== Create Wallet Event (Kind 17375) ===");

  // The encrypted content can hold private wallet metadata
  const privateData = JSON.stringify({
    name: walletName,
    description: "My Cashu ecash wallet on Nostr",
    mints,
    relays,
  });

  const encryptedContent = encryptToSelf(privateData, sk, pk);

  // Build the wallet event
  const tags: string[][] = [
    // Unique identifier for this wallet (makes it a replaceable event)
    ["d", walletId],
    // Human-readable name (public)
    ["name", walletName],
    // Unit of account
    ["unit", "sat"],
  ];

  // Add mint tags (one per mint)
  for (const mint of mints) {
    tags.push(["mint", mint]);
  }

  // Add relay tags (where token proofs are stored)
  for (const relay of relays) {
    tags.push(["relay", relay]);
  }

  const walletEvent = finalizeEvent(
    {
      kind: 17375,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: encryptedContent,
    },
    sk
  );

  console.log("  Wallet ID:", walletId);
  console.log("  Name:", walletName);
  console.log("  Mints:", mints.join(", "));
  console.log("  Event ID:", walletEvent.id);
  console.log("  Kind:", walletEvent.kind);

  return walletEvent;
}

// ---------------------------------------------------------------------------
// 2. Store Token Proofs (Kind 7375) — NIP-60
// ---------------------------------------------------------------------------

/**
 * Kind 7375 stores individual Cashu token proofs. Each event contains
 * proofs from a single mint, encrypted to yourself with NIP-44.
 *
 * These events make up your wallet's "UTXO set" — each one is a
 * collection of ecash proofs you can spend.
 *
 * Tags:
 *   - ["a", "17375:<pubkey>:<wallet-id>"] — references the parent wallet
 *
 * The content is NIP-44 encrypted and contains:
 *   {
 *     "mint": "<mint-url>",
 *     "proofs": [{ id, amount, secret, C }, ...]
 *   }
 *
 * When you spend proofs, you delete the kind 7375 event and create a new one
 * with any change proofs. This is similar to UTXO spending in Bitcoin.
 */
function createTokenEvent(
  sk: Uint8Array,
  walletId: string,
  mintUrl: string,
  proofs: CashuProof[]
): Event {
  const pk = getPublicKey(sk);

  console.log("\n=== Store Token Proofs (Kind 7375) ===");

  // Build the token data to encrypt
  const tokenData = JSON.stringify({
    mint: mintUrl,
    proofs,
  });

  // Encrypt to self
  const encryptedContent = encryptToSelf(tokenData, sk, pk);

  // Reference the parent wallet using an "a" tag (addressable event reference)
  const walletRef = `17375:${pk}:${walletId}`;

  const tokenEvent = finalizeEvent(
    {
      kind: 7375,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["a", walletRef],
      ],
      content: encryptedContent,
    },
    sk
  );

  const totalAmount = proofs.reduce((sum, p) => sum + p.amount, 0);

  console.log("  Wallet ref:", walletRef);
  console.log("  Mint:", mintUrl);
  console.log("  Proofs:", proofs.length);
  console.log("  Total amount:", totalAmount, "sats");
  console.log("  Event ID:", tokenEvent.id);

  return tokenEvent;
}

// ---------------------------------------------------------------------------
// 3. Create Spending History Entry (Kind 7376) — NIP-60
// ---------------------------------------------------------------------------

/**
 * Kind 7376 records spending history for a wallet. Each event represents
 * a transaction (send, receive, or nutzap).
 *
 * Content is NIP-44 encrypted and contains:
 *   {
 *     "direction": "in" | "out",
 *     "amount": <sats>,
 *     "mint": "<mint-url>",
 *     "memo": "optional memo"
 *   }
 *
 * Tags:
 *   - ["a", "17375:<pubkey>:<wallet-id>"] — parent wallet reference
 *   - ["e", "<token-event-id>", "", "created"] — new token proofs created
 *   - ["e", "<token-event-id>", "", "destroyed"] — old token proofs consumed
 */
function createSpendingHistoryEvent(
  sk: Uint8Array,
  walletId: string,
  direction: "in" | "out",
  amount: number,
  mintUrl: string,
  createdTokenEventId?: string,
  destroyedTokenEventId?: string,
  memo?: string
): Event {
  const pk = getPublicKey(sk);

  console.log("\n=== Spending History Entry (Kind 7376) ===");

  // Build the encrypted content
  const historyData = JSON.stringify({
    direction,
    amount,
    mint: mintUrl,
    memo: memo || "",
  });

  const encryptedContent = encryptToSelf(historyData, sk, pk);

  const walletRef = `17375:${pk}:${walletId}`;
  const tags: string[][] = [["a", walletRef]];

  // Reference token events that were created or destroyed
  if (createdTokenEventId) {
    tags.push(["e", createdTokenEventId, "", "created"]);
  }
  if (destroyedTokenEventId) {
    tags.push(["e", destroyedTokenEventId, "", "destroyed"]);
  }

  const historyEvent = finalizeEvent(
    {
      kind: 7376,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: encryptedContent,
    },
    sk
  );

  console.log("  Direction:", direction);
  console.log("  Amount:", amount, "sats");
  console.log("  Mint:", mintUrl);
  if (memo) console.log("  Memo:", memo);
  console.log("  Event ID:", historyEvent.id);

  return historyEvent;
}

// ---------------------------------------------------------------------------
// 4. Create a Nutzap (Kind 9321) — NIP-61
// ---------------------------------------------------------------------------

/**
 * A nutzap (kind 9321) sends Cashu ecash tokens as a "zap" via Nostr.
 * Unlike Lightning zaps (NIP-57), nutzaps carry the actual ecash tokens
 * in the event — no Lightning payment is needed.
 *
 * The tokens are P2PK locked — they are locked to the recipient's pubkey
 * so only the recipient can redeem them at the mint.
 *
 * Tags:
 *   - ["amount", "<sats>"]           — total amount being sent
 *   - ["unit", "sat"]                — unit of account
 *   - ["u", "<mint-url>"]            — the mint URL
 *   - ["p", "<recipient-pubkey>"]    — who receives the nutzap
 *   - ["e", "<event-id>"]            — optional: which event is being nutzapped
 *   - ["proof", "<json-proof>"]      — each P2PK-locked proof (one tag per proof)
 *
 * Content: optional comment (like a zap comment)
 *
 * P2PK Locking:
 *   When creating proofs for a nutzap, the sender uses the recipient's
 *   Nostr pubkey (converted to a Cashu spending condition) so only the
 *   recipient can redeem the tokens. The secret field of each proof
 *   encodes: ["P2PK", {"nonce": "...", "data": "<recipient-p2pk-pubkey>"}]
 */
function createNutzap(
  senderSk: Uint8Array,
  recipientPubkey: string,
  mintUrl: string,
  proofs: CashuProof[],
  eventId?: string,
  comment?: string
): Event {
  console.log("\n=== Create Nutzap (Kind 9321) ===");

  const totalAmount = proofs.reduce((sum, p) => sum + p.amount, 0);

  const tags: string[][] = [
    // Amount in sats
    ["amount", totalAmount.toString()],
    // Unit
    ["unit", "sat"],
    // Mint URL
    ["u", mintUrl],
    // Recipient
    ["p", recipientPubkey],
  ];

  // Optional: tag the event being nutzapped
  if (eventId) {
    tags.push(["e", eventId]);
  }

  // Add each proof as a separate tag
  // In production, these proofs would be P2PK-locked to the recipient
  for (const proof of proofs) {
    tags.push(["proof", JSON.stringify(proof)]);
  }

  const nutzapEvent = finalizeEvent(
    {
      kind: 9321,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: comment || "",
    },
    senderSk
  );

  console.log("  Sender:", nutzapEvent.pubkey.slice(0, 16) + "...");
  console.log("  Recipient:", recipientPubkey.slice(0, 16) + "...");
  console.log("  Amount:", totalAmount, "sats");
  console.log("  Mint:", mintUrl);
  console.log("  Proofs:", proofs.length);
  if (comment) console.log("  Comment:", comment);
  if (eventId) console.log("  Event:", eventId.slice(0, 16) + "...");
  console.log("  Event ID:", nutzapEvent.id);

  return nutzapEvent;
}

// ---------------------------------------------------------------------------
// 5. Parse and Redeem a Nutzap
// ---------------------------------------------------------------------------

/**
 * When you receive a nutzap, you:
 *   1. Extract the proofs from the "proof" tags
 *   2. Verify they are P2PK-locked to your pubkey
 *   3. Redeem them at the specified mint
 *   4. Store the new proofs in your wallet (kind 7375)
 */
function parseNutzap(event: Event): {
  sender: string;
  recipient: string;
  amount: number;
  mint: string;
  proofs: CashuProof[];
  comment: string;
  eventId?: string;
} {
  console.log("\n=== Parse Nutzap ===");

  const recipient = event.tags.find((t) => t[0] === "p")?.[1] || "";
  const amount = parseInt(event.tags.find((t) => t[0] === "amount")?.[1] || "0", 10);
  const mint = event.tags.find((t) => t[0] === "u")?.[1] || "";
  const eventId = event.tags.find((t) => t[0] === "e")?.[1];

  // Extract proofs from tags
  const proofs: CashuProof[] = event.tags
    .filter((t) => t[0] === "proof")
    .map((t) => JSON.parse(t[1]));

  const result = {
    sender: event.pubkey,
    recipient,
    amount,
    mint,
    proofs,
    comment: event.content,
    eventId,
  };

  console.log("  Sender:", result.sender.slice(0, 16) + "...");
  console.log("  Recipient:", result.recipient.slice(0, 16) + "...");
  console.log("  Amount:", result.amount, "sats");
  console.log("  Mint:", result.mint);
  console.log("  Proofs:", result.proofs.length);
  if (result.comment) console.log("  Comment:", result.comment);

  return result;
}

// ---------------------------------------------------------------------------
// 6. Discover Mints (Kind 38172) — NIP-87
// ---------------------------------------------------------------------------

/**
 * NIP-87 defines how Cashu mints are discovered on Nostr. Mint operators
 * publish kind 38172 events with metadata about their mint.
 *
 * Users can also publish kind 38172 events to recommend mints they trust.
 *
 * Tags:
 *   - ["d", "<mint-url>"]              — the mint URL (unique identifier)
 *   - ["k", "38172"]                   — self-referencing kind
 *   - ["u", "<mint-url>"]              — mint URL
 *   - ["n", "<mint-name>"]             — human-readable name
 *   - ["desc", "<description>"]        — description
 *   - ["contact", "<method>", "<id>"]  — contact info
 *   - ["nuts", "0", "1", "2", ...]     — supported NUTs (Cashu protocol specs)
 *   - ["unit", "sat"]                  — supported units
 */
async function discoverMints(): Promise<void> {
  console.log("\n=== Discover Mints (NIP-87, Kind 38172) ===");

  const pool = new SimplePool();

  try {
    // Query for mint recommendation events
    const mintEvents = await pool.querySync(RELAYS, {
      kinds: [38172],
      limit: 20,
    });

    console.log(`  Found ${mintEvents.length} mint event(s)\n`);

    for (const event of mintEvents) {
      const mintUrl = event.tags.find((t) => t[0] === "u")?.[1]
        || event.tags.find((t) => t[0] === "d")?.[1]
        || "unknown";
      const name = event.tags.find((t) => t[0] === "n")?.[1] || "unnamed";
      const units = event.tags
        .filter((t) => t[0] === "unit")
        .map((t) => t[1])
        .join(", ") || "sat";

      console.log(`  Mint: ${name}`);
      console.log(`    URL: ${mintUrl}`);
      console.log(`    Units: ${units}`);
      console.log(`    Publisher: ${event.pubkey.slice(0, 16)}...`);
      console.log();
    }
  } finally {
    pool.close(RELAYS);
  }
}

/**
 * Creates a mint recommendation event (kind 38172).
 * Users publish these to recommend mints they trust.
 */
function createMintRecommendation(
  sk: Uint8Array,
  mintUrl: string,
  mintName: string,
  description: string,
  supportedUnits: string[] = ["sat"]
): Event {
  console.log("\n=== Create Mint Recommendation (Kind 38172) ===");

  const tags: string[][] = [
    // The "d" tag makes this an addressable/replaceable event per mint
    ["d", mintUrl],
    // Mint URL
    ["u", mintUrl],
    // Human-readable name
    ["n", mintName],
    // Description
    ["desc", description],
  ];

  // Add unit tags
  for (const unit of supportedUnits) {
    tags.push(["unit", unit]);
  }

  const event = finalizeEvent(
    {
      kind: 38172,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: "", // content is typically empty
    },
    sk
  );

  console.log("  Mint:", mintName);
  console.log("  URL:", mintUrl);
  console.log("  Units:", supportedUnits.join(", "));
  console.log("  Event ID:", event.id);

  return event;
}

// ---------------------------------------------------------------------------
// 7. Fetch Nutzaps for an Event
// ---------------------------------------------------------------------------

/**
 * Queries relays for nutzaps (kind 9321) on a specific event.
 */
async function fetchNutzapsForEvent(eventId: string): Promise<void> {
  console.log("\n=== Fetch Nutzaps for Event ===");
  console.log("  Event:", eventId);

  const pool = new SimplePool();

  try {
    const nutzaps = await pool.querySync(RELAYS, {
      kinds: [9321],
      "#e": [eventId],
      limit: 50,
    });

    console.log(`  Found ${nutzaps.length} nutzap(s)\n`);

    let totalSats = 0;

    for (const nz of nutzaps) {
      const parsed = parseNutzap(nz);
      totalSats += parsed.amount;
    }

    console.log(`\n  Total nutzapped: ${totalSats} sats`);
  } finally {
    pool.close(RELAYS);
  }
}

// ---------------------------------------------------------------------------
// Main — Demonstrate Cashu/ecash on Nostr
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Cashu / Ecash on NOSTR (NIP-60, NIP-61, NIP-87) Example");
  console.log("=========================================================\n");

  // Generate keypairs for demonstration
  const aliceSk = generateSecretKey();
  const alicePk = getPublicKey(aliceSk);
  const bobSk = generateSecretKey();
  const bobPk = getPublicKey(bobSk);

  console.log("Alice (sender):", alicePk.slice(0, 16) + "...");
  console.log("Bob (recipient):", bobPk.slice(0, 16) + "...");

  // --- Step 1: Create Alice's wallet ---
  console.log("\n--- Step 1: Create Wallet (Kind 17375) ---");
  const walletEvent = createWalletEvent(
    aliceSk,
    "default",
    "Alice's Cashu Wallet",
    [EXAMPLE_MINT],
    RELAYS
  );

  // --- Step 2: Store some token proofs ---
  console.log("\n--- Step 2: Store Token Proofs (Kind 7375) ---");

  // Example Cashu proofs (in production, these come from the mint)
  const exampleProofs: CashuProof[] = [
    {
      id: "009a1f293253e41e",
      amount: 8,
      secret: "407915bc212be61a77e3e6d2aeb4c727980bda51cd06a6afc29e2861768a7837",
      C: "02bc9097997d81afb2cc7346b5e4345a9346bd2a506eb7958598a72f0cf85163ea",
    },
    {
      id: "009a1f293253e41e",
      amount: 2,
      secret: "fe15109314e61d7756b0f8ee0f23a624acaa3f4e042f61433c728c7057b931be",
      C: "029e8e5050b890a7d6c0968db16bc1d5d5fa040ea1de284f6ec69d61299f671059",
    },
    {
      id: "009a1f293253e41e",
      amount: 1,
      secret: "d341ee4871f1f889041e63cf0d3823c713eea6aff01e3f2c3bfc64cfe9b05764",
      C: "02f1cce55ca4aab530da3b4a8a7daee8b5f472fb93771c6d0a191a1e9e8faf2b96",
    },
  ];

  const tokenEvent = createTokenEvent(
    aliceSk,
    "default",
    EXAMPLE_MINT,
    exampleProofs
  );

  // --- Step 3: Record the receive in spending history ---
  console.log("\n--- Step 3: Record Spending History (Kind 7376) ---");
  const historyEvent = createSpendingHistoryEvent(
    aliceSk,
    "default",
    "in",
    11, // 8 + 2 + 1 = 11 sats
    EXAMPLE_MINT,
    tokenEvent.id,
    undefined,
    "Received ecash from mint"
  );

  // --- Step 4: Send a nutzap from Alice to Bob ---
  console.log("\n--- Step 4: Create Nutzap (Kind 9321) ---");

  // In production, you would:
  // 1. Select proofs from your wallet that sum to the desired amount
  // 2. Swap them at the mint for P2PK-locked proofs (locked to Bob's pubkey)
  // 3. Include the P2PK-locked proofs in the nutzap event

  // Example P2PK-locked proofs (locked to Bob's pubkey)
  const p2pkProofs: CashuProof[] = [
    {
      id: "009a1f293253e41e",
      amount: 8,
      // In reality, this secret encodes: ["P2PK", {"nonce": "...", "data": "<bob-p2pk-key>"}]
      secret: JSON.stringify([
        "P2PK",
        {
          nonce: bytesToHex(generateSecretKey()).slice(0, 32),
          data: "02" + bobPk, // Bob's pubkey as P2PK spending condition
        },
      ]),
      C: "02bc9097997d81afb2cc7346b5e4345a9346bd2a506eb7958598a72f0cf85163ea",
    },
    {
      id: "009a1f293253e41e",
      amount: 2,
      secret: JSON.stringify([
        "P2PK",
        {
          nonce: bytesToHex(generateSecretKey()).slice(0, 32),
          data: "02" + bobPk,
        },
      ]),
      C: "029e8e5050b890a7d6c0968db16bc1d5d5fa040ea1de284f6ec69d61299f671059",
    },
  ];

  // Create the nutzap event — an example event ID for the note being nutzapped
  const targetEventId = "a".repeat(64); // placeholder event ID
  const nutzapEvent = createNutzap(
    aliceSk,
    bobPk,
    EXAMPLE_MINT,
    p2pkProofs,
    targetEventId,
    "Here are 10 sats for that great post!"
  );

  // --- Step 5: Bob parses and redeems the nutzap ---
  console.log("\n--- Step 5: Parse Received Nutzap ---");
  const parsed = parseNutzap(nutzapEvent);
  console.log("\n  To redeem, Bob would:");
  console.log("  1. Extract the P2PK-locked proofs from the nutzap");
  console.log("  2. Sign a redemption message with his Nostr key");
  console.log("  3. Send the proofs + signature to the mint's /v1/swap endpoint");
  console.log("  4. Receive fresh (unlocked) proofs back from the mint");
  console.log("  5. Store the new proofs in his wallet (kind 7375)");

  // --- Step 6: Create a mint recommendation ---
  console.log("\n--- Step 6: Mint Discovery (Kind 38172) ---");
  const mintRecEvent = createMintRecommendation(
    aliceSk,
    EXAMPLE_MINT,
    "Minibits Mint",
    "Reliable Cashu mint operated by Minibits. Backed by Lightning.",
    ["sat"]
  );

  // --- Step 7: Discover existing mints ---
  console.log("\n--- Step 7: Discover Mints from Relays ---");
  await discoverMints();

  // --- Summary ---
  console.log("\n--- Summary of Events Created ---");
  console.log(`  Wallet (17375):          ${walletEvent.id.slice(0, 16)}...`);
  console.log(`  Token proofs (7375):     ${tokenEvent.id.slice(0, 16)}...`);
  console.log(`  Spending history (7376): ${historyEvent.id.slice(0, 16)}...`);
  console.log(`  Nutzap (9321):           ${nutzapEvent.id.slice(0, 16)}...`);
  console.log(`  Mint rec (38172):        ${mintRecEvent.id.slice(0, 16)}...`);

  console.log("\nDone.");
}

main().catch(console.error);
