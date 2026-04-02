# Rust NOSTR API Reference

Quick reference for the most important types, functions, and patterns in the `nostr` and `nostr-sdk` crates.

**Crate versions:** 0.38.x | **Rust edition:** 2024 | **MSRV:** 1.85.0

---

## Setup

```toml
[dependencies]
nostr-sdk = "0.38"
tokio = { version = "1", features = ["full"] }
```

```rust
use nostr_sdk::prelude::*;
```

---

## Keys

### Generate and Parse

```rust
// Generate new random keypair
let keys = Keys::generate();

// Parse from nsec (bech32)
let keys = Keys::parse("nsec1ufnus6pju578ste3v90xd5m2decpuzpql2295m3sknqcjzyys9ls0qlc85")?;

// Parse from hex
let keys = Keys::parse("6b911fd37cdf5c81d4c0adb1ab7fa822ed253ab0ad9aa18d77257c88b29b718e")?;

// From SecretKey
let sk = SecretKey::from_hex("...")?;
let keys = Keys::new(sk);
```

### Access

```rust
let pk: PublicKey = keys.public_key();
let sk: &SecretKey = keys.secret_key();

// Bech32 encoding
let npub: String = pk.to_bech32()?;   // npub1...
let nsec: String = sk.to_bech32()?;   // nsec1...

// Hex encoding
let hex: String = pk.to_hex();
```

### BIP39 (NIP-06)

```rust
// Requires: nostr = { features = ["nip06"] }
use nostr::nips::nip06;

let mnemonic = nip06::generate_mnemonic(12)?;  // 12 or 24 words
let keys = Keys::from_mnemonic(&mnemonic, None)?;
```

### Encrypted Export/Import (NIP-49)

```rust
use nostr::nips::nip49;

let ncryptsec = nip49::encrypt(keys.secret_key(), "password")?;
let sk = nip49::decrypt(&ncryptsec, "password")?;
```

---

## PublicKey

```rust
// Parse
let pk = PublicKey::from_hex("7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e")?;
let pk = PublicKey::from_bech32("npub1...")?;

// Display
pk.to_hex()     // "7e7e9c42..."
pk.to_bech32()? // "npub1..."
```

---

## Client

### Lifecycle

```rust
// Create
let client = Client::default();                    // read-only
let client = Client::builder().signer(keys).build(); // with signing

// Relays
client.add_relay("wss://relay.damus.io").await?;
client.add_relay("wss://nos.lol").read_only().await?;

// Connect
client.connect().await;                            // fire and forget
client.try_connect().timeout(Duration::from_secs(10)).await; // with timeout

// Disconnect / Shutdown
client.disconnect().await;
client.shutdown().await;
```

### Relay Access

```rust
let relays = client.relays().await;
let relay = client.relay("wss://relay.damus.io").await?;
client.remove_relay("wss://old.relay.com").await?;
client.remove_all_relays().await?;
```

### Auto-Auth (NIP-42)

```rust
client.automatic_authentication(true);
```

---

## EventBuilder

### Construction

```rust
// Generic
EventBuilder::new(Kind::Custom(30078), "content")

// With tags and options
EventBuilder::text_note("Hello")
    .tag(Tag::hashtag("nostr"))
    .tag(Tag::public_key(some_pubkey))
    .pow(16)
    .custom_created_at(Timestamp::now())
```

### Signing

```rust
// Sign with Keys directly
let event: Event = EventBuilder::text_note("hello")
    .sign_with_keys(&keys)?;

// Sign via any NostrSigner
let event: Event = EventBuilder::text_note("hello")
    .sign(&keys).await?;

// Build unsigned (no signing)
let unsigned: UnsignedEvent = EventBuilder::text_note("hello")
    .build(keys.public_key());
```

### Social Event Constructors

