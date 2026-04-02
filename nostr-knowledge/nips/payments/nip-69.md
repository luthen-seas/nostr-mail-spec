# NIP-69: Peer-to-Peer Order Events

## Status
Draft / Optional

## Summary
NIP-69 defines a standardized event format (kind 38383) for peer-to-peer Bitcoin trading orders. It enables interoperability between P2P exchange platforms by creating a shared liquidity pool: orders published by one platform can be discovered and acted upon by users of another. Orders specify whether the maker wants to buy or sell Bitcoin, the fiat currency, payment methods, amount, premium, and network/layer details.

## Motivation
Peer-to-peer Bitcoin exchanges (Mostro, RoboSats, Peach, lnp2pBot) each have their own order formats and isolated user bases. NIP-69 creates a universal order format on Nostr so that all platforms share a common liquidity pool. A user on Mostro can see and respond to an order created on RoboSats, increasing market depth and reducing spreads for everyone.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 38383 | P2P Order | Addressable (replaceable) | A buy or sell order for Bitcoin |

### Tags

All tags use the format `["tag-name", "value"]`.

**Mandatory Tags:**

| Tag | Description | Values |
|-----|-------------|--------|
| `d` | Unique order ID | UUID or platform-specific identifier |
| `k` | Order type | `sell` or `buy` |
| `f` | Fiat currency | ISO 4217 code (e.g., `USD`, `EUR`, `VES`) |
| `s` | Order status | `pending`, `canceled`, `in-progress`, `success`, `expired` |
| `amt` | Bitcoin amount in sats | Integer; `0` = amount determined by API/market rate |
| `fa` | Fiat amount | Number or range (e.g., `100` or `100-500`) |
| `pm` | Payment method(s) | Free text (e.g., `PayPal`, `Bank Transfer`, `Revolut`) |
| `premium` | Premium percentage | e.g., `1` for 1% above market, `-2` for 2% below |
| `network` | Bitcoin network | `mainnet`, `testnet`, `signet` |
| `layer` | Settlement layer | `onchain`, `lightning`, `liquid` |
| `expires_at` | Order expiration | Unix timestamp (for event publication expiration) |
| `expiration` | Relay deletion | Unix timestamp per NIP-40 |
| `y` | Platform identifier | Platform name/ID (e.g., `mostro`, `robosats`) |
| `z` | Document type | `order` |

**Optional Tags:**

| Tag | Description |
|-----|-------------|
| `source` | URL redirecting to the order on the originating platform |
| `rating` | Maker's trading reputation data |
| `name` | Maker's display name |
| `g` | Geohash for location-based trades |
| `bond` | Required security deposit amount |

### Protocol Flow

#### Order Lifecycle

```
Maker                    Nostr Relays              Taker
  |                          |                       |
  | 1. Publish kind 38383    |                       |
  |    status=pending        |                       |
  |------------------------->|                       |
  |                          |                       |
  |                          | 2. Taker discovers    |
  |                          |    order via filter    |
  |                          |<----------------------|
  |                          |                       |
  |                          | 3. Taker contacts     |
  |                          |    maker (via platform |
  |                          |    or DM)             |
  |<-----------------------------------------        |
  |                          |                       |
  | 4. Update status to      |                       |
  |    in-progress           |                       |
  |------------------------->|                       |
  |                          |                       |
  |    [Trade execution happens off-protocol         |
  |     via the platform identified in "y" tag]      |
  |                          |                       |
  | 5. Update status to      |                       |
  |    success/canceled      |                       |
  |------------------------->|                       |
```

#### Discovery Filters

Clients can discover orders using standard NIP-01 filters:

```json
// All pending sell orders for USD via Lightning
{
  "kinds": [38383],
  "#s": ["pending"],
  "#k": ["sell"],
  "#f": ["USD"],
  "#layer": ["lightning"]
}

// All orders from a specific platform
{
  "kinds": [38383],
  "#y": ["mostro"]
}

// Orders in a geographic area
{
  "kinds": [38383],
  "#g": ["u4pru"]
}
```

