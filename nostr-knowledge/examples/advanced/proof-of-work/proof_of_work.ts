/**
 * proof_of_work.ts — NIP-13 Proof-of-Work mining for NOSTR events.
 *
 * NIP-13 defines a proof-of-work scheme for NOSTR events. The miner finds
 * a nonce value such that the event's ID (a SHA-256 hash) has a specified
 * number of leading zero bits. This is similar to Bitcoin's mining, but
 * applied to individual NOSTR events.
 *
 * Features:
 *   1. Mine a note with a target difficulty.
 *   2. Verify PoW on received events.
 *   3. Benchmark mining speed.
 *
 * Dependencies:
 *   npm install nostr-tools
 *   npm install -D typescript ts-node @types/node
 *
 * Run:
 *   npx ts-node proof_of_work.ts
 */

import {
  generateSecretKey,
  getPublicKey,
  getEventHash,
  finalizeEvent,
  type EventTemplate,
  type Event as NostrEvent,
  type UnsignedEvent,
} from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";

// ---------------------------------------------------------------------------
// NIP-13 core functions
// ---------------------------------------------------------------------------

/**
 * Count the number of leading zero bits in a hex string.
 *
 * Each hex character represents 4 bits. For example:
 *   "0" = 0000 -> 4 leading zeros
 *   "1" = 0001 -> 3 leading zeros
 *   "7" = 0111 -> 1 leading zero
 *   "f" = 1111 -> 0 leading zeros
 *
 * We count full zero hex chars (4 bits each), then the remaining bits
 * of the first non-zero character.
 */
function countLeadingZeroBits(hex: string): number {
  let count = 0;

  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16);

    if (nibble === 0) {
      // This hex char is 0000 — 4 zero bits
      count += 4;
    } else {
      // Count leading zero bits in this nibble (0-3)
      // nibble is 1-15; we need the position of the highest set bit
      // 1 (0001) -> 3 leading zeros
      // 2 (0010) -> 2 leading zeros
      // 4 (0100) -> 1 leading zero
      // 8 (1000) -> 0 leading zeros
      count += Math.clz32(nibble) - 28; // clz32 counts for 32-bit int
      break;
    }
  }

  return count;
}

/**
 * Verify that a NOSTR event has the claimed proof-of-work difficulty.
 *
 * Per NIP-13, the event must have a "nonce" tag:
 *   ["nonce", "<nonce-value>", "<target-difficulty>"]
 *
 * Verification checks:
 *   1. The nonce tag exists with a target difficulty.
 *   2. The event ID has at least that many leading zero bits.
 */
function verifyPow(event: NostrEvent): {
  valid: boolean;
  claimedDifficulty: number;
  actualDifficulty: number;
} {
  // Find the nonce tag
  const nonceTag = event.tags.find((t) => t[0] === "nonce");

  if (!nonceTag || nonceTag.length < 3) {
    return { valid: false, claimedDifficulty: 0, actualDifficulty: 0 };
  }

  const claimedDifficulty = parseInt(nonceTag[2], 10);
  const actualDifficulty = countLeadingZeroBits(event.id);

  return {
    valid: actualDifficulty >= claimedDifficulty,
    claimedDifficulty,
    actualDifficulty,
  };
}

/**
 * Mine a NOSTR event to achieve a target number of leading zero bits
 * in the event ID.
 *
 * Algorithm:
 *   1. Start with the event template including a ["nonce", "0", "<target>"] tag.
 *   2. Increment the nonce value.
 *   3. Recompute the event ID (SHA-256 of the serialized event).
 *   4. Check if the ID has enough leading zero bits.
 *   5. Repeat until the target is met.
 *
 * The nonce tag format per NIP-13:
 *   ["nonce", "<counter>", "<target-difficulty>"]
 *
 * @param template - The event template (kind, content, tags, created_at)
 * @param secretKey - The secret key to sign with
 * @param targetDifficulty - Number of leading zero bits required
 * @param maxAttempts - Maximum mining attempts before giving up (0 = unlimited)
 * @returns The mined and signed event, or null if maxAttempts exceeded
 */
