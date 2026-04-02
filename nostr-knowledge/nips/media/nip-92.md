# NIP-92: Media Attachments

## Status
Active (Draft, Optional)

## Summary
NIP-92 defines the `imeta` ("inline metadata") tag, a standard way to attach structured metadata to media URLs embedded in a Nostr event's `.content` field. Rather than inventing a new event kind, it enhances existing events (like `kind:1` notes) by letting clients discover MIME types, dimensions, hashes, blurhashes, alt text, and fallback URLs for any media URL that appears in the event content.

## Motivation
When a user posts a note containing an image or video URL, clients have no way to know the file's dimensions, type, or integrity without fetching it. This creates poor UX -- layouts shift when images load, accessibility is limited without alt text, and there is no fallback if the URL goes down. NIP-92 solves this by allowing the event author to embed all relevant metadata inline, so clients can render placeholders, validate integrity, and fall back to alternative sources without extra round-trips.

## Specification

### Event Kinds
NIP-92 does not define new event kinds. The `imeta` tag can be added to **any** event kind that includes URLs in its `.content` field. It is most commonly used with:
- `kind:1` -- Text notes
- `kind:21` / `kind:22` -- Video events (NIP-71)
- `kind:34235` / `kind:34236` -- Addressable video events (NIP-71)

### Tags

#### The `imeta` Tag
The `imeta` tag is a variadic (variable-length) tag. Each entry is a space-delimited `key value` pair. The tag structure:

```
["imeta", "key1 value1", "key2 value2", ...]
```

**Rules:**
- Each `imeta` tag SHOULD correspond to a URL present in the event's `.content`.
- Each `imeta` tag MUST contain a `url` field plus at least one additional field.
- Clients SHOULD ignore `imeta` tags whose `url` does not match any URL in the `.content`.

#### Supported Fields

| Field | Description | Example |
|-------|-------------|---------|
| `url` | The media URL (must match a URL in `.content`) | `url https://example.com/image.jpg` |
| `m` | MIME type | `m image/jpeg` |
| `x` | SHA-256 hash of the file | `x abc123...` |
| `ox` | SHA-256 hash of the original file (before transforms) | `ox def456...` |
| `size` | File size in bytes | `size 204800` |
| `dim` | Dimensions as `<width>x<height>` | `dim 3024x4032` |
| `blurhash` | Blurhash placeholder string | `blurhash eVF$^OI:${M{...` |
| `alt` | Alt text for accessibility | `alt A sunset over mountains` |
| `fallback` | Alternative URL hosting the same file (repeatable) | `fallback https://backup.com/image.jpg` |

Any field defined by NIP-94 may also be included in an `imeta` tag.

### Protocol Flow

#### Attaching Metadata at Post Time
1. User composes a note and pastes/uploads a media URL.
2. Client uploads the file (e.g., to a Blossom server) and receives metadata: SHA-256 hash, MIME type, dimensions, etc.
3. Client constructs the event with the URL in `.content` and an `imeta` tag containing all known metadata.
4. Event is signed and published to relays.

#### Consuming Metadata
1. Client receives an event and scans `.content` for URLs.
2. For each URL found, client looks for a matching `imeta` tag (matched by `url` field).
3. If found, client uses the metadata to:
   - Render a blurhash placeholder at the correct `dim` before the image loads.
   - Display `alt` text for screen readers.
   - Verify file integrity via `x` (SHA-256 hash).
   - Try `fallback` URLs if the primary `url` is unreachable.
   - Select appropriate rendering based on `m` (MIME type).

### JSON Examples

#### Image Attachment on a kind:1 Note
```json
{
  "kind": 1,
  "content": "Check out this photo! https://nostr.build/i/abc123photo.jpg",
  "tags": [
    ["imeta",
      "url https://nostr.build/i/abc123photo.jpg",
      "m image/jpeg",
      "blurhash eVF$^OI:${M{%LRjWBoLoLaeR*",
      "dim 3024x4032",
      "alt A golden retriever playing in autumn leaves",
      "x a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "size 2048576",
      "fallback https://backup.nostr.build/i/abc123photo.jpg"
    ]
  ]
}
```

#### Multiple Media in One Event
```json
{
  "kind": 1,
  "content": "Two photos from today:\nhttps://example.com/photo1.jpg\nhttps://example.com/photo2.png",
  "tags": [
    ["imeta",
      "url https://example.com/photo1.jpg",
      "m image/jpeg",
      "dim 1920x1080",
      "alt Morning sunrise"
    ],
    ["imeta",
      "url https://example.com/photo2.png",
      "m image/png",
      "dim 800x600",
      "alt Coffee on my desk"
    ]
  ]
}
```

## Implementation Notes
- The `imeta` tag is purely informational metadata. Clients are free to ignore it entirely.
- If a client cannot determine metadata (e.g., the user pasted a URL without uploading), it MAY omit the `imeta` tag or include only partial fields.
- Multiple `fallback` entries can appear in a single `imeta` tag, each on a separate `key value` entry.
- The `url` field in `imeta` must exactly match the URL string as it appears in `.content` -- no normalization.
- Fields from NIP-94 (like `thumb`, `image`, `summary`) are also valid inside `imeta` tags.

## Client Behavior
- Clients SHOULD include `imeta` tags when posting events with media URLs, especially after uploading files.
- Clients SHOULD use `dim` and `blurhash` to prevent layout shift while media loads.
- Clients SHOULD display `alt` text for accessibility (screen readers, broken images).
- Clients SHOULD verify SHA-256 hash (`x`) when downloading from untrusted sources.
- Clients SHOULD try `fallback` URLs when the primary URL fails.
- Clients SHOULD ignore `imeta` tags that do not match any URL in `.content`.
- Clients MAY download media during composition to extract metadata before publishing.

## Relay Behavior
- Relays do not need special handling for `imeta` tags. They are standard event tags and are stored/served as-is.
- Relays MAY index `imeta` data for search or content filtering purposes.

## Dependencies
- [NIP-94](nip-94.md) -- File Metadata (defines the field vocabulary reused by `imeta`)

## Source Code References
- **nostr-tools (JS):** `nip92.ts` or look for `imeta` tag parsing/construction helpers
- **Any client codebase:** Search for `imeta` in tag handling logic
- The `imeta` tag is widely implemented across Damus, Amethyst, Primal, Snort, and other major clients

## Related NIPs
- [NIP-71](nip-71.md) -- Video Events (uses `imeta` for video metadata)
- [NIP-94](nip-94.md) -- File Metadata (field definitions)
- [NIP-A0](nip-A0.md) -- Voice Messages (uses `imeta` for waveform/duration)
- [NIP-B7](nip-B7.md) -- Blossom (file storage, provides URLs/hashes for `imeta`)
