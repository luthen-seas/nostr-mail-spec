/**
 * public_chat.ts
 *
 * NIP-28 Public Chat Channels — open group messaging on NOSTR.
 *
 * NIP-28 defines public chat channels using four event kinds:
 *   - Kind 40: Create a channel
 *   - Kind 41: Set channel metadata
 *   - Kind 42: Send a message to a channel
 *   - Kind 43: Hide a message (moderation)
 *   - Kind 44: Mute a user (moderation)
 *
 * This file demonstrates:
 *   1. Creating a channel (kind 40)
 *   2. Setting channel metadata (kind 41)
 *   3. Sending messages to a channel (kind 42)
 *   4. Subscribing to channel messages
 *   5. Replying to messages (threaded)
 *   6. Moderation: hiding messages and muting users
 *
 * Install:
 *   npm install nostr-tools @noble/hashes ws
 *
 * Run:
 *   npx tsx public_chat.ts
 */

import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex } from '@noble/hashes/utils'
import type { Event, EventTemplate } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

// ============================================================================
// Setup
// ============================================================================

const adminSk = generateSecretKey()
const adminPk = getPublicKey(adminSk)

const userSk = generateSecretKey()
const userPk = getPublicKey(userSk)

const trollSk = generateSecretKey()
const trollPk = getPublicKey(trollSk)

const now = Math.floor(Date.now() / 1000)

console.log('==========================================================')
console.log('  NIP-28 Public Chat Channels')
console.log('==========================================================')
console.log()
console.log('Admin:', nip19.npubEncode(adminPk))
console.log('User: ', nip19.npubEncode(userPk))
console.log('Troll:', nip19.npubEncode(trollPk))
console.log()

// ============================================================================
// STEP 1: Create a Channel (Kind 40)
// ============================================================================
//
// A channel creation event is kind 40. The content is a JSON object
// with the channel's metadata: name, about, picture.
//
// The channel ID is the event ID of the kind 40 event.

console.log('--- STEP 1: Create a Channel (kind 40) ---')

const channelMetadata = {
  name: 'nostr-dev',
  about: 'A public channel for NOSTR protocol developers to discuss NIPs, clients, and relays.',
  picture: 'https://example.com/nostr-dev-channel.png',
}

const createChannelTemplate: EventTemplate = {
  kind: 40,
  created_at: now,
  tags: [],
  content: JSON.stringify(channelMetadata),
}

const createChannelEvent: Event = finalizeEvent(createChannelTemplate, adminSk)

// The channel ID is the event ID of this kind 40 event
const channelId = createChannelEvent.id

console.log('Channel creation event (kind 40):')
console.log(JSON.stringify({
  id: createChannelEvent.id,
  kind: createChannelEvent.kind,
  pubkey: createChannelEvent.pubkey,
  created_at: createChannelEvent.created_at,
  tags: createChannelEvent.tags,
  content: createChannelEvent.content,
}, null, 2))
console.log()
// {
//   "id": "abc123...",         <-- THIS is the channel ID
//   "kind": 40,
//   "pubkey": "admin_pk...",   <-- Channel creator/owner
//   "created_at": 1711882800,
//   "tags": [],
//   "content": "{\"name\":\"nostr-dev\",\"about\":\"A public channel...\"}"
// }

console.log('Channel ID:', channelId.substring(0, 16) + '...')
console.log('Channel created by:', adminPk.substring(0, 16) + '... (admin)')
console.log()

// ============================================================================
// STEP 2: Set Channel Metadata (Kind 41)
// ============================================================================
//
// Kind 41 updates the channel's metadata. Only the channel creator
// should publish kind 41 events. Clients should use the most recent
// kind 41 from the creator for display.
//
// The "e" tag references the channel creation event (the channel ID).

console.log('--- STEP 2: Set Channel Metadata (kind 41) ---')

const updatedMetadata = {
  name: 'nostr-dev',
  about: 'Official channel for NOSTR protocol development. Discuss NIPs, review PRs, coordinate releases.',
  picture: 'https://example.com/nostr-dev-v2.png',
  // Additional recommended fields:
  // "banner": "https://example.com/banner.png"
}

const setMetadataTemplate: EventTemplate = {
  kind: 41,
  created_at: now + 60,  // 1 minute later
  tags: [
    ['e', channelId, 'wss://relay.damus.io'],  // Reference the channel
  ],
  content: JSON.stringify(updatedMetadata),
}

const setMetadataEvent: Event = finalizeEvent(setMetadataTemplate, adminSk)

