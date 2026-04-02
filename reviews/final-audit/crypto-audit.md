# NOSTR Mail Protocol -- Cryptographic Audit Report

**Auditor:** Cryptographic Protocol Designer (AI-assisted final review)
**Date:** 2026-04-01
**Scope:** NIP-XX specification, TypeScript reference implementation (wrap.ts, unwrap.ts, cashu.ts, attachment.ts)
**Methodology:** Manual source review of NIP specification and TypeScript implementation against NIP-44, NIP-59, NUT-11, and Web Crypto API standards.

---

## Executive Summary

The NOSTR Mail protocol demonstrates a sound cryptographic architecture. The three-layer NIP-59 gift wrap model is implemented correctly, NIP-44 v2 is used appropriately for both encryption layers, AES-256-GCM attachment encryption follows best practices, and the P2PK pubkey derivation is correct per BIP-340 semantics. The two-phase Cashu validation model is well-reasoned and correctly specified.

The audit identified **zero critical vulnerabilities** and **zero high-severity issues**. There are several medium and low-severity findings related to key material lifecycle management, timing side-channel surface area, and minor specification gaps. All are addressable without architectural changes.

Overall assessment: the protocol is cryptographically sound and ready for public release with the conditions noted below.

---

## Findings

### F-01 | Clean | NIP-44 Usage

**Component:** wrap.ts, unwrap.ts, NIP spec (Encryption section)

**Description:** NIP-44 v2 is used correctly throughout. The implementation calls `nip44.v2.utils.getConversationKey(privkey, pubkey)` for ECDH key derivation and `nip44.v2.encrypt()`/`nip44.v2.decrypt()` for authenticated encryption. The NIP-44 v2 internal pipeline (ECDH -> HKDF-SHA256 -> ChaCha20-Poly1305 with HMAC-SHA256 MAC) is handled entirely by the nostr-tools library, which is the canonical reference implementation.

The seal layer uses `ECDH(senderPrivkey, recipientPubkey)` and the gift wrap layer uses `ECDH(ephemeralPrivkey, recipientPubkey)`, matching NIP-59 exactly. Decryption correctly reverses with `ECDH(recipientPrivkey, wrapEvent.pubkey)` for the outer layer and `ECDH(recipientPrivkey, seal.pubkey)` for the inner layer.

**Recommendation:** None. Correct.

---

### F-02 | Clean | NIP-59 Three-Layer Structure

**Component:** wrap.ts, unwrap.ts, NIP spec (Encryption section)

**Description:** The three-layer model is implemented faithfully:

1. **Rumor (kind 15):** Unsigned, contains sender's real pubkey, all tags, message body. The `sig` field is empty string per spec.
2. **Seal (kind 13):** Signed by sender, empty tags array, content is NIP-44 encrypted rumor JSON. Timestamp randomized.
3. **Gift Wrap (kind 1059):** Signed by ephemeral key, single `["p", recipientPubkey]` tag, content is NIP-44 encrypted seal JSON. Timestamp randomized.

The `unwrapMail()` function correctly validates kind numbers at each layer (1059, 13, 15) and verifies the seal signature before proceeding to inner decryption.

**Recommendation:** None. Correct.

---

### F-03 | Medium | Sender Pubkey Consistency Check Missing in unwrap.ts

**Component:** unwrap.ts (lines 40-122), NIP spec (Receiving protocol flow, Step 3)

**Description:** The NIP specification mandates in the receiving protocol flow (Step 3): "Verify rumor.pubkey == seal.pubkey (sender consistency)." The Client Behavior section further states: "Clients MUST verify that rumor.pubkey matches seal.pubkey when unwrapping."

However, `unwrapMail()` in unwrap.ts does NOT perform this check. It returns `senderPubkey: seal.pubkey` but never verifies that the decrypted rumor's `pubkey` field matches. An attacker who compromises the ECDH conversation key (or finds a way to inject a crafted payload) could create a seal signed by key A containing a rumor with `pubkey` set to key B, causing the client to attribute the message to the wrong sender.

The `unwrapSeal()` function in wrap.ts also omits this check.

**Recommendation:** Add a post-decryption assertion in `unwrapMail()`:

```typescript
if (rumor.pubkey !== seal.pubkey) {
  throw new Error(
    `Sender mismatch: seal pubkey ${seal.pubkey} does not match rumor pubkey ${rumor.pubkey}`
  )
}
```

