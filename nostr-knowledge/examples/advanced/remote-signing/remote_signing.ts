/**
 * remote_signing.ts — NIP-46 Nostr Connect (remote signing / bunker protocol).
 *
 * NIP-46 lets a client application request signatures from a remote signer
 * (called a "bunker") without ever seeing the user's secret key. Communication
 * happens over NOSTR relays using NIP-04 encrypted kind-24133 events.
 *
 * This example implements both sides:
 *
 *   BUNKER (signer):
 *   1. Generate a bunker keypair and produce a bunker:// URI.
 *   2. Listen for connection requests (kind 24133).
 *   3. Decrypt incoming RPC requests (connect, sign_event, get_public_key).
 *   4. Prompt for approval and send encrypted responses.
 *
 *   CLIENT (application):
 *   1. Parse a bunker:// URI to get the bunker pubkey and relay.
 *   2. Send a "connect" request.
 *   3. Request signatures via "sign_event".
 *   4. Receive signed events back.
 *
 * Dependencies:
 *   npm install nostr-tools ws
 *   npm install -D typescript ts-node @types/node @types/ws
 *
 * Run (bunker mode):
 *   NIP46_MODE=bunker npx ts-node remote_signing.ts
 *
 * Run (client mode):
 *   NIP46_MODE=client NIP46_BUNKER_URI="bunker://<pubkey>?relay=wss://..." npx ts-node remote_signing.ts
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate,
  type Event as NostrEvent,
  type Filter,
} from "nostr-tools";
import { encrypt, decrypt } from "nostr-tools/nip04";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { Relay } from "nostr-tools/relay";
import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MODE = process.env.NIP46_MODE || "bunker";
const DEFAULT_RELAY = "wss://relay.damus.io";

/** Kind used for NIP-46 communication. */
const NIP46_KIND = 24133;

// ---------------------------------------------------------------------------
// NIP-46 RPC types
// ---------------------------------------------------------------------------

/**
 * NIP-46 uses a JSON-RPC-like protocol inside encrypted kind-24133 events.
 *
 * Request format:
 * {
 *   "id": "<random-id>",
 *   "method": "sign_event" | "connect" | "get_public_key" | ...,
 *   "params": [...]
 * }
 *
 * Response format:
 * {
 *   "id": "<matching-id>",
 *   "result": "...",
 *   "error": "..." (if failed)
 * }
 */
interface NIP46Request {
  id: string;
  method: string;
  params: string[];
}

interface NIP46Response {
  id: string;
  result?: string;
  error?: string;
}

