# NIP-17: Private Direct Messages

## Overview

NIP-17 defines the modern private direct message protocol for NOSTR. It replaces the deprecated NIP-04 DMs with a three-layer encryption architecture that protects both message **content** and **metadata**.

## The Three-Layer Model

NIP-17 DMs consist of three nested layers, each serving a distinct privacy purpose:

```
+-------------------------------------------------------+
|  Gift Wrap (kind 1059)                                |
|  Signed by: random ephemeral key                      |
|  Visible on relay: YES                                |
|                                                       |
|  +-----------------------------------------------+   |
|  |  Seal (kind 13)                                |   |
|  |  Signed by: sender (Alice)                     |   |
|  |  Visible on relay: NO (encrypted inside wrap)  |   |
|  |                                                |   |
|  |  +---------------------------------------+     |   |
|  |  |  Rumor (kind 14)                      |     |   |
|  |  |  Signed by: NOBODY (unsigned)         |     |   |
|  |  |  Contains: the actual DM text         |     |   |
|  |  +---------------------------------------+     |   |
|  +-----------------------------------------------+   |
+-------------------------------------------------------+
```

### Layer 1: Rumor (Kind 14)

The rumor is the actual message. It is a standard NOSTR event with kind 14, but it is **never signed** and **never published** directly.

**Why unsigned?** If the rumor were signed, anyone who obtains it (e.g., through a compromised relay or recipient) could prove cryptographically that the sender wrote it. By leaving it unsigned, the sender has plausible deniability.

**Structure:**
- `kind`: 14 (PrivateDirectMessage)
- `content`: the plaintext message
- `pubkey`: the sender's pubkey
- `tags`: `["p", recipientPubkey]` to identify the recipient
- `created_at`: real timestamp (hidden inside encryption)
- No `id`, no `sig`

### Layer 2: Seal (Kind 13)

The seal encrypts the rumor using NIP-44 so that **only the intended recipient** can decrypt it. The seal is signed by the sender, establishing authorship.

**Why a separate layer?** The seal binds the encrypted content to the sender's identity. The recipient can verify who sent the message by checking the seal's signature. However, the seal itself is hidden inside the gift wrap, so relays and eavesdroppers never see it.

**Structure:**
- `kind`: 13
- `content`: NIP-44 encrypted JSON of the rumor (encrypted with sender-to-recipient shared key)
- `pubkey`: the sender's pubkey
- `created_at`: **randomized** (prevents timing correlation)
- `tags`: `[]` (empty -- no metadata leaks)
- `id` + `sig`: signed by the sender

### Layer 3: Gift Wrap (Kind 1059)

The gift wrap encrypts the seal using a **random ephemeral keypair**, hiding the sender's identity from relays and network observers. This is the only layer that is actually published.

**Why a random key?** If the gift wrap were signed by Alice, any relay storing the event would know "Alice sent a DM to Bob." By using a random throwaway key, the relay only sees "someone sent something to Bob."

**Structure:**
- `kind`: 1059 (GiftWrap)
- `content`: NIP-44 encrypted JSON of the seal (encrypted with ephemeral-to-recipient shared key)
- `pubkey`: random ephemeral pubkey (NOT the sender)
- `created_at`: **randomized** (prevents timing correlation)
- `tags`: `["p", recipientPubkey]` -- the only visible metadata
- `id` + `sig`: signed by the ephemeral key

## Why Each Layer Exists

| Threat | Without NIP-17 | With NIP-17 |
|--------|---------------|-------------|
| Relay reads message content | Plaintext in NIP-04 | Double-encrypted (NIP-44) |
| Relay sees sender identity | Sender pubkey on event | Random ephemeral pubkey |
| Relay correlates timing | Real timestamp visible | Timestamps randomized |
| Message length analysis | Unpadded content | NIP-44 pads all messages |
| Recipient proves sender wrote it | Signed content | Rumor is unsigned (deniability) |
| Sender loses sent message history | N/A | Sender gets their own gift-wrapped copy |

## Metadata Protection

NIP-17 is specifically designed to minimize metadata leakage:

1. **Sender privacy**: The gift wrap's pubkey is a random ephemeral key. Relays cannot determine who sent the DM.

2. **Timing privacy**: Both the seal and the gift wrap use randomized `created_at` timestamps. An observer cannot correlate when the message was actually written.

3. **Content privacy**: The message is encrypted twice -- once in the seal (sender-to-recipient) and once in the gift wrap (ephemeral-to-recipient).

4. **Length privacy**: NIP-44 pads all encrypted payloads, preventing message length analysis.

5. **Relationship privacy**: Without decrypting, an observer can only see that *someone* sent *something* to a recipient. They cannot determine conversation patterns between specific parties.

## DM Relay Discovery (Kind 10050)

Recipients can publish a kind 10050 event listing their preferred DM relays. Senders should look up this list and publish gift wraps to those relays:

```json
{
  "kind": 10050,
  "tags": [
    ["relay", "wss://relay.damus.io"],
    ["relay", "wss://nos.lol"]
  ],
  "content": ""
}
```

## Comparison with NIP-04 (Deprecated)

| Feature | NIP-04 (Deprecated) | NIP-17 (Current) |
|---------|---------------------|-------------------|
| Encryption | AES-256-CBC (weak) | NIP-44 / ChaCha20 + HMAC |
| Sender visible? | Yes (pubkey on event) | No (ephemeral key) |
| Timestamp real? | Yes | Randomized |
| Message padding? | No | Yes (NIP-44) |
| Deniability? | No (signed content) | Yes (unsigned rumor) |
| Sent message copy? | No | Yes (self-wrapped copy) |
| Group DMs? | No | Yes (wrap to multiple recipients) |

## Related NIPs

- **NIP-44**: Versioned encryption (ChaCha20-Poly1305 + HMAC-SHA256 + padding)
- **NIP-59**: Gift wrapping specification (the seal + wrap layers)
- **NIP-04**: Deprecated DM encryption (replaced by NIP-17)

## Running the Example

```bash
npm install nostr-tools @noble/hashes ws
npx tsx encrypted_dm.ts
```

The example walks through every layer with detailed console output showing the exact JSON at each step.
