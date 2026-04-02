/**
 * nwc-wallet/nwc_app.ts — A NWC (Nostr Wallet Connect) Enabled Application
 *
 * NWC (NIP-47) lets apps send Lightning payments through a wallet service
 * using NOSTR as the transport layer. The wallet service runs a relay,
 * and the app communicates with it via encrypted NOSTR events.
 *
 * This file implements a complete NWC client that can:
 * - Parse nostr+walletconnect:// connection strings
 * - Connect to the wallet service's relay
 * - Send encrypted commands (pay_invoice, get_balance, list_transactions)
 * - Handle responses with proper error handling
 * - Interactive CLI for wallet operations
 *
 * Run: NOSTR_NWC_URI="nostr+walletconnect://..." npx tsx nwc_app.ts
 *
 * Dependencies: nostr-tools (v2+)
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type Event,
  type EventTemplate,
  type Filter,
} from "nostr-tools";
import { SimplePool } from "nostr-tools/pool";
import { nip19 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";
import * as readline from "readline";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Parsed NWC connection string components.
 *
 * The connection string format is:
 * nostr+walletconnect://<wallet-pubkey>?relay=<relay-url>&secret=<app-secret-hex>
 *
 * The wallet service generates this string and gives it to the user,
 * who pastes it into the app. The secret is the app's private key
 * for this specific wallet connection.
 */
interface NWCConnection {
  walletPubkey: string; // The wallet service's pubkey
  relay: string; // Relay URL where the wallet listens
  secret: Uint8Array; // App's secret key for this connection
  appPubkey: string; // Derived from secret
}

/**
 * NWC request payload (encrypted in event content).
 */
interface NWCRequest {
  method: string;
  params: Record<string, unknown>;
}

/**
 * NWC response payload (encrypted in event content).
 */
interface NWCResponse {
  result_type: string;
  error?: {
    code: string;
    message: string;
  };
  result?: Record<string, unknown>;
}

/**
 * Balance information from get_balance response.
 */
interface BalanceResult {
  balance: number; // In millisatoshis
}

/**
 * Transaction from list_transactions response.
 */
interface Transaction {
  type: string; // "incoming" or "outgoing"
  invoice: string;
  description: string;
  amount: number; // millisatoshis
  fees_paid: number;
  created_at: number;
  settled_at?: number;
  payment_hash: string;
}

/**
 * Payment result from pay_invoice response.
 */
interface PaymentResult {
  preimage: string;
  fees_paid: number; // millisatoshis
}

// ─── NWC Connection String Parser ───────────────────────────────────────────

/**
 * Parse a nostr+walletconnect:// URI into its components.
 *
 * The URI encodes everything the app needs to communicate with the wallet:
 * - The wallet's pubkey (used to encrypt messages TO the wallet)
 * - The relay where the wallet listens
 * - A secret key for this app connection (used to sign and decrypt)
 *
 * Security note: This secret should be treated like a password. Anyone
 * with the connection string can spend from the wallet (within the
 * permissions the user granted when creating the connection).
 */
function parseConnectionString(uri: string): NWCConnection {
  if (!uri.startsWith("nostr+walletconnect://")) {
    throw new Error(
      "Invalid NWC URI: must start with nostr+walletconnect://"
    );
  }

  // Parse the URI: protocol://pubkey?params
  const withoutProtocol = uri.replace("nostr+walletconnect://", "");
  const [pubkeyPart, queryString] = withoutProtocol.split("?");

  if (!pubkeyPart || !queryString) {
    throw new Error("Invalid NWC URI: missing pubkey or query parameters");
  }

  const params = new URLSearchParams(queryString);
  const relay = params.get("relay");
  const secretHex = params.get("secret");

  if (!relay) {
    throw new Error("Invalid NWC URI: missing relay parameter");
  }
  if (!secretHex) {
    throw new Error("Invalid NWC URI: missing secret parameter");
  }

  // Convert hex secret to Uint8Array
  const secret = hexToBytes(secretHex);
  const appPubkey = getPublicKey(secret);

  console.log("[nwc] Parsed connection string:");
  console.log(`  Wallet: ${pubkeyPart.slice(0, 12)}...`);
  console.log(`  Relay:  ${relay}`);
  console.log(`  App:    ${appPubkey.slice(0, 12)}...`);

  return {
    walletPubkey: pubkeyPart,
    relay,
    secret,
    appPubkey,
  };
}

