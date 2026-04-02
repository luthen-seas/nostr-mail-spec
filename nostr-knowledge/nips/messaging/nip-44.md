# NIP-44: Encrypted Payloads (Versioned)

## Status
Active

## Summary
NIP-44 defines a versioned, authenticated encryption standard for Nostr using secp256k1 ECDH key agreement, HKDF key derivation, ChaCha20 stream cipher, and HMAC-SHA256 message authentication. It is the cryptographic foundation used by NIP-59 (Gift Wrap) and NIP-17 (Private Direct Messages). The current version is 0x02.

## Motivation
NIP-04 used AES-256-CBC without authentication, had a non-standard ECDH implementation, and leaked metadata. NIP-44 provides a properly designed, audited encryption primitive that:
- Uses authenticated encryption (encrypt-then-MAC) to prevent tampering.
- Employs proper key derivation with HKDF instead of raw shared secrets.
- Applies padding to reduce message length leakage.
- Is versioned so the algorithm can be upgraded without breaking backward compatibility.

## Specification

### Event Kinds
NIP-44 does not define any event kinds itself. It is a cryptographic primitive used by other NIPs (most importantly NIP-59 kind 13 and kind 1059 events).

### Tags
NIP-44 does not define any tags. It specifies only an encryption/decryption algorithm.

### Protocol Flow

#### Encryption (Version 0x02)

1. **Conversation Key Derivation**
   - Compute the ECDH shared point between the sender's private key and the recipient's public key using secp256k1.
   - Extract only the 32-byte X coordinate of the shared point.
   - Derive a `conversation_key` using HKDF-extract with the X coordinate as input key material and `"nip44-v2"` as the salt.

2. **Nonce Generation**
   - Generate a random 32-byte nonce.

3. **Message Key Derivation**
   - Use HKDF-expand with the `conversation_key` and the nonce to derive 76 bytes:
     - Bytes 0-31: ChaCha20 encryption key
     - Bytes 32-43: ChaCha20 nonce (12 bytes)
     - Bytes 44-75: HMAC-SHA256 key

4. **Padding**
   - Calculate the padded length using a power-of-two-based scheme:
     - Messages up to 32 bytes pad to 32.
     - Larger messages pad to the next boundary in a sequence that grows by powers of two.
   - Prepend a 2-byte big-endian unsigned integer of the unpadded message length.
   - Append zero bytes until the padded length is reached.

5. **Encryption**
   - Encrypt the padded plaintext using ChaCha20 with the derived key and nonce (starting counter = 0).

6. **MAC Computation**
   - Compute HMAC-SHA256 over: `nonce || ciphertext` using the HMAC key derived in step 3.

7. **Payload Assembly**
   - Concatenate: `version_byte (0x02) || nonce (32 bytes) || ciphertext || mac (32 bytes)`
   - Base64-encode the entire payload.

#### Decryption (Version 0x02)

1. Base64-decode the payload.
2. Verify the version byte is `0x02`.
3. Extract the nonce (bytes 1-32), ciphertext (bytes 33 to len-32), and MAC (last 32 bytes).
4. Derive the conversation key via ECDH + HKDF-extract (same as encryption).
5. Derive message keys via HKDF-expand with the conversation key and nonce.
6. Verify the HMAC over `nonce || ciphertext`. Reject if invalid.
7. Decrypt the ciphertext with ChaCha20.
8. Read the 2-byte unpadded length prefix. Extract the plaintext of that length.
9. Verify that all padding bytes are zero. Reject if not.

### JSON Examples

NIP-44 encrypted content appears as a base64 string in the `content` field of events that use it:

```json
{
  "content": "AgKMEm1kN3FhcjlubWt2ZTV2bHRyZGVrcHNnbm5pa3p0ZWx0ZHBiZGVpa2VxaGRkdGhxZHN0Y2dxZnJlaGRr..."
}
```

The first byte after base64 decoding is the version (`0x02` = version 2). The rest follows the format: `nonce (32) || ciphertext (variable) || hmac (32)`.

#### Conversation Key Derivation (Pseudocode)
```
ecdh_point = secp256k1_ecdh(sender_privkey, recipient_pubkey)
shared_x = ecdh_point.x  // 32 bytes
conversation_key = hkdf_extract(salt="nip44-v2", ikm=shared_x)
```

#### Message Key Derivation (Pseudocode)
```
keys = hkdf_expand(prk=conversation_key, info=nonce, length=76)
chacha_key  = keys[0:32]
chacha_nonce = keys[32:44]
hmac_key    = keys[44:76]
```

## Implementation Notes

### Security Properties
- **Authenticated encryption**: The HMAC prevents any tampering with the ciphertext or nonce.
- **No forward secrecy**: If a private key is compromised, all past conversations with that key can be decrypted. This is an inherent limitation of static-key ECDH.
- **No deniability**: Events are signed, proving authorship.
- **No post-quantum security**: secp256k1 ECDH is vulnerable to quantum computers.
- **Deterministic conversation key**: The same two parties always derive the same conversation key. Only the random nonce makes each encryption unique.

### Why ChaCha20 Over AES?
- Faster in software (no need for AES-NI hardware).
- Better security properties against multi-key attacks.
- Simpler implementation with fewer side-channel risks.

### Why HMAC-SHA256 Over Poly1305?
- Polynomial MACs like Poly1305 are easier to forge when nonces are reused.
- HMAC-SHA256 is more robust against implementation errors.

### Padding Scheme
The custom padding scheme reduces length leakage particularly for short messages. Messages are padded to boundaries that grow by powers of two. For example:
- 1-32 bytes -> padded to 32
- 33-64 bytes -> padded to 64
- And so on with increasing granularity for larger messages.

### Test Vectors
The official test vectors are available in the NIP-44 repository and have a SHA256 checksum of `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`. Implementations MUST pass all test vectors.

### Security Audit
NIP-44 version 2 was audited by Cure53 in December 2023.

## Client Behavior
- Clients MUST use version 2 (`0x02`) for encryption.
- Clients MUST support decrypting version 2 payloads.
- Clients MUST reject payloads with unknown version bytes.
- Clients MUST verify the HMAC before decryption and reject tampered payloads.
- Clients MUST verify that padding bytes are all zero after decryption.
- Clients SHOULD use a cryptographically secure random number generator for the 32-byte nonce.
- Clients MUST NOT reuse nonces with the same conversation key.

## Relay Behavior
- Relays have no special behavior for NIP-44 -- the encrypted content is opaque to them.
- Relays store and forward the base64-encoded encrypted payloads as part of the event `content` field without any processing.

## Dependencies
- secp256k1 elliptic curve (for ECDH)
- HKDF (RFC 5869)
- ChaCha20 (RFC 8439)
- HMAC-SHA256 (RFC 2104)

## Source Code References
- **nostr-tools (JS)**: `nip44.ts` -- `encrypt()`, `decrypt()`, `getConversationKey()`, padding utilities
- **rust-nostr**: `nostr` crate, `nips/nip44.rs` -- full encryption/decryption with test vectors
- **go-nostr**: `nip44/nip44.go` -- Go implementation
- **Test vectors**: `nip44.vectors.json` in the nostr-protocol/nips repository

## Related NIPs
- **NIP-04** -- Encrypted Direct Message (predecessor, deprecated)
- **NIP-59** -- Gift Wrap (uses NIP-44 for sealing and wrapping)
- **NIP-17** -- Private Direct Messages (uses NIP-44 via NIP-59)
- **NIP-EE** -- MLS Messaging (uses NIP-44 for outer encryption of group events)
