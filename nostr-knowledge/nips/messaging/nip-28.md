# NIP-28: Public Chat

## Status
Active

## Summary
NIP-28 defines a decentralized public chat system using five event kinds (40-44) for channel creation, metadata updates, messaging, message hiding, and user muting. Channels are open and unencrypted -- anyone can read and write. Moderation is handled client-side rather than by relays, giving client developers discretion over content policies.

## Motivation
Nostr needed a public group chat mechanism that did not depend on relay operators to perform moderation. NIP-28 provides IRC-like public channels where:
- Anyone can create a channel.
- Anyone can post messages.
- Moderation is distributed to clients rather than centralized at relays.
- Channels can survive relay failures by migrating to backup relays.

## Specification

### Event Kinds
| Kind | Description |
|------|-------------|
| 40   | Channel Creation |
| 41   | Channel Metadata (Set/Update) |
| 42   | Channel Message |
| 43   | Hide Message |
| 44   | Mute User |

### Tags

#### Kind 40 (Channel Creation)
No special tags required. The event ID becomes the channel's permanent identifier.

#### Kind 41 (Channel Metadata)
| Tag | Description |
|-----|-------------|
| `e` | Event ID of the kind 40 channel creation event, with recommended relay URL |

#### Kind 42 (Channel Message)
| Tag | Description |
|-----|-------------|
| `e` | Root: channel creation event ID (marked `root`). Reply: the message being replied to (marked `reply`) |
| `p` | Pubkey of the user being mentioned or replied to |

#### Kind 43 (Hide Message)
| Tag | Description |
|-----|-------------|
| `e` | Event ID of the kind 42 message to hide |

#### Kind 44 (Mute User)
| Tag | Description |
|-----|-------------|
| `p` | Pubkey of the user to mute |

### Protocol Flow

#### Creating a Channel
1. User creates a kind 40 event with channel metadata in `content` as JSON:
   ```json
   {"name": "channel-name", "about": "description", "picture": "https://..."}
   ```
2. The event ID of this kind 40 event becomes the permanent channel identifier.

#### Updating Channel Metadata
1. The channel creator (or clients that recognize them as admin) publishes a kind 41 event.
2. The `content` contains the updated JSON metadata.
3. An `e` tag references the original kind 40 channel creation event.
4. Only metadata from the channel creator's pubkey should be accepted by clients.

#### Sending a Message
1. User creates a kind 42 event with the message text in `content`.
2. The event includes an `e` tag referencing the channel creation event (kind 40) as `root` (using NIP-10 markers).
3. Replies to specific messages include an additional `e` tag with the `reply` marker and a `p` tag with the original author's pubkey.

#### Moderation (Client-Side)
1. **Hiding a message**: Any user publishes a kind 43 event with an `e` tag referencing the message to hide. The `content` contains an optional JSON reason: `{"reason": "spam"}`.
2. **Muting a user**: Any user publishes a kind 44 event with a `p` tag referencing the user to mute. The `content` contains an optional JSON reason.
3. Clients decide independently how to handle hide/mute events. For example, if multiple users hide the same message with the same reason, a client might hide it for all users.

### JSON Examples

#### Channel Creation (Kind 40)
```json
{
  "id": "channel_creation_event_id_hex",
  "pubkey": "creator_pubkey_hex",
  "created_at": 1711900000,
  "kind": 40,
  "tags": [],
  "content": "{\"name\": \"nostr-dev\", \"about\": \"Discussion about Nostr development\", \"picture\": \"https://example.com/nostr-logo.png\", \"relays\": [\"wss://relay1.example.com\", \"wss://relay2.example.com\"]}",
  "sig": "creator_sig_hex"
}
```

#### Channel Metadata Update (Kind 41)
```json
{
  "id": "metadata_update_id_hex",
  "pubkey": "creator_pubkey_hex",
  "created_at": 1711910000,
  "kind": 41,
  "tags": [
    ["e", "channel_creation_event_id_hex", "wss://relay1.example.com"]
  ],
  "content": "{\"name\": \"nostr-dev\", \"about\": \"Updated: Nostr protocol development chat\", \"picture\": \"https://example.com/new-logo.png\"}",
  "sig": "creator_sig_hex"
}
```

