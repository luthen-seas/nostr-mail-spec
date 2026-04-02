# Generate Keys

Generate a secp256k1 keypair for the NOSTR protocol.

## What This Does

1. **Generates a random 32-byte secret key** using a cryptographically secure random number generator
2. **Derives the public key** by performing elliptic curve point multiplication on secp256k1 and extracting the x-coordinate (x-only pubkey, per BIP-340)
3. **Encodes both keys to bech32 format** (NIP-19) for human-readable display

## Key Concepts

### Keypair Basics

- **Secret key**: 32 random bytes. Used to sign events. NEVER share this.
- **Public key**: Derived from the secret key via secp256k1. This is your NOSTR identity.
- NOSTR uses **x-only public keys** (32 bytes) as specified in BIP-340 (Schnorr signatures).

### Bech32 Encoding (NIP-19)

Raw hex keys are hard for humans to work with. NIP-19 defines bech32 encoding:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `npub1` | Public key | `npub1abc...xyz` |
| `nsec1` | Secret key | `nsec1abc...xyz` |

The bech32 format includes a checksum, so typos are detectable.

## Files

| File | Language | Library |
|------|----------|---------|
| `generate_keys.ts` | TypeScript | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| `generate_keys.py` | Python | [pynostr](https://github.com/holgern/pynostr) |
| `generate_keys.go` | Go | [go-nostr](https://github.com/nbd-wtf/go-nostr) |
| `generate_keys.rs` | Rust | [nostr-sdk](https://github.com/rust-nostr/nostr) |

## Setup

### TypeScript

```bash
npm init -y
npm install nostr-tools
npx ts-node generate_keys.ts
```

### Python

```bash
pip install pynostr
python generate_keys.py
```

### Go

```bash
go mod init generate-keys
go get github.com/nbd-wtf/go-nostr
go run generate_keys.go
```

### Rust

Create a `Cargo.toml`:

```toml
[package]
name = "generate-keys"
version = "0.1.0"
edition = "2021"

[dependencies]
nostr-sdk = "0.35"
```

```bash
cargo run
```

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Basic protocol: defines events, keys, and signatures
- [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) — bech32-encoded entities (npub, nsec, note, nprofile, nevent)
