# Systems Programmer — Implementation Patterns

Reusable code patterns for the NOSTR Mail reference implementation. Each pattern is described with its intent, structure, and concrete code examples.

---

## 1. Event Creation Pattern

**Intent:** Build a NOSTR event from application-level data in a consistent, correct order.

**Steps:**
1. Build the tags array
2. Set the content (plaintext or encrypted)
3. Set kind and created_at
4. Compute the event ID (SHA-256 of canonical JSON)
5. Sign the event (BIP-340 Schnorr)

```typescript
import { finalizeEvent } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'

function createMailEvent(
  senderSk: Uint8Array,
  recipientPk: string,
  subject: string,
  body: string,
  options?: { cc?: string[]; attachments?: AttachmentMeta[]; inReplyTo?: string; rootId?: string }
): UnsignedEvent {
  // Step 1: Build tags
  const tags: string[][] = [
    ['p', recipientPk, '', 'to'],
    ['subject', subject],
  ]

  if (options?.cc) {
    for (const ccPk of options.cc) {
      tags.push(['p', ccPk, '', 'cc'])
    }
  }

  if (options?.inReplyTo) {
    tags.push(['e', options.inReplyTo, '', 'reply'])
  }
  if (options?.rootId) {
    tags.push(['e', options.rootId, '', 'root'])
  }

  if (options?.attachments) {
    for (const att of options.attachments) {
      tags.push(['attachment', att.hash, att.mimeType, att.filename, att.url, att.encryptionKey])
    }
  }

  // Step 2: Set content
  const content = body

  // Step 3: Build unsigned event (rumor)
  const rumor: UnsignedEvent = {
    kind: 15,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey: getPublicKey(senderSk),
  }

  // Rumor is NOT signed — it will be sealed and wrapped
  return rumor
}
```

**Key invariants:**
- Tags are ordered: `p` tags first, then `subject`, then `e` tags, then `attachment` tags
- Content is the message body (will be encrypted at the seal/wrap stage)
- The rumor is never published directly — only its gift-wrapped form

---

## 2. Gift Wrap Pattern

**Intent:** Encrypt a rumor for a specific recipient, hiding the sender's identity from relays.

**Three-layer construction:**

```typescript
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'

function giftWrap(
  rumor: UnsignedEvent,
  senderSk: Uint8Array,
  recipientPk: string,
): Event {
  // === Layer 1: Rumor ===
  // The rumor is unsigned. Compute its ID for reference, but do NOT sign it.
  // The rumor's pubkey is the sender's real pubkey.
  const rumorWithId = {
    ...rumor,
    id: getEventHash(rumor),
    // NO sig field — this is intentional (deniability)
  }

  // === Layer 2: Seal (kind 13) ===
  // Encrypt the rumor JSON with NIP-44 using sender→recipient conversation key
  const sealConversationKey = nip44.v2.utils.getConversationKey(senderSk, recipientPk)
  const encryptedRumor = nip44.v2.encrypt(JSON.stringify(rumorWithId), sealConversationKey)

  const seal = finalizeEvent({
    kind: 13,
    created_at: randomTimestamp(),       // +/- 2 days
    tags: [],                            // Empty tags — no metadata leakage
    content: encryptedRumor,
  }, senderSk)
  // Seal is signed by sender's real key
  // But seal is never published directly — only inside the gift wrap

  // === Layer 3: Gift Wrap (kind 1059) ===
  // Generate ephemeral keypair (use once, then destroy)
  const ephemeralSk = generateSecretKey()
  
  // Encrypt the seal JSON with NIP-44 using ephemeral→recipient conversation key
  const wrapConversationKey = nip44.v2.utils.getConversationKey(ephemeralSk, recipientPk)
  const encryptedSeal = nip44.v2.encrypt(JSON.stringify(seal), wrapConversationKey)

  const wrap = finalizeEvent({
    kind: 1059,
    created_at: randomTimestamp(),       // +/- 2 days (independent of seal timestamp)
    tags: [['p', recipientPk]],          // Recipient tag for relay routing
    content: encryptedSeal,
  }, ephemeralSk)

  // CRITICAL: Zero the ephemeral secret key
  ephemeralSk.fill(0)

  return wrap
}

function randomTimestamp(): number {
  const now = Math.floor(Date.now() / 1000)
  const twoDays = 172800
  return now + Math.floor(Math.random() * twoDays * 2) - twoDays
}
```

**Unwrapping (recipient side):**

