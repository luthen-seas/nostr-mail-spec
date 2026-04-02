/// Nostr Dart/Flutter Basic Usage Example
///
/// Demonstrates key generation, event creation, relay connection,
/// publishing, and subscribing using dart_nostr.
///
/// pubspec.yaml dependencies:
///   dart_nostr: ^9.2.4
///
/// For NDK and dart-nostr alternatives, see sections below.

import 'dart:async';
import 'package:dart_nostr/dart_nostr.dart';

// =============================================================================
// Section 1: Using dart_nostr (anasfik/nostr)
// =============================================================================

Future<void> main() async {
  print('=== Nostr Dart Example (dart_nostr) ===\n');

  final nostr = Nostr.instance;

  // ---------------------------------------------------------------------------
  // 1. Key Generation
  // ---------------------------------------------------------------------------

  // Generate a new random keypair
  final keyPair = nostr.keysService.generateKeyPair();
  print('Public key (hex):  ${keyPair.public}');
  print('Private key (hex): ${keyPair.private}');

  // Encode to bech32
  final npub = nostr.keysService.encodePublicKeyToNpub(keyPair.public);
  final nsec = nostr.keysService.encodePrivateKeyToNsec(keyPair.private);
  print('Public key (npub): $npub');
  print('Secret key (nsec): $nsec');

  // Derive public key from private key
  final derivedPubKey = nostr.keysService.derivePublicKey(
    privateKey: keyPair.private,
  );
  assert(derivedPubKey == keyPair.public);
  print('Key derivation verified.');
  print('');

  // ---------------------------------------------------------------------------
  // 2. Relay Connection
  // ---------------------------------------------------------------------------

  print('Connecting to relays...');
  await nostr.relaysService.init(
    relaysUrl: [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band',
    ],
  );
  print('Connected to ${nostr.relaysService.relaysList?.length ?? 0} relays.');
  print('');

  // ---------------------------------------------------------------------------
  // 3. Event Creation and Signing
  // ---------------------------------------------------------------------------

  // Create a text note (kind 1)
  final textNote = NostrEvent.fromPartialData(
    kind: 1,
    content: 'Hello Nostr from Dart!',
    keyPairs: keyPair,
    tags: [
      ['t', 'nostr'],
      ['t', 'dart'],
    ],
  );

  print('Event ID:        ${textNote.id}');
  print('Event kind:      ${textNote.kind}');
  print('Event content:   ${textNote.content}');
  print('Event signature: ${textNote.sig?.substring(0, 32)}...');
  print('');

  // Create a metadata event (kind 0)
  final metadataEvent = NostrEvent.fromPartialData(
    kind: 0,
    content: '{"name":"DartDev","about":"Building nostr clients in Dart","nip05":"dartdev@example.com"}',
    keyPairs: keyPair,
  );

  // Create a recommended relay list (kind 10002, NIP-65)
  final relayListEvent = NostrEvent.fromPartialData(
    kind: 10002,
    content: '',
    keyPairs: keyPair,
    tags: [
      ['r', 'wss://relay.damus.io', 'read'],
      ['r', 'wss://nos.lol', 'write'],
      ['r', 'wss://relay.nostr.band'],
    ],
  );

  // ---------------------------------------------------------------------------
  // 4. Publishing Events
  // ---------------------------------------------------------------------------

  print('Publishing text note...');
  nostr.relaysService.sendEventToRelays(textNote);
  print('Text note published.');

  print('Publishing metadata...');
  nostr.relaysService.sendEventToRelays(metadataEvent);
  print('Metadata published.');
  print('');

  // ---------------------------------------------------------------------------
  // 5. Subscribing to Events
  // ---------------------------------------------------------------------------

  // Subscribe to recent text notes
  print('Subscribing to text notes (kind 1)...');
  final textNoteSub = nostr.relaysService.startEventsSubscription(
    request: NostrRequest(
      filters: [
        NostrFilter(
          kinds: [1],
          limit: 10,
        ),
      ],
    ),
  );

  // Listen to events for a limited time
  final completer = Completer<void>();
  int eventCount = 0;

  final streamSub = textNoteSub.stream.listen((NostrEvent event) {
    eventCount++;
    print('--- Event #$eventCount ---');
    print('  Author:  ${event.pubkey?.substring(0, 16)}...');
    print('  Content: ${(event.content ?? "").length > 80 ? event.content!.substring(0, 80) + "..." : event.content}');
    print('  Created: ${DateTime.fromMillisecondsSinceEpoch((event.createdAt ?? 0) * 1000)}');

    if (eventCount >= 10) {
      completer.complete();
    }
  });

  // Wait for events or timeout after 15 seconds
  await Future.any([
    completer.future,
    Future.delayed(const Duration(seconds: 15)),
  ]);

  print('\nReceived $eventCount events.');
  print('');

  // ---------------------------------------------------------------------------
  // 6. Filtered Subscriptions
  // ---------------------------------------------------------------------------

  // Subscribe to events from a specific author
  print('Subscribing to own events...');
  final authorSub = nostr.relaysService.startEventsSubscription(
    request: NostrRequest(
      filters: [
        NostrFilter(
          authors: [keyPair.public],
          kinds: [1],
          limit: 5,
        ),
      ],
    ),
  );

  // Subscribe to events with a specific hashtag
  print('Subscribing to #nostr hashtag...');
  final hashtagSub = nostr.relaysService.startEventsSubscription(
    request: NostrRequest(
      filters: [
        NostrFilter(
          t: ['nostr'],  // NIP-12 generic tag query
          kinds: [1],
          limit: 10,
        ),
      ],
    ),
  );

  // Multiple filters in one subscription (OR logic)
  final combinedSub = nostr.relaysService.startEventsSubscription(
    request: NostrRequest(
      filters: [
        NostrFilter(kinds: [1], limit: 10),     // text notes
        NostrFilter(kinds: [7], limit: 10),     // reactions
        NostrFilter(kinds: [30023], limit: 5),  // long-form content
      ],
    ),
  );

  // Let subscriptions run briefly
  await Future.delayed(const Duration(seconds: 5));

  // ---------------------------------------------------------------------------
  // 7. NIP-05 Verification
  // ---------------------------------------------------------------------------

  print('Verifying NIP-05 identity...');
  try {
    final nip05Result = await nostr.utilsService.verifyNip05(
      internetIdentifier: 'jb55@jb55.com',
    );
    if (nip05Result != null) {
      print('NIP-05 verified: jb55@jb55.com');
    } else {
      print('NIP-05 verification failed.');
    }
  } catch (e) {
    print('NIP-05 lookup error: $e');
  }
  print('');

  // ---------------------------------------------------------------------------
  // 8. NIP-19 Encoding
  // ---------------------------------------------------------------------------

  final noteEncoded = nostr.utilsService.encodeNoteId(textNote.id!);
  print('note1...: $noteEncoded');

  // Decode NIP-19 entities
  // final decoded = nostr.utilsService.decodeNoteId('note1...');
  print('');

  // ---------------------------------------------------------------------------
  // 9. Cleanup
  // ---------------------------------------------------------------------------

  // Close individual subscriptions
  await streamSub.cancel();
  nostr.relaysService.closeEventsSubscription(textNoteSub.subscriptionId);
  nostr.relaysService.closeEventsSubscription(authorSub.subscriptionId);
  nostr.relaysService.closeEventsSubscription(hashtagSub.subscriptionId);
  nostr.relaysService.closeEventsSubscription(combinedSub.subscriptionId);

  print('All subscriptions closed. Done.');
}


