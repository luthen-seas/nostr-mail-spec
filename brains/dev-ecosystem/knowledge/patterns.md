# Developer Ecosystem Patterns

## SDK Usage Patterns

### Send a NOSTR Mail (target: <20 lines)

```typescript
import { NostrMail, nip07Signer } from '@nostr-mail/sdk'

const mail = new NostrMail({ signer: nip07Signer() })

await mail.send({
  to: 'bob@example.com',
  subject: 'Hello',
  body: 'World',
})
```

**What happens under the hood:**
1. `nip07Signer()` connects to the user's NIP-07 browser extension (e.g., nos2x, Alby)
2. `bob@example.com` is resolved via NIP-05 to a pubkey
3. Bob's NIP-65 relay list is fetched to determine where to publish
4. The message is constructed as a kind 15 event
5. The event is encrypted with NIP-44 (sender-recipient shared secret)
6. The encrypted event is gift-wrapped with NIP-59 (hides sender from relay)
7. The wrapped event is published to Bob's write relays
8. The promise resolves with the sent message object

### Receive NOSTR Mail (target: <15 lines)

```typescript
import { NostrMail, nip07Signer } from '@nostr-mail/sdk'

const mail = new NostrMail({ signer: nip07Signer() })
const inbox = mail.inbox({ since: '1h' })

for await (const msg of inbox) {
  console.log(`${msg.sender.name}: ${msg.subject}`)
  console.log(msg.body)
}
```

**What happens under the hood:**
1. SDK queries the user's relay list (NIP-65) for gift-wrapped events (kind 1059) addressed to the user
2. Each gift-wrapped event is unwrapped (NIP-59) using the user's private key
3. The inner rumor is decrypted (NIP-44)
4. The decrypted content is parsed into a structured `Message` object
5. Messages are yielded as an async iterable, newest first
6. The iterable stays open for real-time messages (subscription)

### Reply to a Message

```typescript
const inbox = mail.inbox({ since: '1h', limit: 1 })
const msg = (await inbox.next()).value

await msg.reply({
  body: 'Thanks for your message! I will review and get back to you.',
})
```

**What happens under the hood:**
1. Reply constructs a new kind 15 event
2. The `e` tag references the original message's event ID (threading)
3. Subject is auto-prefixed with "Re: " if not already present
4. Recipient is set to the original sender
5. Encryption, wrapping, and publishing follow the same flow as `send()`

### Forward a Message

```typescript
const msg = await mail.getMessage(eventId)

await msg.forward({
  to: 'carol@example.com',
  body: 'FYI — see the original message below.',
})
```

**What happens under the hood:**
1. Forward constructs a new kind 15 event
2. Original message content is quoted in the body (configurable format)
3. Original attachments are re-referenced (not re-uploaded — same Blossom URLs)
4. The `e` tag references the forwarded message (optional, configurable)
5. Subject is auto-prefixed with "Fwd: "

### Attach a File

```typescript
await mail.send({
  to: 'bob@example.com',
  subject: 'Project Update',
  body: 'See the attached report.',
  attachments: [
    { path: './report.pdf', name: 'Q4-Report.pdf' },
    { url: 'https://example.com/image.png', name: 'diagram.png' },
  ],
})
```

**What happens under the hood:**
1. Local files are read from disk (or browser File API)
2. Files are encrypted with a random symmetric key
3. Encrypted files are uploaded to Blossom server
4. Blossom returns a content-addressed URL (SHA-256 hash)
5. Attachment metadata (URL, decryption key, filename, MIME type, size) is included in the encrypted message payload
6. Recipient downloads from Blossom URL and decrypts with the key from the message

### Check Spam Policy

```typescript
const policy = await mail.getSpamPolicy('wss://relay.example.com')
console.log(policy)
// {
//   requiresPostage: true,
//   minimumPostage: 21,          // sats
//   acceptedMints: ['https://mint.example.com'],
//   requiresNip05: true,
//   requiresWot: false,
//   wotDepth: null,
// }

// Or check if a specific message would be accepted:
const check = await mail.checkDelivery({
  to: 'bob@example.com',
  relay: 'wss://relay.example.com',
})
// { accepted: false, reason: 'POSTAGE_REQUIRED', minimumPostage: 21 }
```

