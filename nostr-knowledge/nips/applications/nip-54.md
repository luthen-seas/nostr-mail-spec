# NIP-54: Wiki

## Status
Draft / Optional

## Summary
NIP-54 defines a collaborative wiki system on NOSTR where multiple users can write articles about the same subjects. Wiki articles are addressable events (kind 30818) with normalized `d` tags as article identifiers, written in Djot markup. The protocol includes merge requests (kind 818) for proposing changes and redirects (kind 30819) for disambiguation. Article selection is crowd-sourced through reactions, web-of-trust, and relay preferences rather than centralized editorial control.

## Motivation
Traditional wikis (Wikipedia, etc.) rely on centralized editorial control and are susceptible to bias, censorship, and single points of failure. NIP-54 creates a decentralized wiki where anyone can publish articles, and readers choose which version to trust based on social signals (reactions, follows, web-of-trust). Multiple competing versions of the same article can coexist, with market-like dynamics determining which version surfaces for each reader. This is especially powerful for controversial topics where a single "neutral" version is impossible.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 30818 | Wiki Article | Addressable | An encyclopedia/wiki article |
| 818 | Merge Request | Regular | Proposes changes to an existing article |
| 30819 | Wiki Redirect | Addressable | Points one article identifier to another |

### Tags

#### Wiki Article (30818) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `["d", "<normalized-topic>"]` | Normalized article identifier (see rules below) |
| `title` | No | `["title", "<display-title>"]` | Display title when different from `d` tag |
| `summary` | No | `["summary", "<text>"]` | Brief description for list displays |
| `a` | No | `["a", "30818:<pubkey>:<d-tag>", "<relay-url>"]` | Fork source reference |
| `e` | No | `["e", "<event-id>", "<relay-url>"]` | Specific version forked from |

**Content:** Article body in **Djot markup** (not Markdown).

**Special tags for attribution and deference:**
- `fork` marker: An `a` or `e` tag with `"fork"` as the last element indicates this article was derived from another.
- `defer` marker: An `a` tag with `"defer"` as the last element indicates the author considers the referenced version to be the preferred/superior version.

#### Merge Request (818) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `a` | Yes | `["a", "30818:<dest-pubkey>:<topic>", "<relay-url>"]` | Target article to merge into |
| `e` | No | `["e", "<base-version-event-id>", "<relay-url>"]` | The version the changes were based on |
| `p` | Yes | `["p", "<destination-pubkey>"]` | Article owner receiving the merge request |
| `e` | Yes | `["e", "<source-version-event-id>", "<relay-url>", "source"]` | The version containing the proposed changes |

**Content:** Description of the proposed changes.

#### Wiki Redirect (30819) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `["d", "<source-topic>"]` | The identifier being redirected from |
| `a` | Yes | `["a", "30818:<pubkey>:<target-topic>", "<relay-url>"]` | The article to redirect to |

**Content:** Empty string.

### D-Tag Normalization Rules

All article identifiers (`d` tags) MUST be normalized using these rules:

1. Convert uppercase letters to lowercase
2. Replace all whitespace characters with hyphens (`-`)
3. Remove all punctuation and symbols
4. Collapse consecutive hyphens into a single hyphen
5. Strip leading and trailing hyphens
6. Preserve non-ASCII characters (Japanese, Cyrillic, Arabic, etc.)
7. Preserve numbers

**Examples:**
| Input | Normalized Output |
|-------|-------------------|
| `"Wiki Article"` | `"wiki-article"` |
| `"What's Up?"` | `"whats-up"` |
| `"Nostr Protocol"` | `"nostr-protocol"` |
| `"Москва"` | `"москва"` |
| `"Bitcoin (BTC)"` | `"bitcoin-btc"` |

### Content Format: Djot

Articles use **Djot markup** (not Markdown), with two NOSTR-specific extensions:

1. **NIP-21 links:** Links can use `nostr:` URIs as targets:
   ```djot
   [Bob](nostr:npub1abcdef...)
   [This event](nostr:nevent1...)
   ```

2. **Wiki-style links:** Reference-style links where the reference is not defined elsewhere in the document automatically become links to other wiki articles:
   ```djot
   Read more about [Bitcoin][] and [Lightning Network][].
   ```
   If `[Bitcoin]` is not defined as a reference, it becomes a link to the wiki article with `d` tag `"bitcoin"` (after normalization).

### Protocol Flow

1. **Author writes an article** and publishes a kind 30818 event with the normalized topic as the `d` tag.
2. **Multiple authors may write articles** on the same topic (same `d` tag), creating competing versions.
3. **Readers discover articles** by querying for kind 30818 with a specific `d` tag.
4. **Clients select which version to display** using a prioritized selection algorithm (see below).
5. **Contributors propose changes** by publishing kind 818 merge requests referencing the target article.
6. **Article owners review** merge requests and optionally incorporate changes by publishing updated articles.
7. **Redirects** (kind 30819) can point deprecated or ambiguous terms to the canonical article.

### Article Selection Algorithm

When multiple versions of an article exist (same `d` tag, different `pubkey`), clients prioritize using:

1. **Reactions (NIP-25):** Articles with more positive reactions rank higher.
2. **Relay lists (NIP-51):** Articles from authors in the user's preferred relay list.
3. **Contact lists (NIP-02):** Articles from authors the user follows.
4. **Web-of-trust:** Articles from authors within the user's social graph (follows of follows, etc.).

