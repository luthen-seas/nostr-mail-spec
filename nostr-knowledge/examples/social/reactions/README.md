# Reactions (Kind 7)

## Overview

Kind 7 events represent **reactions** to other events. The simplest form is a "like" (content `+`), but reactions can carry any emoji, custom emoji shortcode, or a dislike (`-`).

## Relevant NIPs

- **NIP-25** -- Defines reactions (kind 7), content conventions (`+`, `-`, emoji), and required tags.
- **NIP-30** -- Custom emoji. Allows reactions with custom images via `emoji` tags and `:shortcode:` content.

## Event Structure

```json
{
  "kind": 7,
  "pubkey": "<reactor's pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["e", "<target-event-id>"],
    ["p", "<target-event-author-pubkey>"],
    ["k", "<target-event-kind>"]
  ],
  "content": "+",
  "id": "<event id>",
  "sig": "<schnorr signature>"
}
```

## Required Tags

| Tag | Description |
|-----|-------------|
| `e` | The event ID being reacted to. This is how clients find reactions for a given note. |
| `p` | The pubkey of the event author being reacted to. This allows the author to be notified. |

## Optional Tags

| Tag | Description |
|-----|-------------|
| `k` | The kind number of the target event (as a string). Helps clients filter and display reactions appropriately. |
| `emoji` | For custom emoji reactions (NIP-30): `["emoji", "shortcode", "https://image-url"]` |

## Content Values

| Content | Meaning |
|---------|---------|
| `+` | Like / upvote |
| `-` | Dislike / downvote |
| Unicode emoji | Emoji reaction (e.g., `\u2764\ufe0f`, `\ud83d\udd25`, `\ud83d\ude02`) |
| `:shortcode:` | Custom emoji reaction (requires `emoji` tag with image URL) |

## Counting Reactions

Clients typically count reactions by filtering for `kinds: [7]` with `#e: [targetEventId]`. The results can be bucketed by content to show counts like:

```
+  : 42
\ud83d\udd25 : 7
\u2764\ufe0f : 3
-  : 1
```

Some relays support NIP-45 (`COUNT`) which allows counting without downloading all events.

## Key Patterns

- **Sending a like**: Create kind 7 with `content: "+"`, include `e` and `p` tags.
- **Fetching reactions**: Filter by `kinds: [7]`, `#e: [eventId]`.
- **Emoji reactions**: Set content to any Unicode emoji character.
- **Custom emoji**: Set content to `:shortcode:` and add an `emoji` tag with the image URL.
- **Reaction to a reaction**: You can react to kind 7 events too -- just set the `k` tag to `"7"`.

## How to Run

```bash
npm install nostr-tools websocket-polyfill
npx ts-node reactions.ts
```
