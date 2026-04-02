# NIP-01: Basic Protocol Flow Description

## Status
Active (draft, mandatory)

## Summary
NIP-01 defines the foundational Nostr protocol: the event data structure, cryptographic signing with Schnorr signatures on secp256k1, client-relay WebSocket communication, subscription/filter mechanics, and the kind system that categorizes events. Every Nostr implementation MUST support NIP-01 as it is the mandatory base layer upon which all other NIPs build.

## Motivation
Nostr needed a simple, censorship-resistant protocol for global decentralized communication. NIP-01 establishes the minimum viable protocol: a way to create signed events, publish them to relays, and query/subscribe to events from relays. By using simple JSON over WebSockets with Schnorr signatures, the protocol remains easy to implement while providing cryptographic identity and message integrity.

## Specification

### Event Structure

Every Nostr event is a JSON object with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | 32-byte lowercase hex SHA-256 hash of the serialized event |
| `pubkey` | string | 32-byte lowercase hex public key of the event creator |
| `created_at` | integer | Unix timestamp in seconds |
| `kind` | integer | Integer between 0 and 65535 |
| `tags` | array | Array of arrays of non-null strings |
| `content` | string | Arbitrary string |
| `sig` | string | 64-byte lowercase hex Schnorr signature of the `id` |

### Event ID Computation

The `id` is the SHA-256 hash of the following UTF-8 JSON-serialized array (no whitespace):

```json
[
  0,
  <pubkey, as a lowercase hex string>,
  <created_at, as a number>,
  <kind, as a number>,
  <tags, as an array of arrays of non-null strings>,
  <content, as a string>
]
```

**Serialization rules for consistent event IDs:**
- UTF-8 encoding required
- No unnecessary whitespace, line breaks, or formatting
- Mandatory character escaping in strings:
  - `0x0A` (line break) -> `\n`
  - `0x22` (double quote) -> `\"`
  - `0x5C` (backslash) -> `\\`
  - `0x0D` (carriage return) -> `\r`
  - `0x09` (tab) -> `\t`
  - `0x08` (backspace) -> `\b`
  - `0x0C` (form feed) -> `\f`
- All other characters included verbatim (including raw Unicode)

### Event Kinds

**Kind 0: User Metadata**
- `content` is a stringified JSON object: `{"name": <string>, "about": <string>, "picture": <url string>}`
- Extra fields may be added per NIP-24
- This is a replaceable event: relays keep only the latest per pubkey

**Kind Ranges and Categories:**

| Range | Category | Behavior |
|-------|----------|----------|
| `1000 <= n < 10000` OR `4 <= n < 45` OR `n == 1` OR `n == 2` | Regular | All events stored by relays |
| `10000 <= n < 20000` OR `n == 0` OR `n == 3` | Replaceable | Only latest per pubkey+kind stored |
| `20000 <= n < 30000` | Ephemeral | Not expected to be stored |
| `30000 <= n < 40000` | Addressable | Latest per pubkey+kind+d-tag stored |

**Replaceable event tie-breaking:** When two replaceable events have the same `created_at`, retain the one with the lexically lowest `id`; discard others.

### Tags

Tags are arrays of strings. The first element is the tag name/key, the second is the tag value.

**Standard tags (apply to all event kinds):**

#### `e` tag (event reference)
```json
["e", "<32-bytes lowercase hex event id>", "<recommended relay URL (optional)>", "<32-bytes lowercase hex author pubkey (optional)>"]
```

#### `p` tag (pubkey/user reference)
```json
["p", "<32-bytes lowercase hex pubkey>", "<recommended relay URL (optional)>"]
```

#### `a` tag (replaceable/addressable event reference)
For addressable events:
```json
["a", "<kind>:<32-bytes lowercase hex pubkey>:<d tag value>", "<recommended relay URL (optional)>"]
```
For replaceable events:
```json
["a", "<kind>:<32-bytes lowercase hex pubkey>:", "<recommended relay URL (optional)>"]
```

**Tag indexing:** All single-letter tags (a-z, A-Z) are indexed by relays. Only the first value (second element) of each tag is indexed.

### JSON Examples

