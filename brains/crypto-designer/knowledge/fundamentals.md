# Cryptographic Fundamentals Reference

This document is a comprehensive reference for an AI agent acting as a cryptographic protocol designer and reviewer, with particular focus on the primitives used in NOSTR's encryption stack (NIP-44, NIP-59) and related protocols.

---

## 1. Symmetric Encryption: ChaCha20

### Construction
ChaCha20 is a 256-bit stream cipher designed by Daniel J. Bernstein, standardized in RFC 8439. It is the encryption primitive used in NIP-44 version 2.

**Algorithm parameters:**
- Key size: 256 bits (32 bytes)
- Nonce size: 96 bits (12 bytes) in the IETF variant (RFC 8439); 64 bits in the original Bernstein variant
- Block size: 512 bits (64 bytes)
- Counter: 32-bit (IETF) or 64-bit (original)
- Rounds: 20 (ChaCha20); reduced-round variants ChaCha12 and ChaCha8 exist but are not used in NOSTR

**How it works:**
1. Initialize a 4x4 matrix of 32-bit words from: four constant words ("expand 32-byte k"), eight key words, one counter word, and three nonce words.
2. Perform 20 rounds (10 column rounds + 10 diagonal rounds) of quarter-round operations. Each quarter-round applies: addition, XOR, and bitwise rotation (ARX construction).
3. Add the original state matrix to the output (prevents invertibility without the key).
4. Serialize the 64-byte output block as the keystream.
5. XOR the keystream with plaintext to produce ciphertext.

**Quarter-round operations (a, b, c, d):**
```
a += b; d ^= a; d <<<= 16;
c += d; b ^= c; b <<<= 12;
a += b; d ^= a; d <<<= 8;
c += d; b ^= c; b <<<= 7;
```

### Why ChaCha20 Over AES in NOSTR's Context

1. **Software performance without hardware acceleration.** AES achieves competitive speed only with AES-NI instructions. ChaCha20 is fast on all platforms using only add/xor/rotate, making it ideal for the heterogeneous client ecosystem of NOSTR (mobile, browser, embedded).

2. **Side-channel resistance.** AES table-lookup implementations are vulnerable to cache-timing attacks. ChaCha20's ARX construction uses only constant-time operations, eliminating this entire class of side channels without requiring specialized countermeasures.

3. **Multi-key security.** In NOSTR, millions of key pairs coexist. ChaCha20 has better multi-key security bounds than AES, meaning the probability of any compromise across the entire ecosystem is lower for a given usage volume.

4. **Simpler implementation.** Fewer opportunities for implementation bugs compared to AES modes, which require careful IV/nonce management, padding (in CBC), and separate authentication.

5. **Nonce misuse tolerance.** While ChaCha20 alone is not nonce-misuse resistant, its large random nonce space (96-bit IETF or 256-bit XChaCha20) makes accidental collision far less likely than AES-GCM's 96-bit constraint under multi-key usage. NIP-44 uses a 32-byte random nonce fed into HKDF to derive a 12-byte ChaCha20 nonce, further reducing collision probability.

### Security Level
ChaCha20 provides 256-bit security against key recovery. The best known attack on full 20-round ChaCha is generic brute force. Reduced-round variants (ChaCha7 and below) have known differential-linear distinguishers, but these do not threaten ChaCha20.

---

## 2. HMAC-SHA256

### Construction
HMAC (Hash-based Message Authentication Code) as defined in RFC 2104, instantiated with SHA-256 (RFC 6234).

**Parameters:**
- Key size: Variable; recommended >= 256 bits. NIP-44 uses a 256-bit (32-byte) HMAC key.
- Output size: 256 bits (32 bytes)
- Block size of SHA-256: 512 bits (64 bytes)

**Definition:**
```
HMAC-SHA256(K, M) = SHA256((K' XOR opad) || SHA256((K' XOR ipad) || M))
```
Where:
- K' = K if |K| <= 64 bytes; K' = SHA256(K) if |K| > 64 bytes
- ipad = 0x36 repeated 64 times
- opad = 0x5C repeated 64 times

### Security Properties

