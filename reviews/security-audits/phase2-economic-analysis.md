# NOSTR Mail Anti-Spam: Economic Attack Analysis

**Document type**: Security Assessment  
**Scope**: Economic viability and attack resistance of the NOSTR Mail anti-spam payment mechanism  
**System components assessed**: Cashu ecash postage, L402 relay gating, NIP-13 proof-of-work, refundable postage, dynamic pricing (kind 10097)  
**Date**: Phase 2 Review

---

## A. Cost Model

### Spam Cost at Scale

The following tables model the cost of sending spam at various scales and postage levels, assuming all messages require Cashu postage (worst case for the spammer -- no free-tier bypass).

**Table A1: Cost in satoshis**

| Messages | 1 sat | 10 sats | 50 sats | 100 sats | 1,000 sats |
|----------|-------|---------|---------|----------|------------|
| 1,000 | 1,000 | 10,000 | 50,000 | 100,000 | 1,000,000 |
| 10,000 | 10,000 | 100,000 | 500,000 | 1,000,000 | 10,000,000 |
| 100,000 | 100,000 | 1,000,000 | 5,000,000 | 10,000,000 | 100,000,000 |
| 1,000,000 | 1,000,000 | 10,000,000 | 50,000,000 | 100,000,000 | 1,000,000,000 |
| 10,000,000 | 10,000,000 | 100,000,000 | 500,000,000 | 1,000,000,000 | 10,000,000,000 |

**Table A2: Cost in USD (at BTC = $100,000)**

| Messages | 1 sat | 10 sats | 50 sats | 100 sats | 1,000 sats |
|----------|-------|---------|---------|----------|------------|
| 1,000 | $0.01 | $0.10 | $0.50 | $1.00 | $10.00 |
| 10,000 | $0.10 | $1.00 | $5.00 | $10.00 | $100.00 |
| 100,000 | $1.00 | $10.00 | $50.00 | $100.00 | $1,000.00 |
| 1,000,000 | $10.00 | $100.00 | $500.00 | $1,000.00 | $10,000.00 |
| 10,000,000 | $100.00 | $1,000.00 | $5,000.00 | $10,000.00 | $100,000.00 |

### Bitcoin Price Sensitivity

The USD cost of postage is directly proportional to BTC price. This creates long-term pricing instability.

**Table A3: Cost of 10 sats postage per message at different BTC prices**

| BTC Price | 10 sats = | 1M messages cost |
|-----------|-----------|-----------------|
| $50,000 | $0.005 | $50.00 |
| $100,000 | $0.01 | $100.00 |
| $200,000 | $0.02 | $200.00 |
| $500,000 | $0.05 | $500.00 |
| $1,000,000 | $0.10 | $1,000.00 |

**Observation**: At BTC = $1M, even 10 sats postage ($0.10 per message) would be expensive for legitimate high-volume communication. The dynamic pricing mechanism (kind 10097) allows recipients to adjust, but there is no automatic BTC-price-aware adjustment in the current design.

### Comparison with Email Spam Economics

| Metric | Email Spam | NOSTR Mail (10 sat postage) |
|--------|-----------|---------------------------|
| Cost per message | ~$0.00001 (botnet bandwidth) | $0.01 (at BTC $100K) |
| Cost for 1M messages | ~$10 | $100 |
| Cost for 1B messages | ~$10,000 | $100,000 |
| Revenue per spam message | ~$0.00001-0.001 (CPA model) | Same (phishing, scam) |
| Break-even response rate | ~0.001% | ~1% at 10 sats |

**Break-even analysis**: Email spam is profitable at response rates as low as 0.001% because the cost per message is near zero. At 10 sats ($0.01) postage, a spammer needs approximately 1% response rate per message at $1 revenue per response to break even. This is 1,000x higher than email spam requires, making most spam campaigns unprofitable.