This should be a hard failure, not a soft warning.

---

### F-04 | Medium | Ephemeral Key Material Not Explicitly Zeroed

**Component:** wrap.ts (line 76)

**Description:** The `wrapMail()` function generates an ephemeral private key at line 76 (`const ephemeralPrivkey = generateSecretKey()`) and uses it to compute a conversation key and sign the wrap event. After the function returns, the ephemeral key remains in memory as a `Uint8Array` on the JavaScript heap until garbage collected. It is never explicitly zeroed.

The NIP spec states (Ephemeral Key Requirements): "Ephemeral private keys MUST be discarded after signing the gift wrap." While JavaScript does not guarantee secure memory erasure, explicitly zeroing the buffer (`ephemeralPrivkey.fill(0)`) after the `finalizeEvent()` call is a defense-in-depth measure that reduces the window of exposure in memory dumps, core dumps, and heap inspection scenarios.

Similarly, the `sealConvKey` and `wrapConvKey` conversation keys (derived symmetric material) are not zeroed after use.

**Recommendation:** Add explicit zeroing of sensitive key material after use:

```typescript
const wrap = finalizeEvent(wrapTemplate, ephemeralPrivkey)
ephemeralPrivkey.fill(0)
wrapConvKey.fill(0)
sealConvKey.fill(0)
return wrap
```

Document in the NIP spec that implementations SHOULD zero ephemeral keys and derived conversation keys after use, with acknowledgment that runtime GC behavior may not guarantee immediate erasure.

---

### F-05 | Low | Timestamp Randomization Distribution Is Not Perfectly Uniform

**Component:** wrap.ts (lines 15-22)

**Description:** The `randomTimestampOffset()` function maps a 32-bit CSPRNG value to the range [-172800, +172800] via floating-point division:

```typescript
const normalized = (buf[0]! / 0x100000000) * 2 - 1
return Math.floor(normalized * maxOffset)
```

This maps 2^32 discrete values onto 345,601 possible offsets. Since 2^32 (4,294,967,296) is not evenly divisible by 345,601, there is a slight non-uniformity (modular bias). The bias is negligible: the maximum deviation from uniform is approximately 0.008%, which is cryptographically insignificant for timestamp obfuscation.

The spec requires "uniform random integer in the inclusive range [-172800, +172800]" using CSPRNG. The implementation satisfies the CSPRNG requirement (crypto.getRandomValues). The near-uniform distribution is acceptable for this purpose.

**Recommendation:** Acceptable as-is. For pedantic correctness, a rejection sampling approach could be used, but the current bias is far below any exploitable threshold for timing correlation.

---

### F-06 | Clean | P2PK Pubkey Derivation

**Component:** cashu.ts (lines 25-31), NIP spec (P2PK Spending Condition section)

**Description:** The `toCompressedSec()` function correctly converts a 32-byte x-only NOSTR pubkey to compressed SEC1 format by prepending `0x02`. The NIP spec correctly explains the rationale: BIP-340 x-only keys implicitly represent the point with even y-coordinate, so `0x02` is always correct.

The function validates input length (64 hex chars) and hex format before conversion. It lowercases the input to normalize case, preventing case-sensitivity issues in P2PK matching.

**Recommendation:** None. Correct.

---

### F-07 | Clean | Two-Phase Cashu Validation Model

**Component:** cashu.ts (verifyPostage), spam.ts (evaluateSpamTier), NIP spec (Two-Phase Validation section)

**Description:** The two-phase model is correctly specified and implemented:

- **Phase 1 (structural, synchronous):** `evaluateSpamTier()` in spam.ts checks the `cashuPostage` object's `p2pk` flag, `amount`, and `mint` against policy. This is fast and deterministic, requiring no network access. Messages passing Phase 1 are delivered to inbox as tier 3.

- **Phase 2 (mint validation, asynchronous):** `verifyPostage()` in cashu.ts decodes the token, checks P2PK lock target, verifies amount, and performs a swap at the mint to confirm the token is unspent. Failure at Phase 2 triggers reclassification to tier 5.

The rationale is sound: deferring mint contact prevents message loss due to temporary mint downtime. The spec correctly states clients MUST NOT automatically delete messages that fail Phase 2.

**Recommendation:** None. Well-designed.

---

### F-08 | Medium | Cashu verifyPostage Does Not Pass Signing Key for P2PK Swap

**Component:** cashu.ts (lines 210-218)

