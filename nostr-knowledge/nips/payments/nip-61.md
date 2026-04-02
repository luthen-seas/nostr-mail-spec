# NIP-61: Nutzaps

## Status
Draft / Optional

## Summary
Nutzaps are Cashu ecash tokens sent as tips on Nostr, where the payment itself serves as the receipt. A sender mints P2PK-locked ecash tokens on a mint the recipient trusts, then publishes a kind 9321 event containing the proofs. The recipient redeems the tokens by swapping them at the mint. Unlike Lightning zaps (NIP-57), nutzaps do not require an LNURL server or Lightning node -- the ecash proofs are verifiable on their own.

## Motivation
Lightning zaps require the recipient to run (or trust) an LNURL server that can generate invoices and publish zap receipts. This creates a dependency on always-online infrastructure. Nutzaps eliminate this: the sender locks ecash to the recipient's public key, and the recipient redeems it whenever they come online. The payment proof is embedded in the event itself (via DLEQ proofs), making it independently verifiable by any observer without contacting the mint.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 10019 | Nutzap Informational | Replaceable | Recipient's nutzap configuration: trusted mints, relays, P2PK pubkey |
| 9321 | Nutzap | Regular | The actual ecash tip event containing P2PK-locked proofs |
| 7376 | Spending History | Regular | Used to record nutzap redemptions (shared with NIP-60) |

### Tags

**Nutzap Informational (kind 10019):**
- `relay` -- relays where the user reads nutzap events (one or more)
- `mint` -- trusted mint URLs with optional unit markers (e.g., `["mint", "https://mint1", "usd", "sat"]`)
- `pubkey` -- the P2PK public key that senders MUST lock tokens to (NOT the user's Nostr pubkey)

**Nutzap Event (kind 9321):**
- `proof` -- one or more Cashu proofs (JSON-encoded strings), P2PK-locked to recipient's pubkey, with DLEQ proofs
- `u` -- mint URL (MUST match exactly as listed in recipient's kind 10019)
- `unit` -- base unit of the proofs (`sat`, `usd`, `eur`; default `sat`)
- `e` -- event being nutzapped (optional)
- `k` -- kind of the nutzapped event (optional)
- `p` -- Nostr pubkey of the recipient

**Spending History (kind 7376) -- for redemption:**
- `e` with `"redeemed"` marker -- references the kind 9321 nutzap event (SHOULD be unencrypted)
- `e` with `"created"` marker -- references the new kind 7375 token event (encrypted)
- `p` -- pubkey of the nutzap sender

### Protocol Flow

#### Setup: Recipient Configures Nutzap Reception

```
Recipient's Client              Nostr Relays
       |                            |
       | 1. Determine trusted mints |
       |    and P2PK pubkey from    |
       |    NIP-60 wallet           |
       |                            |
       | 2. Publish kind 10019      |
       |    with mints, relays,     |
       |    and pubkey              |
       |--------------------------->|
```

#### Sending a Nutzap

```
Sender's Client          Cashu Mint              Nostr Relays
     |                       |                       |
     | 1. Fetch recipient's  |                       |
     |    kind:10019          |                       |
     |---------------------------------------------->|
     |                       |                       |
     | 2. Check sender has   |                       |
     |    tokens at a listed |                       |
     |    mint (or mint new) |                       |
     |                       |                       |
     | 3. Swap proofs to     |                       |
     |    P2PK-lock to       |                       |
     |    recipient's pubkey |                       |
     |    (prefix with "02") |                       |
     |---------------------->|                       |
     |                       |                       |
     | 4. Receive P2PK-locked|                       |
     |    proofs with DLEQ   |                       |
     |<----------------------|                       |
     |                       |                       |
     | 5. Publish kind 9321  |                       |
     |    with proofs, mint  |                       |
     |    URL, p-tag         |                       |
     |---------------------------------------------->|
```

#### Receiving a Nutzap

```
Recipient's Client        Cashu Mint              Nostr Relays
     |                        |                       |
     | 1. REQ kind:9321       |                       |
     |    #p=<my-pubkey>      |                       |
     |    #u=<my-mints>       |                       |
     |    since=<last-7376>   |                       |
     |----------------------------------------------->|
     |                        |                       |
     | 2. Receive nutzap      |                       |
     |    events              |                       |
     |<-----------------------------------------------|
     |                        |                       |
     | 3. Verify mint URL     |                       |
     |    matches kind:10019  |                       |
     |                        |                       |
     | 4. Verify P2PK lock    |                       |
     |    matches my pubkey   |                       |
     |                        |                       |
     | 5. Swap proofs into    |                       |
     |    own wallet          |                       |
     |    (using privkey from |                       |
     |    NIP-60 wallet)      |                       |
     |----------------------->|                       |
     |                        |                       |
     | 6. Receive new proofs  |                       |
     |    (unlocked, in own   |                       |
     |    wallet)             |                       |
     |<-----------------------|                       |
     |                        |                       |
     | 7. Store as kind 7375  |                       |
     |    token event         |                       |
     |----------------------------------------------->|
     |                        |                       |
     | 8. Publish kind 7376   |                       |
     |    with "redeemed"     |                       |
     |    marker              |                       |
     |----------------------------------------------->|
```

#### Complete End-to-End Flow

```
Alice (Sender)              Cashu Mint              Bob (Recipient)
     |                          |                        |
     |  [Bob has published kind:10019 with:              |
     |   mint=https://mint1, pubkey=02abc...]            |
     |                          |                        |
     | 1. Fetch Bob's 10019     |                        |
     |                          |                        |
     | 2. Mint/swap tokens at   |                        |
     |    Bob's trusted mint    |                        |
     |    P2PK-locked to        |                        |
     |    Bob's pubkey          |                        |
     |------------------------->|                        |
     |                          |                        |
     | 3. Publish kind:9321     |                        |
     |    (nutzap event with    |                        |
     |    locked proofs)        |                        |
     |                          |                        |
     |                          |  4. Bob's client       |
     |                          |     fetches 9321 events|
     |                          |                        |
     |                          |  5. Bob swaps tokens   |
     |                          |     using his privkey  |
     |                          |<-----------------------|
     |                          |                        |
     |                          |  6. Bob gets unlocked  |
     |                          |     proofs in wallet   |
     |                          |----------------------->|
     |                          |                        |
     |                          |  7. Bob publishes      |
     |                          |     kind:7376 receipt  |
```

### JSON Examples

**Nutzap Informational (kind 10019):**
```json
{
  "kind": 10019,
  "tags": [
    ["relay", "wss://relay.damus.io"],
    ["relay", "wss://nos.lol"],
    ["mint", "https://mint.minibits.cash", "sat"],
    ["mint", "https://stablenut.umint.cash", "usd", "sat"],
    ["pubkey", "02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed"]
  ],
  "content": "",
  "pubkey": "<bob-nostr-pubkey>"
}
```

**Nutzap Event (kind 9321):**
```json
{
  "kind": 9321,
  "content": "Thanks for this great idea.",
  "pubkey": "<alice-sender-pubkey>",
  "tags": [
    ["proof", "{\"amount\":1,\"C\":\"02277c66191736eb72fce9d975d08e3191f8f96afb73ab1eec37e4465683066d3f\",\"id\":\"000a93d6f8a1d2c4\",\"secret\":\"[\\\"P2PK\\\",{\\\"nonce\\\":\\\"b00bdd0467b0090a25bdf2d2f0d45ac4e355c482c1418350f273a04fedaaee83\\\",\\\"data\\\":\\\"02eaee8939e3565e48cc62967e2fde9d8e2a4b3ec0081f29eceff5c64ef10ac1ed\\\"}]\"}"],
    ["unit", "sat"],
    ["u", "https://stablenut.umint.cash"],
    ["e", "<nutzapped-event-id>", "wss://relay.damus.io"],
    ["k", "1"],
    ["p", "e9fbced3a42dcf551486650cc752ab354347dd413b307484e4fd1818ab53f991"]
  ]
}
```

**Nutzap Redemption History (kind 7376):**
```json
{
  "kind": 7376,
  "content": "<nip44_encrypt([[\"direction\",\"in\"],[\"amount\",\"1\"],[\"unit\",\"sat\"],[\"e\",\"<7375-token-event-id>\",\"wss://relay.damus.io\",\"created\"]])>",
  "tags": [
    ["e", "<9321-nutzap-event-id>", "wss://relay.damus.io", "redeemed"],
    ["p", "<alice-sender-pubkey>"]
  ],
  "pubkey": "<bob-nostr-pubkey>"
}
```

**Filter for receiving nutzaps:**
```json
{
  "kinds": [9321],
  "#p": ["<my-pubkey>"],
  "#u": ["https://mint.minibits.cash", "https://stablenut.umint.cash"],
  "since": 1700000000
}
```

## Implementation Notes

- The P2PK pubkey in kind 10019 MUST correspond to the `privkey` stored in the user's NIP-60 wallet event (kind 17375). It is NOT the user's Nostr identity key.
- Clients MUST prefix the P2PK pubkey with `"02"` for Nostr-Cashu compatibility (compressed public key format).
- Senders MUST include DLEQ proofs in the Cashu tokens so observers can verify the tokens without contacting the mint.
- Senders MUST only send tokens on mints listed in the recipient's kind 10019. Sending to unlisted mints risks burning the tokens (recipient may never see the event).
- The `u` tag value MUST match the mint URL exactly as it appears in the recipient's kind 10019.
- Multiple `proof` tags can be included in a single nutzap event.
- The `since` filter when fetching nutzaps can use the `created_at` of the most recent kind 7376 event as a marker of already-redeemed nutzaps.
- Nutzap redemption events (kind 7376) SHOULD be published to the sender's NIP-65 read relays so they can see the acknowledgment.
- Mint URL normalization and deduplication should follow NIP-65 conventions.

## Client Behavior

- Clients MUST verify the recipient's kind 10019 before sending a nutzap.
- Clients MUST only send tokens on mints listed in the recipient's kind 10019.
- Clients MUST P2PK-lock tokens to the pubkey specified in the recipient's kind 10019.
- Clients MUST include DLEQ proofs in the token.
- Clients SHOULD filter incoming nutzaps by `#u` (trusted mints) to avoid interacting with unknown mints.
- Clients SHOULD publish kind 7376 events when redeeming nutzaps.
- Clients SHOULD guide users to use NUT-11 (P2PK) and NUT-12 (DLEQ) compatible mints.

**Observer Verification (for displaying nutzap counts):**
- Check that the mint in the `u` tag is listed in the recipient's kind 10019.
- Check that the proofs are P2PK-locked to the pubkey in the recipient's kind 10019.
- Locally verify DLEQ proofs (requires the mint's keyset, obtainable offline).

## Relay Behavior

- Relays MUST treat kind 10019 as a replaceable event.
- No special relay behavior is required beyond standard event handling.

## Dependencies

- **NIP-01** -- Basic protocol, event structure
- **NIP-09** -- Event deletion (used during token management)
- **NIP-44** -- Encryption (for spending history content)
- **NIP-60** -- Cashu Wallet (wallet state storage, P2PK private key)
- **NIP-65** -- Relay list metadata (for publishing redemption receipts)
- **Cashu Protocol** -- NUT-00 (token format), NUT-11 (P2PK locking), NUT-12 (DLEQ proofs)

## Source Code References

- **cashu-ts:** TypeScript Cashu library (P2PK token creation, DLEQ verification)
- **cashu-rs:** Rust Cashu library
- **Minibits:** Mobile wallet with nutzap support
- **Nutsack:** Reference implementation

## Related NIPs

- **NIP-60** -- Cashu Wallet (required for storing the P2PK private key and managing redeemed tokens)
- **NIP-57** -- Lightning Zaps (the Lightning-based alternative to nutzaps)
- **NIP-87** -- Ecash Mint Discoverability (finding mints to list in kind 10019)
- **NIP-75** -- Zap Goals (nutzaps could contribute to fundraising goals)
