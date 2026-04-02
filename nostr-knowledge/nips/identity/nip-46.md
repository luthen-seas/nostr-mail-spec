# NIP-46: Nostr Remote Signing (Nostr Connect / Bunker)

## Status
Active (draft, optional)

## Summary
NIP-46 defines a protocol for remote signing where a user's private keys are held by a separate "remote signer" (bunker) and never exposed to the client application. The client and signer communicate through encrypted Nostr events (kind `24133`), allowing the signer to run on a different device, server, or security domain from the client.

## Motivation
Private keys should be exposed to as few systems as possible, since each system (app, OS, device) increases the attack surface. NIP-46 separates the concerns: the client handles the user interface and Nostr protocol logic, while the remote signer handles all cryptographic operations. This enables hardware-wallet-like security for Nostr, allows a single signer to serve multiple clients, and supports organizational use cases where key custody is managed centrally.

## Specification

### Event Kinds

| Kind  | Description |
|-------|-------------|
| 24133 | Nostr Connect request/response (encrypted, NIP-44) |

### Three Keypair Types

| Keypair | Owner | Purpose |
|---------|-------|---------|
| Client keypair | Client application | Used by client to encrypt requests to signer |
| Remote-signer keypair | Remote signer | Used by signer to encrypt responses to client |
| User keypair | User (held by signer) | The actual Nostr identity keys; used for signing events |

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `p` | `["p", "<target-pubkey>"]` | Recipient of the encrypted message |

### Protocol Flow

#### Connection Method 1: Remote-Signer Initiated (bunker:// URI)

The remote signer provides the user with a connection token:

```
bunker://<remote-signer-pubkey>?relay=<wss://relay-to-connect-on>&secret=<optional-secret>
```

1. User pastes the `bunker://` URI into the client.
2. Client extracts the remote-signer pubkey and relay.
3. Client generates its own keypair (client-keypair).
4. Client connects to the specified relay and subscribes to kind `24133` events tagged to its pubkey.
5. Client sends a `connect` request to the remote-signer pubkey.
6. Remote signer approves and responds with `"ack"` (or echoes back the secret).
7. Communication channel is established.

#### Connection Method 2: Client Initiated (nostrconnect:// URI)

The client generates a URI for the user to give to their signer:

```
nostrconnect://<client-pubkey>?relay=<wss://relay-to-connect-on>&secret=<required-secret>&perms=<optional-permissions>&name=<optional-app-name>&url=<optional-app-url>&image=<optional-app-image>
```

1. Client generates its own keypair and creates the `nostrconnect://` URI.
2. Client displays the URI (or QR code) to the user.
3. User opens the URI in their remote signer application.
4. Remote signer connects to the specified relay.
5. Remote signer sends a `connect` response containing the secret.
6. Client verifies the secret matches what it generated.
7. Communication channel is established.

The `secret` parameter is **required** in client-initiated flows to prevent connection spoofing.

### Request/Response Format

All communication uses kind `24133` events with NIP-44 encrypted content.

**Request event (client to signer):**

```json
{
  "kind": 24133,
  "pubkey": "<client-keypair-pubkey>",
  "content": "<nip44-encrypted-request-json>",
  "tags": [["p", "<remote-signer-pubkey>"]],
  "created_at": 1682327852,
  "id": "...",
  "sig": "..."
}
```

**Decrypted request content:**

```json
{
  "id": "<random-string>",
  "method": "<method-name>",
  "params": ["<param1>", "<param2>", "..."]
}
```

**Response event (signer to client):**

```json
{
  "kind": 24133,
  "pubkey": "<remote-signer-pubkey>",
  "content": "<nip44-encrypted-response-json>",
  "tags": [["p", "<client-keypair-pubkey>"]],
  "created_at": 1682327853,
  "id": "...",
  "sig": "..."
}
```

**Decrypted response content:**

```json
{
  "id": "<matching-request-id>",
  "result": "<result-string>",
  "error": "<optional-error-message>"
}
```

### Methods

| Method | Params | Result |
|--------|--------|--------|
| `connect` | `[<remote-signer-pubkey>, <optional-secret>, <optional-perms>]` | `"ack"` or the secret string |
| `sign_event` | `[<json-stringified-unsigned-event>]` | JSON-stringified signed event |
| `ping` | `[]` | `"pong"` |
| `get_public_key` | `[]` | User's public key (hex) |
| `nip04_encrypt` | `[<third-party-pubkey>, <plaintext>]` | NIP-04 ciphertext |
| `nip04_decrypt` | `[<third-party-pubkey>, <ciphertext>]` | Decrypted plaintext |
| `nip44_encrypt` | `[<third-party-pubkey>, <plaintext>]` | NIP-44 ciphertext |
| `nip44_decrypt` | `[<third-party-pubkey>, <ciphertext>]` | Decrypted plaintext |
| `switch_relays` | `[]` | Array of relays or `null` |