### Manage Contacts

```typescript
// List contacts
const contacts = await mail.contacts.list()
for (const contact of contacts) {
  console.log(`${contact.name} <${contact.nip05}> — ${contact.pubkey}`)
}

// Add a contact
await mail.contacts.add({
  nip05: 'alice@example.com',
  name: 'Alice',
  tags: ['work', 'engineering'],
})

// Search contacts
const results = await mail.contacts.search('alice')

// Remove a contact
await mail.contacts.remove('alice@example.com')

// Import from NIP-02 follow list
await mail.contacts.importFromFollowList()
```

---

## SDK Architecture Layers

### Layer Diagram

```
┌─────────────────────────────────────────┐
│           Application Layer             │
│  send, receive, reply, forward, search  │
│  contacts, threads, folders, labels     │
├─────────────────────────────────────────┤
│           Payment Layer                 │
│  Cashu wallet, L402 client, NWC         │
│  postage attach/claim, refund           │
├─────────────────────────────────────────┤
│           Storage Layer                 │
│  Blossom upload/download                │
│  attachment encryption/decryption       │
├─────────────────────────────────────────┤
│           Crypto Layer                  │
│  NIP-44 encrypt/decrypt                 │
│  NIP-59 wrap/unwrap (gift wrap)         │
│  Key management, NIP-07/NIP-46 signers  │
├─────────────────────────────────────────┤
│           Transport Layer               │
│  Relay pool, WebSocket management       │
│  NIP-65 relay selection (outbox model)  │
│  NIP-42 AUTH, reconnection, backoff     │
└─────────────────────────────────────────┘
```

### Transport Layer

**Responsibilities:**
- Manage WebSocket connections to multiple relays
- Implement connection pooling, reconnection with exponential backoff
- Relay selection via NIP-65 (outbox model)
- NIP-42 AUTH handling (automatic authentication when required)
- Event publishing with confirmation (wait for OK response)
- Event subscription with filter management
- Rate limiting and relay health tracking

**Key interfaces:**
```typescript
interface RelayPool {
  publish(event: Event, relays?: string[]): Promise<PublishResult>
  subscribe(filter: Filter, callback: (event: Event) => void): Subscription
  query(filter: Filter, relays?: string[]): Promise<Event[]>
  getRelayList(pubkey: string): Promise<RelayList>
  close(): void
}

interface PublishResult {
  successes: { relay: string; message: string }[]
  failures: { relay: string; error: string }[]
}
```

### Crypto Layer

**Responsibilities:**
- NIP-44 encryption: ChaCha20-Poly1305 with HKDF-derived keys
- NIP-44 decryption: reverse of encryption, with MAC verification
- NIP-59 gift wrapping: create outer event with randomized timestamp
- NIP-59 unwrapping: decrypt outer event to extract inner rumor
- Key management: signer abstraction (NIP-07, NIP-46, raw nsec)
- Conversation key caching: avoid re-deriving shared secrets

**Key interfaces:**
```typescript
interface Signer {
  getPublicKey(): Promise<string>
  sign(event: UnsignedEvent): Promise<Event>
  encrypt(plaintext: string, recipientPubkey: string): Promise<string>
  decrypt(ciphertext: string, senderPubkey: string): Promise<string>
}

interface CryptoService {
  giftWrap(rumor: UnsignedEvent, recipientPubkey: string): Promise<Event>
  unwrap(wrappedEvent: Event): Promise<UnsignedEvent>
}
```

### Payment Layer

**Responsibilities:**
- Cashu wallet management: receive tokens, send tokens, check balance
- Postage attachment: create Cashu tokens of specified amount, include in message
- Postage claiming: extract tokens from received message, redeem to wallet
- Postage refund: return tokens to sender (for legitimate messages that want refund)
- L402 client: handle HTTP 402 responses from relays, pay invoices, retry with token
- NWC (Nostr Wallet Connect): interface with user's Lightning wallet for payments

**Key interfaces:**
```typescript
interface PaymentService {
  createPostage(amount: number): Promise<CashuToken>
  claimPostage(token: CashuToken): Promise<ClaimResult>
  refundPostage(token: CashuToken, senderPubkey: string): Promise<void>
  payL402(invoice: string): Promise<L402Token>
  getBalance(): Promise<number>
}
```

