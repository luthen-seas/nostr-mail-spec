# Open Questions — Unresolved Design Decisions

> **Questions that need answers before the spec is complete. Each question is assigned to the role(s) best equipped to answer it.**

---

## Format

```
### OQ-NNN: [Question]
**Assigned to**: [Role(s)]
**Status**: Open | In Discussion | Resolved → DEC-XXX
**Priority**: Critical | High | Medium | Low
**Context**: [Why this matters]
**Options**: [Known possible answers]
**Dependencies**: [What's blocked on this]
```

---

### OQ-001: What event kind number for mail messages?
**Assigned to**: Protocol Architect, Standards Writer
**Status**: Resolved → Kind 1400 (mail), 1401 (receipt). Verified free in kind registry.
**Priority**: Critical
**Context**: We've proposed kind 15 but this needs coordination with the NOSTR community to avoid collisions.
**Options**: (A) Kind 15 (adjacent to kind 14 DMs). (B) Request a dedicated kind in the 1000-9999 range. (C) Use kind 14 with a distinguishing tag.
**Resolution**: Option B selected. Kind 1400 for mail messages, kind 1401 for receipts. Kind 15/16 conflicted with NIP-17/NIP-18.
**Dependencies**: Message format spec, all implementations.

### OQ-002: Should forward secrecy be a V1 goal or deferred?
**Assigned to**: Crypto Designer, Protocol Architect
**Status**: Open
**Priority**: High
**Context**: NIP-44 uses static ECDH — no forward secrecy. Adding it requires X3DH-style pre-published key bundles or a ratcheting protocol, significantly increasing complexity.
**Options**: (A) Defer to V2 — accept static ECDH for V1. (B) Optional X3DH extension in V1. (C) Mandatory X3DH for all mail.
**Dependencies**: Encryption spec, formal verification scope, implementation complexity.

### OQ-003: How to partition mailbox state for large mailboxes?
**Assigned to**: Distributed Systems Engineer, Protocol Architect
**Status**: Resolved → DEC-013 (kind 30099, monthly partitions)
**Priority**: High
**Context**: A single kind 10099 event with 50,000 message state entries is unwieldy.
**Options**: (A) Partition by month. (B) Partition by folder. (C) Delta/incremental model. (D) Default-unread with sparse tracking.
**Resolution**: Option A selected. Kind 30099 addressable events with `["d", "YYYY-MM"]` tag for monthly partitions. Clients fetch last N months on load and can compact older partitions.
**Dependencies**: Multi-device sync, client architecture.

### OQ-004: How does relay-level spam filtering work when sender is hidden?
**Assigned to**: Adversarial Security, Relay Operator, Payment Specialist
**Status**: Open
**Priority**: Critical
**Context**: Gift Wrap hides the sender (ephemeral key). Relay can't check sender against recipient's contact list. But relay needs some mechanism to prevent spam flooding.
**Options**: (A) L402 payment for all unknown senders at relay level. (B) PoW on gift wrap (visible outside encryption). (C) Sender-hint tag (HMAC of sender pubkey). (D) Relay trusts client-side filtering only.
**Dependencies**: Anti-spam architecture, relay spec, privacy guarantees.

### OQ-005: What Cashu mints should be trusted by default?
**Assigned to**: Payment Specialist, Legal/Regulatory
**Status**: Open
**Priority**: Medium
**Context**: Cashu is custodial — the mint holds the Bitcoin. Recipients need to trust the mint that issued the sender's tokens.
**Options**: (A) Each recipient specifies accepted mints in spam policy. (B) Community-maintained list of trusted mints. (C) Any mint accepted, with amount threshold. (D) Fedimint for distributed trust.
**Dependencies**: Spam policy event format, payment flow.

### OQ-006: How to handle mailing lists efficiently?
**Assigned to**: Protocol Architect, Crypto Designer, Distributed Systems Engineer
**Status**: Open
**Priority**: Medium
**Context**: Gift wrapping creates O(n) encrypted copies per recipient. For a 100-member list, that's 100 events per message.
**Options**: (A) Shared symmetric key for list. (B) Relay-managed distribution (NIP-29 extension). (C) Designated list operator re-wraps. (D) Accept O(n) cost.
**Dependencies**: Group encryption design, relay behavior spec.

### OQ-007: What is the minimum viable SMTP bridge?
**Assigned to**: Email Expert, Systems Programmer
**Status**: Open
**Priority**: High
**Context**: The bridge is essential for adoption but adds complexity and trust assumptions.
**Options**: (A) Full bidirectional bridge from day one. (B) Inbound-only bridge first (receive email in NOSTR Mail). (C) Outbound-only bridge first (send from NOSTR Mail to email). (D) Bridge as a separate project, not part of core spec.
**Dependencies**: Adoption strategy, bridge trust model.

### OQ-008: Should the protocol support HTML content?
**Assigned to**: Protocol Architect, UX Designer, Adversarial Security
**Status**: Resolved → DEC-015 (HTML downgraded to MAY-support)
**Priority**: Medium
**Context**: Email relies heavily on HTML. Markdown is simpler and safer. HTML enables richer formatting but introduces XSS risks.
**Options**: (A) text/plain only. (B) text/markdown only. (C) text/markdown default, text/html optional with mandatory sanitization. (D) text/html default (email compatibility).
**Resolution**: Modified option C: `text/markdown` is RECOMMENDED. `text/html` is MAY-support with SHOULD NOT send. New implementations may omit HTML rendering entirely.
**Dependencies**: Message format spec, client rendering, bridge conversion.

