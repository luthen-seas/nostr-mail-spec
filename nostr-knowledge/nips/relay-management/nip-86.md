# NIP-86: Relay Management API

## Status
Active (draft, optional)

## Summary
NIP-86 defines a JSON-RPC-like HTTP API for relay administration tasks. Requests are sent as HTTP POST to the same URI as the relay's WebSocket endpoint, using a special `Content-Type: application/nostr+json+rpc` header. All requests are authenticated using NIP-98 HTTP Auth events. The API provides methods for managing pubkey bans/allowlists, event moderation, relay metadata changes, kind filtering, and IP blocking.

## Motivation
Relay operators need administrative tools for moderation, access control, and configuration. Before NIP-86, every relay software implemented its own proprietary admin interface (CLI tools, web dashboards, config files). This made it impossible to build universal relay management clients. NIP-86 standardizes the management API so that a single admin client can manage any compliant relay, regardless of its underlying software (strfry, khatru, custom implementations, etc.).

## Specification

### Event Kinds
NIP-86 does not define event kinds for the RPC protocol itself. However, it requires NIP-98 (`kind:27235`) events for authentication in the `Authorization` header.

### Tags
NIP-86 uses NIP-98 tags in the authorization event:

| Tag | Description |
|-----|-------------|
| `u` | The relay URL being managed. Required by NIP-98. |
| `method` | The HTTP method (POST). Required by NIP-98. |
| `payload` | SHA-256 hash of the request body. Required by NIP-86 for integrity. |

### Protocol Flow

1. Admin constructs a JSON-RPC request body with `method` and `params`.
2. Admin computes the SHA-256 hash of the request body.
3. Admin creates a NIP-98 `kind:27235` event with:
   - `u` tag set to the relay URL.
   - `method` tag set to `POST`.
   - `payload` tag set to the SHA-256 hash of the request body.
4. Admin sends an HTTP POST to the relay URL with:
   - `Content-Type: application/nostr+json+rpc`
   - `Authorization: Nostr <base64-encoded-kind-27235-event>`
   - Body: the JSON-RPC request.
5. Relay validates the NIP-98 event (signature, timestamp, `u` tag, `payload` hash).
6. Relay checks that the event signer is authorized as an admin.
7. Relay executes the method and returns a JSON response.
8. If authorization fails, relay returns HTTP 401.

### Request Format

```json
{
  "method": "<method-name>",
  "params": ["<param1>", "<param2>", "..."]
}
```

### Response Format

Success:
```json
{
  "result": { ... }
}
```

Error:
```json
{
  "result": null,
  "error": "<error message>"
}
```

### Complete Method Reference

#### Discovery

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `supportedmethods` | `[]` | `["banpubkey", "allowpubkey", ...]` | Returns array of method names the relay supports. |

#### Pubkey Ban Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `banpubkey` | `["<32-byte-hex-pubkey>", "<optional-reason>"]` | `true` | Bans a pubkey. Events from this pubkey are rejected. |
| `unbanpubkey` | `["<32-byte-hex-pubkey>", "<optional-reason>"]` | `true` | Removes a pubkey ban. |
| `listbannedpubkeys` | `[]` | `[{"pubkey": "...", "reason": "..."}]` | Lists all banned pubkeys with reasons. |

#### Pubkey Allow Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `allowpubkey` | `["<32-byte-hex-pubkey>", "<optional-reason>"]` | `true` | Adds a pubkey to the allowlist. |
| `unallowpubkey` | `["<32-byte-hex-pubkey>", "<optional-reason>"]` | `true` | Removes a pubkey from the allowlist. |
| `listallowedpubkeys` | `[]` | `[{"pubkey": "...", "reason": "..."}]` | Lists all allowed pubkeys with reasons. |

#### Event Moderation

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `listeventsneedingmoderation` | `[]` | `[{"id": "...", "reason": "..."}]` | Lists events flagged for moderation review. |
| `allowevent` | `["<32-byte-hex-event-id>", "<optional-reason>"]` | `true` | Approves a flagged event. |
| `banevent` | `["<32-byte-hex-event-id>", "<optional-reason>"]` | `true` | Bans/removes a specific event. |
| `listbannedevents` | `[]` | `[{"id": "...", "reason": "..."}]` | Lists all banned events with reasons. |

