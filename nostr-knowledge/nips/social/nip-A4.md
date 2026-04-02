# NIP-A4: Public Messages

## Status
Active (draft)

## Summary
NIP-A4 defines `kind:24` events for plaintext public messages sent to one or more Nostr users. These are lightweight, notification-oriented messages with no expectation of privacy -- they are publicly signed and consumable by anyone. Messages are designed to appear in notification screens and are explicitly NOT chat messages with history or threading.

## Motivation
There is a need for lightweight, public, one-off messages directed at specific users that do not belong in a threaded conversation, a chatroom, or as replies to existing posts. Think of them as public @-mentions or direct notifications without a parent context. Use cases include: tipping notifications, brief public acknowledgments, alerts, or any message that loses relevance quickly and does not need to be part of a permanent conversation thread.

## Specification

### Event Kinds
| Kind | Description       | Type          |
|------|-------------------|---------------|
| 24   | Public message    | Regular event |

### Tags
| Tag        | Format                                              | Description |
|------------|------------------------------------------------------|-------------|
| `p`        | `["p", "<receiver-pubkey>", "<relay-url>"]`          | Receiver(s) of the message. Multiple `p` tags for multiple recipients. |
| `expiration` | `["expiration", "<unix-timestamp>"]`               | NIP-40 expiration (recommended, since messages lose relevance over time) |
| `q`        | `["q", "<event-id>", "<relay-url>"]`                 | NIP-18 quote repost reference |
| `k`        | `["k", "<kind-string>"]`                             | Kind of the referenced event (needed for NIP-25 reactions and NIP-57 zaps) |
| `imeta`    | `["imeta", ...]`                                     | NIP-92 media metadata for links in content |

### Content Field
The `.content` field contains the plaintext message body.

### Protocol Flow
1. **Sender creates a message**: Publishes a `kind:24` event with one or more `p` tags identifying the recipients, plaintext content, and optional tags.
2. **Distribution**: The message MUST be distributed to the NIP-65 inbox relays of each receiver AND the outbox relay of the sender.
3. **Notification display**: Receiving clients display the message in notification screens or similar non-chat UI.
4. **No threading**: Messages exist independently. There is NO concept of threads, thread roots, or chatrooms. Each message is standalone.

### JSON Examples

**Simple public message to one user:**
```json
{
  "kind": 24,
  "content": "Hey, thanks for the great article on Nostr relay architecture!",
  "tags": [
    ["p", "receiver-pubkey-hex", "wss://relay.example.com"],
    ["expiration", "1690086400"]
  ],
  "pubkey": "sender-pubkey-hex",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Public message to multiple recipients:**
```json
{
  "kind": 24,
  "content": "You're both invited to the Nostr meetup this Saturday!",
  "tags": [
    ["p", "recipient1-pubkey", "wss://relay1.example.com"],
    ["p", "recipient2-pubkey", "wss://relay2.example.com"],
    ["expiration", "1690345600"]
  ],
  "pubkey": "sender-pubkey",
  "created_at": 1690000000,
  "id": "...",
  "sig": "..."
}
```

**Public message with a quote reference:**
```json
{
  "kind": 24,
  "content": "Check out this note!",
  "tags": [
    ["p", "receiver-pubkey", "wss://relay.example.com"],
    ["q", "quoted-event-id", "wss://relay.example.com"],
    ["expiration", "1690172800"]
  ]
}
```

**Public message with media:**
```json
{
  "kind": 24,
  "content": "Look at this photo from the conference! https://example.com/photo.jpg",
  "tags": [
    ["p", "receiver-pubkey", "wss://relay.example.com"],
    ["imeta",
      "url https://example.com/photo.jpg",
      "m image/jpeg",
      "dim 1920x1080",
      "x sha256hashvalue"
    ],
    ["expiration", "1690259200"]
  ]
}
```

## Implementation Notes
- **NO PRIVACY**: There MUST be no expectation of privacy with `kind:24` events. They are publicly signed, publicly relayed, and publicly consumable. They are essentially public replies without a root note. For private messaging, use NIP-17 `kind:14` encrypted rumors.
- **No threading model**: This is deliberate. These messages have no syntactic connection to each other. They are standalone notifications, not conversations.
- **Expiration recommended**: NIP-40 expiration tags are strongly recommended because public messages typically lose relevance quickly. Without expiration, they accumulate as noise.
- **Relay distribution**: Messages MUST be sent to receivers' NIP-65 inbox relays to ensure delivery, plus the sender's outbox relay for completeness.
- **Reactions and zaps**: When reacting to or zapping a `kind:24` event, include a `k` tag with value `"24"` per NIP-25 and NIP-57.
- **Media handling**: NIP-92 `imeta` tags should be used for any media links in the content.

## Client Behavior
- Clients SHOULD display `kind:24` messages in notification screens, NOT in chat interfaces.
- Clients MUST NOT create chat history or threading UI for `kind:24` messages.
- Clients SHOULD honor NIP-40 expiration tags and hide/delete expired messages.
- Clients SHOULD distribute messages to receivers' NIP-65 inbox relays.
- Clients MAY display media previews using `imeta` tag metadata.
- Clients SHOULD include a `k` tag when reacting to or zapping `kind:24` events.
- Clients MAY use NIP-18 `q` tags for quoting events within messages.

## Relay Behavior
- Relays SHOULD support NIP-40 expiration for `kind:24` events and garbage-collect expired ones.
- Relays SHOULD index `p` tags for efficient recipient-based querying.
- No special relay behavior is required beyond standard event handling.

## Dependencies
- [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) -- Relay list metadata (for inbox/outbox relay discovery)
- [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) -- Expiration timestamp (recommended)
- [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) -- Media attachments / `imeta` tags (optional)

## Source Code References
- **nostr-tools** (JS): Kind 24 constant
- **rust-nostr**: Public message event kind
- **go-nostr**: Standard event handling

## Related NIPs
- [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) -- Private direct messages (`kind:14` -- the private counterpart)
- [NIP-18](https://github.com/nostr-protocol/nips/blob/master/18.md) -- Reposts (quote references via `q` tag)
- [NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) -- Reactions (need `k` tag for kind 24)
- [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) -- Expiration timestamp
- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) -- Zaps (need `k` tag for kind 24)
- [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) -- Relay list metadata
- [NIP-92](https://github.com/nostr-protocol/nips/blob/master/92.md) -- Media attachments
