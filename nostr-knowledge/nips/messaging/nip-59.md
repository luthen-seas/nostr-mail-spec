# NIP-59: Gift Wrap

## Status
Active

## Summary
NIP-59 defines a three-layer event wrapping protocol that hides the sender, recipient, and content of Nostr events. A plaintext event (Rumor) is sealed with the sender's key (Seal), then wrapped in a new event signed by a random ephemeral key (Gift Wrap). Each layer of encryption uses NIP-44, and the outermost event reveals nothing about who sent the inner content.

## Motivation
In standard Nostr events, the `pubkey` field reveals the author and tags reveal the recipients. Even with encrypted content (NIP-04), the metadata of who is talking to whom is fully visible. NIP-59 solves this by:
- Hiding the true sender behind an ephemeral key.
- Encrypting the content twice (seal + wrap) so even the recipient metadata is hidden from casual observers.
- Providing deniability through unsigned inner events (rumors).
- Enabling collaborative signing and private event forwarding.

## Specification

### Event Kinds
| Kind | Description |
|------|-------------|
| 13   | Seal -- encrypted rumor, signed by the real sender |
| 1059 | Gift Wrap -- encrypted seal, signed by an ephemeral key |

### Tags

#### Seal (Kind 13)
- Tags MUST always be empty (`[]`). No tags are allowed on a seal to prevent metadata leakage.

#### Gift Wrap (Kind 1059)
- `p` tag: the hex pubkey of the intended recipient (used for routing/delivery).
- Additional tags MAY be added for relay hints or other routing purposes.

### The Three Layers

#### Layer 1: Rumor (Unsigned Event)
A rumor is any Nostr event that is intentionally left unsigned (no `sig` field, or `sig` is empty/ignored). Because it lacks a valid signature, a rumor:
- Cannot be verified as authentic by third parties.
- Provides sender deniability -- the sender can plausibly deny having created it.
- Cannot be published to relays on its own (relays reject unsigned events).

