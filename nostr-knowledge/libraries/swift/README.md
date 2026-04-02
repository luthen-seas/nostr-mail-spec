# Swift NOSTR Ecosystem

> Deep-dive reference for building NOSTR applications on Apple platforms (iOS, macOS, tvOS, watchOS).

## Table of Contents

- [Ecosystem Overview](#ecosystem-overview)
- [Library Comparison Matrix](#library-comparison-matrix)
- [nostr-sdk-ios (Native Swift)](#nostr-sdk-ios)
- [rust-nostr Swift Bindings (FFI)](#rust-nostr-swift-bindings)
- [NostrKit](#nostrkit)
- [nostr-essentials](#nostr-essentials)
- [Damus Internal Implementation](#damus-internal-implementation)
- [Native Swift vs. rust-nostr FFI: Trade-offs](#native-swift-vs-rust-nostr-ffi)
- [iOS/macOS Platform Considerations](#iosmacos-platform-considerations)
- [SwiftUI Integration Patterns](#swiftui-integration-patterns)
- [Getting Started](#getting-started)

---

## Ecosystem Overview

The Swift NOSTR ecosystem is split into two fundamental approaches:

1. **Pure Swift libraries** -- written entirely in Swift, leveraging Apple platform APIs directly (CryptoKit, Network.framework, URLSessionWebSocketTask).
2. **Rust FFI bindings** -- the rust-nostr project compiled into XCFrameworks via UniFFI, exposing Rust types to Swift.

Five libraries serve different niches:

| Library | Approach | Maturity | Best For |
|---------|----------|----------|----------|
| **nostr-sdk-ios** | Pure Swift | Production | Full-featured iOS/macOS client development |
| **rust-nostr (nostr-sdk-swift)** | Rust FFI | Alpha/Beta | Cross-platform apps sharing logic with Android/desktop |
| **NostrKit** | Pure Swift | Minimal | Learning, lightweight relay interaction |
| **nostr-essentials** | Pure Swift | Production | Nostur client, crypto/encoding utilities |
| **Damus internal** | Pure Swift | Production | Reference architecture (not a reusable library) |

---

## Library Comparison Matrix

| Feature | nostr-sdk-ios | rust-nostr Swift | NostrKit | nostr-essentials |
|---------|---------------|------------------|----------|------------------|
| **GitHub** | nostr-sdk/nostr-sdk-ios | rust-nostr/nostr-sdk-swift | cnixbtc/NostrKit | nostur-com/nostr-essentials |
| **Min iOS** | 15 | 14 | 13+ | 15+ |
| **Min macOS** | 14 | 12 | 12+ | 12+ |
| **Swift version** | 5.10+ | 5.5+ | 5.5+ | 5.7+ |
| **NIPs implemented** | 26+ (NIP-01 through NIP-65) | 50+ (inherits from rust-nostr) | NIP-01 basics | NIP-01, NIP-04, NIP-05, NIP-19, NIP-44, NIP-96, NIP-98 |
| **Relay management** | Built-in | Built-in (full pool) | None (BYO WebSocket) | ConnectionPool |
| **Key management** | Keypair type | Keys type | KeyPair type | Keys type |
| **Encryption** | NIP-04, NIP-17, NIP-44 | NIP-04, NIP-17, NIP-44, NIP-59 | None | NIP-04, NIP-44 |
| **NIP-19 encoding** | Full (npub, nsec, note, nprofile, nevent, naddr) | Full | None | Full (npub, nsec, note, nevent, naddr) |
| **Zaps (NIP-57)** | Not yet | Yes | No | No |
| **License** | MIT | MIT | MIT | MIT |
| **Package manager** | SPM | SPM | SPM | SPM |

---

## nostr-sdk-ios

> **Repository**: [github.com/nostr-sdk/nostr-sdk-ios](https://github.com/nostr-sdk/nostr-sdk-ios)
> **Maintainers**: Terry Yiu (active), Bryan Montz, Joel Klabo (passive)
> **Module name**: `NostrSDK`

### Installation

**Xcode**: File -> Add Package Dependencies -> `https://github.com/nostr-sdk/nostr-sdk-ios.git`

**Package.swift**:
```swift
.package(url: "https://github.com/nostr-sdk/nostr-sdk-ios.git", .upToNextMajor(from: "0.3.0"))
```

### Key Types

| Type | Purpose |
|------|---------|
| `Keypair` | Holds a private/public key pair for signing |
| `PublicKey` | A nostr public key (supports hex and bech32/npub) |
| `NostrEvent` | The core signed event structure (NIP-01) |
| `EventCreating` | Protocol for building different event kinds |
| `TextNoteEvent` | Kind 1 text note with threading support (NIP-10) |
| `MetadataEvent` | Kind 0 user metadata (NIP-24) |
| `FollowListEvent` | Kind 3 follows list (NIP-02) |
| `DirectMessageEvent` | Encrypted DMs (NIP-04, NIP-17) |
| `DeletionEvent` | Event deletion requests (NIP-09) |
| `ReactionEvent` | Reactions to events (NIP-25) |
| `LongformContentEvent` | Long-form articles (NIP-23) |
| `CalendarEvent` | Calendar events (NIP-52) |
| `RelayMetadataEvent` | Relay list metadata (NIP-65) |
| `Filter` | Subscription filter for REQ messages |
| `Tag` | Event tag with identifier and values |

### NIP Support (26 NIPs fully implemented)

NIP-01 (basic protocol), NIP-02 (follows), NIP-04 (encrypted DMs, deprecated), NIP-05 (DNS mapping), NIP-09 (deletion), NIP-10 (threads), NIP-11 (relay info), NIP-14 (subject tags), NIP-17 (private messages), NIP-18 (reposts), NIP-19 (bech32 encoding), NIP-23 (long-form content), NIP-24 (extra metadata), NIP-25 (reactions), NIP-30 (custom emoji), NIP-31 (unknown events), NIP-32 (labeling), NIP-36 (sensitive content), NIP-37 (drafts), NIP-40 (expiration), NIP-44 (versioned encryption), NIP-52 (calendar events), NIP-56 (reporting), NIP-59 (gift wrap), NIP-65 (relay list metadata).

**Not yet implemented**: NIP-06 (key derivation from mnemonic), NIP-13 (proof of work), NIP-42 (relay authentication), NIP-46 (Nostr Connect / remote signing), NIP-57 (zaps).

### Architecture

nostr-sdk-ios follows a protocol-oriented Swift design. Event types conform to shared protocols like `NostrEvent` and `EventCreating`, making it easy to extend with custom event kinds. The library uses Swift's native `CryptoKit` for schnorr signatures and `secp256k1` operations.

### Code Example

```swift
import NostrSDK

// Generate a new keypair
let keypair = try Keypair()

// Access keys in different formats
let npub = keypair.publicKey.npub       // bech32 public key
let nsec = keypair.privateKey?.nsec     // bech32 private key
let hexPubkey = keypair.publicKey.hex   // hex public key

// Create a text note event (kind 1)
let textNote = try TextNoteEvent(content: "Hello from nostr-sdk-ios!", signedBy: keypair)

// Create a metadata event (kind 0)
let metadata = try MetadataEvent(
    name: "Alice",
    displayName: "Alice in Nostrland",
    about: "Building on NOSTR",
    pictureURL: URL(string: "https://example.com/avatar.png"),
    signedBy: keypair
)

// Build a subscription filter
let filter = Filter(
    authors: [keypair.publicKey.hex],
    kinds: [1],
    limit: 50
)
```

### Documentation

Full API documentation is published at: [nostr-sdk.github.io/nostr-sdk-ios/documentation/nostrsdk/](https://nostr-sdk.github.io/nostr-sdk-ios/documentation/nostrsdk/)

---

## rust-nostr Swift Bindings

> **Repository**: [github.com/rust-nostr/nostr-sdk-swift](https://github.com/rust-nostr/nostr-sdk-swift)
> **Underlying crate**: [github.com/rust-nostr/nostr](https://github.com/rust-nostr/nostr)
> **Module name**: `NostrSDK` (from the Swift package), wrapping Rust `nostr-sdk`
> **FFI generator**: [UniFFI](https://mozilla.github.io/uniffi-rs/) (Mozilla)

### How the FFI Works

1. The core `nostr` and `nostr-sdk` Rust crates implement the full protocol.
2. The `nostr-sdk-ffi` crate in the rust-nostr monorepo defines FFI bindings using UniFFI's UDL (Uniform Definition Language) files.
3. UniFFI generates a C header and Swift wrapper code that bridges Rust types into native Swift classes and structs.
4. The compiled Rust code is packaged as an XCFramework (`NostrSDKFFI.xcframework`) containing static libraries for each Apple architecture (arm64 for iOS/macOS Apple Silicon, x86_64 for macOS Intel, arm64 for iOS Simulator).
5. The `nostr-sdk-swift` Swift package wraps the XCFramework and re-exports the generated Swift types.

There is also a lower-level `nostr-swift` package ([github.com/rust-nostr/nostr-swift](https://github.com/rust-nostr/nostr-swift)) that exposes only the core `nostr` crate without the SDK's relay management layer.

### Installation

**Package.swift**:
```swift
.package(url: "https://github.com/rust-nostr/nostr-sdk-swift.git", from: "0.39.0")
```

**Xcode**: File -> Add Package Dependencies -> `https://github.com/rust-nostr/nostr-sdk-swift.git`

### Key Types

| Type | Purpose |
|------|---------|
| `Keys` | Generate or restore a keypair |
| `PublicKey` | Nostr public key with bech32/hex conversion |
| `SecretKey` | Nostr private key |
| `Client` | High-level client managing relays and subscriptions |
| `NostrSigner` | Signing abstraction (supports Keys, NIP-46 remote signer) |
| `EventBuilder` | Fluent builder for constructing events |
| `Event` | A signed, immutable nostr event |
| `Filter` | Subscription filter |
| `RelayUrl` | Validated relay URL type |
| `Tag` | Event tag |
| `Metadata` | User profile metadata (kind 0) |
| `Contact` | Contact list entry |
| `Nip19Event`, `Nip19Profile` | NIP-19 shareable identifier types |
| `NostrWalletConnectUri` | NIP-47 wallet connect URI |
| `Nip44` | NIP-44 encryption/decryption |

### NIP Support

rust-nostr has the broadest NIP coverage of any NOSTR library, with 50+ NIPs implemented in the Rust core. All of these are available through the Swift bindings, including:

- NIP-01 through NIP-65 (comprehensive coverage)
- NIP-47 (Nostr Wallet Connect)
- NIP-57 (Zaps)
- NIP-46 (Nostr Connect / remote signing)
- NIP-59 (Gift Wrap)
- NIP-96 (HTTP File Storage)
- NIP-44 (Versioned Encryption)

### Code Example

```swift
import Foundation
import NostrSDK

// Generate new keys
let keys = Keys.generate()
let publicKey = keys.publicKey()
print("npub: \(try publicKey.toBech32())")

// Create a signer
let signer = NostrSigner.keys(keys: keys)

// Initialize client with signer
let client = Client(signer: signer)

// Add relays
try await client.addRelay(url: "wss://relay.damus.io")
try await client.addRelay(url: "wss://nos.lol")

// Connect to all relays
try await client.connect()

// Build and send a text note
let builder = EventBuilder.textNote(content: "Hello from rust-nostr Swift!")
let output = try await client.sendEventBuilder(builder: builder)
print("Event ID: \(try output.id().toBech32())")

// Subscribe to events
let filter = Filter()
    .author(publicKey: publicKey)
    .kind(kind: 1)
    .limit(limit: 20)
try await client.subscribe(filters: [filter])

// Handle events (simplified)
let events = try await client.fetchEvents(filters: [filter], timeout: 10)
for event in events {
    print("Content: \(event.content())")
}
```

### Status

The Swift bindings are labeled **ALPHA**. The API is functional but subject to breaking changes between versions. The rust-nostr project follows a rapid release cycle, and the Swift package versions track the Rust crate versions.

---

## NostrKit

> **Repository**: [github.com/cnixbtc/NostrKit](https://github.com/cnixbtc/NostrKit)
> **Module name**: `NostrKit`
> **Stars**: ~17 | **License**: MIT

NostrKit is a minimal, educational-quality Swift package providing basic data types for interacting with Nostr relays. It does **not** include relay connection management -- you bring your own WebSocket implementation.

### Installation

```swift
.package(url: "https://github.com/cnixbtc/NostrKit.git", from: "1.0.0")
```

### Key Types

| Type | Purpose |
|------|---------|
| `KeyPair` | Cryptographic keypair from a hex private key |
| `Event` | A nostr event (kind 1 text note) |
| `Subscription` | Manages event filters with a unique subscription ID |
| `ClientMessage` | Enum: `.event()`, `.subscribe()`, `.unsubscribe()` |

### Code Example

```swift
import NostrKit

// Create a keypair from a hex private key
let keyPair = try KeyPair(privateKey: "<hex-private-key>")

// Create and sign an event
let event = try Event(keyPair: keyPair, content: "Hello NostrKit.")

// Serialize to a CLIENT message for relay transmission
let message = try ClientMessage.event(event).string()
// Send `message` over your own WebSocket connection

// Subscribe to events by author
let subscription = Subscription(filters: [
    .init(authors: [keyPair.publicKey])
])
let subscribeMsg = try ClientMessage.subscribe(subscription).string()

// Unsubscribe
let unsubscribeMsg = try ClientMessage.unsubscribe(subscription.id).string()
```

### Limitations

- Only implements NIP-01 basics.
- No built-in WebSocket/relay management.
- No encryption (NIP-04, NIP-44).
- No NIP-19 bech32 encoding.
- Minimal maintenance (8 commits total, 2 open issues).
- Best suited for learning the protocol or very simple use cases.

---

## nostr-essentials

> **Repository**: [github.com/nostur-com/nostr-essentials](https://github.com/nostur-com/nostr-essentials)
> **Module name**: `NostrEssentials`
> **Author**: Developed as part of the [Nostur](https://nostur.com) iOS client project (since August 2023).

### Installation

**Xcode**: File -> Add Package Dependencies -> `https://github.com/nostur-com/nostr-essentials`

### Key Types

| Type | Purpose |
|------|---------|
| `Keys` | Key generation and format conversion (hex, npub, nsec) |
| `Event` | Nostr event construction and signing |
| `ConnectionPool` | Multi-relay connection management with read/write config |
| `NIP19` | Bech32 encoding/decoding (npub, nsec, note, nevent, naddr) |
| `ContentParser` | Regex-based content parsing with custom handlers |

### Features

- **Key management**: Generate keys, convert between hex and bech32 (npub/nsec) formats.
- **Event signing**: Create events following NIP-01, compute event IDs, sign with schnorr.
- **Encryption**: Both NIP-04 (deprecated) and NIP-44 (versioned) encryption.
- **Relay pool**: `ConnectionPool` manages multiple relay connections with per-relay read/write configuration.
- **NIP-19**: Full shareable identifier support (naddr, nevent, npub, nsec, note).
- **NIP-05**: Nostr address DNS lookups.
- **NIP-96**: HTTP file storage server uploads.
- **NIP-98**: HTTP authentication via signed events.
- **Blossom**: Decentralized media upload (PUT operations).
- **Content parsing**: Regex-based extraction of mentions, URLs, hashtags, and embedded metadata.

### Code Example

```swift
import NostrEssentials

// Generate new keys
let keys = try Keys.newKeys()
let hexPrivateKey = keys.privateKeyHex
let nsec = keys.nsec()
let npub = keys.npub()

// Create and sign an event
var event = Event(
    pubkey: keys.publicKeyHex,
    content: "Hello from NostrEssentials!",
    kind: 1,
    tags: []
)
let signedEvent = try event.sign(keys)

// NIP-19 encoding
let noteId = try NIP19.encode(note: signedEvent.id)
let nprofile = try NIP19.encode(pubkey: keys.publicKeyHex, relays: ["wss://relay.damus.io"])
```

---

## Damus Internal Implementation

> **Repository**: [github.com/damus-io/damus](https://github.com/damus-io/damus)
> **Note**: Damus is an iOS client, not a reusable library. Its internal nostr implementation is tightly coupled to the app but serves as an excellent reference architecture.

### Architecture Overview

Damus implements its own nostr protocol stack within the app's `damus/Nostr/` directory. Key source files:

| File | Purpose |
|------|---------|
| `Relay.swift` | `RelayInfo` (read/write config), `RelayDescriptor` (URL + variant), relay variant enum (regular, ephemeral, nwc) |
| `RelayConnection.swift` | `ObservableObject` managing a single WebSocket connection with auto-reconnect, backoff timing, `isConnected`/`isConnecting` state |
| `RelayPool.swift` | Manages multiple `RelayConnection` instances, tracks seen events across relays, request queuing, uses `NWPathMonitor` for network status |
| `NostrEvent.swift` | Core event model with signing |
| `NostrFilter.swift` | Subscription filter construction |
| `NostrResponse.swift` | Parsing relay-to-client messages |

### Relay Connection Architecture

```
RelayPool (manages all connections)
  +-- NWPathMonitor (network status)
  +-- RelayConnection[0] (wss://relay.damus.io)
  |     +-- URLSessionWebSocketTask
  |     +-- Backoff timer
  |     +-- isConnected / isConnecting state
  +-- RelayConnection[1] (wss://nos.lol)
  +-- RelayConnection[2] (wss://relay.nostr.band)
  +-- handlers[] (event callbacks)
  +-- requestQueue[] (pending REQ messages)
  +-- seenEvents: Set<String> (deduplication)
```

### Key Design Patterns

1. **Relay variants**: Damus distinguishes between regular relays, ephemeral relays (temporary connections), and NWC relays (Nostr Wallet Connect).
2. **Observable connections**: `RelayConnection` is an `@ObservableObject`, so SwiftUI views can reactively show connection status.
3. **Network monitoring**: The `RelayPool` uses Apple's `NWPathMonitor` to detect network changes and trigger reconnections.
4. **Event deduplication**: The relay pool tracks seen event IDs across all relays to prevent duplicate processing.
5. **Request queuing**: Messages destined for disconnected relays are queued and sent upon reconnection.

### Damus also maintains its own nostr-sdk fork

Damus has a fork at [github.com/damus-io/nostr-sdk](https://github.com/damus-io/nostr-sdk) which is a Rust-based nostr protocol implementation with FFI, though the main Damus iOS app primarily uses its own Swift implementation.

---

## Native Swift vs. rust-nostr FFI

### When to Choose Native Swift (nostr-sdk-ios, nostr-essentials)

**Advantages**:
- Zero bridging overhead -- native Swift types, no FFI boundary crossing.
- Full integration with Apple APIs (CryptoKit, Combine, Swift Concurrency).
- Easier debugging -- step through pure Swift code in Xcode.
- Smaller binary size -- no embedded Rust static library.
- Faster compile times -- no Rust toolchain in the build pipeline.
- SwiftUI-native patterns (`@Observable`, `@Published`, `Sendable`).

**Disadvantages**:
- Fewer NIPs implemented (nostr-sdk-ios has 26; rust-nostr has 50+).
- Logic cannot be shared with Android/desktop counterparts.
- Each platform maintains its own implementation of the same protocol logic.

### When to Choose rust-nostr FFI (nostr-sdk-swift)

**Advantages**:
- Broadest NIP coverage of any NOSTR library (50+ NIPs).
- Share protocol logic across iOS, Android (Kotlin), Python, and JavaScript.
- Battle-tested Rust cryptography (no reimplementation risk).
- Single codebase for protocol updates -- fix once, deploy everywhere.
- Access to advanced features (NIP-47 Zaps, NIP-46 remote signing) not yet in pure Swift libraries.

**Disadvantages**:
- FFI boundary adds complexity (type conversions, error handling across languages).
- Larger binary size (~5-15 MB for the XCFramework).
- Debugging requires understanding both Swift and Rust stack traces.
- Build complexity -- requires pre-built XCFramework or Rust toolchain.
- ALPHA status -- breaking API changes between versions.
- Async patterns may not align perfectly with Swift Concurrency (`async`/`await`).

### Recommendation

| Scenario | Recommendation |
|----------|---------------|
| New iOS-only client | **nostr-sdk-ios** -- mature, well-typed, good NIP coverage |
| Cross-platform app (iOS + Android) | **rust-nostr Swift bindings** -- share core logic |
| Need zaps / NWC / advanced NIPs now | **rust-nostr Swift bindings** -- broadest NIP coverage |
| Building on top of Nostur | **nostr-essentials** -- same foundation |
| Learning / prototyping | **NostrKit** -- minimal surface area |
| Reference architecture study | **Damus source** -- production-grade patterns |

---

## iOS/macOS Platform Considerations

### KeyChain Storage

Private keys (nsec) must NEVER be stored in UserDefaults or plain files. Use the iOS/macOS KeyChain:

```swift
import Security

func storePrivateKey(_ nsec: String, account: String) throws {
    let data = nsec.data(using: .utf8)!
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrService as String: "com.yourapp.nostr.keys",
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw KeyChainError.unableToStore(status)
    }
}

func retrievePrivateKey(account: String) throws -> String? {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecAttrService as String: "com.yourapp.nostr.keys",
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
}
```

**Best practices**:
- Use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` to prevent key extraction from backups.
- Consider `kSecAttrAccessControl` with biometric authentication for high-security scenarios.
- For NIP-07/NIP-46 signer apps, use the Secure Enclave via `kSecAttrTokenIDSecureEnclave` for key generation that never exposes the raw private key.

### Background WebSocket Connections

iOS aggressively suspends background apps. Maintaining relay connections requires careful handling:

```swift
import BackgroundTasks
import UIKit

// Register a background task for relay sync
func registerBackgroundSync() {
    BGTaskScheduler.shared.register(
        forTaskWithIdentifier: "com.yourapp.nostr.sync",
        using: nil
    ) { task in
        handleBackgroundSync(task: task as! BGAppRefreshTask)
    }
}

func scheduleBackgroundSync() {
    let request = BGAppRefreshTaskRequest(identifier: "com.yourapp.nostr.sync")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes
    try? BGTaskScheduler.shared.submit(request)
}

func handleBackgroundSync(task: BGAppRefreshTask) {
    // Connect to relays, fetch new events, update local database
    // Must complete within ~30 seconds
    let syncTask = Task {
        // Fetch latest events from relays
        // Store to local database
        // Update badge count
        task.setTaskCompleted(success: true)
    }
    task.expirationHandler = { syncTask.cancel() }
    scheduleBackgroundSync() // Schedule next sync
}
```

**Key constraints**:
- `BGAppRefreshTask`: System-scheduled, ~30 seconds of execution time, minimum 15-minute interval.
- `BGProcessingTask`: Longer execution for database maintenance, only runs when device is charging.
- `URLSessionWebSocketTask` does NOT survive app suspension -- reconnection is required.
- For real-time notifications, you must use push notifications (see below).

### Push Notifications

NOSTR is a pull-based protocol (clients subscribe to relays). For iOS push notifications, you need a server-side bridge:

**Architecture**:
```
Relay --websocket--> Your Push Server --APNs--> iOS Device
```

**Approaches**:
1. **Self-hosted push server**: Maintains relay subscriptions on behalf of users, sends APNs when matching events arrive. Example: the [Damus push notification service](https://github.com/damus-io/damus).
2. **NIP-98 authenticated registration**: User signs a NIP-98 event to register their device token with a push service.
3. **Unified Push**: Open standard for push notifications, supported by some NOSTR services.

```swift
import UserNotifications

func registerForPushNotifications() {
    UNUserNotificationCenter.current().requestAuthorization(
        options: [.alert, .badge, .sound]
    ) { granted, error in
        guard granted else { return }
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}

// In AppDelegate
func application(_ app: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    // Send token + signed NIP-98 auth event to your push service
    registerTokenWithPushService(token: token)
}
```

### App Transport Security (ATS)

All relay connections use `wss://` (WebSocket Secure), which satisfies ATS requirements. If you need to connect to a `ws://` relay during development, add an exception in `Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>localhost</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### App Groups for Extensions

If your app includes extensions (Share Extension, Notification Service Extension, Widget), share the nostr database via App Groups:

```swift
let sharedContainer = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.yourapp.nostr"
)
let dbPath = sharedContainer?.appendingPathComponent("nostr.sqlite")
```

---

## SwiftUI Integration Patterns

### Observable Relay Manager

```swift
import SwiftUI
import Observation

@Observable
final class RelayManager {
    var connectedRelays: [String] = []
    var events: [NostrEvent] = []
    var isConnecting = false

    private var webSocketTasks: [String: URLSessionWebSocketTask] = [:]
    private let session = URLSession(configuration: .default)

    func connect(to relayURLs: [String]) async {
        isConnecting = true
        for urlString in relayURLs {
            guard let url = URL(string: urlString) else { continue }
            let task = session.webSocketTask(with: url)
            task.resume()
            webSocketTasks[urlString] = task
            connectedRelays.append(urlString)
            Task { await receiveMessages(from: urlString, task: task) }
        }
        isConnecting = false
    }

    private func receiveMessages(from relay: String, task: URLSessionWebSocketTask) async {
        do {
            while task.state == .running {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    handleRelayMessage(text, from: relay)
                case .data(let data):
                    handleRelayMessage(String(data: data, encoding: .utf8) ?? "", from: relay)
                @unknown default:
                    break
                }
            }
        } catch {
            // Handle disconnection, schedule reconnect
            connectedRelays.removeAll { $0 == relay }
        }
    }

    private func handleRelayMessage(_ message: String, from relay: String) {
        // Parse relay message, extract events, update events array
    }

    func publish(event: NostrEvent) async {
        let json = event.toJSON() // Serialize EVENT message
        for (_, task) in webSocketTasks where task.state == .running {
            try? await task.send(.string(json))
        }
    }
}
```

### Event Feed View

```swift
struct EventFeedView: View {
    @State private var relayManager = RelayManager()

    var body: some View {
        NavigationStack {
            List(relayManager.events, id: \.id) { event in
                EventRowView(event: event)
            }
            .navigationTitle("Feed")
            .overlay {
                if relayManager.isConnecting {
                    ProgressView("Connecting to relays...")
                }
            }
            .task {
                await relayManager.connect(to: [
                    "wss://relay.damus.io",
                    "wss://nos.lol",
                    "wss://relay.nostr.band"
                ])
            }
        }
    }
}
```

### Profile View with Metadata

```swift
struct ProfileView: View {
    let publicKey: String
    @State private var metadata: UserMetadata?
    @State private var notes: [NostrEvent] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Profile header
                HStack {
                    AsyncImage(url: metadata?.pictureURL) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Circle().fill(.gray)
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(Circle())

                    VStack(alignment: .leading) {
                        Text(metadata?.displayName ?? metadata?.name ?? "Unknown")
                            .font(.title2.bold())
                        Text(metadata?.nip05 ?? publicKey.prefix(16) + "...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                // Notes list
                ForEach(notes, id: \.id) { note in
                    EventRowView(event: note)
                }
            }
        }
        .task {
            // Fetch kind 0 (metadata) and kind 1 (notes) for this pubkey
            await fetchProfile()
        }
    }

    private func fetchProfile() async {
        // Subscribe with filter: authors=[publicKey], kinds=[0, 1]
    }
}
```

### Composing a Note

```swift
struct ComposeNoteView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var content = ""
    @State private var isPublishing = false
    let keypair: Keypair
    let relayManager: RelayManager

    var body: some View {
        NavigationStack {
            VStack {
                TextEditor(text: $content)
                    .padding()
            }
            .navigationTitle("New Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publish") {
                        Task { await publishNote() }
                    }
                    .disabled(content.isEmpty || isPublishing)
                }
            }
        }
    }

    private func publishNote() async {
        isPublishing = true
        defer { isPublishing = false }
        // Create and sign event, then publish
        // let event = try TextNoteEvent(content: content, signedBy: keypair)
        // await relayManager.publish(event: event)
        dismiss()
    }
}
```

### SwiftUI + Combine Pattern (for ObservableObject-based libraries)

Some libraries (especially Damus-style) use `@ObservableObject` and Combine. This pattern works with SwiftUI's older observation model:

```swift
class NostrViewModel: ObservableObject {
    @Published var events: [NostrEvent] = []
    @Published var connectionState: ConnectionState = .disconnected

    private var cancellables = Set<AnyCancellable>()
    private let relayPool: RelayPool

    init(relayPool: RelayPool) {
        self.relayPool = relayPool

        relayPool.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.connectionState = connected ? .connected : .disconnected
            }
            .store(in: &cancellables)
    }
}
```

---

## Getting Started

### Quickstart: Choosing a Library

1. **Building a full iOS client?** Start with **nostr-sdk-ios**. It has the best balance of NIP coverage, native Swift design, and active maintenance.

2. **Need maximum NIP coverage or cross-platform?** Use **rust-nostr Swift bindings**. Accept the FFI complexity in exchange for 50+ NIPs and shared logic.

3. **Extending Nostur or building a lightweight tool?** Use **nostr-essentials**. Battle-tested in a production iOS client.

4. **Learning the protocol?** Start with **NostrKit** to understand the raw event/relay model, then graduate to a fuller library.

### Next Steps

- See [examples/basic_usage.swift](examples/basic_usage.swift) for a complete working example.
- Read the [Protocol Overview](../../protocol/README.md) for core NOSTR concepts.
- Review the [NIP Index](../../nips/README.md) for protocol extension details.
- Study the [Damus source](https://github.com/damus-io/damus) for production SwiftUI patterns.

---

## Sources

- [nostr-sdk-ios GitHub](https://github.com/nostr-sdk/nostr-sdk-ios)
- [nostr-sdk-ios API Documentation](https://nostr-sdk.github.io/nostr-sdk-ios/documentation/nostrsdk/)
- [rust-nostr GitHub (core)](https://github.com/rust-nostr/nostr)
- [nostr-sdk-swift GitHub](https://github.com/rust-nostr/nostr-sdk-swift)
- [nostr-swift GitHub (low-level bindings)](https://github.com/rust-nostr/nostr-swift)
- [rust-nostr Book](https://rust-nostr.org)
- [NostrKit GitHub](https://github.com/cnixbtc/NostrKit)
- [nostr-essentials GitHub](https://github.com/nostur-com/nostr-essentials)
- [Damus iOS Client GitHub](https://github.com/damus-io/damus)
- [Damus nostr-sdk fork](https://github.com/damus-io/nostr-sdk)
