# NOSTR Event Model

> Canonical reference for the NOSTR event data structure, serialization, signing,
> kind taxonomy, tag system, and validation rules. Primary source: **NIP-01**.

---

## 1. Event JSON Structure

Every NOSTR event is a JSON object with exactly seven fields (NIP-01):

```json
{
  "id": "32-byte lowercase hex-encoded SHA-256 digest",
  "pubkey": "32-byte lowercase hex-encoded secp256k1 public key of the event creator",
  "created_at": 1700000000,
  "kind": 1,
  "tags": [
    ["e", "abcd1234...", "wss://relay.example.com"],
    ["p", "deaf5678..."]
  ],
  "content": "Hello, NOSTR!",
  "sig": "64-byte lowercase hex-encoded Schnorr signature (BIP-340) over the event id"
}
```

### Field Reference

| Field        | Type                    | Size / Constraints                          | Description |
|-------------|-------------------------|---------------------------------------------|-------------|
| `id`        | string (hex)            | 64 hex chars (32 bytes)                     | SHA-256 of the canonical serialization (see Section 2). Uniquely identifies the event. |
| `pubkey`    | string (hex)            | 64 hex chars (32 bytes)                     | The x-only public key of the author (secp256k1, BIP-340 format). |
| `created_at`| integer                 | Unix timestamp in **seconds**               | When the event was created. Relays may impose lower/upper bounds (NIP-11). |
| `kind`      | integer                 | 0 -- 65535                                  | Determines event semantics and relay storage behavior. |
| `tags`      | array of arrays         | Each inner array: array of non-null strings | Structured metadata. First element of each inner array is the tag name. |
| `content`   | string                  | Arbitrary UTF-8                             | The event payload. Meaning varies by kind. |
| `sig`       | string (hex)            | 128 hex chars (64 bytes)                    | Schnorr signature (BIP-340) of the `id` field, proving authorship. |

---

## 2. Event ID Computation

The event `id` is the SHA-256 hash of a **canonical serialized form** -- a JSON array with exactly six elements (NIP-01):

```
SHA256( serialize( [0, <pubkey>, <created_at>, <kind>, <tags>, <content>] ) )
```

### Serialization Rules

The array MUST be serialized as **minified UTF-8 JSON** with:

- No whitespace, line breaks, or unnecessary formatting
- No trailing commas
- No BOM (byte order mark)

**Required character escapes within strings:**

| Character        | Code Point | Escape Sequence |
|-----------------|------------|-----------------|
| Line break       | 0x0A       | `\n`            |
| Double quote     | 0x22       | `\"`            |
| Backslash        | 0x5C       | `\\`            |
| Carriage return  | 0x0D       | `\r`            |
| Tab              | 0x09       | `\t`            |
| Backspace        | 0x08       | `\b`            |
| Form feed        | 0x0C       | `\f`            |

### Concrete Example

Given an event with:
- pubkey: `a]b` ... (hypothetical)
- created_at: `1700000000`
- kind: `1`
- tags: `[["p", "deadbeef..."]]`
- content: `"Hello\nworld"`

The serialized pre-image would be:

```json
[0,"a]b...",1700000000,1,[["p","deadbeef..."]],"Hello\nworld"]
```

The SHA-256 digest of this UTF-8 byte string (without any trailing newline) becomes the `id`.

### Implementation Pseudocode

```
function computeEventId(event):
    serialized = JSON.stringify([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content
    ])
    return sha256(utf8encode(serialized))  // returns 32 bytes, display as lowercase hex
```

---

## 3. Signing and Verification

NOSTR uses **Schnorr signatures over secp256k1** as specified in BIP-340.

### Signing

```
sig = schnorr_sign(private_key, event.id)
```

Where `event.id` is the 32-byte SHA-256 digest (not the hex string).

### Verification

```
valid = schnorr_verify(event.pubkey, event.id, event.sig)
```