1. **Unforgeability (UF-CMA).** An attacker who does not know K cannot produce a valid HMAC for any new message, even after observing HMAC values for chosen messages. Security holds as long as SHA-256 is a pseudorandom function (PRF), which is a weaker assumption than collision resistance.

2. **PRF security.** HMAC-SHA256 is a PRF under the assumption that the compression function of SHA-256 is a PRF. This property is essential for its use in HKDF.

3. **Resistance to length-extension attacks.** Unlike raw SHA-256, HMAC is not vulnerable to length-extension. The double-hash construction ensures that appending data to a message does not allow computing the HMAC of the extended message.

4. **Related-key resistance.** The ipad/opad construction provides domain separation between the inner and outer hash calls, preventing related-key attacks.

### Use in NIP-44: Encrypt-then-MAC
NIP-44 uses the Encrypt-then-MAC (EtM) composition:
1. Encrypt the padded plaintext with ChaCha20.
2. Compute HMAC-SHA256 over `nonce || ciphertext` using a separate HMAC key.
3. On decryption, verify the HMAC FIRST, before any decryption.

This ordering is critical. EtM is the only generic composition that provably achieves IND-CCA2 from an IND-CPA cipher and a UF-CMA MAC (Bellare & Namprempre, 2000). The alternative orderings (Encrypt-and-MAC, MAC-then-Encrypt) have known vulnerabilities; see Section 10 below.

### Why HMAC-SHA256 Over Poly1305 in NIP-44
NIP-44 deliberately chose HMAC-SHA256 over Poly1305 (as used in ChaCha20-Poly1305/AEAD):
- **Nonce reuse tolerance.** Poly1305 is a one-time MAC based on polynomial evaluation over GF(2^130 - 5). If a nonce is reused with the same key, the Poly1305 key can be recovered, enabling universal forgery. HMAC-SHA256 degrades gracefully under nonce reuse (only confidentiality is lost, not authentication).
- **Implementation simplicity.** HMAC-SHA256 is universally available and well-understood. Poly1305 has subtle implementation pitfalls (carrying, reduction modulo 2^130 - 5).
- **Multi-user robustness.** In NOSTR's multi-user context, HMAC-SHA256 provides stronger guarantees across the ecosystem.

---

## 3. HKDF: Extract-and-Expand

### Construction
HKDF (HMAC-based Key Derivation Function) as defined in RFC 5869, based on Krawczyk's 2010 paper "Cryptographic Extraction and Key Derivation: The HKDF Scheme."

**Two phases:**

#### HKDF-Extract
```
PRK = HMAC-Hash(salt, IKM)
```
- Extracts a pseudorandom key (PRK) from input keying material (IKM) that may not be uniformly distributed (e.g., an ECDH shared secret).
- Salt: optional but recommended. If omitted, defaults to a string of zeros of length HashLen.
- Output: A PRK of length HashLen (32 bytes for SHA-256).

#### HKDF-Expand
```
T(1) = HMAC-Hash(PRK, info || 0x01)
T(2) = HMAC-Hash(PRK, T(1) || info || 0x02)
...
T(N) = HMAC-Hash(PRK, T(N-1) || info || 0x0N)
OKM = T(1) || T(2) || ... (first L bytes)
```
- Expands the PRK into output keying material (OKM) of arbitrary length.
- `info`: context/application-specific string for domain separation.
- Maximum output: 255 * HashLen bytes.

### Domain Separation
The `info` parameter in HKDF-Expand provides domain separation, ensuring that keys derived for different purposes are cryptographically independent even if derived from the same PRK. This is critical for NIP-44, which derives three keys from one expansion:
- ChaCha20 key (32 bytes)
- ChaCha20 nonce (12 bytes)
- HMAC key (32 bytes)
- Total: 76 bytes from one HKDF-Expand call

### Salt Usage
The salt in HKDF-Extract serves two purposes:
1. **Entropy extraction.** Even if the IKM has non-uniform entropy (common with ECDH outputs), the salt-based extraction produces a uniformly distributed PRK.
2. **Domain separation at the extract level.** Different salts produce independent PRKs. NIP-44 uses the literal string `"nip44-v2"` as the salt, binding the derived key to this specific protocol version.

