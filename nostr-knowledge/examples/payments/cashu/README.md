# Cashu / Ecash on Nostr (NIP-60, NIP-61, NIP-87)

Cashu is a Chaumian ecash protocol. These NIPs define how to store a Cashu wallet
on Nostr relays and send ecash tokens ("nutzaps") to other users.

## Overview

```
Alice                      Cashu Mint                  Nostr Relay              Bob
  |                            |                           |                     |
  |  1. Mint tokens            |                           |                     |
  |  (pay Lightning invoice)   |                           |                     |
  |--------------------------->|                           |                     |
  |  Proofs (id, amount, C)    |                           |                     |
  |<---------------------------|                           |                     |
  |                            |                           |                     |
  |  2. Store proofs (kind 7375, encrypted)                |                     |
  |------------------------------------------------------->|                     |
  |                            |                           |                     |
  |  3. Swap for P2PK-locked proofs (locked to Bob)        |                     |
  |--------------------------->|                           |                     |
  |  P2PK proofs               |                           |                     |
  |<---------------------------|                           |                     |
  |                            |                           |                     |
  |  4. Publish nutzap (kind 9321) with P2PK proofs        |                     |
  |------------------------------------------------------->|                     |
  |                            |                           |  5. Bob sees nutzap |
  |                            |                           |-------------------->|
  |                            |                           |                     |
  |                            |  6. Bob redeems P2PK proofs at mint             |
  |                            |<-------------------------------------------------|
  |                            |  Fresh proofs             |                     |
  |                            |------------------------------------------------->|
  |                            |                           |                     |
  |                            |                           |  7. Bob stores new  |
  |                            |                           |     proofs (7375)   |
  |                            |                           |<--------------------|
```

## NIP-60: Cashu Wallet on Nostr

### Wallet Event (Kind 17375) — Replaceable

Stores wallet metadata. Content is NIP-44 encrypted to yourself.

```json
{
  "kind": 17375,
  "tags": [
    ["d", "default"],
    ["name", "My Wallet"],
    ["unit", "sat"],
    ["mint", "https://mint.example.com"],
    ["relay", "wss://relay.example.com"]
  ],
  "content": "<NIP-44 encrypted wallet metadata>"
}
```

### Token Proofs (Kind 7375)

Stores Cashu token proofs. Content is NIP-44 encrypted to yourself.

```json
{
  "kind": 7375,
  "tags": [
    ["a", "17375:<your-pubkey>:default"]
  ],
  "content": "<NIP-44 encrypted: { mint, proofs: [{id, amount, secret, C}] }>"
}
```

Encrypted content structure:

```json
{
  "mint": "https://mint.example.com",
  "proofs": [
    {
      "id": "009a1f293253e41e",
      "amount": 8,
      "secret": "407915bc...",
      "C": "02bc9097..."
    }
  ]
}
```

### Spending History (Kind 7376)

Records transactions. Content is NIP-44 encrypted.

```json
{
  "kind": 7376,
  "tags": [
    ["a", "17375:<your-pubkey>:default"],
    ["e", "<created-token-event-id>", "", "created"],
    ["e", "<destroyed-token-event-id>", "", "destroyed"]
  ],
  "content": "<NIP-44 encrypted: { direction, amount, mint, memo }>"
}
```

## NIP-61: Nutzaps

Nutzaps are Cashu ecash sent as Nostr events. Unlike Lightning zaps, nutzaps carry
the actual ecash tokens — no Lightning payment is needed at send time.

### Nutzap Event (Kind 9321)

```json
{
  "kind": 9321,
  "content": "Great post!",
  "tags": [
    ["amount", "21"],
    ["unit", "sat"],
    ["u", "https://mint.example.com"],
    ["p", "<recipient-pubkey>"],
    ["e", "<event-id>"],
    ["proof", "{\"id\":\"...\",\"amount\":8,\"secret\":\"...\",\"C\":\"...\"}"],
    ["proof", "{\"id\":\"...\",\"amount\":2,\"secret\":\"...\",\"C\":\"...\"}"]
  ]
}
```

### P2PK Locking

Nutzap proofs are P2PK-locked to the recipient's pubkey, meaning only the
recipient can redeem them. The proof's `secret` field encodes:

```json
["P2PK", {"nonce": "<random>", "data": "02<recipient-nostr-pubkey>"}]
```

To redeem:
1. Extract proofs from the nutzap event
2. Sign a redemption message with your Nostr key
3. Send proofs + signature to the mint's `/v1/swap` endpoint
4. Receive fresh unlocked proofs

## NIP-87: Mint Discovery

Mint operators and users publish kind 38172 events to advertise and recommend mints.

### Mint Recommendation (Kind 38172) — Addressable

```json
{
  "kind": 38172,
  "tags": [
    ["d", "https://mint.example.com"],
    ["u", "https://mint.example.com"],
    ["n", "Example Mint"],
    ["desc", "A reliable Cashu mint backed by Lightning"],
    ["unit", "sat"],
    ["contact", "nostr", "npub1..."],
    ["contact", "email", "admin@example.com"]
  ],
  "content": ""
}
```

## Cashu Token Structure

A Cashu proof is the fundamental unit of ecash:

| Field | Description |
|-------|-------------|
| `id` | Keyset ID — identifies which mint keys signed this proof |
| `amount` | Denomination in the unit (sats). Uses powers of 2: 1, 2, 4, 8, 16, ... |
| `secret` | The blinding factor / spending secret |
| `C` | The blind signature from the mint (elliptic curve point) |

Denominations use powers of 2, so a 21-sat token would be composed of
three proofs: 16 + 4 + 1 = 21 sats.

## Security Considerations

- **Wallet encryption**: All wallet data (kinds 7375, 7376) is NIP-44 encrypted to yourself
- **P2PK locking**: Nutzap proofs are locked to the recipient so only they can redeem
- **Mint trust**: You must trust the mint to honor token redemption (custodial risk)
- **Double-spend**: The mint prevents double-spending; first to redeem wins
- **Privacy**: Cashu provides strong sender privacy (the mint cannot link minting to spending)

## References

- [NIP-60: Cashu Wallet](https://github.com/nostr-protocol/nips/blob/master/60.md)
- [NIP-61: Nutzaps](https://github.com/nostr-protocol/nips/blob/master/61.md)
- [NIP-87: Mint Discovery](https://github.com/nostr-protocol/nips/blob/master/87.md)
- [Cashu Protocol](https://cashu.space)
- [Cashu NUTs (specs)](https://github.com/cashubtc/nuts)
