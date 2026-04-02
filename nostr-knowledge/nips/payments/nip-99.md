# NIP-99: Classified Listings

## Status
Draft / Optional

## Summary
NIP-99 defines addressable events (kind 30402 for active listings, kind 30403 for drafts) for classified advertisements on Nostr. Listings describe products, services, jobs, rentals, or giveaways with structured metadata including title, price, location, and images. The format is intentionally lightweight -- it handles listing and discovery, but does not define a checkout or payment flow.

## Motivation
Nostr needed a simple, general-purpose listing format for selling goods and services without the full complexity of NIP-15's marketplace protocol. NIP-99 provides a minimal structure for classified ads -- think Craigslist on Nostr. Anyone can post a listing; anyone can discover it. Contact and payment happen out-of-band or via other NIPs (DMs, Lightning, etc.).

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 30402 | Classified Listing | Addressable (replaceable) | Active listing visible to buyers |
| 30403 | Draft Listing | Addressable (replaceable) | Draft or inactive listing (same structure as 30402) |

### Tags

| Tag | Required | Description | Format |
|-----|----------|-------------|--------|
| `d` | Yes | Unique listing identifier | String |
| `title` | Recommended | Listing title | `["title", "My Item"]` |
| `summary` | Optional | Brief tagline/description | `["summary", "Like new condition"]` |
| `published_at` | Recommended | Initial publication timestamp | `["published_at", "<unix-seconds-string>"]` |
| `location` | Optional | Geographic location text | `["location", "Austin, TX"]` |
| `price` | Recommended | Price with currency and optional frequency | `["price", "<amount>", "<ISO-4217>", "<frequency>"]` |
| `status` | Optional | Listing status | `["status", "active"]` or `["status", "sold"]` |
| `t` | Optional | Category/hashtag | `["t", "electronics"]` |
| `g` | Optional | Geohash for precise location | `["g", "u4pruydqqv"]` |
| `image` | Optional | Image URL(s) per NIP-58 | `["image", "https://..."]` (multiple allowed) |
| `e` | Optional | Reference to related events | Standard event reference |
| `a` | Optional | Reference to related addressable events | Standard address pointer |

**Price tag details:**
- Amount is a string number
- Currency is a 3-character ISO 4217 code (USD, EUR, BTC, SAT, etc.)
- Frequency is optional: `hour`, `day`, `week`, `month`, `year` (for recurring prices like rentals or services)

**Content field:** Markdown-formatted long description of the listing.

### Protocol Flow

```
Seller                      Nostr Relays              Buyer
  |                             |                       |
  | 1. Publish kind 30402       |                       |
  |    with title, price,       |                       |
  |    description, images      |                       |
  |---------------------------->|                       |
  |                             |                       |
  |                             | 2. Buyer searches     |
  |                             |    by tags (#t, #g,   |
  |                             |    price, location)   |
  |                             |<----------------------|
  |                             |                       |
  |                             | 3. Buyer views        |
  |                             |    listing details    |
  |                             |<----------------------|
  |                             |                       |
  | 4. Buyer contacts seller    |                       |
  |    via DM (NIP-04/NIP-44)   |                       |
  |    or other contact method  |                       |
  |<-----------------------------------------           |
  |                             |                       |
  | 5. Payment arranged         |                       |
  |    off-protocol (Lightning, |                       |
  |    cash, bank, etc.)        |                       |
  |                             |                       |
  | 6. Update listing:          |                       |
  |    status=sold or delete    |                       |
  |---------------------------->|                       |
```

### JSON Examples

**Basic Product Listing:**
```json
{
  "kind": 30402,
  "content": "# Bitcoin Hardware Wallet\n\nSlightly used Coldcard Mk4. Comes with original packaging and anti-tamper bag. Firmware updated to latest version.\n\nWill ship within 2 business days of payment.",
  "pubkey": "<seller-pubkey>",
  "created_at": 1700000000,
  "tags": [
    ["d", "coldcard-mk4-listing"],
    ["title", "Coldcard Mk4 Hardware Wallet"],
    ["summary", "Like-new Coldcard Mk4 with original packaging"],
    ["published_at", "1700000000"],
    ["location", "Austin, TX"],
    ["price", "150", "USD"],
    ["status", "active"],
    ["t", "hardware-wallet"],
    ["t", "bitcoin"],
    ["t", "electronics"],
    ["g", "9v6kn"],
    ["image", "https://example.com/coldcard-front.jpg"],
    ["image", "https://example.com/coldcard-back.jpg"]
  ]
}
```

