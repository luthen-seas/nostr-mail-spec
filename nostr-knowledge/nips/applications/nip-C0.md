# NIP-C0: Code Snippets

## Status
Active (Draft, Optional)

## Summary
NIP-C0 defines `kind:1337` events for sharing code snippets on Nostr. The `.content` field contains the raw source code, while tags provide metadata about the programming language, filename, runtime, license, and dependencies. This creates a decentralized code-sharing platform -- think GitHub Gists on Nostr.

## Motivation
Developers frequently share code snippets in chats, forums, and paste services. These platforms are centralized, often ephemeral, and lack social features. NIP-C0 embeds code sharing directly into the Nostr social graph, enabling syntax-highlighted code display, attribution, forking, and discovery. Because snippets are tied to a pubkey, they build a developer's portable portfolio across any Nostr client that supports the kind.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `1337` | Regular | Code snippet event |

### Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `l` | Optional | `["l", "<language>"]` | Programming language name, lowercase (e.g., `javascript`, `python`, `rust`) |
| `name` | Optional | `["name", "<filename>"]` | Filename or snippet title (e.g., `hello-world.js`) |
| `extension` | Optional | `["extension", "<ext>"]` | File extension without the dot (e.g., `js`, `py`, `rs`) |
| `description` | Optional | `["description", "<text>"]` | Brief description of what the code does |
| `runtime` | Optional | `["runtime", "<env>"]` | Runtime or environment specification (e.g., `node v18.15.0`, `python 3.11`) |
| `license` | Optional | `["license", "<spdx-id>"]` | SPDX license identifier (e.g., `MIT`, `GPL-3.0-or-later`, `Apache-2.0`) |
| `dep` | Optional (repeatable) | `["dep", "<dependency>"]` | Dependency required for the code to run. Can appear multiple times |
| `repo` | Optional | `["repo", "<url-or-naddr>"]` | Repository reference -- either an HTTP/HTTPS URL or a NIP-34 Git repository announcement event address |

The `.content` field contains the raw source code with original formatting and whitespace preserved.

### Protocol Flow

1. A developer writes or copies a code snippet.
2. The client creates a `kind:1337` event with the code in `.content` and metadata in tags.
3. The event is published to the user's relays.
4. Receiving clients detect the `l` or `extension` tag and apply appropriate syntax highlighting.
5. Other users can view, copy, fork, or reply to the snippet.

### JSON Examples

**JavaScript snippet with full metadata:**
```json
{
  "kind": 1337,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700000000,
  "content": "function helloWorld() {\n  console.log('Hello, Nostr!');\n}\n\nhelloWorld();",
  "tags": [
    ["l", "javascript"],
    ["extension", "js"],
    ["name", "hello-world.js"],
    ["description", "A basic JavaScript function that prints 'Hello, Nostr!' to the console"],
    ["runtime", "node v18.15.0"],
    ["license", "MIT"],
    ["repo", "https://github.com/nostr-protocol/nostr"]
  ]
}
```

**Python snippet with dependencies:**
```json
{
  "kind": 1337,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700000000,
  "content": "import requests\n\ndef fetch_profile(pubkey: str, relay: str) -> dict:\n    \"\"\"Fetch a Nostr profile from a relay.\"\"\"\n    sub = [\"REQ\", \"profile\", {\"kinds\": [0], \"authors\": [pubkey]}]\n    # ... websocket logic here\n    return profile\n",
  "tags": [
    ["l", "python"],
    ["extension", "py"],
    ["name", "fetch_profile.py"],
    ["description", "Fetch a Nostr user profile from a relay using websockets"],
    ["runtime", "python 3.11"],
    ["license", "MIT"],
    ["dep", "requests"],
    ["dep", "websockets"]
  ]
}
```

**Minimal Rust snippet:**
```json
{
  "kind": 1337,
  "pubkey": "<author-pubkey-hex>",
  "created_at": 1700000000,
  "content": "fn main() {\n    println!(\"Hello, Nostr!\");\n}",
  "tags": [
    ["l", "rust"],
    ["extension", "rs"]
  ]
}
```

## Implementation Notes

- **Language vs extension:** Both `l` (language) and `extension` (file extension) are optional. Clients should use whichever is available for syntax highlighting, preferring `l` if both are present.
- **Whitespace preservation:** Code formatting is critical. Clients MUST preserve the exact whitespace and indentation from `.content` -- do not reformat or normalize.
- **Large snippets:** There is no specified size limit beyond relay event size limits. Very large files should probably be shared via NIP-94 (file metadata) or external links instead.
- **Kind 1337:** The kind number is a nod to "leet speak" (1337 = LEET), fitting for a developer-oriented feature.
- **NIP-34 repo references:** The `repo` tag can reference either a standard URL or a NIP-34 Git repository announcement event, bridging code snippets with the broader Nostr Git ecosystem.

## Client Behavior

- Clients SHOULD display code with proper syntax highlighting based on the `l` or `extension` tag.
- Clients SHOULD enable single-action copying of the entire snippet (copy button).
- Clients MUST preserve original formatting and whitespace when displaying `.content`.
- Clients SHOULD display the language and file extension prominently.
- Clients SHOULD display the `description` tag if present.
- Clients MAY offer "run" functionality where the runtime is supported (e.g., JavaScript in-browser execution).
- Clients MAY offer code editing and forking capabilities.
- Clients MAY provide executable sandbox environments based on the `runtime` tag.
- Clients MAY offer file download using the `extension` tag for the filename.
- Clients MAY support attribution-based sharing (resharing with credit to the original author).

## Relay Behavior

- Relays SHOULD treat `kind:1337` as a regular (non-replaceable) event.
- Relays SHOULD support `#l` tag filtering for language-based discovery.
- Relays MAY impose size limits on `.content` to prevent abuse.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-34** (optional) -- Git repository announcements, referenced via the `repo` tag

## Source Code References

- **nostr-tools:** No dedicated NIP-C0 module; events are standard `kind:1337` objects.
- **rust-nostr:** Standard `EventBuilder` with kind `1337` and tag construction.

## Related NIPs

- **NIP-01** -- Event structure
- **NIP-34** -- Git repository announcements (linked via `repo` tag)
- **NIP-78** -- Application-specific data (alternative for storing dev configuration)
- **NIP-89** -- Application handlers (for discovering code-viewing clients)
