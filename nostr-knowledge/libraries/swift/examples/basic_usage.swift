// basic_usage.swift
// Complete NOSTR Swift example demonstrating key generation, event creation,
// relay connection, publishing, and subscribing.
//
// This file shows equivalent patterns for the major Swift NOSTR libraries:
//   1. nostr-sdk-ios (native Swift)
//   2. rust-nostr Swift bindings (FFI)
//   3. NostrKit (minimal)
//   4. nostr-essentials
//
// Each section is self-contained. Comment/uncomment the section for your chosen library.
//
// Prerequisites:
//   - Xcode 15+ / Swift 5.10+
//   - Add the relevant SPM package to your project (see README.md for URLs)

import Foundation

// =============================================================================
// MARK: - Section 1: Using nostr-sdk-ios (nostr-sdk/nostr-sdk-ios)
// =============================================================================
// SPM: .package(url: "https://github.com/nostr-sdk/nostr-sdk-ios.git", .upToNextMajor(from: "0.3.0"))

#if canImport(NostrSDK)
import NostrSDK

/// Demonstrates complete nostr workflow using nostr-sdk-ios.
func nostrSDKiOSExample() async throws {

    // -------------------------------------------------------------------------
    // 1. Key Generation
    // -------------------------------------------------------------------------

    // Generate a brand new keypair
    let keypair = try Keypair()

    // Access keys in multiple formats
    let publicKeyHex = keypair.publicKey.hex
    let publicKeyBech32 = keypair.publicKey.npub           // npub1...
    let privateKeyBech32 = keypair.privateKey?.nsec ?? ""  // nsec1...

    print("Public key (hex):    \(publicKeyHex)")
    print("Public key (npub):   \(publicKeyBech32)")
    print("Private key (nsec):  \(privateKeyBech32)")

    // Restore a keypair from an existing nsec
    // let restored = try Keypair(nsec: "nsec1...")

    // -------------------------------------------------------------------------
    // 2. Create Events
    // -------------------------------------------------------------------------

    // Kind 1: Text note
    let textNote = try TextNoteEvent(
        content: "Hello NOSTR from nostr-sdk-ios! Building the decentralized future.",
        signedBy: keypair
    )
    print("Text note ID: \(textNote.id)")
    print("Text note JSON: \(textNote.serializedString())")

    // Kind 1 with tags: reply to another event (NIP-10 threading)
    let replyNote = try TextNoteEvent(
        content: "This is a reply!",
        tags: [
            Tag(name: "e", value: "aabbccdd..."),  // event being replied to
            Tag(name: "p", value: "11223344..."),   // pubkey of parent author
        ],
        signedBy: keypair
    )

    // Kind 0: Set profile metadata (NIP-24)
    let metadata = try MetadataEvent(
        name: "alice",
        displayName: "Alice",
        about: "Nostr developer",
        pictureURL: URL(string: "https://example.com/avatar.png"),
        signedBy: keypair
    )

    // Kind 7: Reaction (NIP-25)
    let reaction = try ReactionEvent(
        content: "+",
        reactedEventId: textNote.id,
        reactedEventPubkey: keypair.publicKey.hex,
        signedBy: keypair
    )

    // Kind 5: Deletion request (NIP-09)
    let deletion = try DeletionEvent(
        content: "Removing old note",
        eventIds: [textNote.id],
        signedBy: keypair
    )

    // -------------------------------------------------------------------------
    // 3. Build Subscription Filters
    // -------------------------------------------------------------------------

    // Filter: recent text notes from a specific author
    let authorFilter = Filter(
        authors: [keypair.publicKey.hex],
        kinds: [1],
        limit: 50
    )

    // Filter: all mentions of our pubkey
    let mentionFilter = Filter(
        kinds: [1],
        tags: ["p": [keypair.publicKey.hex]],
        limit: 100
    )

    // Filter: events since a specific timestamp
    let sinceFilter = Filter(
        kinds: [1, 7],
        since: Int(Date().timeIntervalSince1970) - 3600  // last hour
    )

    // -------------------------------------------------------------------------
    // 4. Relay Connection & Publishing
    // -------------------------------------------------------------------------
    // Note: nostr-sdk-ios provides event/filter types but relay management
    // varies by version. Below is a manual WebSocket approach that works
    // with any version of the library.

    let relayURL = URL(string: "wss://relay.damus.io")!
    let session = URLSession(configuration: .default)
    let webSocket = session.webSocketTask(with: relayURL)
    webSocket.resume()

    // Publish the text note: ["EVENT", <signed_event_json>]
    let eventJSON = textNote.serializedString()
    let publishMessage = "[\"EVENT\",\(eventJSON)]"
    try await webSocket.send(.string(publishMessage))
    print("Published event to relay")

    // -------------------------------------------------------------------------
    // 5. Subscribe to Events
    // -------------------------------------------------------------------------

    // Build a REQ message: ["REQ", "<subscription_id>", <filter>]
    let subscriptionId = UUID().uuidString
    let filterJSON = """
    {"authors":["\(keypair.publicKey.hex)"],"kinds":[1],"limit":10}
    """
    let reqMessage = "[\"REQ\",\"\(subscriptionId)\",\(filterJSON)]"
    try await webSocket.send(.string(reqMessage))
    print("Subscribed with ID: \(subscriptionId)")

    // -------------------------------------------------------------------------
    // 6. Receive Events
    // -------------------------------------------------------------------------

    // Listen for relay messages
    for _ in 0..<10 {
        let message = try await webSocket.receive()
        switch message {
        case .string(let text):
            print("Relay message: \(text)")
            // Parse: ["EVENT", "<sub_id>", <event>] or ["EOSE", "<sub_id>"]
            if text.hasPrefix("[\"EOSE\"") {
                print("End of stored events")
                break
            }
        case .data(let data):
            print("Binary message: \(data.count) bytes")
        @unknown default:
            break
        }
    }

    // -------------------------------------------------------------------------
    // 7. Close Subscription & Disconnect
    // -------------------------------------------------------------------------

    let closeMessage = "[\"CLOSE\",\"\(subscriptionId)\"]"
    try await webSocket.send(.string(closeMessage))
    webSocket.cancel(with: .goingAway, reason: nil)
    print("Disconnected from relay")
}
#endif


