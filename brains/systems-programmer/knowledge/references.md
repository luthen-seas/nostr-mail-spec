# Systems Programmer — References

Source code repositories, library documentation, test vectors, and protocol specifications needed for implementing the NOSTR Mail reference client.

---

## 1. NOSTR Protocol Libraries

### nostr-tools (TypeScript/JavaScript)
- **Repository:** https://github.com/nbd-wtf/nostr-tools
- **Package:** `npm install nostr-tools`
- **License:** Unlicense
- **Key source files:**
  - `src/pure/index.ts` — Core event creation, hashing, signing (no side effects)
  - `src/relay.ts` — Single WebSocket relay connection
  - `src/pool.ts` — Multi-relay connection pool with deduplication
  - `src/nip44.ts` — NIP-44 v2 encryption: conversation key derivation, encrypt, decrypt, padding
  - `src/nip59.ts` — Gift wrap: createRumor, createSeal, createWrap, unwrap
  - `src/nip19.ts` — Bech32 encoding/decoding: npub, nsec, nprofile, nevent, naddr
  - `src/nip05.ts` — NIP-05 identifier resolution (HTTP query to .well-known/nostr.json)
  - `src/nip42.ts` — Relay authentication
  - `src/nip57.ts` — Zap utilities
  - `src/kinds.ts` — Event kind constants
  - `src/filter.ts` — Subscription filter construction
- **Dependency tree:** Minimal — relies primarily on `@noble/curves` and `@noble/hashes`
- **Build:** ESM-first, tree-shakeable, browser-compatible
- **Testing:** Vitest, run with `npx vitest`
- **Relevance:** Primary foundation for the TypeScript NOSTR Mail SDK. Most protocol primitives are already implemented. NOSTR Mail adds kind 15 event handling, postage logic, and Blossom integration on top.

### rust-nostr (Rust)
- **Repository:** https://github.com/rust-nostr/nostr
- **Crates:**
  - `nostr` — Protocol types, event building, NIP implementations
  - `nostr-sdk` — Client SDK with relay pool, signer abstraction, NIP-65 outbox
  - `nostr-relay-pool` — Relay connection management
  - `nostr-database` — Trait-based event storage (implementations for SQLite, LMDB, RocksDB)
  - `nostr-connect` — NIP-46 Nostr Connect (remote signer)
  - `nostr-ffi` — UniFFI bindings for Python, Kotlin, Swift, JavaScript, C#, Flutter
- **Key source paths:**
  - `crates/nostr/src/event/` — Event struct, builder, ID computation, validation
  - `crates/nostr/src/nips/nip44.rs` — NIP-44 encryption implementation
  - `crates/nostr/src/nips/nip59.rs` — Gift wrap implementation
  - `crates/nostr/src/types/` — Keys, Filter, Timestamp, Metadata
  - `crates/nostr-sdk/src/client/` — Client with relay pool, subscription management
- **Dependencies:** `secp256k1` (libsecp256k1 bindings), `chacha20` crate, `hkdf` crate, `hmac` crate
- **Build:** `cargo build`, `cargo test`
- **Relevance:** Foundation for Rust NOSTR Mail implementation and multi-language bindings via UniFFI.

### go-nostr (Go)
- **Repository:** https://github.com/nbd-wtf/go-nostr
- **Module:** `github.com/nbd-wtf/go-nostr`
- **Key source paths:**
  - `event.go` — Event struct, signing, verification, serialization
  - `relay.go` — WebSocket relay connection
  - `pool.go` — Multi-relay pool
  - `nip44/nip44.go` — NIP-44 encryption (conversation key, encrypt, decrypt)
  - `nip59/nip59.go` — Gift wrap (GiftWrap, GiftUnwrap)
  - `nip19/nip19.go` — Bech32 encoding
  - `nip05/nip05.go` — NIP-05 resolution
  - `filter.go` — Subscription filters
- **Dependencies:** `github.com/btcsuite/btcd/btcec/v2` (secp256k1), `golang.org/x/crypto` (ChaCha20, HKDF)
- **Build:** `go build ./...`, `go test ./...`
- **Relevance:** Foundation for Go-based relay implementations, bridge components, and CLI tools.

---

## 2. Cryptographic Libraries

