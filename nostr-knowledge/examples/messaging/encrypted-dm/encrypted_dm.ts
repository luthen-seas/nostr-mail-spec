/**
 * encrypted_dm.ts
 *
 * Full NIP-17 Private Direct Message flow — every layer shown explicitly.
 *
 * NIP-17 replaces the deprecated NIP-04 DMs with a three-layer architecture
 * that protects message content AND metadata:
 *
 *   Layer 1: Rumor    (kind 14) — the actual DM content, UNSIGNED
 *   Layer 2: Seal     (kind 13) — rumor encrypted to recipient via NIP-44, signed by sender
 *   Layer 3: Gift Wrap (kind 1059) — seal encrypted with a random ephemeral key
 *
 * This file demonstrates:
 *   1. Creating the DM content (kind 14 rumor)
 *   2. Sealing it (kind 13, NIP-44 encrypt to recipient)
 *   3. Gift wrapping it (kind 1059, NIP-44 encrypt with random key)
 *   4. Publishing the gift wrap
 *   5. Receiving and unwrapping a DM (reverse the process)
 *
 * Install:
 *   npm install nostr-tools @noble/hashes ws
 *
 * Run:
 *   npx tsx encrypted_dm.ts
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import * as nip44 from 'nostr-tools/nip44'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex } from '@noble/hashes/utils'
import type { Event, EventTemplate, UnsignedEvent } from 'nostr-tools/pure'

// ============================================================================
// Setup: Two users — Alice (sender) and Bob (recipient)
// ============================================================================

const aliceSk = generateSecretKey()
const alicePk = getPublicKey(aliceSk)

const bobSk = generateSecretKey()
const bobPk = getPublicKey(bobSk)

console.log('==========================================================')
console.log('  NIP-17 Encrypted DM — Step-by-Step')
console.log('==========================================================')
console.log()
console.log('Alice (sender):', nip19.npubEncode(alicePk))
console.log('Bob (recipient):', nip19.npubEncode(bobPk))
console.log()

// ============================================================================
// STEP 1: Create the Rumor (Kind 14 — Unsigned DM Content)
// ============================================================================
//
// The rumor is the ACTUAL message. It is kind 14 (PrivateDirectMessage).
// It is NEVER signed and NEVER published directly — it only exists inside
// the encrypted seal.
//
// The rumor has:
//   - kind: 14
//   - content: the plaintext message
//   - pubkey: the SENDER's pubkey (Alice)
//   - tags: ["p", recipientPubkey] to identify the recipient
//   - created_at: current timestamp
//   - NO id, NO sig (it is unsigned)

console.log('--- STEP 1: Create the Rumor (kind 14) ---')

const rumorContent = 'Hey Bob! This is a private message sent via NIP-17.'

const rumor: UnsignedEvent = {
  kind: 14,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['p', bobPk, 'wss://relay.damus.io'],  // recipient with relay hint
  ],
  content: rumorContent,
  pubkey: alicePk,
}

console.log('Rumor (kind 14 — the actual DM, unsigned):')
console.log(JSON.stringify(rumor, null, 2))
console.log()
// Example output:
// {
//   "kind": 14,
//   "created_at": 1711882800,
//   "tags": [["p", "ab12...ef56", "wss://relay.damus.io"]],
//   "content": "Hey Bob! This is a private message sent via NIP-17.",
//   "pubkey": "cd34...gh78"
// }

console.log('Key point: The rumor has NO "id" and NO "sig" fields.')
console.log('It is never published. It only lives inside the encrypted seal.')
console.log()

// ============================================================================
// STEP 2: Create the Seal (Kind 13 — Encrypt Rumor to Recipient)
// ============================================================================
//
// The seal encrypts the rumor so only the recipient (Bob) can read it.
// It uses NIP-44 encryption with the shared secret between Alice and Bob.
//
// The seal has:
//   - kind: 13
//   - content: NIP-44 encrypted JSON of the rumor
//   - pubkey: the SENDER's pubkey (Alice) — this is the real author
//   - created_at: RANDOMIZED timestamp (metadata protection)
//   - tags: [] (empty — no metadata leaks)
//   - id + sig: signed by Alice

console.log('--- STEP 2: Create the Seal (kind 13) ---')

// Derive the NIP-44 conversation key between Alice and Bob
const conversationKey = nip44.v2.utils.getConversationKey(aliceSk, bobPk)

// Encrypt the rumor JSON
const encryptedRumor = nip44.v2.encrypt(
  JSON.stringify(rumor),
  conversationKey,
)

console.log('NIP-44 encrypted rumor (first 60 chars):', encryptedRumor.substring(0, 60) + '...')

// Randomize the timestamp to prevent timing correlation attacks.
// The timestamp is set to a random time within the past 2 days.
const randomizedTimestamp = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800)

const sealTemplate: EventTemplate = {
  kind: 13,
  created_at: randomizedTimestamp,
  tags: [],         // EMPTY — no metadata leaks from the seal
  content: encryptedRumor,
}

// Sign the seal with Alice's key — this is the only layer that reveals
// the sender's identity, but it is encrypted inside the gift wrap.
const seal: Event = finalizeEvent(sealTemplate, aliceSk)

console.log()
console.log('Seal (kind 13 — rumor encrypted to Bob, signed by Alice):')
console.log(JSON.stringify({
  id: seal.id.substring(0, 16) + '...',
  kind: seal.kind,
  pubkey: seal.pubkey.substring(0, 16) + '... (Alice — hidden inside gift wrap)',
  created_at: seal.created_at,
  tags: seal.tags,
  content: seal.content.substring(0, 40) + '... (NIP-44 ciphertext)',
  sig: seal.sig.substring(0, 16) + '...',
}, null, 2))
console.log()
// Example output:
// {
//   "id": "a1b2c3d4e5f6...",
//   "kind": 13,
//   "pubkey": "cd34ab12... (Alice — hidden inside gift wrap)",
//   "created_at": 1711795200,
//   "tags": [],
//   "content": "AcXg7F... (NIP-44 ciphertext)",
//   "sig": "9f8e7d6c..."
// }

console.log('Key points:')
console.log('  - tags: [] — the seal has NO tags, no recipient info')
console.log('  - created_at: randomized — prevents timing analysis')
console.log('  - pubkey: Alice — but this is hidden inside the gift wrap')
console.log()

// ============================================================================
// STEP 3: Gift Wrap (Kind 1059 — Encrypt Seal with Random Key)
// ============================================================================
//
// The gift wrap adds the final metadata-protection layer. It encrypts the
// seal using a RANDOM ephemeral keypair, so nobody observing the relay can
// tell who the sender is.
//
// The gift wrap has:
//   - kind: 1059
//   - content: NIP-44 encrypted JSON of the seal (using random key -> Bob)
//   - pubkey: RANDOM ephemeral pubkey (NOT Alice)
//   - created_at: RANDOMIZED timestamp
//   - tags: [["p", bobPk]] — the only visible metadata is the recipient
//   - id + sig: signed by the random ephemeral key

console.log('--- STEP 3: Gift Wrap (kind 1059) ---')

// Generate a random ephemeral keypair — used once, then discarded
const ephemeralSk = generateSecretKey()
const ephemeralPk = getPublicKey(ephemeralSk)

console.log('Ephemeral key (random, one-time use):', ephemeralPk.substring(0, 16) + '...')

// Encrypt the seal to the RECIPIENT (Bob) using the ephemeral key
const ephemeralConversationKey = nip44.v2.utils.getConversationKey(ephemeralSk, bobPk)
const encryptedSeal = nip44.v2.encrypt(
  JSON.stringify(seal),
  ephemeralConversationKey,
)

// Randomize timestamp again
const wrapTimestamp = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800)

const giftWrapTemplate: EventTemplate = {
  kind: 1059,
  created_at: wrapTimestamp,
  tags: [
    ['p', bobPk],   // The ONLY visible metadata: who should receive this
  ],
  content: encryptedSeal,
}

// Sign with the EPHEMERAL key — NOT Alice's key
const giftWrap: Event = finalizeEvent(giftWrapTemplate, ephemeralSk)

console.log()
console.log('Gift Wrap (kind 1059 — what gets published to the relay):')
console.log(JSON.stringify({
  id: giftWrap.id.substring(0, 16) + '...',
  kind: giftWrap.kind,
  pubkey: giftWrap.pubkey.substring(0, 16) + '... (RANDOM — NOT Alice!)',
  created_at: giftWrap.created_at,
  tags: giftWrap.tags.map(t => [t[0], t[1].substring(0, 16) + '... (Bob)']),
  content: giftWrap.content.substring(0, 40) + '... (NIP-44 ciphertext)',
  sig: giftWrap.sig.substring(0, 16) + '...',
}, null, 2))
console.log()
// Example output:
// {
//   "id": "f1e2d3c4b5a6...",
//   "kind": 1059,
//   "pubkey": "99aabb11... (RANDOM — NOT Alice!)",
//   "created_at": 1711820000,
//   "tags": [["p", "ab12ef56... (Bob)"]],
//   "content": "Bz9qW4... (NIP-44 ciphertext)",
//   "sig": "1a2b3c4d..."
// }

console.log('What an outside observer sees on the relay:')
console.log('  - An event from an unknown random pubkey')
console.log('  - Addressed to Bob (p tag)')
console.log('  - Random timestamp')
console.log('  - Encrypted content they cannot read')
console.log('  - They CANNOT tell who sent it, when it was written, or what it says')
console.log()

// ============================================================================
// STEP 4: Publish the Gift Wrap
// ============================================================================
//
// In a real application, you would publish the gift wrap to Bob's preferred
// DM relays (found in his kind 10050 relay list).

console.log('--- STEP 4: Publish the Gift Wrap ---')
console.log()
console.log('In production, you would publish like this:')
console.log()
console.log(`  const pool = new SimplePool()`)
console.log()
console.log(`  // Look up Bob's preferred DM relays (kind 10050)`)
console.log(`  const bobDmRelayList = await pool.get(`)
console.log(`    generalRelays,`)
console.log(`    { kinds: [10050], authors: [bobPk] }`)
console.log(`  )`)
console.log(`  const bobDmRelays = bobDmRelayList?.tags`)
console.log(`    .filter(t => t[0] === 'relay')`)
console.log(`    .map(t => t[1]) ?? ['wss://relay.damus.io']`)
console.log()
console.log(`  // Publish the gift wrap to Bob's DM relays`)
console.log(`  await Promise.any(pool.publish(bobDmRelays, giftWrap))`)
console.log(`  console.log('Gift wrap published to', bobDmRelays)`)
console.log()
console.log('NOTE: You should also create a SECOND gift wrap for yourself')
console.log('(re-encrypt the same rumor to your own pubkey) so you can read')
console.log('your own sent messages in your DM history.')
console.log()

// ============================================================================
// STEP 5: Receive and Unwrap a DM (Bob's Side)
// ============================================================================
//
// Bob receives the gift wrap from a relay and reverses the process:
//   Gift Wrap -> Seal -> Rumor -> Plaintext message
//
// Each layer is decrypted using NIP-44.

console.log('==========================================================')
console.log('  RECEIVING SIDE — Bob unwraps the DM')
console.log('==========================================================')
console.log()

// --- Step 5a: Bob decrypts the gift wrap to get the seal ---

console.log('--- Step 5a: Decrypt Gift Wrap -> Seal ---')

// Bob derives the conversation key between the ephemeral pubkey and his secret key
const bobUnwrapKey = nip44.v2.utils.getConversationKey(bobSk, giftWrap.pubkey)
const decryptedSealJson = nip44.v2.decrypt(giftWrap.content, bobUnwrapKey)
const decryptedSeal: Event = JSON.parse(decryptedSealJson)

console.log('Bob decrypted the gift wrap and found a seal:')
console.log('  Seal kind:', decryptedSeal.kind, '(kind 13 = seal)')
console.log('  Seal author:', decryptedSeal.pubkey.substring(0, 16) + '... (this is Alice!)')
console.log('  Seal tags:', JSON.stringify(decryptedSeal.tags), '(empty)')
console.log()

// --- Step 5b: Bob decrypts the seal to get the rumor ---

console.log('--- Step 5b: Decrypt Seal -> Rumor ---')

// Bob derives the conversation key between Alice's pubkey (from the seal) and his secret key
const bobSealKey = nip44.v2.utils.getConversationKey(bobSk, decryptedSeal.pubkey)
const decryptedRumorJson = nip44.v2.decrypt(decryptedSeal.content, bobSealKey)
const decryptedRumor = JSON.parse(decryptedRumorJson)

console.log('Bob decrypted the seal and found the rumor:')
console.log('  Rumor kind:', decryptedRumor.kind, '(kind 14 = private direct message)')
console.log('  Sender:', decryptedRumor.pubkey.substring(0, 16) + '...')
console.log('  Sender is Alice:', decryptedRumor.pubkey === alicePk)
console.log('  Content:', decryptedRumor.content)
console.log('  Tags:', JSON.stringify(decryptedRumor.tags))
console.log()

// --- Step 5c: Verify the message ---

console.log('--- Step 5c: Verification ---')
console.log('  Message content:', decryptedRumor.content)
console.log('  Sent by Alice:', decryptedRumor.pubkey === alicePk)
console.log('  Addressed to Bob:', decryptedRumor.tags.some(
  (t: string[]) => t[0] === 'p' && t[1] === bobPk
))
console.log('  Round-trip successful:', decryptedRumor.content === rumorContent)
console.log()

// ============================================================================
// STEP 6: Using nostr-tools NIP-17 Helpers (Convenience API)
// ============================================================================
//
// The above steps show exactly what happens under the hood. In practice,
// nostr-tools provides helpers that do all of this in one call.

console.log('==========================================================')
console.log('  Convenience API — nostr-tools nip17 helpers')
console.log('==========================================================')
console.log()

// nostr-tools provides nip17.wrapEvent() and nip17.unwrapEvent()
// that handle all three layers automatically.
//
// import * as nip17 from 'nostr-tools/nip17'
//
// // Send a DM (creates gift wraps for recipient + sender copy)
// const wraps = nip17.wrapEvent(
//   aliceSk,
//   { publicKey: bobPk, relayUrl: 'wss://relay.damus.io' },
//   'Hello Bob!'
// )
//
// // wraps is an array of gift-wrapped events:
// //   wraps[0] — for the recipient (Bob)
// //   wraps[1] — for the sender (Alice's own copy)
//
// // Bob unwraps:
// const bobWrap = wraps.find(e => e.tags.some(t => t[0] === 'p' && t[1] === bobPk))
// const message = nip17.unwrapEvent(bobWrap, bobSk)
// console.log(message.content)  // "Hello Bob!"

console.log('See the libraries/javascript/examples/encrypted_dm.ts file')
console.log('for the convenience API usage with nip17.wrapEvent() and')
console.log('nip17.unwrapEvent().')
console.log()

// ============================================================================
// STEP 7: Subscribing to Incoming DMs
// ============================================================================

console.log('==========================================================')
console.log('  Subscribing to Incoming DMs')
console.log('==========================================================')
console.log()
console.log('To receive DMs in a client, subscribe to kind 1059 events:')
console.log()
console.log(`  import * as nip17 from 'nostr-tools/nip17'`)
console.log()
console.log(`  const pool = new SimplePool()`)
console.log(`  const myDmRelays = ['wss://relay.damus.io', 'wss://nos.lol']`)
console.log()
console.log(`  pool.subscribeMany(`)
console.log(`    myDmRelays,`)
console.log(`    [{ kinds: [1059], '#p': [myPubkey] }],`)
console.log(`    {`)
console.log(`      onevent(giftWrap: Event) {`)
console.log(`        try {`)
console.log(`          const rumor = nip17.unwrapEvent(giftWrap, mySk)`)
console.log(`          console.log('DM from:', rumor.pubkey)`)
console.log(`          console.log('Message:', rumor.content)`)
console.log(`        } catch (e) {`)
console.log(`          console.log('Failed to unwrap — not for us or corrupted')`)
console.log(`        }`)
console.log(`      }`)
console.log(`    }`)
console.log(`  )`)
console.log()

// ============================================================================
// Summary: The Three-Layer Model
// ============================================================================

console.log('==========================================================')
console.log('  Summary: Three-Layer Model')
console.log('==========================================================')
console.log()
console.log('Layer        Kind   Content              Signed By        Visible On Relay?')
console.log('------------ ------ -------------------- ---------------- ----------------')
console.log('Rumor        14     Plaintext message    UNSIGNED         NO')
console.log('Seal         13     Encrypted rumor      Sender (Alice)   NO')
console.log('Gift Wrap    1059   Encrypted seal       Random key       YES')
console.log()
console.log('What a relay/eavesdropper can see:')
console.log('  - A kind 1059 event from an unknown pubkey')
console.log('  - The recipient (p tag)')
console.log('  - A random timestamp')
console.log('  - Opaque encrypted content')
console.log()
console.log('What the relay/eavesdropper CANNOT see:')
console.log('  - Who sent it (sender pubkey is inside the encrypted seal)')
console.log('  - When it was actually written (timestamps are randomized)')
console.log('  - What the message says (content is double-encrypted)')
console.log('  - The message structure (NIP-44 pads to prevent length analysis)')
console.log()
console.log('Done.')
