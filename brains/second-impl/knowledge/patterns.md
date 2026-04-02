# Second Implementation — Patterns

Reusable patterns for interop testing, spec gap discovery, cross-implementation validation, and test vector verification.

---

## 1. Interop Testing Protocol

### For Each Operation, Run Both Implementations, Compare Outputs

The fundamental pattern is:

```
1. Define a canonical input (fixed keys, fixed nonce, fixed content)
2. Run Implementation A → produce Output A
3. Run Implementation B → produce Output B
4. Compare Output A and Output B
5. If they match → PASS (both implementations agree)
6. If they differ → INVESTIGATE (find divergence point, classify, fix)
```

### Concrete Test Protocol for NOSTR Mail

#### Test 1: Event ID Computation

```json
{
  "test": "event_id_computation",
  "input": {
    "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "created_at": 1711929600,
    "kind": 15,
    "tags": [
      ["p", "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"],
      ["subject", "Test Message"]
    ],
    "content": "Hello, NOSTR Mail!"
  },
  "procedure": [
    "Serialize as JSON: [0, pubkey, created_at, kind, tags, content]",
    "Compute SHA-256 of the serialized string",
    "Output the hash as lowercase hex"
  ],
  "expected_output": "<both implementations must produce the same 64-char hex string>"
}
```

**Run in both implementations. Record the output. Compare.**

If outputs differ, check:
- JSON serialization: is the output of JSON.stringify identical?
- Number formatting: is `1711929600` serialized as `1711929600` or `1.7119296e+9`?
- String escaping: are special characters in content escaped identically?
- Tag ordering: are tags in the same order?

#### Test 2: NIP-44 Encryption Round-Trip

```
Procedure:
  1. Both implementations use the same sender key and recipient key
  2. Implementation A encrypts "Hello" → Ciphertext A
  3. Implementation B decrypts Ciphertext A → must yield "Hello"
  4. Implementation B encrypts "Hello" → Ciphertext B
  5. Implementation A decrypts Ciphertext B → must yield "Hello"
  6. Note: Ciphertext A ≠ Ciphertext B (different random nonces) — this is expected
```

**Intermediate value comparison:**
```
For a KNOWN nonce (test vector mode, nonce is not random):
  Implementation A conversation_key = ?
  Implementation B conversation_key = ?
  → Must match

  Implementation A chacha_key = ?
  Implementation B chacha_key = ?
  → Must match

  Implementation A hmac = ?
  Implementation B hmac = ?
  → Must match

  Implementation A final_payload = ?
  Implementation B final_payload = ?
  → Must match exactly (same base64 string)
```

#### Test 3: Gift Wrap Round-Trip

```
Procedure:
  1. Implementation A creates a kind 15 rumor
  2. Implementation A wraps it (seal + gift wrap) for Recipient B
  3. Implementation B receives the gift wrap event
  4. Implementation B unwraps it → must recover the original rumor
  5. Verify: rumor.content, rumor.kind, rumor.tags all match

  Then reverse:
  6. Implementation B creates a kind 15 rumor
  7. Implementation B wraps it for Recipient A
  8. Implementation A unwraps → must recover the original rumor
```

**Verification points:**
- Rumor content matches exactly (byte-for-byte)
- Rumor tags match (same order, same values)
- Rumor pubkey matches the sender's real pubkey
- Seal signature verifies against the sender's pubkey
- Gift wrap pubkey is NOT the sender's pubkey (it is an ephemeral key)

#### Test 4: Full Round-Trip via Relay

```
Procedure:
  1. Start a test relay (e.g., strfry or nostream)
  2. Implementation A connects to the relay
  3. Implementation B connects to the relay
  4. Implementation A sends a NOSTR Mail to Implementation B:
     - Creates kind 15 rumor
     - Encrypts and wraps for B
     - Publishes gift wrap to relay
  5. Implementation B subscribes for kind 1059 events addressed to B
  6. Implementation B receives the gift wrap
  7. Implementation B unwraps and decrypts
  8. Verify: B sees the original message with correct subject, body, sender
  9. Implementation B replies to the message
  10. Implementation A receives the reply
  11. Verify: A sees the reply with correct threading (e-tag references original)
```

This is the definitive interop test. If this passes, the implementations are interoperable for basic NOSTR Mail.

---

## 2. Spec Gap Discovery Protocol

### Systematic Spec Reading

Read the spec section by section. For each normative statement (MUST, SHOULD, MAY), ask:

1. **Is this testable?** Can I write a test that verifies an implementation follows this requirement?
2. **Is this complete?** Does this cover all inputs, including edge cases?
3. **Is this unambiguous?** Could two readers interpret this differently?
4. **Is this consistent?** Does this contradict anything else in the spec?

