# NIP-23: Long-form Content

## Status
Active

## Summary
NIP-23 defines addressable events for long-form text content such as articles and blog posts. It uses `kind:30023` for published articles and `kind:30024` for drafts, with content written in Markdown syntax. Articles are editable via the `d` tag identifier and can be referenced using NIP-19 `naddr` codes.

## Motivation
Short-form notes (`kind:1`) are not suited for longer, structured written content like blog posts, essays, or articles. NIP-23 fills this gap by providing a dedicated event kind for long-form content that supports metadata (title, image, summary), editability through addressable events, and proper Markdown rendering. This allows Nostr to serve as a decentralized blogging platform.

## Specification

### Event Kinds
| Kind  | Description                  | Type               |
|-------|------------------------------|--------------------|
| 30023 | Long-form content (published)| Addressable event  |
| 30024 | Long-form content (draft)    | Addressable event  |

### Tags
| Tag           | Description                                        | Required |
|---------------|----------------------------------------------------|----------|
| `d`           | Unique identifier for the article (enables editing)| Yes      |
| `title`       | Article title / heading                            | Optional |
| `image`       | URL for a cover/banner image                       | Optional |
| `summary`     | Short summary / description of the article         | Optional |
| `published_at`| Unix timestamp (in seconds, stringified) of initial publication | Optional |
| `t`           | Topic/hashtag tags for categorization              | Optional |

### Content Format
- The `.content` field MUST be a string in Markdown syntax.
- Clients MUST NOT hard-wrap lines at arbitrary column widths.
- HTML additions to Markdown are NOT supported.
- References to other Nostr notes, articles, profiles, etc. inside the `.content` MUST follow NIP-27 and use `nostr:...` links.

### Protocol Flow
1. **Author creates an article**: Publishes a `kind:30023` event with a unique `d` tag, Markdown content, and optional metadata tags (`title`, `image`, `summary`, `published_at`, `t`).
2. **Editing**: The author publishes a new `kind:30023` event with the same `d` tag. The `.created_at` field reflects the last update time. The `published_at` tag retains the original publication date.
3. **Drafts**: Before publishing, authors can use `kind:30024` with the same structure to save drafts.
4. **Referencing**: Other events can reference the article using NIP-19 `naddr` codes or `a` tags in the format `30023:<pubkey>:<d-tag>`.
5. **Replies**: Replies to `kind:30023` MUST use NIP-22 `kind:1111` comments.

### JSON Examples

**A published long-form article:**
```json
{
  "kind": 30023,
  "created_at": 1675642635,
  "content": "Lorem [ipsum][nostr:naddr1teleport] dolor sit amet, consectetur adipiscing elit...",
  "tags": [
    ["d", "lorem-ipsum"],
    ["title", "Lorem Ipsum"],
    ["published_at", "1296962229"],
    ["t", "placeholder"],
    ["e", "b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87", "wss://relay.example.com"],
    ["a", "30023:a]695bb1c2282...somepubkey...:ipsum", "wss://relay.example2.com"]
  ],
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes
- The `d` tag serves as a slug-like identifier. It enables article URLs that remain stable across edits.
- `.created_at` represents the **last update** timestamp, not the original publication date. Use `published_at` for the original date.
- `kind:30024` drafts use an identical structure to `kind:30023` -- clients should treat them as unpublished and not display them publicly.
- Clients should parse the Markdown content and render it properly, supporting standard Markdown features like headings, lists, links, images, code blocks, etc.
- When an article references other Nostr content inline, the `nostr:` URI scheme (NIP-27) must be used rather than raw event IDs.

## Client Behavior
- Clients MUST render `.content` as Markdown.
- Clients MUST NOT insert hard line breaks at arbitrary column boundaries.
- Clients MUST NOT support HTML within Markdown content.
- Clients MUST use `nostr:...` links (NIP-27) when referencing Nostr entities in content.
- Clients SHOULD display the `title`, `image`, and `summary` metadata when available.
- Clients SHOULD use `published_at` for display dates and `.created_at` for "last updated" indicators.
- Clients SHOULD support editing by allowing republication with the same `d` tag.
- Clients MUST use NIP-22 `kind:1111` comments for replies to articles.

## Relay Behavior
- Relays MUST treat `kind:30023` and `kind:30024` as addressable (parameterized replaceable) events, replacing older versions when a new event with the same `pubkey` and `d` tag is received.
- Relays SHOULD support filtering by `d` tag for article lookups.

## Dependencies
- [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) -- `naddr` encoding for referencing addressable events
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comment/reply format (`kind:1111`)
- [NIP-27](https://github.com/nostr-protocol/nips/blob/master/27.md) -- `nostr:` URI scheme for inline references

## Source Code References
- **nostr-tools** (JS): `nip23.ts` or kind constant definitions
- **rust-nostr**: `Kind::LongFormTextContent` (kind 30023)
- **go-nostr**: Kind constants and event handling for addressable events

## Related NIPs
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Basic event structure
- [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) -- Parameterized replaceable events (addressable events)
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comments
- [NIP-27](https://github.com/nostr-protocol/nips/blob/master/27.md) -- Text note references
- [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) -- bech32-encoded entities
- [NIP-54](https://github.com/nostr-protocol/nips/blob/master/54.md) -- Wiki (similar long-form content concept)
