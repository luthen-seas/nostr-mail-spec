# NIP-88: Polls

## Status
Active (draft)

## Summary
NIP-88 defines `kind:1068` events for creating polls and `kind:1018` events for recording votes. Polls support single-choice and multiple-choice formats, specify which relays collect responses, and include an optional end time. Vote tallying follows strict rules: one vote per pubkey, latest timestamp wins for duplicates, and results are sourced only from the poll's specified relays.

## Motivation
Polls are a fundamental social interaction pattern -- gathering opinions from a community on specific questions. NIP-88 brings structured polling to Nostr with safeguards against common issues like double-voting and vote manipulation. By specifying collection relays and strict tallying rules, it creates a reasonably fair polling system on a decentralized protocol.

## Specification

### Event Kinds
| Kind | Description     | Type          |
|------|-----------------|---------------|
| 1068 | Poll event      | Regular event |
| 1018 | Vote response   | Regular event |

### Tags

**Poll Event (kind:1068):**
| Tag        | Format                                         | Description |
|------------|-------------------------------------------------|-------------|
| `option`   | `["option", "<option-id>", "<option-label>"]`  | A poll option. ID is a unique identifier, label is the display text. |
| `relay`    | `["relay", "<relay-url>"]`                     | Relay(s) where responses should be sent and tallied from |
| `polltype` | `["polltype", "<type>"]`                       | `"singlechoice"` or `"multiplechoice"` |
| `endsAt`   | `["endsAt", "<unix-timestamp>"]`               | Optional Unix timestamp when the poll closes |

**Vote Response (kind:1018):**
| Tag        | Format                                         | Description |
|------------|-------------------------------------------------|-------------|
| `e`        | `["e", "<poll-event-id>"]`                     | Reference to the poll being responded to |
| `response` | `["response", "<option-id>"]`                  | The selected option ID (one per selection) |

### Content Field
- **Poll event**: The `.content` contains the poll question.
- **Vote response**: The `.content` is typically empty or may contain optional commentary.

### Poll Types
| Type             | Behavior |
|------------------|----------|
| `singlechoice`   | Only the FIRST `response` tag is counted. Additional tags are ignored. |
| `multiplechoice` | The first occurrence of each unique option ID is counted. Duplicate option IDs are ignored. |

### Vote Tallying Rules
1. Fetch all `kind:1018` events from the relays specified in the poll's `relay` tags.
2. **One vote per pubkey**: Only one vote event per pubkey is counted. If a pubkey has multiple vote events, use the one with the largest (most recent) `created_at` timestamp.
3. For `singlechoice`: Only the first `response` tag in the winning event is counted.
4. For `multiplechoice`: The first occurrence of each unique option ID is counted.
5. Results SHOULD only be sourced from the poll's specified relays.

### Protocol Flow
1. **Poll creation**: A user publishes a `kind:1068` event with the question in `.content`, `option` tags for each choice, `relay` tags specifying where votes should be sent, a `polltype` tag, and an optional `endsAt` timestamp.
2. **Voting**: Voters publish `kind:1018` events to the specified relays with an `e` tag referencing the poll and `response` tag(s) with their chosen option ID(s).
3. **Tallying**: Clients fetch all `kind:1018` events from the specified relays referencing the poll, deduplicate by pubkey (latest timestamp wins), and count according to poll type rules.
4. **Display**: Clients show results as percentages, bar charts, or other visualizations.

### JSON Examples

**Single-choice poll:**
```json
{
  "kind": 1068,
  "content": "What is the best programming language for Nostr development?",
  "tags": [
    ["option", "rust", "Rust"],
    ["option", "typescript", "TypeScript"],
    ["option", "go", "Go"],
    ["option", "python", "Python"],
    ["relay", "wss://relay.example.com"],
    ["relay", "wss://relay2.example.com"],
    ["polltype", "singlechoice"],
    ["endsAt", "1690086400"]
  ],
  "pubkey": "poll-creator-pubkey",
  "created_at": 1690000000,
  "id": "poll-event-id",
  "sig": "..."
}
```

**Multiple-choice poll:**
```json
{
  "kind": 1068,
  "content": "Which features do you want in a Nostr client? (select all that apply)",
  "tags": [
    ["option", "zaps", "Lightning Zaps"],
    ["option", "dm", "Encrypted DMs"],
    ["option", "media", "Media Galleries"],
    ["option", "groups", "Group Chats"],
    ["relay", "wss://relay.example.com"],
    ["polltype", "multiplechoice"]
  ],
  "pubkey": "poll-creator-pubkey",
  "created_at": 1690000000,
  "id": "multi-poll-id",
  "sig": "..."
}
```

**Vote response (single choice):**
```json
{
  "kind": 1018,
  "content": "",
  "tags": [
    ["e", "poll-event-id"],
    ["response", "rust"]
  ],
  "pubkey": "voter-pubkey",
  "created_at": 1690001000,
  "id": "...",
  "sig": "..."
}
```

**Vote response (multiple choice):**
```json
{
  "kind": 1018,
  "content": "",
  "tags": [
    ["e", "multi-poll-id"],
    ["response", "zaps"],
    ["response", "dm"],
    ["response", "media"]
  ],
  "pubkey": "voter-pubkey",
  "created_at": 1690001000,
  "id": "...",
  "sig": "..."
}
```

**Changing a vote (newer timestamp replaces older):**
```json
{
  "kind": 1018,
  "content": "",
  "tags": [
    ["e", "poll-event-id"],
    ["response", "typescript"]
  ],
  "pubkey": "voter-pubkey",
  "created_at": 1690002000,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes
- **Relay selection is critical**: Poll integrity depends on the specified relays. The poll creator should choose relays that:
  - Prevent backdated events (reject events with `created_at` significantly in the past)
  - Reject deletion requests for vote events (to prevent vote manipulation)
- **Vote changing**: Since the latest timestamp wins, users can effectively change their vote by publishing a new response event with a later timestamp.
- **No enforcement of `endsAt`**: The `endsAt` timestamp is advisory. Relays do not necessarily enforce it. Clients should filter out votes with timestamps after `endsAt` during tallying.
- **Result curation**: Clients MAY filter results using `kind:30000` follow sets or other curation methods (e.g., proof-of-work verification) to reduce sybil voting.
- **Sybil resistance**: Since Nostr pubkeys are free to create, polls are inherently vulnerable to sybil attacks. Clients can mitigate this by showing results filtered by followed users, web-of-trust, or requiring proof-of-work.

## Client Behavior
- Clients MUST send vote responses to the relays specified in the poll's `relay` tags.
- Clients MUST fetch responses only from the poll's specified relays for tallying.
- Clients MUST deduplicate votes by pubkey, using the latest timestamp.
- Clients MUST respect poll type rules (first response only for singlechoice).
- Clients SHOULD display the `endsAt` time and indicate when a poll has closed.
- Clients SHOULD filter out votes timestamped after the `endsAt` value.
- Clients MAY provide filtering options (e.g., "show results from followed users only").
- Clients MAY require proof-of-work or other sybil resistance for vote display.

## Relay Behavior
- Relays SHOULD prevent backdated events for improved poll integrity.
- Relays SHOULD reject deletion requests for `kind:1018` vote events.
- Relays SHOULD index the `e` tag on `kind:1018` events for efficient querying.

## Dependencies
- None (NIP-88 is self-contained)

## Source Code References
- **nostr-tools** (JS): Kind constants 1068 and 1018
- **rust-nostr**: Poll and vote event types
- **go-nostr**: Standard event handling

## Related NIPs
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) -- Basic event structure
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (follow sets for result filtering)
