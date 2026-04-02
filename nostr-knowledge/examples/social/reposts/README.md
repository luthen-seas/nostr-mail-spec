# Reposts (Kind 6 and Kind 16)

## Overview

Reposts let users share existing content with their followers. NOSTR defines two repost kinds and a quote-repost pattern:

- **Kind 6** -- Repost of a kind 1 text note (the most common case)
- **Kind 16** -- Generic repost of any event kind
- **Quote repost** -- A kind 1 note with a `q` tag referencing the quoted event

## Relevant NIPs

- **NIP-18** -- Defines reposts (kind 6, kind 16), the `q` tag for quote reposts, and the convention of embedding the original event in the content field.

## Kind 6: Note Repost

Kind 6 is specifically for reposting kind 1 text notes.

```json
{
  "kind": 6,
  "pubkey": "<reposter's pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["e", "<original-event-id>", "<relay-url>"],
    ["p", "<original-author-pubkey>"]
  ],
  "content": "{\"id\":\"...\",\"pubkey\":\"...\",\"kind\":1,...}",
  "id": "<event id>",
  "sig": "<schnorr signature>"
}
```

### Tags

| Tag | Description |
|-----|-------------|
| `e` | The ID of the event being reposted, with an optional relay hint |
| `p` | The pubkey of the original event's author |

### Content

The `content` field SHOULD contain the `JSON.stringify()`'d original event. This allows clients to display the repost immediately without fetching the original from relays. Some clients may set content to `""` and rely on fetching via the `e` tag.

## Kind 16: Generic Repost

Kind 16 works for reposting events of any kind (not just kind 1). It adds a `k` tag to indicate the kind of the original event.

```json
{
  "kind": 16,
  "tags": [
    ["e", "<original-event-id>", "<relay-url>"],
    ["p", "<original-author-pubkey>"],
    ["k", "30023"]
  ],
  "content": "{...original event JSON...}"
}
```

The `k` tag tells clients what type of content was reposted so they can render it appropriately (e.g., an article vs. a short note).

## Quote Reposts

A quote repost is a regular kind 1 note that references another event using a `q` tag. This allows the user to add their own commentary around the quoted content.

```json
{
  "kind": 1,
  "tags": [
    ["q", "<quoted-event-id>", "<relay-url>", "<quoted-author-pubkey>"],
    ["p", "<quoted-author-pubkey>"]
  ],
  "content": "My thoughts on this:\n\nnostr:<event-id>"
}
```

### The `q` Tag

| Index | Value | Description |
|-------|-------|-------------|
| 0 | `"q"` | Tag type |
| 1 | `<event-id>` | The event being quoted |
| 2 | `<relay-url>` | Optional relay hint |
| 3 | `<pubkey>` | Optional pubkey of the quoted event's author |

The content typically includes a `nostr:<event-id>` reference that clients render as an embedded preview.

## Fetching Reposts

- **Kind 6/16 reposts**: Filter by `kinds: [6, 16]` with `#e: [targetEventId]`
- **Quote reposts**: Filter by `kinds: [1]` with `#q: [targetEventId]`
- **Repost count**: Combine both queries for a total repost/quote count

## How to Run

```bash
npm install nostr-tools websocket-polyfill
npx ts-node reposts.ts
```