**Critical threshold**: At 1 sat postage ($0.001), the economics are only ~100x better than email. This may be insufficient. **Recommendation: minimum postage should be at least 10 sats for unknown senders.**

---

## B. Attack Vectors

### B1. Cashu Double-Spend Race

**Attack**: Sender creates a Cashu token, includes it in a gift-wrapped message, and simultaneously submits the same token for swap at the mint. If the mint processes the sender's swap before the recipient's, the recipient gets worthless tokens.

**Race window**: The time between the sender publishing the gift-wrapped event and the recipient decrypting and swapping the token. This could be seconds to hours depending on recipient online status.

**Severity**: HIGH without mitigation.

**Mitigations**:
1. **Immediate swap on receipt** (partial): Recipient's client swaps tokens as soon as the event is received, even before the user reads the message. Narrows the window to relay propagation time (~1-2 seconds).
2. **P2PK locking** (complete): Tokens are minted with NUT-11 P2PK spending conditions locked to the recipient's pubkey. Only the recipient can swap. The sender cannot race because the mint will reject their swap attempt.
3. **Specification recommendation**: P2PK locking SHOULD be required for postage tokens. Mints that support postage MUST implement NUT-10 and NUT-11.

**Residual risk**: If P2PK is mandated, this attack is fully mitigated. Without P2PK, the attack succeeds against offline recipients. Rating with P2PK: LOW. Rating without: HIGH.

### B2. Token Replay Across Messages

**Attack**: Sender includes the same Cashu token in multiple gift-wrapped messages to different recipients. Only the first recipient to swap gets value; others receive spent tokens.

**Analysis**: This is a form of double-spend. Each recipient independently contacts the mint to swap. The mint's spent-secret check ensures only the first swap succeeds.

**Severity**: MEDIUM (only one message gets through with valid postage).

**Mitigations**:
1. **P2PK locking per recipient**: Each message contains tokens locked to that specific recipient's pubkey. The same token cannot be locked to two different pubkeys.
2. **Immediate swap**: First recipient to swap wins. Others reject the message.
3. **Specification recommendation**: Clients SHOULD reject messages with spent/invalid postage tokens. The message should be treated as if it has no postage.

**Residual risk**: With P2PK, attack is impossible (token can only be locked to one recipient). Without P2PK, it's a nuisance but not a systemic threat -- the attacker pays for one valid message per token.

### B3. Mint Collusion

**Attack**: A malicious mint reveals token spending patterns. The mint sees: (a) when tokens were minted (NUT-04), (b) when tokens were swapped (NUT-03). If the mint colludes with a recipient, they could potentially correlate minting time with message delivery time.

**Analysis**: Blind signatures (BDHKE) prevent the mint from linking the blinded token (`B_`) seen during minting to the unblinded proof (`x, C`) seen during redemption. The mint genuinely cannot identify which minting request corresponds to which redemption, even with full cooperation.

**What the mint CAN learn**:
- Total volume of tokens minted and redeemed over time.
- Timing patterns (e.g., a burst of minting followed by a burst of redemption).
- If only one user mints and one user redeems in a time window, correlation is trivial despite blind signatures.

**Severity**: LOW for individual message deanonymization. MEDIUM for traffic analysis at low volumes.

**Mitigations**:
1. **Pre-minting**: Users mint tokens in advance in batches, decoupling minting time from sending time.
2. **Multiple mints**: Use different mints for different recipients to prevent a single mint from seeing all traffic.
3. **Busy mints**: Recommend popular, high-traffic mints where individual transactions are lost in the crowd.

**Residual risk**: Traffic analysis against low-volume mints remains possible. This is inherent to any ecash system with small anonymity sets. Rating: LOW with pre-minting and popular mints.

### B4. PoW ASIC/GPU Attack

**Attack**: An attacker uses specialized hardware (GPUs, ASICs, FPGAs) to compute NIP-13 proof-of-work much faster than legitimate users on CPUs, enabling high-volume free-tier spam.

