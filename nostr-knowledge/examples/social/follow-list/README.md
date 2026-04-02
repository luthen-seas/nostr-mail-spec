# Follow List / Contact List (Kind 3)

## Overview

Kind 3 events store a user's **follow list** (also called a contact list). Like kind 0, kind 3 is a **replaceable event** -- only the most recent version is kept by relays. Each followed account is represented by a `p` tag.

## Relevant NIPs

- **NIP-02** -- Defines the contact list event (kind 3), p-tag format with relay hints and petnames.
- **NIP-65** -- Relay list metadata (kind 10002). This is now the preferred way to advertise relay preferences, replacing the kind 3 content field for that purpose.

## Event Structure

```json
{
  "kind": 3,
  "pubkey": "<your hex pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["p", "<followed-pubkey-hex>", "<relay-url>", "<petname>"],
    ["p", "<another-pubkey-hex>", "wss://nos.lol", "alice"],
    ["p", "<third-pubkey-hex>", "", ""]
  ],
  "content": "{\"wss://relay.damus.io\":{\"read\":true,\"write\":true}}",
  "id": "<event id>",
  "sig": "<schnorr signature>"
}
```

## P-Tag Format

Each `p` tag can have up to four elements:

| Index | Value | Required | Description |
|-------|-------|----------|-------------|
| 0 | `"p"` | Yes | Tag type |
| 1 | `<pubkey-hex>` | Yes | 32-byte hex public key of the followed user |
| 2 | `<relay-url>` | No | Relay URL hint where this user's events can be found |
| 3 | `<petname>` | No | Local nickname for this user (NIP-02) |

## Petnames

Petnames are locally-assigned names for contacts. They allow users to maintain their own namespace independent of what others call themselves. In practice, most clients do not display petnames and instead show the name from the followed user's kind 0 metadata.

## Relay Hints

The relay URL in position 2 of the p-tag is a **hint** to clients about where to find that user's events. This is important for relay discovery -- if you follow someone, your client can use this hint to connect to the right relay even if you do not normally use it.

## Content Field (Legacy Relay List)

Historically, the `content` field of kind 3 stored a JSON object mapping relay URLs to read/write policies:

```json
{
  "wss://relay.damus.io": { "read": true, "write": true },
  "wss://nos.lol": { "read": true, "write": false }
}
```

This has been largely superseded by **NIP-65 (kind 10002)** for advertising relay preferences. Many clients still write to both for backward compatibility.

## Key Patterns

- **Publishing**: To follow someone, add their pubkey as a p-tag. To unfollow, remove the tag. Always publish the complete list (it replaces the old one entirely).
- **Fetching**: Filter by `kinds: [3]`, `authors: [pubkey]`, `limit: 1`.
- **Mutual follows**: Fetch both users' kind 3 events and compute the intersection of their p-tag sets.
- **Follow counts**: Count the p-tags in the kind 3 event. Note: follower counts require indexing relays (like relay.nostr.band) since there is no reverse lookup in the base protocol.

## How to Run

```bash
npm install nostr-tools websocket-polyfill
npx ts-node follow_list.ts
```
