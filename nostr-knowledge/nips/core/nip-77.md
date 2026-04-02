# NIP-77: Negentropy Syncing

## Status
Active (draft, optional)

## Summary
NIP-77 defines a protocol extension for efficient set reconciliation between clients and relays (or relay-to-relay). It wraps the Negentropy protocol, which uses Range-Based Set Reconciliation to minimize bandwidth when syncing events. Instead of transferring all event IDs to find differences, both sides exchange compact fingerprints of their event sets, identify only the missing items, and then transfer actual events through standard NIP-01 mechanisms.

## Motivation
When a client connects to a relay and wants to sync a large set of events (e.g., all events matching a specific filter), the naive approach is to download everything and deduplicate locally, or to send all known event IDs and ask for the rest. Both approaches waste bandwidth when the client and relay share most events. NIP-77 uses the Negentropy reconciliation algorithm to efficiently determine which events each side is missing, transferring only the differences. This is especially valuable for:

- Clients syncing large follow lists across relays
- Relay-to-relay synchronization
- Reconnecting after offline periods
- Syncing event sets with high overlap

## Specification

### Event Kinds

NIP-77 does not define new event kinds. It defines new WebSocket message types for the sync protocol.

### Message Types

#### Client-to-Relay Messages

**NEG-OPEN** -- Initiate a negentropy sync session:
```json
["NEG-OPEN", "<subscription_id>", <filter>, "<initial_message_hex>"]
```
- `subscription_id`: arbitrary string (same rules as NIP-01 REQ)
- `filter`: a single NIP-01 filter object (only ONE filter, not an array)
- `initial_message_hex`: hex-encoded initial Negentropy protocol message

**NEG-MSG** -- Continue reconciliation:
```json
["NEG-MSG", "<subscription_id>", "<message_hex>"]
```
- Sent after processing the relay's response
- Contains the next Negentropy protocol message

**NEG-CLOSE** -- End the sync session:
```json
["NEG-CLOSE", "<subscription_id>"]
```

#### Relay-to-Client Messages

**NEG-MSG** -- Relay's reconciliation response:
```json
["NEG-MSG", "<subscription_id>", "<message_hex>"]
```
- Contains the relay's Negentropy protocol message
- Client parses this to determine needed/have IDs and next message

**NEG-ERR** -- Error response:
```json
["NEG-ERR", "<subscription_id>", "<reason>"]
```

**Error reason codes:**
| Code | Meaning |
|------|---------|
| `blocked` | Query is too large or not allowed |
| `closed` | Session timed out or was terminated |
| Other | Free-form error description |

### Tags

NIP-77 does not define event tags. It operates at the message/protocol level.

### Protocol Flow

**Complete sync session:**

1. **Client prepares:** Client selects a NIP-01 filter for the events to sync. Client constructs its local Negentropy instance with all locally known events matching the filter. Client generates the initial Negentropy message.

2. **Client opens session:**
```json
["NEG-OPEN", "sync-1", {"kinds": [1], "authors": ["abc123..."]}, "6100..."]
```

3. **Relay processes:** Relay selects all events matching the filter from its store. Relay constructs its own Negentropy instance. Relay processes the client's initial message and generates a response.

4. **Relay responds:**
```json
["NEG-MSG", "sync-1", "6100..."]
```

5. **Client processes response:** Client parses the relay's message to discover:
   - IDs the relay has that the client needs (client should `REQ` these)
   - IDs the client has that the relay needs (client should `EVENT` these)
   - Whether another round of reconciliation is needed

6. **If more rounds needed:** Client sends another `NEG-MSG`:
```json
["NEG-MSG", "sync-1", "6100..."]
```
   Relay responds with another `NEG-MSG`. This continues until reconciliation is complete.

7. **Client closes session:**
```json
["NEG-CLOSE", "sync-1"]
```

8. **Transfer phase (in parallel):** After identifying missing IDs, the client:
   - Sends `["REQ", ...]` to fetch events it needs from the relay
   - Sends `["EVENT", ...]` to push events the relay needs
   - These use standard NIP-01 messages and can happen in parallel with ongoing reconciliation

### Negentropy Protocol V1 Internals

**Record format:** Each event in the set is represented as a record:
- 64-bit timestamp (from `created_at`)
- 256-bit ID (from `event.id`)

Records are sorted by timestamp first, then lexically by ID.

**Message encoding:**
- Protocol version byte: `0x61` for V1
- Followed by a sequence of Ranges
- Uses variable-length integers (Varints) for compact encoding

**Range structure:**
Each range specifies:
- **Upper bound:** timestamp + ID prefix (defines the range of records covered)
- **Mode byte:**
  - `0` = Skip (no data for this range, both sides have the same content)
  - `1` = Fingerprint (compact hash of all records in range for comparison)
  - `2` = IdList (explicit list of record IDs in range)
- **Payload:** depends on mode