**Cost analysis (NIP-13 difficulty)**:

| Difficulty | CPU time (avg) | GPU speedup | GPU cost/msg | ASIC speedup | ASIC cost/msg |
|-----------|----------------|-------------|-------------|--------------|---------------|
| 16 | ~0.05s | 100x | negligible | 10,000x | negligible |
| 20 | ~1s | 100x | negligible | 10,000x | negligible |
| 24 | ~16s | 100x | ~$0.00001 | 10,000x | negligible |
| 28 | ~260s | 100x | ~$0.0002 | 10,000x | negligible |
| 32 | ~4,200s | 100x | ~$0.003 | 10,000x | ~$0.00003 |
| 36 | ~67,000s | 100x | ~$0.05 | 10,000x | ~$0.0005 |

**Key finding**: Even at difficulty 32, GPU spam costs ~$3 per 1,000 messages and ASIC spam costs ~$0.03 per 1,000 messages. PoW alone cannot prevent well-funded attackers.

**Severity**: HIGH for PoW-only anti-spam. LOW when PoW is a free-tier alternative alongside Cashu postage.

**Mitigations**:
1. **PoW as complement, not replacement**: The tiered system correctly positions PoW as a free alternative for budget-conscious users, not as the primary spam defense.
2. **Adaptive difficulty**: Recipients can raise PoW difficulty in kind 10097 if they observe PoW spam.
3. **Rate limiting**: Relays can rate-limit PoW-authenticated messages (e.g., max 10 PoW messages per pubkey per hour).
4. **PoW + NIP-05**: Require both PoW AND NIP-05 verification for the free tier.

**Residual risk**: PoW is a speed bump, not a wall. For motivated attackers, it is trivially cheap. The system's real defense is the Cashu/L402 paid tier. Rating: ACCEPTABLE given the tiered design.

### B5. L402 Macaroon Abuse

**Attack**: A user pays for an L402 macaroon, then shares or resells it to multiple parties, allowing them to publish events without paying.

**Analysis**: Macaroon caveats limit reuse:
- `target_pubkey` caveat: Macaroon only authorizes messages to one recipient. Sharing it doesn't help spam other users.
- `max_events` caveat: Limits total events to, e.g., 10. Shared among 5 people, that's 2 events each.
- `expires` caveat: 24-hour expiry prevents long-term resale.

**Severity**: LOW with proper caveats.

**Mitigations**:
1. **Mandatory caveats**: Relays MUST include `target_pubkey`, `max_events`, and `expires` caveats.
2. **Low max_events**: Set `max_events = 1` for highest security; `max_events = 10` for convenience.
3. **IP restriction caveat** (optional): `source_ip` caveat limits to one IP. Trade-off: reduces privacy.

**Residual risk**: A macaroon with `max_events = 10` and `target_pubkey = X` allows 10 messages to X for one payment. This is a volume discount, not a vulnerability. Rating: LOW.

### B6. Refund Gaming

**Attack**: Attacker sends messages crafted to look legitimate (professional tone, relevant subject) to obtain refunds, then uses the refunded tokens to fund further spam.

**Analysis**: This requires the attacker to:
1. Craft convincing messages (high per-message effort).
2. Trick recipients into refunding (low success rate for repeated attempts).
3. Accumulate enough refunds to fund spam (slow, lossy process).

**Severity**: LOW.

**Economic breakdown**: If an attacker sends 100 "legitimate-looking" messages at 10 sats each (1,000 sats total cost), gets 50% refund rate (generous assumption), they recover 500 sats. They then send 50 spam messages. Net: 150 messages for 1,000 sats cost, or ~6.7 sats per message. Worse than just paying postage directly.

**Mitigations**:
1. **Refund is voluntary and manual**: Recipients learn quickly and stop refunding suspicious senders.
2. **Refund reputation**: Clients could track refund-to-reply ratio per sender. A sender who receives refunds but never has real conversations is suspicious.
3. **Delayed refund**: Refund only after a bidirectional conversation is established.

