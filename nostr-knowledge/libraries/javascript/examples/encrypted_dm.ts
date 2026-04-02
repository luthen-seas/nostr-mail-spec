/**
 * encrypted_dm.ts
 *
 * Demonstrates NIP-17 private direct messages using NIP-44 encryption
 * wrapped in NIP-59 gift wraps.
 *
 * NIP-17 is the modern, metadata-protecting replacement for NIP-04 DMs.
 * The three-layer architecture:
 *   1. Rumor    -- the actual message (unsigned, never published)
 *   2. Seal     -- rumor encrypted to recipient, signed by sender (kind 13)
 *   3. Gift Wrap -- seal encrypted with ephemeral key (kind 1059)
 *
 * This example covers:
 *   - Sending a private DM to one recipient
 *   - Sending a group DM to multiple recipients
 *   - Replying to a message
 *   - Unwrapping received messages
 *   - Understanding NIP-44 encryption directly
 *
 * Install:
 *   npm install nostr-tools ws
 *
 * Run:
 *   npx tsx encrypted_dm.ts
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { GiftWrap, PrivateDirectMessage } from 'nostr-tools/kinds'
import * as nip17 from 'nostr-tools/nip17'
import * as nip44 from 'nostr-tools/nip44'
import * as nip59 from 'nostr-tools/nip59'
import * as nip19 from 'nostr-tools/nip19'
import type { Event } from 'nostr-tools/pure'

// ---------------------------------------------------------------------------
// Setup: Create two users (Alice and Bob)
// ---------------------------------------------------------------------------

const aliceSk = generateSecretKey()
const alicePk = getPublicKey(aliceSk)

const bobSk = generateSecretKey()
const bobPk = getPublicKey(bobSk)

console.log('=== Users ===')
console.log('Alice:', nip19.npubEncode(alicePk))
console.log('Bob:  ', nip19.npubEncode(bobPk))
console.log()

// ---------------------------------------------------------------------------
// 1. NIP-44 Encryption -- The Foundation
// ---------------------------------------------------------------------------

console.log('=== NIP-44 Encryption (Low-Level) ===')

// Derive a conversation key between Alice and Bob.
// This key is symmetric -- both parties derive the same key.
const aliceToBobKey = nip44.v2.utils.getConversationKey(aliceSk, bobPk)
const bobToAliceKey = nip44.v2.utils.getConversationKey(bobSk, alicePk)

// Both keys are identical (ECDH property)
console.log(
  'Conversation keys match:',
  Buffer.from(aliceToBobKey).toString('hex') === Buffer.from(bobToAliceKey).toString('hex'),
)

// Encrypt a message
const plaintext = 'Hello Bob, this is a secret message!'
const ciphertext = nip44.v2.encrypt(plaintext, aliceToBobKey)
console.log('Ciphertext (base64):', ciphertext.substring(0, 40) + '...')
console.log('Ciphertext length:', ciphertext.length, 'chars')

// Decrypt the message (Bob can use his derived key)
const decrypted = nip44.v2.decrypt(ciphertext, bobToAliceKey)
console.log('Decrypted:', decrypted)
console.log('Round-trip match:', decrypted === plaintext)
console.log()

// Show padding behavior (NIP-44 pads messages to prevent length analysis)
const short = nip44.v2.encrypt('Hi', aliceToBobKey)
const medium = nip44.v2.encrypt('A'.repeat(100), aliceToBobKey)
const long = nip44.v2.encrypt('B'.repeat(1000), aliceToBobKey)
console.log('Padded ciphertext lengths (short/medium/long):', short.length, medium.length, long.length)
console.log()

// ---------------------------------------------------------------------------
// 2. NIP-17 Private DM -- Single Recipient
// ---------------------------------------------------------------------------

console.log('=== NIP-17 Private DM (Alice -> Bob) ===')

// wrapEvent returns an array of gift-wrapped events:
//   - One for the recipient (Bob)
//   - One for the sender's own copy (Alice can read her sent messages)
const wrappedEvents = nip17.wrapEvent(
  aliceSk,
  {
    publicKey: bobPk,
    relayUrl: 'wss://relay.damus.io', // optional relay hint
  },
  'Hey Bob! This is a private message via NIP-17.',
)

console.log('Generated', wrappedEvents.length, 'gift-wrapped events')
for (let i = 0; i < wrappedEvents.length; i++) {
  const wrap = wrappedEvents[i]
  console.log(`  Wrap ${i + 1}:`)
  console.log(`    Kind: ${wrap.kind} (${wrap.kind === GiftWrap ? 'GiftWrap' : 'unknown'})`)
  console.log(`    ID: ${wrap.id.substring(0, 16)}...`)
  console.log(`    Pubkey: ${wrap.pubkey.substring(0, 16)}... (ephemeral, NOT Alice's)`)
  console.log(`    Tags: ${JSON.stringify(wrap.tags)}`)
}
console.log()

// ---------------------------------------------------------------------------
// 3. Unwrapping a Received DM (Bob's Side)
// ---------------------------------------------------------------------------

console.log('=== Unwrapping (Bob decrypts) ===')

// Bob receives the gift wrap addressed to him (the one with his pubkey in p tag)
const bobsWrap = wrappedEvents.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === bobPk))

if (bobsWrap) {
  // Unwrap reveals the original rumor (the actual message)
  const rumor = nip17.unwrapEvent(bobsWrap, bobSk)
  console.log('Unwrapped message:')
  console.log('  Kind:', rumor.kind, `(${rumor.kind === PrivateDirectMessage ? 'PrivateDirectMessage' : 'unknown'})`)
  console.log('  Content:', rumor.content)
  console.log('  Author pubkey:', rumor.pubkey.substring(0, 16) + '...')
  console.log('  Author is Alice:', rumor.pubkey === alicePk)
  console.log('  Created at:', new Date(rumor.created_at * 1000).toISOString())
} else {
  console.log('ERROR: Could not find gift wrap for Bob')
}
console.log()

// ---------------------------------------------------------------------------
// 4. NIP-17 with Subject and Reply
// ---------------------------------------------------------------------------

console.log('=== NIP-17 with Subject and Reply ===')

// First message establishes a conversation
const firstMessage = nip17.wrapEvent(aliceSk, { publicKey: bobPk }, 'Starting a new conversation')

// Find the event ID of the first message (from the rumor inside)
const firstRumor = nip17.unwrapEvent(
  firstMessage.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === bobPk))!,
  bobSk,
)

// Bob replies to Alice's message
const replyWraps = nip17.wrapEvent(
  bobSk,
  {
    publicKey: alicePk,
    relayUrl: 'wss://relay.damus.io',
  },
  'Thanks for the message, Alice!',
  'Our Private Chat', // conversation subject (optional)
  {
    // reply to the first message
    eventId: firstRumor.id,
    relayUrl: 'wss://relay.damus.io',
  },
)

// Alice unwraps Bob's reply
const alicesWrap = replyWraps.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === alicePk))
if (alicesWrap) {
  const replyRumor = nip17.unwrapEvent(alicesWrap, aliceSk)
  console.log('Bob replied:')
  console.log('  Content:', replyRumor.content)
  console.log('  Author is Bob:', replyRumor.pubkey === bobPk)

  // Check for subject and reply tags
  const subjectTag = replyRumor.tags.find((t) => t[0] === 'subject')
  const replyTag = replyRumor.tags.find((t) => t[0] === 'e')
  console.log('  Subject:', subjectTag ? subjectTag[1] : '(none)')
  console.log('  Replies to:', replyTag ? replyTag[1].substring(0, 16) + '...' : '(none)')
}
console.log()

// ---------------------------------------------------------------------------
// 5. Group DM -- Multiple Recipients
// ---------------------------------------------------------------------------

console.log('=== Group DM (Alice -> Bob + Carol) ===')

const carolSk = generateSecretKey()
const carolPk = getPublicKey(carolSk)
console.log('Carol:', nip19.npubEncode(carolPk))

// Send the same message to both Bob and Carol
const groupWraps = nip17.wrapManyEvents(
  aliceSk,
  [
    { publicKey: bobPk, relayUrl: 'wss://relay.damus.io' },
    { publicKey: carolPk, relayUrl: 'wss://nos.lol' },
  ],
  'Hello everyone in this group chat!',
)

console.log('Generated', groupWraps.length, 'gift wraps for group DM')
// Should be: one for Bob, one for Carol, one for Alice (sender copy)

// Bob unwraps his copy
const bobGroupWrap = groupWraps.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === bobPk))
if (bobGroupWrap) {
  const bobMsg = nip17.unwrapEvent(bobGroupWrap, bobSk)
  console.log('Bob received:', bobMsg.content)
}

// Carol unwraps her copy
const carolGroupWrap = groupWraps.find((e) => e.tags.some((t) => t[0] === 'p' && t[1] === carolPk))
if (carolGroupWrap) {
  const carolMsg = nip17.unwrapEvent(carolGroupWrap, carolSk)
  console.log('Carol received:', carolMsg.content)
}
console.log()

// ---------------------------------------------------------------------------
// 6. Publishing DMs to Relays
// ---------------------------------------------------------------------------

console.log('=== Publishing DMs to Relays ===')
console.log('To publish NIP-17 DMs, send each gift wrap to the appropriate relay:')
console.log()
console.log('  const pool = new SimplePool()')
console.log()
console.log('  // Send each wrap to the recipient\'s preferred DM relays')
console.log('  // (look up kind 10050 RelayList for DM relay preferences)')
console.log('  for (const wrap of wrappedEvents) {')
console.log('    const recipientPk = wrap.tags.find(t => t[0] === "p")?.[1]')
console.log('    const recipientDmRelays = await getDmRelays(recipientPk)')
console.log('    await Promise.any(pool.publish(recipientDmRelays, wrap))')
console.log('  }')
console.log()

// ---------------------------------------------------------------------------
// 7. Subscribing to Incoming DMs
// ---------------------------------------------------------------------------

console.log('=== Subscribing to Incoming DMs ===')
console.log('To receive NIP-17 DMs, subscribe to gift wraps addressed to you:')
console.log()
console.log('  pool.subscribeMany(')
console.log('    myDmRelays,')
console.log('    [{ kinds: [1059], "#p": [myPubkey] }],  // GiftWrap events for me')
console.log('    {')
console.log('      onevent(giftWrap) {')
console.log('        const rumor = nip17.unwrapEvent(giftWrap, mySk)')
console.log('        console.log("DM from:", rumor.pubkey)')
console.log('        console.log("Message:", rumor.content)')
console.log('      }')
console.log('    }')
console.log('  )')
console.log()

// ---------------------------------------------------------------------------
// 8. Unwrapping Many Events (Batch)
// ---------------------------------------------------------------------------

console.log('=== Batch Unwrapping ===')

// Simulate receiving multiple DMs
const dm1 = nip17.wrapEvent(bobSk, { publicKey: alicePk }, 'Message 1 from Bob')
const dm2 = nip17.wrapEvent(carolSk, { publicKey: alicePk }, 'Message 2 from Carol')
const dm3 = nip17.wrapEvent(bobSk, { publicKey: alicePk }, 'Message 3 from Bob')

// Collect all gift wraps addressed to Alice
const aliceWraps = [
  ...dm1.filter((e) => e.tags.some((t) => t[0] === 'p' && t[1] === alicePk)),
  ...dm2.filter((e) => e.tags.some((t) => t[0] === 'p' && t[1] === alicePk)),
  ...dm3.filter((e) => e.tags.some((t) => t[0] === 'p' && t[1] === alicePk)),
]

// Unwrap all at once, sorted chronologically
const allMessages = nip17.unwrapManyEvents(aliceWraps, aliceSk)
console.log(`Unwrapped ${allMessages.length} messages:`)
for (const msg of allMessages) {
  const senderNpub = nip19.npubEncode(msg.pubkey).substring(0, 16)
  console.log(`  [${senderNpub}...] ${msg.content}`)
}
console.log()

// ---------------------------------------------------------------------------
// 9. Security Properties Summary
// ---------------------------------------------------------------------------

console.log('=== NIP-17 Security Properties ===')
console.log('1. Content privacy: Message encrypted with NIP-44 (ChaCha20 + HMAC-SHA256)')
console.log('2. Sender privacy: Gift wrap uses ephemeral key, not sender pubkey')
console.log('3. Timing privacy: Gift wrap timestamps are randomized')
console.log('4. Metadata privacy: Only the recipient can see who sent the message')
console.log('5. Forward secrecy: Each message uses fresh encryption nonces')
console.log('6. Padding: NIP-44 pads messages to prevent length analysis')
console.log()
console.log('Done.')