// =============================================================================
// MARK: - Section 2: Using rust-nostr Swift Bindings (rust-nostr/nostr-sdk-swift)
// =============================================================================
// SPM: .package(url: "https://github.com/rust-nostr/nostr-sdk-swift.git", from: "0.39.0")
// Note: The module is imported as NostrSDK from the rust-nostr Swift package.

#if canImport(NostrSDKFFI)
import NostrSDK  // rust-nostr Swift bindings

/// Demonstrates complete nostr workflow using rust-nostr Swift bindings.
func rustNostrSwiftExample() async throws {

    // -------------------------------------------------------------------------
    // 1. Key Generation
    // -------------------------------------------------------------------------

    let keys = Keys.generate()
    let publicKey = keys.publicKey()
    let secretKey = keys.secretKey()

    print("Public key (npub):  \(try publicKey.toBech32())")
    print("Public key (hex):   \(publicKey.toHex())")
    print("Secret key (nsec):  \(try secretKey.toBech32())")

    // Restore from an existing nsec or hex key
    // let restored = try Keys(secretKey: SecretKey.fromBech32(secretKey: "nsec1..."))
    // let fromHex = try Keys(secretKey: SecretKey.fromHex(secretKey: "aabbcc..."))

    // -------------------------------------------------------------------------
    // 2. Create a Signer and Client
    // -------------------------------------------------------------------------

    let signer = NostrSigner.keys(keys: keys)
    let client = Client(signer: signer)

    // -------------------------------------------------------------------------
    // 3. Add Relays and Connect
    // -------------------------------------------------------------------------

    try await client.addRelay(url: "wss://relay.damus.io")
    try await client.addRelay(url: "wss://nos.lol")
    try await client.addRelay(url: "wss://relay.nostr.band")

    // Connect to all added relays
    try await client.connect()
    print("Connected to relays")

    // -------------------------------------------------------------------------
    // 4. Build and Publish Events
    // -------------------------------------------------------------------------

    // Kind 1: Text note
    let textNoteBuilder = EventBuilder.textNote(content: "Hello from rust-nostr Swift!")
    let sendOutput = try await client.sendEventBuilder(builder: textNoteBuilder)
    print("Published event ID: \(try sendOutput.id().toBech32())")
    print("  Success relays: \(sendOutput.success())")
    print("  Failed relays:  \(sendOutput.failed())")

    // Kind 0: Profile metadata
    let metadata = Metadata()
        .name(name: "alice")
        .displayName(displayName: "Alice")
        .about(about: "Building on NOSTR with rust-nostr")
        .picture(url: "https://example.com/avatar.png")
    let metadataBuilder = EventBuilder.metadata(metadata: metadata)
    try await client.sendEventBuilder(builder: metadataBuilder)

    // Kind 7: Reaction
    // let reactionBuilder = EventBuilder.reaction(eventId: eventId, publicKey: targetPubkey, content: "+")

    // Sign an event without sending (for inspection or manual relay management)
    let builder = EventBuilder.textNote(content: "Signed but not sent")
    let signedEvent = try await builder.sign(signer: signer)
    print("Signed event JSON: \(try signedEvent.asJson())")

    // -------------------------------------------------------------------------
    // 5. Subscribe and Fetch Events
    // -------------------------------------------------------------------------

    // Build filters
    let filter = Filter()
        .author(publicKey: publicKey)
        .kind(kind: 1)
        .limit(limit: 20)

    // Option A: One-shot fetch with timeout (returns collected events)
    let events = try await client.fetchEvents(filters: [filter], timeout: 10)
    for event in events {
        print("Event: \(event.content()) [kind \(event.kind())]")
    }

    // Option B: Persistent subscription (for real-time updates)
    let subscriptionId = try await client.subscribe(filters: [filter])
    print("Subscription ID: \(subscriptionId)")

    // Handle incoming events via notifications
    // The client provides an event stream in newer versions:
    // for await notification in client.notifications() {
    //     switch notification {
    //     case .event(let event):
    //         print("New event: \(event.content())")
    //     case .message(let relayUrl, let message):
    //         print("Relay message from \(relayUrl)")
    //     }
    // }

    // -------------------------------------------------------------------------
    // 6. NIP-19 Encoding/Decoding
    // -------------------------------------------------------------------------

    // Encode
    let npub = try publicKey.toBech32()                     // npub1...
    let noteId = try sendOutput.id().toBech32()             // note1...
    // let nprofile = try Nip19Profile(publicKey: publicKey, relays: ["wss://relay.damus.io"])

    // Decode
    // let decoded = try Nip19.fromBech32(bech32: "npub1...")

    // -------------------------------------------------------------------------
    // 7. NIP-44 Encryption (Versioned Encryption)
    // -------------------------------------------------------------------------

    // let recipientPubkey = try PublicKey.fromBech32(bech32: "npub1...")
    // let encrypted = try Nip44.encrypt(secretKey: secretKey, publicKey: recipientPubkey, content: "Secret message")
    // let decrypted = try Nip44.decrypt(secretKey: secretKey, publicKey: recipientPubkey, payload: encrypted)

    // -------------------------------------------------------------------------
    // 8. Disconnect
    // -------------------------------------------------------------------------

    try await client.disconnect()
    print("Disconnected from all relays")
}
#endif


