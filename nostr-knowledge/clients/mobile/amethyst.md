# Amethyst: The Most Feature-Complete NOSTR Client

> **Platform:** Android (primary), Desktop (experimental via Compose Multiplatform)
> **Language:** Kotlin, Jetpack Compose
> **Author:** Vitor Pamplona
> **License:** MIT
> **Repository:** [github.com/vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst)
> **Distribution:** Google Play, F-Droid, Zapstore

---

## What Is Amethyst?

Amethyst is a native Android NOSTR client that implements more NIPs than virtually any other client in the ecosystem. Built by Vitor Pamplona (a prolific NOSTR contributor who also authors NIP proposals), Amethyst functions as a full social networking application, a Lightning wallet interface, a marketplace browser, a live-streaming viewer, a long-form content reader, and more -- all through the lens of the NOSTR protocol.

The tagline is: **"Join the social network you control."**

What sets Amethyst apart is its sheer breadth. Where most clients implement 10-20 NIPs and focus on one vertical (microblogging, chat, etc.), Amethyst implements **90+ NIPs** and exposes nearly every standardized NOSTR event kind through its UI. It is the reference implementation for several NIPs that Vitor himself authored (NIP-87 relay notify, NIP-88 polls, among others).

---

## Architecture Overview

Amethyst is structured as a multi-module Gradle project with four main components:

```
amethyst/
  app/            -- Amethyst: Native Android app (Kotlin + Jetpack Compose)
  quartz/         -- Quartz: NOSTR protocol library (Kotlin Multiplatform)
  commons/        -- Commons: Shared UI components (icons, Robohash, BlurHash)
  desktopApp/     -- DesktopApp: Compose Multiplatform desktop client
```

### Layered Architecture

```
+----------------------------------------------------------+
|  UI Layer: Jetpack Compose                               |
|  State / ViewModel / Composition                         |
+----------------------------------------------------------+
|  Service Layer                                           |
|  Relay connections, subscriptions, outbox routing         |
+----------------------------------------------------------+
|  Model / Repository Layer                                |
|  In-memory object graph of Notes, Users, Events          |
|  LiveData + Flow for reactive updates                    |
+----------------------------------------------------------+
|  Quartz (KMP)                                            |
|  Event parsing, crypto, relay protocol, NIP logic        |
+----------------------------------------------------------+
```

**UI Layer:** Standard Android architecture using Jetpack Compose with State, ViewModel, and Composition patterns. The UI subscribes to LiveData/Flow objects exposed by the repository layer and recomposes reactively when NOSTR events arrive.

**Service Layer:** Manages WebSocket connections to NOSTR relays. Handles subscription lifecycle, filter management (with dynamic filter updates at runtime), and the outbox model for intelligent relay routing.

**Model/Repository Layer:** Maintains all NOSTR objects in memory as a complete object-oriented graph. Key design decisions:
- `User` and `Note` instances are **mutable** and **unique** -- there is never a duplicate Note with the same ID or duplicate User with the same pubkey.
- The repository stores Events as Notes and Users separately.
- LiveData and Flow objects on each Note/User allow any part of the app to subscribe and receive granular updates.
- A custom database engine provides **sub-microsecond queries** using Android's default SQLite, optimized for minimal memory footprint on mobile.

**Quartz:** The shared protocol library, discussed in detail below.

---

## Quartz: The NOSTR Protocol Library

Quartz is the engine behind Amethyst's NIP breadth. It is a **Kotlin Multiplatform (KMP)** library that encapsulates all NOSTR protocol logic, making it reusable across Android, JVM, iOS (ARM64), and desktop targets.

### Module Structure

```
quartz/
  src/
    commonMain/       -- Platform-agnostic NOSTR protocol code
    jvmAndroid/       -- Shared JVM + Android implementations
    jvmMain/          -- JVM-specific (desktop) implementations
    androidMain/      -- Android-specific implementations
    iosArm64Main/     -- iOS ARM64 target
    iosSimulatorArm64Main/  -- iOS Simulator target
  CLIENT.md           -- Client protocol documentation
  RELAY.md            -- Relay protocol documentation
  build.gradle.kts    -- KMP build configuration
```

