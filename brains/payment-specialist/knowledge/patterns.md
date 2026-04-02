# Payment Integration Patterns

## Cashu-in-NOSTR-Mail Pattern

### Overview

Cashu tokens are attached inside encrypted mail events as "postage." The tokens are inside the NIP-59 gift wrap, invisible to relays and observers. Only the recipient can see and redeem them.

### Pre-Minting: Token Cache Management

Clients should maintain a local cache of pre-minted tokens at various denominations to avoid minting latency at send time:

```
Token Cache Strategy:
  - Target cache: 20-50 tokens across denominations
  - Denominations: 1, 2, 4, 8, 16, 32, 64 sats
  - Refill trigger: cache drops below 10 tokens
  - Refill method: POST /v1/mint/bolt11 in background
  - Storage: NIP-60 (kind 7375) for cross-device sync
  - Encryption: All token data encrypted to user's pubkey
```

**Denomination selection heuristic**: The client should stock denominations based on common postage prices. If most recipients require 10 sats, stock 8s and 2s. Track a rolling average of postage amounts paid.

### Token Selection Algorithm

When sending a message with N sats postage:

```
function selectTokens(required: number, cache: Token[]): Token[] {
  // Sort by denomination descending
  const sorted = cache.sort((a, b) => b.amount - a.amount);
  const selected: Token[] = [];
  let remaining = required;

  for (const token of sorted) {
    if (token.amount <= remaining) {
      selected.push(token);
      remaining -= token.amount;
    }
    if (remaining === 0) break;
  }

  if (remaining > 0) {
    // Need to break a larger token via swap
    const larger = cache.find(t => t.amount > remaining && !selected.includes(t));
    if (larger) {
      // Swap at mint: larger -> [remaining, larger.amount - remaining]
      // Use the 'remaining' portion, return change to cache
      // This adds latency -- pre-minting avoids this
    }
  }

  return selected; // Sum >= required
}
```

**Overpayment**: If exact change is unavailable, slight overpayment is acceptable. The recipient can refund the exact postage amount regardless.

### Serialization and Embedding

1. Select tokens summing to the required postage amount.
2. Serialize using NUT-00 V4 format (cashuB prefix, CBOR encoding).
3. Embed in the inner event (inside the gift wrap) as a tag:

```json
{
  "kind": 14,
  "content": "Hello, I'd like to discuss...",
  "tags": [
    ["p", "<recipient_pubkey>"],
    ["postage", "cashuBo2F0..."],
    ["refund", "<sender_pubkey>"],
    ["mint", "https://mint.example.com"]
  ]
}
```

- `postage` tag: The serialized Cashu token string.
- `refund` tag: Sender's pubkey for postage refund (optional but recommended).
- `mint` tag: The mint URL (redundant with token data but aids quick validation).

**Critical**: All of this is inside NIP-59 encryption. Relays and observers see only the gift wrap (kind 1059) with no payment metadata.

### Verification Flow (Recipient Side)

When a recipient receives a gift-wrapped message with postage:

```
1. Decrypt gift wrap (NIP-59)
2. Parse inner event, extract postage tag
3. Decode Cashu token (cashuB prefix -> CBOR -> proofs + mint URL)
4. Check mint URL against trusted mint list
   - If untrusted mint: reject message or queue for manual review
5. POST /v1/swap to mint with input proofs, requesting same-amount output
   - This atomically verifies AND redeems the tokens
   - New proofs go to recipient's wallet
6. If swap succeeds: tokens are valid, message is paid for
7. If swap fails:
   - "token already spent": reject (double-spend attempt or replay)
   - "unknown keyset": mint rotated keys, try /v1/keys then retry
   - HTTP error / timeout: mint offline, queue for retry
```

**Why swap instead of just checking?** A state check (NUT-07) tells you if a token is unspent, but doesn't claim it. Between checking and claiming, the sender could race to spend it elsewhere. Swap is atomic: verify + claim in one step.

### Error Handling

| Condition | Action | User Experience |
|-----------|--------|----------------|
| Mint offline | Queue message, retry swap every 5 minutes for 24 hours | "Postage verification pending" |
| Token already spent | Reject message, do not display | Silent discard or "message rejected: invalid postage" |
| Insufficient postage | Reject if below minimum, accept if within tolerance (e.g., 90%+) | "Insufficient postage" notification to sender |
| Untrusted mint | Reject or quarantine | "Message quarantined: untrusted mint" |
| Swap returns wrong amount | Partial credit if outputs < inputs (possible mint fee) | Accept if within tolerance |
| Token format invalid | Reject message | Silent discard |

### P2PK Token Locking (Anti-Race Mitigation)

To prevent the sender from racing to redeem tokens before the recipient:

1. Sender creates tokens with NUT-11 P2PK spending condition locked to recipient's pubkey.
2. Only the recipient's private key can authorize the swap.
3. This eliminates the double-spend race entirely.
4. **Trade-off**: Requires the sender to know the recipient's pubkey (always true in DMs) and the mint to support NUT-10/NUT-11.

---

## L402-at-Relay Pattern

### Overview

L402 provides relay-level payment gating. The relay charges for event publication (specifically kind 1059 gift wraps) to prevent spam at the infrastructure level. This complements Cashu postage (which compensates recipients).

### Relay-Side Flow

```
Sender Client              Relay                      Recipient's Policy
    |                        |                              |
    | 1. EVENT [kind 1059]   |                              |
    |----------------------->|                              |
    |                        | 2. Check: is sender in       |
    |                        |    recipient's contact list?  |
    |                        |    (kind 3 lookup)            |
    |                        |                              |
    |                        | 3. If not contact:            |
    |                        |    Query kind 10097 for       |
    |                        |    recipient's spam policy    |
    |                        |--------------------------->  |
    |                        |    <-- pricing info           |
    |                        |                              |
    | 4. ["OK", <id>, false, |                              |
    |     "payment-required: |                              |
    |     lnbc1u...&mac=..."]|                              |
    |<-----------------------|                              |
    |                        |                              |
    | 5. Pay invoice         |                              |
    |    (via NWC or wallet) |                              |
    |                        |                              |
    | 6. EVENT [kind 1059]   |                              |
    |    + Authorization:    |                              |
    |      L402 <mac>:<preim>|                              |
    |----------------------->|                              |
    |                        |                              |
    |                        | 7. Verify macaroon + preimage|
    |                        |    Check caveats:             |
    |                        |    - target = recipient pubkey|
    |                        |    - expiry > now             |
    |                        |    - max_events > 0           |
    |                        |                              |
    | 8. ["OK", <id>, true,  |                              |
    |     ""]                |                              |
    |<-----------------------|                              |
```

### OK Message Format for Payment Required

The relay returns a payment-required error using the NIP-20 OK message format:

```json
["OK", "<event_id>", false, "payment-required:lnbc10n1pj...&macaroon=AgELbm9zdHIucmVsYXk..."]
```

The `payment-required:` prefix is followed by:
- A BOLT-11 Lightning invoice
- `&macaroon=` with a base64-encoded macaroon

The client parses both, pays the invoice to get the preimage, then resubmits with the L402 proof.

### Macaroon Construction for Relays

```json
{
  "identifier": {
    "version": 0,
    "payment_hash": "<32_bytes_hex>",
    "token_id": "<16_bytes_random>"
  },
  "location": "wss://relay.example.com",
  "caveats": [
    "target_pubkey = <recipient_hex_pubkey>",
    "expires = 1704067200",
    "max_events = 10",
    "event_kind = 1059"
  ]
}
```

**Caveat design for relay anti-spam**:
- `target_pubkey`: Limits the macaroon to messages destined for one recipient. Prevents buying one macaroon and spamming many users.
- `expires`: Time-limited to prevent stockpiling. 24-hour expiry is reasonable.
- `max_events`: Rate-limits the sender. Prevents a single payment from authorizing unlimited spam.
- `event_kind`: Restricts to gift wraps. Prevents using a mail macaroon for other event types.

### Stateless Verification

The relay verifies an L402 proof without any database:

```
function verifyL402(macaroon: bytes, preimage: bytes): boolean {
  // 1. Extract payment_hash from macaroon identifier
  const paymentHash = macaroon.identifier.payment_hash;

  // 2. Verify preimage matches payment hash
  if (SHA256(preimage) !== paymentHash) return false;

  // 3. Verify macaroon HMAC chain from root key
  let sig = HMAC(root_key, macaroon.identifier);
  for (const caveat of macaroon.caveats) {
    sig = HMAC(sig, caveat);
  }
  if (sig !== macaroon.signature) return false;

  // 4. Check each caveat
  for (const caveat of macaroon.caveats) {
    if (!satisfyCaveat(caveat, context)) return false;
  }

  return true;
}
```

No lookup table, no state. The root key and current context are sufficient. This makes L402 highly scalable for relays.

### Revenue Model for Relays

L402 payments go to the relay operator, creating an economic incentive to run relays that serve NOSTR Mail:

- Revenue per message: determined by recipient's kind 10097 policy.
- Relay can add a markup over recipient's minimum postage.
- Multiple relays serving the same recipient create price competition.
- Relay revenue offsets storage and bandwidth costs.

---

## NWC Integration Pattern

### Overview

NIP-47 (Nostr Wallet Connect) enables NOSTR clients to perform Lightning operations (pay invoices, create invoices, check balance) through encrypted NOSTR events. This is how NOSTR Mail clients interact with users' Lightning wallets for postage payments and refunds.

