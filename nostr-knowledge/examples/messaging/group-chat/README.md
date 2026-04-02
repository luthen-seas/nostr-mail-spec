# NIP-29: Relay-Based Groups

## Overview

NIP-29 defines relay-enforced group chat. Unlike NIP-28 (public channels with client-side moderation), NIP-29 groups are **managed and enforced by the relay itself**. The relay:

- Maintains membership lists
- Validates that senders are members before accepting messages
- Enforces admin roles and permissions
- Can actually delete events (not just hide them client-side)

## Group Identity

A NIP-29 group is identified by a **group ID** on a **specific relay**. The full address format is:

```
<relay-url>'<group-id>
```

For example: `wss://groups.example.com'nostr-dev`

Groups are tied to a single relay. This is a deliberate design choice: the relay is the authority that enforces membership and moderation rules.

## Group Types

Groups have two independent properties:

| Property | Options | Description |
|----------|---------|-------------|
| Access | `open` / `closed` | Open: anyone can join. Closed: join requests require admin approval |
| Visibility | `public` / `private` | Public: group appears in listings. Private: group is hidden |

## Event Kinds

### User Events

| Kind | Purpose | Description |
|------|---------|-------------|
| 9 | Chat message | Short message in the group |
| 10 | Thread reply | Reply within a thread |
| 11 | Long-form note | Extended content |
| 12 | Thread root | Starts a new discussion thread |
| 9021 | Join request | Ask to join a group |
| 9022 | Leave request | Leave a group |

All user events must include an `["h", groupId]` tag.

### Admin Events

| Kind | Purpose | Description |
|------|---------|-------------|
| 9000 | Add user | Add a member to the group |
| 9001 | Remove user | Remove a member from the group |
| 9002 | Edit metadata | Update group name, about, picture |
| 9003 | Delete event | Remove a specific event from the group |
| 9004 | Edit group status | Change open/closed or public/private |
| 9005 | Create group | Create a new group on the relay |
| 9006 | Delete group | Permanently delete a group |
| 9007 | Create invite | Generate an invite code for closed groups |

### Relay-Published State

The relay publishes and maintains addressable events that describe the group's current state:

| Kind | Purpose | Content |
|------|---------|---------|
| 39000 | Group metadata | Name, about, picture, status (open/closed) |
| 39001 | Admin list | Pubkeys with roles and permissions |
| 39002 | Member list | Pubkeys of all members |

These events use the `d` tag with the group ID, making them addressable (replaceable).

## Roles and Permissions

NIP-29 defines a permission system for admins. Each admin's `p` tag in the kind 39001 event lists their specific permissions:

```json
["p", "<admin-pubkey>", "admin", "add-user", "remove-user", "edit-metadata", "delete-event"]
```

Common permissions:
- `add-user` — Can add members
- `remove-user` — Can remove members
- `edit-metadata` — Can change group name/description
- `delete-event` — Can delete messages
- `edit-group-status` — Can change open/closed/public/private

## Message Flow

### Joining

```
User publishes kind 9021 -> Relay
                              |
                  [open group] -> Relay adds user to kind 39002
                  [closed group] -> Relay queues for admin approval
                                    Admin publishes kind 9000 -> Relay adds user
```

### Sending a Message

```
Member publishes kind 9 with ["h", groupId] -> Relay
                                                 |
                                    [is member?] -> YES: relay stores and broadcasts
                                                 -> NO: relay rejects (e.g., "restricted")
```

### Moderation

```
Admin publishes kind 9003 with ["e", eventId] -> Relay
                                                   |
                                      [has delete-event permission?]
                                        -> YES: relay deletes the event
                                        -> NO: relay rejects
```

## Key Differences from NIP-28

| Feature | NIP-28 (Public Channels) | NIP-29 (Relay Groups) |
|---------|--------------------------|----------------------|
| Enforcement | Client-side | Server-side (relay) |
| Membership | None (anyone posts) | Required (must join) |
| Moderation | Client-side (hide/mute) | Server-side (actual deletion) |
| Roles | Creator only | Admins with specific permissions |
| Access control | None | Open/closed groups |
| Visibility | Always public | Public or private |
| Multi-relay | Yes | Single relay per group |
| Join/leave | N/A | Explicit events (kind 9021/9022) |

## Subscribing to a Group

To display a group, connect to its relay and subscribe:

```typescript
const pool = new SimplePool()

pool.subscribeMany(
  ['wss://groups.example.com'],
  [
    // Chat messages and threads
    { kinds: [9, 10, 11, 12], '#h': ['nostr-dev'] },
    // Group state (metadata, admins, members)
    { kinds: [39000, 39001, 39002], '#d': ['nostr-dev'] },
  ],
  {
    onevent(event) {
      // Handle each event kind
    }
  }
)
```

## Running the Example

```bash
npm install nostr-tools @noble/hashes ws
npx tsx group_chat.ts
```

The example constructs all event types locally to demonstrate their structure. In production, these events would be sent to a NIP-29-compatible relay that validates membership and permissions.

## Related NIPs

- **NIP-28**: Public chat channels (no membership, client-side moderation)
- **NIP-17**: Private DMs (one-to-one encrypted messaging)
- **NIP-59**: Gift wrapping (metadata protection for private messages)
