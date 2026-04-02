# NIP-B7: Blossom (Blob Storage Protocol)

## Status
Active (Draft, Optional) -- **Current recommended file storage solution for Nostr**

## Summary
NIP-B7 specifies how Nostr clients use Blossom, a set of standards (called BUDs -- Blossom Upgrade Documents) for content-addressable blob storage over HTTP. Files are addressed by their SHA-256 hash, making them location-independent: any Blossom server holding the file can serve it at `/<sha256>.ext`. Users publish `kind:10063` events listing their preferred Blossom servers, enabling automatic failover when a URL goes down.

## Motivation
Nostr needed a simple, decentralized file storage layer where files can survive server shutdowns and be mirrored across multiple hosts without URL breakage. Previous solutions (NIP-96) were more complex and tightly coupled. Blossom solves this with a clean content-addressable design: since URLs encode the file's SHA-256 hash, any server with the file can serve it. Combined with user-published server lists, clients can transparently fall back to alternative servers when the original goes offline. The protocol is split into modular BUDs, so servers can implement only what they need.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `10063` | Replaceable | User's Blossom server list |

The `kind:10063` event advertises which Blossom servers host a user's files:

```json
{
  "kind": 10063,
  "content": "",
  "tags": [
    ["server", "https://blossom.self.hosted"],
    ["server", "https://cdn.blossom.cloud"]
  ]
}
```

Servers are listed in order of the user's preference/trust. Clients upload to at least the first server and may mirror to additional ones.

### Tags
- `server` -- Full URL of a Blossom server (used in `kind:10063`)

### Blossom Architecture (BUDs)

Blossom is composed of modular specifications:

| BUD | Name | Status | Description |
|-----|------|--------|-------------|
| BUD-01 | Server Requirements & Blob Retrieval | Mandatory | GET/HEAD endpoints, CORS, error handling |
| BUD-02 | Blob Upload & Management | Core | PUT /upload, GET /list, DELETE |
| BUD-03 | User Server List | Core | kind:10063 events, fallback resolution |
| BUD-04 | Mirroring | Optional | PUT /mirror for server-to-server copying |
| BUD-11 | Nostr Authorization | Core | kind:24242 auth tokens |

### Protocol Flow

#### 1. Server Discovery (BUD-03)
1. Client looks up the target user's `kind:10063` event from relays.
2. Event contains one or more `["server", "<url>"]` tags.
3. Client uses these servers for upload/download operations.

#### 2. Upload Flow (BUD-02 + BUD-11)

**Step 1: Create Authorization Token**

The client signs a `kind:24242` Nostr event:

```json
{
  "kind": 24242,
  "content": "Upload Blob",
  "created_at": 1700000000,
  "tags": [
    ["t", "upload"],
    ["x", "a1b2c3d4e5f6...64-char-hex-sha256-of-file"],
    ["expiration", "1700003600"],
    ["server", "cdn.example.com"]
  ]
}
```

Required fields in the auth token:
- `content` -- Human-readable description (shown to user during signing)
- `t` tag -- Action verb: `upload`, `get`, `delete`, `list`, or `media`
- `expiration` tag -- Unix timestamp when the token expires (NIP-40)
- `x` tag -- SHA-256 hash of the blob (required for upload, delete, mirror)
- `server` tag (optional but recommended) -- Scopes the token to a specific domain

**Step 2: Send Upload Request**

```
PUT /upload HTTP/1.1
Host: cdn.example.com
Authorization: Nostr <base64url-encoded-kind-24242-event>
Content-Type: video/mp4
Content-Length: 52428800
X-SHA-256: a1b2c3d4e5f6...64-char-hex-sha256-of-file

<binary file data>
```

- The request body is the raw binary file (no multipart encoding).
- `Content-Type` header tells the server the MIME type.
- `X-SHA-256` header allows the server to verify authorization before reading the full body.

**Step 3: Receive Blob Descriptor**

