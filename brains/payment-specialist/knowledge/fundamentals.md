# Payment Systems Fundamentals

## Lightning Network

### Overview

The Lightning Network is a Layer 2 payment protocol built on top of Bitcoin. It enables near-instant, low-fee transactions through a network of bidirectional payment channels. The protocol is defined by the BOLT (Basis of Lightning Technology) specifications, numbered BOLT-01 through BOLT-11.

### Core Concepts

**Payment Channels (BOLT-02, BOLT-03)**

A payment channel is a 2-of-2 multisig UTXO on the Bitcoin blockchain. Two parties fund the channel, then exchange signed "commitment transactions" off-chain to update the balance distribution. Only the latest state matters -- older states are revocable via penalty transactions.

- **Opening**: One or both parties fund a multisig output; a funding transaction is broadcast on-chain.
- **Updating**: Parties exchange new commitment transactions. Each new commitment revokes the previous one by revealing a revocation secret.
- **Closing**: Cooperative close (both sign a closing tx) or unilateral close (broadcast latest commitment). Force-close requires a timelock delay before funds are spendable.

**HTLCs (Hash Time-Locked Contracts) (BOLT-03)**

HTLCs are the mechanism that enables multi-hop payments across channels that don't directly connect sender and receiver.

- **Hash lock**: Payment is conditional on revealing a preimage `r` such that `SHA256(r) = payment_hash`.
- **Time lock**: If the preimage is not revealed before a timeout (CLTV expiry), the funds revert to the sender.
- HTLCs are added to commitment transactions as additional outputs. When the preimage is revealed, the HTLC output is claimed. When it times out, the sender reclaims.

**Onion Routing (BOLT-04)**

Lightning uses Sphinx-based onion routing for payment privacy:

1. Sender constructs a layered encrypted packet, one layer per hop.
2. Each hop can only decrypt its own layer, learning only the previous hop and next hop.
3. No intermediate node knows both the sender and the receiver.
4. Each hop layer contains: short channel ID for next hop, amount to forward, CLTV expiry delta, and optional TLV data.
5. Packet size is fixed (1300 bytes) regardless of route length to prevent length-based deanonymization.

### Payment Flow

```
Sender                    Hop 1                    Hop 2                    Receiver
  |                         |                         |                         |
  | 1. Receiver generates invoice with payment_hash = SHA256(preimage)          |
  |<---------------------------------------------------------------------[invoice]
  |                         |                         |                         |
  | 2. Sender finds route: Sender -> Hop1 -> Hop2 -> Receiver                  |
  |                         |                         |                         |
  | 3. Sender constructs onion packet (3 layers)                                |
  |                         |                         |                         |
  | 4. update_add_htlc      |                         |                         |
  |    (amt=1010, hash=H,   |                         |                         |
  |     cltv=current+60)    |                         |                         |
  |------------------------>|                         |                         |
  |                         | 5. Unwrap layer, forward|                         |
  |                         |    update_add_htlc      |                         |
  |                         |    (amt=1005, hash=H,   |                         |
  |                         |     cltv=current+30)    |                         |
  |                         |------------------------>|                         |
  |                         |                         | 6. Unwrap, forward      |
  |                         |                         |    update_add_htlc      |
  |                         |                         |    (amt=1000, hash=H,   |
  |                         |                         |     cltv=current+10)    |
  |                         |                         |------------------------>|
  |                         |                         |                         |
  |                         |                         |    7. Receiver knows    |
  |                         |                         |       preimage r        |
  |                         |                         |    update_fulfill_htlc  |
  |                         |                         |<------------------------|
  |                         |  update_fulfill_htlc    |                         |
  |                         |<------------------------|                         |
  |  update_fulfill_htlc    |                         |                         |
  |<------------------------|                         |                         |
  |                         |                         |                         |
  | 8. Sender has preimage r -- proof of payment                                |
```

**Fee structure**: Each hop deducts a fee (base_fee + fee_rate * amount). The sender pays all fees upfront. Typical fees for small payments are < 1 sat.

**CLTV delta**: Each hop requires a decreasing timelock. If any hop fails to forward, the preceding hop can reclaim funds after timeout. Typical delta: 40-144 blocks per hop.

### Invoice Format (BOLT-11)

BOLT-11 invoices are bech32-encoded strings that contain everything a sender needs to make a payment:

```
lnbc10u1p3...  (human-readable part + data)
```

**Human-readable part**: `ln` + network (`bc`=mainnet, `tb`=testnet) + optional amount + multiplier (`m`=milli, `u`=micro, `n`=nano, `p`=pico).

