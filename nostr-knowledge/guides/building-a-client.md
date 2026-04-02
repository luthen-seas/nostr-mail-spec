# Building a NOSTR Client

> A practical guide for developers building NOSTR clients, from key generation
> to a fully-featured social application. Covers architecture, library choices,
> progressive NIP adoption, and common pitfalls.

---

## Table of Contents

1. [Choosing Your Stack](#1-choosing-your-stack)
2. [Key Management](#2-key-management)
3. [Relay Connection Pool](#3-relay-connection-pool)
4. [Subscription Management](#4-subscription-management)
5. [Event Creation and Publishing](#5-event-creation-and-publishing)
6. [Profile Resolution](#6-profile-resolution)
7. [Timeline Construction](#7-timeline-construction)
8. [Threading](#8-threading)
9. [Reactions and Reposts](#9-reactions-and-reposts)
10. [Media Handling](#10-media-handling)
11. [Zap Integration](#11-zap-integration)
12. [Encrypted DMs](#12-encrypted-dms)
13. [The Outbox Model (NIP-65)](#13-the-outbox-model-nip-65)
14. [Common Pitfalls and Solutions](#14-common-pitfalls-and-solutions)
15. [Performance Tips](#15-performance-tips)
16. [Progressive NIP Support](#16-progressive-nip-support)
17. [Testing Your Client](#17-testing-your-client)

---

## 1. Choosing Your Stack

### Language and Framework Decision Tree

Your stack depends on your target platform and experience:

| Target | Recommended Stack | Library |
|--------|------------------|---------|
| Web (React) | TypeScript + React | NDK + ndk-react |
| Web (Svelte) | TypeScript + Svelte 5 | NDK + ndk-svelte |
| Web (vanilla/any) | TypeScript | nostr-tools |
| iOS native | Swift | nostr-sdk (Swift bindings via UniFFI) |
| Android native | Kotlin | nostr-sdk (Kotlin bindings via UniFFI) |
| Cross-platform mobile | React Native / Expo | NDK + ndk-mobile |
| Desktop (Rust) | Rust + egui/Tauri | nostr-sdk (Rust) |
| Desktop (Electron) | TypeScript | NDK or nostr-tools |
| CLI tool / bot | Rust or Python | nostr-sdk or python-nostr |
| Go backend | Go | go-nostr |

### nostr-tools vs NDK vs rust-nostr: When to Use What

**nostr-tools** -- Low-level building blocks.
- Pure protocol primitives: key generation, event signing, relay communication.
- Tree-shakeable -- import only what you need. Minimal bundle size.
- You manage relay connections, caching, subscription dedup yourself.
- Best for: bots, scripts, libraries, lightweight tools, or developers who want full control.
- Think of it as: "the stdlib."

```typescript
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
```

**NDK** -- High-level, batteries-included framework.
- Builds on nostr-tools concepts but adds opinionated relay management, caching (pluggable adapters for IndexedDB, SQLite, Redis), subscription deduplication, outbox model, signer abstraction, and framework bindings (React, Svelte, React Native).
- Multiple UI components requesting the same data share a single subscription.
- Best for: full-featured client applications, especially with React or Svelte.
- Think of it as: "the framework."

```typescript
import NDK from '@nostr-dev-kit/ndk'
import NDKCacheDexie from '@nostr-dev-kit/ndk-cache-dexie'
```

**rust-nostr (nostr-sdk)** -- Rust-native, cross-platform SDK.
- Two crates: `nostr` (protocol, no networking, works in `no_std`) and `nostr-sdk` (async client with relay pool, subscriptions, NIP-46 bunker support).
- UniFFI bindings generate Swift, Kotlin, and Python wrappers from the same Rust code.
- Best for: native iOS/Android apps, desktop Rust apps, performance-critical backends.
- Think of it as: "the native SDK."

```rust
use nostr_sdk::prelude::*;
let client = Client::new(keys);
client.add_relay("wss://relay.damus.io").await?;
client.connect().await;
```

**Decision flowchart:**

```
Are you building a web app?
  YES -> Do you want full control over every relay interaction?
           YES -> nostr-tools
           NO  -> NDK (with ndk-react, ndk-svelte, or core)
  NO  -> Are you building native mobile or desktop?
           YES -> rust-nostr (nostr-sdk with UniFFI bindings)
           NO  -> Is it a Go backend?
                    YES -> go-nostr
                    NO  -> nostr-tools or nostr-sdk (pick your language)
```

---

## 2. Key Management

Key management is the first thing your client must solve. A NOSTR identity is a secp256k1 keypair -- the private key signs events, the public key identifies the user.

### 2.1 Generate a Keypair

```typescript
// nostr-tools
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'

const sk = generateSecretKey()          // Uint8Array (32 bytes)
const pk = getPublicKey(sk)             // hex string (64 chars)
```

```rust
// rust-nostr
let keys = Keys::generate();
let pk = keys.public_key();
let sk = keys.secret_key();
```

### 2.2 Store the Key Securely

| Platform | Storage | Notes |
|----------|---------|-------|
| Web | Encrypted in localStorage/IndexedDB | Encrypt with a user-provided passphrase. Never store raw hex. |
| iOS | Keychain Services | Hardware-backed on devices with Secure Enclave. |
| Android | Android Keystore | Hardware-backed key storage. |
| Desktop | OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux) | Or encrypted file. |

**NIP-49 (encrypted private key export):** Define a standard format for exporting an encrypted private key as an `ncryptsec` bech32 string. Users can back up and restore keys across clients.

### 2.3 Signer Abstraction

Rather than holding the private key directly, implement a signer interface. This allows swapping between key storage methods without changing the rest of the client.

**The four signing strategies:**

1. **In-app key** -- Client holds the private key. Simplest, but key is exposed to the app.

2. **NIP-07 (browser extension)** -- A browser extension (e.g., nos2x, Alby) exposes `window.nostr` with `getPublicKey()` and `signEvent()`. The private key never leaves the extension.

   ```typescript
   // Check for NIP-07
   if (window.nostr) {
     const pubkey = await window.nostr.getPublicKey()
     const signed = await window.nostr.signEvent(unsignedEvent)
   }
   ```

3. **NIP-46 (remote signing / Nostr Connect)** -- The private key lives on a separate device (a "bunker"). The client communicates signing requests over NOSTR events (encrypted with NIP-44). Supports `connect`, `sign_event`, `get_public_key`, `nip44_encrypt`, `nip44_decrypt` methods.

   ```typescript
   // NDK remote signer
   import { NDKNip46Signer } from '@nostr-dev-kit/ndk'
   const signer = new NDKNip46Signer(ndk, bunkerPubkey)
   await signer.blockUntilReady()
   ndk.signer = signer
   ```

4. **NIP-55 (Android signer)** -- Android apps delegate signing to a system-level signer app via Android Intents. Similar to NIP-07 but for native Android.

**Recommendation:** Start with in-app key for development. Add NIP-07 support early (it is trivial on web). Add NIP-46 when you want production-grade key isolation.

### 2.4 Signer Interface Pattern

```typescript
interface NostrSigner {
  getPublicKey(): Promise<string>
  signEvent(event: UnsignedEvent): Promise<Event>
  nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string>
  nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string>
}
```

NDK provides `NDKSigner` as an abstract interface with implementations for private key, NIP-07, and NIP-46. rust-nostr has the `NostrSigner` trait.

---

## 3. Relay Connection Pool

A NOSTR client must manage simultaneous WebSocket connections to multiple relays. This is the foundation -- get it wrong and everything built on top breaks.

### 3.1 Pool Architecture

```
+-------------------------------------------+
|           Relay Connection Pool            |
|                                           |
|  wss://relay-a.com  [CONNECTED]           |
|    - subscriptions: feed, profile-xyz     |
|    - write queue: 2 pending               |
|                                           |
|  wss://relay-b.com  [CONNECTED]           |
|    - subscriptions: feed                  |
|                                           |
|  wss://relay-c.com  [RECONNECTING]       |
|    - attempt: 3, next retry: 8s           |
|    - queued subscriptions: thread-abc     |
|                                           |
|  wss://relay-d.com  [IDLE]               |
|    - close after 60s idle timeout         |
+-------------------------------------------+
```

**Pool responsibilities:**
- Open connections on demand when a subscription or publish targets a relay.
- Reuse existing connections -- never open duplicate connections to the same relay.
- Close idle connections after a timeout (save resources, respect relay limits).
- Track connection state: connecting, connected, authenticating, disconnected.
- Queue messages for relays that are reconnecting.
- Expose connection health to the UI.

**Library implementations:**
- nostr-tools `SimplePool` -- basic pool with subscription management.
- NDK `NDKPool` -- advanced pool with relay scoring, automatic selection, outbox model.
- rust-nostr `RelayPool` -- full-featured pool with NIP-42 auth, negentropy sync.

### 3.2 Reconnection with Exponential Backoff

Connections will drop. Reconnect automatically without overwhelming the relay.

```
base_delay = 1 second
max_delay  = 60 seconds
factor     = 2
jitter     = 0 to 30% of computed delay

attempt  delay
   1     ~1s
   2     ~2s
   3     ~4s
   4     ~8s
   5     ~16s
   6     ~32s
   7+    ~60s (capped)
```

**Critical: add jitter.** Without it, if a relay restarts and 10,000 clients all reconnect at the same intervals, they hit the relay in synchronized waves (thundering herd problem).

**On reconnection:**
1. Re-establish all active subscriptions (they were lost when the WebSocket closed).
2. Use `since` timestamps to avoid re-fetching events already received.
3. Re-authenticate if the relay requires NIP-42.
4. Drain any queued publish messages.

### 3.3 Connection Health Detection

- Send WebSocket ping frames every 30-60 seconds.
- If no pong within 10 seconds, consider the connection dead and begin reconnection.
- Some relays send periodic NOTICE messages as implicit keepalives.

---

## 4. Subscription Management

### 4.1 The REQ/EOSE/EVENT Flow

```
Client                          Relay
  |                               |
  |-- ["REQ", "sub1", filter] -->|
  |                               |
  |<- ["EVENT", "sub1", event] --|  (stored events, zero or more)
  |<- ["EVENT", "sub1", event] --|
  |<- ["EOSE", "sub1"] ---------|  (end of stored events)
  |                               |
  |<- ["EVENT", "sub1", event] --|  (live events, ongoing)
  |                               |
  |-- ["CLOSE", "sub1"] ------->|  (when done)
```

### 4.2 Filter Construction

A filter is a JSON object specifying which events you want:

```json
{
  "ids": ["<event-id-hex>"],
  "authors": ["<pubkey-hex>"],
  "kinds": [1, 6, 7],
  "#e": ["<event-id>"],
  "#p": ["<pubkey>"],
  "#t": ["bitcoin"],
  "since": 1700000000,
  "until": 1700100000,
  "limit": 50
}
```

**Rules:**
- All fields within a single filter are AND'd (event must match every specified field).
- Multiple filters in a single REQ are OR'd (event matching any filter is returned).
- `limit` caps the number of stored events returned (does not affect live events).

### 4.3 Deduplication

The same event will arrive from multiple relays. Deduplicate by event `id`:

```typescript
const seen = new Set<string>()  // or LRU cache

function onEvent(event: Event, relayUrl: string) {
  if (seen.has(event.id)) return
  seen.add(event.id)
  processEvent(event)
}
```

For **replaceable events** (kinds 0, 3, 10000-19999) and **addressable events** (kinds 30000-39999), also keep only the latest version:

```typescript
function onReplaceableEvent(event: Event) {
  const key = `${event.pubkey}:${event.kind}`  // + d-tag for addressable
  const existing = store.get(key)
  if (!existing || event.created_at > existing.created_at) {
    store.set(key, event)
  } else if (event.created_at === existing.created_at && event.id < existing.id) {
    store.set(key, event)  // lower id wins as tiebreaker
  }
}
```

### 4.4 EOSE Handling

Every subscription goes through two phases:
1. **Historical phase:** The relay sends stored events, ending with EOSE.
2. **Live phase:** After EOSE, new matching events arrive in real-time.

**Multi-relay EOSE strategies:**

| Strategy | Behavior | Trade-off |
|----------|----------|-----------|
| Wait for ALL relays | Most complete | Slowest relay determines load time |
| Wait for FIRST relay | Fastest perceived load | May miss events from slower relays |
| Wait for MAJORITY (recommended) | Good balance | Set a 5-second timeout as fallback |
| Progressive with deadline | Render events as they arrive, mark complete after 3s | Best UX for users |

### 4.5 Batching REQ Messages

Combine related queries into a single REQ with multiple filters:

```json
["REQ", "batch",
  {"kinds": [0], "authors": ["pk1", "pk2", "pk3"]},
  {"kinds": [1], "authors": ["pk1", "pk2", "pk3"], "limit": 50},
  {"kinds": [10002], "authors": ["pk1", "pk2", "pk3"]}
]
```

Benefits: fewer subscription IDs to track, single EOSE for all data types, less relay overhead.

### 4.6 Subscription Lifecycle

Always close subscriptions when navigating away from the view that created them. Open subscriptions consume relay resources. This is one of the most common mistakes new client developers make.

```
CREATE  -> send REQ -> receive stored events -> EOSE -> live events -> CLOSE
```

---

## 5. Event Creation and Publishing

### 5.1 Creating and Signing an Event

```typescript
// nostr-tools
import { finalizeEvent } from 'nostr-tools/pure'

const event = finalizeEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello, NOSTR!'
}, secretKey)
// Returns a complete event with id, pubkey, and sig
```

```typescript
// NDK
const event = new NDKEvent(ndk)
event.kind = 1
event.content = 'Hello, NOSTR!'
await event.publish()  // signs (via ndk.signer) and publishes to relays
```

```rust
// rust-nostr
let builder = EventBuilder::text_note("Hello, NOSTR!");
client.send_event_builder(builder).await?;
```

### 5.2 Multi-Relay Publishing

Publish to multiple relays for redundancy and reachability. Your publishing set should include:

1. **Your own WRITE relays** (from your kind:10002 relay list).
2. **Read relays of mentioned users** (so they see your event).
3. **Fallback relays** if the above sets are small.

```typescript
// NDK handles this automatically with outbox model enabled
await event.publish()

// nostr-tools manual approach
const pool = new SimplePool()
const writeRelays = ['wss://relay-a.com', 'wss://relay-b.com']
await Promise.allSettled(
  writeRelays.map(url => pool.publish([url], event))
)
```

### 5.3 Handling OK Responses

After publishing, each relay responds with:

```json
["OK", "<event-id>", true, ""]              // accepted
["OK", "<event-id>", false, "blocked: ..."] // rejected
```

Track which relays accepted the event. If all relays reject, inform the user. Common rejection reasons:
- `blocked:` -- relay policy rejected the event.
- `duplicate:` -- relay already has this event (not an error).
- `rate-limited:` -- slow down.
- `invalid:` -- event failed validation (check your signing).
- `error:` -- relay internal error.

---

## 6. Profile Resolution

### 6.1 Kind 0 Metadata Events

User profiles are stored as kind 0 replaceable events. The `content` field is a JSON string:

```json
{
  "name": "alice",
  "display_name": "Alice",
  "about": "Building on NOSTR",
  "picture": "https://example.com/alice.jpg",
  "banner": "https://example.com/banner.jpg",
  "nip05": "alice@example.com",
  "lud16": "alice@walletofsatoshi.com",
  "website": "https://alice.dev"
}
```

### 6.2 Fetching and Caching Profiles

```typescript
// Fetch profile for a pubkey
const filter = { kinds: [0], authors: [pubkey] }
```

**Caching strategy:**
- Cache kind 0 events locally (IndexedDB, SQLite, or in-memory LRU).
- On profile view: show cached immediately, fetch fresh in background.
- If the fresh fetch returns a newer `created_at`, update the display.
- Replaceable event rules: newer `created_at` wins; on tie, lower `id` wins.

### 6.3 NIP-05 Verification

NIP-05 maps human-readable identifiers (`alice@example.com`) to pubkeys:

```
1. Parse the NIP-05 identifier: name@domain
2. GET https://domain/.well-known/nostr.json?name=name
3. Response: { "names": { "name": "<pubkey-hex>" }, "relays": { "<pubkey>": ["wss://..."] } }
4. Verify that the pubkey in the response matches the event pubkey.
5. Optionally use the relay hints for outbox routing.
```

**Implementation notes:**
- Cache NIP-05 results (they change infrequently).
- Handle CORS: the server must send `Access-Control-Allow-Origin: *`.
- Timeout after 5 seconds -- do not block the UI on NIP-05 verification.
- Treat NIP-05 as cosmetic verification, not cryptographic proof.

---

## 7. Timeline Construction

### 7.1 Home Feed (Follow List)

```
1. Load own kind:3 (follow list) -> extract followed pubkeys
2. For each followed pubkey, get their kind:10002 -> extract WRITE relays
3. Group pubkeys by relay:
     relay-a: [alice, bob, carol]
     relay-b: [dave, eve]
     relay-c: [alice, dave]  (overlap is fine)
4. For each relay, subscribe:
     {"kinds": [1, 6, 7, 16, 30023], "authors": [grouped_pubkeys], "limit": 50}
5. Merge events from all relays, deduplicate by id
6. Sort by created_at descending
7. Render timeline
8. Keep subscriptions open for live updates
```

### 7.2 Profile Feed

```typescript
// Fetch events by a specific user
const filter = {
  kinds: [1, 6, 30023],
  authors: [targetPubkey],
  limit: 50
}
// Send to the target user's WRITE relays (outbox model)
```

### 7.3 Global Feed

```typescript
// Fetch recent events from connected relays
const filter = {
  kinds: [1],
  limit: 50
}
```

Global feeds are noisy. Consider filtering by proof-of-work (NIP-13), Web of Trust scores, or relay-specific curation.

### 7.4 Pagination

```
User scrolls to bottom of timeline.
Oldest visible event has created_at = T.

New subscription:
  {"kinds": [1, 6, 7], "authors": [followed], "until": T - 1, "limit": 50}

Append results below the current timeline.
Close the pagination subscription after EOSE (one-shot fetch).
```

### 7.5 Timeline Merging

Events from different relays arrive out of order. Maintain a sorted data structure:

```typescript
function insertEvent(timeline: Event[], event: Event) {
  const pos = binarySearch(timeline, event.created_at)
  timeline.splice(pos, 0, event)
}
```

---

## 8. Threading

### 8.1 NIP-10 Tag Conventions

NOSTR threads are trees of events linked by `e` tags with markers:

```json
["e", "<event-id>", "<relay-hint>", "root"]    // the thread root
["e", "<event-id>", "<relay-hint>", "reply"]   // the direct parent
["e", "<event-id>", "<relay-hint>", "mention"] // mentioned, not a reply target
```

For replies to the root event, the `root` and `reply` tags both point to the root.

### 8.2 Building Reply Trees

```
function buildThread(rootEventId):
    // Fetch the root event
    root = fetchById(rootEventId)

    // Fetch all replies referencing the root
    replies = subscribe({ "#e": [rootEventId], "kinds": [1, 1111] })

    // Build the tree
    tree = Map<parentId, childEvents[]>

    for each reply:
        replyTag = reply.tags.find(t => t[0]=="e" && t[3]=="reply")
        if replyTag:
            parentId = replyTag[1]
        else:
            rootTag = reply.tags.find(t => t[0]=="e" && t[3]=="root")
            parentId = rootTag ? rootTag[1] : fallbackLastETag(reply)

        tree[parentId].push(reply)

    // Fetch missing intermediate events (use relay hints from e tags)
    // Sort children by created_at
    return tree
```

### 8.3 Cross-Relay Thread Assembly

Thread participants may use different relays:
1. Query your connected relays for `#e: [root_id]`.
2. Extract relay hints from `e` tags in replies.
3. Connect to hinted relays and query there too.
4. Merge and deduplicate.
5. Repeat for newly discovered relay hints (iterative deepening).

### 8.4 Creating a Reply

```typescript
const reply = finalizeEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['e', rootEvent.id, relayHint, 'root'],
    ['e', parentEvent.id, relayHint, 'reply'],
    ['p', rootEvent.pubkey],      // tag the root author
    ['p', parentEvent.pubkey],    // tag the parent author
  ],
  content: 'Great point!'
}, secretKey)
```

---

## 9. Reactions and Reposts

### 9.1 Reactions (Kind 7)

```json
{
  "kind": 7,
  "content": "+",
  "tags": [
    ["e", "<reacted-event-id>", "<relay-hint>"],
    ["p", "<reacted-event-pubkey>"],
    ["k", "1"]
  ]
}
```

- `content: "+"` is a like. `"-"` is a dislike. Custom emoji shortcodes (`:fire:`) with a matching `emoji` tag (NIP-30) are also supported.
- The `k` tag indicates the kind of the reacted-to event.

**Fetching reactions for an event:**

```typescript
const filter = { kinds: [7], "#e": [eventId] }
```

### 9.2 Reposts (Kind 6 and Kind 16)

**Kind 6** -- repost of a kind 1 text note:

```json
{
  "kind": 6,
  "content": "",
  "tags": [
    ["e", "<reposted-event-id>", "<relay-hint>"],
    ["p", "<reposted-event-pubkey>"]
  ]
}
```

The `content` MAY contain the JSON-stringified original event (for relays that do not have it).

**Kind 16** -- generic repost (for any kind):

```json
{
  "kind": 16,
  "content": "",
  "tags": [
    ["e", "<reposted-event-id>", "<relay-hint>"],
    ["p", "<reposted-event-pubkey>"],
    ["k", "30023"]
  ]
}
```

---

## 10. Media Handling

### 10.1 Inline Media Detection

Parse event content for URLs and render them appropriately:

| Pattern | Render as |
|---------|-----------|
| `.jpg`, `.png`, `.gif`, `.webp` | Inline image |
| `.mp4`, `.webm`, `.mov` | Inline video player |
| `.mp3`, `.ogg`, `.wav` | Inline audio player |
| YouTube, Vimeo URLs | Embedded player |
| Other URLs | Clickable link with Open Graph preview |

### 10.2 NIP-92 Inline Media Metadata

```json
["imeta",
  "url https://example.com/photo.jpg",
  "m image/jpeg",
  "dim 1920x1080",
  "x <sha256-hash>",
  "blurhash ..."
]
```

Use `dim` to set image dimensions before loading (prevents layout shift). Use `blurhash` as a placeholder while loading.

### 10.3 Blossom (NIP-B7) Media Uploads

Blossom is a protocol for uploading and serving media blobs via HTTP servers. Blobs are addressed by their SHA-256 hash.

**Upload flow:**
1. Compute SHA-256 of the file.
2. Create a NIP-98 authorization event (kind 24242) for the upload.
3. PUT the file to `https://blossom-server.com/<sha256-hash>` with the auth header.
4. The server returns the URL.
5. Include the URL (and optionally an `imeta` tag) in your NOSTR event.

**Server discovery:** Users publish their preferred Blossom servers in a kind 10063 event (NIP-B0).

### 10.4 NIP-96 File Storage

An alternative upload protocol where the server assigns the URL:
1. GET `https://server.com/.well-known/nostr/nip96.json` for server capabilities.
2. POST the file with a NIP-98 auth header.
3. Server returns a NIP-94 file metadata event or a URL.

---

## 11. Zap Integration

### 11.1 Zap Flow Overview (NIP-57)

Zaps are verifiable Lightning payments recorded on NOSTR. The flow involves four actors: sender's client, recipient's LNURL server, Lightning Network, and NOSTR relays.

```
1. Client fetches recipient's LNURL-pay endpoint (from their lud16 in kind:0)
2. Server responds with: allowsNostr, nostrPubkey, callback, min/max amounts
3. Client creates a kind 9734 "zap request" event (signed, NOT published to relays)
4. Client calls the LNURL callback with amount and the zap request as a query param
5. Server returns a BOLT11 Lightning invoice
6. User pays the invoice via their Lightning wallet
7. Server detects payment, creates a kind 9735 "zap receipt" event, publishes to relays
8. Client sees the zap receipt and displays it
```

### 11.2 Creating a Zap Request

```typescript
const zapRequest = finalizeEvent({
  kind: 9734,
  created_at: Math.floor(Date.now() / 1000),
  content: 'Great post!',  // optional zap comment
  tags: [
    ['relays', 'wss://relay-a.com', 'wss://relay-b.com'],
    ['amount', '21000'],  // millisatoshis
    ['p', recipientPubkey],
    ['e', eventId],  // if zapping an event
  ]
}, secretKey)
```

### 11.3 Verifying Zap Receipts

When displaying zap receipts (kind 9735):
1. Extract the `description` tag -- it contains the original zap request JSON.
2. Parse and verify the zap request event signature.
3. Verify the zap receipt `pubkey` matches the `nostrPubkey` from the LNURL server.
4. Extract the amount from the `bolt11` tag.

### 11.4 NIP-47 Wallet Connect

NIP-47 (Nostr Wallet Connect) lets users connect a Lightning wallet to your client without exposing wallet credentials:
1. User scans a `nostr+walletconnect://` URI from their wallet.
2. Client sends payment requests as encrypted NOSTR events.
3. Wallet app signs and pays the invoice.
4. This enables one-tap zaps without leaving your client.

---

## 12. Encrypted DMs

### 12.1 NIP-17 Direct Messages (Current Standard)

NIP-17 uses the NIP-59 gift wrap protocol for metadata-private direct messages:

```
1. Create a "rumor" (unsigned kind 14 event) with the message content
2. Seal it: encrypt the rumor with NIP-44, sign as kind 13 with your real key
3. Gift wrap it: encrypt the seal with NIP-44 using an ephemeral key, sign as kind 1059
4. Publish the kind 1059 gift wrap to the recipient's DM relays (kind 10050)
```

**Why three layers:**
- The rumor is unsigned (deniability).
- The seal hides the content but reveals the sender (only inside the wrap).
- The gift wrap hides everything -- the outer event is signed by a throwaway key.
- Observers see only: an ephemeral key sent a kind 1059 event to a pubkey. They cannot determine the real sender or the content.

### 12.2 Receiving DMs

```typescript
// Subscribe to gift wraps addressed to you
const filter = { kinds: [1059], "#p": [myPubkey] }

// On receiving a gift wrap:
// 1. Decrypt the gift wrap content with your private key -> get the seal
// 2. Decrypt the seal content with your private key -> get the rumor
// 3. The rumor's pubkey is the real sender
// 4. The rumor's content is the message
```

### 12.3 DM Relay Discovery

Users publish their preferred DM relays in a kind 10050 event (NIP-51). When sending a DM, look up the recipient's kind 10050 and publish the gift wrap to those relays.

### 12.4 NIP-04 (Deprecated)

NIP-04 used AES-CBC encryption with a shared secret. It leaked metadata (sender and recipient are visible in tags) and had cryptographic weaknesses. Do not implement NIP-04 for new clients. If you must support it for backward compatibility, clearly mark it as insecure.

---

## 13. The Outbox Model (NIP-65)

The outbox model is the most important architectural concept for building a well-connected client. Without it, your client will miss events and deliver messages to the wrong places.

### 13.1 Core Principle

Each user publishes a kind 10002 event declaring their read and write relays:

```json
{
  "kind": 10002,
  "tags": [
    ["r", "wss://relay-a.com"],
    ["r", "wss://relay-b.com", "write"],
    ["r", "wss://relay-c.com", "read"]
  ]
}
```

- **No marker** = both read and write.
- **"write"** = the user publishes events here (their outbox).
- **"read"** = the user reads events here (their inbox).

### 13.2 Routing Rules

| Operation | Connect to | Source |
|-----------|-----------|--------|
| Fetch a user's events | Their WRITE relays | Their kind:10002 |
| Send a mention/reply to a user | Their READ relays + your WRITE relays | Both kind:10002 |
| Read your own notifications | Your READ relays | Your kind:10002 |
| Publish your events | Your WRITE relays | Your kind:10002 |

### 13.3 Implementation

```typescript
function selectRelaysForRead(targetPubkeys: string[]): Map<string, string[]> {
  // Returns: relay URL -> list of pubkeys to query there
  const relayToPubkeys = new Map()

  for (const pk of targetPubkeys) {
    const relayList = getRelayList(pk)  // cached kind:10002
    const writeRelays = relayList.getWriteRelays()
    for (const relay of writeRelays) {
      if (!relayToPubkeys.has(relay)) relayToPubkeys.set(relay, [])
      relayToPubkeys.get(relay).push(pk)
    }
  }

  return relayToPubkeys
}
```

### 13.4 Bootstrap Problem

To fetch a user's relay list, you need to know which relay has it. Solutions:
- **Well-known indexing relays:** `purplepag.es`, `relay.damus.io` -- these archive kind 10002 events broadly.
- **NIP-05 resolution:** The `.well-known/nostr.json` response includes relay hints.
- **NIP-19 bech32 encodings:** `nprofile` and `nevent` carry relay URL hints.
- **Relay hints in tags:** `p` and `e` tags can include a relay URL as the third element.

### 13.5 Relay List Caching

- Cache kind 10002 events in local storage.
- Refresh periodically (e.g., every hour or when viewing a profile).
- Fall back to cached data if the fresh fetch fails.
- NDK handles all of this automatically when `enableOutboxModel: true`.

---

## 14. Common Pitfalls and Solutions

### Pitfall 1: Not deduplicating events
Events arrive from multiple relays. Always deduplicate by `id`.

### Pitfall 2: Leaking subscriptions
Never navigate away from a view without closing its subscriptions. This consumes relay resources and causes memory leaks in your client.

### Pitfall 3: Ignoring the outbox model
Connecting to a fixed set of relays means you will miss events from users who publish elsewhere. Implement NIP-65 relay discovery.

### Pitfall 4: Trusting relay data without verification
Always verify event signatures. A compromised relay can send forged events. Verify the `id` (recompute SHA-256 of the serialized event) and the `sig` (Schnorr verification).

### Pitfall 5: Blocking the UI on signature verification
Signature verification is CPU-intensive (~100us per event). On mobile with hundreds of events, verify on a background thread or web worker. Cache verification results -- events are immutable.

### Pitfall 6: Not handling replaceable events correctly
Kinds 0, 3, 10000-19999 are replaceable (one per pubkey+kind). Kinds 30000-39999 are addressable (one per pubkey+kind+d-tag). Always keep only the latest by `created_at`, with lower `id` as tiebreaker.

### Pitfall 7: Hardcoding relay URLs
Users should be able to configure their relays. Hardcode a few well-known relays as fallbacks, but always prefer the user's kind:10002 relay list.

### Pitfall 8: Publishing NIP-04 DMs
NIP-04 is deprecated and leaks metadata. Use NIP-17 (gift wrap) for new DM implementations.

### Pitfall 9: Not normalizing relay URLs
`wss://relay.example.com` and `wss://relay.example.com/` are the same relay. Normalize URLs before comparison.

### Pitfall 10: Sending too many REQ subscriptions
Batch related queries into a single REQ with multiple filters. Some relays limit subscriptions per connection.

---

## 15. Performance Tips

### Caching

| Data Type | Cache Strategy | Invalidation |
|-----------|---------------|-------------|
| Profiles (kind 0) | Cache per pubkey, show cached while fetching fresh | Replaceable: newer `created_at` wins |
| Follow lists (kind 3) | Cache per pubkey | Replaceable |
| Relay lists (kind 10002) | Cache per pubkey, critical for outbox routing | Replaceable |
| Text notes (kind 1) | Cache all received, immutable | Never |
| Reactions (kind 7) | Cache counts per event | Accumulate only |

### Lazy Loading

- Do not fetch all profiles at once. Fetch profiles as they scroll into view.
- Use intersection observers (web) or scroll listeners (mobile) to trigger profile fetches.
- Batch profile fetches: collect pubkeys visible in the viewport and fetch them in one REQ.

### Deduplication at Every Layer

1. **Event level:** Deduplicate by `id` in the event store.
2. **Subscription level:** NDK deduplicates subscriptions -- multiple components requesting the same data share one relay subscription.
3. **Relay level:** Do not open duplicate connections to the same relay.

### Web Workers for Crypto

Move signature verification to a Web Worker to keep the UI thread responsive:

```typescript
// worker.ts
import { verifyEvent } from 'nostr-tools/pure'
self.onmessage = (e) => {
  const valid = verifyEvent(e.data)
  self.postMessage({ id: e.data.id, valid })
}
```

### Virtual Scrolling

For long timelines, render only the visible items plus a small buffer. Libraries like `react-virtualized`, `tanstack/virtual`, or Svelte's `svelte-virtual-list` handle this.

---

## 16. Progressive NIP Support

Implement NIPs in this order for a social client:

### Phase 1: Minimum Viable Client

| NIP | Feature | Priority |
|-----|---------|----------|
| NIP-01 | Events, subscriptions, basic relay communication | Required |
| NIP-02 | Follow list (kind 3) | Required |
| NIP-10 | Reply threading (e-tag markers) | Required |
| NIP-19 | Bech32 encoding (npub, nsec, note, nprofile, nevent) | Required |
| NIP-21 | `nostr:` URI scheme | Required |
| NIP-11 | Relay information document | Required |

### Phase 2: Usable Client

| NIP | Feature | Priority |
|-----|---------|----------|
| NIP-05 | DNS-based verification | High |
| NIP-07 | Browser extension signer | High (web) |
| NIP-25 | Reactions (kind 7) | High |
| NIP-65 | Outbox model (relay list metadata) | High |
| NIP-18 | Reposts (kind 6, 16) | High |
| NIP-27 | Mention rendering (`nostr:` in content) | High |
| NIP-42 | Relay authentication | Medium |

### Phase 3: Full-Featured Client

| NIP | Feature | Priority |
|-----|---------|----------|
| NIP-17 | Encrypted DMs (gift wrap) | High |
| NIP-57 | Lightning zaps | High |
| NIP-51 | Lists (mute, bookmarks, pins) | Medium |
| NIP-23 | Long-form content | Medium |
| NIP-30 | Custom emoji | Medium |
| NIP-46 | Remote signing (Nostr Connect) | Medium |
| NIP-92 | Inline media metadata (imeta) | Medium |
| NIP-96/B7 | Media uploads (NIP-96 or Blossom) | Medium |
| NIP-47 | Wallet Connect (one-tap zaps) | Medium |

### Phase 4: Advanced Features

| NIP | Feature | Priority |
|-----|---------|----------|
| NIP-50 | Search | Optional |
| NIP-13 | Proof of Work | Optional |
| NIP-32 | Labeling | Optional |
| NIP-56 | Reporting | Optional |
| NIP-77 | Negentropy sync | Optional |
| NIP-29 | Relay-based groups | Optional |
| NIP-90 | Data Vending Machines | Optional |

---

## 17. Testing Your Client

### 17.1 Local Relay for Development

Run a local relay for testing without affecting the live network:

```bash
# strfry (fastest to set up with Docker)
docker run -p 7777:7777 hoytech/strfry:latest

# Or use a khatru-based relay (see guides/building-a-relay.md)
```

### 17.2 Test Scenarios

- **Key generation and import:** Generate keys, import from nsec, import from NIP-49 encrypted backup.
- **Publishing:** Create and publish a kind 1 event, verify it appears.
- **Subscriptions:** Subscribe, receive EOSE, receive live events, close cleanly.
- **Threading:** Create a reply chain, verify tree construction.
- **Replaceable events:** Update a profile (kind 0), verify only the latest version persists.
- **Multi-relay:** Connect to 3+ relays, verify deduplication, verify outbox routing.
- **Reconnection:** Kill a relay mid-session, verify the client reconnects and re-subscribes.
- **Large follow lists:** Test with 500+ followed pubkeys, verify timeline loads in reasonable time.
- **Gift wrap DMs:** Send and receive NIP-17 DMs, verify decryption.
- **Zaps:** Execute the full zap flow with a test Lightning wallet.

### 17.3 Interoperability Testing

Test your client against other clients:
- Publish from your client, read from Damus/Amethyst/Primal.
- Publish from Damus/Amethyst/Primal, read from your client.
- Verify threading, reactions, reposts, and profiles all render correctly.

### 17.4 Automated Testing Tools

- **nostr-tools `matchFilter`** -- test your filter logic without a relay.
- **nak** -- CLI tool for interacting with relays (`nak event`, `nak req`, `nak decode`).
- **nostr-relay-tester** -- automated test suite for relay compliance.

---

## Further Reading

- [Client Architecture Patterns](../clients/architecture-patterns.md) -- deeper dive into relay pools, subscription strategies, caching, and UI patterns.
- [Building a Relay](./building-a-relay.md) -- understand the other side of the protocol.
- [Common Patterns](./common-patterns.md) -- reusable design patterns across NOSTR applications.
- [Protocol: Event Model](../protocol/event-model.md) -- canonical event structure reference.
- [Protocol: Relay Protocol](../protocol/relay-protocol.md) -- WebSocket message format reference.
- [Libraries: nostr-tools](../libraries/javascript/nostr-tools.md) -- full API reference.
- [Libraries: NDK](../libraries/javascript/ndk.md) -- full API reference.
- [Libraries: rust-nostr](../libraries/rust/nostr-sdk.md) -- full API reference.
