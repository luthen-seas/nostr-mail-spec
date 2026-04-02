# Encryption & Privacy — NOSTR Mail's Three-Layer Encryption Model

> **How NIP-44, NIP-59 Gift Wrap, and ephemeral keys provide content encryption, metadata hiding, and deniability — things email has never achieved.**

---

## Table of Contents

- [The Problem with Email Encryption](#the-problem-with-email-encryption)
- [NOSTR Mail Encryption Architecture](#nostr-mail-encryption-architecture)
- [Layer 1: The Rumor (Kind 15)](#layer-1-the-rumor-kind-15)
- [Layer 2: The Seal (Kind 13)](#layer-2-the-seal-kind-13)
- [Layer 3: The Gift Wrap (Kind 1059)](#layer-3-the-gift-wrap-kind-1059)
- [NIP-44 Encryption Deep Dive](#nip-44-encryption-deep-dive)
- [What the Relay Sees](#what-the-relay-sees)
- [What an Attacker Sees](#what-an-attacker-sees)
- [Multi-Recipient Privacy](#multi-recipient-privacy)
- [Deniability](#deniability)
- [Comparison: PGP vs S/MIME vs NOSTR Mail](#comparison-pgp-vs-smime-vs-nostr-mail)
- [Limitations & Threat Model](#limitations--threat-model)
- [Forward Secrecy Discussion](#forward-secrecy-discussion)

---

## The Problem with Email Encryption

Email has two encryption failures:

### 1. Content Encryption Failed

- **PGP** (1991): 30+ years, still <1% adoption. Key management is incomprehensible to users. Web of Trust is effectively dead. The 2018 Efail attack demonstrated fundamental vulnerabilities.
- **S/MIME** (1999): Requires Certificate Authorities and corporate PKI. Consumer adoption is near zero. Key distribution depends on centralized trust.
- **Autocrypt** (2017): The most promising approach (automatic key exchange via headers), but still marginal adoption. Deliberately trades security for usability.

### 2. Metadata Is Always Exposed

Even with perfect PGP or S/MIME encryption:
- **Sender address** visible to every MTA in the chain
- **Recipient address** visible to every MTA in the chain
- **Subject line** visible (not encrypted by PGP/S/MIME convention)
- **Timestamps** visible and accurate
- **IP addresses** in `Received:` headers reveal geography
- **Routing path** exposes infrastructure
- **Message size** reveals attachment presence
- **Send/receive patterns** create behavioral profiles

Research shows metadata alone enables advertising targeting with 90%+ accuracy. Governments worldwide mandate metadata retention for surveillance. There is **no standard mechanism** to encrypt or hide email metadata.

NOSTR Mail solves both problems.

---

## NOSTR Mail Encryption Architecture

Three concentric encryption layers, each hiding more information:

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: GIFT WRAP (kind 1059)                                  │
│  Signed by: ephemeral random key                                 │
│  Timestamp: randomized (±2 days)                                 │
│  Visible tags: ["p", "<recipient>"]                              │
│  Content: NIP-44 encrypted blob                                  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Layer 2: SEAL (kind 13)                                 │     │
│  │  Signed by: sender's real key                            │     │
│  │  Timestamp: randomized                                   │     │
│  │  Content: NIP-44 encrypted blob                          │     │
│  │                                                           │     │
│  │  ┌─────────────────────────────────────────────────┐     │     │
│  │  │  Layer 1: RUMOR (kind 15)                        │     │     │
│  │  │  Signed by: NOBODY (unsigned)                    │     │     │
│  │  │  Contains: actual mail content                   │     │     │
│  │  │  • Sender pubkey                                 │     │     │
│  │  │  • Recipients (p tags)                           │     │     │
│  │  │  • Subject                                       │     │     │
│  │  │  • Body text                                     │     │     │
│  │  │  • Attachments                                   │     │     │
│  │  │  • Thread references                             │     │     │
│  │  │  • Payment tokens                                │     │     │
│  │  └─────────────────────────────────────────────────┘     │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: The Rumor (Kind 15)

The actual mail message. **Unsigned** — no `id` or `sig` field.

**Rumor Serialization (AMEND-001)**: When serializing a kind 15 rumor to JSON for NIP-44 encryption, implementations MAY use any valid JSON serialization. JSON object key order is NOT significant. The recipient MUST parse the decrypted JSON string and extract fields by key name, not by position. Two implementations encrypting the same rumor will produce different ciphertext (due to serialization order differences and NIP-44's random nonce), but the decrypted and parsed rumor MUST be semantically identical.

```json
{
  "kind": 15,
  "pubkey": "<sender-pubkey>",
  "created_at": 1711843200,
  "tags": [
    ["p", "<recipient-pubkey>", "<relay>", "to"],
    ["subject", "Confidential: Board Meeting"],
    ["attachment", "<hash>", "agenda.pdf", "application/pdf", "52000"],
    ["attachment-key", "<hash>", "<encryption-key>"]
  ],
  "content": "The board meeting is scheduled for Friday at 2pm..."
}
```

**Why unsigned?**
- **Deniability**: The sender cannot be cryptographically proven to have written this specific content. The seal (layer 2) proves they sealed *something*, but the inner rumor itself bears no signature.
- **Flexibility**: The same rumor format can be used for different purposes without signature constraints.

**What it contains:**
- Full mail content (body text)
- All recipients (to, cc)
- Subject line
- Attachment references and decryption keys
- Thread references
- Payment tokens (Cashu/L402)
- Any mail-specific metadata

---

## Layer 2: The Seal (Kind 13)

The seal wraps the rumor in encryption and proves the sender's identity.

```json
{
  "id": "<computed-hash>",
  "pubkey": "<sender-real-pubkey>",
  "created_at": 1711800000,        // RANDOMIZED (not actual send time)
  "kind": 13,
  "tags": [],                       // NO TAGS (no metadata leakage)
  "content": "<NIP-44 encrypted rumor JSON>",
  "sig": "<schnorr-signature>"      // SIGNED by sender's real key
}
```

**What the seal does:**
- Encrypts the rumor using NIP-44 (sender's key → recipient's key via ECDH)
- Signed by the sender's **real** keypair (proves sender identity to recipient)
- Timestamp is **randomized** (not the actual send time). Per AMEND-002: the randomized timestamp MUST be computed as `actual_unix_timestamp + random_offset` where `random_offset` is a uniform random integer in the inclusive range `[-172800, +172800]` (±2 days in seconds), generated using a CSPRNG
- **No tags** — nothing leaks about the content
- Only the recipient can decrypt (requires recipient's private key + sender's public key for ECDH)

**Encryption:**
```
conversation_key = ECDH(sender_private_key, recipient_public_key)
sealed_content = NIP44_encrypt(conversation_key, JSON.stringify(rumor))
```

---

## Layer 3: The Gift Wrap (Kind 1059)

The outermost layer that the relay actually stores and serves.

```json
{
  "id": "<computed-hash>",
  "pubkey": "<ephemeral-random-pubkey>",   // NOT the sender
  "created_at": 1711700000,                // RANDOMIZED (±2 days)
  "kind": 1059,
  "tags": [
    ["p", "<recipient-pubkey>"]            // Only tag: who to deliver to
  ],
  "content": "<NIP-44 encrypted seal JSON>",
  "sig": "<schnorr-signature>"             // Signed by EPHEMERAL key
}
```

**What the gift wrap does:**
- Generates a **random ephemeral keypair** just for this message
- Encrypts the seal using NIP-44 (ephemeral key → recipient's key)
- Signed by the ephemeral key (the sender's identity is completely hidden)
- Timestamp is **randomized** within ±2 days
- Only one visible tag: `["p", "<recipient>"]` (so relays know who to deliver to)
- The ephemeral key is **discarded** after wrapping

**Encryption:**
```
ephemeral_key = generate_random_keypair()
conversation_key = ECDH(ephemeral_private_key, recipient_public_key)
wrapped_content = NIP44_encrypt(conversation_key, JSON.stringify(seal))
// ephemeral_private_key is now destroyed
```

---

## NIP-44 Encryption Deep Dive

NIP-44 (version 0x02) is the encryption standard used at each layer.

### Algorithm Stack

| Component | Algorithm | Purpose |
|-----------|-----------|---------|
| Key agreement | ECDH (secp256k1) | Derive shared secret from two keypairs |
| Key derivation | HKDF-SHA256 | Stretch shared secret with domain separation |
| Encryption | ChaCha20 | Encrypt plaintext (stream cipher) |
| Authentication | HMAC-SHA256 | Tamper detection (authenticate-then-encrypt) |
| Padding | Power-of-2 | Hide message length |

### Encryption Steps

```
1. ECDH Key Agreement
   shared_point = sender_private * recipient_public
   shared_x = x_coordinate(shared_point)  // 32 bytes

2. HKDF Key Derivation
   conversation_key = HKDF-extract(
     salt = "nip44-v2",
     ikm = shared_x
   )  // 32 bytes, deterministic for this keypair pair

3. Random Nonce
   nonce = random_bytes(32)  // Fresh for each message

4. Expand to Cipher Keys
   (chacha_key, chacha_nonce, hmac_key) = HKDF-expand(
     prk = conversation_key,
     info = nonce,
     length = 76  // 32 + 12 + 32
   )

5. Pad Plaintext
   padded = prepend_length(plaintext)  // 2-byte big-endian length prefix
   padded = pad_to_power_of_2(padded)  // Hide exact message length

6. Encrypt
   ciphertext = ChaCha20(chacha_key, chacha_nonce, padded)

7. Authenticate
   mac = HMAC-SHA256(hmac_key, nonce || ciphertext)

8. Assemble
   payload = 0x02 || nonce || ciphertext || mac
   result = base64_encode(payload)
```

### Security Properties

| Property | Status | Notes |
|----------|--------|-------|
| Confidentiality | Yes | ChaCha20 encryption |
| Integrity | Yes | HMAC-SHA256 authentication |
| Authenticity | Yes | Only holder of correct key can produce valid HMAC |
| Length hiding | Partial | Power-of-2 padding reduces leakage |
| Replay protection | No | Application must handle (event IDs provide this) |
| Forward secrecy | No | Static ECDH conversation key (see discussion below) |
| Post-compromise security | No | Key compromise reveals all past/future messages |

---

## What the Relay Sees

For each gift-wrapped mail event stored on the relay:

| Field | Value | Information Leaked |
|-------|-------|--------------------|
| `id` | Random hash | Nothing (computed from encrypted content) |
| `pubkey` | Ephemeral random key | **Nothing** (not the sender) |
| `created_at` | Randomized ±2 days | **Nothing useful** (not actual send time) |
| `kind` | 1059 | "This is a private message" (known) |
| `tags` | `[["p", recipient]]` | **Recipient identity** (necessary for delivery) |
| `content` | Encrypted blob | **Nothing** (double-encrypted) |
| `sig` | Ephemeral signature | **Nothing** (proves nothing about sender) |

**Summary: The relay knows a private message exists for a specific recipient. Nothing else.**

It does not know:
- Who sent it
- When it was actually sent
- What it contains
- What the subject is
- Whether it has attachments
- Who else received copies
- Whether it's part of a thread

---

## What an Attacker Sees

### Passive Network Observer

An observer monitoring WebSocket traffic to relays sees:
- Kind 1059 events flowing to relays (private messages exist)
- Recipient pubkeys in `p` tags (who receives mail)
- Event sizes (rough indicator of content length, mitigated by padding)
- Timing of publications (sender's client publishing, but sender identity hidden by ephemeral key)

**Cannot determine:** sender identity, content, subject, attachments, thread relationships.

### Compromised Relay Operator

A malicious relay operator sees everything the relay stores — the same as above. Additionally:
- Can correlate timing of kind 1059 events (traffic analysis)
- Can observe which IPs publish events (but can't link to sender identity due to ephemeral keys)
- Can refuse to store/deliver events (censorship)
- **Cannot decrypt content** (double NIP-44 encryption)
- **Cannot identify sender** (ephemeral keys)

**Mitigation:** Use multiple relays. Use Tor/VPN to hide IP from relay.

### Compromised Recipient Key

If the recipient's private key is compromised:
- Attacker can decrypt all past and future messages to that recipient
- Attacker learns sender identities (from seal layer)
- Attacker can impersonate the recipient
- **Cannot forge messages from the sender** (would need sender's key)

**Mitigation:** Key rotation, NIP-49 encrypted backup, prompt key revocation.

---

## Multi-Recipient Privacy

When sending to multiple recipients (To, CC, BCC), each recipient gets a **separate** gift wrap:

```
Original mail from Alice to Bob, CC Charlie, BCC Dave:

Gift Wrap 1 → Bob's relays:
  Ephemeral key #1 → encrypt seal → encrypt rumor
  Bob decrypts: sees [Alice → Bob (to), Charlie (cc)]

Gift Wrap 2 → Charlie's relays:
  Ephemeral key #2 → encrypt seal → encrypt rumor  
  Charlie decrypts: sees [Alice → Bob (to), Charlie (cc)]

Gift Wrap 3 → Dave's relays:
  Ephemeral key #3 → encrypt seal → encrypt rumor
  Dave decrypts: sees [Alice → Bob (to), Charlie (cc), Dave (bcc)]

Gift Wrap 4 → Alice's relays (sent copy):
  Ephemeral key #4 → encrypt seal → encrypt rumor
  Alice decrypts: sees full recipient list including BCC
```

**Key points:**
- Each gift wrap uses a **different ephemeral key** — no correlation between wraps
- Each wrap is published to **different relay sets** (each recipient's preferred relays)
- Relays cannot determine that these four events are related
- Bob and Charlie don't know Dave received a copy (BCC)
- Alice keeps a copy for her sent folder

---

## Deniability

### Cryptographic Deniability

The inner rumor (kind 15) is **unsigned**. This means:
- The recipient can verify the sender via the seal (kind 13, signed by sender)
- But the recipient **cannot prove to a third party** that the sender wrote the content
- The seal proves the sender encrypted *something* to the recipient
- But the rumor content itself has no signature that could be shown to a judge

### Why This Matters

In email, a DKIM signature is a non-repudiable proof that a specific domain sent a specific message with specific content. This has been used in legal proceedings and data leaks.

In NOSTR Mail:
- The seal proves Alice sent something to Bob (signed by Alice)
- The rumor proves what was inside (but is unsigned)
- Bob cannot show Alice's signature on the actual mail content
- A forger could construct a different rumor and claim it was inside Alice's seal
- This provides **plausible deniability** for the sender

---

## Comparison: PGP vs S/MIME vs NOSTR Mail

| Feature | PGP | S/MIME | NOSTR Mail |
|---------|-----|--------|------------|
| **Content encryption** | Yes (RSA/AES) | Yes (RSA/AES) | Yes (ChaCha20) |
| **Metadata encryption** | No | No | **Yes (Gift Wrap)** |
| **Sender hiding** | No | No | **Yes (ephemeral key)** |
| **Timestamp hiding** | No | No | **Yes (randomized)** |
| **Subject encryption** | Convention varies | No | **Yes (inside rumor)** |
| **Key exchange** | Manual/keyserver | CA certificate | **Automatic (pubkey = ID)** |
| **Key discovery** | Complex (keyservers) | Complex (directories) | **Simple (NIP-05/relay)** |
| **Adoption barrier** | Extreme | High | **None (default mode)** |
| **Deniability** | No (signed) | No (signed) | **Yes (rumor unsigned)** |
| **Multi-device** | Complex (key sync) | Complex (cert sync) | **Native (relay-based)** |
| **Length hiding** | No | No | **Yes (padding)** |
| **Forward secrecy** | No (static RSA) | No (static RSA) | No (static ECDH) |
| **Algorithm agility** | Yes (flexible) | Yes (flexible) | Yes (versioned: 0x02) |
| **Implementation** | Complex (OpenPGP) | Complex (X.509/ASN.1) | **Simple (~200 lines)** |

---

## Limitations & Threat Model

### What NOSTR Mail Encryption Does NOT Protect Against

1. **Recipient identity is visible to relays** — The `p` tag in the gift wrap reveals who receives mail. This is necessary for relay routing. Mitigation: recipient can use a dedicated inbox relay they trust, or run their own.

2. **No forward secrecy** — If a private key is compromised, all past messages encrypted to that key can be decrypted. (See discussion below.)

3. **Traffic analysis** — Patterns of kind 1059 events (timing, frequency, size) can reveal communication patterns even without decrypting content. Mitigation: constant-rate dummy messages, batched publishing.

4. **Relay censorship** — A relay can refuse to store or deliver kind 1059 events. Mitigation: publish to multiple relays; recipient monitors multiple relays.

5. **Client compromise** — If the mail client is compromised, encryption provides no protection. Standard endpoint security applies.

6. **Replay attacks** — A relay could re-serve old events. Mitigation: clients track seen event IDs and deduplicate.

7. **Global metadata correlation** — A sufficiently powerful adversary monitoring all relays could correlate timing of publications across relays to narrow down sender identity. Mitigation: Tor, random delays, multiple relay hops.

---

## Forward Secrecy Discussion

### The Problem

NIP-44 uses static ECDH: the conversation key between any two pubkeys is deterministic and unchanging. If either party's private key is compromised, all past and future messages between them can be decrypted.

### Why NOSTR Doesn't Have It (Yet)

Forward secrecy requires **ephemeral key exchange** — both parties generate temporary keys for each session or message. This requires an interactive handshake (both parties must be online simultaneously) or a pre-published set of one-time keys.

NOSTR is an **asynchronous** protocol (store-and-forward). The sender publishes to relays; the recipient may be offline for days. This makes interactive handshakes impractical.

### Potential Approaches

1. **Pre-published one-time keys (X3DH-style)**:
   - Recipient publishes a bundle of ephemeral public keys to relays
   - Sender uses one per message for forward secrecy
   - Similar to Signal's X3DH protocol
   - Requires key replenishment (recipient must periodically publish new keys)
   - Adds complexity and state management

2. **Ratcheting within threads**:
   - After initial message, sender and recipient perform a Diffie-Hellman ratchet
   - Each message in the thread uses a new ephemeral key
   - Provides forward secrecy within ongoing conversations
   - Does not help for first-contact messages

3. **Periodic key rotation**:
   - User generates new keypair periodically (e.g., monthly)
   - Old key is published as deprecated with pointer to new key
   - Old messages become forward-secret once old key is destroyed
   - Disrupts identity continuity

### Current Trade-off

NOSTR Mail accepts the lack of forward secrecy as a trade-off for:
- Asynchronous operation (no online requirement)
- Simplicity (no key ratchet state)
- Compatibility (works with existing NOSTR infrastructure)
- Metadata privacy (Gift Wrap provides benefits that PGP/S/MIME lack entirely)

For high-security contexts requiring forward secrecy, users should:
- Rotate keys periodically and destroy old keys
- Use NOSTR Mail to bootstrap, then switch to Signal/Session for ongoing conversations
- Accept that NOSTR Mail's security model is closer to "encrypted email" than "Signal"

---

## Encryption Flow: Complete Example

### Alice Sends Encrypted Mail to Bob

```
STEP 1: Create Rumor
  rumor = {
    kind: 15,
    pubkey: "alice_pubkey",
    created_at: 1711843200,
    tags: [["p", "bob_pubkey", "wss://inbox.bob.com", "to"],
           ["subject", "Secret Plans"]],
    content: "Launch is go for Thursday."
  }
  // No id, no sig — this is unsigned

STEP 2: Create Seal
  conversation_key_ab = ECDH(alice_private, bob_public)
  encrypted_rumor = NIP44_encrypt(conversation_key_ab, JSON.stringify(rumor))
  seal = {
    kind: 13,
    pubkey: "alice_pubkey",                    // Alice's REAL key
    created_at: random_timestamp(±2_days),     // Randomized
    tags: [],                                   // Empty — no metadata
    content: encrypted_rumor
  }
  seal.id = SHA256([0, seal.pubkey, seal.created_at, 13, [], encrypted_rumor])
  seal.sig = schnorr_sign(seal.id, alice_private)

STEP 3: Create Gift Wrap
  ephemeral = generate_keypair()               // Random, single-use
  conversation_key_eb = ECDH(ephemeral.private, bob_public)
  encrypted_seal = NIP44_encrypt(conversation_key_eb, JSON.stringify(seal))
  wrap = {
    kind: 1059,
    pubkey: ephemeral.public,                  // EPHEMERAL key, not Alice
    created_at: random_timestamp(±2_days),     // Randomized again
    tags: [["p", "bob_pubkey"]],               // Only: who to deliver to
    content: encrypted_seal
  }
  wrap.id = SHA256([0, wrap.pubkey, wrap.created_at, 1059, ...])
  wrap.sig = schnorr_sign(wrap.id, ephemeral.private)
  
  // DESTROY ephemeral.private — never used again

STEP 4: Publish
  → ["EVENT", wrap] → wss://inbox.bob.com
  → ["EVENT", wrap] → wss://nos.lol
  
  // Also create a self-addressed copy for Alice's sent folder
  // (same rumor, but wrapped for Alice instead of Bob)

STEP 5: Bob Receives
  Bob's client receives kind 1059 event
  a. Decrypt wrap: ECDH(bob_private, ephemeral.public) → NIP44_decrypt → seal
  b. Verify seal: check seal.sig against seal.pubkey (Alice's key) ✓
  c. Decrypt seal: ECDH(bob_private, alice_public) → NIP44_decrypt → rumor
  d. Read rumor: subject = "Secret Plans", content = "Launch is go for Thursday."
  e. Sender = alice_pubkey (verified via seal signature)
```
