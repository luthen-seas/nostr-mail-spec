# Protocol Architect Patterns

## NOSTR Mail Architectural Decisions and Rationale

### Why Kind 15 (New Kind) Instead of Extending Kind 14 (DMs)

**Decision:** NOSTR Mail uses a new event kind (kind 15) rather than adding email semantics to kind 14 (NIP-17 DMs).

**Rationale:**
1. **Different semantics:** DMs are instant messages — short, informal, conversational. Email is structured — subject line, formal body, attachments, threading. Overloading kind 14 would create ambiguity: is this a DM or an email?
2. **Different client expectations:** A DM client (like a chat app) and an email client have fundamentally different UIs. If both use kind 14, every DM client must decide how to handle email-style messages, and vice versa.
3. **Clean subscription filters:** A NOSTR Mail client subscribes to kind 15 only. A DM client subscribes to kind 14 only. No cross-contamination.
4. **Independent evolution:** Kind 15 can evolve its tag schema and content format without affecting kind 14 implementations.
5. **Precedent:** NOSTR already uses different kinds for different communication styles (kind 1 for notes, kind 14 for DMs, kind 30023 for long-form articles). Email is a different communication style.

**Counter-argument addressed:** "But email and DMs are both private messages." True, but so are kind 4 (deprecated DMs) and kind 14 (current DMs) — NOSTR already has multiple kinds for "private messages" with different semantics. The meaningful distinction is not "private vs public" but "structured email vs conversational chat."

### Why Mandatory Encryption (No Plaintext Mode)

**Decision:** All NOSTR Mail messages are encrypted. There is no option to send unencrypted kind 15 events.

**Rationale:**
1. **Security by default:** If plaintext is an option, some implementations will default to it (either by bug or laziness). Users cannot distinguish encrypted from unencrypted at a glance. Mandatory encryption eliminates this failure mode.
2. **Metadata protection:** Gift wrapping (NIP-59) hides the sender's pubkey. This only works if the content is encrypted — plaintext content would reveal the sender through writing style, signatures, etc.
3. **Simplicity:** One code path, not two. No "if encrypted then... else..." branches throughout the codebase.
4. **Regulatory advantage:** "All messages are encrypted" is a clean statement for privacy policies and DPIA.
5. **Forward secrecy preparation:** If a future NIP adds forward secrecy, mandatory encryption means all messages benefit automatically.

**Counter-argument addressed:** "What about public newsletters or announcements?" Those are not email — they are kind 30023 (long-form content) or kind 1 (notes). Email is inherently a private communication channel.

### Why Cashu Inside Encryption (Not Outside)

**Decision:** Cashu postage tokens are included inside the encrypted message content, not as visible tags on the event.

**Rationale:**
1. **Privacy:** If postage amount is visible on the event, relays and observers can infer message importance, sender wealth, or relationship closeness. Inside encryption, only the recipient sees the postage.
2. **Token security:** Cashu tokens are bearer instruments. If tokens are in plaintext tags, any relay operator (or network observer) could claim them. Inside encryption, only the intended recipient can claim.
3. **Atomicity:** The message and its postage are a single encrypted unit. You cannot strip the postage from a message or attach postage to a different message.
4. **Simplicity:** One encrypted blob, one decryption operation, one parsing step. No coordination between "the encrypted part" and "the payment part."

**Trade-off acknowledged:** Relays cannot enforce postage policies by inspecting events — they see only encrypted blobs. Solution: relay-level L402 paywalls (pay to publish, not pay per message) or trust-based policies (NIP-05, Web of Trust).

### Why External Attachments (Not Inline)

**Decision:** File attachments are uploaded to Blossom (or similar) and referenced by URL in the message content. Files are not embedded inline in the event.

**Rationale:**
1. **Event size limits:** Relays impose event size limits (typically 64KB-1MB). A single photo exceeds this. Inline attachments would require splitting events or raising limits.
2. **Relay storage burden:** Relays store every event indefinitely (or per retention policy). Embedding megabytes of attachments in events would make relay operation prohibitively expensive.
3. **Selective download:** Recipients can read the message text first, then choose which attachments to download. Inline attachments force downloading everything.
4. **Content-addressed deduplication:** Blossom uses SHA-256 content addressing. The same file attached to multiple messages is stored once.
5. **Relay independence:** Attachments are stored on Blossom servers, not relays. This separates the "message routing" concern (relay) from the "file storage" concern (Blossom).

**Security requirement:** Attachments must be encrypted before upload. The encryption key is included in the (encrypted) message content. Blossom servers see only encrypted blobs.

### Why LWW State (Not CRDTs)

**Decision:** For mutable state (read/unread, labels, folders), NOSTR Mail uses Last-Writer-Wins (LWW) replaceable events, not Conflict-free Replicated Data Types (CRDTs).