**Residual risk**: The attack is self-limiting. The attacker must continuously invest in "legitimate" messages that may not get refunded. Rating: LOW.

### B7. Sybil Contact List Pollution

**Attack**: Create thousands of fake NOSTR identities, build social profiles, get added to victims' contact lists. Once on the contact list, all messages are free (contact tier = free).

**Analysis**: Getting added to a contact list requires:
1. Creating a convincing profile (metadata, post history, followers).
2. Interacting with the target naturally over time.
3. The target manually adding the Sybil identity to their follow list.

This is an extremely high-effort, low-throughput attack. Each Sybil identity can spam only the contacts that follow it.

**Severity**: LOW.

**Mitigations**:
1. **Contact list is a manual trust decision**: Users choose who they follow. This is not automatable.
2. **Web-of-trust extensions**: Weight contact trust by depth (direct follow vs. follow-of-follow).
3. **NIP-05 requirement for free tier**: Even contacts must be NIP-05 verified for the free tier.

**Residual risk**: Social engineering is always possible, but it doesn't scale. An attacker can compromise individual relationships, not the system. Rating: LOW.

### B8. Dust Attack

**Attack**: Send millions of messages with the minimum possible token amount (1 sat each), forcing recipients to process and redeem many tiny tokens. The redemption cost (HTTP requests, mint processing) may exceed the token value.

**Analysis at 1 sat per token**:
- Recipient's client makes one HTTP POST per message to swap tokens.
- Mint processes the swap in ~10-50ms.
- Each swap yields 1 sat.
- At 1M messages: recipient's client makes 1M HTTP requests and earns 1M sats (~$10 at BTC $100K).

**The attack's real cost is computational burden, not financial loss.** The recipient's client must process each message's tokens, consuming bandwidth and CPU.

**Severity**: MEDIUM at 1 sat minimum. LOW at higher minimums.

**Mitigations**:
1. **Minimum postage threshold**: Set minimum postage in kind 10097 to at least 10 sats. This means 100K messages cost the attacker $100 but yields real value for the recipient.
2. **Batch swap**: Accumulate tokens and swap in batches rather than per-message. NUT-03 supports multiple input proofs in a single swap request.
3. **Rate limiting**: Process token swaps at a bounded rate (e.g., 10 per second). Queue excess for background processing.

**Residual risk**: With a 10+ sat minimum and batch processing, dust attacks are uneconomical. The attacker pays more than the disruption costs. Rating: LOW with minimum postage threshold.

### B9. Lightning Routing Failure as DoS

**Attack**: A sender attempts to send mail through an L402-gated relay. The relay generates an invoice. The sender routes payment through unreliable channels, causing repeated routing failures. The relay generates new invoices each time, consuming resources.

**Analysis**: Each failed payment attempt costs the relay:
- Invoice generation: ~1ms (negligible).
- Macaroon generation: ~1ms (negligible).
- Payment monitoring: One Lightning invoice in the pending set.

A relay can handle millions of pending invoices with minimal resource usage. Invoices expire after 1 hour (default), cleaning up automatically.

**Severity**: LOW.

**Mitigations**:
1. **Rate-limit invoice generation**: Max N invoices per source pubkey per hour.
2. **Invoice expiry**: Short expiry (10 minutes instead of 1 hour) for anti-spam invoices.
3. **Fallback to Cashu**: If L402 fails, client falls back to Cashu postage (no relay involvement in payment).

**Residual risk**: The attack has negligible impact. Relay resource consumption is trivial per invoice. Rating: LOW.

### B10. Mint Availability Attack

**Attack**: Attacker operates their own Cashu mint. They mint tokens, send them as postage, then take the mint offline. Recipients cannot verify or swap the tokens. Messages pile up in "verification pending" state.

**Analysis**: This is a denial-of-service against token verification. Messages with unverifiable tokens are stuck in limbo -- the recipient cannot confirm or reject them.

