# NIP-94: File Metadata

## Status
Active (Draft, Optional)

## Summary
NIP-94 defines `kind:1063` events that describe files with structured metadata tags. Each event represents a single file and carries its URL, MIME type, SHA-256 hash, and optional metadata like dimensions, thumbnails, magnet links, and blurhash placeholders. It is designed for specialized file-sharing clients (think Pinterest, torrent indexes, or software distribution) rather than general-purpose social feeds.

## Motivation
Nostr needed a standardized way to describe files so that relays could index, filter, and categorize shared content. Without structured metadata, a relay cannot distinguish a PDF from an image, cannot offer search by file type, and cannot enforce content policies based on file attributes. NIP-94 provides this vocabulary. It also serves as the canonical reference for file metadata fields that other NIPs (especially NIP-92's `imeta` tag) reuse.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `1063` | Regular | File metadata event describing a single file |

The `.content` field contains an optional caption or description of the file.

### Tags

#### Required Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `url` | Download URL of the file | `["url", "https://example.com/file.pdf"]` |
| `m` | MIME type (lowercase) | `["m", "application/pdf"]` |
| `x` | SHA-256 hex hash of the file (as served, post-transform) | `["x", "abc123..."]` |

#### Recommended Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `ox` | SHA-256 hex hash of the **original** file (before server transforms) | `["ox", "def456..."]` |
| `size` | File size in bytes | `["size", "204800"]` |
| `dim` | Dimensions as `<width>x<height>` | `["dim", "1920x1080"]` |

#### Optional Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `magnet` | Magnet URI | `["magnet", "magnet:?xt=..."]` |
| `i` | Torrent infohash | `["i", "abc123..."]` |
| `blurhash` | Blurhash placeholder | `["blurhash", "eVF$^OI:..."]` |
| `thumb` | Thumbnail URL (may include hash as extra element) | `["thumb", "https://example.com/thumb.jpg", "<sha256>"]` |
| `image` | Preview image URL (may include hash as extra element) | `["image", "https://example.com/preview.jpg", "<sha256>"]` |
| `summary` | Short text summary of the file | `["summary", "Q4 financial report"]` |
| `alt` | Accessibility description | `["alt", "A pie chart showing revenue breakdown"]` |
| `fallback` | Alternative download URL | `["fallback", "https://mirror.example.com/file.pdf"]` |

### Protocol Flow

#### Publishing File Metadata
1. Author uploads a file to a hosting service (Blossom, NIP-96 server, or any HTTP host).
2. Author obtains the file URL, computes or receives the SHA-256 hash, determines the MIME type.
3. Author constructs a `kind:1063` event with:
   - `.content` set to a caption/description (or empty string).
   - Required tags: `url`, `m`, `x`.
   - Any additional metadata tags as appropriate.
4. Author signs and publishes to relays.

#### Discovering Files
1. Client queries relays for `kind:1063` events, optionally filtering by tags (e.g., `#m` for MIME type, `#x` for hash).
2. Client renders results in a file-browsing UI with thumbnails, descriptions, and download links.
3. Client uses `x` to verify file integrity after download.

### JSON Examples

#### Image File Metadata
```json
{
  "kind": 1063,
  "content": "Sunset over the mountains, taken on a hike in Colorado.",
  "tags": [
    ["url", "https://blossom.example.com/abc123def456.jpg"],
    ["m", "image/jpeg"],
    ["x", "abc123def456abc123def456abc123def456abc123def456abc123def456abcd"],
    ["ox", "abc123def456abc123def456abc123def456abc123def456abc123def456abcd"],
    ["size", "3145728"],
    ["dim", "4032x3024"],
    ["blurhash", "eVF$^OI:${M{%LRjWBoLoLaeR*"],
    ["thumb", "https://blossom.example.com/abc123def456_thumb.jpg"],
    ["alt", "A panoramic sunset with orange and purple clouds over mountain peaks"]
  ]
}
```

#### Torrent File Metadata
```json
{
  "kind": 1063,
  "content": "Linux Mint 22 ISO - official torrent",
  "tags": [
    ["url", "https://mirrors.example.com/linuxmint-22.iso.torrent"],
    ["m", "application/x-bittorrent"],
    ["x", "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"],
    ["size", "2800000000"],
    ["magnet", "magnet:?xt=urn:btih:fedcba9876543210fedcba9876543210fedcba98&dn=linuxmint-22.iso"],
    ["i", "fedcba9876543210fedcba9876543210fedcba98"],
    ["summary", "Official Linux Mint 22 Cinnamon Edition ISO image"]
  ]
}
```

#### PDF Document
```json
{
  "kind": 1063,
  "content": "",
  "tags": [
    ["url", "https://files.example.com/whitepaper.pdf"],
    ["m", "application/pdf"],
    ["x", "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"],
    ["size", "524288"],
    ["summary", "Nostr Protocol Scaling Whitepaper v2"],
    ["alt", "PDF document discussing relay scaling strategies"],
    ["thumb", "https://files.example.com/whitepaper_thumb.png", "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba"]
  ]
}
```

## Implementation Notes
- The `x` tag contains the hash of the file **as served** (after any server-side transformations like compression or resizing). The `ox` tag contains the hash of the **original** file as uploaded. These may differ if the server modified the file.
- MIME types in the `m` tag MUST be lowercase (e.g., `image/jpeg` not `image/JPEG`).
- The `thumb` and `image` tags may carry an optional second element containing the SHA-256 hash of the thumbnail/preview itself.
- NIP-94 events are most useful in specialized file-sharing clients. General social clients typically do not render `kind:1063` in feeds but may use the tag vocabulary via NIP-92's `imeta` tags.
- The field vocabulary defined here (m, x, ox, dim, blurhash, alt, etc.) is the canonical reference that NIP-92 `imeta` tags draw from.

## Client Behavior
- Clients SHOULD use `kind:1063` events for file-centric interfaces (galleries, file indexes, torrent browsers).
- Clients SHOULD verify `x` hash after downloading a file.
- Clients SHOULD display `alt` text for accessibility.
- Clients MAY render `blurhash` as a loading placeholder.
- Clients MAY use `thumb` or `image` for preview rendering in lists.
- Clients MAY construct `imeta` tags from `kind:1063` data when referencing files in other event types.

## Relay Behavior
- Relays MAY index `kind:1063` events by tag values (especially `m`, `x`, `t`) for search and filtering.
- Relays MAY reject `kind:1063` events that lack required tags (`url`, `m`, `x`).
- Relays MAY apply content policies based on MIME type or other metadata.
- Relays MAY offer specialized query capabilities for file browsing.

## Dependencies
- None strictly required, though files are typically hosted via [NIP-B7](nip-B7.md) (Blossom) or other HTTP file servers.

## Source Code References
- **nostr-tools (JS):** `nip94.ts` -- Helpers for constructing and parsing `kind:1063` events
- **rust-nostr:** `nostr/src/event/kind.rs` -- Kind 1063 definition
- NIP-96 upload responses include `nip94_event` structures that map directly to this format

## Related NIPs
- [NIP-92](nip-92.md) -- Media Attachments (reuses NIP-94 field vocabulary in `imeta` tags)
- [NIP-71](nip-71.md) -- Video Events (references NIP-94 metadata fields)
- [NIP-96](nip-96.md) -- HTTP File Storage Integration (returns NIP-94 event structures)
- [NIP-B7](nip-B7.md) -- Blossom (recommended file hosting)
