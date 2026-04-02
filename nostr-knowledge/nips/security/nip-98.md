# NIP-98: HTTP Auth

## Status
Draft / Optional

## Summary
NIP-98 defines an authentication scheme that uses signed Nostr events to authorize HTTP requests. A client creates a kind `27235` ephemeral event containing the request URL and HTTP method, signs it, base64-encodes it, and includes it in the `Authorization` HTTP header. The server validates the event signature, timestamp, URL, and method to authenticate the request.

## Motivation
HTTP services built for the Nostr ecosystem need a way to authenticate users by their Nostr identity (pubkey) without requiring separate account systems, passwords, or OAuth flows. NIP-98 bridges the gap between Nostr's event-signing identity model and traditional HTTP APIs, allowing any service to verify that a request comes from the holder of a specific Nostr private key. This is particularly useful for media upload servers, paid API endpoints, and Nostr-integrated web services.

## Specification

### Event Kinds

| Kind | Description | Reference |
|------|-------------|-----------|
| `27235` | HTTP Auth event | Named in reference to [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) (HTTP Authentication) |

This is an ephemeral, single-use event. It is not intended to be stored on relays.

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `u` | MUST | The absolute URL of the HTTP request (including query parameters) |
| `method` | MUST | The HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, etc.) |
| `payload` | SHOULD (for body requests) | SHA-256 hex hash of the request body |

### Protocol Flow

#### Step 1: Client Creates Auth Event

The client constructs a kind `27235` event:

1. Set `kind` to `27235`.
2. Set `content` to an empty string (SHOULD be empty).
3. Add a `u` tag with the exact absolute URL being requested.
4. Add a `method` tag with the HTTP method being used.
5. If the request has a body (POST/PUT/PATCH), compute SHA-256 of the body and add a `payload` tag with the hex-encoded hash.
6. Set `created_at` to the current Unix timestamp.
7. Sign the event with the user's Nostr private key.

#### Step 2: Client Sends HTTP Request

1. Serialize the signed event to JSON.
2. Base64-encode the JSON string.
3. Set the `Authorization` header to: `Nostr <base64-encoded-event>`
4. Send the HTTP request with this header.

#### Step 3: Server Validates

The server MUST perform these checks in order:

1. **Kind check:** The `kind` MUST be `27235`.
2. **Timestamp check:** The `created_at` MUST be within a reasonable time window (recommended: 60 seconds).
3. **URL check:** The `u` tag MUST exactly match the absolute request URL (including query parameters).
4. **Method check:** The `method` tag MUST match the HTTP method used.
5. **Signature check:** The event signature must be valid per NIP-01.
6. **Payload check (optional):** If a `payload` tag is present, servers MAY verify it matches the SHA-256 hash of the request body.

If any check fails, the server SHOULD respond with `401 Unauthorized`.

### JSON Examples

#### GET request auth event:

```json
{
  "id": "fe964e758903360f28d8424d092da8494ed207cba823110be3a57dfe4b578734",
  "pubkey": "63fe6318dc58583cfe16810f86dd09e18bfd76aabc24a0081ce2856f330504ed",
  "content": "",
  "kind": 27235,
  "created_at": 1682327852,
  "tags": [
    ["u", "https://api.snort.social/api/v1/n5sp/list"],
    ["method", "GET"]
  ],
  "sig": "5ed9d8ec958bc854f997bdc24ac337d005af372324747efe4a00e24f4c30437ff4dd8308684bed467d9d6be3e5a517bb43b1732cc7d33949a3aaf86705c22184"
}
```

#### POST request auth event with payload hash:

```json
{
  "id": "...",
  "pubkey": "63fe6318dc58583cfe16810f86dd09e18bfd76aabc24a0081ce2856f330504ed",
  "content": "",
  "kind": 27235,
  "created_at": 1682327900,
  "tags": [
    ["u", "https://api.example.com/upload"],
    ["method", "POST"],
    ["payload", "3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b"]
  ],
  "sig": "..."
}
```

#### HTTP Authorization header example:

