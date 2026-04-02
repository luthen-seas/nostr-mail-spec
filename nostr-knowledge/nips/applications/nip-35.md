# NIP-35: Torrents

## Status
Draft / Optional

## Summary
NIP-35 defines a torrent indexing protocol on NOSTR using kind 2003 events. Each event contains enough metadata to search for content and construct a magnet link, including the BitTorrent info hash, file listings, tracker URLs, and external database identifiers. Kind 2004 events provide a commenting system for torrents.

## Motivation
Centralized torrent indexing sites are frequent targets for takedowns and censorship. By moving the torrent index onto NOSTR, the metadata becomes distributed across relays and resistant to single-point censorship. Users can discover, share, and comment on torrents using their NOSTR identity, and the protocol's relay architecture provides natural redundancy.

## Specification

### Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 2003 | Torrent | Torrent metadata and index entry |
| 2004 | Torrent Comment | Comment/review on a torrent (follows NIP-10 threading) |

### Tags

#### Torrent Event (2003) Tags

| Tag | Required | Repeatable | Format | Description |
|-----|----------|------------|--------|-------------|
| `title` | Yes | No | `["title", "<torrent-title>"]` | Human-readable title of the torrent |
| `x` | Yes | No | `["x", "<info-hash>"]` | V1 BitTorrent info hash (as seen in magnet links) |
| `file` | Yes | Yes | `["file", "<file-path>", "<size-bytes>"]` | File entry with full path and size in bytes |
| `tracker` | No | Yes | `["tracker", "<tracker-url>"]` | Tracker URL |
| `i` | No | Yes | `["i", "<prefix>:<value>"]` | External database identifier (see below) |
| `t` | No | Yes | `["t", "<tag>"]` | Searchable category/hashtag |

**Content:** The `content` field contains a long-form, pre-formatted description of the torrent.

#### External Identifier Prefixes (`i` tag)

| Prefix | Description | Example |
|--------|-------------|---------|
| `tcat` | Comma-separated category path | `tcat:video,movie,4k` |
| `newznab` | Newznab category ID | `newznab:2045` |
| `tmdb` | The Movie Database | `tmdb:movie:693134` |
| `ttvdb` | TheTVDB | `ttvdb:movie:290272` |
| `imdb` | IMDB identifier | `imdb:tt15239678` |
| `mal` | MyAnimeList | `mal:anime:9253` or `mal:manga:17517` |
| `anilist` | AniList identifier | `anilist:anime:12345` |

Multi-type databases (tmdb, ttvdb, mal) use a second-level type prefix: `<db>:<type>:<id>`.

### Protocol Flow

1. **Uploader creates a torrent** using standard BitTorrent tools, obtaining the info hash.
2. **Uploader publishes a kind 2003 event** with the info hash (`x` tag), file listing (`file` tags), optional trackers, external identifiers, and category tags.
3. **Searchers query relays** filtering on kind 2003 with `t` tags, `i` tags, or text search on the `title` tag.
4. **Client constructs a magnet link** from the `x` tag and `tracker` tags: `magnet:?xt=urn:btih:<info-hash>&tr=<tracker>&tr=<tracker>`.
5. **Users comment** by publishing kind 2004 events that reference the kind 2003 event using NIP-10 conventions.

### JSON Examples

**Torrent Event:**
```json
{
  "kind": 2003,
  "content": "A high-quality 4K release of the latest blockbuster film with HDR and surround sound.",
  "tags": [
    ["title", "Example Movie 2024 2160p UHD BluRay"],
    ["x", "aabbccdd00112233445566778899aabbccddeeff"],
    ["file", "Example.Movie.2024.2160p.mkv", "15234567890"],
    ["file", "Example.Movie.2024.srt", "45678"],
    ["tracker", "udp://tracker.example.com:1337"],
    ["tracker", "http://announce.example.net/announce"],
    ["i", "tcat:video,movie,4k"],
    ["i", "newznab:2045"],
    ["i", "imdb:tt15239678"],
    ["i", "tmdb:movie:693134"],
    ["i", "ttvdb:movie:290272"],
    ["t", "movie"],
    ["t", "4k"],
    ["t", "hdr"]
  ]
}
```

**Torrent Comment:**
```json
{
  "kind": 2004,
  "content": "Great quality release, audio is excellent. Seeds are fast.",
  "tags": [
    ["e", "<kind-2003-event-id>", "wss://relay.example.com", "root"]
  ]
}
```

**Magnet Link Construction:**
Given the example above, the resulting magnet link would be:
```
magnet:?xt=urn:btih:aabbccdd00112233445566778899aabbccddeeff&tr=udp://tracker.example.com:1337&tr=http://announce.example.net/announce
```

## Implementation Notes

- The `x` tag contains the **V1 BitTorrent info hash** only. V2 info hashes are not currently specified.
- File sizes in `file` tags are in **bytes** as strings.
- The `tcat` prefix uses comma-separated hierarchical categories (e.g., `video,movie,4k` represents Video > Movie > 4K).
- Multi-type database identifiers require the type in the second position (e.g., `tmdb:movie:693134` not `tmdb:693134`).
- Clients should be prepared for torrents with many files -- some torrents contain thousands of file entries.
- There is no built-in mechanism for verifying that an info hash is correct or that files match; this is inherent to the BitTorrent protocol itself.
- Torrent comments (kind 2004) follow NIP-10 threading, meaning threaded discussions are possible.

## Client Behavior

- Clients SHOULD construct magnet links from the `x` and `tracker` tags for user convenience.
- Clients SHOULD display file listings with human-readable sizes.
- Clients MAY use `i` tags to fetch rich metadata (movie posters, descriptions) from external databases.
- Clients SHOULD support filtering/searching by `t` tags and `i` tag prefixes.
- Clients MAY integrate with local BitTorrent clients to initiate downloads directly.
- Clients SHOULD render kind 2004 comments as threaded discussions attached to the torrent.

## Relay Behavior

- Relays SHOULD accept kind 2003 and 2004 events like any standard event.
- Relays MAY implement search indexes on `title`, `t`, and `i` tags for efficient torrent discovery.
- No special validation is required.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-10** -- Threading for torrent comments (kind 2004)
- **BitTorrent protocol** -- For info hash format and magnet link construction

## Source Code References

- **dtan.xyz** -- Web client implementing NIP-35 torrent indexing
- **nostrudel.ninja** -- Another client with NIP-35 support
- **nostr-tools**: No dedicated NIP-35 module; kind constants may be defined in kind enumerations

## Related NIPs

- **NIP-01** -- Basic protocol flow and event structure
- **NIP-10** -- Reply threading for torrent comments
- **NIP-36** -- Sensitive content / content warning (useful for NSFW torrent content)
