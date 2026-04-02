# NOSTR Relay Protocol

> Complete reference for relay-client communication over WebSockets, including
> message types, filter semantics, subscription management, authentication, and
> relay metadata. Primary sources: **NIP-01**, **NIP-11**, **NIP-42**, **NIP-45**.

---

## 1. WebSocket Connection Lifecycle

NOSTR clients communicate with relays exclusively over **WebSocket** connections (RFC 6455). The protocol is entirely JSON-based, with messages exchanged as JSON arrays.

### 1.1 Connection Establishment

```
Client                          Relay
  |                               |
  |--- WebSocket handshake ------>|
  |<-- 101 Switching Protocols ---|
  |                               |
  |--- REQ subscription -------->|
  |<-- EVENT (stored matches) ---|  (zero or more)
  |<-- EOSE --------------------|  (end of stored events)
  |                               |
  |<-- EVENT (live) -------------|  (ongoing, as new events match)
  |                               |
  |--- EVENT (publish) --------->|
  |<-- OK ----------------------|
  |                               |
  |--- CLOSE ------------------>|
  |                               |
```

### 1.2 Connection URL

Relay URLs use the `wss://` scheme (TLS-encrypted WebSocket) or `ws://` (unencrypted, discouraged):

```
wss://relay.example.com
wss://relay.example.com/
ws://localhost:7777
```

URL normalization: trailing slashes are generally considered equivalent but implementations should be consistent.

### 1.3 Connection Lifecycle States

1. **Connecting** -- WebSocket handshake in progress
2. **Connected** -- Handshake complete, messages can be exchanged
3. **Authenticating** -- Relay has sent an AUTH challenge (NIP-42), client must respond before accessing protected resources
4. **Active** -- Client has open subscriptions and/or is publishing events
5. **Closing** -- Client or relay is terminating the connection
6. **Disconnected** -- Connection closed; client should implement reconnection logic

---

## 2. Client-to-Relay Messages

All client messages are JSON arrays where the first element is a string verb.

### 2.1 EVENT -- Publish an Event

Sends a signed event to the relay for storage and/or forwarding.

```json
["EVENT", <event-json>]
```

**Full example:**
```json
["EVENT", {
  "id": "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
  "pubkey": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "created_at": 1700000000,
  "kind": 1,
  "tags": [
    ["p", "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"]
  ],
  "content": "Hello NOSTR!",
  "sig": "abcd1234...128-hex-chars..."
}]
```

**Relay response:** An `OK` message (always).

### 2.2 REQ -- Subscribe to Events

Creates a subscription with one or more filters. The relay will:
1. Return all stored events matching the filters
2. Send an `EOSE` message to mark the end of stored results
3. Continue sending new events that match in real-time

```json
["REQ", <subscription_id>, <filter-1>, <filter-2>, ...]
```

**Rules:**
- `subscription_id` is an arbitrary non-empty string, max 64 characters
- At least one filter MUST be provided
- Multiple filters are OR'd together (an event matching ANY filter is returned)
- If a new REQ is sent with an existing `subscription_id`, the previous subscription is **replaced** (not duplicated)

**Example -- subscribe to text notes from two authors:**
```json
["REQ", "timeline-sub", {
  "kinds": [1],
  "authors": [
    "pubkey-hex-alice",
    "pubkey-hex-bob"
  ],
  "limit": 50
}]
```

**Example -- subscribe to all replies to a specific event OR all events by a specific author:**
```json
["REQ", "multi-filter",
  {"#e": ["target-event-id-hex"], "kinds": [1]},
  {"authors": ["specific-author-pubkey-hex"]}
]
```

### 2.3 CLOSE -- Unsubscribe

Closes a subscription. The relay MUST stop sending events for this subscription ID.

```json
["CLOSE", <subscription_id>]
```

**Example:**
```json
["CLOSE", "timeline-sub"]
```

After sending CLOSE, the client SHOULD NOT receive any more EVENT messages for that subscription. If the relay sends events after CLOSE, the client should ignore them.

