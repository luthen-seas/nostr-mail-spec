# NIP-49: Private Key Encryption

## Status
Active (draft, optional)

## Summary
NIP-49 defines a method for encrypting a user's Nostr private key with a password, producing a bech32-encoded `ncryptsec` string. The encryption uses scrypt for key derivation and XChaCha20-Poly1305 for symmetric encryption, providing a secure way to store or transfer private keys in encrypted form.

## Motivation
Users need a way to store their private keys securely at rest (on disk, in a password manager, on paper as a backup) without leaving them in plaintext. NIP-49 provides a standardized encryption format so that any compliant client can encrypt and decrypt private keys using a user-chosen password. The `ncryptsec` prefix makes encrypted keys visually distinguishable from raw `nsec` keys, reducing the risk of accidental exposure.

## Specification

### Event Kinds
No new event kinds are defined. This NIP defines a key encryption format.

### Tags
No new tags are defined.

### Protocol Flow

#### Key Derivation

1. **PASSWORD**: Read from the user. MUST be Unicode-normalized to **NFKC** format before use.
2. **LOG_N**: One byte representing a power of 2, used as the scrypt cost parameter (number of rounds).
3. **SALT**: 16 random bytes.
4. **SYMMETRIC_KEY**: Derived via scrypt:
   ```
   SYMMETRIC_KEY = scrypt(password=PASSWORD, salt=SALT, log_n=LOG_N, r=8, p=1)
   ```
   The symmetric key is 32 bytes long. It is temporary and MUST be zeroed after use.

**Scrypt cost parameter reference:**

| LOG_N | Memory Required | Approx Time on Fast Computer |
|-------|-----------------|------------------------------|
| 16    | 64 MiB          | 100 ms                       |
| 18    | 256 MiB         |                              |
| 20    | 1 GiB           | 2 seconds                    |
| 21    | 2 GiB           |                              |
| 22    | 4 GiB           |                              |

#### Encryption Process

1. **PRIVATE_KEY**: The user's secp256k1 private key as 32 raw bytes (not hex, not bech32).
2. **KEY_SECURITY_BYTE** (associated data):
   - `0x00` -- Key has been known to be handled insecurely (stored unencrypted, copy-pasted, etc.)
   - `0x01` -- Key has NOT been known to be handled insecurely
   - `0x02` -- Client does not track this data
3. **NONCE**: 24 random bytes.
4. **CIPHERTEXT**: Encrypt using XChaCha20-Poly1305:
   ```
   CIPHERTEXT = XChaCha20-Poly1305(
       plaintext=PRIVATE_KEY,
       associated_data=KEY_SECURITY_BYTE,
       nonce=NONCE,
       key=SYMMETRIC_KEY
   )
   ```
5. **VERSION_NUMBER**: `0x02`
6. **Concatenate**:
   ```
   CIPHERTEXT_CONCATENATION = concat(
       VERSION_NUMBER,    // 1 byte
       LOG_N,             // 1 byte
       SALT,              // 16 bytes
       NONCE,             // 24 bytes
       ASSOCIATED_DATA,   // 1 byte (KEY_SECURITY_BYTE)
       CIPHERTEXT         // 48 bytes (32 byte plaintext + 16 byte Poly1305 tag)
   )
   ```
   Total: 91 bytes before bech32 encoding.
7. **Encode**:
   ```
   ENCRYPTED_PRIVATE_KEY = bech32_encode('ncryptsec', CIPHERTEXT_CONCATENATION)
   ```

#### Decryption Process

Reverse the encryption:
1. Decode `ncryptsec` bech32 string to get the 91-byte concatenation.
2. Extract VERSION_NUMBER, LOG_N, SALT, NONCE, ASSOCIATED_DATA, and CIPHERTEXT.
3. Derive SYMMETRIC_KEY from the password and SALT using scrypt.
4. Decrypt CIPHERTEXT using XChaCha20-Poly1305 with the NONCE, ASSOCIATED_DATA, and SYMMETRIC_KEY.
5. The result is the 32-byte raw private key.

### JSON Examples

No JSON event examples (this NIP defines a key format, not events).

### Test Vectors