// =============================================================================
// Section 2: Alternative -- Using NDK (relaystr/ndk)
// =============================================================================

/// NDK example (higher-level API with inbox/outbox support).
///
/// pubspec.yaml:
///   ndk: ^0.7.1

/*
import 'package:ndk/ndk.dart';

Future<void> ndkExample() async {
  // Initialize with a BIP-340 signer
  final ndk = Ndk(NdkConfig(
    eventSigner: Bip340EventSigner(
      privateKey: 'your_hex_private_key',
      publicKey: 'your_hex_public_key',
    ),
    cache: MemCacheManager(),
  ));

  // Fetch metadata (uses inbox/outbox automatically)
  final metadata = await ndk.metadata.loadMetadata('target_pubkey_hex');
  print('Name: ${metadata?.name}');
  print('About: ${metadata?.about}');

  // Broadcast a text note
  await ndk.broadcast.broadcastTextNote(
    content: 'Hello from NDK!',
  );

  // Query events
  final response = ndk.requests.query(
    filters: [
      Filter(kinds: [1], limit: 20),
    ],
  );

  await for (final event in response.stream) {
    print('${event.pubKey}: ${event.content}');
  }

  // Fetch and display contact list
  final contacts = await ndk.follows.getContactList('pubkey_hex');
  print('Following ${contacts.length} accounts');
}
*/


