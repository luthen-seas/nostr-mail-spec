# NIP-30: Custom Emoji

## Status
Active

## Summary
NIP-30 defines a standard for using custom emoji in Nostr events. Custom emoji are referenced via `:shortcode:` syntax in event content and resolved to images using `emoji` tags. This allows users and communities to use custom image-based emoji beyond the standard Unicode emoji set.

## Motivation
Unicode emoji are limited to a fixed, slowly-evolving set. Communities and individuals want to use custom images as emoji (similar to Discord, Slack, or Twitch). NIP-30 provides a standardized way to embed and render custom emoji within any Nostr event content, enabling richer expression and community identity.

## Specification

### Event Kinds
NIP-30 does not define its own event kind. It defines a tag and content convention that can be used within any event kind, including:
- `kind:0` -- User metadata (name and about fields)
- `kind:1` -- Short text notes (content field)
- `kind:7` -- Reactions (content field)
- `kind:30315` -- User statuses (content field)

### Tags
| Tag     | Format                                                        | Description |
|---------|---------------------------------------------------------------|-------------|
| `emoji` | `["emoji", "<shortcode>", "<image-url>"]`                     | Maps a shortcode to an image URL |
| `emoji` | `["emoji", "<shortcode>", "<image-url>", "<emoji-set-addr>"]` | Optional 4th element referencing an emoji set addressable event |

**Shortcode rules:**
- MUST contain only alphanumeric characters, hyphens (`-`), and underscores (`_`).
- No colons in the shortcode value itself (colons are only used as delimiters in the content).

### Protocol Flow
1. **Author creates content with custom emoji**: Writes `:shortcode:` in the content field (e.g., `:soapbox:`).
2. **Author includes emoji tag**: Adds an `emoji` tag mapping the shortcode to an image URL.
3. **Client renders**: When displaying the event, the client finds `:shortcode:` patterns in the content, looks up matching `emoji` tags, and replaces the text with the corresponding image.

### Where Custom Emoji Apply
- **kind:0 (metadata)**: The `name` and `about` fields in the JSON content can contain `:shortcode:` references.
- **kind:1 (text notes)**: The `.content` field can contain `:shortcode:` references.
- **kind:7 (reactions)**: The `.content` field can be a single `:shortcode:` (see NIP-25 for reaction rules).
- **kind:30315 (user statuses)**: The `.content` field can contain `:shortcode:` references.

### JSON Examples

**Text note with custom emoji:**
```json
{
  "kind": 1,
  "content": "Hello :gleasonator: world :soapbox:",
  "tags": [
    ["emoji", "gleasonator", "https://gleasonator.com/emoji/Gleasonator/gleasonator.png"],
    ["emoji", "soapbox", "https://gleasonator.com/emoji/Gleasonator/soapbox.png"]
  ],
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Reaction with custom emoji (NIP-25):**
```json
{
  "kind": 7,
  "content": ":soapbox:",
  "tags": [
    ["e", "target-event-id"],
    ["p", "target-author-pubkey"],
    ["emoji", "soapbox", "https://gleasonator.com/emoji/Gleasonator/soapbox.png"]
  ]
}
```

**User metadata with custom emoji:**
```json
{
  "kind": 0,
  "content": "{\"name\": \"Alex :zap:\", \"about\": \"Building on :nostr:\"}",
  "tags": [
    ["emoji", "zap", "https://example.com/emoji/zap.png"],
    ["emoji", "nostr", "https://example.com/emoji/nostr.png"]
  ]
}
```

## Implementation Notes
- Shortcodes are case-sensitive.
- Only `:shortcode:` patterns that have a corresponding `emoji` tag should be replaced; unmatched shortcodes should be rendered as plain text.
- For reactions (`kind:7`), the content MUST contain only a single `:shortcode:`, and there MUST be only one `emoji` tag.
- Image URLs should ideally point to small, square images suitable for inline rendering (similar to emoji size).
- The optional 4th element in the emoji tag allows referencing a `kind:30030` emoji set (see NIP-51), enabling shared emoji collections.

## Client Behavior
- Clients MUST parse `:shortcode:` patterns from content fields.
- Clients MUST look up corresponding `emoji` tags and render the image inline.
- Clients SHOULD render custom emoji at an appropriate size (similar to standard emoji).
- Clients SHOULD support custom emoji in `kind:0` `name` and `about` fields.
- Clients SHOULD support custom emoji in `kind:1` content.
- Clients SHOULD support custom emoji in `kind:7` reaction content.
- Clients MAY provide an emoji picker UI referencing the user's `kind:10030` emoji list (NIP-51).

## Relay Behavior
- Relays have no special behavior requirements for NIP-30. They store and serve the events as normal.

## Dependencies
- None (NIP-30 is a self-contained convention using standard event tags)

## Source Code References
- **nostr-tools** (JS): Custom emoji parsing utilities
- **rust-nostr**: Emoji tag builders and parsers
- **go-nostr**: Standard tag handling applies

## Related NIPs
- [NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) -- Reactions (uses custom emoji)
- [NIP-38](https://github.com/nostr-protocol/nips/blob/master/38.md) -- User Statuses (supports custom emoji)
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (defines `kind:10030` emoji list and `kind:30030` emoji sets)
