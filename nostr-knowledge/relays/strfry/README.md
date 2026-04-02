# strfry -- Deep Dive

## What is strfry?

strfry is a high-performance nostr relay written in C++ by Doug Hoyte. It is widely considered the most deployed relay implementation in the nostr ecosystem, powering many of the largest public and private relays. It stores all data locally on the filesystem using LMDB (Lightning Memory-Mapped Database), requiring no external database servers such as PostgreSQL or MySQL.

strfry is licensed under GPLv3.

**Repository:** https://github.com/hoytech/strfry

---

## Architecture

### Single-Process Design

strfry runs as a single process with internal threading. It uses a multi-threaded architecture with configurable thread pools for different workloads:

- **Ingester threads** -- handle incoming events, validate signatures, and write to the database
- **ReqWorker threads** -- process `REQ` subscription queries from clients
- **ReqMonitor threads** -- manage long-lived subscriptions and push matching events to clients
- **Negentropy threads** -- handle negentropy-based set reconciliation sync sessions

This single-process model simplifies deployment and operation. There is no need for inter-process communication, message queues, or distributed coordination.

### LMDB Storage Model

strfry uses LMDB as its sole storage backend. LMDB is a B+ tree-based key-value store that uses memory-mapped I/O.

**How memory-mapped I/O works in strfry:**

- The entire database file is mapped into the process's virtual address space using `mmap()`
- Read operations access data directly from the OS page cache -- there is no data copying from kernel space to user space (zero-copy reads)
- The operating system manages which pages are resident in physical RAM and which are paged to disk
- Write operations use copy-on-write semantics within LMDB transactions

**B+ tree indexing:**

Events are stored and indexed across multiple B+ trees within the LMDB environment:

- **Primary store** -- events keyed by internal ID, storing the full serialized event
- **ID index** -- maps event ID (32 bytes) to internal ID for quick lookups
- **Pubkey+kind index** -- enables queries filtering by author and event kind
- **Tag indexes** -- indexes for `e`, `p`, `d`, and other single-letter tags as required by NIPs
- **Created_at index** -- enables time-range queries and ordering

Each index is a separate named database within the single LMDB environment file. The B+ tree structure provides O(log n) lookups and efficient range scans, which map well to nostr filter queries.

**Key LMDB characteristics relevant to strfry:**

- **Single-writer, multiple-reader** -- one write transaction at a time, but unlimited concurrent readers with no locking overhead
- **ACID transactions** -- durable writes are confirmed before returning OK to clients
- **No write-ahead log** -- LMDB uses copy-on-write, so there is no WAL to manage or checkpoint
- **Fixed map size** -- the maximum database size must be configured upfront (default: ~10 TB virtual address space)

### Zero-Copy Event Handling

strfry uses FlatBuffers for internal event serialization. Unlike JSON, FlatBuffers allow direct access to structured data without parsing or unpacking. When an event is read from LMDB, the memory-mapped bytes can be accessed directly as a FlatBuffers object -- no deserialization step is needed. This is what "zero-copy" means in the strfry context: the event data flows from disk to network with minimal intermediate copies.

---

## Supported NIPs

strfry supports most applicable NIPs:

| NIP | Description |
|-----|-------------|
| NIP-01 | Basic protocol flow (events, subscriptions, filters) |
| NIP-02 | Follow lists |
| NIP-04 | Encrypted direct messages (legacy) |
| NIP-09 | Event deletion |
| NIP-11 | Relay information document |
| NIP-28 | Public chat |
| NIP-40 | Expiration timestamp |
| NIP-42 | Authentication of clients to relays |
| NIP-45 | Event counts (`COUNT` verb) |
| NIP-70 | Protected events |
| NIP-77 | Negentropy syncing |

---

## Key Features

### Hot Reload and Zero-Downtime Restarts

Many configuration parameters can be changed without restarting the relay. strfry watches its configuration file and reloads automatically when changes are detected.

For deployments requiring full restarts (e.g., binary upgrades), strfry supports zero-downtime restarts using `SO_REUSEPORT`. The process:

1. Start a new strfry process (it binds to the same port via REUSEPORT)
2. Send `SIGUSR1` to the old process
3. The old process stops accepting new connections, finishes serving existing ones, then exits

### Durable Writes

strfry confirms that events are committed to the LMDB database before sending an `OK` response back to the client. This means a client receiving `OK true` can be confident the event is persisted to disk.