### JSON Examples

**Sell Order:**
```json
{
  "kind": 38383,
  "pubkey": "<maker-pubkey>",
  "content": "",
  "tags": [
    ["d", "order-uuid-abc123"],
    ["k", "sell"],
    ["f", "USD"],
    ["s", "pending"],
    ["amt", "100000"],
    ["fa", "50"],
    ["pm", "PayPal"],
    ["pm", "Zelle"],
    ["premium", "3"],
    ["network", "mainnet"],
    ["layer", "lightning"],
    ["expires_at", "1700100000"],
    ["expiration", "1700100000"],
    ["y", "mostro"],
    ["z", "order"],
    ["source", "https://mostro.app/order/abc123"],
    ["name", "SatoshiTrader"],
    ["rating", "{\"total_reviews\":42,\"avg_rating\":4.8}"],
    ["bond", "5000"]
  ],
  "created_at": 1700000000
}
```

**Buy Order (market-rate amount):**
```json
{
  "kind": 38383,
  "pubkey": "<maker-pubkey>",
  "content": "",
  "tags": [
    ["d", "order-uuid-def456"],
    ["k", "buy"],
    ["f", "EUR"],
    ["s", "pending"],
    ["amt", "0"],
    ["fa", "100-500"],
    ["pm", "SEPA Transfer"],
    ["premium", "-1"],
    ["network", "mainnet"],
    ["layer", "onchain"],
    ["expires_at", "1700200000"],
    ["expiration", "1700200000"],
    ["y", "robosats"],
    ["z", "order"]
  ],
  "created_at": 1700000000
}
```

## Implementation Notes

- When `amt` is `0`, the Bitcoin amount is determined dynamically based on the fiat amount and current market rate at trade time.
- The `fa` tag can be a single value (`"100"`) or a range (`"100-500"`) for flexible orders.
- Multiple `pm` tags can list several accepted payment methods.
- The `premium` is a percentage above/below market price (positive = above, negative = below).
- Trade execution (escrow, dispute resolution, fiat payment confirmation) happens off-protocol, managed by the platform identified in the `y` tag. NIP-69 only standardizes order discovery.
- The `source` tag provides a direct link back to the platform for taking the order.
- The `bond` tag represents a security deposit (in sats) the taker must put up, enforced by the platform.
- The `g` (geohash) tag enables location-based filtering for in-person trades.

## Client Behavior

- Clients SHOULD display orders with human-readable formatting of payment methods, amounts, and premiums.
- Clients SHOULD allow filtering by currency, payment method, network, layer, and location.
- Clients SHOULD redirect users to the originating platform (via `source` tag) to execute trades.
- Clients MAY aggregate orders from multiple platforms for a unified order book view.
- Clients SHOULD validate that the `z` tag equals `"order"` to distinguish from potential future document types.

## Relay Behavior

- Relays MUST treat kind 38383 as an addressable/parameterized replaceable event (keyed on `pubkey` + `d` tag).
- Relays SHOULD support NIP-40 expiration for automatic cleanup of expired orders.
- No special relay behavior is required beyond standard event handling.

## Dependencies

- **NIP-01** -- Basic protocol, event structure, addressable events
- **NIP-40** -- Expiration tag (for relay-side order cleanup)

## Source Code References

- **Mostro:** Reference P2P exchange implementation using NIP-69
- **lnp2pBot:** Telegram-based P2P bot publishing NIP-69 events
- **RoboSats:** P2P exchange with NIP-69 order publication
- **Peach Bitcoin:** Mobile P2P exchange

## Related NIPs

- **NIP-15** -- Nostr Marketplace (fixed-price product sales vs. P2P trading)
- **NIP-99** -- Classified Listings (general listings vs. structured trading orders)
- **NIP-47** -- Nostr Wallet Connect (could facilitate Lightning settlement)
- **NIP-57** -- Lightning Zaps (payment layer used in Lightning-settled trades)
