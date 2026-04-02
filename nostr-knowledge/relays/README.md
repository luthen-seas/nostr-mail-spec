# Nostr Relays

> Overview of the relay landscape: what relays are, how they work, major implementations, and architecture patterns.

---

## What Is a Relay

A relay is a server that receives, stores, and forwards Nostr events. It speaks the Nostr protocol over WebSockets: clients connect, publish events (signed JSON objects), and subscribe to events matching filters. Relays are the infrastructure layer of Nostr -- they are to Nostr what servers are to email, except that:

- **Anyone can run a relay.** There is no permission required, no federation protocol, no domain registration authority.
- **Clients connect to multiple relays.** Users are not locked to one provider; their data exists across many relays simultaneously.
- **Relays do not talk to each other by default.** (Some implementations add relay-to-relay sync, but the protocol does not require it.)
- **Relays can choose what to store.** They can accept everything, filter by pubkey, require payment, enforce proof-of-work, or apply any custom policy.

The protocol itself is defined in [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md). Relay-specific behavior is governed by NIPs like NIP-11 (relay information), NIP-42 (authentication), NIP-65 (relay lists), and others.

---

## Categories of Relays

### Public Relays
Open to all. Accept events from any pubkey. These are the backbone of the network but face spam and storage challenges. Examples: relay.damus.io, nos.lol, relay.nostr.band.

### Paid Relays
Require payment (usually via Lightning) before accepting events. Payment acts as a spam filter and funds relay operation. Nostream pioneered relay payment integration.

### Private / Personal Relays
Run by an individual for their own use. Only the owner (and optionally whitelisted pubkeys) can write. HAVEN and Chorus are built for this use case.

### Community Relays
Serve a specific group or topic. May use invite codes, web-of-trust filtering, or manual approval. Khatru-based relays and NIP-29 group relays fit here.

### Web-of-Trust (WoT) Relays
Automatically accept or reject events based on the social graph. If you are N hops from a trusted pubkey, you can write. The wot-relay project implements this pattern.

### Specialty Relays
Serve a narrow function: broadcasting to other relays (blastr), content filtering (nostr-filter-relay), in-memory ephemeral storage (Ephemerelay), geo-specific content (noshtastic), or NIP-29 group chat.

---

## Major Implementations by Language

