# Kotlin / Android Nostr Libraries

The Kotlin and Android ecosystem offers multiple approaches to building Nostr clients, from pure-Kotlin libraries to Rust FFI bindings. This document covers the major libraries, Android-specific patterns, and Kotlin Multiplatform considerations.

---

## Table of Contents

- [Library Overview](#library-overview)
- [rust-nostr Kotlin Bindings (via UniFFI)](#rust-nostr-kotlin-bindings-via-uniffi)
- [NostrPostr (Giszmo/NostrPostr)](#nostrpostr)
- [nostr-java (tcheeric/nostr-java)](#nostr-java)
- [Amethyst Internal Implementation Patterns](#amethyst-internal-implementation-patterns)
- [Android-Specific Considerations](#android-specific-considerations)
- [Kotlin Multiplatform (KMP)](#kotlin-multiplatform-kmp)
- [Choosing a Library](#choosing-a-library)

---

## Library Overview

| Library | Language | NIP Coverage | Maturity | KMP Support | Repo |
|---------|----------|-------------|----------|-------------|------|
| rust-nostr Kotlin bindings | Rust + Kotlin | 60+ NIPs | Alpha | Yes (KMP artifact) | [rust-nostr/nostr](https://github.com/rust-nostr/nostr) |
| NostrPostr | Kotlin | 21 NIPs | Stable (maintenance) | No | [Giszmo/NostrPostr](https://github.com/Giszmo/NostrPostr) |
| nostr-java | Java | NIP-agnostic | Stable (v2.0) | No (JVM only) | [tcheeric/nostr-java](https://github.com/tcheeric/nostr-java) |
| Amethyst/Quartz | Kotlin | 60+ NIPs | Production | Partial (Quartz module) | [vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst) |

---

## rust-nostr Kotlin Bindings (via UniFFI)

The [rust-nostr](https://github.com/rust-nostr/nostr) project provides Kotlin bindings generated via Mozilla's [UniFFI](https://github.com/mozilla/uniffi-rs). This gives Kotlin/Android developers access to the full Rust nostr-sdk with native performance.

### Artifacts

Three Maven Central artifacts are published:

| Artifact | Use Case |
|----------|----------|
| `org.rust-nostr:nostr-sdk` | Android (AAR with native .so) |
| `org.rust-nostr:nostr-sdk-jvm` | JVM desktop/server |
| `org.rust-nostr:nostr-sdk-kmp` | Kotlin Multiplatform |

### Installation (Gradle)

```kotlin
// build.gradle.kts (Android)
dependencies {
    implementation("org.rust-nostr:nostr-sdk:0.39.0")
}

// build.gradle.kts (JVM)
dependencies {
    implementation("org.rust-nostr:nostr-sdk-jvm:0.39.0")
}
```

> **Note:** These bindings are in ALPHA. The API works but will have breaking changes between versions.

### Key Concepts

```kotlin
import rust.nostr.sdk.*

// Key generation
val keys = Keys.generate()
val publicKey = keys.publicKey()
val secretKey = keys.secretKey()

// Bech32 encoding
val npub = publicKey.toBech32()
val nsec = secretKey.toBech32()

// Restore from bech32
val restoredKeys = Keys.parse("nsec1...")

// Build and sign events
val event = EventBuilder.textNote("Hello from Kotlin!")
    .tags(listOf(Tag.hashtag("nostr")))
    .signWithKeys(keys)

// Client with relay management
val client = Client()
client.addRelay("wss://relay.damus.io")
client.addRelay("wss://nos.lol")
client.connect()

// Publish
client.sendEvent(event)

// Subscribe
val filter = Filter().kind(Kind(1u)).limit(50u)
client.subscribe(listOf(filter), null)
```

### NIP-55 Android Signer Integration

rust-nostr provides a dedicated library for NIP-55 signer communication:

- **Repo:** [rust-nostr/android-signer](https://github.com/rust-nostr/android-signer)
- Uses the `nostrsigner:` URI scheme to invoke external signer apps (e.g., Amber)
- Communication via Android Intents and ContentResolvers

### Supported NIPs

Inherits the full rust-nostr NIP coverage: NIP-01, 02, 04, 05, 06, 07, 09, 10, 11, 13, 17, 19, 21, 25, 26, 28, 30, 42, 44, 45, 46, 47, 48, 50, 51, 56, 57, 59, 65, and many more.

---

## NostrPostr

[NostrPostr](https://github.com/Giszmo/NostrPostr) is a pure-Kotlin Nostr implementation providing a library, relay server, and Android client scaffolding.

### Project Structure

| Module | Description |
|--------|-------------|
| `nostrpostrlib` | Core Kotlin library (connection management, events, encryption) |
| `examples` | Usage demonstrations |
| `NostrRelay` | Full relay implementation in Kotlin |
| `app` | Android client (deprecated in favor of Nostroid) |

### Installation

NostrPostr is not published to Maven Central. Include it as a local module or JitPack dependency:

```kotlin
// settings.gradle.kts
include(":nostrpostrlib")
project(":nostrpostrlib").projectDir = file("../NostrPostr/nostrpostrlib")

// build.gradle.kts
dependencies {
    implementation(project(":nostrpostrlib"))
}
```

### Supported NIPs

**Fully implemented:** NIP-01, 02, 04, 09, 11, 12, 15, 16

**Partial/planned:** NIP-03, 05, 06, 07, 13, 14, 20, 22, 25, 26, 28, 35, 36, 40

### Key API Patterns

```kotlin
// Relay connection
val relay = Relay("wss://relay.damus.io")
relay.connect()

// Event creation
val event = Event(
    pubKey = publicKey,
    kind = 1,
    content = "Hello from NostrPostr!",
    tags = listOf()
)
event.sign(privateKey)

// Subscription
relay.subscribe(
    filters = listOf(Filter(kinds = listOf(1), limit = 25))
) { event ->
    println("Received: ${event.content}")
}
```

### When to Use

NostrPostr is best for learning and prototyping. Its relay implementation is useful for testing. For production Android clients, consider rust-nostr bindings or Amethyst's Quartz library.

---

## nostr-java

[nostr-java](https://github.com/tcheeric/nostr-java) is a lightweight Java SDK that works seamlessly from Kotlin. Version 2.0 dramatically simplified the API from 9 modules (~180 classes) to 4 modules (~40 classes).

### Module Architecture

```
nostr-java-core --> nostr-java-event --> nostr-java-identity --> nostr-java-client
```

| Module | Purpose |
|--------|---------|
| `nostr-java-core` | Schnorr crypto, Bech32 encoding, utilities |
| `nostr-java-event` | `GenericEvent`, `GenericTag`, `EventFilter`, JSON serialization |
| `nostr-java-identity` | Key management, event signing, NIP-04/44 encryption |
| `nostr-java-client` | WebSocket relay client, async APIs |

### Installation (Maven)

```xml
<dependency>
    <groupId>nostr-java</groupId>
    <artifactId>nostr-java-client</artifactId>
    <version>2.0.0</version>
</dependency>
```

### Key Features

- **NIP-agnostic design:** Any event kind works via `GenericEvent.builder().kind(kindNumber)` -- no library updates needed for new NIPs
- **Virtual threads:** Relay I/O and listener dispatch on Java 21 virtual threads
- **Async APIs:** `connectAsync()`, `sendAsync()`, `subscribeAsync()` via `CompletableFuture`
- **Spring Retry integration** for reliable connectivity

### Usage from Kotlin

```kotlin
import nostr.java.*

val identity = Identity.generateRandomIdentity()

val event = GenericEvent.builder()
    .pubKey(identity.publicKey)
    .kind(Kinds.TEXT_NOTE)
    .content("Hello from nostr-java in Kotlin!")
    .tags(listOf(GenericTag.of("t", "nostr-java")))
    .build()

identity.sign(event)

NostrRelayClient("wss://relay.damus.io").use { client ->
    client.send(EventMessage(event))
}
```

### Requirements

- Java 21+ (for virtual thread support)
- Maven build system

---

## Amethyst Internal Implementation Patterns

[Amethyst](https://github.com/vitorpamplona/amethyst) is the most feature-complete Android Nostr client, implementing 60+ NIPs. Its internal architecture provides valuable patterns for Kotlin Nostr development.

### Architecture Layers

```
UI Layer (Jetpack Compose)
    |
ViewModel Layer (StateFlow, LiveData)
    |
Service Layer (Relay connections, filter assembly)
    |
Repository/Model Layer (In-memory object graph)
```

### Key Design Patterns

**Singleton Object Graph:**
The repository maintains a single in-memory graph of `Note` and `User` objects. There is never more than one `Note` with a given ID or one `User` with a given pubkey. When relay data arrives, existing objects are mutated in place, triggering reactive UI updates via `LiveData` and `StateFlow`.

**Quartz Module (KMP Shared Library):**
Amethyst's core protocol logic lives in the `Quartz` module, a Kotlin Multiplatform library that handles:
- Event parsing and serialization
- Cryptographic operations
- NIP implementations
- Protocol types and constants

This module can potentially be reused in other Kotlin projects.

**Relay Management:**
The service layer maintains persistent WebSocket connections. `Datasource` classes dynamically update relay filters based on what is currently visible on screen, optimizing bandwidth usage.

**Key Storage:**
Private keys are stored in Android's hardware-backed KeyStore, never in SharedPreferences or plain files.

### Modules

| Module | Purpose |
|--------|---------|
| `Quartz` | KMP shared protocol library |
| `Commons` | Shared UI components |
| `app` | Android client |
| `DesktopApp` | Compose Multiplatform desktop client |

### NIP Coverage

Amethyst implements 60+ NIPs including: NIP-01, 02, 04, 05, 06, 07, 09, 10, 11, 13, 15, 17, 19, 21, 23, 25, 26, 27, 28, 30, 31, 32, 36, 38, 39, 40, 42, 44, 45, 46, 47, 48, 50, 51, 53, 56, 57, 58, 59, 65, and more.

---

## Android-Specific Considerations

### Key Storage

**Always use Android KeyStore for private keys:**

```kotlin
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore

// Store nsec encrypted by KeyStore-backed key
class NostrKeyManager(private val context: Context) {
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun storePrivateKey(nsec: String) {
        val encryptedNsec = encryptWithKeyStore(nsec.toByteArray())
        context.getSharedPreferences("nostr_keys", Context.MODE_PRIVATE)
            .edit()
            .putString("encrypted_nsec", Base64.encodeToString(encryptedNsec, Base64.DEFAULT))
            .apply()
    }
}
```

**Never store keys in:**
- SharedPreferences (unencrypted)
- SQLite databases
- Plain files
- Application logs

### NIP-55 Signer Integration (Amber)

NIP-55 enables secure key management by delegating signing to a dedicated app like [Amber](https://github.com/greenart7c3/Amber).

```kotlin
// Check if a NIP-55 signer is available
fun isSignerAvailable(context: Context): Boolean {
    val intent = Intent().apply {
        action = "android.intent.action.VIEW"
        data = Uri.parse("nostrsigner:")
    }
    return intent.resolveActivity(context.packageManager) != null
}

// Request event signing via Intent
fun requestSignEvent(activity: Activity, eventJson: String, requestCode: Int) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$eventJson")).apply {
        putExtra("type", "sign_event")
        putExtra("current_user", publicKeyHex)
    }
    activity.startActivityForResult(intent, requestCode)
}

// Handle signed event in onActivityResult
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (resultCode == RESULT_OK) {
        val signature = data?.getStringExtra("signature")
        val signedEvent = data?.getStringExtra("event")
        // Use the signed event
    }
}
```

**ContentResolver approach (background signing):**
```kotlin
// For apps that need to sign without user interaction (if permitted)
val uri = Uri.parse("content://com.greenart7c3.nostrsigner.SIGN_EVENT")
val cursor = contentResolver.query(uri, null, eventJson, null, null)
cursor?.use {
    if (it.moveToFirst()) {
        val signature = it.getString(0)
    }
}
```

### Background Services

Nostr clients typically need persistent relay connections for notifications:

```kotlin
class NostrRelayService : Service() {
    private val relayConnections = mutableMapOf<String, WebSocket>()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Create foreground notification for Android 8+
        startForeground(NOTIFICATION_ID, createNotification())
        connectToRelays()
        return START_STICKY  // Restart if killed
    }

    private fun connectToRelays() {
        // Maintain WebSocket connections
        // Use WorkManager for periodic reconnection health checks
    }
}
```

**Best practices:**
- Use `ForegroundService` with a persistent notification for relay connections
- Use `WorkManager` for periodic sync/reconnection tasks
- Implement exponential backoff for relay reconnection
- Respect Android battery optimization (Doze mode)
- Use `ConnectivityManager` to detect network state changes

### Offline Support

```kotlin
// Cache events locally with Room
@Entity(tableName = "events")
data class CachedEvent(
    @PrimaryKey val id: String,
    val pubkey: String,
    val kind: Int,
    val content: String,
    val createdAt: Long,
    val tags: String,  // JSON-serialized
    val sig: String
)

@Dao
interface EventDao {
    @Query("SELECT * FROM events WHERE kind = :kind ORDER BY createdAt DESC LIMIT :limit")
    fun getEventsByKind(kind: Int, limit: Int): Flow<List<CachedEvent>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvents(events: List<CachedEvent>)
}
```

---

## Kotlin Multiplatform (KMP)

### rust-nostr KMP Artifact

The `nostr-sdk-kmp` artifact targets Kotlin Multiplatform projects:

```kotlin
// build.gradle.kts (KMP)
kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation("org.rust-nostr:nostr-sdk-kmp:0.39.0")
        }
    }
}
```

This enables sharing Nostr logic across Android, iOS (via Kotlin/Native), JVM desktop, and potentially JS/WASM targets.

### Amethyst's Quartz Approach

Amethyst's `Quartz` module demonstrates a pure-Kotlin KMP approach:

- Protocol types, event parsing, and crypto in `commonMain`
- Platform-specific crypto implementations in `androidMain` / `jvmMain` / `iosMain`
- UI components in the separate `Commons` module using Compose Multiplatform

### KMP Architecture Recommendations

```
commonMain/
    - Event types, filters, relay messages (data classes)
    - Serialization (kotlinx.serialization)
    - Protocol logic

androidMain/
    - Android KeyStore integration
    - NIP-55 signer support
    - Room database caching

iosMain/
    - iOS Keychain integration
    - Platform crypto

jvmMain/
    - Desktop-specific relay management
```

---

## Choosing a Library

| Scenario | Recommended Library |
|----------|-------------------|
| Production Android client | rust-nostr Kotlin bindings or Amethyst's Quartz |
| Maximum NIP coverage | rust-nostr bindings (60+ NIPs) |
| Pure Java/Kotlin, no native deps | nostr-java |
| Learning / prototyping | NostrPostr |
| Kotlin Multiplatform project | rust-nostr KMP artifact |
| Need relay server too | NostrPostr (includes relay) |

---

## See Also

- [Basic Usage Example](examples/basic_usage.kt) -- Complete Kotlin example with key generation, events, and relay communication
- [rust-nostr Book](https://rust-nostr.org/) -- Official documentation for rust-nostr bindings
- [nostr-java Docs](https://github.com/tcheeric/nostr-java/tree/main/docs) -- Getting started and API guides
- [NIP-55 Specification](https://github.com/nostr-protocol/nips/blob/master/55.md) -- Android Signer Application protocol