**Rationale:**
1. **Simplicity:** LWW is trivially implementable — keep the event with the highest `created_at` timestamp. CRDTs require specialized data structures and merge algorithms.
2. **Single writer:** NOSTR Mail state is per-user (my read/unread status, my labels, my folders). There is no concurrent multi-writer scenario — only I modify my state.
3. **NOSTR native:** Replaceable events (kind 10000-19999) and addressable events (kind 30000-39999) already implement LWW semantics. No new protocol mechanism needed.
4. **Good enough:** The failure mode of LWW is that two rapid updates from different devices might conflict, with one being lost. For read/unread status, this is acceptable. The worst case is a message appearing as "unread" when it was already read — a minor inconvenience, not data loss.
5. **CRDTs are overkill:** CRDTs solve the multi-writer concurrent-edit problem (like collaborative document editing). NOSTR Mail does not have this problem.

---

## Feature Evaluation Framework

### "Should This Be in the Core Spec?"

When evaluating a proposed feature, ask these questions in order:

**1. Is it needed for basic send/receive?**
- YES: Core. Example: encryption, recipient addressing
- NO: Continue to question 2

**2. Is it needed for interoperability between clients?**
- YES: Core. Example: content format, tag schema
- NO: Continue to question 3

**3. Can a client skip it and still be useful?**
- YES: Extension. Example: read receipts, typing indicators
- NO: It is probably core (re-evaluate question 1)

**4. Does it add complexity to the relay?**
- YES: Very high bar. Relays are infrastructure — changes to relay behavior affect the entire network. Example: a new subscription filter type
- NO: Lower bar. Client-only features are cheaper to add. Example: a new tag

**5. Is it the simplest possible solution?**
- YES: Consider inclusion
- NO: Simplify first, then re-evaluate

### Feature Categorization

| Category | Bar for Inclusion | Examples |
|----------|------------------|---------|
| **Core** | Must-have for basic functionality | Event kind, encryption, addressing |
| **Standard Extension** | Needed for good UX, but basic client works without | Threading, attachments, postage |
| **Optional Extension** | Nice to have, specific use cases | Read receipts, typing indicators, scheduling |
| **Client Feature** | Not in protocol at all | Folders, search, UI themes |

---

## Protocol Review Checklist

### Implementability

- [ ] **Weekend test:** Can a competent developer implement the core spec in a weekend (2 days)?
- [ ] **Single-page spec:** Can the core spec fit on a single page (excluding examples)?
- [ ] **No exotic dependencies:** Does the spec require only widely-available cryptographic primitives?
- [ ] **Test vectors provided:** Does the spec include input/output pairs for every algorithm?

### Completeness

- [ ] **Every input defined:** Is every behavior defined for every possible input? (What happens with empty subject? What happens with 0-byte body? What happens with invalid NIP-05?)
- [ ] **Error cases explicit:** Does the spec say what to do when things go wrong? (Decryption fails? Relay rejects? Recipient not found?)
- [ ] **Edge cases documented:** Are boundary conditions addressed? (Maximum message size? Maximum attachment count? Maximum recipient count?)

### Uniqueness

- [ ] **One way to do each thing:** Is there exactly one way to express each concept? (Not two different tag formats for the same information.)
- [ ] **No ambiguity:** Can two independent implementations produce the same output given the same input?
- [ ] **No "implementation-defined" behavior:** Every decision is made by the spec, not left to the implementer.

### Extensibility

- [ ] **Forward compatible:** Can this spec be extended without breaking existing implementations?
- [ ] **Unknown tags ignored:** Does the spec explicitly state that unknown tags are ignored?
- [ ] **Version indicator:** Is there a mechanism for future versions (even if not used now)?
- [ ] **Deprecation path:** Is there a way to deprecate features without breaking old clients?

### Migration

- [ ] **Upgrade path clear:** For every breaking change, is there a documented migration path?
- [ ] **Coexistence period:** Can old and new implementations coexist during transition?
- [ ] **Rollback possible:** Can a change be reverted if it causes problems?

---

## Historical Case Studies

### SMTP: Great Simplicity, Terrible Security

**What worked:**
- Extremely simple protocol: text-based, human-readable, implementable in hours
- Federated architecture: anyone can run a mail server
- Universal adoption: 50+ years and still the foundation of email

**What failed:**
- No authentication: SMTP has no built-in sender verification. Anyone can send email claiming to be anyone. This led to decades of spam and phishing.
- No encryption: SMTP is plaintext by default. STARTTLS was bolted on decades later and is still optional.
- Header trust: SMTP headers (From, Reply-To) are self-reported and trivially forgeable.

