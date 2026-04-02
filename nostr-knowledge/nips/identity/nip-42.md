# NIP-42: Authentication of Clients to Relays

## Status
Active (draft, optional)

## Summary
NIP-42 defines a challenge-response authentication protocol between clients and relays. Relays send a challenge string, and clients respond with a signed ephemeral event (kind `22242`) proving they control a specific pubkey. This allows relays to restrict access to certain operations (reading DMs, publishing events) based on authenticated identity.

## Motivation
Some relay operations should be restricted to authenticated users. For example, a relay may only serve kind `4` (DM) events to the sender or recipient, or may only accept events from registered/paying users. NIP-42 provides a standard way for relays to challenge clients and for clients to prove their identity without revealing private keys, using the same event signing mechanism already built into Nostr.

## Specification

### Event Kinds

| Kind  | Description |
|-------|-------------|
| 22242 | Authentication event (ephemeral, never broadcast) |

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `relay` | `["relay", "<relay-url>"]` | The relay URL this auth event is for |
| `challenge` | `["challenge", "<challenge-string>"]` | The challenge string issued by the relay |

### Protocol Flow

**Phase 1: Challenge Issuance**

1. Client connects to relay via WebSocket.
2. Relay sends a challenge: `["AUTH", "<challenge-string>"]`

**Phase 2: Authentication (triggered when needed)**

The relay does not require immediate authentication. Instead, it signals the need when a restricted operation is attempted.

**Flow A: Authentication required for a subscription (REQ)**

```
relay:  ["AUTH", "<challenge>"]
client: ["REQ", "sub_1", {"kinds": [4]}]
relay:  ["CLOSED", "sub_1", "auth-required: we can't serve DMs to unauthenticated users"]
client: ["AUTH", {"id": "abcdef...", ...}]
relay:  ["OK", "abcdef...", true, ""]
client: ["REQ", "sub_1", {"kinds": [4]}]
relay:  ["EVENT", "sub_1", {...}]
relay:  ["EVENT", "sub_1", {...}]
relay:  ["EVENT", "sub_1", {...}]
relay:  ["EVENT", "sub_1", {...}]
```

**Flow B: Authentication required for publishing (EVENT)**

```
relay:  ["AUTH", "<challenge>"]
client: ["EVENT", {"id": "012345...", ...}]
relay:  ["OK", "012345...", false, "auth-required: we only accept events from registered users"]
client: ["AUTH", {"id": "abcdef...", ...}]
relay:  ["OK", "abcdef...", true, ""]
client: ["EVENT", {"id": "012345...", ...}]
relay:  ["OK", "012345...", true, ""]
```

### JSON Examples

**Authentication event (kind 22242):**

```json
{
  "kind": 22242,
  "tags": [
    ["relay", "wss://relay.example.com/"],
    ["challenge", "challengestringhere"]
  ],
  "content": "",
  "created_at": 1682327852,
  "pubkey": "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9",
  "id": "abcdef...",
  "sig": "f1a2b3..."
}
```

**Relay-to-client AUTH challenge:**

```json
["AUTH", "challengestringhere"]
```

**Client-to-relay AUTH response:**

```json
["AUTH", <signed-kind-22242-event>]
```

### Message Prefixes

| Prefix | Context | Meaning |
|--------|---------|---------|
| `auth-required:` | `CLOSED` or `OK` message | Authentication is needed to proceed |
| `restricted:` | `CLOSED` or `OK` message | Authenticated pubkey lacks authorization for this action |

## Implementation Notes

- The challenge string persists for the entire WebSocket connection duration.
- Clients may authenticate with multiple pubkeys sequentially on the same connection.
- Kind `22242` events MUST NOT be broadcast to other clients or stored permanently -- they are ephemeral authentication tokens.
- The `created_at` timestamp should be within approximately 10 minutes of the current time to prevent replay attacks.
- Relay URL matching should allow for minor normalization differences (trailing slashes, etc.).
- Clients should be prepared to re-authenticate if the connection drops and reconnects.

## Client Behavior

- Clients MUST watch for `["AUTH", <challenge>]` messages from relays.
- Clients SHOULD automatically attempt authentication when receiving `auth-required:` prefixed messages in `CLOSED` or `OK` responses.
- Clients MUST sign kind `22242` events with the correct `relay` and `challenge` tags.
- Clients SHOULD retry the failed operation after successful authentication.
- Clients MAY prompt the user before authenticating to a relay (to avoid fingerprinting).
- Clients MUST set `created_at` to the current time when creating auth events.

## Relay Behavior

- Relays MUST send `["AUTH", "<challenge>"]` after accepting a WebSocket connection.
- Relays MUST validate auth events by checking:
  1. The event kind is `22242`.
  2. The `created_at` is within ~10 minutes of the current time.
  3. The `challenge` tag matches the challenge issued for this connection.
  4. The `relay` tag matches the relay's own URL (allowing normalization).
  5. The event signature is valid.
- Relays MUST NOT broadcast kind `22242` events to subscribers.
- Relays SHOULD use the `auth-required:` prefix in `CLOSED` and `OK` messages when authentication is needed.
- Relays SHOULD use the `restricted:` prefix when the authenticated pubkey lacks permission.
- Relays MAY require authentication for any operation (reading, writing, or both).

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (event structure, `OK` and `CLOSED` messages)

## Source Code References

- **nostr-tools (JS):** `nip42.ts` -- auth event creation and validation helpers
- **rust-nostr:** `nostr/src/nips/nip42.rs` -- relay authentication
- **go-nostr:** NIP-42 auth handling in relay client code

## Related NIPs

- [NIP-01](../nip-01.md) -- Basic protocol (WebSocket message types used)
- [NIP-04](../nip-04.md) -- Encrypted DMs (common use case requiring auth for reading)
- [NIP-29](../nip-29.md) -- Relay-based Groups (may use NIP-42 for group access control)