| Method | Kind | NIP | Description |
|--------|------|-----|-------------|
| `text_note(content)` | 1 | 01 | Short text note |
| `text_note_reply(content, reply_to, root, relay)` | 1 | 10 | Threaded reply |
| `comment(content, target, root)` | 1111 | 22 | Comment on any event |
| `reaction(target, reaction)` | 7 | 25 | Reaction (+, -, emoji) |
| `repost(event, relay)` | 6 | 18 | Repost/boost |
| `long_form_text_note(content)` | 30023 | 23 | Article |
| `metadata(metadata)` | 0 | 01 | Profile metadata |
| `contact_list(contacts)` | 3 | 02 | Follow list |
| `delete(request)` | 5 | 09 | Delete events |

### Messaging Constructors

| Method | Kind | NIP | Description |
|--------|------|-----|-------------|
| `private_msg(signer, receiver, msg, tags)` | 1059 | 17 | Gift-wrapped DM |
| `private_msg_rumor(receiver, msg)` | 14 | 17 | DM rumor (pre-wrap) |
| `channel(metadata)` | 40 | 28 | Create channel |
| `channel_msg(id, relay, content)` | 42 | 28 | Channel message |
| `chat_message(content)` | - | C7 | Chat message |
| `voice_message(url)` | - | A0 | Voice message |

### List Constructors (NIP-51)

| Method | Description |
|--------|-------------|
| `relay_list(relays)` | NIP-65 relay list |
| `mute_list(list)` | Muted users/events |
| `pinned_notes(ids)` | Pinned notes |
| `bookmarks(list)` | Bookmarks |
| `interests(list)` | Interests |
| `communities(communities)` | Communities |
| `follow_set(id, pubkeys)` | Named follow set |
| `relay_set(id, relays)` | Named relay set |
| `emoji_set(id, emojis)` | Custom emoji set |

### Encryption / Sealed Events

| Method | Kind | NIP | Description |
|--------|------|-----|-------------|
| `seal(signer, receiver, rumor)` | 13 | 59 | Sealed event |
| `gift_wrap(signer, receiver, rumor, tags)` | 1059 | 59 | Gift-wrapped event |
| `auth(challenge, relay)` | 22242 | 42 | Relay auth |
| `nostr_connect(keys, receiver, msg)` | 24133 | 46 | NIP-46 message |

### Payment / Commerce

| Method | NIP | Description |
|--------|-----|-------------|
| `public_zap_request(data)` | 57 | Zap request |
| `zap_receipt(bolt11, preimage, request)` | 57 | Zap receipt |
| `stall_data(stall)` | 15 | Marketplace stall |
| `product_data(product)` | 15 | Marketplace product |

### Git (NIP-34)

| Method | Description |
|--------|-------------|
| `git_repository_announcement(data)` | Repo announcement |
| `git_issue(issue)` | Git issue |
| `git_patch(patch)` | Git patch |
| `git_pull_request(pr)` | Pull request |
| `git_pull_request_update(update)` | PR update |

### Other Constructors

| Method | NIP | Description |
|--------|-----|-------------|
| `live_event(event)` | 53 | Live event |
| `live_event_msg(id, host, content, relay)` | 53 | Live event chat |
| `report(tags, content)` | 56 | Report user/content |
| `define_badge(...)` | 58 | Badge definition |
| `award_badge(def, pubkeys)` | 58 | Award badge |
| `job_request(kind)` | 90 | DVM job request |
| `job_result(request, payload, msats, bolt11)` | 90 | DVM job result |
| `label(namespace, label)` | 32 | Label |
| `live_status(status, content)` | 38 | User status |
| `torrent(metadata)` | 35 | Torrent |
| `poll(poll)` | 88 | Poll |
| `http_auth(data)` | 98 | HTTP auth |
| `code_snippet(snippet)` | C0 | Code snippet |
| `web_bookmark(bookmark)` | B0 | Web bookmark |
| `request_vanish(target)` | 62 | Request to vanish |

---

## Event

### Fields

