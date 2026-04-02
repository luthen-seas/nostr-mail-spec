# Damus -- Deep Dive

> The premier native iOS/macOS NOSTR client. "The social network you control."

- **Repository:** [github.com/damus-io/damus](https://github.com/damus-io/damus)
- **Author:** William Casarin (jb55)
- **License:** GPL-3.0
- **Platforms:** iOS 16.0+, macOS 13.0+
- **Language:** Swift / SwiftUI, with C (nostrdb)

---

## 1. What Damus Is

Damus is a native iOS and macOS client for the NOSTR protocol. It provides a Twitter/X-like social experience -- timeline, profiles, replies, reposts, reactions, DMs -- but backed entirely by the decentralized NOSTR relay network. There is no central server, no algorithmic feed manipulation, no ads, and no account gatekeeping (no email or phone number required).

Damus was created by **William Casarin** (npub: jb55), a Canadian developer with deep experience in systems programming (C, Rust, Haskell). Casarin's background in low-level performance work directly influenced Damus's architecture, particularly the decision to build a custom C database (nostrdb) rather than rely on CoreData or SQLite.

---

## 2. History

### Launch and Early Growth (2023)

- **January 2023:** Damus launched on the Apple App Store. It quickly became one of the top social networking apps, propelled by an endorsement from Jack Dorsey (Twitter co-founder) and broad interest in decentralized social media.
- **February 1, 2023:** Damus was listed on the App Store after working through Apple's content moderation requirements.
- **February 2, 2023:** Apple removed Damus from the China App Store at the direction of the Cyberspace Administration of China (CAC), citing "illegal content." This occurred just two days after launch in that region.

### The Apple App Store Controversy (June 2023)

The defining controversy of Damus's history was Apple's threat to remove the app globally over its **Zaps** feature (Lightning Network tipping). Apple's position:

1. Zaps constituted in-app purchases of "digital content," which must go through Apple's payment system (with Apple's 30% commission).
2. William Casarin and the NOSTR community argued that tips are peer-to-peer value transfer, not purchases of digital content -- "tips aren't unlocking content."
3. Apple issued a 14-day compliance deadline. Damus was forced to modify its zaps implementation to remain on the App Store.
4. The saga highlighted a fundamental tension: decentralized protocols with native value transfer do not fit cleanly into Apple's App Store model.

