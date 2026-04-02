# Systems Programmer — Implementation Fundamentals

Reference material for implementing the NOSTR Mail reference client and related tooling. Covers library APIs, cryptographic implementation requirements, WebSocket patterns, and safety-critical coding practices.

---

## 1. NOSTR Library APIs

### nostr-tools (TypeScript/JavaScript)

The reference JavaScript library. Key modules and functions for NOSTR Mail implementation:

**Event creation and signing:**
```typescript
import { finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools/pure'

// Generate keypair
const sk = generateSecretKey()          // Uint8Array (32 bytes)
const pk = getPublicKey(sk)             // hex string (64 chars)

// Create and sign an event
const event = finalizeEvent({
  kind: 15,                             // NOSTR Mail
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['p', recipientPubkey],
    ['subject', 'Hello from NOSTR Mail'],
  ],
  content: encryptedContent,            // NIP-44 ciphertext
}, sk)
// Returns: { id, pubkey, created_at, kind, tags, content, sig }
```

**Event ID computation:**
The event ID is SHA-256 of the canonical JSON serialization:
```typescript
import { getEventHash } from 'nostr-tools/pure'

// Internally computes:
// SHA-256(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]))
const id = getEventHash(event)
```

**Signature verification:**
```typescript
import { verifyEvent } from 'nostr-tools/pure'

const isValid = verifyEvent(event)      // boolean
// Verifies: BIP-340 Schnorr signature over the event ID
```

**NIP-44 encryption/decryption:**
```typescript
import * as nip44 from 'nostr-tools/nip44'

// Derive conversation key (ECDH + HKDF-Extract)
const conversationKey = nip44.v2.utils.getConversationKey(senderSk, recipientPk)

// Encrypt (HKDF-Expand + ChaCha20 + HMAC-SHA256)
const ciphertext = nip44.v2.encrypt(plaintext, conversationKey)
// Returns: base64-encoded string: version(1) || nonce(32) || padded_ciphertext(var) || mac(32)

// Decrypt
const plaintext = nip44.v2.decrypt(ciphertext, conversationKey)
```

**NIP-59 gift wrapping:**
```typescript
import { createRumor, createSeal, createWrap } from 'nostr-tools/nip59'

// Step 1: Create unsigned rumor (the actual message)
const rumor = createRumor(
  {
    kind: 15,
    tags: [['p', recipientPk], ['subject', 'Hello']],
    content: 'Message body',
  },
  senderSk
)
// rumor has id and pubkey but NO sig

// Step 2: Create seal (NIP-44 encrypt rumor, sign with sender key)
const seal = createSeal(rumor, senderSk, recipientPk)
// kind: 13, content: NIP-44 encrypted JSON of rumor, signed by sender

// Step 3: Create gift wrap (NIP-44 encrypt seal with ephemeral key)
const wrap = createWrap(seal, recipientPk)
// kind: 1059, content: NIP-44 encrypted JSON of seal
// signed by a NEW random ephemeral key (not the sender's key)
// p-tag: recipient pubkey (for relay routing)
// created_at: randomized (+/- 2 days)
```

**Relay communication:**
```typescript
import { Relay } from 'nostr-tools/relay'
import { SimplePool } from 'nostr-tools/pool'

// Single relay
const relay = await Relay.connect('wss://relay.example.com')
await relay.publish(event)
const sub = relay.subscribe([{ kinds: [1059], '#p': [myPubkey] }], {
  onevent(event) { /* handle incoming event */ },
  oneose() { /* end of stored events */ },
})

// Multi-relay pool
const pool = new SimplePool()
await pool.publish(['wss://r1.example.com', 'wss://r2.example.com'], event)
const events = await pool.querySync(
  ['wss://r1.example.com', 'wss://r2.example.com'],
  { kinds: [1059], '#p': [myPubkey], since: timestamp }
)
```

### rust-nostr (Rust)

The reference Rust SDK. Key types and functions:

```rust
use nostr::prelude::*;

// Generate keypair
let keys = Keys::generate();
let pk = keys.public_key();             // PublicKey
let sk = keys.secret_key();             // SecretKey

// Create event
let event = EventBuilder::new(Kind::Custom(15), "encrypted content")
    .tag(Tag::public_key(recipient_pk))
    .tag(Tag::custom(TagKind::Custom("subject".into()), vec!["Hello"]))
    .sign_with_keys(&keys)?;

// NIP-44 encryption
let conversation_key = nip44::v2::conversation_key(sk, &recipient_pk)?;
let ciphertext = nip44::v2::encrypt(&conversation_key, plaintext)?;
let plaintext = nip44::v2::decrypt(&conversation_key, &ciphertext)?;

// Gift wrap
let rumor = EventBuilder::new(Kind::Custom(15), content)
    .tag(Tag::public_key(recipient_pk))
    .build(pk);                         // Unsigned
let wrapped = nip59::gift_wrap(&keys, &recipient_pk, rumor, None)?;

// Relay communication (via nostr-sdk)
use nostr_sdk::prelude::*;
let client = Client::new(&keys);
client.add_relay("wss://relay.example.com").await?;
client.connect().await;
client.send_event(event).await?;

let filter = Filter::new()
    .kind(Kind::GiftWrap)               // 1059
    .pubkey(pk)
    .since(Timestamp::now() - Duration::from_secs(3600));
let events = client.get_events_of(vec![filter], None).await?;
```

### go-nostr (Go)

```go
import (
    "github.com/nbd-wtf/go-nostr"
    "github.com/nbd-wtf/go-nostr/nip44"
    "github.com/nbd-wtf/go-nostr/nip59"
)

// Generate keypair
sk := nostr.GeneratePrivateKey()        // hex string
pk, _ := nostr.GetPublicKey(sk)         // hex string

// Create event
ev := nostr.Event{
    Kind:      15,
    CreatedAt: nostr.Now(),
    Tags:      nostr.Tags{{"p", recipientPk}, {"subject", "Hello"}},
    Content:   encryptedContent,
}
ev.Sign(sk)

// NIP-44 encryption
conversationKey, _ := nip44.GenerateConversationKey(sk, recipientPk)
ciphertext, _ := nip44.Encrypt(conversationKey, plaintext, nil)
plaintext, _ := nip44.Decrypt(conversationKey, ciphertext)

// Gift wrap
rumor := nip59.CreateRumor(15, content, tags, senderPk)
wrapped, _ := nip59.GiftWrap(rumor, sk, recipientPk)

// Relay communication
ctx := context.Background()
relay, _ := nostr.RelayConnect(ctx, "wss://relay.example.com")
relay.Publish(ctx, ev)

sub, _ := relay.Subscribe(ctx, nostr.Filters{
    {Kinds: []int{1059}, Tags: nostr.TagMap{"#p": {pk}}},
})
for ev := range sub.Events {
    // handle event
}
```

---

## 2. NIP-44 Implementation Requirements

### CSPRNG for Nonces

The 32-byte nonce in every NIP-44 encryption MUST be generated from a cryptographically secure pseudorandom number generator (CSPRNG).

**Platform-specific CSPRNG sources:**
| Platform | Source | API |
|----------|--------|-----|
| Node.js | OpenSSL via libuv | `crypto.randomBytes(32)` |
| Browser | Web Crypto API | `crypto.getRandomValues(new Uint8Array(32))` |
| Rust | `getrandom` crate (OS entropy) | `getrandom::getrandom(&mut buf)` |
| Go | `crypto/rand` (OS entropy) | `rand.Read(buf)` |
| Python | `os.urandom` | `os.urandom(32)` |

**Never use:**
- `Math.random()` (JavaScript) — not cryptographic
- `rand::thread_rng()` without `getrandom` backend — may be seeded predictably
- Timestamp-based seeds — predictable
- User-provided "random" data without mixing with OS entropy

### Constant-Time HMAC Comparison

After computing the HMAC-SHA256 over the ciphertext, the verifier MUST compare the computed MAC with the received MAC using a constant-time comparison function.

**Why:** A variable-time comparison leaks information about how many bytes of the MAC matched before the first mismatch. An attacker can use timing differences to forge a valid MAC one byte at a time.

**Correct implementations:**
```typescript
// Node.js
import { timingSafeEqual } from 'crypto'
const isValid = timingSafeEqual(computedMac, receivedMac)

// Browser (no native constant-time compare — must implement)
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}
```

```rust
// Rust — use subtle crate
use subtle::ConstantTimeEq;
let is_valid = computed_mac.ct_eq(&received_mac).into();
```

```go
// Go
import "crypto/subtle"
isValid := subtle.ConstantTimeCompare(computedMac, receivedMac) == 1
```

### HKDF Domain Separation

NIP-44 uses HKDF with specific domain separation strings. Implementations MUST use exactly these values:

**HKDF-Extract (conversation key derivation):**
- Salt: `"nip44-v2"` (UTF-8 encoded, 8 bytes)
- IKM: the raw ECDH shared secret (32 bytes, X coordinate of the shared point)
- Output: 32-byte conversation key (PRK)