#### Channel Message (Kind 42)
```json
{
  "id": "message_id_hex",
  "pubkey": "sender_pubkey_hex",
  "created_at": 1711920000,
  "kind": 42,
  "tags": [
    ["e", "channel_creation_event_id_hex", "wss://relay1.example.com", "root"]
  ],
  "content": "Has anyone tested the new NIP-44 implementation?",
  "sig": "sender_sig_hex"
}
```

#### Reply to a Channel Message (Kind 42)
```json
{
  "id": "reply_id_hex",
  "pubkey": "replier_pubkey_hex",
  "created_at": 1711920060,
  "kind": 42,
  "tags": [
    ["e", "channel_creation_event_id_hex", "wss://relay1.example.com", "root"],
    ["e", "message_id_hex", "wss://relay1.example.com", "reply"],
    ["p", "sender_pubkey_hex"]
  ],
  "content": "Yes! It works great with the latest nostr-tools.",
  "sig": "replier_sig_hex"
}
```

#### Hide Message (Kind 43)
```json
{
  "id": "hide_id_hex",
  "pubkey": "moderator_pubkey_hex",
  "created_at": 1711930000,
  "kind": 43,
  "tags": [
    ["e", "spam_message_id_hex"]
  ],
  "content": "{\"reason\": \"spam\"}",
  "sig": "moderator_sig_hex"
}
```

#### Mute User (Kind 44)
```json
{
  "id": "mute_id_hex",
  "pubkey": "moderator_pubkey_hex",
  "created_at": 1711930000,
  "kind": 44,
  "tags": [
    ["p", "spammer_pubkey_hex"]
  ],
  "content": "{\"reason\": \"persistent spam\"}",
  "sig": "moderator_sig_hex"
}
```

## Implementation Notes
- Channel identity is tied to the kind 40 event ID, not the creator's pubkey. If the kind 40 event is lost, the channel effectively ceases to exist.
- The `relays` field in channel metadata JSON allows channels to specify backup relays. Clients should attempt to fetch messages from these relays if the primary relay is unavailable.
- Kind 41 metadata updates do NOT change the channel ID. The channel is always identified by the original kind 40 event ID.
- NIP-28 channels are entirely public and unencrypted. For private group messaging, use NIP-29 (relay-based groups) or NIP-17 (private DMs with multiple `p` tags).

## Client Behavior
- Clients MUST use the kind 40 event ID as the canonical channel identifier.
- Clients MUST use NIP-10 marked `e` tags (`root`, `reply`) in kind 42 messages.
- Clients SHOULD only accept kind 41 metadata updates from the original channel creator (the pubkey on the kind 40 event).
- Clients MAY implement custom moderation policies based on kind 43 and 44 events (e.g., hiding content if N users flag it).
- Clients SHOULD support failover to backup relays listed in channel metadata.
- Clients SHOULD display channel messages in chronological order within the channel context, not in the user's main feed.

## Relay Behavior
- Relays have no special behavior for NIP-28 -- they store and serve kinds 40-44 like any other events.
- Relays do NOT enforce moderation. All moderation is client-side.

## Dependencies
- **NIP-01** -- Basic protocol (event structure)
- **NIP-10** -- Reply threading (marked `e` tags for root/reply)

## Source Code References
- **nostr-tools (JS)**: `nip28.ts` -- channel creation, message sending, metadata updates
- **rust-nostr**: `nostr` crate -- kind 40-44 event handling
- **go-nostr**: event kind constants for 40-44

## Related NIPs
- **NIP-10** -- Reply threading (used for message threading within channels)
- **NIP-29** -- Relay-based Groups (alternative with relay-enforced access control)
- **NIP-C7** -- Chats (lightweight chat messages)