// =============================================================================
// Section 3: Alternative -- Using dart-nostr (ethicnology/dart-nostr)
// =============================================================================

/// dart-nostr example (lower-level, includes NIP-44 encryption).
///
/// pubspec.yaml:
///   nostr: ^1.4.0

/*
import 'package:nostr/nostr.dart';

void dartNostrExample() {
  // Generate keys
  final keys = Keys.generate();
  print('Public key: ${keys.public}');
  print('Private key: ${keys.secret}');

  // Create and sign an event
  final event = Event.from(
    kind: 1,
    content: 'Hello from dart-nostr!',
    privkey: keys.secret,
    tags: [
      ['t', 'nostr'],
    ],
  );

  print('Serialized event: ${event.serialize()}');

  // Create a subscription request
  final subscriptionId = generate64RandomHexChars();
  final request = Request(subscriptionId, [
    Filter(
      kinds: [1],
      limit: 20,
    ),
  ]);

  print('Serialized request: ${request.serialize()}');

  // NIP-44 encryption (modern standard)
  final recipientKeys = Keys.generate();

  final encrypted = Nip44.encrypt(
    'This is a secret message',
    keys.secret,
    recipientKeys.public,
  );
  print('Encrypted: $encrypted');

  final decrypted = Nip44.decrypt(
    encrypted,
    recipientKeys.secret,
    keys.public,
  );
  print('Decrypted: $decrypted');
}
*/


// =============================================================================
// Section 4: Flutter Widget Example (conceptual)
// =============================================================================

/// A complete Flutter screen showing a Nostr feed.
/// Requires: flutter, dart_nostr, flutter_riverpod

/*
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dart_nostr/dart_nostr.dart';

// Provider for the event feed
final feedProvider = StreamProvider<NostrEvent>((ref) {
  final nostr = Nostr.instance;
  final subscription = nostr.relaysService.startEventsSubscription(
    request: NostrRequest(
      filters: [NostrFilter(kinds: [1], limit: 50)],
    ),
  );
  return subscription.stream;
});

// Collected events
final eventsProvider = StateNotifierProvider<EventsNotifier, List<NostrEvent>>(
  (ref) {
    final notifier = EventsNotifier();
    ref.listen(feedProvider, (prev, next) {
      next.whenData((event) => notifier.addEvent(event));
    });
    return notifier;
  },
);

class EventsNotifier extends StateNotifier<List<NostrEvent>> {
  EventsNotifier() : super([]);

  void addEvent(NostrEvent event) {
    state = [event, ...state].take(200).toList();
  }
}

class NostrFeedScreen extends ConsumerWidget {
  const NostrFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Nostr Feed')),
      body: events.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: events.length,
              itemBuilder: (context, index) {
                final event = events[index];
                return Card(
                  margin: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  child: ListTile(
                    leading: CircleAvatar(
                      child: Text(
                        (event.pubkey ?? '??').substring(0, 2).toUpperCase(),
                      ),
                    ),
                    title: Text(
                      event.content ?? '',
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(
                      '${event.pubkey?.substring(0, 12)}... - '
                      '${DateTime.fromMillisecondsSinceEpoch((event.createdAt ?? 0) * 1000)}',
                    ),
                  ),
                );
              },
            ),
    );
  }
}
*/
