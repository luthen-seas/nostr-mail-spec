# Second Implementation — Fundamentals

The purpose, methodology, and principles of building a second independent implementation of NOSTR Mail to validate the specification and ensure interoperability.

---

## 1. Why a Second Implementation Exists

### The Core Thesis

A specification is only as good as the number of independent implementations that can interoperate using only the specification text. A single implementation proves that the spec author understood their own spec. A second implementation proves that someone else can too.

**What a second implementation finds:**
- **Spec ambiguities:** Places where the spec says one thing but could be read two ways
- **Unstated assumptions:** Things the first implementation "knows" because the author also wrote the spec
- **Missing edge cases:** Inputs that the spec does not address
- **Test vector gaps:** Operations without test vectors where implementations can silently diverge
- **Implementation-specific behavior:** Where the first implementation made a choice the spec did not mandate

**What a second implementation does NOT find:**
- Design-level vulnerabilities (both implementations may share the same flaw)
- Performance problems unique to one language or platform
- UX issues (implementations may have different UIs)

### The Fundamental Rule

> The second implementation team MUST NOT read the first implementation's source code. They read ONLY the specification text. If the spec is insufficient to implement a feature, that is a spec bug, not an implementation problem.

This rule is essential. If the second team copies logic from the first implementation, they are not testing the spec — they are testing their ability to port code between languages.

---

## 2. Historical Models

### Lightning Network: The Three-Team Model

The Lightning Network specification (BOLT) was developed and implemented by three independent teams simultaneously:

| Implementation | Team | Language |
|---------------|------|----------|
| c-lightning (now CLN) | Blockstream | C |
| lnd | Lightning Labs | Go |
| eclair | ACINQ | Scala/Java |

**How it worked:**
1. Teams met regularly to discuss the BOLT spec
2. Each team implemented from the spec independently
3. When implementations disagreed, the spec was fixed (not the implementations)
4. Interop testing was continuous: CLN <-> lnd, CLN <-> eclair, lnd <-> eclair

**Bugs found by multi-implementation approach:**
- Fee calculation disagreements (rounding differences in sat/byte calculations)
- Channel reserve edge cases (what happens when reserve equals channel capacity?)
- HTLC timeout races (what if both parties try to close at the exact same time?)
- Onion routing padding differences (fixed-size packets require exact byte counts)
- Shutdown message ordering (which message can be sent after shutdown is initiated?)

**Lesson for NOSTR Mail:** Every one of these bugs existed because the spec was ambiguous or incomplete. The bugs were not in any individual implementation — they were in the spec. The multi-implementation model is the only reliable way to find spec bugs.

### A fourth implementation (LDK — Lightning Dev Kit, Spiral) was later added, finding additional spec issues even after years of three-way interop testing.

### HTTP/2: 20+ Implementations

HTTP/2 (RFC 7540) achieved interoperability across more than 20 implementations through:

1. **Formal test suite:** h2spec (https://github.com/summerwind/h2spec) provides 146 test cases covering every MUST and SHOULD in the spec
2. **Interop events:** IETF hackathons where implementers tested against each other
3. **Reference frames:** Published binary frame examples that every implementation must parse identically
4. **Compliance levels:** The spec clearly distinguishes between mandatory behavior and optional features

**Key insight:** h2spec was written by a third party (not the spec authors, not any major browser vendor). An independent test suite finds different bugs than those found by implementers testing their own code.

**Lesson for NOSTR Mail:** A conformance test suite should be written by someone other than the spec author or the reference implementation author.

### TLS 1.3: Formal Verification + Multiple Implementations

TLS 1.3 (RFC 8446) used both formal methods and multi-implementation testing:

- **miTLS:** Formally verified implementation in F* (Microsoft Research)
- **OpenSSL, BoringSSL, NSS, GnuTLS, mbedTLS:** Independent implementations in C
- **Interop testing:** IETF TLS working group maintained a public interop matrix
- **Formal analysis:** Tamarin and ProVerif models caught issues before implementations were built

**Lesson for NOSTR Mail:** Formal verification and multi-implementation testing complement each other. Formal methods find design bugs. Multi-implementation testing finds spec ambiguity bugs. Neither alone is sufficient.

---

## 3. Spec Reading Methodology

### Read Literally

The second implementation team should read every word of the spec as if it were a legal contract:

**"The client MUST verify the HMAC before attempting decryption."**
- What does "before" mean? Must the HMAC check complete before any decryption bytes are processed? Or just before the decryption result is returned?
- What if the HMAC check and decryption are done in parallel for performance?
- What does "verify the HMAC" mean precisely? Constant-time comparison? Against what exactly?

**"The timestamp SHOULD be randomized within +/- 2 days."**
- SHOULD means implementations that don't randomize are non-ideal but conformant. Is this acceptable?
- "+/- 2 days" — is this inclusive or exclusive? Is exactly 2 days (172800 seconds) within range?
- Is the distribution uniform? Normal? Does it matter?
- What if the resulting timestamp is in the future? Do relays reject future timestamps?

**"Unknown tags MUST be ignored."**
- Ignored how? Not stored? Stored but not processed? Stored and forwarded to other clients?
- Does "ignored" mean the event is still valid? Or that the tag is stripped?
- What about duplicate tags? Is `["p", "abc"]` appearing twice "unknown" behavior?

### Question Every Undefined Behavior

For every operation in the spec, ask: "What does the spec say happens when..."

| Scenario | The spec says... | If it says nothing, that is a bug |
|----------|-----------------|-----------------------------------|
| Empty plaintext (0 bytes) | ? | How is 0-length plaintext padded? |
| Plaintext > 65535 bytes | ? | Does padding overflow? Is this rejected? |
| Event with no tags | ? | Is this a valid kind 15 event? |
| Multiple `subject` tags | ? | Which one wins? Error? |
| `p` tag with invalid hex | ? | Reject event? Ignore tag? |
| Gift wrap with non-randomized timestamp | ? | Is this non-conformant? Does recipient reject it? |
| Seal signed by wrong key | ? | How does recipient detect this? |
| Cashu token from unknown mint | ? | Reject? Accept but do not claim? |

### Document Every Assumption

When the spec is silent and you must make a choice, document it:

```markdown
## Assumption Log

### ASM-001: Empty plaintext handling
- **Spec says:** "The plaintext is padded to the next power of 2"
- **Question:** What is the "next power of 2" for 0 bytes?
- **Our assumption:** Reject 0-byte plaintext as invalid input
- **Rationale:** A 0-byte message has no semantic content; padding a 0-byte message would produce a 32-byte padded block that is all zeros, which could be a fingerprint
- **Risk:** If the reference implementation accepts 0-byte plaintext, we will fail to decrypt those messages

### ASM-002: Tag ordering in event ID computation
- **Spec says:** "The event ID is SHA-256 of [0, pubkey, created_at, kind, tags, content]"
- **Question:** Must tags be in any particular order? The spec says "tags" but does not specify ordering.
- **Our assumption:** Tags are in the order they appear in the event JSON
- **Rationale:** JSON arrays are ordered; SHA-256 of different orderings produces different hashes
- **Risk:** None — JSON array ordering is well-defined. But implementations must not sort tags before hashing.
```

---

## 4. Interop Testing Fundamentals

### What Interop Testing Proves

Interop testing verifies that two independent implementations can communicate end-to-end. For NOSTR Mail, this means:

1. **Event creation interop:** Implementation A creates a kind 15 event; implementation B can parse it
2. **Encryption interop:** A encrypts with NIP-44; B decrypts successfully (and vice versa)
3. **Gift wrap interop:** A wraps a message; B unwraps it (and vice versa)
4. **Relay interop:** A publishes to relay X; B retrieves from relay X
5. **Threading interop:** A creates a reply; B correctly identifies it as a reply to the original
6. **Cashu interop:** A attaches a token; B claims it (same mint)
7. **Blossom interop:** A uploads an attachment; B downloads and decrypts it

### What Interop Testing Does NOT Prove

- That either implementation is correct (both could be wrong in the same way)
- That the protocol is secure (interop testing does not check for side channels)
- That the protocol performs well (interop testing is functional, not performance)
- That the protocol handles adversarial input (interop testing uses well-formed inputs)

### Cross-Implementation Matrix

For full interop coverage, test every combination:

```
                    Implementation A      Implementation B
                    (TypeScript)          (Rust)
Create event        A creates → B parses  B creates → A parses
Encrypt             A encrypts → B decrypts  B encrypts → A decrypts
Gift wrap           A wraps → B unwraps   B wraps → A unwraps
Relay publish       A publishes → B reads B publishes → A reads
Thread              A replies → B threads B replies → A threads
Full round-trip     A sends mail → B receives → B replies → A receives
```

The full round-trip test is the most valuable because it exercises the entire stack.

---

## 5. Divergence Analysis

### When Outputs Differ

When implementations A and B produce different outputs for the same input, systematically determine the cause:

**Step 1: Identify the divergence point**
- Compare intermediate values (this is why test vectors include intermediates)
- Find the first computation where outputs differ
- The bug is in the step that produces the first divergence

**Step 2: Classify the divergence**

| Classification | Meaning | Action |
|---------------|---------|--------|
| **Spec ambiguity** | The spec allows both interpretations | Fix the spec, add a test vector |
| **Spec bug** | The spec says something impossible or contradictory | Fix the spec |
| **Implementation bug** | One implementation does not match the spec | Fix the implementation |
| **Test vector error** | The test vector itself is wrong | Fix the test vector, verify against spec |
| **Undefined behavior** | The spec says nothing about this case | Add spec text, add a test vector |

**Step 3: Document and resolve**

```markdown
## Divergence: DIV-001

**Operation:** NIP-44 encryption with 33-byte plaintext
**Input:** plaintext = "aaa...a" (33 bytes), known key pair, known nonce
**Implementation A output:** padded length = 64
**Implementation B output:** padded length = 48
**Root cause:** Spec says "next power of 2" but 33 bytes rounds to 64 in power-of-2, 
               while the actual NIP-44 padding uses a more complex scheme with chunks.
               Implementation A used simple power-of-2; Implementation B used the actual algorithm.
**Resolution:** Implementation A bug. The padding algorithm is more nuanced than "next power of 2."
**Action:** Fix Implementation A. Add test vector for 33-byte plaintext.
```

---

## 6. Spec Gap Catalog

The second implementation should maintain a running catalog of spec gaps discovered during implementation:

```markdown
# Spec Gap Catalog

## GAP-001: Maximum event content length
- **NIP:** NIP-01 / NIP-44
- **Issue:** No maximum content length specified for events
- **Impact:** Implementations may have different size limits, causing silent rejection
- **Recommendation:** Add MUST/SHOULD for maximum content size

## GAP-002: Behavior when NIP-05 resolution fails
- **NIP:** NIP-05
- **Issue:** Spec does not specify client behavior when .well-known/nostr.json returns 404, timeout, or invalid JSON
- **Impact:** Clients may hang, crash, or display incorrect information
- **Recommendation:** Add error handling requirements with specific behavior for each failure mode

## GAP-003: Gift wrap relay selection when NIP-65 is absent
- **NIP:** NIP-59, NIP-65
- **Issue:** If recipient has no NIP-65 relay list, where should the gift wrap be published?
- **Impact:** Message delivery failure for users without relay lists
- **Recommendation:** Specify fallback behavior (well-known relays, sender's relays, both)

## GAP-004: Tag value encoding
- **NIP:** NIP-01
- **Issue:** Are tag values always strings? Can they contain newlines? Null bytes? Control characters?
- **Impact:** JSON serialization differences could produce different event IDs
- **Recommendation:** Specify allowed character set for tag values
```

This catalog becomes input to the Standards Writer for spec revisions.

---

## 7. Implementation Strategy

### Language Choice

The second implementation should use a different language from the reference implementation to maximize diversity:

| Reference Implementation | Second Implementation | Rationale |
|-------------------------|----------------------|-----------|
| TypeScript | Rust | Different memory model, different JSON handling, different async model |
| TypeScript | Go | Different type system, different error handling |
| Rust | TypeScript | Tests browser compatibility, dynamic typing edge cases |
| Rust | Python | Tests scripting language integration, different crypto library |

### Dependency Independence

The second implementation should use different cryptographic libraries from the reference:

| Operation | Reference (nostr-tools) | Second Implementation Options |
|-----------|------------------------|------------------------------|
| secp256k1 | @noble/curves | libsecp256k1 (C FFI), k256 (Rust), btcec (Go) |
| SHA-256 | @noble/hashes | ring (Rust), crypto/sha256 (Go), hashlib (Python) |
| ChaCha20 | @noble/ciphers | chacha20 crate (Rust), x/crypto (Go) |
| HMAC | @noble/hashes | hmac crate (Rust), crypto/hmac (Go) |
| HKDF | @noble/hashes | hkdf crate (Rust), x/crypto/hkdf (Go) |

Different libraries exercise different code paths and may handle edge cases differently. This is desirable — it surfaces interop issues.

### Build Incrementally

```
Phase 1: Event ID computation
  - Parse JSON event, compute SHA-256, compare with known test vectors
  - This validates JSON serialization and SHA-256

Phase 2: BIP-340 signatures
  - Sign events, verify against BIP-340 test vectors
  - Verify events created by the reference implementation

Phase 3: NIP-44 encryption
  - Derive conversation key, encrypt, decrypt
  - Decrypt ciphertext created by the reference implementation
  - Create ciphertext that the reference implementation can decrypt

Phase 4: NIP-59 gift wrap
  - Create rumor → seal → wrap
  - Unwrap events created by the reference implementation
  - Create wrapped events that the reference implementation can unwrap

Phase 5: Relay communication
  - Connect to a test relay, publish events, subscribe, receive events
  - Exercise the full REQ/EVENT/EOSE/CLOSE lifecycle

Phase 6: Full round-trip
  - Send a NOSTR Mail message from second implementation
  - Receive and read it in the reference implementation
  - Reply from the reference implementation
  - Receive and read the reply in the second implementation

Phase 7: Edge cases
  - Empty subject, long body, non-ASCII content, multiple recipients
  - Attachments, Cashu postage, threading
  - Error conditions: wrong key, corrupted event, missing recipient
```

Each phase builds on the previous one. Phase 1 failures must be fixed before proceeding to Phase 2 (since event IDs depend on correct JSON + SHA-256, and signatures depend on correct event IDs).