**Password Unicode Normalization:**

Input password: `"ÅΩẛ̣"`
- Unicode Codepoints: U+212B U+2126 U+1E9B U+0323
- UTF-8 bytes: `[0xE2, 0x84, 0xAB, 0xE2, 0x84, 0xA6, 0xE1, 0xBA, 0x9B, 0xCC, 0xA3]`

After NFKC normalization: `"ÅΩṩ"`
- Unicode Codepoints: U+00C5 U+03A9 U+1E69
- UTF-8 bytes: `[0xC3, 0x85, 0xCE, 0xA9, 0xE1, 0xB9, 0xA9]`

**Decryption Test:**

Encrypted key:
```
ncryptsec1qgg9947rlpvqu76pj5ecreduf9jxhselq2nae2kghhvd5g7dgjtcxfqtd67p9m0w57lspw8gsq6yphnm8623nsl8xn9j4jdzz84zm3frztj3z7s35vpzmqf6ksu8r89qk5z2zxfmu5gv8th8wclt0h4p
```

Password: `nostr`
LOG_N: `16`

Decrypted private key (hex):
```
3501454135014541350145413501453fefb02227e449e57cf4d3a3ce05378683
```

## Implementation Notes

- **Password normalization is critical.** Always normalize to NFKC before using as scrypt input. Different Unicode representations of the same visual characters will produce different keys without normalization.
- The encryption is non-deterministic due to the random NONCE and SALT -- encrypting the same key with the same password produces different `ncryptsec` strings each time.
- The KEY_SECURITY_BYTE is authenticated data (AEAD associated data), meaning tampering with it will cause decryption to fail. This allows clients to track and propagate key security hygiene.
- The version number `0x02` allows for future format changes.
- **Memory safety:** Implementations should zero out passwords, symmetric keys, and plaintext private keys in memory after use.
- **Why scrypt over argon2:** The spec authors chose scrypt because it has been proven maximally memory-hard, and cryptographers have indicated it is better than argon2 despite argon2 winning a competition in 2015.
- **Why XChaCha20-Poly1305:** It is favored by cryptographers over AES, is less associated with the U.S. government, is used in TLS and OpenSSH, and is available in most modern crypto libraries.
- **Do NOT publish ncryptsec to Nostr relays.** Cracking becomes easier when an attacker can amass many encrypted private keys.

## Client Behavior

- Clients SHOULD support importing `ncryptsec` strings and decrypting them with a user-provided password.
- Clients SHOULD support exporting/encrypting a user's private key to `ncryptsec` format.
- Clients MUST normalize passwords to NFKC before use.
- Clients SHOULD let the user choose the LOG_N parameter (or use a sensible default like 16-20).
- Clients MUST zero out passwords and private keys in memory after use.
- Clients SHOULD track key security state and set the KEY_SECURITY_BYTE appropriately.
- Clients SHOULD NOT publish `ncryptsec` strings to Nostr relays.
- Clients SHOULD warn users if they attempt to paste an `ncryptsec` into a field expecting an `nsec`.

## Relay Behavior

- Relays have no special behavior for NIP-49. Key encryption is entirely client-side.

## Dependencies

- [BIP-350](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki) -- bech32m encoding (used for `ncryptsec` encoding)
- scrypt key derivation function (RFC 7914)
- XChaCha20-Poly1305 AEAD cipher

## Source Code References

- **nostr-tools (JS):** `nip49.ts` -- `encrypt()`, `decrypt()` functions for ncryptsec
- **rust-nostr:** `nostr/src/nips/nip49.rs` -- `EncryptedSecretKey` struct, encrypt/decrypt
- **go-nostr:** NIP-49 key encryption utilities

## Related NIPs

- [NIP-06](./nip-06.md) -- Mnemonic seed phrases (alternative backup mechanism; NIP-49 can encrypt the derived key)
- [NIP-19](../nip-19.md) -- bech32 entities (defines `nsec`; NIP-49 adds `ncryptsec`)
- [NIP-07](./nip-07.md) -- Browser extensions (may store keys encrypted with NIP-49)
- [NIP-46](./nip-46.md) -- Remote signing (alternative approach: never expose the key at all)
