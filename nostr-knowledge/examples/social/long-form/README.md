# Long-Form Content (Kind 30023)

## Overview

Kind 30023 events are **long-form articles** in NOSTR, similar to blog posts. They are **parameterized replaceable events** -- identified by the combination of `pubkey` + `kind` + `d-tag`. Publishing a new event with the same `d-tag` replaces the previous version.

## Relevant NIPs

- **NIP-23** -- Defines long-form content (kind 30023), required and optional tags, and Markdown content conventions.
- **NIP-01** -- Defines parameterized replaceable events (kinds 30000-39999) and the `d` tag.

## Event Structure

```json
{
  "kind": 30023,
  "pubkey": "<author's pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["d", "my-article-slug"],
    ["title", "My Article Title"],
    ["summary", "A brief summary for previews and feeds"],
    ["image", "https://example.com/hero-image.jpg"],
    ["published_at", "1234567890"],
    ["t", "nostr"],
    ["t", "protocol"]
  ],
  "content": "# My Article\n\nThis is the full Markdown content...",
  "id": "<event id>",
  "sig": "<schnorr signature>"
}
```

## Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier / slug. Combined with pubkey and kind, this forms the event's "address". |
| `title` | Recommended | Article title for display in feeds |
| `summary` | Recommended | Short description for previews (like meta description) |
| `image` | No | Hero / cover image URL |
| `published_at` | Recommended | Unix timestamp of original publication (stays the same across edits) |
| `t` | No | Hashtags / topics (one tag per topic) |

## Addressable Events

Kind 30023 is in the **parameterized replaceable** range (30000-39999). This means:

- The event is identified by `pubkey:kind:d-tag` (not by event ID)
- Publishing a new event with the same `pubkey + kind + d-tag` replaces the old one
- Relays keep only the version with the highest `created_at`
- Clients can request a specific article using `authors`, `kinds`, and `#d` filters

### NIP-19 `naddr` Encoding

Articles can be referenced using `naddr` (NIP-19), which encodes:
- The `d` tag value
- The relay hints
- The author pubkey
- The kind number

This gives each article a stable, shareable identifier independent of the event ID (which changes on each edit).

## Content Format

The `content` field contains **Markdown** text. Clients render this as formatted HTML. Common conventions:

- Standard Markdown headings, lists, links, images
- Code blocks with syntax highlighting
- `nostr:npub...` or `nostr:note...` references that clients can resolve inline

## Updating an Article

To update, simply publish a new kind 30023 event with the **same `d` tag**. Best practices:

- Keep the original `published_at` timestamp
- Update `created_at` to the current time (this is automatic)
- The relay replaces the old version

## Drafts

Kind 30024 is used for article **drafts** (NIP-23). Drafts follow the same structure as kind 30023 but are not meant to be publicly displayed. Clients can use this to save work-in-progress articles.

## Fetching Articles

- **By author**: `{ kinds: [30023], authors: [pubkey], limit: 10 }`
- **By d-tag**: `{ kinds: [30023], authors: [pubkey], "#d": ["slug"] }`
- **By hashtag**: `{ kinds: [30023], "#t": ["nostr"], limit: 20 }`
- **Recent articles**: `{ kinds: [30023], limit: 20 }` (sorted by `created_at`)

## How to Run

```bash
npm install nostr-tools websocket-polyfill
npx ts-node long_form.ts
```
