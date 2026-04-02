# Cryptographic Design Patterns Reference

Safe and unsafe patterns for protocol design, with emphasis on NOSTR's encryption stack and messaging protocol cryptography.

---

## 1. Safe Composition Patterns

### NIP-44's Approach: HKDF -> ChaCha20 -> HMAC

NIP-44 version 2 implements a textbook-correct Encrypt-then-MAC construction:

```
[Conversation Key Derivation]
  ECDH(sender_priv, recipient_pub) -> shared_x (32 bytes)
  HKDF-Extract(salt="nip44-v2", IKM=shared_x) -> conversation_key (32 bytes)

[Per-Message Encryption]
  nonce = CSPRNG(32)
  HKDF-Expand(PRK=conversation_key, info=nonce, L=76) -> chacha_key(32) || chacha_nonce(12) || hmac_key(32)
  padded_plaintext = pad(plaintext)          // power-of-2 with 2-byte length prefix
  ciphertext = ChaCha20(chacha_key, chacha_nonce, padded_plaintext)
  mac = HMAC-SHA256(hmac_key, nonce || ciphertext)
  payload = 0x02 || nonce || ciphertext || mac
  output = base64(payload)
```

**Why this is safe:**
1. **Key separation via HKDF.** The conversation_key is extracted from raw ECDH output using HKDF-Extract, removing any structural bias in the shared secret. The per-message keys are expanded via HKDF-Expand with a random nonce as domain separator, ensuring each message uses independent keys.
2. **Encrypt-then-MAC ordering.** The HMAC covers the nonce and ciphertext. Verification happens before decryption. This is provably IND-CCA2.
3. **Independent keys for encryption and MAC.** Both derived from the same PRK but from non-overlapping HKDF-Expand output bytes. Under the PRF assumption on HMAC-SHA256, these are computationally independent.
4. **Large nonce space.** 256-bit random nonce fed into HKDF avoids birthday-bound concerns even at massive scale.
5. **Versioning.** The leading version byte (0x02) allows future algorithm upgrades without ambiguity.

**Potential concerns for a reviewer:**
- No forward secrecy (static-static ECDH).
- Conversation key is deterministic between two parties; long-lived relationships accumulate risk.
- No sequence numbers or ordering guarantees (handled at the event layer, not the encryption layer).

### NIP-59's Three-Layer Onion: Rumor -> Seal -> Gift Wrap

```
Layer 1: Rumor (unsigned event)
  kind = application-specific (e.g., 14 for DM)
  pubkey = sender's real pubkey
  sig = empty (intentionally unsigned, provides deniability)

Layer 2: Seal (kind 13)
  content = NIP-44-Encrypt(ECDH(sender_priv, recipient_pub), rumor_json)
  pubkey = sender's real pubkey
  tags = []  (always empty -- prevents metadata leakage)
  created_at = randomized
  sig = Schnorr(sender_priv, seal_event)

Layer 3: Gift Wrap (kind 1059)
  ephemeral_key = CSPRNG(32)  // new key per wrap, discarded after
  content = NIP-44-Encrypt(ECDH(ephemeral_priv, recipient_pub), seal_json)
  pubkey = ephemeral_pubkey
  tags = [["p", recipient_pubkey]]  // routing only
  created_at = randomized
  sig = Schnorr(ephemeral_priv, wrap_event)
```

**Why this is safe:**
1. **Key isolation between layers.** The Seal uses ECDH(sender, recipient) while the Gift Wrap uses ECDH(ephemeral, recipient). These produce different conversation_keys, so compromise of one layer does not affect the other.
2. **Ephemeral keys for outer layer.** The Gift Wrap key is generated fresh and discarded, preventing linkability between messages. An observer sees a different "sender" for each message.
3. **Metadata minimization.** The Seal has no tags. The Gift Wrap reveals only the recipient (necessary for routing). Timestamps on both layers are randomized.
4. **Deniability via unsigned Rumors.** The innermost payload carries no signature, giving the sender plausible deniability to third parties.
5. **Sequential encryption.** Each layer encrypts the serialized output of the previous layer, ensuring clean separation.

