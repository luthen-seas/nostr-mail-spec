# Nostr Marketplace (NIP-15)

NIP-15 defines a decentralized marketplace protocol on Nostr where merchants list
products and buyers place orders via encrypted messages.

## How It Works

```
Buyer                        Relay                      Merchant
  |                            |                           |
  |                            |  1. Publish stall (30017) |
  |                            |<--------------------------|
  |                            |  2. Publish products      |
  |                            |     (30018)               |
  |                            |<--------------------------|
  |                            |                           |
  |  3. Browse stalls/products |                           |
  |--------------------------->|                           |
  |  Stall + product events    |                           |
  |<---------------------------|                           |
  |                            |                           |
  |  4. Place order (30019)    |                           |
  |     (encrypted to merchant)|                           |
  |--------------------------->|                           |
  |                            |  Merchant receives order  |
  |                            |-------------------------->|
  |                            |                           |
  |                            |  5. Payment request       |
  |                            |     (30019, encrypted)    |
  |                            |<--------------------------|
  |  Buyer receives invoice    |                           |
  |<---------------------------|                           |
  |                            |                           |
  |  6. Buyer pays Lightning   |                           |
  |     invoice                |                           |
  |                            |                           |
  |                            |  7. Order status updates  |
  |                            |     (30019, encrypted)    |
  |                            |<--------------------------|
  |  Buyer sees "paid/shipped" |                           |
  |<---------------------------|                           |
```

## Event Kinds

### Stall (Kind 30017) — Parameterized Replaceable

A merchant's shop. The `d` tag contains the stall ID, making it addressable as
`30017:<merchant-pubkey>:<stall-id>`.

```json
{
  "kind": 30017,
  "tags": [
    ["d", "my-stall-001"],
    ["t", "marketplace"]
  ],
  "content": "{\"id\":\"my-stall-001\",\"name\":\"My Shop\",\"description\":\"...\",\"currency\":\"sat\",\"shipping\":[{\"id\":\"ship-world\",\"name\":\"Worldwide\",\"cost\":5000}]}"
}
```

Stall content fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique stall ID (matches `d` tag) |
| `name` | string | Shop name |
| `description` | string | Shop description |
| `currency` | string | Price currency: `sat`, `USD`, `EUR`, etc. |
| `shipping` | array | Shipping zones with IDs, names, costs, and regions |

### Product (Kind 30018) — Parameterized Replaceable

A product listing. Addressable as `30018:<merchant-pubkey>:<product-id>`.

```json
{
  "kind": 30018,
  "tags": [
    ["d", "product-001"],
    ["t", "clothing"],
    ["t", "nostr"]
  ],
  "content": "{\"id\":\"product-001\",\"stall_id\":\"my-stall-001\",\"name\":\"Nostr T-Shirt\",\"price\":21000,\"currency\":\"sat\",\"quantity\":50,\"shipping\":[{\"id\":\"ship-world\",\"cost\":2000}]}"
}
```

Product content fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique product ID (matches `d` tag) |
| `stall_id` | string | Parent stall ID |
| `name` | string | Product name |
| `description` | string | Product description |
| `images` | string[] | Image URLs |
| `currency` | string | Price currency |
| `price` | number | Price in the specified currency |
| `quantity` | number | Available stock (0 = sold out) |
| `specs` | [string, string][] | Specifications (key-value pairs) |
| `shipping` | array | Per-product shipping costs by zone |
| `categories` | string[] | Product categories |

### Order / Messages (Kind 30019) — Encrypted DM

All order communication is NIP-44 encrypted between buyer and merchant.

**Type 0 — New Order (Buyer to Merchant):**

```json
{
  "id": "order-abc123",
  "type": 0,
  "name": "Buyer Name",
  "address": "123 Main St, City, Country",
  "message": "Please gift wrap!",
  "contact": {
    "nostr": "<buyer-pubkey>",
    "email": "buyer@example.com"
  },
  "items": [
    {"product_id": "product-001", "quantity": 2}
  ],
  "shipping_id": "ship-world"
}
```

**Type 1 — Payment Request (Merchant to Buyer):**

```json
{
  "id": "order-abc123",
  "type": 1,
  "message": "Total: 48,000 sats. Please pay within 24h.",
  "payment_options": [
    {"type": "ln", "link": "lnbc480u1..."},
    {"type": "btc", "link": "bc1q..."}
  ]
}
```

**Type 2 — Status Update (Merchant to Buyer):**

```json
{
  "id": "order-abc123",
  "type": 2,
  "message": "Shipped! Tracking: ABC123",
  "paid": true,
  "shipped": true
}
```

## Payment Methods

The `payment_options` array in a payment request supports:

| Type | Description |
|------|-------------|
| `ln` | Lightning Network (bolt11 invoice) |
| `btc` | On-chain Bitcoin (address) |
| `url` | External payment URL |

## Discovering Merchants

To browse the marketplace:

```
Filter: { kinds: [30017], limit: 50 }    — all stalls
Filter: { kinds: [30018], "#t": ["books"] } — products by category
Filter: { kinds: [30018], authors: ["<merchant-pubkey>"] } — merchant's products
```

## Privacy

- Product listings (kinds 30017, 30018) are public
- Orders (kind 30019) are NIP-44 encrypted — only buyer and merchant can read them
- Buyer's name, address, and contact info are kept private
- Payment is pseudonymous (Lightning invoices do not reveal identity)

## References

- [NIP-15: Nostr Marketplace](https://github.com/nostr-protocol/nips/blob/master/15.md)
- [NIP-44: Versioned Encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
