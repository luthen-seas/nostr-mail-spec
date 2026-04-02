# Relay Architecture Patterns

> Common architectural patterns for building NOSTR relays, covering process
> models, storage engines, indexing strategies, WebSocket handling, event
> validation, write policies, scaling, authentication, and monitoring.
> Draws from strfry, nostr-rs-relay, khatru, nostream, and the broader relay
> ecosystem.

---

## 1. Process Model Spectrum

Relay implementations fall on a spectrum from self-contained monoliths to
composable frameworks. The right choice depends on whether you are deploying a
relay or building a custom one.

### 1.1 Single-Process Monolith

A single binary that embeds the WebSocket server, storage engine, event
validation, and policy enforcement. Deploy it and it works.

| Relay | Language | Storage | Key Trait |
|-------|----------|---------|-----------|
| **strfry** | C++ | LMDB | Highest throughput, negentropy sync, write-policy plugins via stdin/stdout |
| **nostr-rs-relay** | Rust | SQLite | Mature, simple configuration, WAL-mode performance |
| **rnostr** | Rust | RocksDB | High-performance LSM storage |
| **Chorus** | Rust | Custom | Fine-grained personal relay access control |

**When to choose:** You want a production relay with well-tested defaults and
minimal moving parts. Configuration is done through config files and environment
variables, not code.

**Trade-offs:**
- (+) Single binary deployment, no dependency on external services
- (+) Lower latency (no inter-process communication)
- (-) Customization limited to what the config/plugin system exposes
- (-) Scaling means running more instances behind a load balancer

### 1.2 Framework-Based (Composable)

A library or framework where you write a Go/JS/Python program that imports the
relay engine and registers custom handlers at each stage of the pipeline.

| Framework | Language | Storage | Key Trait |
|-----------|----------|---------|-----------|
| **khatru** | Go | Pluggable (BadgerDB, SQLite, PostgreSQL, custom) | Hook-based architecture; powers dozens of specialized relays |
| **nostream** | TypeScript | PostgreSQL | NestJS-inspired pipeline with middleware stages |
| **relayer** | Go | Pluggable | Predecessor to khatru, simpler API |
| **nostr-relay-nestjs** | TypeScript | Multiple backends | Clean NestJS architecture |
| **rely** | Go | Pluggable | Lightweight Go framework |

**When to choose:** You are building a relay with custom business logic --
web-of-trust filtering, paid access, DVM integration, community moderation, or
domain-specific event routing.

**Trade-offs:**
- (+) Full control over accept/reject logic, storage mapping, and delivery
- (+) Can compose multiple behaviors (WoT + PoW + paid tiers)
- (-) You own the deployment: must compile, package, and operate your code
- (-) Performance ceiling depends on your implementation quality

### 1.3 Serverless / Edge

A relay that runs on edge compute platforms without managing servers.

| Relay | Platform | Storage | Key Trait |
|-------|----------|---------|-----------|
| **Nosflare** | Cloudflare Workers | KV / D1 | Zero-ops, global distribution |

**When to choose:** You want a relay with minimal operational burden and are
comfortable with the constraints of a serverless environment (execution time
limits, storage model restrictions).

---

## 2. Storage Engine Choices

The storage engine is the single most consequential architectural decision for a
relay. It determines query performance, crash safety, operational complexity, and
scaling ceiling.

### 2.1 LMDB (Lightning Memory-Mapped Database)

**Used by:** strfry, gossip (client-side)

LMDB is a B+ tree key-value store that memory-maps the entire database file into
the process address space. Reads are zero-copy -- the application reads directly
from mapped memory pages without serialization or buffer management.

**Architecture:**
```
Process Address Space
+---------------------------------------------------+
|  Code  |  Heap  |    LMDB mmap region             |
|        |        |  [page][page][page][page]...     |
+---------------------------------------------------+
                         |
                         v  (OS page cache)
+---------------------------------------------------+
|              data.mdb on disk                      |
+---------------------------------------------------+
```

**Properties:**
- **Read performance:** Near-RAM speed for hot data. No deserialization overhead.
  Readers never block writers. Multiple concurrent read transactions are free.
- **Write performance:** Single-writer model. All writes are serialized through
  one write transaction at a time. This simplifies concurrency but caps write
  throughput on a single node.
- **Crash safety:** Copy-on-write B+ tree. The database is always in a
  consistent state. No write-ahead log needed. Power loss cannot corrupt data.
- **Memory:** The mmap region can exceed physical RAM. The OS transparently
  pages data in and out. A relay with a 50 GB database on a 4 GB machine works
  fine -- hot pages stay in RAM, cold pages are read from disk on demand.
- **Operational simplicity:** Single file (`data.mdb`), no compaction, no vacuum,
  no WAL management. Backups are a file copy (while a read transaction is open).

**Sizing considerations:**
- LMDB pre-allocates the maximum database size (`mapsize`). strfry defaults to
  a configurable value (e.g., 4 GB). Set this larger than your expected data.