A verifier MUST:
1. Recompute the event ID from the serialized form
2. Confirm the recomputed ID matches `event.id`
3. Verify the Schnorr signature `event.sig` against `event.pubkey` and `event.id`

If any step fails, the event MUST be rejected.

---

## 4. Event Kind Taxonomy

NIP-01 defines four behavioral categories based on kind number ranges. The category determines how relays store (or discard) events.

### 4.1 Regular Events

**Ranges:** kind 1, kind 2, kinds 4--44, kinds 1000--9999

**Behavior:** Stored permanently by relays. All events are retained; no replacement logic applies.

### 4.2 Replaceable Events

**Ranges:** kind 0, kind 3, kinds 10000--19999

**Behavior:** For each unique combination of `pubkey` + `kind`, only the event with the **highest `created_at`** is retained. When a relay receives a new replaceable event, it MUST:

1. Compare `created_at` with the stored event for that `pubkey` + `kind`
2. If the new event has a higher timestamp, replace the stored event
3. If timestamps are equal, retain the event with the **lowest `id`** (lexicographic ordering of the hex string)
4. Discard the losing event

**Use case:** User profile metadata (kind 0), contact/follow lists (kind 3), relay lists (kind 10002).

### 4.3 Ephemeral Events

**Range:** kinds 20000--29999

**Behavior:** Relays SHOULD NOT store these events. They are forwarded to connected clients with matching subscriptions and then discarded. Relays SHOULD NOT return these in response to REQ filters.

**Use case:** Typing indicators, presence signals, real-time coordination.

### 4.4 Parameterized Replaceable (Addressable) Events

**Range:** kinds 30000--39999

**Behavior:** Like replaceable events, but the replacement key includes a third component: the value of the `d` tag. For each unique combination of `pubkey` + `kind` + `d-tag-value`, only the latest event is retained. The same timestamp-tiebreaker rules apply (lowest `id` wins on equal timestamps).

The `d` tag value is the first value in the first `d` tag found in the event's tags array. If no `d` tag exists, the value is treated as the empty string `""`.

**Addressing format:** These events can be referenced using an `a` tag:
```
["a", "<kind>:<pubkey>:<d-tag-value>", "<optional relay URL>"]
```

**Use case:** Long-form articles (kind 30023), marketplace products (kind 30018), wiki articles (kind 30818), live events (kind 30311).

### Summary Table

| Category       | Kind Ranges                      | Storage Rule                                    | Replacement Key          |
|---------------|----------------------------------|-------------------------------------------------|--------------------------|
| Regular        | 1, 2, 4--44, 1000--9999         | All events stored permanently                   | N/A (no replacement)     |
| Replaceable    | 0, 3, 10000--19999              | Latest only per key                             | `pubkey` + `kind`        |
| Ephemeral      | 20000--29999                     | Not stored, only forwarded                      | N/A                      |
| Addressable    | 30000--39999                     | Latest only per key                             | `pubkey` + `kind` + `d`  |

---

## 5. Complete Event Kinds Reference

### Core Protocol (NIP-01, NIP-02, NIP-09, NIP-10)