**HKDF-Expand (message key derivation):**
- PRK: the conversation key from Extract
- Info: the 32-byte random nonce
- L: 76 bytes
- Output split: ChaCha20 key (32 bytes) || ChaCha20 nonce (12 bytes) || HMAC key (32 bytes)

Any deviation in salt strings, info parameters, or output lengths produces incompatible ciphertext.

### Padding

NIP-44 uses a power-of-2 padding scheme with a 2-byte big-endian length prefix:

```
padded_plaintext = uint16_be(plaintext.length) || plaintext || zeros(pad_length)
```

Where `pad_length` is chosen so that `2 + plaintext.length + pad_length` is the next power of 2, with a minimum padded size of 32 bytes and a maximum plaintext size of 65535 bytes (the uint16 limit).

**Padding calculation:**
```typescript
function calcPaddedLen(unpaddedLen: number): number {
  if (unpaddedLen <= 0) throw new Error('invalid length')
  if (unpaddedLen <= 32) return 32
  const nextPow2 = 1 << (32 - Math.clz32(unpaddedLen - 1))
  const chunk = nextPow2 <= 256 ? 32 : nextPow2 / 8
  return chunk * (Math.floor((unpaddedLen - 1) / chunk) + 1)
}
```

---

## 3. NIP-59 Implementation Requirements

### Ephemeral Key Generation and Destruction

Every gift wrap (kind 1059) MUST be signed with a freshly generated ephemeral keypair. This key is used exactly once and then destroyed.

**Requirements:**
- Generate a new secp256k1 keypair for each gift wrap event
- Sign the gift wrap with the ephemeral secret key
- The ephemeral public key becomes the `pubkey` field of the gift wrap event
- Immediately after signing, zero out the ephemeral secret key from memory
- Never store the ephemeral secret key (it has no further use)

**Why:** The ephemeral key prevents relays from linking gift wraps to the sender. If the same key signed multiple wraps, a relay could correlate them as coming from the same sender.

### Timestamp Randomization

Both the seal (kind 13) and the gift wrap (kind 1059) MUST have randomized timestamps.

**NIP-59 specifies:** The `created_at` field should be tweaked to a random time within +/- 2 days (172800 seconds) of the actual time.

```typescript
function randomTimestamp(): number {
  const now = Math.floor(Date.now() / 1000)
  const tweak = Math.floor(Math.random() * 172800 * 2) - 172800 // +/- 2 days
  return now + tweak
}
```

**Why:** If the seal and wrap timestamps were the real creation time, a relay could use timing correlation to link a gift wrap to a specific period of sender activity.

### Multi-Recipient Wrapping

For CC/BCC in NOSTR Mail, the same rumor is wrapped separately for each recipient:

```
Rumor (kind 15, unsigned)
├── Seal for Alice (NIP-44 encrypt with sender→Alice key, sign with sender key)
│   └── Gift Wrap for Alice (NIP-44 encrypt with ephemeral→Alice key, sign with ephemeral key A)
├── Seal for Bob (NIP-44 encrypt with sender→Bob key, sign with sender key)
│   └── Gift Wrap for Bob (NIP-44 encrypt with ephemeral→Bob key, sign with ephemeral key B)
└── Seal for Carol (NIP-44 encrypt with sender→Carol key, sign with sender key)
    └── Gift Wrap for Carol (NIP-44 encrypt with ephemeral→Carol key, sign with ephemeral key C)
```

Each recipient gets their own seal and gift wrap. Each gift wrap uses a DIFFERENT ephemeral key. This prevents linking the gift wraps to each other.

**BCC handling:** BCC recipients get their own wraps, but the rumor's `p` tags only list To and CC recipients. BCC recipients are invisible to other recipients.

---

## 4. WebSocket Client Patterns

### Connection Management

```typescript
class RelayConnection {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private subscriptions = new Map<string, Filter[]>()

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      // Re-subscribe after reconnection
      for (const [subId, filters] of this.subscriptions) {
        this.sendRaw(['REQ', subId, ...filters])
      }
    }

    this.ws.onclose = () => {
      this.scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      // Log error, will trigger onclose which handles reconnection
    }

    this.ws.onmessage = (msg) => {
      this.handleMessage(JSON.parse(msg.data))
    }
  }
}
```

### Reconnection with Exponential Backoff

