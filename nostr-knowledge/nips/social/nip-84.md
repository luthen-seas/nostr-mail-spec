# NIP-84: Highlights

## Status
Active (draft)

## Summary
NIP-84 defines `kind:9802` events for highlighting portions of text that a user finds valuable. Highlights reference their source (Nostr events or external URLs), can attribute original authors, provide surrounding context, and support quote-highlight commentary. This enables a distributed highlighting and annotation layer across all Nostr and web content.

## Motivation
Highlighting is a fundamental reading activity -- marking passages that resonate, inform, or provoke thought. NIP-84 brings this to Nostr, enabling users to share the most valuable parts of articles, notes, and web content. This creates a social layer of curation: users can discover content through other people's highlights, see what resonated with their network, and build a personal collection of meaningful excerpts.

## Specification

### Event Kinds
| Kind | Description    | Type          |
|------|----------------|---------------|
| 9802 | Highlight      | Regular event |

### Tags
| Tag       | Format                                                    | Description |
|-----------|-----------------------------------------------------------|-------------|
| `a`       | `["a", "<kind:pubkey:d-tag>"]`                            | Reference to a Nostr addressable event being highlighted |
| `e`       | `["e", "<event-id>"]`                                     | Reference to a Nostr event being highlighted |
| `r`       | `["r", "<url>", "<attribute>"]`                           | URL of external content being highlighted. `"source"` attribute for the highlighted source; `"mention"` for URLs from comment text |
| `p`       | `["p", "<pubkey>", "<relay>", "<role>"]`                  | Author attribution. Role can be `"author"`, `"editor"`, or `"mention"` |
| `context` | `["context", "<surrounding text>"]`                       | Surrounding paragraph/text for context |
| `comment` | `["comment", "<user commentary>"]`                        | Quote-highlight commentary text |

### Content Field
The `.content` field contains the highlighted portion of text. It MAY be empty for highlights of non-text media (e.g., NIP-94 audio/video).

### Protocol Flow
1. **User highlights text**: While reading an article (Nostr or web), the user selects a portion of text.
2. **Client creates highlight**: Publishes a `kind:9802` event with the selected text in `.content`, a source reference (`a`, `e`, or `r` tag), and optional author attribution (`p` tags).
3. **Context preservation**: The client MAY include a `context` tag with surrounding text to give the highlight meaning in isolation.
4. **Quote highlighting**: If the user adds commentary, a `comment` tag is included. This renders like a quote repost with the highlight as the quoted content.
5. **Discovery**: Others can find highlights by querying for `kind:9802` events referencing specific sources, or browse highlights from users they follow.

### Attribution Roles
| Role      | Description                                    |
|-----------|------------------------------------------------|
| `author`  | Original author of the highlighted material    |
| `editor`  | Editor of the highlighted material             |
| `mention` | Person mentioned in the comment (not the source author) |

### JSON Examples

**Highlight from a Nostr article:**
```json
{
  "kind": 9802,
  "content": "The key insight is that decentralization requires giving up control, not distributing it.",
  "tags": [
    ["a", "30023:author-pubkey:article-d-tag", "wss://relay.example.com"],
    ["p", "author-pubkey", "wss://relay.example.com", "author"],
    ["context", "Many people misunderstand decentralization. The key insight is that decentralization requires giving up control, not distributing it. This is a subtle but crucial distinction."]
  ],
  "pubkey": "highlighter-pubkey",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Highlight from a web article:**
```json
{
  "kind": 9802,
  "content": "Bitcoin is a technological tour de force.",
  "tags": [
    ["r", "https://example.com/articles/bitcoin-review", "source"],
    ["p", "author-pubkey-if-known", "wss://relay.example.com", "author"]
  ],
  "pubkey": "highlighter-pubkey",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Highlight from a Nostr note:**
```json
{
  "kind": 9802,
  "content": "We are building the protocol for human freedom.",
  "tags": [
    ["e", "original-note-event-id", "wss://relay.example.com"],
    ["p", "note-author-pubkey", "wss://relay.example.com", "author"]
  ]
}
```

**Quote highlight with commentary:**
```json
{
  "kind": 9802,
  "content": "The key insight is that decentralization requires giving up control.",
  "tags": [
    ["a", "30023:author-pubkey:article-d-tag"],
    ["p", "author-pubkey", "", "author"],
    ["p", "friend-pubkey", "", "mention"],
    ["comment", "This is exactly what I was trying to explain to @friend last week. Decentralization is not about committees."],
    ["r", "https://friend-blog.example.com/related-post", "mention"],
    ["r", "https://example.com/articles/decentralization", "source"],
    ["context", "Many people misunderstand decentralization. The key insight is that decentralization requires giving up control, not distributing it."]
  ]
}
```

**Attribution with multiple roles:**
```json
{
  "tags": [
    ["p", "author-pubkey-hex", "wss://relay.example.com", "author"],
    ["p", "second-author-pubkey", "wss://relay.example.com", "author"],
    ["p", "editor-pubkey-hex", "wss://relay.example.com", "editor"]
  ]
}
```

## Implementation Notes
- URL cleaning: When highlighting web content, clients SHOULD clean the URL of tracking parameters, UTM codes, and other non-essential query string elements before storing in the `r` tag.
- Author discovery: For web content, clients can attempt to discover the author's Nostr pubkey via `<link rel="me" href="nostr:nprofile1..." />` meta tags on the source page, or by prompting the user.
- Empty content: For non-text media (audio, video), the `.content` can be empty -- the highlight then represents "this entire media is noteworthy."
- The `comment` tag creates a quote-highlight pattern that MUST be rendered like a quote repost, preventing the creation of separate highlight + kind:1 note pairs for a single highlight action.
- The `r` tag `"source"` attribute distinguishes the highlighted source URL from URLs mentioned in the comment text (`"mention"` attribute).
- `p` tags with `"mention"` attribute distinguish people mentioned in commentary from the original content authors.

## Client Behavior
- Clients SHOULD provide a text selection UI for creating highlights while reading content.
- Clients SHOULD tag the source using `a`/`e` tags for Nostr content and `r` tags for web content.
- Clients SHOULD clean URLs of tracking parameters before storing.
- Clients SHOULD attempt to discover and tag original authors.
- Clients SHOULD include `context` tags when the highlight is a subset of a paragraph.
- Clients MUST render quote highlights (those with `comment` tags) as quote reposts.
- Clients MUST distinguish `"mention"` p-tags from `"author"`/`"editor"` p-tags.
- Clients MUST distinguish `"source"` r-tags from `"mention"` r-tags.

## Relay Behavior
- Relays SHOULD index `a`, `e`, `r`, and `p` tags on `kind:9802` events for efficient querying.
- No special relay behavior is required beyond standard event storage and indexing.

## Dependencies
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comments (highlights can be commented on)
- [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md) -- Long-form content (common highlight source)

## Source Code References
- **nostr-tools** (JS): Kind 9802 constant
- **rust-nostr**: Highlight event kind
- **go-nostr**: Standard event handling

## Related NIPs
- [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md) -- Long-form content (primary source for highlights)
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Short text notes (can be highlighted)
- [NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md) -- File metadata (non-text media highlights)
- [NIP-27](https://github.com/nostr-protocol/nips/blob/master/27.md) -- Text note references
