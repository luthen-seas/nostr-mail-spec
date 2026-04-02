# NIP-EE: E2EE Messaging using MLS Protocol

## Status
Unrecommended (DEPRECATED -- superseded by the [Marmot Protocol](https://github.com/marmot-protocol/marmot))

## Summary
NIP-EE adapted the Messaging Layer Security (MLS) protocol (RFC 9420) for use with Nostr to provide end-to-end encrypted direct and group messaging with forward secrecy and post-compromise security. It defined how Nostr relays serve as the Authentication Service and Delivery Service for MLS, using ephemeral keypairs for metadata obfuscation and NIP-44 for outer-layer encryption of group messages. It has been deprecated in favor of the Marmot Protocol, which takes a different approach to the same goals.

## Why NIP-EE Is Deprecated
NIP-EE was marked `unrecommended` and superseded by the Marmot Protocol. The Marmot Protocol provides an alternative architecture for E2EE group messaging on Nostr that addresses some of the practical challenges encountered with the MLS-on-Nostr approach, including:
- **Complexity**: MLS is a sophisticated protocol requiring significant client-side state management (ratchet trees, epoch tracking, credential management). This complexity proved difficult to implement correctly across diverse Nostr clients.
- **Commit ordering**: MLS requires strict ordering of Commit messages for epoch advancement. Nostr's decentralized relay architecture makes deterministic ordering challenging, leading to frequent group state forks.
- **Large group welcomes**: Welcome messages for groups above approximately 150 members exceed Nostr's maximum event size, as they must contain the full ratchet tree state.
- **Multi-device complexity**: Each device/client pair is a separate MLS member, complicating user experience and group management.

The Marmot Protocol aims to solve the same goals (forward secrecy, post-compromise security, private group messaging) with an architecture better suited to Nostr's decentralized, eventually-consistent nature.

## Motivation
NIP-04 had no metadata protection and weak encryption. NIP-17 (via NIP-44 + NIP-59) solved metadata leakage but lacked:
1. **Forward secrecy** -- if a key is compromised, all past messages are readable.
2. **Post-compromise security** -- a compromised key allows reading all future messages indefinitely.
3. **Efficient group messaging** -- NIP-17 requires O(n) gift wraps per message for n participants.
4. **Multi-device support** -- NIP-17 has no mechanism for syncing across devices.

MLS addresses all four: it provides forward secrecy through key ratcheting, post-compromise security through regular key rotation, O(log n) group operations via its tree structure, and explicit multi-device support through separate LeafNode entries per device.

## Specification

### Event Kinds
| Kind  | Description |
|-------|-------------|
| 443   | KeyPackage Event (user's public MLS credential for async group invitations) |
| 444   | Welcome Event (sent via NIP-59 gift wrap to invite a user to a group) |
| 445   | Group Event (all group messages: control messages and application messages) |
| 10051 | KeyPackage Relays List (user's preferred relays for KeyPackage publication) |

### Tags

#### Kind 443 (KeyPackage Event)
| Tag | Description |
|-----|-------------|
| `mls_protocol_version` | MLS protocol version (currently `1.0`) |
| `ciphersuite` | MLS CipherSuite ID value (e.g., `0x0001`) |
| `extensions` | Array of supported MLS Extension ID values |
| `client` | (Optional) Client name, handler event ID, optional relay URL |
| `relays` | Array of relay URLs where this KeyPackage is published |
| `-` | (Optional) NIP-70 protected event marker |

#### Kind 444 (Welcome Event -- unsigned, gift-wrapped)
| Tag | Description |
|-----|-------------|
| `e` | ID of the KeyPackage Event used to add the user |
| `relays` | Array of relay URLs for group events |

#### Kind 445 (Group Event)
| Tag | Description |
|-----|-------------|
| `h` | Nostr group ID (from the Nostr Group Data Extension, NOT the MLS group ID) |

#### Kind 10051 (KeyPackage Relays List)
| Tag | Description |
|-----|-------------|
| `relay` | URI of a relay for KeyPackage publication |

### Core MLS Concepts (as applied to Nostr)

#### Groups
- Created with a random 32-byte MLS group ID (kept private, never published to relays).
- A separate `nostr_group_id` is used in `h` tags for relay routing (can be rotated).
- Groups evolve through Proposals and Commits, advancing through epochs.

#### Credentials
- MLS `BasicCredential` type with `identity` set to the user's 32-byte hex Nostr pubkey.
- Each credential has an associated signing key that MUST differ from the Nostr identity key.
- Signing keys SHOULD be rotated regularly for post-compromise security.

#### Nostr Group Data Extension (Required MLS Extension)
Stores Nostr-specific data within the MLS group state:
- `nostr_group_id`: The 32-byte ID used in `h` tags (can be rotated by admins).
- `name`: Group display name.
- `description`: Group description.
- `admin_pubkeys`: Array of Nostr pubkeys authorized for group management.
- `relays`: Array of relay URLs for the group.

### Protocol Flow

#### Publishing a KeyPackage (Making yourself reachable)
1. Generate a new signing keypair (separate from your Nostr identity key).
2. Create an MLS KeyPackage with your Nostr pubkey as the credential identity.
3. Include the `last_resort` extension so the KeyPackage can be reused for multiple invitations.
4. Publish a kind 443 event with the serialized KeyPackage in `content` and metadata in tags.
5. Sign with your Nostr identity key.

#### Creating a Group
1. Generate a random 32-byte MLS group ID (keep private).
2. Generate a `nostr_group_id` for relay routing.
3. Create the MLS group with required extensions: `required_capabilities`, `ratchet_tree`, `nostr_group_data`.
4. Set initial group data (name, description, admin pubkeys, relays).

#### Inviting a Member
1. Fetch the target user's kind 443 KeyPackage event from their relays.
2. Create an MLS `Add` Proposal and `Commit` using the KeyPackage.
3. Publish the Commit as a kind 445 Group Event.
4. Wait for relay acknowledgement.
5. Create a kind 444 Welcome Event containing the MLS Welcome message.
6. Gift-wrap the Welcome (NIP-59) and send to the invited user's relays.

#### Sending a Group Message
1. Create an unsigned Nostr event (e.g., kind 9 chat message) as the application content.
2. Encrypt and frame it as an MLS Application message.
3. Serialize the MLSMessage.
4. Encrypt the serialized message with NIP-44 using a keypair derived from the MLS `exporter_secret`:
   - Private key = the 32-byte `exporter_secret` (labeled `nostr`, 32 bytes).
   - Public key = the corresponding secp256k1 public key.
5. Generate a new ephemeral Nostr keypair for the outer event.
6. Publish a kind 445 event signed by the ephemeral key.

#### Receiving a Group Message
1. Receive a kind 445 event.
2. Decrypt the NIP-44 layer using the `exporter_secret`-derived keypair.
3. Deserialize the MLSMessage.
4. If it is an Application message, decrypt with MLS to get the inner unsigned Nostr event.
5. Verify the inner event's `pubkey` matches the MLS member who sent it.
6. If it is a Commit message, apply it to advance the group epoch and derive a new `exporter_secret`.

#### Handling Commit Conflicts
When multiple Commits target the same epoch:
1. Apply the Commit with the lowest `created_at` timestamp on the kind 445 event.
2. If timestamps are identical, apply the Commit with the lowest event `id` (lexicographic).
3. Discard the other Commit(s).
4. Clients SHOULD retain previous group state temporarily to recover from forks.

### JSON Examples

#### KeyPackage Event (Kind 443)
```json
{
  "id": "keypackage_event_id_hex",
  "kind": 443,
  "created_at": 1711900000,
  "pubkey": "user_nostr_identity_pubkey_hex",
  "content": "hex_encoded_serialized_mls_keypackage_bundle",
  "tags": [
    ["mls_protocol_version", "1.0"],
    ["ciphersuite", "0x0001"],
    ["extensions", "0x0001", "0x0002", "0xF001"],
    ["client", "Primal", "handler_event_id_hex", "wss://relay.primal.net"],
    ["relays", "wss://inbox.nostr.wine", "wss://myrelay.example.com"],
    ["-"]
  ],
  "sig": "user_identity_sig_hex"
}
```

#### KeyPackage Relays List (Kind 10051)
```json
{
  "kind": 10051,
  "pubkey": "user_pubkey_hex",
  "created_at": 1711900000,
  "tags": [
    ["relay", "wss://inbox.nostr.wine"],
    ["relay", "wss://myrelay.nostr1.com"]
  ],
  "content": "",
  "sig": "user_sig_hex"
}
```

#### Welcome Event (Kind 444, unsigned -- to be gift-wrapped)
```json
{
  "id": "welcome_event_id_hex",
  "kind": 444,
  "created_at": 1711910000,
  "pubkey": "inviter_nostr_pubkey_hex",
  "content": "serialized_mls_welcome_message",
  "tags": [
    ["e", "keypackage_event_id_used_hex"],
    ["relays", "wss://group-relay1.example.com", "wss://group-relay2.example.com"]
  ],
  "sig": ""
}
```
Note: This event is NOT signed. It is sealed and gift-wrapped per NIP-59 before publishing.

#### Group Event (Kind 445)
```json
{
  "id": "group_event_id_hex",
  "kind": 445,
  "created_at": 1711920000,
  "pubkey": "ephemeral_sender_pubkey_hex",
  "content": "NIP44_encrypted_serialized_MLSMessage_base64",
  "tags": [
    ["h", "nostr_group_id_32byte_hex"]
  ],
  "sig": "ephemeral_key_sig_hex"
}
```

#### Inner Application Message (unsigned Nostr event inside MLS)
```json
{
  "id": "inner_msg_id_hex",
  "kind": 9,
  "created_at": 1711920000,
  "pubkey": "sender_nostr_identity_pubkey_hex",
  "content": "Hey everyone, meeting at 3pm today!",
  "tags": [],
  "sig": ""
}
```
Note: This inner event MUST be unsigned and MUST NOT contain `h` tags or any group-identifying information.

### Encryption Layers (Group Event)
```
Layer 1: Application content
  Unsigned kind 9 Nostr event (plaintext message)
    |
    v
Layer 2: MLS encryption
  MLS Application message (encrypted with group epoch keys, provides
  forward secrecy and post-compromise security)
    |
    v
Layer 3: NIP-44 encryption
  Encrypted using exporter_secret-derived keypair
  (prevents relays from seeing even the MLS framing)
    |
    v
Layer 4: Ephemeral Nostr event
  Kind 445, signed by random one-time keypair
  (hides sender identity from relay observers)
```

## Implementation Notes

### Exporter Secret Key Derivation
The NIP-44 encryption of kind 445 content uses a special key derivation:
- Generate a 32-byte `exporter_secret` from MLS with label `"nostr"`.
- Treat this as a secp256k1 private key.
- Compute the corresponding public key.
- Use `nip44_encrypt(exporter_secret_privkey, exporter_secret_pubkey, mls_message)`.
- This key rotates every epoch (every Commit), providing additional forward secrecy.

### Signing Key vs Identity Key
The MLS signing key MUST be different from the Nostr identity key. Compromising the MLS signing key does not compromise the Nostr identity. Regular rotation of the signing key (via MLS Proposal + Commit) strengthens post-compromise security.

### Last Resort KeyPackages
Using the `last_resort` MLS extension allows a single KeyPackage to be consumed by multiple group invitations, reducing race conditions. However, clients MUST immediately rotate their signing key after joining a group via a last-resort KeyPackage.

### Device/Client Independence
Each device/client is a separate MLS member (LeafNode). A user on two devices appears as two group members. There is no cross-device state sharing within MLS itself.

## Client Behavior
- Clients MUST publish at least one kind 443 KeyPackage event to be reachable.
- Clients MUST use `BasicCredential` with the Nostr hex pubkey as identity.
- Clients MUST use a signing key different from their Nostr identity key.
- Clients MUST rotate signing keys regularly within each group.
- Clients MUST use a new ephemeral Nostr keypair for each kind 445 event.
- Clients MUST encrypt kind 445 content with NIP-44 using the exporter secret.
- Clients MUST gift-wrap kind 444 Welcome events per NIP-59.
- Clients MUST verify inner application message pubkeys match MLS member identity.
- Clients MUST NOT sign inner application messages (they must remain unsigned).
- Clients MUST NOT include group-identifying tags in inner application messages.
- Clients SHOULD use the `last_resort` extension on KeyPackages.
- Clients SHOULD delete consumed KeyPackage events from relays.
- Clients SHOULD encrypt group state at rest on the device.
- Clients SHOULD support and encourage self-destructing messages.

## Relay Behavior
- Relays store and serve kinds 443, 445, and 10051 events.
- Relays handle kind 1059 (gift-wrapped Welcome events) per NIP-59 relay behavior.
- Relays have no knowledge of group membership or message content.
- Kind 445 events are published ephemerally -- relays may or may not retain them long-term.

## Dependencies
- **MLS Protocol** (RFC 9420) -- the core end-to-end encryption protocol
- **NIP-44** -- Versioned Encrypted Payloads (outer encryption layer for kind 445 events)
- **NIP-59** -- Gift Wrap (used for delivering Welcome events privately)
- **NIP-01** -- Basic protocol (event structure)
- **NIP-70** -- Protected Events (optional, for KeyPackage authenticity)
- **OpenMLS** -- Reference MLS implementation library

## Source Code References
- **rust-nostr**: `nostr-mls` crate -- `extension.rs` (Nostr Group Data Extension), MLS integration
- **OpenMLS**: `https://github.com/openmls/openmls` -- MLS protocol implementation
- **Marmot Protocol**: `https://github.com/marmot-protocol/marmot` -- the successor protocol

## Related NIPs
- **NIP-04** -- Encrypted Direct Messages (original, deprecated)
- **NIP-17** -- Private Direct Messages (current standard for 1:1 and small groups)
- **NIP-44** -- Encrypted Payloads (used for outer encryption)
- **NIP-59** -- Gift Wrap (used for Welcome delivery)
- **NIP-29** -- Relay-based Groups (relay-enforced groups, complementary approach)
- **NIP-C7** -- Chats (kind 9 used as inner application messages)
- **NIP-70** -- Protected Events (KeyPackage protection)
