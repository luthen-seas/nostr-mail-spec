# Go NOSTR Ecosystem

The Go ecosystem for Nostr is one of the most mature, anchored by libraries written and maintained by fiatjaf (the creator of Nostr). Go's concurrency primitives -- goroutines, channels, and context -- make it a natural fit for the protocol's real-time, multi-relay architecture.

## Libraries at a Glance

| Library | Import Path | Purpose | Status |
|---------|-------------|---------|--------|
| **go-nostr** (original) | `github.com/nbd-wtf/go-nostr` | Client library: events, keys, relay connections, NIP helpers | Maintenance mode (v0.52.x) |
| **nostr** (rewrite) | `fiatjaf.com/nostr` | Next-gen client library: same scope, improved API | Active development (pre-v1) |
| **khatru** (original) | `github.com/fiatjaf/khatru` | Relay framework with pluggable storage and policies | Archived (Jan 2026) |
| **khatru** (rewrite) | `fiatjaf.com/nostr/khatru` | Relay framework (part of the new nostr module) | Active development |
| **relayer** | `github.com/fiatjaf/relayer` | Original relay framework | Superseded by khatru |

---

## go-nostr (`github.com/nbd-wtf/go-nostr`)

The original and most widely-used Go library for building Nostr clients. It provides everything needed to generate keys, create/sign events, connect to relays, subscribe to event streams, and work with dozens of NIPs.

```bash
go get github.com/nbd-wtf/go-nostr
```

### Core Types

- **`Event`** -- The fundamental Nostr data structure (ID, PubKey, CreatedAt, Kind, Tags, Content, Sig).
- **`Filter`** -- Query specification for subscriptions (IDs, Kinds, Authors, Tags, Since, Until, Limit, Search).
- **`Relay`** -- A single WebSocket connection to a relay with methods for Subscribe, Publish, Auth, and QuerySync.
- **`SimplePool`** -- Connection pool managing multiple relays with batched operations (SubscribeMany, FetchMany, PublishMany, CountMany).
- **`Tag` / `Tags`** -- String-array tag types with rich query methods (Find, FindAll, FindWithValue, GetD).
- **`Subscription`** -- An active subscription that delivers events through a channel.

### NIP Sub-Packages

| Package | NIP | Functionality |
|---------|-----|---------------|
| `nip04` | NIP-04 | Legacy encrypted direct messages (deprecated, use NIP-44) |
| `nip05` | NIP-05 | DNS-based identity verification (`user@domain.com`) |
| `nip13` | NIP-13 | Proof of work for events |
| `nip19` | NIP-19 | Bech32 encoding: `nsec`, `npub`, `note`, `nprofile`, `nevent`, `naddr` |
| `nip42` | NIP-42 | Relay authentication (AUTH) |
| `nip44` | NIP-44 | Modern encrypted direct messages (audited, replaces NIP-04) |
| `nip46` | NIP-46 | Nostr Connect / remote signing |
| `nip57` | NIP-57 | Lightning Zaps |
| `nip77` | NIP-77 | Negentropy sync protocol |
| `sdk`   | --  | High-level SDK with caching and outbox model |

### Status

In maintenance mode as of late 2024. Bug fixes are accepted, but new features go into the rewrite. If you are starting a new project, consider `fiatjaf.com/nostr` instead. For existing projects, `nbd-wtf/go-nostr` remains stable and widely depended upon (138+ downstream packages import nip19 alone).

> See [go-nostr.md](./go-nostr.md) for a comprehensive deep dive.

---

## New `fiatjaf.com/nostr` Module

A ground-up rewrite of go-nostr with breaking API changes and significant improvements.

```bash
go get fiatjaf.com/nostr@master
```

### Key Differences from `nbd-wtf/go-nostr`

