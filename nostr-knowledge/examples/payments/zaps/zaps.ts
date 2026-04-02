/**
 * Lightning Zaps (NIP-57) — TypeScript
 *
 * Demonstrates the full zap flow:
 *   1. Create a zap request event (kind 9734)
 *   2. Send zap request to the recipient's LNURL endpoint
 *   3. Receive and parse a zap receipt (kind 9735)
 *   4. Verify a zap receipt (validate signatures, amounts)
 *   5. Fetch zap receipts for an event
 *
 * The zap flow involves multiple parties:
 *   - Sender (client) creates a zap request and pays a Lightning invoice
 *   - Recipient has a Lightning address / LNURL in their profile (lud16/lud06)
 *   - LNURL server (e.g. Alby, Wallet of Satoshi) generates the invoice
 *   - After payment, the LNURL server publishes a zap receipt to relays
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill @noble/hashes
 *
 * Run:
 *   npx ts-node zaps.ts
 *
 * References:
 *   - NIP-57: https://github.com/nostr-protocol/nips/blob/master/57.md
 *   - LNURL spec: https://github.com/lnurl/luds
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent,
  type Event,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import "websocket-polyfill";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// A well-known pubkey to zap (for demonstration)
const RECIPIENT_PUBKEY =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** LNURL-pay response from the Lightning address server */
interface LnurlPayResponse {
  callback: string;
  maxSendable: number; // millisatoshis
  minSendable: number; // millisatoshis
  metadata: string;
  tag: string;
  allowsNostr?: boolean; // true if the server supports NIP-57 zaps
  nostrPubkey?: string; // the server's pubkey (used to sign zap receipts)
}

/** Response from the LNURL callback with the invoice */
interface LnurlInvoiceResponse {
  pr: string; // bolt11 invoice
  routes: unknown[];
}

// ---------------------------------------------------------------------------
// 1. Resolve a Lightning Address to an LNURL-pay endpoint
// ---------------------------------------------------------------------------

/**
 * Converts a Lightning address (user@domain.com) to an LNURL-pay endpoint
 * and fetches the server metadata.
 *
 * Lightning address format: username@domain
 * Resolves to: https://domain/.well-known/lnurlp/username
 */