### Storage Layer

**Responsibilities:**
- Blossom file upload: encrypt file, upload to Blossom server, return URL
- Blossom file download: fetch from URL, decrypt with key from message
- Attachment metadata: filename, MIME type, size, encryption key, hash
- Multi-server support: upload to multiple Blossom servers for redundancy
- Resume support: large file upload with chunked transfer

**Key interfaces:**
```typescript
interface StorageService {
  upload(file: File | Buffer, options?: UploadOptions): Promise<AttachmentMeta>
  download(meta: AttachmentMeta): Promise<Buffer>
  delete(hash: string): Promise<void>
}

interface AttachmentMeta {
  url: string               // Blossom URL
  hash: string              // SHA-256 of encrypted content
  encryptionKey: string     // Symmetric key for decryption
  filename: string
  mimeType: string
  size: number              // Original (unencrypted) size
}
```

### Application Layer

**Responsibilities:**
- Compose and send messages (orchestrate all lower layers)
- Receive and parse messages (query, unwrap, decrypt, parse)
- Threading: link replies to original messages via `e` tags
- Search: full-text search over decrypted messages (client-side)
- Contacts: manage address book, NIP-05 resolution, NIP-02 follow list import
- Folders/labels: organizational metadata (replaceable events, kind 30xxx)
- Read/unread tracking: local state or replaceable events

**Key interfaces:**
```typescript
interface NostrMail {
  send(options: SendOptions): Promise<Message>
  inbox(options?: InboxOptions): AsyncIterable<Message>
  sent(options?: SentOptions): AsyncIterable<Message>
  getMessage(id: string): Promise<Message>
  search(query: string, options?: SearchOptions): Promise<Message[]>
  contacts: ContactsService
  subscribe(filter: MailFilter, callback: (msg: Message) => void): Subscription
}
```

---

## Test Fixture Pattern

### Pre-built Test Data

The SDK should ship a `@nostr-mail/test-utils` package containing everything needed to write tests without network access.

**Test keypairs:**
```typescript
import { TestFixtures } from '@nostr-mail/test-utils'

const { alice, bob, carol, dave } = TestFixtures.keypairs
// alice.pubkey — hex pubkey
// alice.seckey — hex secret key
// alice.npub   — bech32 npub
// alice.nsec   — bech32 nsec
// alice.nip05  — 'alice@test.nostr-mail.dev'
```

**Test events:**
```typescript
const { events } = TestFixtures

events.plainKind1         // A standard kind 1 note (for testing non-mail events)
events.encryptedKind15    // An encrypted kind 15 NOSTR Mail message (Alice -> Bob)
events.giftWrappedKind15  // A gift-wrapped kind 15 message
events.withAttachment     // A message with a Blossom attachment reference
events.withPostage        // A message with Cashu postage tokens
events.deletionRequest    // A kind 5 deletion event
events.thread             // A set of messages forming a thread (3 messages)
```

**Test vectors (cryptographic):**
```typescript
const { vectors } = TestFixtures

vectors.nip44Encryption   // { plaintext, senderSec, recipientPub, ciphertext }
vectors.nip59GiftWrap     // { innerRumor, wrappedEvent, wrapperKey }
vectors.schnorrSignature  // { message, privateKey, signature }
```

### Mock Services

```typescript
import { MockRelayPool, MockBlossom, MockCashuWallet, MockSigner } from '@nostr-mail/test-utils'

// MockRelayPool: in-memory relay that stores events
const pool = new MockRelayPool()
pool.addEvent(TestFixtures.events.encryptedKind15)

// MockBlossom: in-memory file storage
const blossom = new MockBlossom()
blossom.addFile('abc123', Buffer.from('test file content'))

// MockCashuWallet: in-memory Cashu wallet
const wallet = new MockCashuWallet({ balance: 1000 })

// MockSigner: deterministic signer for tests
const signer = new MockSigner(TestFixtures.keypairs.alice)
```

### Integration Test Pattern

For tests that need real relay interaction (integration tests, not unit tests):