| Kind | Name | Category | NIP | Notes |
|------|------|----------|-----|-------|
| 0 | User Metadata | Replaceable | 01 | Content is stringified JSON: `{"name", "about", "picture", "display_name", "banner", "nip05", "lud16"}` |
| 1 | Short Text Note | Regular | 01, 10 | Primary social post type. Plain UTF-8 text. |
| 2 | Recommend Relay | Regular | 01 | Deprecated. Content is relay URL. |
| 3 | Follows (Contact List) | Replaceable | 02 | Tags contain `["p", "<pubkey>", "<relay>", "<petname>"]` entries. |
| 4 | Encrypted Direct Messages | Regular | 04 | Legacy encrypted DMs (deprecated in favor of kind 14). |
| 5 | Event Deletion Request | Regular | 09 | Tags reference events/addresses to delete. Content is deletion reason. |
| 6 | Repost | Regular | 18 | Content is the stringified JSON of the reposted kind:1 event. |
| 7 | Reaction | Regular | 25 | Content is reaction string ("+", "-", emoji, or custom emoji shortcode). |
| 8 | Badge Award | Regular | 58 | Awards a badge to one or more users. |
| 9 | Chat Message | Regular | C7 | Group chat message. |
| 10 | Group Chat Threaded Reply | Regular | 29 | Threaded reply in a group. |
| 11 | Thread | Regular | 7D | Thread starter event. |
| 12 | Group Thread Reply | Regular | 29 | Reply within group thread. |
| 13 | Seal | Regular | 59 | Encrypted wrapper for NIP-17 DMs. |
| 14 | Direct Message | Regular | 17 | Modern encrypted DM (inside gift wrap). |
| 15 | File Message | Regular | 17 | File attachment in DM context. |
| 16 | Generic Repost | Regular | 18 | Repost of any event kind (not just kind 1). |
| 17 | Reaction to Website | Regular | 25 | Reaction referencing a URL. |
| 20 | Picture | Regular | 68 | Picture-focused post. |
| 21 | Video Event | Regular | 71 | Video post. |
| 22 | Short-form Portrait Video | Regular | 71 | Vertical short video (stories/reels). |
| 24 | Public Message | Regular | A4 | Public message event. |

### Chat and Channels (NIP-28, NIP-29)

| Kind | Name | Category | NIP |
|------|------|----------|-----|
| 40 | Channel Creation | Regular | 28 |
| 41 | Channel Metadata | Regular | 28 |
| 42 | Channel Message | Regular | 28 |
| 43 | Channel Hide Message | Regular | 28 |
| 44 | Channel Mute User | Regular | 28 |

### Special Purpose

| Kind | Name | Category | NIP |
|------|------|----------|-----|
| 62 | Request to Vanish | Regular | 62 |
| 64 | Chess (PGN) | Regular | 64 |
| 443 | KeyPackage | Regular | -- (Marmot) |
| 444 | Welcome Message | Regular | -- (Marmot) |
| 445 | Group Event | Regular | -- (Marmot) |
| 818 | Merge Requests | Regular | 54 |
| 1018 | Poll Response | Regular | 88 |
| 1021 | Bid | Regular | 15 |
| 1022 | Bid Confirmation | Regular | 15 |
| 1040 | OpenTimestamps | Regular | 03 |
| 1059 | Gift Wrap | Regular | 59 |
| 1063 | File Metadata | Regular | 94 |
| 1068 | Poll | Regular | 88 |
| 1111 | Comment | Regular | 22 |
| 1222 | Voice Message | Regular | A0 |
| 1244 | Voice Message Comment | Regular | A0 |
| 1311 | Live Chat Message | Regular | 53 |
| 1337 | Code Snippet | Regular | C0 |
| 1617 | Patches | Regular | 34 |
| 1618 | Pull Requests | Regular | 34 |
| 1619 | Pull Request Updates | Regular | 34 |
| 1621 | Issues | Regular | 34 |
| 1622 | Git Replies | Regular | 34 |
| 1630--1633 | Status | Regular | 34 |
| 1971 | Problem Tracker | Regular | -- (Nostrocket) |
| 1984 | Reporting | Regular | 56 |
| 1985 | Label | Regular | 32 |
| 1986 | Relay Reviews | Regular | -- |
| 2003 | Torrent | Regular | 35 |
| 2004 | Torrent Comment | Regular | 35 |
| 2022 | Coinjoin Pool | Regular | -- (Joinstr) |
| 4550 | Community Post Approval | Regular | 72 |

### Job Processing (NIP-90, Data Vending Machines)

