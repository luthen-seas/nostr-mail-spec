/**
 * NOSTR Verify Event Signature — TypeScript
 *
 * Takes a NOSTR event (as JSON), recomputes the event ID from the canonical
 * serialization, and verifies the Schnorr signature (BIP-340).
 *
 * Dependencies:
 *   npm install nostr-tools
 *
 * Run:
 *   npx ts-node verify_signature.ts
 *
 * References:
 *   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { verifyEvent, generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import type { Event, EventTemplate } from "nostr-tools/pure";

console.log("=== NOSTR Verify Event Signature ===\n");

// --- Create a sample event to verify ---
// In production, you'd receive this from a relay or another client.
const secretKey = generateSecretKey();
const eventTemplate: EventTemplate = {
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: "This is a signed NOSTR event for verification testing.",
};
const sampleEvent: Event = finalizeEvent(eventTemplate, secretKey);

console.log("Sample event to verify:");
console.log(JSON.stringify(sampleEvent, null, 2));
console.log();

// --- Step 1: Verify the event ---
// verifyEvent() performs three checks:
//   1. Recomputes the event ID from [0, pubkey, created_at, kind, tags, content]
//      and checks it matches event.id
//   2. Verifies the Schnorr signature (event.sig) against the event ID
//      using the public key (event.pubkey)
//   3. Validates basic structure (all required fields present)
const isValid: boolean = verifyEvent(sampleEvent);

console.log(`Verification result: ${isValid ? "VALID" : "INVALID"}`);
console.log();

// --- Step 2: Demonstrate what happens with a tampered event ---
console.log("--- Tampering Test ---");

// Create a copy and modify the content (but keep the original ID and signature).
const tamperedEvent: Event = { ...sampleEvent, content: "TAMPERED CONTENT" };
const isTamperedValid: boolean = verifyEvent(tamperedEvent);

console.log("Tampered event (modified content, original sig):");
console.log(`  Original content: "${sampleEvent.content}"`);
console.log(`  Tampered content: "${tamperedEvent.content}"`);
console.log(`  Verification result: ${isTamperedValid ? "VALID" : "INVALID"}`);
console.log();

// --- Step 3: Explain the verification steps ---
console.log("--- Verification Steps ---");
console.log("1. Serialize: [0, pubkey, created_at, kind, tags, content]");
console.log("2. Compute SHA-256 of the serialized JSON");
console.log("3. Compare computed hash with event.id");
console.log("4. Verify Schnorr signature (event.sig) over event.id using event.pubkey");
console.log("5. If ID matches AND signature is valid -> event is authentic");