/** Generate a random RPC request ID. */
function randomId(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// Bunker (remote signer)
// ---------------------------------------------------------------------------

/**
 * The bunker holds the user's secret key and signs events on behalf of
 * client applications. The user runs the bunker on a trusted device.
 */
async function runBunker(): Promise<void> {
  // The USER's key — the one being protected by the bunker
  const userSecretHex = process.env.NIP46_USER_KEY;
  let userSecret: Uint8Array;
  if (userSecretHex) {
    userSecret = hexToBytes(userSecretHex);
  } else {
    userSecret = generateSecretKey();
    console.log(
      `[bunker] Generated user secret key: ${bytesToHex(userSecret)}`
    );
  }
  const userPubkey = getPublicKey(userSecret);
  console.log(`[bunker] User pubkey: ${userPubkey}`);

  // The BUNKER's communication key — used for encrypting NIP-46 messages.
  // This is separate from the user's key for security isolation.
  const bunkerSecret = generateSecretKey();
  const bunkerPubkey = getPublicKey(bunkerSecret);

  // Choose relay
  const relayUrl = process.env.NIP46_RELAY || DEFAULT_RELAY;

  // ------ Generate bunker URI ------
  // Format: bunker://<user-pubkey>?relay=<relay-url>&secret=<optional-secret>
  const bunkerUri = `bunker://${userPubkey}?relay=${encodeURIComponent(relayUrl)}`;
  console.log(`\n[bunker] === BUNKER URI (share with client) ===`);
  console.log(`[bunker] ${bunkerUri}`);
  console.log(`[bunker] ==========================================\n`);

  // Connect to relay
  const relay = await Relay.connect(relayUrl);
  console.log(`[bunker] Connected to ${relayUrl}`);

  // Set of authorized client pubkeys (populated on successful "connect")
  const authorizedClients = new Set<string>();

  // Subscribe to kind-24133 events addressed to the user's pubkey
  const filter: Filter = {
    kinds: [NIP46_KIND],
    "#p": [userPubkey],
    since: Math.floor(Date.now() / 1000) - 10,
  };

  relay.subscribe([filter], {
    async onevent(event: NostrEvent) {
      console.log(
        `[bunker] Received NIP-46 event from ${event.pubkey.slice(0, 8)}...`
      );

      // Decrypt the request using the user's secret key
      let plaintext: string;
      try {
        plaintext = await decrypt(userSecret, event.pubkey, event.content);
      } catch (err) {
        console.error("[bunker] Failed to decrypt:", (err as Error).message);
        return;
      }

      let request: NIP46Request;
      try {
        request = JSON.parse(plaintext);
      } catch {
        console.error("[bunker] Invalid JSON in decrypted message");
        return;
      }

      console.log(`[bunker] Method: ${request.method}, ID: ${request.id}`);

      // Process the RPC request
      let response: NIP46Response;

      switch (request.method) {
        case "connect": {
          // ------ Handle connection request ------
          // params[0] = client's pubkey
          // params[1] = optional secret token
          const clientPubkey = request.params[0] || event.pubkey;
          authorizedClients.add(clientPubkey);
          console.log(
            `[bunker] Authorized client: ${clientPubkey.slice(0, 8)}...`
          );
          response = { id: request.id, result: "ack" };
          break;
        }

        case "get_public_key": {
          // ------ Return the user's public key ------
          if (!authorizedClients.has(event.pubkey)) {
            response = { id: request.id, error: "unauthorized" };
            break;
          }
          response = { id: request.id, result: userPubkey };
          break;
        }

        case "sign_event": {
          // ------ Sign an event on behalf of the user ------
          if (!authorizedClients.has(event.pubkey)) {
            response = { id: request.id, error: "unauthorized" };
            break;
          }

          // params[0] is the event template as JSON
          let eventTemplate: EventTemplate;
          try {
            eventTemplate = JSON.parse(request.params[0]);
          } catch {
            response = {
              id: request.id,
              error: "invalid event JSON",
            };
            break;
          }

          console.log(
            `[bunker] Signing event kind=${eventTemplate.kind} for ${event.pubkey.slice(0, 8)}...`
          );

          // In a real bunker you would prompt the user for approval here.
          // For this example we auto-approve all requests.
          console.log("[bunker] Auto-approving sign request (demo mode)");

          const signedEvent = finalizeEvent(eventTemplate, userSecret);
          response = {
            id: request.id,
            result: JSON.stringify(signedEvent),
          };
          break;
        }

        case "nip04_encrypt": {
          // ------ Encrypt a message using NIP-04 ------
          if (!authorizedClients.has(event.pubkey)) {
            response = { id: request.id, error: "unauthorized" };
            break;
          }
          const targetPubkey = request.params[0];
          const plaintextMsg = request.params[1];
          const ciphertext = await encrypt(
            userSecret,
            targetPubkey,
            plaintextMsg
          );
          response = { id: request.id, result: ciphertext };
          break;
        }

        case "nip04_decrypt": {
          // ------ Decrypt a message using NIP-04 ------
          if (!authorizedClients.has(event.pubkey)) {
            response = { id: request.id, error: "unauthorized" };
            break;
          }
          const senderPubkey = request.params[0];
          const cipherMsg = request.params[1];
          try {
            const decrypted = await decrypt(
              userSecret,
              senderPubkey,
              cipherMsg
            );
            response = { id: request.id, result: decrypted };
          } catch {
            response = { id: request.id, error: "decryption failed" };
          }
          break;
        }

        default:
          response = {
            id: request.id,
            error: `unsupported method: ${request.method}`,
          };
      }

      // Encrypt and send the response
      const responsePlaintext = JSON.stringify(response);
      const encryptedResponse = await encrypt(
        userSecret,
        event.pubkey,
        responsePlaintext
      );

      const responseEvent = finalizeEvent(
        {
          kind: NIP46_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", event.pubkey]],
          content: encryptedResponse,
        },
        userSecret
      );

      await relay.publish(responseEvent);
      console.log(`[bunker] Sent response for ${request.method}`);
    },

    oneose() {
      console.log("[bunker] Listening for NIP-46 requests...");
    },
  });
}

// ---------------------------------------------------------------------------
// Client (application requesting signatures)
// ---------------------------------------------------------------------------

/**
 * The client connects to a bunker and requests signatures without ever
 * seeing the user's secret key.
 */
async function runClient(): Promise<void> {
  const bunkerUri = process.env.NIP46_BUNKER_URI;
  if (!bunkerUri) {
    console.error(
      "[client] Set NIP46_BUNKER_URI env var (e.g. bunker://<pubkey>?relay=wss://...)"
    );
    process.exit(1);
  }

  // ------ Parse bunker URI ------
  // Format: bunker://<user-pubkey>?relay=<url>&secret=<token>
  const parsed = new URL(bunkerUri);
  const remotePubkey = parsed.hostname || parsed.pathname.replace("//", "");
  const relayUrl =
    parsed.searchParams.get("relay") || DEFAULT_RELAY;
  const secret = parsed.searchParams.get("secret") || undefined;

  console.log(`[client] Remote pubkey: ${remotePubkey}`);
  console.log(`[client] Relay: ${relayUrl}`);

  // Generate a client keypair for this session
  const clientSecret = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecret);
  console.log(`[client] Client session pubkey: ${clientPubkey}`);

  // Connect to relay
  const relay = await Relay.connect(relayUrl);
  console.log(`[client] Connected to ${relayUrl}`);

  // Helper: send an RPC request and wait for the response
  async function sendRequest(
    method: string,
    params: string[]
  ): Promise<NIP46Response> {
    const rpcId = randomId();
    const request: NIP46Request = { id: rpcId, method, params };

    // Encrypt the request
    const plaintext = JSON.stringify(request);
    const ciphertext = await encrypt(clientSecret, remotePubkey, plaintext);

    // Build and publish the event
    const event = finalizeEvent(
      {
        kind: NIP46_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", remotePubkey]],
        content: ciphertext,
      },
      clientSecret
    );

    // Subscribe for the response before publishing the request
    return new Promise<NIP46Response>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, 30_000);

      const filter: Filter = {
        kinds: [NIP46_KIND],
        "#p": [clientPubkey],
        authors: [remotePubkey],
        since: Math.floor(Date.now() / 1000) - 10,
      };

      relay.subscribe([filter], {
        async onevent(responseEvent: NostrEvent) {
          try {
            const decrypted = await decrypt(
              clientSecret,
              responseEvent.pubkey,
              responseEvent.content
            );
            const resp: NIP46Response = JSON.parse(decrypted);
            if (resp.id === rpcId) {
              clearTimeout(timeout);
              resolve(resp);
            }
          } catch {
            // Not our response or decryption failed; ignore
          }
        },
        oneose() {},
      });

      // Now publish the request
      relay.publish(event).catch(reject);
    });
  }

  // ------ Step 1: Connect to the bunker ------
  console.log("[client] Sending connect request...");
  const connectParams = [clientPubkey];
  if (secret) connectParams.push(secret);

  const connectResp = await sendRequest("connect", connectParams);
  if (connectResp.error) {
    console.error("[client] Connect failed:", connectResp.error);
    process.exit(1);
  }
  console.log("[client] Connected to bunker!");

  // ------ Step 2: Get the user's public key ------
  console.log("[client] Requesting public key...");
  const pkResp = await sendRequest("get_public_key", []);
  if (pkResp.error) {
    console.error("[client] get_public_key failed:", pkResp.error);
  } else {
    console.log(`[client] User's public key: ${pkResp.result}`);
  }

  // ------ Step 3: Request a signature ------
  console.log("[client] Requesting event signature...");
  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: "Hello from a NIP-46 remote signing client!",
  };

  const signResp = await sendRequest("sign_event", [
    JSON.stringify(eventTemplate),
  ]);

  if (signResp.error) {
    console.error("[client] sign_event failed:", signResp.error);
  } else {
    const signedEvent: NostrEvent = JSON.parse(signResp.result!);
    console.log(`[client] Signed event ID: ${signedEvent.id}`);
    console.log(`[client] Signature: ${signedEvent.sig.slice(0, 32)}...`);
    console.log(`[client] Content: "${signedEvent.content}"`);

    // Optionally publish the signed event
    // await relay.publish(signedEvent);
    // console.log("[client] Published signed event");
  }

  relay.close();
  console.log("[client] Done");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[nip46] Mode: ${MODE}`);

  if (MODE === "bunker") {
    await runBunker();
  } else if (MODE === "client") {
    await runClient();
  } else {
    console.error(
      `[nip46] Unknown mode: ${MODE}. Use "bunker" or "client".`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[nip46] Fatal error:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n[nip46] Shutting down...");
  process.exit(0);
});
