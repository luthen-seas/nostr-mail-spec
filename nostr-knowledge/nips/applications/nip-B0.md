# NIP-B0: Web Bookmarks

## Status
Active (Draft, Optional)

## Summary
NIP-B0 defines `kind:39701` addressable events for storing web bookmarks on Nostr. Each bookmark stores a URL (without the scheme) in the `d` tag, an optional description in `.content`, and metadata like title and topic tags. This provides a decentralized, censorship-resistant alternative to centralized bookmarking services.

## Motivation
Web bookmarks are a fundamental part of how people curate and share information online. Existing bookmark services (Pocket, Raindrop, browser sync) are centralized and can censor, disappear, or lock users in. NIP-B0 allows users to store bookmarks on Nostr relays under their own keypair, making them portable, socially shareable, and resistant to platform risk. Because bookmarks are addressable events keyed by URL, they can be updated in place and discovered by topic.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `39701` | Addressable | Web bookmark for an HTTP/HTTPS URI |

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | **Yes** | The bookmarked URL without the scheme (e.g., `alice.blog/post`). The scheme is assumed to be `https://` (falling back to `http://`). |
| `title` | Optional | Human-readable title for the bookmark |
| `t` | Optional (repeatable) | Topic/hashtag tags for categorization |
| `published_at` | Optional | Unix timestamp (as a string) of when the bookmark was first published |

The `.content` field contains a detailed description of the bookmark. It may be empty.

### Protocol Flow

1. A user wants to bookmark a web page.
2. The client strips the URL scheme and uses the remainder as the `d` tag value.
3. The client publishes a `kind:39701` event with the `d` tag, optional metadata tags, and an optional description in `.content`.
4. To update a bookmark (change title, description, or tags), the client publishes a new `kind:39701` event with the same `d` tag -- the addressable event semantics ensure the old version is replaced.
5. To discover bookmarks, clients query by `kind:39701` filtered by author, `#t` (topics), or `#d` (specific URLs).
6. Replies/comments on bookmarks use `kind:1111` events per NIP-22.

### JSON Examples

**Complete bookmark event:**
```json
{
  "kind": 39701,
  "id": "d7a92714f81d0f712e715556aee69ea6da6bfb287e6baf794a095d301d603ec7",
  "pubkey": "2729620da105979b22acfdfe9585274a78c282869b493abfa4120d3af2061298",
  "created_at": 1738869705,
  "tags": [
    ["d", "alice.blog/post"],
    ["published_at", "1738863000"],
    ["title", "Blog insights by Alice"],
    ["t", "post"],
    ["t", "insight"]
  ],
  "content": "A marvelous insight by Alice about the nature of blogs and posts.",
  "sig": "36d34e6448fe0223e9999361c39c492a208bc423d2fcdfc2a3404e04df7c22dc65bbbd62dbe8a4373c62e4d29aac285b5aa4bb9b4b8053bd6207a8b45fbd0c98"
}
```

**Minimal bookmark (no description):**
```json
{
  "kind": 39701,
  "pubkey": "<user-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["d", "bitcoin.org/whitepaper"]
  ]
}
```

## Implementation Notes

- **URL normalization:** The `d` tag contains the URL without the scheme. Clients should normalize URLs consistently (e.g., strip trailing slashes, lowercase the host) to avoid duplicate bookmarks for the same page.
- **Scheme assumption:** `https://` is assumed. If the page is only available via `http://`, clients should handle this gracefully, but the `d` tag still omits the scheme.
- **Comments use NIP-22:** Replies to bookmark events MUST use `kind:1111` comment events, not `kind:1` text notes. This is a hard requirement of the spec.
- **Discovery:** Bookmarks can be discovered socially -- browse a user's bookmarks by their pubkey, or search by topic tags across all users.

## Client Behavior

- Clients MUST use the URL without scheme as the `d` tag value.
- Clients MUST use `kind:1111` (NIP-22) for replies/comments on bookmark events.
- Clients SHOULD normalize URLs to prevent duplicate bookmarks.
- Clients SHOULD display the `title` tag as the primary bookmark label.
- Clients MAY provide import/export functionality for standard bookmark formats (e.g., Netscape HTML bookmark files).
- Clients MAY render a preview of the bookmarked page (fetching Open Graph metadata, etc.).

## Relay Behavior

- Relays MUST treat `kind:39701` as an addressable event, replacing older events with the same `pubkey` + `d` tag.
- Relays SHOULD support `#t` and `#d` tag filters for bookmark discovery.

## Dependencies

- **NIP-01** -- Basic protocol, addressable event semantics
- **NIP-22** -- Comments (`kind:1111`) for replies to bookmarks

## Source Code References

- **nostr-tools:** No dedicated NIP-B0 module; bookmarks are standard addressable events constructed with `kind:39701`.
- **rust-nostr:** Standard `EventBuilder` with kind `39701`.

## Related NIPs

- **NIP-01** -- Addressable event replacement
- **NIP-22** -- Comment events (required for bookmark replies)
- **NIP-51** -- Lists (an alternative approach to bookmarking using curated lists)
- **NIP-78** -- Application-specific data (alternative general-purpose storage)