// ─── Hex Utilities ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ─── NIP-44 Encryption ─────────────────────────────────────────────────────

/**
 * NWC uses NIP-44 (versioned encryption) for request/response payloads.
 *
 * NIP-44 replaced NIP-04 for new protocols because NIP-04 has known
 * weaknesses (no padding, CBC mode issues). NIP-44 uses:
 * - XChaCha20-Poly1305 for authenticated encryption
 * - HKDF for key derivation from the ECDH shared secret
 * - Random padding to hide message lengths
 *
 * The shared secret is derived from the app's secret key and the
 * wallet's public key (or vice versa — ECDH is symmetric).
 */
function encryptNip44(
  plaintext: string,
  senderSecret: Uint8Array,
  recipientPubkey: string
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(
    senderSecret,
    recipientPubkey
  );
  return nip44.v2.encrypt(plaintext, conversationKey);
}

function decryptNip44(
  ciphertext: string,
  receiverSecret: Uint8Array,
  senderPubkey: string
): string {
  const conversationKey = nip44.v2.utils.getConversationKey(
    receiverSecret,
    senderPubkey
  );
  return nip44.v2.decrypt(ciphertext, conversationKey);
}

// ─── NWC Client ─────────────────────────────────────────────────────────────

class NWCClient {
  private conn: NWCConnection;
  private pool: SimplePool;
  private pendingRequests: Map<
    string,
    {
      resolve: (response: NWCResponse) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  constructor(conn: NWCConnection) {
    this.conn = conn;
    this.pool = new SimplePool();
  }

  /**
   * Start listening for responses from the wallet service.
   *
   * The wallet sends kind 23195 (NWC response) events encrypted to our
   * app pubkey. We maintain a persistent subscription to catch responses
   * to our requests.
   */
  start(): void {
    console.log("[nwc] Connecting to wallet relay...");

    const filter: Filter = {
      kinds: [23195], // NWC response kind
      authors: [this.conn.walletPubkey],
      "#p": [this.conn.appPubkey],
      // Only listen for new events from now on
      since: Math.floor(Date.now() / 1000) - 10,
    };

    this.pool.subscribeMany(
      [this.conn.relay],
      [filter],
      {
        onevent: (event: Event) => {
          this.handleResponse(event);
        },
        oneose: () => {
          console.log("[nwc] Connected and listening for wallet responses");
        },
        onclose: (reasons: string[]) => {
          console.log("[nwc] Subscription closed:", reasons);
        },
      }
    );
  }

  /**
   * Send a NWC request to the wallet service.
   *
   * NWC requests are kind 23194 events with:
   * - Encrypted content (NIP-44) containing the JSON request
   * - "p" tag pointing to the wallet's pubkey
   * - Signed by the app's secret key
   *
   * Returns a Promise that resolves when the wallet responds.
   */
  async sendRequest(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = 30000
  ): Promise<NWCResponse> {
    const request: NWCRequest = { method, params };
    const plaintext = JSON.stringify(request);

    // Encrypt the request payload with NIP-44
    const encrypted = encryptNip44(
      plaintext,
      this.conn.secret,
      this.conn.walletPubkey
    );

    // Build the NWC request event (kind 23194)
    const template: EventTemplate = {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", this.conn.walletPubkey]],
      content: encrypted,
    };

    const signed = finalizeEvent(template, this.conn.secret);

    console.log(`[nwc] Sending ${method} request (${signed.id.slice(0, 8)}...)`);

    // Set up a promise that will be resolved when we get a response
    // matching this request (via the "e" tag in the response)
    const responsePromise = new Promise<NWCResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(signed.id);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(signed.id, { resolve, reject, timeout });
    });

