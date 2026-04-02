# NIP-70: Protected Events

## Status
Active (draft, optional)

## Summary
NIP-70 defines the `["-"]` tag, which marks an event as "protected." Relays MUST reject protected events by default. To accept a protected event, the relay must implement NIP-42 authentication and verify that the authenticated client's pubkey matches the event's author pubkey. This mechanism restricts event distribution to relays where the author has explicitly authenticated, enabling community compartmentalization and semi-closed distribution.

## Motivation
By default, any relay will accept any validly signed event from any client. This means content published to one relay can be trivially republished to any other relay by anyone who has a copy. While this openness is a feature of Nostr, some use cases require more controlled distribution:

- **Community compartmentalization:** Content intended for a specific relay community should not be casually republished elsewhere
- **Semi-closed communities:** Relays that want to limit content to their membership
- **Information organization:** Keeping content separated across relay boundaries
- **Closed-access feeds:** Creating restricted feeds based on relay-author trust

NIP-70 provides an explicit signal from the author that the event should only be accepted by relays where the author has authenticated, making it harder (though not impossible) for third parties to redistribute the content.

## Specification

### Event Kinds

NIP-70 does not define new event kinds. The `["-"]` tag can be added to any event kind.

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `-` | `["-"]` | Marks the event as protected (requires authentication) |

This is a single-element tag array. The tag name is the literal hyphen character `-`.

### Protocol Flow

**Publishing a protected event:**

1. Client creates an event with `["-"]` in the tags array
2. Client sends `["EVENT", <event>]` to relay
3. Relay sees the `["-"]` tag
4. Relay checks if the client is authenticated (NIP-42)
5. **If NOT authenticated:** Relay sends `["OK", "<event-id>", false, "auth-required: ..."]` and issues an AUTH challenge
6. Client completes the NIP-42 AUTH handshake
7. Client resends the event
8. Relay verifies that the authenticated pubkey matches `event.pubkey`
9. **If match:** Relay accepts the event -- `["OK", "<event-id>", true, ""]`
10. **If mismatch:** Relay rejects -- `["OK", "<event-id>", false, "restricted: event author does not match authenticated user"]`

**Third party attempting to republish:**

1. Attacker obtains a copy of a protected event
2. Attacker sends it to another relay
3. The receiving relay sees `["-"]` and requires AUTH
4. Attacker authenticates, but their pubkey does not match the event's pubkey
5. Relay rejects the event

### JSON Examples

**Protected kind:1 note:**
```json
{
  "kind": 1,
  "content": "This note is for this community only.",
  "tags": [
    ["-"]
  ],
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Protected kind:30023 article:**
```json
{
  "kind": 30023,
  "content": "This article is exclusively for subscribers of this relay.",
  "tags": [
    ["d", "exclusive-article"],
    ["title", "Exclusive Content"],
    ["-"]
  ],
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
  "created_at": 1680000000,
  "id": "...",
  "sig": "..."
}
```

**Authentication flow example:**

Step 1 -- Client sends protected event:
```json
["EVENT", {"kind":1,"content":"Community post","tags":[["-"]],"pubkey":"6e468422...","id":"abc123...","sig":"def456...","created_at":1680000000}]
```

Step 2 -- Relay challenges:
```json
["OK", "abc123...", false, "auth-required: this event requires authentication"]
["AUTH", "<challenge-string>"]
```

Step 3 -- Client authenticates (NIP-42):
```json
["AUTH", {"kind":22242,"content":"","tags":[["relay","wss://relay.example.com"],["challenge","<challenge-string>"]],"pubkey":"6e468422...","id":"...","sig":"...","created_at":1680000000}]
```

Step 4 -- Client resends the event:
```json
["EVENT", {"kind":1,"content":"Community post","tags":[["-"]],"pubkey":"6e468422...","id":"abc123...","sig":"def456...","created_at":1680000000}]
```

Step 5 -- Relay accepts:
```json
["OK", "abc123...", true, ""]
```

## Implementation Notes

1. **Not true security:** The spec explicitly acknowledges that information restriction on the internet is fundamentally limited. Members of a community can always copy and republish content elsewhere (without the `["-"]` tag). NIP-70 provides a signal and a speed bump, not cryptographic enforcement.

2. **Relay MUST default to rejection:** Any relay that sees `["-"]` and does not implement NIP-42 authentication MUST reject the event. This is the safe default.

3. **Pubkey matching:** The relay must verify `authenticated_pubkey == event.pubkey`. This prevents users from publishing events on behalf of others.

4. **Impact on reposts:** When reposting a protected event (NIP-18), the `kind:6` repost may have an empty `content` field since the original event cannot be freely shared. The `e` and `p` tags still reference the original.

5. **Relay discovery:** Clients should know which relays support NIP-42 authentication before attempting to publish protected events.

6. **Tag stripping risk:** A malicious actor could strip the `["-"]` tag and republish the event. However, this would change the event's `id` and invalidate the `sig`, so they would need to re-sign with their own key, making it a new event from a different author.

## Client Behavior

- Clients MUST include `["-"]` in the tags array when the user wants to protect an event
- Clients MUST be prepared to handle NIP-42 AUTH challenges when publishing protected events
- Clients SHOULD inform users that protection is a soft measure, not cryptographic security
- Clients SHOULD only publish protected events to relays known to support NIP-42
- Clients MAY display a visual indicator that an event is protected

## Relay Behavior

- Relays MUST reject events containing `["-"]` if NIP-42 authentication is not implemented
- Relays that implement NIP-42 MUST verify that the authenticated pubkey matches `event.pubkey` before accepting protected events
- Relays MUST send an AUTH challenge when receiving a protected event from an unauthenticated client
- Relays SHOULD still serve protected events to authenticated clients via normal REQ queries (the protection is on publication, not reading)

## Dependencies
- NIP-01: Base protocol (event structure, OK messages)
- NIP-42: Authentication (required for accepting protected events)

## Source Code References

- **nostr-tools (JS):** NIP-42 auth implementation; protected tag is a simple tag check
- **rust-nostr:** NIP-42 auth flow; tag checking for `"-"`
- **go-nostr:** NIP-42 authentication handling

## Related NIPs
- NIP-01: Base protocol
- NIP-18: Reposts (empty content for protected events)
- NIP-42: Authentication (required dependency for relay-side enforcement)
