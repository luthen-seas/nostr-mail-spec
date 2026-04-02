# Client Architecture — Building a NOSTR Mail Client

> **Inbox, compose, sync, search, multi-device — how to build an email-like experience on NOSTR primitives.**

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Relay Management](#relay-management)
- [Inbox & Message Retrieval](#inbox--message-retrieval)
- [Compose & Send Flow](#compose--send-flow)
- [Threading & Conversation View](#threading--conversation-view)
- [Multi-Device Sync](#multi-device-sync)
- [Search](#search)
- [Contact Management](#contact-management)
- [Notification System](#notification-system)
- [Offline Support](#offline-support)
- [UX Patterns](#ux-patterns)
- [Technology Stack Options](#technology-stack-options)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     NOSTR MAIL CLIENT                         │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    UI LAYER                             │  │
│  │  Inbox │ Compose │ Thread │ Contacts │ Search │ Settings│  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │                  APPLICATION LAYER                      │  │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐            │  │
│  │  │ Message  │ │  Thread   │ │  Contact   │            │  │
│  │  │ Manager  │ │  Manager  │ │  Manager   │            │  │
│  │  └──────────┘ └───────────┘ └────────────┘            │  │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐            │  │
│  │  │  Spam    │ │  State    │ │  Search    │            │  │
│  │  │  Filter  │ │  Sync     │ │  Index     │            │  │
│  │  └──────────┘ └───────────┘ └────────────┘            │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │                   ENGINE LAYER                          │  │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐   │  │
│  │  │  Crypto    │ │  Relay     │ │  Payment         │   │  │
│  │  │  Engine    │ │  Pool      │ │  Engine          │   │  │
│  │  │            │ │            │ │                   │   │  │
│  │  │  NIP-44    │ │  Connect   │ │  Cashu wallet    │   │  │
│  │  │  Gift Wrap │ │  Subscribe │ │  L402 client     │   │  │
│  │  │  NIP-59    │ │  Publish   │ │  NWC (NIP-47)    │   │  │
│  │  │  Signing   │ │  Reconnect │ │  Zap receipt     │   │  │
│  │  └────────────┘ └────────────┘ └──────────────────┘   │  │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐   │  │
│  │  │  Key Mgmt  │ │  Blossom   │ │  NIP-05          │   │  │
│  │  │            │ │  Client    │ │  Resolver        │   │  │
│  │  │  NIP-07    │ │            │ │                   │   │  │
│  │  │  NIP-46    │ │  Upload    │ │  Resolve address │   │  │
│  │  │  NIP-55    │ │  Download  │ │  Cache results   │   │  │
│  │  │  Direct    │ │  Encrypt   │ │  Verify          │   │  │
│  │  └────────────┘ └────────────┘ └──────────────────┘   │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │                   STORAGE LAYER                         │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │  Local Database (SQLite / IndexedDB / LevelDB)  │   │  │
│  │  │  • Decrypted message cache                      │   │  │
│  │  │  • Thread index                                 │   │  │
│  │  │  • Contact cache                                │   │  │
│  │  │  • Full-text search index                       │   │  │
│  │  │  • Mailbox state                                │   │  │
│  │  │  • Relay connection state                       │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Crypto Engine

Handles all encryption/decryption operations:

```
DECRYPT INCOMING MAIL:
  1. Receive kind 1059 (gift wrap) from relay
  2. Decrypt wrap: ECDH(user_private, wrap.pubkey) → NIP-44 decrypt → seal
  3. Verify seal signature against seal.pubkey (sender verification)
  4. Decrypt seal: ECDH(user_private, seal.pubkey) → NIP-44 decrypt → rumor
  5. Parse rumor: extract kind 15 fields (tags, content)
  6. Return: {sender, recipients, subject, body, attachments, thread_refs}

ENCRYPT OUTGOING MAIL (per recipient):
  1. Create kind 15 rumor (unsigned)
  2. Seal: NIP-44 encrypt(sender_key → recipient_key) → kind 13, sign with sender key
  3. Wrap: generate ephemeral key, NIP-44 encrypt(ephemeral → recipient) → kind 1059
  4. Return: signed kind 1059 event ready for publication
```

### Relay Pool

Manages WebSocket connections to multiple relays:

```
CONNECTIONS:
  • Inbox relays (user's kind 10050): Primary mail source
  • General relays (user's kind 10002): Profile, contacts, state sync
  • Recipient relays: Discovered per-recipient for outbound delivery
  • Fallback relays: Well-known public relays for discovery

SUBSCRIPTION MANAGEMENT:
  • "inbox": {"#p": [user_pubkey], "kinds": [1059], "since": last_sync}
  • "contacts": {"kinds": [3], "authors": [user_pubkey]}
  • "profiles": {"kinds": [0], "authors": [contact_pubkeys...]}
  • "state": {"kinds": [10099], "authors": [user_pubkey]}
  • "drafts": {"kinds": [30015], "authors": [user_pubkey]}

RECONNECTION:
  • Exponential backoff: 1s, 2s, 4s, 8s, ... up to 60s
  • Track last EOSE timestamp per relay
  • On reconnect: REQ with "since" = last_eose_timestamp
```

### Message Manager

Orchestrates message lifecycle:

```
RECEIVE:
  1. Relay delivers kind 1059 event
  2. Deduplicate by event ID (may arrive from multiple relays)
  3. Decrypt (crypto engine)
  4. Run spam filter
  5. Extract thread references
  6. Store in local database
  7. Update search index
  8. Trigger notification

SEND:
  1. User composes message (subject, body, recipients, attachments)
  2. Upload attachments to Blossom (encrypted)
  3. Resolve each recipient's pubkey (NIP-05) and inbox relays (kind 10050)
  4. Create kind 15 rumor with all tags
  5. For each recipient: seal → gift wrap → publish to their relays
  6. Create self-addressed copy → publish to own relays
  7. Update thread index
  8. Update mailbox state (sent)
```

---

## Relay Management

### Inbox Relay Selection

Users configure their inbox relays via kind 10050:

```
RECOMMENDED SETUP:
  • 1-2 dedicated inbox relays (high reliability, storage guarantees)
  • 1-2 general public relays (redundancy)
  • Optional: personal relay (maximum control)

RELAY CHARACTERISTICS TO CONSIDER:
  • Storage duration (permanent vs. time-limited)
  • NIP-42 AUTH support (access control)
  • Rate limiting policies
  • Geographic proximity (latency)
  • Payment requirements
  • NIP-45 COUNT support (efficient sync checks)
```

### Relay Discovery for Recipients

When sending to a recipient, the client must find their inbox relays:

```
1. Check local cache (recently resolved recipients)
2. Query any connected relay for kind 10050:
   ["REQ", "q", {"kinds": [10050], "authors": ["<recipient-pubkey>"], "limit": 1}]
3. If not found: try kind 10002 (general relay list) → extract read relays
4. If not found: check NIP-05 .well-known/nostr.json "relays" field
5. If not found: try well-known public relays as fallback
6. Cache result with TTL (e.g., 24 hours)
```

---

## Inbox & Message Retrieval

### Initial Load (First Launch)

```
1. Connect to inbox relays (kind 10050)
2. Subscribe: {"#p": [user_pubkey], "kinds": [1059], "limit": 100}
3. Receive batch of stored events → EOSE
4. Decrypt each event (parallel, using Web Workers if browser)
5. Run spam filter on each
6. Build thread index
7. Build search index
8. Display inbox (sorted by decrypted created_at, grouped by thread)
```

### Incremental Sync

```
1. On app open: connect to relays
2. Subscribe: {"#p": [user_pubkey], "kinds": [1059], "since": last_sync_timestamp}
3. Receive only new events since last sync
4. Decrypt, filter, index, display
5. Update last_sync_timestamp to current time
```

### Real-Time Push

After EOSE, the subscription stays open. New events arrive immediately:

```
["EVENT", "inbox", {new-gift-wrap}]
→ Decrypt → spam check → display notification → add to inbox
```

No polling. No IMAP IDLE reconnection dance. The WebSocket is the push channel.

---

## Compose & Send Flow

### Basic Send

```
1. User fills: To, CC, BCC, Subject, Body, Attachments

2. RESOLVE RECIPIENTS:
   For each address (NIP-05 or npub):
   → Resolve to pubkey
   → Fetch inbox relays (kind 10050)
   
3. UPLOAD ATTACHMENTS:
   For each file:
   → Generate random NIP-44 symmetric key
   → Encrypt file with key
   → Upload to Blossom server
   → Record: {hash, filename, mime_type, size, encryption_key}

4. CREATE RUMOR (kind 15):
   {
     kind: 15,
     tags: [
       ["p", recipient1, relay1, "to"],
       ["p", recipient2, relay2, "cc"],
       ["subject", subject],
       ["attachment", hash, filename, mime, size],
       ["attachment-key", hash, enc_key],
       // Cashu tokens if needed
     ],
     content: body
   }

5. FOR EACH RECIPIENT (including BCC):
   → Seal rumor (NIP-44 encrypt, sign with sender key)
   → Gift wrap seal (ephemeral key, NIP-44 encrypt)
   → Publish to recipient's inbox relays

6. SELF-COPY:
   → Seal rumor to self (NIP-44 encrypt to own key)
   → Gift wrap to self
   → Publish to own relays

7. UPDATE LOCAL STATE:
   → Add to sent folder
   → Update thread index if reply
```

### Reply

```
1. User clicks reply on a message
2. Pre-fill: To (original sender), Subject ("Re: " + original subject)
3. Add threading tags:
   ["reply", "<parent-event-id>", "<relay-hint>"]
   ["thread", "<root-event-id>", "<relay-hint>"]
4. Compose and send as normal
```

### Forward

```
1. User clicks forward
2. Create new kind 15 rumor with:
   - New recipient(s)
   - Subject: "Fwd: " + original subject
   - Content: forwarded message body (quoted)
   - Original attachment references (if any)
   - ["forwarded-from", "<original-event-id>"] tag
3. Seal and wrap for new recipient(s)
```

---

## Threading & Conversation View

### Thread Index

Maintain a local index mapping thread roots to messages:

```
thread_index = {
  "<root-event-id>": {
    root: {id, sender, subject, timestamp},
    messages: [
      {id, sender, parent_id, timestamp, preview},
      {id, sender, parent_id, timestamp, preview},
      ...
    ],
    last_activity: timestamp,
    unread_count: 3,
    participants: [pubkey1, pubkey2, pubkey3]
  }
}
```

### Thread Reconstruction

```
1. New message arrives with ["thread", "<root-id>"] tag
2. Look up root-id in thread_index
3. If found: add message to existing thread
4. If not found:
   a. Fetch root message: ["REQ", "q", {"ids": ["<root-id>"]}]
   b. Decrypt root message
   c. Create new thread entry
   d. Add both root and new message

5. Build tree from reply→parent relationships:
   For each message in thread:
     parent = message.tags.find("reply")[1]
     tree[parent].children.push(message)
   
6. Display as:
   - Chronological list (email-style)
   - Tree view (forum-style)
   - Collapsed thread (Gmail-style)
```

### Thread Fetch (Load Full Conversation)

When user opens a thread, fetch all messages:

```
1. Get root event ID from thread tag
2. Query relays for all messages in thread:
   ["REQ", "thread", {"#e": ["<root-id>"], "kinds": [1059]}]
   // This won't work for gift-wrapped messages since #e is inside encryption
   
   Alternative: Maintain thread IDs in local index
   Fetch from relays by specific event IDs if missing locally
```

**Challenge**: Gift wrapping hides thread references from relays. Relays can't filter by `#e` on encrypted content. Solutions:
- Local thread index (primary)
- Relay-side thread tracking for authenticated users (relay decrypts `p` tag, tracks threads per-user)
- Explicit thread subscription relays

---

## Multi-Device Sync

### State Synchronization

Mailbox state (read, flagged, folders) syncs via replaceable events:

```
DEVICE A marks message as read:
  1. Update local state
  2. Publish kind 10099 (mailbox-state) event to relay
     (encrypted to self, contains read/flagged/folder state)

DEVICE B opens app:
  1. Fetch latest kind 10099 from relays
  2. Decrypt → get current state
  3. Merge with local state (latest timestamp wins)
  4. Update UI

CONFLICT RESOLUTION:
  - Replaceable events: latest created_at wins
  - If two devices update simultaneously: last-write-wins
  - Acceptable for mail state (read/unread is not critical)
```

### Message Sync

Messages themselves sync naturally:
- All devices subscribe to the same inbox relays
- Same kind 1059 events delivered to all devices
- Event ID deduplication prevents duplicates
- `since` timestamp ensures efficient catch-up

### Draft Sync

Drafts (kind 30016, addressable) sync across devices:
- Addressable events: latest per `d` tag wins
- Encrypted to self → only user's devices can read
- Natural conflict resolution via `created_at`

---

## Search

### The Challenge

Full-text search on encrypted messages is fundamentally hard:
- Relays can't index encrypted content (by design)
- NIP-50 search relays only work for public events
- Search must happen client-side on decrypted content

### Client-Side Search Index

Build a local full-text index as messages are decrypted:

```
ON MESSAGE DECRYPT:
  index.add({
    id: event_id,
    sender: sender_name + sender_nip05,
    recipients: recipient_names.join(" "),
    subject: subject,
    body: content,
    attachments: attachment_filenames.join(" "),
    timestamp: created_at,
    thread_id: thread_root_id,
    folder: current_folder,
    is_read: false
  })

SEARCH QUERY:
  results = index.search("quarterly report", {
    fields: ["subject", "body", "attachments"],
    sort: "timestamp",
    filter: {folder: "inbox"}
  })
```

### Search Libraries

| Platform | Library | Notes |
|----------|---------|-------|
| Web | MiniSearch, Lunr.js, FlexSearch | In-browser, IndexedDB backed |
| Desktop | SQLite FTS5 | Full-featured, fast |
| Mobile (iOS) | Core Spotlight / SQLite FTS5 | OS-integrated |
| Mobile (Android) | Room FTS / SQLite FTS5 | Android-native |

### Limitations

- Search only covers messages the client has decrypted
- Very old messages may not be in local index (depends on sync depth)
- No server-side search (by design — privacy trade-off)
- Initial index build can be slow for large mailboxes

---

## Contact Management

### Contact List (Kind 3)

The user's follow list serves as the address book / contact list:

```json
{
  "kind": 3,
  "pubkey": "<user-pubkey>",
  "tags": [
    ["p", "<contact-1-pubkey>", "wss://relay.example.com", "Alice"],
    ["p", "<contact-2-pubkey>", "wss://relay2.com", "Bob"],
    ["p", "<contact-3-pubkey>", "", "Charlie"]
  ],
  "content": ""
}
```

### Profile Resolution

For each contact, fetch their kind 0 (metadata) event:

```json
{
  "kind": 0,
  "content": "{\"name\":\"Alice\",\"about\":\"Engineer\",\"picture\":\"https://...\",\"nip05\":\"alice@example.com\",\"lud16\":\"alice@getalby.com\"}"
}
```

Client displays: name, avatar, NIP-05 address, and uses this for the address book.

### Address Autocomplete

When composing, autocomplete from:
1. Local contact cache (kind 3 + kind 0 data)
2. NIP-05 resolution (type `alice@example.com` → resolve to pubkey)
3. Recent correspondents (from message history)
4. NIP-50 search relays (search by name/NIP-05)

---

## Notification System

### Push Notifications

```
DESKTOP:
  WebSocket stays open → new kind 1059 arrives → 
  decrypt → show OS notification with sender + subject

MOBILE (Background):
  Option A: Background WebSocket (battery-intensive)
  Option B: Push notification relay service:
    1. User registers with a push relay
    2. Push relay monitors user's inbox relays
    3. On new kind 1059: push relay sends FCM/APNs notification
    4. Notification contains: "New message" (no content — encrypted)
    5. User opens app → decrypt and display

WEB:
  Service Worker maintains WebSocket
  Web Push API for background notifications
```

### Notification Content

Since messages are encrypted, notifications can only show:
- "New message from [sender name]" (if sender is in contacts and identifiable)
- "New encrypted message" (if sender unknown)
- Badge count on app icon

Decrypted subject/preview only shown after app is opened and message is decrypted locally.

---

## Offline Support

### Offline Reading

```
1. All decrypted messages cached in local database
2. Thread index maintained locally
3. Search index maintained locally
4. User can read, search, and browse offline
5. Folder/flag changes queued for sync
```

### Offline Composing

```
1. User composes message offline
2. Message stored as local draft
3. On reconnect:
   a. Resolve recipients (if needed)
   b. Upload attachments to Blossom
   c. Encrypt, wrap, publish
   d. Move from drafts to sent
```

### Sync on Reconnect

```
1. App detects network connectivity
2. Reconnect to all relays
3. Issue REQ with "since" = last_online_timestamp
4. Receive all messages since last online
5. Publish queued outgoing messages
6. Publish queued state changes (read/flag/folder)
7. Resolve any merge conflicts (latest wins)
```

---

## UX Patterns

### Familiar Email UX

Despite the different protocol, the UI should feel like email:

| Feature | Implementation |
|---------|---------------|
| Inbox | List of kind 1059 events, decrypted, sorted by date |
| Sent | Self-addressed copies, decrypted |
| Drafts | Kind 30016 events, decrypted |
| Folders | Tags in kind 10099 state event |
| Search | Local FTS index |
| Compose | Standard compose form → rumor → seal → wrap |
| Reply/Forward | Pre-filled from original message |
| Attachments | Blossom upload with progress bar |
| Contacts | Kind 3 + kind 0 profiles |
| Spam folder | Messages failing spam filter |
| Settings | Relay config, spam policy, payment config |

### Onboarding Flow

```
1. FIRST LAUNCH
   "Create new identity" or "Import existing key"
   
   Create: Generate keypair → show mnemonic → confirm backup
   Import: Enter nsec, mnemonic, or connect NIP-46 signer

2. SET UP ADDRESS
   "Choose your mail address"
   → Set up NIP-05 (guided: DNS setup or use a NIP-05 provider)
   → Or skip: use npub directly

3. CONFIGURE RELAYS
   "Where should your mail be delivered?"
   → Auto-suggest popular inbox relays
   → Publish kind 10050 event

4. SET SPAM POLICY
   "How should unknown senders reach you?"
   → Free (no filtering)
   → PoW required (compute cost)
   → Payment required (set amount)
   → Publish kind 10097 event

5. IMPORT CONTACTS
   → Scan existing kind 3 follow list
   → Or manually add contacts by NIP-05 / npub

6. READY
   → Subscribe to inbox relays
   → Show empty inbox (or migrated messages if bridging)
```

---

## Technology Stack Options

### Web Client

```
Framework:     React / Svelte / SolidJS
NOSTR:         nostr-tools / NDK (@nostr-dev-kit/ndk)
Encryption:    @noble/secp256k1, @noble/hashes
Storage:       IndexedDB (Dexie.js)
Search:        MiniSearch / FlexSearch
WebSocket:     Native WebSocket API
Cashu:         @cashu/cashu-ts
UI:            Tailwind CSS / shadcn/ui
```

### Desktop Client (Cross-Platform)

```
Framework:     Tauri (Rust + Web) or Electron
NOSTR:         nostr-sdk (Rust) or nostr-tools (JS)
Encryption:    Native Rust crypto or @noble/*
Storage:       SQLite (via better-sqlite3 or rusqlite)
Search:        SQLite FTS5
WebSocket:     tokio-tungstenite (Rust) or ws (Node)
Cashu:         cashu-rs or @cashu/cashu-ts
```

### Mobile Client (iOS)

```
Framework:     SwiftUI
NOSTR:         NostrSDK (Swift) or rust-nostr FFI
Encryption:    CryptoKit + secp256k1 bindings
Storage:       Core Data + SQLite FTS5
Search:        Core Spotlight integration
WebSocket:     URLSessionWebSocketTask
Cashu:         cashu-swift or rust FFI
Push:          APNs via push notification relay
```

### Mobile Client (Android)

```
Framework:     Jetpack Compose
NOSTR:         nostr-sdk (Kotlin via rust-nostr FFI) or custom
Encryption:    Bouncy Castle / libsecp256k1 JNI
Storage:       Room + SQLite FTS5
Search:        Room FTS
WebSocket:     OkHttp WebSocket
Cashu:         cashu-kotlin or rust FFI
Push:          FCM via push notification relay
Key signing:   NIP-55 (Amber integration)
```
