# NIP-22: Comment

## Status
Active (draft, optional)

## Summary
NIP-22 defines `kind:1111` as a universal comment event that can thread off any Nostr event kind or external identifier. Unlike NIP-10 (which handles threading for `kind:1` text notes only), NIP-22 provides a generic commenting mechanism for blog posts, images, videos, URLs, podcasts, and any other content. It uses uppercase tags (K, E, A, I) to define the root scope and lowercase tags (k, e, a, i) to reference the direct parent.

## Motivation
NIP-10 threading only works for `kind:1` text notes. Users need to comment on many other types of content: long-form articles (`kind:30023`), file metadata (`kind:1063`), external URLs, podcast episodes, and more. NIP-22 provides a single, consistent commenting system that works across all event kinds and even external resources. The uppercase/lowercase tag convention cleanly separates "what is the root of this thread" from "what am I directly replying to."

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| 1111 | Comment |

### Content Field

The `.content` field contains **plaintext only** (no markdown, no HTML), same as NIP-10 `kind:1`.

### Tags

NIP-22 uses a dual-case tag convention:

| Tag | Case | Purpose | Required |
|-----|------|---------|----------|
| `K` | Upper | Kind of the root event/scope | MUST |
| `k` | Lower | Kind of the direct parent | MUST |
| `E` | Upper | Event ID of the root event | Conditional (for event roots) |
| `e` | Lower | Event ID of the direct parent | Conditional (for event parents) |
| `A` | Upper | Coordinate of the root event (addressable) | Conditional (for addressable roots) |
| `a` | Lower | Coordinate of the direct parent (addressable) | Conditional (for addressable parents) |
| `I` | Upper | External identifier of the root scope | Conditional (for external roots) |
| `i` | Lower | External identifier of the direct parent | Conditional (for external parents) |
| `P` | Upper | Pubkey of the root event author | SHOULD (when root is a Nostr event) |
| `p` | Lower | Pubkey of the direct parent author | SHOULD (when parent is a comment) |
| `q` | Lower | Quoted event reference (per NIP-18) | Optional |

**Key rules:**
- `K` and `k` MUST always be present
- For top-level comments (commenting directly on the root): uppercase and lowercase tags will reference the same target
- For nested comments (replying to another comment): uppercase tags reference the original root; lowercase tags reference the parent comment
- Comments MUST NOT be used to reply to `kind:1` notes -- use NIP-10 instead

### Tag Formats

**For Nostr event roots (regular events):**
```json
["E", "<event-id>", "<relay-url>", "<author-pubkey>"]
["K", "<kind-number>"]
["P", "<root-author-pubkey>"]
```

**For Nostr event roots (addressable events):**
```json
["A", "<kind>:<pubkey>:<d-tag>", "<relay-url>"]
["E", "<event-id>", "<relay-url>", "<author-pubkey>"]
["K", "<kind-number>"]
["P", "<root-author-pubkey>"]
```

**For external identifier roots:**
```json
["I", "<external-identifier>"]
["K", "<external-kind>"]
```

**For parent references (replying to another comment):**
```json
["e", "<parent-comment-event-id>", "<relay-url>", "<parent-author-pubkey>"]
["k", "1111"]
["p", "<parent-author-pubkey>"]
```

### Protocol Flow

**Commenting on a blog post (kind:30023, addressable event):**
1. User reads a blog post event (kind:30023)
2. Client creates a `kind:1111` event with:
   - `A` tag with the article coordinate
   - `E` tag with the article event ID
   - `K` tag with `"30023"`
   - `P` tag with the article author's pubkey
   - Same values in lowercase tags (since this is a top-level comment)

**Replying to a comment (nested comment):**
1. User reads an existing `kind:1111` comment on a blog post
2. Client creates a new `kind:1111` event with:
   - Uppercase tags (K, E/A, P) still reference the original blog post (root)
   - Lowercase tags (k, e, p) reference the parent comment
   - `k` = `"1111"` (parent is a comment)

**Commenting on an external URL:**
1. User wants to comment on `https://example.com/article`
2. Client creates a `kind:1111` event with:
   - `I` and `i` tags with the URL
   - `K` and `k` tags with the appropriate external kind identifier

### JSON Examples

**Top-level comment on a blog post (kind:30023):**
```json
{
  "kind": 1400,
  "content": "Great article, really enjoyed the section on decentralization.",
  "tags": [
    ["A", "30023:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:my-blog-post", "wss://relay.example.com"],
    ["E", "aaa111bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111", "wss://relay.example.com", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["K", "30023"],
    ["P", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["a", "30023:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:my-blog-post", "wss://relay.example.com"],
    ["e", "aaa111bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111", "wss://relay.example.com", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["k", "30023"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
  ]
}
```

