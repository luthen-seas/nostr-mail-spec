/**
 * Nostr Wallet Connect (NIP-47) — TypeScript
 *
 * Demonstrates the NWC protocol for remote Lightning wallet control:
 *   1. Parse a nostr+walletconnect:// URI
 *   2. Connect to the wallet relay
 *   3. Send a pay_invoice request (kind 23194, NIP-44 encrypted)
 *   4. Receive the response (kind 23195)
 *   5. Check balance, list transactions
 *
 * NWC allows a Nostr client to control a remote Lightning wallet using
 * encrypted Nostr events. The wallet provider runs a service that listens
 * for request events and responds with results.
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill
 *
 * Run:
 *   npx ts-node wallet_connect.ts
 *
 * References:
 *   - NIP-47: https://github.com/nostr-protocol/nips/blob/master/47.md
 *   - NIP-44: https://github.com/nostr-protocol/nips/blob/master/44.md
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
// Types
// ---------------------------------------------------------------------------

/** Parsed components of a nostr+walletconnect:// URI */
interface NWCParams {
  walletPubkey: string; // the wallet service's pubkey
  relayUrl: string; // the relay to communicate through
  secret: string; // the client's secret key (hex) for this connection
  lud16?: string; // optional Lightning address
}

/** NWC JSON-RPC request payload (encrypted inside kind 23194) */
interface NWCRequest {
  method: string;
  params: Record<string, unknown>;
}

/** NWC JSON-RPC response payload (encrypted inside kind 23195) */
interface NWCResponse {
  result_type: string;
  error?: {
    code: string;
    message: string;
  };
  result?: Record<string, unknown>;
}

/** Balance result from get_balance */
interface BalanceResult {
  balance: number; // millisatoshis
}

/** Transaction info from list_transactions */
interface TransactionInfo {
  type: string; // "incoming" or "outgoing"
  invoice: string; // bolt11
  description?: string;
  preimage?: string;
  payment_hash: string;
  amount: number; // millisatoshis
  fees_paid: number; // millisatoshis
  created_at: number; // unix timestamp
  settled_at?: number;
}

// ---------------------------------------------------------------------------
// 1. Parse a nostr+walletconnect:// URI
// ---------------------------------------------------------------------------

/**
 * Parses a Nostr Wallet Connect URI into its components.
 *
 * URI format:
 *   nostr+walletconnect://<wallet-pubkey>?relay=<relay-url>&secret=<hex-secret>&lud16=<address>
 *
 * The URI is typically provided by the wallet service (e.g. Alby, Mutiny)
 * when the user authorizes a new connection. It contains:
 *   - wallet-pubkey: the wallet service's Nostr pubkey
 *   - relay: the relay used for NWC communication
 *   - secret: a dedicated secret key for this connection
 *   - lud16: optional Lightning address for receiving
 */
function parseNWCUri(uri: string): NWCParams {
  console.log("=== Parsing NWC URI ===");

  // Remove the protocol prefix
  const withoutProtocol = uri.replace("nostr+walletconnect://", "");

  // Split pubkey from query parameters
  const [walletPubkey, queryString] = withoutProtocol.split("?");

  if (!walletPubkey || !queryString) {
    throw new Error("Invalid NWC URI format");
  }

  // Parse query parameters
  const params = new URLSearchParams(queryString);
  const relayUrl = params.get("relay");
  const secret = params.get("secret");
  const lud16 = params.get("lud16") || undefined;

  if (!relayUrl || !secret) {
    throw new Error("NWC URI missing required relay or secret parameter");
  }

  const result: NWCParams = {
    walletPubkey,
    relayUrl,
    secret,
    lud16,
  };

  console.log("  Wallet pubkey:", walletPubkey.slice(0, 16) + "...");
  console.log("  Relay:", relayUrl);
  console.log("  Client pubkey:", getPublicKey(hexToBytes(secret)).slice(0, 16) + "...");
  if (lud16) console.log("  Lightning address:", lud16);

  return result;
}

// ---------------------------------------------------------------------------
// 2. NWC Encryption Helpers (NIP-44)
// ---------------------------------------------------------------------------

/**
 * NWC uses NIP-44 encryption for request/response payloads.
 * NIP-44 is a versioned encryption scheme using XChaCha20-Poly1305,
 * providing better security than the older NIP-04 (AES-CBC).
 *
 * The conversation key is derived from the client's secret key
 * and the wallet service's pubkey using ECDH on secp256k1.
 */