### Core Capabilities

**Event Handling:**
- Parsing, validation, and creation of NOSTR events across all supported event kinds
- Strongly-typed event classes for each NIP's event kinds
- Signature verification using Schnorr signatures on secp256k1

**Cryptography:**
- Secp256k1 key generation, signing, and verification (via libsodium)
- NIP-44 v2 encryption (ChaCha20 with authenticated MAC-before-sign design)
- NIP-04 legacy encryption support
- NIP-49 private key encryption
- Key derivation from mnemonics (NIP-06)
- Bech32 encoding/decoding (NIP-19)

**Relay Communication:**
- WebSocket connection management with configurable socket builders
- Subscription management with dynamic filter updates
- Outbox model implementation (NIP-65) -- compiles relay sets automatically based on follows
- Can manage connections to **1,000+ relays simultaneously**, even on mobile data
- Relay information document parsing (NIP-11)

**Distribution:** Quartz is published to Maven Central and can be used as a standalone dependency:
```kotlin
implementation("com.vitorpamplona.amethyst:quartz-android:$version")
// Also: quartz-jvm, quartz-iosarm64, quartz-iossimulatorarm64
```

### How Quartz Handles NIP Breadth

The grant-backed refactor that created Quartz moved shared code into Kotlin Multiplatform modules (`commonMain`, `jvmAndroid`, `jvmMain`), making multi-platform support a **library and module problem** rather than a full rewrite. Each NIP's event types, validation rules, and protocol logic live in `commonMain` where possible, with platform-specific implementations (e.g., Android KeyStore for key storage, platform crypto libraries) isolated in their respective source sets.

This design means adding support for a new NIP typically involves:
1. Defining the event kind and its fields in Quartz's `commonMain`
2. Adding parsing/validation logic
3. Implementing the UI in Amethyst's Compose layer

---

## Key Features

### Social Networking Core
- **Social feed** with algorithmic and chronological views
- **Threaded conversations** (NIP-10 reply threading)
- **Reactions** (NIP-25) including custom emoji reactions (NIP-30)
- **Reposts** (NIP-18)
- **User profiles** with NIP-05 verification, NIP-39 external identity claims
- **Contact lists** (NIP-02) and follow management
- **Bookmarks and lists** (NIP-51)
- **Content labels and reporting** (NIP-32, NIP-56)
- **Mute lists** and content filtering
- **Markdown rendering** in notes

### Payments and Value Transfer
- **Lightning Zaps** (NIP-57) with zap splits
- **Cashu / Nutzaps** (NIP-60, NIP-61) -- ecash token integration
- **Nostr Wallet Connect** (NIP-47) for seamless wallet integration

### Private Messaging
- **NIP-17 encrypted DMs** (modern gift-wrapped DMs)
- **NIP-04 legacy DMs** (backward compatibility)
- **NIP-44 encryption** for modern message encryption
- **Gift wrapping** (NIP-59) for metadata protection

### Content Types
- **Long-form content** (NIP-23) -- blog posts and articles
- **Polls** (NIP-88)
- **Live streaming** (NIP-53) -- live audio/video events
- **Classifieds** (NIP-99) -- listing-style posts
- **Badges** (NIP-58) -- achievement and credential display
- **Git repositories** (NIP-34) -- code collaboration events
- **Torrents** (NIP-35) -- torrent metadata sharing
- **Image/video feeds** with NIP-68 and NIP-71 media standards
- **Interactive stories** (NIP-63 / Olas integration)
- **Calendar events** (NIP-52)

### Marketplace and Commerce
- **Marketplace** (NIP-15) -- product listings and storefronts
- **Stalls and products** browsing