The rumor contains the actual content the sender wants to transmit. It has a valid `pubkey` (the sender's real pubkey), `kind`, `content`, `tags`, `created_at`, and `id`.

#### Layer 2: Seal (Kind 13)
A seal wraps the rumor with NIP-44 encryption, signed by the sender's real key:
- `content`: the rumor JSON, encrypted with NIP-44 using the sender's private key and recipient's public key.
- `pubkey`: the sender's real public key.
- `kind`: 13
- `tags`: MUST be empty `[]`.
- `created_at`: SHOULD be randomized (tweaked) to prevent time-analysis attacks. It should not reflect the actual time of creation.
- `sig`: valid signature from the sender's key.

The seal reveals only ONE piece of metadata: who signed it (the sender). But because it is encrypted inside a gift wrap, even this is hidden from observers.

#### Layer 3: Gift Wrap (Kind 1059)
The gift wrap is the outermost layer, signed by a random one-time-use ephemeral key:
- `content`: the seal JSON, encrypted with NIP-44 using the ephemeral private key and the recipient's public key.
- `pubkey`: the ephemeral public key (random, never reused).
- `kind`: 1059
- `tags`: includes `["p", "<recipient_pubkey>"]` for routing.
- `created_at`: SHOULD be randomized (tweaked) to prevent time-analysis.
- `sig`: valid signature from the ephemeral key.

### Protocol Flow

#### Sending a Gift-Wrapped Message

```
Step 1: Create the Rumor (unsigned event)
  - Build a normal Nostr event with the desired kind, content, and tags
  - Set pubkey to the sender's real pubkey
  - Compute the event id
  - Do NOT sign it (leave sig empty or omit)

Step 2: Create the Seal (kind 13)
  - Serialize the rumor to JSON
  - Encrypt the rumor JSON using NIP-44:
      conversation_key = ECDH(sender_privkey, recipient_pubkey)
      encrypted_rumor = nip44_encrypt(conversation_key, rumor_json)
  - Create a kind 13 event:
      pubkey = sender's real pubkey
      content = encrypted_rumor
      tags = []  (MUST be empty)
      created_at = randomized timestamp
  - Sign with the sender's real private key

Step 3: Create the Gift Wrap (kind 1059)
  - Generate a new random keypair (ephemeral_privkey, ephemeral_pubkey)
  - Serialize the seal to JSON
  - Encrypt the seal JSON using NIP-44:
      conversation_key = ECDH(ephemeral_privkey, recipient_pubkey)
      encrypted_seal = nip44_encrypt(conversation_key, seal_json)
  - Create a kind 1059 event:
      pubkey = ephemeral_pubkey
      content = encrypted_seal
      tags = [["p", recipient_pubkey]]
      created_at = randomized timestamp
  - Sign with the ephemeral private key
  - Discard the ephemeral private key (never reuse)

Step 4: Publish the gift wrap to relays
```

#### Receiving a Gift-Wrapped Message

```
Step 1: Receive the kind 1059 event from a relay

Step 2: Decrypt the Gift Wrap
  - Compute conversation_key = ECDH(recipient_privkey, gift_wrap.pubkey)
  - Decrypt: seal_json = nip44_decrypt(conversation_key, gift_wrap.content)
  - Parse the seal (kind 13 event)

Step 3: Verify the Seal
  - Verify the seal's signature against seal.pubkey
  - This tells you who actually sent the message

Step 4: Decrypt the Seal
  - Compute conversation_key = ECDH(recipient_privkey, seal.pubkey)
  - Decrypt: rumor_json = nip44_decrypt(conversation_key, seal.content)
  - Parse the rumor (unsigned event)

Step 5: Process the Rumor
  - Verify that rumor.pubkey matches seal.pubkey (the sender is consistent)
  - Process the inner event according to its kind
```

### JSON Examples

#### Layer 1: Rumor (the actual message, unsigned)
```json
{
  "id": "a]b1e2f3...",
  "pubkey": "alice_real_pubkey_hex",
  "created_at": 1703000000,
  "kind": 14,
  "tags": [
    ["p", "bob_pubkey_hex"]
  ],
  "content": "Hey Bob, want to grab lunch?",
  "sig": ""
}
```
Note: The `sig` is empty -- this is intentional. The rumor is never signed.

#### Layer 2: Seal (Kind 13, signed by Alice)
```json
{
  "id": "seal_event_id_hex",
  "pubkey": "alice_real_pubkey_hex",
  "created_at": 1702900000,
  "kind": 13,
  "tags": [],
  "content": "AgKMEm1kN3Fh...base64_nip44_encrypted_rumor...",
  "sig": "alice_signature_hex"
}
```
Note: `created_at` is deliberately randomized (not the actual time). Tags are empty.

#### Layer 3: Gift Wrap (Kind 1059, signed by ephemeral key)
```json
{
  "id": "giftwrap_event_id_hex",
  "pubkey": "ephemeral_pubkey_hex_random_onetime",
  "created_at": 1702800000,
  "kind": 1059,
  "tags": [
    ["p", "bob_pubkey_hex"]
  ],
  "content": "BxYf7s2Q...base64_nip44_encrypted_seal...",
  "sig": "ephemeral_key_signature_hex"
}
```
Note: The `pubkey` is a throwaway key. `created_at` is randomized. Only the `p` tag reveals this is destined for Bob.

#### Full Layered Structure (Conceptual)
```
Gift Wrap (kind 1059) -- signed by random ephemeral key
  pubkey: ephemeral (random, one-time)
  tags: [["p", "bob"]]  -- routing only
  content: NIP-44 encrypt(ephemeral_priv, bob_pub, seal_json)
    |
    +-- Seal (kind 13) -- signed by Alice
          pubkey: alice
          tags: []  -- always empty
          content: NIP-44 encrypt(alice_priv, bob_pub, rumor_json)
            |
            +-- Rumor (kind 14) -- UNSIGNED
                  pubkey: alice
                  tags: [["p", "bob"]]
                  content: "Hey Bob, want to grab lunch?"
```

### Multi-Recipient Wrapping
For messages intended for multiple recipients (including sending a copy to yourself):
- Create ONE rumor.
- Create ONE seal (encrypted for each recipient separately -- the seal is re-encrypted per recipient using the same sender key but different recipient keys).
- Create a SEPARATE gift wrap for each recipient (each with its own ephemeral key and `p` tag).

## Implementation Notes
- The ephemeral key MUST be truly random and MUST be discarded after creating the gift wrap. Reusing ephemeral keys across different gift wraps would allow linking messages.
- Timestamp randomization is critical. If the gift wrap timestamps correlate with the sender's activity patterns, an observer could infer the sender.
- The seal `created_at` and the gift wrap `created_at` should both be randomized independently.
- Clients MUST verify that the rumor's `pubkey` matches the seal's `pubkey` to prevent a malicious relay from injecting forged rumors.

## Client Behavior
- Clients MUST use NIP-44 (latest version) for all encryption within gift wraps.
- Clients MUST generate a new random keypair for each gift wrap.
- Clients MUST randomize timestamps on both seals and gift wraps.
- Clients MUST keep seal tags empty.
- Clients SHOULD send a gift-wrapped copy to themselves (using their own pubkey in the `p` tag of a separate wrap) so they can recover sent messages.
- Clients MAY attach proof-of-work (NIP-13) to gift wraps to demonstrate legitimacy to relays.

## Relay Behavior
- Relays SHOULD guard access to `kind 1059` events based on NIP-42 AUTH.
- Relays SHOULD only serve kind 1059 events to the pubkey listed in the `p` tag.
- Relays MAY decline to store gift-wrapped events (they are opaque and could be spam).
- Relays MAY require proof-of-work on kind 1059 events.

## Dependencies
- **NIP-44** -- Versioned Encrypted Payloads (used for both seal and gift wrap encryption layers)
- **NIP-01** -- Basic protocol (event structure)
- **NIP-13** -- Proof of Work (optional, for relay acceptance)
- **NIP-42** -- Authentication (for relay access control of kind 1059)

## Source Code References
- **nostr-tools (JS)**: `nip59.ts` -- `createRumor()`, `createSeal()`, `createWrap()` functions
- **rust-nostr**: `nostr` crate, `nips/nip59.rs` -- Rumor, Seal, and GiftWrap types with encryption
- **go-nostr**: `nip59/nip59.go` -- Go implementation of the three-layer wrapping

## Related NIPs
- **NIP-44** -- Encrypted Payloads (cryptographic foundation)
- **NIP-17** -- Private Direct Messages (primary consumer of gift wrap)
- **NIP-04** -- Encrypted Direct Messages (predecessor, deprecated)
- **NIP-42** -- Authentication (relay access control)
- **NIP-13** -- Proof of Work (spam prevention for gift wraps)
