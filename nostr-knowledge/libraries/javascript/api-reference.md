# nostr-tools API Reference

Quick-reference for the most commonly used functions and types in nostr-tools. Every code snippet is self-contained and copy-pasteable.

---

## Table of Contents

1. [Key Management](#key-management)
2. [Event Creation and Verification](#event-creation-and-verification)
3. [Relay Communication](#relay-communication)
4. [SimplePool](#simplepool)
5. [Filters](#filters)
6. [NIP-19: Bech32 Encoding](#nip-19-bech32-encoding)
7. [NIP-44: Encryption](#nip-44-encryption)
8. [NIP-17: Private Direct Messages](#nip-17-private-direct-messages)
9. [NIP-59: Gift Wraps](#nip-59-gift-wraps)
10. [NIP-05: Identity Verification](#nip-05-identity-verification)
11. [NIP-10: Thread Parsing](#nip-10-thread-parsing)
12. [NIP-27: Content Parsing](#nip-27-content-parsing)
13. [NIP-42: Relay Auth](#nip-42-relay-auth)
14. [NIP-47: Nostr Wallet Connect](#nip-47-nostr-wallet-connect)
15. [NIP-57: Zaps](#nip-57-zaps)
16. [NIP-98: HTTP Auth](#nip-98-http-auth)
17. [NIP-13: Proof of Work](#nip-13-proof-of-work)
18. [Event Kinds](#event-kinds)

---

## Key Management

```typescript
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

// Generate a new keypair
const sk: Uint8Array = generateSecretKey()
const pk: string = getPublicKey(sk)

console.log('Secret key (hex):', bytesToHex(sk))
console.log('Public key (hex):', pk)

// Convert hex secret key back to Uint8Array
const skFromHex: Uint8Array = hexToBytes('your_hex_secret_key')
```

| Function | Input | Output |
|---|---|---|
| `generateSecretKey()` | (none) | `Uint8Array` (32 bytes) |
| `getPublicKey(sk)` | `Uint8Array` | `string` (64-char hex) |

---

## Event Creation and Verification

```typescript
import { finalizeEvent, verifyEvent, serializeEvent, getEventHash } from 'nostr-tools/pure'
import type { EventTemplate, Event, VerifiedEvent } from 'nostr-tools/pure'

// Create and sign an event
const template: EventTemplate = {
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello from nostr-tools!',
}

const signedEvent: VerifiedEvent = finalizeEvent(template, sk)

// signedEvent now has: id, pubkey, sig, kind, created_at, tags, content

// Verify any event
if (verifyEvent(signedEvent)) {
  console.log('Event is valid')  // TypeScript narrows to VerifiedEvent
}

// Lower-level: serialize and hash manually
const serialized: string = serializeEvent(unsignedEvent)
const eventId: string = getEventHash(unsignedEvent)
```

| Function | Input | Output |
|---|---|---|
| `finalizeEvent(template, sk)` | `EventTemplate`, `Uint8Array` | `VerifiedEvent` |
| `verifyEvent(event)` | `Event` | `boolean` (type guard to `VerifiedEvent`) |
| `serializeEvent(event)` | `UnsignedEvent` | `string` (canonical JSON) |
| `getEventHash(event)` | `UnsignedEvent` | `string` (hex SHA-256) |

---

## Relay Communication

### Single Relay

```typescript
import { Relay } from 'nostr-tools/relay'

const relay = await Relay.connect('wss://relay.damus.io')

// Subscribe
const sub = relay.subscribe(
  [{ kinds: [1], limit: 5 }],
  {
    onevent(event) {
      console.log('Event:', event.id, event.content)
    },
    oneose() {
      console.log('End of stored events')
      sub.close()
    },
  }
)

// Publish
const okMessage = await relay.publish(signedEvent)
console.log('Relay accepted:', okMessage)

// Close connection
relay.close()
```

### Key Relay Properties

| Property | Type | Description |
|---|---|---|
| `relay.url` | `string` | Normalized WebSocket URL |
| `relay.connected` | `boolean` | Connection status |
| `relay.openSubs` | `Map` | Active subscriptions |

### Key Relay Methods

| Method | Returns | Description |
|---|---|---|
| `Relay.connect(url)` | `Promise<Relay>` | Static factory, connects immediately |
| `relay.subscribe(filters, params)` | `Subscription` | Start receiving events |
| `relay.publish(event)` | `Promise<string>` | Send event, resolves on OK |
| `relay.auth(signer)` | `Promise<string>` | NIP-42 authentication |
| `relay.count(filters)` | `Promise<number>` | NIP-45 event count |
| `relay.close()` | `void` | Close WebSocket |

---

## SimplePool

```typescript
import { SimplePool } from 'nostr-tools/pool'

const pool = new SimplePool({ enablePing: true, enableReconnect: true })
const relays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social']

// --- Subscribe to live events ---
const sub = pool.subscribeMany(
  relays,
  [{ kinds: [1], limit: 20 }],
  {
    onevent(event) { console.log(event.content) },
    oneose() { console.log('caught up') },
  }
)
sub.close()  // when done

// --- Fetch events and close automatically on EOSE ---
pool.subscribeManyEose(
  relays,
  [{ kinds: [0], authors: [pubkey] }],
  {
    onevent(event) { console.log('profile:', event.content) },
    onclose() { console.log('done') },
  }
)

// --- Query and await results ---
const events: Event[] = await pool.querySync(relays, { kinds: [1], authors: [pk], limit: 10 })

// --- Get a single event ---
const event: Event | null = await pool.get(relays, { ids: [eventId] })

// --- Publish ---
const promises = pool.publish(relays, signedEvent)
await Promise.any(promises)    // at least one relay accepted
// or
await Promise.allSettled(promises)  // wait for all

// --- Cleanup ---
pool.destroy()
```

### Pool Methods Summary

| Method | Returns | Description |
|---|---|---|
| `subscribeMany(relays, filters, params)` | `SubCloser` | Persistent subscription |
| `subscribeManyEose(relays, filters, params)` | `SubCloser` | Auto-closes on EOSE |
| `querySync(relays, filter, params?)` | `Promise<Event[]>` | Fetch and return events |
| `get(relays, filter, params?)` | `Promise<Event \| null>` | Fetch single event |
| `publish(relays, event)` | `Promise<string>[]` | Publish to multiple relays |
| `ensureRelay(url)` | `Promise<AbstractRelay>` | Get or create connection |
| `close(relays)` | `void` | Close specific relay connections |
| `destroy()` | `void` | Close all connections |
| `listConnectionStatus()` | `Map<string, boolean>` | Relay connection states |
| `pruneIdleRelays(ms?)` | `string[]` | Close idle relay connections |

---

## Filters

```typescript
import { matchFilter, matchFilters, mergeFilters, getFilterLimit } from 'nostr-tools/filter'
import type { Filter } from 'nostr-tools/filter'

// Construct filters
const noteFilter: Filter = { kinds: [1], authors: [pk], limit: 50 }
const tagFilter: Filter = { kinds: [1], '#t': ['bitcoin', 'nostr'] }
const timeFilter: Filter = { kinds: [1], since: 1700000000, until: 1700100000 }
const searchFilter: Filter = { kinds: [1], search: 'lightning network', limit: 20 }

// Local matching
matchFilter(noteFilter, event)            // boolean
matchFilters([noteFilter, tagFilter], event)  // boolean (OR logic)

// Merge filters
const merged: Filter = mergeFilters(noteFilter, tagFilter)

// Intrinsic limit calculation
const limit: number = getFilterLimit(noteFilter)  // 50 or Infinity
```

---

## NIP-19: Bech32 Encoding

```typescript
import * as nip19 from 'nostr-tools/nip19'

// Encode
const npub: string    = nip19.npubEncode(pubkeyHex)
const nsec: string    = nip19.nsecEncode(secretKeyBytes)
const note: string    = nip19.noteEncode(eventIdHex)
const nprofile: string = nip19.nprofileEncode({ pubkey: hex, relays: ['wss://...'] })
const nevent: string   = nip19.neventEncode({ id: hex, relays: ['wss://...'], author: hex })
const naddr: string    = nip19.naddrEncode({ identifier: 'slug', pubkey: hex, kind: 30023, relays: [] })

// Decode (discriminated union)
const decoded = nip19.decode(anyBech32String)
switch (decoded.type) {
  case 'npub':     decoded.data  // string (hex pubkey)
  case 'nsec':     decoded.data  // Uint8Array (secret key bytes)
  case 'note':     decoded.data  // string (hex event id)
  case 'nprofile': decoded.data  // { pubkey, relays? }
  case 'nevent':   decoded.data  // { id, relays?, author?, kind? }
  case 'naddr':    decoded.data  // { identifier, pubkey, kind, relays? }
}

// Decode nostr: URI
const fromUri = nip19.decodeNostrURI('nostr:npub1abc...')

// Type guards
nip19.NostrTypeGuard.isNPub(str)
nip19.NostrTypeGuard.isNSec(str)
nip19.NostrTypeGuard.isNote(str)
nip19.NostrTypeGuard.isNProfile(str)
nip19.NostrTypeGuard.isNEvent(str)
nip19.NostrTypeGuard.isNAddr(str)

// Regex for matching bech32 nostr entities
nip19.BECH32_REGEX
```

---

## NIP-44: Encryption

```typescript
import * as nip44 from 'nostr-tools/nip44'

// Derive conversation key (reuse for multiple messages with same pair)
const ck: Uint8Array = nip44.v2.utils.getConversationKey(senderSk, recipientPubkey)

// Encrypt -> base64 string
const ciphertext: string = nip44.v2.encrypt('Secret message', ck)

// Decrypt -> plaintext string
const plaintext: string = nip44.v2.decrypt(ciphertext, ck)

// Calculate padded length (useful for size estimation)
const paddedLen: number = nip44.v2.utils.calcPaddedLen(messageLength)
```

| Function | Input | Output |
|---|---|---|
| `v2.utils.getConversationKey(sk, pk)` | `Uint8Array`, `string` | `Uint8Array` (32 bytes) |
| `v2.encrypt(text, ck, nonce?)` | `string`, `Uint8Array`, `Uint8Array?` | `string` (base64) |
| `v2.decrypt(payload, ck)` | `string`, `Uint8Array` | `string` |

---

## NIP-17: Private Direct Messages

```typescript
import * as nip17 from 'nostr-tools/nip17'
import type { Recipient, ReplyTo } from 'nostr-tools/nip17'

const recipient: Recipient = {
  publicKey: recipientPubkeyHex,
  relayUrl: 'wss://relay.example.com',  // optional
}

// Wrap a single DM (returns events for recipient + sender copy)
const wraps = nip17.wrapEvent(senderSk, recipient, 'Hello privately!')

// With subject and reply
const wrapsWithMeta = nip17.wrapEvent(
  senderSk,
  recipient,
  'Replying to your message',
  'Thread subject',                           // optional subject
  { eventId: 'abc123...', relayUrl: 'wss://...' },  // optional reply-to
)

// Group DM: wrap for multiple recipients
const groupWraps = nip17.wrapManyEvents(senderSk, [recipient1, recipient2], 'Hello group!')

// Unwrap a received gift wrap
const rumor = nip17.unwrapEvent(giftWrapEvent, recipientSk)

// Unwrap many, sorted chronologically
const messages = nip17.unwrapManyEvents(wrappedEvents, recipientSk)
```

---

## NIP-59: Gift Wraps

```typescript
import * as nip59 from 'nostr-tools/nip59'

// Three-layer wrapping
const rumor = nip59.createRumor(eventData, senderSk)
const seal = nip59.createSeal(rumor, senderSk, recipientPubkey)
const wrap = nip59.createWrap(seal, recipientPubkey)

// All-in-one
const giftWrap = nip59.wrapEvent(rumor, senderSk, recipientPubkey)

// Multiple recipients
const wraps = nip59.wrapManyEvents(rumor, senderSk, [pubkey1, pubkey2])

// Unwrap
const original = nip59.unwrapEvent(giftWrapEvent, recipientSk)
const sorted = nip59.unwrapManyEvents(wrappedEvents, recipientSk)
```

---

## NIP-05: Identity Verification

```typescript
import * as nip05 from 'nostr-tools/nip05'

// Resolve identifier to profile
const profile = await nip05.queryProfile('user@example.com')
// { pubkey: 'hex...', relays: ['wss://...'] } | null

// Validate ownership
const valid: boolean = await nip05.isValid(pubkeyHex, 'user@example.com')

// Search a domain
const users = await nip05.searchDomain('example.com', 'query')
// { username: 'pubkeyhex', ... }

// Type guard
nip05.isNip05('user@domain.com')  // boolean (type narrows to Nip05)
```

---

## NIP-10: Thread Parsing

```typescript
import * as nip10 from 'nostr-tools/nip10'

const thread = nip10.parse(event)

thread.root     // EventPointer | undefined  -- thread root
thread.reply    // EventPointer | undefined  -- direct parent
thread.mentions // EventPointer[]           -- mentioned events
thread.quotes   // EventPointer[]           -- quoted events
thread.profiles // ProfilePointer[]         -- involved pubkeys
```

---

## NIP-27: Content Parsing

```typescript
import * as nip27 from 'nostr-tools/nip27'

// Returns a generator of Block objects
for (const block of nip27.parse(event)) {
  // block.type: 'text' | 'reference' | 'url' | 'image' | 'video' | 'audio'
  //           | 'emoji' | 'hashtag' | 'relay'
}
```

---

## NIP-42: Relay Auth

```typescript
import * as nip42 from 'nostr-tools/nip42'

// Create auth event template (kind 22242)
const authTemplate = nip42.makeAuthEvent('wss://relay.example.com', challengeString)
const authEvent = finalizeEvent(authTemplate, sk)

// Or use relay's built-in method
await relay.auth(async (evt) => finalizeEvent(evt, sk))
```

---

## NIP-47: Nostr Wallet Connect

```typescript
import * as nip47 from 'nostr-tools/nip47'

// Parse connection string
const conn = nip47.parseConnectionString('nostr+walletconnect://pubkey?relay=wss://...&secret=hex')
// { pubkey: string, relay: string, relays: string[], secret: string }

// Create payment request
const payEvent = await nip47.makeNwcRequestEvent(conn.pubkey, hexToBytes(conn.secret), bolt11Invoice)
```

---

## NIP-57: Zaps

```typescript
import * as nip57 from 'nostr-tools/nip57'

// Get zap endpoint from user metadata
const endpoint: string | null = await nip57.getZapEndpoint(metadataEvent)

// Create zap request (kind 9734)
const zapReq = nip57.makeZapRequest({
  pubkey: recipientPk,
  amount: 21000,  // millisatoshis
  relays: ['wss://relay.damus.io'],
  comment: 'Great post!',
})

// Validate zap request
const error: string | null = nip57.validateZapRequest(JSON.stringify(zapReqEvent))

// Create zap receipt (kind 9735)
const receipt = nip57.makeZapReceipt({ zapRequest: jsonStr, bolt11: 'lnbc...' })

// Parse sats from invoice
const sats: number = nip57.getSatoshisAmountFromBolt11('lnbc50n1...')
```

---

## NIP-98: HTTP Auth

```typescript
import * as nip98 from 'nostr-tools/nip98'

// Generate auth token
const token = await nip98.getToken(
  'https://api.example.com/upload',
  'POST',
  async (evt) => finalizeEvent(evt, sk),
  true,  // include 'Nostr' scheme prefix
)
// Use: fetch(url, { headers: { Authorization: `Nostr ${token}` } })

// Validate token (server-side)
const valid = await nip98.validateToken(token, url, 'POST')

// Granular validation
const event = await nip98.unpackEventFromToken(token)
nip98.validateEventTimestamp(event)
nip98.validateEventKind(event)
nip98.validateEventUrlTag(event, url)
nip98.validateEventMethodTag(event, 'POST')
nip98.validateEventPayloadTag(event, payload)

// Hash a payload for inclusion
const hash: string = await nip98.hashPayload(payloadObject)
```

---

## NIP-13: Proof of Work

```typescript
import * as nip13 from 'nostr-tools/nip13'

// Check difficulty
const pow: number = nip13.getPow(event.id)

// Mine (CPU-intensive, run in a Worker)
const mined = nip13.minePow(unsignedEvent, targetDifficulty)
// Adds tag: ['nonce', iterationCount, targetDifficulty]
```

---

## Event Kinds

```typescript
import {
  Metadata,              // 0
  ShortTextNote,         // 1
  Contacts,              // 3
  EncryptedDirectMessage, // 4 (deprecated, use PrivateDirectMessage)
  EventDeletion,         // 5
  Repost,                // 6
  Reaction,              // 7
  Seal,                  // 13
  PrivateDirectMessage,  // 14
  GiftWrap,              // 1059
  ZapRequest,            // 9734
  Zap,                   // 9735
  RelayList,             // 10002
  ClientAuth,            // 22242
  HTTPAuth,              // 27235
  LongFormArticle,       // 30023
} from 'nostr-tools/kinds'
```

See the [full kinds list](./nostr-tools.md#event-kind-constants) for all 80+ exported constants.