### The "What If" Game

For every operation in the spec, systematically explore failure modes:

```
Operation: NIP-44 Encrypt(plaintext, conversation_key)

What if plaintext is empty string ("")?
What if plaintext is null/undefined?
What if plaintext contains null bytes (\x00)?
What if plaintext is exactly 1 byte?
What if plaintext is exactly 65535 bytes (uint16 max)?
What if plaintext is 65536 bytes (overflow)?
What if plaintext is 100MB?
What if conversation_key is all zeros?
What if conversation_key is all ones?
What if conversation_key is 31 bytes (too short)?
What if conversation_key is 33 bytes (too long)?
```

For each "what if," check whether the spec addresses it. If not, file a spec gap.

### Edge Case Categories

| Category | Examples |
|----------|---------|
| **Boundary values** | 0, 1, max-1, max, max+1 for every numeric field |
| **Empty inputs** | Empty string, empty array, empty tags, no content |
| **Type mismatches** | String where number expected, float where int expected |
| **Encoding issues** | Non-UTF8 bytes, BOM, surrogate pairs, zero-width characters |
| **Timing issues** | created_at = 0, created_at in the far future, created_at negative |
| **Duplicate data** | Same tag twice, same p-tag twice, event republished |
| **Missing data** | No p-tag, no subject, no content, no sig |
| **Malformed data** | Invalid hex in pubkey, truncated signature, invalid base64 |

---

## 3. Cross-Implementation Testing Matrix

### Matrix Structure

For N implementations and M operations, the full testing matrix has N*N*M entries:

```
         Creates    |  Impl-A   |  Impl-B   |  Impl-C
Parses              |           |           |
--------------------+-----------+-----------+----------
Impl-A              |  (self)   |  A→B      |  A→C
Impl-B              |  B→A      |  (self)   |  B→C
Impl-C              |  C→A      |  C→B      |  (self)
```

Self-tests (diagonal) verify internal consistency. Cross-tests (off-diagonal) verify interoperability.

### Operations to Test

```
Operations Matrix:
  1. Event ID computation (deterministic — all implementations must produce same ID)
  2. BIP-340 sign (non-deterministic nonce — verify with any implementation)
  3. BIP-340 verify (deterministic — all must agree on valid/invalid)
  4. NIP-44 encrypt (non-deterministic nonce — verify by decrypting)
  5. NIP-44 decrypt (deterministic — all must produce same plaintext)
  6. NIP-44 encrypt with known nonce (deterministic — must produce identical ciphertext)
  7. NIP-59 gift wrap (non-deterministic — verify by unwrapping)
  8. NIP-59 unwrap (deterministic given the keys)
  9. Kind 15 event parsing (deterministic — extract subject, body, recipients, threading)
  10. Cashu token serialization (deterministic — same proofs produce same token string)
  11. Cashu token deserialization (deterministic — same string produces same proofs)
```

### Automation

```python
# Pseudocode for automated interop testing

implementations = {
    "typescript": TypeScriptImpl("localhost:3001"),
    "rust": RustImpl("localhost:3002"),
}

test_vectors = load_test_vectors("vectors.json")

results = []

for vector in test_vectors:
    for creator_name, creator in implementations.items():
        # Create output using this implementation
        output = creator.execute(vector.operation, vector.input)
        
        for verifier_name, verifier in implementations.items():
            # Verify output using every other implementation
            if vector.is_deterministic:
                # Deterministic: outputs must match exactly
                expected = vector.expected_output
                passed = (output == expected)
            else:
                # Non-deterministic: verify by round-trip
                # e.g., encrypt produces different ciphertext each time,
                # but decrypt must recover the original plaintext
                recovered = verifier.reverse(vector.operation, output, vector.input)
                passed = (recovered == vector.input.plaintext)
            
            results.append({
                "vector": vector.name,
                "creator": creator_name,
                "verifier": verifier_name,
                "passed": passed,
                "output": output if not passed else None,
            })

# Generate report
failures = [r for r in results if not r["passed"]]
print(f"Passed: {len(results) - len(failures)} / {len(results)}")
for f in failures:
    print(f"FAIL: {f['vector']} — {f['creator']} → {f['verifier']}")
    print(f"  Output: {f['output']}")
```

---

## 4. Test Vector Validation Pattern

### Reference Test Vectors Through Independent Implementation

The reference implementation ships test vectors. The second implementation validates them:

```
For each test vector:
  1. Parse the input values
  2. Execute the operation using OUR code (not the reference code)
  3. Compare our output with the expected output in the test vector
  4. If match → vector is confirmed
  5. If mismatch → investigate (our bug, or test vector error?)
```

### Test Vector Trust Levels

| Level | Meaning | Action |
|-------|---------|--------|
| **Verified by 2+ implementations** | High confidence | Use as canonical |
| **Verified by 1 implementation** | Medium confidence | Validate with second implementation |
| **Unverified** | Low confidence | May contain errors; verify before trusting |
| **Generated by hand** | Very low confidence | Must be verified by at least one implementation |

### Generating New Test Vectors

When the second implementation discovers a spec gap that requires a new test vector:

```json
{
  "name": "padding_boundary_33_bytes",
  "description": "Plaintext of exactly 33 bytes triggers non-trivial padding",
  "source": "second-impl discovery, 2026-03-15",
  "verified_by": ["rust-impl-v0.2"],
  "pending_verification": ["typescript-ref"],
  "input": {
    "plaintext": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "sender_sk": "...",
    "recipient_pk": "...",
    "nonce": "..."
  },
  "intermediate": {
    "plaintext_length": 33,
    "padded_length": 64,
    "length_prefix_hex": "0021"
  },
  "expected": {
    "payload_base64": "..."
  }
}
```

The test vector includes `verified_by` and `pending_verification` fields to track its trust level.

---

## 5. Divergence Documentation Template

When a divergence is found between implementations:

```markdown
## DIV-XXX: [Short Description]

**Date discovered:** YYYY-MM-DD
**Severity:** Critical / High / Medium / Low
**Status:** Open / Investigating / Resolved / Won't Fix

### Observation
Implementation A produces X. Implementation B produces Y. They should produce the same result.

### Input
[Exact input that triggers the divergence — must be reproducible]

### Implementation A Output
[Exact output from A]

### Implementation B Output
[Exact output from B]

### Intermediate Values
[Where do the outputs first diverge?]

### Root Cause Analysis
[Spec ambiguity / Spec bug / Implementation A bug / Implementation B bug / Test vector error]

### Spec Reference
[Quote the relevant spec text]

### Resolution
[What was changed to fix the divergence?]

### Test Vector
[New test vector added to prevent regression]
```

---

## 6. Conformance Reporting

### Implementation Conformance Report

Each implementation should produce a conformance report:

```markdown
# NOSTR Mail Conformance Report
## Implementation: nostr-mail-rs v0.1.0
## Date: 2026-04-01
## Spec Version: NIP-XX draft-03

### Core Protocol
| Requirement | Status | Notes |
|-------------|--------|-------|
| Kind 15 event creation | PASS | |
| NIP-44 encryption | PASS | All 47 test vectors pass |
| NIP-44 decryption | PASS | All 47 test vectors pass |
| NIP-59 gift wrap | PASS | |
| NIP-59 unwrap | PASS | |
| Event ID computation | PASS | |
| BIP-340 signing | PASS | All 15 BIP-340 vectors pass |
| BIP-340 verification | PASS | |
| Subject tag | PASS | |
| Recipient p-tag | PASS | |
| Threading e-tags | PASS | |

### Extensions
| Requirement | Status | Notes |
|-------------|--------|-------|
| Cashu postage attach | PASS | Tested with nutshell mint |
| Cashu postage claim | PASS | |
| Blossom upload | PASS | |
| Blossom download | PASS | |
| CC recipients | PASS | |
| BCC recipients | PASS | |
| Read receipts | NOT IMPL | Extension not yet implemented |

### Interop
| Test | Partner | Status | Notes |
|------|---------|--------|-------|
| A→B encrypt/decrypt | nostr-mail-ts v0.1.0 | PASS | |
| B→A encrypt/decrypt | nostr-mail-ts v0.1.0 | PASS | |
| A→B gift wrap | nostr-mail-ts v0.1.0 | PASS | |
| B→A gift wrap | nostr-mail-ts v0.1.0 | PASS | |
| Full round-trip | nostr-mail-ts v0.1.0 | PASS | Via strfry relay |

### Spec Gaps Found
| Gap ID | Description | Reported |
|--------|-------------|----------|
| GAP-001 | Maximum content length undefined | Yes, PR #42 |
| GAP-002 | NIP-05 failure behavior unspecified | Yes, PR #43 |

### Test Vector Results
- NIP-44 vectors: 47/47 pass
- BIP-340 vectors: 15/15 pass  
- Custom NOSTR Mail vectors: 23/23 pass
- Total: 85/85 pass
```

This report format allows anyone to assess the implementation's conformance at a glance.