**Reply to an existing comment (nested comment):**
```json
{
  "kind": 1400,
  "content": "I agree, that was the best part.",
  "tags": [
    ["A", "30023:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:my-blog-post", "wss://relay.example.com"],
    ["E", "aaa111bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111", "wss://relay.example.com", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["K", "30023"],
    ["P", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["e", "bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111fff222", "wss://relay.example.com", "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"],
    ["k", "1111"],
    ["p", "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"]
  ]
}
```

**Comment on a NIP-94 file metadata event (kind:1063):**
```json
{
  "kind": 1400,
  "content": "Beautiful photo!",
  "tags": [
    ["E", "ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111fff222aaa333", "wss://relay.example.com", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"],
    ["K", "1063"],
    ["P", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"],
    ["e", "ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111fff222aaa333", "wss://relay.example.com", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"],
    ["k", "1063"],
    ["p", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"]
  ]
}
```

**Comment on a website URL:**
```json
{
  "kind": 1400,
  "content": "Interesting read on decentralization.",
  "tags": [
    ["I", "https://example.com/decentralization-article"],
    ["K", "https"],
    ["i", "https://example.com/decentralization-article"],
    ["k", "https"]
  ]
}
```

**Comment on a podcast episode:**
```json
{
  "kind": 1400,
  "content": "Great episode, the guest was really insightful.",
  "tags": [
    ["I", "podcast:guid:abc123-def456-ghi789"],
    ["K", "podcast:guid"],
    ["i", "podcast:guid:abc123-def456-ghi789"],
    ["k", "podcast:guid"]
  ]
}
```

**Reply to a comment on a podcast episode:**
```json
{
  "kind": 1400,
  "content": "Totally agree about the guest!",
  "tags": [
    ["I", "podcast:guid:abc123-def456-ghi789"],
    ["K", "podcast:guid"],
    ["e", "ddd444eee555fff666aaa777bbb888ccc999ddd000eee111fff222aaa333bbb444", "wss://relay.example.com", "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"],
    ["k", "1111"],
    ["p", "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"]
  ]
}
```

## Implementation Notes

1. **Do NOT use NIP-22 for kind:1 replies:** Comments (kind:1111) MUST NOT be used to reply to `kind:1` text notes. Use NIP-10 threading instead. This prevents fragmentation of the threading model.

2. **Root vs Parent distinction:** The uppercase/lowercase convention is critical. When displaying a comment thread, use uppercase tags to group all comments under the same root, and lowercase tags to build the parent-child tree.

3. **External identifiers:** The `I`/`i` tags follow NIP-73 external identifier conventions. The `K`/`k` tags for external content use the protocol/type as the "kind" (e.g., `"https"` for URLs).

4. **Querying comments:** To find all comments on a specific event, filter for `kind:1111` events with matching `#E` (uppercase E tag) or `#A` (uppercase A tag) values. For comments on external resources, filter with `#I`.

5. **Mixed Nostr + external roots:** An addressable event root should include both `A` and `E` tags (the coordinate and the specific event ID) for maximum compatibility.

## Client Behavior

- Clients MUST include `K` and `k` tags on all `kind:1111` events
- Clients MUST NOT use `kind:1111` to reply to `kind:1` events
- Clients SHOULD include `P` and `p` tags for author notification
- Clients SHOULD include relay hints in `E`, `e`, `A`, `a` tags
- Clients SHOULD display comment threads grouped by root (uppercase tags)
- Clients MAY render inline `nostr:` references and `q` tags within comment content
- Clients MAY display comment counts on commentable content

## Relay Behavior

- Relays MUST index uppercase single-letter tags (`E`, `A`, `I`, `K`, `P`) for filter queries
- Relays MUST store `kind:1111` events as regular events
- Relays SHOULD support `#E`, `#A`, `#I` filter queries for comment lookups

## Dependencies
- NIP-01: Base protocol
- NIP-10: Text Notes threading (NIP-22 explicitly defers to NIP-10 for kind:1)
- NIP-18: Reposts (q tag for citations)
- NIP-21: nostr: URI scheme (for inline references)
- NIP-73: External Content IDs (for I/i tag values)

## Source Code References

- **nostr-tools (JS):** `nip22.ts` (if available) or custom implementations
- **rust-nostr:** `nostr/src/nips/nip22.rs`
- **go-nostr:** Comment event construction utilities

## Related NIPs
- NIP-01: Base protocol
- NIP-10: Text Notes threading (for kind:1 only)
- NIP-18: Reposts (q tag)
- NIP-27: Text Note References
- NIP-73: External Content IDs
