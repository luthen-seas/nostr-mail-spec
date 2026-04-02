# NOSTR Cryptographic Primitives

This document provides an exhaustive technical reference for every cryptographic primitive, algorithm, and protocol used in NOSTR. Every claim is cited to its authoritative NIP specification.

---

## Table of Contents

1. [The secp256k1 Elliptic Curve](#the-secp256k1-elliptic-curve)
2. [Private Keys](#private-keys)
3. [Public Keys](#public-keys)
4. [Schnorr Signatures (BIP-340)](#schnorr-signatures-bip-340)
5. [Event Signing Process](#event-signing-process)
6. [Signature Verification](#signature-verification)
7. [NIP-44: Encrypted Payloads (Versioned)](#nip-44-encrypted-payloads-versioned)
8. [NIP-04: Deprecated Encryption](#nip-04-deprecated-encryption)
9. [NIP-49: Private Key Encryption](#nip-49-private-key-encryption)
10. [Cryptographic Libraries in Practice](#cryptographic-libraries-in-practice)

---

## The secp256k1 Elliptic Curve

### What It Is

secp256k1 is a Koblitz elliptic curve defined over the finite field F_p where:

```
p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
  = 2^256 - 2^32 - 977
```

The curve equation is:

```
y^2 = x^3 + 7 (mod p)
```

The curve has a generator point G and a group order:

```
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
```

The cofactor is 1, meaning every point on the curve (except the point at infinity) is a generator, and the group has prime order.

### Why NOSTR Uses It

NIP-01 mandates the use of the "Schnorr signatures standard for the curve `secp256k1`" (NIP-01). NOSTR chose secp256k1 for the following reasons:

1. **Bitcoin compatibility**: secp256k1 is the same curve used by Bitcoin. This means NOSTR can leverage the entire Bitcoin ecosystem of battle-tested cryptographic libraries, hardware wallet support, and developer expertise.

2. **Performance**: secp256k1 was specifically designed for efficient computation. Its structure (a = 0, small b = 7) allows optimized implementations. The Koblitz curve structure enables an efficient endomorphism that speeds up scalar multiplication by approximately 33%.

3. **Existing audit trail**: The curve has been subject to more real-world cryptanalysis than virtually any other elliptic curve, securing hundreds of billions of dollars in Bitcoin value.

4. **Deterministic key properties**: The cofactor of 1 eliminates small-subgroup attacks without additional checks.

### Key Properties

| Property | Value |
|---|---|
| Field size | 256 bits |
| Key size (private) | 32 bytes (256 bits) |
| Key size (public, x-only) | 32 bytes (256 bits) |
| Signature size (Schnorr) | 64 bytes (512 bits) |
| Security level | ~128 bits |
| Cofactor | 1 |
| Curve equation | y^2 = x^3 + 7 |

---

## Private Keys

A NOSTR private key is exactly **32 bytes (256 bits) of random data**, interpreted as a scalar integer in the range [1, n-1] where n is the group order of secp256k1.

### Generation Requirements

1. **Cryptographically secure randomness**: The 32 bytes MUST be generated from a cryptographically secure pseudorandom number generator (CSPRNG). Examples include `/dev/urandom` on Linux, `CryptGenRandom` on Windows, or `crypto.getRandomValues()` in browsers.

2. **Range validation**: The generated scalar must satisfy `1 <= privkey < n`. A value of 0 or >= n is invalid. In practice, the probability of generating an out-of-range value is negligible (~2^-128), but implementations must check.

3. **Constant-time operations**: All operations involving private keys must be performed in constant time to prevent timing side-channel attacks.

### Representation

Private keys are represented in two primary formats:

**Hex (used in protocol internals):**
```
7f7ff03d123792d6ac594bfa67bf6d0c0ab55b6b1fdb6249303fe861f1ccba9a
```

**Bech32 / nsec (used for display to users, per NIP-19):**
```
nsec10allq0gjx7fddtzef0ax00mdps9t2kmtrldkyjfs8l5xruwvh2dq0lhhkp
```

The `nsec` format is strictly for human-readable display and backup. As NIP-19 states, these "MUST NOT be used in NIP-01 events" -- only raw hex is used at the protocol level.

### Security Considerations

- Private keys must never be transmitted to relays or included in events (except encrypted via NIP-49).
- Memory containing private keys should be zeroed after use (NIP-49).
- Private keys can be deterministically derived from mnemonic seed phrases via NIP-06 (see `identity.md`).

---

## Public Keys

A NOSTR public key is the **x-coordinate only** of the elliptic curve point resulting from scalar multiplication of the private key with the generator point G:

```
PublicKey = privkey * G
```

### X-Only Public Keys (BIP-340)

Per BIP-340 (the Schnorr signature standard referenced by NIP-01), NOSTR uses **x-only public keys**. This means:

1. The full curve point (x, y) is computed from the private key.
2. Only the 32-byte x-coordinate is stored and transmitted.
3. The y-coordinate is implicitly chosen as the **even** y-coordinate. If the computed y is odd, the private key is negated (replaced with n - privkey) so that the corresponding public key has an even y-coordinate.

This yields a **32-byte public key** instead of the traditional 33-byte compressed key or 65-byte uncompressed key.

### Format

**Hex (used in events, per NIP-01):**
```json
{
  "pubkey": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
}
```

**Bech32 / npub (used for display to users, per NIP-19):**
```
npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6
```

### Derivation from Private Key (Pseudocode)

```python
def get_public_key(private_key: bytes) -> bytes:
    # Compute full curve point
    point = secp256k1_multiply(G, int.from_bytes(private_key, 'big'))
    # Return x-coordinate only (32 bytes)
    return point.x.to_bytes(32, 'big')
```

---

## Schnorr Signatures (BIP-340)

NIP-01 requires all event signatures to use "Schnorr signatures standard for the curve `secp256k1`" as defined in BIP-340.

### How Schnorr Signatures Work

The Schnorr signature scheme operates as follows:

**Key generation:**
1. Choose random private key `d` in [1, n-1].
2. Compute public key `P = d * G`.
3. If P has an odd y-coordinate, negate d (set `d = n - d`).

**Signing a message m:**
1. Generate a deterministic nonce: `k = tagged_hash("BIP0340/nonce", bytes(d) || bytes(P) || m)` mod n.
2. Compute nonce point `R = k * G`.
3. If R has an odd y-coordinate, negate k (set `k = n - k`).
4. Compute challenge: `e = tagged_hash("BIP0340/challenge", bytes(R.x) || bytes(P) || m)` mod n.
5. Compute signature scalar: `s = (k + e * d)` mod n.
6. The signature is `sig = bytes(R.x) || bytes(s)` -- exactly **64 bytes**.

Where `tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)`.

**Verification of signature (R.x, s) against public key P and message m:**
1. Compute challenge: `e = tagged_hash("BIP0340/challenge", bytes(R.x) || bytes(P) || m)` mod n.
2. Compute point: `R' = s * G - e * P`.
3. Signature is valid if and only if `R'.x == R.x` and R' has an even y-coordinate.

### Advantages over ECDSA

| Property | Schnorr (BIP-340) | ECDSA |
|---|---|---|
| Signature size | 64 bytes | 70-72 bytes (DER encoded) |
| Linearity | Yes (enables key/sig aggregation) | No |
| Provable security | Provably secure in ROM | No known security proof |
| Batch verification | Native support, significant speedup | Not naturally supported |
| Malleability | Non-malleable by construction | Malleable (s vs n-s) |
| Simplicity | Simpler math, fewer edge cases | Complex DER encoding |

### Signature Format

A Schnorr signature is exactly **64 bytes**:

```
| R.x (32 bytes) | s (32 bytes) |
```

Represented as a 128-character lowercase hex string in NOSTR events:

```json
{
  "sig": "908a15e46fb4d8675bab026fc230a0e3542bfade63da02d542fb78b2a8513fcd0092619a2c8c1221e581946e0191f2af505dfdf8571b57e4a2f0ed7883ec4003"
}
```

---

## Event Signing Process

NIP-01 defines a precise serialization, hashing, and signing flow for every NOSTR event.

### Step 1: Serialize the Event

The event is serialized as a JSON array with exactly 6 elements in this order (NIP-01):

```json
[
  0,
  <pubkey (lowercase hex string)>,
  <created_at (integer)>,
  <kind (integer)>,
  <tags (array of arrays of strings)>,
  <content (string)>
]
```

**Serialization rules (NIP-01):**
- UTF-8 encoded JSON with no whitespace or newlines outside of string values.
- The following characters must be escaped in strings: `\n` (newline), `\"` (double quote), `\\` (backslash), `\r` (carriage return), `\t` (tab), `\b` (backspace), `\f` (form feed).
- No trailing commas, no BOM, no unnecessary escaping of forward slashes.

**Example serialized event:**
```json
[0,"3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",1672345678,1,[["e","b6de44a9dd47d7c00c9e7f0798c8a53281e86e0c6c4195a1e60789e4ab56e01c"],["p","3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"]],"Hello, NOSTR!"]
```

### Step 2: Compute the Event ID (SHA-256)

The event ID is the SHA-256 hash of the serialized byte string:

```python
event_id = sha256(serialize(event))
```

This produces a 32-byte hash, represented as a 64-character lowercase hex string:

```json
{
  "id": "4376c65d2f232afbe9b882a35baa4f6fe8bce184396e9eb7da3fd578e65e3d87"
}
```

### Step 3: Sign with Schnorr

The event ID (raw 32 bytes, not hex string) is signed using the BIP-340 Schnorr algorithm:

```python
sig = schnorr_sign(private_key, event_id_bytes)
```

### Complete Event Object

The final event transmitted to relays contains all fields (NIP-01):

```json
{
  "id": "4376c65d2f232afbe9b882a35baa4f6fe8bce184396e9eb7da3fd578e65e3d87",
  "pubkey": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
  "created_at": 1672345678,
  "kind": 1,
  "tags": [
    ["e", "b6de44a9dd47d7c00c9e7f0798c8a53281e86e0c6c4195a1e60789e4ab56e01c"],
    ["p", "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"]
  ],
  "content": "Hello, NOSTR!",
  "sig": "908a15e46fb4d8675bab026fc230a0e3542bfade63da02d542fb78b2a8513fcd0092619a2c8c1221e581946e0191f2af505dfdf8571b57e4a2f0ed7883ec4003"
}
```

---

## Signature Verification

Relays and clients MUST verify every event signature before accepting it. The verification process mirrors signing in reverse (NIP-01):

### Step 1: Recompute the Event ID

```python
expected_id = sha256(serialize([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]))
```

Verify that the computed hash matches the `id` field. Reject the event if they differ.

### Step 2: Verify the Schnorr Signature

```python
is_valid = schnorr_verify(
    public_key=bytes.fromhex(event.pubkey),  # 32-byte x-only pubkey
    message=bytes.fromhex(event.id),          # 32-byte event ID
    signature=bytes.fromhex(event.sig)        # 64-byte Schnorr signature
)
```

The BIP-340 verification algorithm:
1. Parse `R.x` (first 32 bytes of sig) and `s` (last 32 bytes of sig).
2. Parse public key P from the 32-byte x-only representation (assume even y).
3. Compute `e = tagged_hash("BIP0340/challenge", R.x || P || m) mod n`.
4. Compute `R' = s * G - e * P`.
5. Reject if R' is the point at infinity, or R'.y is odd, or R'.x != R.x.

### Step 3: Validate the Public Key

The `pubkey` field must be a valid point on the secp256k1 curve. Specifically, there must exist a y-coordinate such that `y^2 = x^3 + 7 (mod p)` for the given x-coordinate.

### Batch Verification

One significant advantage of Schnorr signatures is efficient **batch verification**. When a relay receives N events, instead of N independent verifications, it can verify all N signatures in a single multi-scalar multiplication, providing a speedup of roughly 2-3x for large batches.

---

## NIP-44: Encrypted Payloads (Versioned)

NIP-44 defines the current standard for end-to-end encrypted communication in NOSTR. It replaces the deprecated NIP-04. The spec states this "format may be used for many things, but MUST be used in the context of a signed event as described in NIP-01" (NIP-44).

### Version History

| Version Byte | Status | Algorithm |
|---|---|---|
| `0x00` | Reserved | -- |
| `0x01` | Deprecated | Undefined |
| `0x02` | Current | secp256k1 ECDH + HKDF + ChaCha20 + HMAC-SHA256 |

### Design Rationale (NIP-44)

NIP-44 documents explicit rationale for every algorithm choice:

- **ChaCha20 over AES**: "Better security against multi-key attacks" and superior software performance without hardware AES-NI instructions.
- **ChaCha20 over XChaCha20**: "XChaCha has not been standardized." Collision resistance of extended nonces is unnecessary since every message has a unique (key, nonce) pair.
- **HMAC-SHA256 over Poly1305**: Polynomial MACs are "much easier to forge" than HMAC.
- **Custom padding over Padme**: "Better leakage reduction for small messages."
- **SHA256**: Already integrated into NOSTR infrastructure.

### Known Limitations (NIP-44)

The specification explicitly acknowledges:
- No deniability (event signatures identify the sender)
- No forward secrecy after key compromise
- No post-compromise security
- No post-quantum security
- IP address exposure through relays
- Date leakage via `created_at` timestamps
- Limited message size obfuscation (padding helps but does not fully hide size)

### Step 1: Conversation Key Derivation (ECDH + HKDF)

The conversation key is a shared secret between two parties, computed identically by either side.

```python
def get_conversation_key(private_key_a, public_key_b):
    # ECDH: scalar multiplication of other party's pubkey by our privkey
    # Result is the UNHASHED 32-byte x-coordinate (per BIP-340)
    shared_x = secp256k1_ecdh(private_key_a, public_key_b)
    # HKDF-extract (RFC 5869) with SHA-256
    return hkdf_extract(IKM=shared_x, salt=utf8_encode('nip44-v2'))
```

**Key properties:**
- The conversation key is **symmetric**: `get_conversation_key(a_priv, B_pub) == get_conversation_key(b_priv, A_pub)` due to the commutativity of ECDH: `a * B = a * (b * G) = b * (a * G) = b * A`.
- The salt `'nip44-v2'` is a domain separator ensuring NIP-44 keys cannot be confused with keys derived for other protocols.
- The conversation key is **static** for a given pair of users -- it does not change per message. Per-message uniqueness comes from the nonce.

### Step 2: Nonce Generation

```python
nonce = csprng(32)  # 32 random bytes from CSPRNG
```

**Requirements (NIP-44):**
- MUST be generated from a CSPRNG (cryptographically secure pseudorandom number generator).
- MUST NOT be derived from the message content.
- MUST NOT be reused between messages with the same conversation key.

### Step 3: Message Key Derivation

From the static conversation key and per-message nonce, three sub-keys are derived:

```python
def get_message_keys(conversation_key, nonce):
    if len(conversation_key) != 32:
        raise Exception('invalid conversation_key length')
    if len(nonce) != 32:
        raise Exception('invalid nonce length')
    # HKDF-expand (RFC 5869) with SHA-256
    keys = hkdf_expand(PRK=conversation_key, info=nonce, L=76)
    chacha_key   = keys[0:32]    # 32 bytes for ChaCha20
    chacha_nonce = keys[32:44]   # 12 bytes for ChaCha20
    hmac_key     = keys[44:76]   # 32 bytes for HMAC-SHA256
    return (chacha_key, chacha_nonce, hmac_key)
```

### Step 4: Padding

NIP-44 uses a custom padding scheme to obscure message length. The padded size is always at least 32 bytes and follows a power-of-two chunking algorithm:

```python
def calc_padded_len(unpadded_len):
    next_power = 1 << (floor(log2(unpadded_len - 1)) + 1)
    if next_power <= 256:
        chunk = 32
    else:
        chunk = next_power // 8
    if unpadded_len <= 32:
        return 32
    else:
        return chunk * (floor((unpadded_len - 1) / chunk) + 1)
```

**Padding format:**
```
| plaintext_length (2 bytes, big-endian u16) | plaintext | zero_bytes |
```

```python
def pad(plaintext):
    unpadded = utf8_encode(plaintext)
    unpadded_len = len(unpadded)
    if unpadded_len < 1 or unpadded_len > 65535:
        raise Exception('invalid plaintext length')
    prefix = write_u16_be(unpadded_len)
    suffix = zeros(calc_padded_len(unpadded_len) - unpadded_len)
    return concat(prefix, unpadded, suffix)
```

**Example padding sizes:**

| Plaintext length | Padded length |
|---|---|
| 1-32 bytes | 32 bytes |
| 33-64 bytes | 64 bytes |
| 65-96 bytes | 96 bytes |
| 97-128 bytes | 128 bytes |
| 129-192 bytes | 192 bytes |
| 193-256 bytes | 256 bytes |
| 257-320 bytes | 320 bytes |
| Maximum: 65535 bytes | (varies) |

### Step 5: ChaCha20 Encryption

```python
ciphertext = chacha20(
    key=chacha_key,       # 32 bytes from step 3
    nonce=chacha_nonce,   # 12 bytes from step 3
    data=padded,          # Padded plaintext from step 4
    counter=0             # Initial counter per RFC 8439
)
```

ChaCha20 (RFC 8439) is a stream cipher. It XORs a keystream with the plaintext. The counter is initialized to 0 per the NIP-44 specification.

### Step 6: HMAC-SHA256 Authentication

```python
def hmac_aad(key, message, aad):
    if len(aad) != 32:
        raise Exception('AAD must be 32 bytes')
    return hmac_sha256(key, concat(aad, message))

mac = hmac_aad(
    key=hmac_key,        # 32 bytes from step 3
    message=ciphertext,  # From step 5
    aad=nonce            # The 32-byte nonce serves as AAD
)
```

The nonce is used as Additional Authenticated Data (AAD), binding the MAC to both the ciphertext and the nonce. This prevents nonce-swapping attacks.

### Step 7: Encode Final Payload

```python
payload = base64_encode(
    concat(
        write_u8(2),    # Version byte: 0x02
        nonce,          # 32 bytes
        ciphertext,     # Variable length
        mac             # 32 bytes
    )
)
```

**Payload structure (binary, before base64):**
```
| version (1 byte: 0x02) | nonce (32 bytes) | ciphertext (variable) | HMAC (32 bytes) |
```

**Payload size constraints (NIP-44):**

| Metric | Minimum | Maximum |
|---|---|---|
| Raw bytes | 99 bytes | 65,603 bytes |
| Base64 characters | 132 characters | 87,472 characters |

### Full Encryption Flow (NIP-44)

```python
def encrypt(plaintext, conversation_key, nonce):
    chacha_key, chacha_nonce, hmac_key = get_message_keys(conversation_key, nonce)
    padded = pad(plaintext)
    ciphertext = chacha20(key=chacha_key, nonce=chacha_nonce, data=padded)
    mac = hmac_aad(key=hmac_key, message=ciphertext, aad=nonce)
    return base64_encode(concat(write_u8(2), nonce, ciphertext, mac))
```

### Full Decryption Flow (NIP-44)

**Critical requirement**: "Before decryption, the event's pubkey and signature MUST be validated as defined in NIP-01" (NIP-44). The public key must be a valid secp256k1 point and the signature must be a valid BIP-340 Schnorr signature.

```python
def decrypt(payload, conversation_key):
    # 1. Decode and validate payload
    nonce, ciphertext, mac = decode_payload(payload)

    # 2. Derive message keys
    chacha_key, chacha_nonce, hmac_key = get_message_keys(conversation_key, nonce)

    # 3. Verify MAC (constant-time comparison!)
    calculated_mac = hmac_aad(key=hmac_key, message=ciphertext, aad=nonce)
    if not is_equal_ct(calculated_mac, mac):
        raise Exception('invalid MAC')

    # 4. Decrypt
    padded_plaintext = chacha20(key=chacha_key, nonce=chacha_nonce, data=ciphertext)

    # 5. Remove padding
    return unpad(padded_plaintext)

def decode_payload(payload):
    plen = len(payload)
    if plen == 0 or payload[0] == '#':
        raise Exception('unknown version')
    if plen < 132 or plen > 87472:
        raise Exception('invalid payload size')
    data = base64_decode(payload)
    dlen = len(data)
    if dlen < 99 or dlen > 65603:
        raise Exception('invalid data size')
    vers = data[0]
    if vers != 2:
        raise Exception('unknown version ' + str(vers))
    nonce = data[1:33]
    ciphertext = data[33:dlen-32]
    mac = data[dlen-32:dlen]
    return (nonce, ciphertext, mac)

def unpad(padded):
    unpadded_len = read_u16_be(padded[0:2])
    unpadded = padded[2:2+unpadded_len]
    if (unpadded_len == 0 or
        len(unpadded) != unpadded_len or
        len(padded) != 2 + calc_padded_len(unpadded_len)):
        raise Exception('invalid padding')
    return utf8_decode(unpadded)
```

### Typical Usage Pattern

```python
# Sender encrypts
conversation_key = get_conversation_key(sender_privkey, recipient_pubkey)
nonce = secure_random_bytes(32)
payload = encrypt('Hello, NOSTR!', conversation_key, nonce)

# Recipient decrypts
conversation_key = get_conversation_key(recipient_privkey, sender_pubkey)
plaintext = decrypt(payload, conversation_key)
# plaintext == 'Hello, NOSTR!'
```

### Test Vector (NIP-44)

```json
{
  "sec1": "0000000000000000000000000000000000000000000000000000000000000001",
  "sec2": "0000000000000000000000000000000000000000000000000000000000000002",
  "conversation_key": "c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d",
  "nonce": "0000000000000000000000000000000000000000000000000000000000000001",
  "plaintext": "a",
  "payload": "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb"
}
```

Test vector categories provided by the specification:
- `valid.get_conversation_key`: Verify ECDH + HKDF derivation
- `valid.get_message_keys`: Verify HKDF-expand output splitting
- `valid.calc_padded_len`: Verify padding calculations
- `valid.encrypt_decrypt`: Full round-trip encryption
- `valid.encrypt_decrypt_long_msg`: Large message tests
- `invalid.*`: Error-case tests for malformed inputs

The v2 algorithm underwent a security audit by **Cure53 in December 2023** (NIP-44).

---

## NIP-04: Deprecated Encryption

NIP-04 defined the original encrypted direct messaging scheme for NOSTR. It is **deprecated** and should not be used in new implementations. Understanding its flaws is important for security auditing.

### How NIP-04 Worked

1. ECDH shared secret: `shared_secret = sha256(ecdh(privkey_a, pubkey_b))` -- note the SHA-256 hash, unlike NIP-44 which uses HKDF.
2. Encryption: AES-256-CBC with the shared secret as key.
3. IV: 16 random bytes, transmitted alongside the ciphertext.
4. Format: `base64(ciphertext) + "?iv=" + base64(iv)`

### Why NIP-04 Is Broken

NIP-04 has multiple critical cryptographic weaknesses:

1. **No padding scheme**: Message length is leaked directly. An observer can determine the exact size of every message. NIP-44 addresses this with power-of-two padding.

2. **No authentication (no MAC)**: AES-CBC without HMAC is vulnerable to padding oracle attacks and ciphertext manipulation. An attacker can flip bits in the ciphertext to predictably alter the decrypted plaintext. NIP-44 adds HMAC-SHA256.

3. **Metadata leakage**: NIP-04 events used `kind: 4` with plaintext sender/recipient pubkeys in tags. Anyone observing the relay can see who is talking to whom, even without decrypting content. While NIP-44 alone does not solve metadata leakage (that requires NIP-17 gift wrapping), it provides the cryptographic foundation for it.

4. **Weak key derivation**: Using a single SHA-256 hash of the ECDH output is significantly weaker than the HKDF extract/expand pattern used by NIP-44. HKDF provides proper domain separation and key stretching.

5. **No versioning**: NIP-04 has no version byte, making it impossible to upgrade the encryption algorithm without breaking backward compatibility. NIP-44 includes a version byte as the first byte of every payload.

6. **AES-CBC vulnerabilities**: Without authentication, CBC mode is susceptible to the classic padding oracle attack (Vaudenay, 2002), enabling plaintext recovery.

---

## NIP-49: Private Key Encryption

NIP-49 defines a method for encrypting a user's private key with a password for secure storage and backup. The output is encoded as an `ncryptsec` bech32 string (NIP-49).

### Purpose

Users need to store and back up their NOSTR private keys. Storing a raw `nsec` is dangerous -- anyone who finds it gains full control of the identity. NIP-49 allows encrypting the private key with a user-chosen password using strong, memory-hard key derivation.

### Encryption Algorithm

#### Step 1: Key Derivation with scrypt

```python
# Normalize password to Unicode NFKC form
normalized_password = unicodedata.normalize('NFKC', password)

# Generate 16 random bytes of salt
salt = csprng(16)

# Derive 32-byte symmetric key using scrypt
symmetric_key = scrypt(
    password=normalized_password,
    salt=salt,
    log_n=LOG_N,  # User-selected: 16-22
    r=8,
    p=1,
    dkLen=32
)
```

**scrypt parameters and their cost (NIP-49):**

| LOG_N | Memory Required | Approximate Time |
|---|---|---|
| 16 | 64 MiB | Fast |
| 17 | 128 MiB | -- |
| 18 | 256 MiB | -- |
| 19 | 512 MiB | -- |
| 20 | 1 GiB | -- |
| 21 | 2 GiB | -- |
| 22 | 4 GiB | Slow |

NIP-49 mandates scrypt because it is "maximally memory hard," making GPU/ASIC brute-force attacks extremely expensive.

#### Step 2: Encrypt with XChaCha20-Poly1305

```python
nonce = csprng(24)  # 24 random bytes

# Key security byte (associated data for AEAD)
# 0x00 = key has been handled insecurely (e.g., copy-pasted, stored in plaintext)
# 0x01 = key has NOT been handled insecurely
# 0x02 = unknown handling history
key_security_byte = 0x02

ciphertext = xchacha20_poly1305_encrypt(
    key=symmetric_key,           # 32-byte key from scrypt
    nonce=nonce,                 # 24 bytes
    plaintext=private_key_raw,   # 32-byte raw private key (NOT hex or bech32)
    aad=bytes([key_security_byte])  # 1 byte associated data
)
# ciphertext includes the 16-byte Poly1305 authentication tag
```

NIP-49 states: "XChaCha20-Poly1305 is typically favored by cryptographers over AES."

#### Step 3: Assemble and Encode

```python
data = concat(
    bytes([0x02]),              # Version byte (1 byte)
    bytes([LOG_N]),             # scrypt log_n parameter (1 byte)
    salt,                       # 16 bytes
    nonce,                      # 24 bytes
    bytes([key_security_byte]), # 1 byte
    ciphertext                  # 48 bytes (32-byte encrypted key + 16-byte Poly1305 tag)
)
# Total: 91 bytes before bech32 encoding

ncryptsec = bech32_encode('ncryptsec', data)
```

### Format Structure (Binary)

```
| Offset | Length | Field                |
|--------|--------|----------------------|
| 0      | 1      | Version (0x02)       |
| 1      | 1      | LOG_N                |
| 2      | 16     | Salt                 |
| 18     | 24     | Nonce                |
| 42     | 1      | Key security byte    |
| 43     | 48     | Ciphertext + auth tag|
| Total  | 91     |                      |
```

### Decryption

```python
def decrypt_ncryptsec(ncryptsec_string, password):
    data = bech32_decode('ncryptsec', ncryptsec_string)

    version = data[0]           # Must be 0x02
    log_n = data[1]
    salt = data[2:18]
    nonce = data[18:42]
    key_security_byte = data[42]
    ciphertext = data[43:]      # Includes 16-byte Poly1305 tag

    normalized_password = unicodedata.normalize('NFKC', password)
    symmetric_key = scrypt(normalized_password, salt, log_n=log_n, r=8, p=1, dkLen=32)

    private_key = xchacha20_poly1305_decrypt(
        key=symmetric_key,
        nonce=nonce,
        ciphertext=ciphertext,
        aad=bytes([key_security_byte])
    )
    return private_key  # 32 raw bytes
```

### Key Security Byte

The key security byte is a unique feature of NIP-49 that tracks the handling history of a private key (NIP-49):

| Value | Meaning |
|---|---|
| `0x00` | The private key has been known to have been handled insecurely (copy-pasted, stored in plaintext, etc.) |
| `0x01` | The private key has NOT been known to have been handled insecurely |
| `0x02` | Unknown handling history (the client does not track this) |

This byte is included as Associated Authenticated Data (AAD) in the XChaCha20-Poly1305 encryption, meaning it cannot be tampered with without causing decryption failure.

### Unicode Normalization

NIP-49 mandates NFKC normalization for passwords. This ensures that visually identical characters produce the same byte sequence. Example from the spec:

```
Input:    "ÅΩẛ̣"  (U+212B U+2126 U+1E9B U+0323)
NFKC:     "ÅΩṩ"   (U+00C5 U+03A9 U+1E69)
```

### Security Considerations (NIP-49)

- Users should **not publish encrypted private keys** publicly, as attackers could collect multiple `ncryptsec` strings encrypted with different passwords and attempt parallel brute-force attacks.
- Implementations should "zero out the memory of passwords and private keys before freeing that memory" to prevent recovery from memory dumps.
- Higher LOG_N values provide stronger brute-force resistance at the cost of slower decryption.

---

## Cryptographic Libraries in Practice

The following libraries are widely used in NOSTR implementations for the cryptographic operations described above:

### JavaScript / TypeScript

| Library | Used For | Notes |
|---|---|---|
| **@noble/secp256k1** (noble-secp256k1) | Key generation, ECDH, Schnorr signing/verification | Pure JS, audited, no native dependencies. The de facto standard for JS NOSTR clients. |
| **@noble/hashes** | SHA-256, HMAC-SHA256, HKDF, scrypt | Companion to noble-secp256k1. Provides all hash functions needed for NIP-44 and NIP-49. |
| **@noble/ciphers** | ChaCha20, XChaCha20-Poly1305 | Stream ciphers for NIP-44 encryption and NIP-49 key encryption. |
| **@scure/bip39** | Mnemonic generation/validation (NIP-06) | BIP-39 implementation from the same author as noble libraries. |
| **@scure/bip32** | HD key derivation (NIP-06) | BIP-32 derivation paths for deterministic key generation. |
| **@scure/base** | Bech32 encoding/decoding (NIP-19) | Encoding utilities for npub, nsec, ncryptsec, etc. |

```javascript
// Example: Generate keypair and sign event using noble libraries
import { schnorr } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, randomBytes } from '@noble/hashes/utils';

// Generate private key
const privkey = randomBytes(32);

// Derive public key (x-only, 32 bytes)
const pubkey = schnorr.getPublicKey(privkey);

// Serialize and hash event
const serialized = JSON.stringify([0, bytesToHex(pubkey), created_at, kind, tags, content]);
const eventId = sha256(new TextEncoder().encode(serialized));

// Sign event ID with Schnorr
const sig = await schnorr.sign(eventId, privkey);
```

### Rust

| Library | Used For | Notes |
|---|---|---|
| **libsecp256k1** (secp256k1 crate) | Key generation, ECDH, Schnorr signing | Bitcoin Core's C library with Rust bindings. Extremely well-audited. |
| **nostr** crate | Full NOSTR protocol implementation | Wraps secp256k1 with NOSTR-specific event structures. |
| **chacha20** crate | ChaCha20 stream cipher (NIP-44) | RustCrypto implementation. |
| **chacha20poly1305** crate | XChaCha20-Poly1305 (NIP-49) | AEAD cipher for private key encryption. |
| **scrypt** crate | Key derivation (NIP-49) | Memory-hard KDF for password-based encryption. |

### C

| Library | Used For | Notes |
|---|---|---|
| **libsecp256k1** | All secp256k1 operations | The reference implementation maintained by Bitcoin Core. Includes Schnorr module. |
| **libsodium** | ChaCha20, XChaCha20-Poly1305, HMAC | General-purpose crypto library. Widely available. |

### Go

| Library | Used For | Notes |
|---|---|---|
| **decred/dcrd/dcrec/secp256k1** | secp256k1 operations | Pure Go implementation. |
| **nbd-wtf/go-nostr** | Full NOSTR protocol | Includes event signing and NIP-44 encryption. |

### Python

| Library | Used For | Notes |
|---|---|---|
| **secp256k1** (python-secp256k1) | Key operations, signing | Python bindings to libsecp256k1. |
| **pynostr** | Full NOSTR protocol | Pure Python NOSTR library. |

### Key Selection Criteria

When choosing a cryptographic library for NOSTR development:

1. **Prefer audited libraries**: noble-secp256k1 and libsecp256k1 have undergone multiple professional security audits.
2. **Avoid rolling your own crypto**: Never implement secp256k1, Schnorr, or ChaCha20 from scratch.
3. **Constant-time operations**: Ensure the library performs all secret-dependent operations in constant time (critical for private key operations, HMAC comparison, etc.).
4. **BIP-340 compliance**: The library must support x-only public keys and the specific tagged hash scheme defined in BIP-340. Generic Schnorr implementations may not be compatible.
