# nostr-tools Deep Dive

**nostr-tools** is the definitive JavaScript/TypeScript library for the NOSTR protocol. Maintained by fiatjaf (nbd-wtf), it provides the low-level building blocks for key management, event creation and verification, relay communication, and protocol extension (NIP) support.

- **Repository:** https://github.com/nbd-wtf/nostr-tools
- **npm:** `nostr-tools`
- **JSR:** `@nostr/tools`
- **Version:** 2.23.x (as of early 2026)
- **License:** Unlicense
- **Dependencies:** `@noble/curves`, `@noble/hashes`, `@noble/ciphers`, `@scure/base`, `@scure/bip32`, `@scure/bip39`, `nostr-wasm`

---

## Table of Contents

1. [Package Structure and Imports](#package-structure-and-imports)
2. [Core Exports](#core-exports)
3. [TypeScript Types](#typescript-types)
4. [Event Creation Patterns](#event-creation-patterns)
5. [Relay Communication](#relay-communication)
6. [SimplePool](#simplepool)
7. [Filter Construction and Subscriptions](#filter-construction-and-subscriptions)
8. [NIP-Specific Modules](#nip-specific-modules)
9. [WASM Acceleration](#wasm-acceleration)
10. [Bundle Size Considerations](#bundle-size-considerations)
11. [Version History](#version-history)

---

## Package Structure and Imports

nostr-tools v2 is fully tree-shakeable. Every module is a separate entry point -- you import only what you need, and bundlers can eliminate the rest.

### Import Patterns

```typescript
// Core event functions (pure JS crypto)
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'

// WASM-accelerated alternative (6.8x faster verification)
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/wasm'

// Relay communication
import { Relay } from 'nostr-tools/relay'
import { SimplePool } from 'nostr-tools/pool'

// Abstract base classes (for custom implementations)
import { AbstractRelay } from 'nostr-tools/abstract-relay'
import { AbstractSimplePool } from 'nostr-tools/abstract-pool'

// Event kinds as constants
import { ShortTextNote, Metadata, Contacts, Reaction } from 'nostr-tools/kinds'

// Filter utilities
import { matchFilter, matchFilters, mergeFilters } from 'nostr-tools/filter'

// Individual NIP modules
import * as nip04 from 'nostr-tools/nip04'
import * as nip05 from 'nostr-tools/nip05'
import * as nip10 from 'nostr-tools/nip10'
import * as nip13 from 'nostr-tools/nip13'
import * as nip17 from 'nostr-tools/nip17'
import * as nip19 from 'nostr-tools/nip19'
import * as nip27 from 'nostr-tools/nip27'
import * as nip42 from 'nostr-tools/nip42'
import * as nip44 from 'nostr-tools/nip44'
import * as nip47 from 'nostr-tools/nip47'
import * as nip57 from 'nostr-tools/nip57'
import * as nip59 from 'nostr-tools/nip59'
import * as nip98 from 'nostr-tools/nip98'

// Utilities
import { normalizeURL } from 'nostr-tools/utils'
```

### Full Module Map

The `package.json` exports field defines the following entry points:

| Entry Point | Purpose |
|---|---|
| `nostr-tools/pure` | Core functions with pure JS crypto |
| `nostr-tools/wasm` | Core functions with WASM crypto (faster) |
| `nostr-tools/core` | Low-level types and validation |
| `nostr-tools/kinds` | Event kind constants |
| `nostr-tools/filter` | Filter matching and merging |
| `nostr-tools/relay` | Single relay connection (Relay class) |
| `nostr-tools/pool` | Multi-relay pool (SimplePool class) |
| `nostr-tools/abstract-relay` | AbstractRelay base class |
| `nostr-tools/abstract-pool` | AbstractSimplePool base class |
| `nostr-tools/signer` | Signer utilities |
| `nostr-tools/utils` | URL normalization, misc helpers |
| `nostr-tools/references` | Legacy reference parsing |
| `nostr-tools/fakejson` | Minimal JSON parsing |
| `nostr-tools/nip04` through `nostr-tools/nip99` | Individual NIP modules |

---

## Core Exports

The `nostr-tools/pure` module (or `nostr-tools/wasm`) provides the essential cryptographic operations:

### generateSecretKey

```typescript
function generateSecretKey(): Uint8Array
```

Generates a cryptographically random 32-byte secret key. Returns raw bytes, not a hex string (changed in v2.0).

### getPublicKey

```typescript
function getPublicKey(secretKey: Uint8Array): string
```

Derives the secp256k1 public key from a secret key. Accepts `Uint8Array`, returns a 64-character hex string.

### finalizeEvent

```typescript
function finalizeEvent(t: EventTemplate, secretKey: Uint8Array): VerifiedEvent
```

Takes an `EventTemplate` (with `kind`, `created_at`, `tags`, `content`) and a secret key. Computes the `pubkey`, serializes the event, generates the `id` (SHA-256 hash), signs it with Schnorr, and returns a complete `VerifiedEvent`.

### verifyEvent

```typescript
function verifyEvent(event: Event): event is VerifiedEvent
```

Type guard that validates:
1. The event `id` matches `SHA256(serialize(event))`
2. The `sig` is a valid Schnorr signature over the `id` by the `pubkey`

Returns `true` and narrows the type to `VerifiedEvent`.

### serializeEvent

```typescript
function serializeEvent(evt: UnsignedEvent): string
```

Serializes an event to the canonical JSON array format used for hashing: `[0, pubkey, created_at, kind, tags, content]`.

### getEventHash

```typescript
function getEventHash(event: UnsignedEvent): string
```

Computes the SHA-256 hash of the serialized event, returning the hex event ID.

---

## TypeScript Types

All core types are defined in `nostr-tools/core` and re-exported from `nostr-tools/pure`:

### EventTemplate

```typescript
interface EventTemplate {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}
```

The minimum structure you provide before signing. Does not include `pubkey`, `id`, or `sig`.

### UnsignedEvent

```typescript
interface UnsignedEvent extends EventTemplate {
  pubkey: string
}
```

An event with a pubkey but no id or signature.

### Event

```typescript
interface Event extends UnsignedEvent {
  id: string
  sig: string
}
```

A complete NOSTR event with all fields.

### VerifiedEvent

```typescript
interface VerifiedEvent extends Event {
  [verifiedSymbol]: true
}
```

An event that has passed `verifyEvent()`. The branded `verifiedSymbol` property lets TypeScript track verification status through your code.

### Filter

```typescript
interface Filter {
  ids?: string[]
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  search?: string
  [key: `#${string}`]: string[] | undefined  // tag filters
}
```

Used for querying relays (REQ messages) and for local event matching.

---

## Event Creation Patterns

### Basic Note (Kind 1)

```typescript
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { ShortTextNote } from 'nostr-tools/kinds'

const sk = generateSecretKey()

const event = finalizeEvent({
  kind: ShortTextNote,        // 1
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello NOSTR!',
}, sk)
```

### Reply to Another Event

```typescript
const reply = finalizeEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['e', parentEventId, '', 'root'],   // root of thread
    ['e', replyToEventId, '', 'reply'], // direct parent
    ['p', parentAuthorPubkey],          // notify parent author
  ],
  content: 'Great point!',
}, sk)
```

### Profile Metadata (Kind 0)

```typescript
import { Metadata } from 'nostr-tools/kinds'

const metadata = finalizeEvent({
  kind: Metadata,  // 0
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: JSON.stringify({
    name: 'satoshi',
    about: 'Creator of Bitcoin',
    picture: 'https://example.com/avatar.jpg',
    nip05: 'satoshi@example.com',
    lud16: 'satoshi@getalby.com',
  }),
}, sk)
```

### Reaction (Kind 7)

```typescript
import { Reaction } from 'nostr-tools/kinds'

const reaction = finalizeEvent({
  kind: Reaction,  // 7
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['e', targetEventId],
    ['p', targetAuthorPubkey],
  ],
  content: '+',  // or emoji like "🤙"
}, sk)
```

### Contact List (Kind 3)

```typescript
import { Contacts } from 'nostr-tools/kinds'

const contacts = finalizeEvent({
  kind: Contacts,  // 3
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['p', pubkey1, 'wss://relay.example.com', 'alice'],
    ['p', pubkey2, 'wss://relay.example.com', 'bob'],
  ],
  content: '',
}, sk)
```

### Deletion (Kind 5)

```typescript
import { EventDeletion } from 'nostr-tools/kinds'

const deletion = finalizeEvent({
  kind: EventDeletion,  // 5
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['e', eventIdToDelete],
  ],
  content: 'posted by mistake',
}, sk)
```

---

## Relay Communication

### The Relay Class

`Relay` wraps a single WebSocket connection to a NOSTR relay.

```typescript
import { Relay } from 'nostr-tools/relay'

// Connect to a single relay
const relay = await Relay.connect('wss://relay.damus.io')

// Subscribe to events
const sub = relay.subscribe(
  [{ kinds: [1], limit: 10 }],
  {
    onevent(event) {
      console.log('received event:', event.id)
    },
    oneose() {
      console.log('end of stored events')
    },
    onclose(reason) {
      console.log('subscription closed:', reason)
    },
  }
)

// Publish an event
await relay.publish(signedEvent)

// Close
sub.close()
relay.close()
```

### AbstractRelay

The `AbstractRelay` class (from `nostr-tools/abstract-relay`) is the base implementation. `Relay` extends it with a concrete WebSocket implementation and event verifier.

Key properties:

| Property | Type | Description |
|---|---|---|
| `url` | `string` | Normalized relay WebSocket URL |
| `connected` | `boolean` | Current connection status |
| `openSubs` | `Map<string, Subscription>` | Active subscriptions |
| `baseEoseTimeout` | `number` | Timeout for EOSE (ms) |
| `publishTimeout` | `number` | Timeout for OK response (ms) |
| `enablePing` | `boolean` | Send periodic pings |
| `enableReconnect` | `boolean` | Auto-reconnect with exponential backoff |

Key methods:

| Method | Description |
|---|---|
| `connect(opts?)` | Establish WebSocket connection |
| `subscribe(filters, params)` | Create a subscription, returns `Subscription` object |
| `prepareSubscription(filters, params)` | Create subscription without sending (call `.fire()` later) |
| `publish(event)` | Send event, returns Promise resolving to "ok" or rejection |
| `auth(signAuthEvent)` | Perform NIP-42 authentication |
| `count(filters, params)` | Request event count (NIP-45) |
| `close()` | Close the WebSocket connection |

### Subscription Object

```typescript
interface Subscription {
  relay: AbstractRelay
  id: string
  filters: Filter[]
  eosed: boolean
  onevent: (evt: Event) => void
  oneose?: () => void
  onclose?: (reason: string) => void
  fire(): void
  close(reason?: string): void
}
```

---

## SimplePool

`SimplePool` manages connections to multiple relays simultaneously. It is the recommended way to interact with the NOSTR network.

```typescript
import { SimplePool } from 'nostr-tools/pool'

const pool = new SimplePool({
  enablePing: true,       // heartbeat to detect dead connections
  enableReconnect: true,  // auto-reconnect with exponential backoff
})

const relays = [
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nos.lol',
]
```

### Constructor Options

```typescript
interface PoolConstructorOptions {
  enablePing?: boolean        // default: false
  enableReconnect?: boolean   // default: false
}
```

Both `enablePing: true` and `enableReconnect: true` are recommended for production use.

### Core Methods

#### subscribeMany / subscribe

Subscribe to events across multiple relays:

```typescript
const sub = pool.subscribeMany(
  relays,
  [{ kinds: [1], authors: [myPubkey], limit: 50 }],
  {
    onevent(event) {
      console.log('got event:', event.id)
    },
    oneose() {
      console.log('all relays sent EOSE')
    },
    onclose(reasons) {
      console.log('closed:', reasons)
    },
  }
)

// Later: close the subscription
sub.close()
```

`subscribe()` is an alias for `subscribeMany()`.

#### subscribeManyEose / subscribeEose

Like `subscribeMany`, but automatically closes when all relays have sent EOSE:

```typescript
pool.subscribeManyEose(
  relays,
  [{ kinds: [0], authors: [pubkey] }],
  {
    onevent(event) {
      // Process profile metadata
    },
    onclose(reasons) {
      console.log('done fetching')
    },
  }
)
```

#### querySync

Fetch events synchronously (returns a Promise):

```typescript
const events = await pool.querySync(relays, {
  kinds: [1],
  authors: [pubkey],
  limit: 20,
})
```

#### get

Fetch a single event (returns the first match):

```typescript
const event = await pool.get(relays, {
  ids: [eventId],
})
```

#### publish

Publish an event to multiple relays:

```typescript
// Returns an array of Promises, one per relay
const results = pool.publish(relays, signedEvent)

// Wait for at least one relay to accept
await Promise.any(results)

// Or wait for all relays
await Promise.allSettled(results)
```

#### ensureRelay

Get or create a connection to a specific relay:

```typescript
const relay = await pool.ensureRelay('wss://relay.damus.io')
```

#### Other Methods

| Method | Description |
|---|---|
| `close(relays)` | Close connections to specific relays |
| `destroy()` | Close all connections and clean up |
| `listConnectionStatus()` | Returns `Map<string, boolean>` of relay connection states |
| `pruneIdleRelays(idleThresholdMs?)` | Close relays with no active subscriptions |

### Advanced Pool Configuration

The `AbstractSimplePool` exposes additional options:

```typescript
// Track which relays returned each event
pool.trackRelays = true
// After receiving events:
const relaySet = pool.seenOn.get(eventId)  // Set<AbstractRelay>

// Skip event verification for trusted relays (performance optimization)
pool.trustedRelayURLs = new Set(['wss://relay.damus.io'])

// Custom relay connection filtering
pool.allowConnectingToRelay = (url, operation) => {
  // operation is ['read', Filter[]] or ['write', Event]
  return !blockedRelays.has(url)
}

// Auto-auth with relays (NIP-42)
pool.automaticallyAuth = (relayURL) => {
  return async (authEvent) => finalizeEvent(authEvent, sk)
}
```

---

## Filter Construction and Subscriptions

### Filter Structure

Filters correspond to the REQ message in the NOSTR protocol:

```typescript
import type { Filter } from 'nostr-tools/filter'

// Fetch recent text notes from specific authors
const filter: Filter = {
  kinds: [1],
  authors: ['pubkey1hex', 'pubkey2hex'],
  since: Math.floor(Date.now() / 1000) - 3600,  // last hour
  limit: 100,
}

// Fetch events by ID
const byId: Filter = {
  ids: ['eventid1hex', 'eventid2hex'],
}

// Tag-based filtering (NIP-12 generic tag queries)
const withHashtag: Filter = {
  kinds: [1],
  '#t': ['nostr', 'bitcoin'],
}

// Reactions to a specific event
const reactions: Filter = {
  kinds: [7],
  '#e': [targetEventId],
}

// Full-text search (NIP-50, relay must support it)
const search: Filter = {
  kinds: [1],
  search: 'bitcoin lightning',
  limit: 50,
}
```

### Multiple Filters in One Subscription

You can pass an array of filters. The relay returns events matching ANY of them (OR logic):

```typescript
pool.subscribeMany(relays, [
  { kinds: [0], authors: [pubkey] },     // profile
  { kinds: [1], authors: [pubkey] },     // notes
  { kinds: [3], authors: [pubkey] },     // contacts
], { onevent(e) { /* ... */ } })
```

### Filter Utility Functions

```typescript
import { matchFilter, matchFilters, mergeFilters, getFilterLimit } from 'nostr-tools/filter'

// Check if an event matches a filter locally
if (matchFilter(filter, event)) {
  // event satisfies the filter criteria
}

// Check against multiple filters (OR logic)
if (matchFilters([filter1, filter2], event)) {
  // event matches at least one filter
}

// Merge multiple filters into one
const combined = mergeFilters(filter1, filter2, filter3)

// Calculate intrinsic limit of a filter
const limit = getFilterLimit(filter)  // number or Infinity
```

---

## NIP-Specific Modules

### nip04 -- Encrypted Direct Messages (Legacy)

> **Deprecated in favor of NIP-17 + NIP-44.** NIP-04 uses AES-CBC which leaks metadata. Use nip17 for new applications.

```typescript
import * as nip04 from 'nostr-tools/nip04'

// Encrypt
const ciphertext = await nip04.encrypt(senderSk, recipientPubkey, 'Hello!')
// Returns: "base64ciphertext?iv=base64iv"

// Decrypt
const plaintext = await nip04.decrypt(recipientSk, senderPubkey, ciphertext)
```

### nip05 -- DNS-Based Identity Verification

```typescript
import * as nip05 from 'nostr-tools/nip05'

// Resolve a NIP-05 identifier to a profile
const profile = await nip05.queryProfile('satoshi@example.com')
// Returns: { pubkey: 'hex...', relays: ['wss://...'] } or null

// Validate that a pubkey owns a NIP-05 identifier
const valid = await nip05.isValid('pubkeyhex', 'satoshi@example.com')

// Search a domain for users
const users = await nip05.searchDomain('example.com', 'sat')
// Returns: { 'satoshi': 'pubkeyhex', ... }

// Type guard
if (nip05.isNip05('user@domain.com')) {
  // TypeScript knows this is a valid Nip05 type
}
```

### nip10 -- Thread Structure Parsing

```typescript
import * as nip10 from 'nostr-tools/nip10'

const thread = nip10.parse(event)
// Returns:
// {
//   root?: EventPointer      -- root of the thread
//   reply?: EventPointer     -- direct parent being replied to
//   mentions: EventPointer[] -- referenced events (not in reply chain)
//   quotes: EventPointer[]   -- directly quoted events
//   profiles: ProfilePointer[] -- involved pubkeys
// }
```

Handles both modern tagged markers (`root`, `reply`, `mention`) and legacy positional `e` tag parsing.

### nip13 -- Proof of Work

```typescript
import * as nip13 from 'nostr-tools/nip13'

// Check the PoW difficulty of an event
const difficulty = nip13.getPow(event.id)

// Mine an event to a target difficulty
// WARNING: This is synchronous and CPU-intensive. Run in a Web Worker.
const minedEvent = nip13.minePow(unsignedEvent, 20)
// Adds a ['nonce', iterations, targetDifficulty] tag
```

### nip17 -- Private Direct Messages

NIP-17 implements private DMs using NIP-44 encryption wrapped in NIP-59 gift wraps. This is the modern replacement for NIP-04.

```typescript
import * as nip17 from 'nostr-tools/nip17'

// Wrap a message for a single recipient
const wrappedEvents = nip17.wrapEvent(
  senderSk,                                      // sender's secret key
  { publicKey: recipientPubkey, relayUrl: 'wss://relay.example.com' },
  'Hello privately!',                             // message content
  'Optional conversation title',                  // subject (optional)
  { eventId: 'abc...', relayUrl: 'wss://...' },  // reply-to (optional)
)
// Returns array of gift-wrapped events (one for recipient, one for sender's own copy)

// Wrap for multiple recipients (group DM)
const wrapped = nip17.wrapManyEvents(
  senderSk,
  [
    { publicKey: pubkey1, relayUrl: 'wss://relay1.com' },
    { publicKey: pubkey2, relayUrl: 'wss://relay2.com' },
  ],
  'Hello group!',
)

// Unwrap a received message
const rumor = nip17.unwrapEvent(giftWrapEvent, recipientSk)

// Unwrap many, sorted chronologically
const messages = nip17.unwrapManyEvents(giftWrapEvents, recipientSk)
```

### nip19 -- Bech32 Encoding (npub, nsec, note, nprofile, nevent, naddr)

```typescript
import * as nip19 from 'nostr-tools/nip19'

// --- Encoding ---

// Public key -> npub
const npub = nip19.npubEncode('hex_pubkey_string')
// "npub1..."

// Secret key -> nsec
const nsec = nip19.nsecEncode(secretKeyUint8Array)
// "nsec1..."

// Event ID -> note
const note = nip19.noteEncode('hex_event_id')
// "note1..."

// Profile with relay hints -> nprofile
const nprofile = nip19.nprofileEncode({
  pubkey: 'hex_pubkey',
  relays: ['wss://relay.damus.io', 'wss://nos.lol'],
})
// "nprofile1..."

// Event with relay hints -> nevent
const nevent = nip19.neventEncode({
  id: 'hex_event_id',
  relays: ['wss://relay.damus.io'],
  author: 'hex_author_pubkey',   // optional
  kind: 1,                       // optional
})
// "nevent1..."

// Replaceable event address -> naddr
const naddr = nip19.naddrEncode({
  identifier: 'my-article-slug',
  pubkey: 'hex_pubkey',
  kind: 30023,
  relays: ['wss://relay.damus.io'],
})
// "naddr1..."

// --- Decoding ---

const result = nip19.decode('npub1...')
// result.type === 'npub'
// result.data === 'hex_pubkey_string'

const result2 = nip19.decode('nprofile1...')
// result2.type === 'nprofile'
// result2.data === { pubkey: '...', relays: ['...'] }

const result3 = nip19.decode('nevent1...')
// result3.type === 'nevent'
// result3.data === { id: '...', relays: ['...'], author: '...', kind: 1 }

const result4 = nip19.decode('naddr1...')
// result4.type === 'naddr'
// result4.data === { identifier: '...', pubkey: '...', kind: 30023, relays: ['...'] }

// Decode nostr: URI scheme
const fromUri = nip19.decodeNostrURI('nostr:npub1...')

// --- Type Guards ---
nip19.NostrTypeGuard.isNPub('npub1...')     // true
nip19.NostrTypeGuard.isNSec('nsec1...')     // true
nip19.NostrTypeGuard.isNote('note1...')     // true
nip19.NostrTypeGuard.isNProfile('nprofile1...')
nip19.NostrTypeGuard.isNEvent('nevent1...')
nip19.NostrTypeGuard.isNAddr('naddr1...')
```

#### nip19 Types

```typescript
type NPub = `npub1${string}`
type NSec = `nsec1${string}`
type Note = `note1${string}`
type NProfile = `nprofile1${string}`
type NEvent = `nevent1${string}`
type NAddr = `naddr1${string}`

type ProfilePointer = { pubkey: string; relays?: string[] }
type EventPointer = { id: string; relays?: string[]; author?: string; kind?: number }
type AddressPointer = { identifier: string; pubkey: string; kind: number; relays?: string[] }
```

### nip27 -- Content Parsing (Mentions, URLs, Media)

```typescript
import * as nip27 from 'nostr-tools/nip27'

// Parse content into structured blocks
for (const block of nip27.parse(event)) {
  switch (block.type) {
    case 'text':
      // Plain text segment
      renderText(block.content)
      break
    case 'reference':
      // nostr:npub1... or nostr:note1... reference
      renderNostrLink(block.data)
      break
    case 'url':
      renderLink(block.href)
      break
    case 'image':
      renderImage(block.href)
      break
    case 'video':
      renderVideo(block.href)
      break
    case 'hashtag':
      renderHashtag(block.value)
      break
    case 'emoji':
      renderEmoji(block.shortcode, block.url)
      break
    case 'relay':
      renderRelayLink(block.url)
      break
  }
}
```

Block types: `text`, `reference`, `url`, `image`, `video`, `audio`, `emoji`, `hashtag`, `relay`.

### nip42 -- Relay Authentication

```typescript
import * as nip42 from 'nostr-tools/nip42'
import { finalizeEvent } from 'nostr-tools/pure'

// Create an AUTH event template
const authTemplate = nip42.makeAuthEvent('wss://relay.example.com', challengeString)
// Returns EventTemplate with kind 22242

// Sign and send it
const authEvent = finalizeEvent(authTemplate, sk)
await relay.publish(authEvent)

// Or use the relay's built-in auth method:
await relay.auth(async (evt) => finalizeEvent(evt, sk))
```

### nip44 -- Versioned Encryption

NIP-44 is the modern encryption standard for NOSTR, replacing NIP-04. It uses X25519 ECDH key agreement, HKDF-SHA256 key derivation, ChaCha20 encryption, and HMAC-SHA256 authentication.

```typescript
import * as nip44 from 'nostr-tools/nip44'

// Derive a shared conversation key (reuse this for multiple messages)
const conversationKey = nip44.v2.utils.getConversationKey(senderSk, recipientPubkey)

// Encrypt
const ciphertext = nip44.v2.encrypt('Hello securely!', conversationKey)
// Returns base64 payload: version(1) + nonce(32) + ciphertext + MAC(32)

// Decrypt
const plaintext = nip44.v2.decrypt(ciphertext, conversationKey)

// You can also provide your own nonce (for testing):
const ciphertextDeterministic = nip44.v2.encrypt('test', conversationKey, customNonce)
```

Specifications:
- Plaintext size: 1 to 65,535 bytes
- Padding: Adaptive, minimum 32 bytes, power-of-2 algorithm
- Nonce: 32 bytes (random by default)
- Base64 payload size: 132 to 87,472 characters

### nip47 -- Nostr Wallet Connect (NWC)

```typescript
import * as nip47 from 'nostr-tools/nip47'

// Parse a NWC connection string
const connection = nip47.parseConnectionString(
  'nostr+walletconnect://pubkey?relay=wss://relay.example.com&secret=hexsecret'
)
// Returns: { pubkey, relay, relays, secret }

// Create a payment request event
const payEvent = await nip47.makeNwcRequestEvent(
  connection.pubkey,    // wallet service pubkey
  hexToBytes(connection.secret),  // shared secret as Uint8Array
  'lnbc50n1...',        // Lightning invoice (BOLT-11)
)

// Publish to the NWC relay
await pool.publish([connection.relay], payEvent)
```

### nip57 -- Zaps (Lightning Tips)

```typescript
import * as nip57 from 'nostr-tools/nip57'

// 1. Get the zap endpoint from a user's metadata
const zapEndpoint = await nip57.getZapEndpoint(metadataEvent)
// Returns: 'https://getalby.com/lnurlp/user/callback' or null

// 2. Create a zap request event
const zapRequest = nip57.makeZapRequest({
  pubkey: recipientPubkey,
  amount: 1000,  // millisatoshis
  relays: ['wss://relay.damus.io'],
  comment: 'Great post!',
})
// Returns EventTemplate (kind 9734) -- sign it with finalizeEvent()

// For event zaps (tipping a specific post):
const eventZapRequest = nip57.makeZapRequest({
  event: targetEvent,
  amount: 5000,
  relays: ['wss://relay.damus.io'],
  comment: 'Lightning!',
})

// 3. Validate an incoming zap request
const error = nip57.validateZapRequest(JSON.stringify(zapRequestEvent))
// Returns null if valid, or error string

// 4. Create a zap receipt (for LNURL servers)
const zapReceipt = nip57.makeZapReceipt({
  zapRequest: JSON.stringify(zapRequestEvent),
  bolt11: 'lnbc...',
  preimage: 'optional_preimage',
})
// Returns EventTemplate (kind 9735)

// 5. Parse satoshi amount from a BOLT-11 invoice
const sats = nip57.getSatoshisAmountFromBolt11('lnbc50n1...')
```

### nip59 -- Gift Wraps and Sealed Events

NIP-59 provides three-layer encryption for maximum privacy:

1. **Rumor** -- the actual content (unsigned event)
2. **Seal** -- the rumor encrypted to the recipient, signed by sender (kind 13)
3. **Gift Wrap** -- the seal encrypted with a random ephemeral key (kind 1059)

```typescript
import * as nip59 from 'nostr-tools/nip59'

// Create individual layers
const rumor = nip59.createRumor(eventData, senderSk)
const seal = nip59.createSeal(rumor, senderSk, recipientPubkey)
const wrap = nip59.createWrap(seal, recipientPubkey)

// Or do it all at once
const giftWrap = nip59.wrapEvent(rumor, senderSk, recipientPubkey)

// For multiple recipients
const wraps = nip59.wrapManyEvents(rumor, senderSk, [pubkey1, pubkey2])

// Unwrap a received gift wrap
const unwrapped = nip59.unwrapEvent(giftWrapEvent, recipientSk)
// Returns the original Rumor

// Unwrap many (sorted chronologically)
const messages = nip59.unwrapManyEvents(wrappedEvents, recipientSk)
```

Timestamps on gift wraps are randomized to prevent timing analysis.

### nip98 -- HTTP Authentication

```typescript
import * as nip98 from 'nostr-tools/nip98'

// Generate an auth token for an HTTP request
const token = await nip98.getToken(
  'https://api.example.com/upload',  // URL
  'POST',                            // HTTP method
  async (evt) => finalizeEvent(evt, sk),  // signing function
  true,                              // include 'Nostr' scheme
)
// Use as: Authorization: Nostr <token>

// Validate an incoming auth token (server-side)
const isValid = await nip98.validateToken(token, 'https://api.example.com/upload', 'POST')

// Individual validation steps
const event = await nip98.unpackEventFromToken(token)
nip98.validateEventTimestamp(event)   // within 60 seconds
nip98.validateEventKind(event)        // kind 27235
nip98.validateEventUrlTag(event, url) // URL matches
nip98.validateEventMethodTag(event, 'POST')
```

---

## WASM Acceleration

nostr-tools offers an optional WASM-based crypto backend using libsecp256k1:

```typescript
// Instead of:
import { verifyEvent } from 'nostr-tools/pure'
// Use:
import { verifyEvent } from 'nostr-tools/wasm'
```

Benchmarks show the WASM backend is **6.86x faster** than pure JS for Schnorr signature verification. This matters when verifying large numbers of events (e.g., loading a feed with hundreds of events).

The API is identical -- only the import path changes. The WASM module is loaded asynchronously on first use.

---

## Bundle Size Considerations

nostr-tools is designed for minimal bundle impact:

1. **Import only what you need.** Each module is a separate entry point. Importing `nostr-tools/nip19` does not pull in relay code.

2. **Core crypto is the main cost.** The `@noble/curves` secp256k1 implementation is the heaviest dependency (~50KB minified). It is shared across all modules that need it.

3. **The WASM module adds ~100KB** for the libsecp256k1 binary, but loads lazily.

4. **Avoid importing the barrel export** if your bundler does not tree-shake well. Prefer specific imports:
   ```typescript
   // Good: only pulls in what you need
   import { npubEncode, decode } from 'nostr-tools/nip19'

   // Avoid: may pull in everything
   import { nip19 } from 'nostr-tools'
   ```

5. **For serverless/edge functions**, the pure JS build is recommended (no WASM loading overhead on cold starts).

---

## Version History

### v2.0.0 (Major Rewrite)

Breaking changes from v1.x:

| v1.x | v2.x | Notes |
|---|---|---|
| `generatePrivateKey()` returns hex string | `generateSecretKey()` returns `Uint8Array` | Raw bytes, not hex |
| `getPublicKey(hexString)` | `getPublicKey(Uint8Array)` | Input changed, output still hex |
| `finishEvent(template, hexSk)` | `finalizeEvent(template, Uint8Array)` | Renamed, Uint8Array sk |
| `keys.ts` + `event.ts` | `pure.ts` | Merged modules |
| Kind enums | Kind constants (`nostr-tools/kinds`) | `Kind.Text` became `ShortTextNote` |
| `relayInit(url)` | `Relay.connect(url)` | Rewritten relay class |
| `SimplePool.list()` | `pool.querySync()` | Rewritten pool |
| Subscription `.unsub()` | Subscription `.close()` | Renamed method |

### v2.x Releases (Selected)

- **v2.9.0** -- Added NIP-46 BunkerSigner support
- **v2.9.4** -- Improved NIP-44 padding compliance
- **v2.23.x** -- Latest stable, added `enablePing`, `enableReconnect`, `pruneIdleRelays`, expanded NIP module coverage

### Migration from v1 to v2

The most common migration steps:

```typescript
// v1
import { generatePrivateKey, getPublicKey, finishEvent } from 'nostr-tools'
const sk = generatePrivateKey()  // hex string
const pk = getPublicKey(sk)
const event = finishEvent({ ... }, sk)

// v2
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
const sk = generateSecretKey()  // Uint8Array
const pk = getPublicKey(sk)
const event = finalizeEvent({ ... }, sk)

// To convert between hex and Uint8Array:
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
const skHex = bytesToHex(sk)
const skBytes = hexToBytes(skHex)
```

---

## Event Kind Constants

The `nostr-tools/kinds` module exports constants for all standardized event kinds. Selected important ones:

| Constant | Value | Description |
|---|---|---|
| `Metadata` | 0 | User profile (JSON content) |
| `ShortTextNote` | 1 | Standard text note |
| `RecommendRelay` | 2 | Relay recommendation |
| `Contacts` | 3 | Contact/follow list |
| `EncryptedDirectMessage` | 4 | NIP-04 DM (deprecated) |
| `EventDeletion` | 5 | Delete events |
| `Repost` | 6 | Repost/boost |
| `Reaction` | 7 | Like/reaction |
| `Seal` | 13 | NIP-59 sealed event |
| `PrivateDirectMessage` | 14 | NIP-17 private DM |
| `GiftWrap` | 1059 | NIP-59 gift wrap |
| `ZapRequest` | 9734 | NIP-57 zap request |
| `Zap` | 9735 | NIP-57 zap receipt |
| `RelayList` | 10002 | NIP-65 relay list |
| `DirectMessageRelaysList` | 10050 | DM relay preferences |
| `ClientAuth` | 22242 | NIP-42 relay auth |
| `HTTPAuth` | 27235 | NIP-98 HTTP auth |
| `LongFormArticle` | 30023 | Long-form content |
| `LiveEvent` | 30311 | Live streaming |
| `CommunityDefinition` | 34550 | Community definition |

See the full list in the [kinds.ts source](https://github.com/nbd-wtf/nostr-tools/blob/master/kinds.ts).
