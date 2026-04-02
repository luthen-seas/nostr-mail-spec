# Nostr Relay Implementations Catalog

> Comprehensive catalog of all known Nostr relay implementations, organized by language.

---

## Rust

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **nostr-rs-relay** | [sr.ht/~gheartsfield/nostr-rs-relay](https://sr.ht/~gheartsfield/nostr-rs-relay) | SQLite | Minimalistic, low resource usage, one of the earliest relays. NIP-42 AUTH. | Stable |
| **rnostr** | [rnostr/rnostr](https://github.com/rnostr/rnostr) | RocksDB | High-performance focus, LSM-tree storage for write throughput. | Active |
| **Chorus** | [mikedilger/chorus](https://github.com/mikedilger/chorus) | LMDB | Personal/community relay with fine-grained access control. By Gossip author. | Active |
| **sostr** | [metasikander/s0str](https://github.com/metasikander/s0str) | -- | Private relay implementation. | Maintenance |

## C++

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **strfry** | [hoytech/strfry](https://github.com/hoytech/strfry) | LMDB | Most widely deployed relay. Negentropy sync, write policy plugins, high performance. | Active |
| **cagliostr** | [mattn/cagliostr](https://github.com/mattn/cagliostr) | -- | Speed-focused experimental relay. | Experimental |
| **nostr_client_relay** | [pedro-vicente/nostr_client_relay](https://github.com/pedro-vicente/nostr_client_relay) | -- | C++ engine for building Nostr applications. | Experimental |

## Go

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **khatru** | [fiatjaf/khatru](https://github.com/fiatjaf/khatru) | Pluggable | THE framework for building custom relays. Powers many specialized relays. | Active |
| **HAVEN** | [bitvora/haven](https://github.com/bitvora/haven) | BadgerDB/LMDB | 4-in-1 relay (private, chat, inbox, outbox) + Blossom media server. WoT filtering. | Stable |
| **WoT relay** | [bitvora/wot-relay](https://github.com/bitvora/wot-relay) | -- | Web-of-trust filtered relay. Only accepts notes from trusted pubkeys. | Active |
| **grain** | [0ceanslim/grain](https://github.com/0ceanslim/grain) | MongoDB | Highly configurable multipurpose relay. Flexible policy engine. | Active |
| **Immortal** | [dezh-tech/immortal](https://github.com/dezh-tech/immortal) | -- | Designed for scale and high-load production environments. | Active |
| **relayer** | [fiatjaf/relayer](https://github.com/fiatjaf/relayer) | Pluggable | Server framework for custom relays (predecessor to khatru). | Maintenance |
| **gnost-relay** | [barkyq/gnost-relay](https://github.com/barkyq/gnost-relay) | -- | Go relay implementation. | Maintenance |
| **ORLY** | [next.orly.dev](https://next.orly.dev) | -- | Fast Go relay. | Active |
| **nostr-relay** | [mattn/nostr-relay](https://github.com/mattn/nostr-relay) | -- | Simple Go relay. | Maintenance |
| **rely** | [pippellia-btc/rely](https://github.com/pippellia-btc/rely) | -- | Go framework for custom relays. | Early |
| **Bostr2** | [Yonle/bostr2](https://github.com/Yonle/bostr2) | -- | Bouncer relay aggregator in Go. | Active |
| **tandem** | [TheRebelOfBabylon/tandem](https://github.com/TheRebelOfBabylon/tandem) | -- | Community-focused relay. | Early |
| **SW2** | [bitvora/sw2](https://github.com/bitvora/sw2) | -- | Relay with read/write whitelisting. | Active |
| **Shugur** | [Shugur-Network/relay](https://github.com/Shugur-Network/relay) | -- | High-performance relay. | Early |

## TypeScript / JavaScript

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **nostream** | [Cameri/nostream](https://github.com/Cameri/nostream) | PostgreSQL | Feature-rich, Lightning payment integration, Redis caching. Formerly nostr-ts-relay. | Stable |
| **nostr-relay-nestjs** | [CodyTseng/nostr-relay-nestjs](https://github.com/CodyTseng/nostr-relay-nestjs) | Multiple | Clean NestJS architecture, pluggable storage backends. | Active |
| **Nosflare** | [Spl0itable/nosflare](https://github.com/Spl0itable/nosflare) | Cloudflare DO | Serverless relay on Cloudflare Workers. Zero infrastructure. | Active |
| **Bostr** | [Yonle/bostr](https://github.com/Yonle/bostr) | -- | Bouncer relay aggregator in Node.js. | Active |
| **zooid** | [coracle-social/zooid](https://github.com/coracle-social/zooid) | -- | Multi-tenant relay for communities. | Active |
| **nostring** | [xbol0/nostring](https://github.com/xbol0/nostring) | -- | Relay written in Deno. | Experimental |
| **Bucket** | [coracle-social/bucket](https://github.com/coracle-social/bucket) | In-memory | In-memory relay for testing and development. | Active |

## Python

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **Nostpy** | [UTXOnly/nost-py](https://github.com/UTXOnly/nost-py) | -- | Easy to deploy and audit. Good for learning relay internals. | Active |
| **PyRelay** | [johnny423/pyrelay](https://github.com/johnny423/pyrelay) | -- | Python relay implementation. | Maintenance |
| **nostr_relay** | [pobblelabs/nostr_relay](https://code.pobblelabs.org/fossil/nostr_relay) | -- | Python relay. | Maintenance |

## Java

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **SuperConductor** | [avlo/superconductor](https://github.com/avlo/superconductor) | -- | Spring Boot relay framework. Full Java ecosystem integration. | Active |

## Kotlin

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **Citrine** | [greenart7c3/Citrine](https://github.com/greenart7c3/Citrine) | -- | Nostr relay that runs on Android devices. Local mobile relay. | Active |
| **Fenrir-s** | [rushmi0/Fenrir-s](https://github.com/rushmi0/Fenrir-s) | -- | Kotlin relay implementation. | Early |
| **knostr** | [lpicanco/knostr](https://github.com/lpicanco/knostr) | PostgreSQL | Kotlin relay with PostgreSQL backend. | Maintenance |

## C# / .NET

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **netstr** | [bezysoftware/netstr](https://github.com/bezysoftware/netstr) | -- | General purpose .NET relay. | Active |
| **NNostr** | [Kukks/NNostr](https://github.com/Kukks/NNostr) | -- | .NET relay and client library. | Maintenance |

## Elixir

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **Nex** | [lebrunel/nex](https://github.com/lebrunel/nex) | PostgreSQL | Scalable relay leveraging OTP concurrency model. | Active |
| **Astro** | [Nostrology/astro](https://github.com/Nostrology/astro) | -- | Elixir-based relay. | Experimental |

## PHP

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **Transpher** | [nostriphant/transpher](https://github.com/nostriphant/transpher) | -- | Experimental PHP relay. Runs in standard web hosting environments. | Experimental |

## F#

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **Nostra** | [lontivero/Nostra](https://github.com/lontivero/Nostra) | SQLite | F# relay implementation. | Maintenance |

## Clojure

| Name | URL | Storage | Key Features | Status |
|------|-----|---------|-------------|--------|
| **me.untethr.nostr-relay** | [atdixon/me.untethr.nostr-relay](https://github.com/atdixon/me.untethr.nostr-relay) | -- | Clojure relay implementation. | Maintenance |

---

## Specialized / Proxy Relays

These are not general-purpose relays but serve specific functions:

| Name | URL | Language | Purpose |
|------|-----|----------|---------|
| **blastr** | [MutinyWallet/blastr](https://github.com/MutinyWallet/blastr) | Rust | Cloudflare Workers proxy that broadcasts events to other relays |
| **broadcastr** | [codonaft/broadcastr](https://github.com/codonaft/broadcastr) | -- | Relay that retransmits to other relays |
| **multiplextr** | [coracle-social/multiplextr](https://github.com/coracle-social/multiplextr) | TypeScript | Custom relay for bandwidth savings |
| **nostr-filter-relay** | [atrifat/nostr-filter-relay](https://github.com/atrifat/nostr-filter-relay) | TypeScript | AI-powered content filtering by type and language |
| **Ephemerelay** | [soapbox-pub/ephemerelay](https://gitlab.com/soapbox-pub/ephemerelay) | -- | In-memory relay with no persistent storage |
| **Nerostr** | [pluja/nerostr](https://codeberg.org/pluja/nerostr) | -- | Expensive relay paid with Monero |
| **cfrelay** | [haorendashu/cfrelay](https://github.com/haorendashu/cfrelay) | TypeScript | Personal relay on Cloudflare Workers |
| **NIP-29 Groups Relay** | [max21dev/groups-relay](https://github.com/max21dev/groups-relay) | TypeScript | Group chat relay based on khatru |
| **groups_relay** | [verse-pbc/groups_relay](https://github.com/verse-pbc/groups_relay) | -- | NIP-29 group relay implementation |
| **swarm** | [HiveTalk/swarm](https://github.com/HiveTalk/swarm) | -- | Team relay with additional controls |
| **noshtastic** | [ksedgwic/noshtastic](https://github.com/ksedgwic/noshtastic) | -- | Geo-specific virtual relay |
| **keychat-relay-ext** | [keychat-io/keychat-relay-ext](https://github.com/keychat-io/keychat-relay-ext) | -- | Cashu ecash payments per message |

---

## Summary by Language

| Language | Count | Notable |
|----------|-------|---------|
| Go | 14 | khatru (framework), HAVEN, grain, WoT relay |
| TypeScript/JS | 7 | nostream, Nosflare, nostr-relay-nestjs |
| Rust | 4 | nostr-rs-relay, rnostr, Chorus |
| C++ | 3 | strfry (most deployed) |
| Kotlin | 3 | Citrine (Android relay) |
| Python | 3 | Nostpy |
| C#/.NET | 2 | netstr |
| Elixir | 2 | Nex |
| Java | 1 | SuperConductor |
| PHP | 1 | Transpher |
| F# | 1 | Nostra |
| Clojure | 1 | me.untethr.nostr-relay |

---

## See Also

- [Relay overview](../README.md)
- [nostream deep dive](../nostream/README.md)
- [nostr-rs-relay deep dive](../nostr-rs-relay/README.md)
- [HAVEN deep dive](haven.md)
