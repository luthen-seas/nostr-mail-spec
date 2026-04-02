# NIP-40: Expiration Timestamp

## Status
Active (draft, optional)

## Summary
NIP-40 defines the `expiration` tag, which allows event creators to specify a Unix timestamp after which the event SHOULD be considered expired. Relays SHOULD delete expired events and SHOULD NOT serve them to clients. Clients SHOULD ignore expired events. This enables temporary announcements, limited-time offers, and ephemeral content with an explicit lifetime.

## Motivation
Some content is inherently temporary: event announcements, limited-time business offers, temporary instructions, or messages that should not persist indefinitely. Without an expiration mechanism, this content accumulates on relays forever. NIP-40 provides a simple, standardized way for authors to signal that an event should be removed after a certain time, reducing relay storage burden and keeping content relevant.

## Specification

### Event Kinds

NIP-40 does not define new event kinds. The `expiration` tag can be added to any event kind. Ephemeral events (kinds 20000-29999) are NOT affected by expiration tags (they already have their own non-persistence semantics).

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `expiration` | `["expiration", "<unix timestamp in seconds>"]` | When the event SHOULD be considered expired |

The timestamp value is a string representation of a Unix timestamp in seconds, matching the format of `created_at`.

### Protocol Flow

**Creating an expiring event:**
1. Author creates an event (any kind)
2. Author adds `["expiration", "<future unix timestamp>"]` tag
3. Author publishes the event to relays

**Relay handling:**
1. Relay receives the event
2. If the expiration timestamp is already in the past, relay SHOULD drop the event
3. If the expiration is in the future, relay stores the event
4. Periodically (or on query), relay checks if stored events have expired
5. Relay SHOULD NOT send expired events to clients
6. Relay MAY delete expired events from storage

**Client handling:**
1. Client receives an event with an `expiration` tag
2. Client checks if the expiration timestamp has passed
3. If expired, client MUST ignore/discard the event
4. If not expired, client displays normally but may show expiration info

### JSON Examples

**Kind 1 note with expiration:**
```json
{
  "id": "4376c65d2f232afbe9b882a35baa4f6fe8667c4e684749af565f981833ed6a65",
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
  "created_at": 1000000000,
  "kind": 1,
  "tags": [
    ["expiration", "1600000000"]
  ],
  "content": "This message will self-destruct after the expiration time.",
  "sig": "..."
}
```

**Temporary announcement with expiration:**
```json
{
  "kind": 1,
  "content": "Live concert tonight at 8 PM! Join us at the venue.",
  "tags": [
    ["expiration", "1680220800"],
    ["t", "concert"],
    ["t", "livemusic"]
  ],
  "pubkey": "...",
  "created_at": 1680192000,
  "id": "...",
  "sig": "..."
}
```

**Limited-time business offer:**
```json
{
  "kind": 1,
  "content": "50% off all items this weekend only!",
  "tags": [
    ["expiration", "1680400000"],
    ["t", "sale"]
  ],
  "pubkey": "...",
  "created_at": 1680200000,
  "id": "...",
  "sig": "..."
}
```

**Kind 30023 article with expiration:**
```json
{
  "kind": 30023,
  "content": "This draft is shared temporarily for review...",
  "tags": [
    ["d", "temp-draft-review"],
    ["title", "Draft: My Article (expires in 24h)"],
    ["expiration", "1680288000"]
  ],
  "pubkey": "...",
  "created_at": 1680201600,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes

1. **Not a security feature:** The spec explicitly warns that expiration SHOULD NOT be relied upon for security or privacy. Events are publicly accessible on relays before expiration and can be downloaded and cached by third parties. Once data is published, there is no guarantee it will be truly deleted everywhere.

2. **Relay support detection:** Clients SHOULD query the relay's `supported_nips` field (from the relay information document, NIP-11) to check for NIP-40 support before relying on expiration behavior. Sending expiring events to non-supporting relays means those events may persist indefinitely.

3. **Relay deletion is not immediate:** Relays need not delete events the instant they expire. They may run periodic cleanup jobs. The key requirement is that relays SHOULD NOT serve expired events in response to queries.

4. **Ephemeral events:** The expiration tag has no meaningful effect on ephemeral events (kinds 20000-29999) since those are not expected to be stored anyway.

5. **Timestamp validation:** Relays SHOULD reject events where the expiration timestamp is already in the past at time of receipt.

6. **Clock skew:** Implementations should account for reasonable clock differences between event creators and relays. A few seconds of tolerance is reasonable.

## Client Behavior

- Clients MUST ignore/discard events whose `expiration` timestamp is in the past
- Clients SHOULD check relay NIP-40 support before relying on expiration
- Clients SHOULD avoid sending expiring events to relays that do not support NIP-40
- Clients MAY display a countdown or expiration indicator on expiring events
- Clients MAY warn users that expiration is not a security guarantee

## Relay Behavior

- Relays SHOULD NOT send expired events to clients, even if they are still stored
- Relays SHOULD drop incoming events that are already expired at time of receipt
- Relays MAY delete expired events from storage (but are not required to do so immediately)
- Relays MAY persist expired events indefinitely in their storage (but SHOULD NOT serve them)

## Dependencies
- NIP-01: Base protocol (event structure, tag system)
- NIP-11: Relay Information Document (for `supported_nips` discovery)

## Source Code References

- **nostr-tools (JS):** `nip40.ts` or tag checking utilities
- **rust-nostr:** Expiration tag handling in event validation
- **go-nostr:** Expiration checking in event processing

## Related NIPs
- NIP-01: Base protocol
- NIP-09: Event Deletion (explicit deletion, complementary to expiration)
- NIP-11: Relay Information Document (discovering NIP-40 support)