#### Relay Information

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `changerelayname` | `["<new-name>"]` | `true` | Changes the relay's name (NIP-11 `name` field). |
| `changerelaydescription` | `["<new-description>"]` | `true` | Changes the relay's description (NIP-11 `description` field). |
| `changerelayicon` | `["<new-icon-url>"]` | `true` | Changes the relay's icon (NIP-11 `icon` field). |

#### Kind Filtering

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `allowkind` | `[<kind-number>]` | `true` | Adds a kind to the allowed kinds list. |
| `disallowkind` | `[<kind-number>]` | `true` | Removes a kind from the allowed kinds list. |
| `listallowedkinds` | `[]` | `[1, 3, 7, ...]` | Lists all allowed kind numbers. |

#### IP Blocking

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `blockip` | `["<ip-address>", "<optional-reason>"]` | `true` | Blocks an IP address from connecting. |
| `unblockip` | `["<ip-address>"]` | `true` | Unblocks an IP address. |
| `listblockedips` | `[]` | `[{"ip": "...", "reason": "..."}]` | Lists all blocked IPs with reasons. |

### JSON Examples

#### Discovering Supported Methods

Request:
```json
{
  "method": "supportedmethods",
  "params": []
}
```

Response:
```json
{
  "result": [
    "supportedmethods",
    "banpubkey",
    "unbanpubkey",
    "listbannedpubkeys",
    "allowpubkey",
    "unallowpubkey",
    "listallowedpubkeys",
    "banevent",
    "allowevent",
    "listbannedevents",
    "listeventsneedingmoderation",
    "changerelayname",
    "changerelaydescription",
    "changerelayicon",
    "allowkind",
    "disallowkind",
    "listallowedkinds",
    "blockip",
    "unblockip",
    "listblockedips"
  ]
}
```

#### Banning a Pubkey

Request:
```json
{
  "method": "banpubkey",
  "params": ["a]1fc7c49d...32-byte-hex...", "spam account"]
}
```

Authorization header (NIP-98 event, base64-encoded):
```json
{
  "kind": 27235,
  "created_at": 1700000000,
  "tags": [
    ["u", "wss://myrelay.example.com"],
    ["method", "POST"],
    ["payload", "<sha256-of-request-body>"]
  ],
  "content": "",
  "pubkey": "<admin-pubkey>",
  "id": "<event-id>",
  "sig": "<signature>"
}
```

Response:
```json
{
  "result": true
}
```

#### Listing Banned Pubkeys

Request:
```json
{
  "method": "listbannedpubkeys",
  "params": []
}
```

Response:
```json
{
  "result": [
    {
      "pubkey": "a1fc7c49d...",
      "reason": "spam account"
    },
    {
      "pubkey": "b2ed8d5ae...",
      "reason": "illegal content"
    }
  ]
}
```

#### Changing Relay Name

Request:
```json
{
  "method": "changerelayname",
  "params": ["My Awesome Relay"]
}
```

Response:
```json
{
  "result": true
}
```

#### Blocking an IP

Request:
```json
{
  "method": "blockip",
  "params": ["192.168.1.100", "DDoS source"]
}
```

Response:
```json
{
  "result": true
}
```

#### Error Response

```json
{
  "result": null,
  "error": "method not supported: someinvalidmethod"
}
```

#### Unauthorized Response

HTTP 401 with no body (or implementation-defined error body).

### Full HTTP Request Example