**Description:** When swapping P2PK-locked proofs (Phase 2), the `verifyPostage()` function creates a new `CashuWallet` and calls `wallet.swap(totalAmount, proofs)`. However, NUT-11 P2PK spending requires the spender to provide a Schnorr signature proving they hold the private key corresponding to the P2PK lock pubkey.

The code comment at line 217 states: "The wallet automatically signs the swap request with our key if the proofs have P2PK conditions." This is only true if the CashuWallet is initialized with the corresponding private key. The current implementation creates the wallet with only `new CashuWallet(mint)` and does not provide a private key or signing callback.

In practice, the @cashu/cashu-ts library requires the caller to provide a `privkey` option or a custom `signEcash` function when constructing the wallet for P2PK operations. Without this, the swap will fail for all P2PK-locked tokens, meaning Phase 2 validation will always fail.

**Recommendation:** Accept a private key or signer callback parameter in `verifyPostage()` and pass it to the CashuWallet constructor:

```typescript
export async function verifyPostage(
  postage: CashuPostage,
  ourPubkey: string,
  ourPrivkey: Uint8Array,  // Added
  minAmount: number,
): Promise<...> {
  // ...
  const wallet = new CashuWallet(mint, { privkey: bytesToHex(ourPrivkey) })
  // ...
}
```

This is a functional correctness issue. Without the fix, Cashu postage tokens can never be redeemed.

---

### F-09 | Low | No Constant-Time Comparison for Cryptographic Values

**Component:** cashu.ts (line 173), attachment.ts (line 265)

**Description:** Two locations compare cryptographic hash/key values using JavaScript string equality (`!==`):

1. cashu.ts line 173: `parsed[1].data !== ourCompressedPubkey` -- compares P2PK lock target against our pubkey.
2. attachment.ts line 265: `computedHash !== attachment.hash` -- compares SHA-256 hash of downloaded data.

JavaScript string comparison (`===`/`!==`) is not constant-time; it short-circuits on the first differing character. In theory, this creates a timing side-channel.

**Practical impact:** Low. For the P2PK check (cashu.ts), the comparison determines whether a token is locked to us -- there is no secret being compared against attacker-controlled input in a way that leaks useful information. For the hash check (attachment.ts), the comparison is between a locally computed hash and a value from the rumor tags (already known to the recipient). Neither scenario presents an exploitable timing oracle in practice.

**Recommendation:** For defense-in-depth, consider using a constant-time comparison utility for the P2PK pubkey check. The hash comparison in attachment.ts is non-sensitive and can remain as-is. This is a best-practice suggestion, not a practical vulnerability.

---

### F-10 | Clean | AES-256-GCM Attachment Encryption

**Component:** attachment.ts, NIP spec (Attachments section)

**Description:** The attachment encryption is correctly implemented:

1. **Key generation:** Uses `randomBytes(32)` from `@noble/hashes/utils`, which delegates to `crypto.getRandomValues()` -- a proper CSPRNG. (Line 112)
2. **IV generation:** Uses `randomBytes(12)` for a 12-byte IV. (Line 28)
3. **Encryption:** Web Crypto API `crypto.subtle.encrypt('AES-GCM', ...)` with the generated IV. (Lines 38-39)
4. **Format:** `[IV (12 bytes)] [ciphertext + GCM auth tag (16 bytes)]` -- the IV is prepended, which is the standard self-contained format. (Lines 45-47)
5. **Hash:** SHA-256 is computed over the encrypted output (not plaintext), matching Blossom's content-addressed storage model. (Line 120)
6. **Verification:** `downloadAttachment()` verifies the SHA-256 hash before decrypting, preventing processing of tampered data. (Lines 265-269)
7. **Minimum length check:** `decryptAesGcm()` validates that encrypted data is at least `IV + auth tag` bytes. (Line 63)

The encryption key is carried inside the encrypted rumor, so it is protected by the NIP-44/NIP-59 envelope. The key never appears in cleartext outside the gift-wrapped message.

**Recommendation:** None. Correct.

---

### F-11 | Low | No CSPRNG Audit Trail in NIP Spec for nostr-tools Internals

**Component:** NIP spec (CSPRNG Requirement section)

**Description:** The NIP spec correctly states: "All random values in this protocol -- ephemeral keys, timestamp offsets, AES-256-GCM keys, AES-256-GCM IVs, and NIP-44 nonces -- MUST be generated using a cryptographically secure pseudorandom number generator."