```typescript
private scheduleReconnect(): void {
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    // Give up, emit error event
    return
  }

  const baseDelay = 1000  // 1 second
  const maxDelay = 60000  // 60 seconds
  const delay = Math.min(
    baseDelay * Math.pow(2, this.reconnectAttempts),
    maxDelay
  )
  // Add jitter: +/- 25% to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  const finalDelay = Math.floor(delay + jitter)

  this.reconnectAttempts++
  setTimeout(() => this.connect(), finalDelay)
}
```

### Subscription Lifecycle

NOSTR subscriptions follow a REQ/EVENT/EOSE/CLOSE flow:

```
Client → Relay: ["REQ", "sub-id", { "kinds": [1059], "#p": ["pubkey"], "since": 1711929600 }]
Relay → Client: ["EVENT", "sub-id", { ... }]  // stored events
Relay → Client: ["EVENT", "sub-id", { ... }]  // stored events
Relay → Client: ["EOSE", "sub-id"]            // end of stored events
Relay → Client: ["EVENT", "sub-id", { ... }]  // real-time events (after EOSE)
Client → Relay: ["CLOSE", "sub-id"]           // unsubscribe
```

**Best practices:**
- Generate unique subscription IDs (UUID or incremental counter)
- Track subscriptions so they can be re-issued after reconnection
- Close subscriptions when no longer needed (relays may limit active subscriptions)
- Handle EOSE to distinguish between historical and real-time events

---

## 5. Event ID Computation

The event ID is the SHA-256 hash of a specific canonical JSON serialization:

```
id = SHA-256(JSON.stringify([
  0,                    // reserved for future use
  event.pubkey,         // hex string, 64 chars
  event.created_at,     // unix timestamp, integer
  event.kind,           // integer
  event.tags,           // array of arrays of strings
  event.content         // string
]))
```

**Critical requirements:**
- Use JSON.stringify with no extra whitespace (compact form)
- The `pubkey` must be lowercase hex (no `0x` prefix)
- The `created_at` must be an integer (not a float, not a string)
- Tags must be in the exact order they appear in the event
- The content must be the exact string (including any escaping)
- The result is a 32-byte hash, represented as a 64-character lowercase hex string

**Test vector:**
```json
Input: [0, "pubkey_hex", 1234567890, 1, [["p", "recipient"]], "hello"]
SHA-256 of that JSON string → event ID
```

---

## 6. BIP-340 Schnorr Signatures

NOSTR uses BIP-340 Schnorr signatures for all event signing.

**Key properties:**
- Public keys are 32 bytes (X-only, implicit even Y coordinate)
- Signatures are 64 bytes (R.x || s)
- Tagged hashing for domain separation: `SHA256(SHA256(tag) || SHA256(tag) || data)`

**Signing process (simplified):**
1. Compute the message hash: `m = tagged_hash("BIP0340/challenge", R.x || P.x || msg)`
2. Compute `s = k + e * d` (where k is the nonce, e is the challenge, d is the private key)
3. Signature = `R.x || s` (64 bytes)

**Verification process (simplified):**
1. Parse R.x and s from the 64-byte signature
2. Compute `e = tagged_hash("BIP0340/challenge", R.x || P.x || msg)`
3. Compute `R' = s * G - e * P`
4. Verify that `R'.x == R.x` and R' has even Y

**Library implementations:**
```typescript
// @noble/curves (used by nostr-tools)
import { schnorr } from '@noble/curves/secp256k1'
const sig = schnorr.sign(msgHash, privateKey)
const isValid = schnorr.verify(sig, msgHash, publicKey)
```

---

## 7. Performance Considerations

### Batch Decryption

When loading an inbox with many messages, decrypt in parallel:

```typescript
async function decryptInbox(wrappedEvents: Event[], mySecKey: Uint8Array): Promise<Rumor[]> {
  // Decrypt all events in parallel
  const results = await Promise.allSettled(
    wrappedEvents.map(async (wrap) => {
      const seal = JSON.parse(nip44.v2.decrypt(wrap.content, 
        nip44.v2.utils.getConversationKey(mySecKey, wrap.pubkey)))
      const rumor = JSON.parse(nip44.v2.decrypt(seal.content,
        nip44.v2.utils.getConversationKey(mySecKey, seal.pubkey)))
      return rumor
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<Rumor> => r.status === 'fulfilled')
    .map(r => r.value)
}
```

**Conversation key caching:** The ECDH + HKDF-Extract step produces a conversation key that is stable for a given sender-recipient pair. Cache it:

```typescript
const conversationKeyCache = new Map<string, Uint8Array>()

function getConversationKey(myKey: Uint8Array, theirPubkey: string): Uint8Array {
  const cacheKey = `${getPublicKey(myKey)}:${theirPubkey}`
  let ck = conversationKeyCache.get(cacheKey)
  if (!ck) {
    ck = nip44.v2.utils.getConversationKey(myKey, theirPubkey)
    conversationKeyCache.set(cacheKey, ck)
  }
  return ck
}
```

