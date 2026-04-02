# NIP-96: HTTP File Storage Integration

## Status
**Unrecommended** -- Deprecated in favor of [NIP-B7](nip-B7.md) (Blossom)

> **Migration Note:** NIP-96 has been officially marked as `unrecommended` in the NIP repository. New implementations SHOULD use Blossom (NIP-B7) instead. Blossom provides a simpler, more composable architecture with content-addressable storage via SHA-256 hashes, a cleaner HTTP API, and a modular spec (BUDs) that separates concerns. Existing NIP-96 servers continue to operate, but the ecosystem is migrating. If you are building a new file storage service, implement Blossom. If you are building a client, support both NIP-96 (for legacy servers) and Blossom (for new servers), with Blossom preferred.

## Summary
NIP-96 defines a REST API for uploading, downloading, listing, and deleting files on HTTP file storage servers. Servers advertise their capabilities via a `.well-known` JSON endpoint, authenticate users via NIP-98 HTTP Auth, and return file metadata in NIP-94 format. Files are identified by their original SHA-256 hash across all operations.

## Motivation
Before NIP-96, there was no standardized way for Nostr clients to upload files to servers and reference them in events. Each file hosting service had its own proprietary API. NIP-96 provided a common REST interface so that any client could work with any NIP-96-compatible server. It deliberately avoided using Nostr WebSocket connections for file operations, keeping the server implementation simple (no relay logic needed).

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `10096` | Replaceable | User's preferred file storage server list |

The `kind:10096` event allows users to declare which NIP-96 servers they use:

```json
{
  "kind": 10096,
  "content": "",
  "tags": [
    ["server", "https://file.server.one"],
    ["server", "https://file.server.two"]
  ]
}
```

### Tags
- `server` -- URL of a NIP-96 compatible file storage server (used in `kind:10096`)

### Protocol Flow

#### Server Discovery
1. Client fetches `https://<server-domain>/.well-known/nostr/nip96.json`
2. Response contains server configuration:

```json
{
  "api_url": "https://files.example.com/api/v1",
  "download_url": "https://cdn.example.com",
  "delegated_to_url": "https://external-storage.example.com",
  "supported_nips": [94, 96, 98],
  "tos_url": "https://files.example.com/tos",
  "content_types": ["image/*", "video/*", "audio/*"],
  "plans": {
    "free": {
      "name": "Free Plan",
      "is_nip98_required": true,
      "max_byte_size": 10485760,
      "file_expiration": [0, 0]
    }
  }
}
```

Key fields:
- `api_url` (required) -- Base URL for upload/delete/list operations
- `download_url` (optional) -- Separate CDN URL for downloads
- `content_types` (optional) -- Allowed MIME types
- `plans` (optional) -- Service tiers with limits

#### Upload Flow
1. Client constructs a NIP-98 authorization header (signed `kind:27235` event).
2. Client sends `POST $api_url` with `multipart/form-data`:
   - `file` (required) -- The binary file data
   - `caption` (recommended) -- Description
   - `alt` (recommended) -- Accessibility text
   - `expiration` (optional) -- Unix timestamp for auto-deletion; empty string = permanent
   - `size` (optional) -- Byte size for early validation
   - `content_type` (optional) -- MIME type for pre-upload filtering
   - `media_type` (optional) -- `"avatar"` or `"banner"` for profile media
   - `no_transform` (optional) -- `"true"` to request the server not modify the file
3. Server responds with status and NIP-94-formatted metadata:

**Success (201 Created):**
```json
{
  "status": "success",
  "message": "Upload successful.",
  "nip94_event": {
    "tags": [
      ["url", "https://cdn.example.com/719171db...104b7b.png"],
      ["ox", "719171db19525d9d08dd69cb716a18158a249b7b3b3ec4bbdec5698dca104b7b"],
      ["x", "543244319525d9d08dd69cb716a18158a249b7b3b3ec4bbde5435543acb34443"],
      ["m", "image/png"],
      ["dim", "800x600"]
    ],
    "content": ""
  }
}
```

**Response status codes:**
| Code | Meaning |
|------|---------|
| 200 | File already exists (duplicate hash) |
| 201 | New file created successfully |
| 202 | Accepted for deferred processing |
| 400 | Invalid form data |
| 402 | Payment required |
| 403 | Unauthorized or hash mismatch |
| 413 | File too large |

#### Deferred Processing (202 Accepted)
For large files or transcoding, servers may queue processing:

```json
{
  "status": "processing",
  "message": "Processing. Please check again later.",
  "percentage": 15
}
```

Client polls the `processing_url` from the initial response until the server returns `201 Created` with full metadata.

