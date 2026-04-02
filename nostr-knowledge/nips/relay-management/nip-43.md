# NIP-43: Relay Access Metadata and Requests

## Status
Active (draft, optional)

## Summary
NIP-43 defines a protocol for relays to advertise their membership lists and for clients to request admission to relays on behalf of users. It covers the full lifecycle of relay membership: discovering members, joining via invite codes, requesting invites, and leaving a relay. The relay signs events using its own identity key (the `self` field from NIP-11).

## Motivation
Many relays operate as private or semi-private communities with restricted write access. Before NIP-43, there was no standardized way for relays to publish who their members are, or for users to request admission programmatically. Relay operators had to rely on out-of-band communication (websites, DMs, manual whitelisting) to manage membership. NIP-43 brings this into the NOSTR protocol itself, enabling automated relay membership management and discovery.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| `13534` | Membership List | Replaceable | Published by relay (`self` key). Lists all member pubkeys. |
| `8000` | Add User | Regular | Published by relay when a member is added. |
| `8001` | Remove User | Regular | Published by relay when a member is removed. |
| `28934` | Join Request | Ephemeral | Sent by user to request admission with an invite code. |
| `28935` | Invite Request | Ephemeral | Response from relay containing an invite code. |
| `28936` | Leave Request | Ephemeral | Sent by user to request that their access be revoked. |

### Tags

| Tag | Used In | Description |
|-----|---------|-------------|
| `-` | All kinds | NIP-70 protected event tag. Required on all NIP-43 events. |
| `member` | `13534` | Contains a hex pubkey of a relay member. One tag per member. |
| `p` | `8000`, `8001` | Hex pubkey of the member being added or removed. |
| `claim` | `28934`, `28935` | Contains an invite code string. |

### Protocol Flow

#### Discovering Relay Members

1. Client queries for `kind:13534` events signed by the relay's `self` pubkey (from NIP-11).
2. The event contains `member` tags listing hex pubkeys of current members.
3. The membership list is NOT exhaustive or authoritative on its own.
4. To confirm membership, clients SHOULD check BOTH the relay's `kind:13534` event AND the user's `kind:10010` event.

#### Joining a Relay (Invite Flow)

1. User obtains an invite code (out-of-band, or via the Invite Request flow below).
2. Client sends a `kind:28934` event to the relay with a `claim` tag containing the invite code.
3. The event's `created_at` MUST be approximately now (plus or minus a few minutes).
4. Relay validates the invite code and responds with an `OK` message.
5. On success, the relay SHOULD update its `kind:13534` membership list and MAY publish a `kind:8000` add event.

#### Requesting an Invite

1. Client sends a REQ filter for `kind:28935` events to the relay.
2. Relay generates a fresh invite code on the fly (these are ephemeral events).
3. Relay returns a `kind:28935` event signed by its `self` key, containing the invite code in a `claim` tag.
4. Relays MAY issue different codes per request, restrict who can request invites, or expire codes.

#### Leaving a Relay

1. Client sends a `kind:28936` event to the relay with a NIP-70 `-` tag.
2. The event's `created_at` MUST be approximately now.
3. Relay SHOULD update its `kind:13534` membership list and MAY publish a `kind:8001` remove event.

### JSON Examples

#### Membership List (kind 13534)