**Complete event object:**
```json
{
  "id": "4376c65d2f232afbe9b882a35baa4f6fe8667c4e684749af565f981833ed6a65",
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
  "created_at": 1673347337,
  "kind": 1,
  "tags": [
    ["e", "3da979448d9ba263864c4d6f14984c423a3838364ec255f03c7904b1ae77f206"],
    ["p", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"]
  ],
  "content": "Walled gardens became prisons, and nostr is the first step towards tearing down the walls.",
  "sig": "908a15e46fb4d8675bab026fc230a0e3542bfade63da02d542fb78b2a8513fcd0092619a2c8c1221e581946e0191f2af505dfdf8657a414dbca329186f009262"
}
```

**Kind 0 metadata event:**
```json
{
  "id": "abc123...",
  "pubkey": "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e",
  "created_at": 1680000000,
  "kind": 0,
  "tags": [],
  "content": "{\"name\":\"bob\",\"about\":\"i am bob\",\"picture\":\"https://example.com/bob.png\"}",
  "sig": "def456..."
}
```

**Event with multiple tag types:**
```json
{
  "tags": [
    ["e", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://nostr.example.com"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["a", "30023:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:abcd", "wss://nostr.example.com"],
    ["alt", "reply"]
  ]
}
```

### Protocol Flow

#### Client-to-Relay Messages

Clients connect via WebSocket and send three message types:

**1. EVENT -- Publish an event:**
```json
["EVENT", <event JSON as defined above>]
```

**2. REQ -- Request events / subscribe:**
```json
["REQ", <subscription_id>, <filter1>, <filter2>, ...]
```

**3. CLOSE -- End a subscription:**
```json
["CLOSE", <subscription_id>]
```

- `subscription_id`: arbitrary, non-empty string, max 64 characters
- Subscriptions are per-connection; relays manage each WebSocket independently
- A new `REQ` with an existing `subscription_id` replaces the previous subscription

#### Filter Object

```json
{
  "ids": ["<hex event id>", ...],
  "authors": ["<hex pubkey>", ...],
  "kinds": [<integer>, ...],
  "#<single-letter>": ["<tag value>", ...],
  "since": <unix timestamp>,
  "until": <unix timestamp>,
  "limit": <integer>
}
```

**Filter matching rules:**
- Array fields (`ids`, `authors`, `kinds`, tag filters): event must match at least one value in each specified array (AND across fields, OR within a field)
- `since` and `until`: `since <= created_at <= until`
- `limit`: applies only to initial query (not live subscription); returns the last `n` events by `created_at` descending; ties broken by lowest `id`
- `ids`, `authors`, `#e`, `#p` filter lists MUST contain exact 64-character lowercase hex values
- Multiple filters in one `REQ` are OR'd together: event matches if it passes ANY filter

**Example REQ with filter:**
```json
["REQ", "my-sub-1", {"kinds": [1], "authors": ["6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"], "limit": 10}]
```

**Example REQ with multiple filters (OR logic):**
```json
["REQ", "my-sub-2", {"kinds": [0], "authors": ["abc123..."]}, {"kinds": [1], "#p": ["abc123..."]}]
```

#### Relay-to-Client Messages

**1. EVENT -- Send matching events:**
```json
["EVENT", <subscription_id>, <event JSON>]
```

**2. OK -- Accept/reject a published event:**
```json
["OK", <event_id>, <true|false>, <message>]
```

**3. EOSE -- End of stored events (live events follow):**
```json
["EOSE", <subscription_id>]
```

**4. CLOSED -- Relay-side subscription termination:**
```json
["CLOSED", <subscription_id>, <message>]
```

**5. NOTICE -- Human-readable relay message:**
```json
["NOTICE", <message>]
```

### OK Message Format

The fourth element of OK is a message string:
- On success (`true`): empty string OR `"prefix: message"`
- On failure (`false`): MUST be `"prefix: human-readable message"`

**Standardized machine-readable prefixes:**
- `duplicate` -- relay already has this event
- `pow` -- proof-of-work related
- `blocked` -- event/author blocked by policy
- `rate-limited` -- too many events
- `invalid` -- event failed validation
- `restricted` -- not authorized to write
- `error` -- generic server error
- `mute` -- event was ignored (e.g., ephemeral with no listeners)