| Kind | Name | Category | NIP |
|------|------|----------|-----|
| 5000--5999 | Job Request | Regular | 90 |
| 6000--6999 | Job Result | Regular | 90 |
| 7000 | Job Feedback | Regular | 90 |

### Cashu / Wallet (NIP-60, NIP-61)

| Kind | Name | Category | NIP |
|------|------|----------|-----|
| 7374 | Reserved Cashu Wallet Tokens | Regular | 60 |
| 7375 | Cashu Wallet Tokens | Regular | 60 |
| 7376 | Cashu Wallet History | Regular | 60 |

### Groups (NIP-29, NIP-43)

| Kind | Name | Category | NIP |
|------|------|----------|-----|
| 8000 | Add User | Regular | 43 |
| 8001 | Remove User | Regular | 43 |
| 9000--9030 | Group Control Events | Regular | 29 |
| 9041 | Zap Goal | Regular | 75 |
| 9321 | Nutzap | Regular | 61 |

### Zaps (NIP-57)

| Kind | Name | Category | NIP |
|------|------|----------|-----|
| 9734 | Zap Request | Regular | 57 |
| 9735 | Zap | Regular | 57 |
| 9802 | Highlights | Regular | 84 |

### Replaceable Events (10000--19999)

| Kind | Name | NIP |
|------|------|-----|
| 10000 | Mute List | 51 |
| 10001 | Pin List | 51 |
| 10002 | Relay List Metadata | 65, 51 |
| 10003 | Bookmark List | 51 |
| 10004 | Communities List | 51 |
| 10005 | Public Chats List | 51 |
| 10006 | Blocked Relays List | 51 |
| 10007 | Search Relays List | 51 |
| 10009 | User Groups | 51, 29 |
| 10011 | External Identities | 39 |
| 10012 | Favorite Relays List | 51 |
| 10013 | Private Event Relay List | 37 |
| 10015 | Interests List | 51 |
| 10019 | Nutzap Mint Recommendation | 61 |
| 10020 | Media Follows | 51 |
| 10030 | User Emoji List | 51 |
| 10050 | Relay List to Receive DMs | 51, 17 |
| 10051 | KeyPackage Relays List | -- (Marmot) |
| 10063 | User Server List | -- (Blossom) |
| 10096 | File Storage Server List | 96 |
| 10166 | Relay Monitor Announcement | 66 |
| 10312 | Room Presence | 53 |
| 10377 | Proxy Announcement | -- (Nostr Epoxy) |
| 11111 | Transport Method Announcement | -- (Nostr Epoxy) |
| 13194 | Wallet Info | 47 |
| 13534 | Membership Lists | 43 |
| 15128 | Root nsite manifest | 5A |
| 17375 | Cashu Wallet Event | 60 |

### Ephemeral Events (20000--29999)

| Kind | Name | NIP |
|------|------|-----|
| 21000 | Lightning Pub RPC | -- (Lightning.Pub) |
| 22242 | Client Authentication | 42 |
| 23194 | Wallet Request | 47 |
| 23195 | Wallet Response | 47 |
| 24133 | Nostr Connect | 46 |
| 24242 | Blobs Stored on Mediaservers | -- (Blossom) |
| 27235 | HTTP Auth | 98 |
| 28934 | Join Request | 43 |
| 28935 | Invite Request | 43 |
| 28936 | Leave Request | 43 |

### Addressable Events (30000--39999)

