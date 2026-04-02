# NIP-72: Moderated Communities

## Status
Active (draft)

## Summary
NIP-72 defines Reddit-style moderated communities on Nostr. Communities are defined by `kind:34550` addressable events that specify moderators, descriptions, and relay preferences. Users post via NIP-22 `kind:1111` comments scoped to the community, and moderators issue `kind:4550` approval events to curate community content. This enables forum-like spaces with distributed moderation.

## Motivation
Open social feeds lack topical organization and quality control. Users want themed spaces (like subreddits or forums) where they can discuss specific topics with some level of moderation. NIP-72 brings this to Nostr without centralized control -- community owners define moderators, but the moderation is transparent (approval events are public), and users can choose which moderators' approvals to honor.

## Specification

### Event Kinds
| Kind  | Description                  | Type              |
|-------|------------------------------|-------------------|
| 34550 | Community definition         | Addressable event |
| 1111  | Community post (NIP-22)      | Regular event     |
| 4550  | Post approval (moderation)   | Regular event     |

### Tags

**Community Definition (kind:34550):**
| Tag           | Format                                                              | Description |
|---------------|---------------------------------------------------------------------|-------------|
| `d`           | `["d", "<community-identifier>"]`                                   | Unique community identifier. MAY double as the name. |
| `name`        | `["name", "<display-name>"]`                                        | Community display name (preferred over `d` for display) |
| `description` | `["description", "<community description>"]`                        | Community description |
| `image`       | `["image", "<url>", "<WxH>"]`                                      | Community image with optional dimensions |
| `p`           | `["p", "<moderator-pubkey>", "<relay-url>", "moderator"]`          | Moderator designation (4th element = "moderator") |
| `relay`       | `["relay", "<relay-url>", "<marker>"]`                              | Community relays. Markers: `"author"`, `"requests"`, `"approvals"`, or omitted for general |

**Community Post (kind:1111, NIP-22):**
| Tag | Description |
|-----|-------------|
| `A` | (uppercase) Community definition reference -- always scoped to the community |
| `a` | (lowercase) For top-level posts: same as `A`. For replies: the parent post/reply |
| `P` | (uppercase) Community author pubkey |
| `p` | (lowercase) For top-level: community author. For replies: parent author |
| `K` | (uppercase) `"34550"` (community kind) |
| `k` | (lowercase) For top-level: `"34550"`. For replies: parent event kind |
| `e` | Parent event ID (for nested replies) |

**Post Approval (kind:4550):**
| Tag | Description |
|-----|-------------|
| `a` | Community definition reference (`34550:<pubkey>:<d-tag>`) |
| `e` | Post event ID being approved |
| `p` | Post author pubkey (for notification) |
| `k` | Original post's event kind string |

### Protocol Flow
1. **Community creation**: An owner publishes a `kind:34550` event defining the community name, description, image, moderators (`p` tags with "moderator" role), and preferred relays.
2. **Top-level posting**: A user publishes a `kind:1111` event with both uppercase `A`/`P`/`K` and lowercase `a`/`p`/`k` tags pointing to the community definition.
3. **Nested replies**: A user publishes a `kind:1111` event with uppercase tags still pointing to the community definition, but lowercase tags pointing to the parent post/reply.
4. **Moderation (approval)**: A moderator publishes a `kind:4550` event with an `a` tag for the community, an `e` tag for the post, the post author's `p` tag, and a `k` tag for the post kind. The `.content` SHOULD contain the full JSON-stringified approved event.
5. **Display**: Clients fetch community posts and filter based on approval events from the community's designated moderators.
6. **Cross-posting**: Users MAY cross-post to multiple communities using NIP-18 `kind:6` or `kind:16` reposts with community `a` tags.

### JSON Examples

**Community Definition:**
```json
{
  "kind": 34550,
  "created_at": 1690000000,
  "tags": [
    ["d", "bitcoin-dev"],
    ["name", "Bitcoin Development"],
    ["description", "A community for Bitcoin protocol development discussion"],
    ["image", "https://example.com/btc-dev.png", "512x512"],
    ["p", "mod1-pubkey-hex", "wss://relay.example.com", "moderator"],
    ["p", "mod2-pubkey-hex", "wss://relay.example.com", "moderator"],
    ["p", "mod3-pubkey-hex", "", "moderator"],
    ["relay", "wss://relay.example.com/authors", "author"],
    ["relay", "wss://relay.example.com/requests", "requests"],
    ["relay", "wss://relay.example.com/approvals", "approvals"],
    ["relay", "wss://general.relay.com"]
  ],
  "content": "",
  "pubkey": "community-owner-pubkey",
  "id": "...",
  "sig": "..."
}
```

