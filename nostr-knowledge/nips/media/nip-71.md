# NIP-71: Video Events

## Status
Active (Draft, Optional)

## Summary
NIP-71 defines dedicated event kinds for publishing video content on Nostr. It separates video posts into "normal" (landscape, long-form) and "short" (portrait, short-form) categories, each with both regular and addressable variants. Video metadata is carried via `imeta` tags (NIP-92), allowing clients to build YouTube/TikTok-like viewing experiences rather than treating videos as attachments on microblog posts.

## Motivation
A `kind:1` note with a video URL attached does not carry enough structured metadata for a dedicated video-viewing experience. Clients that want to build Netflix-style, YouTube-style, or TikTok-style interfaces need first-class event kinds where the video is the primary content, with rich metadata for resolution variants, thumbnails, duration, captions, chapters, and fallback sources. NIP-71 fills this gap by defining purpose-built event kinds with a well-defined tag vocabulary.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `21` | Regular | Normal (landscape/long-form) video event |
| `22` | Regular | Short (portrait/short-form) video event |
| `34235` | Addressable | Addressable normal video (updatable) |
| `34236` | Addressable | Addressable short video (updatable) |

Regular kinds (21, 22) are immutable once published. Addressable kinds (34235, 34236) include a `d` tag and can be updated in place -- useful for correcting metadata, migrating URLs, or tracking imported content from other platforms.

### Tags

#### Required Tags
- `title` -- Title of the video
- `imeta` -- One or more inline metadata tags (per NIP-92) describing the video file(s)

#### Required for Addressable Events
- `d` -- Unique identifier string (user-chosen) for addressable kinds 34235/34236

#### Recommended Tags
- `published_at` -- Unix timestamp (stringified) of first publication
- `alt` -- Accessibility description

#### Optional Tags
- `text-track` -- Link to WebVTT file: `["text-track", "<url>", "<type>", "<language>"]` where type is captions/subtitles/chapters/metadata
- `content-warning` -- NSFW or sensitive content warning reason
- `segment` -- Chapter/segment marker: `["segment", "<HH:MM:SS.sss start>", "<HH:MM:SS.sss end>", "<title>", "<thumbnail-url>"]`
- `t` -- Hashtag for categorization (repeatable)
- `p` -- Participant pubkey with optional relay URL (repeatable)
- `r` -- Reference link to a web page (repeatable)
- `origin` -- For imported content: `["origin", "<platform>", "<external-id>", "<original-url>", "<optional-metadata>"]`

#### `imeta` Properties (in addition to NIP-92/NIP-94 fields)
- `url` -- Primary video URL
- `m` -- MIME type (e.g., `video/mp4`, `application/x-mpegURL`)
- `x` -- SHA-256 hash of the file
- `dim` -- Dimensions (e.g., `1920x1080`)
- `image` -- Thumbnail/preview image URL at the same resolution (repeatable for fallbacks)
- `fallback` -- Alternative server URL hosting the same file (repeatable)
- `service` -- Service hint (e.g., `nip96`)
- `duration` -- Duration in seconds (floating point)
- `bitrate` -- Average bitrate in bits/sec
- `blurhash` -- Blurhash placeholder string

Multiple `imeta` tags can represent different resolution variants of the same video.

### Protocol Flow

#### Publishing a Video
1. Creator uploads video file(s) to one or more hosting services (e.g., Blossom servers per NIP-B7).
2. Creator obtains URL(s), SHA-256 hash(es), and metadata for each resolution variant.
3. Creator constructs an event (kind 21/22 or 34235/34236) with:
   - `.content` set to a text summary/description of the video.
   - One `imeta` tag per resolution variant, containing url, hash, MIME type, dimensions, thumbnail, duration, bitrate, and fallback URLs.
   - A `title` tag and any other desired metadata tags.
4. Creator signs and publishes the event to relays.

#### Consuming a Video
1. Client fetches video events (filter by kind 21, 22, 34235, 34236).
2. Client reads `imeta` tags to discover available resolutions and formats.
3. Client selects appropriate resolution based on device/bandwidth.
4. Client uses `url` as the primary source; if unavailable, tries `fallback` URLs.
5. If `service nip96` is present, client may search the author's NIP-96/Blossom server list to locate the file by hash.
6. Client displays thumbnail from `image` while video loads, uses `blurhash` as placeholder.

### JSON Examples