### 2.4 AUTH -- Authenticate (NIP-42)

Responds to a relay's authentication challenge by sending a signed ephemeral event.

```json
["AUTH", <signed-auth-event>]
```

**Example:**
```json
["AUTH", {
  "id": "auth-event-id-hex",
  "pubkey": "client-pubkey-hex",
  "created_at": 1700000000,
  "kind": 22242,
  "tags": [
    ["relay", "wss://relay.example.com/"],
    ["challenge", "random-challenge-string-from-relay"]
  ],
  "content": "",
  "sig": "auth-event-sig-hex"
}]
```

**Auth event requirements (NIP-42):**
- Kind MUST be `22242`
- MUST include a `relay` tag with the relay's URL
- MUST include a `challenge` tag matching the relay's challenge string
- `created_at` MUST be within approximately 10 minutes of current time
- MUST be properly signed

The relay responds with an `OK` message indicating success or failure. A client MAY send multiple AUTH messages with different public keys; the relay recognizes all authenticated identities.

### 2.5 COUNT -- Request Event Count (NIP-45)

Requests a count of events matching the given filters, without returning the events themselves.

```json
["COUNT", <query_id>, <filter-1>, <filter-2>, ...]
```

**Example:**
```json
["COUNT", "follower-count", {
  "kinds": [3],
  "#p": ["target-pubkey-hex"]
}]
```

Filters use the same syntax as REQ. Multiple filters are OR'd and aggregated into a single count.

---

## 3. Relay-to-Client Messages

### 3.1 EVENT -- Deliver a Matching Event

Sent when an event matches an active subscription, either from stored results or live.

```json
["EVENT", <subscription_id>, <event-json>]
```

**Example:**
```json
["EVENT", "timeline-sub", {
  "id": "event-id-hex",
  "pubkey": "author-pubkey-hex",
  "created_at": 1700000000,
  "kind": 1,
  "tags": [],
  "content": "A new post!",
  "sig": "sig-hex"
}]
```

### 3.2 OK -- Acknowledge Event Submission

Sent in response to every EVENT message from a client (NIP-01). Indicates acceptance or rejection.

```json
["OK", <event-id>, <accepted: true|false>, <message>]
```

**Fields:**
- `event-id`: The ID of the event that was submitted
- `accepted`: Boolean -- `true` if the relay accepted the event, `false` if rejected
- `message`: Human-readable string. MUST be present (may be empty string `""` on success)

**Machine-readable message prefixes (NIP-01):**

| Prefix | Meaning | Example |
|--------|---------|---------|
| `duplicate:` | Event already stored | `"duplicate: already have this event"` |
| `pow:` | Proof-of-work related | `"pow: difficulty 25>=24"` |
| `blocked:` | Author or content blocked | `"blocked: you are banned from this relay"` |
| `rate-limited:` | Too many events | `"rate-limited: slow down, please"` |
| `invalid:` | Event is malformed or invalid | `"invalid: event signature verification failed"` |
| `restricted:` | Policy restriction | `"restricted: this relay does not accept kind 4 events"` |
| `error:` | Internal relay error | `"error: internal database failure"` |

**Examples:**
```json
["OK", "b1a649ebe8...", true, ""]
["OK", "b1a649ebe8...", true, "pow: difficulty 25>=24"]
["OK", "b1a649ebe8...", false, "blocked: you are banned from this relay"]
["OK", "b1a649ebe8...", false, "invalid: event signature verification failed"]
["OK", "b1a649ebe8...", false, "rate-limited: slow down"]
["OK", "b1a649ebe8...", false, "error: could not store event"]
["OK", "b1a649ebe8...", true, "duplicate: already have this event"]
```

Note: `duplicate:` events may return either `true` or `false` depending on relay implementation. Some relays consider a duplicate submission a success (the event exists), others consider it a rejection.

### 3.3 EOSE -- End of Stored Events

Marks the boundary between historical (stored) results and live (real-time) events for a subscription.

```json
["EOSE", <subscription_id>]
```

