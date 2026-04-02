# Verify Event Signature

Verify the authenticity of a NOSTR event by checking its ID and Schnorr signature.

## What This Does

1. **Creates a sample signed event** to use as test input
2. **Recomputes the event ID** from the canonical JSON serialization
3. **Verifies the Schnorr signature** (BIP-340) using the author's public key
4. **Demonstrates tampering detection** — shows how modified content is caught

## Verification Steps

To verify a NOSTR event, you must check two things:

### Step 1: Verify the Event ID

The event ID must be the SHA-256 hash of the canonical serialization:

```
serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])
expected_id = SHA256(serialized)
assert(expected_id == event.id)
```

Serialization rules:
- Array has exactly 6 elements, starting with integer `0`
- No whitespace between elements
- UTF-8 encoding, no unnecessary escaping

### Step 2: Verify the Schnorr Signature

The signature (`event.sig`) is a 64-byte Schnorr signature (BIP-340) over the raw 32-byte event ID:

```
valid = schnorr_verify(
    signature = bytes.fromhex(event.sig),    // 64 bytes
    message   = bytes.fromhex(event.id),     // 32 bytes
    pubkey    = bytes.fromhex(event.pubkey)   // 32 bytes, x-only
)
```

### What Tampering Looks Like

If any field is modified after signing:
- **Content changed**: Recomputed ID won't match `event.id`
- **ID forged**: Signature verification fails (sig was over the original ID)
- **Signature forged**: Schnorr verification fails (attacker doesn't have the private key)
- **Pubkey changed**: Signature verification fails (sig was made with the original key)

This means **every field in a NOSTR event is immutable** once signed.

## Files

| File | Language | Library |
|------|----------|---------|
| `verify_signature.ts` | TypeScript | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| `verify_signature.py` | Python | [pynostr](https://github.com/holgern/pynostr) |
| `verify_signature.go` | Go | [go-nostr](https://github.com/nbd-wtf/go-nostr) |

## Setup

### TypeScript

```bash
npm init -y
npm install nostr-tools
npx ts-node verify_signature.ts
```

### Python

```bash
pip install pynostr
python verify_signature.py
```

### Go

```bash
go mod init verify-signature
go get github.com/nbd-wtf/go-nostr
go run verify_signature.go
```

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Defines event structure, ID computation, and signature verification requirements
