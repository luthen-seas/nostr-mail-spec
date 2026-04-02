/**
 * NOSTR Key Generation — TypeScript
 *
 * Generates a secp256k1 keypair for use with the NOSTR protocol.
 * The private key is used to sign events; the public key is your identity.
 *
 * Dependencies:
 *   npm install nostr-tools
 *
 * Run:
 *   npx ts-node generate_keys.ts
 *
 * References:
 *   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 *   - NIP-19: https://github.com/nostr-protocol/nips/blob/master/19.md
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode, nsecEncode } from "nostr-tools/nip19";

// Step 1: Generate a random 32-byte secret key.
// This uses crypto.getRandomValues under the hood.
const secretKey: Uint8Array = generateSecretKey();

// Step 2: Derive the public key from the secret key.
// This performs elliptic curve multiplication on secp256k1.
// The result is the x-coordinate of the public key point (32 bytes, hex-encoded).
const publicKey: string = getPublicKey(secretKey);

// Step 3: Encode to bech32 format (NIP-19).
// npub = bech32-encoded public key (human-readable, starts with "npub1")
// nsec = bech32-encoded secret key (human-readable, starts with "nsec1")
const npub: string = npubEncode(publicKey);
const nsec: string = nsecEncode(secretKey);

// Step 4: Display the results.
console.log("=== NOSTR Key Generation ===\n");
console.log("Secret key (hex):", Buffer.from(secretKey).toString("hex"));
console.log("Public key (hex):", publicKey);
console.log("");
console.log("npub (bech32):", npub);
console.log("nsec (bech32):", nsec);
console.log("");
console.log("WARNING: Never share your secret key (nsec) with anyone.");
console.log("Your public key (npub) is your identity — share it freely.");