### NIP-44's Specific Usage
```
conversation_key = HKDF-Extract(salt="nip44-v2", IKM=ecdh_shared_x)  // 32 bytes
message_keys     = HKDF-Expand(PRK=conversation_key, info=nonce, L=76)
```
The 32-byte random nonce serves as the `info` parameter, ensuring that every message encryption derives a unique set of (chacha_key, chacha_nonce, hmac_key) even though the conversation_key is static between two parties.

---

## 4. ECDH on secp256k1

### Curve Parameters
secp256k1 is a Koblitz curve defined over the prime field GF(p) where:
- p = 2^256 - 2^32 - 2^9 - 2^8 - 2^7 - 2^6 - 2^4 - 1 (= FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F)
- Curve equation: y^2 = x^3 + 7 (a = 0, b = 7)
- Generator point G is specified in the SEC2 standard
- Order n = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
- Cofactor h = 1

### Shared Secret Derivation
Given Alice's private key a and Bob's public key B = bG:
```
shared_point = a * B = a * b * G
shared_secret = shared_point.x  (32 bytes, X coordinate only)
```

NIP-44 uses only the X coordinate of the shared point as input key material to HKDF-Extract. This is standard practice (also used in X25519/ECDH).

### Cofactor Considerations
secp256k1 has cofactor h = 1, which means:
- Every point on the curve (except the identity) has order n.
- There are no small-subgroup attacks. No cofactor multiplication is needed.
- This simplifies the protocol compared to curves with h > 1 (e.g., Curve25519 with h = 8, which requires cofactor clamping or verification).

### Security Level
secp256k1 provides approximately 128 bits of security against the elliptic curve discrete logarithm problem (ECDLP). The best known classical attack is Pollard's rho, requiring O(sqrt(n)) ~ 2^128 operations.

### Static vs. Ephemeral ECDH
NIP-44 uses **static-static ECDH**: both parties use their long-term NOSTR identity keys. This means:
- The conversation_key between any two parties is deterministic and reusable.
- **No forward secrecy**: compromise of either party's private key reveals all past messages encrypted with that conversation_key.
- NIP-59 partially mitigates this at the outer layer by using ephemeral keys for the Gift Wrap, but the inner Seal layer still uses static ECDH.

---

## 5. Schnorr Signatures (BIP-340)

### Construction
BIP-340 defines Schnorr signatures over secp256k1 with the following specific design choices:

**Key representation:**
- Public keys are 32-byte X-only (the Y coordinate is implicitly even). This saves 1 byte per public key compared to compressed SEC encoding.
- Private keys are 32-byte scalars. If the corresponding public key has an odd Y, the private key is negated before signing (to ensure the implicit even-Y convention).

**Parameters:**
- Private key: 32 bytes (scalar in [1, n-1])
- Public key: 32 bytes (X coordinate only)
- Signature: 64 bytes (R.x || s, where R is 32 bytes and s is 32 bytes)
- Hash function: SHA-256 with tagged hashing

**Tagged hashing:**
```
tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
```
The double-hash of the tag is a fixed 64-byte prefix, pre-computable for each tag. Tags used: "BIP0340/aux", "BIP0340/nonce", "BIP0340/challenge".

### Signing Algorithm
Given private key d, message m:
1. Let P = d*G. If P.y is odd, set d = n - d.
2. Let t = d XOR tagged_hash("BIP0340/aux", a) where a is 32 bytes of auxiliary randomness.
3. Let rand = tagged_hash("BIP0340/nonce", t || P.x || m).
4. Let k' = int(rand) mod n. Fail if k' = 0.
5. Let R = k'*G. If R.y is odd, set k = n - k'. Else k = k'.
6. Let e = int(tagged_hash("BIP0340/challenge", R.x || P.x || m)) mod n.
7. Signature = bytes(R.x) || bytes((k + e*d) mod n).

### Verification Algorithm
Given public key P (32 bytes), message m, signature (R.x, s):
1. Let P = lift_x(int(P_bytes)). Fail if P is not on the curve.
2. Let r = int(R.x_bytes), s = int(s_bytes). Fail if r >= p or s >= n.
3. Let e = int(tagged_hash("BIP0340/challenge", R.x || P.x || m)) mod n.
4. Let R' = s*G - e*P.
5. Verify: R'.y is even AND R'.x = r.

