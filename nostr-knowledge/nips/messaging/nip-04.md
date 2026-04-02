# NIP-04: Encrypted Direct Message

## Status
Unrecommended (DEPRECATED)

## Summary
NIP-04 was the original encrypted direct messaging scheme for Nostr, using AES-256-CBC encryption with a shared secret derived from ECDH (Elliptic Curve Diffie-Hellman). It defines kind 4 events where the content field holds a base64-encoded ciphertext with an appended initialization vector. It has been deprecated in favor of NIP-17 due to severe metadata leakage and cryptographic shortcomings.

## Motivation
When Nostr launched, there was no way to send private messages between users. NIP-04 provided a basic encryption mechanism so two parties could exchange messages that only they could decrypt. However, the design prioritized simplicity over security, and multiple serious flaws became apparent over time.

## Why NIP-04 Is Deprecated

### Metadata Leakage
- The sender's pubkey is visible in the event's `pubkey` field.
- The recipient's pubkey is visible in the `p` tag.
- The timestamp is visible in `created_at`.
- Anyone observing relay traffic can build a social graph of who is messaging whom and when.

### Cryptographic Weaknesses
- AES-256-CBC without HMAC authentication is vulnerable to padding oracle attacks.
- No forward secrecy: compromising a single private key decrypts the entire message history.
- No post-compromise security: a compromised key remains compromised for all future messages.
- The ECDH implementation deviates from standard libsecp256k1 -- it uses only the raw X coordinate of the shared point as the secret without hashing, which is non-standard and reduces security margins.

### No Deniability
- Messages are signed by the sender, making them cryptographically attributable.

## Specification

### Event Kinds
| Kind | Description |
|------|-------------|
| 4    | Encrypted Direct Message |

### Tags
| Tag | Description |
|-----|-------------|
| `p` | Hex pubkey of the message recipient |
| `e` | (Optional) Event ID of a previous message being replied to |

### Protocol Flow

1. **Key Agreement**: Sender computes a shared secret using ECDH between their private key and the recipient's public key. Critically, only the X coordinate of the shared point is used (no hashing).
2. **Encryption**: The message content is encrypted with AES-256-CBC using the shared secret. A random 16-byte initialization vector (IV) is generated.
3. **Encoding**: The ciphertext is base64-encoded and the IV is appended as a query parameter: `<base64_ciphertext>?iv=<base64_iv>`.
4. **Event Construction**: A kind 4 event is created with the encrypted content and a `p` tag identifying the recipient.
5. **Publishing**: The event is signed and published to relays.
6. **Decryption**: The recipient computes the same shared secret via ECDH (their private key + sender's public key) and decrypts using AES-256-CBC with the extracted IV.

### JSON Examples

#### Encrypted Direct Message (Kind 4)
```json
{
  "id": "a]f2c...",
  "pubkey": "sender_pubkey_hex_32bytes",
  "created_at": 1679000000,
  "kind": 4,
  "tags": [
    ["p", "recipient_pubkey_hex_32bytes"]
  ],
  "content": "AYpBH0JXwz0RJ2gJ+Q6w+GNUGkfmRnYybRKfUn5UJI0=?iv=bGF2YV9sYW1wX2luaXRfdmVj",
  "sig": "signature_hex_64bytes"
}
```

The `content` field is structured as: `<base64(AES-256-CBC(plaintext))>?iv=<base64(IV)>`

## Implementation Notes
- The shared secret derivation uses a non-standard approach. In standard ECDH with libsecp256k1, the shared point's coordinates are hashed. NIP-04 uses only the raw X coordinate, requiring a custom implementation (e.g., passing a custom `hashfp` function that returns the X coordinate directly).
- Clients MUST NOT render kind 4 content as regular text notes, as this could leak tag references to unintended parties.
- The IV must be randomly generated for each message -- reusing IVs completely breaks AES-CBC security.

## Client Behavior
- Clients SHOULD discourage use of NIP-04 and display a deprecation notice.
- Clients MUST support decrypting legacy NIP-04 messages for backward compatibility.
- Clients MUST migrate to NIP-17 for new direct message implementations.
- Clients MUST NOT display NIP-04 messages in the regular note feed.

## Relay Behavior
- Relays SHOULD continue to store and serve kind 4 events for backward compatibility.
- Relays MAY implement AUTH (NIP-42) to restrict who can query kind 4 events -- without AUTH, any relay observer can see the sender/recipient pair.

## Migration Path to NIP-17

NIP-17 replaces NIP-04 entirely with a layered encryption approach:

1. **NIP-44 encryption** replaces AES-256-CBC with ChaCha20 + HMAC-SHA256 (authenticated encryption with proper key derivation via HKDF).
2. **NIP-59 Gift Wrap** hides the sender's identity by wrapping the sealed message in an event signed by a random, one-time-use ephemeral key.
3. **Rumor (unsigned event)** provides deniability -- the inner message is never signed.

The migration flow:
- Old: `plaintext -> AES-256-CBC -> kind 4 event (signed by sender)`
- New: `plaintext -> kind 14 rumor (unsigned) -> kind 13 seal (NIP-44 encrypted, signed by sender) -> kind 1059 gift wrap (NIP-44 encrypted again, signed by ephemeral key)`

This eliminates metadata leakage (sender, recipient, timing) and adds deniability and authenticated encryption.

## Dependencies
- NIP-01 (Basic protocol)

## Source Code References
- **nostr-tools (JS)**: `nip04.ts` -- `encrypt()` and `decrypt()` functions implementing AES-256-CBC with ECDH
- **rust-nostr**: `nostr` crate, `nips/nip04.rs` -- encryption/decryption utilities
- **go-nostr**: `nip04/nip04.go` -- Go implementation of NIP-04 encryption

## Related NIPs
- **NIP-17** -- Private Direct Messages (replacement)
- **NIP-44** -- Versioned Encrypted Payloads (modern encryption used by NIP-17)
- **NIP-59** -- Gift Wrap (metadata hiding used by NIP-17)
- **NIP-42** -- Authentication (relay AUTH to limit metadata exposure)