**Potential concerns for a reviewer:**
- The Seal signature IS transferable proof of authorship (weaker deniability than Signal).
- The recipient `p` tag on the Gift Wrap reveals who receives the message (necessary trade-off for relay routing).
- No replay protection beyond event ID deduplication at the relay layer.
- Multi-recipient wrapping requires N separate Gift Wraps (one per recipient), each with its own ephemeral key. The Seal is re-encrypted per recipient, not shared.

---

## 2. The Signal Protocol Composition

### X3DH (Extended Triple Diffie-Hellman)

X3DH establishes a shared secret between two parties where one may be offline, using a combination of long-term identity keys, signed pre-keys, and one-time pre-keys.

```
Alice (initiator):
  IK_A = identity key pair (long-term)

Bob (responder, possibly offline):
  IK_B = identity key pair (long-term)
  SPK_B = signed pre-key (medium-term, rotated periodically)
  Sig_B = signature of SPK_B under IK_B
  OPK_B = one-time pre-key (ephemeral, each used once)

Alice fetches Bob's key bundle from the server, verifies Sig_B, then computes:
  DH1 = ECDH(IK_A, SPK_B)       // mutual authentication
  DH2 = ECDH(EK_A, IK_B)        // mutual authentication
  DH3 = ECDH(EK_A, SPK_B)       // forward secrecy
  DH4 = ECDH(EK_A, OPK_B)       // one-time forward secrecy (optional)

  SK = KDF(DH1 || DH2 || DH3 || DH4)
```

Where EK_A is Alice's ephemeral key generated for this session.