```
GET /api/v1/n5sp/list HTTP/1.1
Host: api.snort.social
Authorization: Nostr eyJpZCI6ImZlOTY0ZTc1ODkwMzM2MGYyOGQ4NDI0ZDA5MmRhODQ5NGVkMjA3Y2JhODIzMTEwYmUzYTU3ZGZlNGI1Nzg3MzQiLCJwdWJrZXkiOiI2M2ZlNjMxOGRjNTg1ODNjZmUxNjgxMGY4NmRkMDllMThiZmQ3NmFhYmMyNGEwMDgxY2UyODU2ZjMzMDUwNGVkIiwiY29udGVudCI6IiIsImtpbmQiOjI3MjM1LCJjcmVhdGVkX2F0IjoxNjgyMzI3ODUyLCJ0YWdzIjpbWyJ1IiwiaHR0cHM6Ly9hcGkuc25vcnQuc29jaWFsL2FwaS92MS9uNXNwL2xpc3QiXSxbIm1ldGhvZCIsIkdFVCJdXSwic2lnIjoiNWVkOWQ4ZWM5NThiYzg1NGY5OTdiZGMyNGFjMzM3ZDAwNWFmMzcyMzI0NzQ3ZWZlNGEwMGUyNGY0YzMwNDM3ZmY0ZGQ4MzA4Njg0YmVkNDY3ZDlkNmJlM2U1YTUxN2JiNDNiMTczMmNjN2QzMzk0OWEzYWFmODY3MDVjMjIxODQifQ
```

The base64 string decodes to the full JSON event shown above.

## Implementation Notes

1. **Ephemeral events:** Kind `27235` events are not meant to be published to relays. They exist solely in the HTTP header for the duration of one request.

2. **Timestamp window:** The spec recommends a 60-second window for `created_at` validation. Servers should account for clock skew but keep the window tight to prevent replay attacks.

3. **URL exact matching:** The `u` tag must match the request URL exactly, including query parameters, scheme, and path. A mismatch in trailing slashes, query parameter order, or URL encoding will cause validation failure. Implementers should normalize URLs consistently.

4. **Replay prevention:** The tight timestamp window is the primary replay prevention mechanism. Servers MAY additionally track recently-seen event IDs to prevent replay within the validity window.

5. **Payload integrity:** For requests with bodies, the `payload` tag provides integrity verification. However, it is a SHOULD for clients and MAY for servers, so not all implementations will enforce it.

6. **No relay involvement:** This NIP operates entirely between HTTP client and server. No relay communication is needed. The server only needs the ability to verify Nostr event signatures.

7. **Multiple requests:** Each HTTP request needs a fresh auth event. Events cannot be reused across requests because the URL, method, and timestamp would differ.

## Client Behavior

- Clients MUST create a new kind `27235` event for each HTTP request.
- Clients MUST include the `u` and `method` tags.
- Clients SHOULD set `content` to an empty string.
- Clients SHOULD include a `payload` tag with the SHA-256 hex hash of the request body for POST/PUT/PATCH requests.
- Clients MUST base64-encode the full signed event JSON.
- Clients MUST use the `Nostr` authorization scheme in the `Authorization` header.
- Clients MUST set `created_at` to the current time (not a stale timestamp).

## Relay Behavior

Relays have no specific role in NIP-98. This NIP operates entirely over HTTP between clients and API servers. Relays do not need to store, forward, or validate kind `27235` events.

## Dependencies

- **NIP-01** -- Event format, ID computation, and signature verification.

## Source Code References

- **nostr-tools (JS/TS):** `nip98.ts` -- provides `getToken()` to generate auth headers and `validateToken()` for server-side verification.
- **C# ASP.NET reference:** [NostrAuth.cs](https://gist.github.com/v0l/74346ae530896115bfe2504c8cd018d3) -- `AuthenticationHandler` implementation for ASP.NET.
- **rust-nostr:** Check for `nip98` module in the `nostr` crate.

## Related NIPs

- **NIP-01** -- Core event format and cryptographic primitives used for signing.
- **NIP-42** -- Client authentication to relays (similar concept but for WebSocket relay connections, not HTTP).
