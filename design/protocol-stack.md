# NOSTR Mail Protocol Stack — Layer-by-Layer Design

> **How every layer of the legacy email stack maps to NOSTR primitives, and what the complete NOSTR Mail architecture looks like.**

---

## Table of Contents

- [Stack Comparison](#stack-comparison)
- [Layer 1: Identity](#layer-1-identity--self-sovereign-addresses)
- [Layer 2: Addressing & Discovery](#layer-2-addressing--discovery--outbox-model-replaces-mx-records)
- [Layer 3: Message Format](#layer-3-message-format--json-events-replace-mime)
- [Layer 4: Transport & Delivery](#layer-4-transport--delivery--websocket-replaces-smtp--imap)
- [Layer 5: Encryption & Privacy](#layer-5-encryption--privacy--gift-wrap-replaces-nothing)
- [Layer 6: Authentication](#layer-6-authentication--signatures-replace-spf-dkim-dmarc)
- [Layer 7: Anti-Spam](#layer-7-anti-spam--micropayments-replace-reputation-systems)
- [Layer 8: Attachments & Media](#layer-8-attachments--media--blossom-replaces-mime-attachments)
- [Layer 9: State & Sync](#layer-9-state--sync--replaceable-events-replace-imap-flags)
- [Full Architecture Diagram](#full-architecture-diagram)

---

## Stack Comparison

```
┌─────────────────────────────────────────────────────────────────────┐
│              TRADITIONAL EMAIL          │      NOSTR MAIL           │
├─────────────────────────────────────────┼───────────────────────────┤
│  Identity:  user@domain.com             │  npub + NIP-05 alias      │
│             (domain-dependent)          │  (self-sovereign)         │
│                                         │                           │
│  Addressing: DNS MX records             │  NIP-65 relay lists       │
│              (centralized registrar)    │  (user-published events)  │
│                                         │                           │
│  Sending:   SMTP (port 25/587)          │  EVENT → relay (WS)      │
│             (no native auth)            │  (signed by default)      │
│                                         │                           │
│  Routing:   MTA relay chain             │  Outbox model             │
│             (store-and-forward)         │  (direct pub/sub)         │
│                                         │                           │
│  Receiving: IMAP/POP3                   │  REQ subscription (WS)    │
│             (complex, stateful)         │  (stateless filters)      │
│                                         │                           │
│  Format:    MIME                         │  JSON events              │
│             (nested, 7-bit legacy)      │  (native Unicode)         │
│                                         │                           │
│  Encryption: PGP/S/MIME (opt-in, rare)  │  NIP-44 + Gift Wrap       │
│              TLS (transport only)       │  (native E2EE + metadata) │
│                                         │                           │
│  Auth:      SPF + DKIM + DMARC + ARC   │  Schnorr signatures       │
│             (4 retroactive patches)     │  (built into every event) │
│                                         │                           │
│  Anti-spam: Reputation + ML + RBLs      │  L402/Cashu micropayments │
│             (opaque gatekeeping)        │  (economic, transparent)  │
│                                         │                           │
│  Push:      IMAP IDLE (1 folder/conn)   │  WebSocket (multi-filter) │
│                                         │                           │
│  Deletion:  Not possible (sent = sent)  │  Kind 5 delete requests   │
│                                         │                           │
│  Threading: Message-ID/References       │  Event tags (e/p/root/    │
│             (fragile, inconsistent)     │  reply markers)           │
│                                         │                           │
│  Attachments: MIME base64 inline        │  Blossom external refs    │
│               (+33% size bloat)         │  (encrypted, deduplicated)│
│                                         │                           │
│  State sync: IMAP flags per connection  │  Replaceable events       │
│              (per-device)               │  (global, multi-device)   │
└─────────────────────────────────────────┴───────────────────────────┘
```

---

## Layer 1: Identity — Self-Sovereign Addresses

### Email's Problem

Your identity (`user@gmail.com`) is owned by Google. Switch providers = lose your identity. Google can disable your account and your entire digital presence vanishes. Identity is coupled to the transport layer — your address IS your routing path.

### NOSTR Mail Solution

```
Permanent identity  = secp256k1 keypair (npub / nsec)
Human-readable alias = NIP-05 identifier (alice@example.com)
```

The user's **npub** is their permanent, portable, cryptographic identity. NIP-05 provides the familiar `user@domain` format for discoverability, but it's a **pointer to the identity**, not the identity itself.

### How NIP-05 Works as a Mail Address

1. User sets up NIP-05 verification: `alice@example.com`
2. Domain hosts `https://example.com/.well-known/nostr.json`:
   ```json
   {
     "names": {
       "alice": "a1b2c3d4...hex_pubkey"
     },
     "relays": {
       "a1b2c3d4...hex_pubkey": ["wss://inbox.example.com"]
     }
   }
   ```
3. Sender resolves `alice@example.com` → Alice's pubkey → Alice's relay list
4. Sender delivers encrypted mail to Alice's relays

### Identity Properties

| Property | Email | NOSTR Mail |
|----------|-------|------------|
| Ownership | Domain operator | User (keypair holder) |
| Portability | Tied to provider | Take anywhere |
| Revocability | Provider can disable | Only user controls |
| Human-readable | Native (`user@domain`) | Via NIP-05 (`user@domain`) |
| Multiple identities | Separate accounts | One key, many NIP-05 aliases |
| Verification | No cryptographic proof | Digital signature on every message |
| Cost | Free (provider-dependent) or domain registration | Free (keypair generation) |
| Recovery | Provider's password reset | Mnemonic seed phrase (NIP-06) |

### Key Management Options

| Method | NIP | Description | Security Level |
|--------|-----|-------------|----------------|
| Direct key storage | — | Client holds nsec directly | Medium (encrypted at rest) |
| Browser extension | NIP-07 | Extension (Alby, nos2x) signs events | High (key isolated from client) |
| Remote signer | NIP-46 | Separate app (nsec.app, Amber) over NOSTR | Highest (key never leaves signer) |
| Android signer | NIP-55 | Intent-based signing on Android | High (OS-level isolation) |
| Mnemonic backup | NIP-06 | BIP-39 seed phrase (path: m/44'/1237'/0'/0/0) | Recovery mechanism |
| Encrypted export | NIP-49 | Password-protected `ncryptsec1...` | Backup mechanism |

### Example: Mail Address Resolution

```
1. Sender wants to mail alice@example.com

2. Client fetches: GET https://example.com/.well-known/nostr.json?name=alice
   Response: {"names": {"alice": "a1b2c3..."}, "relays": {"a1b2c3...": [...]}}

3. Client now has Alice's pubkey: a1b2c3...

4. Client fetches Alice's kind 10050 event (DM relay preferences):
   ["REQ", "relays", {"kinds": [10050], "authors": ["a1b2c3..."]}]
   
   Response: Event with tags:
   [["relay", "wss://inbox.alice.com"],
    ["relay", "wss://relay.damus.io"]]

5. Client delivers gift-wrapped mail to wss://inbox.alice.com
   and wss://relay.damus.io

6. If NIP-05 lookup fails, client can try:
   - Direct npub/nprofile sharing
   - NIP-05 on a different domain
   - Search relays (NIP-50) by name/identifier
```

---

## Layer 2: Addressing & Discovery — Outbox Model Replaces MX Records

### Email's Problem

Mail routing depends on DNS MX records. You need a domain, a registrar, correct DNS configuration. MX records are static, globally cached (TTLs), and domain-scoped. Changing mail routing requires DNS propagation.

### NOSTR Mail Solution

```
Mail routing    = Kind 10050 event (preferred inbox relays for DMs/mail)
General routing = Kind 10002 event (general relay preferences)
Discovery       = NIP-05 → .well-known/nostr.json → pubkey → relay list
```

### How Mail Routing Works

**Publishing your "MX record":**
```json
{
  "kind": 10050,
  "pubkey": "<your-pubkey>",
  "created_at": 1711843200,
  "tags": [
    ["relay", "wss://inbox.myrelay.com"],
    ["relay", "wss://relay.damus.io"],
    ["relay", "wss://nos.lol"]
  ],
  "content": "",
  "sig": "..."
}
```

This is a **replaceable event** (kind 10000-19999) — only the latest version is retained. Change your relays by publishing a new event. No DNS propagation. No registrar. Instant.

**Sending mail to someone:**
1. Resolve recipient's pubkey (NIP-05 or direct)
2. Fetch their kind 10050 event from any relay
3. Extract their preferred inbox relays
4. Gift-wrap and publish the message to those relays

### Routing Properties

| Property | Email (MX) | NOSTR Mail (10050) |
|----------|------------|-------------------|
| Update speed | DNS TTL (hours-days) | Instant (new event) |
| Dependency | DNS registrar + hosting | Any NOSTR relay |
| Cost | Domain registration ($10+/yr) | Free |
| Redundancy | Multiple MX priorities | Multiple relay tags |
| Failure mode | DNS down = no routing | Try other relays or cached list |
| Privacy | MX records are public | Relay list is public (by design) |
| Control | Registrar controls DNS | User controls their events |

### Fallback Discovery Chain

If kind 10050 is not published:
1. Check kind 10002 (general relay list) for read relays
2. Check NIP-05 `relays` field in `.well-known/nostr.json`
3. Check `nprofile` relay hints if available
4. Try well-known public relays as last resort

---

## Layer 3: Message Format — JSON Events Replace MIME

### Email's Problem

MIME is deeply nested, based on boundary strings and 7-bit encoding legacy. Parsing MIME correctly is one of the hardest problems in email client development. Base64 attachments bloat messages by 33%. Character encoding is a perpetual source of bugs.

### NOSTR Mail Solution

See [Message Format](message-format.md) for the complete specification. Key points:

- Flat JSON structure — no nesting, no boundaries, no Content-Transfer-Encoding
- Native Unicode — no charset encoding hacks
- Attachments are external references (Blossom hashes), not inline base64
- Machine-readable tags instead of freeform text headers
- Subject is a tag (`["subject", "..."]`)
- Threading via event ID references with explicit role markers

### Size Comparison

A simple text email with one 1MB PDF attachment:

| Component | Email (MIME) | NOSTR Mail |
|-----------|-------------|------------|
| Headers | ~2 KB (20-40 headers) | ~200 bytes (JSON tags) |
| Body | ~500 bytes | ~500 bytes (content field) |
| Attachment | ~1.33 MB (base64 = +33%) | ~100 bytes (Blossom hash reference) |
| Auth overhead | ~1 KB (DKIM sig, SPF, ARC) | ~64 bytes (Schnorr signature) |
| **Total** | **~1.34 MB** | **~900 bytes** + 1 MB on Blossom |

The message event itself is tiny. The attachment is stored and fetched separately, on demand, from Blossom servers.

---

## Layer 4: Transport & Delivery — WebSocket Replaces SMTP + IMAP

### Email's Problem

SMTP for sending, IMAP for receiving — two completely different protocols with different connection models, authentication mechanisms, and state management. IMAP requires persistent TCP connections per folder. SMTP uses a stateless command/response model.

### NOSTR Mail Solution

One protocol for everything — NOSTR's WebSocket-based REQ/EVENT model:

```
SENDING:
  Client creates gift-wrapped event (kind 1059)
  Client publishes to recipient's inbox relays:
  ["EVENT", {gift-wrapped-mail-event}]
  Relay acknowledges:
  ["OK", "<event-id>", true, ""]

RECEIVING:
  Client subscribes to inbox relays:
  ["REQ", "inbox", {"#p": ["<my-pubkey>"], "kinds": [1059]}]
  Relay delivers stored events:
  ["EVENT", "inbox", {wrapped-event-1}]
  ["EVENT", "inbox", {wrapped-event-2}]
  ["EOSE", "inbox"]
  // After EOSE, new events arrive in real-time (push)
  ["EVENT", "inbox", {wrapped-event-new}]

SYNC (fetch only new messages since last check):
  ["REQ", "inbox", {"#p": ["<my-pubkey>"], "kinds": [1059], "since": 1711843200}]

DISCONNECT & RECONNECT:
  Client tracks last-seen timestamp
  On reconnect, issues REQ with "since" = last-seen
  Receives only new events (efficient delta sync)
```

### Transport Properties

| Property | Email (SMTP/IMAP) | NOSTR Mail (WebSocket) |
|----------|-------------------|------------------------|
| Protocols | 2 (SMTP send, IMAP receive) | 1 (EVENT/REQ) |
| Connection model | Persistent (IMAP) + transient (SMTP) | Single WebSocket |
| Push notifications | IMAP IDLE (1 folder/connection) | Native (any filter, one connection) |
| State management | Complex (IMAP session state) | Stateless (filter-based subscriptions) |
| Multi-folder | Multiple connections required | Multiple subscriptions on one connection |
| Offline support | Download all + reconnect | Sync via `since` timestamp |
| Mobile friendliness | Poor (battery drain from connections) | Good (single efficient WebSocket) |
| NAT/firewall | Complex (multiple ports) | Simple (standard HTTPS/WSS port 443) |

### Delivery Guarantee

Email uses store-and-forward with bounce messages. NOSTR Mail uses redundant publication:

```
1. Client publishes to relay A → ["OK", "<id>", true]   ✓
2. Client publishes to relay B → ["OK", "<id>", true]   ✓
3. Client publishes to relay C → ["OK", "<id>", false]  ✗ (relay down)

Result: Message stored on 2/3 relays. Recipient will find it.
If all relays reject: client can retry or alert sender.
```

No bounce messages. No NDNs. The sender knows immediately whether the relay accepted the event.

---

## Layer 5: Encryption & Privacy — Gift Wrap Replaces... Nothing

### Email's Problem

No native encryption. PGP/S/MIME failed after 30 years (<1% adoption). Even with content encryption, **all metadata is exposed** — sender, recipient, subject, timestamps, routing path, IP addresses.

### NOSTR Mail Solution

See [Encryption & Privacy](encryption-privacy.md) for full details. Summary:

Three-layer encryption model using NIP-44 + NIP-59:

```
Layer 1 — Rumor (kind 15):   The actual mail message (UNSIGNED)
    ↓ encrypted with NIP-44
Layer 2 — Seal (kind 13):    Encrypted rumor (signed by sender, randomized timestamp)  
    ↓ encrypted with NIP-44 using ephemeral keypair
Layer 3 — Gift Wrap (1059):  Encrypted seal (signed by ephemeral key, randomized timestamp)
```

**What the relay sees:** A kind 1059 event from a random ephemeral pubkey. It cannot determine:
- Who sent it (ephemeral key, not sender's real key)
- What it contains (double-encrypted)
- When it was written (randomized timestamps)
- What the subject is (encrypted inside)
- How many recipients there are (each gets a separate wrap)

### Encryption Comparison

| Property | Email (PGP) | Email (S/MIME) | NOSTR Mail |
|----------|-------------|----------------|------------|
| Content encrypted | Yes | Yes | Yes (NIP-44) |
| Metadata hidden | No | No | **Yes (Gift Wrap)** |
| Sender hidden | No | No | **Yes (ephemeral key)** |
| Timestamp hidden | No | No | **Yes (randomized)** |
| Key exchange | Manual / keyserver | CA-issued cert | **Automatic (pubkey IS identity)** |
| Adoption barrier | Extreme (key mgmt) | High (PKI required) | **None (default behavior)** |
| Deniability | No (signed) | No (signed) | **Yes (rumor is unsigned)** |

---

## Layer 6: Authentication — Signatures Replace SPF/DKIM/DMARC

### Email's Problem

Four separate retroactive patches (SPF, DKIM, DMARC, ARC) to answer: "did this person actually send this message?" Each has limitations, breaks on forwarding, and requires DNS infrastructure.

### NOSTR Mail Solution

Every event is signed with the sender's private key. Period.

```
Event ID = SHA-256([0, pubkey, created_at, kind, tags, content])
Signature = Schnorr_sign(event_id, private_key)

Verification:
  1. Recompute event ID from fields → must match claimed ID
  2. Verify Schnorr signature against sender's pubkey → must be valid
  3. Done.
```

### Authentication Comparison

| Property | Email (SPF+DKIM+DMARC) | NOSTR Mail |
|----------|------------------------|------------|
| Steps to verify | 4+ (SPF → DKIM → DMARC → ARC) | 1 (verify signature) |
| DNS dependency | Yes (3+ lookups per check) | No |
| Breaks on forwarding | Yes (SPF fails, DKIM may break) | No (signature is inherent to event) |
| Spoofing possible | Yes (sophisticated domain attacks) | **No (crypto impossible without key)** |
| Domain alignment needed | Yes (complex rules) | No (pubkey IS the identity) |
| Implementation complexity | Very high | ~20 lines of code |
| Time to deploy | Weeks (DNS propagation, warm-up) | Instant |

**Spoofing is cryptographically impossible** in NOSTR. You cannot create a valid Schnorr signature without the private key. This single property eliminates the entire SPF/DKIM/DMARC/ARC stack and the entire phishing attack surface.

---

## Layer 7: Anti-Spam — Micropayments Replace Reputation Systems

### Email's Problem

Spam filtering is an opaque, ML-driven reputation system controlled by an oligopoly. Self-hosters are guilty until proven innocent. The cost of sending spam is zero. A $2B+ industry exists to navigate deliverability.

### NOSTR Mail Solution

See [Micropayments Anti-Spam](micropayments-anti-spam.md) for full details. Summary:

```
┌─────────────────────────────────────────────────────────┐
│              ANTI-SPAM TIERS                             │
├─────────────────────────────────────────────────────────┤
│  Tier 0: Contacts (kind 3 follow list)       → FREE    │
│  Tier 1: NIP-05 verified sender              → FREE    │
│  Tier 2: Unknown + Proof-of-Work (NIP-13)    → FREE*   │
│  Tier 3: Unknown + Cashu token               → 10 sats │
│  Tier 4: Cold outreach / commercial          → 100 sats│
│  Tier 5: Priority inbox                      → 1k sats │
└─────────────────────────────────────────────────────────┘
* Proof-of-work costs compute, not money
```

Spam becomes unprofitable: 1M messages at 1 sat each = ~$10,000. Legitimate senders pay pennies. Contacts bypass payment. Recipients set their own price.

---

## Layer 8: Attachments & Media — Blossom Replaces MIME Attachments

### Email's Problem

Attachments are base64-encoded inline in MIME, bloating messages by 33%. Large attachments strain SMTP size limits (typically 25-50MB). The attachment is duplicated for every recipient.

### NOSTR Mail Solution

Attachments are external references stored on Blossom (NIP-B7) servers:

```json
// Inside the mail event tags:
["attachment", "<blossom-sha256-hash>", "report.pdf", "application/pdf", "1048576"]
["attachment", "<blossom-sha256-hash>", "chart.png", "image/png", "42000"]
["blossom-server", "https://blossom.example.com"]
```

**Flow:**
1. Sender uploads file to Blossom server (encrypted with NIP-44 if private)
2. Sender includes Blossom hash + metadata in mail event tags
3. Recipient decrypts mail, sees attachment references
4. Recipient downloads attachment from Blossom server on demand
5. If encrypted: decryption key is included in the mail event (inside the encrypted content)

**Advantages:**
- Message event stays small (hashes instead of encoded files)
- No 33% base64 bloat
- Attachments fetched on demand (no downloading 50MB to see the text)
- Deduplication — same file sent to multiple people = one Blossom upload
- Decentralized storage — files hosted across multiple Blossom servers
- Encrypted attachments — only recipients with the key can download

---

## Layer 9: State & Sync — Replaceable Events Replace IMAP Flags

### Email's Problem

IMAP manages message state (read, flagged, deleted, folders) per-connection. State sync across devices is buggy and implementation-dependent. Moving messages between folders generates complex IMAP commands. There's no standard for syncing state across different email providers.

### NOSTR Mail Solution

A new replaceable event kind (e.g., kind 10099) for mailbox state:

```json
{
  "kind": 10099,
  "pubkey": "<user-pubkey>",
  "created_at": 1711843200,
  "tags": [
    ["d", "mailbox-state"],
    ["read", "<event-id-1>"],
    ["read", "<event-id-2>"],
    ["flagged", "<event-id-3>"],
    ["archived", "<event-id-4>"],
    ["folder", "work", "<event-id-5>"],
    ["folder", "personal", "<event-id-3>"],
    ["deleted", "<event-id-6>"]
  ],
  "content": "",
  "sig": "..."
}
```

Because this is a **replaceable event** (kind 10000-19999), only the latest version is retained. Any client on any device publishes a new version → all other devices see the updated state.

**For privacy**, this event should be encrypted (NIP-44) since it reveals which messages you've interacted with. It could be self-addressed — encrypted to your own pubkey and stored on your personal relay.

### Sync Properties

| Property | Email (IMAP) | NOSTR Mail |
|----------|-------------|------------|
| Multi-device sync | IMAP server state (buggy) | Replaceable event (deterministic) |
| Offline changes | Queue IMAP commands, replay | Publish new state event on reconnect |
| Conflict resolution | Server wins (usually) | Latest timestamp wins |
| Folder management | IMAP CREATE/DELETE/RENAME | Tags in state event |
| Cross-client | Same IMAP server only | Any client, any relay |

---

## Full Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        NOSTR MAIL CLIENT                              │
│                                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Compose  │ │  Inbox   │ │ Folders  │ │ Contacts │ │ Settings  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
│       │             │            │             │             │        │
│  ┌────▼─────────────▼────────────▼─────────────▼─────────────▼────┐  │
│  │                    NOSTR MAIL ENGINE                            │  │
│  │                                                                 │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │  │
│  │  │  Crypto      │  │  Relay Mgmt   │  │  Payment Engine    │    │  │
│  │  │  • NIP-44    │  │  • Connect    │  │  • Cashu wallet    │    │  │
│  │  │  • Gift Wrap │  │  • Subscribe  │  │  • L402 client     │    │  │
│  │  │  • NIP-59    │  │  • Publish    │  │  • NWC (NIP-47)    │    │  │
│  │  │  • Key mgmt  │  │  • Outbox     │  │  • Zap (NIP-57)    │    │  │
│  │  └─────────────┘  └──────────────┘  └────────────────────┘    │  │
│  │                                                                 │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │  │
│  │  │  Storage     │  │  Identity     │  │  Attachments       │    │  │
│  │  │  • Local DB  │  │  • NIP-05     │  │  • Blossom upload  │    │  │
│  │  │  • State sync│  │  • NIP-46     │  │  • NIP-94 metadata │    │  │
│  │  │  • Search    │  │  • NIP-07     │  │  • Encrypted refs  │    │  │
│  │  │  • Cache     │  │  • Contacts   │  │  • On-demand fetch │    │  │
│  │  └─────────────┘  └──────────────┘  └────────────────────┘    │  │
│  └─────┬─────────────────────┬──────────────────────┬─────────────┘  │
└────────┼─────────────────────┼──────────────────────┼────────────────┘
         │                     │                      │
    WebSocket              HTTPS                  HTTPS
         │                     │                      │
    ┌────▼─────────┐    ┌──────▼───────┐      ┌──────▼──────┐
    │ NOSTR RELAYS │    │   BLOSSOM    │      │ CASHU MINTS │
    │              │    │   SERVERS    │      │             │
    │ • Inbox relay│    │              │      │ • Issue     │
    │   (10050)    │    │ • File store │      │ • Redeem    │
    │ • General    │    │ • Encrypted  │      │ • Verify    │
    │   relays     │    │ • Dedup      │      │             │
    │ • AUTH gate  │    │ • CDN-like   │      │ L402 GATES  │
    │ • Event store│    │              │      │ • Invoice   │
    │              │    │ NIP-05       │      │ • Macaroon  │
    │ kind 1059    │    │ SERVERS      │      │ • Verify    │
    │ kind 10050   │    │ • Discovery  │      │             │
    │ kind 10099   │    │ • .well-known│      └─────────────┘
    │ kind 10002   │    │              │
    └──────────────┘    └──────────────┘
```

---

## Protocol Flow: Sending a NOSTR Mail

```
Alice wants to mail Bob (bob@example.com)

1. RESOLVE RECIPIENT
   Client: GET https://example.com/.well-known/nostr.json?name=bob
   → Bob's pubkey: b0b...
   Client: ["REQ", "q", {"kinds": [10050], "authors": ["b0b..."]}]
   → Bob's inbox relays: [wss://inbox.bob.com, wss://nos.lol]

2. COMPOSE MESSAGE
   Alice writes: subject "Meeting tomorrow", body "Let's meet at 3pm"
   Client creates kind 15 rumor (UNSIGNED):
   {
     "kind": 15,
     "tags": [
       ["p", "b0b..."],
       ["subject", "Meeting tomorrow"]
     ],
     "content": "Let's meet at 3pm",
     "created_at": 1711843200  // will be randomized
   }

3. CHECK ANTI-SPAM
   Is Bob in Alice's contact list? → Free delivery
   Otherwise: attach Cashu token or pay L402 invoice

4. ENCRYPT (NIP-44 + NIP-59)
   a. Seal the rumor:
      - Encrypt rumor JSON with NIP-44 (Alice's key → Bob's key)
      - Create kind 13 seal, signed by Alice, randomized timestamp
   b. Gift wrap the seal:
      - Generate ephemeral keypair
      - Encrypt seal with NIP-44 (ephemeral key → Bob's key)
      - Create kind 1059 gift wrap, signed by ephemeral key
      - Add tag: ["p", "b0b..."] (so relays can route it)

5. DELIVER
   Client publishes kind 1059 to Bob's inbox relays:
   → ["EVENT", {gift-wrap}] → wss://inbox.bob.com → ["OK", "...", true]
   → ["EVENT", {gift-wrap}] → wss://nos.lol → ["OK", "...", true]

6. SAVE SENT COPY
   Client creates a separate gift wrap addressed to Alice (self-copy)
   Publishes to Alice's own relays (sent mail archive)

Total time: < 2 seconds (no DNS, no MTA chain, no DKIM signing, no SPF check)
```

---

## Protocol Flow: Receiving NOSTR Mail

```
Bob opens his NOSTR Mail client

1. SUBSCRIBE
   Client connects to Bob's inbox relays (from kind 10050):
   ["REQ", "inbox", {"#p": ["b0b..."], "kinds": [1059], "since": <last-sync>}]

2. RECEIVE
   Relay delivers stored events:
   ["EVENT", "inbox", {gift-wrap-1}]
   ["EVENT", "inbox", {gift-wrap-2}]
   ["EOSE", "inbox"]
   // After EOSE, new events arrive as push notifications

3. DECRYPT EACH MESSAGE
   a. Decrypt gift wrap (kind 1059) with Bob's key → seal (kind 13)
   b. Verify seal is signed by a real pubkey (sender identity)
   c. Decrypt seal with Bob's key → rumor (kind 15)
   d. Extract: sender pubkey, subject, content, attachments, timestamps

4. CHECK ANTI-SPAM
   Is sender in Bob's contact list (kind 3)? → Inbox
   Is sender NIP-05 verified? → Inbox
   Does message include valid Cashu token? → Inbox (redeem token)
   Does message include valid PoW (NIP-13)? → Inbox
   None of the above? → Spam / requires payment

5. DISPLAY
   Show in inbox: sender name (from kind 0 profile), subject, preview
   Thread by: ["reply"] and ["thread"] tags → reconstruct conversation

6. SYNC STATE
   Mark as read → update kind 10099 mailbox state event
   Other devices see the update instantly
```

---

## What This Stack Eliminates

| Eliminated | Reason |
|------------|--------|
| SMTP | Events published via WebSocket |
| IMAP/POP3 | Subscriptions via REQ filter |
| MIME | JSON event structure |
| DNS MX records | Kind 10050 relay lists |
| SPF | Schnorr signatures |
| DKIM | Schnorr signatures |
| DMARC | Schnorr signatures |
| ARC | No forwarding chain to break |
| STARTTLS | E2EE by default (NIP-44) |
| MTA-STS/DANE | Relay TLS is standard |
| PGP/S/MIME | NIP-44 (native, automatic) |
| Reputation systems | Economic proof (micropayments) |
| Bounce messages | Immediate relay acknowledgment |
| IP warm-up | No IP reputation dependency |
| Deliverability industry | Publish to relays, done |