```rust
pub struct Event {
    pub id: EventId,
    pub pubkey: PublicKey,
    pub created_at: Timestamp,
    pub kind: Kind,
    pub tags: Tags,
    pub content: String,
    pub sig: Signature,
}
```

### Verification

```rust
event.verify()?;              // Verify ID + signature
event.verify_id()?;           // Verify ID only
event.verify_signature()?;    // Verify signature only
event.check_pow(20);          // Check PoW difficulty
event.is_expired();           // Check NIP-40 expiration
event.is_protected();         // Check NIP-70 protected flag
```

### Serialization

```rust
let json: String = event.as_json();
let event: Event = Event::from_json(&json)?;
let bech32: String = event.id.to_bech32()?;  // note1...
```

---

## Filter

### Builder Pattern

```rust
let filter = Filter::new()
    .author(pubkey)
    .kind(Kind::TextNote)
    .since(Timestamp::now() - Duration::from_secs(3600))
    .limit(50);

// Multiple authors/kinds
let filter = Filter::new()
    .authors([pubkey1, pubkey2])
    .kinds([Kind::TextNote, Kind::Repost])
    .limit(100);

// Tag filters
let filter = Filter::new()
    .event(event_id)                    // #e tag
    .pubkey(some_pubkey)                // #p tag
    .hashtag("bitcoin")                 // #t tag
    .identifier("my-article")           // #d tag
    .reference("https://example.com")   // #r tag
    .coordinate(coordinate);            // #a tag

// Full-text search (NIP-50)
let filter = Filter::new()
    .kind(Kind::TextNote)
    .search("bitcoin lightning")
    .limit(100);

// Custom tag
let filter = Filter::new()
    .custom_tag(SingleLetterTag::lowercase(Alphabet::L), vec!["en"]);
```

### Matching

```rust
let matches: bool = filter.match_event(&event, MatchOptions::default());
let empty: bool = filter.is_empty();
```

---

## Publishing

### Via Client (recommended)

```rust
// Build + sign + send in one call
let output = client.send_event_builder(EventBuilder::text_note("hello")).await?;
println!("Event: {}", output.id().to_bech32()?);

// Send to specific relays
client.send_event_builder_to(
    ["wss://relay.damus.io", "wss://nos.lol"],
    EventBuilder::text_note("targeted"),
).await?;

// Pre-sign then send
let event = client.sign_event_builder(EventBuilder::text_note("pre-signed")).await?;
client.send_event(&event).await?;

// Send to NIP-17 (gift wrap routing)
let msg = EventBuilder::private_msg(&keys, receiver, "secret", []).await?;
client.send_event(&msg).to_nip17().await?;
```

### Output Inspection

```rust
let output = client.send_event_builder(builder).await?;

output.id()       // EventId
output.success    // Vec<RelayUrl> -- relays that accepted
output.failed     // HashMap<RelayUrl, Option<String>> -- relays that rejected
```

---

## Subscribing

### Long-lived Subscriptions

```rust
// Subscribe with auto-generated ID
let Output { val: sub_id, .. } = client.subscribe(filter).await?;

// Subscribe with custom ID
let sub_id = SubscriptionId::new("my-feed");
client.subscribe(filter).with_id(sub_id.clone()).await?;

// Close
client.unsubscribe(&sub_id).await?;
client.unsubscribe_all().await?;
```

### Short-lived Streams

```rust
let mut stream = client
    .stream_events(filter)
    .timeout(Duration::from_secs(15))
    .policy(ReqExitPolicy::ExitOnEOSE)
    .await?;

while let Some((relay_url, result)) = stream.next().await {
    let event = result?;
    // process event
}
```

### Buffered Fetch

```rust
let events = client
    .fetch_events(filter)
    .timeout(Duration::from_secs(10))
    .await?;

for event in events {
    // process event
}
```

### Notifications (for long-lived subscriptions)