### WebSocket Compression

strfry supports `permessage-deflate` WebSocket compression with optional sliding window, reducing bandwidth usage for clients that support it. This is configurable and can be disabled for environments where CPU is more constrained than bandwidth.

### Prometheus Metrics

strfry exposes Prometheus-compatible metrics at the `/metrics` endpoint on the relay port. Available metrics include:

- `nostr_client_messages_total{verb}` -- count of client messages by verb (EVENT, REQ, CLOSE, etc.)
- `nostr_relay_messages_total{verb}` -- count of relay messages by verb (EVENT, EOSE, OK, etc.)
- `nostr_events_total{kind}` -- count of events by kind number

Metrics are per-process and reset on restart.

---

## Plugin System: Write Policies

strfry delegates event acceptance decisions to external plugins rather than hardcoding policy logic. This allows operators to implement arbitrary write policies in any programming language.

### How Plugins Work

1. strfry spawns the configured plugin as a child process
2. When an event arrives, strfry writes a JSON message to the plugin's stdin
3. The plugin evaluates the event and writes a JSON response to stdout
4. strfry acts on the plugin's decision

### Input Message Format

```json
{
  "type": "new",
  "event": {
    "id": "abc123...",
    "pubkey": "def456...",
    "created_at": 1234567890,
    "kind": 1,
    "tags": [],
    "content": "Hello world",
    "sig": "789abc..."
  },
  "receivedAt": 1234567890,
  "sourceType": "IP4",
  "sourceInfo": "192.168.1.1",
  "authed": null
}
```

**sourceType values:**

| Value | Description |
|-------|-------------|
| `IP4` | Received from IPv4 WebSocket client |
| `IP6` | Received from IPv6 WebSocket client |
| `Import` | Loaded via `strfry import` |
| `Stream` | Received via `strfry stream` |
| `Sync` | Received via negentropy sync |
| `Stored` | Already in database (re-evaluation) |

The `authed` field contains the NIP-42 authenticated pubkey (32-byte hex string) if the client has authenticated, or `null` otherwise.

### Output Message Format

```json
{
  "id": "abc123...",
  "action": "accept",
  "msg": ""
}
```

**action values:**

| Action | Effect |
|--------|--------|
| `accept` | Event is stored in the database |
| `reject` | Event is rejected; `msg` is sent to the client as a NIP-20 machine-readable reason |
| `shadowReject` | Event is silently dropped; client receives `OK true` but event is not stored |

### Implementation Notes

- Plugins must flush stdout after each line (line-buffered output). In Python use `flush=True`, in Perl use `$\|++`.
- Plugins can be written in any language that supports stdin/stdout and JSON parsing.
- Script modifications trigger automatic plugin reload.
- Plugin rejection does not override strfry's built-in validation (expiration, deletion, etc.).
- Setting `msg` to an empty string suppresses verbose rejection logging.

### Example: JavaScript Whitelist Plugin

```javascript
#!/usr/bin/env node

const readline = require('readline');

const allowedPubkeys = new Set([
  'abc123...', // Alice
  'def456...', // Bob
]);

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const req = JSON.parse(line);
  const pubkey = req.event.pubkey;

  const result = {
    id: req.event.id,
    action: allowedPubkeys.has(pubkey) ? 'accept' : 'reject',
    msg: allowedPubkeys.has(pubkey) ? '' : 'blocked: pubkey not on whitelist',
  };

  console.log(JSON.stringify(result));
});
```

---

## Negentropy Sync (NIP-77)

Negentropy is a set reconciliation protocol that allows two parties to efficiently determine which items one has that the other lacks, with minimal bandwidth.

### How It Works

1. Both sides compute a fingerprint (hash) over their set of event IDs
2. They exchange these fingerprints in a multi-round protocol
3. Differences are identified and only missing events are transferred

This is dramatically more efficient than naive syncing approaches (e.g., downloading all events and checking for duplicates). For two relays with 1 million events each where only 100 differ, negentropy identifies those 100 events in a few kilobytes of protocol exchange rather than transferring millions of event IDs.

### CLI Usage