console.log('Channel metadata update (kind 41):')
console.log(JSON.stringify({
  id: setMetadataEvent.id.substring(0, 16) + '...',
  kind: setMetadataEvent.kind,
  pubkey: setMetadataEvent.pubkey.substring(0, 16) + '... (admin)',
  tags: setMetadataEvent.tags.map(t => [t[0], t[1].substring(0, 16) + '...',  ...t.slice(2)]),
  content: setMetadataEvent.content,
}, null, 2))
console.log()
console.log('Note: Only kind 41 events from the channel creator (admin) should be trusted.')
console.log()

// ============================================================================
// STEP 3: Send Messages to the Channel (Kind 42)
// ============================================================================
//
// Channel messages are kind 42. They reference the channel via an "e" tag
// pointing to the channel creation event (the channel ID).
//
// The "e" tag uses a marker to distinguish the channel root from replies:
//   ["e", channelId, relayUrl, "root"]  -- identifies the channel

console.log('--- STEP 3: Send Messages (kind 42) ---')

// --- Message 1: Admin posts a welcome message ---

const msg1Template: EventTemplate = {
  kind: 42,
  created_at: now + 120,
  tags: [
    ['e', channelId, 'wss://relay.damus.io', 'root'],  // Channel reference
  ],
  content: 'Welcome to #nostr-dev! Feel free to discuss anything related to NOSTR protocol development.',
}

const msg1: Event = finalizeEvent(msg1Template, adminSk)

console.log('Message 1 (admin welcome):')
console.log({
  id: msg1.id.substring(0, 16) + '...',
  kind: 42,
  author: 'admin',
  content: msg1.content,
  tags: msg1.tags,
})
console.log()

// --- Message 2: A user sends a message ---

const msg2Template: EventTemplate = {
  kind: 42,
  created_at: now + 180,
  tags: [
    ['e', channelId, 'wss://relay.damus.io', 'root'],
  ],
  content: 'Has anyone looked at the latest NIP-44 test vectors? I found an edge case with the padding.',
}

const msg2: Event = finalizeEvent(msg2Template, userSk)

console.log('Message 2 (user):')
console.log({
  id: msg2.id.substring(0, 16) + '...',
  kind: 42,
  author: 'user',
  content: msg2.content,
})
console.log()

// --- Message 3: Reply to message 2 (threaded) ---
//
// To reply to a specific message, add a second "e" tag pointing to
// the message being replied to, with the "reply" marker.

const msg3Template: EventTemplate = {
  kind: 42,
  created_at: now + 240,
  tags: [
    ['e', channelId, 'wss://relay.damus.io', 'root'],   // Channel reference
    ['e', msg2.id, 'wss://relay.damus.io', 'reply'],     // Reply to msg2
    ['p', userPk],                                         // Mention the user being replied to
  ],
  content: 'Yes! The padding for messages near the 32KB boundary seems off. I opened an issue on GitHub.',
}

const msg3: Event = finalizeEvent(msg3Template, adminSk)

console.log('Message 3 (reply to message 2):')
console.log({
  id: msg3.id.substring(0, 16) + '...',
  kind: 42,
  author: 'admin',
  content: msg3.content,
  replyTo: msg2.id.substring(0, 16) + '...',
})
console.log()

// --- Troll message (will be hidden later) ---

const trollMsgTemplate: EventTemplate = {
  kind: 42,
  created_at: now + 300,
  tags: [
    ['e', channelId, 'wss://relay.damus.io', 'root'],
  ],
  content: 'Buy my scam token at example.com/scam!!!',
}

const trollMsg: Event = finalizeEvent(trollMsgTemplate, trollSk)

console.log('Troll message:')
console.log({
  id: trollMsg.id.substring(0, 16) + '...',
  kind: 42,
  author: 'troll',
  content: trollMsg.content,
})
console.log()

// ============================================================================
// STEP 4: Subscribe to Channel Messages
// ============================================================================
//
// To display a channel's messages, subscribe to kind 42 events that
// have an "e" tag pointing to the channel ID.

console.log('--- STEP 4: Subscribe to Channel Messages ---')
console.log()

// The filter to subscribe to a channel's messages
const channelFilter: Filter = {
  kinds: [42],
  '#e': [channelId],  // Events referencing this channel
}

console.log('Subscription filter:')
console.log(JSON.stringify(channelFilter, null, 2))
console.log()

// In a real application:
//
// const pool = new SimplePool()
// const relays = ['wss://relay.damus.io', 'wss://nos.lol']
//
// // Subscribe to messages
// const sub = pool.subscribeMany(
//   relays,
//   [channelFilter],
//   {
//     onevent(event: Event) {
//       const metadata = JSON.parse(event.content)
//       console.log(`[${event.pubkey.substring(0, 8)}] ${event.content}`)
//
//       // Check if it's a reply
//       const replyTag = event.tags.find(t => t[0] === 'e' && t[3] === 'reply')
//       if (replyTag) {
//         console.log(`  (reply to ${replyTag[1].substring(0, 8)}...)`)
//       }
//     },
//     oneose() {
//       console.log('--- End of stored events, now listening for new messages ---')
//     }
//   }
// )

