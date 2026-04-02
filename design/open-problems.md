# Open Problems — Unsolved Challenges for NOSTR Mail

> **Storage persistence, search, onboarding, large attachments, mailing lists, regulatory compliance, and other hard problems that need solving.**

---

## Table of Contents

- [1. Storage Persistence](#1-storage-persistence)
- [2. Search on Encrypted Data](#2-search-on-encrypted-data)
- [3. Onboarding & Key Management UX](#3-onboarding--key-management-ux)
- [4. Large Attachments at Scale](#4-large-attachments-at-scale)
- [5. Mailing Lists & Group Distribution](#5-mailing-lists--group-distribution)
- [6. Spam at the Relay Level](#6-spam-at-the-relay-level)
- [7. Forward Secrecy](#7-forward-secrecy)
- [8. Regulatory & Compliance](#8-regulatory--compliance)
- [9. Key Recovery & Account Recovery](#9-key-recovery--account-recovery)
- [10. Scalability of Mailbox State](#10-scalability-of-mailbox-state)
- [11. Offline-First Reliability](#11-offline-first-reliability)
- [12. Interoperability Standards](#12-interoperability-standards)
- [13. Economic Sustainability](#13-economic-sustainability)
- [14. Adoption Bootstrapping](#14-adoption-bootstrapping)

---

## 1. Storage Persistence

### The Problem

Email users expect messages to exist forever. Gmail stores every email since account creation. NOSTR relays have no obligation to store events permanently. Relays may:
- Delete old events to save storage
- Go offline permanently
- Rate-limit storage per user
- Require payment for long-term storage

### Why It's Hard

- Relays are independent operators with their own economics
- No protocol-level guarantee of storage duration
- Redundancy (publishing to multiple relays) helps but doesn't guarantee persistence
- Encrypted events can't be deduplicated by relays (each gift wrap is unique)
- Mail accumulates linearly over years — storage requirements grow unbounded

### Possible Solutions

**Paid relay subscriptions**: Dedicated inbox relays charge a monthly fee for guaranteed storage. This aligns incentives — the relay is paid to store your mail.

```
Examples:
  • relay.nostr.band — community relay with storage guarantees
  • Custom relay — user runs their own (cheapest long-term)
  • Premium relay services — SLA-backed storage
```

**Personal relay instances**: Users run their own relay (similar to running an IMAP server, but simpler). A NOSTR relay is much simpler than a mail server — no MX records, no SPF/DKIM, no spam filtering at the relay level.

```
Minimum viable personal relay:
  • $5/month VPS
  • strfry or nostr-rs-relay binary
  • SQLite or LMDB storage
  • Nginx + certbot for TLS
  • Publish kind 10050 with personal relay URL
```

**Redundant publication**: Publish to 3-5 relays. Even if some go offline, messages survive on others. Client tracks which relays have which events.

**Archival services**: Specialized relays focused on long-term storage (like the Internet Archive for NOSTR events). Could charge per-GB or offer free archival for historical preservation.

**Client-side backup**: Mail clients maintain a complete local database. Even if all relays disappear, the user has their mail. Periodic encrypted backup to cloud storage (iCloud, S3, etc.).

### Status: Partially Solved

Paid relays and personal relays work today. The missing piece is standardized storage guarantees — a NIP defining relay storage commitments (minimum retention period, maximum event count, etc.) so clients can make informed relay choices.

---

## 2. Search on Encrypted Data

### The Problem

Full-text search is a core email feature. Users search by sender, subject, body text, attachment name, date range, etc. In NOSTR Mail, all message content is encrypted — relays can't build a search index over encrypted data.

### Why It's Hard

- Relay sees only kind 1059 events with encrypted content
- Relay can index `p` tag (recipient) but nothing else
- NIP-50 (search relay) only works for public events
- Searching encrypted data is an open cryptographic research problem
- Homomorphic encryption is too slow for practical search
- Searchable encryption schemes leak query patterns

### Possible Solutions

**Client-side search index** (current best option):
- As messages are decrypted, build a local full-text index
- SQLite FTS5, MiniSearch, FlexSearch depending on platform
- Fast and private — search never leaves the device
- **Limitation**: Can only search messages the client has seen and decrypted. Historical messages not yet synced are unsearchable.

**Trusted search relay**:
- User designates a relay they trust with decrypted content
- Client sends decrypted message metadata to this relay for indexing
- Relay builds a search index accessible only to the user (NIP-42 AUTH)
- **Trade-off**: Relay operator can see message metadata. This is the same trust model as running your own IMAP server.

**Blind index / token-based search**:
- Client generates deterministic tokens from searchable fields (e.g., HMAC of each word)
- Tokens stored as tags on a private searchable event
- Relay can match token queries without knowing the plaintext
- **Trade-off**: Leaks search patterns (which tokens are queried). Vulnerable to frequency analysis.

**Local + cloud encrypted index**:
- Client builds search index locally
- Encrypts the index and backs it up to cloud/relay
- On new device: download encrypted index, decrypt locally
- **Trade-off**: Index sync adds complexity. Index may become stale.

### Status: Client-Side Is Sufficient for V1

Most email users search infrequently and mostly recent messages. A client-side index covering the last 90 days of mail covers the vast majority of searches. The UX impact of "search only works on synced messages" is acceptable for an initial release.

---

## 3. Onboarding & Key Management UX

### The Problem

Email onboarding: enter a name, choose a password, done. NOSTR onboarding: generate a keypair, back up a mnemonic, understand npub/nsec, choose relays, set up NIP-05. This is orders of magnitude harder.

### Why It's Hard

- Users don't understand public-key cryptography
- "Back up your 12 words or lose your identity forever" is terrifying
- There's no "forgot password" — key loss is permanent
- NIP-05 setup requires DNS configuration (or using a provider)
- Relay selection requires understanding a new concept

### Possible Solutions

**Progressive onboarding**:
```
Step 1: "Create your account" (generates keypair behind the scenes)
Step 2: "Choose your mail address" (NIP-05 via provider, e.g., user@nostrmail.com)
Step 3: "Back up your recovery phrase" (shown but can be deferred)
Step 4: "You're ready!" (default relays pre-configured)

Advanced settings (later):
  - Export nsec
  - Set up NIP-46 remote signer
  - Add custom domain NIP-05
  - Choose specific relays
```

**Custodial onramp** (controversial but practical):
- Provider holds the key on behalf of the user
- User authenticates with email/password (familiar)
- Key is encrypted with user's password, stored server-side
- User can export key at any time to go self-sovereign
- **Trade-off**: Defeats self-sovereignty but matches user expectations

**NIP-46 remote signer as default**:
- User's key lives in a dedicated signer app (nsec.app, Amber)
- Mail client connects via NIP-46 — never touches the key
- Signer app handles backup, biometrics, key management
- **Benefit**: Key isolated from mail client. Multiple clients can use same signer.

**Social recovery (future)**:
- User designates 3-of-5 trusted contacts
- Key shares distributed using Shamir's Secret Sharing
- To recover: 3 contacts approve, reconstruct the key
- Not yet standardized in NOSTR

### Status: Solvable with UX Investment

The cryptography is settled. The challenge is pure UX design. Bitcoin wallets have largely solved this for their domain — NOSTR Mail can learn from those patterns.

---

## 4. Large Attachments at Scale

### The Problem

Email typically limits attachments to 25-50 MB (Gmail: 25 MB). Users need to send larger files. In email, services like Google Drive or Dropbox fill this gap. In NOSTR Mail, Blossom handles attachments, but:
- Who pays for Blossom storage?
- What's the retention policy?
- How to handle very large files (100 MB+)?

### Why It's Hard

- Blossom servers need to store files for as long as the mail is relevant
- Encrypted files can't be deduplicated across users
- Storage costs money — someone must pay
- Files must be available reliably (users expect attachments to work years later)

### Possible Solutions

**Blossom with paid storage**: Sender pays for storage (one-time or subscription). Storage server provides a URL valid for a guaranteed period. Cost embedded in the mail sending flow.

**Self-hosted Blossom**: User runs their own Blossom server. Full control over retention and availability. Cheapest long-term option.

**Chunked upload**: For large files, split into chunks, upload separately, reassemble on download. Allows resumable uploads over unreliable connections.

**Torrent-style distribution**: Use NOSTR events to share magnet links or content-addressed hashes. Files distributed across a peer network. Works well for large, popular files (not for one-to-one attachments).

**Link-based for very large files**: For files >50 MB, include a link instead of a Blossom reference. The link points to the sender's chosen hosting (S3, Google Drive, personal server). The NOSTR event contains the link + file hash for integrity verification.

### Status: Blossom Works for Normal Use

Blossom handles typical attachments (< 25 MB) well. The edge case of very large files or long-term retention needs more work. This mirrors email's situation — email itself has size limits, and people use external services for large files.

---

## 5. Mailing Lists & Group Distribution

### The Problem

Email mailing lists (Mailman, Google Groups, etc.) are a core feature of organizational email. A message to `team@company.com` goes to all members. In NOSTR Mail, gift wrapping creates a separate encrypted copy per recipient. For a list of 100 members, that's 100 gift-wrapped events.

### Why It's Hard

- O(n) encryption and publication per message per recipient
- Sender must know all members (or delegate to a list manager)
- Adding/removing members must update the distribution immediately
- Conversations need consistent threading across all members
- Reply-all semantics are complex with gift wrapping

### Possible Solutions

**Relay-managed groups (NIP-29 extension)**:
- Group relay manages membership
- Sender publishes one event to the group relay
- Relay distributes individual gift-wrapped copies to each member
- **Benefit**: Sender sends once; relay handles distribution
- **Trade-off**: Relay operator knows group membership and message content (or at least metadata)

**Shared key groups**:
- Group has a shared symmetric key
- Messages encrypted with the shared key, not individual gift wraps
- All members decrypt with the same key
- Key rotation on membership change
- **Benefit**: O(1) encryption per message
- **Trade-off**: Key management complexity; compromised key affects all members; no individual read receipts

**Distribution list operator**:
- A pubkey represents the list
- Operator receives mail to the list, re-wraps for each member
- Operator maintains membership (kind 39000 addressable event)
- **Benefit**: Standard gift wrapping, no special protocol
- **Trade-off**: Operator is a trusted intermediary

### Status: Needs New NIP

None of the current approaches are ideal. A dedicated NIP for group mail delivery is needed, balancing efficiency, privacy, and management.

---

## 6. Spam at the Relay Level

### The Problem

The anti-spam tier model (contacts → NIP-05 → PoW → Cashu → L402) operates at the **client level** after decryption. But relays must handle kind 1059 events before the client sees them. A spammer can flood relays with kind 1059 events that waste storage and bandwidth.

### Why It's Hard

- Relays can't inspect encrypted content
- The `p` tag tells the relay who the recipient is, but not who the sender is (ephemeral key)
- Rate limiting by ephemeral pubkey is ineffective (spammer generates new keys per message)
- Rate limiting by recipient pubkey penalizes popular users

### Possible Solutions

**Relay-level L402 gating**: Relay requires Lightning payment for publishing kind 1059 events. This is enforced before the event is accepted. See [micropayments-anti-spam.md](micropayments-anti-spam.md) for details.

**Relay-level NIP-42 AUTH**: Relay requires authentication. Only authorized pubkeys can publish kind 1059 events. The recipient configures their inbox relay's allowlist.

**Relay-level PoW requirement**: Relay requires minimum NIP-13 proof-of-work on kind 1059 events. The nonce tag is visible outside encryption.

**Rate limiting by IP**: Standard rate limiting on WebSocket connections. Doesn't prevent distributed spam but raises the cost.

**Allowlisting via contact list**: Relay fetches the recipient's kind 3 (follow list). Only accepts kind 1059 events from pubkeys in the follow list... but the sender's real pubkey is hidden inside the gift wrap (ephemeral key on the outside). This doesn't work directly.

**Solution to the ephemeral key problem**: Include a "sender hint" tag outside the encryption that the relay can check against the recipient's allowlist. This leaks some sender metadata to the relay but enables relay-level filtering.

```json
{
  "kind": 1059,
  "pubkey": "<ephemeral>",
  "tags": [
    ["p", "<recipient>"],
    ["sender-hint", "<sender-pubkey-hash>"]  // HMAC(sender_pub, shared_secret)
  ]
}
```

The recipient's relay knows the shared secret and can compute the hash for each allowed sender. If the sender-hint doesn't match any allowed sender, the relay can require payment.

**Trade-off**: Leaks the existence of a relationship between sender and recipient to the relay. But the relay already knows the recipient (from `p` tag), and the hint is a hash, not the raw pubkey.

### Status: Active Research Area

This is one of the hardest problems. The tension between metadata privacy (hiding sender) and spam prevention (identifying sender) is fundamental. Practical solutions will likely involve a tiered approach: contacts get free delivery, unknowns pay.

---

## 7. Forward Secrecy

See [encryption-privacy.md](encryption-privacy.md#forward-secrecy-discussion) for the detailed analysis.

**Summary**: NIP-44 uses static ECDH, so a key compromise reveals all past messages. Forward secrecy requires ephemeral key exchange (interactive) or pre-published one-time keys (complex state management). Both are hard in NOSTR's asynchronous model.

**Status**: Accepted trade-off for V1. Future NIP could add optional X3DH-style key bundles for users who want forward secrecy.

---

## 8. Regulatory & Compliance

### The Problem

Email is subject to extensive regulation:
- **GDPR** (EU): Right to deletion, data portability, consent
- **CAN-SPAM** (US): Commercial email requirements
- **HIPAA** (US): Healthcare data protection
- **SOX** (US): Financial record retention
- **eDiscovery**: Legal hold and production requirements
- **Data residency**: Data must stay in specific jurisdictions

### Why It's Hard

- NOSTR events are published to relays worldwide — no geographic containment
- Gift-wrapped events can't be inspected by compliance systems
- "Right to deletion" conflicts with immutable events on multiple relays
- Legal hold requires preventing deletion — hard when user controls their own data
- Archival requirements need guaranteed storage

### Possible Solutions

**For deletion (GDPR)**: Kind 5 deletion events request relays to delete messages. Well-behaved relays comply. Not guaranteed — some relays may ignore. This is similar to email: you can delete from your server, but the recipient's copy remains.

**For compliance archiving**: Organizations run their own relays with retention policies. All member events are archived on the organization's relay. The relay enforces retention periods.

**For data residency**: Use geographically-specific relays. EU users → EU relays. Configure kind 10050 to only include relays in the required jurisdiction.

**For eDiscovery**: The organization's relay maintains an audit log. Legal hold is enforced at the relay level (prevent deletion of events in a date range).

### Status: Requires Organizational Tooling

Individual users don't face most of these issues. Organizations adopting NOSTR Mail need relay operators that provide compliance features — a market opportunity.

---

## 9. Key Recovery & Account Recovery

### The Problem

If a user loses their nsec and hasn't backed up their mnemonic, their identity is gone. All encrypted mail to that identity becomes unreadable. There is no "forgot password" flow.

### Why It's Hard

- Self-sovereign identity means no authority can reset your key
- NIP-44 encryption is bound to the specific keypair
- Messages encrypted to an old key can't be re-encrypted to a new one (the content is on relays, encrypted)
- Social recovery requires pre-configuration and trusted contacts

### Possible Solutions

**Prevention** (most important):
- NIP-06 mnemonic: 12/24 word backup phrase
- NIP-49 encrypted export: password-protected nsec backup
- Multiple backups: written down, encrypted in cloud, hardware device
- Client UX: persistent reminders to back up until confirmed

**Social recovery** (NIP needed):
- Shamir's Secret Sharing: split key into N shares, require K to recover
- Shares distributed to trusted contacts
- Recovery: contact K friends, they provide shares, key reconstructed
- Shares should be encrypted and stored on relays for durability

**Key rotation with continuity** (NIP needed):
- Publish a "key rotation" event: old key signs a pointer to new key
- Contacts and relays update their records
- Old messages remain encrypted to old key (if old key is destroyed, they're lost)
- New messages use new key
- This doesn't solve recovery (old key needed) but limits blast radius

**Hardware key backup**:
- Store nsec on a hardware device (YubiKey, Trezor, Ledger)
- Hardware device is the backup
- NIP-46 signer on hardware for daily use

### Status: Partially Solved, Needs Standards

Mnemonic backup works today. Social recovery and key rotation need new NIPs. This is a critical path item for mass adoption.

---

## 10. Scalability of Mailbox State

### The Problem

The mailbox state event (kind 10099) tracks read/flagged/folder assignments. For a user with 50,000 messages over 5 years, this single event becomes massive — potentially hundreds of thousands of tags.

### Why It's Hard

- Replaceable events: only one per pubkey per kind
- Each state update publishes the entire event
- Large events strain relay storage and bandwidth
- Frequent updates (reading messages quickly) generate lots of relay traffic

### Possible Solutions

**Partition by time**: `["d", "state-2026-04"]` — monthly state events. Each month's state is independent. Old months rarely change.

**Partition by folder**: `["d", "state-inbox"]`, `["d", "state-archive"]` — per-folder state. Only the active folder's event updates frequently.

**Delta/incremental model**: Instead of a single replaceable event, publish small delta events:
```json
{"kind": 10098, "tags": [["read", "<id1>"], ["read", "<id2>"]], ...}
```
Client reconstructs state from the delta stream. Periodically compact into a snapshot.

**Default-unread model**: Only track state that differs from default. New messages default to "unread, no folder". Only record reads, flags, and folder assignments. This keeps the event small for users who don't organize aggressively.

### Status: Needs Design Work

The partitioning approach is the most practical. A dedicated NIP should define the convention.

---

## 11. Offline-First Reliability

### The Problem

Mobile users frequently have intermittent connectivity. Email (IMAP) handles this poorly (connection drops, sync conflicts). NOSTR Mail should do better but faces its own challenges.

### Why It's Hard

- Composing offline requires deferred encryption and delivery
- Recipient relay discovery requires network access
- Cashu token minting requires network access (mint interaction)
- Multiple offline devices may create conflicting state updates

### Possible Solutions

**Outbox queue**: Client maintains a local outbox of messages pending delivery. On network reconnect, process the queue. Handle failures with retry logic.

**Pre-cached recipient data**: Cache recipient pubkeys, relay lists, and profiles aggressively. Most messages go to known contacts — their data rarely changes.

**Pre-minted Cashu tokens**: Maintain a cache of pre-minted tokens for common denominations. Use them for offline-composed messages without contacting the mint.

**Conflict-free state**: Design mailbox state updates to be commutative (order-independent). "Mark as read" is idempotent — applying it twice has the same effect. Last-write-wins on timestamps.

### Status: Standard Mobile Engineering

These are well-understood problems with well-understood solutions. The NOSTR protocol's simplicity makes them easier than the equivalent IMAP problems.

---

## 12. Interoperability Standards

### The Problem

For NOSTR Mail to succeed, different client implementations must agree on conventions. Without standards, Client A's mail might be unreadable by Client B.

### What Needs Standardization

| Component | NIP Needed | Priority |
|-----------|-----------|----------|
| Mail event kind (15) | New NIP | Critical |
| Tag conventions | Part of kind 15 NIP | Critical |
| Threading model | Part of kind 15 NIP | Critical |
| CC/BCC semantics | Part of kind 15 NIP | Critical |
| Mailbox state format | New NIP | High |
| Spam policy event (10097) | New NIP | High |
| Cashu postage convention | New NIP | High |
| Read receipt kind (16) | New NIP | Medium |
| Bridge protocol | New NIP | Medium |
| Draft format (30015) | New NIP | Medium |
| Auto-responder (10098) | New NIP | Low |
| Mailing list format | New NIP | Medium |

### Status: Needs Community Effort

The NOSTR NIP process is proven (96 existing NIPs). Writing and proposing these NIPs is the path forward.

---

## 13. Economic Sustainability

### The Problem

Email infrastructure is funded by:
- Advertising (Gmail)
- Enterprise subscriptions (Microsoft 365, Google Workspace)
- Hosting fees (Fastmail, Protonmail)

NOSTR Mail needs sustainable economics for relay operators, Blossom servers, and bridge services.

### Revenue Models

**Relay operators**:
- Subscription fees for inbox relay service
- L402 micropayments per delivered event
- Storage tiers (free limited, paid unlimited)
- Premium features (search indexing, priority delivery)

**Blossom operators**:
- Per-upload fees
- Storage duration tiers
- Bandwidth fees for downloads

**Bridge operators**:
- Subscription for email address
- Per-message fees for bridging
- Premium for custom domain bridging

**Client developers**:
- Freemium client apps
- Premium features (advanced search, AI summarization, scheduling)
- Enterprise features (team management, compliance)

### Status: Market Needs to Develop

The economic models exist in theory. Real sustainability requires adoption critical mass.

---

## 14. Adoption Bootstrapping

### The Problem

Network effects: email is useful because everyone has email. NOSTR Mail is useful only if the people you communicate with also have NOSTR Mail (or the bridge works well enough).

### Bootstrapping Strategy

1. **Bridge first**: Make NOSTR Mail a better email client that also speaks NOSTR. Users can use it as a normal email client (via bridge) while gaining NOSTR benefits with NOSTR-native contacts.

2. **Community adoption**: NOSTR already has a community of early adopters. NOSTR Mail provides a familiar UX for a community that already values sovereignty and encryption.

3. **Developer-first**: Target developers and privacy-conscious users who understand the value proposition and tolerate rough edges.

4. **Killer feature**: The combination of seamless encryption, micropayment anti-spam, and true data portability is a feature set no email provider offers. Market it as "email that you actually own."

5. **Enterprise beachhead**: Small organizations that value security and sovereignty (Bitcoin companies, privacy-focused firms, decentralized organizations).

### Status: The Hardest Problem

Technical problems are solvable. Adoption is a social problem. The NOSTR community's growth suggests there's appetite for self-sovereign communication tools.
