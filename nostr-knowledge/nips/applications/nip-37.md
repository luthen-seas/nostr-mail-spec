# NIP-37: Draft Events

## Status
Draft / Optional

## Summary
NIP-37 defines a mechanism for storing unsigned event drafts as encrypted, addressable events (kind 31234). Drafts are JSON-stringified events encrypted with NIP-44 to the author's own public key, allowing users to save work-in-progress posts, articles, or any other event type across devices. A companion kind (10013) specifies private relay preferences for storing sensitive content.

## Motivation
Users frequently need to save unfinished work -- a half-written long-form article, a draft reply, or a prepared announcement. Without a standard for drafts, each client must implement its own storage, leading to drafts being trapped in a single client. NIP-37 provides a protocol-level solution: encrypted drafts stored on relays that any NIP-37-aware client can access, giving users cross-client draft portability while maintaining privacy (drafts are encrypted so relays and other users cannot read them).

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 31234 | Draft Event | Addressable (parameterized replaceable) | Stores an encrypted draft of an unsigned event |
| 10013 | Private Relay List | Replaceable | Lists relays preferred for private/draft content storage |

### Tags

#### Draft Event (31234) Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique identifier for the draft (allows replacement) |
| `k` | Yes | The kind number of the draft event (as string), e.g., `"1"` for a note draft |
| `expiration` | No | NIP-40 expiration timestamp (recommended) |

**Content:** NIP-44 encrypted, JSON-stringified draft event. The draft event is encrypted to the signer's own public key, meaning only the author can decrypt it. A blank/empty `content` field indicates the draft has been deleted.

#### Private Relay List (10013) Tags

The relay URLs are stored as **private tags** -- they are JSON-stringified and NIP-44 encrypted in the `content` field, not in plaintext tags.

Encrypted content structure:
```json
[
  ["relay", "wss://private-relay.example.com"],
  ["relay", "wss://another-private-relay.example.com"]
]
```

### Protocol Flow

1. **User begins composing** an event (note, article, etc.) in a client.
2. **Client auto-saves** by JSON-stringifying the unsigned draft event and encrypting it with NIP-44 using the user's own public key.
3. **Client publishes a kind 31234 event** to the user's preferred private relays (from kind 10013) with the encrypted draft as content.
4. **On another device**, the user's client queries their private relays for kind 31234 events, decrypts them, and presents the drafts for continued editing.
5. **When the user finalizes** the event, the client signs and publishes the real event, then either deletes the draft (by publishing with empty content) or lets it expire (if `expiration` tag was set).
6. **Private relay preferences** are published as kind 10013 events to the user's NIP-65 write relays, with the actual relay URLs encrypted in the content.

### JSON Examples

**Draft Event (kind 31234):**
```json
{
  "kind": 31234,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700000000,
  "tags": [
    ["d", "draft-article-20240101"],
    ["k", "30023"],
    ["expiration", "1700604800"]
  ],
  "content": "<NIP-44 encrypted JSON string of the unsigned draft event>",
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**The decrypted content would be an unsigned event like:**
```json
{
  "kind": 30023,
  "tags": [
    ["d", "my-article-slug"],
    ["title", "My Unfinished Article"],
    ["summary", "A deep dive into..."],
    ["t", "nostr"],
    ["t", "protocol"]
  ],
  "content": "# My Unfinished Article\n\nThis is a work in progress...\n\n## Section 1\nTODO: Add more content here.",
  "created_at": 1700000000
}
```

**Private Relay List (kind 10013):**
```json
{
  "kind": 10013,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700000000,
  "tags": [],
  "content": "<NIP-44 encrypted JSON array of relay tags>",
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**The decrypted content of kind 10013:**
```json
[
  ["relay", "wss://private-drafts.example.com"],
  ["relay", "wss://auth-relay.example.com"]
]
```

**Deleted Draft (empty content):**
```json
{
  "kind": 31234,
  "tags": [
    ["d", "draft-article-20240101"],
    ["k", "30023"]
  ],
  "content": "",
  "pubkey": "<author-pubkey-hex>"
}
```

## Implementation Notes

- **Encryption:** Drafts are encrypted using NIP-44 to the author's own public key. This means the conversation key is derived from the author's secret key and their own public key.
- **Deletion:** Publishing a kind 31234 event with the same `d` tag and empty `content` effectively deletes the draft (since it is a parameterized replaceable event, the new version replaces the old).
- **Expiration:** NIP-40 expiration tags are recommended to ensure stale drafts are automatically cleaned up by relays.
- **Draft content is unsigned:** The JSON event stored in the encrypted content does NOT have `id`, `sig`, or `pubkey` fields -- it is not a valid signed event. The client must add those when the user finalizes.
- **Multiple drafts:** Each draft gets a unique `d` tag, allowing multiple drafts to coexist.
- **The `k` tag** allows clients to filter drafts by the kind being drafted (e.g., show only article drafts, only note drafts).

## Client Behavior

- Clients SHOULD publish kind 31234 events to relays listed in the user's kind 10013 event.
- Clients MUST publish kind 10013 events to the author's NIP-65 write relays.
- Clients SHOULD implement auto-save functionality, periodically updating the draft event.
- Clients SHOULD present a "drafts" section where users can view and resume editing saved drafts.
- Clients SHOULD delete drafts (empty content) or allow them to expire after the final event is published.
- Clients MAY display the `k` tag to indicate what type of event each draft will become.

## Relay Behavior

- Private storage relays (listed in kind 10013) SHOULD be NIP-42 authenticated relays.
- These relays SHOULD only allow downloads of events signed by the authenticated user.
- Relays SHOULD honor NIP-40 expiration tags and automatically delete expired drafts.
- Relays SHOULD support parameterized replaceable event semantics for kind 31234.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-40** -- Expiration Timestamp (for auto-cleanup of stale drafts)
- **NIP-42** -- Authentication (recommended for private relay access)
- **NIP-44** -- Versioned Encryption (for encrypting draft content)
- **NIP-65** -- Relay List Metadata (for publishing kind 10013)

## Source Code References

- **nostr-tools**: Check for NIP-44 encryption utilities and kind 31234 handling
- **rust-nostr**: `crates/nostr/src/event/kind.rs` for kind definitions; NIP-44 encryption in crypto modules

## Related NIPs

- **NIP-01** -- Basic protocol flow
- **NIP-40** -- Expiration timestamps
- **NIP-42** -- Relay authentication
- **NIP-44** -- Encryption for draft content
- **NIP-65** -- Relay list metadata
- **NIP-78** -- Application-specific data (alternative approach to storing app state)
