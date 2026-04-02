# Standards Writer — Fundamentals

## RFC 2119 Conformance Language

RFC 2119 defines precise meanings for requirement-level keywords used in specifications. These words MUST be used consistently and intentionally.

### Definitions

**MUST** (synonyms: REQUIRED, SHALL)
- Absolute requirement. Implementations that do not fulfill a MUST requirement are non-conformant.
- Example: "Clients MUST verify the event signature before displaying content."
- Use when: interoperability or security depends on this behavior.

**MUST NOT** (synonym: SHALL NOT)
- Absolute prohibition. Implementations that perform a MUST NOT action are non-conformant.
- Example: "Relays MUST NOT store ephemeral events (kinds 20000-29999)."
- Use when: performing this action would break the protocol or compromise security.

**SHOULD** (synonym: RECOMMENDED)
- Strong recommendation. Valid reasons to deviate may exist, but the full implications must be understood.
- Example: "Clients SHOULD display a warning when sending to an unverified NIP-05 address."
- Use when: best practice, but edge cases justify deviation.

**SHOULD NOT** (synonym: NOT RECOMMENDED)
- Strong discouragement. Valid reasons to do this may exist, but the full implications must be understood.
- Example: "Clients SHOULD NOT display raw public keys in the primary UI."
- Use when: generally harmful, but some implementations may have legitimate reasons.

**MAY** (synonym: OPTIONAL)
- Truly optional. An implementation can include or omit this feature without any implication of non-conformance.
- Example: "Relays MAY implement NIP-45 COUNT for inbox badge counts."
- Use when: a feature enhances functionality but is not required for interoperability.

### Usage Rules
1. Only use capitalized forms when invoking their RFC 2119 meaning
2. Include the standard boilerplate: "The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in RFC 2119."
3. Do not use these words casually. "The client must connect" (lowercase) is ambiguous — does it mean "has to" or "MUST per spec"?
4. Every MUST/MUST NOT should be testable — if you cannot write a test for it, it is not a real requirement

---

## NIP Format Conventions

### Standard Structure

```markdown
NIP-XX
======

Title: [Descriptive Name]
Status: [draft | final | deprecated]
Author: [name <email> (pubkey)]
Created: [YYYY-MM-DD]
Requires: [list of NIP dependencies]

## Abstract

One paragraph summarizing what this NIP defines and why.

## Motivation

Why does this NIP exist? What problem does it solve?
What was the previous state, and why is it insufficient?

## Specification

### Event Kinds

Define each event kind used:
- Kind number, name, behavior category (regular/replaceable/ephemeral/addressable)
- Required tags
- Content format
- JSON example

### Tags

Define each tag used:
- Tag name (single letter or multi-letter)
- Value format
- Required vs. optional
- Example

### Protocol Flow

Numbered steps describing the interaction:
1. Client does X
2. Relay responds with Y
3. Client verifies Z

### JSON Examples

Complete, valid JSON for every event type and message type defined.

## Relay Behavior

What relays MUST, SHOULD, and MAY do when handling events defined by this NIP.

## Client Behavior

What clients MUST, SHOULD, and MAY do when creating and consuming events defined by this NIP.

## Security Considerations

Threat model, known attack vectors, mitigations.

## Test Vectors

Input/output pairs for every algorithm or transformation defined.

## References

Links to dependencies (other NIPs, RFCs, external specs).
```

### Event Kind Definitions

Every event kind definition must include:
```json
{
  "kind": 1059,
  "tags": [
    ["p", "<recipient-pubkey-hex>"]
  ],
  "content": "<encrypted-payload>",
  "created_at": 1234567890,
  "pubkey": "<sender-pubkey-hex>",
  "id": "<sha256-hex>",
  "sig": "<schnorr-sig-hex>"
}
```

Requirements for kind definitions:
- Specify which tags are REQUIRED vs. OPTIONAL
- Specify the format and semantics of the `content` field
- Specify whether the kind is regular, replaceable, ephemeral, or addressable
- Specify what happens when a relay receives an invalid event of this kind

### Tag Format Definitions

Tags are arrays of strings. Define each position:
```
["p", "<32-byte-hex-pubkey>", "<relay-url-hint>"]
  ^         ^                       ^
  |         |                       |
  tag name  required value          optional hint
  (index 0) (index 1)              (index 2)
```

- Specify the tag name (index 0)
- Specify the value format and validation rules (index 1)
- Specify any additional positions and whether they are required or optional
- Specify behavior when the tag is malformed

### Protocol Flows

Write protocol flows as numbered steps with clear actor identification:

```
1. Sender's client creates a kind 14 event (direct message content)
2. Sender's client encrypts the kind 14 event using NIP-44 with the recipient's pubkey
3. Sender's client wraps the encrypted event in a kind 1059 gift wrap (NIP-59)
4. Sender's client publishes the kind 1059 event to the recipient's inbox relays
5. Recipient's relay stores the kind 1059 event
6. Recipient's client authenticates with the relay (NIP-42)
7. Recipient's client subscribes to kind 1059 events with their p-tag
8. Relay delivers matching events to the recipient's client
9. Recipient's client unwraps the kind 1059 event (NIP-59)
10. Recipient's client decrypts the inner event (NIP-44)
11. Recipient's client displays the kind 14 message
```

Each step must be unambiguous: who does what, to what, using which mechanism.

---

## Spec Writing Anti-Patterns

### Ambiguous Language

**Bad**: "The client should probably verify the signature."
- What does "probably" mean? Is this a SHOULD or a MAY?

**Good**: "The client MUST verify the event signature before displaying the event content."