```json
{
  "url": "https://cdn.example.com/a1b2c3d4e5f6...sha256.mp4",
  "sha256": "a1b2c3d4e5f6...64-char-hex",
  "size": 52428800,
  "type": "video/mp4",
  "uploaded": 1700000005
}
```

The Blob Descriptor contains:
- `url` -- Public URL to the blob (MUST include file extension)
- `sha256` -- SHA-256 hash (hex)
- `size` -- Size in bytes
- `type` -- MIME type (defaults to `application/octet-stream`)
- `uploaded` -- Unix timestamp of upload

#### 3. Download Flow (BUD-01)

**Simple retrieval:**
```
GET /a1b2c3d4e5f6...sha256.mp4 HTTP/1.1
Host: cdn.example.com
```

Response: the file bytes with appropriate `Content-Type` header.

**Key behaviors:**
- File extension is optional but recommended: `/<sha256>` and `/<sha256>.mp4` both work.
- Servers MAY redirect (307/308) to another host; the redirect URL MUST preserve the SHA-256 hash.
- Servers SHOULD support RFC 7233 range requests for partial downloads/streaming.
- If MIME type is unknown, servers default to `application/octet-stream`.

**Existence check (HEAD):**
```
HEAD /a1b2c3d4e5f6...sha256.mp4 HTTP/1.1
Host: cdn.example.com
```

Returns the same headers as GET (Content-Type, Content-Length) but no body. Useful for checking if a server has a specific blob without downloading it.

#### 4. Fallback Resolution (BUD-03 + NIP-B7)

This is the core value proposition of Blossom:

1. Client encounters a URL in an event, e.g., `https://old-server.com/a1b2c3d4...sha256.jpg`.
2. The URL fails (server down, 404, etc.).
3. Client extracts the 64-character hex string from the URL path -- this is the SHA-256 hash.
4. Client fetches the event author's `kind:10063` server list.
5. Client tries each server in order: `https://blossom.self.hosted/a1b2c3d4...sha256.jpg`
6. If none of the author's servers have it, client MAY try well-known public Blossom servers.
7. After downloading, client SHOULD verify the SHA-256 hash matches.

This works because Blossom URLs are content-addressable -- the hash IS the path. Any server with the same file can serve it at the same path.

#### 5. Delete Flow (BUD-02 + BUD-11)

**Create delete auth token:**
```json
{
  "kind": 24242,
  "content": "Delete old blob",
  "tags": [
    ["t", "delete"],
    ["x", "a1b2c3d4e5f6...sha256"],
    ["expiration", "1700003600"],
    ["server", "cdn.example.com"]
  ]
}
```

**Send delete request:**
```
DELETE /a1b2c3d4e5f6...sha256.mp4 HTTP/1.1
Host: cdn.example.com
Authorization: Nostr <base64url-encoded-kind-24242-event>
```

Server returns 2xx on success, 4xx with `X-Reason` header on failure.

#### 6. List Flow (BUD-02 + BUD-11)

**Create list auth token:**
```json
{
  "kind": 24242,
  "content": "List my blobs",
  "tags": [
    ["t", "list"],
    ["expiration", "1700003600"],
    ["server", "cdn.example.com"]
  ]
}
```

**Send list request:**
```
GET /list/<pubkey-hex>?limit=20 HTTP/1.1
Host: cdn.example.com
Authorization: Nostr <base64url-encoded-kind-24242-event>
```

**Response:**
```json
[
  {
    "url": "https://cdn.example.com/a1b2c3d4...sha256.jpg",
    "sha256": "a1b2c3d4...sha256",
    "size": 2048576,
    "type": "image/jpeg",
    "uploaded": 1700000005
  },
  {
    "url": "https://cdn.example.com/f0e1d2c3...sha256.mp4",
    "sha256": "f0e1d2c3...sha256",
    "size": 52428800,
    "type": "video/mp4",
    "uploaded": 1699990000
  }
]
```

Returns an array of Blob Descriptors sorted by `uploaded` date descending. Pagination uses `cursor` (SHA-256 of the last blob from the previous page) and `limit` parameters.

#### 7. Mirror Flow (BUD-04)