**Significance:**
- After EOSE, the client knows it has received all stored events matching the subscription
- Any subsequent EVENT messages for this subscription are **new events** arriving in real-time
- Clients use this signal to render the initial timeline/view and then append live updates
- Each subscription receives exactly one EOSE message

**Example flow:**
```
Client: ["REQ", "feed", {"kinds": [1], "limit": 20}]
Relay:  ["EVENT", "feed", {...event1...}]
Relay:  ["EVENT", "feed", {...event2...}]
Relay:  ["EVENT", "feed", {...event20...}]
Relay:  ["EOSE", "feed"]
  -- now entering live mode --
Relay:  ["EVENT", "feed", {...new-event...}]    // arrives in real-time
```

### 3.4 CLOSED -- Subscription Terminated by Relay

Indicates the relay has terminated a subscription. Includes a reason.

```json
["CLOSED", <subscription_id>, <message>]
```

**Standard message prefixes:**
- `auth-required:` -- Client must authenticate before this subscription is allowed (NIP-42)
- `restricted:` -- Authenticated client lacks authorization
- `unsupported:` -- Filter contains elements the relay does not support
- `error:` -- Internal error

**Examples:**
```json
["CLOSED", "sub1", "auth-required: this relay requires authentication"]
["CLOSED", "sub1", "restricted: you do not have access to this content"]
["CLOSED", "sub1", "unsupported: filter contains unknown elements"]
["CLOSED", "sub1", "error: could not process subscription"]
```

### 3.5 NOTICE -- Relay Informational Message

A human-readable message from the relay. Not tied to any specific subscription or event.

```json
["NOTICE", <message>]
```

**Examples:**
```json
["NOTICE", "rate limit exceeded, please slow down"]
["NOTICE", "this relay will be shutting down for maintenance in 10 minutes"]
```

Clients SHOULD display notices to users or log them. NOTICE is not a substitute for OK or CLOSED -- those are the proper mechanisms for event acceptance and subscription management.

### 3.6 AUTH -- Authentication Challenge (NIP-42)

Relays send this to initiate authentication. May be sent at any time (connection open, after a REQ, etc.).

```json
["AUTH", <challenge-string>]
```

**Example:**
```json
["AUTH", "a1b2c3d4e5f6-random-challenge"]
```

The challenge string is an arbitrary, unique string generated by the relay. The client must include this exact string in the `challenge` tag of its AUTH response event.

### 3.7 COUNT -- Event Count Response (NIP-45)

Response to a COUNT request.

```json
["COUNT", <query_id>, {"count": <integer>}]
```

**Optional fields:**
```json
["COUNT", "q1", {"count": 238, "approximate": true}]
["COUNT", "q1", {"count": 238, "hll": "<512-char-hex-hyperloglog>"}]
```

The `hll` field is a HyperLogLog sketch (256 registers, each a uint8, concatenated as hex) that allows clients to merge count estimates from multiple relays.

If a relay refuses the COUNT request, it MUST respond with a `CLOSED` message instead.

---

## 4. Filter Object Specification

Filters determine which events match a subscription. Defined in NIP-01.

### 4.1 Filter Fields

```json
{
  "ids": ["<hex-event-id-prefix>", ...],
  "authors": ["<hex-pubkey-prefix>", ...],
  "kinds": [<integer>, ...],
  "#e": ["<hex-event-id>", ...],
  "#p": ["<hex-pubkey>", ...],
  "#t": ["<hashtag>", ...],
  "#d": ["<d-tag-value>", ...],
  "#<single-letter>": ["<tag-value>", ...],
  "since": <unix-timestamp>,
  "until": <unix-timestamp>,
  "limit": <integer>,
  "search": "<search-query>"
}
```

### 4.2 Field Semantics