| Aspect | nbd-wtf/go-nostr | fiatjaf.com/nostr |
|--------|------------------|-------------------|
| Key types | `string` (hex) | `SecretKey` / `PubKey` (typed `[32]byte`) |
| Kind type | `int` | `Kind` (`uint16`) with constants |
| Event ID | `string` | `ID` (typed `[32]byte`) |
| Key generation | `GeneratePrivateKey() string` | `Generate() SecretKey` |
| Signing | `event.Sign(skHex)` | `sk.Sign(&event)` |
| Pool type | `SimplePool` | `Pool` |
| Sub-packages | Separate NIP packages | Integrated, plus blossom/negentropy/cashu |
| Module layout | Single repo | Monorepo (nostr + khatru + eventstore + sdk + keyer) |

### What is Included

The new module is a monorepo containing:

- **`fiatjaf.com/nostr`** -- Core types and relay connection
- **`fiatjaf.com/nostr/khatru`** -- Relay framework (replaces `github.com/fiatjaf/khatru`)
- **`fiatjaf.com/nostr/khatru/blossom`** -- Blossom media storage plugin for relays
- **`fiatjaf.com/nostr/khatru/grasp`** -- Grasp plugin for relays
- **`fiatjaf.com/nostr/eventstore`** -- Pluggable storage backends (BoltDB, LMDB, SQLite, Bleve, in-memory)
- **`fiatjaf.com/nostr/sdk`** -- High-level client SDK with caching and outbox relay management
- **`fiatjaf.com/nostr/keyer`** -- Key and bunker management
- NIP-specific helper packages for blossom, negentropy, cashu, and more

### Migration Path

Most types map directly. The main changes are moving from string-based keys to typed byte-array keys, and from `int` kinds to `Kind`. The Event struct fields and Filter struct fields remain conceptually identical.

---

## Khatru -- Relay Framework

Khatru is a framework for building custom Nostr relays with maximum flexibility. It uses a hook-based architecture where you append handler functions to control every aspect of relay behavior.

### Original: `github.com/fiatjaf/khatru`

```bash
go get github.com/fiatjaf/khatru
```

Archived as of January 2026. Still functional and a good reference, but new relay projects should use the version in the new nostr module.

### New: `fiatjaf.com/nostr/khatru`

```bash
go get fiatjaf.com/nostr/khatru@master
```

### Architecture

Khatru's design centers on a `Relay` struct with slices of handler functions (hooks) that you append to. This gives you complete control over:

| Hook Category | Hook Fields | Purpose |
|---------------|-------------|---------|
| **Event Ingestion** | `RejectEvent`, `StoreEvent`, `ReplaceEvent`, `DeleteEvent` | Control what events are accepted, how they are stored |
| **Event Lifecycle** | `OnEventSaved`, `OnEphemeralEvent` | React after events are stored or handle ephemeral events |
| **Querying** | `RejectFilter`, `OverwriteFilter`, `QueryEvents`, `CountEvents` | Control what queries are allowed, modify filters, serve data |
| **Connections** | `RejectConnection`, `OnConnect`, `OnDisconnect` | Connection-level access control |
| **Auth** | NIP-42 built-in | `GetAuthed(ctx)` returns authenticated pubkey |
| **Broadcasting** | `PreventBroadcast`, `OverwriteResponseEvent` | Control real-time event delivery |
| **Management** | `ManagementAPI` struct | NIP-86 relay management (ban/allow pubkeys, events, IPs) |

### Storage Backends (eventstore)

Rather than implementing storage from scratch, use the `eventstore` package:

- **SQLite3** -- Best for single-server relays
- **LMDB** -- High-performance embedded key-value store
- **BoltDB** -- Pure Go embedded database
- **Bleve** -- Full-text search backend
- **In-memory** -- For testing or ephemeral relays

### Policies Package

The `policies` package provides common relay policies:

```go
policies.ApplySaneDefaults(relay)
```

This applies a curated set of defaults covering rate limiting, event size limits, and kind restrictions.

---

## relayer (`github.com/fiatjaf/relayer`)

