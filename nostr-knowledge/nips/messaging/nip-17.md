# NIP-17: Private Direct Messages

## Status
Active

## Summary
NIP-17 defines the modern private direct messaging standard for Nostr. Messages are kind 14 events (unsigned rumors) that are sealed with NIP-44 encryption and then gift-wrapped with NIP-59, producing kind 1059 events that reveal nothing about the sender, content, or timing to outside observers. It replaces the deprecated NIP-04 and also supports encrypted file sharing (kind 15) and group chats.

## Motivation
NIP-04 encrypted direct messages leaked critical metadata: who was talking to whom and when. Even with content encryption, this metadata leakage allowed building social graphs and tracking communication patterns. NIP-17 solves this by combining three layers of protection:
1. **Deniability** -- messages are unsigned (rumors), so they cannot be cryptographically proven to have been authored by the sender.
2. **Sender hiding** -- the outer event is signed by a random ephemeral key, not the sender.
3. **Timing obfuscation** -- timestamps are randomized at each layer.
4. **Authenticated encryption** -- NIP-44 provides proper encrypt-then-MAC security.

## Specification

### Event Kinds
| Kind  | Description |
|-------|-------------|
| 14    | Private direct message (the rumor -- inner content) |
| 15    | Encrypted file message (the rumor -- file sharing) |
| 13    | Seal (NIP-59 -- intermediate encrypted layer) |
| 1059  | Gift Wrap (NIP-59 -- outer routing layer) |
| 10050 | Relay list for DMs (user's preferred DM relays) |

### Tags

#### Kind 14 (Direct Message Rumor)
| Tag | Description |
|-----|-------------|
| `p`       | Hex pubkey of each recipient (one tag per recipient) |
| `e`       | (Optional) Event ID of a previous message being replied to, with relay hint and marker |
| `subject` | (Optional) Subject line for the conversation |

#### Kind 15 (File Message Rumor)
| Tag | Description |
|-----|-------------|
| `p`         | Hex pubkey of each recipient |
| `file`      | URL to the encrypted file |
| `encryption-algorithm` | Encryption algorithm used (e.g., `aes-gcm`) |
| `decryption-key` | Key to decrypt the file |
| `decryption-nonce` | Nonce used for file decryption |
| `x`         | SHA-256 hash of the original (unencrypted) file |
| `m`         | MIME type of the file |
| `size`      | File size in bytes |
| `thumb`     | (Optional) URL to an encrypted thumbnail |
| `blurhash`  | (Optional) Blurhash preview string |

#### Kind 10050 (DM Relay List)
| Tag | Description |
|-----|-------------|
| `relay` | URI of a relay preferred for receiving DMs |

### Protocol Flow

#### Sending a Direct Message

```
Alice wants to send "Hello Bob!" to Bob.

Step 1: Create the Rumor (Kind 14, unsigned)
  {
    pubkey: alice_pubkey,
    kind: 14,
    content: "Hello Bob!",
    tags: [["p", bob_pubkey]],
    created_at: <actual timestamp>,
    id: <computed hash>,
    sig: ""  // NOT SIGNED
  }

Step 2: Look up Bob's DM relays
  - Query for Bob's kind 10050 event to find his preferred DM relays
  - Fall back to Bob's kind 10002 relay list if no 10050 exists

Step 3: Seal the Rumor (Kind 13, NIP-59)
  - Encrypt the rumor JSON with NIP-44 using Alice's privkey + Bob's pubkey
  - Create kind 13 event signed by Alice with randomized timestamp
  - Tags MUST be empty

Step 4: Gift Wrap the Seal (Kind 1059, NIP-59)
  FOR EACH recipient (Bob) AND for Alice herself:
    - Generate a fresh ephemeral keypair
    - Encrypt the seal JSON with NIP-44 using ephemeral privkey + recipient pubkey
    - Create kind 1059 event signed by ephemeral key with randomized timestamp
    - Add ["p", recipient_pubkey] tag for routing
    - Publish to the recipient's preferred DM relays

Step 5: Publish
  - Send Bob's gift wrap to Bob's DM relays (from kind 10050)
  - Send Alice's copy (gift-wrapped to herself) to Alice's DM relays
```

#### Receiving a Direct Message

```
Bob receives a kind 1059 event from a relay.

Step 1: Decrypt the Gift Wrap
  - conversation_key = ECDH(bob_privkey, giftwrap.pubkey)
  - seal_json = NIP-44 decrypt(conversation_key, giftwrap.content)

Step 2: Verify and Decrypt the Seal
  - Verify the seal (kind 13) signature
  - conversation_key = ECDH(bob_privkey, seal.pubkey)
  - rumor_json = NIP-44 decrypt(conversation_key, seal.content)

Step 3: Process the Rumor
  - Parse the kind 14 event
  - Verify rumor.pubkey matches seal.pubkey (sender consistency)
  - The content field is the plaintext message
  - The p tags identify all participants in the conversation
```

#### Chat Room Identification
A chat room (conversation) is uniquely identified by the combination of:
- The sender's pubkey (from the rumor/seal)
- All `p` tags in the rumor (the recipients)

If a new `p` tag is added or a current one is removed, a new room is created with a clean message history. This means group DM rooms are implicitly defined by their participant set.

### JSON Examples

#### Complete Layered Example: Alice sends "Hello Bob!" to Bob

**Layer 1: Rumor (Kind 14 -- the actual message, UNSIGNED)**
```json
{
  "id": "d17fe15d7fda24e9b6b7d0b9db7a1dadc8b6da47b1e8d8e3f4a1f7d8b3e2c1a0",
  "pubkey": "a]1b2c3d4e5f...alice_real_pubkey...64hex_chars",
  "created_at": 1711900000,
  "kind": 14,
  "tags": [
    ["p", "b1c2d3e4f5...bob_pubkey...64hex_chars", "wss://bob-relay.example.com"],
    ["e", "previous_msg_id_hex", "wss://relay.example.com", "reply"]
  ],
  "content": "Hello Bob!",
  "sig": ""
}
```

**Layer 2: Seal (Kind 13 -- encrypted rumor, signed by Alice)**
```json
{
  "id": "seal_id_28a8f2e...",
  "pubkey": "a]1b2c3d4e5f...alice_real_pubkey...64hex_chars",
  "created_at": 1711800000,
  "kind": 13,
  "tags": [],
  "content": "AcS4e9q3...NIP-44 encrypted rumor JSON...base64==",
  "sig": "alice_sig_hex_128chars..."
}
```

**Layer 3: Gift Wrap to Bob (Kind 1059 -- encrypted seal, signed by ephemeral key)**
```json
{
  "id": "wrap_id_for_bob_7f3...",
  "pubkey": "ephemeral_random_pubkey_for_bob_64hex",
  "created_at": 1711700000,
  "kind": 1059,
  "tags": [
    ["p", "b1c2d3e4f5...bob_pubkey...64hex_chars"]
  ],
  "content": "Ag7S2x...NIP-44 encrypted seal JSON...base64==",
  "sig": "ephemeral_sig_hex_128chars..."
}
```

**Layer 3 (copy): Gift Wrap to Alice herself (so she can recover her sent messages)**
```json
{
  "id": "wrap_id_for_alice_a]9c...",
  "pubkey": "different_ephemeral_pubkey_for_alice_64hex",
  "created_at": 1711650000,
  "kind": 1059,
  "tags": [
    ["p", "a]1b2c3d4e5f...alice_real_pubkey...64hex_chars"]
  ],
  "content": "BxYf7s...NIP-44 encrypted seal JSON (re-encrypted for Alice)...base64==",
  "sig": "another_ephemeral_sig_hex..."
}
```

#### DM Relay List (Kind 10050)
```json
{
  "id": "relay_list_id_hex",
  "pubkey": "bob_pubkey_hex",
  "created_at": 1711000000,
  "kind": 10050,
  "tags": [
    ["relay", "wss://inbox.nostr.wine"],
    ["relay", "wss://bobs-private-relay.example.com"]
  ],
  "content": "",
  "sig": "bob_sig_hex"
}
```

#### Group DM Example (Alice sends to Bob and Carol)
The rumor includes multiple `p` tags:
```json
{
  "id": "group_rumor_id_hex",
  "pubkey": "alice_pubkey_hex",
  "created_at": 1711900000,
  "kind": 14,
  "tags": [
    ["p", "bob_pubkey_hex"],
    ["p", "carol_pubkey_hex"]
  ],
  "content": "Hey team, meeting at 3pm?",
  "sig": ""
}
```
This rumor is sealed once, then gift-wrapped THREE times: once for Bob, once for Carol, and once for Alice herself. Each gift wrap uses a unique ephemeral key.

#### Encrypted File Sharing (Kind 15)
```json
{
  "id": "file_rumor_id_hex",
  "pubkey": "alice_pubkey_hex",
  "created_at": 1711900000,
  "kind": 15,
  "tags": [
    ["p", "bob_pubkey_hex"],
    ["file", "https://files.example.com/encrypted/abc123.enc"],
    ["encryption-algorithm", "aes-gcm"],
    ["decryption-key", "hex_encoded_aes_key"],
    ["decryption-nonce", "hex_encoded_nonce"],
    ["x", "sha256_hash_of_original_file"],
    ["m", "image/jpeg"],
    ["size", "2048576"],
    ["blurhash", "LEHV6nWB2yk8pyo0adR*.7kCMdnj"]
  ],
  "content": "",
  "sig": ""
}
```

## Implementation Notes

### Conversation Key Symmetry
NIP-44 ECDH is symmetric: `ECDH(alice_priv, bob_pub) == ECDH(bob_priv, alice_pub)`. This means the conversation key for the seal layer is the same regardless of which party computes it.

### Timestamp Randomization
Both the seal and gift wrap `created_at` values MUST be randomized. A common approach is to add or subtract a random value of up to 2 days from the current time. The rumor's `created_at` should reflect the actual time for proper message ordering.

### Self-Delivery
The sender MUST create a separate gift wrap addressed to themselves (with their own pubkey in the `p` tag). Without this, sent messages cannot be recovered from relays. The self-addressed wrap uses a different ephemeral key and is re-encrypted for the sender's public key.

### Group Chat Scalability
The spec recommends that group chats with more than 100 participants use a different messaging scheme (such as NIP-29 relay-based groups or NIP-EE MLS). Beyond 100 participants, the cost of creating individual gift wraps for each recipient becomes prohibitive.

### Content Format
The `content` field of kind 14 events MUST be plain text. Do not use NIP-27 mentions or other formatted content -- use tags for structured data.

## Client Behavior
- Clients MUST encrypt all direct messages using the NIP-17 flow (rumor -> seal -> gift wrap).
- Clients MUST use NIP-44 latest version for encryption at both layers.
- Clients MUST send a gift-wrapped copy to the sender's own relays.
- Clients MUST look up recipient DM relays via kind 10050, falling back to kind 10002.
- Clients MUST identify conversations by the set of `p` tags (plus sender pubkey).
- Clients SHOULD publish a kind 10050 event listing their preferred DM relays.
- Clients SHOULD support kind 15 for encrypted file sharing.
- Clients MAY implement disappearing messages (configurable per-conversation).
- Clients MUST NOT sign the kind 14 rumor.

## Relay Behavior
- Relays SHOULD protect kind 1059 events by only serving them to the pubkey in the `p` tag (requires NIP-42 AUTH).
- Relays MAY rate-limit kind 1059 events to prevent spam.
- Relays MAY require proof-of-work (NIP-13) on kind 1059 events.
- Relays MUST NOT inspect or attempt to decrypt gift-wrapped content.

## Dependencies
- **NIP-44** -- Versioned Encrypted Payloads (encryption at both seal and wrap layers)
- **NIP-59** -- Gift Wrap (the three-layer wrapping protocol)
- **NIP-01** -- Basic protocol (event structure)
- **NIP-10** -- Reply threading (for `e` tag conventions in kind 14)
- **NIP-42** -- Authentication (for relay access control of kind 1059)

## Source Code References
- **nostr-tools (JS)**: `nip17.ts` -- high-level DM send/receive; uses `nip44.ts` and `nip59.ts` internally
- **rust-nostr**: `nostr` crate, `nips/nip17.rs` -- DM construction; depends on `nip44.rs` and `nip59.rs`
- **go-nostr**: `nip17/` or integrated into `nip59/` -- Go implementation

## Related NIPs
- **NIP-04** -- Encrypted Direct Messages (deprecated predecessor)
- **NIP-44** -- Encrypted Payloads (cryptographic foundation)
- **NIP-59** -- Gift Wrap (wrapping protocol)
- **NIP-42** -- Authentication (relay access control)
- **NIP-10** -- Reply threading conventions
- **NIP-C7** -- Chats (lightweight chat messages, kind 9)