**OK examples:**
```json
["OK", "b1a649ebe8...", true, ""]
["OK", "b1a649ebe8...", true, "pow: difficulty 25>=24"]
["OK", "b1a649ebe8...", true, "duplicate: already have this event"]
["OK", "b1a649ebe8...", false, "blocked: you are banned from posting here"]
["OK", "b1a649ebe8...", false, "blocked: please register your pubkey at https://my-expensive-relay.example.com"]
["OK", "b1a649ebe8...", false, "rate-limited: slow down there chief"]
["OK", "b1a649ebe8...", false, "invalid: event creation date is too far off from the current time"]
["OK", "b1a649ebe8...", false, "pow: difficulty 26 is less than 30"]
["OK", "b1a649ebe8...", false, "restricted: not allowed to write."]
["OK", "b1a649ebe8...", false, "error: could not connect to the database"]
["OK", "b1a649ebe8...", false, "mute: no one was listening to your ephemeral event and it wasn't handled in any way, it was ignored"]
```

### CLOSED Message Format

Same pattern as OK:
```json
["CLOSED", "sub1", "unsupported: filter contains unknown elements"]
["CLOSED", "sub1", "error: could not connect to the database"]
["CLOSED", "sub1", "error: shutting down idle subscription"]
```

## Implementation Notes

1. **Event ID determinism:** The serialization for computing `id` MUST be exactly reproducible. Any deviation in escaping, whitespace, or field ordering will produce a different hash and an invalid event.

2. **Signature verification:** Clients MUST verify Schnorr signatures on secp256k1 before trusting any event. The signature is over the `id` (which is the SHA-256 of the canonical serialization).

3. **Subscription ID scope:** Subscription IDs are scoped to the WebSocket connection. Two different clients can use the same subscription ID string without conflict.

4. **Replaceable event races:** When two replaceable events arrive with the same `created_at`, the one with the lexically lower `id` wins. Implementations must handle this consistently.

5. **Filter `limit` behavior:** `limit` is a hint for the initial query batch. Relays may return fewer results. After EOSE, new matching events stream without limit.

6. **Hex string validation:** All hex strings in events and filters (`id`, `pubkey`, `sig`, tag values for `e`/`p`) must be lowercase. Mixed-case or uppercase hex is invalid.

7. **Tag indexing:** Only single-letter tags are indexed. Only the second element (index 1) of the tag array is used for filter matching.

8. **WebSocket connection reuse:** Clients SHOULD open only one WebSocket connection per relay and multiplex all subscriptions over it.

## Client Behavior

- Clients MUST serialize events exactly per the spec to compute valid `id` values
- Clients MUST sign events with Schnorr signatures on secp256k1
- Clients MUST verify event signatures before displaying content
- Clients SHOULD maintain a single WebSocket connection per relay
- Clients SHOULD handle `EOSE` to distinguish between stored and live events
- Clients SHOULD handle `OK` responses to detect publication failures
- Clients SHOULD handle `CLOSED` messages and potentially resubscribe
- Clients MAY display `NOTICE` messages to users
- Clients SHOULD use `limit` in filters to avoid overwhelming relays

## Relay Behavior

- Relays MUST validate event `id` (recompute the hash and compare)
- Relays MUST validate event `sig` (verify the Schnorr signature against `pubkey`)
- Relays MUST send `OK` in response to every `EVENT` message from clients
- Relays MUST send `EVENT` messages only for subscription IDs established by the client
- Relays MUST send `EOSE` after returning all stored events matching a subscription
- Relays SHOULD store regular events and return them in response to matching queries
- Relays SHOULD keep only the latest replaceable event per pubkey+kind
- Relays SHOULD keep only the latest addressable event per pubkey+kind+d-tag
- Relays SHOULD NOT store ephemeral events (kind 20000-29999)
- Relays SHOULD respect `limit` in filters (return approximately that many, not vastly more)
- Relays MAY limit connections, subscriptions, event sizes, or apply other restrictions
- Relays MAY send `CLOSED` when refusing to fulfill a subscription
- Relays MAY send `NOTICE` for general human-readable information

## Dependencies
None (this is the base protocol).

## Source Code References

- **nostr-tools (JS):** `nip01.ts`, `event.ts`, `filter.ts`, `relay.ts`, `pool.ts`
- **rust-nostr:** `nostr/src/event/`, `nostr/src/types/filter.rs`, `nostr-relay-pool/`
- **go-nostr:** `event.go`, `filter.go`, `relay.go`, `connection.go`

## Related NIPs
- NIP-02: Follow List (kind 3)
- NIP-10: Text Notes threading (kind 1 reply semantics)
- NIP-24: Extra metadata fields for kind 0
- NIP-42: Authentication (relay AUTH)
- NIP-65: Relay List Metadata