| Field | Type | Behavior |
|-------|------|----------|
| `ids` | array of strings | Match events whose `id` starts with any of these hex prefixes. Full 64-char IDs or shorter prefixes. |
| `authors` | array of strings | Match events whose `pubkey` starts with any of these hex prefixes. |
| `kinds` | array of integers | Match events with any of these kind numbers. |
| `#<letter>` | array of strings | Match events that have a tag with name `<letter>` and whose first value matches any of these strings. Works for any single-letter tag (a-z, A-Z). |
| `since` | integer | Match events with `created_at` >= this value (inclusive). |
| `until` | integer | Match events with `created_at` <= this value (inclusive). |
| `limit` | integer | Maximum number of events to return in the initial stored-events query. Does NOT apply to live events after EOSE. |
| `search` | string | Full-text search query (NIP-50). Relay support optional. |

### 4.3 Matching Logic

**Within a single filter: ALL conditions are AND'd.**

An event matches a filter only if it satisfies every specified field:

```
match = (ids match OR ids not specified)
    AND (authors match OR authors not specified)
    AND (kinds match OR kinds not specified)
    AND (all #tag conditions match OR not specified)
    AND (created_at >= since OR since not specified)
    AND (created_at <= until OR until not specified)
```

**Within each array field: values are OR'd.**

For `ids`, `authors`, `kinds`, and `#tag` arrays, the event needs to match at least ONE value in the array.

**Multiple filters in a REQ: OR'd together.**

```json
["REQ", "sub1", <filter-A>, <filter-B>]
```

An event is delivered if it matches filter-A OR filter-B (or both).

### 4.4 Prefix Matching

The `ids` and `authors` fields support **prefix matching**. A prefix of 4 or more hex characters matches any ID/pubkey that starts with that prefix.

```json
{"ids": ["abcd"]}        // matches any event whose id starts with "abcd"
{"authors": ["1234ab"]}  // matches any pubkey starting with "1234ab"
```

However, the `#e` and `#p` tag filters MUST contain exact 64-character lowercase hex values (NIP-01).

### 4.5 Limit Behavior

The `limit` field controls the initial query result set:

- Events are returned ordered by `created_at` descending (newest first)
- Only the most recent `limit` events are returned
- After EOSE, the limit does NOT apply -- all matching live events are forwarded
- If `limit` is 0, no stored events are returned, but live events still flow
- If `limit` is absent, the relay uses its own default (configurable via NIP-11 `default_limit`)

### 4.6 Filter Examples

**Fetch a user's profile:**
```json
{"kinds": [0], "authors": ["pubkey-hex"]}
```

**Fetch a user's text notes, most recent 50:**
```json
{"kinds": [1], "authors": ["pubkey-hex"], "limit": 50}
```

**Fetch all replies to a specific event:**
```json
{"kinds": [1], "#e": ["event-id-hex"]}
```

**Fetch a specific addressable event by address:**
```json
{"kinds": [30023], "authors": ["pubkey-hex"], "#d": ["article-slug"]}
```

**Fetch events in a time window:**
```json
{"kinds": [1], "since": 1699900000, "until": 1700000000}
```

**Fetch multiple event types from multiple authors (follow feed):**
```json
{
  "kinds": [1, 6, 7, 30023],
  "authors": ["alice-pubkey", "bob-pubkey", "carol-pubkey"],
  "limit": 100
}
```

**Combine filters -- get reactions to an event OR all posts by its author:**
```json
["REQ", "sub1",
  {"kinds": [7], "#e": ["event-id"]},
  {"kinds": [1], "authors": ["author-pubkey"], "limit": 20}
]
```

---

## 5. Subscription Management

### 5.1 Subscription Lifecycle

1. **Create:** Client sends `REQ` with a unique subscription ID
2. **Receive stored:** Relay returns matching stored events
3. **EOSE:** Relay signals end of stored events
4. **Live streaming:** Relay forwards new matching events as they arrive
5. **Replace (optional):** Client sends new `REQ` with the same subscription ID -- replaces the previous filter set
6. **Close:** Client sends `CLOSE` or relay sends `CLOSED`

### 5.2 Subscription ID Management