This means different users may see different versions of the same article based on their social context.

### JSON Examples

**Wiki Article (kind 30818):**
```json
{
  "kind": 30818,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700000000,
  "content": "Bitcoin is a decentralized digital currency created in 2009 by the pseudonymous Satoshi Nakamoto.\n\nIt operates on a peer-to-peer network using a proof-of-work consensus mechanism.\n\n## History\n\nThe Bitcoin whitepaper was published on October 31, 2008.\n\n## See Also\n\n- [Lightning Network][]\n- [Nostr Protocol][]",
  "tags": [
    ["d", "bitcoin"],
    ["title", "Bitcoin"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Forked Article:**
```json
{
  "kind": 30818,
  "pubkey": "<forker-pubkey-hex>",
  "created_at": 1700100000,
  "content": "Bitcoin is a decentralized digital currency and the first cryptocurrency...\n\n## Technical Details\n\nAdded more technical depth to the original article.",
  "tags": [
    ["d", "bitcoin"],
    ["title", "Bitcoin"],
    ["a", "30818:abcdef0123456789:bitcoin", "wss://relay.example.com", "fork"],
    ["e", "original-event-id-hex", "wss://relay.example.com", "fork"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Article with Defer:**
```json
{
  "kind": 30818,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700200000,
  "content": "This is my version but I think the other one is better.",
  "tags": [
    ["d", "bitcoin"],
    ["title", "Bitcoin"],
    ["a", "30818:betterauthor0123456789:bitcoin", "wss://relay.example.com", "defer"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Merge Request (kind 818):**
```json
{
  "kind": 818,
  "pubkey": "<contributor-pubkey-hex>",
  "created_at": 1700300000,
  "content": "I added information about the block size limit and the Blocksize War.",
  "tags": [
    ["a", "30818:abcdef0123456789:bitcoin", "wss://relay.example.com"],
    ["e", "base-version-event-id-hex", "wss://relay.example.com"],
    ["p", "abcdef0123456789"],
    ["e", "source-version-event-id-hex", "wss://relay.example.com", "source"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Wiki Redirect (kind 30819):**
```json
{
  "kind": 30819,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700400000,
  "content": "",
  "tags": [
    ["d", "btc"],
    ["a", "30818:abcdef0123456789:bitcoin", "wss://relay.example.com"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

## Implementation Notes

- **Djot, not Markdown:** The content format is specifically Djot, which is similar to but distinct from Markdown. Clients must use a Djot parser, not a Markdown parser. Key differences include Djot's consistent syntax for emphasis, its handling of raw content, and its extensibility.
- **Normalization is critical:** Two articles about "Bitcoin" and "bitcoin" MUST resolve to the same `d` tag (`"bitcoin"`). Clients must normalize before querying and before publishing.
- **Multiple competing versions:** Unlike traditional wikis, there is no single canonical version. Each reader's client chooses which version to show based on their social graph. This is a feature, not a bug.
- **Fork and defer chains:** An article can fork from another (attribution) and defer to another (delegation). Clients should follow defer chains but avoid infinite loops.
- **Merge requests are advisory:** There is no protocol-level merge mechanism. The target author must manually incorporate changes.
- **Redirects enable disambiguation:** For example, `"btc"` can redirect to `"bitcoin"`, and `"mercury"` could redirect to `"mercury-planet"` or `"mercury-element"` depending on the author.

## Client Behavior

- Clients MUST normalize `d` tags before publishing and querying.
- Clients SHOULD implement the article selection algorithm to choose which version to display.
- Clients SHOULD render Djot content (not Markdown).
- Clients SHOULD resolve wiki-style links (`[topic][]`) to internal article lookups.
- Clients SHOULD resolve NIP-21 links in content.
- Clients SHOULD follow redirect (kind 30819) events transparently.
- Clients SHOULD follow `defer` chains to find preferred versions, with loop detection.
- Clients SHOULD display merge requests (kind 818) to article owners for review.
- Clients MAY show the number of competing versions and allow users to switch between them.
- Clients MAY display fork attribution.

## Relay Behavior

- Relays SHOULD accept all NIP-54 event kinds.
- Relays SHOULD support efficient querying by `d` tag for kind 30818 (many users will query the same topics).
- Relays SHOULD support addressable event replacement for kinds 30818 and 30819.
- No special validation is required.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-02** -- Contact List / Follow List (for article selection)
- **NIP-21** -- `nostr:` URI scheme (for in-content links)
- **NIP-25** -- Reactions (for article ranking)
- **NIP-51** -- Lists (relay lists for selection algorithm)
- **Djot markup** -- Content format ([https://djot.net/](https://djot.net/))

## Source Code References

- **wikistr** -- Wiki client implementing NIP-54
- **nostr-tools**: Check for kind 30818/818/30819 constants
- **rust-nostr**: Kind definitions in `crates/nostr/src/event/kind.rs`

## Related NIPs

- **NIP-01** -- Basic protocol flow
- **NIP-02** -- Contact lists (article selection)
- **NIP-21** -- `nostr:` URI scheme
- **NIP-23** -- Long-form Content (similar addressable article concept, but NIP-54 is specifically for wiki/encyclopedia content)
- **NIP-25** -- Reactions (article ranking)
- **NIP-51** -- Lists
