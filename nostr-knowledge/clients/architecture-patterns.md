# Client Architecture Patterns

> Common architectural patterns for building NOSTR clients, covering relay
> connection management, subscription strategies, event processing, local
> storage, key management, and UI patterns. Draws from Damus, Amethyst, Gossip,
> Coracle, Primal, and the nostr-tools / NDK / rust-nostr libraries.

---

## 1. Relay Connection Management

A NOSTR client must manage simultaneous WebSocket connections to multiple relays.
This is the foundation of the client architecture -- get it wrong and everything
built on top will be fragile.

### 1.1 Connection Pooling

The client should maintain a single, shared pool of relay connections. Every
component in the application (timeline, profile view, thread view, publisher)
draws from the same pool. Never open duplicate connections to the same relay.

**Pool architecture:**
```
+------------------------------------------+
|           Relay Connection Pool           |
|                                          |
|  wss://relay-a.com  [CONNECTED]          |
|    - subscriptions: feed, profile-xyz    |
|    - write queue: 2 pending              |
|    - last activity: 3s ago               |
|                                          |
|  wss://relay-b.com  [CONNECTED]          |
|    - subscriptions: feed                 |
|    - write queue: 0                      |
|    - last activity: 1s ago               |
|                                          |
|  wss://relay-c.com  [RECONNECTING]      |
|    - attempt: 3, next retry: 8s          |
|    - queued subscriptions: thread-abc    |
|                                          |
|  wss://relay-d.com  [IDLE]              |
|    - no active subscriptions             |
|    - close after 60s idle timeout        |
+------------------------------------------+
```

**Pool responsibilities:**
- Open connections on demand when a subscription or publish targets a relay
- Reuse existing connections for new subscriptions to the same relay
- Close idle connections after a timeout (save resources, respect relay limits)
- Track connection state: connecting, connected, authenticating, disconnected
- Queue messages for relays that are reconnecting (deliver when reconnected)
- Expose connection health to the UI (show which relays are online)

**Reference implementations:**
- nostr-tools `SimplePool` -- basic connection pool with subscription management
- NDK `NDKPool` -- advanced pool with relay scoring and automatic selection
- rust-nostr `RelayPool` -- full-featured pool with NIP-42 auth, negentropy sync

### 1.2 Reconnection with Exponential Backoff

Connections will drop. The client must reconnect automatically without
overwhelming the relay or the user's network.

**Algorithm:**
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

**Critical: jitter.** Without jitter, if a relay restarts and 10,000 clients
all reconnect at the same intervals, they will hit the relay in synchronized
waves (thundering herd). Random jitter spreads the load.

**On reconnection:**
1. Re-establish all active subscriptions for this relay (they were lost when
   the WebSocket closed)
2. Use `since` timestamps to avoid re-fetching events already received
3. Re-authenticate if the relay requires NIP-42
4. Drain any queued publish messages

**Connection health detection:**
- Send WebSocket ping frames every 30--60 seconds
- If no pong within 10 seconds, consider the connection dead and begin
  reconnection
- Some relays send periodic NOTICE messages as implicit keepalives

### 1.3 Relay Selection: The Outbox Model (NIP-65)

The outbox model answers the routing question: which relays should I connect to
in order to find a specific user's events?

**Core principle:** Each user publishes a kind-10002 event declaring their
read and write relays. Clients use this information to route queries and
publications efficiently.

**Reading a user's events:**
```
1. Look up target user's kind:10002 (relay list metadata)
2. Extract their WRITE relays (where they publish)
3. Connect to those relays
4. Subscribe with authors=[target_pubkey]
```

**Sending an event that mentions a user:**
```
1. Look up mentioned user's kind:10002
2. Extract their READ relays (where they listen)
3. Publish the event to:
   - Your own WRITE relays (so your followers see it)
   - The mentioned user's READ relays (so they see it)
```

**Bootstrap problem:** To fetch a user's relay list, you need to know which
relay has it. Solutions:
- Well-known indexing relays (purplepag.es, relay.damus.io)
- NIP-05 resolution includes relay hints in `.well-known/nostr.json`
- `nprofile` and `nevent` bech32 encodings carry relay URL hints (NIP-19)
- Relay hints in `p` and `e` tags

