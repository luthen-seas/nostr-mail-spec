# NIP-29: Relay-based Groups

## Status
Active (Draft)

## Summary
NIP-29 defines a standard for relay-managed groups with restricted write access. Unlike NIP-28 public channels where moderation is client-side, NIP-29 groups are enforced by relays: the relay controls membership, roles, and permissions. Groups can be public or private for reading, open or closed for joining, and support a full role-based administration system. Groups are identified by a random string ID and are scoped to the relay that hosts them.

## Motivation
NIP-28 public channels have no enforceable access control -- anyone can post, and moderation is purely advisory. Many communities need actual access restrictions: private groups, invite-only channels, and admin hierarchies with real enforcement. NIP-29 addresses this by making the relay the authority for group state, membership, and permissions, while keeping the protocol decentralized (groups can be forked or moved across relays).

## Specification

### Event Kinds

#### User-Created Events
| Kind | Description |
|------|-------------|
| 9    | Chat message (kind 9 from NIP-C7, with `h` tag) |
| 11   | Thread/long-form post (with `h` tag) |
| Any  | Groups accept any event kind, as long as it includes the `h` tag |

#### User Management Events
| Kind | Description |
|------|-------------|
| 9021 | Join request |
| 9022 | Leave request |

#### Moderation Events (Admin)
| Kind | Name | Tags |
|------|------|------|
| 9000 | `put-user` | `p` with pubkey hex and optional roles |
| 9001 | `remove-user` | `p` with pubkey hex |
| 9002 | `edit-metadata` | Fields to modify; optionally `unrestricted`, `open`, `visible`, `public` |
| 9005 | `delete-event` | `e` with event ID hex |
| 9007 | `create-group` | (no additional tags) |
| 9008 | `delete-group` | (no additional tags) |
| 9009 | `create-invite` | Arbitrary `code` tag |

#### Relay-Generated Metadata Events (Addressable)
| Kind  | Description |
|-------|-------------|
| 39000 | Group metadata (name, picture, about, access flags) |
| 39001 | Group admins (pubkeys with roles) |
| 39002 | Group members (pubkey list) |
| 39003 | Group roles (role definitions and capabilities) |

### Tags

#### The `h` Tag (Required on all user events)
All events sent to a group MUST include an `h` tag with the group ID:
```json
["h", "<group-id>"]
```

#### The `previous` Tag (Timeline References)
Events MAY include `previous` tags referencing recent events from the same relay to prevent out-of-context rebroadcasting:
```json
["previous", "<first-8-chars-of-event-id>"]
```
References use the first 8 characters (4 bytes) of any of the last 50 events seen. Clients should include at least 3 references. Relays should reject events with invalid timeline references.

#### The `d` Tag (Metadata Events)
Relay-generated metadata events (kinds 39000-39003) use a `d` tag with the group ID instead of the `h` tag:
```json
["d", "<group-id>"]
```

### Group Identifier Format
Groups are identified as: `<relay-host>'<group-id>`

Example: `groups.nostr.com'abcdef`

Group IDs must use only `a-z0-9-_` characters and SHOULD be random to avoid collisions. The special ID `_` represents the relay's top-level discussion group.

### Protocol Flow

#### Creating a Group
1. A user (or relay admin) sends a kind 9007 (`create-group`) event.
2. The relay creates internal rules for the new group ID.
3. The relay publishes kind 39000 metadata for the group.

#### Joining a Group
1. User sends a kind 9021 join request with the `h` tag and an optional invite `code` tag.
2. The relay either:
   - Immediately admits the user (generates kind 9000 `put-user`), OR
   - Queues the request for admin review, OR
   - Rejects with an error (e.g., group is `closed` and no valid invite code).
3. If the user is already a member, the relay rejects with `duplicate:` prefix.

#### Leaving a Group
1. User sends a kind 9022 leave request.
2. The relay automatically generates a kind 9001 `remove-user` event.

#### Sending Messages
1. User creates any event kind (e.g., kind 9 chat message) with the `h` tag set to the group ID.
2. User includes `previous` tags referencing recent events for timeline integrity.
3. The relay validates: membership, permissions, timeline references, and timestamp freshness.
4. If valid, the relay stores and distributes the event.

#### Admin Moderation
1. An admin sends a moderation event (kinds 9000-9020) with the `h` tag.
2. The relay checks the admin's role against its internal permission policy.
3. If authorized, the relay applies the action and updates the relevant metadata event (39000-39003).

### JSON Examples

#### Join Request (Kind 9021)
```json
{
  "kind": 9021,
  "pubkey": "user_pubkey_hex",
  "created_at": 1711900000,
  "content": "I'd like to join the pizza group!",
  "tags": [
    ["h", "abcdef"],
    ["code", "invite-code-123"]
  ],
  "sig": "user_sig_hex"
}
```

#### Leave Request (Kind 9022)
```json
{
  "kind": 9022,
  "pubkey": "user_pubkey_hex",
  "created_at": 1711910000,
  "content": "",
  "tags": [
    ["h", "abcdef"]
  ],
  "sig": "user_sig_hex"
}
```

#### Chat Message in a Group (Kind 9)
```json
{
  "kind": 9,
  "pubkey": "member_pubkey_hex",
  "created_at": 1711920000,
  "content": "Who wants pepperoni?",
  "tags": [
    ["h", "abcdef"],
    ["previous", "a1b2c3d4"],
    ["previous", "e5f6g7h8"],
    ["previous", "i9j0k1l2"]
  ],
  "sig": "member_sig_hex"
}
```