### Communities and Groups
- **Communities** (NIP-72) -- Reddit-style moderated communities
- **Group chat** (NIP-28, NIP-29)
- **Moderation tools** for community management

### Privacy and Security
- **Tor support** -- route connections through the Tor network
- **NIP-55 external signer** -- integration with Amber (Android signer app)
- **NIP-46 remote signer** (Nostr Connect / bunker)
- **Android KeyStore** for private key protection
- **Proof of Work** (NIP-13) for anti-spam

### Discovery and Intelligence
- **NIP-50 search** -- full-text search via relay support
- **NIP-89 app recommendations** -- discover handlers for event kinds
- **NIP-90 Data Vending Machines** -- AI/compute marketplace integration
- **In-device automatic translation** -- translate notes without a server
- **NIP-87 relay notify** -- subscription management for paid relays

### Media and Content
- **Image and video capture** directly in-app
- **NIP-94 file metadata** and **NIP-96 file storage** integration
- **BlurHash** placeholders for images
- **Robohash** default avatars
- **Video streaming** (NIP-71)

### Account and Platform
- **Multiple account support**
- **Push notifications** (Google FCM and UnifiedPush)
- **QR code login**
- **NIP-06 mnemonic** key derivation
- **Relay management UI** with NIP-65 outbox model

---

## NIP Support Matrix

Amethyst implements approximately **90+ NIPs**, making it the most comprehensive NOSTR client by NIP coverage. The following is the complete list as documented in the repository:

| NIP | Name | Status |
|-----|------|--------|
| 01 | Basic Protocol | Full |
| 02 | Follow List | Full |
| 03 | OpenTimestamps | Full (Android); stubs in commonMain |
| 04 | Encrypted DMs (legacy) | Full |
| 05 | DNS-based Identifiers | Full |
| 06 | Mnemonic Key Derivation | Full |
| 08 | Mentions (legacy) | Full |
| 09 | Event Deletion | Full |
| 10 | Reply Threading | Full |
| 11 | Relay Information | Full |
| 13 | Proof of Work | Full |
| 14 | Subject Tag | Full |
| 15 | Marketplace | Full |
| 17 | Gift-Wrapped DMs | Full |
| 18 | Reposts | Full |
| 19 | Bech32 Entities | Full |
| 21 | `nostr:` URI Scheme | Full |
| 22 | Comment | Full |
| 23 | Long-form Content | Full |
| 24 | Extra Metadata | Full |
| 25 | Reactions | Full |
| 26 | Delegated Event Signing | Full |
| 27 | Text Note References | Full |
| 28 | Public Chat (channels) | Full |
| 29 | Relay-based Groups | Full |
| 30 | Custom Emoji | Full |
| 31 | Alt Tag | Full |
| 32 | Labeling | Full |
| 34 | Git Stuff | Full |
| 35 | Torrents | Full |
| 36 | Sensitive Content | Full |
| 37 | Draft Events | Full |
| 38 | User Statuses | Full |
| 39 | External Identities | Full |
| 40 | Expiration Timestamp | Full |
| 42 | Authentication | Full |
| 43 | Fast Authentication | Full |
| 44 | Encryption (v2) | Full |
| 45 | Event Counts | Full |
| 46 | Nostr Connect (Remote Signer) | Full (Android); partial in commonMain |
| 47 | Nostr Wallet Connect | Full |
| 48 | Proxy Tags | Full |
| 49 | Private Key Encryption | Full |
| 50 | Search | Full |
| 51 | Lists | Full |
| 52 | Calendar Events | Full |
| 53 | Live Activities | Full |
| 54 | Wiki | Full |
| 55 | Android Signer (Amber) | Full |
| 56 | Reporting | Full |
| 57 | Lightning Zaps | Full |
| 58 | Badges | Full |
| 59 | Gift Wrap | Full |
| 5A | (Experimental) | Full |
| 60 | Cashu Wallet | Full |
| 61 | Nutzaps | Full |
| 62 | (Experimental) | Full |
| 64 | Chess (PGN) | Full |
| 65 | Relay List Metadata | Full |
| 66 | (Experimental) | Full |
| 68 | Picture Events | Full |
| 69 | (Experimental) | Full |
| 70 | (Experimental) | Full |
| 71 | Video Events | Full |
| 72 | Communities | Full |
| 73 | Word/Emoji Sets | Full |
| 75 | Zap Goals | Full |
| 77 | (Experimental) | Full |
| 78 | Arbitrary App Data | Full |
| 7D | Threads | Full |
| 84 | Highlights | Full |
| 85 | Trusted Assertions (WoT) | Full |
| 86 | (Experimental) | Full |
| 87 | Relay Notify | Full |
| 88 | Polls | Full |
| 89 | Recommended Application Handlers | Full |
| 90 | Data Vending Machines | Full |
| 92 | Media Attachments | Full |
| 94 | File Metadata | Full |
| 95 | File Storage | Full |
| 96 | HTTP File Storage | Full (Android); ServerInfoParser stub |
| 98 | HTTP Auth | Full |
| 99 | Classifieds | Full |
| A0 | (Experimental) | Full |
| A4 | (Experimental) | Full |
| B0 | (Experimental) | Full |
| B7 | (Experimental) | Full |
| BE | (Experimental) | Full |
| C0 | (Experimental) | Full |
| C7 | (Experimental) | Full |
| EE | MLS Protocol | Incomplete |