### @noble/curves (JavaScript)
- **Repository:** https://github.com/paulmillr/noble-curves
- **Package:** `npm install @noble/curves`
- **License:** MIT
- **Key exports for NOSTR:**
  - `secp256k1.getPublicKey(privateKey)` — Derive public key (33-byte compressed or 32-byte X-only)
  - `secp256k1.sign(msgHash, privateKey)` — ECDSA signature (not used in NOSTR directly)
  - `schnorr.sign(msgHash, privateKey)` — BIP-340 Schnorr signature (used for all NOSTR events)
  - `schnorr.verify(sig, msgHash, publicKey)` — BIP-340 signature verification
  - `secp256k1.getSharedSecret(privateKey, publicKey)` — ECDH shared secret (used in NIP-44)
- **Audit:** Trail of Bits, 2022 (noble-curves and noble-hashes together)
- **Performance:** Pure JavaScript, no WebAssembly, no native addons. Optimized for browser and Node.js.
- **Relevance:** The underlying cryptographic implementation used by nostr-tools. Understand this library to debug NIP-44 issues.

### @noble/hashes (JavaScript)
- **Repository:** https://github.com/paulmillr/noble-hashes
- **Package:** `npm install @noble/hashes`
- **Key exports for NOSTR:**
  - `sha256(data)` — SHA-256 hash (used for event ID computation)
  - `hmac(sha256, key, data)` — HMAC-SHA256 (used in NIP-44 MAC and HKDF)
  - `hkdf(sha256, ikm, salt, info, length)` — HKDF extract+expand (used in NIP-44 key derivation)
- **Audit:** Trail of Bits, 2022
- **Relevance:** Direct dependency of NIP-44 encryption. All intermediate values in test vectors come from these functions.

### @noble/ciphers (JavaScript)
- **Repository:** https://github.com/paulmillr/noble-ciphers
- **Package:** `npm install @noble/ciphers`
- **Key exports:**
  - `chacha20(key, nonce, data)` — ChaCha20 stream cipher (used in NIP-44 encryption)
- **Relevance:** Provides the symmetric encryption primitive for NIP-44. Web Crypto API does not support ChaCha20, so this pure-JS implementation is necessary for browser environments.

### libsecp256k1 (C)
- **Repository:** https://github.com/bitcoin-core/secp256k1
- **Description:** The canonical C implementation of secp256k1 elliptic curve operations. Used by Bitcoin Core.
- **Key functions:**
  - `secp256k1_keypair_create` — Generate keypair
  - `secp256k1_schnorrsig_sign32` — BIP-340 Schnorr sign
  - `secp256k1_schnorrsig_verify` — BIP-340 Schnorr verify
  - `secp256k1_ecdh` — Elliptic curve Diffie-Hellman
  - `secp256k1_xonly_pubkey_serialize` — X-only public key serialization
- **Bindings:** Wrapped by rust-secp256k1 (Rust), btcec (Go), many other languages
- **Relevance:** Reference implementation for secp256k1 operations. When in doubt about correctness, compare against libsecp256k1 output.

---

## 3. Cashu Libraries

### @cashu/cashu-ts (TypeScript)
- **Repository:** https://github.com/cashubtc/cashu-ts
- **Package:** `npm install @cashu/cashu-ts`
- **Key classes:**
  - `CashuMint` — Mint interaction: get keysets, request mint quote, request melt quote
  - `CashuWallet` — Wallet operations: receive tokens, send tokens, check proof states
  - Token serialization: `getEncodedToken()` (produces `cashuA...` or `cashuB...` string)
  - Token deserialization: `getDecodedToken()` (parses token string back to proofs)
- **Key types:**
  - `Proof` — `{ id, amount, secret, C }` — a single ecash proof
  - `Token` — `{ mint, proofs }` — set of proofs from a single mint
  - `MintKeyset` — `{ id, unit, keys }` — mint's denomination keys
- **Relevance:** Primary library for Cashu postage implementation. Used to create, serialize, and redeem tokens attached to NOSTR Mail messages.

### cdk (Cashu Development Kit — Rust)
- **Repository:** https://github.com/cashubtc/cdk
- **Crates:** `cdk`, `cdk-cli`, `cdk-mintd`
- **Relevance:** Rust implementation of Cashu. Useful for building a Rust-based NOSTR Mail client with native Cashu support, or for running a test mint.