```typescript
import { TestRelay } from '@nostr-mail/test-utils'

let relay: TestRelay

beforeAll(async () => {
  relay = await TestRelay.start({ port: 0 }) // Random available port
  relay.loadFixtures(TestFixtures.events)
})

afterAll(async () => {
  await relay.stop()
})

test('send and receive a message', async () => {
  const alice = new NostrMail({
    signer: new MockSigner(TestFixtures.keypairs.alice),
    relays: [relay.url],
  })

  const bob = new NostrMail({
    signer: new MockSigner(TestFixtures.keypairs.bob),
    relays: [relay.url],
  })

  await alice.send({
    to: TestFixtures.keypairs.bob.npub,
    subject: 'Test',
    body: 'Hello from Alice',
  })

  const messages = await bob.inbox({ limit: 1 }).toArray()
  expect(messages).toHaveLength(1)
  expect(messages[0].subject).toBe('Test')
  expect(messages[0].body).toBe('Hello from Alice')
})
```

---

## Multi-Language SDK Pattern

### Shared Core, Language-Specific Wrappers

For maximum code reuse and consistency, the SDK can use a Rust core with FFI bindings (following the rust-nostr pattern):

```
nostr-mail-core (Rust)
├── nostr-mail-ffi (UniFFI bindings)
│   ├── @nostr-mail/sdk (TypeScript/JavaScript via WASM or NAPI)
│   ├── nostr-mail-py (Python via PyO3)
│   ├── nostr-mail-kotlin (Kotlin via JNI)
│   └── nostr-mail-swift (Swift via direct FFI)
└── nostr-mail-js (Pure TypeScript alternative, no FFI)
```

**Trade-offs:**
- FFI approach: single implementation, guaranteed consistency, but complex build and distribution
- Pure per-language: simpler distribution, language-idiomatic API, but risk of implementation drift
- Hybrid: Rust core for crypto/protocol, language-native for transport/UX layers

**Recommendation:** Start with pure TypeScript (largest developer audience), then Rust, then add FFI bindings as demand warrants.

### API Consistency Across Languages

Regardless of implementation strategy, the API surface should be consistent:

| Operation | TypeScript | Python | Rust | Go |
|-----------|-----------|--------|------|-----|
| Create client | `new NostrMail(opts)` | `NostrMail(opts)` | `NostrMail::new(opts)` | `nostrmail.New(opts)` |
| Send | `await mail.send(opts)` | `await mail.send(opts)` | `mail.send(opts).await` | `mail.Send(ctx, opts)` |
| Inbox | `for await (m of mail.inbox())` | `async for m in mail.inbox()` | `let mut inbox = mail.inbox(); while let Some(m) = inbox.next().await` | `for m := range mail.Inbox(ctx)` |
| Reply | `await msg.reply(opts)` | `await msg.reply(opts)` | `msg.reply(opts).await` | `msg.Reply(ctx, opts)` |

---

## Error Recovery Patterns

### Relay Failover

```typescript
// SDK automatically handles relay failover:
// 1. Publish to all target relays in parallel
// 2. If any relay fails, log warning but don't fail the operation
// 3. Operation succeeds if at least one relay accepts the event
// 4. If all relays fail, throw RelayError with all failure details

const result = await mail.send({ to: 'bob@example.com', subject: 'Hello', body: 'World' })
console.log(result.publishResult.successes) // Relays that accepted
console.log(result.publishResult.failures)  // Relays that failed (with reasons)
```

### Retry with Backoff

```typescript
// SDK implements exponential backoff for transient failures:
// Attempt 1: immediate
// Attempt 2: 1 second
// Attempt 3: 2 seconds
// Attempt 4: 4 seconds
// Max attempts: configurable (default: 3)

const mail = new NostrMail({
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
  },
})
```

### Offline Queue

```typescript
// SDK queues operations when offline:
const mail = new NostrMail({
  offlineQueue: true,  // default: false
})

// This will queue if offline and send when connection is restored:
await mail.send({ to: 'bob@example.com', subject: 'Hello', body: 'World' })

// Check queue status:
const queue = mail.getOfflineQueue()
console.log(queue.pending)  // Number of queued operations
```
