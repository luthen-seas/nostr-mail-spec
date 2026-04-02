# Payment Systems References

## Cashu Protocol

### Official Documentation
- **Cashu Protocol Docs**: https://docs.cashu.space -- Comprehensive protocol documentation, tutorials, and API reference.
- **Cashu GitHub Organization**: https://github.com/cashubtc -- Reference implementations and tooling.

### NUT Specifications
All NUT specs are maintained at https://github.com/cashubtc/nuts

| NUT | Title | Status | Relevance |
|-----|-------|--------|-----------|
| NUT-00 | Notation, Utilization, and Terminology | Mandatory | Token serialization format (cashuA/cashuB prefix, CBOR/JSON, proofs array) |
| NUT-01 | Mint Public Key Exchange | Mandatory | Keyset discovery (`GET /v1/keys`), denomination-to-key mapping |
| NUT-02 | Keysets and Keyset IDs | Mandatory | Key rotation, keyset identification, active/inactive keysets |
| NUT-03 | Swap Tokens | Mandatory | Atomic token exchange (split/merge), core of postage verification |
| NUT-04 | Mint Tokens (Lightning -> Ecash) | Mandatory | Minting flow via Lightning invoice payment |
| NUT-05 | Melt Tokens (Ecash -> Lightning) | Mandatory | Converting ecash back to Lightning (recipient cashing out postage) |
| NUT-06 | Mint Information | Optional | Mint metadata, supported NUTs, contact info, MOTD |
| NUT-07 | Token State Check | Optional | Check UNSPENT/SPENT/PENDING without swapping |
| NUT-08 | Lightning Fee Return | Optional | Overpaid Lightning fees returned as ecash change |
| NUT-09 | Restore Tokens | Optional | Wallet recovery from seed phrase |
| NUT-10 | Spending Conditions | Optional | Programmable token spending rules (foundation for P2PK, HTLC) |
| NUT-11 | Pay-to-Public-Key (P2PK) | Optional | Tokens locked to specific recipient -- critical for anti-race in NOSTR Mail |
| NUT-12 | DLEQ Proofs | Optional | Discrete Log Equality proofs for mint audit transparency |
| NUT-13 | Deterministic Secrets | Optional | Derive secrets from seed for backup/restore |
| NUT-14 | Hashed Time-Lock Contracts | Optional | Conditional token spending with timeouts |
| NUT-15 | Multipart Payments | Optional | Split payments across multiple operations |
| NUT-16 | Animated QR Codes | Optional | Large token transfer via animated QR |
| NUT-17 | WebSocket Subscriptions | Optional | Real-time notifications from mint |
| NUT-18 | Payment Requests | Optional | Standardized payment request format |

### Cashu Reference Implementations
- **cashu-ts** (TypeScript): https://github.com/cashubtc/cashu-ts -- Client library, useful for NOSTR web clients.
- **nutshell** (Python): https://github.com/cashubtc/nutshell -- Reference mint and wallet implementation.
- **cdk** (Rust): https://github.com/cashubtc/cdk -- Cashu Development Kit, Rust library for building mints and wallets.
- **moksha** (Rust): https://github.com/ngutech21/moksha -- Alternative Rust Cashu implementation.
- **gonuts** (Go): https://github.com/elnosh/gonuts -- Go Cashu library.

---

## L402 Protocol

### Specifications
- **L402 Protocol Specification**: https://github.com/lightninglabs/L402 -- Lightning Labs' specification for Lightning HTTP 402 authentication.
- **Original LSAT Specification**: https://lsat.tech -- Earlier name and documentation (renamed to L402).
- **Aperture** (Go): https://github.com/lightninglabs/aperture -- L402 reverse proxy implementation by Lightning Labs.

### Macaroon References
- **Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud** (Google, 2014): https://research.google/pubs/pub41892/ -- The original macaroon paper by Arnar Birgisson, Joe Gibbs Politz, Ulfar Erlingsson, Ankur Taly, Michael Vrable, Mark Lentczner.
  - Key contributions: HMAC-chain construction, caveat attenuation, third-party caveats, contextual authorization.
- **libmacaroons**: https://github.com/rescrv/libmacaroons -- Reference C implementation.
- **pymacaroons**: https://github.com/ecordell/pymacaroons -- Python macaroon library.
- **go-macaroon**: https://github.com/go-macaroon/macaroon -- Go macaroon library.

---

## Lightning Network

### BOLT Specifications
All BOLTs maintained at https://github.com/lightning/bolts