**Why it works:**
- DH1 + DH2 provide mutual authentication (both identity keys contribute).
- DH3 provides forward secrecy (tied to Bob's medium-term signed pre-key).
- DH4 provides one-time forward secrecy (tied to Bob's ephemeral pre-key, deleted after use).
- The combination resists KCI: even if Alice's IK_A is compromised, the attacker cannot compute DH3 or DH4 without EK_A.

**Comparison to NIP-44:**
| Property | NIP-44 | X3DH |
|---|---|---|
| Key agreement | Static-static ECDH | 3-4 DH computations |
| Forward secrecy | No | Yes (via ephemeral keys) |
| KCI resistance | No | Yes (multiple DH legs) |
| Offline initiation | Yes (trivially) | Yes (via pre-keys) |
| Complexity | Low | Moderate |
| State required | None | Pre-key management |

### Double Ratchet

After X3DH establishes a shared secret, the Double Ratchet provides ongoing forward secrecy and post-compromise security:

```
[Symmetric Ratchet]
  Each message derives a new chain key and message key:
    chain_key_{n+1} = HMAC(chain_key_n, 0x02)
    message_key_n   = HMAC(chain_key_n, 0x01)
  Old chain keys are deleted, providing forward secrecy.

[DH Ratchet]
  Each reply includes a new DH public key.
  When a reply is received:
    new_dh_secret = ECDH(own_dh_priv, received_dh_pub)
    root_key, chain_key = KDF(root_key, new_dh_secret)
  This provides post-compromise security: after one round-trip,
  a compromised state is replaced by a fresh DH secret.
```

**Why it works for messaging but is hard for NOSTR:**
- Requires sequential message exchange (each message includes a new ratchet key).
- NOSTR is fundamentally asynchronous: messages may arrive out of order, be stored indefinitely by relays, and be read on multiple client devices.
- State synchronization across devices is extremely difficult with ratcheting protocols.
- NIP-44's stateless design is a deliberate trade-off: simplicity and multi-device compatibility at the cost of forward secrecy.

---

## 3. The Noise Framework

### Overview
Noise (Trevor Perrin, 2018) is a framework for building crypto protocols from DH handshake patterns. It provides:
- A menu of handshake patterns (NN, NK, NX, KN, KK, KX, XN, XK, XX, IK, IX, etc.)
- Each pattern specifies which keys are known to which parties before the handshake.
- Formal notation: N = No key, K = Known key, X = transmitted key, I = Immediately transmitted key.

### Relevant Patterns

**NK (Noise NK):** Initiator knows responder's static key.
```
<- s              // responder's static key is known
-> e, es          // initiator sends ephemeral, does ECDH(e, s)
<- e, ee          // responder sends ephemeral, does ECDH(e, e)
```
This is analogous to NIP-59's Gift Wrap layer: the sender (initiator) knows the recipient's (responder's) public key and uses an ephemeral key.

**KK (Noise KK):** Both parties know each other's static keys.
```
-> s              // initiator's static key is known
<- s              // responder's static key is known
-> e, es, ss      // initiator sends ephemeral, does ECDH(e,s) and ECDH(s,s)
<- e, ee, se      // responder sends ephemeral, does ECDH(e,e) and ECDH(s,e)
```
This is analogous to NIP-44's Seal layer: both parties use their static identity keys.

### How Noise Applies to NOSTR Protocol Review
When reviewing a NOSTR-based protocol:
1. Identify which Noise pattern the protocol most closely resembles.
2. Check whether the security properties of that pattern match the protocol's threat model.
3. Noise patterns have formal proofs; if the protocol deviates, analyze whether the deviation introduces vulnerabilities.

NIP-44 + NIP-59 combined roughly implements a two-phase construction:
- Phase 1 (Seal): Static-static ECDH (like Noise KK without the ratchet)
- Phase 2 (Gift Wrap): Ephemeral-static ECDH (like Noise NK, one-shot)
- No return channel (one-way, no handshake completion)

---

## 4. Anti-Patterns

### ECB Mode
**Problem:** ECB (Electronic Codebook) encrypts each block independently with the same key. Identical plaintext blocks produce identical ciphertext blocks, revealing patterns.
**Detection:** Any scheme that encrypts fixed-size blocks without chaining, IV, or nonce.
**Impact:** Complete loss of IND-CPA security. Visual patterns in images, repeated blocks in structured data.
**Relevance:** Not used in NOSTR, but a common mistake in naive encryption implementations.

### Unauthenticated Encryption
**Problem:** Encryption without a MAC or AEAD allows ciphertext modification. An attacker can flip bits in a stream cipher ciphertext to flip corresponding bits in the plaintext (bit-flipping attack).
**Detection:** Any encryption scheme that does not include authentication (no HMAC, no Poly1305, no GCM tag).
**Historical NOSTR example:** NIP-04 used AES-256-CBC without any MAC. A relay could modify encrypted content without detection.
**Impact:** Arbitrary plaintext modification, chosen-ciphertext attacks, oracle attacks.

### Nonce Reuse
**Problem:** Reusing a nonce with the same key in a stream cipher (ChaCha20, AES-CTR) or AEAD (AES-GCM, ChaCha20-Poly1305) catastrophically breaks security.
- Stream ciphers: XOR of two ciphertexts = XOR of two plaintexts (crib-dragging).
- AES-GCM / Poly1305: Authentication key recovery, enabling universal forgery.
**Detection:** Deterministic nonce generation, counter overflow, insufficient nonce entropy.
**NIP-44 mitigation:** 256-bit random nonce space; HMAC-SHA256 (not Poly1305) for authentication robustness.

### Deterministic IVs
**Problem:** Using predictable or deterministic IVs (initialization vectors) can enable chosen-plaintext attacks, particularly in CBC mode (the BEAST attack on TLS 1.0).
**Detection:** IV derived from message content, timestamps, counters, or other predictable values.
**NIP-44 approach:** Random 32-byte nonce per message, fed through HKDF to derive the actual ChaCha20 nonce. Even if an attacker could predict the outer nonce, they cannot predict the derived ChaCha20 nonce without the conversation_key.

### Using Raw ECDH Output as a Key
**Problem:** The raw output of ECDH (the X coordinate of the shared point) is not uniformly distributed. Using it directly as an encryption key violates the assumption of key uniformity that most encryption proofs require.
**Detection:** Any protocol that computes `key = ECDH(a, B).x` and uses `key` directly for encryption.
**NIP-04's mistake:** Used raw ECDH output as the AES key.
**NIP-44's fix:** Passes ECDH output through HKDF-Extract to produce a uniformly distributed conversation_key.

### Encrypting the Same Plaintext to Multiple Recipients with the Same Key
**Problem:** If the same plaintext is encrypted under different keys but with the same nonce, an attacker who knows one plaintext can recover the other (in stream ciphers: same keystream XOR).
**NIP-59's approach:** Each Gift Wrap uses a different ephemeral key (and therefore a different conversation_key and different HKDF-derived nonces). Each Seal re-encryption also uses a different conversation_key (sender + different recipient). This is safe.
**Anti-pattern:** Encrypting the same Seal ciphertext to multiple recipients without re-encryption.

---

## 5. Padding Anti-Patterns

### No Padding (Length Oracle)
**Problem:** Ciphertext length reveals plaintext length exactly (for stream ciphers, ciphertext length = plaintext length). This leaks information about message content.
**Impact:** Traffic analysis, language identification, template matching, compressed content leaks (CRIME/BREACH attacks).
**Detection:** Ciphertext length varies 1:1 with plaintext length.

### Fixed-Block Padding (PKCS#7)
**Problem:** PKCS#7 pads to a fixed block size (e.g., 16 bytes for AES). This reveals plaintext length modulo the block size and creates padding oracle attack surfaces.
**Vaudenay's attack (2002):** If the decryptor reveals whether padding is valid (via error messages, timing, or behavior), an attacker can decrypt arbitrary ciphertexts byte-by-byte.
**Impact:** Complete plaintext recovery in as few as 128 * block_size queries per block.
**Detection:** Block cipher with PKCS#7 or similar padding where padding errors are distinguishable from MAC errors.

### Naive Fixed Padding (Pad to Constant Size)
**Problem:** Padding all messages to a single fixed size wastes bandwidth enormously for short messages and may still truncate long messages. If the maximum message size is too small, messages that exceed it break the scheme.
**Trade-off:** Maximum privacy but impractical for variable-length content like email.

### NIP-44's Padding: Power-of-2 (Recommended Pattern)
Messages are padded to the next power-of-2 boundary (with finer granularity for small messages):
- Leaks only the approximate order of magnitude of message length.
- Average overhead is ~33% (acceptable for most applications).
- No padding oracle: padding bytes are verified as zeros after HMAC verification succeeds. No timing difference is observable because the HMAC check gates all further processing.

### For NOSTR Mail Considerations
Email bodies vary from a few bytes to megabytes. Power-of-2 padding for large messages (e.g., 67 KB padded to 128 KB) wastes significant bandwidth. A NOSTR Mail protocol might consider:
- Chunking large messages into fixed-size segments (each independently encrypted).
- Different padding strategies for headers vs. body.
- Compressing before encrypting (but beware CRIME/BREACH if attacker controls part of the plaintext).

---

## 6. Multi-Recipient Encryption Patterns

### Per-Recipient Wrap (NIP-59's Approach) -- RECOMMENDED
```
For each recipient R_i:
  Generate fresh ephemeral key E_i
  Encrypt Seal with ECDH(E_i, R_i) -> Gift Wrap for R_i
```

**Properties:**
- Each recipient receives an independently encrypted copy.
- Wraps are unlinkable (different ephemeral keys, different ciphertexts).
- Compromise of one recipient's key does not reveal the message to other recipients (each wrap uses a different ECDH pair).
- Cost: N encryptions for N recipients.

### Shared-Key Pattern (Group Messaging) -- EFFICIENT BUT COMPLEX
```
Generate a group key K_group
Encrypt message once with K_group
Distribute K_group to each recipient via per-recipient encryption
```

**Properties:**
- Only one message encryption + N key distributions.
- Used by MLS (RFC 9420) with TreeKEM for efficient key distribution.
- Requires group state management (member addition, removal, key rotation).
- A compromised group key exposes the message to any holder.

**NOSTR context:** NIP-EE proposes MLS-based group messaging for NOSTR. For one-to-one or small-group email, per-recipient wrap (NIP-59) is simpler and sufficient.

### Broadcast Encryption
```
Encrypt once with a broadcast key derivable only by authorized recipients.
```
- Used in DRM systems, not appropriate for messaging due to lack of forward secrecy and complex revocation.

---

## 7. Ephemeral Key Patterns

### Generate-Use-Discard (NIP-59 Pattern)
```
ephemeral_priv = CSPRNG(32)
ephemeral_pub = ephemeral_priv * G
// Use for one Gift Wrap encryption
ciphertext = NIP44_Encrypt(ECDH(ephemeral_priv, recipient_pub), plaintext)
// Securely erase ephemeral_priv from memory
ephemeral_priv = 0x00...00
```

**Critical requirements:**
1. **Entropy quality.** The ephemeral key must come from a CSPRNG (e.g., /dev/urandom, crypto.getRandomValues). Weak randomness (PRNG, Math.random, predictable seed) enables an attacker to reconstruct the ephemeral key and decrypt the Gift Wrap.
2. **Secure erasure.** The ephemeral private key must be zeroed from memory after use. In garbage-collected languages (JavaScript, Python), this is non-trivial -- the runtime may retain copies. Best practice: use a dedicated crypto library that manages its own memory (e.g., libsodium's sodium_memzero).
3. **No reuse.** Each Gift Wrap must use a fresh ephemeral key. Reusing an ephemeral key across wraps for different recipients allows an observer to link those wraps (same pubkey appears on both).
4. **No logging.** Ephemeral keys must never appear in logs, crash reports, or debug output.

### Pre-Key Bundles (Signal Pattern)
```
// Bob publishes pre-keys:
SPK_B = signed pre-key (rotated monthly)
OPK_B = [one-time pre-keys] (batch uploaded, each used once)
// Alice fetches and uses pre-keys to initiate session
```

**Trade-off vs. NIP-59's approach:**
- Pre-keys enable forward secrecy even in the first message (if OPK is available).
- Require a trusted server to distribute pre-keys honestly.
- Require Bob to manage pre-key state (rotation, depletion monitoring).
- Not currently used in NOSTR's core encryption stack.

---

## 8. Key Rotation Patterns

### Static Key (NIP-44)
No rotation. The secp256k1 key pair IS the NOSTR identity. Changing keys means changing identity.
- **Pro:** Simplicity, no state management.
- **Con:** No forward secrecy, no recovery from compromise, all history tied to one key.

### Signed Pre-Key Rotation (Signal)
Pre-keys rotated periodically (e.g., monthly). Old pre-keys kept briefly for stragglers, then deleted.
- **Pro:** Limits window of compromise.
- **Con:** Complex state management, clock skew issues.

### Continuous Ratcheting (Double Ratchet)
Key material changes with every message.
- **Pro:** Forward secrecy per message, post-compromise security.
- **Con:** Requires message ordering, state synchronization across devices, incompatible with NOSTR's relay-based async model.

### Epoch-Based Rotation (MLS/TreeKEM)
Group key changes when membership changes or after a fixed interval.
- **Pro:** Efficient for groups (logarithmic cost), provides forward secrecy and post-compromise security.
- **Con:** Complex tree structure, requires ordered delivery of commits.

### Rotation in Async Contexts (NOSTR Mail Consideration)
For a NOSTR-based email protocol:
- Static keys (NIP-44 model) are the pragmatic choice given NOSTR's architecture.
- Forward secrecy could be layered in by publishing pre-key bundles (like Signal's) as NOSTR events, but this adds significant complexity and state management.
- A compromise: periodic key rotation announced via replaceable events (kind 10002-style), with old keys retained for decrypting historical messages. This provides forward secrecy for future messages after rotation but not per-message forward secrecy.

---

## 9. Forward Secrecy in Asynchronous Messaging

### The Fundamental Tension
Forward secrecy requires key material to be ephemeral and deleted after use. Asynchronous messaging requires messages to be decryptable after arbitrary delays. These are in tension.

### X3DH Pre-Keys: The Signal Solution
- Bob pre-publishes ephemeral key bundles.
- Alice uses a bundle to establish a session with forward secrecy.
- **Limitation 1:** If Bob's one-time pre-keys are exhausted, fall back to signed pre-key only (weaker FS).
- **Limitation 2:** If Bob's signed pre-key is not rotated, all sessions initiated during that period share the same DH contribution from Bob.
- **Limitation 3:** The server must be trusted to distribute pre-keys honestly and not retain copies.

### Why NOSTR Cannot Easily Use Pre-Keys
1. **No trusted server.** NOSTR relays are untrusted. A relay could serve stale pre-keys, serve the same one-time pre-key to multiple senders (causing collisions), or withhold pre-keys.
2. **Multi-device.** A NOSTR user may have many clients. Pre-key state must be synchronized across all of them, which is an unsolved problem in the decentralized NOSTR context.
3. **Relay heterogeneity.** Different relays may have different pre-key bundles for the same user, creating inconsistency.

### Partial Forward Secrecy via NIP-59
NIP-59's ephemeral keys provide a weaker form of forward secrecy:
- The outer layer (Gift Wrap) uses ephemeral keys that are discarded.
- An attacker who compromises the recipient's long-term key can decrypt everything (both layers).
- An attacker who compromises only a relay (passive observation) cannot decrypt (no keys available).
- The ephemeral key provides forward secrecy only if the attacker's capability is limited to observing the outer ciphertext AND somehow obtaining the ephemeral private key later -- but since it is discarded, this is impossible.
- In practice, the forward secrecy benefit of NIP-59's ephemeral keys is against the sender's future compromise: if the sender's long-term key is later compromised, the outer Gift Wrap layer cannot be decrypted (the ephemeral key was the sender of that layer). However, the inner Seal layer CAN be decrypted because it used the sender's real key.

---

## 10. Timestamp Randomization

### Purpose in NIP-59
Both the Seal (kind 13) and the Gift Wrap (kind 1059) use randomized `created_at` timestamps to prevent timing analysis.

### How Much Jitter Is Enough?
NIP-59 recommends randomization of approximately +/- 2 days (172,800 seconds) from the actual creation time.

**Analysis:**
- **Against per-message timing:** 2 days of jitter makes it impossible to correlate a Gift Wrap with the exact time a message was composed. An observer sees messages spread across a 4-day window.
- **Against activity pattern analysis:** If Alice typically sends messages during business hours, randomized timestamps break this correlation. However, the relay still sees when the event was submitted (TCP connection time), which is not randomized. A passive network observer can still do traffic analysis.
- **Against ordering attacks:** With 2-day jitter, events cannot be reliably ordered by timestamp. Clients must use the inner Rumor's `created_at` for message ordering (which should reflect the actual time).

**Trade-offs:**
- Too little jitter (< 1 hour): Still reveals approximate timing, defeating the purpose.
- Too much jitter (> 1 week): Events may be rejected by relays with timestamp validity windows, or confuse clients that use timestamps for pruning.
- 2 days is a reasonable balance for most use cases.

**For NOSTR Mail:**
Email has weaker timing-privacy expectations than instant messaging. However, for sensitive communications, timestamp randomization is valuable. The protocol should ensure that the inner Rumor carries the actual send time for the recipient's UI, while outer layers use randomized timestamps.

---

## 11. Common Mistakes When Composing NIP-44 with NIP-59

### Mistake 1: Reusing Conversation Keys Across Layers
**Error:** Using the same ECDH-derived conversation_key for both the Seal and the Gift Wrap layers.
**Why it is wrong:** The Seal uses ECDH(sender, recipient) and the Gift Wrap uses ECDH(ephemeral, recipient). If an implementation incorrectly uses the sender's static key for both, the Gift Wrap layer provides no unlinkability (the same conversation_key appears in both layers, and the "ephemeral" key is not ephemeral).
**Correct approach:** Each layer MUST use a different ECDH pair, producing different conversation_keys and therefore independent encryption keys.

### Mistake 2: Reusing Ephemeral Keys Across Gift Wraps
**Error:** Using the same ephemeral key pair for Gift Wraps sent to multiple recipients (or multiple messages to the same recipient).
**Why it is wrong:** The same ephemeral pubkey appears on multiple Gift Wraps, allowing an observer to link them as originating from the same sender.
**Correct approach:** Generate a fresh ephemeral key for EVERY Gift Wrap event. For multi-recipient messages, each recipient gets a separate Gift Wrap with its own ephemeral key.

### Mistake 3: Including Metadata in Seal Tags
**Error:** Adding tags (e.g., `["p", recipient_pubkey]`) to the Seal (kind 13) event.
**Why it is wrong:** The Seal tags are visible to anyone who can decrypt the Gift Wrap. If the Seal contains recipient tags, the ephemeral-key unlinkability of the Gift Wrap is undermined -- an observer who obtains the recipient's key can now see metadata that should be hidden.
**Correct approach:** Seal tags MUST be empty (`[]`). All metadata goes in the Rumor (where it is double-encrypted) or in the Gift Wrap tags (which are intentionally minimal).

### Mistake 4: Using Real Timestamps on Seal or Gift Wrap
**Error:** Setting `created_at` to the actual current time on the Seal or Gift Wrap.
**Why it is wrong:** Timestamps enable timing correlation. An observer can correlate Gift Wrap timestamps with the sender's online activity patterns.
**Correct approach:** Randomize `created_at` on both the Seal and the Gift Wrap. Use the Rumor's `created_at` for the actual message timestamp.

### Mistake 5: Not Sending a Self-Copy
**Error:** Only sending Gift Wraps to the recipient(s), not to the sender's own pubkey.
**Why it is wrong (for usability):** The sender cannot recover their sent messages on other devices or after data loss. Since NIP-44 is symmetric (both parties derive the same conversation_key), the sender could theoretically re-derive the Seal, but the Gift Wrap is encrypted to the recipient's key.
**Correct approach:** Create an additional Gift Wrap addressed to the sender's own pubkey (with a fresh ephemeral key). This stores an encrypted copy of the sent message for the sender.

### Mistake 6: Deterministic Nonce Generation
**Error:** Deriving the NIP-44 nonce from message content, timestamps, or a counter instead of using a CSPRNG.
**Why it is wrong:** Predictable nonces may lead to nonce reuse (especially counters that reset). Content-derived nonces leak information about the plaintext (identical messages produce identical nonces).
**Correct approach:** Always use 32 bytes from a CSPRNG. NIP-44 explicitly requires this.

### Mistake 7: Skipping HMAC Verification Before Decryption
**Error:** Decrypting the ciphertext first, then checking the HMAC.
**Why it is wrong:** This opens the door to chosen-ciphertext attacks. If decryption produces an error (e.g., invalid JSON after decryption), the attacker can distinguish between HMAC failure and format failure, creating an oracle.
**Correct approach:** Verify HMAC first. If verification fails, reject immediately without attempting decryption.

### Mistake 8: Leaking Padding Information via Error Messages
**Error:** Returning different error codes for "HMAC failed," "padding invalid," and "JSON parse error."
**Why it is wrong:** Different error messages create distinguishable failure modes that an attacker can exploit as oracles.
**Correct approach:** Return a single generic "decryption failed" error for all failure modes. Log detailed errors internally if needed, but never expose them to the sender or network.

### Mistake 9: Not Verifying Rumor Pubkey Matches Seal Pubkey
**Error:** Accepting a Rumor whose `pubkey` differs from the Seal's `pubkey`.
**Why it is wrong:** A malicious relay (or man-in-the-middle with the recipient's key) could craft a valid Gift Wrap containing a Seal that decrypts to a Rumor with a different pubkey, attributing the message to someone who did not send it.
**Correct approach:** After decrypting both layers, verify that `rumor.pubkey == seal.pubkey`. Reject if they differ.

### Mistake 10: Compressing Before Encrypting with Attacker-Controlled Content
**Error:** Compressing message bodies that include attacker-controlled content (e.g., quoted text in a reply) before NIP-44 encryption.
**Why it is wrong:** CRIME/BREACH attack: if the attacker can inject content and observe the compressed+encrypted size, they can extract secrets byte-by-byte via compression ratio changes.
**Correct approach:** Either do not compress, or ensure that attacker-controlled content is separated from secrets before compression. For NOSTR Mail, if quoting previous messages, the quoted portion should not be compressed alongside sensitive headers or new content.
