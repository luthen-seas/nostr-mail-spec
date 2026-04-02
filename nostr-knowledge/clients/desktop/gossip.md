# Gossip Desktop Client

> Deep-dive technical documentation for [Gossip](https://github.com/mikedilger/gossip), the Rust desktop Nostr client that pioneered the outbox relay model.

---

## What Is Gossip

Gossip is a native desktop Nostr client written entirely in Rust. It was created by Mike Dilger and is distinguished by its relay-aware "gossip model" design -- it dynamically connects to the relays where the people you follow actually publish, rather than relying on a fixed relay list. This makes it a reference implementation for NIP-65 (relay list metadata) and a proving ground for relay-intelligent client behavior.

Gossip deliberately avoids web technologies. There is no embedded browser, no JavaScript, no HTML rendering, and no CSS. This reduces the attack surface and keeps the client lean.

---

## Architecture

### Core Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | Rust | Memory safety, performance, no GC pauses |
| UI | egui (via eframe) | Immediate-mode native GUI |
| Storage | LMDB | Lightning Memory-Mapped Database for event persistence |
| Networking | Tungstenite + Tokio | Async WebSocket connections to relays |
| Serialization | Serde + Speedy | Fast event serialization and deserialization |
| Nostr types | nostr-types (own crate) | Core Nostr protocol types maintained by the same author |

### Crate Structure

Gossip is split into multiple crates for modularity:

- **gossip-lib** -- Core library containing the relay model logic, event processing, storage, and subscription management. This is the "engine" that any UI can build on.
- **gossip-bin** -- The main binary that combines gossip-lib with the egui interface.
- **gossip-cache** -- Caching layer for performance optimization.
- **nostr-types** -- Standalone crate (separate repo at [mikedilger/nostr-types](https://github.com/mikedilger/nostr-types)) providing Rust type definitions for Nostr events, filters, keys, and protocol primitives. Used by both Gossip and Chorus relay.

This split means alternative frontends (GTK, TUI, etc.) can reuse gossip-lib without any egui dependency.

### Data Flow

```
User action
  -> egui renders immediate-mode UI
  -> gossip-lib processes command
  -> Subscription manager determines which relays to contact (NIP-65 lookup)
  -> Tungstenite WebSocket sends REQ/EVENT to selected relays
  -> Incoming events are verified, deduplicated, stored in LMDB
  -> UI re-renders with new data
```

---

## The Outbox (Gossip) Model

This is Gossip's defining contribution to the Nostr ecosystem. Most early clients connected to a handful of hardcoded relays and hoped to find content there. Gossip takes a fundamentally different approach:

### How It Works

1. **NIP-65 relay lists**: Each Nostr user publishes a kind-10002 event listing the relays they read from and write to.
2. **Relay selection**: When you follow someone, Gossip reads their NIP-65 list and connects to the relays they write to. It does this for every person you follow.
3. **Minimum relay coverage**: Gossip finds the minimal set of relays needed to cover all followed pubkeys. If relay A carries authors X, Y, and Z while relay B only carries Z, Gossip may skip B entirely.
4. **Dynamic adjustment**: When a relay disconnects or becomes slow, Gossip re-routes to alternative relays from the same author's relay list.
5. **Relationship-based routing**: The choice of which relay to use for reading or writing is informed by the social graph, not by a static configuration.

### Why This Matters

- **Decentralization**: No single relay becomes a chokepoint. Content flows through the relays authors actually use.
- **Resilience**: If a relay goes down, the client adapts automatically.
- **Efficiency**: Fewer connections needed because relay selection is optimized per-author.
- **Privacy**: You are not announcing your full follow list to any single relay; subscriptions are spread across many relays.

### Impact on the Ecosystem

Gossip's model (often called the "outbox model") influenced NIP-65 adoption across the ecosystem. Coracle (web client) independently developed similar ideas, and today most serious clients implement some form of relay-aware fetching. The term "gossip model" is sometimes used interchangeably with "outbox model" in the community.

---

## LMDB Storage

Gossip uses LMDB (Lightning Memory-Mapped Database) rather than SQLite, PostgreSQL, or a custom file format. Key properties:

- **Memory-mapped**: The OS manages page caching; reads are essentially pointer dereferences into mapped memory. Zero-copy reads.
- **Crash-safe**: LMDB uses copy-on-write B+ trees. A power failure mid-write does not corrupt the database.
- **Single-writer / multiple-reader**: Perfect for the Gossip use case where one thread writes events while the UI thread reads.
- **No WAL tuning**: Unlike SQLite, LMDB does not require write-ahead log configuration.
- **Fast startup**: No recovery or replay needed after crash.

LMDB is also used by strfry (one of the most deployed relays), so Gossip's choice aligns with a proven storage pattern in the Nostr ecosystem.

---

## Key Security and Privacy

### Key Storage
- Private keys are encrypted on disk using a user-provided passphrase.
- Passphrase is required at startup to decrypt the key.
- Memory containing key material is zeroed before deallocation to prevent leakage.

### Privacy Controls
- **Tor support**: Can route all relay connections through Tor. Handles .onion addresses natively with proper TLS certificate validation.
- **Image loading**: Can be disabled entirely to prevent IP leaks through image URLs.
- **Follow list visibility**: User controls whether their follow list is broadcast publicly or kept private.
- **Ephemeral global feed**: The global feed does not persist events to disk, reducing local data exposure.

### No Web Stack
By avoiding embedded web views (Electron, WebView, etc.), Gossip eliminates an entire class of vulnerabilities: XSS, CSRF, malicious HTML in notes, tracking pixels, and JavaScript-based attacks.

---

## NIP Support

Gossip implements NIPs relevant to a desktop client experience. Key supported NIPs include:

| NIP | Name | Notes |
|-----|------|-------|
| NIP-01 | Basic protocol | Core event handling and relay communication |
| NIP-02 | Follow lists | Contact list management |
| NIP-05 | DNS-based identity | Verification display |
| NIP-09 | Event deletion | Delete request handling |
| NIP-10 | Text note replies | Thread structure |
| NIP-11 | Relay information | Relay capability discovery |
| NIP-13 | Proof of Work | PoW on published events |
| NIP-19 | bech32 entities | npub, nsec, note, nprofile, nevent encoding |
| NIP-25 | Reactions | Like/reaction support |
| NIP-36 | Sensitive content | Content warning display |
| NIP-40 | Expiration | Event expiration handling |
| NIP-42 | Authentication | Relay AUTH challenge-response |
| NIP-44 | Encrypted messaging | Versioned encryption |
| NIP-46 | Remote signing | Nostr Connect support |
| NIP-65 | Relay list metadata | **Core to the gossip model** -- this is the foundation |

The full and current NIP support list is maintained in the project repository.

---

## Configuration

Gossip exposes 70+ user-configurable settings through its UI, including:

- **Relay management**: Add/remove relays, set per-relay read/write preferences, configure connection limits.
- **Spam filtering**: Custom filter scripts using the Rhai scripting language. An example filter is provided at `filter.example.rhai`.
- **SpamSafe relays**: Designate specific relays as "spam safe" (trusted to have good moderation).
- **Content display**: Avatar loading, image proxying, media rendering preferences.
- **Network**: Tor proxy configuration, connection timeouts, maximum concurrent connections.
- **Feed behavior**: Thread depth, reply threading mode, mute list management, DM preferences.

---

## How Gossip Builds Timelines Differently

Traditional clients:
```
Connect to relay A, B, C (user-configured)
Send REQ with filter for followed pubkeys to all three
Merge results into timeline
```

Gossip:
```
For each followed pubkey:
  Look up their NIP-65 relay list
  Determine their preferred write relays

Compute minimum relay set covering all followed pubkeys
Connect only to those relays

For each relay in the set:
  Send REQ with filter for only the pubkeys known to write there

Merge results into timeline
Dynamically adjust if relays become unavailable
```

This means:
- Gossip may connect to 20+ relays if you follow diverse authors, but each connection carries a targeted subscription.
- A user on relay X only triggers a connection to relay X, not to your entire relay list.
- Timeline construction is relay-topology-aware.

---

## Content Moderation

- **Mute lists**: Shared across NIP-51-compatible clients.
- **Thread dismissal**: Hide entire threads.
- **Content warnings**: NIP-36 support with configurable display behavior.
- **Rhai scripting**: Write custom filter logic that evaluates incoming events. This is more powerful than simple keyword blocking -- you can filter by relay, pubkey patterns, content heuristics, or any combination.
- **User-defined lists**: Curate custom feeds beyond the default follow-based timeline.

---

## Key Technical Patterns Worth Studying

1. **NIP-65 relay selection algorithm**: The code that computes the minimum relay set for a follow list is a practical implementation of set-cover optimization. Study `gossip-lib` for this logic.

2. **Immediate-mode GUI with egui**: Gossip demonstrates how to build a complex, stateful application with an immediate-mode rendering model. The UI redraws every frame but remains efficient through egui's built-in change detection.

3. **LMDB in a Rust desktop app**: The integration patterns (opening environments, managing transactions, handling serialization into LMDB values) are reusable for any Rust application needing embedded key-value storage.

4. **Crate separation for UI independence**: The gossip-lib / gossip-bin split is a clean pattern for making business logic testable and reusable across different frontends.

5. **Encrypted key storage with memory zeroing**: The key management code demonstrates defense-in-depth practices: encryption at rest, passphrase-gated access, and zeroize-on-drop for sensitive memory.

6. **Custom spam filtering via embedded scripting**: The Rhai integration shows how to give users programmable control without exposing the full application runtime.

---

## Building from Source

Gossip is a standard Rust project:

```bash
git clone https://github.com/mikedilger/gossip
cd gossip
cargo build --release
```

The binary lands in `target/release/gossip`. LMDB is compiled in as a dependency -- no external database server is needed.

Platform support: Linux, macOS, Windows. Pre-built binaries are available for releases.

---

## Related Projects by the Same Author

- **[Chorus](https://github.com/mikedilger/chorus)** -- Personal/community Nostr relay with fine-grained access control, also written in Rust.
- **[nostr-types](https://github.com/mikedilger/nostr-types)** -- The Rust type library used by both Gossip and Chorus.

---

## Links

- Repository: https://github.com/mikedilger/gossip
- Author: Mike Dilger
- License: MIT
- Language: Rust
- See also: [Desktop client catalog](catalog.md)
