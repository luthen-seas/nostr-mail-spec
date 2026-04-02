# NIP-11: Relay Information Document

## Status
Active (draft, optional)

## Summary
NIP-11 defines a standard for relays to serve a JSON metadata document over HTTP at the same URI as their WebSocket endpoint. When a client sends an HTTP request with the `Accept: application/nostr+json` header to a relay's URL, the relay returns a JSON document describing its identity, capabilities, limitations, and fee structure. This is the foundational discovery mechanism for every NOSTR relay.

## Motivation
Clients need a way to discover what a relay supports before establishing a persistent WebSocket connection. Without a standard metadata endpoint, clients would have to guess relay capabilities, blindly send events that might be rejected, or rely on out-of-band information. NIP-11 solves this by providing a single, well-known HTTP endpoint that every relay can serve, enabling clients to make informed decisions about which relays to use, what limits to respect, and who to contact for administrative issues.

## Specification

### Event Kinds
NIP-11 does not define any event kinds. It operates over HTTP, not the NOSTR event system.

### Tags
NIP-11 does not define any tags. It is an HTTP-based protocol.

### Protocol Flow

1. Client constructs the relay's HTTP(S) URL from its WebSocket URL (e.g., `wss://relay.example.com` becomes `https://relay.example.com`).
2. Client sends an HTTP GET request with the header `Accept: application/nostr+json`.
3. Relay detects the Accept header and returns the JSON information document instead of upgrading to WebSocket.
4. Relay MUST include CORS headers: `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, and `Access-Control-Allow-Methods`.
5. Client parses the JSON, ignoring any fields it does not understand.
6. Client uses the information to configure its behavior (subscription limits, message sizes, supported NIPs, etc.).

### JSON Examples

#### Full Document Structure (All Fields)

```json
{
  "name": "<string identifying relay>",
  "description": "<string with detailed information>",
  "banner": "<URL to a banner image, e.g. .jpg or .png>",
  "icon": "<URL to an icon image, e.g. .jpg or .png>",
  "pubkey": "<32-byte hex secp256k1 public key of admin>",
  "self": "<32-byte hex public key of the relay itself>",
  "contact": "<URI for alternate contact, e.g. mailto: or https://>",
  "supported_nips": [1, 9, 11, 42, 45, 50],
  "software": "<URL to relay software project homepage>",
  "version": "<version string or commit identifier>",
  "terms_of_service": "<URL to a text file with ToS>"
}
```

#### Server Limitations Object

```json
{
  "limitation": {
    "max_message_length": 16384,
    "max_subscriptions": 300,
    "max_limit": 5000,
    "max_subid_length": 100,
    "max_event_tags": 100,
    "max_content_length": 8196,
    "min_pow_difficulty": 30,
    "auth_required": true,
    "payment_required": true,
    "restricted_writes": true,
    "created_at_lower_limit": 31536000,
    "created_at_upper_limit": 3,
    "default_limit": 500
  }
}
```

#### Pay-to-Relay Fee Schedule

```json
{
  "payments_url": "https://my-relay/payments",
  "fees": {
    "admission": [{ "amount": 1000000, "unit": "msats" }],
    "subscription": [{ "amount": 5000000, "unit": "msats", "period": 2592000 }],
    "publication": [{ "kinds": [4], "amount": 100, "unit": "msats" }]
  }
}
```

#### Real-World Example (nostr.wine)

```json
{
  "contact": "wino@nostr.wine",
  "description": "A paid nostr relay for wine enthusiasts and everyone else.",
  "fees": {
    "admission": [
      {
        "amount": 18888000,
        "unit": "msats"
      }
    ]
  },
  "icon": "https://image.nostr.build/30acdce4a81926f386622a07343228ae99fa68d012d54c538c0b2129dffe400c.png",
  "limitation": {
    "auth_required": false,
    "created_at_lower_limit": 94608000,
    "created_at_upper_limit": 300,
    "max_event_tags": 4000,
    "max_limit": 1000,
    "max_message_length": 524288,
    "max_subid_length": 71,
    "max_subscriptions": 50,
    "min_pow_difficulty": 0,
    "payment_required": true,
    "restricted_writes": true
  },
  "name": "nostr.wine",
  "payments_url": "https://nostr.wine/invoices",
  "pubkey": "4918eb332a41b71ba9a74b1dc64276cfff592e55107b93baae38af3520e55975",
  "software": "https://nostr.wine",
  "supported_nips": [1, 2, 4, 9, 11, 40, 42, 50, 70, 77],
  "terms_of_service": "https://nostr.wine/terms",
  "version": "0.3.3"
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable relay name. SHOULD be < 30 characters. |
| `description` | string | Detailed plain-text info. No markup. Use double newlines for paragraphs. |
| `banner` | string (URL) | Visual banner image for the relay (e.g., for relay detail views). |
| `icon` | string (URL) | Compact square icon for relay lists and small UI elements. |
| `pubkey` | string (hex) | 32-byte hex secp256k1 pubkey for the relay admin. Used for NIP-17 DMs. |
| `self` | string (hex) | 32-byte hex pubkey representing the relay's own identity. |
| `contact` | string (URI) | Alternate admin contact (mailto:, https:, etc.). |
| `supported_nips` | array of int | Integer NIP numbers the relay implements (e.g., `[1, 9, 11]`). |
| `software` | string (URL) | URL to the relay software's project homepage. |
| `version` | string | Software version or commit identifier. |
| `terms_of_service` | string (URL) | Link to a text file describing the relay's ToS. |

### Limitation Fields Reference

| Field | Type | Description |
|-------|------|-------------|
| `max_message_length` | int | Max bytes for incoming JSON (WebSocket frame size). Measured from `[` to `]` after UTF-8 serialization. |
| `max_subscriptions` | int | Max active subscriptions per WebSocket connection. |
| `max_subid_length` | int | Max string length of a subscription ID. |
| `max_limit` | int | Relay will clamp each filter's `limit` to this value. |
| `max_event_tags` | int | Max number of elements in any event's `tags` array. |
| `max_content_length` | int | Max unicode characters in any event's `content` field. |
| `min_pow_difficulty` | int | Minimum NIP-13 proof-of-work difficulty required. |
| `auth_required` | bool | NIP-42 auth required before any action on new connections. |
| `payment_required` | bool | Payment required before any action on new connections. |
| `restricted_writes` | bool | Some condition must be met to accept events (whitelist, specific kinds, etc.). |
| `created_at_lower_limit` | int | Events with `created_at` older than this many seconds ago are rejected. |
| `created_at_upper_limit` | int | Events with `created_at` more than this many seconds in the future are rejected. |
| `default_limit` | int | Max events returned when a filter has no `limit` specified. |

## Implementation Notes

- Any field in the document MAY be omitted by the relay.
- Clients MUST ignore fields they do not understand (forward compatibility).
- The `max_message_length` is measured in bytes after UTF-8 serialization, so multi-byte unicode characters count as 2-3 bytes. The `max_content_length` is measured in unicode characters.
- The `self` field (relay's own pubkey) is distinct from `pubkey` (admin's pubkey). The `self` key allows relays to sign events as themselves (used by NIP-43, NIP-66, etc.).
- `restricted_writes` should only be `true` when users are expected to know the policy before writing -- not for normal anti-spam heuristics.
- `created_at_lower_limit` and `created_at_upper_limit` are relative values (seconds from now), not absolute timestamps.
- The CORS requirement is critical -- without it, browser-based clients cannot fetch the document.
- Client-side NIPs SHOULD NOT appear in `supported_nips` (only relay-relevant NIPs belong there).

## Client Behavior

- Clients MUST send the `Accept: application/nostr+json` header to receive the information document.
- Clients MUST ignore unknown fields in the response.
- Clients SHOULD check `supported_nips` before using NIP-specific features (e.g., NIP-42 auth, NIP-45 COUNT, NIP-50 search).
- Clients SHOULD respect `max_message_length`, `max_subscriptions`, `max_event_tags`, and other limitation fields to avoid silent failures.
- Clients SHOULD use `max_limit` to determine if there are additional results when a query hits the limit.
- Clients MAY use the `pubkey` field to send NIP-17 encrypted DMs to relay admins for abuse reports or support requests.
- Clients MAY display `banner`, `icon`, `name`, and `description` in relay browser/management UIs.

## Relay Behavior

- Relays MUST accept CORS requests by including `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, and `Access-Control-Allow-Methods` response headers.
- Relays SHOULD return the document when they receive an HTTP request with `Accept: application/nostr+json` on their WebSocket URI.
- Relays MAY omit any field from the document.
- Relays MAY include additional custom fields beyond those specified.
- Relays SHOULD keep the `name` under 30 characters.
- Relays SHOULD ensure `software` is a URL to the project homepage, not an arbitrary string.

## Dependencies
- NIP-01 (basic protocol -- relay URL structure)
- NIP-13 (Proof of Work, referenced by `min_pow_difficulty`)
- NIP-17 (Private Direct Messages, referenced by `pubkey` contact field)
- NIP-42 (Authentication, referenced by `auth_required`)

## Source Code References

### strfry
- `src/RelayServer.cpp` -- serves the NIP-11 document on HTTP requests with the correct Accept header.
- Configuration in `strfry.conf` populates the NIP-11 fields.

### khatru
- `khatru.go` / `handlers.go` -- the `ServeHTTP` method checks for the `Accept: application/nostr+json` header and returns the relay info document.
- `RelayInfo` struct defines all NIP-11 fields.

### nostr-tools (JS)
- `nip11.ts` -- `fetchRelayInformation(url)` fetches and parses the NIP-11 document.

### rust-nostr
- `crates/nostr-relay-pool/src/relay/` -- relay info fetching and parsing.
- `RelayInformationDocument` struct in the nostr crate.

### go-nostr
- `nip11/nip11.go` -- `Fetch(url)` function and `RelayInformationDocument` struct.

## Related NIPs
- NIP-42 (Authentication) -- `auth_required` field
- NIP-13 (Proof of Work) -- `min_pow_difficulty` field
- NIP-43 (Relay Access Metadata) -- uses the `self` field from NIP-11
- NIP-66 (Relay Discovery) -- monitors read and re-publish NIP-11 data
- NIP-86 (Relay Management API) -- served on the same HTTP endpoint with a different Content-Type
