# NIP-25: Reactions

## Status
Active

## Summary
NIP-25 defines `kind:7` events for reacting to other Nostr events. Reactions can be a simple like (`+`), dislike (`-`), emoji, or NIP-30 custom emoji. It also defines `kind:17` for reacting to external (non-Nostr) content such as URLs or podcast episodes.

## Motivation
Social protocols need a lightweight mechanism for users to express approval, disapproval, or emotional responses to content. Reactions provide this without requiring full text replies. They enable like/dislike counts, emoji reactions (similar to Slack or Discord), and engagement metrics across the Nostr ecosystem.

## Specification

### Event Kinds
| Kind | Description                          |
|------|--------------------------------------|
| 7    | Reaction to a native Nostr event     |
| 17   | Reaction to external (non-Nostr) content |

### Tags
| Tag | Description                                                                 | Required   |
|-----|-----------------------------------------------------------------------------|------------|
| `e` | Event ID of the reacted-to event (with optional relay hint)                 | Yes (kind 7) |
| `p` | Pubkey of the author of the reacted-to event                                | Should     |
| `a` | Coordinates of the reacted-to addressable event (`kind:pubkey:d-tag`)       | For addressable events |
| `k` | Stringified kind number of the reacted-to event                             | Optional   |
| `i` | NIP-73 external content identifier (for kind 17)                            | Yes (kind 17) |
| `emoji` | NIP-30 custom emoji tag                                                 | For custom emoji reactions |

### Content Values
| Content         | Meaning                                  |
|-----------------|------------------------------------------|
| `+` or `""`     | Like / upvote                            |
| `-`             | Dislike / downvote                       |
| Unicode emoji   | Emoji reaction (displayed as that emoji) |
| `:shortcode:`   | Custom emoji reaction (NIP-30)           |

### Protocol Flow
1. **User reacts to a Nostr event**: Client creates a `kind:7` event with an `e` tag pointing to the target event ID, a `p` tag with the target event author's pubkey, and a `content` field containing the reaction value.
2. **Reacting to addressable events**: Include an `a` tag with the coordinates `kind:pubkey:d-tag` in addition to the `e` and `p` tags.
3. **Reacting to external content**: Client creates a `kind:17` event with NIP-73 `i` and `k` tags to identify the external content. No `e` tag is used.
4. **Custom emoji reactions**: Set content to a single `:shortcode:` and include a corresponding `emoji` tag per NIP-30.

### JSON Examples

**Simple like reaction to a Nostr event:**
```json
{
  "kind": 7,
  "content": "+",
  "tags": [
    ["e", "b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87", "wss://relay.example.com"],
    ["p", "a]695bb1c2282fc5e9aee0b7c9e41e4a0daa89fb4be0dbc0e40f26a834b68b26"],
    ["k", "1"]
  ],
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Emoji reaction:**
```json
{
  "kind": 7,
  "content": "\ud83e\udd19",
  "tags": [
    ["e", "target-event-id", "wss://relay.example.com"],
    ["p", "target-author-pubkey"]
  ]
}
```

**Custom emoji reaction (NIP-30):**
```json
{
  "kind": 7,
  "content": ":soapbox:",
  "tags": [
    ["e", "target-event-id", "wss://relay.example.com"],
    ["p", "target-author-pubkey"],
    ["emoji", "soapbox", "https://gleasonator.com/emoji/Gleasonator/soapbox.png"]
  ]
}
```

**Reaction to external content (website):**
```json
{
  "kind": 17,
  "content": "+",
  "tags": [
    ["i", "https://example.com/article", "url"],
    ["k", "https://example.com/article"]
  ]
}
```

**Reaction to a podcast episode:**
```json
{
  "kind": 17,
  "content": "+",
  "tags": [
    ["i", "podcast:guid:some-episode-guid", "podcast:item:guid"],
    ["k", "podcast:item:guid"]
  ]
}
```

## Implementation Notes
- A reaction with an empty string `""` content SHOULD be treated the same as `+` (a like).
- Only one `:shortcode:` is allowed in the content for custom emoji reactions, and only one `emoji` tag should accompany it.
- The `k` tag allows clients to filter reactions by the kind of the original event without needing to fetch it.
- When displaying reaction counts, clients typically aggregate by content value (e.g., count all `+` reactions, count all specific emoji).
- Reactions to replaceable/addressable events should include both the `e` tag (specific version) and the `a` tag (addressable coordinates).

## Client Behavior
- Clients MUST include an `e` tag referencing the reacted event for kind 7 reactions.
- Clients SHOULD include a `p` tag referencing the event author for notification delivery.
- Clients SHOULD include an `a` tag when reacting to addressable events.
- Clients SHOULD display emoji content as the actual emoji, not as a generic like/dislike.
- Clients MAY choose to display or hide downvote (`-`) reactions.
- Clients MUST use `kind:17` (not kind 7) when reacting to non-Nostr content.
- Clients MUST include NIP-73 external content `i` and `k` tags for kind 17 reactions.

## Relay Behavior
- Relays SHOULD index `e`, `p`, `a`, and `k` tags on kind 7 events for efficient querying.
- Relays MAY apply rate limiting to reaction events to prevent spam.

## Dependencies
- [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) -- Custom emoji
- [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) -- External content IDs (for kind 17)

## Source Code References
- **nostr-tools** (JS): Reaction event creation helpers, kind 7 constants
- **rust-nostr**: `Kind::Reaction` (kind 7), `Kind::GenericRepost` for related reposts
- **go-nostr**: Kind constants for reactions

## Related NIPs
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Basic event structure
- [NIP-10](https://github.com/nostr-protocol/nips/blob/master/10.md) -- Reply threading (for `e` tag conventions)
- [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) -- Reposts
- [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) -- Custom emoji
- [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) -- External content IDs
