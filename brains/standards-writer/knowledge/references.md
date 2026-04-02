# Standards Writer — References

## Core Standards and Style Guides

### RFC 2119 — Key Words for Use in RFCs
- **Source**: IETF
- **URL**: https://www.rfc-editor.org/rfc/rfc2119
- **Content**: defines the precise meaning of MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL when used in specifications
- **Relevance**: every NIP that uses conformance language must reference and follow RFC 2119. The boilerplate sentence ("The key words... are to be interpreted as described in RFC 2119") should appear in every normative NIP.

### IETF RFC Style Guide
- **Source**: IETF
- **URLs**:
  - RFC 7322 (RFC Style Guide): https://www.rfc-editor.org/rfc/rfc7322
  - RFC 7841 (RFC Streams, Headers, Boilerplates): https://www.rfc-editor.org/rfc/rfc7841
  - "Guidelines to Authors of Internet-Drafts": https://www.ietf.org/standards/ids/guidelines/
- **Key principles**:
  - Clear, unambiguous language
  - Consistent terminology (define terms, use them consistently)
  - Separate normative requirements from informational text
  - Include security considerations section
  - IANA considerations for registries
- **Relevance**: while NIPs are less formal than RFCs, the writing principles apply. Clarity, consistency, and completeness are universal requirements for protocol specifications.

### "The Art of Writing RFCs"
- **Source**: various IETF community guides
- **Key guides**:
  - "Writing Good Internet-Drafts" (IETF Tools team)
  - "How to Write an RFC" (various blog posts by IETF authors)
  - "Common RFC Writing Mistakes" (community-maintained lists)
- **Key takeaways**:
  - Start with the problem statement, not the solution
  - Define all terms before using them
  - Use examples liberally — a good example is worth a page of prose
  - Test your spec by having someone implement from it without asking you questions
  - If they have to ask, the spec is incomplete
- **Relevance**: the "implement from spec alone" test is the gold standard. A NIP should be implementable by a developer who has read only the NIP and its dependencies, without reading any reference implementation code.

---

## NOSTR Specification References

### NIP Template
- **Source**: nostr-protocol/nips repository
- **Path**: `nips/_template.md` (in the NOSTR knowledge base)
- **Content**: standard template for NIP documents including required sections
- **Relevance**: all new NIPs should follow this template structure. The template ensures consistency across the NIP corpus.

### NIP-01 — Basic Protocol
- **Source**: https://github.com/nostr-protocol/nips/blob/master/01.md
- **Content**: defines the foundational NOSTR protocol — event format, relay-client message types (EVENT, REQ, CLOSE, OK, EOSE, CLOSED), filter format, subscription model, event validation rules
- **Relevance**: NIP-01 is the reference NIP for format and style. It defines the core concepts that all other NIPs build upon. Study NIP-01's structure as the baseline for how a NIP should read.

### NIP-44 — Encrypted Payloads (Version 2)
- **Source**: https://github.com/nostr-protocol/nips/blob/master/44.md
- **Content**: versioned encryption scheme for NOSTR events — ECDH key agreement, HKDF key derivation, XChaCha20 encryption, HMAC-SHA256 authentication, padded plaintext
- **Why it is a model spec**:
  - Numbered algorithm steps with no ambiguity
  - Complete test vectors with all intermediate values
  - Version byte for forward compatibility
  - Explicit security analysis
  - Clear separation of specification from rationale
- **Relevance**: the gold standard for cryptographic NIPs. Any NIP involving encryption, key derivation, or authentication should follow NIP-44's level of precision.

### NIP-17 — Private Direct Messages
- **Source**: https://github.com/nostr-protocol/nips/blob/master/17.md
- **Content**: defines kind 14 (direct message), protocol flow for encrypting and delivering private messages using NIP-44 encryption and NIP-59 gift wrapping
- **Why it is a model spec**:
  - Clean layered architecture (message format, encryption, wrapping are separate concerns)
  - Clear protocol flow with numbered steps
  - Explicit about prohibited behaviors (kind 14 MUST NOT be published directly)
  - Threading model defined
- **Relevance**: the direct predecessor to any NOSTR Mail specification. Understand NIP-17 thoroughly before writing mail-related NIPs.

