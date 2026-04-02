# NIP-02: Follow List

## Status
Active (final, optional)

## Summary
NIP-02 defines a special replaceable event of kind `3` that contains a list of pubkeys a user follows, along with optional relay hints and petnames. Each new kind `3` event completely replaces the previous one, serving as the canonical follow list for that pubkey.

## Motivation
Nostr needed a standardized way for users to declare who they follow. This enables three critical functions: (1) backup and recovery of social graphs across clients and devices, (2) profile discovery so clients can display followed users and build follow suggestions, and (3) a relay-sharing mechanism that increases censorship resistance by publishing where each contact prefers to receive messages. Additionally, it enables a petname scheme where clients can build hierarchical human-readable names from social graph data.

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| 3    | Follow List (replaceable) |

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `p` | `["p", "<32-bytes-hex-pubkey>", "<main-relay-URL>", "<petname>"]` | A followed profile entry |

- The second element is the 32-byte hex-encoded public key of the followed user.
- The third element (optional) is the main relay URL where events from that key can be found.
- The fourth element (optional) is a local petname the user assigns to this contact.

### Protocol Flow

1. Client constructs a kind `3` event containing one `p` tag per followed pubkey.
2. Client signs and publishes the event to the user's preferred relays.
3. Any new kind `3` event from the same pubkey fully replaces the previous one.
4. Other clients can fetch the latest kind `3` event to reconstruct the user's follow list.
5. Clients may read relay hints from `p` tags to discover where to find events from followed users.
6. Clients may build local petname tables derived from other people's follow lists.

### JSON Examples

A kind `3` follow list event:

```json
{
  "kind": 3,
  "tags": [
    ["p", "91cf9..4e5ca", "wss://alicerelay.com/", "alice"],
    ["p", "14aeb..8dad4", "wss://bobrelay.com/nostr", "bob"],
    ["p", "612ae..e610f", "ws://carolrelay.com/ws", "carol"]
  ],
  "content": ""
}
```

## Implementation Notes

- Each new follow list completely replaces the previous one. There is no delta/diff mechanism. When adding a new follow, the client MUST include all previously followed pubkeys in the new event.
- Clients should append new follows chronologically when adding to an existing list.
- The `content` field is not used by this NIP (it is an empty string), but other NIPs or applications may repurpose it (e.g., some clients have historically stored relay list JSON in the content field, though this is deprecated in favor of NIP-65).
- Petnames form a hierarchical naming scheme. For example, if Alice follows Bob and calls him "bob", and Bob follows Carol and calls her "carol", then Alice's client could resolve "carol.bob" to Carol's pubkey by traversing the social graph.
- Relay URLs in `p` tags are the contact's preferred relay for receiving messages, not necessarily the relay where the follow list is published.

## Client Behavior

- Clients SHOULD display a user's follow list and allow managing it.
- Clients SHOULD use relay hints from follow lists to improve event discovery.
- Clients MUST publish a complete follow list each time (not incremental updates).
- Clients MAY build petname resolution tables from the social graph.
- Clients MAY use follow lists to generate follow suggestions for users.
- Clients SHOULD NOT rely solely on follow list relay hints; they should also use NIP-65 relay lists.

## Relay Behavior

- Relays MUST treat kind `3` as a replaceable event (per NIP-01), keeping only the latest event per pubkey.
- Relays SHOULD serve kind `3` events in response to standard filters.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol flow and event structure (replaceable events)

## Source Code References

- **nostr-tools (JS):** `nip02.ts` -- follow list parsing utilities
- **rust-nostr:** `nostr/src/event/kind.rs` (Kind 3 definition), contact list handling in `nostr-sdk`
- **go-nostr:** kind constant definitions, event handling

## Related NIPs

- [NIP-01](../nip-01.md) -- Basic protocol, defines replaceable event semantics
- [NIP-65](../nip-65.md) -- Relay List Metadata (preferred over using kind 3 content for relay lists)
- [NIP-51](../nip-51.md) -- Lists (generalized list mechanism)