// =============================================================================
// MARK: - Section 3: Using NostrKit (cnixbtc/NostrKit)
// =============================================================================
// SPM: .package(url: "https://github.com/cnixbtc/NostrKit.git", from: "1.0.0")
// Note: NostrKit provides data types only -- you supply your own WebSocket.

#if canImport(NostrKit)
import NostrKit

/// Demonstrates NostrKit's data types with manual WebSocket management.
func nostrKitExample() async throws {

    // -------------------------------------------------------------------------
    // 1. Key Generation
    // -------------------------------------------------------------------------

    // NostrKit requires a hex private key (does not generate keys itself).
    // Generate a 32-byte random hex string, or use an existing key.
    let privateKeyHex = "your-64-char-hex-private-key-here"
    let keyPair = try KeyPair(privateKey: privateKeyHex)

    print("Public key: \(keyPair.publicKey)")

    // -------------------------------------------------------------------------
    // 2. Create an Event
    // -------------------------------------------------------------------------

    let event = try Event(keyPair: keyPair, content: "Hello from NostrKit!")

    // -------------------------------------------------------------------------
    // 3. Serialize to CLIENT Messages
    // -------------------------------------------------------------------------

    // Publish message: ["EVENT", <event>]
    let publishJSON = try ClientMessage.event(event).string()
    print("Publish JSON: \(publishJSON)")

    // Subscribe message: ["REQ", "<sub_id>", <filter>]
    let subscription = Subscription(filters: [
        .init(authors: [keyPair.publicKey])
    ])
    let subscribeJSON = try ClientMessage.subscribe(subscription).string()
    print("Subscribe JSON: \(subscribeJSON)")

    // Unsubscribe message: ["CLOSE", "<sub_id>"]
    let unsubscribeJSON = try ClientMessage.unsubscribe(subscription.id).string()

    // -------------------------------------------------------------------------
    // 4. Manual WebSocket Connection
    // -------------------------------------------------------------------------

    let relayURL = URL(string: "wss://relay.damus.io")!
    let session = URLSession(configuration: .default)
    let ws = session.webSocketTask(with: relayURL)
    ws.resume()

    // Send the subscribe message
    try await ws.send(.string(subscribeJSON))
    print("Subscribed to relay")

    // Send the event
    try await ws.send(.string(publishJSON))
    print("Published event to relay")

    // Receive messages
    let response = try await ws.receive()
    switch response {
    case .string(let text):
        print("Received: \(text)")
    case .data(let data):
        print("Received \(data.count) bytes")
    @unknown default:
        break
    }

    // Clean up
    try await ws.send(.string(unsubscribeJSON))
    ws.cancel(with: .goingAway, reason: nil)
}
#endif


