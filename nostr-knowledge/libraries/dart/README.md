# Dart / Flutter Nostr Libraries

The Dart and Flutter ecosystem provides several approaches to building Nostr clients, from high-level development kits to low-level protocol libraries. Flutter's cross-platform nature makes these libraries especially valuable for targeting iOS, Android, web, and desktop from a single codebase.

---

## Table of Contents

- [Library Overview](#library-overview)
- [NDK -- Nostr Development Kit (relaystr/ndk)](#ndk----nostr-development-kit)
- [dart_nostr (anasfik/nostr)](#dart_nostr)
- [dart-nostr (ethicnology/dart-nostr)](#dart-nostr-ethicnologydart-nostr)
- [rust-nostr Flutter Bindings](#rust-nostr-flutter-bindings)
- [Flutter-Specific Patterns](#flutter-specific-patterns)
- [Cross-Platform Considerations](#cross-platform-considerations)
- [Choosing a Library](#choosing-a-library)

---

## Library Overview

| Library | Pub.dev Package | NIP Coverage | Maturity | Architecture |
|---------|----------------|-------------|----------|--------------|
| NDK (relaystr/ndk) | `ndk` | Broad (inbox/outbox native) | Active (v0.7+) | Modular monorepo |
| dart_nostr | `dart_nostr` | 40+ NIPs | Stable (v9.2+) | Single package |
| dart-nostr | `nostr` | 28 NIPs | Stable | Single package |
| rust-nostr Flutter | `nostr_sdk` | 60+ NIPs | Alpha | Rust FFI |

---

## NDK -- Nostr Development Kit

[NDK](https://github.com/relaystr/ndk) (Nostr Development Kit) by relaystr is the most comprehensive Dart Nostr library. It provides high-level abstractions for common use cases while exposing low-level query capabilities enhanced with inbox/outbox (gossip) protocol by default.

**Documentation:** [https://dart-nostr.com/](https://dart-nostr.com/)

### Architecture

NDK is organized as a monorepo using [Melos](https://melos.invertase.dev/) with six packages:

| Package | Purpose |
|---------|---------|
| `ndk` | Core library -- protocol, events, signing, relay management |
| `ndk_flutter` | Flutter-specific widgets and utilities |
| `nip07_event_signer` | NIP-07 browser extension signing |
| `objectbox` | ObjectBox NoSQL database cache |
| `sembast_cache_manager` | Sembast database cache |
| `sample-app` | Reference Flutter application |

### Installation

```yaml
# pubspec.yaml
dependencies:
  ndk: ^0.7.1

  # Optional: Flutter-specific utilities
  ndk_flutter: ^0.7.1

  # Optional: Choose a cache backend
  # objectbox variant (recommended for mobile)
  ndk_objectbox: ^0.7.1
  # or sembast variant
  # sembast_cache_manager: ^0.7.1
```

### Key Features

- **Inbox/Outbox (Gossip) by default:** Queries automatically use NIP-65 relay lists for optimal message routing
- **Multiple signer support:** Built-in BIP-340, Amber (Android), NIP-07 (web), NIP-46 (remote signing/bunkers)
- **Account management** with state tracking
- **Relay authentication** (NIP-42)
- **Metadata management** (NIP-01 kind 0)
- **Contact lists** (NIP-02)
- **NIP-51 lists** (mute, pin, bookmark)
- **Gift wrap** (NIP-59) for encrypted messaging
- **NIP-17 private direct messages**
- **Multiple database backends** for event caching

### Basic Usage

```dart
import 'package:ndk/ndk.dart';

// Initialize NDK
final ndk = Ndk(NdkConfig(
  eventSigner: Bip340EventSigner(
    privateKey: 'hex_private_key_here',
    publicKey: 'hex_public_key_here',
  ),
  cache: MemCacheManager(),
));

// Fetch user metadata
final metadata = await ndk.metadata.loadMetadata('pubkey_hex');
print('Name: ${metadata?.name}');

// Publish a text note
final event = ndk.broadcast.broadcastTextNote(
  content: 'Hello from NDK!',
);

// Query events with inbox/outbox
final response = ndk.requests.query(
  filters: [
    Filter(kinds: [1], limit: 20),
  ],
);

await for (final event in response.stream) {
  print('${event.pubKey}: ${event.content}');
}

// Fetch contact list
final contacts = await ndk.follows.getContactList('pubkey_hex');
for (final contact in contacts) {
  print('Following: ${contact.pubKey}');
}
```

### Signer Configuration

```dart
// Built-in BIP-340 signer (knows the private key)
final bip340Signer = Bip340EventSigner(
  privateKey: privateKeyHex,
  publicKey: publicKeyHex,
);

// NIP-46 remote signer (bunker)
final bunkerSigner = Nip46EventSigner(
  bunkerUrl: 'bunker://pubkey?relay=wss://relay.example.com',
);

// NIP-07 web extension signer
final webSigner = Nip07EventSigner();

// Pass any signer to NDK config
final ndk = Ndk(NdkConfig(
  eventSigner: bip340Signer,
  cache: MemCacheManager(),
));
```

---

## dart_nostr

[dart_nostr](https://github.com/anasfik/nostr) (pub.dev package: `dart_nostr`) is a mature, well-documented library for building Dart/Flutter Nostr clients with support for 40+ NIPs.

### Installation

```yaml
# pubspec.yaml
dependencies:
  dart_nostr: ^9.2.4
```

Or via command line:
```bash
flutter pub add dart_nostr
# or for pure Dart:
dart pub add dart_nostr
```

### Supported NIPs

NIP-01 through 06, 08-11, 13-15, 18-19, 21, 23-25, 27-28, 30-32, 36, 38-40, 45, 47-48, 50-53, 56-58, 72, 75, 78, 84, 89, 94, 98-99.

**Planned:** NIP-42, NIP-44.

### Core API

```dart
import 'package:dart_nostr/dart_nostr.dart';

// Access the singleton instance
final nostr = Nostr.instance;

// --- Key Management ---

// Generate a new keypair
final keyPair = nostr.keysService.generateKeyPair();
print('Public key (hex): ${keyPair.public}');
print('Private key (hex): ${keyPair.private}');

// Encode/decode bech32
final npub = nostr.keysService.encodePublicKeyToNpub(keyPair.public);
final nsec = nostr.keysService.encodePrivateKeyToNsec(keyPair.private);

// Derive public key from private key
final derived = nostr.keysService.derivePublicKey(privateKey: keyPair.private);

// --- Relay Connection ---

await nostr.relaysService.init(
  relaysUrl: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
  ],
);

// --- Event Creation and Publishing ---

// Create and sign a text note (kind 1)
final event = NostrEvent.fromPartialData(
  kind: 1,
  content: 'Hello Nostr from dart_nostr!',
  keyPairs: keyPair,
  tags: [
    ['t', 'nostr'],
    ['t', 'dart'],
  ],
);

// Publish to all connected relays
nostr.relaysService.sendEventToRelays(event);

// --- Subscribing to Events ---

// Create a subscription request
final subscription = nostr.relaysService.startEventsSubscription(
  request: NostrRequest(
    filters: [
      NostrFilter(
        kinds: [1],
        limit: 25,
      ),
    ],
  ),
);

// Listen to the event stream
subscription.stream.listen((NostrEvent event) {
  print('Author: ${event.pubkey}');
  print('Content: ${event.content}');
  print('Created at: ${event.createdAt}');
  print('---');
});

// --- NIP-05 Verification ---

final nip05 = await nostr.utilsService.verifyNip05(
  internetIdentifier: 'user@example.com',
);
print('Verified: ${nip05 != null}');

// --- NIP-19 Encoding ---

final noteId = nostr.utilsService.encodeNoteId(event.id!);
print('note1... : $noteId');

// --- Cleanup ---

nostr.relaysService.closeEventsSubscription(subscription.subscriptionId);
```

### Features at a Glance

- Singleton pattern for global relay management
- Stream-based and Future-based subscription APIs
- Automatic WebSocket reconnection
- NIP-05 verification
- NIP-19 entity encoding/decoding
- Proof of work (NIP-13)
- Full event signing and verification

---

## dart-nostr (ethicnology/dart-nostr)

[dart-nostr](https://github.com/ethicnology/dart-nostr) (pub.dev package: `nostr`) is a focused library emphasizing clean API design with support for 28 NIPs including modern encryption standards.

### Installation

```yaml
# pubspec.yaml
dependencies:
  nostr: ^1.4.0
```

```bash
flutter pub add nostr
```

### Supported NIPs

NIP-01, 02, 17, 23, 28, 44, 46, 51, 53, 57, 59, 65, and more (28 total).

Notable: Includes NIP-44 (versioned encryption) and NIP-59 (gift wrap) which some other Dart libraries lack.

### Core API

```dart
import 'package:nostr/nostr.dart';

// --- Key Generation ---

final keys = Keys.generate();
print('Private key: ${keys.secret}');
print('Public key: ${keys.public}');

// From existing private key
final existingKeys = Keys(secret: 'hex_private_key');

// --- Event Creation ---

final event = Event.from(
  kind: 1,
  content: 'Hello from dart-nostr!',
  privkey: keys.secret,
  tags: [
    ['t', 'nostr'],
  ],
);

print('Serialized: ${event.serialize()}');

// --- Subscription Requests ---

final request = Request(
  generate64RandomHexChars(),  // subscription ID
  [
    Filter(
      kinds: [1],
      limit: 20,
    ),
  ],
);

print('Request: ${request.serialize()}');

// --- NIP-44 Encryption ---

final encrypted = Nip44.encrypt(
  'Secret message',
  keys.secret,
  recipientPubkey,
);

final decrypted = Nip44.decrypt(
  encrypted,
  keys.secret,
  senderPubkey,
);

// --- NIP-59 Gift Wrap ---

// Create a sealed, gift-wrapped event for private messaging
final seal = Nip59.seal(
  event,
  keys.secret,
  recipientPubkey,
);

final giftWrap = Nip59.giftWrap(
  seal,
  recipientPubkey,
);
```

### When to Use

dart-nostr is ideal when you need modern encryption (NIP-44, NIP-59) and a lightweight dependency. It does not include WebSocket management -- you bring your own relay connection layer.

---

## rust-nostr Flutter Bindings

The [rust-nostr](https://github.com/rust-nostr/nostr) project provides Flutter bindings via Dart FFI, giving access to the full Rust nostr-sdk implementation.

### Installation

```yaml
# pubspec.yaml
dependencies:
  nostr_sdk: ^0.39.0
```

> **Note:** These bindings are in ALPHA. The API generally works but will have breaking changes.

### Usage

```dart
import 'package:nostr_sdk/nostr_sdk.dart';

// Key generation
final keys = Keys.generate();
final npub = keys.publicKey().toBech32();
final nsec = keys.secretKey().toBech32();

// Event creation
final event = EventBuilder.textNote('Hello from rust-nostr Flutter!')
    .tags([Tag.hashtag('nostr')])
    .signWithKeys(keys);

// Client and relay management
final client = Client();
await client.addRelay('wss://relay.damus.io');
await client.connect();

// Publish
await client.sendEvent(event);

// Subscribe
final filter = Filter().kind(Kind(1)).limit(20);
await client.subscribe([filter]);
```

### Advantages

- Identical API to rust-nostr Kotlin and Swift bindings (team familiarity)
- Maximum NIP coverage (60+)
- Battle-tested Rust cryptography
- Consistent behavior across all platforms

### Disadvantages

- Alpha stability
- Larger binary size (includes Rust runtime)
- Debugging across FFI boundary is harder
- Build complexity (requires Rust toolchain for development)

---

## Flutter-Specific Patterns

### State Management with Riverpod

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dart_nostr/dart_nostr.dart';

// Provider for the Nostr service
final nostrProvider = Provider<Nostr>((ref) => Nostr.instance);

// Provider for relay connection state
final relayConnectionProvider = FutureProvider<void>((ref) async {
  final nostr = ref.read(nostrProvider);
  await nostr.relaysService.init(
    relaysUrl: ['wss://relay.damus.io', 'wss://nos.lol'],
  );
});

// Stream provider for a feed
final feedProvider = StreamProvider.family<NostrEvent, List<int>>((ref, kinds) {
  final nostr = ref.read(nostrProvider);
  final subscription = nostr.relaysService.startEventsSubscription(
    request: NostrRequest(
      filters: [NostrFilter(kinds: kinds, limit: 50)],
    ),
  );
  return subscription.stream;
});

// Usage in a widget
class FeedWidget extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(feedProvider([1]));
    return feed.when(
      data: (event) => NoteCard(event: event),
      loading: () => const CircularProgressIndicator(),
      error: (err, stack) => Text('Error: $err'),
    );
  }
}
```

### State Management with BLoC

```dart
import 'package:flutter_bloc/flutter_bloc.dart';

// Events
abstract class NostrBlocEvent {}
class ConnectToRelays extends NostrBlocEvent {}
class SubscribeToFeed extends NostrBlocEvent {
  final List<int> kinds;
  SubscribeToFeed(this.kinds);
}
class NewNostrEvent extends NostrBlocEvent {
  final NostrEvent event;
  NewNostrEvent(this.event);
}

// State
class NostrState {
  final List<NostrEvent> events;
  final bool isConnected;

  const NostrState({this.events = const [], this.isConnected = false});

  NostrState copyWith({List<NostrEvent>? events, bool? isConnected}) {
    return NostrState(
      events: events ?? this.events,
      isConnected: isConnected ?? this.isConnected,
    );
  }
}

// BLoC
class NostrBloc extends Bloc<NostrBlocEvent, NostrState> {
  final Nostr _nostr = Nostr.instance;

  NostrBloc() : super(const NostrState()) {
    on<ConnectToRelays>(_onConnect);
    on<SubscribeToFeed>(_onSubscribe);
    on<NewNostrEvent>(_onNewEvent);
  }

  Future<void> _onConnect(ConnectToRelays event, Emitter<NostrState> emit) async {
    await _nostr.relaysService.init(
      relaysUrl: ['wss://relay.damus.io', 'wss://nos.lol'],
    );
    emit(state.copyWith(isConnected: true));
  }

  void _onSubscribe(SubscribeToFeed event, Emitter<NostrState> emit) {
    final subscription = _nostr.relaysService.startEventsSubscription(
      request: NostrRequest(
        filters: [NostrFilter(kinds: event.kinds, limit: 50)],
      ),
    );
    subscription.stream.listen((nostrEvent) {
      add(NewNostrEvent(nostrEvent));
    });
  }

  void _onNewEvent(NewNostrEvent event, Emitter<NostrState> emit) {
    final updated = [event.event, ...state.events].take(200).toList();
    emit(state.copyWith(events: updated));
  }
}
```

### Widget Integration

```dart
class NostrNoteCard extends StatelessWidget {
  final NostrEvent event;

  const NostrNoteCard({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Author row
            Row(
              children: [
                CircleAvatar(
                  child: Text(event.pubkey.substring(0, 2).toUpperCase()),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.pubkey.substring(0, 16) + '...',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      Text(
                        DateTime.fromMillisecondsSinceEpoch(
                          event.createdAt! * 1000,
                        ).toString(),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Content
            Text(event.content ?? ''),
          ],
        ),
      ),
    );
  }
}
```

---

## Cross-Platform Considerations

### Platform Matrix

| Feature | Android | iOS | Web | Desktop |
|---------|---------|-----|-----|---------|
| NDK | Full | Full | Full | Full |
| dart_nostr | Full | Full | Full | Full |
| dart-nostr | Full | Full | Full | Full |
| rust-nostr Flutter | Full | Full | Partial | Full |
| NIP-07 (browser ext) | N/A | N/A | Full | N/A |
| NIP-55 (Android signer) | Full | N/A | N/A | N/A |
| NIP-46 (remote signer) | Full | Full | Full | Full |
| Secure key storage | KeyStore | Keychain | Limited | OS-dependent |

### Platform-Specific Key Storage

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class NostrKeyStorage {
  // flutter_secure_storage uses:
  //   Android: EncryptedSharedPreferences (backed by KeyStore)
  //   iOS: Keychain
  //   Web: Not truly secure (use NIP-07 or NIP-46 instead)
  //   Desktop: OS keyring

  final _storage = const FlutterSecureStorage();

  Future<void> savePrivateKey(String nsec) async {
    await _storage.write(key: 'nostr_nsec', value: nsec);
  }

  Future<String?> loadPrivateKey() async {
    return await _storage.read(key: 'nostr_nsec');
  }

  Future<void> deletePrivateKey() async {
    await _storage.delete(key: 'nostr_nsec');
  }
}
```

### Web-Specific: NIP-07 Integration

```dart
import 'dart:js' as js;

class Nip07Signer {
  bool get isAvailable => js.context.hasProperty('nostr');

  Future<String> getPublicKey() async {
    final result = await js.context['nostr'].callMethod('getPublicKey', []);
    return result as String;
  }

  Future<Map<String, dynamic>> signEvent(Map<String, dynamic> event) async {
    final result = await js.context['nostr'].callMethod('signEvent', [
      js.JsObject.jsify(event),
    ]);
    return Map<String, dynamic>.from(result);
  }
}
```

### Database Caching Strategy

```dart
// NDK supports multiple cache backends. Choose based on platform:

// Mobile (Android/iOS): ObjectBox -- fast, binary, small footprint
final ndk = Ndk(NdkConfig(
  eventSigner: signer,
  cache: ObjectBoxCacheManager(directory: appDocDir.path),
));

// Web: Sembast -- works in browsers via IndexedDB
final ndk = Ndk(NdkConfig(
  eventSigner: signer,
  cache: SembastCacheManager(),
));

// Desktop: Either ObjectBox or Sembast
// In-memory only (no persistence):
final ndk = Ndk(NdkConfig(
  eventSigner: signer,
  cache: MemCacheManager(),
));
```

---

## Choosing a Library

| Scenario | Recommended |
|----------|-------------|
| Full-featured Flutter Nostr client | **NDK** -- most complete, inbox/outbox built-in |
| Quick prototype or simple client | **dart_nostr** -- easy singleton API, 40+ NIPs |
| Need NIP-44 encryption / NIP-59 gift wrap | **dart-nostr** -- best encryption support |
| Maximum NIP coverage, multi-language team | **rust-nostr Flutter** -- 60+ NIPs, same API as Kotlin/Swift |
| Web-first with NIP-07 | **NDK** (has nip07_event_signer package) |
| Minimal dependencies | **dart-nostr** -- lightweight, bring your own WebSocket |

---

## See Also

- [Basic Usage Example](examples/basic_usage.dart) -- Complete Dart/Flutter example
- [NDK Documentation](https://dart-nostr.com/) -- Official NDK guides
- [dart_nostr on pub.dev](https://pub.dev/packages/dart_nostr) -- API reference
- [rust-nostr Book](https://rust-nostr.org/) -- Covers Flutter bindings
- [Master Library Overview](../README.md) -- Cross-language comparison