This controversy became a rallying point for the broader NOSTR ecosystem and accelerated interest in alternative distribution (TestFlight builds, sideloading via AltStore, and the EU's DMA provisions).

### Ongoing Development (2024-2026)

- **Damus Purple** subscription launched to fund development.
- Progressive migration of internal data layer to **nostrdb**.
- Launch of **Notedeck**, a Rust-based desktop/Android client sharing the nostrdb backend.
- Continued regular updates with wallet views, media improvements, and protocol support.

---

## 3. Architecture Overview

Damus is notable for being one of the most architecturally sophisticated NOSTR clients. Its design decisions are worth studying by any client developer.

### 3.1 Codebase Structure

```
damus/
  damus/               # Main iOS app target (Swift/SwiftUI)
    Models/            # Data models, state management
    Views/             # SwiftUI views
    Nostr/             # Protocol-level code (event parsing, signing, relay comms)
    Util/              # Helpers, extensions
  nostrdb/             # Embedded C library (git submodule)
  damus-c/             # C bridge code for Swift interop
  damusTests/          # Unit tests
  damusIntegrationTests/
```

The app is a **Swift/SwiftUI** codebase targeting Apple platforms. The critical performance path -- event storage and querying -- is handled by **nostrdb**, a C library linked into the app.

### 3.2 RelayPool: Multi-Relay Connection Management

Damus maintains simultaneous WebSocket connections to multiple relays through a `RelayPool` abstraction.

**Key design patterns:**

- **Connection lifecycle management:** Each relay connection has independent state (connecting, connected, disconnecting, failed) with automatic reconnection logic.
- **Subscription multiplexing:** A single relay connection carries multiple subscriptions (e.g., home timeline, notifications, profile lookups). Damus manages subscription IDs and routes incoming events to the appropriate handlers.
- **Relay scoring/selection:** Not all relays are equal. Damus tracks relay performance (latency, event throughput, error rates) to prioritize connections.
- **NIP-65 relay list metadata:** Damus reads users' relay lists (kind 10002 events) to know which relays to query for a given user's content.
- **Write relay routing:** When publishing an event, Damus sends to the user's configured write relays, not all connected relays.

```
                    +------------------+
                    |   RelayPool      |
                    +------------------+
                    |                  |
          +---------+    +---------+    +---------+
          | Relay A |    | Relay B |    | Relay C |
          | (ws://) |    | (wss://)|    | (wss://)|
          +---------+    +---------+    +---------+
               |              |              |
          [SUB home]    [SUB home]    [SUB notifs]
          [SUB prof]    [SUB search]
```

### 3.3 Event Processing Pipeline

Incoming events flow through a multi-stage pipeline:

1. **WebSocket receive** -- Raw JSON from relay
2. **Deserialization** -- JSON to nostrdb's compact binary format (zero-copy)
3. **Signature verification** -- secp256k1 signature check (can be deferred for performance)
4. **Deduplication** -- Check if event ID already exists in nostrdb (O(1) lookup)
5. **Storage** -- Write to nostrdb (LMDB transaction)
6. **Notification** -- Notify UI subscribers that new data is available
7. **Side effects** -- Trigger zap receipt processing, contact list updates, etc.

The key insight: steps 2-5 happen in nostrdb's C code, not in Swift. This keeps the hot path (receiving thousands of events from multiple relays simultaneously) fast and off the main thread.

### 3.4 Note Content Rendering

Damus implements rich note rendering:

- **Markdown-like formatting** for note text
- **Inline media** -- images, GIFs, and video previews rendered inline
- **Mention parsing** -- `nostr:npub1...` and `nostr:note1...` references are parsed and rendered as tappable links to profiles/notes
- **URL previews** -- link metadata fetched and rendered as cards
- **Hashtag parsing** -- `#hashtag` rendered as tappable search links
- **Custom emoji** -- NIP-30 custom emoji rendered inline
- **Invoice rendering** -- Lightning invoices (BOLT11) rendered with pay buttons

The rendering pipeline parses note content into an attributed string with embedded views, handling the full complexity of NOSTR's content model.

---

## 4. Key Features

### 4.1 Lightning Zaps (NIP-57)

Zaps are Damus's signature feature -- peer-to-peer Lightning Network payments attached to notes or profiles.

**How zaps work in Damus:**

1. User taps the lightning icon on a note
2. Damus creates a NIP-57 zap request event (kind 9734)
3. The request is sent to the recipient's LNURL pay endpoint
4. The endpoint returns a BOLT11 Lightning invoice
5. Damus hands the invoice to the user's configured Lightning wallet (Wallet of Satoshi, Zeus, Mutiny, etc.)
6. After payment, the recipient's Lightning service publishes a zap receipt event (kind 9735)
7. Damus displays the zap with amount on the note

**Wallet integration:**

- Damus has an integrated wallet view showing balance and transaction history
- External wallet apps are launched via deep links for invoice payment
- The wallet address is stored in the user's profile (Lightning Tips field)

### 4.2 Damus Purple

A subscription service to fund development. Features include:

- **Unique subscriber number** and badge
- **Auto-translation** of notes powered by DeepL
- **Priority support** and early access to features
- Payment accepted via Apple IAP and Lightning

Purple is significant architecturally because it required Damus to build a server-side component (purple.damus.io) that verifies subscriptions and provides the translation API -- one of the few server-side dependencies in an otherwise client-side-only app.

### 4.3 Direct Messages

- **NIP-04** encrypted DMs (legacy, widely supported)
- **NIP-44** versioned encryption (newer, more secure)
- DM conversations rendered in a messaging-style UI
- Privacy note: DM metadata (who is talking to whom) is visible on relays; only content is encrypted

### 4.4 Media Handling

- Inline image rendering from URLs in note content
- Video playback support
- GIF support
- Image uploading via external media hosts (e.g., nostr.build)
- Link preview cards with OpenGraph metadata

### 4.5 Thread and Conversation Views

- Full thread reconstruction from reply chains (NIP-10 `e` tag threading)
- Parent-child event relationships resolved across relays
- Quoted notes (NIP-18 reposts) rendered inline

### 4.6 Search and Discovery

- Full-text search powered by nostrdb
- Profile search for `@` mentions leveraging nostrdb's profile index
- Hashtag browsing
- Trending content discovery

### 4.7 Push Notifications

Push notifications in a decentralized system are architecturally interesting:

- Damus runs a **notification service** server-side that maintains relay connections on behalf of users
- When a mention, reply, or zap is detected for a registered user, an APNs push is sent
- This is an intentional centralization tradeoff: pure decentralization cannot deliver push notifications on iOS (Apple requires APNs)
- Users can self-host or use Damus's hosted notification service

### 4.8 Profile Management

- NIP-01 kind 0 metadata (name, about, picture, banner)
- NIP-05 identifier verification (user@domain.com style)
- Lightning address configuration
- Relay list management (NIP-65)
- Follow list management (kind 3 contact list events)

---

## 5. NIP Support Matrix

Damus implements a broad set of NIPs. Based on the codebase and documented features:

| NIP | Name | Status |
|-----|------|--------|
| NIP-01 | Basic protocol flow | Supported |
| NIP-02 | Follow list (Contact List) | Supported |
| NIP-04 | Encrypted Direct Messages (legacy) | Supported |
| NIP-05 | Mapping Nostr keys to DNS identifiers | Supported |
| NIP-06 | Basic key derivation from mnemonic | Supported |
| NIP-08 | Handling mentions | Supported |
| NIP-10 | Reply conventions (`e` and `p` tags) | Supported |
| NIP-11 | Relay information document | Supported |
| NIP-12 | Generic tag queries (hashtags) | Supported |
| NIP-18 | Reposts | Supported |
| NIP-19 | bech32-encoded entities (npub, nsec, note, nprofile, nevent) | Supported |
| NIP-21 | `nostr:` URI scheme | Supported |
| NIP-23 | Long-form content | Partial (rendering) |
| NIP-25 | Reactions | Supported |
| NIP-27 | Text note references | Supported |
| NIP-30 | Custom emoji | Supported |
| NIP-36 | Sensitive content / Content warning | Supported |
| NIP-42 | Authentication of clients to relays | Supported |
| NIP-44 | Versioned encryption | Supported |
| NIP-47 | Wallet Connect (NWC) | Supported |
| NIP-50 | Search capability | Supported |
| NIP-56 | Reporting | Supported |
| NIP-57 | Lightning Zaps | Supported |
| NIP-58 | Badges | Supported |
| NIP-65 | Relay list metadata | Supported |

**DIPs (Damus Implementation Possibilities):** Damus maintains a separate `damus-io/dips` repository for specifications that Damus implements but which did not reach consensus among other NOSTR client developers. These include inline image metadata handling and other Damus-specific extensions.

---

## 6. nostrdb -- The Custom Embedded Database

nostrdb is arguably the most technically interesting component of the Damus ecosystem. It is the reason Damus can handle large volumes of events on mobile hardware without stuttering.

- **Repository:** [github.com/damus-io/nostrdb](https://github.com/damus-io/nostrdb)
- **Language:** C
- **Backend:** LMDB (Lightning Memory-Mapped Database)
- **Design inspiration:** strfry (the fastest NOSTR relay)

### 6.1 Why a Custom Database?

The problem: a NOSTR client on a phone receives thousands of events per minute from multiple relays. Each event must be deduplicated, stored, indexed, and queryable in real time -- all while the user is scrolling a timeline. Traditional approaches fail:

- **CoreData** (Apple's ORM): Too much overhead per event. Object graph management, change tracking, and main-thread constraints make it unsuitable for high-throughput event ingestion.
- **SQLite**: Better, but still requires serialization/deserialization for each event. Parsing JSON into rows and then back into objects on read is wasteful when you are handling this volume.
- **In-memory caches**: Fast but limited by device RAM and lost on app termination.

nostrdb solves this with a **zero-copy, memory-mapped** approach.

### 6.2 Architecture

**Custom binary format (flatbuffer-style):**

nostrdb stores NOSTR events in a custom in-memory binary representation -- not JSON, not SQLite rows. This format is purpose-built for NOSTR events and provides:

- **O(1) field access:** Reading `event.pubkey` or `event.created_at` is a pointer offset, not a parse operation
- **Zero-copy reads:** Events are read directly from memory-mapped storage. No deserialization step. The bytes on disk ARE the in-memory representation.
- **Compact storage:** The binary format is more compact than JSON

**LMDB backend:**

Events in nostrdb's binary format are stored in LMDB, a memory-mapped B+tree database. This gives:

- **Memory-mapped I/O:** The OS kernel manages paging data in and out of RAM. nostrdb never explicitly reads from disk -- it accesses memory addresses, and the OS handles the rest.
- **ACID transactions:** Writes are transactional and crash-safe
- **Reader concurrency:** Multiple threads can read simultaneously without locks (MVCC)
- **No write-ahead log:** LMDB uses copy-on-write, avoiding WAL complexity

**The result:** Reading a NOSTR event from nostrdb is essentially a pointer dereference into a memory-mapped file. There is no parsing, no copying, no allocation. This is why it is "unfairly fast."

### 6.3 Query Capabilities

nostrdb supports NOSTR filter-style queries:

- Filter by event kind (`-k` flag)
- Filter by author pubkey
- Full-text search
- Result limiting (`-l` flag)
- Ordering (newest-first or oldest-first)

This maps directly to the NOSTR `REQ` filter model, meaning the same query semantics used to talk to relays can be used to query the local database.

### 6.4 Profile Index

nostrdb maintains a dedicated profile index that enables:

- Instant profile lookups by pubkey
- Full-text search across profile names (for `@` mention autocomplete)
- Every profile the client has ever seen is indexed and searchable

This replaced Damus's earlier CoreData-based profile cache and was a major usability improvement -- `@` mention search went from sluggish to instant.

### 6.5 Comparison to SQLite

| Aspect | nostrdb (LMDB) | SQLite |
|--------|----------------|--------|
| Read performance | Zero-copy memory-mapped | Requires deserialization |
| Write performance | Fast (B+tree, copy-on-write) | Fast (WAL mode) |
| Concurrency | Lock-free readers (MVCC) | WAL allows concurrent reads |
| Memory usage | OS-managed via mmap | Explicit cache management |
| Event access | O(1) field access, no parsing | Row scan + column extraction |
| Query flexibility | NOSTR filter semantics | Full SQL |
| Portability | C library, any platform | C library, any platform |
| Maturity | Newer, unstable API | Decades of production use |

**Tradeoff:** nostrdb gives up SQL's general-purpose query flexibility in exchange for dramatically faster reads for the specific access patterns NOSTR clients need. This is the right tradeoff for a mobile client where the query patterns are known and fixed.

---

## 7. Notedeck -- The Rust-Based Desktop/Android Client

Notedeck is the Damus team's next-generation client, extending the nostrdb foundation to desktop and Android.

- **Repository:** [github.com/damus-io/notedeck](https://github.com/damus-io/notedeck)
- **Language:** Rust
- **UI Framework:** egui (immediate-mode GUI)
- **Status:** Beta
- **Platforms:** Linux, macOS, Windows, Android

### 7.1 Architecture

Notedeck uses a modular Rust crate structure:

```
notedeck/
  crates/
    notedeck/           # Core shared library (nostrdb integration, relay management)
    notedeck_chrome/    # UI container, navigation, window chrome
    notedeck_columns/   # Column-based multi-feed interface
    notedeck_dave/      # AI assistant module (search/analysis of Nostr data)
    notedeck_ui/        # Reusable UI components
    tokenator/          # String parsing utilities
```

### 7.2 Key Design Decisions

- **egui (immediate-mode GUI):** Rather than using a retained-mode framework (GTK, Qt, native platform UI), Notedeck uses egui. This allows a single UI codebase across all desktop platforms and Android. The tradeoff is non-native look-and-feel, but the benefit is development velocity and consistency.
- **Shared nostrdb backend:** Notedeck uses the exact same nostrdb C library as Damus (via Rust FFI). This means the database format, query semantics, and performance characteristics are identical. Events stored by Notedeck are in the same format as events stored by Damus.
- **Multi-column layout:** Inspired by TweetDeck, Notedeck allows users to view multiple feeds, searches, profiles, and threads simultaneously in a column layout. This is a natural fit for power users who follow multiple topics.
- **Multi-account support:** Users can manage multiple NOSTR identities within a single Notedeck instance.

### 7.3 Dave AI Assistant

Notedeck includes an experimental AI module called "Dave" for searching and analyzing NOSTR data. This represents an interesting direction: using local AI to help users navigate the unfiltered firehose of decentralized social data.

### 7.4 Relationship to Damus

Notedeck is not a replacement for Damus -- it is a companion. The strategy:

- **Damus** remains the native iOS/macOS client, leveraging Apple platform capabilities (APNs, SwiftUI, system integration)
- **Notedeck** covers desktop (all platforms) and Android, using Rust for cross-platform reach
- **nostrdb** is the shared foundation, ensuring data compatibility

---

## 8. Key Technical Decisions and Patterns Worth Studying

### 8.1 Build Your Own Database

The single boldest decision in Damus's architecture is building nostrdb rather than using an off-the-shelf database. This is justified by:

- Known, fixed query patterns (NOSTR filters are well-defined)
- Extreme read performance requirements on constrained hardware
- The ability to eliminate serialization/deserialization entirely

**Lesson for client developers:** If your data access patterns are known and performance-critical, a purpose-built storage layer can dramatically outperform a general-purpose database. But this only makes sense if you have the systems programming expertise to build and maintain it.

### 8.2 C for the Hot Path, Swift for the UI

Damus demonstrates a practical polyglot architecture: Swift/SwiftUI for the user interface (where Apple's frameworks excel), C for the performance-critical data path (where zero-overhead matters). The FFI boundary is clean and narrow.

**Lesson:** Do not fight your platform's UI framework. Use it. But do not let it constrain your data layer. Bridge to a faster language where it matters.

### 8.3 Relay Pool as a First-Class Abstraction

Managing connections to multiple relays -- with different capabilities, different latencies, different content -- is one of the hardest problems in NOSTR client development. Damus's RelayPool abstraction handles:

- Connection lifecycle
- Subscription routing
- Event deduplication
- Relay-specific behavior (authentication, paid relays)

**Lesson:** Invest heavily in your relay management layer. It is the foundation everything else builds on.

### 8.4 Deferred Signature Verification

nostrdb can skip signature verification during event import for speed, deferring it to a later time (or skipping it for events received from trusted relays). This is a pragmatic tradeoff: verifying every signature on every event as it arrives is expensive; batching or deferring verification keeps the ingestion pipeline fast.

**Lesson:** Not every cryptographic operation needs to happen synchronously. Consider which operations can be deferred without compromising security guarantees.

### 8.5 Zero-Copy as a Design Philosophy

The recurring theme in nostrdb's architecture is eliminating unnecessary data copying. From the memory-mapped LMDB storage to the flatbuffer-style binary format, every design decision serves the goal of accessing data without moving it. On mobile hardware with limited memory bandwidth, this matters enormously.

**Lesson:** On constrained devices, the fastest code is code that does not run. The fastest copy is the copy that does not happen.

### 8.6 Server-Side Components as Intentional Tradeoffs

Damus is primarily a client-side application, but it deliberately introduces server-side components where platform constraints demand them:

- **Push notification service:** iOS requires APNs; there is no way around it
- **Damus Purple translation API:** DeepL integration requires server-side API keys
- **NIP-05 verification:** DNS-based verification inherently involves servers

Each of these is documented as an intentional centralization tradeoff, not an accident. Users can self-host alternatives.

**Lesson:** Decentralization is a spectrum, not a binary. Be intentional about where you centralize and why, and provide escape hatches.

---

## 9. Source Code and Resources

### Repositories

- **Damus iOS/macOS client:** [github.com/damus-io/damus](https://github.com/damus-io/damus)
- **nostrdb:** [github.com/damus-io/nostrdb](https://github.com/damus-io/nostrdb)
- **Notedeck:** [github.com/damus-io/notedeck](https://github.com/damus-io/notedeck)
- **Damus DIPs:** [github.com/damus-io/dips](https://github.com/damus-io/dips)

### Key Source Files to Study

- `RelayPool.swift` -- Multi-relay connection management
- `NostrEvent.swift` -- Event model and construction
- `PostView.swift` -- Note composition UI
- `NoteContentView.swift` -- Rich note content rendering
- `Zaps.swift` -- NIP-57 zap implementation
- `nostrdb/` -- The entire C database (study the flatbuffer-style event format)

### External References

- [Will Casarin's blog post on nostrdb](https://habla.news/jb55/1695221655270)
- [Damus on the App Store](https://apps.apple.com/us/app/damus/id1628663131)
- [Damus website](https://damus.io)
- [NOSTR protocol specification](https://github.com/nostr-protocol/nips)

---

*This document is part of the NOSTR Protocol Knowledge Base. Last updated: 2026-03-31.*