### OQ-009: How to handle key rotation without losing mail history?
**Assigned to**: Crypto Designer, Distributed Systems Engineer
**Status**: Open
**Priority**: High
**Context**: If a user rotates their key, old messages encrypted to the old key become unreadable unless the old key is retained.
**Options**: (A) Re-encrypt old messages to new key (requires decryption + re-encryption). (B) Retain old key for decryption only. (C) Accept that old messages are lost on key rotation. (D) Key rotation event that allows gradual migration.
**Dependencies**: Key management spec, identity continuity.

### OQ-010: What are the relay requirements for inbox relays?
**Assigned to**: Relay Operator, Protocol Architect
**Status**: Open
**Priority**: High
**Context**: Not all relays are suitable as inbox relays. Inbox relays need storage guarantees, AUTH support, and reliability.
**Options**: (A) Define a "mail relay" profile in the spec. (B) Use NIP-11 relay information to advertise mail capabilities. (C) Leave it to market differentiation.
**Dependencies**: Relay spec, relay operator economics.

---

## Questions Surfaced by Phase 2 Reviews

### OQ-011: How much random publication delay is needed to resist timing correlation?
**Assigned to**: Adversarial Security, Distributed Systems
**Status**: Resolved → DEC-016 (0-60 seconds random delay, SHOULD-level)
**Priority**: High
**Context**: Phase 2 encryption analysis found that publication time is the dominant deanonymization signal — it overwhelms the ±2 day timestamp randomization. The adversarial review (FINDING-004) confirms timing correlation is feasible for relay operators.
**Options**: (A) Random delay 0-60 seconds. (B) Random delay 0-300 seconds. (C) Batched publication at fixed intervals. (D) No protocol-level requirement, leave to client.
**Resolution**: Option A selected as a SHOULD-level recommendation. Maximum delay MUST NOT exceed 300 seconds. Clients may offer "send immediately" for time-sensitive messages.
**Dependencies**: UX impact (delay = worse responsiveness), delivery model.

### OQ-012: Should the spec define an HTML sanitization allowlist?
**Assigned to**: Adversarial Security, Standards Writer, Email Expert
**Status**: Resolved → NIP spec defines a blocklist (strip elements/attributes); DEC-015 de-emphasizes HTML
**Priority**: High
**Context**: DEC-009 requires both bridge and client to sanitize HTML. The spec should define exactly which tags/attributes are allowed to ensure consistency across implementations.
**Options**: (A) Spec defines complete allowlist. (B) Spec references DOMPurify defaults. (C) Spec says "sanitize" without specifying how. (D) Spec bans HTML entirely, Markdown only.
**Resolution**: The NIP defines a mandatory blocklist (script, iframe, object, embed, form, input, style, on* handlers, javascript: URIs, data: URIs). DEC-015 further de-emphasizes HTML (SHOULD NOT send). Allowlist-based sanitizers like DOMPurify are RECOMMENDED.
**Dependencies**: Bridge design, client rendering, email feature parity.

### OQ-013: What is the minimum NUT-11 P2PK implementation for Cashu postage?
**Assigned to**: Payment Specialist, Crypto Designer
**Status**: Resolved → `0x02 || x-only-pubkey` (compressed SEC1, always even y per BIP-340)
**Priority**: Critical
**Context**: DEC-006 mandates P2PK tokens. Need to specify exactly how the recipient's pubkey is encoded in the spending condition, which key format (NOSTR hex vs. compressed SEC), and how the P2PK lock is verified.
**Options**: (A) Use NOSTR pubkey (32-byte x-only) directly. (B) Use compressed SEC pubkey (33 bytes). (C) Use NUT-11's existing P2PK format.
**Resolution**: Option B selected with the specific rule: always use `0x02` prefix (never `0x03`) because BIP-340 x-only keys always have even y-coordinate. This is now specified in the NIP and implemented in both TS and Go SDKs.
**Dependencies**: Token format, mint compatibility, wallet implementation.

### OQ-014: Should the spec recommend a dedup ID retention period for relays?
**Assigned to**: Relay Operator, Distributed Systems
**Status**: Open
**Priority**: Medium
**Context**: Phase 2 delivery model analysis recommends relays retain event IDs for deduplication. How long? Too short = replay risk. Too long = storage cost.
**Options**: (A) 24 hours. (B) 7 days. (C) Match event retention period. (D) No recommendation, relay operator decision.
**Dependencies**: Relay storage, replay attack window.

### OQ-015: How should key rotation work for NOSTR Mail specifically?
**Assigned to**: Crypto Designer, Protocol Architect
**Status**: Open
**Priority**: High
**Context**: Phase 2 adversarial review (FINDING-015) identified a High-severity mail interception risk during key rotation. Need a protocol for announcing new key, transitioning, and handling messages to old key.
**Options**: (A) Signed key rotation event (old key signs pointer to new key). (B) NIP-05 update + kind 0 metadata update. (C) Both A and B. (D) No formal protocol, manual migration.
**Dependencies**: Identity continuity, NIP-05 resolution, contact notification.

---

*Add new questions as they arise. Move to "Resolved" and link to the decisions log entry when answered.*
