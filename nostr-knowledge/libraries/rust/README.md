# Rust NOSTR Ecosystem

The Rust ecosystem is the most mature and comprehensive implementation of the Nostr protocol. Two primary projects serve different needs: **rust-nostr** (a full-featured SDK and protocol library) and **nostr-types** (a focused type-safety library). This document covers both, their architecture, and when to use each.

## Table of Contents

- [rust-nostr Project](#rust-nostr-project)
  - [Architecture Overview](#architecture-overview)
  - [Crate Structure](#crate-structure)
  - [Core Crates](#core-crates)
  - [Database Backends](#database-backends)
  - [Gossip Protocol](#gossip-protocol)
  - [Signer Integrations](#signer-integrations)
  - [File Storage](#file-storage)
  - [Cross-Platform FFI Bindings](#cross-platform-ffi-bindings)
- [nostr-types by mikedilger](#nostr-types-by-mikedilger)
- [Comparison: rust-nostr vs nostr-types](#comparison-rust-nostr-vs-nostr-types)
- [When to Use Which Crate](#when-to-use-which-crate)
- [Getting Started](#getting-started)

---

## rust-nostr Project

- **Repository:** <https://github.com/rust-nostr/nostr>
- **Author:** Yuki Kishimoto and Rust Nostr Developers
- **License:** MIT
- **Minimum Rust Version:** 1.85.0 (Edition 2024)
- **Status:** Alpha (functional but expect breaking API changes)
- **Docs:** <https://docs.rs/nostr-sdk>

rust-nostr is the most comprehensive Nostr implementation in any language. It provides a complete workspace of crates covering the protocol layer, a high-level client SDK, database backends, relay building, gossip protocol support, Nostr Connect (NIP-46), Nostr Wallet Connect (NIP-47), and cross-platform FFI bindings for six languages.

### Architecture Overview

The project follows a layered architecture with strict separation of concerns:

```
+-------------------------------------------------------------+
|                        nostr-sdk                             |
|  (High-level client: relay pool, subscriptions, gossip)      |
+-------------------------------------------------------------+
       |              |              |              |
+------------+ +-------------+ +------------+ +-----------+
| nostr-     | | nostr-      | | nostr-     | |   nwc     |
| connect    | | relay-      | | database   | | (NIP-47)  |
| (NIP-46)   | | builder     | | backends   | |           |
+------------+ +-------------+ +------------+ +-----------+
       |              |              |              |
+-------------------------------------------------------------+
|                         nostr                                |
|  (Protocol primitives: Event, Keys, Filter, Tags, NIPs)     |
+-------------------------------------------------------------+
       |
+-------------------------------------------------------------+
|                    secp256k1 / crypto                        |
+-------------------------------------------------------------+
```

The `nostr` crate is the foundation -- it has zero networking dependencies and can compile in `no_std` environments (embedded systems, WASM). The `nostr-sdk` crate builds on top, adding async networking, relay pool management, gossip routing, and a high-level `Client` abstraction.

### Crate Structure

The workspace is organized into several directories:

```
rust-nostr/nostr/
  crates/
    nostr/                  # Core protocol implementation
    nostr-keyring/          # Key management and storage
    nostr-relay-builder/    # Build custom relays
    nwc/                    # Nostr Wallet Connect (NIP-47)
  sdk/                      # nostr-sdk (full client SDK)
  nostr-database/           # Database trait and interface
  nostr-database-test-suite/# Shared tests for DB backends
  nostr-memory/             # In-memory database backend
  nostr-lmdb/              # LMDB database backend
  nostr-sqlite/            # SQLite database backend
  nostr-ndb/               # nostrdb (strfry) backend
  nostr-gossip/            # Gossip protocol trait
  nostr-gossip-memory/     # In-memory gossip backend
  nostr-gossip-sqlite/     # SQLite gossip backend
  nostr-gossip-test-suite/ # Shared tests for gossip backends
  nostr-connect/           # Nostr Connect (NIP-46)
  nostr-browser-signer/    # Browser signer (NIP-07)
  nostr-browser-signer-proxy/ # Native proxy for browser signers
  nostr-blossom/           # Blossom protocol integration
  nostr-http-file-storage/ # HTTP file storage (NIP-96)
```

### Core Crates

#### `nostr` -- Protocol Primitives

The foundation crate implementing the Nostr protocol with zero networking dependencies.

| Feature | Description |
|---------|-------------|
| Core types | `Event`, `EventBuilder`, `EventId`, `Keys`, `PublicKey`, `SecretKey`, `Kind`, `Tag`, `Tags`, `Filter` |
| Messages | `ClientMessage`, `RelayMessage`, `SubscriptionId` |
| Traits | `NostrSigner`, `FromBech32`, `ToBech32`, `JsonUtil` |
| NIP support | 53+ NIPs implemented via feature flags |
| `no_std` | Supports embedded environments via `alloc` feature |
| WASM | Compiles to `wasm32-unknown-unknown` and `wasm32-wasip2` |

Key feature flags:
- `std` (default) -- Standard library support
- `alloc` -- Heap allocation without std
- `rand`, `os-rng` -- Random number generation
- `nip04` -- Legacy encrypted DMs
- `nip06` -- BIP39 key derivation
- `nip44` -- Versioned encryption
- `nip46` -- Nostr Connect messages
- `nip47` -- Wallet Connect messages
- `nip49` -- Encrypted secret key export
- `nip57` -- Zaps
- `nip59` -- Gift wrap / sealed events
- `nip60` -- Cashu wallet
- `all-nips` -- Enable everything
- `pow-multi-thread` -- Multi-threaded proof-of-work mining

```toml
[dependencies]
nostr = "0.38"

# Or with specific NIPs:
nostr = { version = "0.38", features = ["nip06", "nip44", "nip59"] }
```

#### `nostr-sdk` -- Full Client SDK

A high-level async SDK built on `nostr` for building complete Nostr applications.

| Feature | Description |
|---------|-------------|
| `Client` | High-level client with relay pool, subscriptions, publishing |
| Relay pool | Automatic connection management, reconnection, load balancing |
| Subscriptions | Long-lived and short-lived subscriptions with streaming |
| Gossip | Outbox model routing (NIP-65) |
| Negentropy | Efficient set reconciliation for database sync |
| Tor | Built-in SOCKS5 proxy support for `.onion` relays |
| Monitoring | Relay health monitoring |
| Policies | Whitelist/blacklist filtering |

```toml
[dependencies]
nostr-sdk = "0.38"
tokio = { version = "1", features = ["full"] }
```

#### `nostr-relay-builder` -- Custom Relay Development

Build custom Nostr relays in Rust with pluggable storage backends.

#### `nostr-keyring` -- Key Management

Secure key storage and management utilities.

#### `nwc` -- Nostr Wallet Connect (NIP-47)

Client library for interacting with NWC-compatible Lightning wallets. Supports:
- `pay_invoice` -- Pay a BOLT11 invoice
- `make_invoice` -- Create an invoice
- `get_balance` -- Check wallet balance
- `list_transactions` -- Transaction history
- `lookup_invoice` -- Look up invoice status

```toml
[dependencies]
nwc = "0.38"
```

### Database Backends

The `NostrDatabase` trait abstracts event storage. Choose a backend based on your needs:

| Crate | Backend | Use Case |
|-------|---------|----------|
| `nostr-memory` | In-memory `HashMap` | Testing, ephemeral apps |
| `nostr-lmdb` | LMDB | High-performance embedded apps |
| `nostr-sqlite` | SQLite | Mobile apps, moderate datasets |
| `nostr-ndb` | nostrdb (strfry) | Maximum performance, C-based |

```rust
use nostr_lmdb::NostrLMDB;
use nostr_sdk::prelude::*;

let db = NostrLMDB::open("/path/to/db")?;
let client = Client::builder()
    .signer(keys)
    .database(db)
    .build();
```

### Gossip Protocol

The gossip engine implements the outbox model (NIP-65), routing events through the relays where their authors publish. The `NostrGossip` trait abstracts the relay routing table:

| Crate | Backend | Use Case |
|-------|---------|----------|
| `nostr-gossip-memory` | In-memory | Short-lived apps, testing |
| `nostr-gossip-sqlite` | SQLite | Persistent gossip state |

```rust
use nostr_gossip_memory::prelude::*;
use nostr_sdk::prelude::*;

let gossip = NostrGossipMemory::unbounded();
let client = Client::builder()
    .signer(keys)
    .gossip(gossip)
    .build();
```

### Signer Integrations

| Crate | Protocol | Description |
|-------|----------|-------------|
| `nostr-connect` | NIP-46 | Remote signing via Nostr Connect / Bunker protocol |
| `nostr-browser-signer` | NIP-07 | Browser extension signing (e.g., nos2x, Alby) |
| `nostr-browser-signer-proxy` | NIP-07 | Native app proxy bridging to browser signers |

All signers implement the `NostrSigner` trait, making them interchangeable:

```rust
use nostr_connect::prelude::*;
use nostr_sdk::prelude::*;

// Any signer works with Client
let client = Client::builder()
    .signer(my_connect_signer)  // or Keys, or BrowserSigner
    .build();
```

### File Storage

| Crate | Protocol | Description |
|-------|----------|-------------|
| `nostr-blossom` | Blossom | Content-addressed blob storage |
| `nostr-http-file-storage` | NIP-96 | HTTP-based file upload/download |

### Cross-Platform FFI Bindings

rust-nostr provides FFI bindings for six languages, all generated from the same Rust core. These live in separate repositories within the `rust-nostr` GitHub organization:

| Language | Package | Repository |
|----------|---------|------------|
| **Python** | `nostr-sdk` (PyPI) | `rust-nostr/nostr-sdk-python` |
| **Kotlin/JVM** | `nostr-sdk` (Maven) | `rust-nostr/nostr-sdk-kotlin` |
| **Swift** | `NostrSDK` (SPM) | `rust-nostr/nostr-sdk-swift` |
| **JavaScript** | `@rust-nostr/nostr-sdk` (npm) | `rust-nostr/nostr-sdk-js` |
| **C# / .NET** | `NostrSdk` (NuGet) | `rust-nostr/nostr-sdk-csharp` |
| **Flutter/Dart** | `nostr_sdk` (pub.dev) | `rust-nostr/nostr-sdk-flutter` |

All bindings expose the same API surface as the Rust SDK, adjusted for language idioms. Python example:

```python
from nostr_sdk import Keys, Client, EventBuilder

keys = Keys.parse("nsec1...")
client = Client(keys)
client.add_relay("wss://relay.damus.io")
client.connect()

builder = EventBuilder.text_note("Hello from Python!")
client.send_event_builder(builder)
```

---

## nostr-types by mikedilger

- **Repository:** <https://github.com/mikedilger/nostr-types>
- **Author:** Mike Dilger (creator of the Gossip client)
- **License:** MIT
- **Crate:** `nostr-types` on crates.io

`nostr-types` is a focused Rust crate that provides strongly-typed wrappers around Nostr protocol primitives. Rather than passing around raw `i64` timestamps or `&str` keys, every value gets its own semantic type.

### Key Design Principles

1. **Type safety over convenience** -- An `i64` may or may not be a Unix timestamp; a `Unixtime` always is.
2. **Security-aware key handling** -- Private keys track their security level (`Medium` when generated, `Weak` if exposed/imported). Password-encrypted import/export preserves security level.
3. **Comprehensive serde** -- Extensive custom serialization for complex types like `Tag` that do not map cleanly to standard serde patterns.
4. **Protocol fidelity** -- Types map 1:1 to the Nostr protocol specification.

### Primary Use Case

`nostr-types` is the type system behind the **Gossip** Nostr client (`github.com/mikedilger/gossip`). If you are building on or extending Gossip, use `nostr-types`. If you are building a new application from scratch, `rust-nostr` is the more complete choice.

---

## Comparison: rust-nostr vs nostr-types

| Aspect | rust-nostr (`nostr` + `nostr-sdk`) | nostr-types |
|--------|-------------------------------------|-------------|
| **Scope** | Full SDK: protocol, networking, relay pool, database, FFI | Protocol types only |
| **NIP coverage** | 53+ NIPs with feature flags | Core NIPs for Gossip client |
| **Networking** | Full async client with relay pool, gossip routing | None (types only) |
| **Database** | Pluggable backends (LMDB, SQLite, memory, nostrdb) | None |
| **FFI bindings** | Python, Kotlin, Swift, JS, C#, Flutter | None |
| **`no_std`** | Yes (core `nostr` crate) | No |
| **WASM** | Yes | No |
| **Key security tracking** | Standard key handling | Security-level-aware keys |
| **Serde** | Standard derive-based | Extensive custom implementations |
| **Async runtime** | tokio | N/A |
| **Primary consumer** | General-purpose Nostr apps | Gossip client |
| **Community size** | Larger (multi-language ecosystem) | Smaller (Gossip-focused) |
| **API stability** | Alpha (breaking changes expected) | More stable |

---

## When to Use Which Crate

### Use `nostr-sdk` (rust-nostr) when:

- Building a **complete Nostr application** (client, bot, relay, service)
- You need **relay connection management** and subscription handling
- You want **cross-platform support** (mobile via FFI, WASM for web)
- You need **database persistence** for events
- You want the **outbox/gossip model** (NIP-65)
- You need **Nostr Connect** (NIP-46) or **NWC** (NIP-47)
- You are building in **Python, Kotlin, Swift, JS, C#, or Flutter** via FFI

### Use `nostr` (rust-nostr, protocol crate only) when:

- Building a **custom relay** or **protocol-level tooling**
- You need **`no_std`** support for embedded systems
- You want **just the types and event building** without networking overhead
- You are integrating Nostr into an existing application with its own networking stack

### Use `nostr-types` when:

- Building on or extending the **Gossip client**
- You want **maximum type safety** with security-aware key handling
- You need **custom serde** for protocol types
- You prefer a **smaller, focused** dependency

---

## Getting Started

Add to your `Cargo.toml`:

```toml
[dependencies]
nostr-sdk = "0.38"
tokio = { version = "1", features = ["full"] }
```

Minimal example:

```rust
use nostr_sdk::prelude::*;

#[tokio::main]
async fn main() -> Result<()> {
    // Generate or parse keys
    let keys = Keys::generate();
    // let keys = Keys::parse("nsec1...")?;

    // Build client with signer
    let client = Client::builder().signer(keys).build();

    // Add relays and connect
    client.add_relay("wss://relay.damus.io").await?;
    client.connect().await;

    // Publish a text note
    let builder = EventBuilder::text_note("Hello, Nostr!");
    client.send_event_builder(builder).await?;

    Ok(())
}
```

See [nostr-sdk.md](./nostr-sdk.md) for the full SDK deep dive, [api-reference.md](./api-reference.md) for the API reference, and [examples/basic_usage.rs](./examples/basic_usage.rs) for a complete working example.
