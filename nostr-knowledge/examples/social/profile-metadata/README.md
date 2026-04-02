# Profile Metadata (Kind 0)

## Overview

Kind 0 events carry **user profile metadata** in NOSTR. Every user has at most one active kind 0 event at any time because kind 0 is a **replaceable event** -- when a newer kind 0 is published, relays discard the old one and keep only the latest.

## Relevant NIPs

- **NIP-01** -- Defines kind 0 (`set_metadata`) as a replaceable event. The `content` field is a JSON-stringified object.
- **NIP-24** -- Extends the metadata schema with additional fields (`display_name`, `banner`, `website`, etc.)
- **NIP-05** -- DNS-based verification. The `nip05` field in metadata points to a `/.well-known/nostr.json` endpoint that maps usernames to public keys.

## Event Structure

```json
{
  "kind": 0,
  "pubkey": "<hex public key>",
  "created_at": 1234567890,
  "tags": [],
  "content": "{\"name\":\"alice\",\"about\":\"hello\",\"picture\":\"https://...\",\"nip05\":\"alice@example.com\",\"lud16\":\"alice@getalby.com\",\"banner\":\"https://...\"}",
  "id": "<event id>",
  "sig": "<schnorr signature>"
}
```

## Standard Metadata Fields

| Field | Description | NIP |
|-------|-------------|-----|
| `name` | Short username / handle | NIP-01 |
| `about` | Bio / description | NIP-01 |
| `picture` | Avatar URL | NIP-01 |
| `display_name` | Full display name | NIP-24 |
| `banner` | Banner image URL | NIP-24 |
| `website` | URL | NIP-24 |
| `nip05` | DNS identifier (`user@domain.com`) | NIP-05 |
| `lud16` | Lightning address for zaps | NIP-57 |
| `lud06` | LNURL for zaps (legacy) | NIP-57 |

## Replaceable Event Semantics

- Kind 0 is in the **replaceable** range (kinds 0, 3, and 10000-19999).
- Relays MUST keep only the event with the highest `created_at` for a given `pubkey` + `kind` combination.
- Clients should always request the latest and verify `created_at` timestamps when receiving from multiple relays.

## How to Run

```bash
npm install nostr-tools websocket-polyfill
npx ts-node profile_metadata.ts
```

## Key Patterns

- **Publishing**: Create a kind 0 event with `content` set to `JSON.stringify(metadata)`, sign, and publish.
- **Fetching**: Filter by `kinds: [0]` and `authors: [pubkey]` with `limit: 1`. Parse `content` as JSON.
- **Updating**: Simply publish a new kind 0 event. The old one is automatically replaced.
- **NIP-05 Verification**: After fetching metadata, clients should verify the `nip05` field by querying the domain's `/.well-known/nostr.json`.
