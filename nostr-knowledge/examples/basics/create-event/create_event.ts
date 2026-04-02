/**
 * NOSTR Create & Sign Event — TypeScript
 *
 * Creates a kind 1 text note event, computes the event ID (SHA-256 of the
 * canonical serialization), and signs it with a Schnorr signature (BIP-340).
 *
 * Dependencies:
 *   npm install nostr-tools
 *
 * Run:
 *   npx ts-node create_event.ts
 *
 * References:
 *   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import type { EventTemplate, VerifiedEvent } from "nostr-tools/pure";

// Step 1: Generate keys (in production, load from secure storage).
const secretKey: Uint8Array = generateSecretKey();
const publicKey: string = getPublicKey(secretKey);

console.log("=== NOSTR Create & Sign Event ===\n");
console.log("Public key:", publicKey);

// Step 2: Build the event template.
// A kind 1 event is a "text note" — the most basic NOSTR event.
// The event template includes everything except the ID and signature.
const eventTemplate: EventTemplate = {
  kind: 1,                             // Kind 1 = text note (NIP-01)
  created_at: Math.floor(Date.now() / 1000),  // Unix timestamp in seconds
  tags: [],                            // No tags for a simple note
  content: "Hello, NOSTR! This is my first note.",
};

// Step 3: Finalize the event.
// finalizeEvent does three things:
//   a) Sets the pubkey field from the secret key
//   b) Computes the event ID = SHA-256(canonical JSON serialization)
//      Serialization: [0, pubkey, created_at, kind, tags, content]
//   c) Signs the ID with a Schnorr signature (BIP-340) using the secret key
const signedEvent: VerifiedEvent = finalizeEvent(eventTemplate, secretKey);

// Step 4: Display the signed event.
console.log("\nSigned event:\n");
console.log(JSON.stringify(signedEvent, null, 2));

// Step 5: Explain the fields.
console.log("\n--- Field Breakdown ---");
console.log(`id:         ${signedEvent.id}         (SHA-256 of serialized event)`);
console.log(`pubkey:     ${signedEvent.pubkey}     (author's public key)`);
console.log(`created_at: ${signedEvent.created_at}                  (unix timestamp)`);
console.log(`kind:       ${signedEvent.kind}                           (1 = text note)`);
console.log(`tags:       ${JSON.stringify(signedEvent.tags)}                          (empty for simple note)`);
console.log(`content:    "${signedEvent.content}"`);
console.log(`sig:        ${signedEvent.sig}  (Schnorr signature)`);