### Batch Verification
BIP-340 signatures support efficient batch verification. Given signatures (P_i, m_i, R_i, s_i) for i = 1..u:
1. Generate random scalars a_1 = 1, a_2, ..., a_u from [1, n-1].
2. Verify: (sum of a_i * s_i)*G = sum of a_i * R_i + sum of a_i * e_i * P_i.
3. This is a single multi-scalar multiplication, which is faster than u individual verifications by a factor of roughly 2-3x using Strauss's or Pippenger's algorithm.

Batch verification is relevant for NOSTR relay implementations that must verify many event signatures rapidly.

### Security Properties
- **EUF-CMA (Existential Unforgeability under Chosen Message Attack):** Proven secure in the random oracle model under the discrete logarithm assumption on secp256k1.
- **Non-malleability:** BIP-340's even-Y convention and X-only public keys eliminate signature malleability (unlike ECDSA, which has s/n-s malleability).
- **No third-party nonce manipulation:** The nonce derivation incorporates the private key, preventing nonce-related attacks even if auxiliary randomness is manipulated.

---

## 6. Chaumian Blind Signatures (BDHKE)

### Context
Cashu is an ecash protocol used in the NOSTR ecosystem for anonymous payments. It implements David Chaum's blind signature scheme using a Blind Diffie-Hellman Key Exchange (BDHKE) variant over secp256k1.

### How BDHKE Works

**Setup:**
- Mint has keypair: private key k, public key K = k*G.
- Hash-to-curve function: Y = hash_to_curve(x), which deterministically maps a message x to a point on secp256k1.

**Minting (Blinding and Signing):**

1. **User creates a secret:** User generates a random secret x.
2. **Hash to curve:** Y = hash_to_curve(x). This maps x to a curve point.
3. **Blinding:** User generates a random blinding factor r and computes:
   - B' = Y + r*G (the blinded message)
4. **Blind signing:** Mint computes:
   - C' = k*B' (signature on the blinded message)
5. **Unblinding:** User computes:
   - C = C' - r*K = k*B' - r*k*G = k*(Y + r*G) - r*k*G = k*Y
6. **Token:** The ecash token is (x, C) where C = k*Y = k*hash_to_curve(x).

**Verification (Spending):**

1. User presents (x, C) to the mint.
2. Mint computes Y = hash_to_curve(x) and verifies C == k*Y.
3. Mint records x as spent (prevents double-spending).

### Security Properties
- **Blindness:** The mint sees B' = Y + r*G during signing but cannot determine Y (and therefore x) because r is random. The mint cannot link the signing session to the eventual spending.
- **Unforgeability:** Without knowing k, a user cannot produce a valid (x, C) pair. This holds under the discrete logarithm assumption.
- **Unlinkability:** The mint cannot correlate a blinded signing request with a later spending event, providing transaction privacy.

### Cashu NUT Specifications
- **NUT-00:** Token format, base structures, and hash_to_curve specification.
- **NUT-01:** Mint public key distribution.
- **NUT-02:** Keysets and key rotation for denomination-specific keys.
- **NUT-03:** Swap (split and merge tokens).
- **NUT-04:** Minting tokens (Lightning invoice -> ecash).
- **NUT-05:** Melting tokens (ecash -> Lightning payment).
- **NUT-06:** Mint information endpoint.
- **NUT-07:** Token state check (spent/unspent).
- **NUT-08:** Lightning fee return (overpayment handling).
- **NUT-09:** Restore (backup recovery via blinded signatures).
- **NUT-10:** Spending conditions (P2PK, hash locks).
- **NUT-11:** Pay-to-Public-Key (P2PK) with Schnorr signatures for spending authorization.
- **NUT-12:** Deterministic Secrets and Blinding (DLEQ proofs for mint transparency).
- **NUT-13:** Deterministic secret derivation from a seed phrase (BIP-32 style).