The original relay framework, predating khatru. It used a different interface-based architecture where you implemented a `Relayer` interface. **Superseded by khatru** -- do not use for new projects.

---

## When to Use Which

### Building a Client Application

Use **`fiatjaf.com/nostr`** (new module) for greenfield projects, or **`github.com/nbd-wtf/go-nostr`** if you need stable, tagged releases and extensive community examples.

Key operations:
- Generate keys, create/sign events
- Connect to relays via `Pool` or `Relay`
- Subscribe to event streams with filters
- Publish events to multiple relays
- Encode/decode NIP-19 identifiers
- Encrypt/decrypt messages (NIP-44)

### Building a Relay

Use **`fiatjaf.com/nostr/khatru`** (new module) or **`github.com/fiatjaf/khatru`** (archived but functional).

Key operations:
- Define event acceptance policies
- Plug in storage backends
- Add authentication (NIP-42)
- Serve NIP-11 relay information
- Implement custom HTTP endpoints alongside WebSocket
- Manage relay via NIP-86 management API

### Building Both (Hybrid)

The new `fiatjaf.com/nostr` monorepo is ideal -- it contains both client library and relay framework under one module with shared types.

---

## Go-Specific Patterns

### Goroutines and Channels

Nostr's event-driven model maps naturally to Go channels:

```go
// Subscription.Events is a channel -- range over it in a goroutine
go func() {
    for event := range sub.Events {
        processEvent(event)
    }
}()
```

`SimplePool.SubscribeMany` and `Pool.FetchMany` return channels that aggregate events from multiple relays concurrently, using internal goroutines to manage each relay connection.

### Context for Lifecycle Management

Every relay operation accepts a `context.Context`. This is not optional -- it is the primary mechanism for:

- **Timeouts**: `context.WithTimeout(ctx, 5*time.Second)` limits how long you wait for relay responses.
- **Cancellation**: Canceling the context closes subscriptions, frees goroutines, and cleans up WebSocket connections.
- **Propagation**: A parent context cancel cascades to all child subscriptions.

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel() // Cleans up ALL relay connections and subscriptions

pool := nostr.NewSimplePool(ctx)
// ... all pool operations inherit this context
```

**Critical**: Always cancel subscriptions or their contexts. Failure to do so leaks goroutines -- each incoming event spawns a new goroutine, and without cancellation they accumulate indefinitely.

### Error Handling

Go-nostr follows standard Go error patterns. Relay operations return errors for connection failures, publishing rejections, and protocol violations:

```go
relay, err := nostr.RelayConnect(ctx, "wss://relay.example.com")
if err != nil {
    log.Fatalf("connection failed: %v", err)
}

if err := relay.Publish(ctx, event); err != nil {
    // Could be: connection closed, event rejected, timeout
    log.Printf("publish failed: %v", err)
}
```

### Build Tags

- **`-tags debug`** -- Enable verbose logging to stdout
- **`-tags libsecp256k1`** -- Use fast C libsecp256k1 (requires CGO) instead of pure-Go crypto

---

## Further Reading

- [go-nostr Deep Dive](./go-nostr.md) -- Comprehensive API reference and patterns
- [Basic Usage Example](./examples/basic_usage.go) -- Key generation, events, relay publish/subscribe
- [Custom Relay Example](./examples/custom_relay.go) -- Building a relay with khatru
- [go-nostr on pkg.go.dev](https://pkg.go.dev/github.com/nbd-wtf/go-nostr)
- [fiatjaf.com/nostr on pkg.go.dev](https://pkg.go.dev/fiatjaf.com/nostr)
- [khatru on pkg.go.dev](https://pkg.go.dev/github.com/fiatjaf/khatru)
- [nbd-wtf/go-nostr on GitHub](https://github.com/nbd-wtf/go-nostr)
- [fiatjaf/khatru on GitHub](https://github.com/fiatjaf/khatru)
