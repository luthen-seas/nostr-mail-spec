# NIP-32: Labeling

## Status
Active

## Summary
NIP-32 defines a system for labeling events, people, relays, and topics using `kind:1985` events with `L` (namespace) and `l` (label) tags. Labels enable distributed content classification, moderation, reviews, and categorization without requiring centralized authority.

## Motivation
Nostr needs a way to classify, annotate, and organize content beyond simple hashtags. Labels provide a flexible framework for distributed moderation (e.g., marking content as NSFW), content categorization (e.g., topic tagging), reviews and ratings, and any other form of metadata annotation. By using namespaces, different systems can label content according to their own vocabularies without conflict.

## Specification

### Event Kinds
| Kind | Description                                |
|------|--------------------------------------------|
| 1985 | Label event (applies labels to targets)    |

Additionally, `L` and `l` tags can appear on ANY event kind for self-reporting purposes (the labels describe the event itself).

### Tags
| Tag | Format                              | Description |
|-----|-------------------------------------|-------------|
| `L` | `["L", "<namespace>"]`              | Declares a label namespace. Recommended to use unambiguous identifiers (ISO standards, reverse domain notation, etc.) |
| `l` | `["l", "<value>", "<namespace>"]`   | The actual label value. The third element (namespace) MUST match an `L` tag when present |
| `e` | `["e", "<event-id>"]`               | Target: labels an event |
| `p` | `["p", "<pubkey>"]`                 | Target: labels a person/pubkey |
| `a` | `["a", "<coordinates>"]`            | Target: labels an addressable event |
| `r` | `["r", "<url>"]`                    | Target: labels a relay or URL |
| `t` | `["t", "<topic>"]`                  | Target: labels a topic/hashtag |

### Protocol Flow
1. **Labeler creates a label event**: Publishes a `kind:1985` event with one or more `L`/`l` tag pairs and one or more target tags (`e`, `p`, `a`, `r`, or `t`) indicating what is being labeled.
2. **Consumers query labels**: Clients or relays query for `kind:1985` events with specific `L` or `l` tags to find labeled content.
3. **Self-reporting**: Any event (not just kind 1985) can include `L` and `l` tags to label itself. When labels appear on non-1985 events, they describe the event in which they appear.

### Namespace Guidelines
- Use short, meaningful label strings.
- Longer discussion about why a label was applied should go in the `.content` field.
- Publishers SHOULD limit labeling events to a single namespace to avoid ambiguity.
- Before creating a new vocabulary, explore existing standards (ISO codes, established ontologies) and reuse them where possible.
- Labels work best when values are not unique identifiers -- places, topics, and categories work well. Specific personal names or numerical IDs are better handled through other mechanisms.

### JSON Examples

**Labeling an event with a content classification:**
```json
{
  "kind": 1985,
  "tags": [
    ["L", "com.example.content-type"],
    ["l", "satire", "com.example.content-type"],
    ["e", "b3e392b11f5d4f28321cedd09303a748acfd0487"]
  ],
  "content": "This is clearly satirical content",
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Labeling a person using ISO language codes:**
```json
{
  "kind": 1985,
  "tags": [
    ["L", "ISO-639-1"],
    ["l", "en", "ISO-639-1"],
    ["l", "pt", "ISO-639-1"],
    ["p", "a695bb1c2282fc5e9aee0b7c9e41e4a0daa89fb4be0dbc0e40f26a834b68b26"]
  ],
  "content": ""
}
```

**Self-reporting labels on a text note:**
```json
{
  "kind": 1,
  "content": "My latest photography...",
  "tags": [
    ["L", "com.example.category"],
    ["l", "photography", "com.example.category"],
    ["t", "photo"]
  ]
}
```

**Labeling a relay:**
```json
{
  "kind": 1985,
  "tags": [
    ["L", "com.example.relay-quality"],
    ["l", "fast", "com.example.relay-quality"],
    ["r", "wss://relay.example.com"]
  ],
  "content": "Very responsive relay"
}
```

## Implementation Notes
- Multiple `l` tags can share the same `L` namespace within a single event, but mixing multiple namespaces in one event is discouraged.
- The `.content` field of a `kind:1985` event can provide human-readable context or reasoning for the label assignment.
- Labels are most powerful when used with well-known namespaces that multiple clients and services agree upon.
- Self-reported labels (on non-1985 events) are inherently less trustworthy than third-party labels.
- Labels are intentionally generic -- they can be used for content warnings (see NIP-36), moderation, reviews, categorization, or any other annotation purpose.

## Client Behavior
- Clients MAY query for `kind:1985` events to discover labels applied to events, people, or relays.
- Clients MAY use labels from trusted labelers to filter, sort, or annotate content.
- Clients MAY display labels alongside content when relevant (e.g., content type indicators).
- Clients SHOULD allow users to configure which labelers they trust.
- Clients SHOULD present self-reported labels differently from third-party labels.

## Relay Behavior
- Relays SHOULD index `L` and `l` tags for efficient querying.
- Relays MAY use label events from trusted sources for content filtering or moderation.
- Relays SHOULD support filtering by both `L` (namespace) and `l` (value) tags.

## Dependencies
- None (NIP-32 is self-contained)

## Source Code References
- **nostr-tools** (JS): Tag construction helpers for `L` and `l` tags
- **rust-nostr**: `Kind::Label` (kind 1985), label tag builders
- **go-nostr**: Standard tag handling

## Related NIPs
- [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md) -- Sensitive Content / Content Warning (uses NIP-32 labels)
- [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) -- Reporting (can use NIP-32 labels for classification)
- [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) -- Moderated Communities (labels can assist moderation)