**Top-level post to a community:**
```json
{
  "kind": 1111,
  "tags": [
    ["A", "34550:community-owner-pubkey:bitcoin-dev", "wss://relay.example.com"],
    ["a", "34550:community-owner-pubkey:bitcoin-dev", "wss://relay.example.com"],
    ["P", "community-owner-pubkey", "wss://relay.example.com"],
    ["p", "community-owner-pubkey", "wss://relay.example.com"],
    ["K", "34550"],
    ["k", "34550"]
  ],
  "content": "Hi everyone. It's great to be here!",
  "pubkey": "poster-pubkey",
  "created_at": 1690001000,
  "id": "...",
  "sig": "..."
}
```

**Nested reply to a community post:**
```json
{
  "kind": 1111,
  "tags": [
    ["A", "34550:community-owner-pubkey:bitcoin-dev", "wss://relay.example.com"],
    ["P", "community-owner-pubkey", "wss://relay.example.com"],
    ["K", "34550"],
    ["e", "parent-post-event-id", "wss://relay.example.com"],
    ["p", "parent-post-author-pubkey", "wss://relay.example.com"],
    ["k", "1111"]
  ],
  "content": "Agreed! Welcome everyone!",
  "pubkey": "replier-pubkey",
  "created_at": 1690002000,
  "id": "...",
  "sig": "..."
}
```

**Post approval by a moderator:**
```json
{
  "kind": 4550,
  "pubkey": "mod1-pubkey-hex",
  "tags": [
    ["a", "34550:community-owner-pubkey:bitcoin-dev", "wss://relay.example.com"],
    ["e", "approved-post-event-id", "wss://relay.example.com"],
    ["p", "post-author-pubkey", "wss://relay.example.com"],
    ["k", "1111"]
  ],
  "content": "{\"kind\":1111,\"content\":\"Hi everyone...\",\"tags\":[...],\"pubkey\":\"...\",\"id\":\"...\",\"sig\":\"...\"}",
  "created_at": 1690003000,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes
- **Relay markers**: The `relay` tag supports markers `"author"` (relay hosting the community owner's kind 0), `"requests"` (where posts are submitted), and `"approvals"` (where approval events are published).
- **Moderator rotation**: If the full moderator set is rotated, new moderators must sign new approvals for existing posts, or the community effectively restarts. The owner can periodically re-sign moderator approvals as a backup.
- **Multiple moderator approvals**: It is recommended that multiple moderators approve posts to prevent content loss when a moderator is removed.
- **Approval of replaceable events**: Can be done by `e` tag (approves specific version), `a` tag (approves the author to make future changes), or both.
- **Content in approvals**: The `.content` of a `kind:4550` approval MUST contain the full JSON-stringified approved event when using `e` tags, since relays may have deleted older versions.
- **Backward compatibility**: Previously `kind:1` events were used for community posts. Clients MAY still query for `kind:1` with community `a` tags, but SHOULD NOT create new ones. Use `kind:1111` for all new posts.
- **Cross-posting**: Supported via NIP-18 reposts. The repost content must be the original event, not an approval event.

## Client Behavior
- Clients MUST use `kind:1111` (NIP-22) for new community posts, not `kind:1`.
- Clients SHOULD display only approved posts by default (from community-defined moderators).
- Clients MAY allow users to view unapproved posts separately.
- Clients MAY honor approval events from non-moderator pubkeys at the user's discretion.
- Clients SHOULD display the community `name` tag if available, falling back to the `d` tag.
- Clients SHOULD evaluate non-`34550:*` `a` tags as posts to be approved for all `34550:*` `a` tags in the same event.
- Clients SHOULD support nested reply threading within communities.

## Relay Behavior
- Relays MUST treat `kind:34550` as an addressable event.
- Relays SHOULD index `a`, `e`, and `p` tags on `kind:4550` approval events.
- Relays MAY specialize as community relays, accepting posts and approvals for specific communities.

## Dependencies
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comments (`kind:1111` for community posts and replies)
- [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) -- Event deletion (moderators can delete approvals)
- [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) -- Reposts (for cross-posting)

## Source Code References
- **nostr-tools** (JS): Kind constants 34550, 4550, community helper functions
- **rust-nostr**: Community definition and approval event types
- **go-nostr**: Standard addressable event handling

## Related NIPs
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comments
- [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) -- Reposts (cross-posting)
- [NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md) -- Relay-based groups (alternative group model)
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (kind:10004 communities list)
