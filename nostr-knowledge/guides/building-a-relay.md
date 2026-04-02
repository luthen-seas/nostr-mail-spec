# Building a NOSTR Relay

> A practical guide for developers building NOSTR relays, from a minimal
> WebSocket server to a production-ready, policy-enforced relay. Covers
> architecture, storage engines, validation pipelines, scaling, and operations.

---

## Table of Contents

1. [Choosing Your Approach](#1-choosing-your-approach)
2. [WebSocket Server Setup](#2-websocket-server-setup)
3. [Message Parsing](#3-message-parsing)
4. [Event Validation Pipeline](#4-event-validation-pipeline)
5. [Event Storage](#5-event-storage)
6. [Indexing Strategy](#6-indexing-strategy)
7. [Filter Matching Algorithm](#7-filter-matching-algorithm)
8. [Subscription Management](#8-subscription-management)
9. [Response Messages](#9-response-messages)
10. [NIP-11 Relay Information Document](#10-nip-11-relay-information-document)
11. [Authentication (NIP-42)](#11-authentication-nip-42)
12. [Rate Limiting and Anti-Spam](#12-rate-limiting-and-anti-spam)
13. [Relay Policies](#13-relay-policies)
14. [Scaling: From Personal to Public](#14-scaling-from-personal-to-public)
15. [Monitoring and Operations](#15-monitoring-and-operations)
16. [Progressive NIP Support](#16-progressive-nip-support)
17. [Testing Your Relay](#17-testing-your-relay)

---

## 1. Choosing Your Approach

### Decision Tree

```
Do you want to run a relay with standard behavior?
  YES -> Deploy an existing relay (strfry, nostr-rs-relay)
  NO  -> Do you need custom business logic (WoT, paid access, moderation)?
           YES -> Use a framework (khatru, nostream)
           NO  -> Are you learning the protocol?
                    YES -> Build from scratch (educational)
                    NO  -> Deploy an existing relay
```

### Existing Relays (Deploy and Configure)

| Relay | Language | Storage | Best For |
|-------|----------|---------|----------|
| **strfry** | C++ | LMDB | Highest throughput, negentropy sync, write-policy plugins |
| **nostr-rs-relay** | Rust | SQLite | Simple setup, single binary, good for small-medium scale |
| **Chorus** | Rust | Custom | Personal relay with fine-grained access control |

### Frameworks (Build Custom Logic)

| Framework | Language | Storage | Best For |
|-----------|----------|---------|----------|
| **khatru** | Go | Pluggable (SQLite, LMDB, PostgreSQL, BadgerDB) | Custom relays with hook-based architecture |
| **nostream** | TypeScript | PostgreSQL | NestJS-style middleware pipeline |

### From Scratch (Educational)

Building from scratch is the best way to learn the protocol. You will implement WebSocket handling, message parsing, event validation, storage, and subscription management yourself. This guide covers the from-scratch approach in detail, but the concepts apply equally when using a framework.

### Comparison Matrix

| Concern | strfry | nostr-rs-relay | khatru | From Scratch |
|---------|--------|----------------|--------|-------------|
| Setup time | 10 min | 10 min | 30 min | Days/weeks |
| Custom accept/reject logic | Write-policy plugin (stdin/stdout) | Config file only | Go hooks (full control) | Full control |
| Storage flexibility | LMDB only | SQLite only | Any backend | Your choice |
| Performance ceiling | Very high | Medium-high | Depends on your code | Depends on your code |
| NIP coverage | Broad | Broad | What you implement | What you implement |
| Operational maturity | High | High | Medium | You own it |

---

## 2. WebSocket Server Setup

### 2.1 Connection Lifecycle

```
Client connects (TCP + TLS handshake)
  |
  v
WebSocket upgrade (HTTP 101)
  |
  v
Connection registered in relay's connection table
  |
  +--- Relay MAY send AUTH challenge ["AUTH", <challenge>]
  |
  v
Message loop:
  |
  +--- ["EVENT", <event>]      -> validation -> storage -> OK response
  +--- ["REQ", <sub_id>, ...]  -> register subscription -> query -> EOSE
  +--- ["CLOSE", <sub_id>]     -> remove subscription
  +--- ["AUTH", <event>]       -> verify auth -> OK response
  +--- ["COUNT", <id>, ...]    -> count query -> COUNT response
  |
  v
Connection closes
  -> clean up all subscriptions for this connection
  -> release connection slot
```

### 2.2 Minimal WebSocket Server (Go with khatru)

```go
package main

import (
    "fmt"
    "net/http"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "my-relay"
    relay.Info.Description = "a NOSTR relay"
    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

### 2.3 Minimal WebSocket Server (From Scratch, Node.js)

```typescript
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 7777 })

wss.on('connection', (ws, req) => {
  const connId = crypto.randomUUID()
  const subscriptions = new Map()

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      ws.send(JSON.stringify(['NOTICE', 'invalid JSON']))
      return
    }

    if (!Array.isArray(msg) || msg.length < 2) {
      ws.send(JSON.stringify(['NOTICE', 'invalid message format']))
      return
    }

    const verb = msg[0]
    switch (verb) {
      case 'EVENT':  handleEvent(ws, msg[1]); break
      case 'REQ':    handleReq(ws, subscriptions, msg); break
      case 'CLOSE':  handleClose(ws, subscriptions, msg[1]); break
      case 'AUTH':   handleAuth(ws, msg[1]); break
      case 'COUNT':  handleCount(ws, msg); break
      default:       ws.send(JSON.stringify(['NOTICE', `unknown verb: ${verb}`]))
    }
  })

  ws.on('close', () => {
    subscriptions.clear()
  })
})
```

### 2.4 HTTP Upgrade and NIP-11

The relay must serve both WebSocket connections and the NIP-11 relay information document on the same endpoint. Differentiate by the `Accept` header:

- `Accept: application/nostr+json` -> return NIP-11 JSON.
- `Upgrade: websocket` -> upgrade to WebSocket.
- Otherwise -> return a human-readable page or redirect.

---

## 3. Message Parsing

### 3.1 Client-to-Relay Messages

| Verb | Format | Description |
|------|--------|-------------|
| `EVENT` | `["EVENT", <event-json>]` | Publish an event |
| `REQ` | `["REQ", <sub_id>, <filter>, ...]` | Subscribe with one or more filters |
| `CLOSE` | `["CLOSE", <sub_id>]` | Close a subscription |
| `AUTH` | `["AUTH", <auth-event>]` | Respond to authentication challenge (NIP-42) |
| `COUNT` | `["COUNT", <sub_id>, <filter>, ...]` | Request event count (NIP-45) |

### 3.2 Parsing Strategy

1. Parse JSON. Reject if invalid.
2. Verify it is an array with at least 2 elements.
3. First element must be a known verb string.
4. Dispatch to the appropriate handler.
5. For EVENT: validate the event object has all 7 required fields with correct types.
6. For REQ: validate the subscription ID (non-empty, max 64 chars) and at least one filter.

### 3.3 Message Size Limits

Set a maximum WebSocket message size. A reasonable default is 128 KB. Events with huge content or thousands of tags should be rejected before full parsing. Expose this as `max_message_length` in NIP-11.

---

## 4. Event Validation Pipeline

Order the pipeline to reject cheap-to-detect issues first, saving expensive operations (signature verification) for events that pass basic checks.

### 4.1 Pipeline Stages

```
Incoming ["EVENT", <event_json>]
  |
  v
[1] JSON Structure
    - All 7 fields present? (id, pubkey, created_at, kind, tags, content, sig)
    - Correct types? (id: string, kind: integer, tags: array of arrays, etc.)
    REJECT: ["OK", <id>, false, "invalid: malformed event"]
  |
  v
[2] Field Format
    - id: exactly 64 lowercase hex characters
    - pubkey: exactly 64 lowercase hex characters
    - sig: exactly 128 lowercase hex characters
    - kind: integer in range 0..65535
    - created_at: non-negative integer
    - tags: each inner array contains only non-null strings
    REJECT: ["OK", <id>, false, "invalid: bad field format"]
  |
  v
[3] Size Limits
    - Total message size within max_message_length
    - Content length within max_content_length
    - Tag count within max_event_tags
    REJECT: ["OK", <id>, false, "invalid: event too large"]
  |
  v
[4] Timestamp Validation
    - created_at >= relay's lower limit (reject ancient events)
    - created_at <= now + max_future_seconds (reject far-future events)
    REJECT: ["OK", <id>, false, "invalid: event created_at out of range"]
  |
  v
[5] Event ID Verification
    - Recompute: expected_id = SHA-256([0, pubkey, created_at, kind, tags, content])
    - Compare with provided id
    REJECT: ["OK", <id>, false, "invalid: wrong event id"]
  |
  v
[6] Signature Verification (most expensive step)
    - Schnorr verify: verify(pubkey, id, sig)
    REJECT: ["OK", <id>, false, "invalid: bad signature"]
  |
  v
[7] Duplicate Check
    - Does the relay already have this event id?
    RESPOND: ["OK", <id>, true, "duplicate:"]  (accepted, already have it)
  |
  v
[8] Replaceable Event Logic
    - For kinds 0, 3, 10000-19999: check if a newer event exists for (pubkey, kind)
    - For kinds 30000-39999: check if a newer event exists for (pubkey, kind, d-tag)
    - If existing event is newer: reject the incoming event
    - If incoming is newer: delete the old, store the new
  |
  v
[9] Policy Checks (relay-specific)
    - Allowed kinds? Allowed pubkeys? Proof of work? Payment?
    - Web of Trust score? Content moderation?
    REJECT: ["OK", <id>, false, "blocked: <reason>"]
  |
  v
[10] Store and Broadcast
    - Write to storage
    - Check against all active subscriptions
    - Send to matching subscribers
    RESPOND: ["OK", <id>, true, ""]
```

### 4.2 Deletion Events (Kind 5)

When receiving a kind 5 event:
1. Extract `e` tags (events to delete) and `a` tags (addressable events to delete).
2. Verify the deletion event's pubkey matches the pubkey of the referenced events.
3. Delete matching events from storage (or mark as deleted).
4. Store the deletion event itself (so future queries reflect the deletion).

---

## 5. Event Storage

### 5.1 Choosing a Database

| Engine | Type | Best For | Throughput | Ops Complexity |
|--------|------|----------|-----------|----------------|
| **LMDB** | Embedded KV | High-throughput relays | Very high reads, good writes | Very low (single file) |
| **SQLite** | Embedded SQL | Small-medium relays, getting started | Good | Very low (single file + WAL) |
| **PostgreSQL** | Client-server SQL | Large relays, complex queries, horizontal reads | High | Medium-high |
| **In-memory** | None | Testing, ephemeral relays | Maximum | None |

### 5.2 SQLite (Recommended for Getting Started)

```sql
CREATE TABLE event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_hash BLOB NOT NULL UNIQUE,  -- 32-byte event id
    pubkey BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    kind INTEGER NOT NULL,
    content TEXT NOT NULL,
    raw_event TEXT NOT NULL            -- full JSON for serving
);

CREATE TABLE tag (
    event_id INTEGER REFERENCES event(id),
    name TEXT NOT NULL,
    value TEXT NOT NULL
);

CREATE INDEX idx_event_pubkey_kind ON event(pubkey, kind, created_at DESC);
CREATE INDEX idx_event_kind_created ON event(kind, created_at DESC);
CREATE INDEX idx_tag_value ON tag(name, value);
```

**Essential SQLite tuning:**
```sql
PRAGMA journal_mode = WAL;        -- concurrent reads during writes
PRAGMA synchronous = NORMAL;      -- balance durability and speed
PRAGMA cache_size = -64000;       -- 64 MB page cache
PRAGMA mmap_size = 268435456;     -- 256 MB memory-map
```

### 5.3 LMDB (Recommended for Production)

LMDB memory-maps the database file. Reads are zero-copy (no deserialization). Single-writer model with concurrent readers. No WAL, no compaction, no vacuum.

**Key design for LMDB relay storage:**
```
Sub-database: events
  Key: event_id (32 bytes)
  Value: serialized event (FlatBuffers or raw JSON)

Sub-database: index_pubkey_kind_created
  Key: pubkey + kind + created_at (big-endian) + event_id
  Value: (empty or pointer to events DB)

Sub-database: index_kind_created
  Key: kind + created_at (big-endian) + event_id
  Value: (empty)

Sub-database: index_tag
  Key: tag_letter + tag_value + created_at (big-endian) + event_id
  Value: (empty)
```

This is the approach strfry uses. Each index is a separate LMDB sub-database, enabling efficient prefix scans.

### 5.4 PostgreSQL (For Scale)

```sql
CREATE TABLE events (
    id BYTEA PRIMARY KEY,
    pubkey BYTEA NOT NULL,
    kind INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    content TEXT NOT NULL,
    sig BYTEA NOT NULL,
    raw JSONB NOT NULL
);

CREATE INDEX idx_events_pubkey_kind ON events(pubkey, kind, created_at DESC);
CREATE INDEX idx_events_kind_created ON events(kind, created_at DESC);
CREATE INDEX idx_events_tags ON events USING GIN (tags);
```

PostgreSQL advantages: NOTIFY/LISTEN for live subscription delivery (no polling), read replicas for scaling, GIN indexes for flexible tag queries, mature operational tooling.

### 5.5 Khatru Storage Backends

Khatru uses the `eventstore` package with pluggable backends:

```go
// SQLite
import "github.com/fiatjaf/eventstore/sqlite3"
db := sqlite3.SQLite3Backend{DatabaseURL: "./relay.db"}

// LMDB
import "github.com/fiatjaf/eventstore/lmdb"
db := lmdb.LMDBBackend{Path: "./relay-data"}

// PostgreSQL
import "github.com/fiatjaf/eventstore/postgresql"
db := postgresql.PostgresBackend{DatabaseURL: "postgres://..."}
```

Wire them up:
```go
relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
relay.CountEvents = append(relay.CountEvents, db.CountEvents)
relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)
```

---

## 6. Indexing Strategy

### 6.1 Which Fields to Index

Every relay must support filtering by these NIP-01 fields:

| Filter Field | Index Needed | Notes |
|-------------|-------------|-------|
| `ids` | Primary key on event id | Direct lookup, fastest query |
| `authors` | Composite: (pubkey, kind, created_at DESC) | Usually combined with kind |
| `kinds` | Composite: (kind, created_at DESC) | Almost always combined with other fields |
| `since`/`until` | created_at range in composite indexes | Range scan |
| `#<letter>` | (tag_name, tag_value, created_at DESC) | All single-letter tags must be indexable |
| `limit` | ORDER BY created_at DESC | Results sorted by created_at DESC, then lowest id for ties |

### 6.2 Common Query Patterns and Ideal Indexes

**Home timeline (most common client query):**
```
Filter: {"kinds": [1,6,7], "authors": [pk1, ..., pk500], "limit": 50}
Index:  (pubkey, kind, created_at DESC)
Plan:   For each author, seek and scan backward. Merge top 50.
```

**Profile fetch:**
```
Filter: {"kinds": [0], "authors": [pk1]}
Index:  (pubkey, kind)
Plan:   Direct lookup. Replaceable, at most one result.
```

**Thread replies:**
```
Filter: {"kinds": [1], "#e": [event_id]}
Index:  (tag_name='e', tag_value, kind, created_at DESC)
Plan:   Seek to tag value, scan matching kinds.
```

**Notifications:**
```
Filter: {"#p": [my_pubkey], "kinds": [1,6,7,9735], "since": T}
Index:  (tag_name='p', tag_value, created_at DESC)
Plan:   Seek to tag value, scan forward from T.
```

### 6.3 Tag Indexing

NIP-01 requires all single-letter tags (a-z, A-Z) to be indexable. Only the first value (second element of the tag array) is indexed.

**Approaches:**
1. **Unified tag table** (SQL): one table with (tag_name, tag_value, event_id).
2. **Separate sub-databases** (LMDB): one index per tag letter.
3. **GIN index on JSONB** (PostgreSQL): flexible, no schema changes for new tags.

### 6.4 Full-Text Search (NIP-50)

If you want to support the `search` filter field:

| Engine | Approach | Notes |
|--------|----------|-------|
| SQLite FTS5 | `CREATE VIRTUAL TABLE ... USING fts5(content)` | Built-in, good for moderate scale |
| PostgreSQL tsvector | GIN index on `to_tsvector(content)` | Mature, multi-language |
| External (Meilisearch) | Async indexing | Best for large scale |
| Embedded (tantivy, bleve) | In-process search library | No external dependency |

---

## 7. Filter Matching Algorithm

### 7.1 Matching Rules

A filter is a JSON object. An event matches a filter if it matches **all** specified fields (AND logic):

```
function matchFilter(event, filter):
    if filter.ids and event.id not in filter.ids:          return false
    if filter.authors and event.pubkey not in filter.authors: return false
    if filter.kinds and event.kind not in filter.kinds:    return false
    if filter.since and event.created_at < filter.since:   return false
    if filter.until and event.created_at > filter.until:   return false

    for each tag_filter "#X" in filter:
        event_values = event.tags
            .filter(t => t[0] == X)
            .map(t => t[1])
        if no overlap between event_values and filter["#X"]:
            return false

    return true
```

### 7.2 Multiple Filters (OR Logic)

A REQ with multiple filters: `["REQ", "sub1", filter1, filter2, filter3]`

An event matches if it matches **any** filter:

```
function matchFilters(event, filters):
    return filters.some(f => matchFilter(event, f))
```

### 7.3 Prefix Matching

The `ids` and `authors` fields support prefix matching. If a value in the array is shorter than 64 hex characters, it matches any id/pubkey that starts with that prefix:

```
filter: {"ids": ["abcd"]}
matches: event with id "abcd1234..." or "abcdef00..."
```

This enables efficient range queries in key-value stores (prefix scan).

---

## 8. Subscription Management

### 8.1 Per-Connection Tracking

```
Connection {
    websocket: WebSocket,
    subscriptions: Map<sub_id, SubscriptionState>,
    authenticated_pubkeys: Set<pubkey>,   // NIP-42
    rate_limiter: RateLimiter,
    connected_at: Timestamp,
    remote_addr: IpAddr,
}

SubscriptionState {
    filters: Filter[],
    eose_sent: boolean,
}
```

### 8.2 Subscription Lifecycle

1. **REQ received:** Parse filters, store in connection's subscription map.
2. **Query stored events:** Run filters against the database. Send matching events as `["EVENT", sub_id, event]`.
3. **Send EOSE:** `["EOSE", sub_id]` signals the end of stored results.
4. **Live mode:** When new events arrive and pass validation, check them against all active subscriptions. If a match, send the event to the subscriber.
5. **Replacement REQ:** If a new REQ arrives with the same sub_id, replace the old filters (no need for explicit CLOSE first).
6. **CLOSE:** Remove the subscription from the map.
7. **Connection close:** Remove all subscriptions for this connection.

### 8.3 Live Event Delivery

When a new event is stored, check it against every active subscription across all connections. This is the performance-critical hot path.

**Naive approach (O(connections x subscriptions x filters)):**
```
for connection in all_connections:
    for sub in connection.subscriptions:
        if matchFilters(event, sub.filters):
            send(connection, ["EVENT", sub.id, event])
            break
```

**Optimizations:**
1. **Inverted index on subscriptions:** Index subscriptions by kind, author, and tag values they filter on. When a kind-1 event from pubkey X arrives, only check subscriptions that filter on kind 1 and/or author X.
2. **Bloom filter pre-check:** Each subscription builds a bloom filter from its filter fields. Fast-reject events that definitely do not match.
3. **Grouped delivery:** If many subscriptions share identical filters, evaluate once and fan out.

---

## 9. Response Messages

### 9.1 Relay-to-Client Messages

| Message | Format | When |
|---------|--------|------|
| `EVENT` | `["EVENT", <sub_id>, <event>]` | Matching stored or live event |
| `OK` | `["OK", <event_id>, <accepted>, <message>]` | After receiving EVENT |
| `EOSE` | `["EOSE", <sub_id>]` | End of stored events for a subscription |
| `CLOSED` | `["CLOSED", <sub_id>, <message>]` | Relay closed a subscription |
| `NOTICE` | `["NOTICE", <message>]` | Human-readable message to the client |
| `AUTH` | `["AUTH", <challenge>]` | Authentication challenge (NIP-42) |
| `COUNT` | `["COUNT", <sub_id>, {"count": <n>}]` | Event count response (NIP-45) |

### 9.2 OK Message Semantics

The OK message always follows an EVENT submission:

```json
["OK", "event-id-hex", true, ""]                    // accepted
["OK", "event-id-hex", true, "duplicate:"]           // accepted (already had it)
["OK", "event-id-hex", false, "invalid: bad sig"]    // rejected: validation
["OK", "event-id-hex", false, "blocked: not on whitelist"]  // rejected: policy
["OK", "event-id-hex", false, "rate-limited: slow down"]    // rejected: rate limit
["OK", "event-id-hex", false, "error: database write failed"] // rejected: internal error
```

**Prefixes in the message field:**
- `duplicate:` -- already have this event.
- `invalid:` -- event failed validation.
- `blocked:` -- event rejected by policy.
- `rate-limited:` -- too many events.
- `error:` -- internal relay error.
- `auth-required:` -- authentication needed (NIP-42).
- `pow:` -- insufficient proof of work (NIP-13).

### 9.3 CLOSED Message

Used when the relay terminates a subscription it previously accepted:

```json
["CLOSED", "sub-id", "auth-required: this filter requires authentication"]
["CLOSED", "sub-id", "error: subscription limit reached"]
```

---

## 10. NIP-11 Relay Information Document

Serve a JSON document when the relay URL is requested with `Accept: application/nostr+json`:

```json
{
  "name": "My Relay",
  "description": "A NOSTR relay for the community",
  "pubkey": "<relay-operator-pubkey-hex>",
  "contact": "admin@example.com",
  "supported_nips": [1, 2, 4, 9, 11, 12, 16, 20, 22, 28, 33, 40, 42, 45, 50],
  "software": "https://github.com/your/relay",
  "version": "1.0.0",
  "limitation": {
    "max_message_length": 131072,
    "max_subscriptions": 20,
    "max_filters": 10,
    "max_limit": 5000,
    "max_subid_length": 64,
    "max_event_tags": 2500,
    "max_content_length": 102400,
    "min_pow_difficulty": 0,
    "auth_required": false,
    "payment_required": false,
    "created_at_lower_limit": 1577836800,
    "created_at_upper_limit": null
  },
  "relay_countries": ["US"],
  "language_tags": ["en"],
  "tags": ["community", "social"],
  "posting_policy": "https://example.com/relay-policy.html"
}
```

Clients use this to discover relay capabilities, enforce limits, and display relay information to users.

---

## 11. Authentication (NIP-42)

### 11.1 Challenge-Response Flow

```
Relay                           Client
  |                               |
  |-- ["AUTH", "<challenge>"] -->|  (relay sends challenge)
  |                               |
  |<- ["AUTH", <kind-22242>] ---|  (client sends signed auth event)
  |                               |
  |-- ["OK", <id>, true, ""] -->|  (authentication accepted)
```

### 11.2 The Auth Event (Kind 22242)

```json
{
  "kind": 22242,
  "tags": [
    ["relay", "wss://my-relay.com"],
    ["challenge", "<challenge-string>"]
  ],
  "content": ""
}
```

### 11.3 Verification Steps

1. Verify the event signature.
2. Verify kind is 22242.
3. Verify the `relay` tag matches your relay URL.
4. Verify the `challenge` tag matches the challenge you sent.
5. Verify `created_at` is recent (within a few minutes).
6. If valid, associate the pubkey with this connection.

### 11.4 When to Require Auth

- Before allowing writes (paid relay, allowlist).
- Before serving certain filters (e.g., DMs addressed to the authenticated user).
- Before revealing certain metadata.

If a client sends a REQ that requires auth before authenticating:
```json
["CLOSED", "sub-id", "auth-required: this subscription requires authentication"]
```

---

## 12. Rate Limiting and Anti-Spam

### 12.1 Token Bucket Rate Limiter

```
RateLimiter {
    tokens: float,
    max_tokens: float,
    refill_rate: float,     // tokens per second
    last_refill: timestamp,

    fn try_consume(cost: float) -> bool {
        refill()
        if tokens >= cost:
            tokens -= cost
            return true
        return false
    }
}
```

Use separate buckets for different operations:
- EVENT submissions: 10 events/minute per pubkey.
- REQ subscriptions: 20 subscriptions/minute per connection.
- Bytes per second: 100 KB/s per connection.

### 12.2 Connection-Level Limits

- Maximum concurrent connections per IP address (e.g., 10).
- Maximum concurrent connections total (e.g., 10,000).
- Maximum subscriptions per connection (e.g., 20, exposed in NIP-11).
- Idle timeout (close connections with no activity for 5-10 minutes).

### 12.3 Anti-Spam Strategies

| Strategy | How It Works | Trade-off |
|----------|-------------|-----------|
| **Proof of Work (NIP-13)** | Require minimum difficulty on events | CPU cost deters spam, but also burdens legitimate users |
| **Pubkey allowlist** | Only accept events from known pubkeys | Private relay, no spam, but not open |
| **Web of Trust** | Accept events from pubkeys within N hops of trusted seeds | Organic filtering, but complex to implement |
| **Paid relay** | Require Lightning payment for write access | Economic deterrent, but excludes free users |
| **Content filtering** | Reject events matching spam patterns | Effective for known spam, but false positives |
| **Rate limiting** | Limit events per pubkey per time window | Simple, but sophisticated spammers rotate keys |

### 12.4 Khatru Reject Policies

```go
// Reject events from unknown pubkeys
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
        if !isAllowed(event.PubKey) {
            return true, "blocked: pubkey not on allowlist"
        }
        return false, ""
    },
)

// Require proof of work
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
        difficulty := countLeadingZeroBits(event.ID)
        if difficulty < 16 {
            return true, "pow: minimum difficulty is 16"
        }
        return false, ""
    },
)
```

---

## 13. Relay Policies

### 13.1 What to Store

| Policy | Description | Example |
|--------|-------------|---------|
| **Open public** | Accept all valid events | Default for most public relays |
| **Kind filter** | Only accept specific event kinds | Social relay: kinds 0, 1, 3, 5, 6, 7, 10002 |
| **Pubkey allowlist** | Only accept events from listed pubkeys | Personal relay, community relay |
| **WoT filter** | Accept events from pubkeys within trust graph | Organic community relay |
| **Paid access** | Accept events from pubkeys that have paid | Sustainable public relay |
| **Content type** | Only accept long-form (kind 30023) or media events | Specialty relay |

### 13.2 Who to Serve

- **Open read:** Anyone can subscribe and read events.
- **Auth-required read:** Only authenticated users can read.
- **Restricted read:** Only events authored by authenticated user (personal relay).

### 13.3 Moderation

- Store kind 5 (deletion) events and remove the referenced events.
- Implement NIP-36 (content warnings): events with a `content-warning` tag can be filtered.
- Report events (NIP-56): kind 1984 reports can flag content for review.
- Manual moderation: admin tools to delete events and ban pubkeys.

### 13.4 Data Retention

- Set a maximum event age (e.g., delete events older than 1 year).
- Set a maximum database size (delete oldest events when limit is reached).
- Exempt certain kinds (kind 0 profiles, kind 10002 relay lists) from deletion.
- Ephemeral events (kinds 20000-29999) should not be stored -- deliver to subscribers and discard.

---

## 14. Scaling: From Personal to Public

### 14.1 Personal Relay (1-10 users)

- SQLite or LMDB storage.
- Single process, single machine.
- No rate limiting needed (trusted users).
- Minimal monitoring (uptime check).
- Deploy: single binary behind nginx/caddy for TLS.

### 14.2 Community Relay (10-1000 users)

- SQLite or LMDB storage.
- Single process, single machine.
- Pubkey allowlist or WoT filtering.
- Basic rate limiting.
- Monitor: connection count, events/second, storage size.
- Deploy: systemd service, TLS via Let's Encrypt.

### 14.3 Public Relay (1000+ users)

- LMDB or PostgreSQL storage.
- Consider horizontal scaling:
  - Read replicas (PostgreSQL).
  - Multiple relay processes behind a load balancer (sticky sessions for WebSocket).
- Aggressive rate limiting and anti-spam.
- Full monitoring and alerting.
- NIP-42 auth for write access.
- Consider paid access for sustainability.

### 14.4 Backpressure and Flow Control

When querying stored events for a subscription, the result set can be large:
- Send events in batches (e.g., 100 at a time). Check the WebSocket write buffer between batches.
- Per-connection bounded write queue. If full, close the connection rather than accumulating memory.
- Enforce `limit` in filters. Cap with relay's own `max_limit` (NIP-11).
- Detect slow consumers: if a connection's write buffer stays full for too long, disconnect them.

---

## 15. Monitoring and Operations

### 15.1 Key Metrics

| Metric | What to Track | Alert Threshold |
|--------|--------------|----------------|
| Active connections | Current WebSocket connections | Near max_connections |
| Events per second (write) | EVENT messages processed | Sustained spike or drop to zero |
| Events per second (read) | EVENT messages sent to subscribers | Unusual spikes |
| Active subscriptions | Total across all connections | Near capacity |
| Storage size | Database file size | Near disk capacity |
| Validation reject rate | Percentage of events rejected | Sustained high rate (spam?) |
| Relay latency | Time from EVENT received to OK sent | > 100ms sustained |
| Connection errors | WebSocket errors, failed handshakes | Spike |

### 15.2 Operational Tasks

- **Backups:** For SQLite/LMDB, copy the database file (ensure a read transaction is open for LMDB). For PostgreSQL, use `pg_dump` or streaming replication.
- **Log rotation:** Rotate relay logs to prevent disk exhaustion.
- **TLS certificates:** Automate renewal (Let's Encrypt + certbot or Caddy).
- **Updates:** Watch for relay software updates, especially security patches.
- **Database maintenance:** SQLite: occasional `VACUUM`. PostgreSQL: `VACUUM ANALYZE`. LMDB: copy-compact if you deleted significant data.

### 15.3 Deployment Checklist

- [ ] TLS enabled (wss://, not ws://)
- [ ] NIP-11 document served correctly
- [ ] Rate limiting configured
- [ ] Maximum connection limits set
- [ ] Backups automated
- [ ] Monitoring and alerting in place
- [ ] Log rotation configured
- [ ] Firewall configured (only ports 443/80 open)
- [ ] Systemd service with auto-restart

---

## 16. Progressive NIP Support

### Phase 1: Minimum Viable Relay

| NIP | Feature | Notes |
|-----|---------|-------|
| NIP-01 | Core protocol (EVENT, REQ, CLOSE, OK, EOSE) | Required |
| NIP-11 | Relay information document | Required |

With just NIP-01 and NIP-11, your relay is functional and discoverable.

### Phase 2: Usable Relay

| NIP | Feature | Notes |
|-----|---------|-------|
| NIP-09 | Event deletion (kind 5) | Important for user control |
| NIP-42 | Authentication | Needed for access control |
| NIP-45 | Event counting (COUNT) | Useful for clients |
| NIP-22 | Event `created_at` limits | Prevent ancient/future events |
| NIP-40 | Expiration timestamp | Auto-delete expired events |

### Phase 3: Full-Featured Relay

| NIP | Feature | Notes |
|-----|---------|-------|
| NIP-50 | Search | Requires full-text search index |
| NIP-77 | Negentropy sync | Efficient bulk synchronization |
| NIP-13 | Proof of Work | Anti-spam option |
| NIP-42 | AUTH with restricted access | For paid/private relays |
| NIP-29 | Relay-based groups | If running a community relay |
| NIP-86 | Relay management API | Remote relay administration |

---

## 17. Testing Your Relay

### 17.1 Manual Testing with nak

`nak` is the essential CLI tool for relay testing:

```bash
# Publish an event
echo '{"kind":1,"content":"hello","tags":[],"created_at":'$(date +%s)'}' | \
  nak event --sec <nsec> ws://localhost:7777

# Subscribe to events
nak req --kinds 1 --limit 10 ws://localhost:7777

# Check NIP-11
curl -H "Accept: application/nostr+json" http://localhost:7777

# Test a specific filter
nak req --authors <pubkey> --kinds 0 ws://localhost:7777
```

### 17.2 Automated Testing

- **nostr-relay-tester**: automated NIP compliance test suite. Runs a battery of tests against your relay and reports which NIPs pass.
- **Write integration tests**: publish events, subscribe, verify delivery, test replacement logic, test deletion, test rate limiting.

### 17.3 Test Scenarios

- **Basic EVENT/REQ/CLOSE cycle:** Publish an event, subscribe with a matching filter, verify delivery, close.
- **EOSE timing:** Subscribe, verify EOSE arrives after stored events.
- **Replaceable events:** Publish kind 0 twice, verify only the latest is returned.
- **Addressable events:** Publish kind 30023 with same d-tag, verify replacement.
- **Deletion:** Publish an event, delete it with kind 5, verify it is gone.
- **Filter edge cases:** Empty filters, prefix matching, multiple filters in one REQ.
- **Rate limiting:** Publish events rapidly, verify rate-limit OK responses.
- **Authentication:** Connect, attempt restricted action, authenticate, retry.
- **Reconnection:** Kill the client connection, reconnect, re-subscribe.
- **Large payloads:** Send an event at or beyond the size limit.
- **Invalid events:** Bad signatures, wrong IDs, malformed JSON, future timestamps.
- **Concurrent connections:** Open hundreds of connections, verify the relay remains responsive.

### 17.4 Performance Testing

- Use tools like `k6` or custom WebSocket load generators.
- Measure: events/second (write), events/second (read/delivery), p99 latency, max concurrent connections.
- Test with realistic workloads: 80% reads, 20% writes. Heavy subscription fan-out.
- Profile storage: insert 1M events, then benchmark filter queries.

---

## Further Reading

- [Relay Architecture Patterns](../relays/architecture-patterns.md) -- deeper dive into process models, storage engines, and indexing.
- [Building Custom Relays with Khatru](../relays/khatru/building-relays.md) -- step-by-step khatru guide with code examples.
- [strfry Configuration](../relays/strfry/configuration.md) -- strfry-specific setup and tuning.
- [Building a Client](./building-a-client.md) -- understand the client perspective.
- [Common Patterns](./common-patterns.md) -- reusable design patterns.
- [Protocol: Relay Protocol](../protocol/relay-protocol.md) -- WebSocket message format reference.
- [Protocol: Event Model](../protocol/event-model.md) -- canonical event structure reference.
