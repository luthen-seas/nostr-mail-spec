# NIP-48: Proxy Tags

## Status
Active (draft, optional)

## Summary
NIP-48 defines the `proxy` tag for Nostr events that originate from external protocols (ActivityPub, AT Protocol, RSS, Web). The tag format is `["proxy", <id>, <protocol>]`, where the ID is a universally unique identifier from the source protocol. This enables clients to reconcile duplicated content bridged from other networks and optionally link back to the source object.

## Motivation
Nostr bridges (like Mostr for ActivityPub) bring content from external social protocols into the Nostr network. Without a standardized way to mark bridged content and reference the original source, clients cannot tell the difference between native Nostr content and bridged content, leading to duplicated posts, broken attribution, and no way to trace content back to its origin. NIP-48 solves this by providing a simple tag that identifies the source protocol and object.

## Specification

### Event Kinds

NIP-48 does not define new event kinds. The `proxy` tag can be applied to any event kind that represents bridged content.

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `proxy` | `["proxy", "<source-id>", "<protocol>"]` | References the original object in the source protocol |

**Supported protocols and their ID formats:**

| Protocol | Value | ID Format | Example ID |
|----------|-------|-----------|------------|
| ActivityPub | `activitypub` | URL (Activity or Object ID) | `https://mastodon.social/users/alice/statuses/123456` |
| AT Protocol | `atproto` | AT URI | `at://did:plc:abc123/app.bsky.feed.post/xyz789` |
| RSS | `rss` | URL with guid fragment | `https://example.com/feed.xml#item-abc123` |
| Web | `web` | URL | `https://example.com/article/my-post` |

The ID MUST be universally unique within the source protocol.

### Protocol Flow

**Bridge creates a Nostr event from external content:**
1. Bridge monitors external protocol (e.g., ActivityPub) for new posts
2. Bridge receives a new post from the external network
3. Bridge creates a Nostr event (typically `kind:1`) with the post content
4. Bridge adds `["proxy", "<source-url>", "<protocol>"]` tag
5. Bridge publishes the event to Nostr relays

**Client encounters a bridged event:**
1. Client receives an event with a `proxy` tag
2. Client may display an indicator that this content is bridged
3. Client may provide a link to the original source object
4. Client may deduplicate if the same external content appears from multiple bridges

### JSON Examples

**ActivityPub post bridged to Nostr:**
```json
{
  "kind": 1,
  "content": "Hello from Mastodon! This post was bridged to Nostr.",
  "tags": [
    ["proxy", "https://mastodon.social/users/alice/statuses/109876543210", "activitypub"]
  ],
  "pubkey": "bridge-pubkey-hex...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**AT Protocol (Bluesky) post bridged to Nostr:**
```json
{
  "kind": 1,
  "content": "This was originally posted on Bluesky.",
  "tags": [
    ["proxy", "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3k2la5jxx6s2y", "atproto"]
  ],
  "pubkey": "bridge-pubkey-hex...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**RSS feed item bridged to Nostr:**
```json
{
  "kind": 1,
  "content": "New blog post: Understanding Decentralized Protocols",
  "tags": [
    ["proxy", "https://blog.example.com/feed.xml#understanding-decentralized-protocols", "rss"],
    ["r", "https://blog.example.com/understanding-decentralized-protocols"]
  ],
  "pubkey": "bridge-pubkey-hex...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Web page content bridged to Nostr:**
```json
{
  "kind": 30023,
  "content": "Full article content here...",
  "tags": [
    ["d", "web-example-article"],
    ["proxy", "https://example.com/articles/my-great-article", "web"],
    ["title", "My Great Article"]
  ],
  "pubkey": "bridge-pubkey-hex...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Multiple proxy tags (content exists on multiple external platforms):**
```json
{
  "kind": 1,
  "content": "This content exists on multiple platforms.",
  "tags": [
    ["proxy", "https://mastodon.social/users/alice/statuses/109876543210", "activitypub"],
    ["proxy", "at://did:plc:abc123/app.bsky.feed.post/xyz789", "atproto"]
  ],
  "pubkey": "bridge-pubkey-hex...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes

1. **Deduplication:** If a client sees multiple Nostr events with `proxy` tags pointing to the same source ID, they likely represent the same content bridged by different bridges. Clients should deduplicate based on the proxy ID.

2. **Bridge identity:** The `pubkey` of bridged events belongs to the bridge, not the original author. Clients should be aware that the event author may be a bridge service.

3. **Protocol extensibility:** The protocol string is not limited to the four listed protocols. New protocols can be added as needed. Unknown protocol values should be handled gracefully.

4. **Source verification:** The proxy tag is self-reported by the bridge. There is no cryptographic proof that the source content actually exists. Clients should treat this as a hint, not a guarantee.

5. **FEP-fffd:** NIP-48 references FEP-fffd, a Fediverse Enhancement Proposal about proxy objects that provides complementary standards from the ActivityPub side.

6. **Mostr bridge:** The Mostr bridge (mostr.pub) is a prominent implementation that bridges ActivityPub and Nostr, using NIP-48 proxy tags.

## Client Behavior

- Clients MAY display an indicator (badge, icon) that an event is bridged from another protocol
- Clients MAY provide a link to the original source object using the proxy tag ID
- Clients MAY deduplicate events with matching proxy tag IDs
- Clients MAY filter or categorize bridged content separately from native Nostr content
- Clients SHOULD handle unknown protocol values gracefully (display or ignore)

## Relay Behavior

- Relays have no special behavior for proxy tags
- Relays index the `proxy` tag like any other tag (though it is not a single-letter tag, so it is NOT indexed by default per NIP-01 rules)

## Dependencies
- NIP-01: Base protocol (event structure, tag system)

## Source Code References

- **nostr-tools (JS):** No dedicated file; proxy is a standard tag
- **rust-nostr:** Tag handling
- **Mostr bridge:** Reference implementation for ActivityPub bridging

## Related NIPs
- NIP-01: Base protocol
- NIP-24: Extra metadata (r tag for URL references)
- NIP-31: Dealing with Unknown Events (alt tag for fallback display of bridged content)
