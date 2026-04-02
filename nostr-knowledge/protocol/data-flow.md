# NOSTR Data Flow

> End-to-end reference for how data moves through the NOSTR network: from key
> generation through event creation, relay distribution, subscription, delivery,
> and verification. Covers the outbox model (NIP-65), multi-relay strategies,
> event propagation, thread resolution, and timeline construction.

---

## 1. End-to-End Flow Overview

```
 KEY GENERATION        EVENT CREATION         SIGNING
 ┌─────────────┐      ┌──────────────────┐   ┌─────────────────┐
 │ Generate     │      │ Construct event  │   │ Serialize to    │
 │ secp256k1    │─────>│ JSON object with │──>│ canonical form, │
 │ keypair      │      │ kind, tags,      │   │ SHA-256 for id, │
 │              │      │ content          │   │ Schnorr sign    │
 └─────────────┘      └──────────────────┘   └────────┬────────┘
                                                       │
                                                       v
 PUBLISHING             RELAY STORAGE          SUBSCRIPTION
 ┌──────────────────┐   ┌─────────────────┐   ┌──────────────────┐
 │ Send ["EVENT",   │   │ Relay validates, │   │ Another client   │
 │  <signed-event>] │──>│ stores (or       │<──│ sends ["REQ",    │
 │ to multiple      │   │ forwards if      │   │  <sub>, <filter>]│
 │ relays           │   │ ephemeral)       │   │                  │
 └──────────────────┘   └────────┬────────┘   └──────────────────┘
                                 │
                                 v
 DELIVERY                VERIFICATION
 ┌──────────────────┐   ┌──────────────────┐
 │ Relay sends      │   │ Receiving client  │
 │ ["EVENT", <sub>, │──>│ recomputes id,    │
 │  <event>]        │   │ verifies Schnorr  │
 │                  │   │ signature         │
 └──────────────────┘   └──────────────────┘
```

---

## 2. Key Generation

NOSTR identities are secp256k1 keypairs, the same elliptic curve used by Bitcoin.

### 2.1 Key Generation Process

```
1. Generate 32 random bytes from a CSPRNG (cryptographically secure PRNG)
2. Validate: the bytes, interpreted as a 256-bit integer, must be in range [1, n-1]
   where n is the secp256k1 curve order
3. This is the PRIVATE KEY (also called "secret key" or nsec)
4. Compute the PUBLIC KEY: multiply the generator point G by the private key
5. Take the x-coordinate only (BIP-340 x-only pubkey format) = 32 bytes
6. Encode as lowercase hex = 64 hex characters
```

### 2.2 Key Encodings

| Format | Prefix | Description | NIP |
|--------|--------|-------------|-----|
| Hex | (none) | Raw 32-byte hex. Used in event JSON. | 01 |
| npub | `npub1` | Bech32-encoded public key for human display | 19 |
| nsec | `nsec1` | Bech32-encoded private key for human display | 19 |
| nprofile | `nprofile1` | Bech32-encoded pubkey + relay hints | 19 |
| nevent | `nevent1` | Bech32-encoded event ID + relay hints + author | 19 |
| naddr | `naddr1` | Bech32-encoded addressable event coordinate | 19 |
| note | `note1` | Bech32-encoded event ID (bare, no hints) | 19 |

**Critical rule:** The hex format is the ONLY format used in event JSON fields (`pubkey`, `id`, tag values). The bech32 formats (npub, nsec, etc.) are for human-facing display and interchange only.

### 2.3 Example

```
Private key (hex): 7f7ff03d123d5ad29de3a85e987d94f8537997b980d96e989f5d6a9db1e5dcf3
Public key (hex):  a4b2856bce05c2059f4e8e98f00e419b8c258dfd8eeb6097c2ed9e3c5a6b6725
Public key (npub): npub15jnkmxnzlawadrsm9e72f0r7hpvlqvfqysh4kz8zdeey0dxz4gsqeg5mks
```

---

## 3. Event Creation

### 3.1 Construction

The client constructs an unsigned event:

```json
{
  "pubkey": "a4b2856bce05c2059f4e8e98f00e419b8c258dfd8eeb6097c2ed9e3c5a6b6725",
  "created_at": 1700000000,
  "kind": 1,
  "tags": [
    ["t", "nostr"],
    ["p", "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678"]
  ],
  "content": "Hello NOSTR! #nostr"
}
```

### 3.2 ID Computation

Serialize the canonical array and hash:

```json
[0,"a4b2856bce05c2059f4e8e98f00e419b8c258dfd8eeb6097c2ed9e3c5a6b6725",1700000000,1,[["t","nostr"],["p","deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678"]],"Hello NOSTR! #nostr"]
```

```
id = SHA-256(above UTF-8 bytes) => "5c83da77af1dec6d..."  (64 hex chars)
```

### 3.3 Signing

```
sig = schnorr_sign(private_key, id_bytes)  => 64-byte Schnorr signature => 128 hex chars
```

### 3.4 Complete Signed Event

```json
{
  "id": "5c83da77af1dec6d7289834c0144a84e8ffe79afb4f5b1f5a0466264c1908b35",
  "pubkey": "a4b2856bce05c2059f4e8e98f00e419b8c258dfd8eeb6097c2ed9e3c5a6b6725",
  "created_at": 1700000000,
  "kind": 1,
  "tags": [
    ["t", "nostr"],
    ["p", "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678"]
  ],
  "content": "Hello NOSTR! #nostr",
  "sig": "a1b2c3d4...128-hex-chars..."
}
```

---

## 4. Publishing and Multi-Relay Strategies

### 4.1 Basic Publishing

The client wraps the signed event and sends it to one or more relays:

```json
["EVENT", { ...signed-event... }]
```

Each relay independently responds with `OK`:

```json
["OK", "5c83da77af1dec6d...", true, ""]
```

### 4.2 Which Relays to Publish To

The selection of relays is governed by the **outbox model** (NIP-65, see Section 5) and practical considerations:

**Author's write relays:** The event MUST be sent to the author's declared write relays (from their kind 10002 event). This is where other clients will look for the author's events.

**Tagged users' read relays:** If the event tags other users (via `p` tags), the event SHOULD also be sent to those users' read relays. This ensures the tagged users see the event.

**General-purpose relays:** For broad visibility, events may also be sent to popular public relays.

### 4.3 Multi-Relay Publishing Flow

```
Client creates event

For each relay in publish_set:
  1. Open WebSocket if not connected
  2. Send ["EVENT", <signed-event>]
  3. Await ["OK", <id>, <status>, <message>]
  4. Log result

publish_set = union(
    author_write_relays,           // from own kind:10002
    tagged_users_read_relays,      // from each tagged user's kind:10002
    fallback_popular_relays        // hardcoded well-known relays
)
```

### 4.4 Handling Publish Failures

| Scenario | Strategy |
|----------|----------|
| Relay offline | Queue event, retry with exponential backoff |
| `rate-limited:` | Back off, retry after delay |
| `blocked:` | Remove relay from publish set for this author |
| `invalid:` | Bug in client -- fix event construction |
| `auth-required:` | Authenticate (NIP-42), then retry |
| Partial success | Acceptable -- NOSTR is resilient to partial replication |

### 4.5 Publish Confirmation Threshold

There is no protocol-level "confirmed" state. Practical approaches:

- **Optimistic:** Consider published after sending to at least 1 relay
- **Conservative:** Wait for `OK` with `true` from at least N relays (e.g., 3)
- **Best effort:** Send to all relays in publish set, do not block on responses

---

## 5. The Outbox Model (NIP-65)

The outbox model is the key architectural pattern for decentralized relay discovery in NOSTR. It answers the question: **How does a client know which relays to connect to in order to read a specific user's events?**

### 5.1 Kind 10002: Relay List Metadata

Each user publishes a replaceable event of kind 10002 that advertises their relay preferences:

```json
{
  "kind": 10002,
  "pubkey": "alice-pubkey-hex",
  "created_at": 1700000000,
  "tags": [
    ["r", "wss://alice-primary.relay.com", "write"],
    ["r", "wss://alice-backup.relay.com", "write"],
    ["r", "wss://popular-relay.com", "read"],
    ["r", "wss://news-relay.com", "read"],
    ["r", "wss://general-relay.com"]
  ],
  "content": ""
}
```