**Severity**: MEDIUM without trusted-mint lists. LOW with them.

**Mitigations**:
1. **Trusted mint list**: Recipients publish accepted mints in kind 10097. Only tokens from listed mints are accepted. The attacker's mint would not be on anyone's list.
2. **Well-known mints**: Default to a small set of high-availability mints (e.g., mint.minibits.cash, mint.coinos.io).
3. **Verification timeout**: If mint is unreachable for 24 hours, reject the message. Don't queue indefinitely.
4. **Mint health monitoring**: Clients periodically ping accepted mints. Remove unresponsive mints from kind 10097.

**Residual risk**: With a trusted-mint list, this attack is fully mitigated for recipients who configure one. Without: messages from unknown mints are untrusted anyway. Rating: LOW with trusted-mint list.

---

## C. Equilibrium Analysis

### Optimal Postage Level

The postage level must balance two competing goals:
1. **High enough to deter spam**: Each message must cost more than the expected revenue from spam.
2. **Low enough for legitimate use**: Postage should be negligible for normal communication.

**Equilibrium estimate**: At BTC = $100K, the optimal range is **10-50 sats** ($0.01-$0.05) for unknown senders.

| Postage | Spam deterrence | User burden | Assessment |
|---------|----------------|-------------|------------|
| 1 sat ($0.001) | Weak. 1M spam costs $10. | Negligible | Too low for anti-spam |
| 10 sats ($0.01) | Moderate. 1M spam costs $100. | Negligible | Good default |
| 50 sats ($0.05) | Strong. 1M spam costs $500. | Noticeable for high-volume users | Good for first messages |
| 100 sats ($0.10) | Very strong. 1M spam costs $1,000. | Significant burden | Too high for default |
| 1,000 sats ($1.00) | Extreme. Spam is impossible. | Prohibitive | Only for VIP access |

**Recommendation**: Default postage of 10 sats for known-NIP-05 senders, 50 sats for completely unknown senders, adjustable via kind 10097.

### Refundable Postage Equilibrium

The refund mechanism changes the equilibrium dynamics:

- **For legitimate senders**: Effective cost approaches 0 (full refund on wanted messages).
- **For spammers**: Effective cost remains at full postage (no refund for unwanted messages).
- **Asymmetry**: The system creates a cost asymmetry where spam is expensive and legitimate mail is free. This is the ideal anti-spam property.

**Potential distortion**: If recipients become lazy about refunding, legitimate senders bear the full cost. This could reduce adoption.

**Mitigation**: Auto-refund for contacts and NIP-05 verified senders. Manual refund only for unknown senders (where it matters most for spam filtering).

### PoW Holdout Scenario

What if a significant fraction of senders refuse to pay and use only the PoW free tier?

**Scenario analysis** (assume 10% of users are PoW-only):
- PoW users can still send messages but at higher friction (CPU cost, time delay).
- At difficulty 20: ~1 second per message. Acceptable for low-volume messaging.
- At difficulty 28: ~4 minutes per message. Acceptable for email-like cadence.
- PoW-only users create no revenue for mints or relays.
- System remains functional; PoW is a feature, not a bug.

**Risk**: If PoW difficulty is too low, it becomes the path of least resistance and nobody pays. If too high, it's unusable.

**Recommendation**: PoW difficulty should be calibrated so that a single message takes 5-30 seconds on a modern smartphone CPU. This is fast enough for legitimate use but too slow for mass spam.

### Market Convergence

Will postage prices converge across recipients?

**Expected dynamics**:
1. Most users will use client defaults (e.g., 10 sats).
2. Power users will customize (higher for celebrities, lower for community organizers).
3. Client developers will set defaults that balance spam prevention and adoption.
4. Over time, 2-3 standard tiers will emerge (free, low, medium).

**Price stickiness**: Once a postage level is established as the norm, it becomes a Schelling point. Clients will default to it, and most users will never change it.

