# Standards Writer — Patterns

## Model Specifications

### NIP-44 as a Model Crypto Spec

NIP-44 (Encrypted Payloads) is the best example of a well-written NOSTR cryptographic specification.

**What makes it good:**

1. **Clear algorithm steps**: every operation is numbered and unambiguous
   - Step 1: derive shared secret using ECDH (secp256k1)
   - Step 2: derive conversation key using HKDF-SHA256
   - Step 3: derive message keys using HKDF-SHA256 with nonce
   - Step 4: encrypt using ChaCha20
   - Step 5: compute HMAC-SHA256
   - Step 6: encode as base64

2. **Complete test vectors**: includes all intermediate values
   - Input keys, shared secret, conversation key, nonce, plaintext, ciphertext, MAC, final payload
   - Failure cases: invalid padding, wrong MAC, truncated payload

3. **Versioning**: payload starts with a version byte (currently 0x02), enabling future algorithm upgrades without breaking existing messages

4. **Security analysis**: explicit discussion of:
   - Why XChaCha20 was chosen over AES-GCM
   - Padding rationale (hide message length)
   - Nonce generation requirements
   - MAC-then-encrypt vs. encrypt-then-MAC choice

**Pattern to follow**: when writing any NIP that involves cryptographic operations, use NIP-44's structure as the template. Every step, every intermediate value, every failure mode.

### NIP-17 as a Model Messaging Spec

NIP-17 (Private Direct Messages) demonstrates how to build on existing NIPs without re-specifying them.

**What makes it good:**

1. **Layered architecture**: NIP-17 defines the message format (kind 14), delegates encryption to NIP-44, and delegates wrapping to NIP-59. Each layer is independently specified and testable.

2. **Clear event kind definition**:
   ```json
   {
     "kind": 14,
     "tags": [
       ["p", "<recipient-pubkey>", "<relay-hint>"],
       ["e", "<in-reply-to-event-id>", "<relay-hint>", "reply"],
       ["subject", "Thread subject"]
     ],
     "content": "Message body text"
   }
   ```

3. **Protocol flow as numbered steps**:
   - Create kind 14 event (unsigned — never published directly)
   - Encrypt with NIP-44 using recipient's pubkey
   - Wrap in kind 1059 gift wrap (NIP-59) using a random keypair
   - Publish kind 1059 to recipient's inbox relays

4. **Explicit about what NOT to do**:
   - "The kind 14 event MUST NOT be signed" (it is wrapped, signing would leak metadata)
   - "Clients MUST NOT publish kind 14 events directly" (only as inner content of gift wrap)

5. **Thread model**: defines how threads work using `e` tags with `reply` marker and `subject` tag for thread subject

**Pattern to follow**: when writing a messaging or multi-step protocol NIP, define the data format cleanly, reference existing NIPs for crypto and transport, and be explicit about prohibited behaviors.

### BOLT Specs as a Model for Multi-Implementation Protocol

The Lightning Network BOLT (Basis of Lightning Technology) specifications demonstrate how to write specs that enable independent implementations to interoperate.

**Key patterns:**

1. **Numbered specifications**: BOLT-01 through BOLT-11, each covering a distinct concern
   - BOLT-01: Base protocol (handshake, messaging)
   - BOLT-02: Channel open/close
   - BOLT-03: Transaction formats
   - BOLT-04: Onion routing
   - BOLT-11: Invoice format

2. **Feature bits**: each optional feature has a defined bit position, enabling negotiation
   - Even bits: "I understand this feature"
   - Odd bits: "I require this feature"
   - Pattern: this is equivalent to NOSTR's supported_nips in NIP-11

3. **TLV (Type-Length-Value) extensibility**: messages can include optional TLV fields that unknown implementations can safely skip
   - Pattern: NOSTR's tag system serves a similar purpose (unknown tags are ignored)

4. **Compliance tests**: the spec includes enough detail for independent test suites
   - Each BOLT defines exact byte sequences for valid messages
   - Failure modes are specified with exact error codes