**Tag semantics:**
- `["r", "<url>", "write"]` -- Alice publishes her events here
- `["r", "<url>", "read"]` -- Alice reads events from others here
- `["r", "<url>"]` -- (no marker) Used for both read and write

### 5.2 How the Outbox Model Works

**When fetching events FROM a user (e.g., building their profile, reading their posts):**

The client should connect to that user's **write relays** -- because that is where the user publishes their events.

```
To read Alice's posts:
  1. Fetch Alice's kind:10002 event (from known relays, or relay discovery)
  2. Extract relay URLs marked "write" (or unmarked)
  3. Connect to those relays
  4. Send REQ with authors=[alice-pubkey]
```

**When fetching events ABOUT a user (e.g., replies mentioning them, zaps to them):**

The client should connect to that user's **read relays** -- because other users who want Alice to see their mentions will publish to Alice's read relays.

```
To find replies mentioning Alice:
  1. Fetch Alice's kind:10002 event
  2. Extract relay URLs marked "read" (or unmarked)
  3. Connect to those relays
  4. Send REQ with #p=[alice-pubkey]
```

**When publishing an event that mentions a user:**

The client should publish to the mentioned user's **read relays** in addition to the author's own write relays.

```
Bob replies to Alice:
  1. Fetch Alice's kind:10002 (get her read relays)
  2. Publish reply to:
     - Bob's write relays (so Bob's followers find it)
     - Alice's read relays (so Alice sees the reply)
```

### 5.3 Relay List Discovery Bootstrap

The chicken-and-egg problem: to fetch a user's relay list, you need to know which relay has it.

**Solutions:**
1. **Well-known indexing relays:** Relays like `wss://purplepag.es`, `wss://relay.damus.io`, and other high-traffic relays tend to have many users' kind 10002 events
2. **NIP-05 resolution:** The user's NIP-05 identifier (`user@domain.com`) can include relay hints in the `.well-known/nostr.json` response
3. **Embedded relay hints:** `nprofile` and `nevent` bech32 encodings (NIP-19) include relay URL hints
4. **Tag relay hints:** The second value in `p` and `e` tags is a relay URL hint
5. **Spread the relay list:** NIP-65 recommends spreading a user's kind 10002 event to as many relays as viable

### 5.4 Recommended Relay List Size

NIP-65 recommends keeping relay lists small: **2--4 relays in each category** (read and write). This balances:

- **Reachability:** More relays means more clients can find your events
- **Cost:** Each relay connection costs bandwidth and resources
- **Redundancy:** Multiple relays provide fault tolerance

---

## 6. Event Propagation Patterns

### 6.1 Direct Publishing (No Gossip)

NOSTR relays do NOT automatically forward events to other relays. Events only exist on relays where they were explicitly published. There is no built-in gossip protocol or peer-to-peer relay mesh.

```
Client publishes to Relay A  --> Event exists on Relay A
Client publishes to Relay B  --> Event exists on Relay B
Relay A does NOT tell Relay B about the event
```

This is a fundamental design choice:
- Simplicity: relays are stateless, independent servers
- Privacy: events only go where the author sends them
- Censorship resistance: no single relay can block propagation if the author publishes widely

### 6.2 Client-Driven Propagation

Propagation happens through client behavior:

1. **Multi-relay publishing:** The author's client sends to multiple relays simultaneously
2. **Rebroadcasting:** A reading client that discovers an event on Relay A can re-publish it to Relay B
3. **Bridging services:** Third-party services that subscribe to events on some relays and republish to others
4. **Repost events (kind 6, 16):** When a user reposts an event, the repost is published to the reposter's relays, carrying the original event in its content

### 6.3 Propagation Failure Modes

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Author's relay goes offline | Events are unavailable until relay recovers | Publish to multiple relays |
| Reader not connected to author's relay | Reader never sees the events | Outbox model (NIP-65) |
| Relay rejects event (policy) | Event not stored on that relay | Publish to permissive relays |
| Network partition | Events published during partition only exist on reachable relays | Client re-publishes after partition heals |

---

## 7. Subscription and Event Delivery

### 7.1 How Clients Subscribe

A reading client builds filter sets based on what it needs to display:

```json
["REQ", "home-feed", {
  "kinds": [1, 6, 7, 30023],
  "authors": ["alice-pubkey", "bob-pubkey", "carol-pubkey"],
  "limit": 100
}]
```

### 7.2 The Two Phases of Event Delivery

**Phase 1: Stored Events (Historical)**

The relay scans its database for events matching the filter and sends them, typically ordered by `created_at` descending, up to the `limit`. This ends with EOSE.

```
Relay --> ["EVENT", "home-feed", {...event-at-t100...}]
Relay --> ["EVENT", "home-feed", {...event-at-t99...}]
Relay --> ["EVENT", "home-feed", {...event-at-t98...}]
Relay --> ["EOSE", "home-feed"]
```

**Phase 2: Live Events (Real-Time)**

After EOSE, the relay monitors incoming events. Any new event that matches the subscription's filters is immediately forwarded:

```
  (time passes, a new matching event arrives at the relay)
Relay --> ["EVENT", "home-feed", {...new-event...}]
```

### 7.3 Client-Side Event Processing

When a client receives an event, it SHOULD:

1. **Verify the event ID:** Recompute the SHA-256 of the serialized form and confirm it matches `id`
2. **Verify the signature:** Validate the Schnorr signature against `pubkey` and `id`
3. **Deduplicate:** Check if the event `id` is already known (events may arrive from multiple relays)
4. **Apply client-side filters:** Additional filtering the relay could not perform (e.g., mute lists, content filtering)
5. **Store locally:** Cache in a local database for offline access and fast rendering
6. **Render:** Display to the user in the appropriate context

---

## 8. Resolving Replies and Threads Across Relays

Threading is one of the most complex aspects of building a NOSTR client because thread participants may use different relays.

### 8.1 Thread Structure (NIP-10)

A thread is a tree of events connected by `e` tags with markers:

```
Root Event (id: ROOT)
  |
  +-- Reply A (tags: ["e", ROOT, "", "root"])
  |     |
  |     +-- Reply A1 (tags: ["e", ROOT, "", "root"], ["e", A, "", "reply"])
  |     +-- Reply A2 (tags: ["e", ROOT, "", "root"], ["e", A, "", "reply"])
  |
  +-- Reply B (tags: ["e", ROOT, "", "root"])
        |
        +-- Reply B1 (tags: ["e", ROOT, "", "root"], ["e", B, "", "reply"])
```

### 8.2 Thread Resolution Algorithm

To display a complete thread, a client must:

```
function resolveThread(rootEventId):
    // Step 1: Fetch the root event
    root = fetchEvent(rootEventId)

    // Step 2: Fetch all replies referencing the root
    // Query across multiple relays (author write relays + known relays)
    replies = queryMultipleRelays({
        "#e": [rootEventId],
        "kinds": [1]
    })

    // Step 3: For each reply, check relay hints in e tags
    for reply in replies:
        for tag in reply.tags:
            if tag[0] == "e" and tag[2]:  // relay hint present
                additionalRelays.add(tag[2])

    // Step 4: Query additional relays discovered from hints
    moreReplies = queryRelays(additionalRelays, {
        "#e": [rootEventId],
        "kinds": [1]
    })

    // Step 5: Build tree structure from e tag markers
    //   - "root" marker -> child of root
    //   - "reply" marker -> child of the referenced event
    //   - no marker -> use positional fallback (deprecated NIP-10)

    // Step 6: Fetch any missing intermediate events
    //   If Reply B1 references Reply B, but we don't have Reply B,
    //   fetch it using its event id and relay hints

    return buildTree(root, allReplies)
```

### 8.3 Relay Hints

Tags carry relay hints that help clients find referenced events:

```json
["e", "event-id-hex", "wss://relay-where-event-lives.com", "reply"]
["p", "pubkey-hex", "wss://relay-hint.com"]
["a", "30023:pubkey:slug", "wss://relay-hint.com"]
```

These hints are advisory. The event may also exist on other relays, or the hinted relay may be offline. Clients SHOULD try the hint first, then fall back to other known relays.

### 8.4 Cross-Relay Thread Assembly

In practice, a thread's events are scattered across many relays:

```
Relay A has: Root, Reply A, Reply A1
Relay B has: Root, Reply B
Relay C has: Reply A2, Reply B1

Client connects to Relays A, B, C and merges results by event ID
```

The client merges events from all connected relays, deduplicating by `id`, and builds a unified thread tree. This is why clients connect to multiple relays simultaneously.

---

## 9. Building Timelines

### 9.1 Home Timeline (Follow Feed)

The most common view. Shows events from users the current user follows.

**Algorithm:**

```
1. Fetch own kind:3 event (follow list)
   -> Extract list of followed pubkeys

2. For each followed pubkey, fetch their kind:10002 (relay list)
   -> Extract their write relays

3. Group relays and create efficient subscriptions:
   - Connect to each unique relay
   - For each relay, subscribe with authors = [pubkeys who write to this relay]

4. Send REQ with filters:
   {
     "kinds": [1, 6, 7, 30023],        // text notes, reposts, reactions, articles
     "authors": [pubkey1, pubkey2, ...], // followed users writing to this relay
     "limit": 50
   }

5. Merge events from all relays, deduplicate by id
6. Sort by created_at descending
7. Display timeline
8. Keep subscriptions open for live updates
```

**Optimization -- relay grouping:**

Instead of subscribing to every followed user's write relays individually, group users by relay:

```
Relay A: Alice, Bob, Carol write here    -> REQ with authors=[alice, bob, carol]
Relay B: Dave, Eve write here            -> REQ with authors=[dave, eve]
Relay C: Alice, Dave also write here     -> REQ with authors=[alice, dave]
```

This minimizes the number of relay connections and subscriptions.

### 9.2 Profile Timeline

Shows all events by a specific user.

```
1. Fetch target user's kind:10002
2. Connect to their write relays
3. REQ: {"kinds": [1, 6, 30023], "authors": ["target-pubkey"], "limit": 100}
4. Optionally fetch reactions and zaps:
   REQ: {"kinds": [7, 9735], "#p": ["target-pubkey"], "limit": 50}
```

### 9.3 Thread View

Shows a single conversation thread.

```
1. Fetch the root event (by id, using relay hints or known relays)
2. REQ: {"kinds": [1, 1111], "#e": ["root-event-id"]}
3. For each reply found, check relay hints and fetch from additional relays
4. Build tree structure using e tag markers (root, reply)
5. Fetch author metadata (kind:0) for each unique pubkey in the thread
```

### 9.4 Notifications

Shows events that reference the current user.

```
1. Fetch own kind:10002, extract read relays
2. Connect to read relays (this is where others send mentions)
3. REQ: {"#p": ["own-pubkey"], "kinds": [1, 6, 7, 9735], "since": <last-check>}
4. Also check:
   REQ: {"#e": [<list-of-own-recent-event-ids>], "kinds": [1, 7]}
```

### 9.5 Global/Explore Feed

Shows recent events from all users on a relay. Simple but noisy.

```
REQ: {"kinds": [1], "limit": 100}
```

No author filter means all events on the relay are returned.

### 9.6 Search

If the relay supports NIP-50:

```json
["REQ", "search-sub", {
  "kinds": [1, 30023],
  "search": "bitcoin lightning network",
  "limit": 50
}]
```

### 9.7 Hashtag Feed

Events with a specific topic tag:

```json
["REQ", "hashtag-sub", {
  "kinds": [1, 30023],
  "#t": ["bitcoin"],
  "limit": 50
}]
```

---

## 10. Metadata Resolution

Displaying events requires additional context -- author names, profile pictures, relay lists. Clients batch-fetch this metadata.

### 10.1 Author Metadata

For every unique pubkey seen in a set of events:

```json
["REQ", "metadata", {
  "kinds": [0],
  "authors": ["pubkey-1", "pubkey-2", "pubkey-3"]
}]
```

### 10.2 Reaction and Engagement Counts

For displayed events, fetch engagement data:

```json
["REQ", "reactions", {
  "kinds": [7],
  "#e": ["event-id-1", "event-id-2"]
}]
```

Or use COUNT (NIP-45) for efficiency:

```json
["COUNT", "reaction-count", {
  "kinds": [7],
  "#e": ["event-id-1"]
}]
```