| BOLT | Title | Relevance |
|------|-------|-----------|
| BOLT-01 | Base Protocol | Peer messaging, feature bits, TLV encoding |
| BOLT-02 | Peer Protocol for Channel Management | Channel open, close, funding |
| BOLT-03 | Bitcoin Transaction and Script Formats | Commitment tx, HTLC outputs, penalty |
| BOLT-04 | Onion Routing Protocol | Sphinx packets, per-hop payloads, error returns |
| BOLT-05 | Recommendations for On-chain Transaction Handling | Force-close, HTLC timeout, sweep |
| BOLT-07 | P2P Node and Channel Discovery | Gossip protocol, channel_announcement, node_announcement |
| BOLT-08 | Encrypted and Authenticated Transport | Noise protocol handshake, encrypted messaging |
| BOLT-09 | Assigned Feature Flags | Feature bit registry |
| BOLT-11 | Invoice Protocol for Lightning Payments | Invoice encoding, amount, payment_hash, routing hints |

### Lightning Implementations
- **LND** (Go): https://github.com/lightningnetwork/lnd -- Lightning Labs, most deployed.
- **CLN / Core Lightning** (C): https://github.com/ElementsProject/lightning -- Blockstream, plugin architecture.
- **Eclair** (Scala): https://github.com/ACINQ/eclair -- ACINQ, powers Phoenix wallet.
- **LDK** (Rust): https://github.com/lightningdevkit/rust-lightning -- Lightning Dev Kit, embeddable library.

### Lightning Developer Libraries
- **LDK Node** (Rust): https://github.com/lightningdevkit/ldk-node -- High-level LDK wrapper for app developers.
- **Breez SDK** (Rust + bindings): https://github.com/nicknguyen/breez-sdk -- Non-custodial Lightning SDK with LSP integration.
- **Greenlight** (CLN-based): https://github.com/nicknguyen/greenlight -- Cloud CLN nodes via API.
- **webln** (JavaScript): https://github.com/nicknguyen/webln -- Browser extension interface for Lightning (WebLN standard).

### LSP Specifications
- **LSPS** (Lightning Service Provider Specifications): https://github.com/BitcoinAndLightningLayerSpecs/lsp -- Standardized LSP protocols.
  - LSPS0: Transport layer
  - LSPS1: Channel request
  - LSPS2: JIT (Just-in-Time) channel opening

### Lightning Routing Research
- **Pickhardt Payments**: https://arxiv.org/abs/2107.05322 -- Optimal payment routing using minimum-cost flows. Key insight: modeling channel liquidity as probability distributions.
- **Pathfinding in Lightning**: LND uses Dijkstra-based pathfinding with channel capacity, fees, and historical success as edge weights.
- **Trampoline Routing**: Delegated pathfinding for mobile/lightweight clients. Node delegates route-finding to well-connected "trampoline" nodes.

---

## NOSTR Payment NIPs

### NIP-47: Nostr Wallet Connect
- **Specification**: https://github.com/nostr-protocol/nips/blob/master/47.md
- **Reference implementation (Alby)**: https://github.com/getAlby/nostr-wallet-connect
- **NWC SDK**: https://github.com/nicknguyen/nwc -- Client library for NWC integration.
- Event kinds: 13194 (info), 23194 (request), 23195 (response).
- Methods: pay_invoice, make_invoice, get_balance, lookup_invoice, list_transactions.

### NIP-57: Lightning Zaps
- **Specification**: https://github.com/nostr-protocol/nips/blob/master/57.md
- Event kinds: 9734 (zap request), 9735 (zap receipt).
- Depends on: LNURL-pay protocol, NIP-19 (bech32 encoding).
- See: `nips/payments/nip-57.md` in this knowledge base for full breakdown.

### NIP-60: Cashu Wallet
- **Specification**: https://github.com/nostr-protocol/nips/blob/master/60.md
- Event kinds: 37375 (wallet info), 7375 (token proofs), 7376 (history).
- Enables cross-device Cashu wallet sync via NOSTR relays.
- All token data is NIP-44 encrypted.

### NIP-61: Nutzaps
- **Specification**: https://github.com/nostr-protocol/nips/blob/master/61.md
- Cashu-based zaps: P2PK-locked tokens published in NOSTR events.
- Architectural precursor to NOSTR Mail postage (similar token-in-event pattern).
- See: `nips/payments/nip-61.md` in this knowledge base.

---

## Cryptographic Foundations

### Chaumian Ecash
- **David Chaum, "Blind Signatures for Untraceable Payments" (1983)**: The foundational paper on blind signature-based ecash. Introduces the concept of a bank signing a token without seeing its content, enabling unlinkable payments.
  - Published in: Advances in Cryptology -- Crypto '82, Springer.
  - DOI: 10.1007/978-1-4757-0602-4_18

