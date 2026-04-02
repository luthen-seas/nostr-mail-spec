# NIP-68: Picture-first Feeds

## Status
Active (draft)

## Summary
NIP-68 defines `kind:20` events for picture-first social content, similar to Instagram-style posts. Picture events support multiple images with rich metadata (blurhash, dimensions, hashes, fallback URLs), user tagging at specific image coordinates, content warnings, location data, and language tags. It is designed to work alongside NIP-71 `kind:22` video events in unified media feeds.

## Motivation
Photo sharing is a core social media use case. Short text notes (`kind:1`) can contain image URLs, but they are fundamentally text-first. NIP-68 creates a dedicated event kind optimized for photo-centric content, with structured metadata for images, enabling clients to build Instagram-like or Pinterest-like experiences with proper image handling, galleries, and media-specific feeds.

## Specification

### Event Kinds
| Kind | Description       | Type          |
|------|-------------------|---------------|
| 20   | Picture event     | Regular event |

### Tags
| Tag               | Format                                                      | Description |
|-------------------|-------------------------------------------------------------|-------------|
| `title`           | `["title", "<post title>"]`                                 | Title/caption for the picture post |
| `imeta`           | `["imeta", "url <url>", "m <mime>", "blurhash <hash>", "dim <WxH>", "x <sha256>", "fallback <url>", ...]` | Image metadata (one per image, multiple allowed) |
| `p`               | `["p", "<pubkey>", "<relay>", "<x>,<y>"]`                   | Tag a user at specific image coordinates |
| `content-warning` | `["content-warning", "<reason>"]`                           | NIP-36 sensitive content flag |
| `t`               | `["t", "<hashtag>"]`                                        | Hashtags |
| `g`               | `["g", "<geohash>"]`                                        | Location geohash |
| `L`               | `["L", "ISO-639-1"]`                                        | Language namespace |
| `l`               | `["l", "<language-code>", "ISO-639-1"]`                     | Language label |

### Accepted Image Formats
| Format | MIME Type   |
|--------|-------------|
| APNG   | image/apng  |
| AVIF   | image/avif  |
| GIF    | image/gif   |
| JPEG   | image/jpeg  |
| PNG    | image/png   |
| WEBP   | image/webp  |
| SVG    | image/svg+xml |

### The `imeta` Tag
The `imeta` tag carries structured metadata for each image. Key-value pairs are space-separated within each array element:
- `url` -- The image URL
- `m` -- MIME type
- `blurhash` -- A BlurHash string for placeholder rendering before the image loads
- `dim` -- Dimensions in `WxH` format (e.g., `1920x1080`)
- `x` -- SHA-256 hash of the image file
- `fallback` -- Alternative URL(s) if the primary URL is unavailable

Multiple `imeta` tags can appear in a single event for gallery/carousel posts.

### Content Field
The `.content` field contains a text description of the picture(s), serving as a caption or alt-text.

### Protocol Flow
1. **User posts a picture**: Client uploads the image to a media server, then publishes a `kind:20` event with a `title` tag, one or more `imeta` tags, and optional content description.
2. **Multi-image posts**: Multiple `imeta` tags create a gallery/carousel that clients render sequentially.
3. **User tagging**: `p` tags with coordinate data (`x,y` as a fraction 0-1 of image dimensions) tag users at specific locations in an image.
4. **Feed display**: Clients query for `kind:20` events (and optionally `kind:22` video events from NIP-71) to build media-centric feeds.
5. **Follow integration**: The `kind:10020` media follows list (NIP-51) provides a dedicated follow list for multimedia content creators.

### JSON Examples

**Single picture post:**
```json
{
  "kind": 20,
  "content": "Sunset over the mountains",
  "tags": [
    ["title", "Mountain Sunset"],
    ["imeta",
      "url https://example.com/photos/sunset.jpg",
      "m image/jpeg",
      "blurhash LKO2:N%2Tw=w]~RBVZRi};RPxuwH",
      "dim 1920x1080",
      "x a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    ],
    ["t", "photography"],
    ["t", "sunset"],
    ["g", "u4pruydqqvj"],
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"]
  ],
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Multi-image gallery with user tagging:**
```json
{
  "kind": 20,
  "content": "Group photo from the Nostr conference",
  "tags": [
    ["title", "Nostr Conference 2025"],
    ["imeta",
      "url https://example.com/photos/group1.jpg",
      "m image/jpeg",
      "blurhash LKO2:N%2Tw=w]~RBVZRi};RPxuwH",
      "dim 2048x1536",
      "x sha256hash1"
    ],
    ["imeta",
      "url https://example.com/photos/group2.jpg",
      "m image/jpeg",
      "blurhash LGF5]+Yk^6#M@-5c,1J5@[or[Q6.",
      "dim 2048x1536",
      "x sha256hash2",
      "fallback https://backup.example.com/photos/group2.jpg"
    ],
    ["p", "user1-pubkey", "wss://relay.example.com", "0.3,0.5"],
    ["p", "user2-pubkey", "wss://relay.example.com", "0.7,0.5"],
    ["content-warning", ""],
    ["t", "nostr"],
    ["t", "conference"]
  ]
}
```

## Implementation Notes
- Picture events are regular (non-replaceable) events, unlike articles (kind:30023).
- The `blurhash` field is important for UX -- it allows clients to show a colored placeholder while the full image loads.
- Coordinate-based user tagging (the 4th element of the `p` tag) uses fractions (0-1) relative to image dimensions, not pixel values.
- Fallback URLs in `imeta` provide resilience against media server outages.
- Clients building media feeds should query for both `kind:20` (pictures) and `kind:22` (videos, NIP-71) for a unified experience.
- The `kind:10020` media follows list (NIP-51) provides a separate follow graph specifically for media content.

## Client Behavior
- Clients SHOULD render picture events with the image(s) as the primary content, not the text.
- Clients SHOULD use `blurhash` to show placeholders while images load.
- Clients SHOULD support gallery/carousel display for multi-image posts.
- Clients MAY support user tag overlays on images at the specified coordinates.
- Clients SHOULD respect `content-warning` tags and hide images behind a consent barrier.
- Clients SHOULD support the seven accepted image formats.
- Clients MAY combine `kind:20` and `kind:22` events in unified media feeds.
- Clients SHOULD use the `kind:10020` media follows list for media-specific feeds.

## Relay Behavior
- Relays SHOULD index `t`, `p`, and `g` tags on `kind:20` events for efficient querying.
- Relays MAY apply size limits on `kind:20` events (due to potentially large `imeta` metadata).

## Dependencies
- [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md) -- Content warnings
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling (language tags)
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (kind:10020 media follows)
- [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) -- `imeta` tag specification

## Source Code References
- **nostr-tools** (JS): Kind 20 constant, `imeta` tag parsing
- **rust-nostr**: Picture event kind, image metadata handling
- **go-nostr**: Standard event handling

## Related NIPs
- [NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md) -- Video events (kind:22, companion to picture events)
- [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) -- Media attachments / `imeta` tags
- [NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md) -- File metadata (kind:1063)
- [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md) -- Sensitive content
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (media follows, picture curation sets)