**Data fields**:
- `payment_hash` (256 bits) -- SHA256 of the preimage; the HTLC condition
- `timestamp` -- Unix timestamp of invoice creation
- `expiry` -- Seconds until expiry (default: 3600 = 1 hour)
- `description` or `description_hash` -- Human-readable purpose or hash of long description
- `payee_pubkey` -- Node public key of the recipient (33 bytes)
- `routing_hints` -- Private channel info for last-mile routing (for unannounced channels)
- `min_final_cltv_expiry` -- Minimum CLTV delta for the final hop
- `payment_secret` -- 256-bit value for payment security (prevents probing)
- `feature_bits` -- Required/optional features (e.g., MPP, AMP)

**Signature**: The invoice is signed by the payee's node key, proving authenticity.

### Failure Modes

| Failure | Cause | Effect | Recovery |
|---------|-------|--------|----------|
| No route found | Sender's pathfinding can't reach recipient | Payment never starts | Retry with different pathfinding, or use trampoline routing |
| Insufficient liquidity | Channel along route lacks outbound capacity | HTLC fails at bottleneck hop | Retry on different route; MPP splits payment |
| Timeout (HTLC expiry) | Downstream node goes offline or is slow | Funds locked until CLTV expiry | Wait for timeout; automatic HTLC resolution |
| Channel force-close | Peer goes offline for extended period | On-chain tx required; funds locked for timelock | Wait for timelock (typically 144-2016 blocks) |
| Invoice expired | Sender pays after expiry timestamp | Payment rejected by recipient | Request new invoice |
| Payment probing | Attacker sends HTLC with fake hash to learn channel balances | No funds lost; privacy leak | Rate-limiting; channel balance fuzzing |

### Performance Characteristics

- **Latency**: Typical 1-5 seconds for successful payments. Sub-second for direct channel peers. Up to 30 seconds for complex MPP routes.
- **Success rate**: ~95%+ for payments under 100,000 sats on well-connected nodes. Degrades for larger amounts due to liquidity constraints. MPP (Multi-Path Payments) improves success for larger amounts.
- **Fees**: < 1 sat for small payments (< 10,000 sats). Typically 0.01-0.5% for larger amounts. Base fee + proportional fee per hop.
- **Throughput**: Limited by channel count and liquidity. Individual channels: thousands of updates per second theoretically.

### LSP (Lightning Service Provider) Model

Most end-users do not run Lightning nodes. LSPs bridge this gap:

- **Channel management**: LSP opens and manages channels on behalf of users.
- **Liquidity provision**: LSP provides inbound liquidity so users can receive payments.
- **Just-in-time channels**: LSP opens a channel when a payment is incoming (LSPS2 specification).
- **Zero-conf channels**: LSP trusts the funding tx before confirmation for instant usability.
- **Examples**: Breez SDK, Phoenix (ACINQ), Mutiny (LDK-based), Greenlight (CLN-based).
- **Relevance to NOSTR Mail**: Users paying postage or receiving refunds need Lightning access. LSPs make this seamless without requiring users to manage nodes or channels.

---

## L402 Protocol

### Overview

L402 (formerly LSAT -- Lightning Service Authentication Token) combines HTTP 402 "Payment Required" status codes with Lightning payments and macaroon-based authentication. Originally developed by Lightning Labs, it enables machine-to-machine payment and authentication for HTTP resources.

### HTTP 402 Flow

```
Client                                          Server
  |                                                |
  | 1. Request protected resource                  |
  |  GET /api/publish                              |
  |----------------------------------------------->|
  |                                                |
  | 2. 402 Payment Required                        |
  |    WWW-Authenticate: L402                      |
  |    macaroon="<base64>", invoice="<bolt11>"     |
  |<-----------------------------------------------|
  |                                                |
  | 3. Client pays Lightning invoice               |
  |    (obtains preimage)                          |
  |                                                |
  | 4. Retry with proof                            |
  |    Authorization: L402 <macaroon>:<preimage>   |
  |----------------------------------------------->|
  |                                                |
  | 5. Server verifies macaroon + preimage         |
  |    200 OK (resource granted)                   |
  |<-----------------------------------------------|
```

### Macaroon Format

Macaroons (introduced by Google in 2014) are bearer credentials with built-in attenuation. They are superior to API keys because holders can add restrictions but never remove them.

**Structure**:
```
Macaroon {
  identifier:   bytes    // Unique ID, contains payment_hash
  location:     string   // Hint about which service issued it (optional)
  caveats:      []Caveat // Chain of restrictions
  signature:    bytes    // HMAC chain output
}
```

**HMAC Chain Construction**:
```
sig_0 = HMAC(root_key, identifier)
sig_1 = HMAC(sig_0, caveat_1)
sig_2 = HMAC(sig_1, caveat_2)
...
sig_n = HMAC(sig_{n-1}, caveat_n)  // This is the macaroon's signature
```

The root key is known only to the issuing server. Verification recomputes the chain and compares the final signature.

**Key property**: Anyone holding a macaroon can add caveats (further restrictions) by extending the HMAC chain. But removing a caveat would require knowing the intermediate HMAC value, which they don't have.

### Caveat Types

**First-party caveats** (verified by the issuer):
```
"pubkey = <hex_pubkey>"          // Restrict to specific NOSTR identity
"expiry = 1704067200"            // Valid until this Unix timestamp
"event_kind = 1059"              // Only for gift-wrapped events
"max_events = 100"               // Rate limit: max 100 events
"target_pubkey = <hex_pubkey>"   // Only for messages to this recipient
"action = publish"               // Only for event publication
```

**Third-party caveats** (verified by an external service):
```
"third_party: <discharge_macaroon_location>"
```
Third-party caveats require a discharge macaroon from an external verifier. Useful for delegating verification (e.g., "user must be NIP-05 verified by this domain").

### Payment Binding

The critical innovation of L402 is binding payment proof to authentication:

1. Server generates a random `payment_hash` and creates a Lightning invoice for it.
2. Server creates a macaroon with `payment_hash` embedded in the identifier.
3. Client pays the invoice, receiving the `preimage`.
4. Client presents `macaroon:preimage` -- server verifies:
   - Macaroon signature is valid (HMAC chain checks out).
   - `SHA256(preimage) == payment_hash` from the macaroon identifier.
   - All caveats are satisfied.
5. **Stateless verification**: The server only needs its root key. No database lookup required.

### L402 in Relay Context

For NOSTR Mail, L402 applies at the relay level:

- **Event publication**: Relay requires L402 for publishing kind 1059 (gift wrap) events to prevent spam.
- **Per-recipient pricing**: Relay can query the recipient's kind 10097 spam policy to set the invoice amount.
- **Macaroon caveats for relays**:
  - `target = <recipient_pubkey>` -- This macaroon only authorizes messages to one recipient.
  - `expires = <timestamp>` -- Time-limited authorization.
  - `max_events = <n>` -- Limits how many events can be published.
- **Relay federation**: Multiple relays can share a root key to accept each other's macaroons.

### L402 vs Cashu for Anti-Spam

| Property | L402 (relay-level) | Cashu (message-level) |
|----------|-------------------|----------------------|
| Payment target | Relay operator | Recipient (via mint) |
| Privacy | Relay sees payment | Blind signatures hide sender |
| Refundable | No (relay keeps payment) | Yes (recipient can refund) |
| Offline recipient | Works (relay gates) | Works (tokens inside encryption) |
| Verification | Stateless (macaroon) | Stateful (mint query) |
| Granularity | Per-relay policy | Per-recipient policy |

---

## Cashu Protocol

### Overview

Cashu is a Chaumian ecash system built on Bitcoin/Lightning. It provides privacy-preserving tokens that can be transferred between users without the mint learning who is paying whom. Tokens are custodial (the mint holds the backing funds) but unlinkable (the mint cannot link issuance to redemption).

### Chaumian Blind Signatures: BDHKE

BDHKE (Blind Diffie-Hellman Key Exchange) is the cryptographic core of Cashu. It enables a mint to sign a token without knowing its content, then later verify the token without linking it to the signing event.

**Setup**:
- `G` is the generator point of secp256k1.
- Mint has private key `k` and publishes public key `K = k*G`.
- `hash_to_curve(x)` maps an arbitrary secret to a point on secp256k1.

**Protocol Steps**:

```
User (Alice)                                   Mint (Bob)
  |                                               |
  | 1. Generate random secret x                   |
  |    Compute Y = hash_to_curve(x)               |
  |                                               |
  | 2. Choose random blinding factor r             |
  |    Compute B_ = Y + r*G     (blinded point)   |
  |                                               |
  |    --- Send B_ to mint --->                    |
  |                                               |
  |                              3. Sign blindly:  |
  |                              C_ = k * B_      |
  |                                               |
  |    <--- Return C_ ---                          |
  |                                               |
  | 4. Unblind:                                    |
  |    C = C_ - r*K                                |
  |    (Because C_ = k*B_ = k*(Y + r*G)           |
  |     = k*Y + r*k*G = k*Y + r*K                 |
  |     So C = C_ - r*K = k*Y)                    |
  |                                               |
  | 5. Token proof is (x, C)                       |
  |    where C = k * hash_to_curve(x)              |
  |                                               |
  |    --- Redeem (x, C) at mint --->              |
  |                                               |
  |                    6. Verify: C == k * hash_to_curve(x)
  |                       Check x not in spent set |
  |                       Add x to spent set       |
  |                       Return value             |
```

**Privacy property**: The mint sees `B_` during signing and `(x, C)` during redemption. Because `B_ = Y + r*G` and `r` is random, the mint cannot link `B_` to `Y` (and thus to `x`). The blinding factor `r` is the source of unlinkability.

**Why this matters for NOSTR Mail**: When a sender includes Cashu tokens as postage, the mint that signed the tokens cannot determine which message they were attached to or who the sender was, even if the mint colludes with the recipient.

### NUT Specifications

NUTs (Notation, Usage, and Terminology) are the Cashu protocol specifications:

**NUT-00: Token Serialization**

Tokens are serialized as a JSON object, then base64url-encoded with a `cashuA` or `cashuB` prefix:

```json
{
  "token": [{
    "mint": "https://mint.example.com",
    "proofs": [
      {
        "amount": 8,
        "id": "009a1f293253e41e",
        "secret": "some_random_secret",
        "C": "02abc123..."
      },
      {
        "amount": 2,
        "id": "009a1f293253e41e",
        "secret": "another_secret",
        "C": "03def456..."
      }
    ]
  }],
  "memo": "postage for NOSTR Mail"
}
```

- `cashuA` prefix: V3 token format (deprecated).
- `cashuB` prefix: V4 token format (current, uses CBOR).
- Each proof represents a single denomination token.
- The `id` identifies the keyset (which mint key was used for signing).
- The `secret` is the `x` value from BDHKE.
- `C` is the unblinded signature point.

**NUT-01: Mint Public Keys**

Clients discover the mint's public keys via `GET /v1/keys`:

```json
{
  "keysets": [{
    "id": "009a1f293253e41e",
    "unit": "sat",
    "keys": {
      "1": "02abc...",
      "2": "03def...",
      "4": "02ghi...",
      "8": "03jkl...",
      ...
    }
  }]
}
```

Each key corresponds to a denomination. The keyset ID is derived from the keys themselves.

**NUT-02: Keysets**

- Mints can have multiple keysets (for key rotation).
- Active keysets accept new minting; inactive keysets still verify existing tokens.
- Keyset ID is `HASH(sorted_concatenated_keys)[:7]` in hex (14 chars).
- Clients should periodically check for keyset rotation.

**NUT-03: Swap**

Swap (formerly "split") exchanges input proofs for output proofs of potentially different denominations. This is the fundamental operation for:
- Breaking a token into smaller denominations.
- Merging multiple tokens into one.
- Transferring tokens (swap to obtain fresh proofs to give someone else).

```
POST /v1/swap

Request:
{
  "inputs": [<proofs to spend>],
  "outputs": [<blinded messages for new tokens>]
}

Response:
{
  "signatures": [<blind signatures on outputs>]
}
```

The sum of input amounts must equal the sum of output amounts (no change, no fees in basic swap).

**NUT-04: Mint Tokens (Lightning -> Ecash)**

```
1. Client: POST /v1/mint/quote/bolt11 { "amount": 100, "unit": "sat" }
2. Mint: Returns { "quote": "abc123", "request": "lnbc1u...", "paid": false }
3. Client: Pays the Lightning invoice externally
4. Client: POST /v1/mint/bolt11 { "quote": "abc123", "outputs": [<blinded messages>] }
5. Mint: Returns { "signatures": [<blind signatures>] }
6. Client: Unblinds signatures to obtain valid proofs
```

**NUT-05: Melt Tokens (Ecash -> Lightning Payment)**

```
1. Client: POST /v1/melt/quote/bolt11 { "request": "lnbc1u...", "unit": "sat" }
2. Mint: Returns { "quote": "xyz789", "amount": 100, "fee_reserve": 5 }
3. Client: POST /v1/melt/bolt11 { "quote": "xyz789", "inputs": [<proofs>] }
4. Mint: Pays the Lightning invoice, returns { "paid": true, "preimage": "..." }
```

This is how recipients convert postage tokens back to Lightning/sats.

**NUT-07: Token State Check**

```
POST /v1/checkstate
{
  "Ys": ["<Y_1_hex>", "<Y_2_hex>"]   // Y = hash_to_curve(secret)
}

Response:
{
  "states": [
    { "Y": "<Y_1_hex>", "state": "UNSPENT" },
    { "Y": "<Y_2_hex>", "state": "SPENT" }
  ]
}
```

States: `UNSPENT`, `SPENT`, `PENDING` (in-flight swap).

This enables checking token validity without swapping. Useful for pre-verification before accepting a message.

**NUT-10: Spending Conditions**

The `secret` field in a proof can encode spending conditions instead of being a plain random string:

```json
["P2PK", {
  "nonce": "<random>",
  "data": "<pubkey_hex>",
  "tags": [["sigflag", "SIG_INPUTS"]]
}]
```

Conditions are verified by the mint during swap/melt. This enables conditional ecash -- tokens that can only be redeemed by a specific party.

**NUT-11: Pay-to-Public-Key (P2PK)**

Extends NUT-10 with P2PK conditions:
- Token can only be spent by the holder of a specific private key.
- Spender must provide a signature over the proof data.
- Enables "addressed" ecash: tokens that only a specific recipient can redeem.
- **Relevance to NOSTR Mail**: Postage tokens can be P2PK-locked to the recipient's pubkey, preventing the sender from racing to redeem them.

### Token Denominations

Cashu uses powers-of-2 denominations:

```
1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, ...
```

Any amount is represented as a sum of power-of-2 tokens (like binary representation). For example, 10 sats = 8 + 2 (two tokens). 100 sats = 64 + 32 + 4 (three tokens).

This minimizes the number of tokens needed for any amount while maintaining denomination privacy (the mint knows the denomination of each token but not the total payment amount when tokens are redeemed individually).

### Trust Model

**Cashu mints are custodial.** The mint holds the backing Lightning funds and can:
- Refuse to honor tokens (rug pull).
- Shut down unexpectedly (loss of funds).
- Inflate the token supply (print unbacked tokens).

**Mitigations**:
- Keep small balances per mint (< $10-20 equivalent).
- Use multiple mints to distribute risk.
- Prefer mints operated by known entities.
- Check mint audit proofs (NUT-15, under development) for proof of reserves.
- For NOSTR Mail, accept tokens only from mints on a published trusted-mint list.

### Double-Spend Prevention

The mint maintains a set of spent secrets. When a token is presented for swap or melt:

1. Check if `secret` (or `Y = hash_to_curve(secret)`) is in the spent set.
2. If yes: reject (double-spend attempt).
3. If no: add to spent set, process the operation.

This is a stateful operation. The spent set grows monotonically. Mints may periodically rotate keysets and compact the spent set for old keysets.

**Implication for NOSTR Mail**: Token verification requires contacting the mint. If the mint is offline, verification must be queued. This is why the spec should define behavior for mint unavailability.

---

## NOSTR Payment NIPs

### NIP-47: Nostr Wallet Connect (NWC)

NWC enables NOSTR clients to interact with Lightning wallets through NOSTR events:

- **Kind 13194**: Wallet service info (published by wallet, lists supported methods).
- **Kind 23194**: Encrypted request from client to wallet (pay_invoice, make_invoice, get_balance, etc.).
- **Kind 23195**: Encrypted response from wallet to client.
- All communication is NIP-44 encrypted between client and wallet service.
- Connection is established via a `nostr+walletconnect://` URI containing the wallet's pubkey and relay.

**Relevance**: NWC is how NOSTR Mail clients pay for L402 invoices or fund Cashu tokens without leaving the NOSTR app.

### NIP-57: Lightning Zaps

Zaps are the existing NOSTR payment primitive. See the full breakdown in `nips/payments/nip-57.md`.

**Relevance**: Zaps are public payments (visible on the social graph). NOSTR Mail postage is private (inside encryption). Different use cases, complementary mechanisms.

### NIP-60: Cashu Wallet

NIP-60 defines how to store Cashu wallet state on NOSTR relays:

- **Kind 37375**: Wallet info (addressable, replaceable).
- **Kind 7375**: Token proofs (encrypted, stored on relays).
- **Kind 7376**: Token history/transaction log.
- Enables cross-device wallet sync via NOSTR relays.
- All token data is encrypted -- relays cannot see balances.

**Relevance**: Users' postage token balances are stored via NIP-60, enabling seamless cross-device NOSTR Mail with consistent postage funds.

### NIP-61: Nutzaps

NIP-61 defines Cashu-based zaps (as an alternative to Lightning zaps):

- Sender mints P2PK-locked tokens for recipient.
- Tokens are published in a NOSTR event.
- Recipient redeems tokens at the mint.
- Simpler than Lightning zaps (no LNURL server needed).

**Relevance**: The NOSTR Mail postage mechanism is architecturally similar to nutzaps but embedded inside encrypted gift wraps rather than published publicly.