5. **Multiple interoperating implementations**: CLN, LND, Eclair, LDK all implement BOLTs independently and interoperate
   - Lesson: the spec must be precise enough that two teams reading only the spec (not each other's code) produce compatible implementations

### TLS 1.3 (RFC 8446) as Gold Standard Security Protocol Spec

**What makes it exceptional:**

1. **Formal notation**: protocol messages defined in a formal presentation language
   - Exact byte layouts, field sizes, enum values
   - No ambiguity about wire format

2. **State machine**: connection state transitions defined explicitly
   - Each party's state machine is documented
   - Every valid and invalid transition is specified

3. **Security analysis section**: extensive, covering:
   - Downgrade attacks and prevention
   - Forward secrecy properties
   - Key compromise implications
   - Side channel considerations

4. **Test vectors**: RFC 8448 is an entire companion document of just test vectors for TLS 1.3

**Lesson for NOSTR NIPs**: security-critical NIPs (encryption, authentication, key derivation) should aspire to RFC 8446's level of precision and analysis, even if the format is more informal.

---

## How to Structure a Multi-NIP Proposal

When a feature requires multiple specifications, structure them as a layered set of NIPs:

### Core NIP: Mandatory Behavior
- Define the minimum viable protocol
- Event kinds, required tags, basic protocol flow
- All MUST requirements that every implementation needs
- This NIP alone must be sufficient for basic interoperability

Example structure for NOSTR Mail:
```
NIP-XX: NOSTR Mail (Core)
- Kind 14: direct message content event
- Kind 1059: gift-wrapped encrypted message (references NIP-59)
- Protocol flow: compose → encrypt → wrap → publish → deliver → unwrap → decrypt → display
- Required tags: p (recipient), subject (thread subject)
- Threading model: e-tag references for replies
- Relay requirements: inbox relay behavior, NIP-42 AUTH for read access
```

### Extension NIPs: Optional Features
Each extension is a separate NIP that builds on the core:

```
NIP-XX+1: NOSTR Mail Read Receipts
- Requires: NIP-XX (core)
- Kind 15: read receipt event
- Protocol: recipient creates kind 15 referencing the read message, wraps in kind 1059
- Optional: implementations MAY support read receipts

NIP-XX+2: NOSTR Mail Mailing Lists
- Requires: NIP-XX (core)
- Kind 14 with multiple p-tags for group messaging
- List management: addressable event for list membership
- Relay behavior for list distribution

NIP-XX+3: NOSTR Mail Auto-Responders
- Requires: NIP-XX (core)
- Addressable event defining auto-response rules
- Client behavior: check for auto-responder before sending, display notice
```

### Test Vector Document
- Separate document (or appendix) with all test vectors
- Organized by NIP section (encryption vectors, wrapping vectors, threading vectors)
- Machine-parseable JSON format
- Updated whenever the spec changes

---

## How to Handle Spec Evolution

### Versioning

**Event-level versioning:**
- Include a version indicator in the event (e.g., NIP-44 uses a version byte in the payload)
- New versions add capabilities, old versions remain valid
- Implementations MUST handle all defined versions
- Implementations SHOULD produce the latest version

**Feature flags:**
- Relay capabilities advertised via NIP-11 `supported_nips`
- Client capabilities can be advertised via kind 10002 (relay list) or custom events
- Feature negotiation: client checks relay capabilities before using advanced features

### Deprecation Process

1. **Mark as deprecated**: add deprecation notice to the NIP with date and reason
2. **Migration path**: specify exactly how to migrate from deprecated to replacement
   - Example: NIP-04 (deprecated DMs) → NIP-17 (new DMs)
   - Include code examples showing before/after
3. **Transition period**: specify how long implementations should support the deprecated behavior
   - "Clients SHOULD support reading NIP-04 messages for at least 12 months after this NIP is finalized"
   - "Clients MUST NOT create new NIP-04 messages after [date]"
4. **Removal**: after transition period, deprecated behavior MAY be removed from implementations

### Backward Compatibility

**Principle**: new implementations MUST handle old events gracefully.

- If a client encounters an event with an unknown kind, it MUST ignore it (not crash, not display an error)
- If a client encounters an unknown tag, it MUST ignore the tag (not reject the event)
- If a relay receives an event with a version it does not understand, it SHOULD store it anyway (it may be valid for newer clients)
- If an encryption payload has an unknown version byte, the client MUST reject it with a clear error ("unsupported encryption version") rather than attempting to decrypt

**Anti-pattern**: breaking changes that silently produce incorrect results
- Example: changing the serialization format for event ID computation without versioning would cause old clients to compute different IDs for the same event, leading to silent data corruption

**Safe pattern**: additive changes that degrade gracefully
- New optional tags: old clients ignore them, new clients use them
- New event kinds: old clients ignore them, new clients handle them
- New fields in NIP-11: old clients ignore unknown fields

---

## Specification Review Checklist

Before submitting a NIP, verify:

### Completeness
- [ ] Every event kind is fully defined with JSON example
- [ ] Every tag is defined with format, semantics, and required/optional status
- [ ] Every protocol flow has numbered steps with clear actors
- [ ] Every MUST has a corresponding test vector or test case
- [ ] Edge cases are addressed (empty values, missing fields, duplicates, maximum lengths)
- [ ] Error conditions are specified (what happens when things go wrong)

### Clarity
- [ ] RFC 2119 keywords used consistently and only when intended
- [ ] No ambiguous language ("should probably", "might want to", "it's recommended")
- [ ] No undefined terms (every technical term is defined or references a definition)
- [ ] No circular definitions
- [ ] No implementation-specific language (describe behavior, not data structures)

### Security
- [ ] Security Considerations section present and substantive
- [ ] Threat model identified (who are the attackers, what can they observe/modify)
- [ ] Known attack vectors listed with mitigations
- [ ] Metadata leakage analyzed (what can a relay or network observer learn)
- [ ] Cryptographic choices justified (why this algorithm, why these parameters)

### Interoperability
- [ ] Test vectors included for all algorithms and transformations
- [ ] Failure test vectors included (invalid inputs that must be rejected)
- [ ] JSON examples are valid JSON (syntax checked)
- [ ] Wire format is unambiguous (exact byte layout where relevant)
- [ ] Dependencies on other NIPs are listed and the relationship is clear
