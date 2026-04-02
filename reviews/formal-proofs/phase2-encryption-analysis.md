# Phase 2: Formal Encryption Analysis -- NOSTR Mail Protocol

> **Document type:** Security analysis deliverable
> **Protocol under analysis:** NOSTR Mail three-layer encryption (NIP-44 + NIP-59)
> **Cryptographic primitives:** secp256k1 ECDH, HKDF-SHA256, ChaCha20, HMAC-SHA256, Schnorr signatures
> **Authored for:** Crypto Designer review; Formal Methods specialist (ProVerif/Tamarin modeling)
> **Date:** 2026-04-01

---

## Table of Contents

1. [Protocol Summary](#1-protocol-summary)
2. [Security Properties Analysis](#2-security-properties-analysis)
   - 2a. Message Confidentiality (IND-CCA2)
   - 2b. Sender Authentication
   - 2c. Sender Anonymity (from relay)
   - 2d. Deniability
   - 2e. Forward Secrecy
   - 2f. Timestamp Privacy
   - 2g. Multi-Recipient Independence
3. [Composition Analysis](#3-composition-analysis)
   - 3a. Nested NIP-44 Encryption
   - 3b. Sign-then-Encrypt-then-Encrypt
   - 3c. HKDF Domain Separation
4. [Known Limitations and Accepted Risks](#4-known-limitations-and-accepted-risks)
5. [Recommendations](#5-recommendations)
6. [Appendix: Formal Notation](#appendix-formal-notation)

---

## 1. Protocol Summary

NOSTR Mail uses the NIP-59 Gift Wrap construction, originally designed for NIP-17 private direct messages, adapted for an email-like protocol. The mail content is carried in a kind 15 rumor. The three layers are:

**Layer 1 -- Rumor (kind 15).** An unsigned Nostr event containing the mail message: sender pubkey, recipient `p` tags, subject, body, attachment references, Cashu payment tokens. The rumor has no `sig` field. It is never published to relays directly.

**Layer 2 -- Seal (kind 13).** The rumor is serialized to JSON and encrypted with NIP-44 under the conversation key derived from `ECDH(sender_priv, recipient_pub)`. The seal event is signed by the sender's real Schnorr keypair. Its `created_at` is randomized within +/-2 days. Its `tags` array is empty.

**Layer 3 -- Gift Wrap (kind 1059).** A fresh ephemeral keypair is generated. The seal is serialized to JSON and encrypted with NIP-44 under the conversation key derived from `ECDH(ephemeral_priv, recipient_pub)`. The gift wrap is signed by the ephemeral key. Its `created_at` is randomized within +/-2 days. It contains a single `["p", recipient_pubkey]` tag for relay routing. The ephemeral private key is destroyed after signing.

**Decryption.** The recipient decrypts the gift wrap using `ECDH(recipient_priv, ephemeral_pub)`, verifies the seal's Schnorr signature against `seal.pubkey`, decrypts the seal using `ECDH(recipient_priv, seal.pubkey)`, and parses the rumor.

**NIP-44 internals (version 0x02):**
```
conversation_key = HKDF-extract(salt="nip44-v2", ikm=ECDH_x(priv_a, pub_b))
nonce = random_bytes(32)
(chacha_key || chacha_nonce || hmac_key) = HKDF-expand(conversation_key, nonce, 76)
padded = length_prefix_2B(plaintext) || zero_pad_to_power_of_2()
ciphertext = ChaCha20(chacha_key, chacha_nonce, counter=0, padded)
mac = HMAC-SHA256(hmac_key, nonce || ciphertext)
payload = base64(0x02 || nonce || ciphertext || mac)
```

---

## 2. Security Properties Analysis

### 2a. Message Confidentiality (IND-CCA2)

**Claim:** The NIP-44 construction provides IND-CCA2-equivalent confidentiality under standard assumptions.

**Analysis:**

**(i) Is NIP-44 IND-CCA2 secure?**

NIP-44 uses an Encrypt-then-MAC (EtM) composition of ChaCha20 and HMAC-SHA256. The standard result of Bellare and Namprempre (2000) establishes that EtM composition of an IND-CPA-secure cipher and a strongly unforgeable MAC yields an IND-CCA2-secure authenticated encryption scheme.

- **ChaCha20 IND-CPA security.** ChaCha20 is a stream cipher. Its keystream is indistinguishable from random under the assumption that ChaCha20 is a secure pseudorandom function (PRF). Given a fresh key and nonce pair, ChaCha20 encryption is IND-CPA secure. In NIP-44, each message derives a fresh (chacha_key, chacha_nonce) pair from HKDF-expand with a random 32-byte nonce, so key/nonce reuse occurs only if the 32-byte random nonce collides (probability ~2^{-128} by birthday bound after 2^{128} messages -- negligible).

- **HMAC-SHA256 strong unforgeability.** HMAC-SHA256 is a PRF under standard assumptions on SHA-256's compression function. It is strongly unforgeable (SUF-CMA): an adversary cannot produce a valid (message, tag) pair not previously seen, even given access to a tagging oracle.

- **EtM composition.** The MAC is computed over `nonce || ciphertext`, which includes all non-static components of the payload. The version byte (0x02) is not included in the MAC input. This is a minor observation: an attacker who modifies the version byte would produce an invalid version that compliant implementations reject before attempting MAC verification. However, for formal completeness, the version byte should be considered associated data. See Recommendation R1.

**Verdict:** NIP-44 achieves IND-CCA2 security under standard assumptions (ChaCha20 is a secure PRF, HMAC-SHA256 is SUF-CMA, HKDF is a secure key derivation function), conditioned on:
- The 32-byte nonce is generated from a CSPRNG with sufficient entropy.
- MAC verification occurs before decryption (the spec requires this).
- MAC comparison is constant-time.

**(ii) Does the double encryption (seal + wrap) strengthen or weaken confidentiality?**

The protocol applies NIP-44 twice with independent keys:
- Inner: `ck_inner = HKDF-extract("nip44-v2", ECDH_x(sender, recipient))`
- Outer: `ck_outer = HKDF-extract("nip44-v2", ECDH_x(ephemeral, recipient))`

Since the ephemeral key is randomly generated and independent of the sender key, `ck_outer` and `ck_inner` are computationally independent (under the Decisional Diffie-Hellman assumption on secp256k1). Double encryption with independent keys cannot weaken confidentiality -- an attacker must break both layers. In the IND-CCA2 game, the outer layer alone suffices for confidentiality. The inner layer provides defense-in-depth: if the outer layer is somehow compromised (e.g., ephemeral key leaked before destruction), confidentiality still holds via the inner layer.

**No known weakening from composition.** There are no cipher interaction effects because the two NIP-44 instances use independent keying material.

**(iii) What happens if the same conversation key is used for multiple messages?**

The inner conversation key `ck_inner` is deterministic for a given (sender, recipient) pair. Multiple messages between the same parties reuse this key. This is safe because each NIP-44 encryption generates a fresh 32-byte random nonce, and all message-specific keys are derived via `HKDF-expand(ck_inner, nonce, 76)`. The HKDF-expand output is a PRF of the nonce; distinct nonces yield computationally independent (chacha_key, chacha_nonce, hmac_key) triples.

The outer conversation key `ck_outer` is fresh per message (new ephemeral key each time), so reuse does not arise.

**Risk:** If a CSPRNG is faulty and produces a repeated 32-byte nonce for two messages under the same `ck_inner`, both messages would be encrypted with identical ChaCha20 key and nonce. The XOR of the two ciphertexts would reveal the XOR of the two padded plaintexts. This is a catastrophic but standard stream cipher failure. The probability is negligible under a correct CSPRNG. See Recommendation R5.

---

### 2b. Sender Authentication

**Claim:** The recipient can verify the sender's identity. No third party can verify it without the recipient's cooperation.

**Analysis:**

The seal (kind 13) is signed with the sender's real Schnorr private key. The seal's `id` is the SHA-256 hash of the serialized event fields, which include the `content` field (the NIP-44 ciphertext of the rumor). The signature is:

```
seal.sig = schnorr_sign(seal.id, sender_privkey)
seal.id = SHA256(serialize(0, seal.pubkey, seal.created_at, 13, [], seal.content))
```

The recipient, after decrypting the gift wrap, obtains the seal JSON and verifies `seal.sig` against `seal.pubkey`. This provides:

- **Sender authentication to recipient:** The recipient knows the seal was created by the holder of `seal.pubkey`, because Schnorr signatures are existentially unforgeable under chosen-message attack (EUF-CMA) under the discrete logarithm assumption on secp256k1.

- **Binding of seal to encrypted content:** The signature covers `seal.id`, which is a hash of `seal.content` (the encrypted rumor). This binds the signature to the specific ciphertext. However, the signature does NOT directly bind to the plaintext rumor -- it binds to the encryption of the rumor.

**Binding analysis: What if the seal signature is over a different message than the rumor?**

The seal signature authenticates the ciphertext (`seal.content`), not the plaintext rumor. Could an attacker produce a seal whose ciphertext decrypts to a different rumor than intended?

- An attacker who does not know the conversation key cannot produce a valid NIP-44 ciphertext that decrypts to a chosen plaintext (IND-CCA2 security prevents this).
- An attacker who knows the conversation key (i.e., the sender or recipient themselves) could in principle construct a different rumor, encrypt it, and produce a valid seal. But this attacker already holds the sender's private key (to sign the seal) or the recipient's private key (to derive the conversation key). In either case, they can already impersonate the sender or recipient directly.
- A relay or third party who does not hold either key cannot manipulate the binding.

**Verdict:** Sender authentication is sound. The seal signature provides EUF-CMA authentication of the sender to the recipient. The binding between signature and plaintext is indirect (via ciphertext) but sufficient under the threat model, because breaking the binding requires knowledge of the conversation key, which implies key compromise.

**Limitation:** Only the recipient can verify sender authentication (they must first decrypt the gift wrap). This is intentional -- it supports deniability (see 2d).

---

### 2c. Sender Anonymity (from relay)

**Claim:** The relay cannot determine the sender's identity from a gift wrap event.

**Analysis:**

The gift wrap (kind 1059) exposes:
- `pubkey`: the ephemeral public key (random, single-use)
- `created_at`: randomized timestamp
- `kind`: 1059 (identifies this as a private message)
- `tags`: `[["p", recipient_pubkey]]`
- `content`: NIP-44 ciphertext (opaque)
- `sig`: Schnorr signature by ephemeral key

The relay learns:

| Observable | Information |
|------------|------------|
| Ephemeral pubkey | Nothing (random, never reused, not linked to sender) |
| Recipient pubkey | **Full recipient identity** (necessary for delivery) |
| Event kind | "This is a gift-wrapped private event" |
| Event size | Approximate padded content length (see 2g) |
| Publication time | When the sender's client submitted the event to the relay |
| IP address | Sender's network address (if not using Tor/VPN) |

**Timing analysis risk.** The relay observes the publication time (when the EVENT message arrives over WebSocket). This is distinct from `created_at` (which is randomized). If the sender publishes the gift wrap immediately after composing the message, the publication time reveals when the message was composed, even though `created_at` is randomized. If the sender has a known posting pattern (e.g., active only during certain hours), the relay could narrow sender candidates by correlating publication times with known activity windows.

**IP-based deanonymization.** If the sender publishes directly to the relay without Tor or a VPN, the relay learns the sender's IP address. Combined with timing, this is a strong deanonymization signal. The ephemeral key hides the cryptographic identity of the sender, but not the network identity.

**Verdict:** Sender anonymity holds at the cryptographic/protocol level -- the ephemeral key construction ensures no on-chain link between the gift wrap and the sender's Nostr identity. Sender anonymity does NOT hold at the network level without additional transport-layer protections (Tor, VPN, proxy relays). Timing side-channels provide partial information. See Recommendation R6.

---

### 2d. Deniability

**Claim:** The sender can plausibly deny having authored a specific message.

**Analysis:**

The protocol provides two types of deniability:

**(i) Rumor deniability (strong).** The rumor (kind 15) is unsigned. There is no cryptographic object that binds the sender's key to the plaintext content. The rumor's `pubkey` field claims to identify the sender, but this field is not signed -- the recipient or anyone else could have constructed a rumor with any pubkey.

**(ii) Seal deniability (computational, not unconditional).** The seal IS signed by the sender. The seal is encrypted inside the gift wrap, so only the recipient can obtain it. The question is: can the recipient prove to a third party that the sender authored the message?

The recipient possesses:
1. The seal event (signed by the sender, containing the encrypted rumor as `content`)
2. The conversation key `ck = HKDF-extract("nip44-v2", ECDH_x(sender, recipient))`
3. The decrypted rumor plaintext

To prove sender authorship to a third party, the recipient would need to:
- Show the seal (proving the sender signed something)
- Demonstrate that `seal.content` decrypts to the specific rumor
- This requires revealing the conversation key or demonstrating the ECDH computation

**Can the recipient reveal the conversation key?**

Yes. The recipient knows their own private key and the sender's public key. They can compute `ck = HKDF-extract("nip44-v2", ECDH_x(recipient_priv, sender_pub))` and reveal this to a third party. The third party can then verify:
- `seal.sig` is valid for `seal.pubkey` (the sender's key) -- this is publicly verifiable given the seal
- `NIP-44-decrypt(ck, seal.content)` yields the rumor plaintext

This constitutes a convincing proof to the third party.

**Can the sender deny this?**

The sender can claim the recipient fabricated the rumor:
- The recipient also knows `ck` (it is symmetric) and could have encrypted any plaintext under `ck`, then constructed a seal with the correct ciphertext.
- But the seal is signed by the sender's key. The sender cannot deny signing the seal (Schnorr signatures are non-repudiable).
- The sender can only claim that the seal contained a different plaintext -- but the recipient can demonstrate the decryption, and any third party with `ck` can verify it.

**The critical subtlety:** Because ECDH is symmetric, both the sender and recipient know `ck`. Either party could have produced the ciphertext in `seal.content`. However, only the sender could have signed the seal. So the sender definitely signed a seal containing that specific ciphertext. And the ciphertext deterministically decrypts to the rumor under `ck`. Therefore, the sender signed a commitment to a ciphertext that decrypts to the rumor.

The sender's remaining deniability argument is: "The recipient could have computed `ck`, encrypted a forged rumor, placed it in the seal's content field, and somehow obtained my signature on the resulting seal ID." This requires the recipient to have obtained a Schnorr signature from the sender on a chosen message (the forged seal ID). Under the EUF-CMA security of Schnorr signatures, this is infeasible unless the recipient has access to a signing oracle for the sender's key.

**Verdict:** Deniability is **computational, not unconditional**. Specifically:

- **Against a third party without the conversation key:** The seal signature alone does not reveal the plaintext. The third party sees only that the sender signed something. Deniability holds.
- **Against a third party who receives the conversation key from the recipient:** The third party can verify the full chain (seal signature -> ciphertext -> decryption -> rumor). Deniability fails computationally -- the sender cannot plausibly explain how the recipient obtained a seal signed by the sender's key containing that specific ciphertext, unless the recipient had a signing oracle.
- **Comparison to unconditional deniability:** Protocols like OTR achieve unconditional deniability by using MAC keys that both parties know, so either party could have produced the MAC. Here, the seal uses a Schnorr signature (not a MAC), which only the sender can produce. This fundamentally limits deniability.

**For the formal model:** The deniability property should be modeled as the inability of a distinguisher to determine, given a seal and conversation key, whether the sender or the recipient produced the seal -- with the constraint that the Schnorr signature can only be produced by the sender. Under this model, the protocol does NOT achieve deniability. The Schnorr signature on the seal is the binding element.

See Recommendation R2.

---

### 2e. Forward Secrecy

**Claim:** The protocol does NOT provide forward secrecy.

**Analysis:**

The inner conversation key is `ck_inner = HKDF-extract("nip44-v2", ECDH_x(sender_priv, recipient_pub))`. This value is deterministic and unchanging for a given (sender, recipient) pair. Compromise of either `sender_priv` or `recipient_priv` at any point in time allows computation of `ck_inner` and decryption of all past messages between those two parties.

The outer conversation key is `ck_outer = HKDF-extract("nip44-v2", ECDH_x(ephemeral_priv, recipient_pub))`. The ephemeral private key is destroyed after wrapping, so `ck_outer` cannot be recomputed from the sender's long-term key alone. However:

- **Recipient key compromise:** If `recipient_priv` is compromised, the attacker can compute `ck_outer = HKDF-extract("nip44-v2", ECDH_x(recipient_priv, ephemeral_pub))` using the ephemeral public key (visible in the gift wrap). The attacker can then decrypt the outer layer, obtain the seal, and (since the seal's sender pubkey is now visible) compute `ck_inner` to decrypt the rumor.

- **Sender key compromise:** If `sender_priv` is compromised, the attacker cannot directly compute `ck_outer` (they do not know `ephemeral_priv`, which was destroyed). The outer layer provides a limited form of forward secrecy against sender key compromise alone. However, the attacker would need to break the outer NIP-44 encryption without `ck_outer`, which requires solving the Computational Diffie-Hellman (CDH) problem for the (ephemeral, recipient) pair. The inner layer provides no forward secrecy: if the sender's key is compromised, the inner `ck_inner` can be computed directly from `(sender_priv, recipient_pub)`.

Wait -- this requires clarification. The attacker compromises `sender_priv`. They observe the gift wrap. The gift wrap is encrypted under `ck_outer = ECDH(ephemeral, recipient)`. The attacker knows neither `ephemeral_priv` nor `recipient_priv`. They cannot compute `ck_outer`. So they cannot decrypt the gift wrap. They cannot even reach the seal.

But if they also compromise the seal by some other means (e.g., they intercept the seal before it was wrapped, or they compromise the relay's storage and find the seal was stored separately -- which should not happen per protocol), they could decrypt the rumor using `ck_inner`.

**Blast radius:**

| Compromised Key | What Is Decryptable |
|-----------------|---------------------|
| `recipient_priv` | ALL past and future messages TO this recipient from ANY sender. Both layers fall: outer via `ECDH(recipient, ephemeral)`, inner via `ECDH(recipient, sender)`. |
| `sender_priv` only | No messages are immediately decryptable (outer layer protects via ephemeral key). But if the attacker also observes the gift wrap and can somehow obtain `recipient_priv` later, all messages become decryptable. The inner layer alone provides no forward secrecy. |
| Both `sender_priv` and `recipient_priv` | All messages between the pair in both directions. |

**Asymmetry observation:** Recipient key compromise is strictly more damaging than sender key compromise alone. This is because the gift wrap's outer layer always uses the recipient's key for ECDH. The ephemeral key construction provides partial protection against sender-only compromise, but no protection against recipient compromise.

**Comparison to Signal Double Ratchet:**

| Property | NOSTR Mail | Signal |
|----------|-----------|--------|
| Forward secrecy per message | No | Yes (symmetric ratchet) |
| Forward secrecy per session | No | Yes (DH ratchet) |
| Post-compromise recovery | No | Yes (DH ratchet heals) |
| Key compromise blast radius | All messages with that key | Only messages in current ratchet epoch |
| Requires interactivity | No | Yes (for DH ratchet advancement) |
| Compatible with async/relay model | Yes | Partially (X3DH enables async start) |

**Verdict:** No forward secrecy. Recipient key compromise decrypts all past messages from all senders. This is an inherent limitation of static ECDH in an asynchronous protocol. The ephemeral key in the gift wrap provides partial mitigation against sender-only compromise, but this is not forward secrecy in the standard cryptographic sense.

---

### 2f. Timestamp Privacy

**Claim:** Randomization of `created_at` within +/-2 days hides the true message creation time.

**Analysis:**

Both the seal and gift wrap `created_at` values are randomized independently within a window of +/-2 days (~345,600 seconds). The rumor's `created_at` preserves the actual timestamp (for message ordering within the client).

**Entropy of the randomized timestamp:** If the randomization is uniform over a 4-day window (345,600 seconds), the entropy is log2(345,600) ~ 18.4 bits. This is modest.

**Correlation with publication time:** The relay records when the gift wrap EVENT message was received (publication time). This is NOT randomized -- it reflects the actual moment the sender's client transmitted the event. The gap between `created_at` and publication time is constrained to be at most ~2 days in either direction. This means:

- If `created_at` is in the future (relative to publication time), the relay knows the actual send time is close to publication time, narrowing the window.
- If `created_at` is in the past, the relay knows the actual send time is between `created_at` and publication time.
- The publication time itself is a strong signal of when the message was actually composed.

**Attack:** A relay can record publication timestamps with high precision. The randomized `created_at` provides no protection against a relay that records when events arrive. The `created_at` randomization only protects against third parties who see the event data but not the publication timing.

**Multiple events:** If a sender sends multiple messages in quick succession, all gift wraps will have similar publication times but different randomized `created_at` values. The publication time clustering reveals the batch.

**Verdict:** Timestamp privacy is weak against the relay operator. The `created_at` randomization hides the true time from third parties who access the event data without publication timing. Against the relay, publication time is the dominant signal, and `created_at` randomization provides negligible additional privacy. See Recommendation R6.

---

### 2g. Multi-Recipient Independence

**Claim:** When a mail is sent to multiple recipients, the individual gift wraps cannot be correlated by a relay.

**Analysis:**

For a mail sent to recipients R1, R2, ..., Rn, the sender creates:
- One rumor (shared)
- One seal per recipient (encrypted under different `ck_inner_i = ECDH(sender, Ri)`)
- One gift wrap per recipient (encrypted under different `ck_outer_i = ECDH(ephemeral_i, Ri)`, with unique `ephemeral_i`)

Correlation vectors:

| Vector | Analysis | Risk |
|--------|----------|------|
| Ephemeral pubkeys | Different random keys per recipient | None |
| `created_at` | Independently randomized per wrap | None (from timestamp alone) |
| Ciphertext content | Different keys yield different ciphertext | None |
| `p` tag (recipient) | Each wrap has a different recipient | Reveals recipient set only if wraps are linkable |
| **Publication timing** | All wraps are typically published within seconds of each other | **HIGH** |
| **Event size** | Same rumor -> similar padded plaintext length -> similar seal size -> similar wrap size | **MEDIUM** |

**Publication timing correlation:** If a sender publishes n gift wraps to the same relay within a narrow time window (e.g., <1 second), and all are kind 1059, a relay can hypothesize they belong to the same multi-recipient message. If the relay rarely sees bursts of kind 1059 events of similar size within short windows, the correlation confidence is high.

Quantification: If the relay receives W kind 1059 events per hour and the sender publishes n wraps within t seconds, the probability of an accidental burst of n same-size events within t seconds is approximately:

```
P(accidental) ~ (W * t / 3600)^n / n!
```

For W=100 events/hour, t=1 second, n=3: P ~ (0.028)^3 / 6 ~ 3.6 * 10^{-6}. This is negligibly small -- the relay can confidently link the wraps.

**Event size correlation:** NIP-44 pads to power-of-2 boundaries. The rumor is the same for all recipients, so the padded size of the encrypted rumor is identical across all seals. The seal (kind 13 event) has the same `pubkey` (sender) and empty tags, so the seal JSON size differs only in `created_at` (randomized but same digit count) and `id`/`sig` (fixed length). The sealed content (NIP-44 ciphertext of the rumor) has identical length across recipients because the padded rumor has the same length and NIP-44 ciphertext length is deterministic given plaintext length.

Wait -- the seal's NIP-44 encryption uses different conversation keys for different recipients, but NIP-44 ciphertext length depends only on padded plaintext length, not on the key. So `len(seal.content)` is identical across all recipients. And the seal JSON structure is identical (`kind:13, tags:[], pubkey:same, created_at:different_but_same_length`). So `len(seal_json)` is approximately the same (differing only if `created_at` values have different digit counts, which is unlikely within a +/-2 day window).

The gift wrap then encrypts the seal JSON with NIP-44, producing a ciphertext whose length depends on `len(seal_json)`. Since `len(seal_json)` is approximately equal across recipients, `len(wrap.content)` is approximately equal. After power-of-2 padding, they may land in the same bucket, making the wraps indistinguishable by size -- or they may differ by one padding level if they straddle a boundary.

**Verdict:** Multi-recipient independence is strong cryptographically (independent keys, independent ciphertexts) but weak against traffic analysis. Publication timing is the primary correlation vector. Event size is a secondary vector. See Recommendations R3 and R6.

---

## 3. Composition Analysis

### 3a. Nested NIP-44 Encryption

The protocol applies NIP-44 twice:
- Inner: `NIP-44-encrypt(ck_inner, rumor_json)` where `ck_inner = HKDF-extract("nip44-v2", ECDH_x(sender, recipient))`
- Outer: `NIP-44-encrypt(ck_outer, seal_json)` where `ck_outer = HKDF-extract("nip44-v2", ECDH_x(ephemeral, recipient))`

**Independence of keys:** Under the Decisional Diffie-Hellman (DDH) assumption on secp256k1, the two ECDH shared secrets are computationally independent (the ephemeral key is random and independent of the sender key). HKDF-extract with the same salt but different IKM produces independent outputs (HKDF-extract is a PRF in the IKM argument, keyed by the salt). Therefore `ck_inner` and `ck_outer` are computationally independent.

**Nested encryption safety:** Encrypting ciphertext C1 under an independent key to produce C2 is safe. The standard result: if E1 and E2 are both IND-CCA2 secure with independent keys, then E2(E1(m)) is at least IND-CCA2 secure (it is at least as strong as the stronger of the two). No known attack is enabled by nesting two IND-CCA2 schemes with independent keys.

**Potential concern: related plaintexts.** The outer encryption encrypts the seal JSON, which contains the inner ciphertext as a substring (in the `content` field). This means the outer plaintext contains data that is itself a function of the inner key. Does this create a related-plaintext issue?

No. IND-CCA2 security guarantees confidentiality regardless of the plaintext's relationship to other keys or ciphertexts. The outer encryption does not "know" that its plaintext contains a ciphertext from the inner encryption. The security proof treats the plaintext as an arbitrary bitstring.

**Verdict:** The nested NIP-44 construction is safe. The two layers use independent keys, and nesting two IND-CCA2 schemes with independent keys preserves IND-CCA2 security.

---

### 3b. Sign-then-Encrypt-then-Encrypt

The composition order is:
1. Construct rumor (unsigned)
2. Encrypt rumor with NIP-44 -> seal.content (inner encryption)
3. Sign the seal with sender's Schnorr key -> seal.sig (signature over encrypted content)
4. Encrypt seal with NIP-44 -> wrap.content (outer encryption)
5. Sign the wrap with ephemeral Schnorr key -> wrap.sig

This is effectively: **Encrypt-then-Sign (inner)**, then **Encrypt-then-Sign (outer)**.

At the inner layer: the seal is `Encrypt(rumor)` then `Sign(Encrypt(rumor))`. The signature is over the hash of the seal event fields including the ciphertext. This is not "sign then encrypt" (which would be `Encrypt(Sign(rumor))`) -- it is "encrypt then sign." The distinction matters:

- **Encrypt-then-Sign** (what the protocol does): The signer commits to the ciphertext. A recipient can verify the signature without decrypting. This prevents surreptitious forwarding: the signature is bound to the specific ciphertext, which is decryptable only by the intended recipient.

- The signature does NOT directly authenticate the plaintext rumor. It authenticates the ciphertext. The binding between ciphertext and plaintext is guaranteed by NIP-44's IND-CCA2 security (a given ciphertext can decrypt to only one plaintext under a given key).

At the outer layer: the gift wrap is `Encrypt(seal)` then `Sign(Encrypt(seal))`. The ephemeral signature serves only to satisfy relay validation requirements (relays verify signatures on all events). It provides no security property beyond that -- the ephemeral key is random and uncorrelated with any identity.

**Is Encrypt-then-Sign safe here?**

The classic concern with Encrypt-then-Sign is that an attacker can strip the signature and re-sign with their own key, claiming authorship of the ciphertext. In this protocol:

- At the outer layer: anyone could strip the ephemeral signature and re-sign with a different ephemeral key. But the ephemeral key carries no identity, so this is irrelevant.
- At the inner layer: an attacker could strip the seal signature and re-sign with their own key, claiming to be the sender. However, the recipient verifies `seal.pubkey` against the rumor's `pubkey` field (after decryption). If an attacker re-signs the seal with their key, `seal.pubkey` would be the attacker's key, which would not match `rumor.pubkey` (the original sender). The recipient would reject this as inconsistent.

**However:** the attacker could modify both `seal.pubkey` and `rumor.pubkey` if they know the conversation key. But to know the conversation key, they need either the sender's or recipient's private key, which already constitutes a key compromise.

**Verdict:** The Encrypt-then-Sign composition is safe in this protocol. The inner signature authenticates the ciphertext (not the plaintext), but IND-CCA2 security ensures a 1:1 binding between ciphertext and plaintext for a given key. The pubkey consistency check (rumor.pubkey == seal.pubkey) prevents re-signing attacks.

---

### 3c. HKDF Domain Separation

Both NIP-44 encryption instances use `HKDF-extract(salt="nip44-v2", ikm=...)` with the same salt but different IKM:
- Inner: `ikm = ECDH_x(sender_priv, recipient_pub)`
- Outer: `ikm = ECDH_x(ephemeral_priv, recipient_pub)`

**Is there a domain separation concern?**

HKDF-extract is defined as `HMAC-SHA256(salt, ikm)`. With the same salt, it acts as a PRF keyed by `"nip44-v2"` applied to the IKM. Two different IKM values produce independent outputs (under the PRF assumption). The lack of an additional domain separator (e.g., "seal" vs "wrap") does not weaken security because the IKM values are already guaranteed to be different (they come from different ECDH computations with different keypairs).

**Edge case:** Could the inner and outer ECDH outputs ever be equal? This would require `ECDH_x(sender, recipient) == ECDH_x(ephemeral, recipient)`, which implies `sender_priv * recipient_pub == ephemeral_priv * recipient_pub`, which implies `sender_priv == ephemeral_priv`. Since the ephemeral key is randomly generated, this occurs with probability ~2^{-256} -- negligible.

**HKDF-expand also shares the same PRK structure:** At the expand stage, each NIP-44 instance uses `HKDF-expand(conversation_key, nonce, 76)` with its own conversation key and a fresh random nonce. No interaction.

**Verdict:** No domain separation issue. The different ECDH outputs provide sufficient separation. Adding explicit domain labels (e.g., "nip44-v2-seal" and "nip44-v2-wrap") would be a defense-in-depth measure but is not cryptographically necessary. See Recommendation R4.

---

## 4. Known Limitations and Accepted Risks

The following limitations are inherent to the protocol's design and are accepted trade-offs:

### L1. No Forward Secrecy

Compromise of the recipient's private key reveals all past messages from all senders. Compromise of the sender's private key does not immediately break confidentiality (the outer ephemeral layer protects), but it breaks sender authentication and enables impersonation. If both keys are compromised, all messages are exposed. There is no mechanism for key ratcheting or per-message ephemeral exchange.

**Accepted because:** NOSTR is an asynchronous, store-and-forward protocol. Forward secrecy requires interactive key exchange or pre-published one-time keys, neither of which is part of the current NOSTR infrastructure.

### L2. No Post-Compromise Security

After a key compromise and subsequent recovery (attacker loses access to the key), the attacker can still decrypt future messages sent to the compromised key. The only recovery mechanism is generating an entirely new keypair.

**Accepted because:** Same as L1 -- requires stateful key ratcheting.

### L3. Recipient Identity Visible to Relay

The `p` tag in the gift wrap reveals the recipient's pubkey. This is necessary for relay-based message delivery.

**Accepted because:** Without this, the relay cannot route the message. Alternative designs (e.g., PIR, private information retrieval) are research-stage and not practical for NOSTR relays.

### L4. Traffic Analysis

Observable signals include:
- Publication timing (when the event is submitted to the relay)
- Event frequency (how often a recipient receives kind 1059 events)
- Event size (approximate message length after padding)
- Multi-recipient burst patterns (multiple wraps published simultaneously)
- Relay selection patterns (which relays are used for delivery)

These signals can reveal communication patterns even without decrypting content.

**Accepted because:** Mitigations (Tor, dummy traffic, delayed publishing, relay mixing) are application-layer concerns, not protocol-layer.

### L5. Deniability Is Computational, Not Unconditional

The seal's Schnorr signature binds the sender to the ciphertext. A recipient who reveals the conversation key can prove sender authorship to a third party. Unconditional deniability (where the recipient could have forged the proof) is not achieved.

**Accepted because:** Achieving unconditional deniability would require replacing the seal signature with a deniable authentication mechanism (e.g., a MAC using the shared conversation key). This would sacrifice sender authentication guarantees and complicate the protocol.

### L6. Padding Reduces But Does Not Eliminate Length Leakage

NIP-44's power-of-2 padding groups messages into buckets. Within a bucket, messages are indistinguishable by length. Across buckets, an observer can determine the approximate size range. For mail messages, which can vary enormously in length (from one-line replies to multi-page letters with attachments), the bucket boundaries may be wide enough to be informative.

**Specific risk for NOSTR Mail:** Mail messages contain structured data (subject, body, attachment references, Cashu tokens). A message with attachments will be significantly larger than one without, and this difference survives padding.

### L7. No Protection Against Compromised Endpoints

If the sender's or recipient's client software is compromised, all cryptographic protections are moot. The plaintext is available in memory before encryption and after decryption.

---

## 5. Recommendations

### R1. Include Version Byte in MAC Input (NIP-44 Specification)

**Severity:** Low
**Status:** The NIP-44 MAC is computed over `nonce || ciphertext`. The version byte (0x02) is not included. While compliant implementations reject unknown versions before MAC verification, including the version byte in the MAC input would provide cryptographic binding: `mac = HMAC-SHA256(hmac_key, version_byte || nonce || ciphertext)`. This prevents version confusion attacks in hypothetical future multi-version environments.

**Note:** This is a recommendation for the NIP-44 specification. Changing this would break backward compatibility with existing NIP-44 v2 implementations. It should be considered for a future version (v3).

### R2. Document Deniability Limitations Precisely in the Spec

**Severity:** Medium
**Action:** The NOSTR Mail specification should explicitly state that deniability is computational, not unconditional, and that the seal's Schnorr signature is the binding element. Users should not rely on deniability as a strong guarantee. The spec should note: "A recipient who reveals the NIP-44 conversation key can demonstrate the plaintext content of a sealed message to a third party. The sender cannot plausibly deny this unless the third party is willing to entertain the hypothesis that the recipient obtained a Schnorr signature forgery."

### R3. Stagger Multi-Recipient Publication

**Severity:** Medium
**Action:** When sending to multiple recipients, implementations SHOULD add random delays (on the order of seconds to minutes) between publishing individual gift wraps. This mitigates publication-timing correlation. The specification should recommend this as a SHOULD-level requirement.

### R4. Consider Explicit Domain Labels for Future Versions

**Severity:** Low (informational)
**Status:** Not cryptographically necessary (see analysis 3c), but adding distinct salts for seal-layer and wrap-layer HKDF would provide defense-in-depth. Example: `"nip44-v2-seal"` and `"nip44-v2-wrap"`. This would require changes to NIP-44 or a NOSTR Mail-specific extension. Not recommended for immediate implementation due to backward compatibility constraints, but should be considered for future protocol versions.

### R5. CSPRNG Requirements

**Severity:** High
**Action:** The specification MUST explicitly require that the 32-byte NIP-44 nonce and the ephemeral keypair be generated from a cryptographically secure pseudorandom number generator (CSPRNG) with at least 256 bits of entropy. Implementations on platforms with weak PRNGs (e.g., embedded devices, certain browser environments) MUST use a well-vetted CSPRNG (e.g., `crypto.getRandomValues()` in browsers, `/dev/urandom` on Unix, `BCryptGenRandom` on Windows). The specification should warn that PRNG failure is catastrophic: nonce reuse breaks ChaCha20 confidentiality; ephemeral key predictability breaks sender anonymity.

### R6. Traffic Analysis Mitigations (Application Guidance)

**Severity:** Medium
**Action:** The specification or an accompanying implementation guide should document the following mitigations:
- **Publication delay:** Add random delay (seconds to minutes) before publishing gift wraps.
- **Dummy traffic:** Periodically publish kind 1059 events to oneself (dummy messages) to obscure real traffic patterns.
- **Relay diversity:** Publish to multiple relays via different network paths.
- **Transport privacy:** Recommend Tor or VPN for relay connections where sender anonymity is critical.
- **Batch avoidance:** When sending to multiple recipients, stagger publications (see R3).

### R7. Seal Signature Verification Is Mandatory

**Severity:** High
**Action:** The specification MUST state that implementations MUST verify the seal's Schnorr signature and MUST verify that `seal.pubkey == rumor.pubkey`. Failure to verify the seal signature allows any party who can deliver a gift wrap to the recipient to impersonate any sender. Failure to verify pubkey consistency allows an attacker who knows the conversation key to substitute the rumor.

### R8. Ephemeral Key Destruction

**Severity:** High
**Action:** The specification MUST state that the ephemeral private key MUST be destroyed (zeroed in memory) immediately after signing the gift wrap. The ephemeral key MUST NOT be written to persistent storage. If the ephemeral key is recovered by an attacker, it enables decryption of the outer layer (revealing the seal, including the sender's identity). Implementations should use secure memory wiping (e.g., `sodium_memzero`, `SecureRandom.clear()`) rather than relying on garbage collection.

### R9. Constant-Time Operations

**Severity:** High
**Action:** The specification MUST require constant-time comparison for HMAC verification. Implementations SHOULD use constant-time operations for all secret-dependent branching (ECDH computation, HKDF, ChaCha20). Variable-time operations create timing side-channels that can leak key material.

### R10. Properties for Formal Verification (ProVerif/Tamarin)

**Severity:** N/A (guidance for Formal Methods specialist)
**Action:** The following properties should be modeled and verified:

| Property | Formal Statement | Tool |
|----------|-----------------|------|
| Confidentiality | An attacker who does not hold `recipient_priv` cannot distinguish `encrypt(m0)` from `encrypt(m1)` | ProVerif (reachability/equivalence) |
| Sender authentication | If the recipient accepts a message as from pubkey P, then P's private key was used to sign the seal | Tamarin (authentication lemma) |
| Sender anonymity (relay) | A relay that observes the gift wrap cannot distinguish between two candidate senders | ProVerif (observational equivalence) |
| Multi-recipient unlinkability | A relay observing two gift wraps cannot determine if they contain the same rumor | ProVerif (observational equivalence, requires modeling timing) |
| No forward secrecy (expected failure) | Model key compromise: after compromising `recipient_priv`, attacker can decrypt past messages | Tamarin (expected negative result, validates model) |
| Seal-rumor binding | If the recipient decrypts a seal signed by P and obtains rumor R, then P encrypted R (no substitution) | Tamarin (injective agreement) |

**Modeling notes:**
- Model NIP-44 as an AEAD black box (encrypt/decrypt with key and nonce).
- Model ECDH as a standard DH operation on an abstract group.
- Model HKDF as a random oracle.
- Model Schnorr signatures as EUF-CMA-secure signatures.
- The ephemeral key should be modeled as a fresh name generated per session.
- Timestamp randomization need not be modeled for confidentiality/authentication properties but should be modeled (as an observable output) for anonymity properties.

---

## Appendix: Formal Notation

For reference in subsequent formal verification work:

```
-- Participants
S       : sender (long-term keypair sk_S, pk_S)
R       : recipient (long-term keypair sk_R, pk_R)
E       : ephemeral (fresh keypair sk_E, pk_E, generated per message)

-- Key Derivation
ecdh(sk, pk)    = x-coordinate of sk * pk on secp256k1
hkdf_ext(s, i)  = HMAC-SHA256(s, i)                           -- HKDF-extract
hkdf_exp(k, n)  = HKDF-expand(k, n, 76)                       -- outputs (k_c, n_c, k_m)

ck_inner        = hkdf_ext("nip44-v2", ecdh(sk_S, pk_R))
ck_outer        = hkdf_ext("nip44-v2", ecdh(sk_E, pk_R))

-- NIP-44 Encryption
nip44_enc(ck, m) :
  nonce <- random(32)
  (k_c, n_c, k_m) = hkdf_exp(ck, nonce)
  pt = pad(len_prefix(m))
  ct = ChaCha20(k_c, n_c, pt)
  mac = HMAC-SHA256(k_m, nonce || ct)
  return base64(0x02 || nonce || ct || mac)

-- Protocol
rumor           = {kind:15, pubkey:pk_S, content:mail_body, tags:..., sig:""}
seal.content    = nip44_enc(ck_inner, serialize(rumor))
seal            = {kind:13, pubkey:pk_S, tags:[], content:seal.content,
                   created_at:rand_time(), id:H(seal_fields), sig:SchnorrSign(sk_S, seal.id)}
wrap.content    = nip44_enc(ck_outer, serialize(seal))
wrap            = {kind:1059, pubkey:pk_E, tags:[["p",pk_R]], content:wrap.content,
                   created_at:rand_time(), id:H(wrap_fields), sig:SchnorrSign(sk_E, wrap.id)}
destroy(sk_E)

-- Decryption (by R)
seal_json       = nip44_dec(ck_outer, wrap.content)           -- using ecdh(sk_R, pk_E)
verify(seal.sig, seal.pubkey, seal.id)                        -- Schnorr verify
rumor_json      = nip44_dec(ck_inner, seal.content)           -- using ecdh(sk_R, seal.pubkey)
assert(rumor.pubkey == seal.pubkey)
```

---

*This document is a Phase 2 deliverable of the NOSTR Mail formal review. It is intended for review by the Crypto Designer and as input to the Formal Methods specialist for ProVerif/Tamarin modeling.*