**Lessons for NOSTR Mail:**
- Authentication must be built in from day one (NOSTR's cryptographic signatures solve this)
- Encryption must be mandatory, not optional (NIP-44 + NIP-59)
- Identity must be verifiable (NIP-05, but ultimately pubkey-based)
- Do not trust self-reported metadata (sender identity comes from cryptographic signature, not from a "from" field)

### HTTP: Great Extensibility, Terrible State Management

**What worked:**
- Headers as extension mechanism: any new feature can be added as a header without breaking existing implementations
- Status codes: clear, machine-readable indication of success/failure
- Content negotiation: client and server agree on format, language, encoding
- Statelessness: each request is independent, enabling massive scalability

**What failed:**
- No built-in state management: HTTP is stateless, but web applications need state. Cookies were a terrible hack that became permanent.
- Security as afterthought: HTTP had no security. HTTPS was bolted on. Mixed content, insecure defaults, and SSL/TLS complexity followed.

**Lessons for NOSTR Mail:**
- Tags as extension mechanism (like HTTP headers) — ignorable, composable, discoverable
- Clear event kind semantics (like HTTP status codes) — machine-readable, unambiguous
- Statelessness where possible — relay stores events, does not maintain session state
- But learn from cookies: if NOSTR Mail needs state (read/unread), design it cleanly from the start (replaceable events), not as an afterthought

### NOSTR: Great Minimalism, Challenging Deprecation

**What worked:**
- NIP-01 is brilliantly simple: events, signatures, relays, filters. That is the entire core protocol.
- Extension via kinds and tags: permissionless innovation
- No registration: generate a keypair and start publishing
- Relay choice: users choose their relays, no single point of failure

**What failed (or is challenging):**
- NIP-04 deprecation: NIP-04 (encrypted DMs) has known weaknesses, but deprecating it is slow because so many clients and users depend on it. NIP-44 is the replacement, but coexistence is messy.
- No formal versioning: when a NIP changes after implementations ship, there is no mechanism to communicate "this is version 2 of NIP-44."
- Relay diversity illusion: in practice, a small number of relays carry most traffic. Decentralization is architectural, not operational.

**Lessons for NOSTR Mail:**
- Get the encryption right the first time (NIP-44 is good; do not repeat NIP-04's mistakes)
- Plan for deprecation before shipping: define how NOSTR Mail v2 will coexist with v1
- Test with multiple relay implementations before finalizing the spec

### Signal Protocol: Great Crypto, Terrible Federation

**What worked:**
- Double Ratchet algorithm: forward secrecy and break-in recovery
- Sealed sender: metadata hiding for message content
- Security audits: extensively reviewed by cryptographers
- Simple UX: "it just works" for end users

**What failed:**
- Centralized server: Signal requires its own server infrastructure. No federation, no self-hosting, no alternative servers.
- No interoperability: Signal only talks to Signal. Cannot bridge to email, XMPP, Matrix, or NOSTR without Signal's permission.
- Phone number identity: requires a phone number, linking cryptographic identity to a physical identifier.

**Lessons for NOSTR Mail:**
- Adopt Signal's crypto quality (NIP-44 is inspired by Signal's approach)
- Reject Signal's centralization: NOSTR Mail works with any relay, any client, any signer
- Reject phone number identity: NOSTR's keypair-based identity is superior
- Embrace interoperability: SMTP bridge enables communication with the existing email ecosystem

### XMPP: Death by Feature Creep

**What worked (initially):**
- Federated architecture: anyone can run an XMPP server
- Extensible via XEPs (XMPP Extension Protocols): similar to NIPs
- Open standard: IETF RFC 6120/6121
- Early adoption by Google Talk, Facebook Messenger

**What failed:**
- XEP explosion: hundreds of extensions, many conflicting, many partially implemented
- No baseline: "XMPP-compatible" meant nothing because different servers and clients supported different XEP subsets
- Complexity drove centralization: Google, Facebook, and Apple dropped XMPP federation because the interoperability burden was too high
- No encryption standard: multiple competing encryption XEPs (OTR, OMEMO, OpenPGP) — users confused about what is encrypted

**Lessons for NOSTR Mail:**
- Define clear compliance levels: "NOSTR Mail Basic" (send/receive), "NOSTR Mail Standard" (+ threading, attachments), "NOSTR Mail Full" (+ postage, bridge)
- One encryption mechanism, not competing options: NIP-44 + NIP-59, period
- Resist XEP/NIP explosion: fewer well-implemented features beat many poorly-implemented ones
- Interoperability testing: maintain a test suite that verifies cross-client compatibility

---

## Decision Record Template

For every significant protocol decision, record:

```markdown
## Decision: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by [X]

### Context
What is the issue? Why does a decision need to be made?

### Options Considered
1. **Option A:** Description. Pros: ... Cons: ...
2. **Option B:** Description. Pros: ... Cons: ...
3. **Option C:** Description. Pros: ... Cons: ...

### Decision
We chose Option B because...

### Consequences
- Positive: ...
- Negative: ...
- Risks: ...

### Revisit Criteria
Under what circumstances should this decision be reconsidered?
```

This format (Architecture Decision Record / ADR) ensures decisions are documented, discoverable, and reversible. Every decision in this document should eventually be formalized as an ADR.
