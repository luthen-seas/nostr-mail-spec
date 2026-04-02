/**
 * gift_wrap.ts
 *
 * Lower-level NIP-59 gift wrapping — the privacy layer beneath NIP-17.
 *
 * NIP-59 defines two event kinds:
 *   - Seal  (kind 13): An encrypted, signed event containing a "rumor"
 *   - Gift Wrap (kind 1059): An encrypted event signed by a random key,
 *     containing a seal. The random key hides the sender's identity.
 *
 * This file demonstrates:
 *   1. Creating a rumor (unsigned event of any kind)
 *   2. Creating a seal (kind 13, NIP-44 encrypted)
 *   3. Creating a gift wrap (kind 1059, random keypair, NIP-44 encrypted)
 *   4. Unwrapping received gift wraps
 *
 * NIP-59 is a general-purpose mechanism — it can wrap ANY event kind,
 * not just DMs. NIP-17 is a specific application of NIP-59 for DMs.
 *
 * Install:
 *   npm install nostr-tools @noble/hashes ws
 *
 * Run:
 *   npx tsx gift_wrap.ts
 */

import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex } from '@noble/hashes/utils'
import type { Event, EventTemplate, UnsignedEvent } from 'nostr-tools/pure'

// ============================================================================
// Utility: Randomize a timestamp within +/- 2 days
// ============================================================================

function randomizeTimestamp(baseTimestamp: number): number {
  const twoDays = 2 * 24 * 60 * 60
  return baseTimestamp - Math.floor(Math.random() * twoDays)
}

// ============================================================================
// Setup
// ============================================================================

const senderSk = generateSecretKey()
const senderPk = getPublicKey(senderSk)

const recipientSk = generateSecretKey()
const recipientPk = getPublicKey(recipientSk)

console.log('==========================================================')
console.log('  NIP-59 Gift Wrapping — Step by Step')
console.log('==========================================================')
console.log()
console.log('Sender:   ', nip19.npubEncode(senderPk))
console.log('Recipient:', nip19.npubEncode(recipientPk))
console.log()

// ============================================================================
// STEP 1: Create a Rumor (Unsigned Event)
// ============================================================================
//
// A "rumor" is any NOSTR event that is intentionally left unsigned.
// It can be any kind — here we use kind 1 (text note) to demonstrate
// that NIP-59 works with more than just DMs.

console.log('--- STEP 1: Create a Rumor ---')

const now = Math.floor(Date.now() / 1000)

const rumor: UnsignedEvent = {
  kind: 1,  // Could be any kind — kind 1 for a text note, kind 14 for a DM, etc.
  created_at: now,
  tags: [
    ['p', recipientPk],
    ['t', 'secret'],
  ],
  content: 'This is a secret text note, wrapped in NIP-59 gift wrap.',
  pubkey: senderPk,
}

console.log('Rumor (unsigned event):')
console.log(JSON.stringify(rumor, null, 2))
console.log()
console.log('Notice: No "id" field, no "sig" field.')
console.log('The rumor is never published directly.')
console.log()

// ============================================================================
// STEP 2: Create a Seal (Kind 13)
// ============================================================================
//
// The seal encrypts the rumor using NIP-44 with the conversation key
// between sender and recipient. It is signed by the sender.
//
// Properties:
//   - kind: 13
//   - content: NIP-44 encrypted JSON of the rumor
//   - pubkey: sender's real pubkey
//   - created_at: randomized
//   - tags: [] (always empty)

console.log('--- STEP 2: Create the Seal (kind 13) ---')

// Derive NIP-44 conversation key
const sealConversationKey = nip44.v2.utils.getConversationKey(senderSk, recipientPk)

// Encrypt the rumor
const encryptedRumor = nip44.v2.encrypt(
  JSON.stringify(rumor),
  sealConversationKey,
)

// Build and sign the seal
const sealTemplate: EventTemplate = {
  kind: 13,
  created_at: randomizeTimestamp(now),
  tags: [],  // Always empty — no metadata leaks
  content: encryptedRumor,
}

const seal: Event = finalizeEvent(sealTemplate, senderSk)

console.log('Seal (kind 13):')
console.log({
  id: seal.id.substring(0, 20) + '...',
  kind: seal.kind,
  pubkey: seal.pubkey.substring(0, 20) + '... (sender)',
  created_at: `${seal.created_at} (randomized)`,
  tags: '[] (empty)',
  content: seal.content.substring(0, 40) + '... (NIP-44 ciphertext)',
  sig: seal.sig.substring(0, 20) + '...',
})
console.log()
console.log('The seal is signed by the sender, establishing authorship.')
console.log('But the seal is never published — it lives inside the gift wrap.')
console.log()

// Verify the seal's signature
console.log('Seal signature valid:', verifyEvent(seal))
console.log()