    // Publish the request to the wallet's relay
    try {
      await Promise.any(this.pool.publish([this.conn.relay], signed));
    } catch (err) {
      this.pendingRequests.delete(signed.id);
      throw new Error(`Failed to publish NWC request: ${err}`);
    }

    return responsePromise;
  }

  /**
   * Handle an incoming NWC response event from the wallet.
   *
   * The response is a kind 23195 event with:
   * - Encrypted content containing the JSON response
   * - "e" tag referencing the request event ID
   * - "p" tag pointing to our app pubkey
   */
  private handleResponse(event: Event): void {
    try {
      // Decrypt the response
      const plaintext = decryptNip44(
        event.content,
        this.conn.secret,
        this.conn.walletPubkey
      );

      const response = JSON.parse(plaintext) as NWCResponse;

      // Find the request this response is for via the "e" tag
      const requestId = event.tags.find((t) => t[0] === "e")?.[1];

      if (requestId && this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        pending.resolve(response);
      } else {
        // Unsolicited response (maybe from a previous session)
        console.log(`[nwc] Received unsolicited response: ${response.result_type}`);
      }
    } catch (err) {
      console.error("[nwc] Failed to process response:", err);
    }
  }

  // ─── High-Level Wallet Operations ───────────────────────────────────

  /**
   * Get the wallet balance in satoshis.
   */
  async getBalance(): Promise<void> {
    const response = await this.sendRequest("get_balance");

    if (response.error) {
      console.error(`[wallet] Error: ${response.error.code} — ${response.error.message}`);
      return;
    }

    const result = response.result as unknown as BalanceResult;
    const sats = Math.floor(result.balance / 1000);
    console.log(`\n  Balance: ${sats.toLocaleString()} sats (${result.balance} msats)\n`);
  }

  /**
   * Pay a Lightning invoice (BOLT-11).
   *
   * This is the core NWC use case: an app sends a payment request,
   * the wallet service executes it, and returns the preimage as proof.
   */
  async payInvoice(invoice: string, amount?: number): Promise<void> {
    const params: Record<string, unknown> = { invoice };

    // Optional amount override (for zero-amount invoices)
    if (amount !== undefined) {
      params.amount = amount * 1000; // Convert sats to msats
    }

    console.log(`[wallet] Paying invoice...`);
    const response = await this.sendRequest("pay_invoice");

    if (response.error) {
      console.error(`[wallet] Payment failed: ${response.error.code} — ${response.error.message}`);

      // Common error codes:
      // - QUOTA_EXCEEDED: spending limit reached
      // - INSUFFICIENT_BALANCE: not enough funds
      // - PAYMENT_FAILED: routing failure
      // - NOT_FOUND: invalid invoice
      return;
    }

    const result = response.result as unknown as PaymentResult;
    const feesSats = Math.floor(result.fees_paid / 1000);
    console.log(`\n  Payment successful!`);
    console.log(`  Preimage: ${result.preimage}`);
    console.log(`  Fees paid: ${feesSats} sats\n`);
  }

  /**
   * List recent transactions from the wallet.
   */
  async listTransactions(
    limit: number = 10,
    type?: "incoming" | "outgoing"
  ): Promise<void> {
    const params: Record<string, unknown> = { limit };
    if (type) params.type = type;

    const response = await this.sendRequest("list_transactions");

    if (response.error) {
      console.error(`[wallet] Error: ${response.error.code} — ${response.error.message}`);
      return;
    }

    const transactions = (response.result as any)?.transactions as Transaction[] | undefined;

    if (!transactions || transactions.length === 0) {
      console.log("\n  No transactions found.\n");
      return;
    }

    console.log(`\n  Recent Transactions (${transactions.length}):`);
    console.log("  " + "-".repeat(60));

    for (const tx of transactions) {
      const direction = tx.type === "incoming" ? " IN" : "OUT";
      const sats = Math.floor(tx.amount / 1000);
      const date = new Date(tx.created_at * 1000).toLocaleString();
      const desc = tx.description || "(no description)";

      console.log(`  ${direction} | ${sats.toString().padStart(10)} sats | ${date}`);
      console.log(`       ${desc}`);
    }
    console.log("  " + "-".repeat(60) + "\n");
  }

  /**
   * Clean up: close pool connections and clear pending requests.
   */
  shutdown(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Client shutting down"));
    }
    this.pendingRequests.clear();
    this.pool.close([this.conn.relay]);
    console.log("[nwc] Disconnected from wallet relay");
  }
}