### DLEQ Proofs (NUT-12)
To prove that the mint signed correctly (C' = k*B') without revealing k, the mint provides a DLEQ proof: a proof that log_G(K) = log_B'(C'). This is a Chaum-Pedersen proof:
1. Mint picks random r, computes R1 = r*G, R2 = r*B'.
2. e = hash(R1 || R2 || K || C').
3. s = r + e*k.
4. Verifier checks: s*G == R1 + e*K and s*B' == R2 + e*C'.

---

## 7. Key Derivation Patterns

### Conversation Keys (NIP-44)
A conversation key is the long-term shared secret between two NOSTR identities:
```
shared_point = ECDH(privkey_A, pubkey_B)
conversation_key = HKDF-Extract(salt="nip44-v2", IKM=shared_point.x)
```
Properties:
- Deterministic: same two parties always derive the same conversation_key.
- Symmetric: ECDH(a, B) = ECDH(b, A), so both parties derive the same key.
- Should be cached per-contact to avoid redundant ECDH computations.

### Per-Message Keys (NIP-44)
Each message encryption generates fresh subkeys:
```
nonce = random(32)  // 256 bits of randomness
keys = HKDF-Expand(PRK=conversation_key, info=nonce, L=76)
chacha_key   = keys[0:32]    // 256-bit encryption key
chacha_nonce = keys[32:44]   // 96-bit IETF ChaCha20 nonce
hmac_key     = keys[44:76]   // 256-bit MAC key
```
The separation of encryption and MAC keys from a single HKDF expansion is safe because HKDF-Expand output is pseudorandom, and different byte ranges are cryptographically independent.

### Nonce Generation
NIP-44 generates a 32-byte random nonce per message. This nonce is:
- Used as the `info` parameter to HKDF-Expand (not directly as the ChaCha20 nonce).
- Transmitted in the clear as part of the payload (bytes 1-32 after the version byte).
- Must be generated from a cryptographically secure PRNG (CSPRNG).

The 256-bit nonce space makes collision probability negligible: after 2^64 messages with the same conversation_key, the collision probability is still only ~2^-128 (birthday bound).

### Ephemeral Key Generation (NIP-59)
For each Gift Wrap:
1. Generate a fresh secp256k1 private key from a CSPRNG.
2. Compute the corresponding public key.
3. Use the ephemeral private key for one NIP-44 encryption (the outer Gift Wrap layer).
4. Discard the ephemeral private key permanently.

This provides:
- **Unlinkability:** Each Gift Wrap appears to come from a different sender.
- **Partial forward secrecy:** Compromise of the ephemeral key (impossible if discarded) cannot help decrypt, since only the recipient's private key is needed for decryption.

---

## 8. Padding Schemes

### NIP-44 Power-of-2 Padding
NIP-44 uses a custom padding scheme designed to hide message lengths:

**Algorithm:**
1. Prepend a 2-byte big-endian length prefix (the actual unpadded message length).
2. Compute the padded length:
   - If message length <= 32: pad to 32 bytes.
   - Otherwise: find the next power-of-2 boundary in a scheme that provides increasing granularity. The padded size is the smallest value in the padding schedule that is >= message length.
3. Append zero bytes to reach the padded length.
4. On decryption: read the 2-byte length prefix, extract that many bytes, verify remaining bytes are all zero.

**Padding schedule (approximate):**
| Message length | Padded to |
|---|---|
| 1-32 | 32 |
| 33-64 | 64 |
| 65-128 | 128 |
| ... | ... (powers of 2) |

**Why power-of-2?** Messages of lengths 1, 15, and 31 all produce 32-byte padded ciphertext. An observer cannot distinguish between these lengths. The trade-off is bandwidth: a 33-byte message is padded to 64, wasting 31 bytes.

### Trade-offs

| Scheme | Length Leakage | Overhead | Padding Oracle Risk |
|---|---|---|---|
| No padding | Exact length revealed | None | N/A |
| Fixed block (PKCS#7) | Leaks length mod block_size | Low | High (Vaudenay 2002) |
| Power-of-2 (NIP-44) | Leaks approximate magnitude | Moderate | None (verified separately) |
| Constant size | Zero leakage | High (all messages same size) | None |

NIP-44's approach is a pragmatic compromise between metadata leakage and efficiency. For a mail protocol, where message sizes vary widely (1 KB to 100 KB), power-of-2 padding still reveals order-of-magnitude size, which may be acceptable depending on the threat model.

### Padding Verification
NIP-44 requires that on decryption, all padding bytes after the actual message content are verified to be zero. This prevents an attacker from manipulating padding bytes and is checked AFTER HMAC verification (so timing of padding verification is not exploitable).

---

## 9. Composition Theorems

### Generic Composition (Bellare & Namprempre, 2000)

The three generic composition methods for combining an encryption scheme E and a MAC M:

#### Encrypt-then-MAC (EtM) -- RECOMMENDED
```
c = E(k1, m)
t = MAC(k2, c)
output (c, t)
```
- **Security:** If E is IND-CPA and M is UF-CMA, then EtM is IND-CCA2.
- **Proof sketch:** An adversary cannot tamper with the ciphertext because the MAC will reject. An adversary cannot learn about the plaintext from the ciphertext because E is IND-CPA.
- **NIP-44 uses this pattern:** ChaCha20 encryption followed by HMAC-SHA256 over the nonce and ciphertext.

#### MAC-then-Encrypt (MtE) -- DANGEROUS
```
t = MAC(k2, m)
c = E(k1, m || t)
output c
```
- **Security:** NOT generically IND-CCA2. Can be made secure with specific instantiations (e.g., TLS 1.2 with certain ciphers), but has led to numerous real-world vulnerabilities.
- **Attacks:** Padding oracle attacks (POODLE, Lucky Thirteen) exploit the fact that the ciphertext is processed before the MAC is verified, allowing an attacker to distinguish between padding errors and MAC errors.

#### Encrypt-and-MAC (E&M) -- DANGEROUS
```
c = E(k1, m)
t = MAC(k2, m)
output (c, t)
```
- **Security:** NOT generically IND-CPA. The MAC may leak information about the plaintext (MACs are not required to be message-hiding). For example, a deterministic MAC reveals whether two plaintexts are identical.
- **Used by:** Original SSH (fixed in later versions).

### Key Separation
All composition theorems assume independent keys for encryption and MAC. NIP-44 achieves this by deriving both from a single HKDF-Expand call but using non-overlapping byte ranges, which is cryptographically equivalent to independent keys under the PRF assumption on HKDF.

### When is Composition Safe?
Composing IND-CCA2 primitives is generally safe when:
1. Keys are independent (or derived independently via a PRF/KDF).
2. The composition does not introduce new information channels (timing, error messages).
3. Each layer operates on the output of the previous layer, not on shared state.
4. Nonces/IVs are generated independently for each layer.

NIP-59's layered encryption is safe under these criteria: the Seal and Gift Wrap layers use different ECDH pairs (and therefore different conversation keys), independent nonces, and sequential application.

---

## 10. Security Notions

### Confidentiality Notions

**IND-CPA (Indistinguishability under Chosen Plaintext Attack):**
An adversary who can encrypt arbitrary messages cannot distinguish which of two chosen plaintexts was encrypted. Formally: for any PPT adversary A, |Pr[A wins the left-or-right game] - 1/2| is negligible.
- Achieved by: any secure stream cipher (ChaCha20) or block cipher in a randomized mode (CTR, CBC with random IV).
- NOT achieved by: ECB mode, deterministic encryption.

**IND-CCA2 (Indistinguishability under Adaptive Chosen Ciphertext Attack):**
Same as IND-CPA, but the adversary additionally has access to a decryption oracle (except for the challenge ciphertext). This is the standard security notion for authenticated encryption.
- Achieved by: EtM composition (NIP-44), AEAD ciphers (ChaCha20-Poly1305, AES-GCM).
- Why it matters: In NOSTR, relays may forward modified events. Without IND-CCA2, an attacker could modify ciphertext and learn about the plaintext from the recipient's behavior.

### Integrity/Authentication Notions

**UF-CMA (Unforgeability under Chosen Message Attack):**
An adversary who can obtain MACs for arbitrary messages cannot produce a valid MAC for a new message. This is the standard security notion for MACs.
- Achieved by: HMAC-SHA256, CMAC, Poly1305 (with fresh key per message).

**SUF-CMA (Strong Unforgeability):**
Even stronger: the adversary cannot produce a new valid (message, tag) pair, even for a previously queried message (i.e., cannot produce a second valid tag for the same message). HMAC-SHA256 achieves SUF-CMA.

### Forward Secrecy
Compromise of a long-term key does not reveal past session keys or plaintext.
- **NIP-44 alone does NOT provide forward secrecy.** The conversation_key is deterministic from static keys. If either party's key is compromised, all past and future NIP-44 encrypted messages between them can be decrypted.
- **NIP-59 provides partial forward secrecy for the outer layer** because ephemeral keys are used and discarded. However, the inner Seal layer still uses static ECDH.
- **Signal's Double Ratchet provides forward secrecy** via continuous key ratcheting: each message uses a derived key that is deleted after use.

### Post-Compromise Security (PCS)
Also called "future secrecy" or "self-healing." After a key compromise, the protocol eventually recovers security once the compromised party performs an update (e.g., a DH ratchet step).
- NIP-44/NIP-59: No PCS. A compromised key remains compromised.
- Signal Double Ratchet: Achieves PCS after one round-trip of messages.

### Deniability
The ability for a participant to deny having sent a message to a third-party judge.
- **NIP-44 alone: No deniability.** Events are signed with Schnorr signatures (BIP-340), providing non-repudiation.
- **NIP-59 Rumors: Deniability by design.** The inner Rumor is unsigned. The Seal proves authorship to the recipient (who can verify the Seal signature), but the Rumor itself carries no proof transferable to third parties. However, the Seal signature IS transferable proof, somewhat weakening deniability.
- **Signal: Deniability via symmetric MAC.** Message authentication uses a symmetric key derived from the DH ratchet, which both parties can compute, so neither can prove to a third party that the other sent a specific message.

### Key Compromise Impersonation (KCI)
If Alice's private key is compromised, can the attacker impersonate Bob to Alice?
- In static ECDH (NIP-44): **Yes.** The attacker knows Alice's private key and Bob's public key, which is sufficient to compute the conversation_key and encrypt messages that Alice will accept as being from Bob. This is an inherent property of static-static ECDH.
- In X3DH (Signal): Mitigated by the use of signed pre-keys, which bind Bob's identity to the session.

---

## 11. Attacker Models

### Dolev-Yao Model (Symbolic/Formal)
The Dolev-Yao attacker is an idealized adversary used in formal protocol verification:
- **Full network control:** Can intercept, modify, drop, replay, and inject any message on any channel.
- **Perfect cryptography assumption:** Cannot break encryption without the key, cannot forge signatures without the private key, cannot reverse hash functions.
- **Algebraic rules:** Encryption/decryption, signing/verification are treated as symbolic operations with algebraic cancellation rules.

**Use:** Protocol verification tools (ProVerif, Tamarin, AVISPA) model attackers in this way. Useful for finding logical flaws in protocol design (missing authentication steps, reflection attacks, type confusion).

**Limitation:** Does not capture computational attacks (weak randomness, side channels, quantum attacks, implementation bugs).

### Computational Model
The adversary is a probabilistic polynomial-time (PPT) Turing machine:
- Can perform any computation in polynomial time.
- Security is defined probabilistically: an advantage negligible in the security parameter.
- Captures: brute force bounds, birthday attacks, reduction-based proofs.

**Use:** Formal security proofs for cryptographic primitives and compositions (IND-CCA2 proofs, game-based arguments).

**Relationship:** A protocol proven secure in the Dolev-Yao model may still be insecure in the computational model (e.g., due to weak primitives), and vice versa (a computationally secure protocol may have logical flaws not captured by its computational proof).

### Practical Attacker Considerations for NOSTR
- **Passive relay operator:** Can observe all events passing through, including metadata (who connects, when, subscription filters). NIP-59 Gift Wrap hides sender identity and message content but reveals the recipient (via the `p` tag) and approximate timing.
- **Active relay operator:** Can drop, delay, or duplicate events. Can also inject events (but cannot forge signatures). A malicious relay could perform a denial-of-service or attempt message reordering.
- **Global network observer:** Can observe relay connections and timing across the network. Even with Gift Wrap, traffic analysis (timing, volume, relay selection) can reveal communication patterns.
- **Key compromise attacker:** Has obtained a user's private key (via malware, social engineering, or nsec exposure). Can decrypt all past NIP-44 messages and impersonate the user.

---

## 12. Known Attacks on Messaging Protocols

### Replay Attacks
An attacker records a valid encrypted message and retransmits it later. In NOSTR:
- Events have unique `id` fields (hash of content). Relays can detect and reject duplicate event IDs.
- However, NIP-44 itself does not include replay protection (it is a payload encryption scheme, not a transport protocol). The event layer handles deduplication.

### Reflection Attacks
An attacker sends a message back to its originator, hoping the originator will process it as if from someone else. In NOSTR:
- NIP-59 mitigates this: the Rumor's pubkey must match the Seal's pubkey, preventing a relay from replacing the inner content. However, since the conversation_key is symmetric (ECDH(a, B) = ECDH(b, A)), if Alice sends a Gift Wrap to Bob, an attacker could potentially re-wrap the Seal for delivery to Alice. Clients should verify that received messages are not from themselves.

### Unknown Key Share (UKS) Attack
Alice believes she shares a key with Bob, but actually shares it with Mallory (or vice versa). In static ECDH:
- Mallory registers a public key equal to Alice's or manipulates the key exchange. Since NOSTR public keys are self-authenticating (derived from private keys), UKS requires Mallory to control a key that produces the same ECDH shared secret with the target, which is computationally infeasible on secp256k1.
- However, if NIP-05 identifiers are trusted for identity binding, a Mallory who controls a domain could bind any key to a human-readable identifier, creating a form of identity misbinding at the social layer.

### Key Compromise Impersonation (KCI)
As described in Section 10. Static-static ECDH is inherently vulnerable. If the attacker learns Alice's private key, they can compute conversation_key(Alice, Bob) and send messages that appear to come from Bob (or anyone else) to Alice.

### Identity Misbinding
An attacker arranges for a message or session to be attributed to the wrong identity. In NOSTR:
- NIP-59's Seal is signed by the sender's real key, binding the message to the sender's identity at the cryptographic level.
- Misbinding could occur at the NIP-05 (DNS verification) layer: if the DNS record is compromised, a different key could be associated with a human-readable identifier.

### Nonce Reuse
If the same nonce is reused with the same key in ChaCha20:
- The XOR of two ciphertexts equals the XOR of two plaintexts, enabling statistical plaintext recovery (known-plaintext or crib-dragging).
- In NIP-44, the 32-byte random nonce provides 256 bits of entropy per message, making collision negligible (birthday bound at 2^128 messages per conversation_key).
- The HMAC key is also derived from the nonce, so nonce reuse would also reuse the HMAC key. However, since HMAC-SHA256 is deterministic, this only means the same plaintext would produce the same MAC (no additional vulnerability beyond confidentiality loss).

### Padding Oracle Attacks (Vaudenay 2002)
An attacker learns whether decrypted padding is valid, using error messages or timing as an oracle. This enables complete plaintext recovery.
- NIP-44 is immune because: (1) HMAC is verified before decryption (Encrypt-then-MAC), so an attacker cannot submit modified ciphertexts; (2) padding verification occurs after decryption and is not exposed to the attacker.

### EFAIL (2018) -- Attack on PGP/S/MIME
Exploited the lack of authenticated encryption in PGP (CFB mode without authentication) and the presence of HTML rendering in email clients. An attacker could modify encrypted email to include exfiltration gadgets.
- Relevant to NOSTR Mail: If a NOSTR-based email protocol renders HTML or other active content, similar exfiltration is possible unless the encryption is fully authenticated (NIP-44's EtM prevents ciphertext modification) AND content rendering is sandboxed.

### KNOB Attack (2019) -- Bluetooth Key Negotiation
Exploited the ability to negotiate the entropy of the session key down to 1 byte. Not directly applicable to NOSTR (NIP-44 does not negotiate key parameters), but illustrates the danger of downgrade attacks in versioned protocols.
- Relevance: NIP-44 is versioned (current version 0x02). If a future version introduces weaker parameters, a downgrade attack could force use of version 0x02. Clients should enforce minimum versions.