Mirroring allows copying a blob from one Blossom server to another without the client re-uploading:

**Step 1:** Client uploads blob to Server A, receives Blob Descriptor with URL.

**Step 2:** Client sends mirror request to Server B:
```
PUT /mirror HTTP/1.1
Host: server-b.example.com
Authorization: Nostr <base64url-encoded-kind-24242-event>
Content-Type: application/json

{
  "url": "https://server-a.example.com/a1b2c3d4...sha256.jpg"
}
```

**Step 3:** Server B downloads the blob from Server A, verifies the SHA-256 hash matches the `x` tag in the auth token.

**Step 4:** Server B returns a Blob Descriptor with its own URL:
```json
{
  "url": "https://server-b.example.com/a1b2c3d4...sha256.jpg",
  "sha256": "a1b2c3d4...sha256",
  "size": 2048576,
  "type": "image/jpeg",
  "uploaded": 1700000010
}
```

### Authentication Details (BUD-11)

All authenticated Blossom operations use `kind:24242` Nostr events as bearer tokens.

**Token structure:**
```json
{
  "kind": 24242,
  "pubkey": "<user-pubkey>",
  "created_at": 1700000000,
  "content": "Upload Blob",
  "tags": [
    ["t", "upload"],
    ["x", "<sha256-of-blob>"],
    ["expiration", "1700003600"],
    ["server", "cdn.example.com"]
  ],
  "id": "<event-id>",
  "sig": "<signature>"
}
```

**HTTP header format:**
```
Authorization: Nostr <base64url-encoded-event-json>
```

The encoding is Base64 URL-safe without padding (same encoding as JWTs).

**Server validation checklist:**
1. Verify `kind` equals `24242`
2. Verify `created_at` is in the past
3. Verify `expiration` tag is in the future
4. Verify `t` tag matches the endpoint action
5. If `server` tags present, verify the current domain matches
6. If endpoint requires `x` tags, verify at least one matches the blob hash
7. Verify the Nostr event signature is valid

**Endpoint-to-action mapping:**

| Endpoint | `t` tag value | `x` tag required? |
|----------|---------------|-------------------|
| GET/HEAD /<sha256> | `get` | Optional |
| PUT /upload | `upload` | Required |
| DELETE /<sha256> | `delete` | Required |
| GET /list/<pubkey> | `list` | N/A |
| PUT /mirror | `upload` | Required |

**Security considerations:**
- Tokens without a `server` tag are valid on ANY Blossom server. If intercepted, they can be replayed. Always scope tokens to specific servers.
- Delete tokens are especially dangerous if unscoped -- an intercepted delete token could be replayed against all servers hosting the blob.
- Keep expiration windows short (minutes, not hours).

### CORS Requirements (BUD-01)

All Blossom servers MUST include:
- `Access-Control-Allow-Origin: *` on all responses
- On OPTIONS preflight: `Access-Control-Allow-Headers: Authorization, *`
- On OPTIONS preflight: `Access-Control-Allow-Methods: GET, HEAD, PUT, DELETE`

### Error Handling

Servers SHOULD include an `X-Reason` header with a human-readable error message on all 4xx/5xx responses.

### JSON Examples

#### kind:10063 Server List Event
```json
{
  "id": "e4bee088334cb5d38cff1616e964369c37b6081be997962ab289d6c671975d71",
  "pubkey": "781208004e09102d7da3b7345e64fd193cd1bc3fce8fdae6008d77f9cabcd036",
  "content": "",
  "kind": 10063,
  "created_at": 1708774162,
  "tags": [
    ["server", "https://blossom.self.hosted"],
    ["server", "https://cdn.blossom.cloud"]
  ],
  "sig": "cc5efa74f59e80622c77cacf4dd62076bcb7581b45e9acff471e7963a1f4d8b3406adab5ee1ac9673487480e57d20e523428e60ffcc7e7a904ac882cfccfc653"
}
```