**Fingerprint algorithm:**
1. Concatenate all element IDs in the range
2. Sum them modulo 2^256 (XOR or addition)
3. Append the count of elements
4. Compute SHA-256 of the result
5. Return first 16 bytes as the fingerprint

**Reconciliation logic:**
- If fingerprints match for a range, both sides have identical records (skip)
- If fingerprints differ, subdivide the range and recurse (or fall back to IdList for small ranges)
- IdList mode explicitly lists all IDs, allowing direct comparison

### JSON Examples

**Opening a sync session for kind:1 notes from a specific author:**
```json
["NEG-OPEN", "sync-timeline", {"kinds": [1], "authors": ["6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"]}, "610012abcdef..."]
```

**Relay response with reconciliation data:**
```json
["NEG-MSG", "sync-timeline", "6100fe98dc..."]
```

**Client continuation message:**
```json
["NEG-MSG", "sync-timeline", "6100aa55bb..."]
```

**Client closing the session:**
```json
["NEG-CLOSE", "sync-timeline"]
```

**Relay error (query too large):**
```json
["NEG-ERR", "sync-timeline", "blocked"]
```

**Relay error (session timeout):**
```json
["NEG-ERR", "sync-timeline", "closed"]
```

**After reconciliation -- client fetches missing events:**
```json
["REQ", "fetch-missing", {"ids": ["aaa111...", "bbb222...", "ccc333..."]}]
```

**After reconciliation -- client pushes events relay is missing:**
```json
["EVENT", {"id": "ddd444...", "kind": 1, "content": "...", ...}]
["EVENT", {"id": "eee555...", "kind": 1, "content": "...", ...}]
```

## Implementation Notes

1. **Single filter only:** Unlike NIP-01 `REQ` which accepts multiple filters, `NEG-OPEN` takes exactly ONE filter object. If you need to sync multiple filter sets, open multiple NEG sessions.

2. **Session management:** Both client and relay must maintain state for each open NEG session. The subscription ID identifies the session. Relays should timeout idle sessions.

3. **Bandwidth savings:** The primary benefit of Negentropy is when both sides share most events. For a set of 100,000 events where 99% overlap, only the differences need to be identified and transferred, saving orders of magnitude of bandwidth compared to transferring all IDs.

4. **Multiple rounds:** Reconciliation may require multiple message exchanges. The Negentropy algorithm starts with coarse fingerprints and progressively refines ranges where differences are detected.

5. **Parallel transfer:** The actual event transfer (REQ/EVENT) can happen in parallel with ongoing reconciliation rounds. Clients do not need to wait for reconciliation to complete before starting transfers.

6. **Negentropy library:** Implementations should use the reference Negentropy library rather than reimplementing the protocol. Libraries exist for multiple languages.

7. **Relay support detection:** Clients should check relay capabilities (NIP-11) to determine if NIP-77 is supported before attempting NEG-OPEN.

8. **Record ordering:** The sort order (timestamp first, then ID) is critical for correct reconciliation. Both sides must use the identical ordering.

## Client Behavior

- Clients MUST construct a local Negentropy instance with all locally known events matching the filter before opening a session
- Clients MUST handle `NEG-ERR` responses gracefully (fall back to standard REQ if negentropy is not supported)
- Clients MUST close sessions with `NEG-CLOSE` when reconciliation is complete
- Clients SHOULD use standard `REQ` and `EVENT` messages to transfer actual events after reconciliation
- Clients SHOULD detect relay NIP-77 support before attempting NEG-OPEN
- Clients MAY run multiple NEG sessions in parallel for different filters
- Clients MAY begin event transfers before reconciliation is fully complete

## Relay Behavior

- Relays MUST respond to `NEG-OPEN` with either `NEG-MSG` or `NEG-ERR`
- Relays MUST maintain session state for each open NEG subscription
- Relays MUST respond to `NEG-MSG` with another `NEG-MSG` containing the next reconciliation message
- Relays MUST clean up sessions on `NEG-CLOSE`
- Relays SHOULD timeout idle NEG sessions (sending `NEG-ERR` with `"closed"`)
- Relays MAY reject NEG sessions with `"blocked"` if the filter is too broad or resource-intensive
- Relays MAY limit the number of concurrent NEG sessions per client

## Dependencies
- NIP-01: Base protocol (filters, EVENT/REQ messages for actual transfer)
- NIP-11: Relay Information Document (for capability discovery)
- Negentropy protocol library (external dependency)

## Source Code References

- **Negentropy reference library:** https://github.com/hoytech/negentropy (C++ reference, with bindings)
- **negentropy-js:** JavaScript implementation
- **negentropy-rs:** Rust implementation
- **nostr-tools (JS):** Negentropy sync utilities
- **rust-nostr:** `nostr-relay-pool` negentropy sync support
- **strfry relay:** Reference relay implementation with NIP-77 support

## Related NIPs
- NIP-01: Base protocol (filters, event transfer)
- NIP-11: Relay Information Document (capability discovery)
- NIP-42: Authentication (may be required for sync access)
