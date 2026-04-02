# NIP-27: Text Note References

## Status
Active (draft, optional)

## Summary
NIP-27 standardizes how clients handle inline references to other Nostr profiles and events within the `.content` field of any event that has readable text. References are embedded as `nostr:` URIs (using NIP-19/NIP-21 encoded identifiers) directly in the content string. Writing clients insert these URIs; reading clients parse them and render rich previews, links, or mentions.

## Motivation
Users need to mention other users and reference other events inline within their notes. Without a standard, clients would use incompatible formats (e.g., `@username`, `#[0]`, raw hex, etc.). NIP-27 establishes that `nostr:` URIs with NIP-19 encoded entities are THE standard for inline references, providing a universal format that any client can parse and render. The tag system (NIP-10, NIP-18) determines threading relationships, while NIP-27 determines how references appear in human-readable content.

## Specification

### Event Kinds

NIP-27 applies to any event kind that has readable text in its `.content` field. Primary examples:
- `kind:1` -- Short text notes
- `kind:30023` -- Long-form articles
- `kind:1111` -- Comments
- Any custom kind with human-readable content

### Tags

NIP-27 itself does not define new tags, but references in content are typically accompanied by tags:

| Tag | When to Include | Purpose |
|-----|----------------|---------|
| `p` | When mentioning a profile and wanting to notify them | Notification |
| `e` | When referencing an event as a reply | Threading (NIP-10) |
| `q` | When quoting/citing an event | Citation (NIP-18) |

**Important:** Including tags is OPTIONAL. An author may include a `nostr:nprofile1...` in content without a corresponding `p` tag if they do not want to notify that user.

### Protocol Flow

**Writing a mention (client-side):**

1. User types in a compose area, e.g., `"hello @mat"`
2. Client shows autocomplete suggestions
3. User selects a profile (e.g., mattn)
4. Client inserts `nostr:nprofile1qqszclxx9f5haga8sfjjrulaxncvkfekj097t6f3pu65f86rvg49ehqj6f9dh` (or `nostr:npub1...`) into the `.content` at the cursor position
5. Client displays this as `@mattn` (highlighted) to the author
6. Optionally, client adds `["p", "<mattn's hex pubkey>"]` tag for notification
7. Event is published

**Reading a mention (client-side):**

1. Client receives an event with `.content` containing `nostr:nprofile1...` or `nostr:npub1...`
2. Client parses the content, finding `nostr:` URIs
3. Client decodes the NIP-19 entity to extract the pubkey (and optional relay hints)
4. Client fetches the referenced profile from its database or relays
5. Client replaces the `nostr:` URI with a rendered name (e.g., `@mattn`) and a link to the profile view

**Referencing an event:**

1. User pastes a `nevent1...` or `note1...` code
2. Client prefixes it with `nostr:` in the content
3. Optionally adds a `q` tag (for citation) or `e` tag (for reply)
4. Reading client may render the referenced event as an inline preview/embed

### JSON Examples

**Profile mention in a kind:1 note:**
```json
{
  "content": "hello nostr:nprofile1qqszclxx9f5haga8sfjjrulaxncvkfekj097t6f3pu65f86rvg49ehqj6f9dh",
  "created_at": 1679790774,
  "id": "f39e9b451a73d62abc5016cffdd294b1a904e2f34536a208874fe5e22bbd47cf",
  "kind": 1,
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "sig": "f8c8bab1b90cc3d2ae1ad999e6af8af449ad8bb4edf64807386493163e29162b5852a796a8f474d6b1001cddbaac0de4392838574f5366f03cc94cf5dfb43f4d",
  "tags": [
    ["p", "2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc"]
  ]
}
```

**Event reference in content (with quote tag):**
```json
{
  "content": "This is exactly what I was saying nostr:nevent1qqstna2yrezu5wghjvswqqculvvwxsrcvu7uc0f78gan4xqhvz49d9spr3mhxue69uhkummnw3ez6un9d3shjtn4de6x2argwghx6egpr4mhxue69uhkummnw3ez6ur4vgh8wetvd3hhyer9wghxuet5nxnepm",
  "kind": 1,
  "tags": [
    ["q", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://relay.example.com", "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"]
  ],
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "created_at": 1679790774,
  "id": "...",
  "sig": "..."
}
```