```json
{
  "kind": 13534,
  "pubkey": "<relay self pubkey from NIP-11>",
  "tags": [
    ["-"],
    ["member", "c308e1f882c1f1dff2a43d4294239ddeec04e575f2d1aad1fa21ea7684e61fb5"],
    ["member", "ee1d336e13779e4d4c527b988429d96de16088f958cbf6c074676ac9cfd9c958"]
  ],
  "content": "",
  "created_at": 1700000000,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

#### Add User Event (kind 8000)

```json
{
  "kind": 8000,
  "pubkey": "<relay self pubkey from NIP-11>",
  "tags": [
    ["-"],
    ["p", "c308e1f882c1f1dff2a43d4294239ddeec04e575f2d1aad1fa21ea7684e61fb5"]
  ],
  "content": "",
  "created_at": 1700000000,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

#### Remove User Event (kind 8001)

```json
{
  "kind": 8001,
  "pubkey": "<relay self pubkey from NIP-11>",
  "tags": [
    ["-"],
    ["p", "c308e1f882c1f1dff2a43d4294239ddeec04e575f2d1aad1fa21ea7684e61fb5"]
  ],
  "content": "",
  "created_at": 1700000000,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

#### Join Request (kind 28934)

```json
{
  "kind": 28934,
  "pubkey": "<user pubkey>",
  "tags": [
    ["-"],
    ["claim", "abc123-invite-code"]
  ],
  "content": "",
  "created_at": 1700000000,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

#### OK Responses to Join Requests

```json
["OK", "<event-id>", true, "info: welcome to wss://relay.bunk.skunk!"]
["OK", "<event-id>", false, "restricted: that invite code is expired."]
["OK", "<event-id>", false, "restricted: that is an invalid invite code."]
["OK", "<event-id>", true, "duplicate: you are already a member of this relay."]
```

#### Invite Response (kind 28935)

```json
{
  "kind": 28935,
  "pubkey": "<relay self pubkey from NIP-11>",
  "tags": [
    ["-"],
    ["claim", "fresh-invite-code-xyz"]
  ],
  "content": "",
  "created_at": 1700000000,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

#### Leave Request (kind 28936)

```json
{
  "kind": 28936,
  "pubkey": "<user pubkey>",
  "tags": [
    ["-"]
  ],
  "content": "",
  "created_at": 1700000000,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

## Implementation Notes

- The membership list (`kind:13534`) is NOT exhaustive or authoritative by itself. A user might be a member without appearing in the list, or appear in the list without having confirmed their own membership.
- For reliable membership verification, check both the relay's `kind:13534` event and the user's own `kind:10010` event.
- Invite codes (`kind:28935`) are ephemeral events, meaning relays generate them on the fly and do not store them. This allows relays to issue unique codes per request, apply rate limits, or expire codes immediately.
- All NIP-43 events require the NIP-70 `-` tag, which marks them as protected (relay should not forward them to other relays).
- The `created_at` field on join and leave requests MUST be approximately "now" -- relays should reject requests with stale timestamps to prevent replay attacks.
- Failed join attempts SHOULD use the `"restricted: "` prefix in OK messages, consistent with NIP-42 conventions.

## Client Behavior

- Clients MUST only send `kind:28934` (join) events and request `kind:28935` (invite) events from relays that list NIP-43 in their `supported_nips` (NIP-11 document).
- Clients SHOULD check both the relay's membership list and the user's own relay preferences to determine membership status.
- Clients SHOULD set `created_at` to the current timestamp when sending join or leave requests.
- Clients SHOULD handle all OK response variants (success, duplicate, restricted) gracefully.
- Clients MAY display the relay's membership list to users for community discovery.

## Relay Behavior

- Relays MUST sign all `kind:13534`, `kind:8000`, `kind:8001`, and `kind:28935` events with the key specified in the `self` field of their NIP-11 document.
- Relays MUST include the NIP-70 `-` tag on all NIP-43 events.
- Relays SHOULD update their `kind:13534` membership list when members join or leave.
- Relays MAY publish `kind:8000` and `kind:8001` events to provide an audit trail of membership changes.
- Relays MUST respond to `kind:28934` join requests with an appropriate OK message.
- Relays MAY restrict who can request invites (e.g., only existing members, only authenticated users).
- Relays MAY implement invite code expiration, single-use codes, or other security policies.

## Dependencies

- NIP-01 (basic protocol)
- NIP-11 (Relay Information Document -- specifically the `self` field)
- NIP-42 (Authentication -- `"restricted: "` prefix convention for OK messages)
- NIP-70 (Protected Events -- the `-` tag required on all NIP-43 events)

## Source Code References

### nostr-tools (JS)
- NIP-43 is relatively new; check `nip43.ts` if present for helper functions.

### strfry
- Membership management would be handled in the relay's write policy plugins. strfry's plugin system (`strfry-plugins/`) can be configured to enforce membership lists.

### khatru
- `khatru.go` -- the `RejectEvent` and `RejectFilter` hooks can be used to implement membership-based access control. The relay operator would check incoming events against a membership list.

## Related NIPs

- NIP-11 (Relay Information Document) -- provides the `self` pubkey used to sign NIP-43 events
- NIP-42 (Authentication) -- used for relay auth; OK message prefix conventions
- NIP-65 (Relay List Metadata) -- user-side relay preferences that complement relay-side membership lists
- NIP-70 (Protected Events) -- the `-` tag mechanism used by all NIP-43 events
- NIP-86 (Relay Management API) -- alternative admin interface for managing relay access
