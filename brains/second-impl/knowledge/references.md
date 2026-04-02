# Second Implementation — References

Specifications, conformance test suites, and multi-implementation protocol models that inform the second implementation approach.

---

## 1. Multi-Implementation Protocol Models

### Lightning BOLT Specifications

- **Repository:** https://github.com/lightning/bolts
- **Specifications:**
  - BOLT-01: Base Protocol (peer messaging, feature bits)
  - BOLT-02: Peer Protocol for Channel Management (open, close, update)
  - BOLT-03: Bitcoin Transaction and Script Formats
  - BOLT-04: Onion Routing Protocol
  - BOLT-05: Recommendations for On-chain Transaction Handling
  - BOLT-07: P2P Node and Channel Discovery
  - BOLT-08: Encrypted and Authenticated Transport (Noise_XK)
  - BOLT-09: Assigned Feature Flags
  - BOLT-10: DNS Bootstrap and Assisted Node Location
  - BOLT-11: Invoice Protocol for Lightning Payments

- **Why this is a model:**
  - Three independent implementations from day one (CLN, LND, Eclair)
  - A fourth (LDK) added later, finding additional bugs
  - Every protocol message has exact byte-level format definitions
  - Feature bits enable incremental adoption of new capabilities
  - Regular interop testing events among implementation teams
  - When implementations disagree, the spec is updated (not silently tolerated)

- **Key interop lessons from Lightning:**
  - **Fee calculation:** Different implementations used different rounding strategies for fee calculation. The spec was ambiguous about whether to round up or down. Fixed by specifying exact rounding behavior.
  - **Channel reserve:** When a channel is opened, both parties must maintain a reserve. The spec did not clearly define what happens when the reserve equals the channel capacity. Different implementations handled this differently, leading to stuck channels.
  - **Onion packet size:** The spec specified a fixed-size onion packet, but was ambiguous about padding. One implementation used zero-padding, another used random-padding. The observable difference was a privacy concern (random is better).
  - **Shutdown ordering:** During cooperative close, the spec allowed both parties to send shutdown messages. The order of messages was underspecified, leading to rare deadlocks.

- **Relevance to NOSTR Mail:** The BOLT model demonstrates that multi-implementation testing is the most effective way to find spec ambiguities. NOSTR Mail should aim for at least two independent implementations before the spec is finalized.

---

### HTTP/2 h2spec Conformance Test Suite

- **Repository:** https://github.com/summerwind/h2spec
- **Language:** Go
- **Test count:** 146 test cases
- **Install:** `go install github.com/summerwind/h2spec/cmd/h2spec@latest`
- **Usage:** `h2spec -h <host> -p <port> -t`

- **What h2spec tests:**
  - Frame format conformance (DATA, HEADERS, PRIORITY, RST_STREAM, SETTINGS, PUSH_PROMISE, PING, GOAWAY, WINDOW_UPDATE, CONTINUATION)
  - HPACK header compression conformance
  - Stream state machine transitions
  - Flow control behavior
  - Error handling for invalid frames
  - Connection preface requirements
  - Server push correctness

- **Key design decisions in h2spec:**
  - Tests are organized by spec section (Section 4: HTTP Frames, Section 5: Streams, Section 6: Frame Definitions, etc.)
  - Each test references a specific MUST or SHOULD from RFC 7540
  - Tests send intentionally malformed input and verify the implementation responds correctly
  - Tests verify both positive (correct behavior) and negative (error handling) cases
  - Tests are run from an external client, not as unit tests within the implementation

- **Relevance to NOSTR Mail:** NOSTR Mail should have a similar external conformance test suite that can be pointed at any implementation and verify correctness. The test suite should:
  - Reference specific NIP-XX section numbers
  - Cover both valid and invalid inputs
  - Be runnable from the command line
  - Produce a machine-readable report (JSON or TAP format)

---

### QUIC Interop Runner

- **Repository:** https://github.com/marten-seemann/quic-interop-runner
- **URL:** https://interop.seemann.io/ (live dashboard)
- **Creator:** Marten Seemann (one of the QUIC spec editors)

- **How it works:**
  1. Each QUIC implementation provides a Docker container
  2. The runner spins up pairs of implementations (client A + server B)
  3. The runner exercises a predefined set of test scenarios
  4. Results are collected and displayed on a public dashboard
  5. The matrix shows which implementation pairs pass which tests