// ============================================================================
// STEP 3: Create the Gift Wrap (Kind 1059)
// ============================================================================
//
// The gift wrap encrypts the seal using a RANDOM ephemeral keypair.
// This hides the sender's identity from relays and observers.
//
// Properties:
//   - kind: 1059
//   - content: NIP-44 encrypted JSON of the seal (ephemeral -> recipient)
//   - pubkey: random ephemeral pubkey
//   - created_at: randomized
//   - tags: [["p", recipientPubkey]]
//   - signed by the ephemeral key

console.log('--- STEP 3: Create the Gift Wrap (kind 1059) ---')

// Generate a fresh ephemeral keypair — used once and discarded
const ephemeralSk = generateSecretKey()
const ephemeralPk = getPublicKey(ephemeralSk)

console.log('Ephemeral pubkey:', ephemeralPk.substring(0, 20) + '... (random, one-time)')

// Encrypt the seal to the recipient using the ephemeral key
const wrapConversationKey = nip44.v2.utils.getConversationKey(ephemeralSk, recipientPk)
const encryptedSeal = nip44.v2.encrypt(
  JSON.stringify(seal),
  wrapConversationKey,
)

// Build and sign the gift wrap
const giftWrapTemplate: EventTemplate = {
  kind: 1059,
  created_at: randomizeTimestamp(now),
  tags: [
    ['p', recipientPk],  // Only visible metadata: who should receive this
  ],
  content: encryptedSeal,
}

const giftWrap: Event = finalizeEvent(giftWrapTemplate, ephemeralSk)

console.log()
console.log('Gift Wrap (kind 1059) — THIS is what gets published:')
console.log(JSON.stringify({
  id: giftWrap.id,
  kind: giftWrap.kind,
  pubkey: giftWrap.pubkey + ' <-- random ephemeral key',
  created_at: giftWrap.created_at,
  tags: giftWrap.tags,
  content: giftWrap.content.substring(0, 60) + '...',
  sig: giftWrap.sig.substring(0, 40) + '...',
}, null, 2))
console.log()

// Verify the gift wrap's signature (signed by ephemeral key)
console.log('Gift wrap signature valid:', verifyEvent(giftWrap))
console.log()

// Show what is hidden vs. visible
console.log('Visible to relay/eavesdropper:')
console.log('  Kind: 1059')
console.log('  Pubkey:', giftWrap.pubkey.substring(0, 16) + '... (random, meaningless)')
console.log('  Recipient:', recipientPk.substring(0, 16) + '... (from p tag)')
console.log('  Timestamp:', giftWrap.created_at, '(randomized, inaccurate)')
console.log()
console.log('Hidden from relay/eavesdropper:')
console.log('  Sender identity (inside encrypted seal)')
console.log('  Actual message (inside encrypted rumor inside encrypted seal)')
console.log('  Real timestamp (inside rumor)')
console.log('  Event kind of the inner content')
console.log()

// ============================================================================
// STEP 4: Unwrap a Received Gift Wrap (Recipient's Side)
// ============================================================================

console.log('==========================================================')
console.log('  Unwrapping — Recipient reverses the process')
console.log('==========================================================')
console.log()

// --- Step 4a: Decrypt gift wrap -> seal ---

console.log('--- Step 4a: Decrypt Gift Wrap -> Seal ---')

const recipientWrapKey = nip44.v2.utils.getConversationKey(recipientSk, giftWrap.pubkey)
const sealJson = nip44.v2.decrypt(giftWrap.content, recipientWrapKey)
const unwrappedSeal: Event = JSON.parse(sealJson)

console.log('Decrypted seal:')
console.log('  Kind:', unwrappedSeal.kind)
console.log('  Sender pubkey:', unwrappedSeal.pubkey.substring(0, 20) + '...')
console.log('  Signature valid:', verifyEvent(unwrappedSeal))
console.log()

// --- Step 4b: Verify the seal's signature ---

console.log('--- Step 4b: Verify Seal Signature ---')

if (!verifyEvent(unwrappedSeal)) {
  console.log('WARNING: Seal has invalid signature! Message may be forged.')
} else {
  console.log('Seal signature verified. Sender is authentic.')
}
console.log()

// --- Step 4c: Decrypt seal -> rumor ---

console.log('--- Step 4c: Decrypt Seal -> Rumor ---')

const recipientSealKey = nip44.v2.utils.getConversationKey(recipientSk, unwrappedSeal.pubkey)
const rumorJson = nip44.v2.decrypt(unwrappedSeal.content, recipientSealKey)
const unwrappedRumor: UnsignedEvent = JSON.parse(rumorJson)

console.log('Decrypted rumor (the original message):')
console.log(JSON.stringify(unwrappedRumor, null, 2))
console.log()

// --- Step 4d: Validate ---

console.log('--- Step 4d: Validate ---')
console.log('Original content match:', unwrappedRumor.content === rumor.content)
console.log('Sender pubkey match:', unwrappedRumor.pubkey === senderPk)
console.log('Kind:', unwrappedRumor.kind)
console.log()