- Disk usage only grows as data is written. The file is sparse on many
  filesystems.
- Deleted space is reused internally (free pages) but the file does not shrink.
  Occasional copy-compact if you delete significant data.

**strfry-specific optimizations:**
- Flat-buffer serialized events stored directly in LMDB values
- Custom multi-index scheme: separate LMDB databases (sub-DBs) for each index
  (by id, by pubkey+kind+created_at, by tag, by created_at)
- Negentropy sync (NIP-77) built on top of LMDB range queries

### 2.2 SQLite

**Used by:** nostr-rs-relay

SQLite is an embedded SQL database compiled into the relay binary. It provides
full SQL query capabilities without a separate server process.

**Architecture:**
```
Relay Process
+-------------------------------------------+
|  WebSocket handler                        |
|      |                                    |
|  Event validation                         |
|      |                                    |
|  SQL query builder                        |
|      |                                    |
|  SQLite library (linked in-process)       |
|      |                                    |
|  WAL file  +  main DB file                |
+-------------------------------------------+
```

**Properties:**
- **WAL mode (Write-Ahead Logging):** Enables concurrent reads while a write is
  in progress. Readers see a consistent snapshot. Writes append to a WAL file
  that is periodically checkpointed into the main database.
- **Query flexibility:** Full SQL. Complex filter queries map naturally to
  SQL WHERE clauses with indexed columns.
- **Single-writer:** Like LMDB, SQLite serializes writes. WAL mode allows reads
  to proceed concurrently with the single writer.
- **Operational simplicity:** Two files (DB + WAL). No server process.
- **Scaling ceiling:** Suitable for small-to-medium relays (thousands of events
  per second). For larger loads, PostgreSQL or LMDB offer better throughput.

**Schema pattern (nostr-rs-relay):**
```sql
CREATE TABLE event (
    id INTEGER PRIMARY KEY,
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

CREATE INDEX idx_event_pubkey_kind ON event(pubkey, kind, created_at);
CREATE INDEX idx_event_kind_created ON event(kind, created_at);
CREATE INDEX idx_tag_value ON tag(name, value);
```

**Tuning for relay workloads:**
- `PRAGMA journal_mode=WAL;` -- essential for concurrent reads
- `PRAGMA synchronous=NORMAL;` -- balance between durability and speed
- `PRAGMA cache_size=-64000;` -- 64 MB page cache
- `PRAGMA mmap_size=268435456;` -- memory-map for read performance

### 2.3 PostgreSQL

**Used by:** nostream, gnost-relay, nostr-relay-nestjs (as an option)

A full client-server RDBMS. Chosen when the relay needs advanced query
capabilities, horizontal read scaling, or integration with existing
infrastructure.

**Architecture:**
```
Relay Process(es)              PostgreSQL Server
+------------------+          +------------------+
| WebSocket server |---TCP--->| Connection pool  |
| Event pipeline   |          | Query executor   |
|                  |<--TCP--- | Storage engine   |
+------------------+          | WAL + checkpoints|
                              +------------------+
                                     |
                              +------+------+
                              | Read replica | (optional)
                              +-------------+
```

**Properties:**
- **jsonb indexing:** Store the raw event as a `jsonb` column. Create GIN
  indexes on tag arrays. Query with `@>`, `?`, and path operators. This
  provides flexible indexing without schema migration for new tag types.
- **Horizontal read scaling:** Read replicas can serve query-heavy workloads.
  The primary handles writes.
- **Connection pooling:** PgBouncer or built-in pooling handles thousands of
  relay connections without exhausting PostgreSQL backend slots.
- **Maturity:** Proven at scale. Rich ecosystem of monitoring, backup, and
  management tools.
- **NOTIFY/LISTEN:** PostgreSQL can push notifications when new events are
  inserted, enabling live subscription delivery without polling.

**Trade-offs vs embedded:**
- (+) Can scale reads horizontally
- (+) Rich query language, jsonb flexibility
- (+) Battle-tested operational tooling
- (-) Network round-trip for every query
- (-) Operational burden: separate process, backups, upgrades, connection tuning
- (-) Higher baseline resource consumption

**Schema pattern (nostream-style):**
```sql
CREATE TABLE events (
    id BYTEA PRIMARY KEY,           -- 32-byte event id
    pubkey BYTEA NOT NULL,
    kind INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    content TEXT NOT NULL,
    sig BYTEA NOT NULL,
    raw JSONB NOT NULL               -- full event for serving
);

CREATE INDEX idx_events_pubkey_kind ON events(pubkey, kind, created_at DESC);
CREATE INDEX idx_events_kind_created ON events(kind, created_at DESC);
CREATE INDEX idx_events_tags ON events USING GIN (tags);
```

### 2.4 In-Memory

**Used by:** bucket (coracle), testing harnesses

