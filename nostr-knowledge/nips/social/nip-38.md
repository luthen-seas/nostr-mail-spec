# NIP-38: User Statuses

## Status
Active (draft)

## Summary
NIP-38 defines `kind:30315` addressable events for broadcasting live user statuses, such as what someone is working on, listening to, or their current activity. It supports two primary status types -- "general" and "music" -- with optional expiration times and linked content.

## Motivation
Social platforms benefit from real-time status indicators that show what users are currently doing. NIP-38 enables use cases like: displaying "In a meeting" on profiles, sharing currently playing music (similar to Spotify status on Discord), broadcasting podcast listening activity, and showing real-time activity from calendar or productivity apps. This adds a dynamic, ephemeral layer to otherwise static Nostr profiles.

## Specification

### Event Kinds
| Kind  | Description                    | Type              |
|-------|--------------------------------|-------------------|
| 30315 | User status                    | Addressable event |

### Tags
| Tag          | Description                                                            | Required |
|--------------|------------------------------------------------------------------------|----------|
| `d`          | Status type identifier: `"general"` or `"music"`                       | Yes      |
| `r`          | Link to a URL, profile, note, or addressable event related to status   | Optional |
| `expiration` | Unix timestamp when the status should be considered expired            | Optional |
| `emoji`      | NIP-30 custom emoji tags (if shortcodes are used in content)           | Optional |

### Status Types

**General Status (`d` = `"general"`)**
- Free-form status text like "Working", "Hiking", "At a conference"
- Expiration is optional but recommended

**Music Status (`d` = `"music"`)**
- Designed to broadcast currently playing tracks
- The `expiration` SHOULD be set to when the track stops playing
- The `r` tag can link to the track URL (e.g., Spotify, YouTube, etc.)

### Content Field
- Contains the human-readable status text
- May include NIP-30 custom emoji via `:shortcode:` syntax
- If content is an empty string `""`, the client SHOULD clear/hide the status

### Protocol Flow
1. **User sets a status**: Client publishes a `kind:30315` event with `d` tag set to the status type, content describing the status, and optional `r` and `expiration` tags.
2. **Clients display the status**: Other clients fetch `kind:30315` events for followed users and display the status alongside the username on posts or profiles.
3. **Status updates**: Since it is an addressable event, publishing a new `kind:30315` with the same `d` tag replaces the previous status of that type.
4. **Status clearing**: Publishing with an empty content string clears the status.
5. **Expiration**: Clients SHOULD check the `expiration` tag and hide statuses that have expired.

### JSON Examples

**General status:**
```json
{
  "kind": 30315,
  "content": "Working on NIP implementations",
  "tags": [
    ["d", "general"],
    ["r", "https://github.com/nostr-protocol/nips"]
  ],
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Music status:**
```json
{
  "kind": 30315,
  "content": "Mass in B Minor - Bach",
  "tags": [
    ["d", "music"],
    ["r", "https://open.spotify.com/track/example"],
    ["expiration", "1690003600"]
  ],
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Status with custom emoji:**
```json
{
  "kind": 30315,
  "content": "Coding :nostr: stuff",
  "tags": [
    ["d", "general"],
    ["emoji", "nostr", "https://example.com/emoji/nostr.png"]
  ]
}
```

**Clearing a status:**
```json
{
  "kind": 30315,
  "content": "",
  "tags": [
    ["d", "general"]
  ]
}
```

## Implementation Notes
- Users can have one status per `d` tag value simultaneously (one general, one music).
- Music statuses are inherently ephemeral -- they should always have an expiration matching the track duration.
- The `r` tag is flexible: it can be a web URL, a `nostr:` URI, or any other resource identifier.
- Calendar apps can automatically update general status based on meeting schedules.
- Media players and streaming services can integrate to automatically publish music statuses.
- Statuses are public by design -- there is no encrypted status mechanism.

## Client Behavior
- Clients SHOULD display user statuses alongside usernames on posts and profile pages.
- Clients SHOULD check the `expiration` tag and hide/remove expired statuses.
- Clients SHOULD treat empty content as a status clear signal.
- Clients MAY provide UI for setting general statuses manually.
- Clients MAY integrate with system media players to auto-publish music statuses.
- Clients SHOULD render NIP-30 custom emoji in status content.
- Clients MAY make the `r` tag link clickable.

## Relay Behavior
- Relays MUST treat `kind:30315` as an addressable event, replacing older versions with the same `pubkey` and `d` tag.
- Relays MAY honor the `expiration` tag and garbage-collect expired status events (per NIP-40).

## Dependencies
- [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) -- Custom emoji (for emoji in status content)
- [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) -- Expiration timestamp

## Source Code References
- **nostr-tools** (JS): Kind constant 30315, addressable event handling
- **rust-nostr**: `Kind::UserStatus` or custom kind 30315
- **go-nostr**: Addressable event support

## Related NIPs
- [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) -- Custom Emoji
- [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) -- Expiration Timestamp
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Basic protocol and event structure