```bash
# Bidirectional sync with a remote relay
strfry sync wss://relay.example.com

# Download only (pull events you're missing)
strfry sync wss://relay.example.com --dir down

# Upload only (push events the remote is missing)
strfry sync wss://relay.example.com --dir up

# Sync with a filter (only kind 1 events)
strfry sync wss://relay.example.com --filter '{"kinds":[1]}'

# Sync within a time range
strfry sync wss://relay.example.com --since 1700000000 --until 1710000000
```

### Precomputed BTrees

For frequently synced filters, strfry can precompute negentropy B-tree structures to speed up reconciliation:

```bash
# List existing precomputed trees
strfry negentropy list

# Add a new tree for a specific filter
strfry negentropy add '{"kinds":[1]}'

# Build/rebuild a tree
strfry negentropy build <tree-id>
```

---

## strfry stream: Real-Time Event Streaming

`strfry stream` pipes events in real-time to an external process. This enables building external systems that react to relay events without modifying strfry itself.

Use cases:
- Feeding events to a search indexer (e.g., Elasticsearch)
- Triggering webhooks or notifications
- Writing events to a secondary data store
- Real-time analytics pipelines

---

## strfry router: Event Routing Between Relays

The router is a built-in client-side tool that maintains persistent connections to multiple relays and routes events between them.

### Configuration

The router uses a separate configuration file with a `streams` section:

```
connectionTimeout = 20
verbose = false

streams {
    # Pull events from public relays
    friends {
        dir = "down"
        pluginDown = "/path/to/spam-filter.js"
        urls = [
            "wss://nos.lol",
            "wss://relayable.org"
        ]
    }

    # Bidirectional sync between cluster nodes
    cluster {
        dir = "both"
        urls = [
            "wss://eu.example.com",
            "wss://na.example.com"
        ]
    }

    # Push profile and contact events to a directory relay
    directory {
        dir = "up"
        filter = { "kinds": [0, 3] }
        urls = ["ws://internal-directory.example.com"]
    }
}
```

### Stream Directions

| Direction | Behavior |
|-----------|----------|
| `down` | Subscribe to remote relays, store received events locally |
| `up` | Monitor local database, upload new events to remote relays |
| `both` | Simultaneous upload and download |

### Key Behaviors

- **Auto-reconnect** -- the router reconnects to unavailable relays every 5-10 seconds indefinitely
- **Hot reconfiguration** -- modifying the config file applies changes without restarting; existing unaffected connections are preserved
- **Plugin support** -- `pluginDown` and `pluginUp` fields allow filtering events during routing using the same plugin protocol as write policies

---

## Zstd Dictionary Compression

strfry supports on-disk compression of event content using zstd dictionaries. This can significantly reduce database size for relays storing large numbers of similar events.

```bash
# Train a compression dictionary on existing events
strfry dict train --filter '{"kinds":[1]}'

# Compress events matching a filter
strfry dict compress --filter '{"kinds":[1]}'

# Decompress back to original
strfry dict decompress --filter '{"kinds":[1]}'

# View compression statistics
strfry dict stats
```

---

## CLI Command Reference

| Command | Description |
|---------|-------------|
| `strfry relay` | Run the relay server |
| `strfry scan [filter]` | Query events matching a nostr filter |
| `strfry delete --filter [filter]` | Delete events matching a filter |
| `strfry import` | Batch import JSONL events from stdin |
| `strfry export` | Export events to stdout as JSONL |
| `strfry upload [url]` | Upload events to a remote relay |
| `strfry download [url]` | Download events from a remote relay |
| `strfry sync [url]` | Negentropy-based set reconciliation |
| `strfry router` | Run the event router |
| `strfry compact` | Create a compacted copy of the LMDB database |
| `strfry negentropy list` | List precomputed negentropy trees |
| `strfry negentropy add [filter]` | Add a new negentropy tree |
| `strfry negentropy build [id]` | Build a negentropy tree |
| `strfry dict train` | Train a zstd compression dictionary |
| `strfry dict compress` | Compress events using dictionary |
| `strfry dict decompress` | Decompress events |
| `strfry dict stats` | Show compression statistics |

---

## Performance Characteristics

### Events Per Second

strfry's write throughput depends on hardware, but typical numbers on modern server hardware:

- **Event ingestion (import):** tens of thousands of events per second via `strfry import` (batch mode with pipeline writes)
- **WebSocket ingestion:** thousands of events per second per connection, limited by signature verification (secp256k1) and write transaction serialization
- **Query throughput:** highly dependent on filter complexity and index utilization; simple ID lookups are sub-millisecond