---

## D. Comparison with Email Anti-Spam Economics

### Infrastructure Cost Comparison

| Cost Category | Email (Gmail scale) | NOSTR Mail |
|--------------|-------------------|------------|
| Spam filtering infrastructure | ~$500M+/year (ML, compute) | $0 (postage is self-enforcing) |
| False positive investigation | Significant human review teams | Minimal (overpayment, not lost messages) |
| Sender reputation systems | Complex (IP reputation, domain age, engagement) | Simple (NIP-05, contact list) |
| Deliverability management | Entire industry (ESP market: ~$5B/year) | None (publish to relays, no gatekeepers) |
| User cost | $0 (ad-supported) | 0-50 sats per message (~$0-0.05) |

### False Positive Comparison

| Dimension | Email | NOSTR Mail |
|-----------|-------|------------|
| False positive type | Legitimate mail sent to spam folder | Legitimate mail requires postage from unknown sender |
| False positive cost | Message may never be seen | Sender pays small amount; refunded if wanted |
| Recovery | User checks spam folder (if they remember) | Sender's message is delivered (postage guarantees it) |
| False negative type | Spam reaches inbox | Spammer pays postage; message delivered but cost was borne |
| False negative cost | User sees spam | Recipient collects postage from spammer |

**Key insight**: Email anti-spam has a binary outcome (delivered or blocked) with costly false positives. NOSTR Mail has a graduated outcome (free, PoW, or paid) with self-correcting economics. A "false negative" in NOSTR Mail (spam gets through) at least earns the recipient money.

### Self-Hosting Comparison

| Dimension | Email | NOSTR Mail |
|-----------|-------|------------|
| Self-hosting difficulty | Extreme (deliverability, IP reputation, DKIM/SPF/DMARC) | Trivial (just publish events to relays) |
| Inbound deliverability | Depends on sender's reputation + your server's config | Guaranteed (events are on relays) |
| Outbound deliverability | Must maintain IP reputation, SPF, DKIM, DMARC | Just sign and publish (cryptographic identity) |
| Cost | ~$5-50/month (VPS + domain + maintenance) | ~$0 (use public relays) or ~$5/month (own relay) |
| Migration | Painful (change MX records, risk delivery gaps) | Trivial (update relay list, old relays still work) |

---

## E. Recommendations for the Specification

### R1. Mandate P2PK Token Locking (HIGH PRIORITY)

Cashu postage tokens MUST use NUT-11 P2PK spending conditions locked to the recipient's pubkey. This eliminates the double-spend race (B1) and token replay (B2) attacks entirely. Without P2PK, the system has a critical vulnerability window between message delivery and token redemption.

**Specification language**: "Postage tokens included in NOSTR Mail events MUST include a NUT-11 P2PK spending condition with the `data` field set to the recipient's hex-encoded public key."

### R2. Set Minimum Postage at 10 Sats (HIGH PRIORITY)

The minimum accepted postage for unknown senders should be 10 sats. At 1 sat, the economics are insufficient to deter spam (only ~100x more expensive than email spam). At 10 sats, the cost is ~1,000x higher than email spam.

**Specification language**: "Clients SHOULD default to a minimum postage of 10 sats for the `cashu` tier in kind 10097 events. Recipients MAY set lower amounts but should be aware of the reduced spam deterrence."

### R3. Require Trusted Mint Lists (HIGH PRIORITY)

Recipients MUST publish a list of accepted mints in their kind 10097 event. Senders' clients MUST only use mints from this list. This prevents the mint availability attack (B10) and limits exposure to any single custodial mint.

**Specification language**: "Kind 10097 events MUST include at least one `mint` tag. Sending clients MUST only include tokens from mints listed in the recipient's kind 10097 event. Messages with tokens from unlisted mints SHOULD be rejected."

### R4. Calibrate PoW Difficulty for Mobile (MEDIUM PRIORITY)