// ─── Interactive CLI ────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
NWC Wallet Commands:
  balance                    Check wallet balance
  pay <bolt11-invoice>       Pay a Lightning invoice
  transactions [limit]       List recent transactions (default: 10)
  incoming [limit]           List incoming transactions only
  outgoing [limit]           List outgoing transactions only
  info                       Show connection info
  help                       Show this help
  quit                       Exit
  `);
}

async function runCLI(client: NWCClient, conn: NWCConnection): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const shutdown = (): void => {
    console.log("\n[shutdown] Closing wallet connection...");
    client.shutdown();
    rl.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const prompt = (): void => {
    rl.question("nwc> ", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      try {
        switch (cmd) {
          case "balance":
            await client.getBalance();
            break;

          case "pay": {
            const invoice = parts[1];
            if (!invoice) {
              console.log("Usage: pay <bolt11-invoice>");
              break;
            }
            // Basic sanity check — BOLT-11 invoices start with "lnbc" or "lntb" (testnet)
            if (!invoice.startsWith("ln")) {
              console.log("Warning: this doesn't look like a Lightning invoice (expected ln...)");
            }
            await client.payInvoice(invoice);
            break;
          }

          case "transactions":
            await client.listTransactions(parseInt(parts[1]) || 10);
            break;

          case "incoming":
            await client.listTransactions(parseInt(parts[1]) || 10, "incoming");
            break;

          case "outgoing":
            await client.listTransactions(parseInt(parts[1]) || 10, "outgoing");
            break;

          case "info":
            console.log(`\n  Wallet pubkey: ${conn.walletPubkey.slice(0, 16)}...`);
            console.log(`  App pubkey:    ${conn.appPubkey.slice(0, 16)}...`);
            console.log(`  Relay:         ${conn.relay}\n`);
            break;

          case "help":
            printHelp();
            break;

          case "quit":
          case "exit":
            shutdown();
            return;

          default:
            console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
        }
      } catch (err) {
        console.error("[error]", err instanceof Error ? err.message : err);
      }

      prompt();
    });
  };

  prompt();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== NWC Wallet Connect Client ===\n");

  // Get the NWC connection string from the environment.
  // In a real app, this would come from user input (e.g., QR code scan
  // or paste into a settings dialog).
  const nwcUri = process.env.NOSTR_NWC_URI;

  if (!nwcUri) {
    console.log("No NWC connection string found.\n");
    console.log("To connect to a wallet, set the NOSTR_NWC_URI environment variable:");
    console.log('  NOSTR_NWC_URI="nostr+walletconnect://..." npx tsx nwc_app.ts\n');
    console.log("You can get a connection string from NWC-compatible wallets:");
    console.log("  - Alby (getalby.com)");
    console.log("  - Mutiny Wallet");
    console.log("  - LNbits with NWC plugin");
    console.log("  - Umbrel with the NWC app\n");
    process.exit(1);
  }

  // Parse the connection string
  const conn = parseConnectionString(nwcUri);

  // Create and start the NWC client
  const client = new NWCClient(conn);
  client.start();

  // Brief pause to let the WebSocket connection establish
  // (In production, you'd wait for the oneose callback)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\nType 'help' for available commands.\n");

  // Run the interactive CLI
  await runCLI(client, conn);
}

// Entry point
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