// =============================================================================
// MARK: - Section 4: Using nostr-essentials (nostur-com/nostr-essentials)
// =============================================================================
// SPM: via Xcode -> Add Package Dependencies -> https://github.com/nostur-com/nostr-essentials

#if canImport(NostrEssentials)
import NostrEssentials

/// Demonstrates nostr-essentials for key management, event signing, and relay interaction.
func nostrEssentialsExample() async throws {

    // -------------------------------------------------------------------------
    // 1. Key Generation
    // -------------------------------------------------------------------------

    let keys = try Keys.newKeys()

    let hexPrivateKey = keys.privateKeyHex
    let hexPublicKey = keys.publicKeyHex
    let nsec = keys.nsec()      // nsec1...
    let npub = keys.npub()      // npub1...

    print("Public key (hex):   \(hexPublicKey)")
    print("Public key (npub):  \(npub)")
    print("Private key (nsec): \(nsec)")

    // Restore from an nsec
    // let restored = try Keys(privateKeyHex: someHexKey)

    // -------------------------------------------------------------------------
    // 2. Create and Sign Events
    // -------------------------------------------------------------------------

    // Kind 1: Text note
    var textNote = Event(
        pubkey: keys.publicKeyHex,
        content: "Hello from nostr-essentials!",
        kind: 1,
        tags: []
    )
    let signedNote = try textNote.sign(keys)
    print("Event ID: \(signedNote.id ?? "nil")")

    // Kind 1 with tags: mention another user
    var mentionNote = Event(
        pubkey: keys.publicKeyHex,
        content: "Hey @someone, check this out!",
        kind: 1,
        tags: [
            ["p", "target-pubkey-hex"],
            ["e", "referenced-event-id", "", "reply"]
        ]
    )
    let signedMention = try mentionNote.sign(keys)

    // Kind 0: Profile metadata
    var metadataEvent = Event(
        pubkey: keys.publicKeyHex,
        content: "{\"name\":\"alice\",\"about\":\"Nostr dev\",\"picture\":\"https://example.com/avatar.png\"}",
        kind: 0,
        tags: []
    )
    let signedMetadata = try metadataEvent.sign(keys)

    // Kind 3: Follow list
    var followList = Event(
        pubkey: keys.publicKeyHex,
        content: "",
        kind: 3,
        tags: [
            ["p", "friend-pubkey-1"],
            ["p", "friend-pubkey-2"],
            ["p", "friend-pubkey-3"]
        ]
    )
    let signedFollowList = try followList.sign(keys)

    // -------------------------------------------------------------------------
    // 3. NIP-19 Encoding/Decoding
    // -------------------------------------------------------------------------

    // Encode a note ID
    if let eventId = signedNote.id {
        let noteEncoded = try NIP19.encode(note: eventId)
        print("note1...: \(noteEncoded)")
    }

    // Encode a pubkey with relay hints
    let nprofile = try NIP19.encode(
        pubkey: keys.publicKeyHex,
        relays: ["wss://relay.damus.io", "wss://nos.lol"]
    )
    print("nprofile: \(nprofile)")

    // Decode any NIP-19 string
    // let decoded = try NIP19.decode("npub1...")

    // -------------------------------------------------------------------------
    // 4. NIP-44 Encryption
    // -------------------------------------------------------------------------

    // Encrypt a message to a recipient
    // let recipientPubkey = "recipient-hex-pubkey"
    // let encrypted = try NIP44.encrypt(
    //     content: "Secret message",
    //     privateKey: keys.privateKeyHex,
    //     publicKey: recipientPubkey
    // )
    // let decrypted = try NIP44.decrypt(
    //     payload: encrypted,
    //     privateKey: keys.privateKeyHex,
    //     publicKey: recipientPubkey
    // )

    // -------------------------------------------------------------------------
    // 5. NIP-05 Lookup
    // -------------------------------------------------------------------------

    // Verify a NIP-05 address (user@domain.com -> pubkey)
    // let pubkey = try await NIP05.lookup("alice@example.com")

    // -------------------------------------------------------------------------
    // 6. Relay Communication via ConnectionPool
    // -------------------------------------------------------------------------

    // nostr-essentials provides a ConnectionPool for multi-relay management.
    // Each relay can be configured as read-only, write-only, or read-write.

    // let pool = ConnectionPool()
    // pool.addRelay("wss://relay.damus.io", read: true, write: true)
    // pool.addRelay("wss://nos.lol", read: true, write: true)
    // pool.addRelay("wss://relay.nostr.band", read: true, write: false)
    // pool.connect()
    //
    // // Publish an event to all write-enabled relays
    // pool.sendEvent(signedNote)
    //
    // // Subscribe on all read-enabled relays
    // pool.sendREQ(subscriptionId: "my-sub", filters: [
    //     ["authors": [keys.publicKeyHex], "kinds": [1], "limit": 50]
    // ])
}
#endif