*Note: Some experimental NIPs use hex identifiers (5A, 7D, A0, etc.) as they were proposed or adopted before receiving formal decimal numbers. Check the repository for the latest support status.*

---

## Relay Connection Management

Amethyst's relay management has evolved significantly and represents some of the most sophisticated relay handling in the ecosystem:

### Outbox Model (NIP-65)

Starting with v1.03.0, Amethyst migrated from manual relay lists to a **dynamic outbox model**. Instead of the user manually configuring which relays to connect to, the app:

1. Reads the relay lists (NIP-65) of everyone the user follows
2. Compiles an optimal relay set automatically
3. Connects to the minimal set of relays needed to receive all followed content
4. Routes outbound events to the correct write relays

This means Amethyst can connect to **1,000+ relays simultaneously** when needed, even over mobile data -- a testament to the efficiency of the WebSocket management in the service layer.

### Relay Notify (NIP-87)

Vitor authored NIP-87 based on 18+ months of production use in Amethyst. This enables seamless subscription management for paid relays, reducing friction for new users signing up or renewing relay subscriptions.

---

## Image and Video Loading Pipeline

Amethyst handles rich media throughout the feed:

- **BlurHash placeholders:** Low-resolution color placeholders render instantly while images load
- **Robohash avatars:** Deterministic robot avatars generated from pubkeys for users without profile pictures
- **NIP-68 / NIP-71:** Modern picture and video event standards for structured media posts
- **NIP-92 / NIP-94 / NIP-96:** File metadata and HTTP file storage integration for media uploads
- **In-app capture:** Direct image and video capture without leaving the app
- **Sensitive content filtering:** NIP-36 content warnings with blur/reveal UI

---

## Key Technical Decisions Worth Studying

### 1. In-Memory Object Graph
Rather than a traditional database-first approach, Amethyst keeps the full NOSTR object graph in memory with unique instances per ID. This enables instant UI updates and avoids the impedance mismatch between relational storage and a social graph. The custom SQLite engine provides persistence with sub-microsecond query times.

### 2. Kotlin Multiplatform for Protocol Logic
By extracting all NIP logic into Quartz as a KMP library, Amethyst avoids the trap of coupling protocol handling to Android-specific code. The same event parsing, crypto, and relay logic can power desktop and (eventually) iOS clients. This is a model other NOSTR projects could follow.