| Kind | Name | NIP |
|------|------|-----|
| 30000 | Follow Sets | 51 |
| 30001 | Generic Lists | 51 |
| 30002 | Relay Sets | 51 |
| 30003 | Bookmark Sets | 51 |
| 30004 | Curation Sets | 51 |
| 30005 | Video Sets | 51 |
| 30006 | Picture Sets | 51 |
| 30007 | Kind Mute Sets | 51 |
| 30008 | Profile Badges | 58 |
| 30009 | Badge Definition | 58 |
| 30015 | Interest Sets | 51 |
| 30017 | Create/Update Stall | 15 |
| 30018 | Create/Update Product | 15 |
| 30019 | Marketplace UI/UX | 15 |
| 30020 | Product Sold as Auction | 15 |
| 30023 | Long-form Content | 23 |
| 30024 | Draft Long-form Content | 23 |
| 30030 | Emoji Sets | 51 |
| 30040 | Curated Publication Index | -- (NKBIP-01) |
| 30041 | Curated Publication Content | -- (NKBIP-01) |
| 30063 | Release Artifact Sets | 51 |
| 30078 | Application-specific Data | 78 |
| 30166 | Relay Discovery | 66 |
| 30267 | App Curation Sets | 51 |
| 30311 | Live Event | 53 |
| 30312 | Interactive Room | 53 |
| 30313 | Conference Event | 53 |
| 30315 | User Statuses | 38 |
| 30382 | User Trusted Assertion | 85 |
| 30383 | Event Trusted Assertion | 85 |
| 30384 | Addressable Trusted Assertion | 85 |
| 30402 | Classified Listing | 99 |
| 30403 | Draft Classified Listing | 99 |
| 30617 | Repository Announcements | 34 |
| 30618 | Repository State Announcements | 34 |
| 30818 | Wiki Article | 54 |
| 30819 | Redirects | 54 |
| 31234 | Draft Event | 37 |
| 31890 | Feed | -- (NUD: Custom Feeds) |
| 31922 | Date-Based Calendar Event | 52 |
| 31923 | Time-Based Calendar Event | 52 |
| 31924 | Calendar | 52 |
| 31925 | Calendar Event RSVP | 52 |
| 31989 | Handler Recommendation | 89 |
| 31990 | Handler Information | 89 |
| 34235 | Addressable Video Event | 71 |
| 34236 | Addressable Short Video Event | 71 |
| 34550 | Community Definition | 72 |
| 34128 | Legacy nsite manifest | 5A |
| 35128 | Named nsite manifest | 5A |
| 38172 | Cashu Mint Announcement | 87 |
| 38173 | Fedimint Announcement | 87 |
| 37516 | Geocache Listing | -- (Geocaching) |
| 38383 | Peer-to-peer Order Events | 69 |
| 39000--39009 | Group Metadata Events | 29 |
| 39089 | Starter Packs | 51 |
| 39092 | Media Starter Packs | 51 |
| 39701 | Web Bookmarks | B0 |

---

## 6. Tag System

### 6.1 Tag Structure

Tags are arrays of strings. The first element is the **tag name** (single character or multi-character). Subsequent elements are the tag values.

```json
["e", "abcdef1234567890...", "wss://relay.example.com", "reply", "author-pubkey-hex"]
```

### 6.2 Indexing Rules (NIP-01)

**All single-letter tags (a-z, A-Z) are expected to be indexed by relays.** This means relays maintain lookup indices on these tags, and clients can filter by them using the `#<letter>` filter syntax.

**Only the first value** (index 1 of the array, i.e., the element after the tag name) in any given tag is indexed. Additional values are metadata, not searchable.

### 6.3 Standard Tags Reference

#### `e` tag -- Event Reference (NIP-01, NIP-10)

References another event by its ID.

```json
["e", "<32-byte-hex-event-id>", "<recommended-relay-URL>", "<marker>", "<author-pubkey>"]
```

- **Position 1:** Event ID (required, 64 hex chars)
- **Position 2:** Relay URL hint (optional, may be empty string `""`)
- **Position 3:** Marker (optional): `"root"`, `"reply"`, `"mention"`, or omitted
- **Position 4:** Author pubkey of the referenced event (optional, 64 hex chars)

**Threading with markers (NIP-10):**
- `"root"` -- identifies the root event of the thread
- `"reply"` -- identifies the direct parent being replied to
- No marker -- a mention/citation, not a reply