### Connection Setup

```
1. User opens wallet app (e.g., Alby, Mutiny, Coinos)
2. Wallet generates connection URI:
   nostr+walletconnect://<wallet_pubkey>?
     relay=wss://relay.getalby.com/v1&
     secret=<connection_secret>&
     lud16=user@getalby.com

3. User scans QR code or pastes URI in NOSTR Mail client
4. Client stores wallet pubkey + relay + secret
5. All subsequent wallet operations go through encrypted NOSTR events
```

### Request/Response Flow

```
NOSTR Mail Client          NWC Relay              Wallet Service
      |                        |                        |
      | 1. kind 23194          |                        |
      |   (encrypted request)  |                        |
      |   method: pay_invoice  |                        |
      |   params: { invoice }  |                        |
      |----------------------->|                        |
      |                        |----------------------->|
      |                        |                        |
      |                        |  2. Wallet pays LN     |
      |                        |     invoice             |
      |                        |                        |
      |                        | 3. kind 23195          |
      |                        |   (encrypted response)  |
      |                        |   result: { preimage }  |
      |                        |<-----------------------|
      | 4. Client receives     |                        |
      |    preimage            |                        |
      |<-----------------------|                        |
```

### Supported Methods for NOSTR Mail

| Method | Use Case | Request | Response |
|--------|----------|---------|----------|
| `pay_invoice` | Pay L402 invoice from relay | `{ invoice: "lnbc..." }` | `{ preimage: "abc..." }` |
| `make_invoice` | Generate invoice for postage refund | `{ amount: 100, description: "Refund" }` | `{ invoice: "lnbc...", payment_hash: "..." }` |
| `get_balance` | Check if user can afford postage | `{}` | `{ balance: 50000 }` |
| `lookup_invoice` | Check if refund was paid | `{ payment_hash: "..." }` | `{ paid: true }` |

### Error Handling for NWC

| Error | Cause | Recovery |
|-------|-------|----------|
| `INSUFFICIENT_BALANCE` | Wallet has insufficient funds | Prompt user to fund wallet |
| `PAYMENT_FAILED` | Lightning routing failure | Retry with different route; fall back to Cashu |
| `QUOTA_EXCEEDED` | NWC connection has spending limit | Prompt user to increase limit in wallet |
| `NOT_FOUND` | Invoice expired or unknown | Request new invoice from relay |
| `INTERNAL` | Wallet service error | Retry after delay |
| No response (timeout) | NWC relay or wallet offline | Queue request; fall back to Cashu |

### Security Considerations

- NWC secrets should be stored securely (keychain, encrypted storage).
- Spending limits should be set in the wallet to cap exposure.
- The NWC relay sees encrypted events but cannot read them (NIP-44 encryption).
- The wallet service is a trust point -- it can see payment destinations and amounts.

---

## Refundable Postage Pattern

### Overview

The refundable postage model ensures that legitimate communication is effectively free, while spam bears a real cost. The sender pays postage upfront; the recipient refunds it if the message is wanted.

### Flow

```
Sender                      Recipient                    Mint
  |                            |                           |
  | 1. Attach tokens + refund tag                          |
  |    ["postage", "cashuB..."]|                           |
  |    ["refund", "<sender_pk>"]                           |
  |--------------------------->|                           |
  |                            |                           |
  |                            | 2. Decrypt, extract tokens|
  |                            | 3. POST /v1/swap          |
  |                            |-------------------------->|
  |                            |    <-- new proofs         |
  |                            |                           |
  |                            | 4. Tokens valid,          |
  |                            |    postage collected       |
  |                            |                           |
  |                            | 5. Read message,          |
  |                            |    decide: wanted?         |
  |                            |                           |
  |  [If wanted]               |                           |
  |                            | 6. Mint new tokens for    |
  |                            |    sender's pubkey         |
  |                            |    (P2PK locked or plain) |
  |                            |                           |
  |                            | 7. Send refund in reply   |
  |     kind 14 reply with     |                           |
  |     ["postage-refund",     |                           |
  |      "cashuB..."]          |                           |
  |<---------------------------|                           |
  |                            |                           |
  | 8. Sender redeems refund   |                           |
  |    tokens                  |                           |
  |-------------------------------------------------->     |
  |    <-- value returned                                  |
```

### Economics

- **Wanted message (with refund)**: Net cost to sender = 0 sats. Sender gets full postage back.
- **Wanted message (no refund)**: Net cost to sender = postage amount. Some recipients may not bother refunding.
- **Unwanted message (spam)**: Net cost to sender = postage amount. This is the spam deterrent.
- **Refund cost to recipient**: Minting new tokens costs nothing if the recipient already has a funded mint account. The refund amount comes from the postage they just collected.