- **Test scenarios:**
  - Handshake: establish a QUIC connection
  - Transfer: send data over a QUIC connection
  - Retry: handle server retry tokens
  - Resumption: resume a previous session
  - 0-RTT: send data in the first flight
  - HTTP/3: serve HTTP/3 requests
  - Multiconnect: multiple simultaneous connections
  - ChaCha20: negotiate ChaCha20-Poly1305 cipher suite
  - Key Update: perform a key update during the connection
  - ECN: Explicit Congestion Notification
  - V2: QUIC version 2 negotiation

- **Key design decisions:**
  - Docker containers ensure each implementation runs in its own environment
  - The runner is independent of all implementations (neutral third party)
  - Results are public and updated continuously
  - New implementations can be added by providing a Docker container
  - Test scenarios are defined by the runner, not by any implementation

- **Relevance to NOSTR Mail:** The QUIC interop runner is the gold standard for automated multi-implementation testing. NOSTR Mail could adopt a similar model:
  - Each implementation provides a Docker container with a CLI interface
  - The runner exercises: create event, encrypt, decrypt, wrap, unwrap, relay publish, relay subscribe, full round-trip
  - Results displayed on a public dashboard
  - New implementations can join by providing a container

---

## 2. Test Vector Sources

### NIP-44 Test Vectors

- **Location:** https://github.com/nostr-protocol/nips/blob/master/44.md (appendix)
- **Also available as standalone JSON:** Referenced in the NIP-44 specification
- **SHA-256 checksum of test vector set:** `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`

- **Vector categories:**
  1. **Conversation key derivation** — Given (sender_sk, recipient_pk), verify conversation_key
  2. **Message encryption** — Given (conversation_key, plaintext, nonce), verify payload
  3. **Padding** — Given plaintext_length, verify padded_length
  4. **Decryption** — Given (conversation_key, payload), verify plaintext
  5. **Invalid payloads** — Given (conversation_key, invalid_payload), verify rejection
     - Wrong version byte
     - Truncated payload
     - Invalid MAC
     - Invalid padding

- **How to use:**
  ```
  For each conversation_key vector:
    our_ck = our_hkdf_extract(sec1_sk, sec2_pk)
    assert our_ck == vector.expected_conversation_key

  For each encryption vector:
    our_payload = our_encrypt(vector.conversation_key, vector.plaintext, vector.nonce)
    assert our_payload == vector.expected_payload

  For each decryption vector:
    our_plaintext = our_decrypt(vector.conversation_key, vector.payload)
    assert our_plaintext == vector.expected_plaintext

  For each invalid vector:
    assert_throws(our_decrypt(vector.conversation_key, vector.invalid_payload))
  ```

### BIP-340 Test Vectors

- **Location:** https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv
- **Format:** CSV with columns: index, secret key, public key, aux_rand, msg, sig, verification result, comment

- **Vector types:**
  - Signing vectors (index 0-3): Given (sk, msg, aux_rand), verify (pk, sig)
  - Verification-only vectors (index 4-14): Given (pk, msg, sig), verify result (true/false)
  - Failure vectors: invalid signature format, point not on curve, R with odd Y

- **Critical for NOSTR:** Every NOSTR event signature uses BIP-340. If the second implementation's BIP-340 is wrong, nothing else will work.

### Cashu NUT Test Vectors

- **Location:** Individual NUT specifications in https://github.com/cashubtc/nuts
- **Key vectors:**
  - NUT-00: hash_to_curve test vectors (input bytes → secp256k1 point)
  - NUT-00: BDHKE test vectors (blinding, signing, unblinding with known random values)
  - NUT-00: Token serialization examples (JSON → cashuA/cashuB string)
  - NUT-12: DLEQ proof examples

---

## 3. Conformance Testing Frameworks

### TAP (Test Anything Protocol)
- **Specification:** https://testanything.org/
- **Format:**
  ```
  TAP version 14
  1..5
  ok 1 - Event ID computation
  ok 2 - NIP-44 conversation key derivation
  ok 3 - NIP-44 encrypt with known nonce
  not ok 4 - NIP-44 padding for 33-byte plaintext
    ---
    message: expected padded_length=64, got padded_length=48
    severity: fail
    ...
  ok 5 - BIP-340 signing
  ```
- **Relevance:** Universal test output format understood by CI systems. NOSTR Mail conformance tests should output TAP format.

