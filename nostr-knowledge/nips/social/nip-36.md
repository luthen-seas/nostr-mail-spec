# NIP-36: Sensitive Content

## Status
Active

## Summary
NIP-36 defines the `content-warning` tag for marking Nostr events as containing sensitive material that should be hidden behind a user interaction (click-to-reveal). It integrates with NIP-32 labeling to provide more granular content classification. This is the Nostr equivalent of content warnings or NSFW flags found on other platforms.

## Motivation
Not all content is appropriate for all audiences or contexts. Users need a way to mark their content as potentially sensitive (nudity, violence, spoilers, disturbing imagery, etc.) so that clients can hide it behind a consent barrier. Without a standard mechanism, each client would implement its own incompatible approach, or sensitive content would simply appear unfiltered.

## Specification

### Event Kinds
NIP-36 does not define its own event kind. The `content-warning` tag can be applied to ANY event kind.

### Tags
| Tag               | Format                                               | Description |
|-------------------|------------------------------------------------------|-------------|
| `content-warning` | `["content-warning", "<optional-reason>"]`           | Marks the event as containing sensitive content. The reason is optional but recommended. |
| `L`               | `["L", "content-warning"]`                           | NIP-32 namespace declaration for content warning classification |
| `l`               | `["l", "<classification>", "content-warning"]`       | NIP-32 label for specific content warning type (e.g., "nudity", "profanity") |

### Protocol Flow
1. **Author creates sensitive content**: When publishing an event with sensitive material, the author includes a `content-warning` tag with an optional human-readable reason.
2. **Optional classification**: The author MAY additionally include NIP-32 `L` and `l` tags to categorize the type of sensitive content more precisely.
3. **Client rendering**: When displaying an event with a `content-warning` tag, the client hides the content behind a notice/overlay showing the reason (if provided) and requires user interaction to reveal it.

### JSON Examples

**Event with a content warning and NIP-32 classification:**
```json
{
  "kind": 1,
  "pubkey": "a695bb1c2282fc5e9aee0b7c9e41e4a0daa89fb4be0dbc0e40f26a834b68b26",
  "created_at": 1690000000,
  "content": "This contains sensitive imagery...",
  "tags": [
    ["t", "nsfw"],
    ["L", "content-warning"],
    ["l", "nudity", "content-warning"],
    ["content-warning", "nudity"]
  ],
  "id": "...",
  "sig": "..."
}
```

**Simple content warning without classification:**
```json
{
  "kind": 1,
  "content": "Spoiler for the latest episode...",
  "tags": [
    ["content-warning", "spoiler"]
  ]
}
```

**Content warning with no reason:**
```json
{
  "kind": 1,
  "content": "...",
  "tags": [
    ["content-warning"]
  ]
}
```

## Implementation Notes
- The `content-warning` tag with an empty or missing reason string should still trigger content hiding -- the absence of a reason does not mean the content is safe.
- The NIP-32 `l` tag values in the `content-warning` namespace are not strictly enumerated. Common values include `nudity`, `profanity`, `violence`, `spoiler`, etc.
- Third-party labelers (via NIP-32 `kind:1985` events) can also apply content warning labels to events they did not author, enabling community moderation.
- This is a cooperative mechanism -- it relies on authors self-reporting. Automated or community-driven labeling via NIP-32 complements it.

## Client Behavior
- Clients MUST hide/blur content of events that include a `content-warning` tag until the user explicitly chooses to view it.
- Clients SHOULD display the reason string (if provided) on the content warning overlay.
- Clients MAY allow users to configure auto-reveal for certain content warning types.
- Clients MAY allow users to globally disable content warnings (show all content immediately).
- Clients SHOULD also check NIP-32 labels from trusted labelers for additional content warnings.

## Relay Behavior
- Relays have no special behavior requirements for NIP-36.
- Relays MAY index `content-warning` tags for filtering purposes.
- Relays MAY use NIP-32 labels from trusted sources to apply their own content policies.

## Dependencies
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling (for structured content classification)

## Source Code References
- **nostr-tools** (JS): Content warning tag helpers
- **rust-nostr**: Content warning tag handling in event builders
- **go-nostr**: Standard tag handling

## Related NIPs
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling
- [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) -- Reporting (reporting sensitive content)
- [NIP-68](https://github.com/nostr-protocol/nips/blob/master/68.md) -- Picture-first feeds (may need content warnings)