```typescript
function unwrapGiftWrap(wrap: Event, recipientSk: Uint8Array): Rumor {
  // Layer 3 → Layer 2: Decrypt gift wrap to get seal
  const wrapConversationKey = nip44.v2.utils.getConversationKey(recipientSk, wrap.pubkey)
  const seal: Event = JSON.parse(nip44.v2.decrypt(wrap.content, wrapConversationKey))

  // Verify seal signature (signed by sender's real key)
  if (!verifyEvent(seal)) {
    throw new Error('Invalid seal signature')
  }
  if (seal.kind !== 13) {
    throw new Error('Expected kind 13 seal')
  }

  // Layer 2 → Layer 1: Decrypt seal to get rumor
  const sealConversationKey = nip44.v2.utils.getConversationKey(recipientSk, seal.pubkey)
  const rumor: Rumor = JSON.parse(nip44.v2.decrypt(seal.content, sealConversationKey))

  // Verify rumor's pubkey matches seal's pubkey (sender consistency)
  if (rumor.pubkey !== seal.pubkey) {
    throw new Error('Rumor pubkey does not match seal pubkey')
  }

  // Rumor has NO signature — this is expected (deniability)
  // Verify rumor's event ID is correctly computed
  if (rumor.id !== getEventHash(rumor)) {
    throw new Error('Invalid rumor ID')
  }

  return rumor
}
```

---

## 3. Relay Pool Pattern

**Intent:** Manage connections to multiple relays, publish to all, subscribe on all, deduplicate received events.

```typescript
class MailRelayPool {
  private relays: Map<string, RelayConnection> = new Map()
  private seenEventIds: Set<string> = new Set()
  private maxSeenIds = 100_000

  async addRelay(url: string): Promise<void> {
    if (this.relays.has(url)) return
    const conn = new RelayConnection(url)
    await conn.connect()
    this.relays.set(url, conn)
  }

  // Publish to ALL connected relays
  async publish(event: Event): Promise<PublishResult> {
    const results = await Promise.allSettled(
      Array.from(this.relays.values()).map(r => r.publish(event))
    )

    const successes: string[] = []
    const failures: { relay: string; error: string }[] = []

    results.forEach((result, i) => {
      const url = Array.from(this.relays.keys())[i]
      if (result.status === 'fulfilled') {
        successes.push(url)
      } else {
        failures.push({ relay: url, error: result.reason?.message || 'unknown' })
      }
    })

    if (successes.length === 0) {
      throw new Error(`Failed to publish to any relay: ${JSON.stringify(failures)}`)
    }

    return { successes, failures }
  }

  // Subscribe on ALL relays, deduplicate by event ID
  subscribe(
    filters: Filter[],
    onEvent: (event: Event) => void,
    onEose?: () => void
  ): () => void {
    let eoseCount = 0
    const totalRelays = this.relays.size

    const subs = Array.from(this.relays.values()).map(relay =>
      relay.subscribe(filters, {
        onevent: (event: Event) => {
          // Deduplicate by event ID
          if (this.seenEventIds.has(event.id)) return
          this.seenEventIds.add(event.id)

          // Evict old IDs to prevent unbounded growth
          if (this.seenEventIds.size > this.maxSeenIds) {
            const iter = this.seenEventIds.values()
            for (let i = 0; i < this.maxSeenIds / 2; i++) {
              this.seenEventIds.delete(iter.next().value)
            }
          }

          onEvent(event)
        },
        oneose: () => {
          eoseCount++
          if (eoseCount === totalRelays && onEose) {
            onEose()
          }
        },
      })
    )

    // Return unsubscribe function
    return () => subs.forEach(s => s.close())
  }

  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.relays.values()).map(r => r.close())
    )
    this.relays.clear()
  }
}
```

---

## 4. Inbox Subscription Pattern

**Intent:** Subscribe to gift-wrapped events addressed to the current user.

```typescript
function subscribeToInbox(
  pool: MailRelayPool,
  myPubkey: string,
  since: number,
  onMessage: (rumor: Rumor, wrap: Event) => void,
  mySecKey: Uint8Array,
): () => void {
  const filter: Filter = {
    kinds: [1059],            // Gift wrap
    '#p': [myPubkey],         // Addressed to me
    since: since,             // Only new messages
  }

  return pool.subscribe([filter], async (wrap: Event) => {
    try {
      // Verify the gift wrap event
      if (!verifyEvent(wrap)) return

      // Unwrap
      const rumor = unwrapGiftWrap(wrap, mySecKey)

      // Filter to only kind 15 (NOSTR Mail)
      if (rumor.kind !== 15) return

      onMessage(rumor, wrap)
    } catch (err) {
      // Decryption failure — event was not addressed to us or is corrupted
      // Silently ignore (do not log the error contents — may contain partial decryption)
    }
  })
}
```

**Relay selection for inbox subscriptions:**