### Rust
| Name | Storage | Notes |
|------|---------|-------|
| [nostr-rs-relay](nostr-rs-relay/README.md) | SQLite | One of the earliest; minimalistic and stable |
| [rnostr](https://github.com/rnostr/rnostr) | RocksDB | High performance focus |
| [Chorus](https://github.com/mikedilger/chorus) | LMDB | Personal/community relay with access control (by Gossip author) |
| [sostr](https://github.com/metasikander/s0str) | -- | Private relay |

### C++
| Name | Storage | Notes |
|------|---------|-------|
| [strfry](https://github.com/hoytech/strfry) | LMDB | Most widely deployed relay; negentropy sync support |
| [cagliostr](https://github.com/mattn/cagliostr) | -- | Speed-focused experimental relay |

### Go
| Name | Storage | Notes |
|------|---------|-------|
| [khatru](https://github.com/fiatjaf/khatru) | Pluggable | THE framework for building custom relays |
| [HAVEN](others/haven.md) | BadgerDB/LMDB | 4-in-1 relay + Blossom media server |
| [wot-relay](https://github.com/bitvora/wot-relay) | -- | Web-of-trust filtering |
| [grain](https://github.com/0ceanslim/grain) | MongoDB | Highly configurable policy engine |
| [Immortal](https://github.com/dezh-tech/immortal) | -- | Built for high-load production |
| [relayer](https://github.com/fiatjaf/relayer) | Pluggable | Predecessor to khatru |

### TypeScript / JavaScript
| Name | Storage | Notes |
|------|---------|-------|
| [nostream](nostream/README.md) | PostgreSQL | Feature-rich; payment integration |
| [nostr-relay-nestjs](https://github.com/CodyTseng/nostr-relay-nestjs) | Multiple | Clean NestJS architecture |
| [Nosflare](https://github.com/Spl0itable/nosflare) | Cloudflare DO | Serverless on Cloudflare Workers |
| [Bostr](https://github.com/Yonle/bostr) | -- | Bouncer relay aggregator |

### Other Languages
| Name | Language | Storage | Notes |
|------|----------|---------|-------|
| [netstr](https://github.com/bezysoftware/netstr) | C# | -- | .NET relay |
| [Nex](https://github.com/lebrunel/nex) | Elixir | PostgreSQL | OTP concurrency |
| [SuperConductor](https://github.com/avlo/superconductor) | Java | -- | Spring Boot framework |
| [Citrine](https://github.com/greenart7c3/Citrine) | Kotlin | -- | Runs on Android devices |
| [knostr](https://github.com/lpicanco/knostr) | Kotlin | PostgreSQL | Kotlin relay |
| [Transpher](https://github.com/nostriphant/transpher) | PHP | -- | Experimental |
| [Nostra](https://github.com/lontivero/Nostra) | F# | SQLite | F# relay |
| [Nostpy](https://github.com/UTXOnly/nost-py) | Python | -- | Easy to audit |

See [Full Relay Catalog](others/catalog.md) for comprehensive listings.

---

## Architecture Patterns

### Single-Process Relay
Most relay implementations are single-process: one binary handles WebSocket connections, event validation, storage, and subscription matching. This is the simplest model and works well for personal and medium-traffic relays. Examples: nostr-rs-relay, Chorus, HAVEN.

### Framework-Based / Pluggable Relay
Khatru and relayer provide a framework where you implement storage and policy hooks. The framework handles WebSocket protocol, subscription management, and event validation. This is the dominant pattern for building specialized relays (WoT filtering, group chat, etc.).

### Serverless / Edge Relay
Nosflare runs on Cloudflare Workers with Durable Objects for state. Zero infrastructure management, but limited by the edge platform's constraints.

### Storage Engines

| Engine | Used By | Trade-offs |
|--------|---------|------------|
| **LMDB** | strfry, Chorus, HAVEN (optional) | Memory-mapped, crash-safe, excellent read performance. Single-writer. |
| **SQLite** | nostr-rs-relay | Universal, simple, well-understood. WAL mode needed for concurrent reads. |
| **PostgreSQL** | nostream, Nex, knostr | Full RDBMS features, complex queries, proven at scale. Operational overhead. |
| **RocksDB** | rnostr | LSM-tree, excellent write throughput. More complex to tune. |
| **BadgerDB** | HAVEN (default) | Go-native LSM, good for embedded use. |
| **MongoDB** | grain | Document store, flexible schema. Higher resource usage. |
| **Cloudflare DO** | Nosflare | Managed state, global distribution. Vendor lock-in. |

### Indexing Strategies
Relays must efficiently match incoming subscriptions against stored events. Common approaches:
- **Tag indexes**: Secondary indexes on event tags (e, p, t, etc.) for filter matching.
- **Kind indexes**: Separate indexes per event kind for fast kind-based queries.
- **Created_at indexes**: Time-based ordering for chronological feeds.
- **Composite filters**: Combining multiple filter fields requires careful index design to avoid full scans.

strfry's LMDB approach uses custom B-tree indexes. PostgreSQL relays leverage standard SQL indexes. The choice of indexing strategy is often the biggest factor in relay query performance.

---

## Performance Considerations

- **Connection count**: A popular public relay may handle tens of thousands of concurrent WebSocket connections. Tokio (Rust), Go goroutines, and Node.js event loops each handle this differently.
- **Event throughput**: Write-heavy relays need efficient storage writes. LMDB and RocksDB excel here; SQLite in WAL mode is adequate for moderate loads.
- **Subscription matching**: Each incoming event must be checked against all active subscriptions. Naive implementations are O(subscriptions * filters); production relays use prefix trees or hash-based matching.
- **Negentropy sync**: strfry pioneered relay-to-relay synchronization using the negentropy protocol. This enables efficient diffing of event sets between relays without transferring all events.
- **Memory**: LMDB-based relays can have large virtual memory usage (the entire database is memory-mapped) but actual RSS depends on OS page cache behavior.

---

## Deep-Dive Documentation

- [nostream (TypeScript/PostgreSQL)](nostream/README.md)
- [nostr-rs-relay (Rust/SQLite)](nostr-rs-relay/README.md)
- [HAVEN (Go, 4-in-1)](others/haven.md)
- [Full relay catalog](others/catalog.md)
- [strfry](strfry/) -- (see strfry directory)
- [khatru](khatru/) -- (see khatru directory)

---

## Running Your Own Relay

The simplest path to running a personal relay:

1. **Easiest**: HAVEN -- single binary, embedded database, serves as personal inbox/outbox/chat/private relay.
2. **Simplest code**: nostr-rs-relay -- single Rust binary, SQLite, minimal configuration.
3. **Most deployed**: strfry -- battle-tested at scale, LMDB storage, negentropy sync.
4. **Most customizable**: khatru framework -- write Go hooks for any custom behavior.
5. **Zero infrastructure**: Nosflare -- deploy to Cloudflare Workers.

See the [relay catalog](others/catalog.md) for the complete list of options.
