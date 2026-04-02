# NIP-15: Nostr Marketplace

## Status
Draft / Optional

## Summary
NIP-15 defines a decentralized marketplace protocol for Nostr, enabling merchants to publish stalls and products, customers to place orders via encrypted direct messages, and an auction system for bidding on items. Based on the Diagon-Alley protocol, it provides a complete e-commerce flow from product listing through checkout and payment.

## Motivation
Existing e-commerce platforms are centralized, censorable, and extract fees. NIP-15 creates a permissionless marketplace where merchants can list products and accept payments (including Bitcoin/Lightning) without intermediaries. Marketplace clients simply aggregate and display merchant data -- they never custody funds or control listings.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 30017 | Stall | Addressable (replaceable) | Create or update a merchant stall |
| 30018 | Product | Addressable (replaceable) | Create or update a product listing |
| 30019 | Marketplace UI | Addressable (replaceable) | Marketplace client customization event |
| 30020 | Auction Product | Addressable (replaceable) | Product listed for auction |
| 1021 | Bid | Regular | A customer bid on an auction |
| 1022 | Bid Confirmation | Regular | Merchant confirmation/rejection of a bid |

Merchants also use:
- Kind 0 (`set_meta`) for merchant profile/description
- Kind 4 (NIP-04 encrypted DM) for order communication
- Kind 5 (NIP-09 delete) to remove products or stalls

### Tags

**Stall (kind 30017):**
- `d` -- stall ID (MUST match the `id` field in content)

**Product (kind 30018):**
- `d` -- product ID (MUST match the `id` field in content)
- `t` -- searchable category/hashtag tags (zero or more)

**Auction Product (kind 30020):**
- `d` -- product ID
- `t` -- category tags

**Bid (kind 1021):**
- `e` -- event ID of the auction product being bid on

**Bid Confirmation (kind 1022):**
- `e` -- event ID of the bid being confirmed/rejected

### Protocol Flow

#### Stall and Product Creation

1. **Merchant creates a stall** (kind 30017) with name, description, currency, and shipping zones.
2. **Merchant creates products** (kind 30018) referencing the stall by `stall_id`.
3. **Marketplace clients** discover stalls/products by subscribing to kinds 30017 and 30018.

#### Checkout Flow

```
Customer                    Merchant
   |                           |
   |  1. Order (type 0, DM)   |
   |-------------------------->|
   |                           |
   |  2. Payment Req (type 1)  |
   |<--------------------------|
   |                           |
   |  3. [Pay via LN/BTC/URL]  |
   |---------(off-chain)------>|
   |                           |
   |  4. Status Update (type 2)|
   |<--------------------------|
```

**Step 1 -- Customer Order (DM type 0):**
Customer sends a NIP-04 encrypted DM containing:
- Order ID
- Customer name, address, message (optional)
- Contact info: Nostr pubkey (required), phone/email (optional)
- Items array: product ID + quantity for each item
- Shipping zone ID

**Step 2 -- Payment Request (DM type 1):**
Merchant responds with:
- Order ID
- Optional message
- Payment options array, each with a `type` field:
  - `url` -- payment page link
  - `btc` -- on-chain Bitcoin address
  - `ln` -- Lightning BOLT11 invoice
  - `lnurl` -- LNURL-pay endpoint

**Step 3 -- Customer Pays:**
Customer pays using one of the provided payment methods (off-protocol).

**Step 4 -- Order Status (DM type 2):**
Merchant sends status updates:
- Payment confirmed
- Shipped status
- Optional tracking/message

#### Auction Flow

```
Merchant                 Customer                  Merchant
   |                        |                         |
   | 1. Publish Auction     |                         |
   |  (kind 30020)          |                         |
   |----------------------->|                         |
   |                        |                         |
   |                        | 2. Place Bid (kind 1021)|
   |                        |------------------------>|
   |                        |                         |
   |                        | 3. Bid Confirmation     |
   |                        |    (kind 1022)          |
   |                        |<------------------------|
   |                        |                         |
   |                   [Auction ends at                |
   |                    start_date + duration          |
   |                    + sum(extensions)]             |
```

1. Merchant publishes a kind 30020 event with starting bid, optional start date, and duration (seconds).
2. Customers publish kind 1021 bid events with the bid amount in sats in `.content`, tagging the auction event.
3. Merchant publishes kind 1022 confirmations with status: `accepted`, `rejected`, `pending`, or `winner`.
4. Auction end time = `start_date` + `duration` + sum of all `duration_extension` values from bid confirmations.

**Critical rule:** Auctions CANNOT be edited after receiving the first bid.

### JSON Examples

**Stall Event (kind 30017):**
```json
{
  "kind": 30017,
  "content": "{\"id\":\"stall-abc123\",\"name\":\"Bob's Bitcoin Shop\",\"description\":\"Quality BTC merch\",\"currency\":\"USD\",\"shipping\":[{\"id\":\"zone-us\",\"name\":\"US Shipping\",\"cost\":5.00,\"regions\":[\"US\"]},{\"id\":\"zone-intl\",\"name\":\"International\",\"cost\":15.00,\"regions\":[\"Worldwide\"]}]}",
  "tags": [
    ["d", "stall-abc123"]
  ]
}
```