The TypeScript implementation correctly uses CSPRNG for values under its direct control:
- Timestamp offsets: `crypto.getRandomValues()` (wrap.ts line 18)
- AES keys: `randomBytes(32)` from @noble/hashes (attachment.ts line 112)
- AES IVs: `randomBytes(12)` from @noble/hashes (attachment.ts line 28)
- Ephemeral keys: `generateSecretKey()` from nostr-tools (wrap.ts line 76)

The NIP-44 nonce is generated internally by `nostr-tools/nip44`, which uses `randomBytes()` from @noble/hashes. This is correct but opaque to the audit of this codebase. No `Math.random()` usage was found anywhere in the implementation.

**Recommendation:** Document in the implementation's security notes that CSPRNG correctness for NIP-44 nonces depends on the nostr-tools library, and pin the dependency version. Consider adding a runtime assertion that `crypto.getRandomValues` is available (it is in all modern environments but could be absent in some embedded contexts).

---

### F-12 | Low | Gift Wrap Signature Not Verified in unwrap.ts

**Component:** unwrap.ts (lines 52-67)

**Description:** The `unwrapMail()` function does NOT verify the gift wrap event's Schnorr signature before decrypting it. It only checks `wrapEvent.kind === 1059`. The seal signature IS verified (line 91), which is the critical authentication check (it proves sender identity).

The gift wrap signature verification is less critical because: (a) the gift wrap is signed by an ephemeral key with no identity significance, and (b) if the gift wrap were tampered with, NIP-44 decryption would fail (the AEAD ciphertext includes authentication). However, verifying the signature upfront would reject malformed events earlier and provide defense-in-depth.

The NIP spec's conformance tests (C07) require: "Gift wrap signature is valid -- Schnorr signature verifies against ephemeral pubkey." This suggests implementations are expected to verify it.

**Recommendation:** Add `verifyEvent(wrapEvent)` before decryption and reject events with invalid signatures. This aligns with conformance test C07 and provides early rejection of malformed events.

---

### F-13 | Clean | Composition Safety Between Encryption Layers

**Component:** NIP spec, wrap.ts, unwrap.ts, attachment.ts

**Description:** The protocol uses three independent encryption layers that compose safely:

1. **NIP-44 (seal layer):** ECDH(sender, recipient) -> HKDF -> ChaCha20-Poly1305. Authenticated encryption.
2. **NIP-44 (wrap layer):** ECDH(ephemeral, recipient) -> HKDF -> ChaCha20-Poly1305. Authenticated encryption with a different key (ephemeral ECDH).
3. **AES-256-GCM (attachments):** Independent random key per file, carried in the rumor.

There is no key reuse between layers. The seal and wrap layers use different ECDH pairs (sender-recipient vs. ephemeral-recipient), producing different conversation keys. The attachment keys are independent random values.

The nesting order is correct: attachment keys are inside the rumor, which is inside the seal, which is inside the wrap. Compromising the outer layer (wrap) reveals only the seal (still encrypted to a different key pair in the sense that the seal signature provides authentication). Compromising the seal reveals the rumor and attachment keys.

No domain separation issues exist because NIP-44 v2 uses HKDF with appropriate info parameters internally, and each layer operates on distinct input key material.

**Recommendation:** None. The composition is safe.

---

### F-14 | Low | Self-Copy Includes BCC Tags When It Should Not

**Component:** wrap.ts (lines 120-143), NIP spec (BCC section)

**Description:** The `wrapMailForRecipients()` function wraps the same `rumor` object for all recipients and for the self-copy. The NIP spec's BCC mechanism (section "Recipients (To, CC, BCC)") specifies that To/CC recipients and the sender's self-copy should receive a "visible rumor" containing only To/CC tags, while BCC recipients should receive a "BCC rumor" containing all tags.

The current implementation does not differentiate between visible and BCC rumors. It wraps the same rumor for everyone. If the rumor contains BCC `p` tags, the self-copy (and all To/CC recipients) will see the BCC recipients. This violates the BCC privacy guarantee specified in the NIP.

**Recommendation:** The `wrapMailForRecipients()` function (or a higher-level caller) should construct two rumor variants: one with BCC tags stripped (for To/CC recipients and self-copy) and one with all tags (for BCC recipients). This is a protocol correctness issue, not strictly a cryptographic one, but it has privacy implications.