// ============================================================================
// Wrapping a Non-DM Event (Demonstrating Generality)
// ============================================================================

console.log('==========================================================')
console.log('  NIP-59 is General-Purpose')
console.log('==========================================================')
console.log()
console.log('NIP-59 can wrap ANY event kind, not just DMs:')
console.log()

// Wrap a kind 7 reaction event
const reactionRumor: UnsignedEvent = {
  kind: 7,
  created_at: now,
  tags: [
    ['e', 'abc123...'],  // event being reacted to
    ['p', recipientPk],
  ],
  content: '+',
  pubkey: senderPk,
}

console.log('Example: Gift-wrapping a reaction (kind 7):')
console.log(JSON.stringify(reactionRumor, null, 2))
console.log()
console.log('The wrapping process is identical:')
console.log('  1. Create rumor (kind 7, unsigned)')
console.log('  2. Seal it (kind 13, encrypt rumor to recipient)')
console.log('  3. Gift wrap it (kind 1059, encrypt seal with random key)')
console.log()
console.log('Use cases for NIP-59 beyond DMs:')
console.log('  - Private reactions')
console.log('  - Private reposts')
console.log('  - Private zap receipts')
console.log('  - Any event that needs sender anonymity + recipient-only access')
console.log()

// ============================================================================
// Complete Wrap/Unwrap Helper Functions
// ============================================================================

console.log('==========================================================')
console.log('  Reusable Helper Functions')
console.log('==========================================================')
console.log()

/**
 * Creates a NIP-59 gift wrap for any unsigned event (rumor).
 *
 * @param rumor      The unsigned event to wrap
 * @param senderSk   Sender's secret key (for signing the seal)
 * @param recipientPk Recipient's public key (for encryption)
 * @returns The gift-wrapped event (kind 1059), ready to publish
 */
function createGiftWrap(
  rumor: UnsignedEvent,
  senderSk: Uint8Array,
  recipientPk: string,
): Event {
  // Step 1: Encrypt rumor into a seal
  const sealKey = nip44.v2.utils.getConversationKey(senderSk, recipientPk)
  const sealTemplate: EventTemplate = {
    kind: 13,
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    tags: [],
    content: nip44.v2.encrypt(JSON.stringify(rumor), sealKey),
  }
  const seal = finalizeEvent(sealTemplate, senderSk)

  // Step 2: Wrap seal with ephemeral key
  const eSk = generateSecretKey()
  const wrapKey = nip44.v2.utils.getConversationKey(eSk, recipientPk)
  const wrapTemplate: EventTemplate = {
    kind: 1059,
    created_at: randomizeTimestamp(Math.floor(Date.now() / 1000)),
    tags: [['p', recipientPk]],
    content: nip44.v2.encrypt(JSON.stringify(seal), wrapKey),
  }
  return finalizeEvent(wrapTemplate, eSk)
}

/**
 * Unwraps a NIP-59 gift wrap, returning the original rumor.
 *
 * @param giftWrap    The received kind 1059 event
 * @param recipientSk Recipient's secret key (for decryption)
 * @returns Object with the unwrapped rumor and verified sender pubkey
 */
function unwrapGiftWrap(
  giftWrap: Event,
  recipientSk: Uint8Array,
): { rumor: UnsignedEvent; senderPubkey: string; sealValid: boolean } {
  // Step 1: Decrypt gift wrap -> seal
  const wrapKey = nip44.v2.utils.getConversationKey(recipientSk, giftWrap.pubkey)
  const seal: Event = JSON.parse(nip44.v2.decrypt(giftWrap.content, wrapKey))

  // Step 2: Verify seal signature
  const sealValid = verifyEvent(seal)

  // Step 3: Decrypt seal -> rumor
  const sealKey = nip44.v2.utils.getConversationKey(recipientSk, seal.pubkey)
  const rumor: UnsignedEvent = JSON.parse(nip44.v2.decrypt(seal.content, sealKey))

  return { rumor, senderPubkey: seal.pubkey, sealValid }
}

// Demonstrate the helper functions
const testRumor: UnsignedEvent = {
  kind: 14,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['p', recipientPk]],
  content: 'Test message using helper functions!',
  pubkey: senderPk,
}

const wrapped = createGiftWrap(testRumor, senderSk, recipientPk)
const { rumor: unwrapped, senderPubkey, sealValid } = unwrapGiftWrap(wrapped, recipientSk)

console.log('Helper function round-trip test:')
console.log('  Original:', testRumor.content)
console.log('  Unwrapped:', unwrapped.content)
console.log('  Match:', unwrapped.content === testRumor.content)
console.log('  Sender verified:', senderPubkey === senderPk)
console.log('  Seal signature valid:', sealValid)
console.log()
console.log('Done.')
