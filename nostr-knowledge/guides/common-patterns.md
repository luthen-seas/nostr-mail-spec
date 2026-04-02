# Common NOSTR Design Patterns

> Reusable patterns that appear across NOSTR applications. Each pattern describes
> the problem, the protocol mechanism, implementation approach, and practical
> considerations. These patterns are the building blocks for clients, relays,
> bots, bridges, and specialized applications.

---

## Table of Contents

1. [Replaceable Event Pattern](#1-replaceable-event-pattern)
2. [Addressable Event Pattern](#2-addressable-event-pattern)
3. [List Pattern (NIP-51)](#3-list-pattern-nip-51)
4. [Gift Wrap Pattern (NIP-59)](#4-gift-wrap-pattern-nip-59)
5. [Outbox Relay Selection Pattern (NIP-65)](#5-outbox-relay-selection-pattern-nip-65)
6. [Zap Integration Pattern (NIP-57)](#6-zap-integration-pattern-nip-57)
7. [NIP-05 Verification Pattern](#7-nip-05-verification-pattern)
8. [Bot Pattern](#8-bot-pattern)
9. [Bridge/Proxy Pattern (NIP-48)](#9-bridgeproxy-pattern-nip-48)
10. [DVM Job Pattern (NIP-90)](#10-dvm-job-pattern-nip-90)
11. [Relay-Enforced Group Pattern (NIP-29)](#11-relay-enforced-group-pattern-nip-29)

---

## 1. Replaceable Event Pattern

### Problem

A user needs to update a piece of information (profile, follow list, settings) without creating duplicate entries. Regular NOSTR events are immutable and permanent -- there is no "edit" operation.

### Mechanism

Event kinds in the range **0, 3, 10000-19999** are replaceable. For a given `(pubkey, kind)` pair, only one event exists at a time. When a relay receives a newer replaceable event, it deletes the old one.

### Replacement Rules

```
On receiving a replaceable event:
  existing = store.get(event.pubkey, event.kind)

  if existing is null:
      store(event)
  else if event.created_at > existing.created_at:
      replace(existing, event)
  else if event.created_at == existing.created_at and event.id < existing.id:
      replace(existing, event)   // lower id wins as tiebreaker
  else:
      discard(event)
```

### Common Replaceable Kinds

| Kind | Purpose | Content |
|------|---------|---------|
| 0 | User metadata (profile) | JSON: `{"name", "about", "picture", "nip05", ...}` |
| 3 | Follow list (contacts) | JSON or empty; `p` tags list followed pubkeys |
| 10000 | Mute list | Tags list muted pubkeys, words, hashtags |
| 10001 | Pinned notes | `e` tags list pinned event IDs |
| 10002 | Relay list metadata (NIP-65) | `r` tags list relays with read/write markers |
| 10003 | Bookmarks | `e` and `a` tags |
| 10050 | DM relay list | `relay` tags list preferred DM relays |

### Implementation Notes

- **Clients reading:** Always fetch with the filter `{"kinds": [K], "authors": [pubkey]}`. Relays return only the latest version.
- **Clients writing:** Create a new event with the full updated state and a fresh `created_at`. There is no diff/patch -- you replace the entire event.
- **Relays:** On receiving a replaceable event, compare with stored version. Keep the newer one. Delete the older.
- **Caching:** Cache locally by `(pubkey, kind)`. Show cached data immediately, fetch fresh in background. Update display if the fresh version is newer.

### Gotchas

- If a user updates their profile on Client A and Client B simultaneously, the event with the later `created_at` wins. If timestamps are identical, the event with the lexicographically lower `id` wins.
- Always include all fields when updating. If you update just the `name` but omit `picture`, the picture is deleted.
- Clients should read-before-write: fetch the current event, modify the desired fields, and republish.

---

## 2. Addressable Event Pattern

### Problem

A user needs multiple replaceable entries of the same kind -- e.g., multiple blog articles (all kind 30023), multiple bookmark sets, or multiple relay sets. The basic replaceable pattern only allows one event per `(pubkey, kind)`.

### Mechanism

Event kinds in the range **30000-39999** are addressable. The replacement key is `(pubkey, kind, d-tag)`, where the `d` tag is a user-defined identifier.

```json
{
  "kind": 30023,
  "tags": [
    ["d", "my-first-article"],
    ["title", "My First Article"],
    ["published_at", "1700000000"]
  ],
  "content": "The article body in Markdown..."
}
```

### Addressing

An addressable event is referenced by a coordinate: `kind:pubkey:d-tag`.

In NIP-19 bech32 encoding, this becomes an `naddr`:

```
naddr1qqxnzd3e8qmrzv3exsmnzwpc...
```

In event tags, addressable events are referenced with `a` tags:

```json
["a", "30023:<pubkey>:my-first-article", "<relay-hint>"]
```

### Replacement Rules

Same as replaceable events, but the key includes the `d` tag:

```
existing = store.get(event.pubkey, event.kind, event.d_tag)
// Same comparison logic as replaceable events
```

### Common Addressable Kinds

| Kind | Purpose | d-tag Convention |
|------|---------|-----------------|
| 30023 | Long-form article | Slug or identifier (e.g., `"my-article-slug"`) |
| 30000 | Follow set | Category name (e.g., `"bitcoin-devs"`) |
| 30002 | Relay set | Set name (e.g., `"search-relays"`) |
| 30003 | Bookmark set | Category name |
| 30030 | Emoji set | Set name |
| 30078 | Application-specific data | Application-defined namespace |
| 31923 | Calendar event (date-based) | Unique event identifier |
| 31924 | Calendar | Calendar identifier |
| 34550 | Community definition | Community name |
| 39000 | Group metadata (NIP-29) | Group ID |

### Implementation Notes

- **Creating:** Choose a stable `d` tag that will not change (slug, UUID, or deterministic identifier).
- **Updating:** Create a new event with the same `(kind, d-tag)` and a newer `created_at`. The old version is replaced.
- **Querying:** Use `#d` filter: `{"kinds": [30023], "authors": [pk], "#d": ["my-article"]}`.
- **Listing all:** Omit the `#d` filter: `{"kinds": [30023], "authors": [pk]}` returns all articles by that user.

---

## 3. List Pattern (NIP-51)

### Problem

Users need to organize collections of things: people to follow, events to bookmark, relays to prefer, topics of interest, items to mute. These lists may contain public items (visible to everyone) and private items (encrypted, visible only to the user).

### Mechanism

NIP-51 defines two categories of lists:

**Standard lists** (one per user per kind):
- The user has exactly one mute list (kind 10000), one bookmark list (kind 10003), etc.
- These are replaceable events.

**Sets** (multiple per user per kind, differentiated by `d` tag):
- The user can have multiple follow sets (kind 30000), bookmark sets (kind 30003), etc.
- These are addressable events.

### Public vs Private Items

```json
{
  "kind": 10003,
  "tags": [
    ["e", "<event-id>"],            // public bookmark
    ["a", "30023:<pk>:article-1"]   // public bookmark
  ],
  "content": "<NIP-44 encrypted JSON>"  // private bookmarks
}
```

The `content` field, when non-empty, contains a NIP-44 encrypted JSON array of tags. Only the user (with their private key) can decrypt and read the private items.

### Decrypting Private List Items

```
1. Decrypt content using NIP-44 with the user's own keys (encrypt to self)
2. Parse the decrypted JSON as an array of tags
3. Merge with the public tags to get the full list
```

### Implementation Pattern

```typescript
async function getFullList(ndk: NDK, kind: number, pubkey: string) {
  const event = await ndk.fetchEvent({ kinds: [kind], authors: [pubkey] })
  if (!event) return []

  // Public items from tags
  const publicItems = event.tags

  // Private items from encrypted content
  let privateItems = []
  if (event.content) {
    const decrypted = await ndk.signer.decrypt(pubkey, event.content)
    privateItems = JSON.parse(decrypted)
  }

  return [...publicItems, ...privateItems]
}
```

### Updating a List

Read the current event, modify the tag array, re-encrypt private items, and publish a new replaceable/addressable event with the updated tags.

Always read-before-write to avoid overwriting concurrent changes from other clients.

### Common Lists

| Kind | Name | Tag Types | Private Support |
|------|------|-----------|----------------|
| 10000 | Mute list | `p`, `e`, `t`, `word` | Yes (hide who you mute) |
| 10001 | Pinned notes | `e` | Unlikely needed |
| 10003 | Bookmarks | `e`, `a` | Yes (private bookmarks) |
| 10050 | DM relays | `relay` | Not typically |
| 30000 | Follow sets | `p` | Possible |
| 30003 | Bookmark sets | `e`, `a` | Yes |

---

## 4. Gift Wrap Pattern (NIP-59)

### Problem

Standard NOSTR events expose metadata: who sent it (`pubkey`), who it is addressed to (`p` tags), and the content. Even with encrypted content (NIP-04), the sender and recipient are visible. Private messaging requires hiding this metadata from both relay operators and passive observers.

### Mechanism

Three nested layers of wrapping:

```
Layer 1: RUMOR (unsigned event)
  - The actual message content
  - Pubkey = sender's real pubkey
  - No signature (provides deniability)

Layer 2: SEAL (kind 13)
  - Content = NIP-44 encrypt(rumor JSON, sender_privkey, recipient_pubkey)
  - Pubkey = sender's real pubkey
  - Tags = [] (empty, no metadata leakage)
  - created_at = randomized (prevent timing analysis)
  - Signed by sender

Layer 3: GIFT WRAP (kind 1059)
  - Content = NIP-44 encrypt(seal JSON, ephemeral_privkey, recipient_pubkey)
  - Pubkey = random ephemeral key (one-time use)
  - Tags = [["p", recipient_pubkey]]  (for routing only)
  - created_at = randomized
  - Signed by ephemeral key
```

### What Each Layer Hides

| Observer sees... | Without gift wrap | With gift wrap |
|-----------------|-------------------|----------------|
| Sender | pubkey field | Hidden (ephemeral key) |
| Recipient | p tag | Visible (needed for routing) |
| Content | Depends on encryption | Hidden (double-encrypted) |
| Timing | created_at | Randomized |
| Relationship | Sender-recipient link visible | Only recipient knows the sender |

### Sending Flow

```typescript
// 1. Create the rumor (unsigned)
const rumor = {
  kind: 14,  // NIP-17 DM
  pubkey: senderPubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['p', recipientPubkey]],
  content: 'Hello, this is private!',
  id: computeEventId(...)  // compute but do NOT sign
}

// 2. Create the seal
const sealContent = nip44Encrypt(JSON.stringify(rumor), senderPrivkey, recipientPubkey)
const seal = finalizeEvent({
  kind: 13,
  created_at: randomizeTimestamp(),
  tags: [],
  content: sealContent
}, senderPrivkey)

// 3. Create the gift wrap
const ephemeralKey = generateSecretKey()
const wrapContent = nip44Encrypt(JSON.stringify(seal), ephemeralKey, recipientPubkey)
const giftWrap = finalizeEvent({
  kind: 1059,
  created_at: randomizeTimestamp(),
  tags: [['p', recipientPubkey]],
  content: wrapContent
}, ephemeralKey)

// 4. Publish the gift wrap to recipient's DM relays (kind 10050)
```

### Receiving Flow

```typescript
// Subscribe: { kinds: [1059], "#p": [myPubkey] }

// On receiving a gift wrap:
const sealJSON = nip44Decrypt(giftWrap.content, myPrivkey, giftWrap.pubkey)
const seal = JSON.parse(sealJSON)

const rumorJSON = nip44Decrypt(seal.content, myPrivkey, seal.pubkey)
const rumor = JSON.parse(rumorJSON)

// rumor.pubkey = real sender
// rumor.content = the message
// rumor.kind = 14 (DM) or any other kind
```

### Use Cases Beyond DMs

Gift wrap is not limited to direct messages. Any event kind can be wrapped:
- Private zap requests.
- Private reactions.
- Sealed announcements to specific recipients.
- Any event where metadata privacy matters.

---

## 5. Outbox Relay Selection Pattern (NIP-65)

### Problem

With thousands of relays, clients face a routing problem: where should they look for a specific user's events, and where should they send events intended for that user?

### Mechanism

Each user publishes a kind 10002 replaceable event declaring their relay preferences:

```json
{
  "kind": 10002,
  "tags": [
    ["r", "wss://relay-a.com"],                // both read and write
    ["r", "wss://relay-b.com", "write"],       // write only (outbox)
    ["r", "wss://relay-c.com", "read"]         // read only (inbox)
  ]
}
```

### Routing Rules

| I want to... | Connect to... | Source |
|-------------|--------------|--------|
| Read Alice's posts | Alice's WRITE relays | Alice's kind:10002 |
| Send a reply to Alice | Alice's READ relays + my WRITE relays | Both kind:10002 events |
| Read my mentions | My READ relays | My kind:10002 |
| Publish my post | My WRITE relays | My kind:10002 |

### Implementation Pattern

```typescript
function getRelaysForReading(targetPubkeys: string[]): Map<string, string[]> {
  const relayToPubkeys = new Map<string, string[]>()

  for (const pk of targetPubkeys) {
    const relayList = cache.getRelayList(pk)  // kind:10002
    if (!relayList) {
      // Fallback: use default relays
      addToMap(relayToPubkeys, DEFAULT_RELAYS, pk)
      continue
    }
    for (const relay of relayList.writeRelays) {
      addToMap(relayToPubkeys, relay, pk)
    }
  }

  return relayToPubkeys
}

function getRelaysForWriting(event: Event): string[] {
  const relays = new Set<string>()

  // My write relays
  for (const r of myRelayList.writeRelays) relays.add(r)

  // Read relays of mentioned users
  for (const pTag of event.tags.filter(t => t[0] === 'p')) {
    const theirList = cache.getRelayList(pTag[1])
    if (theirList) {
      for (const r of theirList.readRelays) relays.add(r)
    }
  }

  return [...relays]
}
```

### Bootstrap Problem

To fetch a user's relay list, you need to find a relay that has it. Solutions:

1. **Indexing relays:** `wss://purplepag.es` and similar relays archive kind 10002 events broadly.
2. **NIP-05 resolution:** `.well-known/nostr.json` includes relay hints.
3. **NIP-19 hints:** `nprofile` and `nevent` bech32 strings carry relay URLs.
4. **Tag hints:** `p` and `e` tags can include a relay URL as the third element.

### Caching and Refresh

- Cache kind 10002 events locally.
- Refresh periodically (every hour or when viewing a profile).
- Fall back to cached data if fresh fetch fails.
- Bootstrap from well-known relays, then transition to per-user relay discovery.

---

## 6. Zap Integration Pattern (NIP-57)

### Problem

Record verifiable Lightning payments between NOSTR users so clients can display social tipping on posts and profiles.

### Mechanism

Two event kinds:
- **Kind 9734 (zap request):** Created by the sender's client, NOT published to relays. Sent to the recipient's LNURL server.
- **Kind 9735 (zap receipt):** Created by the recipient's LNURL server after payment confirmation. Published to relays.

### Full Flow

```
1. Client fetches recipient's LNURL-pay endpoint
   - Parse lud16 from their kind:0 profile (e.g., "alice@wallet.com")
   - GET https://wallet.com/.well-known/lnurlp/alice
   - Response includes: allowsNostr, nostrPubkey, callback, min/max

2. Client creates kind 9734 zap request (signed, not published)
   - Tags: relays, amount, p (recipient), e (event being zapped)
   - Content: optional zap comment

3. Client sends zap request to LNURL callback
   - GET callback?amount=21000&nostr=<url-encoded-9734>&lnurl=<bech32>
   - Server returns a BOLT11 Lightning invoice

4. User pays the invoice (via wallet, NIP-47 NWC, or in-app Lightning)

5. LNURL server detects payment, creates kind 9735 zap receipt
   - Tags: p, e, bolt11, description (original zap request JSON)
   - Publishes to relays listed in the zap request

6. Clients fetch zap receipts and display them
   - Subscribe: {"kinds": [9735], "#e": [event_id]}
   - Verify: receipt pubkey matches LNURL server's nostrPubkey
   - Extract amount from bolt11 tag
```

### Verification Checklist

When displaying a zap receipt:
1. The `description` tag must contain a valid kind 9734 event.
2. The kind 9734 event signature must be valid.
3. The zap receipt `pubkey` must match the `nostrPubkey` from the LNURL server.
4. The `p` tag in the receipt must match the `p` tag in the request.
5. The `e` tag (if present) must match between request and receipt.

### Zap Splits

Events can specify multiple zap recipients with weighted distribution:

```json
["zap", "<pubkey-1>", "<relay>", "1"],
["zap", "<pubkey-2>", "<relay>", "1"]
```

The weight values determine the split ratio. A client supporting zap splits sends separate zap requests to each recipient.

---

## 7. NIP-05 Verification Pattern

### Problem

NOSTR public keys are 64-character hex strings or bech32-encoded npubs. Neither is human-friendly. Users want an email-like identifier (`alice@example.com`) that maps to their pubkey.

### Mechanism

A domain operator hosts a `.well-known/nostr.json` file that maps names to pubkeys:

```
GET https://example.com/.well-known/nostr.json?name=alice

Response:
{
  "names": {
    "alice": "abcdef1234567890..."
  },
  "relays": {
    "abcdef1234567890...": ["wss://relay-a.com", "wss://relay-b.com"]
  }
}
```

### Verification Flow

```typescript
async function verifyNip05(identifier: string, expectedPubkey: string): Promise<boolean> {
  const [name, domain] = identifier.split('@')
  if (!name || !domain) return false

  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await response.json()

    const pubkey = data?.names?.[name]
    return pubkey === expectedPubkey
  } catch {
    return false  // network error, timeout, or parse error
  }
}
```

### Implementation Notes

- **CORS:** The server must send `Access-Control-Allow-Origin: *` for browser clients.
- **Caching:** Cache results for 1-24 hours. NIP-05 mappings change infrequently.
- **Display:** Show the identifier as a verified badge or next to the display name. Show unverified/pending/failed states clearly.
- **Relay hints:** The `relays` field in the response provides relay hints for the outbox model. Use them to bootstrap relay discovery for unknown users.
- **Security:** NIP-05 is cosmetic verification, not cryptographic proof. The domain operator can change the mapping at any time. It is DNS-based trust, not key-based trust.

### Running a NIP-05 Server

Serve a JSON file at `/.well-known/nostr.json`. Can be static (for personal sites) or dynamic (for multi-user services):

```typescript
// Express.js example
app.get('/.well-known/nostr.json', (req, res) => {
  const name = req.query.name
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json({
    names: { [name]: lookupPubkey(name) },
    relays: { [lookupPubkey(name)]: ['wss://relay.example.com'] }
  })
})
```

---

## 8. Bot Pattern

### Problem

Automate actions on NOSTR: post scheduled content, respond to mentions, aggregate data, bridge from other platforms, or run services.

### Mechanism

A bot is a NOSTR client that runs autonomously. It has its own keypair, connects to relays, subscribes to relevant events, and publishes responses.

### Architecture

```
+------------------+
|     Bot Logic    |
|  (your code)     |
+--------+---------+
         |
+--------+---------+
|  NOSTR Library   |
|  (nostr-tools,   |
|   nostr-sdk,     |
|   go-nostr)      |
+--------+---------+
         |
+--------+---------+
|  Relay Pool      |
|  (subscribe +    |
|   publish)       |
+------------------+
```

### Implementation Pattern

```typescript
import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'

const sk = generateSecretKey()  // or load from config
const pk = getPublicKey(sk)
const pool = new SimplePool()
const relays = ['wss://relay-a.com', 'wss://relay-b.com']

// Subscribe to mentions
const sub = pool.subscribeMany(relays, [
  { kinds: [1], '#p': [pk], since: Math.floor(Date.now() / 1000) }
], {
  onevent(event) {
    // Process the mention
    const response = generateResponse(event)

    // Publish a reply
    const reply = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', event.id, '', 'root'],
        ['p', event.pubkey],
      ],
      content: response,
    }, sk)

    pool.publish(relays, reply)
  }
})
```

### Bot Best Practices

- **Identify as a bot:** Set `"bot": true` in the kind 0 profile metadata (NIP-24).
- **Rate limit yourself:** Do not spam relays. Add delays between publishes.
- **Handle errors gracefully:** Relays may reject your events. Log and continue.
- **Use a dedicated keypair:** Do not reuse a human user's key.
- **Respect mute lists:** Check if the mentioning user has muted the bot before replying.
- **Publish a kind 10002 relay list:** So users know where to find the bot.

---

## 9. Bridge/Proxy Pattern (NIP-48)

### Problem

Content from other protocols (RSS, ActivityPub, Twitter/X, Telegram) should be accessible on NOSTR without requiring the original author to run a NOSTR client.

### Mechanism

A bridge creates NOSTR events on behalf of external users. NIP-48 defines proxy tags to indicate bridged content:

```json
{
  "kind": 1,
  "pubkey": "<bridge-assigned-pubkey>",
  "tags": [
    ["proxy", "https://twitter.com/alice/status/12345", "web"],
    ["proxy", "https://mastodon.social/@alice/12345", "activitypub"]
  ],
  "content": "The original post content..."
}
```

### Architecture

```
External Platform         Bridge Server           NOSTR Relays
  |                          |                        |
  |-- New post -->           |                        |
  |                          |-- Create event ------->|
  |                          |   (with proxy tag)     |
  |                          |                        |
  |                          |<-- Mentions/replies ---|
  |<-- Deliver reply --------|                        |
```

### Implementation Approaches

1. **One keypair per external user:** The bridge generates and manages a NOSTR keypair for each bridged user. Their profile (kind 0) includes the proxy tag and a clear indication that this is a bridge account.

2. **Single bridge keypair:** All bridged content comes from one keypair. The original author is attributed in the content or tags.

3. **User-authorized bridge:** External users authorize the bridge to post on their behalf by connecting their existing NOSTR key (more complex but more authentic).

### Ethical Considerations

- Clearly mark bridged content so users know it is not native NOSTR.
- Respect the original platform's terms of service.
- Allow the original author to claim or disable their bridge account.
- Consider whether the original author would want their content on NOSTR.

---

## 10. DVM Job Pattern (NIP-90)

### Problem

Users need on-demand computation (AI inference, image generation, translation, transcription) without centralized API services. Service providers need a marketplace to offer their services.

### Mechanism

Three event kinds form a job lifecycle:

| Kind Range | Role | Published By |
|-----------|------|-------------|
| 5000-5999 | Job request | Customer |
| 6000-6999 | Job result | Service provider (result kind = request kind + 1000) |
| 7000 | Job feedback | Service provider (status updates) |

### Job Flow

```
Customer                    DVM (Service Provider)        Relays
  |                              |                          |
  |-- kind 5050 job request ---->|                          |
  |   (text generation)         |                          |
  |                              |                          |
  |                              |-- kind 7000 feedback --->|
  |<-- "processing" ------------|   (status: processing)   |
  |                              |                          |
  |                              |-- kind 6050 result ----->|
  |<-- result text --------------|   (with amount tag)      |
  |                              |                          |
  |-- Lightning payment -------->|                          |
```

### Job Request (Customer Side)

```json
{
  "kind": 5050,
  "tags": [
    ["i", "Explain NOSTR in one paragraph", "text"],
    ["param", "model", "gpt-4"],
    ["param", "max_tokens", "200"],
    ["bid", "1000"],
    ["relays", "wss://relay-a.com", "wss://relay-b.com"]
  ],
  "content": ""
}
```

### Job Result (DVM Side)

```json
{
  "kind": 6050,
  "tags": [
    ["request", "<stringified-original-request>"],
    ["e", "<request-event-id>", "<relay-hint>"],
    ["p", "<customer-pubkey>"],
    ["amount", "500", "<bolt11-invoice>"]
  ],
  "content": "NOSTR is a decentralized protocol..."
}
```

### Implementation Pattern (DVM Provider)

```typescript
// Subscribe to job requests for your supported kinds
const sub = pool.subscribeMany(relays, [
  { kinds: [5050], since: Math.floor(Date.now() / 1000) }
], {
  async onevent(request) {
    // 1. Parse input and params
    const input = request.tags.find(t => t[0] === 'i')?.[1]
    const model = request.tags.find(t => t[0] === 'param' && t[1] === 'model')?.[2]

    // 2. Send feedback (processing)
    publishFeedback(request, 'processing')

    // 3. Do the work
    const result = await runInference(input, model)

    // 4. Publish result
    const resultEvent = finalizeEvent({
      kind: 6050,
      tags: [
        ['request', JSON.stringify(request)],
        ['e', request.id, relayHint],
        ['p', request.pubkey],
        ['amount', '500', generateInvoice(500)]
      ],
      content: result
    }, dvmSecretKey)

    pool.publish(relays, resultEvent)
  }
})
```

### Well-Known Job Types

| Request Kind | Result Kind | Type |
|-------------|-------------|------|
| 5000 | 6000 | Text extraction / OCR |
| 5001 | 6001 | Summarization |
| 5002 | 6002 | Translation |
| 5050 | 6050 | Text generation (LLM) |
| 5100 | 6100 | Image generation |
| 5250 | 6250 | Text-to-speech |
| 5300 | 6300 | Speech-to-text |

### Design Considerations

- **Competition:** Multiple DVMs can respond to the same request. Customers choose the best result.
- **Payment:** DVMs include a Lightning invoice in the result. Payment is optional but incentivized.
- **Encryption:** The `encrypted` tag signals that inputs and outputs are NIP-44 encrypted between customer and DVM for privacy.
- **Chaining:** A job's `i` tag can reference another job's event ID, creating a pipeline (e.g., transcribe audio, then summarize the text).

---

## 11. Relay-Enforced Group Pattern (NIP-29)

### Problem

NIP-28 public channels have no enforceable access control -- anyone can post, and moderation is advisory. Communities need actual access restrictions: private groups, invite-only channels, admin hierarchies with real enforcement.

### Mechanism

The relay is the authority for group state. Groups are identified by `<relay-host>'<group-id>` and scoped to the relay that hosts them.

### Event Kinds

**User events** (any kind, with `h` tag):
```json
{
  "kind": 9,
  "tags": [["h", "<group-id>"]],
  "content": "Hello, group!"
}
```

**Admin moderation events:**

| Kind | Action | Key Tags |
|------|--------|----------|
| 9000 | Add/update user | `p` (pubkey + optional roles) |
| 9001 | Remove user | `p` (pubkey) |
| 9002 | Edit group metadata | Metadata fields |
| 9005 | Delete event | `e` (event ID) |
| 9007 | Create group | -- |
| 9008 | Delete group | -- |
| 9009 | Create invite | `code` |

**Relay-generated metadata (addressable):**

| Kind | Purpose |
|------|---------|
| 39000 | Group metadata (name, picture, access flags) |
| 39001 | Group admins (pubkeys + roles) |
| 39002 | Group members (pubkey list) |
| 39003 | Role definitions |

### Group Types

| Flag | Meaning |
|------|---------|
| `open` | Anyone can join (vs. invite/admin approval required) |
| `public` | Events are visible to non-members (vs. members only) |

### Implementation (Relay Side with Khatru)

```go
// Reject events from non-members
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        groupId := getHTag(event)
        if groupId == "" {
            return false, ""  // not a group event, allow
        }
        if !isMember(groupId, event.PubKey) {
            return true, "blocked: not a member of this group"
        }
        return false, ""
    },
)
```

### Timeline References

Events MAY include `previous` tags referencing recent events from the same group. This prevents out-of-context rebroadcasting:

```json
["previous", "<first-8-chars-of-event-id>"]
```

Relays should validate these references and reject events with invalid timeline links.

### Client-Side Implementation

```typescript
// Join a group (if open)
const joinRequest = finalizeEvent({
  kind: 9021,
  tags: [['h', groupId]],
  content: ''
}, secretKey)

// Send a message to a group
const message = finalizeEvent({
  kind: 9,
  tags: [
    ['h', groupId],
    ['previous', recentEventId.slice(0, 8)]
  ],
  content: 'Hello, group!'
}, secretKey)

// Fetch group metadata
const filter = { kinds: [39000], '#d': [groupId] }

// Fetch group messages
const filter = { kinds: [9, 11], '#h': [groupId], limit: 50 }
```

### Design Considerations

- Groups are scoped to a single relay. If the relay goes down, the group is unavailable (trade-off for enforceable moderation).
- Groups can be forked to another relay by migrating events and membership.
- The relay is trusted for enforcement -- it can censor or fabricate events within the group. Choose relay operators you trust.
- Clients should clearly display which relay hosts a group.

---

## Pattern Summary

| Pattern | Core Mechanism | Key NIPs | Primary Use Case |
|---------|---------------|----------|-----------------|
| Replaceable Event | One event per (pubkey, kind) | NIP-01 | Profiles, settings, follow lists |
| Addressable Event | One event per (pubkey, kind, d-tag) | NIP-01 | Articles, sets, app data |
| List | Replaceable/addressable + encrypted content | NIP-51 | Mutes, bookmarks, relay lists |
| Gift Wrap | Three-layer encryption | NIP-59, NIP-44 | Private DMs, sealed events |
| Outbox Relay Selection | kind:10002 relay declarations | NIP-65 | Efficient relay routing |
| Zap Integration | Zap request + LNURL + zap receipt | NIP-57 | Lightning social tipping |
| NIP-05 Verification | DNS-based name-to-pubkey mapping | NIP-05 | Human-readable identifiers |
| Bot | Autonomous NOSTR client | NIP-24 | Automation, services |
| Bridge/Proxy | Proxy tags on bridged events | NIP-48 | Cross-platform content |
| DVM Job | Request-result event pairs | NIP-90 | Decentralized compute |
| Relay-Enforced Group | Relay manages membership + permissions | NIP-29 | Private/moderated communities |

---

## Further Reading

- [Building a Client](./building-a-client.md) -- how to use these patterns in a client.
- [Building a Relay](./building-a-relay.md) -- how to support these patterns in a relay.
- [Client Architecture Patterns](../clients/architecture-patterns.md) -- advanced client architecture.
- [Relay Architecture Patterns](../relays/architecture-patterns.md) -- advanced relay architecture.
- [NIP Index](../nips/README.md) -- full NIP documentation.