- IDs are chosen by the client, max 64 characters, non-empty
- IDs are scoped to the WebSocket connection -- different connections can reuse IDs
- Sending a new REQ with an existing ID implicitly closes the old subscription and opens a new one with the new filters
- Relay MAY limit the number of concurrent subscriptions (reported via NIP-11 `max_subscriptions`)

### 5.3 Best Practices

- Use descriptive subscription IDs for debugging: `"timeline"`, `"profile-abc123"`, `"thread-xyz789"`
- Close subscriptions when no longer needed to conserve relay resources
- When replacing a subscription, the relay may send a second EOSE for the new filter set
- Be prepared for relays to CLOSE subscriptions unilaterally (resource limits, auth requirements)

---

## 6. Authentication Flow (NIP-42)

### 6.1 Challenge-Response Sequence

```
Client                                  Relay
  |                                       |
  |<--- ["AUTH", <challenge>] ------------|   (relay issues challenge)
  |                                       |
  |--- ["REQ", "sub1", {...}] ---------->|   (client tries subscription)
  |<--- ["CLOSED", "sub1",              |
  |      "auth-required: ..."] ---------|   (relay rejects -- needs auth)
  |                                       |
  |--- ["AUTH", <signed-kind-22242>] --->|   (client authenticates)
  |<--- ["OK", <auth-event-id>,         |
  |      true, ""] --------------------|   (relay confirms auth)
  |                                       |
  |--- ["REQ", "sub1", {...}] ---------->|   (client retries subscription)
  |<--- ["EVENT", "sub1", {...}] --------|   (relay now serves events)
  |<--- ["EOSE", "sub1"] ---------------|
```

### 6.2 When Authentication is Required

Relays may require authentication for:
- All operations (`auth_required: true` in NIP-11)
- Specific event kinds (e.g., DMs, private content)
- Writing events
- Accessing specific filters

The relay signals the requirement via:
- `CLOSED` with `auth-required:` prefix (for REQ)
- `OK` with `false` and `auth-required:` prefix (for EVENT)

---

## 7. NIP-11: Relay Information Document

### 7.1 Fetching

Clients retrieve relay metadata by sending an HTTP(S) GET request to the relay's WebSocket URL with a special Accept header:

```http
GET / HTTP/1.1
Host: relay.example.com
Accept: application/nostr+json
```

The relay responds with a JSON document. The relay MUST serve CORS headers:
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Headers`
- `Access-Control-Allow-Methods`

### 7.2 Document Structure

```json
{
  "name": "My Relay",
  "description": "A fast, reliable NOSTR relay.",
  "banner": "https://relay.example.com/banner.jpg",
  "icon": "https://relay.example.com/icon.png",
  "pubkey": "admin-pubkey-32-byte-hex",
  "contact": "mailto:admin@relay.example.com",
  "supported_nips": [1, 2, 9, 11, 12, 15, 16, 20, 22, 28, 33, 40, 42, 45, 50],
  "software": "https://github.com/example/relay-software",
  "version": "1.2.3",
  "limitation": {
    "max_message_length": 524288,
    "max_subscriptions": 20,
    "max_subid_length": 64,
    "max_limit": 5000,
    "max_event_tags": 2000,
    "max_content_length": 102400,
    "min_pow_difficulty": 0,
    "auth_required": false,
    "payment_required": false,
    "restricted_writes": false,
    "created_at_lower_limit": 1577836800,
    "created_at_upper_limit": 1893456000,
    "default_limit": 500
  },
  "payments_url": "https://relay.example.com/payments",
  "fees": {
    "admission": [{"amount": 1000000, "unit": "msats"}],
    "subscription": [{"amount": 500000, "unit": "msats", "period": 2592000}],
    "publication": [{"kinds": [1, 7], "amount": 100, "unit": "msats"}]
  },
  "terms_of_service": "https://relay.example.com/tos"
}
```

### 7.3 Limitation Fields Reference

| Field | Type | Description |
|-------|------|-------------|
| `max_message_length` | integer | Maximum size of incoming JSON message in bytes (UTF-8) |
| `max_subscriptions` | integer | Maximum number of concurrent subscriptions per connection |
| `max_subid_length` | integer | Maximum length of subscription ID strings |
| `max_limit` | integer | Maximum value for `limit` in filters (relay clamps higher values) |
| `max_event_tags` | integer | Maximum number of tags per event |
| `max_content_length` | integer | Maximum character count in event `content` |
| `min_pow_difficulty` | integer | Minimum proof-of-work difficulty required (NIP-13) |
| `auth_required` | boolean | Whether NIP-42 authentication is mandatory |
| `payment_required` | boolean | Whether payment is required for relay access |
| `restricted_writes` | boolean | Whether special conditions apply for writing events |
| `created_at_lower_limit` | integer | Earliest acceptable `created_at` timestamp |
| `created_at_upper_limit` | integer | Latest acceptable `created_at` timestamp |
| `default_limit` | integer | Default maximum events returned when no `limit` is specified |

Clients MUST ignore fields they do not understand. All fields are optional.

---

## 8. Connection Handling and Reconnection

### 8.1 Connection Drops

WebSocket connections can drop for many reasons: network changes, relay restarts, idle timeouts, resource limits. Clients MUST handle disconnections gracefully.

### 8.2 Recommended Reconnection Strategy

```
Initial delay:  1 second
Backoff factor: 2x (exponential)
Max delay:      60 seconds
Jitter:         random 0-30% of delay (prevents thundering herd)

