# NIP-C7: Chats

## Status
Active (Draft)

## Summary
NIP-C7 defines a minimal chat message format using kind 9 events. A chat message is simply a kind 9 event with a text `content` field. Replies reference the parent message using a `q` tag (quote tag) containing the event ID, relay URL, and pubkey of the original message author. This is the simplest messaging primitive in Nostr.

## Motivation
Nostr needed a lightweight, standardized event kind for real-time chat messages that could be used across multiple contexts: relay-based groups (NIP-29), public channels, or any environment where simple text chat is needed. Kind 9 serves as the universal "chat message" kind, analogous to a single line in an IRC channel or a message in a chat room.

## Specification

### Event Kinds
| Kind | Description |
|------|-------------|
| 9    | Chat Message |

### Tags

#### Basic Chat Message
No tags are required for a standalone message.

#### Reply to a Chat Message
| Tag | Description |
|-----|-------------|
| `q` | Quote tag: `["q", "<event-id>", "<relay-url>", "<pubkey>"]` referencing the parent message |

When used within NIP-29 groups, the `h` tag is also required:
| Tag | Description |
|-----|-------------|
| `h` | Group ID (required by NIP-29) |

### Protocol Flow

#### Sending a Chat Message
1. Create a kind 9 event with the message text in `content`.
2. If replying to another message, include a `q` tag with the parent event's ID, relay URL, and author pubkey.
3. If sending to a NIP-29 group, include the `h` tag with the group ID.
4. Sign and publish to the appropriate relay(s).

#### Receiving Chat Messages
1. Subscribe to kind 9 events on the relevant relay(s).
2. Display messages in chronological order.
3. If a `q` tag is present, render the message as a reply to the referenced message.

### JSON Examples

#### Basic Chat Message (Kind 9)
```json
{
  "id": "chat_msg_id_hex",
  "pubkey": "sender_pubkey_hex",
  "created_at": 1711920000,
  "kind": 9,
  "tags": [],
  "content": "Hello everyone!",
  "sig": "sender_sig_hex"
}
```

#### Reply to a Chat Message (Kind 9)
```json
{
  "id": "reply_msg_id_hex",
  "pubkey": "replier_pubkey_hex",
  "created_at": 1711920060,
  "kind": 9,
  "tags": [
    ["q", "chat_msg_id_hex", "wss://relay.example.com", "sender_pubkey_hex"]
  ],
  "content": "Hey! Good to see you here.",
  "sig": "replier_sig_hex"
}
```

#### Chat Message in a NIP-29 Group (Kind 9 with `h` tag)
```json
{
  "id": "group_chat_id_hex",
  "pubkey": "member_pubkey_hex",
  "created_at": 1711920000,
  "kind": 9,
  "tags": [
    ["h", "pizza-lovers"],
    ["previous", "a1b2c3d4"],
    ["previous", "e5f6g7h8"],
    ["previous", "i9j0k1l2"]
  ],
  "content": "Who wants to order pizza tonight?",
  "sig": "member_sig_hex"
}
```

#### Reply in a NIP-29 Group
```json
{
  "id": "group_reply_id_hex",
  "pubkey": "another_member_hex",
  "created_at": 1711920120,
  "kind": 9,
  "tags": [
    ["h", "pizza-lovers"],
    ["q", "group_chat_id_hex", "wss://groups.example.com", "member_pubkey_hex"],
    ["previous", "f1g2h3i4"]
  ],
  "content": "Count me in! Pepperoni please.",
  "sig": "another_member_sig_hex"
}
```

## Implementation Notes
- Kind 9 is intentionally minimal. It carries no encryption, no special metadata -- just text and optional reply threading.
- The `q` tag (quote) is used instead of the `e` tag for replies. This distinguishes chat replies from the NIP-10 threading model used in long-form content.
- When used inside NIP-29 groups, kind 9 events gain access control through the relay's group membership enforcement.
- Kind 9 events can also be used as the inner (application) message format within NIP-EE MLS groups.

## Client Behavior
- Clients MUST treat kind 9 as a chat message and render it in a chat-like interface.
- Clients SHOULD render `q` tag references as reply indicators (showing the quoted parent message).
- Clients SHOULD display messages in chronological order.
- Clients MAY support inline media rendering if the content contains URLs.

## Relay Behavior
- Relays store and serve kind 9 events like any other event.
- When used within NIP-29 groups, relays MUST enforce group membership and permissions before accepting kind 9 events with an `h` tag.

## Dependencies
- **NIP-01** -- Basic protocol (event structure)

## Source Code References
- **nostr-tools (JS)**: Kind 9 is typically handled as a standard event; no dedicated module
- **rust-nostr**: `nostr` crate -- kind 9 event type constant
- **go-nostr**: kind 9 event constant

## Related NIPs
- **NIP-29** -- Relay-based Groups (primary context for kind 9 messages with `h` tags)
- **NIP-28** -- Public Chat (alternative public chat using kinds 40-44)
- **NIP-17** -- Private Direct Messages (private alternative using kind 14 inside gift wraps)
- **NIP-10** -- Reply threading (different threading model using `e` tags with markers)
- **NIP-EE** -- MLS Messaging (uses kind 9 as the inner application message format)
