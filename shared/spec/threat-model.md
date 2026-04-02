# Threat Model — Who We Protect Against

> **Status: Draft — Requires review by Adversarial Security and Crypto Designer roles.**

---

## Actors

### Users (Alice, Bob)
- Generate keypairs, send/receive mail
- May be on mobile, desktop, or web
- May have intermittent connectivity
- May be non-technical

### Relay Operators
- Store and serve events
- Can read event metadata (kind, pubkey, tags, timestamps)
- Cannot read encrypted content
- Can refuse to store or deliver events
- Can be honest, curious, or malicious

### Network Observers
- Can observe WebSocket traffic between clients and relays
- Can observe timing, volume, and destination of connections
- May be ISPs, governments, or MITM attackers

### Spammers
- Want to send unsolicited messages at scale
- Minimize cost per message
- May use botnets, throwaway keys, or fake NIP-05 identities

### Targeted Attackers
- Want to read a specific person's mail
- May compromise relays, endpoints, or keys
- May perform traffic analysis to deanonymize senders

---

## What We Protect

| Property | Against | Mechanism |
|----------|---------|-----------|
| Message confidentiality | Relay operators, network observers | NIP-44 double encryption (seal + wrap) |
| Sender anonymity | Relay operators, network observers | Ephemeral keys in Gift Wrap |
| Timestamp privacy | Relay operators | Randomized timestamps (±2 days) |
| Authentication | Spoofing, impersonation | Schnorr signatures on seal |
| Message integrity | Tampering in transit | HMAC-SHA256 in NIP-44 |
| Spam prevention | Bulk unsolicited messages | Cashu tokens, L402, PoW |
| Deniability | Third-party proof of authorship | Unsigned rumor layer |
| Data portability | Vendor lock-in | Keypair-based identity, relay-agnostic |

## What We Do NOT Protect (Accepted Risks)

| Risk | Why We Accept It | Mitigation |
|------|-----------------|------------|
| Recipient identity visible to relay | Required for delivery routing (`p` tag) | Use trusted/personal inbox relay |
| No forward secrecy | Async model incompatible with interactive key exchange | Key rotation, future X3DH NIP |
| Key loss = identity loss | Self-sovereign identity requires self-custody | Mnemonic backup (NIP-06), social recovery (future) |
| Relay censorship | Any relay can refuse events | Publish to multiple relays |
| Traffic analysis | Timing/volume patterns may reveal communication relationships | Tor/VPN, dummy traffic, random delays |
| Client compromise | Endpoint security is out of protocol scope | Standard device security practices |
| Cashu mint trust | Ecash mints are custodial | Small balances, multiple mints |
| Bridge reads bridged mail | SMTP is plaintext; bridge must read to convert | Accept trust trade-off during transition |

## Threat Scenarios

### Scenario 1: Curious Relay Operator
**Threat**: Operator inspects all stored events.
**What they learn**: Recipient pubkeys, event timestamps (randomized), event sizes, frequency.
**What they cannot learn**: Sender identity, message content, subject, attachments.
**Residual risk**: Traffic analysis (volume of messages to a recipient over time).

### Scenario 2: Compromised Recipient Key
**Threat**: Attacker obtains recipient's private key.
**Impact**: Can decrypt all past and future messages to that key.
**Mitigation**: Key rotation, destroy old key, notify contacts.
**Residual risk**: All historical messages are compromised (no forward secrecy).

### Scenario 3: Industrial Spam
**Threat**: Spammer sends 1M messages.
**Cost at 1 sat/message**: ~$1,000. At 10 sats: ~$10,000.
**Mitigation**: Economic barrier makes scale unprofitable.
**Residual risk**: Targeted spam (small volume) is still possible at low cost.

### Scenario 4: Global Passive Adversary
**Threat**: Entity monitors all relay traffic globally.
**What they learn**: Communication graph (who talks to whom, inferred from timing/relay patterns).
**Mitigation**: Tor, random delays, multiple relay hops, dummy messages.
**Residual risk**: Sophisticated timing analysis may still correlate sender/recipient.

### Scenario 5: Malicious Bridge Operator
**Threat**: Bridge reads and logs all bridged email content.
**Impact**: All email↔NOSTR messages are visible to bridge operator.
**Mitigation**: Use bridge only for legacy email; native NOSTR Mail is E2EE.
**Residual risk**: Users must trust bridge operator for bridged messages.

### Scenario 6: Cashu Token Double-Spend (Phase 2 Finding — CRITICAL, MITIGATED)
**Threat**: Sender includes Cashu token as postage, then redeems the same token at the mint before recipient decrypts and redeems.
**Impact**: Anti-spam model collapses — sending spam costs nothing.
**Mitigation**: **DEC-006** — All postage tokens MUST use P2PK spending conditions (NUT-11), locked to recipient's pubkey. Only the recipient can redeem.
**Residual risk**: Mint must support NUT-11. If mint doesn't verify P2PK conditions, the attack is possible. Recipients MUST verify P2PK lock before accepting tokens.

### Scenario 7: Ephemeral Key Entropy Failure (Phase 2 Finding — CRITICAL, MITIGATED)
**Threat**: Weak RNG produces predictable ephemeral keys for Gift Wrap. Attacker derives the ephemeral private key and decrypts the outer layer, revealing the seal (and sender identity).
**Impact**: Complete sender deanonymization. Partial message compromise (seal is decrypted, exposing sender; rumor requires second decryption with recipient key).
**Mitigation**: **DEC-007** — CSPRNG mandatory. Implementations MUST use OS entropy sources. Spec explicitly bans `Math.random()` and time-based seeds.
**Residual risk**: Implementation bugs in specific platforms. Mitigated by test vectors that verify RNG quality characteristics.

### Scenario 8: Relay Flooding Attack (Phase 2 Finding — HIGH, MITIGATED)
**Threat**: Attacker generates unlimited ephemeral keys, publishes millions of kind 1059 events to a victim's inbox relay. Per-sender rate limiting is ineffective because each event has a unique ephemeral pubkey.
**Impact**: Relay storage exhaustion, legitimate message delivery delayed or blocked.
**Mitigation**: **DEC-008** — Per-recipient rate limiting (recommended: 100 kind 1059/hour). Combined with PoW requirement for unauthenticated publishers.
**Residual risk**: Rate limiting may delay legitimate messages during a sustained attack. Relay operators must tune limits based on their user base.

---

## Phase 2 Review Summary

The Phase 2 adversarial security review identified **15 findings** across the protocol:

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | Mitigated (DEC-006, DEC-007) |
| High | 4 | Mitigated (DEC-008, DEC-009) + 2 accepted with documentation |
| Medium | 6 | Documented, mitigations recommended |
| Low | 2 | Documented |
| Informational | 1 | Documented |

Full findings: `reviews/security-audits/phase2-adversarial-review.md`
Economic analysis: `reviews/security-audits/phase2-economic-analysis.md`
Encryption analysis: `reviews/formal-proofs/phase2-encryption-analysis.md`
Delivery model: `reviews/formal-proofs/phase2-delivery-model.md`
