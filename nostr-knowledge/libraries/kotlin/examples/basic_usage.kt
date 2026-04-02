/**
 * Nostr Kotlin Basic Usage Example
 *
 * Demonstrates key generation, event creation, relay connection,
 * publishing, and subscribing using the rust-nostr Kotlin bindings.
 *
 * Dependencies (build.gradle.kts):
 *   implementation("org.rust-nostr:nostr-sdk:0.39.0")  // Android
 *   // or: implementation("org.rust-nostr:nostr-sdk-jvm:0.39.0")  // JVM
 *
 * For nostr-java alternative, see the second section below.
 */

package com.example.nostr

import rust.nostr.sdk.*

// =============================================================================
// Section 1: Using rust-nostr Kotlin Bindings
// =============================================================================

suspend fun main() {
    println("=== Nostr Kotlin Example (rust-nostr bindings) ===\n")

    // -------------------------------------------------------------------------
    // 1. Key Generation
    // -------------------------------------------------------------------------

    // Generate a new random keypair
    val keys = Keys.generate()
    println("Public key (hex):  ${keys.publicKey().toHex()}")
    println("Public key (npub): ${keys.publicKey().toBech32()}")
    println("Secret key (nsec): ${keys.secretKey().toBech32()}")

    // Restore from an existing nsec or hex private key
    // val existingKeys = Keys.parse("nsec1...")
    // val existingKeys = Keys.parse("hex_private_key_here")

    // Derive public key from a secret key
    // val secretKey = SecretKey.parse("nsec1...")
    // val derivedKeys = Keys(secretKey)

    println()

    // -------------------------------------------------------------------------
    // 2. Event Creation and Signing
    // -------------------------------------------------------------------------

    // Create a simple text note (kind 1)
    val textNote = EventBuilder.textNote("Hello Nostr from Kotlin!")
        .signWithKeys(keys)

    println("Event ID:   ${textNote.id().toBech32()}")
    println("Event JSON: ${textNote.asJson()}")
    println()

    // Create a text note with tags
    val taggedNote = EventBuilder.textNote("Check out #nostr development in #kotlin")
        .tags(listOf(
            Tag.hashtag("nostr"),
            Tag.hashtag("kotlin")
        ))
        .signWithKeys(keys)

    println("Tagged event: ${taggedNote.asJson()}")
    println()

    // Create metadata event (kind 0)
    val metadata = Metadata()
        .setName("KotlinDev")
        .setAbout("Building nostr clients in Kotlin")
        .setNip05("kotlindev@example.com")

    val metadataEvent = EventBuilder.metadata(metadata)
        .signWithKeys(keys)

    println("Metadata event kind: ${metadataEvent.kind().asU16()}")
    println()

    // -------------------------------------------------------------------------
    // 3. Relay Connection and Management
    // -------------------------------------------------------------------------

    val client = Client()

    // Add relays
    client.addRelay("wss://relay.damus.io")
    client.addRelay("wss://nos.lol")
    client.addRelay("wss://relay.nostr.band")

    // Connect to all added relays
    println("Connecting to relays...")
    client.connect()

    // Wait briefly for connections to establish
    // In production, use proper connection state callbacks
    Thread.sleep(2000)

    println("Connected to relays.")
    println()

    // -------------------------------------------------------------------------
    // 4. Publishing Events
    // -------------------------------------------------------------------------

    // Publish the text note to all connected relays
    println("Publishing text note...")
    val sendOutput = client.sendEvent(textNote)
    println("Event sent. ID: ${sendOutput.id().toBech32()}")

    // Publish metadata
    println("Publishing metadata...")
    client.sendEvent(metadataEvent)
    println("Metadata published.")
    println()

    // Publish using the builder directly (client signs with its signer)
    // This requires setting up the client with a signer:
    // val client = Client(NostrSigner.keys(keys))
    // client.sendEventBuilder(EventBuilder.textNote("Signed by client signer"))

    // -------------------------------------------------------------------------
    // 5. Subscribing to Events
    // -------------------------------------------------------------------------

    // Build filters
    val textNoteFilter = Filter()
        .kind(Kind(1u))        // kind 1 = text notes
        .limit(10u)            // last 10 events

    // Filter for a specific author
    val authorFilter = Filter()
        .kind(Kind(1u))
        .author(keys.publicKey())
        .limit(5u)

    // Filter by hashtag
    val hashtagFilter = Filter()
        .kind(Kind(1u))
        .hashtag("nostr")
        .limit(20u)

    // Subscribe with a single filter
    println("Subscribing to text notes...")
    client.subscribe(listOf(textNoteFilter), null)

    // -------------------------------------------------------------------------
    // 6. Handling Received Events
    // -------------------------------------------------------------------------

    println("Listening for events (10 seconds)...\n")

    // Process events using the notification handler
    client.handleNotifications(object : HandleNotification {
        override fun handleEvent(relayUrl: String, subscriptionId: String, event: Event) {
            println("--- Event from $relayUrl ---")
            println("  ID:      ${event.id().toBech32()}")
            println("  Author:  ${event.author().toBech32()}")
            println("  Kind:    ${event.kind().asU16()}")
            println("  Content: ${event.content().take(100)}")
            println("  Created: ${event.createdAt().asSecs()}")
            println()
        }

        override fun handleMsg(relayUrl: String, message: RelayMessage) {
            // Handle other relay messages (NOTICE, OK, EOSE, etc.)
            println("Message from $relayUrl: $message")
        }
    })

    // -------------------------------------------------------------------------
    // 7. Advanced: NIP-19 Encoding/Decoding
    // -------------------------------------------------------------------------

    // Encode to nprofile (includes relay hints)
    val nprofile = Nip19Profile(
        keys.publicKey(),
        listOf("wss://relay.damus.io")
    )
    println("nprofile: ${nprofile.toBech32()}")

    // Encode event to nevent
    val nevent = Nip19Event(
        textNote.id(),
        keys.publicKey(),
        null,
        listOf("wss://relay.damus.io")
    )
    println("nevent: ${nevent.toBech32()}")

    // -------------------------------------------------------------------------
    // 8. Cleanup
    // -------------------------------------------------------------------------

    client.disconnect()
    println("\nDisconnected. Done.")
}


