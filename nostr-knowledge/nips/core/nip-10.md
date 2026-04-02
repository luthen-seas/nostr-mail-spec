# NIP-10: Text Notes and Threads

## Status
Active (draft, optional)

## Summary
NIP-10 defines how `kind:1` text notes create threaded conversations using `e`, `p`, and `q` tags. It specifies the "marked" tag system where `e` tags carry markers like `"root"` and `"reply"` to unambiguously identify threading relationships. This NIP is essential for building reply chains, displaying conversation threads, and notifying participants.

## Motivation
Without threading conventions, text notes would exist as isolated posts with no way to form conversations. NIP-10 solves the problem of indicating which event a note replies to, which event is the root of a conversation thread, and which users should be notified of replies. The marked tag system replaced the earlier positional system (now deprecated) which was ambiguous when events referenced multiple other events.

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| 1 | Short text note (plain text only) |

### Content Field

The `.content` field contains **plain human-readable text only**. Markup languages such as Markdown and HTML SHOULD NOT be used. References to other events and profiles are handled via `nostr:` URIs inline (per NIP-27).

### Tags

#### `e` tag (event threading)
Format:
```json
["e", "<event-id>", "<relay-url>", "<marker>", "<pubkey>"]
```

**Markers:**
| Marker | Meaning |
|--------|---------|
| `"root"` | The top-level event of the thread being replied to |
| `"reply"` | The direct parent event being replied to |
| (none/empty) | A mention or reference (not a threading indicator) |

**Rules:**
- Top-level replies (replying directly to the thread root) use ONLY a `"root"` marker (no `"reply"` marker)
- Deeper replies use both `"root"` and `"reply"` markers on separate `e` tags
- The relay URL and pubkey fields are optional but recommended for the outbox model

#### `p` tag (participant notification)
```json
["p", "<pubkey>", "<relay-url>"]
```

When replying to an event authored by `author_pubkey` that contains `p` tags `[p1, p2, p3]`, the reply SHOULD include `p` tags for all of: `author_pubkey`, `p1`, `p2`, `p3`.

#### `q` tag (quote/citation)
```json
["q", "<event-id>", "<relay-url>", "<pubkey>"]
```

Used when citing another event (per NIP-18). The `q` tag ensures quoted events do not appear as thread replies and enables tracking all quotes of a post.

### Protocol Flow

**Creating a top-level reply (to the thread root):**
1. User wants to reply to event `E_root`
2. Client creates a `kind:1` event with:
   - `["e", "<E_root id>", "<relay>", "root"]`
   - `["p", "<E_root author pubkey>"]`
   - Plus `p` tags for all participants from `E_root`

**Creating a nested reply:**
1. User wants to reply to event `E_parent` which is itself a reply in a thread rooted at `E_root`
2. Client creates a `kind:1` event with:
   - `["e", "<E_root id>", "<relay>", "root"]`
   - `["e", "<E_parent id>", "<relay>", "reply"]`
   - `["p", "<E_root author pubkey>"]`
   - `["p", "<E_parent author pubkey>"]`
   - Plus `p` tags for other participants

**Quoting an event:**
1. User references event `E_quoted` in their note content using `nostr:nevent1...`
2. Client creates a `kind:1` event with:
   - `["q", "<E_quoted id>", "<relay>", "<E_quoted author pubkey>"]`
   - Content contains `nostr:nevent1...` inline

### JSON Examples

**Top-level reply to a thread root:**
```json
{
  "kind": 1,
  "content": "I agree with this completely!",
  "tags": [
    ["e", "a]b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1", "wss://relay.example.com", "root"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
  ]
}
```

**Nested reply (reply to a reply):**
```json
{
  "kind": 1,
  "content": "Good point, but consider this...",
  "tags": [
    ["e", "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888", "wss://relay.example.com", "root"],
    ["e", "1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777aaaa8888bbbb", "wss://relay.example.com", "reply"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["p", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"]
  ]
}
```

**Note with a quote (citation):**
```json
{
  "kind": 1,
  "content": "This is what I was talking about nostr:nevent1qqstna2yrezu5wghjvswqqculvvwxsrcvu7uc0f78gan4xqhvz49d9spr3mhxue69uhkummnw3ez6un9d3shjtn4de6x2argwghx6egpr4mhxue69uhkummnw3ez6ur4vgh8wetvd3hhyer9wghxuet5nxnepm",
  "tags": [
    ["q", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://relay.example.com", "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"]
  ]
}
```

**Simple standalone note (not a reply):**
```json
{
  "kind": 1,
  "content": "Hello world, this is my first nostr post!",
  "tags": []
}
```

## Implementation Notes

1. **Deprecated positional `e` tags:** The older system without markers is deprecated. Legacy format: `["e", "<event-id>", "<relay-url>"]` with position-based semantics (first = root, last = reply, middle = mentions). Clients SHOULD use the marked system for new events but SHOULD be able to parse the positional system for backward compatibility.

2. **Top-level reply ambiguity:** A top-level reply has ONLY a `"root"` marker. If you see both `"root"` and `"reply"` pointing to the same event, that is redundant but not invalid.

3. **Thread reconstruction:** To build a thread tree, query for all events with `#e` referencing the root event ID. Parse `"root"` and `"reply"` markers to construct the parent-child tree.

4. **Relay hints in `e` tags:** The relay URL in position 2 of the tag is a hint for where to find the referenced event. Clients using the outbox model SHOULD use these hints.

5. **Author pubkey in `e` tags:** The pubkey in position 4 of the `e` tag helps clients find the referenced event via the author's preferred relays (outbox model).

## Client Behavior

- Clients MUST use the marked `e` tag system for new events (not the deprecated positional system)
- Clients SHOULD parse both marked and positional `e` tag formats for backward compatibility
- Clients SHOULD include `p` tags for all thread participants to enable notifications
- Clients SHOULD include relay hints in `e` tags when known
- Clients SHOULD render `kind:1` content as plain text (no markdown/HTML rendering)
- Clients MAY display threads as nested conversations using root/reply markers
- Clients MAY use `q` tags to show inline previews of quoted events

## Relay Behavior

- Relays MUST index `e` tags so that `#e` filter queries work for thread lookups
- Relays MUST index `p` tags so that `#p` filter queries work for mention notifications
- Relays SHOULD store all `kind:1` events (they are regular events)

## Dependencies
- NIP-01: Base protocol (event structure, kind system)
- NIP-21: `nostr:` URI scheme (for inline references in content)
- NIP-18: Reposts (defines `q` tag semantics)
- NIP-27: Text Note References (inline mention rendering)

## Source Code References

- **nostr-tools (JS):** `nip10.ts` -- functions for parsing thread references from tags
- **rust-nostr:** `nostr/src/nips/nip10.rs`
- **go-nostr:** Tag parsing utilities in `tags.go`

## Related NIPs
- NIP-01: Base protocol
- NIP-18: Reposts (quote repost via `q` tag)
- NIP-22: Comment (threading for non-kind:1 events)
- NIP-27: Text Note References (inline `nostr:` mentions)