### Refund Decision Logic (Recipient Client)

```
function shouldRefund(message, sender): boolean {
  // Auto-refund: sender is in contact list
  if (contacts.includes(sender)) return true;

  // Auto-refund: sender is NIP-05 verified at a trusted domain
  if (isNIP05Verified(sender) && isTrustedDomain(sender.nip05)) return true;

  // Manual decision: unknown sender
  // Present message to user, let them decide
  return userDecision(message, sender);
}
```

### Abuse Prevention

**Refund gaming**: An attacker sends messages designed to look legitimate (to get refunds) then escalates to spam.
- **Mitigation**: Refund is always voluntary. After a few suspicious messages, the recipient stops refunding. The attacker has already spent postage on the "legitimate-looking" messages.

**Refund expectation attacks**: Attacker sends "please refund, I'm a friend" social engineering messages.
- **Mitigation**: Client UX should clearly separate the refund decision from message content. Auto-refund rules should be conservative.

---

## Dynamic Pricing Pattern

### Overview

Recipients publish their spam-filtering preferences and pricing requirements in a kind 10097 event. Senders' clients read this policy before composing a message, automatically selecting the appropriate anti-spam method.

### Kind 10097: Spam Policy Event

```json
{
  "kind": 10097,
  "content": "",
  "tags": [
    ["tier", "contact", "free"],
    ["tier", "nip05", "free"],
    ["tier", "pow", "difficulty", "20"],
    ["tier", "cashu", "amount", "10", "unit", "sat"],
    ["tier", "cashu", "amount", "50", "unit", "sat", "context", "first-message"],
    ["tier", "l402", "amount", "10", "unit", "sat"],
    ["mint", "https://mint.minibits.cash"],
    ["mint", "https://mint.coinos.io"],
    ["refund", "true"],
    ["max-size", "10000"]
  ]
}
```

**Tag semantics**:
- `tier` tags define accepted anti-spam methods and their costs.
- `contact` tier: Messages from contact list are free.
- `nip05` tier: Messages from NIP-05 verified senders are free.
- `pow` tier: Free-tier PoW alternative with specified difficulty.
- `cashu` tier: Cashu postage at specified amount. Can have context-specific pricing (e.g., higher for first messages from unknown senders).
- `l402` tier: L402 relay-level payment at specified amount.
- `mint` tags: Accepted Cashu mints (recipient will only redeem tokens from these).
- `refund` tag: Whether the recipient intends to refund legitimate postage.
- `max-size` tag: Maximum message size in bytes.

### Sender Client Auto-Selection

```
function selectAntiSpam(recipientPolicy, senderContext):
  // 1. Free tier: check if sender qualifies
  if senderContext.isContact(recipient):
    return { method: "free", reason: "contact" }

  if senderContext.hasNIP05 && recipientPolicy.acceptsNIP05:
    return { method: "free", reason: "nip05" }

  // 2. PoW tier: free but costs CPU time
  if recipientPolicy.acceptsPoW && senderContext.prefersFree:
    return { method: "pow", difficulty: recipientPolicy.powDifficulty }

  // 3. Cashu tier: preferred paid method (privacy-preserving)
  if recipientPolicy.acceptsCashu:
    const amount = recipientPolicy.cashuAmount(context: "default")
    const mint = recipientPolicy.acceptedMints.find(m => senderWallet.hasMint(m))
    if mint && senderWallet.balance(mint) >= amount:
      return { method: "cashu", amount, mint }

  // 4. L402 tier: relay-level payment (fallback)
  if recipientPolicy.acceptsL402:
    return { method: "l402", amount: recipientPolicy.l402Amount }

  // 5. No compatible method
  return { method: "none", error: "Cannot meet recipient's anti-spam requirements" }
```

### Price Discovery

- Recipients set their own prices. No global price authority.
- Clients can display the cost before sending: "This message will cost 10 sats postage (refundable)."
- If a recipient sets unreasonably high postage, fewer people will message them. This is by design -- it's the recipient's choice.
- Market dynamics: over time, common postage amounts will converge as clients default to similar ranges.
- Recipients can update their kind 10097 at any time. Clients should fetch the latest before each send.

### Multi-Mint Negotiation

When the sender and recipient use different mints:

1. Sender checks recipient's accepted mint list (from kind 10097).
2. If sender has tokens at an accepted mint: use those directly.
3. If not: sender melts tokens at their mint (ecash -> Lightning), then mints tokens at an accepted mint (Lightning -> ecash). This adds ~5-10 seconds of latency.
4. **Optimization**: Clients should proactively mint tokens at popular mints based on the user's contact list and message history.
5. **Future**: Multi-mint atomic swaps or federated mints could reduce this friction.
