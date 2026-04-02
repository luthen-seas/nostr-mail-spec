# nostr-rs-relay

> Minimalistic Nostr relay written in Rust with SQLite backend.

---

## Overview

**nostr-rs-relay** is one of the earliest and most stable Nostr relay implementations. Written in Rust by scsibug (Greg Heartsfield), it uses SQLite for storage and provides a straightforward, low-overhead relay suitable for personal use or as a starting point for understanding relay internals.

- **Repository**: https://sr.ht/~gheartsfield/nostr-rs-relay (also mirrored on GitHub at scsibug/nostr-rs-relay)
- **Language**: Rust
- **Storage**: SQLite
- **License**: MIT

---

## Architecture

```
Client (WebSocket) -> nostr-rs-relay (Rust/Tokio) -> SQLite (events)
```

Single-process architecture. Uses Tokio for async WebSocket handling. SQLite in WAL mode for concurrent read access. The entire relay is one binary with an embedded database -- no external services required.

---

## Key Features

- **Minimal dependencies**: Single binary, SQLite embedded. No PostgreSQL, no Redis, no Docker required.
- **Low resource usage**: Suitable for running on a Raspberry Pi or small VPS.
- **Event validation**: Full cryptographic verification of event signatures.
- **NIP support**: NIP-01 (basic protocol), NIP-02, NIP-09, NIP-11, NIP-12, NIP-15, NIP-16, NIP-20, NIP-22, NIP-26, NIP-28, NIP-33, NIP-40, NIP-42 (AUTH).
- **Configuration**: TOML-based config file for relay info, limits, and network settings.
- **Rate limiting**: Configurable per-connection rate limits.
- **Domain whitelisting**: Restrict event publication to verified NIP-05 domains.

---

## Deployment

```bash
git clone https://git.sr.ht/~gheartsfield/nostr-rs-relay
cd nostr-rs-relay
cargo build --release
./target/release/nostr-rs-relay --config config.toml
```

Docker images are also available. A community-maintained Docker Compose setup exists at [vdo/nostr-rs-relay-compose](https://github.com/vdo/nostr-rs-relay-compose).

---

## When to Choose nostr-rs-relay

- You want the simplest possible relay to run and maintain.
- You are learning how relays work and want readable, minimal code.
- You need a personal relay with low resource overhead.
- You want SQLite's operational simplicity (single file, no server process).

For higher throughput or more advanced features, consider strfry (LMDB, negentropy sync) or nostream (PostgreSQL, payment integration).

---

## See Also

- [Relay overview](../README.md)
- [Full relay catalog](../others/catalog.md)