// =============================================================================
// Section 2: Alternative -- Using nostr-java from Kotlin
// =============================================================================

/**
 * nostr-java example (requires Java 21+).
 *
 * Dependencies (Maven):
 *   <dependency>
 *       <groupId>nostr-java</groupId>
 *       <artifactId>nostr-java-client</artifactId>
 *       <version>2.0.0</version>
 *   </dependency>
 */

/*
import nostr.java.client.NostrRelayClient
import nostr.java.event.GenericEvent
import nostr.java.event.GenericTag
import nostr.java.event.Kinds
import nostr.java.event.message.EventMessage
import nostr.java.identity.Identity

fun nostrJavaExample() {
    // Generate identity
    val identity = Identity.generateRandomIdentity()
    println("Public key: ${identity.publicKey}")

    // Create and sign an event
    val event = GenericEvent.builder()
        .pubKey(identity.publicKey)
        .kind(Kinds.TEXT_NOTE)
        .content("Hello from nostr-java in Kotlin!")
        .tags(listOf(
            GenericTag.of("t", "nostr-java"),
            GenericTag.of("t", "kotlin")
        ))
        .build()

    identity.sign(event)

    // Publish to relay
    NostrRelayClient("wss://relay.damus.io").use { client ->
        client.connectAsync().join()
        client.sendAsync(EventMessage(event)).join()
        println("Event sent: ${event.id}")
    }

    // Subscribe to events
    NostrRelayClient("wss://relay.damus.io").use { client ->
        client.connectAsync().join()

        val filter = EventFilter.builder()
            .kinds(listOf(Kinds.TEXT_NOTE))
            .limit(10)
            .build()

        client.subscribeAsync(filter) { receivedEvent ->
            println("Received: ${receivedEvent.content}")
        }.join()
    }
}
*/


// =============================================================================
// Section 3: Android-Specific Patterns
// =============================================================================

/**
 * Android ViewModel pattern for Nostr (conceptual -- requires Android dependencies).
 *
 * This shows how to integrate Nostr into an Android app with proper lifecycle
 * management and reactive UI updates.
 */

/*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class NostrUiState(
    val events: List<Event> = emptyList(),
    val isConnected: Boolean = false,
    val error: String? = null
)

class NostrViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(NostrUiState())
    val uiState: StateFlow<NostrUiState> = _uiState

    private val client = Client()

    init {
        viewModelScope.launch {
            try {
                client.addRelay("wss://relay.damus.io")
                client.addRelay("wss://nos.lol")
                client.connect()
                _uiState.value = _uiState.value.copy(isConnected = true)
                subscribeToFeed()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    private fun subscribeToFeed() {
        val filter = Filter().kind(Kind(1u)).limit(50u)
        client.subscribe(listOf(filter), null)

        client.handleNotifications(object : HandleNotification {
            override fun handleEvent(relayUrl: String, subscriptionId: String, event: Event) {
                val current = _uiState.value.events.toMutableList()
                current.add(0, event)
                _uiState.value = _uiState.value.copy(events = current.take(100))
            }

            override fun handleMsg(relayUrl: String, message: RelayMessage) {}
        })
    }

    fun publishNote(content: String, keys: Keys) {
        viewModelScope.launch {
            val event = EventBuilder.textNote(content).signWithKeys(keys)
            client.sendEvent(event)
        }
    }

    override fun onCleared() {
        super.onCleared()
        client.disconnect()
    }
}
*/
