# Decisions Log — Design Decisions and Rationale

> **Every significant design decision recorded with context, alternatives considered, and rationale. Append-only — never delete entries, only mark superseded.**

---

## Format

```
### DEC-NNN: [Title]
**Date**: YYYY-MM-DD
**Status**: Active | Superseded by DEC-XXX | Under Review
**Decided by**: [Role(s)]
**Decision**: [What was decided]
**Context**: [Why this decision was needed]
**Alternatives considered**: [What else was evaluated]
**Rationale**: [Why this option was chosen]
**Implications**: [What this means for other components]
```

---

### DEC-001: Encryption by Default, No Plaintext Mode
**Date**: 2026-04-01
**Status**: Active
**Decided by**: Protocol Architect, Crypto Designer
**Decision**: Every NOSTR Mail message is gift-wrapped (NIP-59). There is no plaintext mail mode.
**Context**: Email's greatest failure is that encryption is optional. PGP has existed for 30 years with <1% adoption because it's opt-in.
**Alternatives considered**: (A) Optional encryption with a flag. (B) Encryption only for contacts, plaintext for unknowns. (C) Transport encryption only (TLS to relay).
**Rationale**: Option A repeats email's mistake. Option B leaks who your contacts are. Option C is what email already does. Mandatory encryption is the only approach that provides universal privacy.
**Implications**: Relays cannot index message content. Search must be client-side. Bridge must handle the encryption boundary.

### DEC-002: Build on NIP-17/NIP-44/NIP-59, Not a New Encryption Scheme
**Date**: 2026-04-01
**Status**: Active
**Decided by**: Protocol Architect, Crypto Designer
**Decision**: Use existing NIP-44 (encryption) and NIP-59 (Gift Wrap) as-is. Do not design a new encryption scheme.
**Context**: NIP-44 and NIP-59 are production-tested across multiple NOSTR clients. Designing new cryptography is dangerous and unnecessary.
**Alternatives considered**: (A) Custom encryption optimized for mail. (B) Adopt Signal Protocol / MLS. (C) Use NIP-44/59 as-is.
**Rationale**: Option A is "rolling our own crypto" — the cardinal sin. Option B adds enormous complexity and requires interactive key exchange. Option C leverages battle-tested code and is immediately compatible with existing NOSTR infrastructure.
**Implications**: We inherit NIP-44's limitations (no forward secrecy, static ECDH). Acceptable trade-off for V1.

