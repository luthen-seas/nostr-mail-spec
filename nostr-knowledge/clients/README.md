# Nostr Clients

> Overview of the Nostr client landscape: categories, key players, and links to detailed catalogs.

---

## What Is a Nostr Client

A client is any application that lets users interact with the Nostr network. Clients connect to relays over WebSockets, publish signed events, and subscribe to events matching filters. Unlike centralized platforms, switching clients does not mean losing your identity, followers, or data -- your keypair is your account and your content lives on relays.

---

## Client Categories

### Web Clients
Browser-based applications. No installation required. Range from full social platforms to single-purpose tools.

**Flagship**: Snort, Coracle, noStrudel, Primal, Iris
**Catalog**: [web/catalog.md](web/catalog.md)

### Mobile Clients
Native iOS, Android, and cross-platform apps. These drive the majority of daily Nostr usage.

**Flagship**: Damus (iOS), Amethyst (Android), 0xchat (cross-platform), Primal (cross-platform)
**Catalog**: [mobile/catalog.md](mobile/catalog.md)

### Desktop Clients
Native desktop applications for Linux, macOS, and Windows. Often built in Rust or with web technology wrappers.

**Flagship**: Gossip, Notedeck
**Catalog**: [desktop/catalog.md](desktop/catalog.md)
**Deep dive**: [Gossip architecture](desktop/gossip.md)

### Specialty Clients
Purpose-built for specific use cases: long-form content, git collaboration, marketplaces, media sharing, gaming, and more.

**Catalog**: [specialty/catalog.md](specialty/catalog.md)

### Video and Audio Clients
Livestreaming, audio rooms, video conferencing, and voice messaging over Nostr.

**Notable**: zap.stream (livestreaming), Corny Chat (audio rooms), HiveTalk (video conferencing)

---

## Key Architectural Patterns Across Clients

### Relay Model
- **Fixed relay list**: Client connects to user-configured relays. Simple but fragile. (Early clients.)
- **Outbox model (NIP-65)**: Client fetches from authors' write relays. Resilient and decentralized. (Gossip, Coracle, modern clients.)
- **Caching/CDN**: Primal runs a caching layer that aggregates content, trading decentralization for speed.

### Signing
- **Built-in key management**: Client holds the private key directly. Simplest UX, highest risk.
- **NIP-07 browser extension**: Keys held in browser extension (nos2x, Alby). Client never sees the private key.
- **NIP-46 remote signing**: Keys held on a separate device or service (Amber, nsec.app). Most secure.
- **NIP-55 Android signing**: Android intents for key operations (Amber).

### Libraries Used
- **JavaScript/TypeScript**: nostr-tools (low-level), NDK (high-level SDK with caching and subscription management)
- **Rust**: rust-nostr (comprehensive SDK), nostr-types (used by Gossip)
- **Swift**: nostr-sdk-ios
- **Kotlin**: NostrPostr
- **Dart/Flutter**: dart NDK, dart-nostr
- **Go**: go-nostr

---

## Choosing a Client

| Need | Recommendation |
|------|---------------|
| iOS daily driver | Damus or Nos |
| Android daily driver | Amethyst |
| Web, general use | Snort or Primal |
| Power user, bleeding-edge NIPs | noStrudel |
| Relay-aware, privacy-focused | Gossip (desktop) or Coracle (web) |
| Encrypted messaging | 0xchat or Keychat |
| Long-form writing | Habla.news or Highlighter |
| Git collaboration | Gitworkshop |
| Marketplace | Shopstr or Plebeian Market |
| Livestreaming | zap.stream |

---

## Catalogs

- [Web clients](web/catalog.md)
- [Mobile clients](mobile/catalog.md)
- [Desktop clients](desktop/catalog.md)
- [Specialty clients](specialty/catalog.md)