**Important:** All method parameters are strings. The `sign_event` method takes a JSON-stringified event, not a raw object.

### Authentication Challenge

When the signer needs user approval or additional authentication, it responds with:

```json
{
  "id": "<request-id>",
  "result": "auth_url",
  "error": "<url-for-user-to-open>"
}
```

The client should display or open this URL. After the user completes authentication, the signer sends another response on the same request ID with the actual result.

### Permissions Format

Permissions are specified as a comma-separated list:

```
method[:kind-number]
```

Examples:
- `nip44_encrypt,sign_event:4` -- allows NIP-44 encryption and signing kind 4 events
- `sign_event:0,sign_event:1,nip44_encrypt,nip44_decrypt` -- allows signing metadata and text notes, plus NIP-44 encryption/decryption

### JSON Examples

**Discovery via NIP-05 (well-known endpoint):**

```json
{
  "names": {
    "_": "<remote-signer-pubkey>"
  },
  "nip46": {
    "relays": ["wss://relay1.example.com"],
    "nostrconnect_url": "https://domain.com/<nostrconnect>"
  }
}
```

**Discovery via NIP-89 (kind 31990 handler event):**

A remote signer can publish a kind `31990` event with:
- `k` tag of `24133`
- Optional `relay` tags listing preferred relays
- Optional `nostrconnect_url` tag

## Implementation Notes

- NIP-44 encryption is used (not NIP-04). This is a hard requirement.
- The client-keypair is ephemeral and specific to the connection. It should be stored locally by the client for the duration of the session.
- The remote-signer-pubkey may differ from the user-pubkey. The signer has its own identity for communication purposes.
- Request IDs should be random unique strings (e.g., UUIDs) to match requests to responses.
- Clients should implement timeouts for requests that don't receive responses.
- The `switch_relays` method allows the signer to tell the client to reconnect to different relays mid-session.
- Multiple clients can connect to the same remote signer simultaneously.

## Client Behavior

- Clients MUST generate a unique client-keypair for communication.
- Clients MUST encrypt all requests using NIP-44.
- Clients MUST subscribe to kind `24133` events tagged to their client pubkey on the agreed relay.
- Clients SHOULD implement the `connect` handshake before sending other requests.
- Clients SHOULD handle `auth_url` responses by displaying the URL to the user.
- Clients SHOULD support both `bunker://` and `nostrconnect://` connection methods.
- Clients MUST verify the `secret` in client-initiated connections.
- Clients MAY request specific permissions during `connect`.
- Clients SHOULD implement timeouts and retry logic for requests.

## Relay Behavior

- Relays have no special behavior specific to NIP-46. They store and forward kind `24133` events normally.
- Relays SHOULD support ephemeral event handling for kind `24133` to avoid long-term storage of signing protocol messages.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (event structure)
- [NIP-04](../nip-04.md) -- Encrypted Direct Messages (for `nip04_encrypt`/`nip04_decrypt` methods)
- [NIP-44](../nip-44.md) -- Versioned Encryption (used for all NIP-46 communication)
- [NIP-05](./nip-05.md) -- DNS identifiers (optional discovery mechanism)
- [NIP-89](../nip-89.md) -- Recommended Application Handlers (optional discovery mechanism)

## Source Code References

- **nostr-tools (JS):** `nip46.ts` -- `Nip46RemoteSigner`, `Nip46Signer`, bunker URI parsing
- **rust-nostr:** `nostr/src/nips/nip46.rs` -- Nostr Connect implementation
- **go-nostr:** NIP-46 signer/client protocol handling
- **Notable implementations:** nsecBunker, Amber (Android), Nostr Connect reference

## Related NIPs

- [NIP-07](./nip-07.md) -- Browser extension signing (local alternative to remote signing)
- [NIP-55](./nip-55.md) -- Android Signer (platform-specific alternative)
- [NIP-49](./nip-49.md) -- Private Key Encryption (complementary: encrypting keys at rest)
- [NIP-05](./nip-05.md) -- DNS identifiers (used for signer discovery)
- [NIP-89](../nip-89.md) -- Application Handlers (used for signer discovery)