```rust
let mut notifications = client.notifications();

while let Some(notification) = notifications.next().await {
    match notification {
        ClientNotification::Event { subscription_id, event, relay_url } => {
            println!("[{}] {}", relay_url, event.content);
        }
        ClientNotification::Message { relay_url, message } => {
            // RelayMessage: Ok, Notice, Closed, Auth, etc.
        }
        _ => {}
    }
}
```

---

## Encryption

### NIP-44 (Recommended)

```rust
use nostr::nips::nip44;

let ciphertext = nip44::encrypt(sender_sk, &receiver_pk, "secret")?;
let plaintext = nip44::decrypt(receiver_sk, &sender_pk, &ciphertext)?;

// Via NostrSigner trait
let ct = keys.nip44_encrypt(&receiver_pk, "secret").await?;
let pt = keys.nip44_decrypt(&sender_pk, &ct).await?;
```

### NIP-04 (Legacy)

```rust
use nostr::nips::nip04;

let ciphertext = nip04::encrypt(sender_sk, &receiver_pk, "message")?;
let plaintext = nip04::decrypt(receiver_sk, &sender_pk, &ciphertext)?;
```

### Gift Wrap (NIP-59)

```rust
// Full gift-wrap cycle
let rumor = EventBuilder::private_msg_rumor(receiver, "hello").build(keys.public_key());
let gift = EventBuilder::gift_wrap(&keys, &receiver, rumor, []).await?;

// Unwrap
let UnwrappedGift { rumor, sender } = UnwrappedGift::from_gift_wrap(&keys, &gift).await?;
```

---

## Metadata

```rust
let metadata = Metadata::new()
    .name("alice")
    .display_name("Alice")
    .about("Nostr developer")
    .picture(Url::parse("https://example.com/pic.jpg")?)
    .banner(Url::parse("https://example.com/banner.jpg")?)
    .nip05("alice@example.com")
    .lud16("alice@getalby.com");   // Lightning address

// Publish
client.send_event_builder(EventBuilder::metadata(&metadata)).await?;

// Parse from event
let metadata = Metadata::from_json(&event.content)?;
println!("Name: {:?}", metadata.name);
```

---

## Tag

### Construction

```rust
Tag::event(event_id)
Tag::public_key(pubkey)
Tag::hashtag("nostr")
Tag::identifier("my-article")
Tag::reference("https://example.com")
Tag::relay_metadata(relay_url, Some(RelayMetadata::Read))
Tag::expiration(Timestamp::now() + Duration::from_secs(86400))
Tag::pow(nonce, difficulty)
Tag::coordinate(coordinate)
```

### Access

```rust
let kind: TagKind = tag.kind();
let standard: Option<&TagStandard> = tag.as_standardized();
let raw: &[String] = tag.as_slice();
```

---

## Kind Constants

```rust
Kind::Metadata                  // 0
Kind::TextNote                  // 1
Kind::ContactList               // 3
Kind::EncryptedDirectMessage    // 4 (NIP-04, deprecated)
Kind::EventDeletion             // 5
Kind::Repost                    // 6
Kind::Reaction                  // 7
Kind::PrivateDirectMessage      // 14 (NIP-17)
Kind::GiftWrap                  // 1059 (NIP-59)
Kind::RelayList                 // 10002 (NIP-65)
Kind::LongFormTextNote          // 30023 (NIP-23)
Kind::Custom(n)                 // Any u16
```

---

## Timestamp

```rust
let now = Timestamp::now();
let custom = Timestamp::from_secs(1700000000);
let unix: u64 = now.as_u64();
```

---

## RelayUrl

```rust
let url = RelayUrl::parse("wss://relay.damus.io")?;
```

---

## SubscriptionId

```rust
let id = SubscriptionId::new("my-sub");
let id = SubscriptionId::generate();  // random
```

---

## Common Patterns

### Bot Pattern

