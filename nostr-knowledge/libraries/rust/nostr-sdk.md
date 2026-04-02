# nostr-sdk Deep Dive

A comprehensive technical guide to the `rust-nostr` project, covering the `nostr` protocol crate and the `nostr-sdk` client SDK.

- **Repository:** <https://github.com/rust-nostr/nostr>
- **Docs:** <https://docs.rs/nostr-sdk> / <https://docs.rs/nostr>
- **Version:** 0.38.x (alpha)
- **Rust Edition:** 2024 (MSRV 1.85.0)

## Table of Contents

- [Crate Architecture](#crate-architecture)
- [Module Structure](#module-structure)
- [Key Types](#key-types)
  - [Keys](#keys)
  - [Event](#event)
  - [EventBuilder](#eventbuilder)
  - [Kind](#kind)
  - [Tag and Tags](#tag-and-tags)
  - [Filter](#filter)
  - [ClientMessage and RelayMessage](#clientmessage-and-relaymessage)
- [Key Traits](#key-traits)
- [Client](#client)
  - [Construction](#construction)
  - [Relay Management](#relay-management)
  - [Publishing Events](#publishing-events)
  - [Subscriptions](#subscriptions)
  - [Streaming Events](#streaming-events)
  - [Fetching Events](#fetching-events)
  - [Notifications](#notifications)
  - [Negentropy Sync](#negentropy-sync)
- [Relay Pool Management](#relay-pool-management)
- [NIP Support Matrix](#nip-support-matrix)
- [Event Building Patterns](#event-building-patterns)
- [Encryption](#encryption)
- [Key Management](#key-management)
- [Nostr Connect / Bunker (NIP-46)](#nostr-connect--bunker-nip-46)
- [NWC Support (NIP-47)](#nwc-support-nip-47)
- [Error Handling](#error-handling)
- [Async Runtime Considerations](#async-runtime-considerations)

---

## Crate Architecture

The project splits into two main crates with distinct responsibilities:

### `nostr` (protocol crate)

Zero-networking protocol implementation. Provides all types, serialization, cryptography, and event construction needed to work with the Nostr protocol. Compiles on `no_std` (with `alloc`), native targets, and WASM.

```
nostr/src/
  lib.rs          # Re-exports, feature gates
  event/
    mod.rs        # Event struct, verification
    builder.rs    # EventBuilder (70+ constructors)
    id.rs         # EventId
    kind.rs       # Kind enum
    tag/          # Tag, TagKind, TagStandard, Tags
    unsigned.rs   # UnsignedEvent (pre-signature)
  filter.rs       # Filter struct (subscription queries)
  key/
    mod.rs        # Keys struct
    public_key.rs # PublicKey
    secret_key.rs # SecretKey
  message/
    client.rs     # ClientMessage enum
    relay.rs      # RelayMessage enum
  signer/         # NostrSigner trait
  nips/           # NIP-specific implementations
  types/          # Timestamp, RelayUrl, Metadata, etc.
  util/           # Hex encoding, JSON utilities
  parser/         # NIP-19 bech32 parsing
  prelude.rs      # Convenience re-exports
```

### `nostr-sdk` (client SDK)

Async networking layer built on the protocol crate. Adds relay connections, subscription management, event routing, and a high-level `Client` API.

```
sdk/src/
  lib.rs          # Re-exports
  client/
    mod.rs        # Client struct (primary API surface)
    builder.rs    # ClientBuilder
  relay/          # Individual relay connection management
  pool/           # Relay pool (internal)
  transport/      # WebSocket transport layer
  monitor/        # Relay health monitoring
  policy/         # Whitelist/blacklist policies
  stream/         # Event streaming internals
  events_tracker/ # Deduplication tracking
  shared/         # Internal shared state
  future/         # Future utilities
  prelude.rs      # Convenience re-exports
```

---

## Module Structure

The `prelude` module is the recommended import for most applications:

```rust
use nostr_sdk::prelude::*;
```

This re-exports everything from both the `nostr` protocol crate and the `nostr-sdk` client crate. For finer-grained imports:

```rust
// Protocol types only (no networking)
use nostr::prelude::*;

// Or specific items
use nostr::{Event, EventBuilder, Keys, Kind, Tag, Filter, PublicKey};
use nostr::nips::nip44;  // NIP-44 encryption
use nostr_sdk::{Client, ClientBuilder, ClientNotification};
```

---

## Key Types

### Keys

The `Keys` struct holds a Nostr keypair (secp256k1 Schnorr). It is the primary identity primitive.

```rust
pub struct Keys {
    // Internal: public_key, secret_key, keypair
}

impl Keys {
    /// Generate random keys using OS randomness
    pub fn generate() -> Self;

    /// Generate with custom RNG
    pub fn generate_with_rng<C, R>(secp: &Secp256k1<C>, rng: &mut R) -> Self;

    /// Create from an existing secret key
    pub fn new(secret_key: SecretKey) -> Self;

    /// Parse from hex or bech32 (nsec) string
    pub fn parse(secret_key: &str) -> Result<Self, Error>;

    /// Get the public key
    pub fn public_key(&self) -> PublicKey;

    /// Get reference to the secret key
    pub fn secret_key(&self) -> &SecretKey;

    /// Create a Schnorr signature
    pub fn sign_schnorr(&self, message: &Message) -> Signature;
}

// Keys implements NostrSigner, so it can be used directly with Client
impl NostrSigner for Keys { ... }
```

**Usage patterns:**

```rust
// Generate new identity
let keys = Keys::generate();
println!("Public: {}", keys.public_key().to_bech32()?);  // npub1...
println!("Secret: {}", keys.secret_key().to_bech32()?);  // nsec1...

// Import from nsec
let keys = Keys::parse("nsec1ufnus6pju578ste3v90xd5m2decpuzpql2295m3sknqcjzyys9ls0qlc85")?;

// Import from hex
let keys = Keys::parse("6b911fd37cdf5c81d4c0adb1ab7fa822ed253ab0ad9aa18d77257c88b29b718e")?;

// From SecretKey
let sk = SecretKey::from_hex("...")?;
let keys = Keys::new(sk);
```

### Event

The fundamental data structure of the Nostr protocol. Every piece of content is an `Event`.

```rust
pub struct Event {
    pub id: EventId,          // SHA256 hash of serialized event
    pub pubkey: PublicKey,     // Author's public key
    pub created_at: Timestamp, // Unix timestamp
    pub kind: Kind,           // Event type (0=metadata, 1=text note, etc.)
    pub tags: Tags,           // Array of tag arrays
    pub content: String,      // Arbitrary string content
    pub sig: Signature,       // Schnorr signature
}

impl Event {
    /// Verify both event ID and signature
    pub fn verify(&self) -> Result<(), Error>;

    /// Verify only the event ID
    pub fn verify_id(&self) -> Result<(), Error>;

    /// Verify only the signature
    pub fn verify_signature(&self) -> Result<(), Error>;

    /// Check proof-of-work difficulty
    pub fn check_pow(&self, difficulty: u8) -> bool;

    /// Check if event has expired (NIP-40)
    pub fn is_expired(&self) -> bool;

    /// Get coordinate for replaceable/addressable events
    pub fn coordinate(&self) -> Option<Coordinate>;

    /// Check if event is protected (NIP-70)
    pub fn is_protected(&self) -> bool;
}
```

Events are created via `EventBuilder`, not constructed directly. They are immutable once signed.

### EventBuilder

The primary way to construct events. Provides 70+ typed constructors for different event kinds, plus a generic builder for custom kinds.

```rust
pub struct EventBuilder { /* private */ }

impl EventBuilder {
    // Generic construction
    pub fn new(kind: Kind, content: impl Into<String>) -> Self;

    // Builder methods (chainable)
    pub fn tag(self, tag: Tag) -> Self;
    pub fn tags<I: IntoIterator<Item = Tag>>(self, tags: I) -> Self;
    pub fn custom_created_at(self, created_at: Timestamp) -> Self;
    pub fn pow(self, difficulty: u8) -> Self;
    pub fn dedup_tags(self) -> Self;

    // Build without signing
    pub fn build(self, public_key: PublicKey) -> UnsignedEvent;

    // Build and sign
    pub fn sign<T: NostrSigner>(self, signer: &T) -> Result<Event, Error>;
    pub fn sign_with_keys(self, keys: &Keys) -> Result<Event, Error>;
}
```

See [Event Building Patterns](#event-building-patterns) below for the full list of typed constructors.

### Kind

Event kinds are u16 values. The `Kind` type provides named constants for standard kinds:

```rust
pub struct Kind(u16);

impl Kind {
    pub const Metadata: Kind = Kind(0);
    pub const TextNote: Kind = Kind(1);
    pub const ContactList: Kind = Kind(3);
    pub const EncryptedDirectMessage: Kind = Kind(4);  // NIP-04 (deprecated)
    pub const EventDeletion: Kind = Kind(5);
    pub const Repost: Kind = Kind(6);
    pub const Reaction: Kind = Kind(7);
    pub const ChannelCreation: Kind = Kind(40);
    pub const ChannelMessage: Kind = Kind(42);
    pub const GiftWrap: Kind = Kind(1059);
    pub const PrivateDirectMessage: Kind = Kind(14);   // NIP-17
    pub const RelayList: Kind = Kind(10002);           // NIP-65
    pub const LongFormTextNote: Kind = Kind(30023);    // NIP-23
    // ... many more
}
```

Custom kinds:

```rust
let custom = Kind::Custom(30078);  // Application-specific data
```

### Tag and Tags

Tags are the structured metadata attached to events. Each tag is an array of strings where the first element is the tag name.

```rust
// Tags is a collection wrapper
pub struct Tags { /* internal */ }

// Tag represents a single tag
pub struct Tag { /* internal */ }

impl Tag {
    // Standard constructors
    pub fn event(event_id: EventId) -> Self;
    pub fn public_key(pk: PublicKey) -> Self;
    pub fn reference(reference: String) -> Self;
    pub fn hashtag(hashtag: String) -> Self;
    pub fn identifier(identifier: String) -> Self;
    pub fn coordinate(coordinate: Coordinate) -> Self;
    pub fn relay_metadata(url: RelayUrl, metadata: Option<RelayMetadata>) -> Self;
    pub fn expiration(timestamp: Timestamp) -> Self;
    pub fn pow(nonce: u128, difficulty: u8) -> Self;

    // Access
    pub fn kind(&self) -> TagKind;
    pub fn as_standardized(&self) -> Option<&TagStandard>;
    pub fn as_slice(&self) -> &[String];
}
```

### Filter

Filters define what events to request from relays. They use a builder pattern:

```rust
pub struct Filter {
    pub ids: Option<BTreeSet<EventId>>,
    pub authors: Option<BTreeSet<PublicKey>>,
    pub kinds: Option<BTreeSet<Kind>>,
    pub search: Option<String>,
    pub since: Option<Timestamp>,
    pub until: Option<Timestamp>,
    pub limit: Option<usize>,
    pub generic_tags: GenericTags,
}

impl Filter {
    pub fn new() -> Self;

    // Builder methods (chainable)
    pub fn id(self, id: EventId) -> Self;
    pub fn ids<I>(self, ids: I) -> Self;
    pub fn author(self, author: PublicKey) -> Self;
    pub fn authors<I>(self, authors: I) -> Self;
    pub fn kind(self, kind: Kind) -> Self;
    pub fn kinds<I>(self, kinds: I) -> Self;
    pub fn since(self, since: Timestamp) -> Self;
    pub fn until(self, until: Timestamp) -> Self;
    pub fn limit(self, limit: usize) -> Self;
    pub fn search<S>(self, search: S) -> Self;

    // Tag filters
    pub fn event(self, event_id: EventId) -> Self;       // #e
    pub fn pubkey(self, pk: PublicKey) -> Self;            // #p
    pub fn hashtag<S>(self, hashtag: S) -> Self;           // #t
    pub fn reference<S>(self, reference: S) -> Self;       // #r
    pub fn identifier<S>(self, identifier: S) -> Self;     // #d
    pub fn coordinate(self, coordinate: Coordinate) -> Self; // #a
    pub fn custom_tag<S>(self, tag: SingleLetterTag, values: Vec<S>) -> Self;

    // Matching
    pub fn match_event(&self, event: &Event, opts: MatchOptions) -> bool;
    pub fn is_empty(&self) -> bool;
}
```

**Usage:**

```rust
// Text notes from a specific author in the last hour
let filter = Filter::new()
    .author(pubkey)
    .kind(Kind::TextNote)
    .since(Timestamp::now() - Duration::from_secs(3600));

// Events mentioning a specific event, limited to 50
let filter = Filter::new()
    .event(some_event_id)
    .limit(50);

// Full-text search (NIP-50)
let filter = Filter::new()
    .kind(Kind::TextNote)
    .search("bitcoin")
    .limit(100);
```

### ClientMessage and RelayMessage

These represent the wire protocol between clients and relays (NIP-01).

```rust
// Client -> Relay
pub enum ClientMessage<'a> {
    Event(Cow<'a, Event>),
    Req {
        subscription_id: Cow<'a, SubscriptionId>,
        filters: Vec<Cow<'a, Filter>>,
    },
    Count {
        subscription_id: Cow<'a, SubscriptionId>,
        filter: Cow<'a, Filter>,
    },
    Close(Cow<'a, SubscriptionId>),
    Auth(Cow<'a, Event>),
    NegOpen { /* negentropy fields */ },
    NegMsg { /* negentropy fields */ },
    NegClose { /* negentropy fields */ },
}

// Relay -> Client
pub enum RelayMessage<'a> {
    Event {
        subscription_id: Cow<'a, SubscriptionId>,
        event: Cow<'a, Event>,
    },
    Ok {
        event_id: EventId,
        status: bool,
        message: Cow<'a, str>,
    },
    EndOfStoredEvents(Cow<'a, SubscriptionId>),
    Notice(Cow<'a, str>),
    Closed {
        subscription_id: Cow<'a, SubscriptionId>,
        message: Cow<'a, str>,
    },
    Auth { challenge: Cow<'a, str> },
    Count {
        subscription_id: Cow<'a, SubscriptionId>,
        count: usize,
    },
    NegMsg { /* negentropy fields */ },
    NegErr { /* negentropy fields */ },
}
```

Most applications never construct these directly -- the `Client` handles serialization/deserialization automatically.

---

## Key Traits

### `NostrSigner`

The core signing abstraction. Any type implementing this trait can be used with `Client` and `EventBuilder`:

```rust
pub trait NostrSigner: Send + Sync {
    fn backend(&self) -> SignerBackend;
    async fn get_public_key(&self) -> Result<PublicKey, SignerError>;
    async fn sign_event(&self, unsigned: UnsignedEvent) -> Result<Event, SignerError>;

    // NIP-04 (legacy)
    async fn nip04_encrypt(&self, public_key: &PublicKey, content: &str) -> Result<String, SignerError>;
    async fn nip04_decrypt(&self, public_key: &PublicKey, encrypted: &str) -> Result<String, SignerError>;

    // NIP-44 (modern)
    async fn nip44_encrypt(&self, public_key: &PublicKey, content: &str) -> Result<String, SignerError>;
    async fn nip44_decrypt(&self, public_key: &PublicKey, ciphertext: &str) -> Result<String, SignerError>;
}
```

Implementations:
- `Keys` -- Direct key signing
- `NostrConnect` -- Remote signing via NIP-46
- `BrowserSigner` -- Browser extension signing via NIP-07

### `JsonUtil`

Serialization/deserialization for protocol types:

```rust
pub trait JsonUtil: Serialize + DeserializeOwned {
    fn as_json(&self) -> String;
    fn from_json<T: AsRef<[u8]>>(json: T) -> Result<Self, Error>;
    fn as_value(&self) -> Value;
    fn from_value(value: Value) -> Result<Self, Error>;
}
```

### `FromBech32` / `ToBech32`

NIP-19 encoding for human-readable identifiers:

```rust
let pk = PublicKey::from_bech32("npub1...")?;
let encoded = pk.to_bech32()?;  // "npub1..."

let event_id = EventId::from_bech32("note1...")?;
let keys_from_nsec = Keys::parse("nsec1...")?;
```

### `NostrDatabase`

Storage backend trait for event persistence (implemented by nostr-memory, nostr-lmdb, nostr-sqlite, nostr-ndb).

### `NostrGossip`

Gossip/outbox routing table trait (implemented by nostr-gossip-memory, nostr-gossip-sqlite).

---

## Client

The `Client` struct is the primary API surface of `nostr-sdk`. It manages relay connections, subscriptions, event publishing, and notification routing.

### Construction

```rust
// Default client (no signer -- read-only)
let client = Client::default();

// With signer via builder
let keys = Keys::generate();
let client = Client::builder()
    .signer(keys)
    .build();

// With database and gossip
use nostr_lmdb::NostrLMDB;
use nostr_gossip_memory::prelude::*;

let db = NostrLMDB::open("/path/to/db")?;
let gossip = NostrGossipMemory::unbounded();
let client = Client::builder()
    .signer(keys)
    .database(db)
    .gossip(gossip)
    .build();
```

### Relay Management

```rust
// Add relays (not connected yet)
client.add_relay("wss://relay.damus.io").await?;
client.add_relay("wss://nos.lol").await?;

// Add with specific capabilities
client
    .add_relay("wss://read-only.relay.com")
    .read_only()  // only subscribe, never publish here
    .await?;

// Connect to all added relays
client.connect().await;

// Connect with timeout
client.try_connect().timeout(Duration::from_secs(10)).await;

// Connect to a specific relay
client.connect_relay("wss://relay.damus.io").await?;

// Remove a relay
client.remove_relay("wss://old.relay.com").await?;

// Get all relays
let relays = client.relays().await;

// Disconnect everything
client.disconnect().await;

// Full shutdown
client.shutdown().await;
```

### Publishing Events

```rust
// Using EventBuilder (recommended -- Client signs automatically)
let builder = EventBuilder::text_note("Hello, Nostr!");
let output = client.send_event_builder(builder).await?;
println!("Event ID: {}", output.id().to_bech32()?);
println!("Sent to: {:?}", output.success);
println!("Failed: {:?}", output.failed);

// Send to specific relays
let builder = EventBuilder::text_note("Targeted message");
client
    .send_event_builder_to(["wss://relay.damus.io"], builder)
    .await?;

// With proof-of-work
let builder = EventBuilder::text_note("POW note").pow(20);
client.send_event_builder(builder).await?;

// Pre-sign then send
let event = client.sign_event_builder(EventBuilder::text_note("Pre-signed")).await?;
client.send_event(&event).await?;

// Send raw ClientMessage (low-level)
let msg = ClientMessage::event(event);
client.send_msg(msg).await?;
```

### Subscriptions

Long-lived subscriptions remain active until explicitly closed:

```rust
// Auto-generated subscription ID
let filter = Filter::new()
    .kind(Kind::TextNote)
    .author(some_pubkey)
    .since(Timestamp::now());

let Output { val: sub_id, .. } = client.subscribe(filter).await?;

// With custom subscription ID
let my_sub_id = SubscriptionId::new("my-feed");
let filter = Filter::new().kind(Kind::Metadata).limit(10);
client.subscribe(filter).with_id(my_sub_id.clone()).await?;

// Close a subscription
client.unsubscribe(&sub_id).await?;

// Close all subscriptions
client.unsubscribe_all().await?;

// List active subscriptions
let subs = client.subscriptions().await;
for (id, relay_filters) in subs {
    println!("Sub {}: {} relays", id, relay_filters.len());
}
```

### Streaming Events

Short-lived streams that return events as an async iterator:

```rust
use std::time::Duration;

let filter = Filter::new().kind(Kind::TextNote).limit(100);

let mut stream = client
    .stream_events(filter)
    .timeout(Duration::from_secs(15))
    .policy(ReqExitPolicy::ExitOnEOSE)  // Stop after stored events
    .await?;

while let Some((relay_url, result)) = stream.next().await {
    let event = result?;
    println!("[{}] {}: {}", relay_url, event.pubkey, event.content);
}
```

### Fetching Events

Buffered fetch that collects all events and returns them at once:

```rust
let filter = Filter::new()
    .author(some_pubkey)
    .kind(Kind::Metadata)
    .limit(1);

let events = client
    .fetch_events(filter)
    .timeout(Duration::from_secs(10))
    .await?;

for event in events {
    let metadata = Metadata::from_json(&event.content)?;
    println!("Name: {:?}", metadata.name);
}
```

### Notifications

The notification stream receives all relay messages for long-lived subscriptions:

```rust
let mut notifications = client.notifications();

while let Some(notification) = notifications.next().await {
    match notification {
        ClientNotification::Event {
            subscription_id,
            event,
            relay_url,
        } => {
            println!("[{}] {} (sub: {})", relay_url, event.content, subscription_id);
        }
        ClientNotification::Message { relay_url, message } => {
            match message {
                RelayMessage::Notice(msg) => println!("Notice from {}: {}", relay_url, msg),
                RelayMessage::Ok { event_id, status, message } => {
                    println!("OK for {}: {} ({})", event_id, status, message);
                }
                _ => {}
            }
        }
        _ => {}
    }
}
```

### Negentropy Sync

Efficient set reconciliation between local database and relays:

```rust
let filter = Filter::new()
    .author(my_pubkey)
    .kind(Kind::TextNote);

// Sync local DB with relay
client.sync(filter).await?;
```

---

## Relay Pool Management

The relay pool is managed internally by `Client`, but you can control individual relay behavior:

### Relay Capabilities

```rust
// Read-only relay (subscribe but never publish)
client.add_relay("wss://relay.nostr.band").read_only().await?;

// Write-only relay (publish but never subscribe)
client.add_relay("wss://write.relay.com").write_only().await?;

// Default: both read and write
client.add_relay("wss://relay.damus.io").await?;
```

### Automatic Authentication

```rust
// Enable NIP-42 automatic auth (requires a signer)
client.automatic_authentication(true);
```

### Monitoring

```rust
// Access the relay monitor (if configured)
if let Some(monitor) = client.monitor() {
    // Monitor provides relay health information
}
```

### Policies (Whitelist / Blacklist)

Policies filter events at the client level before they reach your application:

```rust
// Example: only accept events from known pubkeys
// See examples/whitelist.rs and examples/blacklist.rs
```

---

## NIP Support Matrix

The `nostr` crate implements 53+ NIPs. Here is the support matrix:

| NIP | Name | Feature Flag | Status |
|-----|------|-------------|--------|
| 01 | Basic Protocol | (core) | Supported |
| 02 | Follow List | (core) | Supported |
| 03 | OpenTimestamps | `nip03` | Supported |
| 04 | Encrypted DM (legacy) | `nip04` | Supported (deprecated) |
| 05 | DNS-based Verification | (core) | Supported |
| 06 | BIP39 Key Derivation | `nip06` | Supported |
| 07 | Browser Extension | N/A (separate crate) | Supported |
| 09 | Event Deletion | (core) | Supported |
| 10 | Reply Threading | (core) | Supported |
| 11 | Relay Info Document | (core) | Supported |
| 13 | Proof of Work | (core) | Supported |
| 15 | Marketplace (Stalls/Products) | (core) | Supported |
| 17 | Private Direct Messages | `nip59` | Supported |
| 18 | Reposts | (core) | Supported |
| 19 | Bech32 Encoding | (core) | Supported |
| 21 | nostr: URI Scheme | (core) | Supported |
| 22 | Comments | (core) | Supported |
| 23 | Long-form Content | (core) | Supported |
| 25 | Reactions | (core) | Supported |
| 28 | Public Channels | (core) | Supported |
| 32 | Labels | (core) | Supported |
| 34 | Git Stuff | (core) | Supported |
| 35 | Torrents | (core) | Supported |
| 38 | User Status | (core) | Supported |
| 40 | Expiration | (core) | Supported |
| 42 | Relay Authentication | (core) | Supported |
| 44 | Versioned Encryption | `nip44` | Supported |
| 46 | Nostr Connect | `nip46` | Supported |
| 47 | Wallet Connect | `nip47` | Supported |
| 49 | Encrypted Secret Key | `nip49` | Supported |
| 50 | Search | (core) | Supported |
| 51 | Lists | (core) | Supported |
| 53 | Live Events | (core) | Supported |
| 56 | Reporting | (core) | Supported |
| 57 | Zaps | `nip57` | Supported |
| 58 | Badges | (core) | Supported |
| 59 | Gift Wrap | `nip59` | Supported |
| 60 | Cashu Wallet | `nip60` | Supported |
| 62 | Request to Vanish | (core) | Supported |
| 65 | Relay List Metadata | (core) | Supported |
| 70 | Protected Events | (core) | Supported |
| 77 | Negentropy | (core) | Supported |
| 88 | Polls | (core) | Supported |
| 90 | Data Vending Machine | (core) | Supported |
| 94 | File Metadata | (core) | Supported |
| 96 | HTTP File Storage | N/A (separate crate) | Supported |
| 98 | HTTP Auth | `nip98` | Supported |

**Unsupported (as of 0.38):** Calendar Events (NIP-52), Wiki (NIP-54), Relay Discovery (NIP-66).

---

## Event Building Patterns

`EventBuilder` provides typed constructors for every supported event kind. These ensure correct tag structure and content formatting.

### Core Social

```rust
// Text note (kind 1)
EventBuilder::text_note("Hello world")

// Reply to a note
EventBuilder::text_note_reply(
    "Great post!",
    &parent_event,        // event being replied to
    Some(&root_event),    // thread root (if different)
    Some(relay_url),      // relay hint
)

// Comment (NIP-22) -- works across event kinds
EventBuilder::comment("Interesting", &target_event, Some(&root))

// Reaction (NIP-25)
EventBuilder::reaction(&target_event, "+")      // like
EventBuilder::reaction(&target_event, "-")       // dislike
EventBuilder::reaction(&target_event, "\u{1f525}") // custom emoji

// Repost (NIP-18)
EventBuilder::repost(&original_event, Some(relay_url))

// Delete (NIP-09)
let request = EventDeletionRequest::new().id(event_id).reason("posted by mistake");
EventBuilder::delete(request)
```

### Profile and Lists

```rust
// Profile metadata (kind 0)
let metadata = Metadata::new()
    .name("Alice")
    .about("Nostr developer")
    .picture(Url::parse("https://example.com/avatar.jpg")?)
    .nip05("alice@example.com");
EventBuilder::metadata(&metadata)

// Contact/follow list (kind 3)
let contacts = vec![
    Contact::new(pubkey1, Some(relay_url), Some("alice".to_string())),
    Contact::new(pubkey2, None, None),
];
EventBuilder::contact_list(contacts)

// Relay list (NIP-65)
EventBuilder::relay_list([
    (RelayUrl::parse("wss://relay.damus.io")?, Some(RelayMetadata::Write)),
    (RelayUrl::parse("wss://nos.lol")?, Some(RelayMetadata::Read)),
    (RelayUrl::parse("wss://relay.rip")?, None), // read + write
])

// Mute list, bookmarks, interests (NIP-51)
EventBuilder::mute_list(mute_list)
EventBuilder::bookmarks(bookmarks)
EventBuilder::pinned_notes([event_id_1, event_id_2])
```

### Long-form and Structured Content

```rust
// Article (NIP-23)
EventBuilder::long_form_text_note("# My Article\n\nContent here...")

// Code snippet (NIP-C0)
EventBuilder::code_snippet(CodeSnippet { /* ... */ })

// Poll (NIP-88)
EventBuilder::poll(Poll { /* ... */ })
```

### Encrypted Messaging

```rust
// Private DM via gift wrap (NIP-17, recommended)
let msg = EventBuilder::private_msg(
    &keys,            // signer
    receiver_pubkey,  // recipient
    "Secret message", // content
    [],               // extra tags on the rumor
).await?;

// Legacy encrypted DM (NIP-04, deprecated)
// Use nip04::encrypt / nip04::decrypt directly
```

### Channels (NIP-28)

```rust
EventBuilder::channel(&channel_metadata)
EventBuilder::channel_msg(channel_id, relay_url, "Hello channel!")
EventBuilder::channel_metadata(channel_id, Some(relay_url), &updated_metadata)
```

### Marketplace (NIP-15)

```rust
EventBuilder::stall_data(stall)
EventBuilder::product_data(product)
```

### Badges (NIP-58)

```rust
EventBuilder::define_badge("best-poster", Some("Best Poster"), None, None, None, vec![])
EventBuilder::award_badge(&badge_def_event, [recipient_pubkey])?
```

### Zaps (NIP-57)

```rust
// Zap request (send to LNURL, not to relays)
EventBuilder::public_zap_request(zap_data)

// Zap receipt (created by LNURL server)
EventBuilder::zap_receipt(bolt11, Some(preimage), &zap_request)
```

### Git (NIP-34)

```rust
EventBuilder::git_repository_announcement(announcement)?
EventBuilder::git_issue(issue)?
EventBuilder::git_patch(patch)?
EventBuilder::git_pull_request(pull_request)?
```

### Data Vending Machine (NIP-90)

```rust
EventBuilder::job_request(Kind::Custom(5100))?  // Job kind
EventBuilder::job_result(job_request_event, "result data", 1000, None)?
EventBuilder::job_feedback(feedback_data)
```

### Authentication

```rust
// NIP-42 relay auth
EventBuilder::auth(challenge_string, relay_url)

// NIP-98 HTTP auth
EventBuilder::http_auth(HttpData { url, method, payload_hash })
```

### Custom Events

```rust
// Any kind with any content
EventBuilder::new(Kind::Custom(30078), r#"{"key": "value"}"#)
    .tag(Tag::identifier("my-app-data"))
    .tag(Tag::hashtag("nostr"))
```

---

## Encryption

### NIP-44 (Recommended -- Versioned Encryption)

Requires feature flag `nip44`.

```rust
use nostr::nips::nip44;

// Encrypt
let ciphertext = nip44::encrypt(
    sender_secret_key,
    &receiver_public_key,
    "secret message",
)?;

// Decrypt
let plaintext = nip44::decrypt(
    receiver_secret_key,
    &sender_public_key,
    &ciphertext,
)?;

// Via NostrSigner trait
let ciphertext = keys.nip44_encrypt(&receiver_pubkey, "secret").await?;
let plaintext = keys.nip44_decrypt(&sender_pubkey, &ciphertext).await?;
```

### NIP-04 (Legacy -- Deprecated)

Requires feature flag `nip04`. Still widely used but has known cryptographic weaknesses.

```rust
use nostr::nips::nip04;

let ciphertext = nip04::encrypt(sender_secret_key, &receiver_public_key, "message")?;
let plaintext = nip04::decrypt(receiver_secret_key, &sender_public_key, &ciphertext)?;
```

### NIP-59 (Gift Wrap / Sealed Events)

Requires feature flag `nip59`. Provides sender anonymity by wrapping events in multiple encryption layers.

```rust
// Send a gift-wrapped private message (NIP-17)
let msg = EventBuilder::private_msg(&keys, receiver, "hello", []).await?;
client.send_event(&msg).to_nip17().await?;

// Unwrap a received gift wrap
let UnwrappedGift { rumor, sender } = UnwrappedGift::from_gift_wrap(&keys, &gift_wrap_event).await?;
println!("From: {}, Content: {}", sender, rumor.content);
```

---

## Key Management

### Generation and Import

```rust
// Random generation (requires os-rng feature)
let keys = Keys::generate();

// From nsec (NIP-19 bech32)
let keys = Keys::parse("nsec1...")?;

// From hex secret key
let keys = Keys::parse("6b911fd37cdf5c81d4c0adb1ab7fa822ed253ab0ad9aa18d77257c88b29b718e")?;

// From BIP39 mnemonic (requires nip06 feature)
use nostr::nips::nip06;
let mnemonic = nip06::generate_mnemonic(12)?;  // 12 or 24 words
let keys = Keys::from_mnemonic(&mnemonic, None)?;  // None = no passphrase
```

### Encrypted Export (NIP-49)

```rust
use nostr::nips::nip49;

// Export secret key encrypted with password
let ncryptsec = nip49::encrypt(keys.secret_key(), "my-password")?;
// ncryptsec1...

// Import from encrypted format
let secret_key = nip49::decrypt(&ncryptsec, "my-password")?;
let keys = Keys::new(secret_key);
```

### Public Key Operations

```rust
let pk = PublicKey::from_hex("...")?;
let pk = PublicKey::from_bech32("npub1...")?;

// Display
println!("Hex: {}", pk.to_hex());
println!("Bech32: {}", pk.to_bech32()?);
```

---

## Nostr Connect / Bunker (NIP-46)

Nostr Connect allows remote signing -- the private key stays on a separate device (the "bunker") while your application requests signatures over the Nostr protocol.

The `nostr-connect` crate implements the client side:

```rust
use nostr_connect::prelude::*;
use nostr_sdk::prelude::*;

// Parse bunker URI
// bunker://<remote-pubkey>?relay=wss://relay.example.com&secret=<secret>
let uri = NostrConnectURI::parse("bunker://...")?;

// Create signer from URI
let connect_signer = NostrConnect::new(uri, keys_for_transport, None).await?;

// Use with Client
let client = Client::builder()
    .signer(connect_signer)
    .build();

// All signing now goes through the bunker
client.send_event_builder(EventBuilder::text_note("Signed remotely!")).await?;
```

---

## NWC Support (NIP-47)

Nostr Wallet Connect allows interaction with Lightning wallets over the Nostr protocol.

```rust
use nwc::prelude::*;

// Parse NWC URI
// nostr+walletconnect://<wallet-pubkey>?relay=wss://...&secret=<secret>
let uri = NostrWalletConnectURI::parse("nostr+walletconnect://...")?;

// Create NWC client
let nwc = NWC::new(uri).await?;

// Pay an invoice
let result = nwc.pay_invoice("lnbc...").await?;

// Get balance
let balance = nwc.get_balance().await?;
println!("Balance: {} msats", balance);

// Create an invoice
let invoice = nwc.make_invoice(1000, Some("description"), None).await?;
```

---

## Error Handling

rust-nostr uses a boxed error type alias for the protocol crate:

```rust
// nostr crate
pub type Result<T> = core::result::Result<T, Box<dyn core::error::Error>>;
```

The SDK defines its own error types:

```rust
// nostr-sdk
pub enum Error {
    Signer(SignerError),
    Relay(RelayError),
    Database(DatabaseError),
    // ...
}
```

**Pattern: handling send failures gracefully**

```rust
let output = client.send_event_builder(builder).await?;

// Check which relays succeeded/failed
if output.success.is_empty() {
    eprintln!("Event not sent to any relay!");
    for (url, err) in &output.failed {
        eprintln!("  {} failed: {}", url, err);
    }
}
```

**Pattern: matching on specific errors**

```rust
match client.send_event_builder(builder).await {
    Ok(output) => { /* success */ }
    Err(e) => {
        // The error can be downcast or pattern-matched
        eprintln!("Failed: {}", e);
    }
}
```

---

## Async Runtime Considerations

`nostr-sdk` is built on **tokio** and requires a tokio async runtime:

```rust
#[tokio::main]
async fn main() -> Result<()> {
    // All nostr-sdk operations are async
    let client = Client::default();
    client.add_relay("wss://relay.damus.io").await?;
    client.connect().await;
    Ok(())
}
```

### WASM Considerations

The crates support `wasm32-unknown-unknown` and `wasm32-wasip2` targets. On WASM, the async runtime uses `wasm-bindgen-futures` instead of tokio. Feature flags handle this automatically.

### Blocking Context

If you need to call nostr-sdk from synchronous code:

```rust
let rt = tokio::runtime::Runtime::new()?;
rt.block_on(async {
    let client = Client::default();
    client.add_relay("wss://relay.damus.io").await?;
    client.connect().await;
    Ok::<_, Box<dyn std::error::Error>>(())
})?;
```

### Tracing

Both crates use the `tracing` crate for structured logging. Initialize a subscriber to see logs:

```rust
tracing_subscriber::fmt::init();
// Now you will see debug/info/warn/error logs from nostr-sdk internals
```

---

## Further Reading

- [API Reference](./api-reference.md) -- Quick reference for the most important types and functions
- [Basic Usage Example](./examples/basic_usage.rs) -- Complete working example
- [Official Examples](https://github.com/rust-nostr/nostr/tree/master/sdk/examples) -- 19 examples in the repository
- [docs.rs/nostr](https://docs.rs/nostr) -- Full protocol crate API docs
- [docs.rs/nostr-sdk](https://docs.rs/nostr-sdk) -- Full SDK API docs