function encryptNWCPayload(
  payload: NWCRequest,
  clientSk: Uint8Array,
  walletPubkey: string
): string {
  const plaintext = JSON.stringify(payload);

  // Derive the shared conversation key using NIP-44
  const conversationKey = nip44.v2.utils.getConversationKey(
    clientSk,
    walletPubkey
  );

  // Encrypt the payload
  return nip44.v2.encrypt(plaintext, conversationKey);
}

function decryptNWCPayload(
  ciphertext: string,
  clientSk: Uint8Array,
  walletPubkey: string
): NWCResponse {
  // Derive the shared conversation key
  const conversationKey = nip44.v2.utils.getConversationKey(
    clientSk,
    walletPubkey
  );

  // Decrypt the payload
  const plaintext = nip44.v2.decrypt(ciphertext, conversationKey);
  return JSON.parse(plaintext);
}

// ---------------------------------------------------------------------------
// 3. Send a pay_invoice Request (Kind 23194)
// ---------------------------------------------------------------------------

/**
 * Creates and publishes an NWC pay_invoice request.
 *
 * Kind 23194 is the NWC request event. Its content is a NIP-44 encrypted
 * JSON-RPC payload. The event is tagged with the wallet service's pubkey
 * so it can find the request.
 *
 * Supported NWC methods (NIP-47):
 *   - pay_invoice      — pay a bolt11 invoice
 *   - pay_keysend      — send a keysend payment
 *   - make_invoice     — create a new invoice
 *   - lookup_invoice   — check invoice status
 *   - get_balance      — get wallet balance
 *   - get_info         — get wallet info
 *   - list_transactions — list recent transactions
 */
async function sendPayInvoice(
  nwc: NWCParams,
  bolt11Invoice: string
): Promise<NWCResponse | null> {
  console.log("\n=== Sending pay_invoice Request ===");

  const clientSk = hexToBytes(nwc.secret);
  const clientPk = getPublicKey(clientSk);

  // Build the JSON-RPC request payload
  const request: NWCRequest = {
    method: "pay_invoice",
    params: {
      invoice: bolt11Invoice,
    },
  };

  // Encrypt the payload using NIP-44
  const encryptedContent = encryptNWCPayload(request, clientSk, nwc.walletPubkey);

  // Create the NWC request event (kind 23194)
  const requestEvent = finalizeEvent(
    {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        // Tag the wallet service so it can filter for our requests
        ["p", nwc.walletPubkey],
      ],
      content: encryptedContent,
    },
    clientSk
  );

  console.log("  Request event ID:", requestEvent.id);
  console.log("  Method: pay_invoice");
  console.log("  Invoice:", bolt11Invoice.slice(0, 40) + "...");

  // Publish the request and subscribe for the response
  const pool = new SimplePool();

  try {
    // Publish the request event
    await Promise.allSettled(pool.publish([nwc.relayUrl], requestEvent));
    console.log("  Published to:", nwc.relayUrl);

    // Subscribe for the response (kind 23195 from the wallet, tagging our event)
    console.log("  Waiting for response...");

    const response = await waitForResponse(pool, nwc, requestEvent.id, clientSk);
    return response;
  } finally {
    pool.close([nwc.relayUrl]);
  }
}

// ---------------------------------------------------------------------------
// 4. Receive NWC Response (Kind 23195)
// ---------------------------------------------------------------------------

/**
 * Waits for an NWC response event (kind 23195) from the wallet service.
 *
 * The response event:
 *   - Kind 23195
 *   - From the wallet service's pubkey
 *   - Tags the original request event with ["e", requestId]
 *   - Content is NIP-44 encrypted JSON-RPC response
 */