**Product Event (kind 30018):**
```json
{
  "kind": 30018,
  "content": "{\"id\":\"prod-001\",\"stall_id\":\"stall-abc123\",\"name\":\"Bitcoin Hardware Wallet\",\"description\":\"Cold storage device\",\"images\":[\"https://example.com/wallet.jpg\"],\"currency\":\"USD\",\"price\":49.99,\"quantity\":100,\"specs\":[[\"color\",\"black\"],[\"weight\",\"50g\"]],\"shipping\":[{\"id\":\"zone-us\",\"cost\":2.00}]}",
  "tags": [
    ["d", "prod-001"],
    ["t", "hardware-wallet"],
    ["t", "bitcoin"]
  ]
}
```

**Customer Order (NIP-04 DM content):**
```json
{
  "type": 0,
  "id": "order-789",
  "name": "Alice",
  "address": "123 Main St, Anytown, US",
  "message": "Please ship ASAP",
  "contact": {
    "nostr": "abc123pubkey...",
    "email": "alice@example.com"
  },
  "items": [
    {"product_id": "prod-001", "quantity": 1}
  ],
  "shipping_id": "zone-us"
}
```

**Payment Request (NIP-04 DM content):**
```json
{
  "type": 1,
  "id": "order-789",
  "message": "Your total is $51.99",
  "payment_options": [
    {"type": "ln", "link": "lnbc51990n1..."},
    {"type": "btc", "link": "bc1q..."},
    {"type": "lnurl", "link": "lnurl1..."}
  ]
}
```

**Order Status Update (NIP-04 DM content):**
```json
{
  "type": 2,
  "id": "order-789",
  "message": "Payment received! Shipping tomorrow.",
  "paid": true,
  "shipped": false
}
```

**Auction Product (kind 30020):**
```json
{
  "kind": 30020,
  "content": "{\"id\":\"auction-001\",\"stall_id\":\"stall-abc123\",\"name\":\"Rare Satoshi\",\"description\":\"Vintage sat from block 1\",\"images\":[\"https://example.com/sat.jpg\"],\"currency\":\"sat\",\"price\":0,\"quantity\":1,\"specs\":[],\"starting_bid\":1000,\"start_date\":1700000000,\"duration\":86400}",
  "tags": [
    ["d", "auction-001"]
  ]
}
```

**Bid (kind 1021):**
```json
{
  "kind": 1021,
  "content": "5000",
  "tags": [
    ["e", "<auction-event-id>"]
  ]
}
```

**Bid Confirmation (kind 1022):**
```json
{
  "kind": 1022,
  "content": "{\"status\":\"accepted\",\"message\":\"You are the highest bidder!\",\"duration_extension\":600}",
  "tags": [
    ["e", "<bid-event-id>"]
  ]
}
```

## Implementation Notes

- All order communication uses NIP-04 encrypted DMs between customer and merchant pubkeys.
- Product `quantity` can be `null` for digital/unlimited items.
- Stall `currency` defines the base currency; products inherit it but can override via shipping cost overrides.
- Marketplace clients (kind 30019) are purely cosmetic configuration events -- they list which merchants to display, UI themes, etc.
- There is no on-chain escrow or dispute resolution in this spec. Trust is between buyer and seller.
- Shipping zones use region strings (not standardized -- could be country codes, "Worldwide", etc.).
- The `specs` array on products is an array of `[key, value]` pairs for arbitrary attributes.

## Client Behavior

- Clients MUST support NIP-04 encryption for order communication.
- Clients SHOULD display stalls and products from kind 30017/30018 events.
- Clients SHOULD validate that bid confirmation signatures match the merchant pubkey of the auction stall.
- Clients MAY aggregate multiple stalls into a unified marketplace UI (kind 30019).
- Clients SHOULD display auction end times accounting for all duration extensions.

## Relay Behavior

- Relays MUST treat kinds 30017, 30018, 30019, 30020 as addressable/replaceable events (per NIP-01 parameterized replaceable event rules).
- No special relay behavior is required beyond standard event handling.

## Dependencies

- **NIP-01** -- Basic protocol, event structure, addressable events
- **NIP-04** -- Encrypted direct messages (for order flow)
- **NIP-09** -- Event deletion (for removing stalls/products)

## Source Code References

- **nostr-tools:** `nip15.ts` -- marketplace event helpers (if present)
- **NostrMarket:** Reference implementation (Python) -- `models.py` for data structures
- **Plebeian Market:** Alternative marketplace implementation

## Related NIPs

- **NIP-99** -- Classified Listings (simpler listing format, no checkout flow)
- **NIP-57** -- Lightning Zaps (payment mechanism usable with marketplace)
- **NIP-47** -- Nostr Wallet Connect (can automate Lightning payments in checkout)
- **NIP-69** -- Peer-to-peer Order Events (alternative P2P trading format)
