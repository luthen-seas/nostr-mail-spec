/**
 * group_chat.ts
 *
 * NIP-29 Relay-Based Groups — moderated group chat enforced by relays.
 *
 * Unlike NIP-28 (public channels where moderation is client-side), NIP-29
 * groups are enforced by the relay itself. The relay:
 *   - Maintains group membership lists
 *   - Enforces who can post (members only)
 *   - Enforces admin/moderator roles and permissions
 *   - Rejects unauthorized events
 *
 * Key event kinds:
 *   Kind 9     — Group chat message
 *   Kind 10    — Group thread reply
 *   Kind 11    — Group note (long-form)
 *   Kind 12    — Group thread root
 *   Kind 9000  — Group admin: add user
 *   Kind 9001  — Group admin: remove user
 *   Kind 9002  — Group admin: edit metadata
 *   Kind 9003  — Group admin: delete event
 *   Kind 9004  — Group admin: edit group status
 *   Kind 9005  — Group admin: create group
 *   Kind 9006  — Group admin: delete group
 *   Kind 9007  — Group admin: create invite
 *   Kind 9021  — Join request
 *   Kind 9022  — Leave request
 *   Kind 39000 — Group metadata (addressable, published by relay)
 *   Kind 39001 — Group admins list (addressable, published by relay)
 *   Kind 39002 — Group members list (addressable, published by relay)
 *
 * This file demonstrates:
 *   1. Listing available groups on a relay
 *   2. Joining a group (kind 9021)
 *   3. Sending a message (kind 9)
 *   4. Subscribing to group messages
 *   5. Group admin operations (kind 9000-9009)
 *
 * Install:
 *   npm install nostr-tools @noble/hashes ws
 *
 * Run:
 *   npx tsx group_chat.ts
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

const memberSk = generateSecretKey()
const memberPk = getPublicKey(memberSk)

const newUserSk = generateSecretKey()
const newUserPk = getPublicKey(newUserSk)

const now = Math.floor(Date.now() / 1000)

// NIP-29 groups are identified by a group ID on a specific relay.
// The full address is: <relay-url>'<group-id>
// For example: wss://groups.example.com'my-group
const GROUP_RELAY = 'wss://groups.example.com'
const GROUP_ID = 'nostr-dev'

console.log('==========================================================')
console.log('  NIP-29 Relay-Based Groups')
console.log('==========================================================')
console.log()
console.log('Relay:', GROUP_RELAY)
console.log('Group:', GROUP_ID)
console.log('Full address:', `${GROUP_RELAY}'${GROUP_ID}`)
console.log()
console.log('Admin:    ', nip19.npubEncode(adminPk))
console.log('Member:   ', nip19.npubEncode(memberPk))
console.log('New User: ', nip19.npubEncode(newUserPk))
console.log()

// ============================================================================
// STEP 1: List Available Groups on a Relay
// ============================================================================
//
// Groups publish their metadata as kind 39000 addressable events.
// The relay maintains these on behalf of the group.
// The "d" tag contains the group ID.

console.log('--- STEP 1: List Available Groups ---')
console.log()

// Filter to discover all groups on a relay
const listGroupsFilter: Filter = {
  kinds: [39000],   // Group metadata events
}

console.log('Filter to list groups:', JSON.stringify(listGroupsFilter))
console.log()

// Example group metadata event (kind 39000) as returned by a relay:
const exampleGroupMetadata = {
  id: 'abc123...',
  kind: 39000,
  pubkey: '<relay-pubkey>',    // Published by the relay itself
  created_at: now,
  tags: [
    ['d', GROUP_ID],                    // Group identifier
    ['name', 'NOSTR Dev'],              // Display name
    ['about', 'NOSTR protocol development discussion'],
    ['picture', 'https://example.com/group-icon.png'],
    ['open'],                           // Open group (anyone can join)
    // ['closed'] would mean join requests require approval
  ],
  content: '',
}

console.log('Example group metadata (kind 39000):')
console.log(JSON.stringify(exampleGroupMetadata, null, 2))
console.log()

// In a real application:
//
// const pool = new SimplePool()
// const groups = await pool.querySync([GROUP_RELAY], [{ kinds: [39000] }])
// for (const g of groups) {
//   const dTag = g.tags.find(t => t[0] === 'd')
//   const nameTag = g.tags.find(t => t[0] === 'name')
//   const aboutTag = g.tags.find(t => t[0] === 'about')
//   const isOpen = g.tags.some(t => t[0] === 'open')
//   console.log(`Group: ${dTag?.[1]}`)
//   console.log(`  Name: ${nameTag?.[1]}`)
//   console.log(`  About: ${aboutTag?.[1]}`)
//   console.log(`  Status: ${isOpen ? 'Open' : 'Closed'}`)
// }

// Also fetch admin and member lists
const adminsFilter: Filter = {
  kinds: [39001],   // Group admins
  '#d': [GROUP_ID],
}

const membersFilter: Filter = {
  kinds: [39002],   // Group members
  '#d': [GROUP_ID],
}

console.log('Admins list filter:', JSON.stringify(adminsFilter))
console.log('Members list filter:', JSON.stringify(membersFilter))
console.log()

// Example admin list (kind 39001):
const exampleAdminList = {
  kind: 39001,
  tags: [
    ['d', GROUP_ID],
    ['p', adminPk, 'admin', 'add-user', 'remove-user', 'edit-metadata', 'delete-event'],
    // Each 'p' tag lists: pubkey, role, ...permissions
  ],
  content: '',
}

console.log('Example admin list (kind 39001):')
console.log(JSON.stringify(exampleAdminList, null, 2))
console.log()

// ============================================================================
// STEP 2: Join a Group (Kind 9021)
// ============================================================================
//
// To join a group, publish a kind 9021 event to the group's relay.
// The "h" tag identifies the group.
//
// For open groups, the relay automatically adds you.
// For closed groups, the relay queues a join request for admin approval.

console.log('--- STEP 2: Join a Group (kind 9021) ---')

const joinRequestTemplate: EventTemplate = {
  kind: 9021,
  created_at: now,
  tags: [
    ['h', GROUP_ID],   // The group to join
  ],
  content: '',  // Optional: include a message with your join request
}

const joinRequest: Event = finalizeEvent(joinRequestTemplate, newUserSk)

console.log('Join request (kind 9021):')
console.log(JSON.stringify({
  id: joinRequest.id.substring(0, 16) + '...',
  kind: joinRequest.kind,
  pubkey: joinRequest.pubkey.substring(0, 16) + '... (new user)',
  tags: joinRequest.tags,
  content: joinRequest.content || '(empty)',
}, null, 2))
console.log()
// {
//   "id": "def456...",
//   "kind": 9021,
//   "pubkey": "newuser_pk...",
//   "tags": [["h", "nostr-dev"]],
//   "content": ""
// }

console.log('For open groups: relay adds the user immediately.')
console.log('For closed groups: relay queues the request for admin approval.')
console.log()

// Leave request (kind 9022)
const leaveRequestTemplate: EventTemplate = {
  kind: 9022,
  created_at: now,
  tags: [
    ['h', GROUP_ID],
  ],
  content: '',
}

console.log('Leave request would be kind 9022 with the same structure.')
console.log()

// ============================================================================
// STEP 3: Send a Message (Kind 9)
// ============================================================================
//
// Group chat messages are kind 9. They MUST include an "h" tag
// identifying the group. The relay validates that the sender is
// a member before accepting the event.

console.log('--- STEP 3: Send a Message (kind 9) ---')

const chatMsgTemplate: EventTemplate = {
  kind: 9,
  created_at: now + 60,
  tags: [
    ['h', GROUP_ID],         // Required: identifies the group
  ],
  content: 'Hey everyone! Just joined the group. Excited to discuss NIP development!',
}

const chatMsg: Event = finalizeEvent(chatMsgTemplate, memberSk)

console.log('Group message (kind 9):')
console.log(JSON.stringify({
  id: chatMsg.id.substring(0, 16) + '...',
  kind: chatMsg.kind,
  pubkey: chatMsg.pubkey.substring(0, 16) + '... (member)',
  tags: chatMsg.tags,
  content: chatMsg.content,
}, null, 2))
console.log()
// {
//   "id": "ghi789...",
//   "kind": 9,
//   "pubkey": "member_pk...",
//   "tags": [["h", "nostr-dev"]],
//   "content": "Hey everyone! ..."
// }

// --- Reply to a message ---
// Use the "e" tag for threading, plus "h" for the group

const replyTemplate: EventTemplate = {
  kind: 9,
  created_at: now + 120,
  tags: [
    ['h', GROUP_ID],
    ['e', chatMsg.id, GROUP_RELAY, 'reply'],  // Reply to the previous message
    ['p', memberPk],                            // Mention the person being replied to
  ],
  content: 'Welcome! Check out the pinned resources to get started.',
}

const replyMsg: Event = finalizeEvent(replyTemplate, adminSk)

console.log('Reply message (kind 9 with reply tag):')
console.log(JSON.stringify({
  id: replyMsg.id.substring(0, 16) + '...',
  kind: replyMsg.kind,
  pubkey: replyMsg.pubkey.substring(0, 16) + '... (admin)',
  tags: replyMsg.tags.map(t => t[0] === 'e'
    ? [t[0], t[1].substring(0, 16) + '...', ...t.slice(2)]
    : t[0] === 'p'
    ? [t[0], t[1].substring(0, 16) + '...']
    : t
  ),
  content: replyMsg.content,
}, null, 2))
console.log()

// --- Thread root (kind 12) and thread reply (kind 10) ---

console.log('For longer discussions, use threaded conversations:')
console.log('  Kind 12 — Thread root (starts a topic)')
console.log('  Kind 10 — Thread reply (responds within a topic)')
console.log('  Kind 11 — Long-form group note')
console.log()

const threadRootTemplate: EventTemplate = {
  kind: 12,
  created_at: now + 180,
  tags: [
    ['h', GROUP_ID],
  ],
  content: 'Discussion: Should we deprecate NIP-04 DMs in favor of NIP-17?',
}

const threadRoot: Event = finalizeEvent(threadRootTemplate, adminSk)

const threadReplyTemplate: EventTemplate = {
  kind: 10,
  created_at: now + 240,
  tags: [
    ['h', GROUP_ID],
    ['e', threadRoot.id, GROUP_RELAY, 'root'],   // Reference the thread root
  ],
  content: 'Absolutely. NIP-04 has known metadata leakage issues. NIP-17 solves all of them.',
}

const threadReply: Event = finalizeEvent(threadReplyTemplate, memberSk)

console.log('Thread root (kind 12):', threadRoot.content)
console.log('Thread reply (kind 10):', threadReply.content)
console.log()

// ============================================================================
// STEP 4: Subscribe to Group Messages
// ============================================================================
//
// Subscribe to the group's relay for events tagged with the group ID.

console.log('--- STEP 4: Subscribe to Group Messages ---')
console.log()

// Chat messages
const chatFilter: Filter = {
  kinds: [9],
  '#h': [GROUP_ID],
}

// All group content (messages, threads, notes)
const allContentFilter: Filter = {
  kinds: [9, 10, 11, 12],
  '#h': [GROUP_ID],
}

// Group state (metadata, admin list, member list)
const stateFilter: Filter = {
  kinds: [39000, 39001, 39002],
  '#d': [GROUP_ID],
}

console.log('Chat messages filter:', JSON.stringify(chatFilter))
console.log('All content filter:', JSON.stringify(allContentFilter))
console.log('Group state filter:', JSON.stringify(stateFilter))
console.log()

console.log('In a real application:')
console.log()
console.log(`  const pool = new SimplePool()`)
console.log()
console.log(`  // Subscribe to group messages`)
console.log(`  pool.subscribeMany(`)
console.log(`    ['${GROUP_RELAY}'],  // NIP-29 groups live on a single relay`)
console.log(`    [`)
console.log(`      { kinds: [9, 10, 11, 12], '#h': ['${GROUP_ID}'] },`)
console.log(`      { kinds: [39000, 39001, 39002], '#d': ['${GROUP_ID}'] },`)
console.log(`    ],`)
console.log(`    {`)
console.log(`      onevent(event: Event) {`)
console.log(`        switch (event.kind) {`)
console.log(`          case 9:`)
console.log(`            console.log('Chat:', event.content)`)
console.log(`            break`)
console.log(`          case 10:`)
console.log(`            console.log('Thread reply:', event.content)`)
console.log(`            break`)
console.log(`          case 12:`)
console.log(`            console.log('Thread:', event.content)`)
console.log(`            break`)
console.log(`          case 39000:`)
console.log(`            console.log('Group metadata updated')`)
console.log(`            break`)
console.log(`        }`)
console.log(`      }`)
console.log(`    }`)
console.log(`  )`)
console.log()

// ============================================================================
// STEP 5: Group Admin Operations (Kind 9000-9009)
// ============================================================================
//
// Group admins can perform moderation and management actions using
// specific event kinds in the 9000-9009 range.

console.log('--- STEP 5: Group Admin Operations ---')
console.log()

// --- 9000: Add User ---

console.log('--- Kind 9000: Add User ---')

const addUserTemplate: EventTemplate = {
  kind: 9000,
  created_at: now + 300,
  tags: [
    ['h', GROUP_ID],
    ['p', newUserPk],       // User to add
  ],
  content: '',
}

const addUserEvent: Event = finalizeEvent(addUserTemplate, adminSk)

console.log('Add user event (kind 9000):')
console.log({
  kind: 9000,
  action: 'add-user',
  group: GROUP_ID,
  targetUser: newUserPk.substring(0, 16) + '...',
  signedBy: 'admin',
})
console.log()

// --- 9001: Remove User ---

console.log('--- Kind 9001: Remove User ---')

const removeUserTemplate: EventTemplate = {
  kind: 9001,
  created_at: now + 360,
  tags: [
    ['h', GROUP_ID],
    ['p', newUserPk],       // User to remove
  ],
  content: 'Violated group rules repeatedly.',
}

const removeUserEvent: Event = finalizeEvent(removeUserTemplate, adminSk)

console.log('Remove user event (kind 9001):')
console.log({
  kind: 9001,
  action: 'remove-user',
  group: GROUP_ID,
  targetUser: newUserPk.substring(0, 16) + '...',
  reason: removeUserEvent.content,
  signedBy: 'admin',
})
console.log()

// --- 9002: Edit Metadata ---

console.log('--- Kind 9002: Edit Group Metadata ---')

const editMetadataTemplate: EventTemplate = {
  kind: 9002,
  created_at: now + 420,
  tags: [
    ['h', GROUP_ID],
    ['name', 'NOSTR Protocol Dev'],
    ['about', 'Official discussion group for NOSTR protocol development and NIP review.'],
    ['picture', 'https://example.com/nostr-dev-v2.png'],
  ],
  content: '',
}

const editMetadataEvent: Event = finalizeEvent(editMetadataTemplate, adminSk)

console.log('Edit metadata event (kind 9002):')
console.log({
  kind: 9002,
  action: 'edit-metadata',
  group: GROUP_ID,
  newName: 'NOSTR Protocol Dev',
  signedBy: 'admin',
})
console.log()

// --- 9003: Delete Event ---

console.log('--- Kind 9003: Delete Event ---')

const deleteEventTemplate: EventTemplate = {
  kind: 9003,
  created_at: now + 480,
  tags: [
    ['h', GROUP_ID],
    ['e', chatMsg.id],   // Event to delete
  ],
  content: 'Off-topic content.',
}

const deleteEvent: Event = finalizeEvent(deleteEventTemplate, adminSk)

console.log('Delete event (kind 9003):')
console.log({
  kind: 9003,
  action: 'delete-event',
  group: GROUP_ID,
  deletedEvent: chatMsg.id.substring(0, 16) + '...',
  reason: 'Off-topic content.',
  signedBy: 'admin',
})
console.log()

// --- 9004: Edit Group Status ---

console.log('--- Kind 9004: Edit Group Status ---')

const editStatusTemplate: EventTemplate = {
  kind: 9004,
  created_at: now + 540,
  tags: [
    ['h', GROUP_ID],
    ['closed'],              // Change to closed group (requires approval to join)
    // ['open'] would make it open again
    // ['private'] hides the group from public listings
    // ['public'] makes it visible
  ],
  content: '',
}

const editStatusEvent: Event = finalizeEvent(editStatusTemplate, adminSk)

console.log('Edit status event (kind 9004):')
console.log({
  kind: 9004,
  action: 'edit-group-status',
  group: GROUP_ID,
  newStatus: 'closed',
  signedBy: 'admin',
})
console.log()

// --- 9005: Create Group ---

console.log('--- Kind 9005: Create Group ---')

const createGroupTemplate: EventTemplate = {
  kind: 9005,
  created_at: now + 600,
  tags: [
    ['h', 'nip-review'],   // New group ID
    ['name', 'NIP Review'],
    ['about', 'Review and discuss NIP proposals before they are merged.'],
    ['open'],
    ['public'],
  ],
  content: '',
}

const createGroupEvent: Event = finalizeEvent(createGroupTemplate, adminSk)

console.log('Create group event (kind 9005):')
console.log({
  kind: 9005,
  action: 'create-group',
  newGroupId: 'nip-review',
  name: 'NIP Review',
  signedBy: 'admin',
})
console.log()

// --- 9007: Create Invite ---

console.log('--- Kind 9007: Create Invite ---')

const createInviteTemplate: EventTemplate = {
  kind: 9007,
  created_at: now + 660,
  tags: [
    ['h', GROUP_ID],
  ],
  content: '',  // Relay generates the invite code
}

const createInviteEvent: Event = finalizeEvent(createInviteTemplate, adminSk)

console.log('Create invite event (kind 9007):')
console.log({
  kind: 9007,
  action: 'create-invite',
  group: GROUP_ID,
  signedBy: 'admin',
  note: 'Relay responds with an invite code for closed groups',
})
console.log()

// ============================================================================
// Summary
// ============================================================================

console.log('==========================================================')
console.log('  NIP-29 Event Kinds Summary')
console.log('==========================================================')
console.log()
console.log('USER EVENTS (sent by group members):')
console.log('  Kind 9     — Chat message')
console.log('  Kind 10    — Thread reply')
console.log('  Kind 11    — Long-form note')
console.log('  Kind 12    — Thread root')
console.log('  Kind 9021  — Join request')
console.log('  Kind 9022  — Leave request')
console.log()
console.log('ADMIN EVENTS (sent by group admins):')
console.log('  Kind 9000  — Add user')
console.log('  Kind 9001  — Remove user')
console.log('  Kind 9002  — Edit metadata')
console.log('  Kind 9003  — Delete event')
console.log('  Kind 9004  — Edit group status (open/closed, public/private)')
console.log('  Kind 9005  — Create group')
console.log('  Kind 9006  — Delete group')
console.log('  Kind 9007  — Create invite')
console.log()
console.log('RELAY-MANAGED STATE (published by the relay):')
console.log('  Kind 39000 — Group metadata')
console.log('  Kind 39001 — Admin list (pubkey + role + permissions)')
console.log('  Kind 39002 — Member list')
console.log()
console.log('KEY DIFFERENCES FROM NIP-28:')
console.log('  - Relay-enforced: relay rejects unauthorized events')
console.log('  - Membership required: must join before posting')
console.log('  - Role-based: admins have specific permissions')
console.log('  - Server-side moderation: deleted events are actually removed')
console.log('  - Group identity: groups live on a specific relay')
console.log()
console.log('All NIP-29 events MUST include an ["h", groupId] tag.')
console.log('Events are sent to the group\'s relay only.')
console.log()
console.log('Done.')