No persistence. Events live only in process memory. When the relay stops,
everything is gone.

**When to use:**
- Unit and integration testing of clients
- Ephemeral relay for a live event or hackathon
- Development/staging environments
- Benchmarking client behavior without storage I/O as a variable

**Implementation pattern:**
```
Map<event_id, Event>           -- primary store
Map<pubkey, Set<event_id>>     -- author index
Map<kind, Set<event_id>>       -- kind index
Map<tag_key, Map<tag_value, Set<event_id>>>  -- tag index
```

**Trade-offs:**
- (+) Maximum speed -- no I/O, no serialization
- (+) Trivial to implement
- (-) Memory-bounded: cannot hold more events than RAM allows
- (-) No durability

---

## 3. Event Indexing Strategies

A relay's query performance is determined by its indexes. The NIP-01 filter
spec defines what must be queryable; the indexing strategy determines how
efficiently those queries execute.

### 3.1 Which Fields to Index

Every relay must support filtering by these fields (NIP-01):

| Filter Field | Index Key | Notes |
|-------------|-----------|-------|
| `ids` | event id (or prefix) | Primary key lookup. Fastest possible query. |
| `authors` | pubkey (or prefix) | Usually combined with kind and/or created_at. |
| `kinds` | kind number | Almost always combined with other fields. |
| `since`/`until` | created_at | Range scan. Combined with kind or pubkey for efficiency. |
| `#<letter>` | tag name + first value | All 52 single-letter tags must be indexable. |
| `limit` | (ordering) | Results ordered by created_at DESC, then lowest id for ties. |

### 3.2 Composite Indexes for Common Query Patterns

The most frequent client queries and their ideal indexes:

**Home timeline (most common):**
```
Filter:  {"kinds": [1,6,7], "authors": [pk1, pk2, ...pk500], "limit": 50}
Index:   (pubkey, kind, created_at DESC)
Strategy: For each author, seek to (author, kind) and scan backward by created_at.
          Merge results across authors, take top 50.
```

**Profile fetch:**
```
Filter:  {"kinds": [0], "authors": [pk1]}
Index:   (pubkey, kind)
Strategy: Direct lookup. Replaceable event, so at most one result.
```

**Thread replies:**
```
Filter:  {"kinds": [1], "#e": [event_id]}
Index:   (tag_name='e', tag_value, kind, created_at DESC)
Strategy: Seek to tag value, scan matching kinds.
```

**Hashtag feed:**
```
Filter:  {"kinds": [1, 30023], "#t": ["bitcoin"], "limit": 50}
Index:   (tag_name='t', tag_value, kind, created_at DESC)
Strategy: Seek to tag value, filter by kind, scan backward.
```

**Notifications:**
```
Filter:  {"#p": [my_pubkey], "kinds": [1,6,7,9735], "since": <timestamp>}
Index:   (tag_name='p', tag_value, created_at DESC)
Strategy: Seek to tag value, scan forward from since.
```

### 3.3 Single-Letter Tag Indexing

NIP-01 requires that all single-letter tags (a-z, A-Z) be indexable. Only the
first value (the second element of the tag array) is indexed.

**Implementation approaches:**

1. **Unified tag table** (SQLite/PostgreSQL): One table with (tag_name,
   tag_value, event_id). Works for all tag letters. GIN index on PostgreSQL
   jsonb works similarly.

2. **Separate sub-databases** (LMDB/key-value stores): strfry creates a
   separate index for each tag letter that appears in stored events. The key
   is `tag_value + created_at + event_id`, enabling efficient range scans.

3. **Composite key encoding** (any KV store): Encode as
   `tag_letter | tag_value | created_at_bigendian | event_id` and use
   prefix scans.

### 3.4 Full-Text Search Indexing (NIP-50)

NIP-50 adds a `search` field to filters. Relays that support it need a
full-text search index on event content.

**Implementation options:**

| Engine | Approach | Notes |
|--------|----------|-------|
| SQLite FTS5 | `CREATE VIRTUAL TABLE event_fts USING fts5(content)` | Built-in, good for moderate scale |
| PostgreSQL tsvector | `CREATE INDEX ... USING GIN (to_tsvector('english', content))` | Mature, multi-language, ranking |
| External (Meilisearch, Elasticsearch) | Index events asynchronously | Best for large-scale search, adds operational complexity |
| In-process (tantivy, bleve) | Embedded search library | Good performance, no external dependency |

**Indexing pipeline:**
```
Event arrives -> passes validation -> stored in primary DB
                                   -> indexed in FTS engine (sync or async)
```

Async indexing is preferred for write throughput -- search results may lag
by milliseconds but writes are not blocked by indexing.

---

## 4. WebSocket Handling

