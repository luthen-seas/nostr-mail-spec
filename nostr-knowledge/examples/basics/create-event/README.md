# Create & Sign Event

Create a kind 1 text note, compute the event ID, and sign it with a Schnorr signature.

## What This Does

1. **Generates a keypair** (or loads one from storage)
2. **Builds an event template** with kind, content, tags, and timestamp
3. **Computes the event ID** by SHA-256 hashing the canonical JSON serialization
4. **Signs the event** with a Schnorr signature (BIP-340) using the secret key

## Event Structure (NIP-01)

Every NOSTR event has this JSON structure:

```json
{
  "id": "...",         // 32-byte hex, SHA-256 of the serialization below
  "pubkey": "...",     // 32-byte hex, author's public key
  "created_at": 1234,  // Unix timestamp in seconds
  "kind": 1,          // Event kind (1 = text note)
  "tags": [],          // Array of arrays (e.g., [["e", "..."], ["p", "..."]])
  "content": "...",    // Arbitrary string content
  "sig": "..."         // 64-byte hex, Schnorr signature of the ID
}
```

## ID Computation

The event ID is the SHA-256 hash of a specific JSON serialization:

```
SHA-256([0, <pubkey>, <created_at>, <kind>, <tags>, <content>])
```

Rules:
- The array must have exactly 6 elements, starting with the integer `0`
- JSON must use no whitespace: `separators=(",", ":")`
- Strings must be UTF-8 with no unnecessary escaping

## Signing

The signature is a **Schnorr signature (BIP-340)** over the 32-byte event ID:

1. The message being signed is the raw 32-byte event ID (not hex-encoded)
2. The signature is 64 bytes (128 hex characters)
3. The public key used for verification is the x-only public key (32 bytes)

## Files

| File | Language | Library |
|------|----------|---------|
| `create_event.ts` | TypeScript | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| `create_event.py` | Python | [pynostr](https://github.com/holgern/pynostr) |
| `create_event.go` | Go | [go-nostr](https://github.com/nbd-wtf/go-nostr) |

## Setup

### TypeScript

```bash
npm init -y
npm install nostr-tools
npx ts-node create_event.ts
```

### Python

```bash
pip install pynostr
python create_event.py
```

### Go

```bash
go mod init create-event
go get github.com/nbd-wtf/go-nostr
go run create_event.go
```

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Defines event structure, serialization, ID computation, and signing
