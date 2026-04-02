# NOSTR Identity System

This document provides an exhaustive technical reference for NOSTR's identity model: how identities are created, encoded, discovered, derived, and managed. Every claim is cited to its authoritative NIP specification.

---

## Table of Contents

1. [Key-Based Identity](#key-based-identity)
2. [NIP-19: Bech32-Encoded Entities](#nip-19-bech32-encoded-entities)
3. [NIP-05: DNS-Based Identifiers](#nip-05-dns-based-identifiers)
4. [NIP-06: Mnemonic Seed Derivation](#nip-06-mnemonic-seed-derivation)
5. [NIP-07: Browser Extension API](#nip-07-browser-extension-api)
6. [NIP-46: Nostr Connect / Remote Signing](#nip-46-nostr-connect--remote-signing)
7. [NIP-55: Android Signer Application](#nip-55-android-signer-application)
8. [Account Portability](#account-portability)
9. [Key Security Best Practices](#key-security-best-practices)

---

## Key-Based Identity

### Fundamental Principle

In NOSTR, **your keypair IS your identity**. There is no registration process, no username database, no central authority, and no account creation flow. A NOSTR identity is instantiated the moment a secp256k1 keypair is generated.

This is defined in NIP-01: every event contains a `pubkey` field (the 32-byte x-only public key of the event creator) and a `sig` field (a 64-byte Schnorr signature). The public key serves as the globally unique, self-authenticating identifier for the user.

### Properties of Key-Based Identity

1. **Permissionless**: Anyone can generate a keypair offline and immediately begin publishing events. No relay, server, or third party needs to approve the identity.

2. **Self-sovereign**: The user has sole control over their identity. No entity can revoke, suspend, or modify it. The only way to "lose" an identity is to lose the private key.

3. **Globally unique**: The probability of two users generating the same keypair is approximately 2^-128 (the security level of secp256k1), which is negligibly small.

4. **Pseudonymous by default**: A public key reveals nothing about the real-world identity of its holder. Users can optionally link their key to a DNS identifier via NIP-05.

5. **Portable**: Since identity is a keypair and not an account on any server, a user can switch relays, clients, or devices at will. The identity travels with the key.

### Identity Verification Model

NOSTR's identity verification is purely cryptographic:

- **Event authenticity**: Verified by checking that `sig` is a valid BIP-340 Schnorr signature of the event `id` under `pubkey` (NIP-01).
- **Author attribution**: The `pubkey` field in every event cryptographically binds the event to its creator.
- **No trusted third parties**: Unlike certificate-based systems (TLS/PKI), there is no certificate authority. Trust is established through cryptographic proof and social consensus.

---

## NIP-19: Bech32-Encoded Entities

NIP-19 defines human-readable encodings for NOSTR keys, event IDs, and metadata-rich references. These are strictly for **display and sharing** -- NIP-19 states they are "not meant to be used anywhere in the core protocol" (NIP-19).

### Simple Encodings (32-byte values)

Three prefixes encode raw 32-byte values using standard bech32 (BIP-173):

| Prefix | Encodes | Bytes |
|---|---|---|
| `npub` | Public key | 32 |
| `nsec` | Private key | 32 |
| `note` | Event ID | 32 |

**Encoding example:**

```
Hex pubkey:  3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
npub:        npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6
```

**Critical rule**: "npub keys MUST NOT be used in NIP-01 events" (NIP-19). Events always use raw hex for `pubkey`, `id`, and tag values. Bech32 encoding is purely a presentation-layer concern.

### TLV-Encoded Shareable Identifiers

Four prefixes use binary TLV (Type-Length-Value) encoding to bundle metadata alongside the core identifier:

| Prefix | Purpose | Required TLV types |
|---|---|---|
| `nprofile` | Profile reference with relay hints | type 0 (pubkey), type 1 (relay) |
| `nevent` | Event reference with relay hints | type 0 (event id), type 1 (relay), type 2 (author), type 3 (kind) |
| `naddr` | Addressable event coordinate | type 0 (identifier/d-tag), type 1 (relay), type 2 (author), type 3 (kind) |
| `nrelay` | Relay URL (deprecated) | type 0 (relay URL) |

### TLV Type Definitions (NIP-19)

| Type | Name | Value Format | Size | Used In |
|---|---|---|---|---|
| `0` | special | Depends on prefix | 32 bytes (pubkey/event id) or variable (identifier string) | All |
| `1` | relay | UTF-8 relay URL | Variable | All (repeatable) |
| `2` | author | 32-byte pubkey | 32 bytes | `nevent`, `naddr` |
| `3` | kind | 32-bit unsigned integer (big-endian) | 4 bytes | `nevent`, `naddr` |

**Type 0 (special)** carries different data depending on the prefix:
- In `nprofile`: the 32-byte public key
- In `nevent`: the 32-byte event ID
- In `naddr`: the UTF-8 encoded `d` tag value (variable length)
- In `nrelay`: the UTF-8 encoded relay URL (variable length)

**Type 1 (relay)** is repeatable -- an entity can include multiple relay hints indicating where the referenced profile or event might be found.

### TLV Binary Format

Each TLV entry is encoded as:

```
| type (1 byte) | length (1 byte) | value (length bytes) |
```

Multiple TLV entries are concatenated, then the entire binary blob is bech32-encoded with the appropriate prefix.

### Encoding Examples

**Encoding an nprofile (pubkey + 2 relay hints):**

```python
def encode_nprofile(pubkey_hex, relays):
    data = bytearray()

    # TLV type 0: special (pubkey)
    pubkey_bytes = bytes.fromhex(pubkey_hex)
    data.append(0)                    # type = 0
    data.append(32)                   # length = 32
    data.extend(pubkey_bytes)         # 32-byte pubkey

    # TLV type 1: relay (repeatable)
    for relay in relays:
        relay_bytes = relay.encode('utf-8')
        data.append(1)               # type = 1
        data.append(len(relay_bytes)) # length
        data.extend(relay_bytes)      # relay URL

    return bech32_encode('nprofile', data)

nprofile = encode_nprofile(
    '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
    ['wss://relay.damus.io', 'wss://nos.lol']
)
```

**Encoding an nevent (event id + relay + author + kind):**

```python
def encode_nevent(event_id_hex, relays, author_hex=None, kind=None):
    data = bytearray()

    # TLV type 0: special (event id)
    data.append(0)
    data.append(32)
    data.extend(bytes.fromhex(event_id_hex))

    # TLV type 1: relay (repeatable)
    for relay in relays:
        relay_bytes = relay.encode('utf-8')
        data.append(1)
        data.append(len(relay_bytes))
        data.extend(relay_bytes)

    # TLV type 2: author (optional)
    if author_hex:
        data.append(2)
        data.append(32)
        data.extend(bytes.fromhex(author_hex))

    # TLV type 3: kind (optional, 4 bytes big-endian)
    if kind is not None:
        data.append(3)
        data.append(4)
        data.extend(kind.to_bytes(4, 'big'))

    return bech32_encode('nevent', data)
```

**Encoding an naddr (addressable event coordinate):**

```python
def encode_naddr(identifier, relays, author_hex, kind):
    data = bytearray()

    # TLV type 0: special (d-tag value, variable-length UTF-8)
    id_bytes = identifier.encode('utf-8')
    data.append(0)
    data.append(len(id_bytes))
    data.extend(id_bytes)

    # TLV type 1: relay
    for relay in relays:
        relay_bytes = relay.encode('utf-8')
        data.append(1)
        data.append(len(relay_bytes))
        data.extend(relay_bytes)

    # TLV type 2: author (required for naddr)
    data.append(2)
    data.append(32)
    data.extend(bytes.fromhex(author_hex))

    # TLV type 3: kind (required for naddr)
    data.append(3)
    data.append(4)
    data.extend(kind.to_bytes(4, 'big'))

    return bech32_encode('naddr', data)

# Example: reference a kind 30023 long-form article with d-tag "my-article"
naddr = encode_naddr(
    'my-article',
    ['wss://relay.damus.io'],
    '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
    30023
)
```

**Decoding any NIP-19 entity:**

```python
def decode_nip19(bech32_string):
    prefix, data = bech32_decode(bech32_string)

    if prefix in ('npub', 'nsec', 'note'):
        # Simple 32-byte encoding
        return {'type': prefix, 'data': data.hex()}

    # TLV decoding for nprofile, nevent, naddr, nrelay
    result = {'type': prefix, 'relays': []}
    i = 0
    while i < len(data):
        tlv_type = data[i]
        tlv_len = data[i + 1]
        tlv_value = data[i + 2 : i + 2 + tlv_len]
        i += 2 + tlv_len

        if tlv_type == 0:    # special
            if prefix in ('nprofile', 'nevent'):
                result['id'] = tlv_value.hex()  # 32-byte hex
            elif prefix == 'naddr':
                result['identifier'] = tlv_value.decode('utf-8')
            elif prefix == 'nrelay':
                result['relay'] = tlv_value.decode('utf-8')
        elif tlv_type == 1:  # relay
            result['relays'].append(tlv_value.decode('utf-8'))
        elif tlv_type == 2:  # author
            result['author'] = tlv_value.hex()
        elif tlv_type == 3:  # kind
            result['kind'] = int.from_bytes(tlv_value, 'big')
        # Unknown TLV types are silently ignored (NIP-19)

    return result
```

### Implementation Notes (NIP-19)

- Unrecognized TLV types MUST be ignored, not cause errors. This enables forward compatibility.
- Bech32 strings should be limited to **5,000 characters** maximum.
- Clients receiving `nprofile` or `nevent` references should use the embedded relay hints to fetch the referenced entity.

---

## NIP-05: DNS-Based Identifiers

NIP-05 maps NOSTR public keys to human-readable, email-like identifiers (e.g., `alice@example.com`). This provides a discoverable, memorable identity layer on top of the raw cryptographic keys.

### Identifier Format

A NIP-05 identifier follows the pattern:

```
<local-part>@<domain>
```

- **local-part**: Restricted to characters `a-z0-9-_.` (lowercase alphanumeric, hyphens, underscores, dots) (NIP-05).
- **domain**: Any valid DNS domain name.
- The special identifier `_@domain` represents the root/domain-level identity (NIP-05).

The identifier is stored in the user's **kind 0 (metadata)** event:

```json
{
  "kind": 0,
  "content": "{\"name\":\"alice\",\"nip05\":\"alice@example.com\"}"
}
```

### The `/.well-known/nostr.json` Endpoint

The domain operator hosts a JSON file at a well-known URL (NIP-05):

```
GET https://<domain>/.well-known/nostr.json?name=<local-part>
```

**Minimal response:**

```json
{
  "names": {
    "alice": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  }
}
```

**With relay discovery (recommended):**

```json
{
  "names": {
    "alice": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    "bob": "7fa56f5d6962ab1e3cd424e758c3002b8665f7b0d8dcee9fe9e288d7751ac194"
  },
  "relays": {
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d": [
      "wss://relay.damus.io",
      "wss://nos.lol"
    ],
    "7fa56f5d6962ab1e3cd424e758c3002b8665f7b0d8dcee9fe9e288d7751ac194": [
      "wss://relay.snort.social"
    ]
  }
}
```

### Verification Flow

When a client encounters a `nip05` field in a kind 0 event, it performs the following verification (NIP-05):

```
1. Parse identifier: "alice@example.com"
   -> local_part = "alice"
   -> domain = "example.com"

2. Fetch: GET https://example.com/.well-known/nostr.json?name=alice
   -> Response must have Content-Type: application/json
   -> CORS header required: Access-Control-Allow-Origin: *

3. Parse JSON response

4. Check: response.names["alice"] == event.pubkey
   -> If match: NIP-05 verified
   -> If no match or missing: verification failed

5. CRITICAL: The endpoint MUST NOT redirect. Clients MUST ignore redirects.
```

**Implementation in JavaScript:**

```javascript
async function verifyNip05(identifier, expectedPubkey) {
  const [localPart, domain] = identifier.split('@');

  const url = `https://${domain}/.well-known/nostr.json?name=${localPart}`;
  const response = await fetch(url, { redirect: 'error' });
  const json = await response.json();

  const pubkey = json.names?.[localPart];
  return pubkey === expectedPubkey;
}
```

### Relay Discovery via NIP-05

The `relays` field in the nostr.json response provides a mechanism for clients to discover which relays a user publishes to (NIP-05). When a client verifies a NIP-05 identifier and finds relay entries, it can use those relays to fetch the user's events.

This serves as a bootstrap mechanism: if you know someone's NIP-05 identifier, you can find both their pubkey AND the relays where their content lives, without needing any prior connection to the NOSTR network.

### Important Caveats

- NIP-05 is **identification, not authentication**. The domain owner can change the mapping at any time.
- Clients MUST persistently reference public keys, not NIP-05 identifiers. If `alice@example.com` changes to point to a different pubkey, clients should not automatically follow the change (NIP-05).
- NIP-05 identifiers are case-insensitive for the local part.
- The query string parameter (`?name=`) allows both static file servers (serving a complete nostr.json) and dynamic servers (generating responses per query) to work.

---

## NIP-06: Mnemonic Seed Derivation

NIP-06 defines how to deterministically derive NOSTR keypairs from BIP-39 mnemonic seed phrases. This enables users to back up their NOSTR identity as a set of human-readable words.

### Derivation Path

NIP-06 specifies the BIP-32 hierarchical deterministic derivation path (NIP-06):

```
m/44'/1237'/<account>'/0/0
```

Where:
- `44'` is the BIP-44 purpose field (hardened)
- `1237'` is the NOSTR coin type registered in SLIP-44 (hardened)
- `<account>'` is the account index (hardened), starting at `0`
- `0` is the change index (external chain)
- `0` is the address index

### Derivation Process

```
BIP-39 Mnemonic (12 or 24 words)
        |
        v
    BIP-39 Seed (64 bytes, via PBKDF2-HMAC-SHA512)
        |
        v
    BIP-32 Master Key
        |
        v
    m/44'/1237'/0'/0/0
        |
        v
    NOSTR Private Key (32 bytes)
        |
        v
    NOSTR Public Key (x-only, 32 bytes)
```

### Implementation Example

```javascript
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';
import { schnorr } from '@noble/secp256k1';

// Generate a new mnemonic (or use an existing one)
const mnemonic = generateMnemonic(wordlist, 256); // 24 words
// Example: "abandon abandon abandon abandon abandon abandon abandon
//           abandon abandon abandon abandon about"

// Derive seed from mnemonic
const seed = mnemonicToSeedSync(mnemonic);

// Derive NOSTR key using BIP-32
const root = HDKey.fromMasterSeed(seed);
const nostrKey = root.derive("m/44'/1237'/0'/0/0");

const privateKey = nostrKey.privateKey;               // 32 bytes
const publicKey = schnorr.getPublicKey(privateKey);    // 32 bytes (x-only)

console.log('Private key:', bytesToHex(privateKey));
console.log('Public key:', bytesToHex(publicKey));
```

### Multiple Accounts

Basic implementations use `account = 0`. Advanced clients can generate multiple NOSTR identities from a single mnemonic by incrementing the account index (NIP-06):

```
m/44'/1237'/0'/0/0  -> First NOSTR identity
m/44'/1237'/1'/0/0  -> Second NOSTR identity
m/44'/1237'/2'/0/0  -> Third NOSTR identity
```

NIP-06 also notes that "other types of clients can still get fancy and use other derivation paths for their own other purposes."

### Test Vectors (NIP-06)

The specification provides test vectors for verification. Developers should validate their implementation against these known-good outputs to confirm correct derivation.

---

## NIP-07: Browser Extension API

NIP-07 defines a standard JavaScript API exposed by browser extensions (or browsers themselves) that allows web-based NOSTR clients to request signing operations without ever receiving the user's private key (NIP-07).

### The `window.nostr` Object

Extensions implementing NIP-07 inject a `window.nostr` object into every web page. This object provides the following interface:

### Required Methods

```typescript
interface Nostr {
  /** Returns the user's public key as a hex string */
  getPublicKey(): Promise<string>;

  /**
   * Takes an unsigned event object, adds id, pubkey, and sig fields,
   * and returns the complete signed event.
   */
  signEvent(event: {
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
  }): Promise<{
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  }>;
}
```

### Optional Encryption Methods

```typescript
interface Nostr {
  // ... required methods above ...

  nip04: {
    /** Encrypt plaintext for a recipient (DEPRECATED - use nip44) */
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    /** Decrypt ciphertext from a sender (DEPRECATED - use nip44) */
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };

  nip44: {
    /** Encrypt plaintext using NIP-44 versioned encryption */
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    /** Decrypt NIP-44 payload */
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}
```

### Usage Example

```javascript
// Check for NIP-07 support
if (!window.nostr) {
  alert('Please install a NOSTR browser extension (e.g., nos2x, Alby)');
}

// Get public key (user approves in extension popup)
const pubkey = await window.nostr.getPublicKey();
console.log('Your pubkey:', pubkey);

// Create and sign an event
const unsignedEvent = {
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content: 'Hello from NIP-07!'
};

const signedEvent = await window.nostr.signEvent(unsignedEvent);
// signedEvent now has id, pubkey, and sig fields

// Send to relay
ws.send(JSON.stringify(['EVENT', signedEvent]));

// Encrypt a direct message using NIP-44
const encrypted = await window.nostr.nip44.encrypt(
  recipientPubkey,
  'Secret message'
);

// Decrypt a received message
const decrypted = await window.nostr.nip44.decrypt(
  senderPubkey,
  encryptedPayload
);
```

### Extension Implementation Notes (NIP-07)

- Extensions targeting Chromium and Firefox should set `"run_at": "document_end"` in their manifest to ensure the `window.nostr` object is available when pages initialize.
- The extension manages the private key internally. The web page never has access to it.
- Each method call typically triggers a user-facing approval prompt in the extension UI.

### Common NIP-07 Extensions

- **nos2x**: Minimal Chrome extension, the reference implementation.
- **Alby**: Lightning + NOSTR browser extension with NIP-07 support.
- **nostr-keyx**: Chrome extension with hardware key support.
- **Flamingo**: Firefox extension for NOSTR signing.

---

## NIP-46: Nostr Connect / Remote Signing

NIP-46 defines a protocol for separating private key management from client applications. Instead of the client holding the private key directly, signing requests are sent to a remote signer (called a "bunker") over the NOSTR protocol itself (NIP-46).

### Architecture

Three participants are involved:

| Participant | Role | Keypair |
|---|---|---|
| **User** | The person using NOSTR | User keypair (the actual NOSTR identity) |
| **Client** | The application the user interacts with | Client keypair (disposable, generated by the app) |
| **Remote Signer** | Daemon managing private keys ("bunker") | Remote signer keypair (for communication) |

The client and remote signer communicate via **kind 24133** events encrypted with **NIP-44** (NIP-46).

### Connection Methods

#### Method 1: Remote-Signer-Initiated (bunker:// URL)

The remote signer generates a connection string:

```
bunker://<remote-signer-pubkey>?relay=<wss://relay-url>&secret=<optional-secret>
```

Example:
```
bunker://abcd1234...?relay=wss://relay.nsecbunker.com&secret=my-secret-token
```

The user pastes this into the client. The client then:
1. Generates a disposable keypair.
2. Connects to the specified relay.
3. Sends a `connect` request to the remote signer's pubkey.

#### Method 2: Client-Initiated (nostrconnect:// URL)

The client generates a connection string:

```
nostrconnect://<client-pubkey>?relay=<relay-urls>&secret=<required-secret>&perms=<permissions>&name=<app-name>&url=<app-url>&image=<app-image-url>
```

Example:
```
nostrconnect://efgh5678...?relay=wss://relay.damus.io&secret=abc123&perms=sign_event:1,nip44_encrypt&name=MyClient&url=https://myclient.com
```

The user scans or pastes this into their remote signer, which then connects to the client.

### Request/Response Protocol

All communication uses kind 24133 events with NIP-44 encrypted content (NIP-46).

**Request format (sent by client, encrypted in event content):**

```json
{
  "id": "random-request-id",
  "method": "sign_event",
  "params": ["{\"kind\":1,\"content\":\"Hello\",\"tags\":[],\"created_at\":1234567890}"]
}
```

**Response format (sent by remote signer, encrypted in event content):**

```json
{
  "id": "random-request-id",
  "result": "{\"id\":\"...\",\"pubkey\":\"...\",\"sig\":\"...\",\"kind\":1,\"content\":\"Hello\",\"tags\":[],\"created_at\":1234567890}",
  "error": ""
}
```

### Supported Methods (NIP-46)

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `connect` | `[remote-signer-pubkey, optional_secret, optional_perms]` | `"ack"` | Establish connection |
| `sign_event` | `[unsigned_event_json]` | Signed event JSON | Sign an event |
| `ping` | `[]` | `"pong"` | Connectivity check |
| `get_public_key` | `[]` | Hex pubkey string | Get the user's public key |
| `nip04_encrypt` | `[third_party_pubkey, plaintext]` | NIP-04 ciphertext | Encrypt (deprecated) |
| `nip04_decrypt` | `[third_party_pubkey, ciphertext]` | Plaintext | Decrypt (deprecated) |
| `nip44_encrypt` | `[third_party_pubkey, plaintext]` | NIP-44 payload | Encrypt with NIP-44 |
| `nip44_decrypt` | `[third_party_pubkey, ciphertext]` | Plaintext | Decrypt NIP-44 payload |

### Permissions Format (NIP-46)

Permissions use the syntax `method[:params]`, comma-separated:

```
sign_event:1,sign_event:4,nip44_encrypt,nip44_decrypt
```

This example grants permission to:
- Sign kind 1 events (text notes)
- Sign kind 4 events (encrypted DMs)
- Perform NIP-44 encryption
- Perform NIP-44 decryption

### Authentication Challenges

When a remote signer requires additional authentication (e.g., user approval on a separate device), it returns a special response (NIP-46):

```json
{
  "id": "original-request-id",
  "result": "auth_url",
  "error": "https://signer.example.com/approve?request=abc123"
}
```

The client displays the URL to the user while continuing to listen for the actual response on the same request ID.

### Complete Connection Flow Example

```
1. Remote signer generates: bunker://RS_PUBKEY?relay=wss://relay.example.com&secret=xyz

2. User pastes bunker URL into client

3. Client generates disposable keypair (C_PUB, C_PRIV)

4. Client connects to wss://relay.example.com

5. Client -> Relay: kind 24133 event
   - pubkey: C_PUB
   - p-tag: RS_PUBKEY
   - content: NIP-44 encrypted {"id":"1","method":"connect","params":["RS_PUBKEY","xyz"]}

6. Remote Signer -> Relay: kind 24133 event
   - pubkey: RS_PUBKEY
   - p-tag: C_PUB
   - content: NIP-44 encrypted {"id":"1","result":"ack"}

7. Client -> Relay: kind 24133 event (sign request)
   - content: NIP-44 encrypted {"id":"2","method":"sign_event","params":["{...}"]}

8. Remote Signer -> Relay: kind 24133 event (signed result)
   - content: NIP-44 encrypted {"id":"2","result":"{signed event JSON}"}
```

### Discovery (NIP-46)

Remote signers can advertise themselves through:
- **NIP-05**: Publishing at `/.well-known/nostr.json?name=_` with the remote signer's pubkey.
- **NIP-89**: Publishing kind 31990 events with a `k` tag value of `24133`.

### Security Model (NIP-46)

NIP-46 states: "Private keys should be exposed to as few systems -- apps, operating systems, devices -- as possible as each system adds to the attack surface."

Key security properties:
- The client application **never sees the private key**.
- Client keypairs are disposable and should be deleted on logout.
- The remote signer can enforce granular permissions per client.
- All communication is end-to-end encrypted with NIP-44.
- The remote signer controls relay selection and can switch relays mid-session.

---

## NIP-55: Android Signer Application

NIP-55 defines a protocol for communication between Android signer applications and NOSTR clients on Android devices. It serves the same purpose as NIP-07 (browser extensions) and NIP-46 (remote signing) but is optimized for Android's inter-app communication model (NIP-55).

### Communication Mechanisms

NIP-55 uses two Android primitives:

| Mechanism | Use Case | User Interaction |
|---|---|---|
| **Intents** | User-initiated actions requiring explicit approval | Launches signer UI for confirmation |
| **Content Resolvers** | Pre-authorized background operations | Silent, no UI popup |

### Connection Flow

1. Client app calls `get_public_key` via Intent to establish initial connection.
2. Client caches the returned pubkey and signer package name.
3. Subsequent operations use either Intents (for new approvals) or Content Resolvers (for pre-authorized operations).

### Supported Methods (NIP-55)

| Method | Parameters | Returns |
|---|---|---|
| `get_public_key` | -- | Hex public key |
| `sign_event` | Event JSON | Signed event with signature |
| `nip04_encrypt` | Third-party pubkey, plaintext | NIP-04 ciphertext |
| `nip04_decrypt` | Third-party pubkey, ciphertext | Plaintext |
| `nip44_encrypt` | Third-party pubkey, plaintext | NIP-44 ciphertext |
| `nip44_decrypt` | Third-party pubkey, ciphertext | Plaintext |
| `decrypt_zap_event` | Event JSON | Decrypted zap data |

### Android Implementation

```kotlin
// Declare the nostrsigner scheme in AndroidManifest.xml
// <intent-filter>
//   <action android:name="android.intent.action.VIEW" />
//   <data android:scheme="nostrsigner" />
// </intent-filter>

// Request signing via Intent
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$eventJson"))
intent.`package` = signerPackageName
intent.putExtra("type", "sign_event")
intent.putExtra("pubkey", userPubkey)

activityResultLauncher.launch(intent)
```

### Batched Operations

When dispatching multiple signing requests simultaneously, clients should use the `FLAG_ACTIVITY_SINGLE_TOP` flag to prevent redundant signer UI popups. Signers return arrays of results with package identifiers and corresponding signatures (NIP-55).

### Web Application Fallback

NIP-55 recommends that web clients use **NIP-46** (Nostr Connect) instead of NIP-55, since Android Intents are not directly accessible from web browsers. Web implementations can work around this limitation using callback URLs or clipboard-based result delivery (NIP-55).

---

## Account Portability

One of NOSTR's defining features is complete account portability. Because identity is a keypair rather than an account on a specific server, users can move freely across the network.

### Switching Relays

A user's identity is not tied to any relay. To "move" to new relays:

1. **Connect to new relays** and begin publishing events there.
2. **Publish a kind 10002 relay list event** (NIP-65) announcing your preferred relays:
   ```json
   {
     "kind": 10002,
     "tags": [
       ["r", "wss://new-relay.example.com"],
       ["r", "wss://another-relay.example.com"],
       ["r", "wss://read-only-relay.example.com", "read"]
     ],
     "content": ""
   }
   ```
3. **Re-publish your kind 0 metadata** and kind 3 contact list to new relays.
4. Optionally update your NIP-05 nostr.json `relays` field to reflect the new relay set.

Since kind 10002 is a replaceable event (NIP-01), only the most recent version is retained. Clients that follow NIP-65 will discover your new relays.

### Key Backup Strategies

| Strategy | Mechanism | Pros | Cons |
|---|---|---|---|
| **NIP-06 Mnemonic** | 12/24 seed words | Human-readable, well-understood (BIP-39) | Must protect the words |
| **NIP-49 ncryptsec** | Password-encrypted key | Encrypted at rest, portable string | Password must be strong |
| **Raw nsec** | Bech32-encoded private key | Simple, direct | No encryption, dangerous if exposed |
| **Hardware wallet** | Private key never leaves device | Maximum security | Limited client support |
| **NIP-46 Bunker** | Key on dedicated signing device | Key isolation from clients | Requires running signer infrastructure |
| **Paper backup** | Printed nsec or mnemonic | Air-gapped, no digital exposure | Physical security required |

### Multi-Device Usage

Since NOSTR keys are just 32 bytes of data, the same key can be used on multiple devices simultaneously. However, for security, the recommended approach is:

1. Store the private key on a single secure device (or bunker).
2. Use NIP-46 remote signing from other devices.
3. Use NIP-07 browser extensions on desktop.
4. Use NIP-55 signer apps on Android.

---

## Key Security Best Practices

### Private Key Handling

1. **Never transmit raw private keys over the network.** Use NIP-46 for remote signing instead of sending keys to client apps.

2. **Never store private keys in plaintext.** Use NIP-49 (ncryptsec) for encrypted storage. The specification recommends LOG_N >= 16 for the scrypt parameter.

3. **Zero memory after use.** NIP-49 explicitly states: implementations should "zero out the memory of passwords and private keys before freeing that memory."

4. **Avoid clipboard exposure.** Copying `nsec` keys to the clipboard risks exposure to clipboard-monitoring malware. If unavoidable, clear the clipboard immediately after pasting.

5. **Use the key security byte.** When encrypting with NIP-49, honestly set the key security byte (0x00 for known-insecure, 0x01 for known-secure, 0x02 for unknown) so that future tools can assess key risk.

### Signing Architecture

1. **Prefer delegated signing.** Use NIP-07 (browser extensions), NIP-46 (remote signers), or NIP-55 (Android signers) instead of giving the raw private key to every client application.

2. **Minimize key exposure surface.** NIP-46 states: "Private keys should be exposed to as few systems -- apps, operating systems, devices -- as possible as each system adds to the attack surface."

3. **Use disposable client keys.** When using NIP-46, the client's keypair should be ephemeral and deleted on logout.

4. **Enforce granular permissions.** NIP-46 supports per-method, per-kind permissions. Grant only what each client needs.

### Backup Security

1. **Use mnemonic backups (NIP-06)** for the master recovery mechanism. Store the 12/24 words offline (paper, metal plate).

2. **Use ncryptsec (NIP-49)** for digital backups. Choose a strong password and high LOG_N value (20+) for long-term storage.

3. **Never publish encrypted keys publicly.** NIP-49 warns that attackers could collect multiple ncryptsec strings and attempt parallel brute-force attacks.

4. **Test recovery before relying on backups.** Derive the public key from the backup and verify it matches your known npub.

### Identity Recovery

There is **no account recovery mechanism** in NOSTR. If you lose your private key (and all backups), your identity is permanently lost. This is the fundamental trade-off of self-sovereign, key-based identity:

- No "forgot password" flow exists.
- No administrator can reset your access.
- No social recovery is built into the base protocol (though some clients implement key rotation announcements).

The only mitigation is robust, redundant backup practices as described above.

### Key Rotation

NOSTR does not have a native key rotation mechanism at the protocol level. If a key is compromised:

1. Generate a new keypair.
2. Publish a kind 0 metadata event from the OLD key referencing the new key (if you still have access).
3. Re-establish your social graph by having contacts follow the new pubkey.
4. Update your NIP-05 identifier to point to the new pubkey.
5. Republish all important content from the new key.

This is a known limitation of the protocol. Some proposals for key rotation and delegation exist but are not yet standardized.