### 10.3 Zap Totals

```json
["REQ", "zaps", {
  "kinds": [9735],
  "#e": ["event-id-1"]
}]
```

The zap amount is extracted from the bolt11 invoice in the zap receipt event.

---

## 11. Complete Data Flow Example

Here is a full end-to-end scenario of Alice posting a note that Bob reads:

### Alice Publishes

```
1. Alice's client generates event:
   kind: 1, content: "gm nostr", tags: [["t", "gm"]]

2. Client serializes: [0, "alice-pubkey", 1700000000, 1, [["t","gm"]], "gm nostr"]
3. Client computes: id = SHA-256(serialized) = "abc123..."
4. Client signs: sig = schnorr_sign(alice_privkey, id_bytes) = "def456..."

5. Client looks up Alice's kind:10002:
   Write relays: wss://relay-a.com, wss://relay-b.com

6. Client sends to both relays:
   ["EVENT", {"id":"abc123...","pubkey":"alice-pubkey","created_at":1700000000,
              "kind":1,"tags":[["t","gm"]],"content":"gm nostr","sig":"def456..."}]

7. Both relays respond:
   ["OK", "abc123...", true, ""]
```

### Bob Reads

```
1. Bob's client loads his follow list (kind:3):
   Bob follows Alice (among others)

2. Client looks up Alice's kind:10002:
   Write relays: wss://relay-a.com, wss://relay-b.com

3. Client connects to wss://relay-a.com and subscribes:
   ["REQ", "feed", {"kinds":[1],"authors":["alice-pubkey"],"limit":50}]

4. Relay responds with Alice's recent events:
   ["EVENT", "feed", {"id":"abc123...","kind":1,"content":"gm nostr",...}]
   ["EOSE", "feed"]

5. Bob's client:
   a. Verifies event id (recompute SHA-256)
   b. Verifies signature (Schnorr verify)
   c. Checks dedup (new event)
   d. Stores locally
   e. Fetches Alice's kind:0 for display name + avatar
   f. Renders in timeline

6. Subscription stays open. When Alice posts again, Bob receives it in real-time:
   ["EVENT", "feed", {"id":"xyz789...","kind":1,"content":"another post",...}]
```

### Bob Replies

```
1. Bob's client creates reply event:
   kind: 1
   tags: [
     ["e", "abc123...", "wss://relay-a.com", "root"],
     ["e", "abc123...", "wss://relay-a.com", "reply"],
     ["p", "alice-pubkey", "wss://relay-a.com"]
   ]
   content: "gm!"

2. Client computes id, signs

3. Client looks up:
   - Bob's write relays (from Bob's kind:10002): wss://relay-c.com, wss://relay-d.com
   - Alice's read relays (from Alice's kind:10002): wss://relay-a.com, wss://relay-e.com

4. Client publishes to: relay-c, relay-d (Bob's write), relay-a, relay-e (Alice's read)

5. Alice's client, subscribed to her read relays with #p filter, receives the reply:
   ["EVENT", "mentions", {"id":"bob-reply-id","kind":1,"content":"gm!",...}]
```

---

## 12. Performance Considerations

### 12.1 Connection Pooling

Clients should maintain a pool of WebSocket connections to relays and reuse them across subscriptions rather than opening new connections for each query.

### 12.2 Request Batching

Combine multiple queries into fewer REQ messages using multiple filters:

```json
["REQ", "batch",
  {"kinds": [0], "authors": ["pk1", "pk2", "pk3"]},
  {"kinds": [1], "authors": ["pk1", "pk2", "pk3"], "limit": 50},
  {"kinds": [10002], "authors": ["pk1", "pk2", "pk3"]}
]
```

### 12.3 Local Caching

Clients SHOULD maintain a local event database to:
- Avoid re-fetching known events
- Enable offline access
- Speed up rendering (display cached data while fetching updates)
- Use `since` filters on reconnection for incremental sync

### 12.4 Subscription Efficiency

- Close subscriptions as soon as they are no longer needed
- Use `limit: 0` with open subscriptions if you only want live events
- Use `since` and `until` to narrow time ranges
- Avoid subscribing to the same data on multiple relays when possible (though some redundancy is acceptable for reliability)
