# NIP-7D: Threads

## Status
Active (draft)

## Summary
NIP-7D defines `kind:11` events for creating threads -- titled discussion topics similar to forum posts. Threads require a `title` tag and use NIP-22 `kind:1111` comments for replies. Replies are directed to the root `kind:11` event to avoid arbitrarily nested reply hierarchies, keeping the discussion flat.

## Motivation
While `kind:1` short text notes work well for microblogging, they lack structure for longer, topic-focused discussions. Threads provide a middle ground between microblog posts and long-form articles (NIP-23): they have a title to define the topic, content for the opening post, and flat reply threading to keep discussions organized. This is analogous to forum threads, Reddit self-posts, or X/Twitter threads.

## Specification

### Event Kinds
| Kind | Description     | Type          |
|------|-----------------|---------------|
| 11   | Thread          | Regular event |
| 1111 | Thread reply    | Regular event (NIP-22 comment) |

### Tags
**Thread (kind:11):**
| Tag     | Description                  | Required |
|---------|------------------------------|----------|
| `title` | `["title", "<thread title>"]`| SHOULD   |

**Thread Reply (kind:1111):**
| Tag | Description |
|-----|-------------|
| `E` | Root thread event ID with relay URL and pubkey |
| `K` | `"11"` (root event kind) |
| `e` | For direct replies to thread: same as `E`. For nested: parent reply ID |
| `k` | Parent event kind |
| `p` | Parent author pubkey |

### Content Field
- **Thread**: The `.content` field contains the opening post / discussion topic text.
- **Reply**: The `.content` field contains the reply text.

### Protocol Flow
1. **Thread creation**: A user publishes a `kind:11` event with a `title` tag and content containing the discussion topic.
2. **Replying**: Users reply using `kind:1111` (NIP-22 comments) directed to the root `kind:11` event.
3. **Flat threading**: Replies SHOULD be directed to the root `kind:11` to avoid deep nesting. This keeps the discussion flat, like a traditional forum thread.
4. **Display**: Clients fetch the `kind:11` event and all `kind:1111` events referencing it to display the full thread.

### JSON Examples

**Thread creation:**
```json
{
  "kind": 11,
  "content": "What are your favorite Nostr clients and why? I've been trying a few different ones and would love to hear what features you value most.",
  "tags": [
    ["title", "Favorite Nostr Clients?"]
  ],
  "pubkey": "thread-author-pubkey",
  "created_at": 1690000000,
  "id": "thread-event-id",
  "sig": "..."
}
```

**Reply to a thread:**
```json
{
  "kind": 1400,
  "content": "I've been using Damus on iOS and really enjoy the clean UI and fast relay connections.",
  "tags": [
    ["E", "thread-event-id", "wss://relay.example.com", "thread-author-pubkey"],
    ["K", "11"],
    ["e", "thread-event-id", "wss://relay.example.com"],
    ["k", "11"],
    ["p", "thread-author-pubkey", "wss://relay.example.com"]
  ],
  "pubkey": "replier-pubkey",
  "created_at": 1690001000,
  "id": "reply-event-id",
  "sig": "..."
}
```

**Reply to another reply (still referencing root):**
```json
{
  "kind": 1400,
  "content": "Damus is great! Have you tried the zap feature?",
  "tags": [
    ["E", "thread-event-id", "wss://relay.example.com", "thread-author-pubkey"],
    ["K", "11"],
    ["e", "reply-event-id", "wss://relay.example.com"],
    ["k", "1111"],
    ["p", "replier-pubkey", "wss://relay.example.com"]
  ],
  "pubkey": "second-replier-pubkey",
  "created_at": 1690002000,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes
- Threads are NOT replaceable events -- once published, they cannot be edited in-place (unlike NIP-23 articles).
- The flat threading model (replies directed to root) is intentional to prevent deeply nested hierarchies that become hard to follow.
- The `title` tag is critical for thread discovery and display -- without it, a `kind:11` event is indistinguishable from a long text note.
- Threads differ from `kind:1` notes primarily by having a title and by using NIP-22 comments instead of `kind:1` replies.
- Clients can build thread views by querying for the root `kind:11` event and all `kind:1111` events that reference it via `E` tag.

## Client Behavior
- Clients SHOULD display the `title` prominently, treating threads more like forum posts than microblog entries.
- Clients SHOULD display replies in a flat or semi-flat layout rather than deeply nested trees.
- Clients SHOULD use `kind:1111` (NIP-22) for all thread replies.
- Clients MAY support sorting replies by time, reactions, or other criteria.
- Clients MAY differentiate thread views from short note views in the UI.

## Relay Behavior
- Relays SHOULD index `E` and `e` tags on `kind:1111` events for efficient thread reconstruction.
- Relays have no special handling requirements for `kind:11` events beyond standard event storage.

## Dependencies
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comments (`kind:1111` for thread replies)

## Source Code References
- **nostr-tools** (JS): Kind 11 constant
- **rust-nostr**: Thread event kind handling
- **go-nostr**: Standard event handling

## Related NIPs
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Basic event structure, `kind:1` short text notes
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comments
- [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md) -- Long-form content (similar but editable and Markdown-focused)