async function waitForResponse(
  pool: SimplePool,
  nwc: NWCParams,
  requestEventId: string,
  clientSk: Uint8Array
): Promise<NWCResponse | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("  Response timeout (10s)");
      resolve(null);
    }, 10_000);

    // Subscribe for kind 23195 events from the wallet, referencing our request
    const sub = pool.subscribeMany(
      [nwc.relayUrl],
      [
        {
          kinds: [23195],
          authors: [nwc.walletPubkey],
          "#e": [requestEventId],
        },
      ],
      {
        onevent(event: Event) {
          clearTimeout(timeout);

          console.log("\n=== Received NWC Response (Kind 23195) ===");
          console.log("  Response event ID:", event.id);

          // Decrypt the response payload
          try {
            const response = decryptNWCPayload(
              event.content,
              clientSk,
              nwc.walletPubkey
            );

            console.log("  Result type:", response.result_type);

            if (response.error) {
              console.log("  Error:", response.error.code, "—", response.error.message);
            } else if (response.result) {
              console.log("  Result:", JSON.stringify(response.result, null, 2));
            }

            sub.close();
            resolve(response);
          } catch (e) {
            console.log("  Failed to decrypt response:", e);
            sub.close();
            resolve(null);
          }
        },
        oneose() {
          // End of stored events — keep listening for the live response
        },
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 5. Check Balance
// ---------------------------------------------------------------------------

/**
 * Sends a get_balance request to check the wallet balance.
 */
async function checkBalance(nwc: NWCParams): Promise<NWCResponse | null> {
  console.log("\n=== Checking Wallet Balance ===");

  const clientSk = hexToBytes(nwc.secret);
  const clientPk = getPublicKey(clientSk);

  const request: NWCRequest = {
    method: "get_balance",
    params: {},
  };

  const encryptedContent = encryptNWCPayload(request, clientSk, nwc.walletPubkey);

  const requestEvent = finalizeEvent(
    {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", nwc.walletPubkey]],
      content: encryptedContent,
    },
    clientSk
  );

  const pool = new SimplePool();

  try {
    await Promise.allSettled(pool.publish([nwc.relayUrl], requestEvent));
    console.log("  Published get_balance request");

    const response = await waitForResponse(pool, nwc, requestEvent.id, clientSk);

    if (response?.result) {
      const balance = response.result as unknown as BalanceResult;
      console.log(`  Balance: ${balance.balance / 1000} sats`);
    }

    return response;
  } finally {
    pool.close([nwc.relayUrl]);
  }
}

// ---------------------------------------------------------------------------
// 6. List Transactions
// ---------------------------------------------------------------------------

/**
 * Sends a list_transactions request to get recent wallet activity.
 */
async function listTransactions(
  nwc: NWCParams,
  limit: number = 10
): Promise<NWCResponse | null> {
  console.log("\n=== Listing Recent Transactions ===");

  const clientSk = hexToBytes(nwc.secret);

  const request: NWCRequest = {
    method: "list_transactions",
    params: {
      limit,
      unpaid: false,
    },
  };

  const encryptedContent = encryptNWCPayload(request, clientSk, nwc.walletPubkey);

  const requestEvent = finalizeEvent(
    {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", nwc.walletPubkey]],
      content: encryptedContent,
    },
    clientSk
  );

  const pool = new SimplePool();

  try {
    await Promise.allSettled(pool.publish([nwc.relayUrl], requestEvent));
    console.log("  Published list_transactions request");

    const response = await waitForResponse(pool, nwc, requestEvent.id, clientSk);

    if (response?.result) {
      const txns = (response.result as any).transactions as TransactionInfo[];
      if (txns && txns.length > 0) {
        console.log(`\n  --- Recent Transactions (${txns.length}) ---`);
        for (const tx of txns) {
          const date = new Date(tx.created_at * 1000).toISOString().split("T")[0];
          const direction = tx.type === "incoming" ? "IN " : "OUT";
          const sats = tx.amount / 1000;
          console.log(
            `  [${direction}] ${sats} sats on ${date}` +
              (tx.description ? ` — "${tx.description}"` : "")
          );
        }
      }
    }

    return response;
  } finally {
    pool.close([nwc.relayUrl]);
  }
}

// ---------------------------------------------------------------------------
// 7. Fetch Wallet Info Event (Kind 13194)
// ---------------------------------------------------------------------------

/**
 * Kind 13194 is the NWC info event, published by the wallet service.
 * It advertises which methods the wallet supports.
 *
 * The content is a space-separated list of supported methods, e.g.:
 *   "pay_invoice get_balance make_invoice lookup_invoice list_transactions"
 */
async function fetchWalletInfo(nwc: NWCParams): Promise<void> {
  console.log("\n=== Fetching Wallet Info (Kind 13194) ===");

  const pool = new SimplePool();

  try {
    const events = await pool.querySync([nwc.relayUrl], {
      kinds: [13194],
      authors: [nwc.walletPubkey],
      limit: 1,
    });

    if (events.length === 0) {
      console.log("  No wallet info event found");
      return;
    }

    const info = events[0];
    const supportedMethods = info.content.split(" ").filter(Boolean);

    console.log("  Wallet pubkey:", info.pubkey.slice(0, 16) + "...");
    console.log("  Supported methods:");
    for (const method of supportedMethods) {
      console.log(`    - ${method}`);
    }
  } finally {
    pool.close([nwc.relayUrl]);
  }
}

// ---------------------------------------------------------------------------
// Main — Demonstrate NWC flows
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Nostr Wallet Connect (NIP-47) Example");
  console.log("======================================\n");

  // --- Step 1: Parse a NWC connection URI ---
  // In production, this URI comes from your wallet provider (Alby, Mutiny, etc.)
  // Here we construct a demonstration URI with a fresh keypair.
  console.log("--- Step 1: Parse NWC URI ---\n");

  // Generate demo keys (in production, the wallet provides these)
  const walletSk = generateSecretKey();
  const walletPk = getPublicKey(walletSk);
  const clientSk = generateSecretKey();
  const clientSecret = bytesToHex(clientSk);

  const demoUri =
    `nostr+walletconnect://${walletPk}` +
    `?relay=wss://relay.getalby.com/v1` +
    `&secret=${clientSecret}` +
    `&lud16=demo@getalby.com`;

  console.log("Demo URI (truncated):", demoUri.slice(0, 80) + "...\n");

  const nwc = parseNWCUri(demoUri);

  // --- Step 2: Fetch wallet capabilities ---
  console.log("\n--- Step 2: Fetch Wallet Info ---");
  await fetchWalletInfo(nwc);

  // --- Step 3: Demonstrate request creation ---
  // Note: These will time out without a real wallet service,
  // but they show the correct event structure and encryption.
  console.log("\n--- Step 3: Demonstrate NWC Requests ---");
  console.log("\nThe following requests create correctly structured NWC events.");
  console.log("Without a real wallet service, they will time out.\n");

  // Demonstrate pay_invoice request structure
  const clientSkBytes = hexToBytes(nwc.secret);
  const exampleInvoice = "lnbc210n1pj...example...";

  const payRequest: NWCRequest = {
    method: "pay_invoice",
    params: { invoice: exampleInvoice },
  };

  const encryptedPay = encryptNWCPayload(payRequest, clientSkBytes, nwc.walletPubkey);
  const payEvent = finalizeEvent(
    {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", nwc.walletPubkey]],
      content: encryptedPay,
    },
    clientSkBytes
  );

  console.log("pay_invoice request event:");
  console.log("  Kind:", payEvent.kind);
  console.log("  ID:", payEvent.id);
  console.log("  Pubkey (client):", payEvent.pubkey.slice(0, 16) + "...");
  console.log("  Tagged wallet:", payEvent.tags[0][1].slice(0, 16) + "...");
  console.log("  Content (encrypted):", payEvent.content.slice(0, 40) + "...");

  // Demonstrate balance request structure
  const balanceRequest: NWCRequest = {
    method: "get_balance",
    params: {},
  };

  const encryptedBalance = encryptNWCPayload(balanceRequest, clientSkBytes, nwc.walletPubkey);
  const balanceEvent = finalizeEvent(
    {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", nwc.walletPubkey]],
      content: encryptedBalance,
    },
    clientSkBytes
  );

  console.log("\nget_balance request event:");
  console.log("  Kind:", balanceEvent.kind);
  console.log("  ID:", balanceEvent.id);

  // Demonstrate what a response looks like
  console.log("\n--- Example Response Structure ---");
  console.log("A wallet service would respond with kind 23195:");

  const exampleResponse: NWCResponse = {
    result_type: "pay_invoice",
    result: {
      preimage: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  };
  console.log("  Decrypted content:", JSON.stringify(exampleResponse, null, 2));

  const exampleErrorResponse: NWCResponse = {
    result_type: "pay_invoice",
    error: {
      code: "INSUFFICIENT_BALANCE",
      message: "Not enough funds to pay the invoice",
    },
  };
  console.log("\n  Error response:", JSON.stringify(exampleErrorResponse, null, 2));

  // --- Summary of all NWC methods ---
  console.log("\n--- NWC Method Reference ---");
  console.log("  pay_invoice       — Pay a bolt11 Lightning invoice");
  console.log("  pay_keysend       — Send a keysend payment (no invoice needed)");
  console.log("  make_invoice      — Create a new bolt11 invoice to receive");
  console.log("  lookup_invoice    — Check status of a specific invoice");
  console.log("  get_balance       — Get current wallet balance (millisats)");
  console.log("  get_info          — Get wallet node info");
  console.log("  list_transactions — List recent incoming/outgoing payments");

  console.log("\nDone.");
}

main().catch(console.error);