### DEC-003: Cashu Tokens Inside Encryption, Not Outside
**Date**: 2026-04-01
**Status**: Active
**Decided by**: Protocol Architect, Payment Specialist, Crypto Designer
**Decision**: Cashu anti-spam tokens are placed inside the encrypted rumor (kind 15 tags), not as visible tags on the gift wrap.
**Context**: If tokens are outside encryption, relays can see payment amounts and patterns, degrading privacy.
**Alternatives considered**: (A) Token as visible tag on gift wrap. (B) Token inside encrypted rumor. (C) Separate payment event.
**Rationale**: Option B preserves maximum privacy — the relay sees nothing about the payment. Option A leaks economic metadata. Option C adds protocol complexity.
**Implications**: Relay-level spam filtering cannot use Cashu tokens (relay can't see them). Relay-level filtering must use L402 or PoW (visible outside encryption). Client-level filtering uses Cashu tokens.

### DEC-004: Attachments as External Blossom References, Not Inline
**Date**: 2026-04-01
**Status**: Active
**Decided by**: Protocol Architect, Email Expert
**Decision**: Attachments are stored on Blossom servers and referenced by hash in event tags. They are not inline in the event content.
**Context**: MIME's inline base64 attachments bloat messages by 33%, strain relay storage, and duplicate files across recipients.
**Alternatives considered**: (A) Inline base64 in content field. (B) Inline in a separate event. (C) External reference via Blossom hash.
**Rationale**: Option C keeps events small, enables on-demand fetching, avoids relay storage bloat, and enables encrypted attachments via separate Blossom upload.
**Implications**: Blossom servers become a dependency for attachment delivery. Attachment availability depends on Blossom server uptime. Need encrypted Blossom upload convention.

### DEC-005: Mailbox State as Replaceable Events, Not IMAP-Style Flags
**Date**: 2026-04-01
**Status**: Active
**Decided by**: Protocol Architect, Distributed Systems Engineer
**Decision**: Mail state (read, flagged, folders) is stored as replaceable NOSTR events (kind 10099), not as per-message flags.
**Context**: IMAP manages state per-connection with complex sync. NOSTR's replaceable events provide natural multi-device sync with last-write-wins semantics.
**Alternatives considered**: (A) Per-message state events (one event per read receipt). (B) Single replaceable state event. (C) CRDT-based state.
**Rationale**: Option B is simplest. Replaceable events have proven semantics in NOSTR. Option A generates too many events. Option C is unnecessarily complex for V1.
**Implications**: State event grows with mailbox size. Need partitioning strategy for large mailboxes. See open question OQ-003.

---

### DEC-006: Cashu Postage Tokens MUST Use P2PK Spending Conditions (NUT-11)
**Date**: 2026-04-02
**Status**: Active
**Decided by**: Adversarial Security, Payment Specialist, Crypto Designer
**Decision**: All Cashu tokens attached as anti-spam postage MUST use NUT-11 Pay-to-Public-Key spending conditions, locked to the recipient's pubkey. Plain bearer tokens MUST NOT be accepted as valid postage.
**Context**: Phase 2 adversarial review (FINDING-001 / ASR-001) identified a Critical vulnerability: without P2PK, the sender can trivially double-spend their own postage by redeeming tokens at the mint before the recipient does. This collapses the entire economic anti-spam model to zero cost.
**Alternatives considered**: (A) Bearer tokens with fast redemption race. (B) HTLC-locked tokens (NUT-10). (C) P2PK-locked tokens (NUT-11).
**Rationale**: Option A is fundamentally broken — the sender always wins the race because they control the timing. Option B requires hash preimage exchange, adding protocol complexity. Option C is the simplest: tokens are locked to the recipient's pubkey, only they can redeem, no race condition exists.
**Implications**: Recipient's pubkey must be known before minting tokens (it is — from the `p` tag). Cashu mints must support NUT-11. Clients must implement P2PK token creation and verification. The `["cashu", "..."]` tag now contains P2PK-locked tokens exclusively.

### DEC-007: Implementations MUST Use CSPRNG with Minimum 256-bit Entropy
**Date**: 2026-04-02
**Status**: Active
**Decided by**: Adversarial Security, Crypto Designer
**Decision**: All random number generation in NOSTR Mail implementations MUST use a cryptographically secure pseudorandom number generator (CSPRNG) sourced from the operating system's entropy pool. Minimum 256 bits of entropy for all key generation (ephemeral keys, nonces, blinding factors).
**Context**: Phase 2 adversarial review (FINDING-012 / ASR-002) identified a Critical vulnerability: if the RNG for ephemeral Gift Wrap keys is weak or predictable, the ephemeral private key can be derived, breaking sender anonymity and allowing decryption of the outer encryption layer.
**Alternatives considered**: (A) Allow any RNG. (B) Require CSPRNG. (C) Require CSPRNG + runtime entropy quality checks.
**Rationale**: Option A is unacceptable for a security protocol. Option C adds complexity with limited benefit (entropy quality is hard to measure). Option B is the standard for cryptographic protocols.
**Implications**: Spec must state: "Implementations MUST use `crypto.getRandomValues()` (Web), `/dev/urandom` (Linux/macOS), `BCryptGenRandom` (Windows), or equivalent OS CSPRNG. Implementations MUST NOT use `Math.random()`, unseeded PRNGs, or time-based seeds for any cryptographic operation."

### DEC-008: Relay-Level Flood Protection via Per-Recipient Rate Limiting
**Date**: 2026-04-02
**Status**: Active
**Decided by**: Adversarial Security, Relay Operator, Protocol Architect
**Decision**: Inbox relays SHOULD implement per-recipient rate limiting for kind 1059 events. Recommended default: maximum 100 kind 1059 events per recipient per hour from non-authenticated sources.
**Context**: Phase 2 adversarial review (FINDING-003 / ASR-003) identified a High severity relay flooding attack: an attacker can generate unlimited ephemeral keys to publish kind 1059 events addressed to a victim, exhausting relay storage. Per-sender rate limiting is ineffective because each event has a unique ephemeral pubkey.
**Alternatives considered**: (A) Per-sender rate limit (ineffective — ephemeral keys). (B) Per-recipient rate limit. (C) PoW requirement on all kind 1059 events. (D) L402 payment on all kind 1059 events.
**Rationale**: Option B is simplest and most effective. Combined with Option C (PoW as additional signal) for defense in depth. Option D adds friction for legitimate senders.
**Implications**: Relay NIP-11 should advertise rate limits. Clients should handle `rate-limited:` responses gracefully. Relays may exempt authenticated senders (NIP-42 AUTH) from rate limits.

### DEC-009: Bridge MUST Sanitize HTML at Conversion and Client MUST Sanitize Independently
**Date**: 2026-04-02
**Status**: Active
**Decided by**: Adversarial Security, Email Expert, Protocol Architect
**Decision**: The SMTP bridge MUST sanitize all HTML content during email-to-NOSTR conversion (strip `<script>`, `<iframe>`, event handlers, `javascript:` URLs). NOSTR Mail clients MUST independently sanitize HTML before rendering, regardless of whether the message came through a bridge.
**Context**: Phase 2 adversarial review (FINDING-013 / ASR-006) identified a High severity XSS vector through bridged HTML email content. Defense in depth requires sanitization at both the bridge and client layers.
**Alternatives considered**: (A) Bridge sanitizes only. (B) Client sanitizes only. (C) Both sanitize (defense in depth). (D) Convert all HTML to Markdown at bridge (eliminates HTML entirely).
**Rationale**: Option C provides defense in depth. Option D is the strongest but loses HTML email formatting. Spec SHOULD recommend Markdown conversion as the preferred bridge behavior, with HTML pass-through as a fallback for complex formatting. Either way, clients MUST sanitize.
**Implications**: Spec must include an HTML allowlist (safe tags/attributes) and denylist (dangerous patterns). Recommend DOMPurify or equivalent for client-side sanitization.

### DEC-010: Mailbox Read State Uses Append-Only Model (G-Set)
**Date**: 2026-04-02
**Status**: Active
**Decided by**: Distributed Systems, Protocol Architect
**Decision**: The "read" state for messages uses a Grow-only Set (G-Set) semantic: once a message is marked read, it stays read. This is implemented as append-only `["read", "<event-id>"]` tags in the mailbox state event. A message cannot be marked "unread" after being read.
**Context**: Phase 2 delivery model analysis recommended G-Set semantics for read state to prevent state regression from clock skew or replay attacks (the adversarial review's FINDING-007 on mailbox state replay). LWW allows regression; G-Set does not.
**Alternatives considered**: (A) LWW for all state (allows regression). (B) G-Set for reads, LWW for flags/folders. (C) Full CRDT state.
**Rationale**: Option B balances simplicity with correctness. Reads are monotonic (you can't unsee a message). Flags and folders genuinely need toggle/move semantics where LWW is acceptable.
**Implications**: Clients compute unread count as: total messages minus read set size. "Mark unread" is a UI-only feature (client hides the message from the read set locally but doesn't remove the read tag). This prevents replay attacks from reverting read state.

### DEC-011: Apply All 10 Phase 4 Spec Amendments
**Date**: 2026-04-02
**Status**: Active
**Decided by**: Protocol Architect
**Decision**: All 10 spec amendments (AMEND-001 through AMEND-010) from Phase 4 interop analysis have been applied to the living spec documents (message-format.md, encryption-privacy.md, micropayments-anti-spam.md).
**Context**: Phase 4 identified 10 spec ambiguities through independent Go implementation. The amendments provide precise RFC 2119 language to resolve each ambiguity.
**Applied to**:
- `email/message-format.md` — AMEND-003 (tag positional rules), AMEND-005 (state tag format), AMEND-007 (thread semantics), AMEND-008 (merge semantics), AMEND-010 (tag element types)
- `email/encryption-privacy.md` — AMEND-001 (rumor serialization order), AMEND-002 (timestamp randomization)
- `email/micropayments-anti-spam.md` — AMEND-004 (P2PK pubkey derivation), AMEND-006 (two-phase token validation)
- AMEND-009 (concrete interop test procedure) is captured in the conformance spec

### DEC-012: Stable Message Identity via `message-id` Tag
**Date**: 2026-04-07
**Status**: Active
**Decided by**: Protocol Architect, Standards Writer
**Decision**: Every kind 1400 rumor MUST include a `["message-id", <32-byte-random-hex>]` tag generated by a CSPRNG. Threading tags (`reply`, `thread`) and mailbox state tags now reference `message-id` values instead of gift-wrap event IDs.
**Context**: Gift-wrap event IDs are unique per recipient (each recipient gets a different ephemeral key and thus a different gift-wrap ID). This breaks multi-recipient threading: when Bob replies referencing his gift-wrap ID, Charlie cannot resolve it because he received a different gift-wrap ID for the same message. BCC recipients receive a different rumor variant, compounding the problem.
**Alternatives considered**: (A) Use the seal event ID (same for all recipients of same variant, but different for BCC). (B) Define a canonical rumor ID computation. (C) Sender-generated stable `message-id` tag inside the rumor.
**Rationale**: Option C is simplest and most robust — a random ID shared by all copies of the message. The same `message-id` MUST be used across visible and BCC rumor variants. Option A fails for BCC. Option B requires defining canonical JSON serialization, which is complex and fragile.
**Implications**: All threading, state tracking, and deduplication now key on `message-id` instead of gift-wrap event IDs. All implementations must be updated. Test vectors for threading and state require corresponding updates.

### DEC-013: Partition Mailbox State into Addressable Events (Kind 30099)
**Date**: 2026-04-07
**Status**: Active (supersedes part of DEC-005)
**Decided by**: Protocol Architect, Distributed Systems Engineer
**Decision**: Mailbox state changes from kind 10099 (replaceable) to kind 30099 (addressable) with a `["d", "YYYY-MM"]` tag for monthly partitioning. State tags reference `message-id` values.
**Context**: A single kind 10099 event grows unboundedly. A user with 10,000 read messages has a ~800 KB state event, exceeding the recommended 64 KB relay size limit. The scalability ceiling makes the protocol unusable for active users.
**Alternatives considered**: (A) Bloom filter for read state. (B) Delta/incremental model. (C) Monthly partitions via addressable events. (D) Accept the limitation and document it.
**Rationale**: Option C uses existing NOSTR addressable event mechanics. Monthly partitions keep individual events small (~10-50 KB for a busy month). Clients fetch the last N months on load and can compact older partitions. The `d` tag format `YYYY-MM` is simple and collision-free.
**Implications**: Clients must fetch all kind 30099 events for a user and merge them. Multi-device merge rules remain the same but apply per-partition. DEC-005 is partially superseded (the CRDT semantics remain, but the event kind and structure change).

### DEC-014: Ephemeral Key Zeroing After Use
**Date**: 2026-04-07
**Status**: Active (extends DEC-007)
**Decided by**: Crypto Designer
**Decision**: Implementations MUST zero or overwrite ephemeral private key material in memory after signing the gift wrap event. Derived conversation keys SHOULD also be zeroed.
**Context**: Crypto audit F-04 identified that ephemeral keys remained in memory until garbage collection. While language runtimes don't guarantee immediate erasure, explicit zeroing reduces the exposure window.
**Implications**: All implementations must add explicit zeroing (`.fill(0)` in JS, byte-slice overwrite in Go). This is defense-in-depth, not a security guarantee.

### DEC-015: HTML Content Type Downgraded to MAY-Support
**Date**: 2026-04-07
**Status**: Active
**Decided by**: Protocol Architect, Adversarial Security
**Decision**: `text/html` content type is downgraded from full support to MAY-support. Clients SHOULD NOT send HTML. Clients that receive HTML MUST sanitize. New implementations MAY omit HTML rendering.
**Context**: HTML in encrypted messaging creates substantial XSS attack surface. Most NIP reviewers will flag this. Markdown provides sufficient rich formatting without the security burden.
**Implications**: `text/markdown` is now the RECOMMENDED rich format. The SMTP bridge continues to convert inbound HTML to markdown. The HTML sanitization spec remains for backward compatibility.

### DEC-016: Publication Timing Obfuscation
**Date**: 2026-04-07
**Status**: Active
**Decided by**: Adversarial Security, Protocol Architect
**Decision**: Clients SHOULD introduce a random publication delay of 0-60 seconds (CSPRNG, uniform) before publishing each gift wrap. Maximum delay MUST NOT exceed 300 seconds.
**Context**: Red team analysis demonstrated that network-level timing correlation is the dominant deanonymization vector, more powerful than the ±2-day timestamp randomization (which only protects the `created_at` metadata field, not the actual relay arrival time).
**Implications**: Adds latency to message delivery. Clients may offer a "send immediately" option for time-sensitive messages, with a privacy trade-off warning.

---

*More decisions will be added as the design progresses. Each role should reference this log when making decisions that affect other components.*
