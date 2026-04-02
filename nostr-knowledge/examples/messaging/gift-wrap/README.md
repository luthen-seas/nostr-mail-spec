# NIP-59: Gift Wrap

## Overview

NIP-59 defines a general-purpose mechanism for wrapping NOSTR events in layers of encryption to hide sender identity and metadata. It introduces two event kinds:

- **Seal** (kind 13): Encrypts an inner event to a specific recipient, signed by the real sender
- **Gift Wrap** (kind 1059): Encrypts the seal with a random ephemeral key, hiding the sender

NIP-59 is the foundation layer that NIP-17 (private DMs) builds upon. However, NIP-59 can wrap **any** event kind, not just DMs.

## The Three Layers

### Rumor (Unsigned Event)

A "rumor" is any NOSTR event that is intentionally left unsigned. It has all the fields of a normal event (`kind`, `content`, `pubkey`, `tags`, `created_at`) but no `id` or `sig`.

The rumor is the actual payload -- the content you want to deliver privately. By leaving it unsigned, the sender retains plausible deniability: even if the rumor leaks, nobody can cryptographically prove the sender wrote it.

### Seal (Kind 13)

The seal encrypts the rumor JSON using NIP-44, with the conversation key derived from the sender's secret key and the recipient's public key. Only the intended recipient can decrypt it.

**Key properties:**
- `kind`: 13
- `content`: NIP-44 encrypted JSON of the rumor
- `pubkey`: the real sender's pubkey
- `created_at`: randomized (not the real time)
- `tags`: always empty (no metadata leaks)
- Signed by the sender (proves authorship to the recipient)

### Gift Wrap (Kind 1059)

The gift wrap adds a metadata-hiding layer. It encrypts the seal using a **random ephemeral keypair** that is generated once and discarded. The gift wrap is the only event that gets published to relays.

**Key properties:**
- `kind`: 1059
- `content`: NIP-44 encrypted JSON of the seal (using ephemeral key)
- `pubkey`: random ephemeral pubkey (NOT the sender)
- `created_at`: randomized
- `tags`: `["p", recipientPubkey]` (the only visible metadata)
- Signed by the ephemeral key

## Why a Random Keypair?

The ephemeral keypair is the core of NIP-59's metadata protection. Without it:

```
Relay sees: "Alice sent an encrypted event to Bob"
            (because Alice's pubkey would be on the event)
```

With the ephemeral key:

```
Relay sees: "Unknown entity 7f3a... sent an encrypted event to Bob"
            (Alice's identity is hidden inside the encrypted seal)
```

The relay cannot determine who sent the message, cannot correlate it with other messages from the same sender, and cannot build a social graph of who talks to whom.

## Encryption Flow

```
Sender creates rumor (any event, unsigned)
         |
         v
Seal: encrypt(rumor, senderSk <-> recipientPk)
  - NIP-44 with sender-recipient conversation key
  - Signed by sender
         |
         v
Gift Wrap: encrypt(seal, ephemeralSk <-> recipientPk)
  - NIP-44 with ephemeral-recipient conversation key
  - Signed by ephemeral key
         |
         v
Published to relay
```

## Decryption Flow

```
Recipient receives gift wrap (kind 1059)
         |
         v
Decrypt: giftWrap.content with (recipientSk <-> giftWrap.pubkey)
  - Yields the seal (kind 13)
  - Verify seal signature
         |
         v
Decrypt: seal.content with (recipientSk <-> seal.pubkey)
  - Yields the rumor (unsigned event)
  - seal.pubkey is the real sender
         |
         v
Read the rumor content
```

## Use Cases Beyond DMs

NIP-59 is a general wrapping mechanism. Any event can be gift-wrapped:

| Use Case | Rumor Kind | Purpose |
|----------|-----------|---------|
| Private DMs (NIP-17) | 14 | End-to-end encrypted messaging |
| Private reactions | 7 | React to posts without revealing who reacted |
| Private reposts | 6 | Repost without public attribution |
| Private zap receipts | 9735 | Hide zap sender identity |
| Sealed proposals | Any | Send event proposals privately |

## Timestamp Randomization

Both the seal and the gift wrap use randomized timestamps. This prevents timing analysis attacks where an observer could correlate when events appear on relays with real-world activity patterns.

The real timestamp is preserved inside the rumor, which is encrypted and only visible to the recipient.

## Implementation Notes

1. **Ephemeral keys must be truly random**: Do not reuse ephemeral keys across messages. Each gift wrap should use a fresh keypair.

2. **Empty tags on seals**: The seal must always have empty tags. Any tags on the seal would be visible only to the recipient, but keeping them empty is a convention that prevents implementation mistakes.

3. **Verify the seal signature**: When unwrapping, always verify that the seal's signature is valid. This confirms the sender's identity.

4. **NIP-44 padding**: NIP-44 automatically pads encrypted content, preventing message length analysis even through the encryption layers.

## Running the Example

```bash
npm install nostr-tools @noble/hashes ws
npx tsx gift_wrap.ts
```

The example demonstrates the full wrap/unwrap cycle with detailed output at each layer, plus reusable helper functions.

## Related NIPs

- **NIP-17**: Private DMs built on NIP-59
- **NIP-44**: Versioned encryption used by NIP-59
- **NIP-04**: Deprecated encryption (does not use gift wrapping)
