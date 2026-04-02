# NIP-56: Reporting

## Status
Active

## Summary
NIP-56 defines `kind:1984` events for reporting users and content that violates community standards or laws. Reports include a mandatory `p` tag for the reported user, optional `e` tags for specific events, and a report type classification. This enables distributed, community-driven content moderation.

## Motivation
Decentralized social networks need a mechanism for users to flag harmful content -- spam, illegal material, impersonation, explicit content, etc. Unlike centralized platforms with a single moderation team, Nostr relies on distributed reporting where clients and relays can choose which reporters to trust. NIP-56 standardizes the report format so that this trust-based moderation can work interoperably across the ecosystem.

## Specification

### Event Kinds
| Kind | Description    |
|------|----------------|
| 1984 | Report event   |

### Tags
| Tag      | Format                                           | Description                                          | Required |
|----------|--------------------------------------------------|------------------------------------------------------|----------|
| `p`      | `["p", "<reported-pubkey>", "<report-type>"]`    | Reported user's pubkey. Report type is the 3rd element. | Yes |
| `e`      | `["e", "<event-id>", "<report-type>"]`           | Specific note being reported. Report type is 3rd element. | Optional (for note reports) |
| `x`      | `["x", "<blob-hash>"]`                           | Hash of reported blob/media                          | Optional |
| `server` | `["server", "<media-url>"]`                      | Media server hosting the reported content            | Optional |
| `l`      | `["l", "<classification>", "<namespace>"]`       | NIP-32 label for further classification              | Optional |
| `L`      | `["L", "<namespace>"]`                           | NIP-32 namespace declaration                         | Optional |

### Report Types
| Type             | Description                                                     |
|------------------|-----------------------------------------------------------------|
| `nudity`         | Depictions of nudity, porn, or explicit content                 |
| `malware`        | Virus, trojan, worm, or other malicious software links          |
| `profanity`      | Profanity, hateful speech, or otherwise objectionable language  |
| `illegal`        | Content that may be illegal in a relevant jurisdiction          |
| `spam`           | Spam or unsolicited bulk content                                |
| `impersonation`  | Someone pretending to be someone else (identity fraud)          |
| `other`          | Reports that do not fit any of the above categories             |

### Protocol Flow
1. **User reports a profile**: Client creates a `kind:1984` event with a `p` tag containing the reported pubkey and the report type as the third element.
2. **User reports a specific note**: Client creates a `kind:1984` event with both a `p` tag (for the author) and an `e` tag (for the specific event), each with the report type as the third element.
3. **Media reporting**: Optionally include `x` tags for blob hashes and `server` tags for media server locations.
4. **Additional classification**: NIP-32 `L` and `l` tags can provide further context.
5. **Consumption**: Clients and relays query for `kind:1984` events from trusted reporters to inform moderation decisions.

### JSON Examples

**Reporting a user for spam:**
```json
{
  "kind": 1984,
  "tags": [
    ["p", "a695bb1c2282fc5e9aee0b7c9e41e4a0daa89fb4be0dbc0e40f26a834b68b26", "spam"]
  ],
  "content": "This account is posting repetitive promotional content.",
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Reporting a specific note for nudity:**
```json
{
  "kind": 1984,
  "tags": [
    ["p", "a695bb1c2282fc5e9aee0b7c9e41e4a0daa89fb4be0dbc0e40f26a834b68b26", "nudity"],
    ["e", "b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87", "nudity"]
  ],
  "content": "Explicit image posted without content warning.",
  "pubkey": "...",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Reporting impersonation:**
```json
{
  "kind": 1984,
  "tags": [
    ["p", "impersonator-pubkey-hex", "impersonation"]
  ],
  "content": "This account is pretending to be @realuser with copied profile information."
}
```

**Reporting with media hash and server:**
```json
{
  "kind": 1984,
  "tags": [
    ["p", "author-pubkey", "illegal"],
    ["e", "event-containing-media", "illegal"],
    ["x", "sha256-hash-of-media-blob"],
    ["server", "https://media.example.com/uploads/offending-file.jpg"]
  ],
  "content": ""
}
```

## Implementation Notes
- Reports are inherently subjective and can be gamed. Relays SHOULD NOT automatically act on reports from untrusted sources.
- Clients can implement friend-of-friend trust: if multiple people you follow report an account for nudity, automatically blur that account's images.
- The `.content` field can contain a human-readable explanation of why the report was filed.
- A single report event can target a user (`p` tag) without an `e` tag -- this reports the user's behavior generally rather than a specific event.
- The `x` tag is useful for identifying the same media across different events or servers.
- Report types are intentionally broad categories. Use NIP-32 labels for more granular classification.

## Client Behavior
- Clients MAY provide a "Report" action on profiles and notes.
- Clients SHOULD let users select the report type from the defined categories.
- Clients MAY use reports from trusted sources (followed users, curated lists) to auto-hide or blur content.
- Clients SHOULD NOT automatically ban or hide content based on a single untrusted report.
- Clients MAY display aggregated report counts or warnings on frequently-reported content.
- Clients SHOULD allow users to configure their trust model for reports.

## Relay Behavior
- Relays SHOULD NOT automatically moderate content based solely on report events, as reports can be weaponized.
- Relays MAY designate trusted moderator pubkeys and act on their reports.
- Relays MAY use aggregated reports from trusted sources to inform content policy.
- Relays SHOULD index `p` and `e` tags on report events for efficient querying.

## Dependencies
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling (optional additional classification)

## Source Code References
- **nostr-tools** (JS): Kind constant 1984, report type constants
- **rust-nostr**: `Kind::Reporting` (kind 1984)
- **go-nostr**: Standard kind handling

## Related NIPs
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling (complementary classification)
- [NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md) -- Sensitive Content (content warnings as an alternative to reports)
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (mute lists for personal moderation)
