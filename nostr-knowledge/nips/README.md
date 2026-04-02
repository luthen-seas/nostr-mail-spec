# NOSTR Implementation Possibilities (NIPs) Index

NIPs are the specification documents that define how the NOSTR protocol works. Each NIP describes a specific feature, convention, or protocol extension that clients and relays can implement. NIPs are collaboratively developed and accepted based on real-world adoption -- acceptance requires at least two client implementations and one relay implementation.

This index organizes all 96 NIPs by functional category for easy reference. For each NIP, links point to the detailed breakdown files in this repository.

**Status Legend:**
- **Active** -- Currently recommended for implementation
- **Unrecommended** -- Deprecated or superseded; avoid in new implementations

---

## Core Protocol

Fundamental protocol definitions, event structure, encoding, and relay communication.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [01](core/nip-01.md) | Basic protocol flow description | Active | Defines event structure, WebSocket client-relay communication, filters, and subscriptions |
| [09](core/nip-09.md) | Event Deletion Request | Active | Kind 5 events to request deletion of previously published events |
| [19](core/nip-19.md) | bech32-encoded entities | Active | npub, nsec, note, nprofile, nevent, nrelay, naddr encoding |
| [21](core/nip-21.md) | nostr: URI scheme | Active | URI scheme for referencing nostr entities (nostr:npub1...) |
| [24](core/nip-24.md) | Extra metadata fields and tags | Active | Additional optional metadata fields for profiles and events |
| [31](core/nip-31.md) | Dealing with Unknown Events | Active | How to handle events with unknown kinds; alt tag |
| [37](core/nip-37.md) | Draft Events | Active | Kind 31234 for storing draft events before publishing |
| [40](core/nip-40.md) | Expiration Timestamp | Active | Expiration tag for time-limited events |
| [48](core/nip-48.md) | Proxy Tags | Active | Tags for events bridged from other protocols (ActivityPub, AT Protocol) |
| [73](core/nip-73.md) | External Content IDs | Active | i-tags for referencing URLs, ISBNs, DOIs, geohashes, etc. |
| [BE](core/nip-BE.md) | Nostr BLE Communications Protocol | Active | Bluetooth Low Energy transport for nostr events |

## Identity