**Service Listing with Recurring Price:**
```json
{
  "kind": 30402,
  "content": "# Nostr Relay Hosting\n\nManaged Nostr relay hosting on dedicated hardware. Includes:\n- Custom domain support\n- NIP-42 auth configuration\n- 99.9% uptime SLA\n- Daily backups\n\nPayment accepted via Lightning or on-chain Bitcoin.",
  "pubkey": "<seller-pubkey>",
  "created_at": 1700000000,
  "tags": [
    ["d", "relay-hosting-service"],
    ["title", "Managed Nostr Relay Hosting"],
    ["summary", "Dedicated relay hosting with custom domain"],
    ["published_at", "1700000000"],
    ["price", "15", "USD", "month"],
    ["status", "active"],
    ["t", "service"],
    ["t", "relay"],
    ["t", "hosting"]
  ]
}
```

**Job Listing:**
```json
{
  "kind": 30402,
  "content": "# Senior Rust Developer\n\nWe're building open-source Nostr infrastructure and need a senior Rust developer.\n\n## Requirements\n- 3+ years Rust experience\n- Familiarity with async networking (tokio)\n- Interest in decentralized protocols\n\n## Benefits\n- Fully remote\n- Bitcoin salary option\n- Open source work",
  "pubkey": "<company-pubkey>",
  "created_at": 1700000000,
  "tags": [
    ["d", "senior-rust-dev-2024"],
    ["title", "Senior Rust Developer - Nostr Infrastructure"],
    ["summary", "Remote Rust developer position for Nostr tools"],
    ["published_at", "1700000000"],
    ["location", "Remote"],
    ["price", "50000", "USD", "year"],
    ["status", "active"],
    ["t", "job"],
    ["t", "rust"],
    ["t", "developer"],
    ["t", "remote"]
  ]
}
```

**Draft Listing:**
```json
{
  "kind": 30403,
  "content": "Work in progress listing...",
  "pubkey": "<seller-pubkey>",
  "created_at": 1700000000,
  "tags": [
    ["d", "draft-item-001"],
    ["title", "Untitled Listing"],
    ["price", "0", "USD"],
    ["status", "draft"]
  ]
}
```

**Free/Giveaway Listing:**
```json
{
  "kind": 30402,
  "content": "Giving away my old Lightning node hardware. Raspberry Pi 4 with 1TB SSD. Was running Umbrel. Pick up only in NYC.",
  "pubkey": "<seller-pubkey>",
  "created_at": 1700000000,
  "tags": [
    ["d", "free-raspi-node"],
    ["title", "Free Lightning Node Hardware (Pi 4 + 1TB)"],
    ["published_at", "1700000000"],
    ["location", "New York, NY"],
    ["price", "0", "USD"],
    ["status", "active"],
    ["t", "giveaway"],
    ["t", "hardware"],
    ["t", "lightning"],
    ["g", "dr5reg"]
  ]
}
```

## Implementation Notes

- Kind 30402 and 30403 share identical structure. The only difference is visibility intent: 30402 is active/public, 30403 is draft/hidden. Clients should not display 30403 events in search results.
- There is no built-in payment or checkout flow. NIP-99 handles discovery only. Sellers can include payment instructions in the content body, use NIP-04/NIP-44 DMs for negotiation, or link to external payment systems.
- The `price` tag amount is a string, not a number. Clients must parse it.
- Multiple `image` tags create a carousel/gallery display.
- The `g` (geohash) tag enables proximity-based search, while `location` is human-readable text.
- The `published_at` tag records the original publication time, separate from `created_at` which updates on every edit.
- Sellers update listings by publishing a new event with the same `d` tag (standard addressable event replacement).

## Client Behavior

- Clients SHOULD support browsing listings by category (`#t`), location (`#g`), and price range.
- Clients SHOULD display listing images in a gallery/carousel format.
- Clients SHOULD show the `status` tag and distinguish active vs. sold items.
- Clients SHOULD NOT display kind 30403 (draft) events in public search results.
- Clients SHOULD provide a way for buyers to contact sellers (e.g., DM button).
- Clients MAY support price filtering and sorting.
- Clients MAY display frequency-based prices as recurring (e.g., "$15/month").

## Relay Behavior

- Relays MUST treat kinds 30402 and 30403 as addressable/parameterized replaceable events.
- No special relay behavior is required beyond standard event handling.

## Dependencies

- **NIP-01** -- Basic protocol, event structure, addressable events
- **NIP-58** -- Image tag format (for listing images)

## Source Code References

- **nostr-tools:** Standard event creation (no NIP-99-specific module needed)
- **Shopstr:** Nostr marketplace client supporting NIP-99 listings
- **Plebeian Market:** Marketplace supporting both NIP-15 and NIP-99

## Related NIPs

- **NIP-15** -- Nostr Marketplace (full e-commerce with stalls, products, checkout flow -- more complex than NIP-99)
- **NIP-23** -- Long-form Content (NIP-99 content field uses similar Markdown format)
- **NIP-57** -- Lightning Zaps (potential payment method for listings)
- **NIP-69** -- P2P Order Events (structured Bitcoin trading vs. general classifieds)
- **NIP-52** -- Calendar Events (related addressable event format)