**Mention without notification (no p tag):**
```json
{
  "content": "I was reading something by nostr:npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9 the other day",
  "kind": 1,
  "tags": [],
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "created_at": 1679790774,
  "id": "...",
  "sig": "..."
}
```

**Long-form article with inline references:**
```json
{
  "content": "In this article I build on the ideas presented by nostr:nprofile1qqszclxx9f5haga8sfjjrulaxncvkfekj097t6f3pu65f86rvg49ehqj6f9dh in their earlier work. See also nostr:naddr1qqyrzwrxvc6ngvfkqyghwumn8ghj7enfv96x5ctx9e3k7mgzyqalp33lewf5vdq847t6te0wvnags0gs0mu72kz8938tn24wlfze6qcyqqq823cph95ag for more context.",
  "kind": 30023,
  "tags": [
    ["d", "my-article"],
    ["title", "Building on Nostr"],
    ["p", "2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc"]
  ],
  "pubkey": "...",
  "created_at": 1679790774,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes

1. **Prefer `nprofile`/`nevent` over `npub`/`note`:** When inserting references, clients should prefer the TLV-encoded forms that include relay hints. This makes it easier for reading clients to resolve the reference.

2. **Tag inclusion is a user choice:** The spec explicitly states that clients MAY give users the option to include or exclude notification tags. Mentioning someone in content without a `p` tag means they will NOT be notified but the mention will still render as a link.

3. **Event references without reply semantics:** Including `nostr:nevent1...` in content with a `q` tag creates a citation. Including it with an `e` tag creates a reply relationship. Including it with NO tag means it's just an inline reference with no semantic meaning beyond display.

4. **Cross-kind references:** A `kind:1` client seeing a `nostr:naddr1...` reference to a `kind:30023` article MAY render it as a link to a web app that handles long-form content, since the client itself may not support that kind.

5. **Content parsing:** Clients should scan `.content` for the pattern `nostr:n[a-z]+1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+` to find all NIP-21 URIs. The bech32 character set is: `qpzry9x8gf2tvdw0s3jn54khce6mua7l`.

6. **Alternative to autocomplete:** Not all clients need autocomplete. Some may simply allow pasting raw NIP-19 codes, which the client prefixes with `nostr:` before publishing.

## Client Behavior

- Clients SHOULD use `nostr:` + NIP-19 format for inline references in `.content`
- Clients SHOULD parse `.content` for `nostr:` URIs and render them as links or rich previews
- Clients SHOULD decode NIP-19 entities and use relay hints to fetch referenced profiles/events
- Clients SHOULD replace `nostr:` URIs with human-readable names/previews when displaying content
- Clients MAY provide autocomplete functionality for mentions
- Clients MAY allow users to choose whether to include notification tags for mentions
- Clients MAY render event references as inline embeds, preview cards, or simple links

## Relay Behavior

- Relays have no special behavior for NIP-27 (content is stored and returned as-is)
- Relays index `p`, `e`, and `q` tags for query support (per NIP-01)

## Dependencies
- NIP-01: Base protocol (event structure, content field)
- NIP-19: bech32-encoded entities (the identifiers used in references)
- NIP-21: `nostr:` URI scheme (the URI format wrapping NIP-19 entities)
- NIP-10: Text Notes threading (tag semantics for replies)
- NIP-18: Reposts (q tag semantics for citations)

## Source Code References

- **nostr-tools (JS):** `nip27.ts` -- content parsing and reference extraction
- **rust-nostr:** Content parsing utilities
- **go-nostr:** Reference parsing in content handlers

## Related NIPs
- NIP-10: Text Notes threading (reply tags)
- NIP-18: Reposts (quote tags)
- NIP-19: bech32-encoded entities
- NIP-21: `nostr:` URI scheme
- NIP-22: Comment (also uses inline references)
