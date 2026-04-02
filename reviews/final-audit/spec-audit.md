# NIP-XX (NOSTR Mail) -- Final Specification Audit

**Auditor:** Protocol Architect (AI Agent)
**Date:** 2026-04-01
**Document:** `/nostr-mail/nostr-mail-nip/nip-xx-nostr-mail.md`
**Revision:** Pre-submission draft (1,221 lines)

---

## Findings

### CRITICAL

#### FA-001
- **Severity:** CRITICAL
- **Section:** Event Kinds (line 89-97)
- **Description:** Kind 15 conflicts with NIP-17. NIP-17 already defines kind 15 as "Encrypted file message" (file-sharing rumor inside gift wrap). The NOSTR Mail spec redefines kind 15 as "Mail Message," which is a completely different event structure with different tags (subject, reply, thread, attachment, cashu, etc.). Publishing this NIP would create a kind collision: existing NIP-17 clients encountering a NOSTR Mail kind 15 rumor would misinterpret it as a file-sharing event, and vice versa. This is a protocol-breaking conflict.
- **Recommendation:** Assign a new, unregistered kind number for mail messages. Candidates: kind 1011 (regular range, unused), or a number in the 10000+ replaceable range if the semantics warrant it. Since mail messages are regular events delivered via gift wrap, a kind in the 1000-9999 range is appropriate. Coordinate with the nips repo maintainers to reserve the number before submission.

#### FA-002
- **Severity:** CRITICAL
- **Section:** Event Kinds (line 89-97)
- **Description:** Kind 16 conflicts with NIP-18. NIP-18 defines kind 16 as "Generic Repost." The NOSTR Mail spec redefines kind 16 as "Mail Receipt." While NOSTR Mail kind 16 events exist only as unsigned rumors inside gift wraps (never published directly), the kind number still collides in the protocol's kind registry. A relay or client inspecting decrypted content would encounter ambiguity. More importantly, the NIP kind registry is a global namespace -- even rumor-only kinds should not reuse allocated numbers.
- **Recommendation:** Assign a new, unregistered kind number for mail receipts. This should be adjacent to whatever kind is chosen for FA-001 (e.g., if mail messages become kind 1011, receipts could be kind 1012).

### HIGH

#### FA-003
- **Severity:** HIGH
- **Section:** Anti-Spam, Tier 1 -- NIP-05 (line 483)
- **Description:** NIP-05 verification is specified as a synchronous check during tier evaluation ("the first tier that matches determines the message's disposition"), but NIP-05 verification requires an HTTP request to the sender's domain. This contradicts the stated design goal that "Tier evaluation SHOULD be fast and deterministic" (line 553). A sender's NIP-05 domain may be slow, offline, or return errors. The spec does not define: (a) how long to wait for NIP-05 verification, (b) what to do if the lookup times out, (c) whether cached NIP-05 results are acceptable, or (d) whether tier 1 should also use a two-phase model like tier 3 (Cashu).
- **Recommendation:** Either (a) specify that NIP-05 results MAY be cached with a defined TTL (e.g., 24 hours) and that cached verification is acceptable for tier evaluation, or (b) adopt a two-phase model for NIP-05 analogous to Cashu: tentatively classify as tier 1 if the sender claims NIP-05 (presence of a kind 0 with `nip05` field), then asynchronously verify. Define failure behavior: if verification fails or times out, reclassify to the next qualifying tier.

#### FA-004
- **Severity:** HIGH
- **Section:** Mailbox State (Kind 10099), lines 604-683
- **Description:** The mailbox state event is specified as a replaceable event with all state in tags. This design has a scaling problem: a user with 10,000 read messages will have a kind 10099 event with 10,000+ tags. At ~80 bytes per `read` tag, that is 800 KB just for read state -- exceeding the recommended 64 KB event size limit and most relay size limits. The spec does not address this growth problem or define any pagination, compaction, or archival mechanism.
- **Recommendation:** Address the scalability ceiling explicitly. Options: (a) Define a maximum number of entries per kind 10099 event and a mechanism for archival (e.g., older read markers can be dropped after N days since the message is presumably no longer relevant). (b) Use a bloom filter or other compact representation for read state. (c) Split state across multiple addressable events (kind 30099 with d-tag partitioning by time window). (d) At minimum, add a normative note acknowledging the limit and stating that implementations SHOULD compact state by removing entries for messages older than a configurable threshold.