### JSON Test Report Format
- **Format:**
  ```json
  {
    "implementation": "nostr-mail-rs",
    "version": "0.1.0",
    "date": "2026-04-01",
    "spec_version": "NIP-XX draft-03",
    "results": [
      {
        "category": "nip44",
        "test": "conversation_key_derivation",
        "vector_index": 0,
        "status": "pass",
        "duration_ms": 2
      },
      {
        "category": "nip44",
        "test": "padding_33_bytes",
        "vector_index": 47,
        "status": "fail",
        "expected": "64",
        "actual": "48",
        "duration_ms": 1
      }
    ],
    "summary": {
      "total": 85,
      "passed": 84,
      "failed": 1,
      "skipped": 0
    }
  }
  ```
- **Relevance:** Machine-readable format for automated interop dashboards.

---

## 4. Protocol Analysis Tools

### Wireshark / WebSocket Dissector
- **URL:** https://www.wireshark.org/
- **WebSocket support:** Built-in dissector for WebSocket frames
- **Usage:** Capture traffic between client and relay, inspect WebSocket frames containing NOSTR messages
- **Relevance:** When two implementations disagree, capture the wire traffic and compare the raw bytes sent by each.

### jq (JSON Query)
- **URL:** https://stedolan.github.io/jq/
- **Usage:** Parse and compare JSON outputs from implementations
- **Example:**
  ```bash
  # Compare event IDs from two implementations
  diff <(impl_a output.json | jq -r '.id') <(impl_b output.json | jq -r '.id')
  
  # Extract intermediate values
  impl_a vectors.json | jq '.intermediate.conversation_key'
  impl_b vectors.json | jq '.intermediate.conversation_key'
  ```

### nak (Nostr Army Knife)
- **Repository:** https://github.com/fiatjaf/nak
- **Usage for interop testing:**
  - `nak verify <event-json>` — Verify an event signature independently
  - `nak event --kind 15 --content "test" --sec <nsec>` — Create a reference event
  - `nak decode <bech32>` — Decode bech32 identifiers for comparison
- **Relevance:** nak serves as an independent "third opinion" when two implementations disagree.

---

## 5. Relay Test Infrastructure

### strfry
- **Repository:** https://github.com/hoytech/strfry
- **Language:** C++ / LMDB
- **Setup:** `docker run -p 7777:7777 dockurr/strfry`
- **Relevance:** Most widely deployed relay implementation. Use as the default test relay for interop testing. If events work with strfry, they will work with most relays in production.

### nostream (formerly nostr-rs-relay)
- **Repository:** https://github.com/Cameri/nostream
- **Language:** TypeScript
- **Relevance:** Alternative relay implementation for cross-relay testing. If events work with both strfry and nostream, relay compatibility is confirmed.

### Local Test Relay Pattern
```bash
# Start a test relay for interop testing
docker run -d --name test-relay -p 7777:7777 dockurr/strfry

# Verify it is running
websocat ws://localhost:7777
# Type: ["REQ", "test", {"limit": 1}]
# Should respond with: ["EOSE", "test"]

# Run interop tests against it
RELAY_URL=ws://localhost:7777 cargo test --features interop
RELAY_URL=ws://localhost:7777 npx vitest --filter interop

# Cleanup
docker stop test-relay && docker rm test-relay
```

---

## 6. Continuous Integration for Interop

### GitHub Actions Workflow Pattern

```yaml
name: Interop Tests
on:
  push:
    branches: [main]
  pull_request:

jobs:
  interop:
    runs-on: ubuntu-latest
    services:
      relay:
        image: dockurr/strfry
        ports:
          - 7777:7777

    steps:
      - uses: actions/checkout@v4

      # Build both implementations
      - name: Build TypeScript implementation
        run: cd impl-ts && npm ci && npm run build

      - name: Build Rust implementation
        run: cd impl-rs && cargo build --release

      # Run test vectors through both
      - name: TypeScript test vectors
        run: cd impl-ts && npm run test:vectors

      - name: Rust test vectors
        run: cd impl-rs && cargo test --features vectors

      # Cross-implementation tests
      - name: TS creates, Rust verifies
        run: |
          cd impl-ts && node create-test-events.js > /tmp/ts-events.json
          cd impl-rs && cargo run --bin verify-events -- /tmp/ts-events.json

      - name: Rust creates, TS verifies
        run: |
          cd impl-rs && cargo run --bin create-test-events -- > /tmp/rs-events.json
          cd impl-ts && node verify-events.js /tmp/rs-events.json

      # Full round-trip via relay
      - name: Full interop round-trip
        env:
          RELAY_URL: ws://localhost:7777
        run: |
          cd impl-ts && node send-test-mail.js &
          cd impl-rs && cargo run --bin receive-test-mail
          # Both must complete successfully
```

This workflow ensures interop is tested on every commit, catching regressions immediately.
