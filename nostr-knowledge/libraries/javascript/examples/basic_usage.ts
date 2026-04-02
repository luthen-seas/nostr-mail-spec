/**
 * basic_usage.ts
 *
 * Demonstrates the fundamental nostr-tools operations:
 *   1. Key generation
 *   2. Event creation and signing
 *   3. Connecting to relays via SimplePool
 *   4. Publishing events
 *   5. Subscribing to events
 *   6. Querying events
 *
 * Install:
 *   npm install nostr-tools ws
 *
 * Run:
 *   npx tsx basic_usage.ts
 */

import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { ShortTextNote, Metadata, Reaction } from 'nostr-tools/kinds'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex } from '@noble/hashes/utils'
import type { Event, VerifiedEvent, EventTemplate } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

// ---------------------------------------------------------------------------
// 1. Key Generation
// ---------------------------------------------------------------------------

const sk = generateSecretKey() // Uint8Array (32 bytes)
const pk = getPublicKey(sk) // hex string (64 chars)

console.log('=== Key Generation ===')
console.log('Secret key (hex):', bytesToHex(sk))
console.log('Public key (hex):', pk)
console.log('npub:', nip19.npubEncode(pk))
console.log('nsec:', nip19.nsecEncode(sk))
console.log()

// ---------------------------------------------------------------------------
// 2. Event Creation -- Text Note (Kind 1)
// ---------------------------------------------------------------------------

const noteTemplate: EventTemplate = {
  kind: ShortTextNote, // 1
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['t', 'nostr'], // hashtag
    ['t', 'hello'],
  ],
  content: 'Hello from nostr-tools! This is my first note.',
}

const signedNote: VerifiedEvent = finalizeEvent(noteTemplate, sk)

console.log('=== Signed Event ===')
console.log('Event ID:', signedNote.id)
console.log('Pubkey:', signedNote.pubkey)
console.log('Content:', signedNote.content)
console.log('Signature:', signedNote.sig.substring(0, 32) + '...')
console.log()

// ---------------------------------------------------------------------------
// 3. Event Verification
// ---------------------------------------------------------------------------

const isValid = verifyEvent(signedNote)
console.log('=== Verification ===')
console.log('Event is valid:', isValid)
console.log()

// ---------------------------------------------------------------------------
// 4. Profile Metadata (Kind 0)
// ---------------------------------------------------------------------------

const profileEvent = finalizeEvent(
  {
    kind: Metadata, // 0
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      name: 'nostr-tools-demo',
      about: 'A demo account created with nostr-tools',
      picture: 'https://robohash.org/nostr-tools-demo',
      nip05: 'demo@example.com',
    }),
  },
  sk,
)

console.log('=== Profile Event ===')
console.log('Profile event ID:', profileEvent.id)
console.log()

// ---------------------------------------------------------------------------
// 5. Relay Communication with SimplePool
// ---------------------------------------------------------------------------

async function main() {
  const pool = new SimplePool({
    enablePing: true, // heartbeat to detect dead connections
    enableReconnect: true, // auto-reconnect with backoff
  })

  const relays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social']

  // --- 5a. Publish the note ---
  console.log('=== Publishing ===')
  try {
    const pubPromises = pool.publish(relays, signedNote)
    // Wait for at least one relay to accept
    const firstOk = await Promise.any(pubPromises)
    console.log('Event accepted by at least one relay:', firstOk)
  } catch (err) {
    console.log('Publishing failed on all relays:', err)
  }
  console.log()

  // --- 5b. Query events (await results) ---
  console.log('=== Querying Events (querySync) ===')
  const recentNotes = await pool.querySync(relays, {
    kinds: [ShortTextNote],
    limit: 5,
  })
  console.log(`Fetched ${recentNotes.length} recent notes`)
  for (const note of recentNotes) {
    console.log(`  [${note.id.substring(0, 8)}] ${note.content.substring(0, 80)}`)
  }
  console.log()

  // --- 5c. Get a single event by ID ---
  console.log('=== Get Single Event ===')
  if (recentNotes.length > 0) {
    const fetched = await pool.get(relays, { ids: [recentNotes[0].id] })
    if (fetched) {
      console.log('Fetched event:', fetched.id)
    }
  }
  console.log()

  // --- 5d. Subscribe to live events ---
  console.log('=== Live Subscription (5 seconds) ===')
  let eventCount = 0

  const sub = pool.subscribeMany(relays, [{ kinds: [ShortTextNote], limit: 10 }], {
    onevent(event: Event) {
      eventCount++
      console.log(`  Event #${eventCount}: ${event.content.substring(0, 60)}...`)
    },
    oneose() {
      console.log('  (end of stored events)')
    },
  })

  // Keep the subscription open for 5 seconds, then close
  await new Promise((resolve) => setTimeout(resolve, 5000))
  sub.close()
  console.log(`Received ${eventCount} events in 5 seconds`)
  console.log()

  // --- 5e. Subscribe with auto-close on EOSE ---
  console.log('=== Fetch with EOSE auto-close ===')
  const collected: Event[] = []

  await new Promise<void>((resolve) => {
    pool.subscribeManyEose(
      relays,
      [{ kinds: [Metadata], limit: 3 }],
      {
        onevent(event: Event) {
          collected.push(event)
        },
        onclose() {
          console.log(`Collected ${collected.length} profile events`)
          resolve()
        },
      },
    )
  })
  console.log()

  // --- 5f. Create and publish a reaction ---
  if (recentNotes.length > 0) {
    const target = recentNotes[0]
    const reactionEvent = finalizeEvent(
      {
        kind: Reaction, // 7
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', target.id],
          ['p', target.pubkey],
        ],
        content: '+',
      },
      sk,
    )
    console.log('=== Reaction Event ===')
    console.log('Reacting to event:', target.id.substring(0, 16))
    console.log('Reaction event ID:', reactionEvent.id)
  }

  // --- 5g. Check connection status ---
  console.log()
  console.log('=== Connection Status ===')
  const status = pool.listConnectionStatus()
  for (const [url, connected] of status) {
    console.log(`  ${url}: ${connected ? 'connected' : 'disconnected'}`)
  }

  // --- Cleanup ---
  pool.destroy()
  console.log()
  console.log('Done. Pool destroyed.')
}

main().catch(console.error)