Key management, user identity, authentication, and signing.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [05](identity/nip-05.md) | Mapping Nostr keys to DNS-based internet identifiers | Active | user@domain.com style identity verification via well-known URL |
| [06](identity/nip-06.md) | Basic key derivation from mnemonic seed phrase | Active | BIP-39 mnemonic to nostr key derivation (m/44'/1237'/0'/0/0) |
| [07](identity/nip-07.md) | window.nostr capability for web browsers | Active | Browser extension API for key management and signing |
| [39](identity/nip-39.md) | External Identities in Profiles | Active | Kind 10011 for linking GitHub, Twitter, etc. to nostr profiles |
| [46](identity/nip-46.md) | Nostr Remote Signing | Active | Nostr Connect protocol (kind 24133) for remote key signing |
| [49](identity/nip-49.md) | Private Key Encryption | Active | Password-based private key encryption producing ncryptsec strings |
| [55](identity/nip-55.md) | Android Signer Application | Active | Android intent-based signer protocol, mobile equivalent of NIP-07 |

## Social

Social networking features: follows, reactions, reposts, threads, lists, and communities.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [02](social/nip-02.md) | Follow List | Active | Kind 3 for public follow lists with relay hints |
| [08](social/nip-08.md) | Handling Mentions | Unrecommended | Original mention handling; replaced by NIP-27 |
| [10](social/nip-10.md) | Text Notes and Threads | Active | Threading conventions for kind 1 using e/p tag markers |
| [14](social/nip-14.md) | Subject tag in text events | Active | Email-like subject lines for text notes |
| [18](social/nip-18.md) | Reposts | Active | Kind 6 (text reposts) and kind 16 (generic reposts) |
| [22](social/nip-22.md) | Comment | Active | Kind 1111 for universal commenting on any content |
| [23](social/nip-23.md) | Long-form Content | Active | Kind 30023 for articles/blog posts, kind 30024 for drafts |
| [25](social/nip-25.md) | Reactions | Active | Kind 7 for reactions to events, kind 17 for website reactions |
| [27](social/nip-27.md) | Text Note References | Active | Inline references using nostr: URI scheme in content |
| [30](social/nip-30.md) | Custom Emoji | Active | Custom emoji via emoji tags with shortcodes and image URLs |
| [38](social/nip-38.md) | User Statuses | Active | Kind 30315 for sharing current status/activity |
| [51](social/nip-51.md) | Lists | Active | Extensive list system: mute, pin, bookmark, follow sets, relay sets, curation sets, emoji sets, and more |
| [58](social/nip-58.md) | Badges | Active | Badge system with definitions (30009), awards (8), and profiles (30008) |
| [72](social/nip-72.md) | Moderated Communities | Active | Kind 34550 (community definition) and 4550 (post approval) |
| [7D](social/nip-7D.md) | Threads | Active | Kind 11 for dedicated threaded discussions |
| [84](social/nip-84.md) | Highlights | Active | Kind 9802 for saving/sharing highlighted excerpts |
| [88](social/nip-88.md) | Polls | Active | Kind 1068 (polls) and 1018 (poll responses) |
| [A4](social/nip-A4.md) | Public Messages | Active | Kind 24 for public messaging |

## Messaging

Direct messages, group chats, and encrypted communication.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [04](messaging/nip-04.md) | Encrypted Direct Message | Unrecommended | Kind 4 DMs using AES-256-CBC; **superseded by NIP-17** |
| [17](messaging/nip-17.md) | Private Direct Messages | Active | Kind 14/15 DMs with NIP-59 gift wrap for metadata protection |
| [28](messaging/nip-28.md) | Public Chat | Active | Public chat channels with create, message, hide, and mute events |
| [29](messaging/nip-29.md) | Relay-based Groups | Active | Group control events (9000-9030) and metadata (39000-39009) |
| [C7](messaging/nip-C7.md) | Chats | Active | Kind 9 for chat messages in relay-based groups |
| [EE](messaging/nip-EE.md) | E2EE Messaging using MLS Protocol | Unrecommended | End-to-end encrypted group messaging via MLS protocol |

## Payments

Lightning zaps, wallets, cashu ecash, and financial transactions.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [47](payments/nip-47.md) | Nostr Wallet Connect | Active | Wallet connection protocol for Lightning payments (kinds 13194, 23194, 23195) |
| [57](payments/nip-57.md) | Lightning Zaps | Active | Zap requests (9734) and receipts (9735) for sending sats |
| [60](payments/nip-60.md) | Cashu Wallet | Active | Cashu ecash wallet events (kinds 7374, 7375, 7376, 17375) |
| [61](payments/nip-61.md) | Nutzaps | Active | Kind 9321 for sending Cashu ecash tokens as zaps |
| [75](payments/nip-75.md) | Zap Goals | Active | Kind 9041 for fundraising targets with zap progress tracking |
| [87](payments/nip-87.md) | Ecash Mint Discoverability | Active | Kind 38172 (Cashu) and 38173 (Fedimint) mint announcements |

## Media

File storage, images, video, audio, and torrents.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [35](media/nip-35.md) | Torrents | Active | Kind 2003 (torrent metadata) and 2004 (torrent comments) |
| [68](media/nip-68.md) | Picture-first feeds | Active | Kind 20 for Instagram-style image-first content |
| [71](media/nip-71.md) | Video Events | Active | Kinds 21, 22 (video), 34235, 34236 (addressable video) |
| [92](media/nip-92.md) | Media Attachments | Active | imeta tags for attaching media metadata to events |
| [94](media/nip-94.md) | File Metadata | Active | Kind 1063 for describing externally stored files |
| [96](media/nip-96.md) | HTTP File Storage Integration | Unrecommended | HTTP API for file uploads to nostr-aware servers |
| [A0](media/nip-A0.md) | Voice Messages | Active | Kind 1222 (voice messages) and 1244 (voice message comments) |
| [B7](media/nip-B7.md) | Blossom | Active | Blob storage on media servers (kinds 10063, 24242) |

## Applications

Application-specific protocols, DVMs, marketplace, calendar, wiki, and more.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [15](applications/nip-15.md) | Nostr Marketplace | Active | Stalls, products, auctions, and bids (kinds 30017-30020, 1021-1022) |
| [32](applications/nip-32.md) | Labeling | Active | Kind 1985 for categorizing/labeling content |
| [34](applications/nip-34.md) | git stuff | Active | Git collaboration: repos, patches, PRs, issues (kinds 1617-1621, 30617-30618) |
| [52](applications/nip-52.md) | Calendar Events | Active | Date-based (31922), time-based (31923), calendar (31924), RSVP (31925) |
| [53](applications/nip-53.md) | Live Activities | Active | Live events (30311), interactive rooms (30312), conferences (30313) |
| [54](applications/nip-54.md) | Wiki | Active | Wiki articles (30818), redirects (30819), merge requests (818) |
| [5A](applications/nip-5A.md) | Pubkey Static Websites | Active | Static website hosting via nostr (kinds 15128, 35128) |
| [64](applications/nip-64.md) | Chess (PGN) | Active | Kind 64 for chess games in PGN format |
| [69](applications/nip-69.md) | Peer-to-peer Order events | Active | Kind 38383 for decentralized P2P trading order books |
| [78](applications/nip-78.md) | Application-specific data | Active | Kind 30078 for arbitrary app-specific data storage |
| [89](applications/nip-89.md) | Recommended Application Handlers | Active | Handler recommendations (31989) and info (31990) for event kinds |
| [90](applications/nip-90.md) | Data Vending Machines | Active | Computational service marketplace (kinds 5000-6999, 7000) |
| [99](applications/nip-99.md) | Classified Listings | Active | Kind 30402 for classified ads, 30403 for drafts |
| [B0](applications/nip-B0.md) | Web Bookmarks | Active | Kind 39701 for web bookmark events |
| [C0](applications/nip-C0.md) | Code Snippets | Active | Kind 1337 for sharing code snippets |

## Relay Management

Relay configuration, discovery, monitoring, and access control.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [11](relay-management/nip-11.md) | Relay Information Document | Active | JSON metadata document served by relays via HTTP |
| [42](relay-management/nip-42.md) | Authentication of clients to relays | Active | AUTH message flow using kind 22242 for access-controlled relays |
| [43](relay-management/nip-43.md) | Relay Access Metadata and Requests | Active | Access control: add/remove user, join/invite/leave requests |
| [45](relay-management/nip-45.md) | Counting results | Active | COUNT message type for requesting event counts from relays |
| [50](relay-management/nip-50.md) | Search Capability | Active | Search filter field for full-text search on relays |
| [65](relay-management/nip-65.md) | Relay List Metadata | Active | Kind 10002 for publishing preferred relay lists with read/write roles |
| [66](relay-management/nip-66.md) | Relay Discovery and Liveness Monitoring | Active | Relay monitor (10166) and discovery (30166) events |
| [70](relay-management/nip-70.md) | Protected Events | Active | '-' tag to prevent event replay by non-authors |
| [77](relay-management/nip-77.md) | Negentropy Syncing | Active | Efficient set reconciliation for fast client-relay event syncing |
| [86](relay-management/nip-86.md) | Relay Management API | Active | API for remote relay administration |

## Security

Encryption, proof of work, content moderation, and reporting.

| NIP | Title | Status | Description |
|-----|-------|--------|-------------|
| [03](security/nip-03.md) | OpenTimestamps Attestations for Events | Active | Kind 1040 for proving event existence at a specific time |
| [13](security/nip-13.md) | Proof of Work | Active | Leading zero bits in event id for spam prevention |
| [26](security/nip-26.md) | Delegated Event Signing | Unrecommended | Delegation tags for authorized signing by another keypair |
| [36](security/nip-36.md) | Sensitive Content | Active | Content-warning tag for NSFW/sensitive content |
| [44](security/nip-44.md) | Encrypted Payloads (Versioned) | Active | Versioned encryption scheme replacing NIP-04 encryption |
| [56](security/nip-56.md) | Reporting | Active | Kind 1984 for content moderation reports |
| [59](security/nip-59.md) | Gift Wrap | Active | Kind 13 (seal) and 1059 (gift wrap) for multi-layer encryption |
| [62](security/nip-62.md) | Request to Vanish | Active | Kind 62 for requesting complete data removal from relays |
| [85](security/nip-85.md) | Trusted Assertions | Active | Verifiable claims (kinds 30382, 30383, 30384) |
| [98](security/nip-98.md) | HTTP Auth | Active | Kind 27235 for nostr-based HTTP bearer token authentication |

---

## Deprecated NIPs and Replacements

| Deprecated NIP | Title | Replaced By | Notes |
|----------------|-------|-------------|-------|
| NIP-04 | Encrypted Direct Message | NIP-17 | NIP-17 provides better metadata protection via gift wrap |
| NIP-08 | Handling Mentions | NIP-27 | NIP-27 uses nostr: URI scheme instead of positional references |
| NIP-26 | Delegated Event Signing | -- | Generally unrecommended; no direct replacement |
| NIP-96 | HTTP File Storage Integration | NIP-B7 (Blossom) | Blossom provides a more robust media storage approach |
| NIP-EE | E2EE Messaging using MLS | -- | Unrecommended; MLS-based approach not widely adopted |

---

## Quick Stats

- **Total NIPs:** 96
- **Active:** 91
- **Unrecommended/Deprecated:** 5 (NIP-04, NIP-08, NIP-26, NIP-96, NIP-EE)
- **Categories:** 9 (Core, Identity, Social, Messaging, Payments, Media, Applications, Relay Management, Security)

---

*Source: [github.com/nostr-protocol/nips](https://github.com/nostr-protocol/nips) | Last updated: 2026-03-31*
