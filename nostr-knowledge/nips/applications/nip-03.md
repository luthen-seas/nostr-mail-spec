# NIP-03: OpenTimestamps Attestations for Events

## Status
Draft / Optional

## Summary
NIP-03 defines a mechanism for creating verifiable timestamp proofs for NOSTR events using the OpenTimestamps protocol. A dedicated event kind (1040) carries a base64-encoded `.ots` file that cryptographically attests to the existence of another event at a specific point in time, anchored to the Bitcoin blockchain.

## Motivation
NOSTR events carry a `created_at` field, but this timestamp is self-reported by the author and trivially forgeable. There is no built-in way to prove that an event existed before a certain point in time. OpenTimestamps solves this by creating a chain of cryptographic commitments that ultimately anchor to a Bitcoin block, providing an immutable, decentralized proof of existence. This is useful for legal documents, intellectual property claims, prediction markets, and any scenario where provable temporal ordering matters.

## Specification

### Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 1040 | OTS Attestation | Carries an OpenTimestamps proof for a referenced event |

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `e` | Yes | The event ID being timestamped, with an optional relay URL hint |
| `k` | Yes | The kind number of the target event (as a string) |

### Protocol Flow

1. **Author creates an event** -- any standard NOSTR event with a valid `id`.
2. **Timestamper submits the event ID** to one or more OpenTimestamps calendar servers, which return a pending attestation.
3. **Calendar server aggregates** the digest into a Merkle tree and commits the root to a Bitcoin transaction.
4. **Once confirmed on-chain**, the timestamper upgrades the pending attestation to a complete `.ots` proof containing at least one Bitcoin attestation.
5. **Timestamper publishes a kind 1040 event** with the base64-encoded `.ots` file as `content`, referencing the original event via the `e` tag.
6. **Verifiers** retrieve the kind 1040 event, decode the content, and validate the OTS proof against the Bitcoin blockchain to confirm the referenced event existed at or before the attested block.

### JSON Examples

**OTS Attestation Event:**
```json
{
  "kind": 1040,
  "tags": [
    ["e", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", "wss://relay.example.com"],
    ["k", "1"]
  ],
  "content": "AE9wZW5UaW1lc3RhbXBzAABQcm9vZgC/iQA...<base64-encoded .ots file data>...",
  "created_at": 1234567890,
  "pubkey": "<pubkey-hex>",
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Verification workflow (command line):**
```bash
# Fetch the target event and the OTS attestation
nak req -i <event-id> wss://relay.example.com | jq -r .id
nak req -k 1040 --e <event-id> wss://relay.example.com | jq -r .content | base64 -d > proof.ots

# Verify using the ots CLI tool
ots verify proof.ots
# Output: "Success! Bitcoin block 810391 attests existence as of 2023-09-12"
```

## Implementation Notes

- The `content` field MUST be the full content of an `.ots` file, base64-encoded.
- The `.ots` proof MUST prove the referenced `e` tag event ID as its digest (the event ID is the hash being timestamped).
- The `.ots` file SHOULD contain a **single** Bitcoin attestation. Multiple Bitcoin attestations are unnecessary since one is sufficient proof.
- Pending attestations (those not yet confirmed on the Bitcoin blockchain) SHOULD be excluded because they provide no verifiable proof.
- The `k` tag allows clients to filter OTS attestations by the kind of the original event without fetching it first.
- OTS proofs are only as reliable as the Bitcoin blockchain -- reorgs affecting the attestation block (extremely unlikely for deeply confirmed blocks) would invalidate the proof.
- Anyone can create an OTS attestation for any event; the attestation does not imply authorship.

## Client Behavior

- Clients MAY display a "verified timestamp" badge on events that have a valid kind 1040 attestation.
- Clients SHOULD verify the OTS proof against the Bitcoin blockchain before displaying it as valid.
- Clients SHOULD check that the `e` tag in the kind 1040 event matches the event being displayed.
- Clients MAY allow users to create OTS attestations for their own events or for events they want to timestamp.
- Clients SHOULD treat the OTS timestamp as a "existed no later than" proof, not an exact creation time.

## Relay Behavior

- Relays SHOULD accept and serve kind 1040 events like any other event.
- Relays MAY choose to validate the `e` tag references a real event they have stored.
- No special relay behavior is required by this NIP.

## Dependencies

- [OpenTimestamps Protocol](https://opentimestamps.org/) -- the underlying timestamping system
- Bitcoin blockchain -- provides the immutable anchor for proofs
- NIP-01 -- basic event structure and `e` tags

## Source Code References

- **nostr-tools**: No dedicated NIP-03 module; OTS proof handling is typically done application-side with the `opentimestamps` JavaScript library.
- **rust-nostr**: Check `crates/nostr/src/event/kind.rs` for kind 1040 definition.
- **ots-cli**: The `ots` command-line tool (Python) for creating and verifying proofs.

## Related NIPs

- **NIP-01** -- Basic protocol flow and event structure
- **NIP-10** -- Event tagging conventions (for the `e` tag)
