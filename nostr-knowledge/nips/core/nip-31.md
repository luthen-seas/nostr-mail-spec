# NIP-31: Dealing with Unknown Event Kinds

## Status
Active (draft, optional)

## Summary
NIP-31 introduces the `alt` tag, which provides a short human-readable plaintext summary of what a custom event is about. This allows simple `kind:1`-focused social clients to gracefully display events of unknown kinds by showing fallback text instead of raw, unintelligible data.

## Motivation
Nostr is extensible -- anyone can create new event kinds for specialized protocols (e.g., chess games, encrypted messages, zap requests, marketplace listings). However, most social clients are built primarily to display `kind:1` text notes. When users reference or encounter events of unknown kinds in their feeds, those events would appear as blank or confusing entries without context. The `alt` tag solves this by providing a minimal human-readable description that any client can display, regardless of whether it understands the event kind.

## Specification

### Event Kinds

NIP-31 does not define any new event kinds. The `alt` tag can be applied to ANY event kind.

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `alt` | `["alt", "<human-readable description>"]` | Short plaintext summary of the event's purpose |

The `alt` tag value should be a brief description that helps users understand what the event is and that they may need a different client to interact with it fully.

### Protocol Flow

**Event creator:**
1. Developer creates an event of a custom kind (e.g., `kind:30079` for a chess move)
2. Developer adds an `alt` tag with a description like `"Chess move: e2 to e4 in game abc123"`
3. Event is published to relays

**Simple client displaying the event:**
1. Client receives an event of an unknown kind (e.g., `kind:30079`)
2. Client does not know how to render this kind
3. Client checks for an `alt` tag
4. If present, displays the `alt` text as fallback content
5. Optionally displays a link or suggestion to view in a compatible client (NIP-89)

### JSON Examples

**Custom event with alt tag (chess move):**
```json
{
  "kind": 30079,
  "content": "{\"move\":\"e2e4\",\"game\":\"abc123\"}",
  "tags": [
    ["d", "abc123-move-1"],
    ["alt", "Chess move: e2 to e4 in game abc123. Use a chess client to view this game."]
  ],
  "pubkey": "...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Zap request with alt tag:**
```json
{
  "kind": 9734,
  "content": "",
  "tags": [
    ["e", "aaa111bbb222ccc333ddd444eee555fff666aaa777bbb888ccc999ddd000eee111"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["amount", "21000"],
    ["alt", "Zap request for 21 sats. Use a zap-compatible client to view details."]
  ],
  "pubkey": "...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Marketplace listing with alt tag:**
```json
{
  "kind": 30018,
  "content": "{\"title\":\"Vintage Keyboard\",\"price\":50,\"currency\":\"USD\"}",
  "tags": [
    ["d", "vintage-keyboard-001"],
    ["title", "Vintage Keyboard"],
    ["alt", "Marketplace listing: Vintage Keyboard for $50 USD. Use a marketplace client to purchase."]
  ],
  "pubkey": "...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Encrypted DM with alt tag:**
```json
{
  "kind": 1059,
  "content": "<encrypted content>",
  "tags": [
    ["p", "bf2376e17ba4ec269d10fcc996a4746b451152be9031fa48e74553dde5526bce"],
    ["alt", "Encrypted direct message. Use a client that supports NIP-44 to read this message."]
  ],
  "pubkey": "...",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes

1. **Keep alt text short and informative:** The alt text should be brief (1-2 sentences) and tell the user: what the event is, and what kind of client they need to view it properly.

2. **Do not rely on alt for data:** The `alt` tag is purely for human-readable fallback display. Clients that understand the event kind should parse the event's actual content and tags, not the `alt` text.

3. **Combine with NIP-89:** Clients can enhance the experience by using NIP-89 (Recommended Application Handlers) to suggest specific clients that can handle the unknown event kind, in addition to displaying the `alt` text.

4. **Events without alt tags:** If an unknown event kind lacks an `alt` tag, clients may display a generic message like "Unknown event type" or hide the event entirely.

5. **Security consideration:** The `alt` text is arbitrary user input. Clients should sanitize it before rendering (no HTML, no script injection).

## Client Behavior

- Clients SHOULD display `alt` tag content when encountering event kinds they do not understand
- Clients SHOULD sanitize `alt` tag content before rendering
- Clients MAY combine `alt` display with NIP-89 application handler recommendations
- Clients MAY hide events of unknown kinds that lack an `alt` tag
- Clients that understand a given event kind SHOULD ignore the `alt` tag and render the event natively

## Relay Behavior

- Relays have no special behavior for the `alt` tag
- Relays store and return events with `alt` tags like any other tags

## Dependencies
- NIP-01: Base protocol (event structure, tag system)

## Source Code References

- **nostr-tools (JS):** No dedicated file; `alt` tag is simply a tag string
- **rust-nostr:** Tag handling in event construction
- **go-nostr:** Tag handling in event construction

## Related NIPs
- NIP-01: Base protocol
- NIP-89: Recommended Application Handlers (enhances unknown-kind handling)