### Parallel Relay Connections

Open connections to multiple relays simultaneously:

```typescript
const relayUrls = ['wss://r1.example.com', 'wss://r2.example.com', 'wss://r3.example.com']
const connections = await Promise.allSettled(
  relayUrls.map(url => Relay.connect(url))
)
// Use only successful connections
const relays = connections
  .filter((r): r is PromiseFulfilledResult<Relay> => r.status === 'fulfilled')
  .map(r => r.value)
```

### Lazy Attachment Fetching

Do not download Blossom attachments until the user opens the message:

```typescript
class Message {
  private _attachments: AttachmentMeta[]
  
  get attachmentCount(): number { return this._attachments.length }
  get attachmentNames(): string[] { return this._attachments.map(a => a.filename) }
  
  // Downloads happen only when explicitly requested
  async downloadAttachment(index: number): Promise<Buffer> {
    const meta = this._attachments[index]
    const encrypted = await fetch(meta.url).then(r => r.arrayBuffer())
    return decrypt(new Uint8Array(encrypted), meta.encryptionKey)
  }
}
```

---

## 8. Test Vector Generation

### Deterministic from Known Inputs

Test vectors should be reproducible. Use fixed keys and nonces:

```typescript
const testVector = {
  description: "Basic NIP-44 encryption with known inputs",
  input: {
    senderSecretKey: "0000000000000000000000000000000000000000000000000000000000000001",
    recipientPublicKey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    plaintext: "Hello, NOSTR Mail!",
    nonce: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  intermediate: {
    sharedSecret: "...hex...",
    conversationKey: "...hex...",
    chachaKey: "...hex...",
    chachaNonce: "...hex...",
    hmacKey: "...hex...",
    paddedPlaintext: "...hex...",
    ciphertext: "...hex...",
    hmac: "...hex..."
  },
  output: {
    payload: "...base64...",
    eventId: "...hex..."
  }
}
```

**Requirements for test vectors:**
- Cover every intermediate value so an implementer can debug step-by-step
- Include edge cases: empty plaintext (minimum padding), maximum-length plaintext, non-ASCII content
- Include failure cases: wrong key, truncated payload, invalid version byte, corrupted MAC
- Use well-known test keys (e.g., private key = 1, public key = generator point)

---

## 9. Memory Safety

### Zeroing Key Material

Secret keys and conversation keys must be zeroed from memory after use:

```typescript
// TypeScript / JavaScript
function zeroBytes(buf: Uint8Array): void {
  buf.fill(0)
  // Note: JavaScript GC may have copied the data — this is best-effort
  // For stronger guarantees, use a native module (e.g., sodium-native)
}

// Usage
const sk = generateSecretKey()
try {
  // ... use sk ...
} finally {
  zeroBytes(sk)
}
```

```rust
// Rust — use zeroize crate
use zeroize::Zeroize;

let mut sk: [u8; 32] = generate_secret_key();
// ... use sk ...
sk.zeroize();  // Guaranteed to zero, not optimized away

// Or use Zeroizing<T> wrapper for automatic zeroing on drop
use zeroize::Zeroizing;
let sk = Zeroizing::new(generate_secret_key());
// Automatically zeroed when sk goes out of scope
```

```go
// Go
import "crypto/subtle"

func zeroBytes(b []byte) {
    for i := range b {
        b[i] = 0
    }
    // runtime.KeepAlive(b) to prevent premature GC — not strictly needed
    // but good practice
}

defer zeroBytes(sk)
```

### No Logging of Secrets

Ensure that logging frameworks never capture secret key material:

- Never log secret keys, conversation keys, HMAC keys, or ChaCha20 keys
- Never log plaintext message content (only the encrypted form)
- Redact pubkeys in logs if privacy is required (show first/last 4 chars)
- Use a custom log formatter that checks for known secret key patterns

```typescript
// Bad
console.log('Encrypting with key:', conversationKey)

// Good
console.log('Encrypting message for recipient:', recipientPubkey.slice(0, 8) + '...')
```

### Side-Channel Resistance

Beyond constant-time MAC comparison (see NIP-44 section above):

- Do not branch on secret data (no `if (secretByte === 0)`)
- Do not use secret data as array indices (cache timing attacks)
- Do not log timing information about cryptographic operations
- Use constant-time key comparison when checking if a wrapped event is addressed to us