Attempt 1:  ~1s
Attempt 2:  ~2s
Attempt 3:  ~4s
Attempt 4:  ~8s
Attempt 5:  ~16s
Attempt 6+: ~60s (capped)
```

### 8.3 State Recovery After Reconnection

After reconnecting, the client MUST:

1. **Re-establish subscriptions:** All subscriptions are lost when the WebSocket closes. Send new REQ messages.
2. **Use `since` for efficient catch-up:** Set the `since` filter to the timestamp of the last received event to avoid re-fetching known events.
3. **Re-authenticate if required:** The relay's authentication state is lost on disconnect.
4. **Deduplicate events:** The client may receive events it already has. Deduplicate by event `id`.

### 8.4 Detecting Stale Connections

- Send WebSocket ping frames periodically (every 30--60 seconds)
- If no pong is received within a timeout (e.g., 10 seconds), consider the connection dead
- Some relays send NOTICE messages as keepalives

---

## 9. Message Size and Rate Limits

### 9.1 Message Size

The relay's `max_message_length` (NIP-11) defines the upper bound for any single JSON message sent by the client, measured in UTF-8 encoded bytes. Typical values range from 128 KB to 1 MB.

### 9.2 Rate Limiting

Relays MAY impose rate limits on:
- EVENT submissions per time window
- REQ subscriptions per time window
- Total bandwidth per connection

Rate limit violations are communicated via:
- `OK` with `false` and `rate-limited:` prefix
- `NOTICE` messages
- WebSocket connection closure (extreme cases)

### 9.3 Error Handling Best Practices

| Relay Response | Client Action |
|---------------|---------------|
| `OK` with `true` | Event accepted. No action needed. |
| `OK` with `false`, `duplicate:` | Event already exists. No action needed. |
| `OK` with `false`, `rate-limited:` | Back off. Retry with exponential delay. |
| `OK` with `false`, `blocked:` | Author or content is blocked. Do not retry to this relay. |
| `OK` with `false`, `invalid:` | Event is malformed. Fix the event before retrying. |
| `OK` with `false`, `auth-required:` | Authenticate (NIP-42), then resubmit. |
| `OK` with `false`, `restricted:` | Relay policy disallows this. Try another relay. |
| `OK` with `false`, `error:` | Server-side error. May retry after delay. |
| `CLOSED` with `auth-required:` | Authenticate, then re-send REQ. |
| `CLOSED` with `restricted:` | Subscription not allowed. Try another relay. |
| `CLOSED` with `unsupported:` | Simplify filter. Remove unsupported fields. |
