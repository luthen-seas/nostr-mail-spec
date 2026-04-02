# NIP-28: Public Chat Channels

## Overview

NIP-28 defines public chat channels on NOSTR -- open group messaging where anyone can read and write. Think IRC or Telegram public groups, but decentralized and built on NOSTR events.

All messages in NIP-28 channels are **public and unencrypted**. For private group messaging, see NIP-29 (relay-based groups).

## Event Kinds

| Kind | Purpose | Who Can Publish |
|------|---------|-----------------|
| 40 | Create a channel | Anyone |
| 41 | Update channel metadata | Channel creator only |
| 42 | Send a message | Anyone |
| 43 | Hide a message | Channel creator (moderation) |
| 44 | Mute a user | Channel creator (moderation) |

## How It Works

### Creating a Channel (Kind 40)

A channel is created by publishing a kind 40 event. The event's content is a JSON object with the channel's metadata:

```json
{
  "kind": 40,
  "content": "{\"name\":\"nostr-dev\",\"about\":\"NOSTR development discussion\",\"picture\":\"https://example.com/icon.png\"}",
  "tags": []
}
```

The **channel ID** is the event ID of this kind 40 event. All subsequent messages and metadata updates reference this ID.

### Sending Messages (Kind 42)

Messages reference the channel via an `e` tag with the `root` marker:

```json
{
  "kind": 42,
  "content": "Hello everyone!",
  "tags": [
    ["e", "<channel-id>", "wss://relay.example.com", "root"]
  ]
}
```

### Threaded Replies

To reply to a specific message, add a second `e` tag with the `reply` marker:

```json
{
  "kind": 42,
  "content": "I agree with that point.",
  "tags": [
    ["e", "<channel-id>", "wss://relay.example.com", "root"],
    ["e", "<message-id>", "wss://relay.example.com", "reply"],
    ["p", "<original-author-pubkey>"]
  ]
}
```

### Updating Channel Metadata (Kind 41)

The channel creator can update the channel's name, description, or picture:

```json
{
  "kind": 41,
  "content": "{\"name\":\"nostr-dev\",\"about\":\"Updated description\"}",
  "tags": [
    ["e", "<channel-id>", "wss://relay.example.com"]
  ]
}
```

Clients should only trust kind 41 events from the same pubkey that created the channel (published the kind 40).

## Moderation

NIP-28 includes basic client-side moderation tools for channel creators.

### Hide a Message (Kind 43)

```json
{
  "kind": 43,
  "content": "{\"reason\":\"Spam\"}",
  "tags": [
    ["e", "<message-id>"]
  ]
}
```

### Mute a User (Kind 44)

```json
{
  "kind": 44,
  "content": "{\"reason\":\"Repeated violations\"}",
  "tags": [
    ["p", "<user-pubkey>"]
  ]
}
```

**Important**: Moderation in NIP-28 is purely client-side. The hidden messages and muted users' events still exist on relays. Clients choose whether to respect the channel creator's moderation events.

## Subscribing to a Channel

To display a channel, clients need two subscriptions:

1. **Channel info**: Kind 40 (creation) and kind 41 (metadata updates)
2. **Messages**: Kind 42 events referencing the channel ID

```typescript
// Channel metadata
const metaFilter = {
  kinds: [40],
  ids: [channelId]
}

// Metadata updates (from creator only)
const updateFilter = {
  kinds: [41],
  authors: [channelCreatorPubkey],
  '#e': [channelId]
}

// Messages
const messageFilter = {
  kinds: [42],
  '#e': [channelId]
}

// Moderation (from creator only)
const moderationFilter = {
  kinds: [43, 44],
  authors: [channelCreatorPubkey]
}
```

## Discovering Channels

To list available channels on a relay, query for kind 40 events:

```typescript
const channels = await pool.querySync(relays, [{ kinds: [40], limit: 50 }])
```

## Limitations

- **No encryption**: All messages are public. Use NIP-17 for private DMs or NIP-29 for private groups.
- **Client-side moderation**: Moderation relies on clients choosing to respect kind 43/44 events. Non-compliant clients can still display hidden messages.
- **No access control**: Anyone can post to any channel. There is no mechanism to restrict who can send messages.
- **Single owner**: Only the channel creator can moderate. There is no delegation of moderation powers.

## Running the Example

```bash
npm install nostr-tools @noble/hashes ws
npx tsx public_chat.ts
```

## Related NIPs

- **NIP-29**: Relay-based groups (private/moderated groups with server-side enforcement)
- **NIP-17**: Private direct messages
- **NIP-01**: Basic event structure