### 4.1 Connection Lifecycle

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
  +--- ["EVENT", <event>]  -> validation pipeline -> OK response
  |
  +--- ["REQ", <sub_id>, <filters>]  -> register subscription
  |     |                                -> query stored events -> EVENT responses
  |     |                                -> send EOSE
  |     |                                -> subscription enters live mode
  |
  +--- ["CLOSE", <sub_id>]  -> remove subscription
  |
  +--- ["AUTH", <auth_event>]  -> verify auth -> OK response
  |
  +--- ["COUNT", <id>, <filters>]  -> count query -> COUNT response
  |
  +--- ["NEG-OPEN/MSG/CLOSE", ...]  -> negentropy sync (NIP-77)
  |
  v
Connection closes (client disconnect, timeout, or relay-initiated)
  -> clean up all subscriptions for this connection
  -> release connection slot
```

### 4.2 Subscription Management

Each WebSocket connection can have multiple active subscriptions. The relay
must track them efficiently.

**Data structure per connection:**
```
Connection {
    websocket: WebSocket,
    subscriptions: Map<subscription_id, SubscriptionState>,
    authenticated_pubkeys: Set<pubkey>,  // NIP-42
    rate_limiter: RateLimiter,
    connected_at: Timestamp,
    bytes_sent: u64,
    bytes_received: u64,
    remote_addr: IpAddr,
}

SubscriptionState {
    filters: Vec<Filter>,
    eose_sent: bool,
}
```

**Live event delivery:**

When a new event arrives and passes validation, the relay must check it against
every active subscription across all connections. This is the hot path.

**Naive approach (O(connections * subscriptions * filters)):**
```
for connection in connections:
    for subscription in connection.subscriptions:
        for filter in subscription.filters:
            if event_matches(event, filter):
                send(connection, ["EVENT", sub_id, event])
                break  // matched this subscription, move to next
```

**Optimized approaches:**

1. **Inverted index on subscriptions:** Index active subscriptions by the fields
   they filter on. When a new kind-1 event from pubkey X arrives, look up only
   subscriptions that have `kinds` containing 1 AND `authors` containing X (or
   no author filter).

2. **Bloom filter pre-check:** Each subscription computes a bloom filter from
   its filter fields. An event is tested against the bloom filter first
   (fast reject). Only bloom-positive subscriptions do the full match check.

3. **Grouped delivery:** If many subscriptions on different connections have
   identical filters (common for popular feeds), evaluate the filter once and
   fan out the result.

### 4.3 Backpressure and Flow Control

When a relay queries stored events for a subscription, the result set can be
large. Sending thousands of events without flow control can overwhelm the
client's WebSocket receive buffer or the network link.

**Patterns:**

1. **Chunked sending:** Send events in batches (e.g., 100 at a time). Check the
   WebSocket write buffer between batches. If the buffer is above a threshold,
   pause and wait for it to drain.

2. **Per-connection write queue:** Each connection has a bounded write queue.
   If the queue is full, the relay can either drop the connection, skip events,
   or apply backpressure by pausing the database scan.

3. **Limit enforcement:** Respect the `limit` field in filters. A client asking
   for `"limit": 50` should get at most 50 stored events. The relay's own
   `max_limit` (NIP-11) caps this further.

4. **Slow consumer detection:** If a connection's write buffer stays full for
   too long, the relay should close the connection rather than accumulate
   unbounded memory.

### 4.4 Connection Limits and Rate Limiting

**Connection-level limits:**
- Maximum concurrent connections per IP address
- Maximum concurrent connections total
- Maximum subscriptions per connection (NIP-11 `max_subscriptions`)
- Idle timeout (close connections with no activity for N minutes)

**Message-level rate limiting:**
- EVENT submissions: N events per minute per connection or per pubkey
- REQ submissions: N subscriptions opened per minute
- Total bytes per second per connection

**Rate limiting responses:**
- `["OK", <id>, false, "rate-limited: slow down"]` for EVENT
- `["CLOSED", <sub_id>, "rate-limited: too many subscriptions"]` for REQ
- Connection close for severe abuse

**Implementation pattern -- token bucket:**
```
RateLimiter {
    tokens: f64,
    max_tokens: f64,
    refill_rate: f64,    // tokens per second
    last_refill: Timestamp,

    fn try_consume(cost: f64) -> bool {
        refill();
        if tokens >= cost {
            tokens -= cost;
            return true;
        }
        return false;
    }
}
```

Use separate token buckets for different operations (EVENT publish vs REQ
subscribe) so that heavy readers do not starve writers.

---

## 5. Event Validation Pipeline

Every event received by a relay must pass through a validation pipeline before
storage or forwarding. The pipeline should be ordered to reject cheap-to-detect
invalid events first, saving expensive operations (signature verification) for
events that pass basic checks.

### 5.1 Pipeline Stages

```
Incoming ["EVENT", <event_json>]
  |
  v
[1] JSON Parse
    - Is it valid JSON?
    - Is it a valid JSON array with "EVENT" verb?
    - Does the event object have all 7 required fields?
    - Are field types correct (id: string, kind: integer, etc.)?
    REJECT: ["OK", <id>, false, "invalid: malformed event"]
  |
  v