#### Complete Upload Workflow Example
```
# 1. Compute SHA-256 of file
$ sha256sum photo.jpg
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2  photo.jpg

# 2. Sign kind:24242 auth token (done by client/signer)
# Token includes: t=upload, x=a1b2c3d4..., expiration=<future>, server=cdn.example.com

# 3. Upload
PUT /upload HTTP/1.1
Host: cdn.example.com
Authorization: Nostr eyJraW5kIjoyNDI0MiwiY29udGVudCI6IlVwbG9hZCBCbG9iIi...
Content-Type: image/jpeg
Content-Length: 2048576
X-SHA-256: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2

<binary JPEG data>

# 4. Response
HTTP/1.1 200 OK
Content-Type: application/json

{
  "url": "https://cdn.example.com/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2.jpg",
  "sha256": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "size": 2048576,
  "type": "image/jpeg",
  "uploaded": 1700000005
}

# 5. Use the URL in a Nostr event
{
  "kind": 1,
  "content": "Beautiful sunset! https://cdn.example.com/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2.jpg",
  "tags": [
    ["imeta",
      "url https://cdn.example.com/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2.jpg",
      "m image/jpeg",
      "dim 4032x3024",
      "x a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      "size 2048576"
    ]
  ]
}
```

## Implementation Notes
- Blossom servers store files under their SHA-256 hash. Two users uploading the same file results in one stored copy.
- The `url` field in Blob Descriptors MUST include a file extension for embedding in social posts.
- Servers compute SHA-256 over the exact bytes received -- no transformation before hashing.
- The `X-SHA-256` request header on uploads allows servers to check authorization before reading the entire body, enabling fast rejection of unauthorized uploads.
- The `/list` endpoint is marked as optional and unrecommended in BUD-02 -- not all servers implement it.
- All pubkeys in the Blossom ecosystem are in hex format (not npub/bech32).

## Client Behavior
- Clients SHOULD publish a `kind:10063` event listing the user's preferred Blossom servers.
- Clients SHOULD upload to at least the first server in the user's `kind:10063` list.
- Clients MAY mirror uploads to additional servers via BUD-04 for redundancy.
- Clients SHOULD attempt fallback resolution (via `kind:10063`) when a Blossom URL fails.
- Clients SHOULD verify SHA-256 hashes after downloading blobs.
- Clients SHOULD scope auth tokens to specific servers (include `server` tag) and use short expiration windows.
- Clients SHOULD include `Content-Type` and `Content-Length` headers on uploads.
- Clients SHOULD include the `X-SHA-256` header on uploads for efficient server-side auth checking.

## Relay Behavior
- Relays MUST accept and serve `kind:10063` events as standard replaceable events.
- Relays have no direct role in Blossom file operations (all HTTP between client and Blossom server).

## Dependencies
- NIP-40 -- Expiration (used in auth token `expiration` tags)
- [NIP-92](nip-92.md) -- Media Attachments (clients embed Blossom URLs with `imeta` tags)
- Blossom BUD specifications: [github.com/hzrd149/blossom](https://github.com/hzrd149/blossom)

## Source Code References
- **Blossom reference implementation:** [github.com/hzrd149/blossom](https://github.com/hzrd149/blossom)
- **blossom-client (JS):** `blossom-client-sdk` npm package -- Upload, download, list, delete, mirror helpers
- **nostr-tools (JS):** Look for kind 10063 handling and Blossom URL detection
- **Popular Blossom servers:** blossom.primal.net, cdn.satellite.earth, nostr.build (Blossom endpoint)
- **rust-nostr:** Check for BUD-related modules or kind 10063/24242 support

## Related NIPs
- [NIP-92](nip-92.md) -- Media Attachments (imeta tags reference Blossom URLs)
- [NIP-94](nip-94.md) -- File Metadata (field vocabulary)
- [NIP-71](nip-71.md) -- Video Events (video files hosted on Blossom)
- [NIP-A0](nip-A0.md) -- Voice Messages (audio files hosted on Blossom)
- [NIP-96](nip-96.md) -- HTTP File Storage (deprecated predecessor)