function mineEvent(
  template: EventTemplate,
  secretKey: Uint8Array,
  targetDifficulty: number,
  maxAttempts: number = 0
): { event: NostrEvent; attempts: number } | null {
  const pubkey = getPublicKey(secretKey);

  // Ensure the template has a nonce tag; remove any existing one
  const baseTags = template.tags.filter((t) => t[0] !== "nonce");

  let attempts = 0;
  const startTime = Date.now();

  // We also vary created_at slightly to expand the search space
  const baseCreatedAt = template.created_at;

  for (let nonce = 0; ; nonce++) {
    attempts++;

    if (maxAttempts > 0 && attempts > maxAttempts) {
      return null; // Gave up
    }

    // Build the tags with the current nonce
    const tags = [
      ...baseTags,
      ["nonce", nonce.toString(), targetDifficulty.toString()],
    ];

    // Build the unsigned event to compute its ID
    const unsignedEvent: UnsignedEvent = {
      kind: template.kind,
      created_at: baseCreatedAt,
      tags,
      content: template.content,
      pubkey,
    };

    // Compute the event ID (SHA-256 of serialized event)
    const id = getEventHash(unsignedEvent);

    // Check difficulty
    const bits = countLeadingZeroBits(id);

    if (bits >= targetDifficulty) {
      const elapsed = Date.now() - startTime;
      console.log(
        `[pow] Found valid nonce after ${attempts} attempts (${elapsed}ms)`
      );
      console.log(`[pow] Event ID: ${id}`);
      console.log(`[pow] Leading zero bits: ${bits} (target: ${targetDifficulty})`);

      // Finalize (sign) the event with the winning nonce
      const finalTemplate: EventTemplate = {
        kind: template.kind,
        created_at: baseCreatedAt,
        tags,
        content: template.content,
      };

      const signedEvent = finalizeEvent(finalTemplate, secretKey);
      return { event: signedEvent, attempts };
    }

    // Progress logging every 100,000 attempts
    if (attempts % 100_000 === 0) {
      const elapsed = Date.now() - startTime;
      const rate = Math.round(attempts / (elapsed / 1000));
      console.log(
        `[pow] ${attempts} attempts, ${rate} hashes/sec, best so far: ${bits} bits`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

/**
 * Benchmark the mining speed by mining events at various difficulties.
 */
function benchmark(secretKey: Uint8Array): void {
  console.log("\n=== Mining Benchmark ===\n");

  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: "Benchmark test note for proof-of-work mining.",
  };

  // Test difficulties from 8 to 24 bits
  const difficulties = [8, 12, 16, 20];

  for (const difficulty of difficulties) {
    console.log(`--- Difficulty: ${difficulty} bits ---`);
    const start = Date.now();

    const result = mineEvent(template, secretKey, difficulty, 10_000_000);

    if (result) {
      const elapsed = Date.now() - start;
      const rate = Math.round(result.attempts / (elapsed / 1000));
      console.log(
        `  Attempts: ${result.attempts.toLocaleString()}, ` +
          `Time: ${elapsed}ms, ` +
          `Rate: ${rate.toLocaleString()} hashes/sec`
      );
      console.log(`  Event ID: ${result.event.id}`);

      // Verify our own mined event
      const verification = verifyPow(result.event);
      console.log(
        `  Verification: ${verification.valid ? "PASS" : "FAIL"} ` +
          `(actual: ${verification.actualDifficulty} bits)\n`
      );
    } else {
      console.log("  Exceeded max attempts — skipping\n");
    }
  }
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  console.log(`Public key: ${pubkey}\n`);

  // ------ 1. Mine a note with target difficulty ------
  console.log("=== Mining a Note ===\n");

  const TARGET_DIFFICULTY = 16; // 16 leading zero bits (approx 65,536 attempts on average)

  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content:
      "This note was mined with proof-of-work! The event ID has leading zeros.",
  };

  console.log(`Mining with target difficulty: ${TARGET_DIFFICULTY} bits`);
  console.log("(This means the event ID must start with enough hex zeros)\n");

  const result = mineEvent(template, secretKey, TARGET_DIFFICULTY);

  if (result) {
    console.log(`\nMined event:`);
    console.log(`  ID:      ${result.event.id}`);
    console.log(`  Kind:    ${result.event.kind}`);
    console.log(`  Content: "${result.event.content}"`);

    // Show the nonce tag
    const nonceTag = result.event.tags.find((t) => t[0] === "nonce");
    if (nonceTag) {
      console.log(
        `  Nonce:   ${nonceTag[1]} (target: ${nonceTag[2]} bits)`
      );
    }

    // ------ 2. Verify PoW on the mined event ------
    console.log("\n=== Verifying PoW ===\n");

    const pow = verifyPow(result.event);
    console.log(`Claimed difficulty: ${pow.claimedDifficulty} bits`);
    console.log(`Actual difficulty:  ${pow.actualDifficulty} bits`);
    console.log(`Valid:              ${pow.valid ? "YES" : "NO"}`);

    // Demonstrate verification failure with a tampered event
    console.log("\n--- Verifying a non-PoW event ---");
    const normalEvent = finalizeEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: "This is a regular note without PoW",
      },
      secretKey
    );

    const normalPow = verifyPow(normalEvent);
    console.log(
      `Normal event (no nonce tag): valid=${normalPow.valid}, ` +
        `actual bits=${normalPow.actualDifficulty}`
    );
  }

  // ------ 3. Benchmark mining speed ------
  benchmark(secretKey);

  // ------ Explanation of difficulty ------
  console.log("\n=== Difficulty Reference ===\n");
  console.log("Leading zero bits | Expected attempts | Hex prefix");
  console.log("------------------+-------------------+----------");
  for (const bits of [4, 8, 12, 16, 20, 24, 28, 32]) {
    const expected = Math.pow(2, bits);
    const hexZeros = Math.floor(bits / 4);
    const prefix = "0".repeat(hexZeros) + "x".repeat(4);
    console.log(
      `       ${bits.toString().padStart(2)}         | ` +
        `${expected.toLocaleString().padStart(17)} | ` +
        `${prefix.slice(0, 8)}`
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
