# NIP-60: Cashu Wallet

## Status
Draft / Optional

## Summary
NIP-60 defines a protocol for storing Cashu ecash wallet state on Nostr relays, making wallets portable across applications. A wallet event (kind 17375) holds mint URLs and a dedicated P2PK private key. Token events (kind 7375) store NIP-44 encrypted Cashu proofs. Spending history events (kind 7376) record transaction metadata. This allows any NIP-60-aware client to reconstruct and operate a user's ecash wallet.

## Motivation
New Nostr users face a cold-start problem: they need a Lightning wallet to receive tips, but setting one up is friction-heavy. Cashu ecash wallets are lightweight, require no account creation, and can be bootstrapped instantly. By storing wallet state on relays, the wallet follows the user across any Nostr app -- if one client creates the wallet, any other client can spend from it. This also enables NIP-61 nutzaps (ecash tips) without requiring the recipient to run a Lightning node.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 17375 | Wallet Event | Replaceable | Wallet configuration: mints, P2PK private key |
| 7375 | Token Event | Regular | Encrypted unspent Cashu proofs |
| 7376 | Spending History | Regular | Transaction history records |
| 7374 | Quote Event | Regular (optional) | Mint quote state for pending deposits |

### Tags

**Wallet Event (kind 17375):**
- All tags are encrypted inside `.content` via NIP-44:
  - `mint` -- mint URL (one or more)
  - `privkey` -- hex private key for P2PK ecash operations (NOT the user's Nostr key)

**Token Event (kind 7375):**
- No public tags. All data is NIP-44 encrypted in `.content`.

**Spending History (kind 7376):**
- `e` tags with markers:
  - `"created"` -- references a newly created token event
  - `"destroyed"` -- references a token event that was spent/deleted
  - `"redeemed"` -- references a NIP-61 nutzap that was claimed
- `e` tags with `"redeemed"` marker SHOULD be left unencrypted (public).
- All other tags can be NIP-44 encrypted in `.content`.

**Quote Event (kind 7374):**
- `expiration` -- NIP-40 expiration timestamp (recommended ~2 weeks)
- `mint` -- mint URL for the quote

### Protocol Flow

#### Wallet Discovery

```
Client                          Relays
  |                               |
  | 1. Fetch kind:10019           |
  |    (NIP-61 relay hints)       |
  |------------------------------>|
  |                               |
  | 2. If not found, use NIP-65   |
  |    relays                     |
  |                               |
  | 3. Fetch kind:17375, kind:7375|
  |    author=<my-pubkey>         |
  |------------------------------>|
  |                               |
  | 4. Decrypt wallet event       |
  |    Extract mints + privkey    |
  |                               |
  | 5. Decrypt token events       |
  |    Reconstruct proof set      |
  |                               |
  | 6. Calculate balance per mint |
```

#### Spending Tokens

```
Alice's Client              Cashu Mint              Nostr Relays
     |                          |                       |
     | 1. Select proofs to      |                       |
     |    cover amount          |                       |
     |                          |                       |
     | 2. Swap/split proofs     |                       |
     |    (get change back)     |                       |
     |------------------------->|                       |
     |                          |                       |
     | 3. Mint returns new      |                       |
     |    proofs (change)       |                       |
     |<-------------------------|                       |
     |                          |                       |
     | 4. Delete old token      |                       |
     |    event (NIP-09)        |                       |
     |    with ["k", "7375"]    |                       |
     |---------------------------------------->         |
     |                          |                       |
     | 5. Publish new token     |                       |
     |    event with remaining  |                       |
     |    proofs + change       |                       |
     |    (includes "del" field)|                       |
     |---------------------------------------->         |
     |                          |                       |
     | 6. Publish kind 7376     |                       |
     |    spending history      |                       |
     |---------------------------------------->         |
```

**Detailed spend example:**

Alice has a token event with proofs worth 1, 2, 4, and 8 sats. She spends 4 sats:

1. Her client selects the 4-sat proof for spending.
2. Client sends the 4-sat proof to the mint for the payment.
3. Client creates a NEW token event (kind 7375) containing the remaining proofs (1, 2, 8 sats) plus any change, with `"del": ["<old-token-event-id>"]`.
4. Client deletes the old token event via NIP-09 (kind 5 with `["k", "7375"]`).
5. Client publishes a kind 7376 history event recording the spend.

#### Receiving Funds (Minting)

```
Alice's Client              Cashu Mint              Nostr Relays
     |                          |                       |
     | 1. Request mint quote    |                       |
     |------------------------->|                       |
     |                          |                       |
     | 2. Receive quote ID +   |                       |
     |    Lightning invoice     |                       |
     |<-------------------------|                       |
     |                          |                       |
     | 3. (Optional) Publish    |                       |
     |    kind 7374 quote event |                       |
     |---------------------------------------->         |
     |                          |                       |
     | 4. Pay Lightning invoice |                       |
     |    (or someone else pays)|                       |
     |                          |                       |
     | 5. Poll quote status     |                       |
     |------------------------->|                       |
     |                          |                       |
     | 6. Quote paid: mint      |                       |
     |    proofs with quote     |                       |
     |------------------------->|                       |
     |                          |                       |
     | 7. Receive new proofs    |                       |
     |<-------------------------|                       |
     |                          |                       |
     | 8. Publish new token     |                       |
     |    event (kind 7375)     |                       |
     |---------------------------------------->         |
     |                          |                       |
     | 9. Publish kind 7376     |                       |
     |    history (direction:in)|                       |
     |---------------------------------------->         |
```

### JSON Examples

**Wallet Event (kind 17375):**
```json
{
  "kind": 17375,
  "content": "<nip44_encrypt([[\"privkey\",\"a1b2c3d4e5f6...\"],[\"mint\",\"https://mint.minibits.cash\"],[\"mint\",\"https://stablenut.umint.cash\"]])>",
  "tags": [],
  "pubkey": "<user-pubkey>",
  "created_at": 1700000000
}
```

Decrypted `.content`:
```json
[
  ["privkey", "a1b2c3d4e5f6..."],
  ["mint", "https://mint.minibits.cash"],
  ["mint", "https://stablenut.umint.cash"]
]
```

**Token Event (kind 7375):**
```json
{
  "kind": 7375,
  "content": "<nip44_encrypt({...})>",
  "tags": [],
  "pubkey": "<user-pubkey>",
  "created_at": 1700000100
}
```

Decrypted `.content`:
```json
{
  "mint": "https://stablenut.umint.cash",
  "unit": "sat",
  "proofs": [
    {
      "id": "005c2502034d4f12",
      "amount": 1,
      "secret": "z+zyxAVLRqN9lEjxuNPSyRJzEstbl69Jc1vtimvtkPg=",
      "C": "0241d98a8197ef238a192d47edf191a9de78b657308937b4f7dd0aa53beae72c46"
    }
  ],
  "del": ["token-event-id-1", "token-event-id-2"]
}
```

**Spending History -- Outgoing (kind 7376):**
```json
{
  "kind": 7376,
  "content": "<nip44_encrypt([[\"direction\",\"out\"],[\"amount\",\"4\"],[\"unit\",\"sat\"],[\"e\",\"<old-token-id>\",\"\",\"destroyed\"],[\"e\",\"<new-token-id>\",\"\",\"created\"]])>",
  "tags": [],
  "pubkey": "<user-pubkey>",
  "created_at": 1700000200
}
```

Decrypted `.content`:
```json
[
  ["direction", "out"],
  ["amount", "4"],
  ["unit", "sat"],
  ["e", "<old-token-event-id>", "", "destroyed"],
  ["e", "<new-token-event-id>", "", "created"]
]
```

**Spending History -- Nutzap Redemption (kind 7376):**
```json
{
  "kind": 7376,
  "content": "<nip44_encrypt([[\"direction\",\"in\"],[\"amount\",\"1\"],[\"unit\",\"sat\"],[\"e\",\"<7375-event-id>\",\"\",\"created\"]])>",
  "tags": [
    ["e", "<9321-event-id>", "", "redeemed"]
  ],
  "pubkey": "<user-pubkey>",
  "created_at": 1700000300
}
```

**Quote Event (kind 7374):**
```json
{
  "kind": 7374,
  "content": "<nip44_encrypt(\"quote-id-abc123\")>",
  "tags": [
    ["expiration", "1701209600"],
    ["mint", "https://stablenut.umint.cash"]
  ],
  "pubkey": "<user-pubkey>",
  "created_at": 1700000000
}
```

## Implementation Notes

- The `privkey` in the wallet event is a **dedicated ecash key**, completely separate from the user's Nostr identity key. It is used for P2PK locking of Cashu proofs (needed for NIP-61 nutzaps).
- There can be multiple kind 7375 token events per mint, and multiple proofs per token event.
- The `del` field in token events helps clients track state transitions -- it lists the IDs of token events that were consumed to create this one.
- The NIP-09 delete event for spent tokens MUST include `["k", "7375"]` to enable efficient filtering.
- The `unit` field supports `sat`, `usd`, `eur`, etc. Default is `sat` if omitted.
- Quote events (kind 7374) are optional and should use NIP-40 expiration (~2 weeks, the max Lightning in-flight time). Application developers SHOULD prefer local state over publishing quote events when possible.
- Clients can optionally validate proofs against the mint to detect stale state, and should roll over any still-valid proofs into a new token event if some are found spent.
- Multi-client conflicts: if two clients spend from the same token event simultaneously, one will fail at the mint. Clients should handle this gracefully.

## Client Behavior

- Clients MUST encrypt all wallet and token data using NIP-44.
- Clients MUST delete old token events (NIP-09) when proofs are spent or rolled over.
- Clients MUST include `["k", "7375"]` in delete events.
- Clients MUST roll over unspent proofs into a new token event when some proofs from a token are spent.
- Clients SHOULD publish kind 7376 history events on balance changes.
- Clients SHOULD leave `e` tags with `"redeemed"` markers unencrypted for public nutzap acknowledgment.
- Clients SHOULD fetch kind 10019 first (NIP-61 relay hints), falling back to NIP-65 relays.
- Clients MAY validate proofs against the mint to detect stale state.

## Relay Behavior

- Relays MUST treat kind 17375 as a replaceable event.
- Relays SHOULD support NIP-09 deletion events.
- No special relay behavior is required beyond standard event handling.

## Dependencies

- **NIP-01** -- Basic protocol, event structure, replaceable events
- **NIP-09** -- Event deletion (for removing spent token events)
- **NIP-40** -- Expiration tags (for quote events)
- **NIP-44** -- Encryption (all wallet content is encrypted)
- **NIP-65** -- Relay list metadata (fallback relay discovery)
- **Cashu Protocol** -- NUT-00 (token format), NUT-11 (P2PK), NUT-12 (DLEQ proofs)

## Source Code References

- **cashu-ts:** TypeScript Cashu library (proof handling, mint interaction)
- **cashu-rs:** Rust Cashu library
- **Minibits:** Mobile wallet implementing NIP-60
- **Nutsack:** Reference NIP-60 wallet implementation

## Related NIPs

- **NIP-61** -- Nutzaps (sending ecash tips; uses the P2PK pubkey from the wallet event)
- **NIP-87** -- Ecash Mint Discoverability (finding trustworthy mints)
- **NIP-57** -- Lightning Zaps (NIP-60/61 is the ecash alternative to Lightning zaps)
- **NIP-47** -- Nostr Wallet Connect (Lightning wallet protocol; NIP-60 is the ecash equivalent)
