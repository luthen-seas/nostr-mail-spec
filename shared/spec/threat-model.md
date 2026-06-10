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

### Scenario 9: Spam Policy Metadata Exploitation (Phase 8 Finding — MEDIUM, ACCEPTED)
**Threat**: Kind 10097 spam policy events are published unencrypted. An attacker reads the recipient's policy to learn the exact Cashu threshold, accepted mints, and contact-bypass setting, then crafts messages that precisely meet the minimum requirements.
**Impact**: The anti-spam configuration leaks metadata that aids targeted spam. An attacker knows exactly how much to spend per message.
**Mitigation**: This is inherent — the policy must be public for senders to comply with it. Recipients SHOULD set `cashu-min-sats` high enough to make targeted spam economically painful. At 10 sats (default), 100K spam messages cost ~$650 at $65K/BTC. At 100 sats, the same campaign costs ~$6,500.
**Residual risk**: Accepted trade-off between usability (senders need to read policy) and privacy.

### Scenario 10: Timing Correlation by Relay Operator (Phase 8 Finding — HIGH, PARTIALLY MITIGATED)
**Threat**: Relay operator correlates the actual arrival time of a gift wrap event with a sender's WebSocket connection, bypassing the ±2-day timestamp randomization (which only protects the `created_at` metadata).
**Impact**: Sender deanonymization with high probability, especially when attacker controls multiple relays.
**Mitigation**: **DEC-016** — Clients SHOULD introduce a 0-60 second random publication delay. Tor/mixnet routing further reduces correlation.
**Residual risk**: Random delay reduces but doesn't eliminate timing correlation. Persistent connections partially obscure the signal.

### Scenario 11: Multi-Recipient Thread Fracture (Phase 8 Finding — CRITICAL, MITIGATED)
**Threat**: In the original design, threading referenced gift-wrap event IDs. Since each recipient gets a different gift-wrap ID, replies from one recipient are unresolvable by others. Multi-party threads fracture.
**Impact**: Email's core use case (reply-all) is broken.
**Mitigation**: **DEC-012** — Stable `message-id` tag generated by sender, shared across all recipients. Threading now references `message-id` values.
**Residual risk**: None — the `message-id` is inside the encrypted rumor and cannot be tampered with.

### Scenario 12: Malicious Cashu Mint (Phase 8 Finding — HIGH, ACCEPTED with documentation)
**Threat**: A Cashu mint chosen by a sender (or that the recipient implicitly accepts via empty `accepted-mints`) issues tokens that appear P2PK-locked but is colluding with the sender to redeem them freely on the mint's own ledger.
**Impact**: The economic anti-spam barrier collapses to zero cost for any sender using a malicious mint.
**Mitigation**: Recipients SHOULD configure an explicit `accepted-mints` list. The NIP §"Default-trusted Cashu mints" Security Considerations section warns against the empty-default for high-value mailboxes.
**Residual risk**: Mint-trust is fundamentally an out-of-band judgment; protocol cannot enforce mint honesty.

### Scenario 13: Forged Postage Amount/Mint (Foundational Audit — HIGH, MITIGATED)
**Threat**: A sender mints a P2PK token worth the smallest denomination (e.g. 1 sat) but sets the advisory `cashu-amount` tag to a large value (and/or sets `cashu-mint` to an accepted mint while the token is from another). The advisory tags sit outside the signed token.
**Impact**: Tier-1 admission with ~zero cost — the economic anti-spam barrier collapses to the smallest mintable amount.
**Mitigation**: **DEC-021** — the authoritative amount and mint MUST come from the decoded, P2PK-verified token (summed proof amounts; embedded mint URL), never from the advisory tags.
**Residual risk**: None for the amount/mint gate; mint honesty remains Scenario 12.

### Scenario 14: Unsigned-Seal Acceptance / Cross-Impl Split (Foundational Audit — HIGH, MITIGATED)
**Threat**: A gift wrap carries a seal with an invalid/absent Schnorr signature. An implementation that returns the decrypted rumor without hard-failing lets a caller display it as authentic; worse, if implementations disagree (one accepts, one rejects) the protocol forks.
**Impact**: Spec-violating message acceptance; cross-implementation consensus split on a security-critical path.
**Mitigation**: **DEC-022** — invalid seal signature (or non-1400 rumor kind) MUST be a hard rejection (no rumor returned) in every implementation. NIP-44 AEAD independently blocks cross-identity impersonation; this restores spec compliance and TS/Go agreement.
**Residual risk**: None.

### Scenario 15: Mailbox-State Rollback via Future-Dated Event (Foundational Audit — HIGH, MITIGATED)
**Threat**: A relay (or attacker with the self-key) injects a kind-30099 state event with a far-future `created_at` and a hostile `folder` map, winning last-writer-wins forever; or ships an oversized payload that re-propagates via the grow-only set.
**Impact**: A victim's messages can be pinned into trash/archive permanently; unbounded state growth (memory DoS) that re-publishes across devices.
**Mitigation**: **DEC-023** — folder LWW resolves by `(created_at, id)` with the NIP-01 lower-id tiebreak and is order-independent; ingestion rejects events dated >1h in the future; decoded payloads bound element counts and per-id length.
**Residual risk**: Within the 1h skew window, ordinary LWW applies (intended).

### Scenario 16: Thread Grafting / Silent Drop (Foundational Audit — MEDIUM, MITIGATED)
**Threat**: A sender reuses a victim's `message-id` to displace a node, or crafts a reply cycle that silently drops messages from the conversation, or exploits TS/Go disagreement on thread-tag handling.
**Impact**: Conversation structure manipulation; messages vanishing from threads; cross-client inconsistency.
**Mitigation**: **DEC-024** — keep-first on colliding message-ids; cycle-safe linking surfaces cyclic nodes as roots rather than dropping them; both implementations apply the thread-tag fallback identically.
**Residual risk**: A sender can still *reference* a victim's thread (grafting a visible reply); clients SHOULD surface cross-author replies distinctly.

### Scenario 17: Bridge Inbound Spoofing & SSRF (Foundational Audit — CRITICAL, MITIGATED)
**Threat**: Anyone speaking SMTP to the bridge sends a spoofed `From:` with no authentication; or supplies a recipient/NIP-05/Blossom host that resolves to an internal/metadata address, turning the bridge into an SSRF proxy.
**Impact**: Spoofed mail bridged to Nostr inboxes as authentic; exfiltration of internal services / cloud metadata.
**Mitigation**: **DEC-025** — the bridge verifies SPF/DKIM/DMARC locally and requires a DMARC pass by default (fail-closed); every untrusted-derived outbound host is rejected if it resolves to a private/loopback/link-local/metadata range, with size-bounded downloads. Per-sender/per-recipient rate limits bound resolution amplification; the registry is persistable so addresses survive restarts.
**Residual risk**: The bridge still reads bridged plaintext (Scenario 5). `frame-ancestors`/`form-action` for the web client must be set as HTTP headers at the CDN/web-server layer.

---

## Phase 2 Review Summary

> **Note:** Findings related to NIP-05 trust signal (FINDING-004) and NIP-13 PoW tier (FINDING-009) are MOOTED by tier model simplification (DEC-015 / Phase 8). Those attack surfaces no longer exist in the V1 protocol. The counts below include the original findings; mooted items are listed in `phase2-adversarial-review.md` with their MOOTED status annotated.

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