#### Put User / Add Admin (Kind 9000)
```json
{
  "kind": 9000,
  "pubkey": "admin_pubkey_hex",
  "created_at": 1711920000,
  "content": "Adding new moderator",
  "tags": [
    ["h", "abcdef"],
    ["p", "new_mod_pubkey_hex", "moderator"],
    ["previous", "a1b2c3d4"]
  ],
  "sig": "admin_sig_hex"
}
```

#### Remove User (Kind 9001)
```json
{
  "kind": 9001,
  "pubkey": "admin_pubkey_hex",
  "created_at": 1711930000,
  "content": "Removing spammer",
  "tags": [
    ["h", "abcdef"],
    ["p", "spammer_pubkey_hex"],
    ["previous", "x1y2z3w4"]
  ],
  "sig": "admin_sig_hex"
}
```

#### Group Metadata (Kind 39000, Relay-Generated)
```json
{
  "kind": 39000,
  "pubkey": "relay_master_pubkey_hex",
  "created_at": 1711900000,
  "content": "",
  "tags": [
    ["d", "abcdef"],
    ["name", "Pizza Lovers"],
    ["picture", "https://pizza.com/pizza.png"],
    ["about", "A group for people who love pizza"],
    ["private"],
    ["closed"]
  ],
  "sig": "relay_sig_hex"
}
```

Access flags in the metadata:
- `private` -- only members can read group messages
- `restricted` -- only members can write messages
- `hidden` -- relay hides metadata from non-members
- `closed` -- join requests are ignored (invite-only)

#### Group Admins (Kind 39001, Relay-Generated)
```json
{
  "kind": 39001,
  "pubkey": "relay_master_pubkey_hex",
  "created_at": 1711900000,
  "content": "list of admins for pizza lovers group",
  "tags": [
    ["d", "abcdef"],
    ["p", "admin1_pubkey_hex", "ceo"],
    ["p", "admin2_pubkey_hex", "secretary", "gardener"]
  ],
  "sig": "relay_sig_hex"
}
```

#### Group Members (Kind 39002, Relay-Generated)
```json
{
  "kind": 39002,
  "pubkey": "relay_master_pubkey_hex",
  "created_at": 1711900000,
  "content": "",
  "tags": [
    ["d", "abcdef"],
    ["p", "admin1_pubkey_hex"],
    ["p", "member1_pubkey_hex"],
    ["p", "member2_pubkey_hex"]
  ],
  "sig": "relay_sig_hex"
}
```

#### Group Roles (Kind 39003, Relay-Generated)
```json
{
  "kind": 39003,
  "pubkey": "relay_master_pubkey_hex",
  "created_at": 1711900000,
  "content": "",
  "tags": [
    ["d", "abcdef"],
    ["role", "admin", "Full control over group settings and membership"],
    ["role", "moderator", "Can delete messages and mute users"]
  ],
  "sig": "relay_sig_hex"
}
```

## Implementation Notes

### Membership Detection
A user can determine their membership status by checking for the latest kind 9000 (`put-user`) or kind 9001 (`remove-user`) event targeting their pubkey. If neither exists, they are not a member.

### Group Forking
Since groups are scoped to relays, a community can fork a group by establishing it on a different relay with the same ID. Each relay maintains its own metadata and membership state independently. The `previous` tag mechanism helps prevent events from one fork being replayed in another.

### Late Publication Prevention
Relays should reject events with timestamps significantly in the past (hours or days old) unless the relay is explicitly accepting a forked or migrated group.

### Group List Storage
Users can store their list of groups using kind 10009 events as defined in NIP-51.

## Client Behavior
- Clients MUST include the `h` tag on all events sent to a group.
- Clients SHOULD include at least 3 `previous` tags referencing recent events.
- Clients SHOULD verify `previous` tags on received events to keep relays honest.
- Clients MUST use the `<host>'<group-id>` format for group identifiers.
- Clients SHOULD display group metadata from kind 39000 events.
- Clients MAY infer `_` as the group ID when only a host is provided (top-level group).

## Relay Behavior
- Relays MUST sign kind 39000-39003 metadata events with their own master key.
- Relays MUST enforce membership and role-based permissions on all group events.
- Relays MUST reject moderation events from unauthorized pubkeys.
- Relays SHOULD validate `previous` tags against their own event database.
- Relays SHOULD reject late-published events (old timestamps).
- Relays SHOULD generate kind 9001 `remove-user` events in response to kind 9022 leave requests.
- Relays MAY restrict access to kind 39002 (member list) events.
- Relays MAY support custom role names defined by clients.

## Dependencies
- **NIP-01** -- Basic protocol (event structure)
- **NIP-11** -- Relay information (`self` pubkey for relay master key identification)
- **NIP-51** -- Lists (kind 10009 for group list storage)
- **NIP-C7** -- Chats (kind 9 chat messages used within groups)

## Source Code References
- **nostr-tools (JS)**: `nip29.ts` -- group event creation, moderation helpers
- **rust-nostr**: `nostr` crate -- kind 9000-9022, 39000-39003 event types
- **go-nostr**: group-related event kind constants
- **groups.fiatjaf.com**: Reference relay implementation for NIP-29

## Related NIPs
- **NIP-28** -- Public Chat (unmoderated alternative)
- **NIP-C7** -- Chats (kind 9 messages used in groups)
- **NIP-51** -- Lists (group list storage)
- **NIP-11** -- Relay Information (relay master key)
- **NIP-42** -- Authentication (for private group access)
- **NIP-70** -- Protected Events (for restricting event republishing)