```rust
use nostr_sdk::prelude::*;

#[tokio::main]
async fn main() -> Result<()> {
    let keys = Keys::parse("nsec1...")?;
    let client = Client::builder().signer(keys.clone()).build();

    client.add_relay("wss://relay.damus.io").await?;
    client.connect().await;

    // Subscribe to DMs
    let filter = Filter::new()
        .pubkey(keys.public_key())
        .kind(Kind::GiftWrap)
        .limit(0);  // only new events
    client.subscribe(filter).await?;

    let mut notifications = client.notifications();
    while let Some(notification) = notifications.next().await {
        if let ClientNotification::Event { event, .. } = notification {
            if event.kind == Kind::GiftWrap {
                if let Ok(UnwrappedGift { rumor, sender }) =
                    UnwrappedGift::from_gift_wrap(&keys, &event).await
                {
                    let reply = format!("Echo: {}", rumor.content);
                    let msg = EventBuilder::private_msg(&keys, sender, reply, []).await?;
                    client.send_event(&msg).to_nip17().await?;
                }
            }
        }
    }
    Ok(())
}
```

### Feed Reader Pattern

```rust
use std::time::Duration;
use nostr_sdk::prelude::*;

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::default();
    client.add_relay("wss://relay.damus.io").await?;
    client.add_relay("wss://nos.lol").await?;
    client.connect().await;

    let authors = [
        PublicKey::from_bech32("npub1...")?,
        PublicKey::from_bech32("npub1...")?,
    ];

    let filter = Filter::new()
        .authors(authors)
        .kind(Kind::TextNote)
        .since(Timestamp::now() - Duration::from_secs(86400))
        .limit(50);

    let events = client.fetch_events(filter).timeout(Duration::from_secs(10)).await?;

    for event in events {
        println!("{}: {}", event.created_at, event.content);
    }
    Ok(())
}
```

### Profile Lookup Pattern

```rust
let filter = Filter::new()
    .author(target_pubkey)
    .kind(Kind::Metadata)
    .limit(1);

let events = client.fetch_events(filter).timeout(Duration::from_secs(5)).await?;

if let Some(event) = events.into_iter().next() {
    let meta = Metadata::from_json(&event.content)?;
    println!("Name: {:?}", meta.name);
    println!("About: {:?}", meta.about);
    println!("NIP-05: {:?}", meta.nip05);
}
```

### Hashtag Search Pattern

```rust
let filter = Filter::new()
    .kind(Kind::TextNote)
    .hashtag("bitcoin")
    .since(Timestamp::now() - Duration::from_secs(3600))
    .limit(20);

let mut stream = client
    .stream_events(filter)
    .timeout(Duration::from_secs(10))
    .policy(ReqExitPolicy::ExitOnEOSE)
    .await?;

while let Some((_url, result)) = stream.next().await {
    let event = result?;
    println!("{}", event.content);
}
```

---

## Feature Flag Quick Reference

| Feature | Enables |
|---------|---------|
| `std` | Standard library (default) |
| `alloc` | Heap allocation without std |
| `rand` | Random number generation |
| `os-rng` | OS-level randomness |
| `nip03` | OpenTimestamps |
| `nip04` | Legacy encrypted DMs |
| `nip06` | BIP39 mnemonic key derivation |
| `nip44` | Versioned encryption |
| `nip46` | Nostr Connect messages |
| `nip47` | Wallet Connect messages |
| `nip49` | Encrypted secret key export |
| `nip57` | Zaps |
| `nip59` | Gift wrap / sealed events |
| `nip60` | Cashu wallet |
| `nip98` | HTTP auth |
| `all-nips` | All NIP implementations |
| `pow-multi-thread` | Multi-threaded PoW mining |

---

## Links

- [docs.rs/nostr](https://docs.rs/nostr) -- Protocol crate API docs
- [docs.rs/nostr-sdk](https://docs.rs/nostr-sdk) -- SDK API docs
- [GitHub Examples](https://github.com/rust-nostr/nostr/tree/master/sdk/examples) -- 19 official examples
- [README](./README.md) -- Ecosystem overview
- [Deep Dive](./nostr-sdk.md) -- Full SDK walkthrough