#### Regular Video Event (kind 21)
```json
{
  "id": "<32-bytes hex SHA-256>",
  "pubkey": "<32-bytes hex pubkey>",
  "created_at": 1700000000,
  "kind": 21,
  "content": "A walkthrough of the new Lightning integration features.",
  "tags": [
    ["title", "Lightning Integration Demo"],
    ["published_at", "1700000000"],
    ["alt", "Screen recording showing Lightning payment flow in a Nostr client"],
    ["imeta",
      "dim 1920x1080",
      "url https://myvideo.com/1080/12345.mp4",
      "x 3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc",
      "m video/mp4",
      "image https://myvideo.com/1080/12345.jpg",
      "fallback https://myotherserver.com/1080/12345.mp4",
      "service nip96",
      "bitrate 3000000",
      "duration 29.223"
    ],
    ["imeta",
      "dim 1280x720",
      "url https://myvideo.com/720/12345.mp4",
      "x e1d4f808dae475ed32fb23ce52ef8ac82e3cc760702fca10d62d382d2da3697d",
      "m video/mp4",
      "image https://myvideo.com/720/12345.jpg",
      "fallback https://myotherserver.com/720/12345.mp4",
      "service nip96",
      "bitrate 2000000",
      "duration 29.24"
    ],
    ["imeta",
      "dim 1280x720",
      "url https://myvideo.com/720/12345.m3u8",
      "x 704e720af2697f5d6a198ad377789d462054b6e8d790f8a3903afbc1e044014f",
      "m application/x-mpegURL",
      "image https://myvideo.com/720/12345.jpg",
      "fallback https://myotherserver.com/720/12345.m3u8",
      "duration 29.21"
    ],
    ["text-track", "https://myvideo.com/subs/12345.vtt", "subtitles", "en"],
    ["content-warning", "flashing lights"],
    ["segment", "00:00:00.000", "00:05:30.000", "Introduction", "https://myvideo.com/thumb-intro.jpg"],
    ["p", "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", "wss://relay.example.com"],
    ["t", "lightning"],
    ["t", "nostr"],
    ["r", "https://example.com/blog/lightning-integration"]
  ]
}
```

#### Addressable Video Event (kind 34235)
```json
{
  "id": "<32-bytes hex SHA-256>",
  "pubkey": "<32-bytes hex pubkey>",
  "created_at": 1700000000,
  "kind": 34235,
  "content": "Imported video from YouTube with corrected metadata.",
  "tags": [
    ["d", "yt-import-abc123"],
    ["title", "My Favorite Talk from Nostrasia"],
    ["published_at", "1695000000"],
    ["alt", "Conference talk about decentralized identity"],
    ["imeta",
      "url https://example.com/media.mp4",
      "m video/mp4",
      "dim 480x480",
      "blurhash eVF$^OI:${M{%LRjWBoLoLaeR*",
      "image https://example.com/thumb.jpg",
      "x 3093509d1e0bc604ff60cb9286f4cd7c781553bc8991937befaacfdc28ec5cdc"
    ],
    ["origin", "youtube", "dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
    ["t", "nostrasia"],
    ["t", "identity"]
  ]
}
```

#### Referencing Addressable Videos
```json
["a", "34235:<pubkey>:<d-tag-value>", "<relay-url>"]
["a", "34236:<pubkey>:<d-tag-value>", "<relay-url>"]
```

## Implementation Notes
- The distinction between "normal" (kind 21) and "short" (kind 22) is stylistic/qualitative, not a hard constraint on duration or orientation. A short video can technically be long, and a normal video can be vertical.
- Multiple `imeta` tags per event represent different resolution/format variants of the same video, not different videos.
- Both `url` and `fallback` URLs should be treated with equal weight; clients are free to use any of them.
- The `image` field within `imeta` is resolution-matched -- it is a thumbnail at the same resolution as that variant.
- HLS streams (`application/x-mpegURL`) can be included alongside direct MP4 files as separate `imeta` entries.
- `service nip96` is a hint that the file can be looked up by hash on the author's NIP-96/Blossom server list.

## Client Behavior
- Clients SHOULD display video events in a video-centric UI rather than as microblog posts.
- Clients SHOULD select the most appropriate resolution variant from the `imeta` tags based on device capabilities and network conditions.
- Clients SHOULD try `fallback` URLs if the primary `url` fails.
- Clients SHOULD display `content-warning` before showing NSFW content.
- Clients MAY use `blurhash` as a placeholder while thumbnails load.
- Clients MAY render `segment` tags as chapter markers in the video timeline.
- Clients MAY render `text-track` WebVTT files as subtitles/captions.
- Clients SHOULD verify file hashes (`x`) when downloading from untrusted sources.

## Relay Behavior
- Relays MUST accept and serve kinds 21, 22, 34235, and 34236 if they support this NIP.
- Relays MAY apply content policies (e.g., rejecting events without `content-warning` when media is flagged).
- Relays handle addressable events (34235, 34236) per standard addressable event semantics -- newer events with the same `d` tag from the same pubkey replace older ones.

## Dependencies
- [NIP-92](../nip-92.md) -- `imeta` tag format for inline media metadata
- [NIP-94](../nip-94.md) -- File metadata tag vocabulary (m, x, dim, blurhash, etc.)
- [NIP-B7](../nip-B7.md) / Blossom -- Recommended file hosting and fallback resolution
- NIP-22 -- Comment/reply threading (for replies to video events)
- NIP-40 -- Expiration (if applicable)

## Source Code References
- **nostr-tools (JS):** `nip71.ts` -- Video event kind constants and helpers
- **rust-nostr:** `nostr/src/event/kind.rs` -- Kind definitions for 21, 22, 34235, 34236
- Look for `imeta` parsing logic in any client codebase that supports NIP-92

## Related NIPs
- [NIP-92](../nip-92.md) -- Media Attachments (imeta tag)
- [NIP-94](../nip-94.md) -- File Metadata
- [NIP-96](../nip-96.md) -- HTTP File Storage Integration (deprecated)
- [NIP-B7](../nip-B7.md) -- Blossom (current recommended file storage)
- [NIP-A0](../nip-A0.md) -- Voice Messages (similar pattern for audio)
