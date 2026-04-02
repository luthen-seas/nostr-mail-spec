# Relay Operator — Fundamentals

## NOSTR Relay Architecture

A NOSTR relay is a WebSocket server that performs five core functions:

### 1. WebSocket Server
- Listens for incoming WebSocket connections (typically on wss:// with TLS)
- Handles three client message types:
  - `["EVENT", {event}]` — client publishes an event
  - `["REQ", subscription_id, ...filters]` — client requests events matching filters
  - `["CLOSE", subscription_id]` — client closes a subscription
- Sends three response types:
  - `["EVENT", subscription_id, {event}]` — event matching a subscription
  - `["OK", event_id, true/false, "message"]` — event acceptance/rejection
  - `["EOSE", subscription_id]` — end of stored events (live streaming begins)
  - `["CLOSED", subscription_id, "message"]` — subscription closed by relay

### 2. Event Validation
- **Signature verification**: verify Schnorr signature (`sig`) over `id` using `pubkey` (secp256k1)
- **ID verification**: recompute SHA-256 hash of serialized event `[0, pubkey, created_at, kind, tags, content]` and compare to `id` field
- **Kind-specific rules**: validate tag structure, content format, and relay-specific policies per event kind
- **Timestamp validation**: reject events with `created_at` too far in the future (configurable, typically 15 minutes)
- **Size validation**: reject events exceeding relay's configured maximum size

### 3. Subscription Matching
- For each stored event, check if it matches any active subscription filter
- For each incoming event, check if it matches any active subscription and deliver to those subscribers
- Filter fields are AND-combined within a filter object, OR-combined across filter objects in a REQ

### 4. Event Storage
- Persist events to durable storage (database or key-value store)
- Handle replaceable events (kinds 0, 3, 10000-19999): keep only the latest per pubkey (and d-tag for addressable)
- Handle ephemeral events (kinds 20000-29999): deliver to matching subscriptions but do not store
- Garbage collection: remove expired events, enforce retention policies

### 5. Event Delivery
- When a new event arrives that matches an active subscription, push it to the subscriber immediately
- EOSE marks the boundary between stored events and live events
- Maintain subscription state per connection

---

## Storage Engines Comparison

### LMDB (strfry)
- **Architecture**: memory-mapped B+ tree, copy-on-write
- **Read performance**: excellent — zero-copy reads directly from memory-mapped pages
- **Write performance**: good — single-writer, multiple-reader (MVCC). One write transaction at a time.
- **Write concurrency**: limited — only one write transaction active at a time, others queue
- **Durability**: full ACID with crash recovery via copy-on-write
- **Memory**: maps entire database into virtual memory. Performance depends on having enough RAM to hold the hot working set.
- **Max database size**: configured at open time (e.g., 10GB, 100GB). Must be set large enough for expected growth.
- **Operational complexity**: very low — single file, no server process, no configuration tuning
- **Best for**: read-heavy workloads, small-to-medium relays, single-server deployments
- **Used by**: strfry (primary), nostrdb (Damus)

### SQLite (nostr-rs-relay)
- **Architecture**: single-file relational database, B-tree storage
- **Read performance**: good — with proper indexes, competitive with LMDB for indexed queries
- **Write performance**: good — WAL (Write-Ahead Log) mode enables concurrent reads during writes
- **Write concurrency**: moderate — WAL mode allows one writer and multiple readers concurrently
- **Durability**: full ACID with WAL mode
- **Memory**: configurable cache size, typically 64MB-512MB
- **Operational complexity**: low — single file, `PRAGMA` tuning (journal_mode=WAL, synchronous=NORMAL)
- **Best for**: small-to-medium relays, environments where a single file is convenient
- **Used by**: nostr-rs-relay

### PostgreSQL (nostream)
- **Architecture**: full client-server RDBMS, MVCC, WAL
- **Read performance**: excellent — with proper indexes, handles complex queries well
- **Write performance**: excellent — true concurrent writes, connection pooling
- **Write concurrency**: high — multiple concurrent writers with row-level locking
- **Durability**: full ACID, point-in-time recovery, streaming replication
- **Memory**: configurable shared_buffers, work_mem, typically 25% of RAM for shared_buffers
- **Operational complexity**: highest — separate server process, vacuuming, index maintenance, backup strategy
- **Best for**: large-scale relays, relays requiring complex queries or analytics, multi-server deployments
- **Used by**: nostream, various custom relays

### BadgerDB
- **Architecture**: LSM-tree based key-value store (Go)
- **Read performance**: good — bloom filters for point lookups, but range scans slower than B-tree
- **Write performance**: excellent — LSM trees optimized for write-heavy workloads
- **Write concurrency**: high — concurrent writes to memtable
- **Operational complexity**: moderate — compaction tuning, garbage collection of value log
- **Used by**: some Go-based relays

### RocksDB
- **Architecture**: LSM-tree based key-value store (C++, with bindings for many languages)
- **Read performance**: good — bloom filters, block cache, prefix seek
- **Write performance**: excellent — write-optimized LSM tree
- **Write concurrency**: high — concurrent writes with memtable
- **Operational complexity**: moderate-high — many tuning knobs (compaction strategy, compression, bloom filter bits)
- **Used by**: some custom relay implementations

---

## Event Validation

### Signature Verification (Schnorr / BIP-340)
1. Extract `pubkey` (32-byte hex, x-only public key)
2. Extract `sig` (64-byte hex Schnorr signature)
3. Extract `id` (32-byte hex SHA-256 of serialized event)
4. Verify: `schnorr_verify(pubkey, id, sig)` — MUST return true
5. If verification fails: respond `["OK", id, false, "invalid: bad signature"]`

### ID Verification (SHA-256)
1. Serialize event as JSON array: `[0, pubkey, created_at, kind, tags, content]`
2. Compute SHA-256 hash of the UTF-8 encoded serialization
3. Compare to event's `id` field
4. If mismatch: respond `["OK", id, false, "invalid: bad event id"]`

### Kind-Specific Validation Rules
- **Kind 0 (metadata)**: content MUST be valid JSON with profile fields
- **Kind 1059 (gift wrap)**: MUST have a `p` tag identifying recipient
- **Replaceable events (0, 3, 10000-19999)**: replace previous event with same pubkey (and kind)
- **Addressable events (30000-39999)**: replace previous event with same pubkey, kind, and `d` tag
- **Ephemeral events (20000-29999)**: deliver to subscribers but do not store

---

## Subscription Matching

### Filter Structure (NIP-01)
```json
{
  "ids": ["<hex prefix>", ...],
  "authors": ["<hex prefix>", ...],
  "kinds": [<integer>, ...],
  "#e": ["<hex>", ...],
  "#p": ["<hex>", ...],
  "#<single-letter>": ["<string>", ...],
  "since": <unix timestamp>,
  "until": <unix timestamp>,
  "limit": <integer>
}
```

### Matching Rules
- **Within a filter**: all specified fields must match (AND logic)
  - `ids`: event id starts with any of the given prefixes
  - `authors`: event pubkey starts with any of the given prefixes
  - `kinds`: event kind is in the list
  - `#<tag>`: event has a tag whose first element is the letter and second element is in the list
  - `since`: event `created_at` >= since
  - `until`: event `created_at` <= until
  - `limit`: return at most N events (newest first)
- **Across filters in a REQ**: any filter matching is sufficient (OR logic)

### Indexing Strategy for Efficient Matching
Essential indexes:
- **id prefix index**: B-tree on id field for prefix matching
- **author prefix index**: B-tree on pubkey field
- **kind index**: index on kind field (or compound: kind + created_at)
- **Tag indexes**: for each single-letter tag type (#e, #p, #t, etc.), index on tag value
- **Compound index**: (kind, created_at) for time-bounded kind queries
- **Created_at index**: for since/until range queries

Performance considerations:
- Prefix matching on ids/authors: use B-tree range scan (prefix...prefix+1)
- Tag matching: inverted index or GIN index (PostgreSQL) for array containment
- Limit + order by created_at DESC: ensure index supports reverse chronological scan

---

## Rate Limiting Strategies

### Per-IP Rate Limits
- **Connection rate**: max N new WebSocket connections per IP per minute (e.g., 10/min)
- **Event submission rate**: max N EVENT messages per IP per minute (e.g., 60/min)
- **Subscription rate**: max N REQ messages per IP per minute (e.g., 30/min)
- **Implementation**: token bucket or sliding window counter per IP

### Per-Pubkey Rate Limits
- **Event publication rate**: max N events per pubkey per hour (e.g., 100/hour)
- **Kind-specific limits**: separate limits for different event types
  - Kind 0 (metadata): 5/hour
  - Kind 1 (notes): 60/hour
  - Kind 7 (reactions): 120/hour
  - Kind 1059 (gift wrap / mail): 100/hour
- **Requires NIP-42 AUTH**: pubkey rate limits only work if relay authenticates users

### Rate Limit Responses
```json
["OK", "<event-id>", false, "rate-limited: slow down"]
```
- Include retry-after hint in message when possible
- Do not disconnect the client — let them retry after the limit window

---

## NIP-42 AUTH: Authentication

### Protocol Flow
1. Relay sends challenge: `["AUTH", "<random-challenge-string>"]`
2. Client creates and signs a kind 22242 event:
   ```json
   {
     "kind": 22242,
     "tags": [
       ["relay", "wss://relay.example.com/"],
       ["challenge", "<challenge-string>"]
     ],
     "content": ""
   }
   ```
3. Client sends: `["AUTH", {signed-event}]`
4. Relay verifies: signature valid, challenge matches, relay URL matches, timestamp recent
5. Relay associates the pubkey with the WebSocket connection

### Use Cases
- **Restrict write access**: only authenticated users can publish events
- **Restrict read access**: only authenticated recipients can read their events (essential for inbox relays)
- **Paid relay**: only paying subscribers (verified via pubkey) can access the relay
- **Anti-spam**: rate limits tied to authenticated pubkey rather than IP

### Implementation Notes
- Challenge string should be cryptographically random (at least 16 bytes hex)
- Challenge should expire after a reasonable time (e.g., 5 minutes)
- Kind 22242 event timestamp must be recent (within 10 minutes)
- Relay URL in the event must match the relay's canonical URL

---

## NIP-11 Relay Information Document

Served as JSON at the relay's HTTP URL (same host/port, `Accept: application/nostr+json`):

```json
{
  "name": "My Relay",
  "description": "A relay for NOSTR mail",
  "pubkey": "<relay-operator-pubkey-hex>",
  "contact": "operator@example.com",
  "supported_nips": [1, 11, 42, 44, 59],
  "software": "strfry",
  "version": "1.0.0",
  "limitation": {
    "max_message_length": 131072,
    "max_subscriptions": 20,
    "max_filters": 10,
    "max_limit": 5000,
    "max_subid_length": 100,
    "min_pow_difficulty": 0,
    "auth_required": true,
    "payment_required": false,
    "restricted_writes": true,
    "max_event_tags": 2000,
    "max_content_length": 65536,
    "created_at_lower_limit": 94608000,
    "created_at_upper_limit": 900
  },
  "retention": [
    {"kinds": [1059], "time": 7776000}
  ],
  "relay_countries": ["US"]
}
```

---

## Connection Management

### WebSocket Ping/Pong
- Relay sends WebSocket ping frames every 30-60 seconds
- Client must respond with pong within timeout (e.g., 10 seconds)
- If no pong received, close the connection (client is dead)
- Some relays also accept NOSTR-level ping: client sends any message, relay responds

### Idle Timeout
- Close connections with no activity (no EVENT, REQ, or CLOSE) after configurable timeout
- Typical: 5-15 minutes for unauthenticated, longer for authenticated
- Send CLOSED for all active subscriptions before disconnecting

### Max Connections Per IP
- Limit concurrent WebSocket connections from a single IP (e.g., 10-20)
- Prevent a single IP from exhausting server resources
- Consider NAT: many users may share an IP (corporate networks, mobile carriers)

---

## Event Size Limits

- **Typical range**: 64KB to 512KB per event (configurable per relay)
- **NIP-01 default**: no specified limit, relay chooses
- **Considerations**:
  - Kind 1059 (gift wrapped messages): may be larger due to encryption overhead
  - Attachments should be external (Blossom / NIP-B7), not inline
  - Set `max_message_length` in NIP-11 document to advertise the limit
  - Reject oversized events with: `["OK", id, false, "invalid: event too large"]`
