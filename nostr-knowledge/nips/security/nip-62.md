# NIP-62: Request to Vanish

## Status
Draft / Optional

## Summary
NIP-62 defines a Nostr-native mechanism for users to request complete deletion of their data from relays. By publishing a kind `62` event, a user signals that all of their events up to a given timestamp should be permanently removed. This goes beyond NIP-09 deletion events by requesting a total purge of a pubkey's footprint, including the deletion events themselves.

## Motivation
Users may need to completely remove their presence from the Nostr network for privacy, legal, or personal reasons. NIP-09 deletion events only mark specific events for deletion and are themselves retained. NIP-62 provides a stronger "right to be forgotten" mechanism that is legally binding in some jurisdictions (e.g., GDPR's right to erasure). It ensures that even deletion records are wiped, leaving no trace of the pubkey's activity on compliant relays.

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| `62` | Request to Vanish |

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `relay` | MUST (at least one) | The relay URL to target, or `ALL_RELAYS` for a global vanish request |

### Protocol Flow

#### Targeted Relay Vanish

1. User constructs a kind `62` event with one or more `["relay", "<relay_url>"]` tags specifying which relays should delete their data.
2. The `content` field MAY contain a reason or legal notice for the relay operator.
3. The `created_at` timestamp defines the cutoff -- all events from this pubkey up to and including this timestamp MUST be deleted by the targeted relay.
4. Client sends the event to the targeted relay(s) only.
5. The relay deletes all events from the pubkey, including NIP-09 deletion events.
6. The relay ensures deleted events cannot be re-broadcast back into it.

#### Global Vanish

1. User constructs a kind `62` event with the tag `["relay", "ALL_RELAYS"]`.
2. Client broadcasts this event to as many relays as possible.
3. Every relay that receives the event MUST delete all events from the pubkey up to the `created_at` timestamp.

### JSON Examples

#### Targeted relay vanish:

```json
{
  "kind": 62,
  "pubkey": "a48380f4cfcc1ad5378294fcac36439770f9c878dd880ffa94bb74ea54a6f243",
  "created_at": 1700000000,
  "tags": [
    ["relay", "wss://relay.damus.io"]
  ],
  "content": "Please delete all my data from this relay.",
  "id": "...",
  "sig": "..."
}
```

#### Global vanish request:

```json
{
  "kind": 62,
  "pubkey": "a48380f4cfcc1ad5378294fcac36439770f9c878dd880ffa94bb74ea54a6f243",
  "created_at": 1700000000,
  "tags": [
    ["relay", "ALL_RELAYS"]
  ],
  "content": "Exercising my right to be forgotten under GDPR Article 17.",
  "id": "...",
  "sig": "..."
}
```

#### Multi-relay targeted vanish:

```json
{
  "kind": 62,
  "pubkey": "a48380f4cfcc1ad5378294fcac36439770f9c878dd880ffa94bb74ea54a6f243",
  "created_at": 1700000000,
  "tags": [
    ["relay", "wss://relay.damus.io"],
    ["relay", "wss://nos.lol"],
    ["relay", "wss://relay.snort.social"]
  ],
  "content": "Deleting my presence from these relays.",
  "id": "...",
  "sig": "..."
}
```

## Implementation Notes

1. **Irreversibility:** Publishing a kind `5` (NIP-09) deletion event against a kind `62` event has no effect. There is no "unrequest vanish" mechanism. Once sent, the vanish request is final.

2. **Temporal scope:** The vanish covers all events from the pubkey with `created_at` **up to and including** the vanish event's own `created_at`. Events published *after* the vanish event's timestamp are not affected.

3. **Re-broadcast protection:** Relays MUST not only delete events but also prevent those deleted events from being re-ingested. This likely requires maintaining a blocklist entry for the pubkey+timestamp combination.

4. **Gift Wraps (NIP-59):** Relays SHOULD also delete NIP-59 Gift Wrap events that `p`-tagged the vanishing pubkey. This ensures encrypted DMs sent *to* the user are also purged, not just events *from* the user.

5. **Paid relays:** Paid relays and access-restricted relays MUST honor vanish requests regardless of the user's subscription or authorization status. Payment does not override the right to vanish.

6. **Legal weight:** The spec explicitly notes this procedure is legally binding in some jurisdictions. Relay operators in GDPR-covered regions should treat this with the same gravity as a formal data deletion request.

7. **Propagation challenge:** For global vanish (`ALL_RELAYS`), effectiveness depends on the event reaching all relays. There is no guarantee of universal coverage since Nostr has no relay discovery mechanism built into this NIP.

## Client Behavior

- Clients SHOULD send targeted vanish events (with specific relay URLs) directly to the targeted relays only.
- Clients SHOULD broadcast global vanish events (`ALL_RELAYS`) to as many relays as possible for maximum coverage.
- Clients MUST include at least one `relay` tag in the event.
- Clients MAY include a human-readable reason or legal notice in the `content` field.
- Clients SHOULD warn users that vanish requests are irreversible.
- Clients SHOULD NOT support "unrequest vanish" functionality.

## Relay Behavior

- Relays MUST fully delete all events from the `.pubkey` if their service URL is tagged in the event.
- Relays MUST fully delete all events from the `.pubkey` if the `ALL_RELAYS` tag is present.
- Relays MUST delete events with `created_at` up to and including the vanish event's `created_at`.
- Relays MUST ensure deleted events cannot be re-broadcast back into the relay.
- Relays SHOULD delete all NIP-59 Gift Wrap events that `p`-tagged the vanishing pubkey.
- Relays MAY store the signed vanish request itself for legal/bookkeeping purposes.
- Paid relays MUST honor vanish requests regardless of user payment status.

## Dependencies

- **NIP-01** -- Core event format and relay communication.
- **NIP-09** -- Deletion events (NIP-62 supersedes NIP-09 for total account purge scenarios; NIP-09 deletions are themselves deleted by a vanish).
- **NIP-59** -- Gift Wraps (relays SHOULD delete gift wraps targeting the vanishing pubkey).

## Source Code References

- This is a relatively new NIP. Check for implementations in:
  - **nostr-tools (JS/TS):** Look for kind `62` handling or vanish-related utilities.
  - **rust-nostr:** Check `nostr` crate for kind 62 support.
  - **Relay implementations:** `strfry`, `nostr-rs-relay`, and `relay` (Go) for deletion handling.

## Related NIPs

- **NIP-09** -- Deletion events (kind `5`). NIP-62 is a stronger alternative that deletes everything including deletion events.
- **NIP-59** -- Gift Wraps. Relays should delete gift wraps addressed to the vanishing pubkey.
- **NIP-42** -- Authentication. Relays may want to verify the vanish request comes from the actual pubkey owner (though the event signature already proves this).