The default PoW difficulty for the free tier should be calibrated so a modern smartphone computes the proof in 10-30 seconds. This is slow enough to prevent mass spam from CPUs while remaining usable for occasional messages.

**Specification language**: "The recommended default PoW difficulty for the `pow` tier is 21 bits, targeting approximately 10-30 seconds of computation on a 2023-era mobile device."

### R5. Add BTC Price Awareness Guidance (MEDIUM PRIORITY)

The specification should acknowledge that sat-denominated postage has USD-equivalent volatility and recommend periodic review of postage amounts.

**Specification language**: "Clients SHOULD periodically evaluate whether configured postage amounts remain reasonable given current Bitcoin exchange rates. Client developers SHOULD update default postage amounts in software releases if the USD equivalent changes by more than 5x from the design target."

### R6. Define Verification Timeout Behavior (MEDIUM PRIORITY)

The specification should define what happens when a mint is unreachable during token verification.

**Specification language**: "If the mint specified in a postage token is unreachable, the recipient's client SHOULD queue the message for retry. Retry SHOULD occur at exponential backoff intervals (5 min, 15 min, 1 hour, 6 hours). If the mint remains unreachable after 24 hours, the message SHOULD be rejected with an 'unverifiable-postage' status."

### R7. Batch Token Redemption (LOW PRIORITY)

Clients should support batch token redemption to mitigate the dust attack (B8) and reduce HTTP overhead.

**Specification language**: "Recipient clients SHOULD batch token swap operations, accumulating tokens from multiple messages and swapping in a single NUT-03 request where possible. A batch interval of 60 seconds is RECOMMENDED."

### R8. L402 Caveat Minimums (LOW PRIORITY)

The specification should define mandatory caveats for relay-issued L402 macaroons.

**Specification language**: "Relays issuing L402 macaroons for NOSTR Mail MUST include the following caveats: `target_pubkey` (recipient), `expires` (no more than 24 hours), and `max_events` (no more than 100). Relays SHOULD also include `event_kind = 1059`."

### R9. Monitor for Equilibrium Shifts (ONGOING)

The specification should establish a process for reviewing postage economics as the ecosystem scales.

**Recommendation**: Publish an annual review of spam rates, postage levels, PoW usage, and Lightning fee trends. Adjust recommended defaults based on empirical data. Consider establishing a "postage committee" of relay operators and client developers who can issue updated recommendations.

---

## Summary of Attack Risk Ratings

| # | Attack | Severity (no mitigation) | Severity (with mitigation) | Mitigation |
|---|--------|-------------------------|---------------------------|------------|
| B1 | Cashu double-spend race | HIGH | LOW | P2PK locking (R1) |
| B2 | Token replay across messages | MEDIUM | LOW | P2PK locking (R1) |
| B3 | Mint collusion | MEDIUM | LOW | Pre-minting, multiple mints |
| B4 | PoW ASIC attack | HIGH | ACCEPTABLE | PoW as complement only, rate limiting |
| B5 | L402 macaroon abuse | LOW | LOW | Mandatory caveats (R8) |
| B6 | Refund gaming | LOW | LOW | Voluntary refund, reputation tracking |
| B7 | Sybil contact list pollution | LOW | LOW | Manual trust decision |
| B8 | Dust attack | MEDIUM | LOW | Minimum postage (R2), batch swap (R7) |
| B9 | Lightning routing DoS | LOW | LOW | Rate limiting, Cashu fallback |
| B10 | Mint availability attack | MEDIUM | LOW | Trusted mint lists (R3) |

**Overall assessment**: The NOSTR Mail anti-spam payment system is economically sound. The primary risks (B1, B4) are addressed by P2PK token locking and the tiered design. No attack vector renders the system unprofitable to operate or trivially exploitable at scale. The refundable postage model creates a strong asymmetry between legitimate communication (free with refund) and spam (full postage cost), which is the desired economic property.
