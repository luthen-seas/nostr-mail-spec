# NIP-65: Relay List Metadata

## Status
Active (draft, optional)

## Summary
NIP-65 defines a replaceable event (`kind:10002`) that allows users to advertise which relays they read from and write to. Each relay URL is tagged with an optional "read" or "write" marker (or both if no marker is specified). This is the foundation of the "outbox model" -- the idea that clients should fetch a user's events from that user's declared write relays, and send mentions/replies to that user's declared read relays.

## Motivation
In a decentralized protocol with thousands of relays, clients face a fundamental routing problem: where should they look for a specific user's events, and where should they send events intended for that user? Without a standard, clients must connect to a large number of relays or rely on centralized aggregators, defeating the purpose of decentralization. NIP-65 solves this by letting each user declare their relay preferences, enabling efficient peer-to-peer event routing -- the "outbox model" that is now considered best practice in the NOSTR ecosystem.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| `10002` | Relay List Metadata | Replaceable | User's declared relay preferences with read/write markers. |

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `r` | `["r", "<relay-url>"]` | Relay used for both reading and writing (no marker). |
| `r` | `["r", "<relay-url>", "read"]` | Relay used only for reading (receiving events addressed to this user). |
| `r` | `["r", "<relay-url>", "write"]` | Relay used only for writing (publishing this user's own events). |

### Protocol Flow

#### Publishing the Relay List

1. User configures their preferred relays in their client.
2. Client creates a `kind:10002` event with `r` tags for each relay, including optional read/write markers.
3. Client publishes this event to as many relays as viable, especially well-known public indexers.
4. Because `kind:10002` is a replaceable event, only the latest version is retained by each relay.

#### Fetching a User's Events (Outbox Model)

1. Client wants to fetch events authored by user X.
2. Client looks up user X's `kind:10002` event (from any relay that might have it).
3. Client connects to user X's **write relays** to fetch their authored events.
4. This is the "outbox" -- the user writes events to these relays, so that is where to find them.

#### Sending Events to a User (Inbox Model)

1. Client wants to send an event that mentions or is directed at user X.
2. Client looks up user X's `kind:10002` event.
3. Client publishes the event to user X's **read relays**.
4. This is the "inbox" -- the user reads from these relays, so that is where to deliver events for them.

#### Publishing the Relay List Itself

1. The `kind:10002` event should be distributed to:
   - All relays where the user publishes content.
   - Well-known public indexers where other clients will look for relay lists.
   - The relays listed in the event itself.

### JSON Examples

#### Relay List Event with Mixed Markers

```json
{
  "kind": 10002,
  "pubkey": "<user-pubkey-hex>",
  "created_at": 1700000000,
  "tags": [
    ["r", "wss://alicerelay.example.com"],
    ["r", "wss://expensive-relay.example2.com", "write"],
    ["r", "wss://nostr-relay.example.com", "read"]
  ],
  "content": "",
  "id": "<event-id>",
  "sig": "<signature>"
}
```

In this example:
- `wss://alicerelay.example.com` -- both read and write (no marker)
- `wss://expensive-relay.example2.com` -- write only (user publishes here but does not read from here)
- `wss://nostr-relay.example.com` -- read only (user reads/receives here but does not publish here)

#### Minimal Relay List (2 relays, both read+write)

```json
{
  "kind": 10002,
  "pubkey": "<user-pubkey-hex>",
  "created_at": 1700000000,
  "tags": [
    ["r", "wss://relay.damus.io"],
    ["r", "wss://nos.lol"]
  ],
  "content": "",
  "id": "<event-id>",
  "sig": "<signature>"
}
```

### The Outbox Model in Practice

```
User A wants to see User B's posts:

1. Fetch User B's kind:10002 event
2. Extract User B's WRITE relays
3. Connect to those relays and subscribe to User B's events
   (This is where User B publishes, so this is where their events live.)

User A wants to reply to User B:

1. Fetch User B's kind:10002 event
2. Extract User B's READ relays
3. Publish the reply to User B's READ relays
   (This is where User B is listening, so they will see the reply.)
4. Also publish to User A's own WRITE relays
   (So User A's followers can also see the reply.)
```

## Implementation Notes

- The `content` field MUST be empty. All data is in the tags.
- Relay URLs SHOULD be normalized (lowercase scheme, trailing slash conventions, etc.).
- If an `r` tag has no third element (no marker), the relay serves both read and write purposes.
- Only `"read"` and `"write"` are valid markers. Unknown markers should be ignored.
- The `kind:10002` event is replaceable (kind 10000-19999 range), meaning relays keep only the latest event per pubkey.
- Clients SHOULD guide users to keep lists small: 2-4 relays per category. Large relay lists increase load on both the client and the network.
- The relay list should be widely distributed so other clients can discover it. Publishing only to the listed relays creates a bootstrapping problem.
- The outbox model requires that clients actively fetch and cache relay lists for the users they interact with. This is a significant architectural consideration.

## Client Behavior

- Clients SHOULD use a user's **write relays** when fetching that user's authored events.
- Clients SHOULD use a user's **read relays** when publishing events that mention or are directed at that user.
- Clients SHOULD publish the author's events to the author's own write relays.
- Clients SHOULD publish the `kind:10002` event itself to as many relays as viable, prioritizing well-known public indexers.
- Clients SHOULD guide users to keep relay lists small (2-4 relays per category).
- Clients SHOULD fetch `kind:10002` events for users they interact with and cache the results.
- Clients SHOULD handle the case where a user has no `kind:10002` event (fall back to default relay set).
- Clients MAY periodically refresh cached relay lists.

## Relay Behavior

- Relays MUST treat `kind:10002` as a replaceable event (store only the latest per pubkey).
- Relays SHOULD serve `kind:10002` events in response to filters querying for them.
- Relays have no special obligations beyond normal event handling for NIP-65.

## Dependencies

- NIP-01 (basic protocol -- replaceable events, event structure)
- NIP-11 (Relay Information Document -- relay URL conventions)

## Source Code References

### nostr-tools (JS)
- `nip65.ts` -- helper functions for parsing relay list events, extracting read/write relays.
- Used extensively by clients implementing the outbox model.

### rust-nostr
- `nostr` crate -- `RelayMetadata` type, parsing of `kind:10002` events.
- `nostr-relay-pool` -- uses NIP-65 data for intelligent relay routing.

### go-nostr
- `nip65/nip65.go` -- `ParseRelayList()` function, `RelayListItem` struct with `Read`/`Write` booleans.

### strfry
- No special NIP-65 handling needed; strfry stores and serves the events normally.

### khatru
- No special NIP-65 handling needed; the framework stores and serves replaceable events.

### Client Implementations
- Damus, Amethyst, Primal, Coracle, Snort, and most modern clients implement the outbox model using NIP-65 relay lists.

## Related NIPs

- NIP-01 (Basic Protocol) -- replaceable event semantics
- NIP-02 (Follow List) -- related concept; follow list vs. relay list
- NIP-11 (Relay Information Document) -- relay metadata
- NIP-43 (Relay Access Metadata) -- relay-side membership complements user-side preferences
- NIP-66 (Relay Discovery) -- monitors help discover relays that are online