```typescript
async function getInboxRelays(myPubkey: string, pool: MailRelayPool): Promise<string[]> {
  // Fetch NIP-65 relay list (kind 10002)
  const relayListEvents = await pool.query([{
    kinds: [10002],
    authors: [myPubkey],
    limit: 1,
  }])

  if (relayListEvents.length === 0) {
    // Fallback to well-known relays
    return ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band']
  }

  // Extract read relays (where others should publish to reach us)
  const relayList = relayListEvents[0]
  const readRelays = relayList.tags
    .filter(t => t[0] === 'r' && (t[2] === undefined || t[2] === 'read'))
    .map(t => t[1])

  return readRelays
}
```

---

## 5. Cashu Token Attachment Pattern

**Intent:** Attach Cashu postage tokens to a NOSTR Mail message.

```typescript
import { CashuMint, CashuWallet } from '@cashu/cashu-ts'

async function attachPostage(
  rumor: UnsignedEvent,
  amount: number,          // sats
  mintUrl: string,
): Promise<UnsignedEvent> {
  // Initialize Cashu wallet
  const mint = new CashuMint(mintUrl)
  const wallet = new CashuWallet(mint)
  await wallet.loadMint()

  // Create tokens of the specified amount
  // The wallet selects proofs from its local store
  const { send: sendProofs, keep: keepProofs } = await wallet.send(amount)

  // Serialize the token in NUT-00 format (cashuA... or cashuB...)
  const token = {
    mint: mintUrl,
    proofs: sendProofs,
  }
  const serialized = serializeCashuToken(token)  // "cashuA..."

  // Add token to rumor tags
  const updatedRumor = {
    ...rumor,
    tags: [
      ...rumor.tags,
      ['cashu', serialized, amount.toString()],
    ],
  }

  return updatedRumor
}

// Recipient side: claim postage from a received message
async function claimPostage(
  rumor: Rumor,
  mintUrl: string,
): Promise<{ amount: number; claimed: boolean }> {
  const cashuTags = rumor.tags.filter(t => t[0] === 'cashu')
  if (cashuTags.length === 0) {
    return { amount: 0, claimed: false }
  }

  const mint = new CashuMint(mintUrl)
  const wallet = new CashuWallet(mint)
  await wallet.loadMint()

  let totalClaimed = 0

  for (const [, tokenStr] of cashuTags) {
    try {
      const token = deserializeCashuToken(tokenStr)
      // Receive (swap) the token into our wallet
      const received = await wallet.receive(token)
      totalClaimed += received.reduce((sum, p) => sum + p.amount, 0)
    } catch (err) {
      // Token may already be spent (double-claim attempt) or invalid
      // Log but continue with remaining tokens
    }
  }

  return { amount: totalClaimed, claimed: totalClaimed > 0 }
}
```

---

## 6. Blossom Upload Pattern

**Intent:** Encrypt a file, upload to Blossom, and produce an attachment reference for inclusion in a NOSTR Mail event.

```typescript
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'

interface AttachmentMeta {
  url: string
  hash: string              // SHA-256 of encrypted content
  encryptionKey: string     // hex-encoded 32-byte key
  filename: string
  mimeType: string
  size: number              // original unencrypted size
}

async function uploadAttachment(
  file: Buffer,
  filename: string,
  mimeType: string,
  blossomUrl: string,
  signerSk: Uint8Array,     // for NIP-98 auth header
): Promise<AttachmentMeta> {
  // Step 1: Generate random encryption key
  const encKey = randomBytes(32)

  // Step 2: Encrypt file with ChaCha20 (or AES-256-GCM)
  const nonce = randomBytes(12)
  const cipher = createCipheriv('chacha20-poly1305', encKey, nonce)
  const encrypted = Buffer.concat([nonce, cipher.update(file), cipher.final(), cipher.getAuthTag()])

  // Step 3: Compute SHA-256 of encrypted content
  const hash = createHash('sha256').update(encrypted).digest('hex')

  // Step 4: Upload to Blossom
  // Blossom uses NIP-98 HTTP auth (event signed by uploader)
  const authEvent = finalizeEvent({
    kind: 24242,             // NIP-98 HTTP auth
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', `${blossomUrl}/upload`],
      ['method', 'PUT'],
    ],
    content: '',
  }, signerSk)

  const response = await fetch(`${blossomUrl}/upload`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Authorization': `Nostr ${btoa(JSON.stringify(authEvent))}`,
    },
    body: encrypted,
  })

  if (!response.ok) {
    throw new Error(`Blossom upload failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()

  return {
    url: result.url || `${blossomUrl}/${hash}`,
    hash,
    encryptionKey: encKey.toString('hex'),
    filename,
    mimeType,
    size: file.length,
  }
}

