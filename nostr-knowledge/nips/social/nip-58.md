# NIP-58: Badges

## Status
Active

## Summary
NIP-58 defines a badge system for Nostr where issuers can create badge definitions (`kind:30009`), award them to users (`kind:8`), and users can curate which badges to display on their profiles (`kind:30008`). Badges are non-transferable and immutable once awarded, enabling recognition, achievement, and reputation systems.

## Motivation
Social platforms benefit from visual recognition systems. Badges can represent achievements, community membership, event participation, certifications, or any form of recognition. NIP-58 provides a decentralized badge system where anyone can be an issuer, users control which badges they display, and clients can choose which issuers to trust -- mirroring the trust-based philosophy of Nostr.

## Specification

### Event Kinds
| Kind  | Description           | Type              |
|-------|-----------------------|-------------------|
| 30009 | Badge Definition      | Addressable event |
| 8     | Badge Award           | Regular event     |
| 30008 | Profile Badges        | Addressable event |

### Tags

**Badge Definition (kind:30009):**
| Tag           | Description                                            | Required |
|---------------|--------------------------------------------------------|----------|
| `d`           | Unique identifier for the badge (e.g., "bravery")     | Yes      |
| `name`        | Human-readable badge name                              | Optional |
| `description` | Human-readable badge description                       | Optional |
| `image`       | Badge image URL (recommended: 1024x1024)               | Optional |
| `thumb`       | Thumbnail image URL(s) at various sizes                | Optional |

**Badge Award (kind:8):**
| Tag | Description                                                            | Required |
|-----|------------------------------------------------------------------------|----------|
| `a` | Reference to the badge definition (`30009:<issuer-pubkey>:<d-tag>`)    | Yes      |
| `p` | Pubkey(s) of badge recipient(s)                                        | Yes      |

**Profile Badges (kind:30008):**
| Tag | Description                                                            | Required |
|-----|------------------------------------------------------------------------|----------|
| `d` | Must be `"profile_badges"`                                             | Yes      |
| `a` | Reference to a badge definition (paired with next `e` tag)            | Yes      |
| `e` | Reference to the specific badge award event (paired with previous `a`) | Yes      |

### Protocol Flow
1. **Badge creation**: An issuer publishes a `kind:30009` event with a unique `d` tag, badge name, description, and image.
2. **Badge awarding**: The issuer publishes a `kind:8` event with an `a` tag referencing their badge definition and one or more `p` tags for recipients.
3. **Badge acceptance/display**: A recipient publishes a `kind:30008` event with `d` = `"profile_badges"`, containing ordered pairs of `a` tags (badge definitions) and `e` tags (specific award events) for badges they want to display.
4. **Verification**: Clients verify that: (a) the badge definition exists, (b) the award was issued by the definition's creator, and (c) the award includes the displaying user's pubkey.

### Thumbnail Recommendations
Issuers SHOULD provide thumbnails at these sizes:
- 512x512
- 256x256
- 64x64
- 32x32
- 16x16

Clients SHOULD render high-resolution versions on user interaction (click/hover).

### JSON Examples

**Badge Definition:**
```json
{
  "kind": 30009,
  "pubkey": "issuer-pubkey-hex",
  "created_at": 1690000000,
  "content": "",
  "tags": [
    ["d", "bravery"],
    ["name", "Medal of Bravery"],
    ["description", "Awarded to users demonstrating exceptional bravery"],
    ["image", "https://example.com/badges/bravery-1024.png", "1024x1024"],
    ["thumb", "https://example.com/badges/bravery-512.png", "512x512"],
    ["thumb", "https://example.com/badges/bravery-256.png", "256x256"],
    ["thumb", "https://example.com/badges/bravery-64.png", "64x64"],
    ["thumb", "https://example.com/badges/bravery-32.png", "32x32"],
    ["thumb", "https://example.com/badges/bravery-16.png", "16x16"]
  ],
  "id": "...",
  "sig": "..."
}
```

**Badge Award:**
```json
{
  "kind": 8,
  "pubkey": "issuer-pubkey-hex",
  "created_at": 1690001000,
  "content": "",
  "tags": [
    ["a", "30009:issuer-pubkey-hex:bravery"],
    ["p", "recipient-pubkey-1"],
    ["p", "recipient-pubkey-2"],
    ["p", "recipient-pubkey-3"]
  ],
  "id": "...",
  "sig": "..."
}
```

**Profile Badges (user displaying their badges):**
```json
{
  "kind": 30008,
  "pubkey": "recipient-pubkey-1",
  "created_at": 1690002000,
  "content": "",
  "tags": [
    ["d", "profile_badges"],
    ["a", "30009:issuer-pubkey-hex:bravery"],
    ["e", "badge-award-event-id-for-bravery", "wss://relay.example.com"],
    ["a", "30009:another-issuer:early-adopter"],
    ["e", "badge-award-event-id-for-early-adopter", "wss://relay.example.com"]
  ],
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes
- Badge awards are immutable and non-transferable -- once issued, they cannot be revoked by the issuer (though the issuer can delete the award event via NIP-09).
- The `kind:30008` profile badges event uses `d` = `"profile_badges"`, meaning each user has exactly one profile badges display event.
- The `a` and `e` tags in profile badges are ordered pairs: each `a` tag is immediately followed by the corresponding `e` tag.
- Badge images should be high-quality; the recommended primary image size is 1024x1024.
- Clients may choose to whitelist certain badge issuers to maintain exclusivity and prevent badge spam.
- A single `kind:8` award event can award to multiple recipients simultaneously.
- The ordering of badge pairs in `kind:30008` determines display priority -- badges listed first are more prominent.

## Client Behavior
- Clients SHOULD display badges on user profiles from their `kind:30008` event.
- Clients SHOULD verify badge legitimacy: check that the award was issued by the badge definition creator and includes the user's pubkey.
- Clients MAY whitelist trusted badge issuers for prominent display.
- Clients SHOULD adjust badge display based on available space (show fewer badges in compact views).
- Clients SHOULD render high-resolution badge images on user interaction (click, hover, long-press).
- Clients MAY provide UI for users to select which awarded badges to display.

## Relay Behavior
- Relays MUST treat `kind:30009` (badge definitions) and `kind:30008` (profile badges) as addressable events.
- Relays SHOULD index `a` and `p` tags on `kind:8` award events for efficient querying.

## Dependencies
- None (NIP-58 is self-contained, though NIP-09 can be used for deletion)

## Source Code References
- **nostr-tools** (JS): Badge-related kind constants (30009, 8, 30008)
- **rust-nostr**: `Kind::BadgeDefinition`, `Kind::BadgeAward`, `Kind::ProfileBadges`
- **go-nostr**: Standard addressable event handling

## Related NIPs
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Basic event structure
- [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) -- Event deletion (can revoke badge awards)
- [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) -- Parameterized replaceable events (badge definitions and profile badges are addressable)