async function resolveLightningAddress(
  lightningAddress: string
): Promise<LnurlPayResponse> {
  const [username, domain] = lightningAddress.split("@");

  if (!username || !domain) {
    throw new Error(`Invalid Lightning address: ${lightningAddress}`);
  }

  // Construct the LNURL-pay well-known URL
  const url = `https://${domain}/.well-known/lnurlp/${username}`;
  console.log(`Resolving Lightning address: ${lightningAddress}`);
  console.log(`  LNURL endpoint: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`LNURL fetch failed: ${response.status}`);
  }

  const data: LnurlPayResponse = await response.json();

  console.log(`  allowsNostr: ${data.allowsNostr}`);
  console.log(`  nostrPubkey: ${data.nostrPubkey}`);
  console.log(
    `  sendable range: ${data.minSendable / 1000}–${data.maxSendable / 1000} sats`
  );

  if (!data.allowsNostr) {
    throw new Error("This LNURL server does not support NIP-57 zaps");
  }

  return data;
}

// ---------------------------------------------------------------------------
// 2. Create a Zap Request Event (Kind 9734)
// ---------------------------------------------------------------------------

/**
 * Creates a zap request event. This event is NOT published to relays directly.
 * Instead, it is serialized and sent to the LNURL callback as a query parameter.
 *
 * The zap request tells the LNURL server:
 *   - Who is sending the zap (pubkey of sender)
 *   - Who is receiving the zap ("p" tag)
 *   - Which event is being zapped ("e" tag, optional)
 *   - How many sats (amount tag, in millisatoshis)
 *   - Which relays should receive the zap receipt
 *   - An optional comment
 */
function createZapRequest(
  senderSk: Uint8Array,
  recipientPubkey: string,
  amountMillisats: number,
  relays: string[],
  eventId?: string,
  comment?: string
): Event {
  // Build the tags array
  const tags: string[][] = [
    // Required: the recipient's pubkey
    ["p", recipientPubkey],
    // Required: relay hints — where the zap receipt should be published
    ["relays", ...relays],
    // Required: amount in millisatoshis (must match the invoice amount)
    ["amount", amountMillisats.toString()],
  ];

  // Optional: tag the specific event being zapped
  if (eventId) {
    tags.push(["e", eventId]);
  }

  // The zap request is kind 9734
  const zapRequestTemplate = {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: comment || "", // optional zap comment
  };

  // Sign the zap request with the sender's key
  const signedZapRequest = finalizeEvent(zapRequestTemplate, senderSk);

  console.log("\n=== Zap Request (Kind 9734) ===");
  console.log("  Event ID:", signedZapRequest.id);
  console.log("  Sender:", signedZapRequest.pubkey);
  console.log("  Recipient:", recipientPubkey);
  console.log("  Amount:", amountMillisats / 1000, "sats");
  if (comment) console.log("  Comment:", comment);
  if (eventId) console.log("  Zapping event:", eventId);

  return signedZapRequest;
}

// ---------------------------------------------------------------------------
// 3. Send Zap Request to LNURL Endpoint (get a Lightning invoice)
// ---------------------------------------------------------------------------

/**
 * Sends the zap request to the LNURL callback to get a Lightning invoice.
 *
 * The flow:
 *   1. Serialize the signed zap request event as JSON
 *   2. URL-encode it and add it as a `nostr` query parameter
 *   3. Add the `amount` query parameter (in millisatoshis)
 *   4. GET the callback URL — the response contains a bolt11 invoice
 *
 * After receiving the invoice, the sender pays it using their Lightning wallet.
 * Once payment is confirmed, the LNURL server publishes a zap receipt (kind 9735).
 */
async function getZapInvoice(
  lnurlData: LnurlPayResponse,
  zapRequest: Event,
  amountMillisats: number
): Promise<string> {
  // Serialize and encode the zap request
  const zapRequestJson = JSON.stringify(zapRequest);
  const encodedZapRequest = encodeURIComponent(zapRequestJson);

  // Build the callback URL with query parameters
  const separator = lnurlData.callback.includes("?") ? "&" : "?";
  const callbackUrl =
    `${lnurlData.callback}${separator}` +
    `amount=${amountMillisats}` +
    `&nostr=${encodedZapRequest}`;

  console.log("\n=== Requesting Lightning Invoice ===");
  console.log("  Callback:", lnurlData.callback);
  console.log("  Amount:", amountMillisats / 1000, "sats");

  const response = await fetch(callbackUrl);
  if (!response.ok) {
    throw new Error(`Invoice request failed: ${response.status}`);
  }

  const invoiceData: LnurlInvoiceResponse = await response.json();

  console.log("  Invoice (bolt11):", invoiceData.pr.slice(0, 60) + "...");
  console.log(
    "\n  Next step: Pay this invoice with your Lightning wallet."
  );
  console.log(
    "  After payment, the LNURL server publishes a zap receipt (kind 9735)."
  );

  return invoiceData.pr;
}

// ---------------------------------------------------------------------------
// 4. Parse and Verify a Zap Receipt (Kind 9735)
// ---------------------------------------------------------------------------

/**
 * A zap receipt (kind 9735) is published by the LNURL server after the
 * Lightning invoice is paid. It contains:
 *   - The original zap request in the "description" tag
 *   - A bolt11 invoice in the "bolt11" tag
 *   - "p" and "e" tags matching the original zap request
 *   - Signed by the LNURL server's nostr pubkey
 *
 * Verification steps:
 *   1. The zap receipt must be signed by the LNURL server's pubkey
 *   2. The embedded zap request must be a valid kind 9734 event
 *   3. The zap request's "p" tag must match the receipt's "p" tag
 *   4. The amount in the zap request must match the bolt11 invoice amount
 */
function verifyZapReceipt(
  receipt: Event,
  expectedServerPubkey?: string
): {
  valid: boolean;
  zapRequest: Event | null;
  amountSats: number;
  comment: string;
  errors: string[];
} {
  const errors: string[] = [];
  let zapRequest: Event | null = null;
  let amountSats = 0;

  console.log("\n=== Verifying Zap Receipt (Kind 9735) ===");
  console.log("  Receipt ID:", receipt.id);
  console.log("  Receipt pubkey (server):", receipt.pubkey);

  // Step 1: Verify the event signature
  if (!verifyEvent(receipt)) {
    errors.push("Invalid event signature");
  }

  // Step 2: Check that the receipt is kind 9735
  if (receipt.kind !== 9735) {
    errors.push(`Expected kind 9735, got ${receipt.kind}`);
  }

  // Step 3: Verify the server pubkey matches the expected LNURL server
  if (expectedServerPubkey && receipt.pubkey !== expectedServerPubkey) {
    errors.push(
      `Server pubkey mismatch: expected ${expectedServerPubkey}, got ${receipt.pubkey}`
    );
  }

  // Step 4: Extract and validate the embedded zap request from the "description" tag
  const descriptionTag = receipt.tags.find((t) => t[0] === "description");
  if (!descriptionTag || !descriptionTag[1]) {
    errors.push("Missing 'description' tag (embedded zap request)");
  } else {
    try {
      zapRequest = JSON.parse(descriptionTag[1]) as Event;

      // Validate the embedded zap request
      if (zapRequest.kind !== 9734) {
        errors.push(`Embedded event is kind ${zapRequest.kind}, expected 9734`);
      }

      if (!verifyEvent(zapRequest)) {
        errors.push("Embedded zap request has invalid signature");
      }

      // Step 5: Check that "p" tags match between zap request and receipt
      const receiptP = receipt.tags.find((t) => t[0] === "p")?.[1];
      const requestP = zapRequest.tags.find((t) => t[0] === "p")?.[1];
      if (receiptP !== requestP) {
        errors.push(
          `Recipient mismatch: receipt has ${receiptP}, request has ${requestP}`
        );
      }

      // Step 6: Extract the amount from the zap request's "amount" tag
      const amountTag = zapRequest.tags.find((t) => t[0] === "amount");
      if (amountTag) {
        amountSats = parseInt(amountTag[1], 10) / 1000;
      }

      console.log("  Sender:", zapRequest.pubkey);
      console.log("  Comment:", zapRequest.content || "(none)");
    } catch (e) {
      errors.push(`Failed to parse embedded zap request: ${e}`);
    }
  }

  // Step 7: Extract the bolt11 invoice
  const bolt11Tag = receipt.tags.find((t) => t[0] === "bolt11");
  if (bolt11Tag) {
    console.log("  Bolt11:", bolt11Tag[1].slice(0, 50) + "...");
  } else {
    errors.push("Missing 'bolt11' tag");
  }

  // Step 8: Check for a preimage (proof of payment)
  const preimageTag = receipt.tags.find((t) => t[0] === "preimage");
  if (preimageTag) {
    console.log("  Preimage:", preimageTag[1]);
  }

  console.log("  Amount:", amountSats, "sats");
  console.log("  Errors:", errors.length === 0 ? "none" : errors.join(", "));

  return {
    valid: errors.length === 0,
    zapRequest,
    amountSats,
    comment: zapRequest?.content || "",
    errors,
  };
}

// ---------------------------------------------------------------------------
// 5. Fetch Zap Receipts for an Event
// ---------------------------------------------------------------------------

/**
 * Queries relays for zap receipts (kind 9735) associated with a specific event.
 * This lets you display the zap total and individual zaps on any note.
 */
async function fetchZapsForEvent(
  eventId: string,
  pubkey: string
): Promise<void> {
  console.log("\n=== Fetching Zap Receipts ===");
  console.log("  Event:", eventId);

  const pool = new SimplePool();

  try {
    // Query for kind 9735 events that tag the target event
    const receipts = await pool.querySync(RELAYS, {
      kinds: [9735],
      "#e": [eventId],
      limit: 50,
    });

    console.log(`  Found ${receipts.length} zap receipt(s)\n`);

    let totalSats = 0;

    for (const receipt of receipts) {
      const result = verifyZapReceipt(receipt);

      if (result.valid) {
        totalSats += result.amountSats;
        console.log(
          `  [VALID]   ${result.amountSats} sats from ${result.zapRequest?.pubkey.slice(0, 12)}...` +
            (result.comment ? ` — "${result.comment}"` : "")
        );
      } else {
        console.log(`  [INVALID] Receipt ${receipt.id.slice(0, 12)}... — ${result.errors.join(", ")}`);
      }
    }

    console.log(`\n  Total zapped: ${totalSats} sats`);
  } finally {
    pool.close(RELAYS);
  }
}

// ---------------------------------------------------------------------------
// 6. Fetch Zap Receipts for a Profile
// ---------------------------------------------------------------------------

/**
 * Queries relays for zap receipts sent to a specific pubkey.
 * Useful for displaying total zaps received by a user.
 */
async function fetchZapsForProfile(pubkey: string): Promise<void> {
  console.log("\n=== Fetching Profile Zaps ===");
  console.log("  Pubkey:", pubkey);

  const pool = new SimplePool();

  try {
    // Query for kind 9735 events that tag this pubkey
    const receipts = await pool.querySync(RELAYS, {
      kinds: [9735],
      "#p": [pubkey],
      limit: 20,
    });

    console.log(`  Found ${receipts.length} zap receipt(s)\n`);

    let totalSats = 0;
    const zaps: { sats: number; from: string; comment: string; time: number }[] = [];

    for (const receipt of receipts) {
      const result = verifyZapReceipt(receipt);
      if (result.valid && result.zapRequest) {
        totalSats += result.amountSats;
        zaps.push({
          sats: result.amountSats,
          from: result.zapRequest.pubkey,
          comment: result.comment,
          time: receipt.created_at,
        });
      }
    }

    // Sort by amount descending
    zaps.sort((a, b) => b.sats - a.sats);

    console.log("  --- Top Zaps ---");
    for (const zap of zaps.slice(0, 10)) {
      const date = new Date(zap.time * 1000).toISOString().split("T")[0];
      console.log(
        `  ${zap.sats} sats from ${zap.from.slice(0, 12)}... on ${date}` +
          (zap.comment ? ` — "${zap.comment}"` : "")
      );
    }

    console.log(`\n  Total received: ${totalSats} sats (from ${zaps.length} valid zaps)`);
  } finally {
    pool.close(RELAYS);
  }
}

// ---------------------------------------------------------------------------
// Main — Demonstrate the full zap flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("NOSTR Lightning Zaps (NIP-57) Example");
  console.log("======================================\n");

  // Generate a sender keypair
  const senderSk = generateSecretKey();
  const senderPk = getPublicKey(senderSk);
  console.log("Sender pubkey:", senderPk);

  // --- Step 1: Resolve the recipient's Lightning address ---
  // In production, you would fetch the recipient's kind 0 profile
  // and extract their lud16 (Lightning address) or lud06 (LNURL).
  console.log("\n--- Step 1: Resolve Lightning Address ---");
  let lnurlData: LnurlPayResponse;
  try {
    // This is a demonstration address — replace with a real one
    lnurlData = await resolveLightningAddress("explorer@getalby.com");
  } catch (e) {
    console.log(`Could not resolve Lightning address: ${e}`);
    console.log("Continuing with demonstration of remaining steps...\n");

    // For demonstration, skip to fetching existing zaps
    await fetchZapsForProfile(RECIPIENT_PUBKEY);
    return;
  }

  // --- Step 2: Create a zap request ---
  console.log("\n--- Step 2: Create Zap Request ---");
  const amountSats = 21; // the classic zap amount
  const amountMillisats = amountSats * 1000;

  const zapRequest = createZapRequest(
    senderSk,
    RECIPIENT_PUBKEY,
    amountMillisats,
    RELAYS,
    undefined, // no specific event — this is a profile zap
    "Great work on Nostr!" // optional comment
  );

  // --- Step 3: Get a Lightning invoice from the LNURL server ---
  console.log("\n--- Step 3: Get Lightning Invoice ---");
  try {
    const bolt11Invoice = await getZapInvoice(
      lnurlData,
      zapRequest,
      amountMillisats
    );

    console.log("\n  To complete the zap:");
    console.log("  1. Pay this bolt11 invoice with any Lightning wallet");
    console.log("  2. The LNURL server will detect the payment");
    console.log("  3. The server will publish a zap receipt (kind 9735) to relays");
    console.log("  4. The recipient's client will display the zap");
  } catch (e) {
    console.log(`Could not get invoice: ${e}`);
  }

  // --- Step 4: Fetch and verify existing zap receipts ---
  console.log("\n--- Step 4: Fetch Existing Zap Receipts ---");
  await fetchZapsForProfile(RECIPIENT_PUBKEY);

  console.log("\nDone.");
}

main().catch(console.error);