Example of a reply to a thread:
```json
{
  "kind": 1,
  "tags": [
    ["e", "root-event-id-hex", "wss://relay.example.com", "root"],
    ["e", "parent-event-id-hex", "wss://relay.example.com", "reply"],
    ["p", "root-author-pubkey"],
    ["p", "parent-author-pubkey"]
  ],
  "content": "This is my reply"
}
```

#### `p` tag -- Pubkey Reference (NIP-01, NIP-10)

References a user by their public key.

```json
["p", "<32-byte-hex-pubkey>", "<recommended-relay-URL>"]
```

When replying to an event, include `p` tags for:
- The author of the event being replied to
- All `p` tags from the parent event (to maintain the participant list)

#### `a` tag -- Addressable Event Reference (NIP-01)

References an addressable (parameterized replaceable) or replaceable event.

For addressable events (kinds 30000--39999):
```json
["a", "<kind>:<pubkey>:<d-tag-value>", "<optional-relay-URL>"]
```

For replaceable events (kinds 0, 3, 10000--19999):
```json
["a", "<kind>:<pubkey>:", "<optional-relay-URL>"]
```

Example:
```json
["a", "30023:abcdef1234...:my-article-slug", "wss://relay.example.com"]
```

#### `d` tag -- Identifier for Addressable Events (NIP-01)

The `d` tag differentiates addressable events of the same kind by the same author. Only the **first** `d` tag's value is used.

```json
["d", "unique-identifier-string"]
```

If no `d` tag is present, the identifier is treated as the empty string `""`.

#### `t` tag -- Hashtag (NIP-12)

A topic or hashtag. Values SHOULD be lowercase.

```json
["t", "nostr"]
```

#### `r` tag -- Reference (NIP-65, various)

Context-dependent. In kind 10002 (NIP-65), references relays:

```json
["r", "wss://relay.example.com", "read"]
["r", "wss://relay.example.com", "write"]
["r", "wss://relay.example.com"]
```

In other contexts, may reference URLs or other resources.

#### `nonce` tag -- Proof of Work (NIP-13)

```json
["nonce", "<nonce-value>", "<target-difficulty>"]
```

#### `expiration` tag (NIP-40)

```json
["expiration", "<unix-timestamp>"]
```

Relays SHOULD discard events after their expiration time.

#### `subject` tag (NIP-14)

```json
["subject", "Re: Topic of discussion"]
```

#### `content-warning` tag (NIP-36)

```json
["content-warning", "reason for warning"]
```

#### `alt` tag (NIP-31)

Human-readable description of the event for clients that do not understand its kind.

```json
["alt", "This is a long-form article about NOSTR protocol"]
```

### 6.4 Tag Conventions Summary

| Tag | Indexed | Meaning | Primary NIPs |
|-----|---------|---------|-------------|
| `e` | Yes | Event reference | 01, 10 |
| `p` | Yes | Pubkey reference | 01, 10 |
| `a` | Yes | Addressable/replaceable event reference | 01 |
| `d` | Yes | Addressable event identifier | 01 |
| `t` | Yes | Hashtag / topic | 12 |
| `r` | Yes | Relay URL or general reference | 65 |
| `g` | Yes | Geohash | 52 |
| `i` | Yes | External identity | 39 |
| `k` | Yes | Kind number reference | 18 |
| `l` | Yes | Label / label namespace | 32 |
| `L` | Yes | Label namespace | 32 |
| `m` | Yes | MIME type | 94 |
| `q` | Yes | Quote repost event reference | 18 |
| `x` | Yes | Custom classification | -- |
| `nonce` | No | Proof of work | 13 |
| `subject` | No | Message subject | 14 |
| `alt` | No | Alternative text description | 31 |
| `expiration` | No | Event expiration timestamp | 40 |
| `content-warning` | No | Content warning reason | 36 |
| `emoji` | No | Custom emoji definition | 30 |
| `imeta` | No | Inline media metadata | 92 |
| `proxy` | No | Proxy source | -- |
| `relays` | No | Relay list within event | 57 |