#### Download Flow
1. Client requests `GET $api_url/<sha256-hash>(.ext)`
2. File extension is optional but recommended for MIME type detection.
3. The hash used is always the **original** file hash (`ox`), not the transformed hash.
4. Servers MAY support image resizing via query parameters: `$api_url/<sha256>.png?w=32`

#### Delete Flow
1. Client sends `DELETE $api_url/<sha256-hash>(.ext)` with NIP-98 auth header.
2. Server verifies the requester is the original uploader.
3. If multiple users uploaded the same file (same hash), deletion removes only that user's ownership -- the file persists for other owners.

**Success response:**
```json
{
  "status": "success",
  "message": "File deleted."
}
```

#### List Flow
1. Client sends `GET $api_url?page=x&count=y` with NIP-98 auth header.
2. Server returns paginated results of the authenticated user's files:

```json
{
  "count": 1,
  "total": 1,
  "page": 0,
  "files": [
    {
      "tags": [
        ["ox", "719171db19525d9d08dd69cb716a18158a249b7b3b3ec4bbdec5698dca104b7b"],
        ["x", "5d2899290e0e69bcd809949ee516a4a1597205390878f780c098707a7f18e3df"],
        ["size", "123456"],
        ["alt", "a meme that makes you laugh"],
        ["expiration", "1715691139"]
      ],
      "content": "haha funny meme",
      "created_at": 1715691130
    }
  ]
}
```

Files are returned as NIP-94 event structures.

### JSON Examples

#### NIP-98 Authorization Header
The auth header is a signed `kind:27235` event, base64-encoded:
```
Authorization: Nostr <base64-encoded-kind-27235-event>
```

The event may optionally include a `payload` tag with the base64-encoded SHA-256 hash of the file being uploaded.

## Implementation Notes
- Servers maintain a single copy of each file, identified by the original SHA-256 hash (`ox`).
- Server-side transformations (resizing, compression, format conversion) are tracked separately: `ox` = original hash, `x` = transformed hash.
- File extensions in URLs aid MIME type detection but are not required for operation.
- The `no_transform` flag is a request, not a guarantee -- servers may ignore it.
- The `nip94_event` in upload responses can be used directly to construct `kind:1063` events or `imeta` tags.

## Client Behavior
- Clients SHOULD prefer Blossom (NIP-B7) servers over NIP-96 servers for new uploads.
- Clients SHOULD support NIP-96 for backward compatibility with existing content.
- Clients MUST include NIP-98 authentication headers when required by the server.
- Clients SHOULD send `alt` text with uploads for accessibility.
- Clients SHOULD use the `ox` (original hash) for all download/delete operations.
- Clients MAY publish `kind:10096` events to advertise their preferred servers.

## Relay Behavior
- Relays store `kind:10096` events as standard replaceable events.
- Relays have no direct role in NIP-96 file operations (all HTTP, no WebSocket).

## Migration to Blossom (NIP-B7)

### Why Blossom Replaced NIP-96
1. **Simpler architecture** -- Blossom uses content-addressable URLs (`/<sha256>.ext`) directly, no `.well-known` discovery needed for basic operations.
2. **Modular specs (BUDs)** -- Each concern (retrieval, upload, server lists, mirroring, auth) is a separate spec, allowing partial implementation.
3. **True content addressing** -- Blossom URLs are the SHA-256 hash, making fallback resolution trivial (just try the same path on a different server).
4. **Better redundancy** -- `kind:10063` server lists + hash-based URLs mean any Blossom server with the file can serve it.

### Migration Path
- Clients should check for both `kind:10096` (NIP-96 servers) and `kind:10063` (Blossom servers) in user profiles.
- For new uploads, prefer Blossom servers.
- For existing NIP-96 URLs, continue to fetch them normally. If a NIP-96 URL fails and the hash is known, try the author's Blossom servers.
- NIP-96 server operators may add Blossom endpoint support alongside their existing API.

## Dependencies
- NIP-98 -- HTTP Auth (authorization headers for upload/delete/list)
- [NIP-94](nip-94.md) -- File Metadata (response format for upload and list operations)
- NIP-40 -- Expiration (for file expiration timestamps)

## Source Code References
- **nostr-tools (JS):** `nip96.ts` -- Upload/download/delete helpers and server discovery
- **rust-nostr:** Look for NIP-96 upload client implementations
- **Server implementations:** nostr.build, void.cat, and others historically implemented NIP-96

## Related NIPs
- [NIP-B7](nip-B7.md) -- Blossom (the replacement)
- [NIP-94](nip-94.md) -- File Metadata (response format)
- [NIP-92](nip-92.md) -- Media Attachments (clients build `imeta` from NIP-96 responses)
- NIP-98 -- HTTP Auth