### nutshell (Python)
- **Repository:** https://github.com/cashubtc/nutshell
- **Description:** Reference Cashu mint implementation in Python
- **Usage:** `docker run -p 3338:3338 cashubtc/nutshell` — run a test mint locally
- **Relevance:** Essential for integration testing. Run a local mint to test postage creation and redemption without using real money.

---

## 4. Test Vector Sources

### NIP-44 Test Vectors
- **Location:** https://github.com/nostr-protocol/nips/blob/master/44.md (appendix)
- **Checksum:** SHA-256 of the test vector JSON: `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`
- **Content:**
  - Conversation key derivation vectors (ECDH + HKDF-Extract)
  - Message key derivation vectors (HKDF-Expand)
  - Encryption vectors (ChaCha20 + HMAC-SHA256)
  - Padding vectors (various plaintext lengths)
  - Invalid payload vectors (wrong version, truncated, bad MAC)
- **Usage:** Run all vectors through every NIP-44 implementation. Any divergence indicates a bug.

### BIP-340 Test Vectors
- **Location:** https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv
- **Content:**
  - Signing vectors: secret key + message + expected signature
  - Verification success vectors: public key + message + signature (should verify)
  - Verification failure vectors: public key + message + signature (should NOT verify)
- **Usage:** Verify both signing and verification functions. Critical for event signature correctness.

### Cashu Test Vectors
- **Location:** https://github.com/cashubtc/nuts (individual NUT specs include examples)
- **Content:**
  - NUT-00: Token serialization/deserialization examples
  - NUT-00: hash_to_curve test vectors
  - NUT-00: BDHKE blinding/unblinding examples
  - NUT-12: DLEQ proof verification examples
- **Usage:** Verify Cashu token handling in the postage implementation.

---

## 5. Protocol Specifications

### WebSocket (RFC 6455)
- **URL:** https://www.rfc-editor.org/rfc/rfc6455
- **Key sections:**
  - Section 4: Opening Handshake (HTTP Upgrade)
  - Section 5: Data Framing (opcode, payload length, masking)
  - Section 7: Closing the Connection (close frames, status codes)
  - Section 11.8: WebSocket URI scheme (`ws://`, `wss://`)