---

## 7. Event Validation Rules

A relay or client verifying an event MUST check:

### 7.1 Structural Validation

1. The event is a valid JSON object
2. All seven required fields are present (`id`, `pubkey`, `created_at`, `kind`, `tags`, `content`, `sig`)
3. `id` is a 64-character lowercase hex string
4. `pubkey` is a 64-character lowercase hex string
5. `created_at` is a non-negative integer
6. `kind` is an integer in range 0--65535
7. `tags` is an array of arrays, where each inner array contains only non-null strings
8. `content` is a string
9. `sig` is a 128-character lowercase hex string

### 7.2 Cryptographic Validation

1. Recompute the event ID by serializing `[0, pubkey, created_at, kind, tags, content]` as minified JSON, then taking SHA-256
2. The recomputed ID MUST match the `id` field exactly
3. The Schnorr signature `sig` MUST verify against `pubkey` and `id` per BIP-340

### 7.3 Relay-Specific Validation

Relays MAY additionally enforce (NIP-11):

- `created_at` within acceptable bounds (`created_at_lower_limit`, `created_at_upper_limit`)
- Maximum number of tags (`max_event_tags`)
- Maximum content length (`max_content_length`)
- Minimum proof-of-work difficulty (`min_pow_difficulty`, NIP-13)
- Authentication requirements (`auth_required`, NIP-42)
- Event expiration (NIP-40): discard events where the `expiration` tag timestamp has passed

### 7.4 Replacement Logic for Stored Events

When a relay receives a replaceable or addressable event:

1. Look up the existing event with the same replacement key
2. If no existing event, store the new event
3. If the new event has a **strictly higher** `created_at`, replace the old event
4. If `created_at` values are equal, retain the event with the **lexicographically lower `id`** (NIP-01)
5. Otherwise, discard the new event

---

## 8. Special Event Kinds: Detailed Semantics

### Kind 0: User Metadata (NIP-01)

The `content` field is a stringified JSON object. Standard fields:

```json
{
  "name": "satoshi",
  "about": "Creator of Bitcoin",
  "picture": "https://example.com/avatar.jpg",
  "display_name": "Satoshi Nakamoto",
  "banner": "https://example.com/banner.jpg",
  "nip05": "satoshi@example.com",
  "lud16": "satoshi@getalby.com",
  "website": "https://bitcoin.org"
}
```

Being kind 0 (replaceable), only the latest profile per pubkey is kept.

### Kind 3: Follows / Contact List (NIP-02)

Tags contain follow entries:

```json
{
  "kind": 3,
  "tags": [
    ["p", "pubkey-hex-1", "wss://relay1.com", "alice"],
    ["p", "pubkey-hex-2", "wss://relay2.com", "bob"]
  ],
  "content": ""
}
```

Being kind 3 (replaceable), the follow list is always fully replaced (not appended).

### Kind 5: Event Deletion (NIP-09)

```json
{
  "kind": 5,
  "tags": [
    ["e", "event-id-to-delete"],
    ["a", "30023:pubkey:slug"]
  ],
  "content": "Reason for deletion"
}
```

Relays SHOULD delete the referenced events if the deletion request comes from the same pubkey as the original event author.

### Kind 1059: Gift Wrap (NIP-59)

Wraps an encrypted event (seal) for private delivery. The outer event has a randomized `created_at` to prevent timing analysis.

### Kind 10002: Relay List Metadata (NIP-65)

```json
{
  "kind": 10002,
  "tags": [
    ["r", "wss://alicerelay.example.com", "read"],
    ["r", "wss://brando-relay.com", "write"],
    ["r", "wss://expensive-relay.example2.com"]
  ],
  "content": ""
}
```

Tags without a read/write marker indicate the relay is used for both. This event is critical for the **outbox model** (see `data-flow.md`).