---

### F-15 | Clean | CSPRNG Usage -- No Math.random

**Component:** All TypeScript files

**Description:** A comprehensive search of all source files confirms zero usage of `Math.random()`. All random values use either `crypto.getRandomValues()` directly (wrap.ts) or `randomBytes()` from `@noble/hashes/utils` (attachment.ts), both of which are CSPRNG. The nostr-tools `generateSecretKey()` also uses CSPRNG internally.

**Recommendation:** None. Correct.

---

### F-16 | Low | Key Material in MailAttachment Type May Be Logged

**Component:** types.ts (line 65), attachment.ts (line 128)

**Description:** The `MailAttachment` interface includes `encryptionKey?: string` (hex-encoded AES-256-GCM key). This key is stored as a plain string property on a regular JavaScript object. If this object is logged (via `console.log`, error reporters, serialization to debug storage, etc.), the encryption key will appear in plaintext in log output.

No logging of `MailAttachment` objects was observed in the reviewed source files, but the risk exists in integrating applications.

**Recommendation:** Document that `MailAttachment.encryptionKey` is sensitive and MUST NOT be logged, serialized to persistent storage outside encrypted contexts, or included in error reports. Consider using a wrapper type that overrides `toJSON()` and `toString()` to redact the key.

---

## Summary Table

| ID | Severity | Component | Finding |
|----|----------|-----------|---------|
| F-01 | Clean | NIP-44 usage | Correct ECDH + NIP-44 v2 at both layers |
| F-02 | Clean | NIP-59 structure | Three layers correctly implemented |
| F-03 | **Medium** | unwrap.ts | Missing rumor.pubkey == seal.pubkey check |
| F-04 | **Medium** | wrap.ts | Ephemeral keys not zeroed after use |
| F-05 | Low | wrap.ts | Negligible modular bias in timestamp offset |
| F-06 | Clean | cashu.ts | P2PK 0x02 prefix derivation correct |
| F-07 | Clean | cashu.ts / spam.ts | Two-phase validation correctly designed |
| F-08 | **Medium** | cashu.ts | verifyPostage missing privkey for P2PK swap |
| F-09 | Low | cashu.ts / attachment.ts | Non-constant-time string comparisons |
| F-10 | Clean | attachment.ts | AES-256-GCM encryption correct |
| F-11 | Low | NIP spec | CSPRNG for NIP-44 nonces is library-dependent |
| F-12 | Low | unwrap.ts | Gift wrap signature not verified before decrypt |
| F-13 | Clean | All layers | Composition between encryption layers is safe |
| F-14 | Low | wrap.ts | Self-copy leaks BCC tags (privacy, not crypto) |
| F-15 | Clean | All files | No Math.random usage confirmed |
| F-16 | Low | types.ts | Encryption key in plain object may be logged |

**Totals:** 7 Clean, 3 Medium, 6 Low, 0 High, 0 Critical

---

## Sign-Off

### APPROVED WITH CONDITIONS

The NOSTR Mail protocol is cryptographically sound. The core encryption architecture -- NIP-44 v2 at both seal and wrap layers, NIP-59 three-layer gift wrapping, AES-256-GCM for attachments, P2PK Cashu postage -- is correctly designed and implemented. No critical or high-severity vulnerabilities were identified.

**Conditions for unconditional approval:**

1. **F-03 (Medium):** Add the `rumor.pubkey === seal.pubkey` sender consistency check in `unwrapMail()`. This is a MUST requirement in the NIP spec that is not enforced in code.

2. **F-08 (Medium):** Fix `verifyPostage()` to accept and use a private key for P2PK swap signing. Without this, Cashu postage redemption is non-functional.

3. **F-04 (Medium):** Add explicit zeroing of ephemeral private keys and conversation keys after use in `wrapMail()`.

All three conditions are straightforward fixes requiring minimal code changes and no architectural modifications. The remaining low-severity findings are best-practice improvements that should be addressed before v1.0 but do not block release of a public draft.

---

*Audit performed against: nip-xx-nostr-mail.md (NIP spec), nostr-mail-ts/src/{wrap,unwrap,cashu,attachment,spam,types}.ts*
*Cryptographic libraries in scope: nostr-tools (NIP-44 v2, event signing), @noble/hashes (SHA-256, randomBytes), @cashu/cashu-ts (NUT-11), Web Crypto API (AES-256-GCM)*