### NIP-59 — Gift Wraps
- **Source**: https://github.com/nostr-protocol/nips/blob/master/59.md
- **Content**: defines kind 1059 (gift wrap) and kind 13 (seal) — a two-layer wrapping protocol that hides sender metadata from relays
- **Why it matters**:
  - Outer wrap (kind 1059): random pubkey, hides real sender from relay
  - Inner seal (kind 13): real sender's pubkey, encrypted so only recipient can see who sent it
  - Metadata protection: relay sees only recipient (from p-tag) and a random sender pubkey
- **Relevance**: the transport layer for private messaging in NOSTR. Any mail specification must use NIP-59 for metadata protection.

---

## External Protocol Specifications

### RFC 8446 — TLS 1.3
- **Source**: IETF
- **URL**: https://www.rfc-editor.org/rfc/rfc8446
- **Content**: Transport Layer Security protocol version 1.3 — handshake protocol, record protocol, key schedule, cipher suites, extensions
- **Why it is the gold standard**:
  - Formal presentation language for message formats
  - Explicit state machines for client and server
  - Extensive security analysis (Section 4+)
  - Companion test vector document (RFC 8448)
  - Multiple independent implementations interoperate perfectly
- **Relevance**: aspiration target for security-critical NIPs. While NIPs are less formal, the principles of precision, state machine documentation, and comprehensive test vectors apply.

### RFC 8448 — Example Handshake Traces for TLS 1.3
- **Source**: IETF
- **URL**: https://www.rfc-editor.org/rfc/rfc8448
- **Content**: complete byte-level traces of TLS 1.3 handshakes with all intermediate values
- **Relevance**: demonstrates how to write a companion test vector document. Every byte, every key, every intermediate computation is shown. This level of detail enables independent implementations to verify correctness at every step.

### BOLT Specifications — Lightning Network
- **Source**: Lightning Network specifications
- **URL**: https://github.com/lightning/bolts
- **Content**: BOLT-01 through BOLT-11 defining the Lightning Network protocol
- **Key patterns for NOSTR**:
  - Feature bit negotiation (capabilities advertisement)
  - TLV extensibility (forward-compatible message extensions)
  - Multi-implementation interop (CLN, LND, Eclair, LDK)
  - Separate concerns into numbered specs
- **Relevance**: BOLT specs prove that multi-implementation protocols can work when specs are precise enough. The feature bit pattern maps to NIP-11 supported_nips. The TLV pattern maps to NOSTR's tag extensibility.

---

## NIP Process and Governance

### NIP Submission Process
- **Source**: nostr-protocol/nips GitHub repository
- **URL**: https://github.com/nostr-protocol/nips
- **Process**:
  1. Write the NIP following the template format
  2. Open a pull request to the nips repository
  3. Community review and discussion on the PR
  4. Iterate based on feedback
  5. Merge when rough consensus is reached
  6. Status progression: draft → active discussion → merged (de facto standard)
- **Key norms**:
  - NIPs should be implementable (not just theoretical)
  - At least one implementation should exist or be in progress
  - Backward compatibility is strongly preferred
  - Breaking changes to existing NIPs require strong justification
- **Relevance**: understanding the submission process is essential for getting a NIP accepted. Write for the reviewers: be precise, anticipate questions, include examples.

---

## Test Vector Standards

### JSON Schema for Test Vectors
- **Format**: JSON objects with standardized fields
- **Recommended structure**:
  ```json
  {
    "name": "descriptive_test_name",
    "description": "Human-readable description of what this test verifies",
    "input": { },
    "intermediate_values": { },
    "expected_output": { },
    "expected_result": "ACCEPT | REJECT",
    "expected_error": "error message if REJECT"
  }
  ```
- **Conventions**:
  - Hex strings for binary data (lowercase)
  - Base64 for encoded payloads (standard base64 with padding)
  - Timestamps as integers (Unix epoch seconds)
  - All JSON must be valid and parseable
- **Relevance**: standardized test vector format enables automated conformance testing across implementations.

### Organizing Test Vectors
- Group by specification section (encryption, wrapping, validation, protocol flow)
- Include at minimum:
  - 3+ happy path vectors per operation
  - 3+ failure vectors per operation
  - 1+ edge case vector per identified edge case
  - 1+ interoperability vector (output from reference implementation)
- Store as a separate file (JSON array of test objects) or as a dedicated section in the NIP
- Version test vectors alongside the spec (test vectors must be updated when the spec changes)