console.log('To subscribe in a real client:')
console.log('  pool.subscribeMany(relays, [{ kinds: [42], "#e": [channelId] }], handlers)')
console.log()

// Fetch channel metadata
const channelInfoFilter: Filter = {
  kinds: [40],
  ids: [channelId],  // The channel creation event
}

const channelUpdateFilter: Filter = {
  kinds: [41],
  authors: [adminPk],  // Only trust metadata from the creator
  '#e': [channelId],
}

console.log('Channel info filter:', JSON.stringify(channelInfoFilter))
console.log('Channel update filter:', JSON.stringify(channelUpdateFilter))
console.log()

// ============================================================================
// STEP 5: Moderation — Hide Messages (Kind 43)
// ============================================================================
//
// Channel creators can "hide" messages by publishing a kind 43 event.
// Clients that respect the creator's moderation will not display hidden messages.
//
// Note: This is client-side moderation. The message still exists on relays.

console.log('--- STEP 5: Moderation — Hide Message (kind 43) ---')

const hideTemplate: EventTemplate = {
  kind: 43,
  created_at: now + 360,
  tags: [
    ['e', trollMsg.id, 'wss://relay.damus.io'],  // Message to hide
  ],
  content: JSON.stringify({ reason: 'Spam / scam promotion' }),
}

const hideEvent: Event = finalizeEvent(hideTemplate, adminSk)

console.log('Hide message event (kind 43):')
console.log({
  kind: hideEvent.kind,
  author: 'admin (channel creator)',
  hiddenMessage: trollMsg.id.substring(0, 16) + '...',
  reason: 'Spam / scam promotion',
})
console.log()

// ============================================================================
// STEP 6: Moderation — Mute User (Kind 44)
// ============================================================================
//
// Channel creators can "mute" a user by publishing a kind 44 event.
// Clients that respect the creator's moderation will hide all messages
// from the muted user in that channel.

console.log('--- STEP 6: Moderation — Mute User (kind 44) ---')

const muteTemplate: EventTemplate = {
  kind: 44,
  created_at: now + 420,
  tags: [
    ['p', trollPk],  // User to mute
  ],
  content: JSON.stringify({ reason: 'Repeated spam after warning' }),
}

const muteEvent: Event = finalizeEvent(muteTemplate, adminSk)

console.log('Mute user event (kind 44):')
console.log({
  kind: muteEvent.kind,
  author: 'admin (channel creator)',
  mutedUser: trollPk.substring(0, 16) + '...',
  reason: 'Repeated spam after warning',
})
console.log()

// ============================================================================
// Listing Channels on a Relay
// ============================================================================

console.log('--- Listing Channels ---')
console.log()
console.log('To discover channels on a relay, query for kind 40 events:')
console.log()
console.log('  const channels = await pool.querySync(')
console.log('    relays,')
console.log('    [{ kinds: [40], limit: 50 }]')
console.log('  )')
console.log('  for (const ch of channels) {')
console.log('    const meta = JSON.parse(ch.content)')
console.log('    console.log(`#${meta.name}: ${meta.about}`)')
console.log('  }')
console.log()

// ============================================================================
// Summary
// ============================================================================

console.log('==========================================================')
console.log('  NIP-28 Event Kinds Summary')
console.log('==========================================================')
console.log()
console.log('Kind  Purpose              Tags                        Content')
console.log('----- -------------------- --------------------------- ----------------------------')
console.log('40    Create channel       []                          JSON: {name, about, picture}')
console.log('41    Update channel meta  [["e", channelId]]          JSON: {name, about, picture}')
console.log('42    Channel message      [["e", channelId, r, "root"]]  Message text')
console.log('42    Reply to message     [["e", channelId], ["e", msgId, r, "reply"]]  Reply text')
console.log('43    Hide message         [["e", msgId]]              JSON: {reason}')
console.log('44    Mute user            [["p", pubkey]]             JSON: {reason}')
console.log()
console.log('Key points:')
console.log('  - Channel ID = event ID of the kind 40 creation event')
console.log('  - Only the channel creator\'s kind 41/43/44 events should be trusted')
console.log('  - All messages are PUBLIC and unencrypted')
console.log('  - Moderation is client-side (events still exist on relays)')
console.log()
console.log('Done.')