#### FA-005
- **Severity:** HIGH
- **Section:** BCC Implementation (lines 388-402)
- **Description:** The BCC implementation requires creating two different rumor variants (one with BCC tags, one without) for the same message. This means the message has two different serializations and, after gift-wrapping, two different inner event IDs. The spec does not address: (a) Which event ID should be used in threading tags when replying to a message that was BCC'd? (b) If a BCC recipient replies (using the BCC-rumor event ID) and a To recipient replies (using the visible-rumor event ID), these replies reference different parent IDs and the thread fractures. (c) There is no mechanism for the sender to correlate the two rumor variants in their sent folder.
- **Recommendation:** Define which event ID is canonical for threading purposes (likely the visible rumor's gift-wrap ID). Specify that BCC recipients who reply SHOULD use the thread tag's root ID for thread continuity, and that clients SHOULD NOT use the BCC-variant gift-wrap ID in reply tags. Consider adding a `["canonical-id", <visible-gift-wrap-id>]` tag inside the BCC rumor to allow BCC recipients' clients to thread correctly.

#### FA-006
- **Severity:** HIGH
- **Section:** Threading Tags (lines 184-207)
- **Description:** Threading tags reference "the gift-wrap event ID of the referenced message" (line 191). However, the same rumor is wrapped into different gift wraps for different recipients (each with a unique ephemeral key and thus a unique gift-wrap event ID). When Alice sends a message to Bob and Charlie, Bob's gift-wrap ID differs from Charlie's. If Bob replies referencing his gift-wrap ID in the `reply` tag, Charlie cannot resolve this reference because he received a different gift-wrap ID for the same message. Thread reconstruction breaks in multi-recipient conversations.
- **Recommendation:** This is a fundamental design issue. Options: (a) Use the rumor's computed event ID (hash of the serialized rumor) as the threading identifier instead of the gift-wrap ID. This requires defining a canonical rumor serialization for ID computation (even though the rumor is unsigned). (b) Use the seal's event ID, which is the same for all recipients of the same message (since the seal is signed by the sender). (c) Introduce a sender-generated stable message ID tag (e.g., `["message-id", <random-hex>]`) included in the rumor, which all recipients share. Option (c) is simplest and most robust.

### MEDIUM

#### FA-007
- **Severity:** MEDIUM
- **Section:** Subject Tag (lines 155-161)
- **Description:** The spec states "Every kind 15 rumor MUST include exactly one `subject` tag" but does not define behavior when a client encounters a kind 15 rumor without a subject tag. Defensive implementations will encounter this in practice (malformed events, older clients, interop bugs). The spec should define the failure mode.
- **Recommendation:** Add: "If a kind 15 rumor is received without a `subject` tag, implementations SHOULD treat the subject as empty and MUST NOT reject the message solely for this reason." This follows the robustness principle and prevents a MUST on the sender from becoming a crash on the receiver.

#### FA-008
- **Severity:** MEDIUM
- **Section:** Anti-Spam, Tier 2 -- PoW (line 484)
- **Description:** The spec says PoW is evaluated on the gift wrap ("Check gift wrap PoW bits against policy"), but it does not specify which field of the gift wrap is used for PoW verification. NIP-13 defines PoW as leading zero bits in the event ID. Since the gift wrap's ID is computed over its serialized content (which includes the encrypted seal), the PoW must be mined on the gift wrap after it is fully constructed. This is implicit but should be explicit. Additionally, the spec does not address: what if PoW is present but below the threshold? Is it tier 5, or does it fall through to tier 3 (Cashu)?
- **Recommendation:** Explicitly state: "PoW is evaluated on the gift wrap (kind 1059) event's `id` field per NIP-13. The number of leading zero bits must be greater than or equal to the recipient's `pow-min-bits` policy value." Also clarify the fall-through behavior: "If PoW is present but insufficient, the message is NOT classified as tier 2. Evaluation continues to tier 3 (Cashu) and then tier 5."

#### FA-009
- **Severity:** MEDIUM
- **Section:** Spam Policy (Kind 10097), lines 557-601
- **Description:** The kind 10097 spam policy event is published as a standard (unencrypted) signed event. This leaks the recipient's anti-spam preferences to the public: an attacker can see exactly what PoW threshold is required, which mints are accepted, and whether NIP-05 bypasses spam checks. This is a metadata leak that aids targeted spam (e.g., knowing a user accepts all mints, or that 20-bit PoW is sufficient). The spec does not discuss this trade-off or offer an encrypted alternative.
- **Recommendation:** Add a security consideration noting this trade-off. The policy must be public for senders to comply with it, which is inherently in tension with privacy. Acknowledge this explicitly. Optionally, define a mechanism where the policy is encrypted to the user's own key (like kind 10099) and senders must request it via an authenticated relay query, but this significantly complicates the protocol and may not be worth the complexity.

#### FA-010
- **Severity:** MEDIUM
- **Section:** Attachment Encryption (lines 442-457)
- **Description:** The attachment encryption scheme specifies AES-256-GCM with a 12-byte IV prepended to the ciphertext, but does not specify whether the GCM authentication tag length is 128 bits (16 bytes) or some other length. While 128 bits is the standard default, the spec should be explicit. Additionally, the format `IV || ciphertext || auth tag` is stated on line 449, but the spec does not say whether the auth tag is appended by the GCM implementation automatically or must be explicitly appended. Different libraries handle this differently.
- **Recommendation:** Explicitly state: "The GCM authentication tag MUST be 128 bits (16 bytes). The encrypted output format is: `IV (12 bytes) || ciphertext || authentication tag (16 bytes)`. Implementations MUST verify the authentication tag during decryption and MUST reject data where verification fails." This removes ambiguity across language implementations.

#### FA-011
- **Severity:** MEDIUM
- **Section:** Drafts (Kind 30015), lines 724-756
- **Description:** Kind 30015 is specified with a `subject` tag on the outer (unencrypted) event "as a convenience for listing drafts without decryption." The spec correctly notes this "leaks metadata," but the SHOULD-level recommendation to omit it for privacy contradicts the convenience purpose. More importantly, the spec does not define what the encrypted `content` contains beyond "the draft rumor JSON." If the draft is a partial message (no recipients yet, no subject), what is the minimum valid content? Can the content be empty? What if the encrypted content cannot be decrypted (key rotation)?
- **Recommendation:** Define the minimum valid draft content (e.g., "The encrypted content MUST be a valid JSON object. It MAY omit fields that have not been composed yet. At minimum, it MUST contain `kind: 15`."). Specify behavior when decryption fails: "If the draft content cannot be decrypted (e.g., after key rotation), clients SHOULD display the draft as inaccessible and offer deletion."

#### FA-012
- **Severity:** MEDIUM
- **Section:** Relay Behavior (lines 839-854)
- **Description:** The spec states "Relays MUST NOT inspect, decrypt, or log the content of kind 1059 events" (line 850). This is unenforceable at the protocol level -- a relay operator can do whatever they want with data they receive. The use of MUST here is misleading; it implies a technical guarantee that does not exist. This is a policy statement, not a protocol requirement.
- **Recommendation:** Change to: "Relays SHOULD NOT inspect, decrypt, or log the content of kind 1059 events. The protocol's security model assumes relays are honest-but-curious; encryption ensures confidentiality even if this expectation is violated." Alternatively, keep the MUST but frame it as a conformance requirement for relays claiming NIP-XX support, not as a security guarantee.

### LOW

#### FA-013
- **Severity:** LOW
- **Section:** Abstract (lines 14-31)
- **Description:** The abstract is well-written but slightly long for a NIP abstract. Most NIPs (e.g., NIP-17, NIP-44, NIP-59) have 2-4 sentence abstracts. This one is three paragraphs. The third paragraph ("NOSTR Mail is designed for asynchronous...") is motivation, not abstract.
- **Recommendation:** Move the third paragraph into the Motivation section. Keep the abstract to the first two paragraphs.

#### FA-014
- **Severity:** LOW
- **Section:** NIP Format Compliance (overall)
- **Description:** The document does not include the standard RFC 2119 boilerplate: "The key words 'MUST', 'MUST NOT', 'REQUIRED', 'SHALL', 'SHALL NOT', 'SHOULD', 'SHOULD NOT', 'RECOMMENDED', 'MAY', and 'OPTIONAL' in this document are to be interpreted as described in RFC 2119." While RFC 2119 and RFC 8174 are listed in the References section, the normative boilerplate should appear near the top of the specification.
- **Recommendation:** Add the RFC 2119/8174 key words paragraph after the Abstract or at the beginning of the Specification section, consistent with standard NIP practice.

#### FA-015
- **Severity:** LOW
- **Section:** Thread Reconstruction Algorithm (lines 415-429)
- **Description:** Step 2a references "a `replyTo` reference" but the actual tag name is `reply`, not `replyTo`. This appears to be a naming inconsistency -- likely from an implementation-layer name leaking into the spec.
- **Recommendation:** Change "replyTo" to "`reply` tag" on line 422 for consistency with the tag definitions.

#### FA-016
- **Severity:** LOW
- **Section:** Backward Compatibility (lines 1059-1070)
- **Description:** The spec claims "Kind 15 and kind 16 events are always gift-wrapped as kind 1059 events. Existing relays that support kind 1059 (for NIP-17 DMs) will store and serve NOSTR Mail events without modification." This is correct at the relay layer but understates the kind 15/16 conflict at the client layer (see FA-001, FA-002). A client decrypting a kind 1059 event and finding a kind 15 rumor would currently interpret it as a NIP-17 file message, not a NOSTR Mail message. This section needs to be rewritten after the kind numbers are changed.
- **Recommendation:** After resolving FA-001 and FA-002 with new kind numbers, rewrite this section to accurately describe backward compatibility with no kind collisions.

#### FA-017
- **Severity:** LOW
- **Section:** Test Vectors (lines 914-923)
- **Description:** Test vectors are referenced as external files (`impl/test-vectors/*.json`) but the spec does not include any inline test vectors with concrete cryptographic values. For a NIP submission, at least one complete end-to-end vector (private key -> rumor -> seal -> gift wrap -> decrypt -> verify) with all intermediate values should be included inline so reviewers can verify correctness without external tooling.
- **Recommendation:** Include at least one complete inline test vector in Appendix A using the test keys already provided. Show the exact ciphertext, seal ID, wrap ID, and all intermediate values for a simple "Hello" message from Alice to Bob.

#### FA-018
- **Severity:** LOW
- **Section:** Content-Type Tag (lines 166-180)
- **Description:** The spec lists `text/html` as a supported content type but the security burden is substantial (XSS, phishing, tracking pixels). The Client Behavior section mandates sanitization, but supporting HTML in an encrypted messaging protocol is a significant attack surface expansion. Most NIPs avoid HTML entirely.
- **Recommendation:** Consider downgrading `text/html` support from the core spec to an informational appendix or a SHOULD NOT recommendation. If HTML support is retained, add it to the conformance tests (currently absent from the test categories).

#### FA-019
- **Severity:** LOW
- **Section:** Cashu P2PK, SEC1 prefix (lines 507-518)
- **Description:** The spec states "The `0x02` prefix (even y-coordinate) is always correct for NOSTR public keys because BIP-340 specifies that x-only keys implicitly represent the point with even y-coordinate." This is technically correct but the explanation could cause confusion. BIP-340 specifies that signers negate their private key if the public key's y-coordinate is odd, ensuring the public key always has an even y. The `0x02` prefix is correct as a consequence, not as an assumption.
- **Recommendation:** Minor wording refinement: "BIP-340 x-only public keys always represent the point with even y-coordinate (signers negate their secret key if needed). Therefore the compressed SEC1 encoding is always `0x02 || x-only-pubkey`."

#### FA-020
- **Severity:** LOW
- **Section:** Mailbox State Conflict Resolution (lines 643-647)
- **Description:** The tiebreaker for same-timestamp kind 10099 events uses "lexicographically lower `id` (lowercase hex comparison)." This is adequate but non-standard. NIP-01 does not define a tiebreaker for replaceable events with identical timestamps; it simply says the latest `created_at` wins. Adding a tiebreaker is reasonable but should be flagged as an extension to NIP-01 behavior.
- **Recommendation:** Add a note: "This tiebreaker rule extends NIP-01's replaceable event semantics, which do not define behavior for equal timestamps. Implementations that do not support this tiebreaker MAY keep either event, but MUST converge on one."

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 6 |
| LOW | 8 |
| **Total** | **20** |

---

## Verdict

### NOT APPROVED

The specification cannot be submitted to `nostr-protocol/nips` in its current form due to two critical kind number collisions (FA-001, FA-002) that would break interoperability with NIP-17 and NIP-18. Additionally, the threading model has a fundamental design flaw in multi-recipient conversations (FA-006) that must be resolved before the protocol can function correctly.

### Conditions for Re-Approval

The following must be resolved before resubmission:

**Blockers (must fix):**

1. **FA-001:** Assign a new, unregistered kind number for mail messages (replacing kind 15).
2. **FA-002:** Assign a new, unregistered kind number for mail receipts (replacing kind 16).
3. **FA-006:** Resolve the multi-recipient threading ID problem. The recommended approach is a sender-generated stable `message-id` tag inside the rumor.
4. **FA-005:** Define canonical threading behavior for BCC-variant messages.
5. **FA-016:** Rewrite backward compatibility section after kind renumbering.

**Strongly recommended (should fix):**

6. **FA-003:** Define NIP-05 verification caching and timeout behavior.
7. **FA-004:** Address mailbox state scalability (kind 10099 tag growth).
8. **FA-007:** Define receiver behavior for missing subject tags.
9. **FA-008:** Clarify PoW evaluation field and fall-through semantics.
10. **FA-010:** Specify GCM auth tag length and decryption failure behavior.
11. **FA-014:** Add RFC 2119 boilerplate.
12. **FA-015:** Fix "replyTo" naming inconsistency.

**Recommended (nice to fix):**

13. **FA-009:** Acknowledge spam policy metadata leak in security considerations.
14. **FA-012:** Soften unenforceable relay MUST to SHOULD with explanation.
15. **FA-017:** Include at least one inline cryptographic test vector.

---

## Positive Observations

The specification demonstrates strong protocol design in several areas:

- **Encryption model:** Correct and complete reuse of the NIP-59 three-layer model without modification. No custom cryptography.
- **Anti-spam tiered model:** The priority-ordered tier system with two-phase Cashu validation is well-designed and handles the cold-contact problem elegantly.
- **Cashu P2PK integration:** Correctly addresses the bearer-token front-running vulnerability. The SEC1 prefix derivation is technically sound.
- **Mailbox state CRDT:** The G-Set design for read state is a good choice for eventual consistency across devices.
- **Attachment encryption:** Proper use of AES-256-GCM with keys carried inside the encrypted envelope.
- **Conformance test suite:** The six-category conformance framework with three levels (Core, Full, Interop) is thorough and well-structured.
- **Common pitfalls appendix:** Addresses real implementation mistakes that will save developers significant debugging time.
- **SMTP bridge section:** Appropriately marked as informational/non-normative, with honest acknowledgment of the trust boundary.

The specification is well-written, thorough, and architecturally sound apart from the issues identified above. Once the critical and high-severity findings are resolved, it would be a strong NIP submission.
