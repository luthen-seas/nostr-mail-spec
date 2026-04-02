# NIP-44 Encryption Guide for Developers

> NIP-44 is the encryption primitive that underpins private messaging, gift wrapping, wallet connections, and any feature in NOSTR that requires confidentiality. This guide explains the protocol step by step, why it replaced NIP-04, and how to use it correctly.

---

## Table of Contents

1. [Why NIP-44 Exists](#why-nip-44-exists)
2. [What Is Wrong with NIP-04 (6 Vulnerabilities)](#what-is-wrong-with-nip-04)
3. [NIP-44 Step by Step](#nip-44-step-by-step)
4. [Decryption: Reverse the Process](#decryption-reverse-the-process)
5. [Code Examples](#code-examples)
6. [When to Use NIP-44](#when-to-use-nip-44)
7. [Security Properties](#security-properties)
8. [What NIP-44 Does NOT Provide](#what-nip-44-does-not-provide)

---

## Why NIP-44 Exists

NIP-04 was the original encryption scheme for NOSTR direct messages. It used AES-256-CBC with a non-standard ECDH shared secret and no message authentication. It was designed for simplicity when NOSTR was a new protocol, but it contained fundamental cryptographic flaws that could not be patched -- only replaced.

NIP-44 is that replacement. It provides:

- **Authenticated encryption** (encrypt-then-MAC) to prevent tampering.
- **Proper key derivation** via HKDF instead of using raw shared secrets as encryption keys.
- **Message padding** to reduce length leakage.
- **Versioning** so the algorithm can be upgraded without breaking backward compatibility.
- **A security audit** by Cure53 (December 2023).

NIP-44 is not a messaging protocol. It is a **cryptographic primitive** -- a building block used by other NIPs. It defines how to encrypt and decrypt a bytestring given a sender private key and a recipient public key.

See the [NIP-44 specification](../nips/messaging/nip-44.md) for the canonical reference.

---

## What Is Wrong with NIP-04

NIP-04 has six specific vulnerabilities that make it unsuitable for secure communication. See the [NIP-04 breakdown](../nips/messaging/nip-04.md).

### 1. No Message Authentication (Malleable Ciphertext)

NIP-04 uses AES-256-CBC without any MAC (Message Authentication Code). An attacker who can modify events in transit (or on a relay) can **flip bits in the ciphertext** and produce predictable changes in the plaintext without knowing the encryption key. This is the classic CBC bit-flipping attack.

Worse, without authentication, a padding oracle attack is possible: if the decrypting client leaks whether decryption succeeded or failed (e.g., via timing differences or error messages), an attacker can decrypt the entire message one byte at a time.

**NIP-44 fix:** HMAC-SHA256 over nonce and ciphertext. The MAC is verified before decryption. Any tampering causes immediate rejection.

### 2. Non-Standard ECDH Implementation

Standard ECDH with libsecp256k1 hashes the shared point's coordinates to produce the shared secret. NIP-04 deviates: it uses only the raw X coordinate of the ECDH shared point directly as the AES key, without hashing.

This is non-standard and reduces security margins. The raw X coordinate has algebraic structure that a properly derived key would not. It also means two parties always derive the exact same shared secret with no domain separation.

**NIP-44 fix:** HKDF-extract with a domain-separated salt (`"nip44-v2"`) derives the conversation key from the ECDH X coordinate, removing algebraic structure and providing proper domain separation.

### 3. No Padding (Length Leakage)

NIP-04 encrypts the plaintext directly with no padding beyond AES block alignment (16 bytes). The ciphertext length reveals the approximate plaintext length. For short messages like "yes", "no", "ok", or "send me 0.01 BTC", length alone can narrow down the content significantly.

**NIP-44 fix:** Custom power-of-2 padding scheme. All messages up to 32 bytes pad to 32 bytes. Longer messages pad to the next power-of-two boundary. A 5-byte message and a 30-byte message produce the same ciphertext length.

### 4. Full Metadata Exposure

NIP-04 kind 4 events contain:
- The sender's pubkey (event `pubkey` field)
- The recipient's pubkey (in the `p` tag)
- The timestamp (in `created_at`)

Anyone observing relay traffic can build a complete social graph of who is messaging whom and when, even without decrypting any content.

**NIP-44 itself does not fix this** -- NIP-44 is only a cipher. But it enables NIP-59 (Gift Wrap) which wraps the sealed message in an event signed by a random ephemeral key, hiding sender, recipient, and timing. NIP-17 (Private Direct Messages) uses NIP-59 + NIP-44 together to solve metadata exposure.

### 5. IV Reuse Vulnerability

AES-CBC security completely collapses if the initialization vector (IV) is reused with the same key. Since NIP-04 uses a static shared secret (the same ECDH output for every message between two parties), any IV reuse between the same two users reveals the XOR of the two plaintexts. The protocol relies entirely on the client generating a random IV for each message -- with no mechanism to detect or prevent reuse.

**NIP-44 fix:** A random 32-byte nonce is used per message, and the encryption key and ChaCha20 nonce are derived from the combination of the conversation key and this random nonce via HKDF-expand. Even if the same random nonce were reused (astronomically unlikely with 32 bytes), the impact is limited to that single message pair.

### 6. No Forward Secrecy (Shared with NIP-44, But Worse in NIP-04)

Neither NIP-04 nor NIP-44 provides forward secrecy. If a private key is compromised, all past messages encrypted with it can be decrypted. However, NIP-04 makes this worse because its non-standard ECDH and lack of key derivation mean there is even less cryptographic separation between messages. NIP-44 at least derives per-message keys via HKDF-expand with a random nonce, adding defense in depth.

---

## NIP-44 Step by Step

The current version is **0x02** (version 2). This section describes the full encryption process.

### Step 1: Conversation Key Derivation

The conversation key is a 32-byte value shared between two parties. It is derived once and can be cached for repeated communication with the same party.

```
1. Compute the ECDH shared point:
   shared_point = secp256k1_ecdh(sender_private_key, recipient_public_key)

2. Extract only the 32-byte X coordinate:
   shared_x = shared_point.x    // 32 bytes

3. Derive the conversation key using HKDF-extract:
   conversation_key = hkdf_extract(
     salt = "nip44-v2",          // domain separation string
     ikm  = shared_x             // input key material
   )
   // Result: 32 bytes
```

**Why HKDF-extract?** Raw ECDH output has algebraic structure (it is a point coordinate on secp256k1). HKDF-extract removes this structure, producing a uniformly random key. The salt `"nip44-v2"` ensures domain separation -- even if the same ECDH shared secret were used in another protocol, the derived keys would differ.

**Symmetry:** The conversation key is the same regardless of which party computes it, because `ecdh(a, B) == ecdh(b, A)` where `a`, `b` are private keys and `A`, `B` are the corresponding public keys.

### Step 2: Nonce Generation

```
nonce = random_bytes(32)    // 32 bytes from a CSPRNG
```

The nonce must be generated from a cryptographically secure random number generator. It must be unique for each encryption operation with the same conversation key. With 32 bytes (256 bits) of randomness, the probability of a collision is negligible (birthday bound at ~2^128 operations).

### Step 3: Message Key Expansion

The conversation key and nonce are combined via HKDF-expand to derive three purpose-specific keys:

```
keys = hkdf_expand(
  prk  = conversation_key,    // pseudorandom key from step 1
  info = nonce,               // 32-byte random nonce from step 2
  length = 76                 // output 76 bytes
)

chacha_key   = keys[0:32]    // 32 bytes -- ChaCha20 encryption key
chacha_nonce = keys[32:44]   // 12 bytes -- ChaCha20 nonce
hmac_key     = keys[44:76]   // 32 bytes -- HMAC-SHA256 key
```

**Why separate keys?** Using different keys for encryption and authentication prevents any interaction between the two operations. A vulnerability in one does not affect the other.

### Step 4: Padding

The plaintext is padded to hide its exact length.

```
1. Calculate padded length using power-of-2 scheme:
   - Messages 1-32 bytes  -> padded to 32 bytes
   - Messages 33-64 bytes -> padded to 64 bytes
   - Messages 65-128 bytes -> padded to 128 bytes
   - ... and so on, growing by powers of 2

2. Prepend a 2-byte big-endian unsigned integer of the unpadded message length.

3. Append zero bytes until total length = 2 + padded_length.
```

**Example:** A 10-byte message:
- Padded length = 32 (minimum)
- Prepend length: `[0x00, 0x0A]` (10 in big-endian)
- Append 22 zero bytes
- Total: 2 + 32 = 34 bytes

The 2-byte length prefix allows the receiver to extract the exact plaintext after decryption. The padding scheme means that a 1-byte message and a 32-byte message produce ciphertext of the same length, significantly reducing information leakage.

### Step 5: Encryption

```
ciphertext = chacha20_encrypt(
  key     = chacha_key,       // from step 3
  nonce   = chacha_nonce,     // from step 3
  counter = 0,                // starting counter
  plaintext = padded_message  // from step 4
)
```

**Why ChaCha20 over AES?**
- Faster in software (does not require AES-NI hardware instructions).
- Simpler implementation with fewer side-channel risks (no table lookups).
- Better security properties against multi-key attacks.
- Widely used in TLS 1.3 and WireGuard.

### Step 6: Authentication (HMAC-SHA256)

```
mac = hmac_sha256(
  key  = hmac_key,                     // from step 3
  data = nonce || ciphertext           // concatenation of the 32-byte nonce and ciphertext
)
// Result: 32 bytes
```

**Encrypt-then-MAC.** The MAC is computed over the ciphertext (not the plaintext). This is the industry-standard approach because:
- The MAC can be verified before decryption, rejecting tampered data without ever decrypting.
- It prevents padding oracle attacks (decryption never occurs on unauthenticated data).

**Associated data.** The nonce is included in the MAC input, binding it to the ciphertext. Any modification to the nonce causes MAC verification failure.

### Step 7: Payload Assembly

```
payload = version_byte || nonce || ciphertext || mac

Where:
  version_byte = 0x02          // 1 byte
  nonce        = (32 bytes)    // from step 2
  ciphertext   = (variable)    // from step 5
  mac          = (32 bytes)    // from step 6
```

### Step 8: Base64 Encoding

```
encoded_payload = base64_encode(payload)
```

The resulting base64 string is placed in the `content` field of the NOSTR event. The first byte after decoding is always `0x02` (version 2), which allows future versions to be distinguished.

---

## Decryption: Reverse the Process

```
1. Base64-decode the payload.
2. Read the first byte. Verify it is 0x02. Reject unknown versions.
3. Extract components:
   - nonce      = payload[1:33]           // 32 bytes
   - ciphertext = payload[33:len-32]      // variable
   - mac        = payload[len-32:len]     // 32 bytes
4. Derive conversation_key via ECDH + HKDF-extract (same as encryption step 1).
5. Derive message keys via HKDF-expand with conversation_key and nonce (same as step 3).
6. Verify HMAC:
   expected_mac = hmac_sha256(hmac_key, nonce || ciphertext)
   REJECT if mac != expected_mac (constant-time comparison!)
7. Decrypt:
   padded_message = chacha20_decrypt(chacha_key, chacha_nonce, 0, ciphertext)
8. Extract plaintext:
   unpadded_length = big_endian_uint16(padded_message[0:2])
   plaintext = padded_message[2 : 2 + unpadded_length]
9. Verify padding:
   REJECT if any byte in padded_message[2 + unpadded_length :] is non-zero
```

**Critical: Verify MAC before decrypting.** Step 6 must happen before step 7. Never decrypt unauthenticated ciphertext.

**Critical: Constant-time MAC comparison.** Use a timing-safe comparison function to prevent timing attacks that could leak MAC bytes.

**Critical: Verify padding zeroes.** Step 9 prevents attacks that manipulate the padding to alter the apparent message content.

---

## Code Examples

### TypeScript (nostr-tools)

```typescript
import { nip44, getPublicKey } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

// Keys (32-byte Uint8Arrays or hex strings depending on the API)
const senderSk = hexToBytes('sender_private_key_hex...')
const recipientPk = 'recipient_public_key_hex...'

// --- Encryption ---

// Step 1: Derive conversation key (cacheable per recipient)
const conversationKey = nip44.v2.utils.getConversationKey(senderSk, recipientPk)

// Steps 2-8: Encrypt (nonce generation, key expansion, padding,
// encryption, MAC, assembly, and base64 are all handled internally)
const ciphertext = nip44.v2.encrypt(
  'Hello, this is a private message!',
  conversationKey
)
// ciphertext is a base64 string ready for the event content field

// --- Decryption ---

// On the recipient side:
const recipientSk = hexToBytes('recipient_private_key_hex...')
const senderPk = getPublicKey(senderSk)

const recipientConvKey = nip44.v2.utils.getConversationKey(recipientSk, senderPk)
// recipientConvKey === conversationKey (ECDH symmetry)

const plaintext = nip44.v2.decrypt(ciphertext, recipientConvKey)
console.log(plaintext)  // 'Hello, this is a private message!'
```

### Using with NIP-07 (Browser Extension)

When using a NIP-07 browser extension, you do not handle keys directly:

```typescript
// The extension handles all cryptography internally
const ciphertext = await window.nostr.nip44.encrypt(recipientPubkey, plaintext)
const decrypted  = await window.nostr.nip44.decrypt(senderPubkey, ciphertext)
```

### Using with NIP-46 (Remote Signer)

With a remote signer, encryption requests are sent to the signer:

```typescript
// Via NIP-46 protocol (nostr-tools Nip46RemoteSigner)
const ciphertext = await remoteSigner.nip44Encrypt(recipientPubkey, plaintext)
const decrypted  = await remoteSigner.nip44Decrypt(senderPubkey, ciphertext)
```

### Constructing a NIP-17 Private Direct Message

NIP-17 uses NIP-44 inside NIP-59 Gift Wrap:

```typescript
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { nip44 } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

const senderSk = hexToBytes('your_private_key_hex...')
const senderPk = getPublicKey(senderSk)
const recipientPk = 'recipient_public_key_hex...'

// 1. Create the rumor (unsigned kind 14 event)
const rumor = {
  kind: 14,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['p', recipientPk]],
  content: 'This is a private direct message',
  pubkey: senderPk,
}

// 2. Seal the rumor (kind 13, encrypted with NIP-44, signed by sender)
const sealConvKey = nip44.v2.utils.getConversationKey(senderSk, recipientPk)
const sealedContent = nip44.v2.encrypt(JSON.stringify(rumor), sealConvKey)

const seal = finalizeEvent({
  kind: 13,
  created_at: randomTimestamp(),  // randomized to hide timing
  tags: [],                       // no tags -- metadata hidden
  content: sealedContent,
}, senderSk)

// 3. Gift wrap (kind 1059, encrypted with NIP-44, signed by ephemeral key)
const ephemeralSk = generateSecretKey()
const wrapConvKey = nip44.v2.utils.getConversationKey(ephemeralSk, recipientPk)
const wrappedContent = nip44.v2.encrypt(JSON.stringify(seal), wrapConvKey)

const giftWrap = finalizeEvent({
  kind: 1059,
  created_at: randomTimestamp(),  // randomized
  tags: [['p', recipientPk]],    // only recipient visible
  content: wrappedContent,
}, ephemeralSk)

// Publish giftWrap to relays. The recipient unwraps by reversing the layers.

function randomTimestamp(): number {
  // Randomize within a window to hide exact send time
  return Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800)
}
```

---

## When to Use NIP-44

NIP-44 is a general-purpose encryption primitive. It is used whenever two NOSTR users need to exchange confidential data.

| Use Case | NIP | How NIP-44 Is Used |
|----------|-----|-------------------|
| **Private Direct Messages** | NIP-17 | Encrypts the sealed rumor (kind 13) and the gift wrap (kind 1059) |
| **Gift Wrap** | NIP-59 | NIP-44 is the encryption layer for both the seal and the wrap |
| **Nostr Wallet Connect** | NIP-47 | Encrypts wallet commands and responses between client and wallet service |
| **Drafts** | NIP-37 | Encrypts draft events stored on relays so only the author can read them |
| **Remote Signing** | NIP-46 | Encrypts all communication between client and remote signer |
| **Private Lists** | NIP-51 | Encrypts the private portion of lists (mute lists, bookmarks, etc.) |
| **MLS Messaging** | NIP-EE | Outer encryption layer for group messaging events |

**Do NOT use NIP-44 for:**

- Public content (kind 1 notes, kind 7 reactions, etc.). These are not encrypted.
- Encrypting data for yourself only (NIP-44 requires a recipient public key). For self-encryption, some clients use the user's own pubkey as the recipient.

---

## Security Properties

### What NIP-44 Provides

| Property | Description |
|----------|-------------|
| **Confidentiality** | Only the holder of the sender's or recipient's private key can decrypt the message. |
| **Authenticity** | The HMAC-SHA256 MAC prevents any modification to the ciphertext, nonce, or version byte. Tampered payloads are rejected before decryption. |
| **Length hiding** | The power-of-2 padding scheme reduces information leakage from ciphertext length. Short messages (1-32 bytes) all produce the same ciphertext length. |
| **Version agility** | The version byte (0x02) allows the protocol to be upgraded. Clients reject unknown versions, preventing downgrade attacks. |
| **Audited** | NIP-44 version 2 was audited by Cure53 in December 2023. Implementations must pass the official test vectors (SHA256: `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`). |

### Why HMAC-SHA256 Over Poly1305

NIP-44 uses HMAC-SHA256 for authentication rather than Poly1305 (which is commonly paired with ChaCha20 in the "ChaCha20-Poly1305" AEAD construction). The reasons:

- **Nonce reuse tolerance.** Poly1305 is a polynomial MAC. If a nonce is reused with the same key, Poly1305 forgeries become trivial. HMAC-SHA256 does not have this catastrophic failure mode.
- **Implementation robustness.** HMAC-SHA256 is harder to implement incorrectly. Poly1305 has subtle requirements around key clamping and modular reduction.
- **Conservative choice.** HMAC-SHA256 has decades of cryptanalysis and no known practical attacks.

---

## What NIP-44 Does NOT Provide

Understanding the limitations is as important as understanding the properties.

### No Forward Secrecy

If a private key is compromised at any point, **all past messages** encrypted with that key can be decrypted. The conversation key is derived from static ECDH -- the same two parties always produce the same conversation key. There is no ephemeral key exchange per message (as in Signal's Double Ratchet).

**Implication:** An attacker who compromises your key today can decrypt every NIP-44 message ever sent to or from you.

**Mitigation:** NIP-44 cannot solve this alone. Forward secrecy would require a stateful protocol with key ratcheting, which is fundamentally at odds with NOSTR's stateless relay model. NIP-EE (MLS Messaging) explores group messaging with forward secrecy as a higher-layer protocol.

### No Deniability (at Transport Level)

NOSTR events are signed with Schnorr signatures. A signed event cryptographically proves that the holder of the corresponding private key created it. While NIP-17 introduces deniability at the inner layer (the "rumor" is unsigned), the outer layers (seal and gift wrap) are signed. An observer who captures the gift wrap event cannot prove the inner message content to a third party (since the rumor is unsigned), but the gift wrap itself is attributable.

### No Post-Compromise Security

If your key is compromised and then the attacker loses access, they can still decrypt future messages sent to you (since the conversation key is derived from the same static ECDH). There is no mechanism to "heal" after a compromise short of generating a new keypair entirely.

### No Group Encryption

NIP-44 is a two-party primitive. It encrypts from one sender to one recipient. For group communication, the message must be encrypted separately for each recipient (as NIP-17 does for group DMs) or a group key management protocol must be used (as NIP-EE does with MLS).

### No Repudiation Protection for Recipients

Because ECDH is symmetric (both parties derive the same conversation key), a recipient could have encrypted a message to themselves and claimed it came from the sender. NIP-44 encryption alone does not prove which party created a given ciphertext. (The outer NOSTR event signature provides this proof, but the NIP-44 layer itself does not.)

---

## References

- [NIP-44: Encrypted Payloads (Versioned)](../nips/messaging/nip-44.md)
- [NIP-04: Encrypted Direct Message (Deprecated)](../nips/messaging/nip-04.md)
- [NIP-17: Private Direct Messages](../nips/messaging/nip-17.md)
- [NIP-59: Gift Wrap](../nips/messaging/nip-59.md)
- [NIP-47: Nostr Wallet Connect](../nips/payments/nip-47.md)
- [NIP-37: Drafts](../nips/applications/nip-37.md)
- [NIP-46: Nostr Remote Signing](../nips/identity/nip-46.md)
- [Protocol: Cryptography](../protocol/cryptography.md)
- [HKDF (RFC 5869)](https://datatracker.ietf.org/doc/html/rfc5869)
- [ChaCha20 (RFC 8439)](https://datatracker.ietf.org/doc/html/rfc8439)
- [HMAC (RFC 2104)](https://datatracker.ietf.org/doc/html/rfc2104)

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions.*