[2] Schema Validation
    - Is id exactly 64 lowercase hex characters?
    - Is pubkey exactly 64 lowercase hex characters?
    - Is sig exactly 128 lowercase hex characters?
    - Is kind in range 0..65535?
    - Is created_at a non-negative integer?
    - Are all tags arrays of non-null strings?
    REJECT: ["OK", <id>, false, "invalid: bad field format"]
  |
  v
[3] Size / Limit Checks
    - Is the total message size within max_message_length?
    - Is content length within max_content_length?
    - Is tag count within max_event_tags?
    REJECT: ["OK", <id>, false, "invalid: event too large"]
  |
  v
[4] Timestamp Validation
    - Is created_at >= created_at_lower_limit? (NIP-11)
    - Is created_at <= created_at_upper_limit? (NIP-11)
    - Is expiration tag (NIP-40) already in the past?
    REJECT: ["OK", <id>, false, "invalid: event creation date out of range"]
  |
  v
[5] Deduplication
    - Is this event id already in storage?
    REJECT: ["OK", <id>, true, "duplicate: already have this event"]
    (Note: some relays return false for duplicates, some return true)
  |
  v
[6] Proof of Work (NIP-13)
    - If min_pow_difficulty > 0, check the nonce tag and leading zeros of id
    REJECT: ["OK", <id>, false, "pow: difficulty N is less than M"]
  |
  v
[7] ID Verification
    - Recompute SHA-256 of [0, pubkey, created_at, kind, tags, content]
    - Compare with claimed id
    REJECT: ["OK", <id>, false, "invalid: event id does not match"]
  |
  v
[8] Signature Verification (CPU-intensive)
    - Verify BIP-340 Schnorr signature: schnorr_verify(pubkey, id, sig)
    REJECT: ["OK", <id>, false, "invalid: event signature verification failed"]
  |
  v
[9] Policy Enforcement (relay-specific)
    - Kind filtering: does this relay accept this kind?
    - Author allowlist/blocklist
    - Content filtering (spam, prohibited content)
    - Web-of-trust checks
    - Payment/subscription verification
    REJECT: ["OK", <id>, false, "blocked: ..." or "restricted: ..."]
  |
  v
[10] Storage
    - Write to database
    - Handle replaceable/addressable event replacement logic
    - Trigger live subscription matching
    ACCEPT: ["OK", <id>, true, ""]
```

### 5.2 Signature Verification Optimization

Schnorr signature verification (BIP-340 over secp256k1) is the most
CPU-intensive operation in the validation pipeline. A single verification takes
roughly 50--200 microseconds depending on hardware.

**Batch verification:**

The libsecp256k1 library supports batch verification, where N signatures are
verified together faster than N individual verifications. The speedup comes
from amortizing the cost of multi-scalar multiplication.

```
Batch of 64 events:
  Individual: 64 * 100us = 6,400us
  Batched:    ~2,500us (2.5x speedup)
```

**Implementation pattern:**
```
Accumulate incoming events in a batch buffer.
When the buffer reaches a threshold (e.g., 64 events) OR a timeout expires
(e.g., 10ms):
    Run batch_verify(events)
    For each result:
        If valid: continue pipeline
        If invalid: send OK with false
```

**Parallelism:** Run signature verification on a thread pool. The WebSocket
handler thread should not block on crypto. Use a channel/queue pattern:

```
WebSocket thread -> [validation queue] -> crypto thread pool -> [result queue] -> storage + delivery
```

### 5.3 Deduplication Strategies

- **In-storage check:** Query the database for the event id before doing
  expensive validation. This is the most common approach. The id index makes
  this a fast O(1) lookup.
- **In-memory bloom filter:** Before hitting storage, check a bloom filter of
  recently seen event ids. A bloom filter with 1 million entries and 0.1% false
  positive rate uses about 1.4 MB of memory. Eliminates database reads for
  duplicate events.
- **LRU cache:** Keep the last N thousand event ids in an LRU cache. Even more
  precise than a bloom filter for recent events.

---

## 6. Write Policy Plugins

Different relays expose different mechanisms for custom accept/reject logic.

### 6.1 strfry Model: External Process Plugin

strfry invokes an external program for every incoming event. The event JSON is
written to the plugin's stdin; the plugin writes an accept/reject decision to
stdout.

```
strfry process                    Plugin process (any language)
+--------------+                  +-------------------+
| event arrives|---stdin JSON---->| read event        |
|              |                  | apply policy      |
|              |<--stdout JSON--- | write decision    |
+--------------+                  +-------------------+
```

**Plugin input (stdin):**
```json
{
    "type": "new",
    "event": { ... full event JSON ... },
    "receivedAt": 1700000000,
    "sourceType": "IP4",
    "sourceInfo": "1.2.3.4"
}
```

**Plugin output (stdout):**
```json
{"id": "<event-id>", "action": "accept", "msg": ""}
```
or
```json
{"id": "<event-id>", "action": "reject", "msg": "blocked: not on allowlist"}
```
or
```json
{"id": "<event-id>", "action": "shadowReject", "msg": ""}
```

**Shadow reject** tells the client the event was accepted (`OK true`) but does
not actually store it. Useful for anti-spam without revealing filtering rules.

**Advantages:**
- Plugin can be written in any language (Python, Bash, Go, etc.)
- Plugin crash does not crash the relay
- Easy to swap policies by changing the plugin binary
- Plugin has access to source IP for rate limiting

**Disadvantages:**
- Process spawn overhead per event (mitigated by long-running plugins that
  read stdin in a loop)
- IPC serialization cost
- Plugin cannot easily query the relay's own database

### 6.2 khatru Model: In-Process Go Hooks

khatru provides hook points that you implement as Go functions when building
your relay binary.

```go
relay := khatru.NewRelay()