**Bad**: "The relay processes the event."
- What does "process" mean? Validate? Store? Forward? All three?

**Good**: "The relay MUST validate the event signature, store the event if valid, and deliver the event to all matching active subscriptions."

### Missing Edge Cases

**Bad**: "If the `subject` tag is present, use it as the thread subject."
- What if the tag is present but the value is an empty string?
- What if there are multiple `subject` tags?
- What if the value exceeds a reasonable length?

**Good**: "If the event contains exactly one `subject` tag with a non-empty value of at most 200 UTF-8 characters, the client SHOULD use it as the thread subject. If the `subject` tag is absent, has an empty value, or appears more than once, the client SHOULD use '(No Subject)' as the thread subject."

### Undefined Behavior

**Bad**: "The relay stores the event."
- What storage guarantees exist? Can it be garbage collected? When?
- What happens if storage is full?
- What is the expected retention period?

**Good**: "The relay MUST store the event for at least the duration specified in its NIP-11 `retention` field for the event's kind. If no retention is specified, the relay SHOULD store the event for at least 30 days. If storage is exhausted, the relay MUST respond with `[\"OK\", event_id, false, \"error: storage full\"]` and MUST NOT silently discard the event."

### Circular Definitions

**Bad**: "A valid event is one that passes validation."

**Good**: "An event is valid if and only if: (1) the `id` field equals the SHA-256 hash of the serialized event array `[0, pubkey, created_at, kind, tags, content]`, (2) the `sig` field is a valid Schnorr signature of the `id` by the `pubkey`, and (3) all required tags for the event's kind are present and well-formed."

### Implementation-Specific Language

**Bad**: "Store the events in a HashMap keyed by event ID."

**Good**: "The relay MUST be able to retrieve an event by its `id` in O(1) amortized time."

**Bad**: "Use AES-256-GCM to encrypt the content."

**Good**: "The content MUST be encrypted using the algorithm specified in NIP-44, version 2."

---

## How to Write Test Vectors

### Principles
1. **Include ALL intermediate values**: input, every derived value, and final output
2. **Include failure cases**: inputs that MUST be rejected
3. **Format as JSON**: machine-parseable
4. **Include both minimal and complex examples**: edge cases matter

### Test Vector Format

```json
{
  "test_name": "valid_encryption_roundtrip",
  "description": "Encrypt and decrypt a short message",
  "input": {
    "sender_private_key": "0123456789abcdef...",
    "recipient_public_key": "fedcba9876543210...",
    "plaintext": "Hello, World!",
    "nonce": "aabbccdd..."
  },
  "intermediate": {
    "shared_secret": "1122334455...",
    "conversation_key": "5566778899...",
    "encryption_key": "aabbccddee...",
    "nonce_bytes": "..."
  },
  "expected_output": {
    "ciphertext": "encrypted_hex_here",
    "mac": "mac_hex_here",
    "payload": "full_payload_base64_here"
  }
}
```

### Failure Test Vectors

```json
{
  "test_name": "reject_invalid_mac",
  "description": "Event with corrupted MAC must be rejected",
  "input": {
    "payload": "payload_with_bad_mac_here",
    "recipient_private_key": "..."
  },
  "expected_result": "REJECT",
  "expected_error": "invalid MAC"
}
```

### Categories of Test Vectors to Include
1. **Happy path**: normal operation with typical inputs
2. **Boundary values**: empty string, maximum length string, exactly at limits
3. **Unicode**: multi-byte characters, emoji, right-to-left text, zero-width characters
4. **Special characters**: null bytes, control characters, JSON special characters
5. **Cryptographic edge cases**: all-zero keys (should reject), key equal to curve order (should reject)
6. **Interoperability**: output from implementation A must be readable by implementation B

---

## Conformance Test Suite Design

### Positive Tests (Valid Operations)
- Given valid input, the implementation MUST produce the correct output
- Test every MUST requirement in the spec
- Test with multiple valid inputs (not just one example)

```
TEST: valid_gift_wrap_creation
  GIVEN: a valid kind 14 event and a recipient pubkey
  WHEN: the client creates a kind 1059 gift wrap
  THEN: the resulting event has kind 1059
   AND: the event has a p tag with the recipient pubkey
   AND: the event signature is valid
   AND: the inner encrypted event can be decrypted by the recipient
   AND: the decrypted event matches the original kind 14 event
```

### Negative Tests (Invalid Inputs)
- Given invalid input, the implementation MUST reject it (not just "not crash")
- Test every MUST NOT requirement in the spec
- Verify specific error type/message where the spec defines one

```
TEST: reject_gift_wrap_with_missing_p_tag
  GIVEN: a kind 1059 event without a p tag
  WHEN: the relay receives this event
  THEN: the relay MUST respond with ["OK", id, false, "invalid: missing p tag"]
   AND: the relay MUST NOT store the event
```

### Edge Case Tests
- Empty content field
- Maximum length content (at the relay's limit)
- Content exactly one byte over the limit
- Unicode edge cases (multi-byte boundaries, combining characters)
- Timestamp edge cases (0, very old, very far future, negative)
- Tags with unexpected extra elements
- Tags with missing required elements
- Duplicate tags

### Interoperability Tests
- Client A creates event, Client B reads it correctly
- Test across all known implementations
- Focus on areas where implementations historically diverge:
  - JSON serialization (key ordering, Unicode escaping, number formatting)
  - Timestamp handling (precision, timezone)
  - Tag matching (case sensitivity, prefix matching semantics)
  - Encryption/decryption (padding, nonce handling)