// =============================================================================
// MARK: - Section 5: Standalone WebSocket Relay Client (No Library)
// =============================================================================
// This section demonstrates raw NOSTR protocol interaction using only
// Foundation's URLSessionWebSocketTask and CryptoKit. Useful for understanding
// the protocol without any library abstraction.

import CryptoKit

/// A minimal standalone NOSTR client using only Foundation and CryptoKit.
/// This demonstrates the raw protocol for educational purposes.
struct MinimalNostrClient {

    // -------------------------------------------------------------------------
    // Key Generation using secp256k1
    // -------------------------------------------------------------------------
    // Note: CryptoKit does not natively support secp256k1.
    // In production, use a library like swift-secp256k1 (GigaBitcoin/secp256k1.swift).
    // Below is pseudocode showing the flow.

    /// Generate a 32-byte private key and derive the public key.
    static func generateKeypair() -> (privateKey: Data, publicKey: Data) {
        // 1. Generate 32 random bytes for the private key
        var privateKeyBytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, 32, &privateKeyBytes)
        let privateKey = Data(privateKeyBytes)

        // 2. Derive public key using secp256k1 (x-only / schnorr)
        // In production: use secp256k1.swift or similar
        // let publicKey = secp256k1.Signing.PrivateKey(rawRepresentation: privateKey).publicKey.xonly.bytes
        let publicKey = Data() // placeholder

        return (privateKey, publicKey)
    }

    // -------------------------------------------------------------------------
    // Event Construction (NIP-01)
    // -------------------------------------------------------------------------

    /// Build a NOSTR event JSON object.
    ///
    /// Event structure per NIP-01:
    /// {
    ///   "id": <32-byte sha256 hex of serialized event>,
    ///   "pubkey": <32-byte hex public key>,
    ///   "created_at": <unix timestamp>,
    ///   "kind": <integer>,
    ///   "tags": [["tag", "value", ...], ...],
    ///   "content": <string>,
    ///   "sig": <64-byte hex schnorr signature>
    /// }
    static func buildEvent(
        privateKey: Data,
        publicKey: Data,
        kind: Int,
        content: String,
        tags: [[String]]
    ) -> [String: Any] {
        let pubkeyHex = publicKey.map { String(format: "%02x", $0) }.joined()
        let createdAt = Int(Date().timeIntervalSince1970)

        // Serialize for ID computation: [0, pubkey, created_at, kind, tags, content]
        let serialized = "[0,\"\(pubkeyHex)\",\(createdAt),\(kind),\(serializeTags(tags)),\"\(escapeJSON(content))\"]"
        let serializedData = serialized.data(using: .utf8)!

        // Compute event ID: SHA-256 of the serialized array
        let idHash = SHA256.hash(data: serializedData)
        let idHex = idHash.map { String(format: "%02x", $0) }.joined()

        // Sign the ID with schnorr (secp256k1)
        // In production: let sig = secp256k1.Signing.PrivateKey(rawRepresentation: privateKey).schnorrSign(Data(idHash))
        let sigHex = String(repeating: "0", count: 128) // placeholder

        return [
            "id": idHex,
            "pubkey": pubkeyHex,
            "created_at": createdAt,
            "kind": kind,
            "tags": tags,
            "content": content,
            "sig": sigHex
        ]
    }

    // -------------------------------------------------------------------------
    // Client-to-Relay Messages
    // -------------------------------------------------------------------------

    /// Construct an EVENT message: ["EVENT", <event_json>]
    static func eventMessage(_ event: [String: Any]) -> String {
        let jsonData = try! JSONSerialization.data(withJSONObject: event)
        let eventJSON = String(data: jsonData, encoding: .utf8)!
        return "[\"EVENT\",\(eventJSON)]"
    }

    /// Construct a REQ message: ["REQ", "<sub_id>", <filter>, ...]
    static func reqMessage(subscriptionId: String, filters: [[String: Any]]) -> String {
        var parts = ["\"REQ\"", "\"\(subscriptionId)\""]
        for filter in filters {
            let data = try! JSONSerialization.data(withJSONObject: filter)
            parts.append(String(data: data, encoding: .utf8)!)
        }
        return "[\(parts.joined(separator: ","))]"
    }

    /// Construct a CLOSE message: ["CLOSE", "<sub_id>"]
    static func closeMessage(subscriptionId: String) -> String {
        return "[\"CLOSE\",\"\(subscriptionId)\"]"
    }

    // -------------------------------------------------------------------------
    // Relay Connection
    // -------------------------------------------------------------------------

    /// Connect to a relay, subscribe, publish, and receive events.
    static func run() async throws {
        let relayURL = URL(string: "wss://relay.damus.io")!
        let session = URLSession(configuration: .default)
        let ws = session.webSocketTask(with: relayURL)
        ws.resume()

        print("Connected to \(relayURL)")

        // Subscribe to recent global notes
        let subId = "example-\(UUID().uuidString.prefix(8))"
        let filter: [String: Any] = [
            "kinds": [1],
            "limit": 5
        ]
        let req = reqMessage(subscriptionId: subId, filters: [filter])
        try await ws.send(.string(req))
        print("Sent REQ: \(req)")

        // Receive events until EOSE
        var receivedEvents = 0
        while true {
            let msg = try await ws.receive()
            guard case .string(let text) = msg else { continue }

            // Parse relay response
            guard let data = text.data(using: .utf8),
                  let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
                  let type = array.first as? String
            else { continue }

            switch type {
            case "EVENT":
                // ["EVENT", "<sub_id>", <event_object>]
                if array.count >= 3, let event = array[2] as? [String: Any] {
                    let content = event["content"] as? String ?? ""
                    let pubkey = event["pubkey"] as? String ?? ""
                    let kind = event["kind"] as? Int ?? 0
                    receivedEvents += 1
                    print("[\(receivedEvents)] Kind \(kind) from \(pubkey.prefix(16))...: \(content.prefix(80))")
                }

            case "EOSE":
                // ["EOSE", "<sub_id>"]
                print("End of stored events. Received \(receivedEvents) events.")
                break

            case "OK":
                // ["OK", "<event_id>", <success_bool>, "<message>"]
                let success = array.count >= 3 ? array[2] as? Bool ?? false : false
                print("Event accepted: \(success)")

            case "NOTICE":
                // ["NOTICE", "<message>"]
                let notice = array.count >= 2 ? array[1] as? String ?? "" : ""
                print("Relay notice: \(notice)")

            default:
                print("Unknown message type: \(type)")
            }

            // Stop after EOSE
            if type == "EOSE" { break }
        }

        // Close subscription and disconnect
        try await ws.send(.string(closeMessage(subscriptionId: subId)))
        ws.cancel(with: .goingAway, reason: nil)
        print("Disconnected")
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static func serializeTags(_ tags: [[String]]) -> String {
        let inner = tags.map { tag in
            let elements = tag.map { "\"\(escapeJSON($0))\"" }.joined(separator: ",")
            return "[\(elements)]"
        }.joined(separator: ",")
        return "[\(inner)]"
    }

    private static func escapeJSON(_ string: String) -> String {
        return string
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\t", with: "\\t")
    }
}


// =============================================================================
// MARK: - Section 6: SwiftUI Integration Example
// =============================================================================
// A complete SwiftUI view that connects to a relay and displays a live feed.

#if canImport(SwiftUI)
import SwiftUI

/// Observable model managing relay connections and events.
@available(iOS 17.0, macOS 14.0, *)
@Observable
final class NostrFeedModel {
    var events: [FeedEvent] = []
    var isConnected = false
    var relayURL: String = "wss://relay.damus.io"

    private var webSocket: URLSessionWebSocketTask?
    private var subscriptionId: String?

    struct FeedEvent: Identifiable {
        let id: String
        let pubkey: String
        let content: String
        let createdAt: Date
        let kind: Int
    }

    func connect() async {
        guard let url = URL(string: relayURL) else { return }
        let session = URLSession(configuration: .default)
        let ws = session.webSocketTask(with: url)
        ws.resume()
        webSocket = ws
        isConnected = true

        // Subscribe to recent kind 1 events
        let subId = "feed-\(UUID().uuidString.prefix(8))"
        subscriptionId = subId
        let since = Int(Date().timeIntervalSince1970) - 300 // last 5 minutes
        let req = """
        ["REQ","\(subId)",{"kinds":[1],"limit":20,"since":\(since)}]
        """
        try? await ws.send(.string(req))

        // Start receiving
        await receiveLoop(ws: ws)
    }

    func disconnect() {
        if let subId = subscriptionId {
            Task {
                try? await webSocket?.send(.string("[\"CLOSE\",\"\(subId)\"]"))
            }
        }
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        isConnected = false
    }

    private func receiveLoop(ws: URLSessionWebSocketTask) async {
        do {
            while ws.state == .running {
                let msg = try await ws.receive()
                guard case .string(let text) = msg,
                      let data = text.data(using: .utf8),
                      let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
                      let type = array.first as? String
                else { continue }

                if type == "EVENT", array.count >= 3,
                   let eventDict = array[2] as? [String: Any] {
                    let event = FeedEvent(
                        id: eventDict["id"] as? String ?? UUID().uuidString,
                        pubkey: eventDict["pubkey"] as? String ?? "",
                        content: eventDict["content"] as? String ?? "",
                        createdAt: Date(timeIntervalSince1970: TimeInterval(eventDict["created_at"] as? Int ?? 0)),
                        kind: eventDict["kind"] as? Int ?? 0
                    )
                    await MainActor.run {
                        // Insert at top, deduplicate
                        if !self.events.contains(where: { $0.id == event.id }) {
                            self.events.insert(event, at: 0)
                        }
                    }
                }
            }
        } catch {
            await MainActor.run {
                self.isConnected = false
            }
        }
    }
}

/// A SwiftUI view displaying a live NOSTR event feed.
@available(iOS 17.0, macOS 14.0, *)
struct NostrFeedView: View {
    @State private var model = NostrFeedModel()

    var body: some View {
        NavigationStack {
            Group {
                if model.events.isEmpty && model.isConnected {
                    ContentUnavailableView(
                        "Waiting for events...",
                        systemImage: "antenna.radiowaves.left.and.right",
                        description: Text("Connected to \(model.relayURL)")
                    )
                } else if model.events.isEmpty {
                    ContentUnavailableView(
                        "Not Connected",
                        systemImage: "wifi.slash",
                        description: Text("Tap Connect to start")
                    )
                } else {
                    List(model.events) { event in
                        VStack(alignment: .leading, spacing: 8) {
                            // Author (truncated pubkey)
                            Text(String(event.pubkey.prefix(16)) + "...")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .monospaced()

                            // Content
                            Text(event.content)
                                .font(.body)

                            // Timestamp
                            Text(event.createdAt, style: .relative)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("NOSTR Feed")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(model.isConnected ? "Disconnect" : "Connect") {
                        if model.isConnected {
                            model.disconnect()
                        } else {
                            Task { await model.connect() }
                        }
                    }
                }
            }
        }
    }
}
#endif


// =============================================================================
// MARK: - Entry Point
// =============================================================================
// Uncomment the example you want to run.

@main
struct NostrExampleApp {
    static func main() async throws {
        // Standalone minimal client (no external dependencies)
        try await MinimalNostrClient.run()

        // Or use one of the library-specific examples:
        // try await nostrSDKiOSExample()
        // try await rustNostrSwiftExample()
        // try await nostrKitExample()
        // try await nostrEssentialsExample()
    }
}