```
POST / HTTP/1.1
Host: myrelay.example.com
Content-Type: application/nostr+json+rpc
Authorization: Nostr eyJraW5kIjoyNzIzNSwiY3JlYXRlZF9hdCI6MTcwMDAwMDAwMCwidGFncyI6W1sidSIsIndzczovL215cmVsYXkuZXhhbXBsZS5jb20iXSxbIm1ldGhvZCIsIlBPU1QiXSxbInBheWxvYWQiLCI8c2hhMjU2LW9mLWJvZHk+Il1dLCJjb250ZW50IjoiIiwicHVia2V5IjoiPGFkbWluLXB1YmtleT4iLCJpZCI6IjxldmVudC1pZD4iLCJzaWciOiI8c2lnbmF0dXJlPiJ9

{"method":"banpubkey","params":["a1fc7c49d...","spam account"]}
```

## Implementation Notes

- The `Content-Type` header (`application/nostr+json+rpc`) distinguishes management requests from NIP-11 requests (`application/nostr+json`). Relay HTTP handlers must route based on this header.
- The `payload` tag in the NIP-98 event MUST contain the SHA-256 hash of the request body. This prevents replay attacks where an attacker reuses an authorization header with a different request body.
- Not all relays need to support all methods. The `supportedmethods` call lets clients discover what is available. Clients SHOULD call this first.
- The NIP-98 event has a limited validity window (typically a few minutes). Requests with stale authorization events should be rejected.
- Admin authorization is implementation-defined. Relays typically check the NIP-98 signer's pubkey against a configured admin pubkey list.
- The API is stateless -- each request is independently authenticated. There are no sessions.
- Relays MAY implement additional methods beyond those specified. Clients SHOULD handle unknown methods gracefully.

## Client Behavior

- Clients MUST call `supportedmethods` to discover which methods the relay supports before calling other methods.
- Clients MUST create a valid NIP-98 `kind:27235` event for each request, including the `payload` tag with the SHA-256 hash of the request body.
- Clients MUST set `Content-Type: application/nostr+json+rpc` on all management requests.
- Clients MUST handle HTTP 401 responses (unauthorized).
- Clients SHOULD handle error responses gracefully and display error messages to the admin.
- Clients MAY provide a UI for all supported methods (pubkey management, moderation queue, relay settings, etc.).

## Relay Behavior

- Relays MUST validate the NIP-98 authorization event on every request (signature, timestamp, `u` tag, `payload` hash).
- Relays MUST return HTTP 401 for missing or invalid authorization.
- Relays MUST check that the signer is authorized as an admin.
- Relays MUST implement the `supportedmethods` method.
- Relays SHOULD implement the methods that are relevant to their access control model.
- Relays MAY implement additional custom methods.
- Relays MUST return proper error messages in the `error` field for failed operations.

## Dependencies

- NIP-01 (basic protocol -- event structure, relay URLs)
- NIP-11 (Relay Information Document -- relay name/description/icon fields that can be changed)
- NIP-98 (HTTP Auth -- the authorization mechanism for all NIP-86 requests)

## Source Code References

### khatru
- `khatru` framework has built-in NIP-86 support.
- `management.go` or similar -- handles the RPC endpoint, routes methods, validates NIP-98 auth.
- The relay operator registers handler functions for each management method.

### strfry
- strfry does not natively implement NIP-86 as of this writing. Management is done via CLI (`strfry scan`, `strfry delete`) and configuration files.
- A NIP-86 proxy could be built on top of strfry's plugin system.

### nostr-tools (JS)
- NIP-98 helpers in `nip98.ts` can be used to construct the authorization header.
- No NIP-86-specific module, but the RPC calls are simple HTTP POST requests.

### rust-nostr
- NIP-98 event creation is supported in the `nostr` crate.
- No NIP-86-specific client library, but trivial to implement with standard HTTP clients.

### go-nostr
- NIP-98 event helpers available. NIP-86 calls are standard HTTP requests.

## Related NIPs

- NIP-11 (Relay Information Document) -- fields modified by `changerelayname`, `changerelaydescription`, `changerelayicon`
- NIP-42 (Authentication) -- related auth concept; NIP-86 uses NIP-98 instead for HTTP requests
- NIP-43 (Relay Access Metadata) -- protocol-level membership management vs. admin-level management in NIP-86
- NIP-98 (HTTP Auth) -- the authentication mechanism for all NIP-86 requests