### Memory Usage

strfry's memory footprint is largely determined by the LMDB memory map:

- The process itself uses relatively little heap memory (typically under 100 MB for relay logic)
- LMDB's memory-mapped file means the OS page cache serves as the "database cache" -- frequently accessed data stays in RAM automatically
- The `mapsize` setting reserves virtual address space but does not consume physical RAM until data is written
- Under memory pressure, the OS evicts LMDB pages like any other cached file data

### Disk Usage Patterns

- LMDB databases grow monotonically -- deleted/overwritten data creates free pages within the file but does not shrink the file
- The `strfry compact` command creates a fresh copy of the database without free pages
- Zstd dictionary compression can reduce on-disk event storage by 40-60% for text-heavy event kinds
- Index overhead is typically 30-50% of raw event data size

---

## Comparison with Other Relay Implementations

| Feature | strfry | nostr-rs-relay | nostream | khatru |
|---------|--------|----------------|----------|--------|
| Language | C++ | Rust | TypeScript | Go |
| Database | LMDB | SQLite | PostgreSQL | Varies (pluggable) |
| Negentropy sync | Native (NIP-77) | No | No | No |
| Write policy plugins | Yes (stdin/stdout) | No | No | Go middleware |
| Zero-downtime restart | Yes | No | No | No |
| WebSocket compression | Yes | Yes | Yes | Depends on impl |
| Event counts (NIP-45) | Yes | Yes | Yes | Depends on impl |
| NIP-42 AUTH | Yes | Yes | Yes | Yes |
| Hot config reload | Yes | No | No | N/A |
| Docker support | Yes | Yes | Yes | N/A |
| Memory model | Memory-mapped (LMDB) | SQLite page cache | PostgreSQL shared buffers | Varies |

**strfry vs nostr-rs-relay:** strfry offers negentropy sync and a plugin system that nostr-rs-relay lacks. nostr-rs-relay uses SQLite which is simpler to back up (single file copy while idle) but does not match LMDB's read performance under concurrent load.

**strfry vs nostream:** nostream uses PostgreSQL, which is a full-featured RDBMS with its own operational overhead. strfry's embedded LMDB approach eliminates that external dependency. nostream is written in TypeScript, making it more approachable for JavaScript developers.

**strfry vs khatru:** khatru is a Go framework for building custom relays rather than a turnkey relay. It offers maximum flexibility through Go middleware but requires writing Go code. strfry's plugin system achieves similar extensibility with any language.

---

## Who Uses strfry

strfry is deployed by many relay operators across the nostr network. Its combination of performance, negentropy sync, and operational simplicity makes it a common choice for:

- Large public relays serving thousands of concurrent users
- Relay operators running relay clusters with negentropy sync for redundancy
- Private or paid relays using write policy plugins for access control
- Archival relays that need to sync large event sets efficiently
- Relay-to-relay mirroring setups using the router feature

---

## Build Requirements and Dependencies

### Compiler

- C++20-capable compiler (GCC 10+ or Clang 13+)

### Debian/Ubuntu Dependencies

```bash
sudo apt install -y \
  git g++ make \
  libssl-dev zlib1g-dev \
  liblmdb-dev libflatbuffers-dev \
  libsecp256k1-dev libzstd-dev
```

### FreeBSD Dependencies

```bash
pkg install gcc gmake cmake git perl5 \
  openssl lmdb flatbuffers \
  libuv libinotify zstr secp256k1 zlib-ng
```

### Alpine Linux Dependencies (used in Docker)

```
linux-headers git g++ make perl pkgconfig libtool
libressl-dev zlib-dev lmdb-dev flatbuffers-dev
libsecp256k1-dev zstd-dev
```

### Build Steps

```bash
git clone https://github.com/hoytech/strfry.git
cd strfry/
git submodule update --init
make setup-golpe
make -j$(nproc)
```

### Upgrading

```bash
cd strfry/
git pull
make update-submodules
make -j$(nproc)
```

---

## Configuration File Search Path

strfry looks for its configuration file in this order:

1. Path specified by `--config` command-line flag
2. Path in `STRFRY_CONFIG` environment variable
3. `/etc/strfry.conf`
4. `./strfry.conf` (current working directory)

The minimum viable configuration requires only the `db` path to be set. All other settings have sensible defaults.