// Called before storing an event
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
        if event.Kind == 4 {
            return true, "restricted: we do not accept DMs"
        }
        // Check web-of-trust
        if !isInWoT(event.PubKey) {
            return true, "blocked: not in web of trust"
        }
        return false, ""
    },
)

// Called before serving an event to a subscriber
relay.RejectFilter = append(relay.RejectFilter,
    func(ctx context.Context, filter nostr.Filter) (reject bool, msg string) {
        if len(filter.Authors) > 500 {
            return true, "error: too many authors in filter"
        }
        return false, ""
    },
)

// Custom storage backends
relay.StoreEvent = append(relay.StoreEvent,
    func(ctx context.Context, event *nostr.Event) error {
        return myDatabase.Save(event)
    },
)

relay.QueryEvents = append(relay.QueryEvents,
    func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
        return myDatabase.Query(filter)
    },
)
```

**Hook points in khatru:**
- `RejectEvent` -- accept/reject incoming events
- `RejectFilter` -- accept/reject subscription filters
- `StoreEvent` -- persist an event
- `DeleteEvent` -- handle deletion requests
- `QueryEvents` -- serve subscription queries
- `CountEvents` -- handle COUNT requests
- `OnConnect` -- connection-level accept/reject
- `OnDisconnect` -- cleanup on connection close
- `OverwriteFilter` -- modify a filter before query (e.g., enforce auth restrictions)
- `OverwriteResponseEvent` -- modify an event before delivery

**Advantages:**
- Zero IPC overhead, in-process function calls
- Full access to relay state, database, and other Go libraries
- Type-safe, compile-time checked
- Can compose multiple hooks (WoT + PoW + paid tiers)

**Disadvantages:**
- Must write Go code
- Plugin bugs can crash the relay process
- Requires recompilation to change policies

### 6.3 nostream Model: TypeScript Middleware Pipeline

nostream uses a NestJS-inspired pipeline where events pass through a chain of
middleware handlers.

```
Event -> RateLimiter -> SchemaValidator -> SignatureVerifier
     -> PolicyEnforcer -> Deduplicator -> StorageHandler
     -> SubscriptionNotifier
```

Each middleware can:
- Pass the event to the next handler
- Reject the event with an error message
- Transform the event (rare, but possible)

**Advantages:**
- Familiar pattern for TypeScript/Node.js developers
- Easy to add/remove/reorder middleware
- Each middleware is independently testable

**Disadvantages:**
- Node.js single-threaded event loop can bottleneck on CPU-bound work
  (signature verification should be offloaded to worker threads)
- More boilerplate than khatru's hook model

---

## 7. Scaling Patterns

### 7.1 Vertical Scaling

**LMDB memory mapping:** The simplest scaling lever. Add more RAM and LMDB
automatically keeps more of the database hot in memory. No configuration change
needed -- the OS page cache does the work.

**Query optimization:**
- Ensure composite indexes match query patterns (see Section 3.2)
- Use `limit` to cap result sets
- Avoid full table scans: every filter field combination that appears in
  production queries should have an index
- Profile slow queries and add indexes for the long tail

**Connection handling:**
- Use async I/O (epoll/kqueue) to handle tens of thousands of concurrent
  WebSocket connections on a single thread (or a small thread pool)
- strfry handles 50,000+ concurrent connections on a single machine

**CPU scaling:**
- Signature verification on a thread pool (see Section 5.2)
- Separate threads/tasks for: WebSocket I/O, event validation, database writes,
  subscription matching

### 7.2 Horizontal Scaling

**Load balancer in front of relay instances:**
```
                   +--- Relay A (LMDB) ---+
                   |                      |
Client --> LB -----+--- Relay B (LMDB) ---+--- Shared storage (optional)
                   |                      |
                   +--- Relay C (LMDB) ---+
```

**Challenge: subscription consistency.** If client C subscribes to Relay A and
a new event arrives at Relay B, the client will not see it unless:

1. **Shared storage:** All instances share a database (PostgreSQL). Writes go to
   the shared DB. NOTIFY/LISTEN propagates new events to all instances for live
   subscriptions.

2. **Event broadcast:** After accepting an event, the receiving instance
   broadcasts it to all other instances via an internal channel (Redis pub/sub,
   NATS, or a relay-to-relay WebSocket mesh). Each instance matches the event
   against its local subscriptions.

3. **Sticky sessions:** The load balancer pins each client to a specific
   instance (by IP or WebSocket connection). Combined with multi-instance
   storage sync (e.g., negentropy), this ensures eventual consistency.

**Pattern: read replicas with write primary.**
```
Client reads  --> Read replicas (many, each with a copy of the data)
Client writes --> Write primary (one, replicates to read replicas)
```

This works naturally with PostgreSQL primary/replica setups.

### 7.3 Relay-to-Relay Sync (NIP-77 Negentropy)

NIP-77 defines an efficient set reconciliation protocol. Two relays (or a relay
and a client) compare their event sets and exchange only the differences.

**Use cases:**
- Sync a backup relay with the primary
- Sync community relays in a federation
- Client catch-up after being offline

**How it works (simplified):**
```
Relay A                                    Relay B
  |                                          |
  | NEG-OPEN (filter, initial fingerprint)   |
  |----------------------------------------->|
  |                                          |
  |   NEG-MSG (fingerprint comparison)       |
  |<-----------------------------------------|
  |                                          |
  |   NEG-MSG (refined ranges)              |
  |----------------------------------------->|
  |                                          |
  |   ... (converges in log(N) rounds) ...   |
  |                                          |
  | Transfer phase: exchange missing events  |
  | via standard EVENT/REQ messages          |
```

**Bandwidth efficiency:** For two sets of 100,000 events with 99% overlap, the
reconciliation messages total a few kilobytes. Without negentropy, you would
need to transfer all 100,000 event IDs (3.2 MB) to find the 1,000 differences.

**strfry implementation:** strfry includes a built-in `strfry sync` command
that uses negentropy to sync with another strfry instance (or any NIP-77
compatible relay).

---

## 8. Authentication (NIP-42) Implementation Patterns

### 8.1 Challenge Generation

When a client connects, the relay generates a random challenge string and sends
it immediately:

```json
["AUTH", "a1b2c3d4-random-unique-challenge"]
```

**Requirements:**
- The challenge must be unique per connection (prevents replay attacks)
- Use a CSPRNG (e.g., 32 random bytes, hex-encoded)
- Store the challenge in the connection state

### 8.2 Verification

When the client responds with a signed kind-22242 event:

```
1. Check kind == 22242
2. Check created_at within ~10 minutes of current time
3. Extract "challenge" tag value, compare to stored challenge
4. Extract "relay" tag value, compare to own relay URL (with normalization)
5. Verify Schnorr signature
6. If valid: add pubkey to connection's authenticated_pubkeys set
7. Send ["OK", <auth_event_id>, true, ""]
```

### 8.3 Authorization Patterns

After authentication, the relay knows which pubkey(s) the client controls. The
relay can then enforce policies:

**Pattern: Restricted reads**
```
if filter requests kind:4 (DMs):
    if not authenticated:
        return CLOSED "auth-required: DMs require authentication"
    if authenticated_pubkey not in [sender, recipient] of DM:
        return CLOSED "restricted: you can only read your own DMs"
```

**Pattern: Restricted writes**
```
if event.pubkey not in allowlist:
    if not authenticated:
        return OK false "auth-required: please authenticate"
    return OK false "restricted: your pubkey is not on the allowlist"
```

**Pattern: Paid relay**
```
if authenticated:
    check payment database for pubkey
    if paid: allow
    if not paid: return OK false "restricted: payment required"
else:
    return OK false "auth-required: please authenticate to check subscription"
```

### 8.4 Multi-Identity Authentication

A single connection can authenticate with multiple pubkeys (NIP-42 allows
multiple AUTH messages). The relay should maintain a set of authenticated
pubkeys per connection, not just one.

---

## 9. Monitoring and Observability

### 9.1 Key Metrics to Track

**Connection metrics:**
- `connections_active` -- current open WebSocket connections
- `connections_total` -- total connections since startup (counter)
- `connections_rejected` -- connections rejected (rate limit, max connections)
- `connections_by_ip` -- distribution to detect abuse

**Event metrics:**
- `events_received_total` -- all incoming events (counter, label by kind)
- `events_accepted_total` -- events that passed validation and were stored
- `events_rejected_total` -- events rejected (label by reason: invalid, duplicate, blocked, rate-limited)
- `events_stored_total` -- total events in storage (gauge)
- `event_validation_duration_seconds` -- histogram of validation pipeline time
- `signature_verify_duration_seconds` -- histogram of signature verification time

**Subscription metrics:**
- `subscriptions_active` -- current open subscriptions across all connections
- `subscriptions_total` -- total subscriptions created since startup
- `subscription_events_delivered_total` -- events sent to subscribers
- `eose_duration_seconds` -- time from REQ to EOSE (how fast stored events are served)

**Storage metrics:**
- `db_size_bytes` -- database file size
- `db_read_duration_seconds` -- histogram of read query latency
- `db_write_duration_seconds` -- histogram of write latency
- `db_events_total` -- total event count in storage

**WebSocket metrics:**
- `ws_bytes_sent_total` -- total bytes sent
- `ws_bytes_received_total` -- total bytes received
- `ws_message_send_queue_length` -- write buffer depth (detect slow consumers)

**Negentropy metrics (if supported):**
- `neg_sessions_active` -- open negentropy sync sessions
- `neg_events_synced_total` -- events transferred via negentropy

### 9.2 Health Checks

A relay should expose an HTTP health endpoint (separate from the WebSocket
endpoint or as a response to a regular HTTP GET).

**Basic health check:**
```
GET /health HTTP/1.1

200 OK
{"status": "ok", "uptime": 86400, "events_stored": 1234567, "connections": 42}
```

**Checks to perform:**
- Database is readable (run a trivial query)
- Database is writable (optional: attempt a no-op write)
- WebSocket listener is accepting connections
- Memory usage is below threshold
- Disk usage is below threshold

### 9.3 Alerting Rules

| Condition | Severity | Likely Cause |
|-----------|----------|-------------|
| `connections_active` > 90% of limit | Warning | Popularity spike or DDoS |
| `events_rejected_total{reason="rate-limited"}` spike | Warning | Spam wave or misbehaving client |
| `db_write_duration_seconds` p99 > 1s | Critical | Storage degradation, disk I/O saturation |
| `ws_message_send_queue_length` sustained high | Warning | Slow consumers, possible memory pressure |
| `db_size_bytes` > 90% of disk | Critical | Need to prune events or expand storage |
| Health check failing | Critical | Relay is down |

### 9.4 Logging Best Practices

- Log every rejected event with reason, source IP, and event kind (for debugging policy)
- Log connection open/close with IP and duration (for abuse detection)
- Log authentication attempts (success and failure)
- Do NOT log event content (privacy)
- Do NOT log private keys or signatures at debug level
- Use structured logging (JSON) for machine parsing
- Implement log rotation to prevent disk exhaustion

---

## 10. Putting It All Together: Reference Architectures

### 10.1 Small Personal Relay

```
strfry (single binary)
  Storage: LMDB (1-10 GB)
  Write policy: allowlist plugin (accept only own pubkey + friends)
  Auth: NIP-42 required for writes
  Scaling: not needed (single user)
  Hosting: VPS with 1 GB RAM, 20 GB disk
```

### 10.2 Community Relay

```
khatru (custom Go binary)
  Storage: SQLite or BadgerDB
  Write policy: web-of-trust hooks + kind filtering
  Auth: NIP-42 for writes, open reads
  Features: NIP-29 group support, content moderation hooks
  Scaling: single instance sufficient for ~1000 active users
  Hosting: VPS with 2-4 GB RAM, 50 GB disk
```

### 10.3 Public High-Traffic Relay

```
strfry or custom relay
  Storage: LMDB (100+ GB) or PostgreSQL
  Write policy: rate limiting + PoW requirement + basic spam filtering
  Auth: optional (open relay)
  Scaling:
    - Vertical: 32+ GB RAM for LMDB hot set
    - Horizontal: multiple instances behind HAProxy,
      synced via negentropy (NIP-77)
  Monitoring: Prometheus + Grafana dashboard
  Hosting: dedicated server or cloud instances
```

### 10.4 Paid Relay

```
khatru or nostream
  Storage: PostgreSQL (for payment record joins)
  Write policy: NIP-42 auth required, check payment status in hook
  Auth: mandatory NIP-42
  Features: NIP-11 fee schedule, Lightning payment integration
  Scaling: PostgreSQL read replicas for query load
  Hosting: cloud infrastructure with managed PostgreSQL
```

---

## References

- NIP-01: Basic protocol -- event structure, filters, relay behavior
- NIP-11: Relay Information Document -- capability advertisement
- NIP-13: Proof of Work -- anti-spam via computational cost
- NIP-40: Expiration Timestamp -- event TTL
- NIP-42: Authentication -- challenge-response client auth
- NIP-45: Event Counts -- COUNT message support
- NIP-50: Search Capability -- full-text search in filters
- NIP-65: Relay List Metadata -- outbox model
- NIP-77: Negentropy Syncing -- efficient set reconciliation
- strfry: https://github.com/hoytech/strfry
- khatru: https://github.com/fiatjaf/khatru
- nostream: https://github.com/Cameri/nostream
- nostr-rs-relay: https://sr.ht/~gheartsfield/nostr-rs-relay