// Download and decrypt
async function downloadAttachment(meta: AttachmentMeta): Promise<Buffer> {
  const response = await fetch(meta.url)
  if (!response.ok) {
    throw new Error(`Blossom download failed: ${response.status}`)
  }

  const encrypted = Buffer.from(await response.arrayBuffer())
  const encKey = Buffer.from(meta.encryptionKey, 'hex')

  // Extract nonce (first 12 bytes) and auth tag (last 16 bytes)
  const nonce = encrypted.subarray(0, 12)
  const authTag = encrypted.subarray(encrypted.length - 16)
  const ciphertext = encrypted.subarray(12, encrypted.length - 16)

  const decipher = createDecipheriv('chacha20-poly1305', encKey, nonce)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

  // Verify original size
  if (decrypted.length !== meta.size) {
    throw new Error(`Size mismatch: expected ${meta.size}, got ${decrypted.length}`)
  }

  return decrypted
}
```

---

## 7. Test Vector Format

**Intent:** Provide machine-readable test vectors that cover all intermediate computation values.

```json
{
  "name": "nip44_encryption_basic",
  "description": "Basic NIP-44 v2 encryption with known keys and nonce",
  "input": {
    "sender_secret_key": "0000000000000000000000000000000000000000000000000000000000000001",
    "recipient_public_key": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "plaintext": "Hello, NOSTR Mail!",
    "nonce_override": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "intermediate": {
    "ecdh_shared_point_x": "...64 hex chars...",
    "conversation_key": "...64 hex chars...",
    "hkdf_expand_output_76_bytes": "...152 hex chars...",
    "chacha20_key": "...64 hex chars...",
    "chacha20_nonce": "...24 hex chars...",
    "hmac_key": "...64 hex chars...",
    "plaintext_length": 18,
    "padded_length": 32,
    "padded_plaintext": "...hex...",
    "ciphertext_before_mac": "...hex...",
    "hmac_input": "...hex (nonce || ciphertext)...",
    "hmac_output": "...64 hex chars..."
  },
  "output": {
    "payload_hex": "02aa...mac_hex",
    "payload_base64": "Aqqqqqq..."
  }
}
```

**Test vector categories:**

1. **NIP-44 encryption vectors:**
   - Known key pairs, known nonces, verify all intermediate values
   - Edge cases: empty plaintext (1 byte), max plaintext (65535 bytes), padding boundary values
   - Non-ASCII plaintext (emoji, CJK, RTL)

2. **NIP-44 decryption failure vectors:**
   - Wrong version byte (0x00, 0x01, 0x03, 0xff)
   - Truncated payload (less than 99 bytes minimum)
   - Corrupted MAC (flip one bit)
   - Wrong decryption key

3. **NIP-59 gift wrap vectors:**
   - Full three-layer wrap with known keys at each layer
   - Multi-recipient wrapping (same rumor, different wraps)
   - Verify timestamp randomization range

4. **Event ID vectors:**
   - Known event contents, verify SHA-256 hash
   - Edge cases: empty tags, empty content, maximum-length content
   - Unicode in content and tags

5. **BIP-340 signature vectors:**
   - Use official BIP-340 test vectors from the BIP repository
   - Verify both signing and verification

6. **Cashu token vectors:**
   - Serialized token format (cashuA/cashuB)
   - BDHKE blinding and unblinding with known random values

---

## 8. Error Handling Patterns

### Fail Closed for Cryptographic Operations

```typescript
// WRONG: Partial decryption on error
function decryptMessage(ciphertext: string, key: Uint8Array): string {
  try {
    return nip44.v2.decrypt(ciphertext, key)
  } catch {
    return '[Decryption failed — showing partial data]'  // NEVER do this
  }
}

// RIGHT: Complete failure, no partial data
function decryptMessage(ciphertext: string, key: Uint8Array): string | null {
  try {
    return nip44.v2.decrypt(ciphertext, key)
  } catch {
    return null  // No partial data, no error details that might leak info
  }
}
```

### Uniform Error Responses

Do not distinguish between MAC failure, padding failure, and parsing failure in user-facing error messages. All should produce the same generic "decryption failed" error.

```typescript
// WRONG: Leaks information about which step failed
catch (err) {
  if (err.message.includes('MAC')) throw new Error('MAC verification failed')
  if (err.message.includes('padding')) throw new Error('Invalid padding')
  if (err.message.includes('JSON')) throw new Error('Invalid message format')
}

// RIGHT: Uniform error regardless of failure step
catch (err) {
  throw new Error('Message could not be decrypted')
}
```

### Relay Error Recovery

```typescript
async function publishWithRetry(
  pool: MailRelayPool,
  event: Event,
  maxRetries: number = 3,
): Promise<PublishResult> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await pool.publish(event)
    } catch (err) {
      lastError = err as Error

      // Do NOT retry on auth errors (NIP-42)
      if (err.message?.includes('auth-required')) throw err

      // Do NOT retry on permanently rejected events
      if (err.message?.includes('blocked') || err.message?.includes('rate-limited')) throw err

      // Retry on transient errors (network, timeout)
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
```