### BDHKE (Blind Diffie-Hellman Key Exchange)
- **David Wagner, "A Generalized Birthday Problem" (2002)**: Relevant to hash-to-curve constructions.
- **Cashu BDHKE specification**: https://github.com/cashubtc/nuts/blob/main/00.md#blind-diffie-hellman-key-exchange-bdhke -- Formal description of the blind signature scheme used by Cashu.
- **hash_to_curve**: Cashu uses a deterministic hash-to-curve function mapping secrets to secp256k1 points, based on iterative SHA256 hashing until a valid x-coordinate is found.

### Elliptic Curve Cryptography
- **SEC 2: Recommended Elliptic Curve Domain Parameters**: https://www.secg.org/sec2-v2.pdf -- secp256k1 curve parameters (used by Bitcoin, Lightning, Cashu, NOSTR).
- **Schnorr Signatures (BIP-340)**: https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki -- NOSTR uses Schnorr signatures for event signing.

---

## Anti-Spam Economics Research

### Proof-of-Work and Hashcash
- **Adam Back, "Hashcash -- A Denial of Service Counter-Measure" (2002)**: http://www.hashcash.org/papers/hashcash.pdf -- The original PoW anti-spam proposal. NIP-13 is a direct descendant.
- **Dwork and Naor, "Pricing via Processing or Combatting Junk Mail" (1993)**: The first academic proposal for computational puzzles as spam deterrence. Predates hashcash.

### Economic Anti-Spam
- **Microsoft Research, "Proof of Work Can Work" (2017)**: Analysis of PoW effectiveness against spam at various difficulty levels and attacker resources.
- **Sybil Attack Literature**: Douceur, "The Sybil Attack" (2002). Relevant to contact list pollution attack vector.
- **Token-Based Access Control**: Research on using micropayments as access control for digital resources.

### Email Anti-Spam (Comparison)
- **Gmail Spam Filtering**: Google's TensorFlow-based spam detection processes ~300 billion messages/week, catching 99.9% of spam. Cost: substantial ML infrastructure.
- **DKIM/SPF/DMARC**: Email authentication standards. Analogous to NOSTR's NIP-05 verification tier.
- **Email Deliverability**: The "email deliverability hell" problem -- legitimate mail blocked by aggressive filtering. NOSTR Mail avoids this by design (publish to relays, no gatekeeper).

---

## Ecosystem Tools

### Cashu Wallets (NOSTR-integrated)
- **Nutstash**: https://nutstash.app -- Web-based Cashu wallet with NOSTR integration.
- **eNuts**: https://github.com/nicknguyen/enuts -- Mobile Cashu wallet (React Native).
- **Minibits**: https://github.com/nicknguyen/minibits -- Mobile Cashu wallet with NIP-60 support.
- **Cashu.me**: https://cashu.me -- Web Cashu wallet.

### Lightning Wallets (NWC-compatible)
- **Alby**: https://getalby.com -- Browser extension + NWC hub. Most popular NWC implementation.
- **Mutiny Wallet**: https://mutinywallet.com -- Web-first Lightning wallet with NWC (discontinued 2024, open-source).
- **Coinos**: https://coinos.io -- Web Lightning wallet with Cashu mint and NWC.

### Development Tools
- **cashu-tool** (CLI): Command-line Cashu wallet for testing and scripting.
- **nak** (CLI): NOSTR Army Knife -- essential for testing NOSTR event flows including payment events.
- **nostr-tools**: JavaScript library with NIP-47 support for NWC integration.
- **rust-nostr**: Rust SDK with NIP-47 and NIP-57 support.

---

## Internal Knowledge Base Cross-References

| Topic | File | Notes |
|-------|------|-------|
| NIP-47 full breakdown | `nips/payments/nip-47.md` | NWC event kinds, methods, connection flow |
| NIP-57 full breakdown | `nips/payments/nip-57.md` | Zap request/receipt protocol, LNURL flow |
| NIP-60 full breakdown | `nips/payments/nip-60.md` | Cashu wallet state on NOSTR relays |
| NIP-61 full breakdown | `nips/payments/nip-61.md` | Nutzaps -- Cashu tokens in NOSTR events |
| NIP-13 (PoW) | `nips/spam/nip-13.md` | Proof-of-work for events (free-tier alternative) |
| NIP-59 (Gift Wrap) | `nips/messaging/nip-59.md` | Encryption layer that contains postage tokens |
| NIP-44 (Encryption) | `nips/messaging/nip-44.md` | Encryption used by NWC and gift wrap |
| Protocol architecture | `protocol/event-model.md` | Event kinds, tags, signing |
| Relay architecture | `relays/architecture-patterns.md` | Where L402 gating fits in relay design |