### 3. Mutable Unique Instances
The decision to have exactly one mutable `Note` and one mutable `User` instance per NOSTR ID simplifies the codebase enormously. Any part of the app holding a reference to a Note will see updates in real time via LiveData/Flow, without needing to re-query or diff.

### 4. Dynamic Outbox Relay Routing
Rather than asking users to manually configure relays (a notoriously confusing UX), Amethyst computes the optimal relay set from the social graph. This is computationally expensive but dramatically improves the user experience and data completeness.

### 5. NIP-55 External Signer Integration
By supporting Amber (the Android NOSTR signer app), Amethyst allows users to keep private keys in a dedicated secure app. This separation of concerns mirrors how hardware wallets work in Bitcoin -- the client never needs to hold the signing key.

### 6. Aggressive NIP Adoption
Amethyst's strategy of implementing nearly every NIP serves as both a product differentiator and a forcing function for the Quartz library's architecture. Each new NIP tests the extensibility of the event handling system.

### 7. ChaCha20 over AES (NIP-44)
Quartz implements NIP-44 v2 encryption using ChaCha20 rather than AES. This choice provides better performance on mobile devices (where hardware AES acceleration may not be available) and stronger security against multi-key attacks. The MAC-before-sign design authenticates payloads before the outer NIP-01 signature.

---

## Build and Contribution Guide

### Prerequisites
- **Java 21+**
- **Android Studio** (latest stable recommended)
- **Android 8.0+** device or emulator (API 26+)
- **libsodium** (required for cryptographic operations)
  ```bash
  # macOS
  brew install libsodium

  # Linux
  apt-get install libsodium-dev
  ```
- For desktop: JVM runtime
- For iOS targets: Xcode with iOS simulator

### Build Commands

```bash
# Android debug APK
./gradlew assembleDebug

# Desktop application
./gradlew :desktopApp:run

# Full build (all targets)
./gradlew build

# Unit tests
./gradlew test

# Android instrumented tests
./gradlew connectedAndroidTest
```

### Using Quartz as a Dependency

To use Quartz in your own NOSTR project, add the Maven Central dependency:

```kotlin
// build.gradle.kts
dependencies {
    // Pick the target matching your platform:
    implementation("com.vitorpamplona.amethyst:quartz-android:$version")
    // implementation("com.vitorpamplona.amethyst:quartz-jvm:$version")
    // implementation("com.vitorpamplona.amethyst:quartz-iosarm64:$version")
    // implementation("com.vitorpamplona.amethyst:quartz-iossimulatorarm64:$version")
}
```

### Contributing

Amethyst is MIT-licensed and accepts contributions via GitHub pull requests. The repository follows standard Android/Kotlin conventions. Key areas for contribution:
- New NIP implementations (add event types in Quartz, UI in app module)
- Relay performance optimizations
- Translation and localization
- UI/UX improvements in the Compose layer

---

## Links and Resources

- **Source Code:** [github.com/vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst)
- **Releases:** [github.com/vitorpamplona/amethyst/releases](https://github.com/vitorpamplona/amethyst/releases)
- **Changelog:** [github.com/vitorpamplona/amethyst/blob/main/CHANGELOG.md](https://github.com/vitorpamplona/amethyst/blob/main/CHANGELOG.md)
- **Quartz on Nostr Compass:** [nostrcompass.org/en/topics/quartz/](https://nostrcompass.org/en/topics/quartz/)
- **Google Play:** Search "Amethyst Nostr" on Google Play Store
- **F-Droid:** Available through F-Droid repositories
- **Vitor Pamplona on NOSTR:** Follow the author for development updates
- **NIP Repository:** [github.com/nostr-protocol/nips](https://github.com/nostr-protocol/nips)

---

*Amethyst stands as the most feature-complete NOSTR client. Its architecture -- particularly the Quartz KMP library and the in-memory object graph -- provides a reference for how to build extensible, multi-NIP NOSTR applications. For any developer studying how to implement a broad surface area of the NOSTR protocol, Amethyst's codebase is the most valuable resource available.*