- **Relevance:** NOSTR relay communication uses WebSocket. Understanding the protocol helps debug connection issues, frame parsing errors, and close code semantics.
- **Close codes relevant to NOSTR:**
  - 1000: Normal closure
  - 1001: Going away (server shutting down)
  - 1006: Abnormal closure (no close frame — network error)
  - 1008: Policy violation (relay rejecting client)
  - 1009: Message too big (event exceeds relay's size limit)

### NIP-01 (NOSTR Base Protocol)
- **URL:** https://github.com/nostr-protocol/nips/blob/master/01.md
- **Key definitions:**
  - Event structure: `{ id, pubkey, created_at, kind, tags, content, sig }`
  - Event ID: SHA-256 of `[0, pubkey, created_at, kind, tags, content]`
  - Client-relay messages: `["EVENT", event]`, `["REQ", sub_id, filter...]`, `["CLOSE", sub_id]`
  - Relay-client messages: `["EVENT", sub_id, event]`, `["OK", event_id, success, message]`, `["EOSE", sub_id]`, `["NOTICE", message]`
  - Filter fields: `ids`, `authors`, `kinds`, `#<tag>`, `since`, `until`, `limit`

### NIP-42 (Authentication of Clients to Relays)
- **URL:** https://github.com/nostr-protocol/nips/blob/master/42.md
- **Flow:**
  1. Relay sends `["AUTH", challenge_string]`
  2. Client creates kind 22242 event with `relay` and `challenge` tags
  3. Client sends `["AUTH", signed_event]`
  4. Relay validates signature and challenge
- **Relevance:** NOSTR Mail relays may require AUTH before accepting or serving gift-wrapped events. The client must handle AUTH challenges automatically.

### NIP-65 (Relay List Metadata)
- **URL:** https://github.com/nostr-protocol/nips/blob/master/65.md
- **Event kind:** 10002 (replaceable)
- **Tag format:** `["r", "wss://relay.example.com", "read|write"]`
- **Relevance:** Determines where to publish gift wraps for a recipient (their write relays) and where to subscribe for incoming mail (our read relays). The outbox model.

---

## 6. Development Tools

### nak (Nostr Army Knife)
- **Repository:** https://github.com/fiatjaf/nak
- **Install:** `go install github.com/fiatjaf/nak@latest`
- **Key commands for development:**
  - `nak event --kind 15 --tag p=<pubkey> --content "test" --sec <nsec>` — Create and sign an event
  - `nak req --kind 1059 -t p=<pubkey> wss://relay.example.com` — Query a relay
  - `nak decode <npub|nsec|nevent|nprofile>` — Decode bech32 identifiers
  - `nak encode npub <hex-pubkey>` — Encode to bech32
  - `nak verify <event-json>` — Verify event signature
- **Relevance:** Essential debugging tool. Use nak to inspect events on relays, verify signatures, and test relay connectivity.

### nostr-relay-tester
- **Repository:** https://github.com/nickinch/nostr-relay-tester
- **Purpose:** Automated conformance testing for relay implementations
- **Relevance:** Verify that NOSTR Mail events are handled correctly by target relays.

### websocat
- **Install:** `cargo install websocat` or download binary
- **Usage:** `websocat wss://relay.example.com`
- **Purpose:** Raw WebSocket client for debugging relay communication
- **Example session:**
  ```
  > ["REQ", "test-sub", {"kinds": [1059], "#p": ["my_pubkey"], "limit": 5}]
  < ["EVENT", "test-sub", {...}]
  < ["EOSE", "test-sub"]
  > ["CLOSE", "test-sub"]
  ```

---

## 7. Build and Test Infrastructure

### TypeScript Project Setup
```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0"
  },
  "dependencies": {
    "nostr-tools": "^2.0.0",
    "@noble/curves": "^1.3.0",
    "@noble/hashes": "^1.3.0",
    "@noble/ciphers": "^0.5.0",
    "@cashu/cashu-ts": "^1.0.0"
  }
}
```

### Rust Project Setup
```toml
[dependencies]
nostr = "0.35"
nostr-sdk = "0.35"
secp256k1 = { version = "0.29", features = ["global-context", "rand-std"] }
chacha20 = "0.9"
hkdf = "0.12"
hmac = "0.12"
sha2 = "0.10"
zeroize = "1.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
tokio = { version = "1", features = ["test-util"] }
```

### Go Project Setup
```
go get github.com/nbd-wtf/go-nostr@latest
go get github.com/btcsuite/btcd/btcec/v2@latest
go get golang.org/x/crypto@latest
```

---

## 8. Reference Documentation

### API Documentation Sites
| Library | Docs URL |
|---------|----------|
| nostr-tools | https://github.com/nbd-wtf/nostr-tools (README + source) |
| rust-nostr / nostr-sdk | https://docs.rs/nostr-sdk/ |
| go-nostr | https://pkg.go.dev/github.com/nbd-wtf/go-nostr |
| @noble/curves | https://github.com/paulmillr/noble-curves (README) |
| @noble/hashes | https://github.com/paulmillr/noble-hashes (README) |
| @cashu/cashu-ts | https://github.com/cashubtc/cashu-ts (README + examples) |
| Cashu NUTs | https://github.com/cashubtc/nuts |

### NOSTR Protocol References
| Spec | URL |
|------|-----|
| All NIPs | https://github.com/nostr-protocol/nips |
| NIP-01 (Base) | https://github.com/nostr-protocol/nips/blob/master/01.md |
| NIP-44 (Encryption) | https://github.com/nostr-protocol/nips/blob/master/44.md |
| NIP-59 (Gift Wrap) | https://github.com/nostr-protocol/nips/blob/master/59.md |
| NIP-17 (DMs) | https://github.com/nostr-protocol/nips/blob/master/17.md |
| NIP-42 (Auth) | https://github.com/nostr-protocol/nips/blob/master/42.md |
| NIP-65 (Relay List) | https://github.com/nostr-protocol/nips/blob/master/65.md |
| NIP-05 (Identifiers) | https://github.com/nostr-protocol/nips/blob/master/05.md |
| NIP-98 (HTTP Auth) | https://github.com/nostr-protocol/nips/blob/master/98.md |
| BIP-340 (Schnorr) | https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki |
