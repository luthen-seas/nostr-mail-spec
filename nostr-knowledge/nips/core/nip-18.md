# NIP-18: Reposts

## Status
Active (draft, optional)

## Summary
NIP-18 defines two event kinds for reposting content on Nostr: `kind:6` for reposting `kind:1` text notes, and `kind:16` for reposting any other event kind (generic reposts). It also standardizes quote reposts via the `q` tag, which allows referencing events inline without creating a thread reply relationship.

## Motivation
Social media platforms universally support reposting/retweeting as a way for users to signal that content deserves wider attention. NIP-18 provides a standardized way to do this in Nostr, distinguishing between simple reposts (amplification), generic reposts (for non-text-note kinds), and quote reposts (adding commentary to referenced content). The `q` tag specifically solves the problem of differentiating between "I am replying to this" and "I am quoting this" -- two semantically different actions.

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| 6 | Repost of a `kind:1` text note |
| 16 | Generic repost (any event kind other than `kind:1`) |

### Tags

#### Repost Tags (kind:6)

| Tag | Format | Required | Description |
|-----|--------|----------|-------------|
| `e` | `["e", "<reposted event id>", "<relay URL>"]` | MUST | References the reposted note |
| `p` | `["p", "<original author pubkey>"]` | SHOULD | References the original author |

#### Generic Repost Tags (kind:16)

| Tag | Format | Required | Description |
|-----|--------|----------|-------------|
| `e` | `["e", "<reposted event id>", "<relay URL>"]` | MUST | References the reposted event |
| `p` | `["p", "<original author pubkey>"]` | SHOULD | References the original author |
| `k` | `["k", "<kind number as string>"]` | SHOULD | Kind of the reposted event |
| `a` | `["a", "<kind>:<pubkey>:<d-tag>", "<relay URL>"]` | SHOULD (for replaceable/addressable) | Coordinate of the reposted event |

#### Quote Repost Tags (q tag)

| Tag | Format | Description |
|-----|--------|-------------|
| `q` | `["q", "<event-id or event-address>", "<relay-url>", "<pubkey-if-regular-event>"]` | Cites an event inline |

The `q` tag is used when a `nostr:nevent1...`, `nostr:note1...`, or `nostr:naddr1...` reference appears in the content. It explicitly marks the reference as a citation (not a reply), enabling:
- The referenced event to track all its quotes
- Clients to distinguish quotes from thread replies
- Prevention of quote reposts from appearing in reply threads

### Protocol Flow

**Simple repost of a kind:1 note:**
1. User sees a `kind:1` note they want to repost
2. Client creates a `kind:6` event with:
   - `content`: the stringified JSON of the original note (or empty for NIP-70 protected events)
   - `e` tag pointing to the original note
   - `p` tag pointing to the original author

**Generic repost of a non-kind:1 event:**
1. User wants to repost a `kind:30023` article (or any non-kind:1 event)
2. Client creates a `kind:16` event with:
   - `content`: the stringified JSON of the reposted event
   - `e` tag pointing to the event
   - `p` tag pointing to the author
   - `k` tag with the original event's kind number
   - `a` tag if the event is replaceable/addressable

**Quote repost:**
1. User writes a `kind:1` note that includes `nostr:nevent1...` or `nostr:note1...` in the content
2. Client adds a `q` tag for each referenced event
3. The `q` tag prevents the reference from being treated as a thread reply

### JSON Examples

**Simple repost (kind:6) of a text note:**
```json
{
  "kind": 6,
  "content": "{\"id\":\"5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36\",\"pubkey\":\"f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca\",\"created_at\":1678900000,\"kind\":1,\"tags\":[],\"content\":\"Hello world!\",\"sig\":\"abc123...\"}",
  "tags": [
    ["e", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://relay.example.com"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
  ],
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "created_at": 1678901000,
  "id": "...",
  "sig": "..."
}
```

**Generic repost (kind:16) of a long-form article:**
```json
{
  "kind": 16,
  "content": "{\"id\":\"aaa111...\",\"pubkey\":\"bbb222...\",\"created_at\":1678900000,\"kind\":30023,\"tags\":[[\"d\",\"my-article\"],[\"title\",\"My Great Article\"]],\"content\":\"Long form content here...\",\"sig\":\"ccc333...\"}",
  "tags": [
    ["e", "aaa111bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111", "wss://relay.example.com"],
    ["p", "bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111fff222"],
    ["k", "30023"],
    ["a", "30023:bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111fff222:my-article", "wss://relay.example.com"]
  ],
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "created_at": 1678901000,
  "id": "...",
  "sig": "..."
}
```

**Kind:1 note with a quote repost (q tag):**
```json
{
  "kind": 1,
  "content": "This is so true nostr:nevent1qqstna2yrezu5wghjvswqqculvvwxsrcvu7uc0f78gan4xqhvz49d9spr3mhxue69uhkummnw3ez6un9d3shjtn4de6x2argwghx6egpr4mhxue69uhkummnw3ez6ur4vgh8wetvd3hhyer9wghxuet5nxnepm",
  "tags": [
    ["q", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://relay.example.com", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
  ],
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "created_at": 1678901000,
  "id": "...",
  "sig": "..."
}
```

**Empty-content repost (for NIP-70 protected events):**
```json
{
  "kind": 6,
  "content": "",
  "tags": [
    ["e", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://relay.example.com"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
  ],
  "pubkey": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "created_at": 1678901000,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes

1. **Content field for kind:6:** The content SHOULD contain the stringified JSON of the reposted note for clients that cannot fetch the original. However, for NIP-70 protected events, the content MAY be empty.

2. **Generic repost without `a` tag:** If a `kind:16` repost of a replaceable/addressable event lacks the `a` tag, the full JSON MUST be included in the content field so clients can still display it.

3. **Quote vs Reply distinction:** The `q` tag is critical for separating quotes from replies. A `nostr:nevent1...` in content with an `e` tag creates a reply relationship; using a `q` tag instead creates a citation relationship.

4. **Deduplication:** Clients should deduplicate reposts -- if a user follows someone who reposts a note they've already seen, the client should handle this gracefully.

5. **Repost of a repost:** The spec does not explicitly address reposting a repost. Clients typically repost the original content, not the repost event itself.

## Client Behavior

- Clients SHOULD display reposts in the feed of the reposter's followers
- Clients SHOULD show the original content and original author for reposts
- Clients SHOULD include the full event JSON in the `content` of kind:6 and kind:16 reposts
- Clients SHOULD use `q` tags (not `e` tags) for inline event citations to avoid creating reply relationships
- Clients MAY allow users to see who reposted a given event (by querying kind:6/16 events with matching `e` tags)
- Clients MAY show a "quoted by" indicator on events that have `q` tag references

## Relay Behavior

- Relays MUST index `e` tags on kind:6 and kind:16 events for query support
- Relays MUST index `p` tags for notification queries
- Relays SHOULD store kind:6 and kind:16 as regular events

## Dependencies
- NIP-01: Base protocol (event structure)
- NIP-10: Text notes threading (for understanding reply vs quote distinction)
- NIP-19: bech32 entities (nevent, note, naddr used in q tag references)
- NIP-21: `nostr:` URI scheme (for inline references)
- NIP-70: Protected Events (affects whether content can be included)

## Source Code References

- **nostr-tools (JS):** `nip18.ts` -- repost creation and parsing
- **rust-nostr:** `nostr/src/nips/nip18.rs`
- **go-nostr:** Repost handling in event creation utilities

## Related NIPs
- NIP-01: Base protocol
- NIP-10: Text Notes threading
- NIP-19: bech32-encoded entities
- NIP-21: nostr: URI scheme
- NIP-27: Text Note References
- NIP-70: Protected Events
