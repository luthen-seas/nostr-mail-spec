# Threads and Replies (NIP-10)

## Overview

NOSTR supports threaded conversations through **e-tag markers** on kind 1 events. NIP-10 defines how replies reference parent events to build a coherent thread structure.

## Relevant NIPs

- **NIP-10** -- Defines the threading model: `e` tag markers (`root`, `reply`, `mention`), `p` tag conventions for notifying participants, and the deprecated positional e-tag scheme.
- **NIP-01** -- Kind 1 text notes (the events that form threads).

## Threading Model

### Root Note

A root note is a kind 1 event with **no e-tags** (or no e-tags with `root`/`reply` markers). It starts a thread.

```json
{
  "kind": 1,
  "content": "What do you think about NOSTR?",
  "tags": []
}
```

### Direct Reply to Root

When replying directly to the root, include a single e-tag with the `root` marker:

```json
{
  "kind": 1,
  "content": "I think it's great!",
  "tags": [
    ["e", "<root-event-id>", "<relay-hint>", "root"],
    ["p", "<root-author-pubkey>"]
  ]
}
```

### Nested Reply

When replying to a reply, include both `root` and `reply` markers:

```json
{
  "kind": 1,
  "content": "Building on what you said...",
  "tags": [
    ["e", "<root-event-id>", "<relay-hint>", "root"],
    ["e", "<parent-event-id>", "<relay-hint>", "reply"],
    ["p", "<root-author-pubkey>"],
    ["p", "<parent-author-pubkey>"]
  ]
}
```

## E-Tag Markers

| Marker | Meaning |
|--------|---------|
| `root` | Points to the thread's first (root) event. Always present in replies. |
| `reply` | Points to the specific event being replied to. Absent when replying directly to root (the root tag doubles as the reply target). |
| `mention` | References an event that is mentioned but not being replied to. |

### Tag Format

```
["e", <event-id>, <relay-url>, <marker>]
```

- `event-id` -- 32-byte hex event ID
- `relay-url` -- Optional relay hint where the referenced event can be found
- `marker` -- One of `root`, `reply`, or `mention`

## P-Tags in Replies

When replying, include `p` tags for:

1. The author of the root event (always)
2. The author of the event being directly replied to
3. Optionally, other participants you want to notify

This allows clients to show notifications to thread participants.

## Thread Resolution Algorithm

To display a full thread:

1. **Get the root**: If you have a reply, follow the `root` e-tag marker to find the root event.
2. **Fetch all replies**: Query for kind 1 events with `#e: [rootEventId]`.
3. **Build the tree**: For each reply, check the `reply` marker to find its direct parent. If no `reply` marker exists but a `root` marker does, it is a direct reply to root.
4. **Sort**: Order siblings by `created_at` timestamp.

## Deprecated: Positional E-Tags

Before NIP-10 markers were introduced, threading used positional e-tags:

- First e-tag = root event
- Last e-tag = event being replied to
- Middle e-tags = mentions

This scheme is deprecated but clients should handle it for backward compatibility. If e-tags have no markers, fall back to positional interpretation.

## How to Run

```bash
npm install nostr-tools websocket-polyfill
npx ts-node threads.ts
```
