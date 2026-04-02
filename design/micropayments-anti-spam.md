# Micropayments Anti-Spam — L402 & Cashu as Digital Postage

> **Economic spam prevention: how Lightning payments and ecash tokens replace reputation systems, ML filters, and the $2B deliverability industry.**

---

## Table of Contents

- [The Spam Problem](#the-spam-problem)
- [The Economic Insight](#the-economic-insight)
- [Anti-Spam Tier Model](#anti-spam-tier-model)
- [L402 — Lightning-Gated Delivery](#l402--lightning-gated-delivery)
- [Cashu — Ecash Postage Stamps](#cashu--ecash-postage-stamps)
- [Hybrid Approach](#hybrid-approach)
- [Proof-of-Work as Free Tier](#proof-of-work-as-free-tier)
- [Refundable Postage](#refundable-postage)
- [Recipient-Set Pricing](#recipient-set-pricing)
- [Economic Analysis](#economic-analysis)
- [Comparison with Email Anti-Spam](#comparison-with-email-anti-spam)
- [Implementation Details](#implementation-details)

---

## The Spam Problem

### Email's Approach

Email anti-spam is a layered defense that has become an industry:

1. **DNS-based blocklists (RBLs)**: IP reputation databases (Spamhaus, SORBS). Reactive, opaque, false positives affect legitimate senders.
2. **SPF/DKIM/DMARC**: Authentication (covered in [legacy-email-dissection.md](legacy-email-dissection.md)). Only prevents spoofing, not spam from legitimate domains.
3. **Content filtering**: Bayesian classifiers, regex rules (SpamAssassin). Arms race with spammers.
4. **Machine learning**: Gmail's RETVec, Microsoft's filters. Opaque black boxes. High accuracy but unknowable false positive rates.
5. **Reputation systems**: Sender Score, domain age, engagement metrics. New senders are guilty until proven innocent.
6. **Rate limiting**: Per-IP, per-domain throttling at the SMTP level.
7. **CAPTCHAs**: For webmail signups, not protocol-level.

**The fundamental problem**: Sending email costs nothing. A spammer with a botnet can send millions of messages at zero marginal cost. Every defense is reactive — detect and block after the spam is sent.

### Hashcash's Failed Attempt (2002)

Hashcash proposed proof-of-work for each email: compute a hash puzzle before sending. It failed because:
- Computational cost was either too high for legitimate users (slow phones) or too low for spammers (botnets)
- No real economic cost — just wasted electricity
- No transfer of value — the receiver gained nothing
- Asymmetric: spammers have botnets, individuals have one CPU

### NOSTR's Existing Spam Problem

NOSTR relays face spam too. Current defenses:
- NIP-13 proof-of-work (commit difficulty in event ID)
- Relay-side rate limiting
- NIP-42 AUTH (restrict who can publish)
- Web-of-trust (only show events from follow-graph)
- Client-side mute lists (NIP-51)

These help but don't solve the problem for private messaging where metadata is hidden.

---

## The Economic Insight

**The key insight**: If sending a message has a real economic cost — even a tiny one — the economics of spam collapse.

| Scenario | Spam Volume | Cost at 1 sat/msg (~$0.001) | Cost at 10 sats/msg |
|----------|-------------|----------------------------|---------------------|
| 1,000 messages | Small campaign | $1 | $10 |
| 100,000 messages | Medium campaign | $100 | $1,000 |
| 1,000,000 messages | Large campaign | $1,000 | $10,000 |
| 100,000,000 messages | Industrial spam | $100,000 | $1,000,000 |

At even 1 sat per message, industrial spam becomes economically unviable. Meanwhile, legitimate users sending 10-50 messages/day pay $0.01-$0.05/day — negligible.

**The paradigm shift**: Instead of the recipient bearing the cost of filtering (computing power, ML training, false positive management), the **sender bears the cost of delivery**, and the **recipient profits from their attention**.

---

## Anti-Spam Tier Model

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER    │ CONDITION                        │ COST    │ ACTION   │
├──────────┼──────────────────────────────────┼─────────┼──────────┤
│  Tier 0  │ Sender in contact list (kind 3)  │ FREE    │ Inbox    │
│  Tier 1  │ Sender NIP-05 verified           │ FREE    │ Inbox    │
│  Tier 2  │ PoW ≥ 20 bits (NIP-13)          │ FREE*   │ Inbox    │
│  Tier 3  │ Cashu P2PK token (≥10 sats)      │ 10 sats │ Inbox    │
│  Tier 4  │ L402 payment completed           │ Custom  │ Inbox    │
│  Tier 5  │ None of above                    │ —       │ Quarantine│
└──────────┴──────────────────────────────────┴─────────┴──────────┘
* PoW costs compute time, not money
```

**Tier evaluation is done by the recipient's client** (not the relay), because the mail content is encrypted. The client decrypts the gift wrap, extracts the rumor, and checks for:
1. Sender pubkey against contact list
2. Sender's NIP-05 verification status
3. PoW commitment in the seal or wrap event
4. Cashu tokens in the rumor's tags
5. L402 preimage in the rumor's tags

### User-Configurable

Recipients set their own tier thresholds:

```json
{
  "kind": 10097,
  "pubkey": "<user-pubkey>",
  "tags": [
    ["d", "spam-policy"],
    ["contacts", "free"],
    ["nip05", "free"],
    ["pow-min", "20"],
    ["cashu-min", "10"],
    ["unknown-action", "quarantine"],
    ["payment-mint", "https://mint.example.com"],
    ["lnurl", "alice@getalby.com"]
  ],
  "content": ""
}
```

This event is published publicly so senders know the recipient's requirements before sending.

---

## L402 — Lightning-Gated Delivery

### What Is L402?

L402 (formerly LSAT) brings HTTP 402 "Payment Required" to life. It combines:
- **Macaroons**: Cryptographic bearer tokens with embedded permissions and restrictions
- **Lightning invoices**: Bitcoin micropayment requests settled in seconds
- The **payment preimage** (proof of payment) unlocks the macaroon

### L402 for NOSTR Mail: Relay-Gated Model

The recipient's inbox relay gates delivery behind a Lightning payment:

```
1. SENDER → Relay: ["EVENT", {gift-wrap}]
   
2. RELAY checks: Is sender in recipient's contact list?
   - For kind 1059, relay can't see sender (ephemeral key)
   - Relay checks if the event includes a valid payment proof tag
   - If no payment proof: relay responds with payment requirement

3. RELAY → Sender: ["OK", "<id>", false, "payment-required:lnbc10n1..."]
   - The OK message includes a Lightning invoice in the message field
   - Invoice amount set by recipient's spam policy

4. SENDER pays the Lightning invoice
   → Receives preimage (proof of payment)

5. SENDER resubmits with payment proof:
   - Option A: Include preimage in a wrapper tag (outside encryption)
   - Option B: Pay via NWC (NIP-47) and include receipt
   
6. RELAY verifies payment → ["OK", "<id>", true, ""]
   → Message delivered to recipient's subscription
```

### L402 Macaroon Flow (Detailed)

```
1. Client: POST /publish (or WebSocket EVENT)
2. Relay: 402 Payment Required
   WWW-Authenticate: L402 macaroon="<base64>", invoice="lnbc10n1..."
   
   Macaroon contains:
   - payment_hash: SHA256(preimage)  // Links to invoice
   - caveats:
     - pubkey = <recipient-pubkey>   // Only for this recipient
     - event_kind = 1059             // Only for gift wraps
     - expires = <timestamp>         // Time-limited
     - max_events = 10               // Batch allowance

3. Client pays invoice → obtains preimage
4. Client: EVENT with header
   Authorization: L402 <macaroon>:<preimage>
5. Relay: Verify HMAC(root_key, caveats) matches macaroon
          Verify SHA256(preimage) matches payment_hash
          → Stateless verification, no database lookup needed
```

### L402 Properties

| Property | Value |
|----------|-------|
| Payment speed | ~1-3 seconds (Lightning) |
| Minimum amount | 1 satoshi (~$0.001) |
| Verification | Stateless (macaroon + preimage) |
| Privacy | Lightning is onion-routed (sender IP hidden) |
| Programmable | Macaroon caveats (time, count, scope) |
| Accounts needed | None (payment IS authentication) |
| Infrastructure | Relay needs Lightning node or LSP |

### L402 Limitations

- Relay must run a Lightning node or connect to an LSP
- Sender must have a Lightning wallet with sufficient balance
- Real-time payment required (sender must be online)
- Relay learns about the payment (not fully private)
- Payment failures (routing, liquidity) can delay delivery

---

## Cashu — Ecash Postage Stamps

### What Is Cashu?

Cashu is a Chaumian ecash protocol built on Bitcoin/Lightning:
- **Mints** issue and redeem ecash tokens, holding Bitcoin collateral
- **Blind signatures** mean the mint cannot link issuance to redemption
- **Tokens** are cryptographic proofs that can be transferred offline
- **NUT specifications** define the protocol (like NIPs for NOSTR)

### Cashu for NOSTR Mail: P2PK Token-Attached Model

The sender attaches Cashu ecash tokens directly in the encrypted mail event. Per DEC-006, all postage tokens MUST use NUT-11 P2PK (Pay-to-Public-Key) spending conditions, locked to the recipient's pubkey.

**P2PK Pubkey Derivation (AMEND-004)**: To derive the P2PK spending condition from a NOSTR pubkey:
```
compressed_sec1_pubkey = 0x02 || nostr_x_only_pubkey
```
The `0x02` prefix (even y-coordinate) is always correct for NOSTR public keys because BIP-340 specifies that x-only keys implicitly represent the point with even y-coordinate. Implementations MUST NOT use the `0x03` prefix.

```json
// Inside the kind 15 rumor (encrypted, invisible to relays):
{
  "kind": 15,
  "tags": [
    ["p", "<recipient>", "<relay>", "to"],
    ["subject", "Business Inquiry"],
    ["cashu", "cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI..."],
    ["cashu-mint", "https://mint.example.com"],
    ["cashu-amount", "100"],
    ["refund", "<sender-pubkey>"]
  ],
  "content": "Hi, I'd like to discuss a partnership..."
}
```

### Token Validation — Two-Phase Model (AMEND-006)

**Phase 1 — Structural Validation (synchronous, during tier evaluation)**:
1. The `["cashu", ...]` tag contains a parseable NUT-00 V4 token
2. The token amount meets the policy minimum (`cashu-min-sats`)
3. The token's mint URL is in the accepted mints list (if specified)
4. The token includes a P2PK spending condition (NUT-11)
5. The P2PK lock target matches the recipient's compressed SEC1 pubkey

If structural validation passes → Tier 3 (inbox).

**Phase 2 — Mint Validation (asynchronous, after inbox delivery)**:
The client SHOULD attempt to swap the token at the mint (`POST /v1/swap`). If the swap fails:
- The message SHOULD be reclassified to Tier 5 (quarantine)
- The client SHOULD display a warning that the postage token was invalid
- The client MUST NOT automatically delete the message

### Token Flow

```
SENDING:
1. Sender's Cashu wallet mints P2PK tokens locked to recipient's pubkey
   (compressed SEC1: 0x02 || recipient_nostr_pubkey)
2. Sender creates tokens worth N sats (recipient's required amount)
3. Tokens serialized (NUT-00 format) and included in ["cashu", "..."] tag
4. Mail event is gift-wrapped and published (tokens hidden inside encryption)

RECEIVING:
1. Recipient decrypts mail → sees Cashu tokens in tags
2. Phase 1: Structural validation (sync):
   a. Parse token → verify P2PK lock matches our pubkey
   b. Verify amount ≥ threshold, mint in accepted list
   c. If valid → Tier 3, deliver to inbox
3. Phase 2: Mint validation (async):
   a. Contact mint: POST /v1/swap (redeem P2PK tokens)
   b. If swap succeeds → tokens claimed, postage collected
   c. If swap fails → warn user, reclassify to quarantine
4. Recipient now holds the sats (postage paid)

OPTIONAL REFUND:
5. If recipient marks message as "wanted" (replies, adds to contacts):
   Recipient's client mints new tokens and sends them back
   via a kind 15 reply with ["cashu-refund", "..."] tag
```

### Cashu Token Format (NUT-00)

```
cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5...

Base64-decoded:
{
  "token": [{
    "mint": "https://mint.example.com",
    "proofs": [{
      "id": "009a1f29...",        // Keyset ID
      "amount": 64,                // Denomination (powers of 2)
      "secret": "random_secret",   // Unique token identifier
      "C": "02abc123..."           // Blinded signature from mint
    }, {
      "id": "009a1f29...",
      "amount": 32,
      "secret": "another_secret",
      "C": "03def456..."
    }, {
      "id": "009a1f29...",
      "amount": 4,
      "secret": "third_secret",
      "C": "02789abc..."
    }]
    // Total: 64 + 32 + 4 = 100 sats
  }]
}
```

### Cashu Properties

| Property | Value |
|----------|-------|
| Privacy | **Perfect** — mint cannot link sender to recipient |
| Speed | Instant (token verification is a swap request) |
| Minimum amount | 1 satoshi |
| Offline capable | Tokens transferable without network (with trust) |
| Verification | Mint confirms tokens are unspent |
| Accounts needed | None |
| Infrastructure | Recipient needs Cashu wallet; mint must be trusted |
| Trust model | Custodial — mint holds the Bitcoin |

### Cashu Advantages Over L402

| | L402 | Cashu |
|---|------|-------|
| Privacy | Lightning payment visible to relay | **Token inside encryption — relay sees nothing** |
| Offline | Requires real-time payment | **Tokens created ahead of time** |
| Relay involvement | Relay gates delivery | **No relay involvement — client-side** |
| Speed | 1-3 sec (Lightning routing) | **<100ms (HTTP swap)** |
| Batch friendly | Pay per relay interaction | **Pre-mint tokens for many messages** |
| Trust | Trustless (Lightning) | **Custodial (mint operator)** |

### Cashu Limitations

- **Custodial**: The mint holds the Bitcoin backing the tokens. Mint can rug-pull.
  - Mitigation: Use small, local mints. Distribute across multiple mints.
- **Double-spend window**: Between token creation and redemption, the sender could try to spend the same token elsewhere.
  - Mitigation: Recipient swaps immediately on receipt.
- **Mint availability**: If the mint is offline, tokens cannot be verified.
  - Mitigation: Use well-known, reliable mints. Accept tokens from multiple mints.
- **Token size**: Serialized tokens add ~500-2000 bytes to the message.
  - Acceptable: this is inside the encrypted content, not visible to relays.

---

## Hybrid Approach

The most practical model combines multiple mechanisms:

```
┌─────────────────────────────────────────────────────────────┐
│                  SENDING DECISION TREE                       │
│                                                              │
│  Is recipient in my contact list?                           │
│  ├── YES → Send freely (no payment)                         │
│  └── NO → Check recipient's spam policy (kind 10097)        │
│           ├── Accepts PoW? → Compute NIP-13 PoW, send      │
│           ├── Accepts Cashu? → Attach tokens, send          │
│           ├── Requires L402? → Pay relay, then send         │
│           └── No policy? → Default: attach 10-sat Cashu    │
│                                                              │
│  RECEIVING DECISION TREE                                    │
│                                                              │
│  Decrypt gift wrap → extract rumor                          │
│  ├── Sender in contacts? → Inbox (free)                    │
│  ├── Sender NIP-05 verified? → Inbox (free)               │
│  ├── Valid Cashu token ≥ threshold? → Inbox (redeem token) │
│  ├── Valid PoW ≥ threshold? → Inbox (free)                 │
│  ├── L402 payment verified? → Inbox                        │
│  └── None of above → Quarantine / requires payment         │
└─────────────────────────────────────────────────────────────┘
```

### Why Hybrid?

- **Cashu** is best for privacy (token inside encryption) and offline preparation
- **L402** is best for relay-enforced gating (relay doesn't need to decrypt)
- **PoW** is best for free-tier access (no payment infrastructure needed)
- **Contact list** is best for trusted relationships (no friction)
- **NIP-05** provides a middle ground (domain verification implies investment)

---

## Proof-of-Work as Free Tier

NIP-13 defines proof-of-work for NOSTR events. For NOSTR Mail, PoW serves as the free-tier anti-spam mechanism:

### How It Works

The sender computes a nonce such that the event ID has a specified number of leading zero bits:

```json
{
  "kind": 1059,
  "tags": [
    ["p", "<recipient>"],
    ["nonce", "12345678", "24"]     // nonce value, target difficulty
  ],
  // ... other fields
}
```

The event ID (SHA-256 hash) must have ≥24 leading zero bits. This requires ~16 million hash computations on average.

### Difficulty Calibration

| Difficulty | Avg. Computations | Time (modern CPU) | Time (phone) |
|------------|-------------------|-------------------|--------------|
| 16 bits | ~65,000 | <1 second | ~2 seconds |
| 20 bits | ~1,000,000 | ~1 second | ~10 seconds |
| 24 bits | ~16,000,000 | ~10 seconds | ~2 minutes |
| 28 bits | ~268,000,000 | ~3 minutes | ~30 minutes |
| 32 bits | ~4,300,000,000 | ~45 minutes | hours |

**Recommended default**: 20-24 bits. Tolerable for a single message, prohibitive for mass spam.

### PoW Limitations

- Asymmetric: botnets can compute PoW across thousands of machines
- No economic transfer: recipient gains nothing
- Mobile-unfriendly at high difficulties
- Not useful for time-sensitive mail

**Best used as**: A free alternative for senders who don't have Lightning/Cashu wallets, combined with other signals.

---

## Refundable Postage

A powerful UX pattern: senders pay postage, but recipients refund wanted messages.

### Flow

```
1. Alice (unknown to Bob) sends mail with 50-sat Cashu token
   Tags: ["cashu", "<token>"], ["refund", "<alice-pubkey>"]

2. Bob's client receives, verifies token → delivers to inbox

3. Bob reads the message, finds it valuable, replies

4. Bob's client automatically:
   a. Mints 50 sats of Cashu tokens
   b. Includes in reply: ["cashu-refund", "<token>"]
   c. Sends reply via normal gift-wrap flow

5. Alice receives reply + refund
   Net cost to Alice: 0 sats (postage refunded)
   Net cost to Bob: 0 sats (refunded what he received, received postage from Alice's reply)
```

### Result

- **Wanted mail**: Effectively free (postage refunded)
- **Unwanted mail**: Sender pays the postage (recipient keeps it)
- **Spam**: Economically devastating at scale
- **Legitimate cold outreach**: Small cost, refunded if recipient engages

This creates a natural market for attention: the postage is the sender's statement of "I believe this message is worth your time," and the refund is the recipient's confirmation.

---

## Recipient-Set Pricing

Recipients can publish different pricing for different scenarios:

```json
{
  "kind": 10097,
  "tags": [
    ["d", "spam-policy"],
    ["contacts", "free"],
    ["nip05-verified", "free"],
    ["follow-of-follow", "free"],
    ["unknown-individual", "10"],
    ["commercial", "100"],
    ["bulk", "1000"],
    ["newsletter-subscribe", "free"],
    ["pow-alternative", "24"],
    ["mint", "https://mint.minibits.cash"],
    ["mint", "https://mint.coinos.io"],
    ["lnurl", "user@getalby.com"]
  ],
  "content": ""
}
```

### Dynamic Pricing Ideas

- **Time-based**: Higher rates during busy periods, lower on weekends
- **Reputation-based**: Lower rates for senders with high NIP-05 domain trust
- **Thread-based**: First message in a thread costs postage; replies are free
- **Volume-based**: First 5 messages free per sender per month; then paid
- **Auction-based**: Inbox has limited "priority" slots; highest bidders get them

---

## Economic Analysis

### Cost to Spammers

| Scale | At 1 sat/msg | At 10 sats/msg | At 100 sats/msg |
|-------|-------------|----------------|-----------------|
| 1K messages | $1 | $10 | $100 |
| 10K messages | $10 | $100 | $1,000 |
| 100K messages | $100 | $1,000 | $10,000 |
| 1M messages | $1,000 | $10,000 | $100,000 |
| 10M messages | $10,000 | $100,000 | $1,000,000 |

(At ~$100,000/BTC, 1 sat ≈ $0.001)

For comparison, email spam is estimated to cost spammers $0.00001 per message (server costs only). Even 1 sat per message is a **100x cost increase**.

### Cost to Legitimate Users

| Usage | Messages/Day | At 10 sats/msg | Monthly Cost |
|-------|-------------|----------------|--------------|
| Light personal | 5 | 50 sats | ~$1.50 |
| Medium personal | 20 | 200 sats | ~$6.00 |
| Heavy business | 100 | 1,000 sats | ~$30.00 |
| With contact list bypass | 5 paid + 95 free | 50 sats | ~$1.50 |

Most messages are to contacts (free). The actual paid-message volume for typical users would be very low.

### Revenue to Recipients

If 10% of received messages are paid (from unknown senders):
- 5 paid messages/day × 10 sats = 50 sats/day ≈ $1.50/month
- Influencer receiving 100 paid messages/day × 100 sats = 10,000 sats/day ≈ $300/month

This creates a **direct economic incentive for inbox maintenance** — recipients are paid for their attention, not exploited for it.

---

## Comparison with Email Anti-Spam

| Dimension | Email Anti-Spam | NOSTR Mail Anti-Spam |
|-----------|----------------|---------------------|
| Approach | Reactive (detect & block) | **Proactive (economic barrier)** |
| Cost to sender | Zero (email is free) | **Non-zero (payment/PoW)** |
| False positives | Common, invisible | **None (payment is binary)** |
| Recipient benefit | None (spam filtered silently) | **Direct income** |
| Transparency | Opaque ML models | **Clear rules (published policy)** |
| Self-hosting penalty | Massive (IP reputation) | **None** |
| Setup complexity | SPF+DKIM+DMARC+warm-up | **None (publish spam policy event)** |
| Gatekeepers | Gmail/Microsoft/Yahoo | **None (recipient controls)** |
| Privacy | Sender identity exposed to filters | **Sender hidden (gift wrap)** |
| Adaptability | Arms race with spammers | **Market-based (price adjusts)** |

---

## Implementation Details

### Cashu Integration (Client-Side)

```
SENDER CLIENT:
1. Check recipient's spam policy (kind 10097)
2. If Cashu required:
   a. Get accepted mint URLs from policy
   b. Mint tokens at accepted mint (Lightning → ecash)
   c. Serialize tokens (NUT-00 format)
   d. Add to rumor tags: ["cashu", "<serialized-token>"]
   e. Gift wrap and publish normally

RECIPIENT CLIENT:  
1. Decrypt gift wrap → seal → rumor
2. Check sender against contact list → if found, deliver
3. If not found, check for Cashu tokens:
   a. Parse ["cashu", "..."] tag
   b. Extract mint URL and proofs
   c. POST to mint: /v1/swap (atomically verify + claim)
   d. If swap succeeds: tokens valid, deliver to inbox
   e. If swap fails: tokens invalid/spent, quarantine
4. Store redeemed sats in client's Cashu wallet
```

### L402 Integration (Relay-Side)

```
INBOX RELAY:
1. Receive kind 1059 event
2. Check if event includes payment proof (tag or HTTP header)
3. If no proof:
   a. Generate Lightning invoice (amount from recipient's policy)
   b. Create macaroon with caveats (recipient, expiry, event count)
   c. Return: ["OK", "<id>", false, "payment-required:<invoice>"]
4. If proof included:
   a. Verify macaroon signature (HMAC with root key)
   b. Verify preimage: SHA256(preimage) == payment_hash in macaroon
   c. Check caveats (not expired, correct recipient, count not exceeded)
   d. If valid: accept event ["OK", "<id>", true, ""]
   e. If invalid: reject ["OK", "<id>", false, "auth-required:invalid-payment"]
```

### NWC Integration (NIP-47)

For seamless in-client Lightning payments:

```
1. User connects Lightning wallet via NWC (scan QR / deeplink)
   nostr+walletconnect://<wallet-pubkey>?relay=<relay>&secret=<secret>

2. When L402 payment needed:
   a. Client sends kind 23194 (NWC request) to wallet:
      {"method": "pay_invoice", "params": {"invoice": "lnbc10n1..."}}
   b. Wallet receives, validates, pays
   c. Wallet sends kind 23195 (NWC response):
      {"result_type": "pay_invoice", "result": {"preimage": "abc123..."}}
   d. Client uses preimage to complete L402 authentication

3. For Cashu minting:
   a. Client generates Cashu mint invoice
   b. Pays via NWC (same flow)
   c. Receives minted tokens
```

### Cashu Wallet Integration (NIP-60/61)

NOSTR already has NIPs for Cashu wallet management:

- **NIP-60**: Cashu wallet event (kind 37375) — stores wallet state on relays
- **NIP-61**: Nutzap — Cashu token zaps

NOSTR Mail can leverage the same wallet infrastructure:

```json
{
  "kind": 37375,
  "tags": [
    ["d", "my-mail-wallet"],
    ["mint", "https://mint.example.com"],
    ["balance", "5000"],
    ["unit", "sat"]
  ],
  "content": "<NIP-44 encrypted wallet proofs>"
}
```

The mail client reads the user's existing Cashu wallet, uses it for postage, and credits received postage back to it.