**Relay list caching:**
- Cache kind-10002 events in local storage
- Refresh periodically (e.g., every hour or when a user's profile is viewed)
- Fall back to cached relay list if the fresh fetch fails

### 1.4 Read vs Write Relay Sets

The client should maintain distinct relay sets for different operations:

| Operation | Relay Set | Source |
|-----------|-----------|--------|
| Publish own events | Own WRITE relays | Own kind:10002 |
| Read own notifications | Own READ relays | Own kind:10002 |
| Read a specific user's posts | That user's WRITE relays | Their kind:10002 |
| Send mention/reply to a user | That user's READ relays + own WRITE relays | Both kind:10002 events |
| Fetch profiles/relay lists | Indexing relays + any connected relay | Hardcoded + discovered |
| Search | Relays supporting NIP-50 | NIP-11 supported_nips or kind:10007 (search relays list) |

**Dynamic relay selection per subscription:**
```
function selectRelays(filter, operation):
    relays = Set()

    if operation == READ:
        for author in filter.authors:
            relays.addAll(getWriteRelays(author))

    if operation == WRITE:
        relays.addAll(getOwnWriteRelays())
        for mentionedPubkey in event.pTags:
            relays.addAll(getReadRelays(mentionedPubkey))

    // Add fallback relays if set is empty or small
    if relays.size < 2:
        relays.addAll(DEFAULT_RELAYS)

    return relays
```

---

## 2. Subscription Management

### 2.1 Deduplication of Events from Multiple Relays

The same event will often arrive from multiple relays. The client MUST
deduplicate by event `id`.

**Implementation:**
```
seen_events: Set<event_id>   // or LRU cache with TTL

function onEventReceived(event, relay_url):
    if event.id in seen_events:
        return  // skip duplicate
    seen_events.add(event.id)
    processEvent(event)
```

**For replaceable events** (kinds 0, 3, 10000--19999) and **addressable events**
(kinds 30000--39999), deduplication also means keeping only the latest version:

```
function onReplaceableEventReceived(event):
    key = (event.pubkey, event.kind)   // or + d-tag for addressable
    existing = replaceable_store.get(key)

    if existing is null:
        store(event)
    else if event.created_at > existing.created_at:
        replace(existing, event)
    else if event.created_at == existing.created_at and event.id < existing.id:
        replace(existing, event)   // tiebreaker: lower id wins
    else:
        discard(event)
```

### 2.2 EOSE Handling and Transition to Live Streaming

Every subscription goes through two phases:

1. **Historical phase:** The relay sends stored events matching the filter,
   ending with an EOSE message.
2. **Live phase:** After EOSE, any new matching events arrive in real-time.

**Why EOSE matters for UI:**

- Before EOSE: the client is loading. Show a loading indicator or
  progressively render events as they arrive.
- After EOSE: the initial load is complete. Remove the loading indicator.
  Any subsequent events are live updates -- prepend them to the timeline
  or show a "new events available" banner.

**Multi-relay EOSE:**

When subscribed to the same filter on 5 relays, you get 5 EOSE messages (one
per relay). The client must decide when the "overall" load is complete:

```
Strategy 1: Wait for ALL relays to EOSE
  - Most complete results
  - Slowest relay determines load time
  - Risk: one slow/dead relay blocks the UI indefinitely

Strategy 2: Wait for FIRST relay to EOSE
  - Fastest perceived load
  - May miss events from slower relays
  - Good for initial render, then merge late arrivals

Strategy 3: Wait for MAJORITY of relays to EOSE (recommended)
  - Good balance of completeness and speed
  - Set a timeout (e.g., 5 seconds) -- if not all relays EOSE by then,
    consider the load complete anyway

Strategy 4: Progressive rendering with deadline
  - Start rendering events as they arrive (no EOSE wait)
  - After timeout (e.g., 3 seconds), mark load complete
  - Late-arriving events are merged in the background
```

### 2.3 Subscription Lifecycle

```
[1] CREATE
    - Build filter(s) for the data needed
    - Select target relays (outbox model)
    - Open connections if needed
    - Send ["REQ", <sub_id>, <filter1>, <filter2>, ...]
    - Track subscription in local state

[2] RECEIVE STORED EVENTS
    - Events arrive (not necessarily in order)
    - Deduplicate by id
    - Verify signature (see Section 3.1)
    - Accumulate or progressively render

[3] EOSE
    - Mark subscription as "live"
    - Signal UI that initial load is complete

[4] RECEIVE LIVE EVENTS
    - New events matching the filter arrive
    - Process identically to stored events
    - Update UI (prepend to timeline, increment counters, etc.)

[5] REPLACE (optional)
    - Send a new REQ with the same sub_id but different filters
    - Relay discards old filters, applies new ones
    - Useful for pagination: narrow the time range

[6] CLOSE
    - Send ["CLOSE", <sub_id>] to each relay
    - Remove subscription from local state
    - IMPORTANT: always close subscriptions when navigating away from
      the view that created them. Open subscriptions consume relay resources.
```

### 2.4 Batching REQ Messages

Instead of sending one REQ per data need, combine related queries into a single
REQ with multiple filters (which are OR'd):

**Before (3 separate subscriptions):**
```json
["REQ", "profiles", {"kinds": [0], "authors": ["pk1", "pk2", "pk3"]}]
["REQ", "notes",    {"kinds": [1], "authors": ["pk1", "pk2", "pk3"], "limit": 50}]
["REQ", "relaylists", {"kinds": [10002], "authors": ["pk1", "pk2", "pk3"]}]
```

**After (1 subscription, 3 filters):**
```json
["REQ", "batch",
  {"kinds": [0], "authors": ["pk1", "pk2", "pk3"]},
  {"kinds": [1], "authors": ["pk1", "pk2", "pk3"], "limit": 50},
  {"kinds": [10002], "authors": ["pk1", "pk2", "pk3"]}
]
```

**Benefits:**
- Fewer subscription IDs to track
- Single EOSE tells you all three data types have been loaded
- Less overhead on the relay (one subscription state instead of three)

**Caveat:** The `limit` applies per-filter for the combined result set. If you
need independent limits per query type, use separate subscriptions.

---

## 3. Event Processing Pipeline

### 3.1 Signature Verification

Every event received from a relay MUST be verified before being trusted or
displayed. Relays can be malicious or compromised.

**Verification steps:**
```
1. Recompute the event id:
   expected_id = SHA-256( serialize([0, event.pubkey, event.created_at,
                                      event.kind, event.tags, event.content]) )

2. Compare: expected_id == event.id
   If not: discard the event (relay sent garbage)

3. Verify Schnorr signature:
   schnorr_verify(event.pubkey, event.id, event.sig)
   If invalid: discard the event
```

**Performance optimization:** Signature verification is CPU-intensive (~100us
per event). For mobile clients receiving hundreds of events:

- Verify on a background thread / web worker
- Batch verify if the crypto library supports it
- Cache verification results: once verified, an event id is permanently valid
  (events are immutable)
- Skip re-verification for events already in local storage (they were verified
  on first receipt)

### 3.2 Content Parsing

Event content is plain UTF-8 text, but clients must parse it for rich rendering.

**Mentions (NIP-27, nostr: URI scheme NIP-21):**
```
Content: "Check out nostr:npub1abc123... they wrote nostr:note1xyz789..."

Parse:
  - nostr:npub1... -> resolve to pubkey hex, render as @username link
  - nostr:note1... -> resolve to event id hex, render as embedded note
  - nostr:nprofile1... -> pubkey + relay hints, render as @username link
  - nostr:nevent1... -> event id + relay hints, render as embedded note
  - nostr:naddr1... -> addressable event coordinate, render as link
```

**Media URLs:**
```
Detect URLs in content:
  - Image: .jpg, .jpeg, .png, .gif, .webp, .svg -> render inline image
  - Video: .mp4, .webm, .mov -> render inline video player
  - Audio: .mp3, .ogg, .wav -> render inline audio player
  - YouTube/Vimeo/etc. -> render embed
  - Other URLs -> render as clickable link with preview (Open Graph)
```

**Hashtags:**
```
Content includes #bitcoin or #nostr
Also check "t" tags: ["t", "bitcoin"]
Render as clickable hashtag links that navigate to hashtag feeds
```

**Custom emoji (NIP-30):**
```
Content: "Hello :sats: world"
Tags: ["emoji", "sats", "https://example.com/sats.png"]
Render: replace :sats: with inline image from the URL
```

**Inline media metadata (NIP-92):**
```
Tags: ["imeta", "url https://...", "m image/jpeg", "dim 1920x1080", ...]
Use to render media with correct dimensions before loading (prevent layout shift)
```

### 3.3 Thread Building (Resolving Reply Chains)

NOSTR threads are trees of events linked by `e` tags with markers (NIP-10).

**Thread resolution algorithm:**
```
function buildThread(rootEventId):
    // Step 1: Fetch the root event
    root = fetchById(rootEventId)

    // Step 2: Fetch all replies referencing the root
    replies = subscribe({
        "#e": [rootEventId],
        "kinds": [1, 1111]  // text notes + comments
    })

    // Step 3: Build the tree
    tree = new Map()  // parent_id -> [child events]

    for each reply:
        // Find the "reply" marker tag
        replyTag = reply.tags.find(t => t[0]=="e" && t[3]=="reply")
        if replyTag:
            parentId = replyTag[1]
        else:
            // Find the "root" marker (direct reply to root)
            rootTag = reply.tags.find(t => t[0]=="e" && t[3]=="root")
            if rootTag:
                parentId = rootTag[1]
            else:
                // Fallback: deprecated positional scheme
                parentId = reply.tags.filter(t => t[0]=="e").last()[1]

        tree[parentId].push(reply)

    // Step 4: Fetch missing intermediate events
    // If reply X references parent Y, but we don't have Y, fetch it
    for each parentId in tree.keys():
        if parentId not in known_events:
            // Use relay hint from the e tag if available
            missingEvent = fetchById(parentId, relayHint)

    // Step 5: Sort children by created_at
    // Step 6: Return nested tree structure

    return tree
```

**Cross-relay thread assembly:**

Thread participants may use different relays. A complete thread requires
querying multiple relays:

1. Query your connected relays for `#e: [root_id]`
2. Extract relay hints from `e` tags in replies
3. Connect to hinted relays and query there too
4. Merge and deduplicate results
5. Repeat for any newly discovered relay hints

This is inherently iterative -- each round of fetching may reveal new relay
hints that lead to more replies.

### 3.4 Timeline Construction

**Home timeline (follow feed):**
```
1. Load own kind:3 (follow list) -> extract followed pubkeys
2. For each followed pubkey, get their kind:10002 -> extract write relays
3. Group pubkeys by relay:
     relay-a: [alice, bob, carol]
     relay-b: [dave, eve]
     relay-c: [alice, dave]   (overlap is fine)
4. For each relay, subscribe:
     {"kinds": [1,6,7,16,30023], "authors": [grouped_pubkeys], "limit": 50}
5. Merge events from all relays, deduplicate by id
6. Sort by created_at descending
7. Render timeline
8. Keep subscriptions open for live updates
```

**Pagination (loading older events):**
```
User scrolls to bottom of timeline.
Oldest visible event has created_at = T.

Send new subscription:
  {"kinds": [1,6,7], "authors": [followed], "until": T-1, "limit": 50}

Append results below the current timeline.
Close the pagination subscription after EOSE (one-shot fetch).
```

**Timeline merging across relays:**

Events from different relays arrive out of order. The client must maintain a
sorted data structure and insert events at the correct position:

```
// Binary search insert into sorted array (by created_at DESC, then id ASC)
function insertEvent(timeline, event):
    position = binarySearch(timeline, event.created_at)
    // Handle ties: events with same created_at sorted by id ascending
    timeline.insert(position, event)
```

---

## 4. Local Storage and Caching

### 4.1 What to Cache

| Data Type | Kind | Cache Strategy | Invalidation |
|-----------|------|----------------|-------------|
| User profiles | 0 | Cache per pubkey. Show cached while fetching fresh. | Replaceable: newer created_at wins |
| Follow lists | 3 | Cache per pubkey. Needed for timeline construction. | Replaceable: newer created_at wins |
| Relay lists | 10002 | Cache per pubkey. Critical for outbox model routing. | Replaceable: newer created_at wins |
| Text notes | 1 | Cache all received. Immutable. | Never (regular events are permanent) |
| Reactions | 7 | Cache counts per event. Can be approximate. | Accumulate new, never invalidate |
| Repost events | 6, 16 | Cache all received. Immutable. | Never |
| Mute lists | 10000 | Cache own. Apply as local filter. | Replaceable: newer wins |
| DM relay list | 10050 | Cache per pubkey for DM routing. | Replaceable: newer wins |

### 4.2 Cache Invalidation for Replaceable Events

Replaceable events (kinds 0, 3, 10000--19999) and addressable events (kinds
30000--39999) have specific replacement rules:

```
Replacement key:
  Replaceable:  (pubkey, kind)
  Addressable:  (pubkey, kind, d_tag_value)

On receiving a new event:
  existing = cache.get(replacement_key)
  if existing is null OR new.created_at > existing.created_at:
      cache.set(replacement_key, new_event)
  else if new.created_at == existing.created_at AND new.id < existing.id:
      cache.set(replacement_key, new_event)  // lower id tiebreaker
```

**Staleness detection:**
- When navigating to a user's profile, show the cached kind-0 immediately
  but also fire a fresh subscription
- If the fresh fetch returns a newer event, update the display
- Display a subtle indicator if the cached data is very old (e.g., > 24 hours)

### 4.3 Storage Technologies by Platform

| Platform | Recommended Storage | Notes |
|----------|-------------------|-------|
| Web browser | IndexedDB | Async, structured, good capacity (hundreds of MB). Use Dexie.js or idb wrapper. |
| iOS | SQLite (via GRDB/FMDB) or Core Data | Native, fast, well-integrated. Damus uses a custom event cache. |
| Android | SQLite (via Room) | Standard Android persistence. Amethyst uses this approach. |
| Desktop (Rust) | LMDB or SQLite | Gossip uses LMDB for its local event store, same engine as strfry. |
| Desktop (Electron) | SQLite (better-sqlite3) or IndexedDB | Depends on architecture. |

### 4.4 Offline Support

A well-cached client can function offline:

**Readable offline:**
- Display cached timelines, profiles, and threads
- Show cached conversation history
- Browse cached long-form content

**Writable offline (advanced):**
- Queue signed events locally
- When connectivity returns, publish queued events to relays
- Handle conflicts: if a replaceable event was published by another client
  while offline, the one with the higher created_at wins

**Sync on reconnect:**
- Use `since` filters set to the timestamp of the last received event
- NIP-77 (negentropy) for efficient bulk sync after extended offline periods

---

## 5. Key Management Patterns

The client must sign events on behalf of the user without exposing the private
key to unnecessary risk. There are four established patterns, offering different
trade-offs between convenience and security.

### 5.1 In-App Key Storage

The client holds the private key directly in its own storage.

**Where the key lives:**
- Web: encrypted in localStorage or IndexedDB (encrypted with a passphrase)
- Mobile: OS keychain (iOS Keychain, Android Keystore)
- Desktop: OS keychain or encrypted file

**Signing flow:**
```
User creates event -> client serializes -> client computes id
  -> client signs with in-memory private key -> publish
```

**Advantages:**
- Simplest to implement
- No external dependencies
- No network round-trip for signing
- Works offline

**Disadvantages:**
- Private key is exposed to the client application
- If the app is compromised, the key is compromised
- Each app has its own copy of the key
- No centralized key revocation

**Mitigation: NIP-49 (Private Key Encryption)**
Store the key encrypted with a passphrase (scrypt-derived key, XChaCha20-Poly1305).
Decrypt into memory when the user unlocks the app. Clear from memory on lock.

### 5.2 NIP-07: Browser Extension Signing

A browser extension (nos2x, Alby, nostr-keyx) injects a `window.nostr` object
into web pages. The web client calls methods on this object to sign events
and encrypt/decrypt content.

**Interface:**
```javascript
// Get the user's public key
const pubkey = await window.nostr.getPublicKey();

// Sign an event (extension adds id, pubkey, sig)
const signedEvent = await window.nostr.signEvent({
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: "Hello from a web client!"
});

// NIP-44 encryption (preferred over NIP-04)
const ciphertext = await window.nostr.nip44.encrypt(recipientPubkey, plaintext);
const plaintext  = await window.nostr.nip44.decrypt(senderPubkey, ciphertext);
```

**Client implementation pattern:**
```javascript
async function publishEvent(kind, content, tags) {
    if (!window.nostr) {
        throw new Error("No NIP-07 signer available. Install a browser extension.");
    }

    const event = {
        created_at: Math.floor(Date.now() / 1000),
        kind,
        tags,
        content,
    };

    const signed = await window.nostr.signEvent(event);
    // signed now has id, pubkey, sig fields

    for (const relay of publishRelays) {
        relay.send(JSON.stringify(["EVENT", signed]));
    }
}
```

**Advantages:**
- Private key never touches the web application
- One extension serves all web clients
- User can review and approve each signing request
- Extension can enforce per-site permissions

**Disadvantages:**
- Only works in web browsers
- User must install a browser extension
- Each signing request may require user interaction (click to approve)
- Extension availability is not guaranteed (check before use)

### 5.3 NIP-46: Remote Signer (Nostr Connect / Bunker)

The private key lives on a separate device or server (the "bunker"). The client
communicates with the signer through encrypted kind-24133 events relayed
through a NOSTR relay.

**Connection flow (bunker:// URI):**
```
1. User pastes bunker://signer-pubkey?relay=wss://relay.example.com&secret=abc
2. Client generates an ephemeral keypair for this session
3. Client connects to the specified relay
4. Client subscribes to kind:24133 events tagged to its ephemeral pubkey
5. Client sends a "connect" request (encrypted, NIP-44)
6. Signer responds with "ack"
7. Channel is established -- all subsequent operations use this channel
```

**Signing flow:**
```
Client                           Relay                         Signer
  |                                |                              |
  | kind:24133 {sign_event, json}  |                              |
  |------------------------------->|----------------------------->|
  |                                |                              |
  |                                |  kind:24133 {result, signed} |
  |<-------------------------------|<-----------------------------|
  |                                |                              |
```

**Supported operations:**
- `sign_event` -- sign an event
- `get_public_key` -- retrieve the user's pubkey
- `nip44_encrypt` / `nip44_decrypt` -- encryption operations
- `nip04_encrypt` / `nip04_decrypt` -- legacy encryption
- `ping` -- connection health check

**Advantages:**
- Private key never leaves the signer device/server
- Works across platforms (web, mobile, desktop)
- Signer can enforce policies (e.g., only allow certain kinds)
- Supports multiple clients connecting to one signer
- Hardware-wallet-like security model

**Disadvantages:**
- Latency: every signing operation requires a network round-trip
- Requires a relay to be online for the communication channel
- More complex to set up than in-app keys
- Cannot work offline

### 5.4 NIP-55: Android Signer Application

Android-specific inter-app signing using Intents and Content Resolvers.
Amber is the reference implementation.

**Detection:**
```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:"))
val available = context.packageManager.queryIntentActivities(intent, 0).isNotEmpty()
```

**Signing flow (Intent for first use):**
```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$eventJson"))
intent.`package` = signerPackageName
intent.putExtra("type", "sign_event")
intent.putExtra("id", eventId)
intent.putExtra("current_user", userPubkey)
launcher.launch(intent)
// Result arrives in onActivityResult with signature in extras
```

**Background signing (Content Resolver for authorized operations):**
```kotlin
val cursor = contentResolver.query(
    Uri.parse("content://$signerPackage.SIGN_EVENT"),
    arrayOf(eventJson, "", userPubkey),
    null, null, null
)
// Read signature from cursor
```

**Advantages:**
- Native Android experience (no browser extension needed)
- OS-level app isolation protects the key
- Content Resolver enables background signing without user interaction
  (after initial authorization)
- Works with any Android Nostr client

**Disadvantages:**
- Android only
- Requires a separate signer app to be installed
- Intent-based flow requires UI context switching for first authorization

### 5.5 Choosing a Key Management Pattern

| Pattern | Security | UX | Offline | Platform |
|---------|----------|-----|---------|----------|
| In-app key | Low | Best (seamless) | Yes | Any |
| NIP-07 extension | Medium | Good (click to approve) | Yes | Web |
| NIP-46 remote signer | High | Moderate (network latency) | No | Any |
| NIP-55 Android signer | High | Good (native intents) | Partial | Android |

**Recommendation:** Support multiple patterns. Check for NIP-07/NIP-55 first,
fall back to NIP-46 remote signer, and offer in-app key as a last resort.
Display clear security tradeoffs to the user.

---

## 6. UI Patterns

### 6.1 Infinite Scroll with Event Fetching

The most common timeline UX. As the user scrolls down, older events are
loaded on demand.

**Implementation:**
```
State:
  events: SortedList<Event>   // sorted by created_at DESC
  oldest_timestamp: number     // created_at of the oldest event in view
  loading: boolean
  has_more: boolean

Initial load:
  subscribe({"kinds": [1], "authors": followed, "limit": 50})
  on EOSE: loading = false

Scroll to bottom trigger:
  if loading or !has_more: return
  loading = true
  subscribe({"kinds": [1], "authors": followed,
             "until": oldest_timestamp - 1, "limit": 50})
  on EOSE:
    if no new events received: has_more = false
    loading = false
  close this pagination subscription (one-shot)
```

**Performance considerations:**
- Virtualize the scroll list (only render visible items + small buffer)
- Recycle DOM elements or view components
- Lazy-load images and media
- Limit the number of events kept in memory (e.g., 500). Discard oldest
  when scrolling deep. Re-fetch if user scrolls back up.

### 6.2 Real-Time Updates

After the initial timeline load, new events arrive via live subscriptions.
There are two UX approaches:

**Approach 1: Auto-prepend (Damus, Amethyst default)**
```
New event arrives -> insert at top of timeline
If user is scrolled to top: they see it immediately
If user is scrolled down: timeline shifts (can be jarring)
```

**Approach 2: "New events" banner (Twitter/X style, Coracle)**
```
New event arrives -> add to pending buffer, do NOT insert into visible timeline
Show banner: "3 new notes" at top of screen
User taps banner -> insert pending events at top, scroll to top
```

Approach 2 is generally better UX for high-volume feeds -- it prevents the
content the user is reading from jumping around.

### 6.3 Optimistic Publishing

When the user creates an event, show it in the UI immediately without waiting
for relay confirmation.

**Flow:**
```
1. User taps "Post"
2. Sign the event
3. Insert into local timeline immediately (with "sending..." indicator)
4. Publish to relays in the background
5. As OK responses arrive:
   - If any relay accepts: mark as "sent" (remove indicator)
   - If all relays reject: mark as "failed" (show retry option)
6. If network is unavailable: queue locally, show "pending" indicator
```

**Error handling:**
```
- "rate-limited:" -> retry after delay
- "blocked:" -> show error, suggest different relay
- "invalid:" -> this is a client bug, show error, log for debugging
- "auth-required:" -> authenticate and retry automatically
- Network timeout -> retry with backoff
```

### 6.4 Thread / Conversation Views

Displaying a thread requires fetching the root event, all replies, and
potentially missing intermediate events.

**UI structure:**
```
+-- Root Event (highlighted or full-width)
|
+-- Reply A (by Alice)
|   |
|   +-- Reply A1 (by Bob, to Alice)
|   |
|   +-- Reply A2 (by Carol, to Alice)
|
+-- Reply B (by Dave)
    |
    +-- Reply B1 (by Eve, to Dave)
```

**Loading strategy:**
```
1. Fetch root event by id (may use relay hints)
2. Subscribe: {"kinds": [1, 1111], "#e": [root_id]}
3. As replies arrive, build tree using e-tag markers:
   - "root" marker -> direct reply to root
   - "reply" marker -> reply to the referenced event
4. Detect missing parents:
   If reply X references parent Y and we don't have Y:
   - Fetch Y by id (using relay hint from the e tag)
   - Insert Y into the tree
5. Fetch author metadata (kind:0) for each unique pubkey in the thread
6. Render incrementally: show what we have, expand as more data arrives
```

**Depth limiting:**
- Very deep threads can be expensive to render
- Consider collapsing branches beyond depth N with an "expand" button
- Limit the initial fetch and load deeper branches on demand

### 6.5 Profile Resolution

Every event in a timeline needs author metadata (display name, avatar, NIP-05).
Profiles are kind-0 replaceable events.

**Batched profile fetching:**
```
1. Collect all unique pubkeys from the current view
2. Check local cache: which profiles are already known?
3. For unknown pubkeys, batch into one REQ:
   {"kinds": [0], "authors": [pk1, pk2, pk3, ...]}
4. As profiles arrive, update the UI reactively
5. Cache profiles locally
```

**Display resolution order:**
```
1. Show pubkey (truncated: npub1abc...xyz) as placeholder
2. If cached profile exists: show display_name or name + picture
3. If NIP-05 is set: show user@domain.com
4. If fresh profile fetch returns updated data: update display
```

**NIP-05 verification:**
```
Profile has nip05: "alice@example.com"

1. GET https://example.com/.well-known/nostr.json?name=alice
2. Response: {"names": {"alice": "<pubkey-hex>"}}
3. Verify: response pubkey matches the profile pubkey
4. If valid: show verified badge / checkmark
5. Cache result with TTL (e.g., 1 hour)
6. If fetch fails: don't show verification, don't show error
```

**Avatar handling:**
- Load avatars lazily (only when the event scrolls into view)
- Use image caching (browser cache or in-app image cache)
- Show a colored placeholder (derived from pubkey) while loading
- Handle broken image URLs gracefully (show fallback)

---

## 7. Putting It All Together: Reference Client Architecture

```
+------------------------------------------------------------------+
|                          UI Layer                                 |
|  Timeline | Profile | Thread | Composer | Settings | Notifications|
+------------------------------------------------------------------+
      |            |          |         |          |
+------------------------------------------------------------------+
|                    Application Logic                             |
|  TimelineBuilder | ThreadResolver | ProfileResolver | Publisher  |
|  NotificationManager | SearchHandler | ZapHandler               |
+------------------------------------------------------------------+
      |            |          |         |          |
+------------------------------------------------------------------+
|                    Nostr Protocol Layer                           |
|  SubscriptionManager | EventValidator | ContentParser            |
|  FilterBuilder | NIP-42AuthHandler | NIP-65RelayRouter          |
+------------------------------------------------------------------+
      |                                         |
+----------------------------+    +----------------------------+
|    Relay Connection Pool   |    |     Local Storage          |
|  WebSocket management      |    |  Event cache               |
|  Reconnection logic        |    |  Profile cache             |
|  Backpressure handling     |    |  Relay list cache          |
|  Connection health         |    |  Draft queue               |
+----------------------------+    +----------------------------+
      |                                         |
+----------------------------+    +----------------------------+
|    Key Management          |    |     Media Handling         |
|  NIP-07 extension          |    |  URL detection             |
|  NIP-46 remote signer      |    |  Image/video loading       |
|  NIP-55 Android signer     |    |  Blossom/NIP-96 uploads    |
|  In-app key storage        |    |  Content warnings          |
+----------------------------+    +----------------------------+
```

**Data flow for displaying a home timeline:**
```
1. KeyManagement.getPublicKey()
2. LocalStorage.getFollowList(pubkey) || SubscriptionManager.fetch(kind:3)
3. For each followed pubkey:
     LocalStorage.getRelayList(pk) || SubscriptionManager.fetch(kind:10002)
4. NIP65RelayRouter.groupByRelay(followed_pubkeys)
5. RelayPool.ensureConnected(target_relays)
6. SubscriptionManager.subscribe(relay_grouped_filters)
7. Events arrive -> EventValidator.verify() -> ContentParser.parse()
8. TimelineBuilder.insert(event) -> UI.render()
9. ProfileResolver.batchFetch(unknown_pubkeys) -> UI.updateAvatars()
```

---

## References

- NIP-01: Basic protocol -- events, filters, subscriptions, relay messages
- NIP-07: Browser extension signing (`window.nostr`)
- NIP-10: Text notes and threading -- e-tag markers for reply chains
- NIP-11: Relay Information Document -- capability discovery
- NIP-19: Bech32-encoded entities -- npub, note, nprofile, nevent, naddr
- NIP-21: `nostr:` URI scheme for in-content references
- NIP-27: Text note references -- how to embed references in content
- NIP-30: Custom emoji
- NIP-40: Expiration timestamp
- NIP-42: Authentication -- challenge-response for relay access
- NIP-44: Versioned encryption -- used by NIP-46 and NIP-17
- NIP-46: Nostr Remote Signing (Nostr Connect / Bunker)
- NIP-49: Private key encryption
- NIP-50: Search capability
- NIP-55: Android signer application
- NIP-65: Relay List Metadata -- the outbox model
- NIP-77: Negentropy syncing -- efficient set reconciliation
- NIP-92: Inline media metadata (imeta tags)
- nostr-tools: https://github.com/nbd-wtf/nostr-tools
- NDK: https://github.com/nostr-dev-kit/ndk
- rust-nostr: https://github.com/rust-nostr/nostr
- go-nostr: https://github.com/nbd-wtf/go-nostr
- Damus: https://github.com/damus-io/damus
- Amethyst: https://github.com/vitorpamplona/amethyst
- Gossip: https://github.com/mikedilger/gossip
- Coracle: https://github.com/coracle-social/coracle
