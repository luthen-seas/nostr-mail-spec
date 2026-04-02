# Nostr Library Landscape

A comprehensive overview of Nostr protocol libraries across all programming languages. Each language ecosystem has its own detailed documentation linked below.

---

## Table of Contents

- [Language Ecosystem Index](#language-ecosystem-index)
- [Cross-Language Comparison Matrix](#cross-language-comparison-matrix)
- [The rust-nostr Bindings Family](#the-rust-nostr-bindings-family)
- [Choosing by Use Case](#choosing-by-use-case)
- [NIP Coverage Comparison](#nip-coverage-comparison)

---

## Language Ecosystem Index

### Primary Ecosystems (Full Documentation)

| Language | Guide | Key Libraries | Maturity |
|----------|-------|---------------|----------|
| **Rust** | [rust/README.md](rust/README.md) | rust-nostr/nostr-sdk, nostr-types | Production -- most comprehensive implementation |
| **JavaScript/TypeScript** | [javascript/README.md](javascript/README.md) | nostr-tools, NDK (JS), nostr-dev-kit | Production -- largest ecosystem |
| **Python** | [python/README.md](python/README.md) | python-nostr, pynostr, rust-nostr bindings | Stable |
| **Go** | [go/README.md](go/README.md) | go-nostr (nbd-wtf) | Stable |
| **Kotlin/Android** | [kotlin/README.md](kotlin/README.md) | rust-nostr bindings, NostrPostr, nostr-java, Amethyst/Quartz | Stable |
| **Dart/Flutter** | [dart/README.md](dart/README.md) | NDK (Dart), dart_nostr, dart-nostr, rust-nostr bindings | Stable |
| **Swift/iOS** | [swift/README.md](swift/README.md) | rust-nostr bindings, NostrSDK (Swift) | Stable |

### Other Languages (Concise Guides)

| Language | Guide | Key Libraries |
|----------|-------|---------------|
| **C#/.NET** | [other/csharp.md](other/csharp.md) | NNostr, Nostr.Client, netstr, rust-nostr bindings |
| **Ruby** | [other/ruby.md](other/ruby.md) | wilsonsilva/nostr, dtonon/nostr-ruby |
| **PHP** | [other/php.md](other/php.md) | swentel/nostr-php |
| **C/C++** | [other/c-cpp.md](other/c-cpp.md) | noscrypt, arduino-nostr, nostrduino |
| **Haskell** | [other/haskell.md](other/haskell.md) | nostr.hs |

---

## Cross-Language Comparison Matrix

### Library Features

| Library | Language | Key Gen | Event Sign | Relay Client | Subscriptions | NIP-19 | Encryption | Inbox/Outbox | NIP Count |
|---------|----------|---------|-----------|-------------|---------------|--------|------------|-------------|-----------|
| **rust-nostr/nostr-sdk** | Rust | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | Yes | 60+ |
| **nostr-tools** | JS/TS | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | No | 30+ |
| **NDK (JS)** | JS/TS | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | Yes | 40+ |
| **go-nostr** | Go | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | No | 25+ |
| **python-nostr** | Python | Yes | Yes | Yes | Yes | Yes | NIP-04 | No | 10+ |
| **NDK (Dart)** | Dart | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | Yes | 30+ |
| **dart_nostr** | Dart | Yes | Yes | Yes | Yes | Yes | NIP-04 | No | 40+ |
| **dart-nostr** | Dart | Yes | Yes | No* | No* | Yes | NIP-04, 44 | No | 28 |
| **nostr-java** | Java | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | No | Agnostic |
| **NostrPostr** | Kotlin | Yes | Yes | Yes | Yes | No | NIP-04 | No | 21 |
| **NNostr** | C# | Yes | Yes | Yes | Yes | Yes | NIP-04 | No | 10+ |
| **Nostr.Client** | C# | Yes | Yes | Yes | Yes (Rx) | Yes | NIP-04 | No | 6 |
| **nostr (Ruby)** | Ruby | Yes | Yes | Yes | Yes | Yes | NIP-04 | No | 4 |
| **nostr-php** | PHP | Yes | Yes | Yes | Yes | Yes | NIP-04, 44 | No | 9 |
| **noscrypt** | C | Yes | Yes | No | No | No | NIP-44 | No | 2 (crypto only) |
| **arduino-nostr** | C++ | Yes | Yes | Yes | Yes | No | NIP-04 | No | 2 |
| **nostr.hs** | Haskell | Yes | Yes | Yes | Yes | Yes | No | No | 8 |

\* dart-nostr handles event creation and crypto but does not include a WebSocket relay client -- bring your own.

### Platform Support

| Library | Linux | macOS | Windows | Android | iOS | Web | Embedded |
|---------|-------|-------|---------|---------|-----|-----|----------|
| rust-nostr (native) | Yes | Yes | Yes | -- | -- | WASM | -- |
| rust-nostr (Kotlin) | JVM | JVM | JVM | Yes | -- | -- | -- |
| rust-nostr (Swift) | -- | Yes | -- | -- | Yes | -- | -- |
| rust-nostr (Flutter) | Yes | Yes | Yes | Yes | Yes | Partial | -- |
| rust-nostr (Python) | Yes | Yes | Yes | -- | -- | -- | -- |
| rust-nostr (C#) | Yes | Yes | Yes | -- | -- | -- | -- |
| nostr-tools | Node | Node | Node | RN | RN | Yes | -- |
| NDK (JS) | Node | Node | Node | RN | RN | Yes | -- |
| go-nostr | Yes | Yes | Yes | Gomobile | Gomobile | WASM | -- |
| NDK (Dart) | Yes | Yes | Yes | Yes | Yes | Yes | -- |
| dart_nostr | Yes | Yes | Yes | Yes | Yes | Yes | -- |
| nostr-java | Yes | Yes | Yes | Yes | -- | -- | -- |
| noscrypt | Yes | Yes | Yes | -- | -- | -- | -- |
| arduino-nostr | -- | -- | -- | -- | -- | -- | ESP32 |

---

## The rust-nostr Bindings Family

The [rust-nostr](https://github.com/rust-nostr/nostr) project generates native bindings for multiple languages via [UniFFI](https://github.com/mozilla/uniffi-rs), providing a consistent API across platforms:

```
                    rust-nostr (Rust core)
                           |
              +------------+------------+
              |            |            |
          UniFFI       Dart FFI     WASM
              |            |            |
     +--------+--------+  |     +------+
     |        |        |  |     |
  Kotlin    Swift    C#  Flutter  JS
  (Android) (iOS)  (.NET)      (Web)
```

**Advantages of bindings:**
- 60+ NIP coverage across all target languages
- Single source of truth for protocol logic
- Battle-tested Rust cryptography
- Consistent API -- learn once, use everywhere

**Trade-offs:**
- Alpha stability (breaking API changes expected)
- Larger binary size (includes Rust runtime)
- Harder to debug across FFI boundary
- Build complexity for contributors

---

## Choosing by Use Case

### By Application Type

| Building... | Recommended Stack |
|-------------|-------------------|
| **Mobile app (Android)** | rust-nostr Kotlin bindings or Amethyst's Quartz module |
| **Mobile app (iOS)** | rust-nostr Swift bindings or NostrSDK (Swift) |
| **Mobile app (cross-platform)** | Dart NDK + Flutter |
| **Web client** | nostr-tools or NDK (JS) |
| **Desktop app** | rust-nostr (native Rust, or bindings for your preferred language) |
| **Relay server** | go-nostr, rust-nostr, NNostr, or netstr |
| **Bot / automation** | Python (pynostr), Ruby, or PHP |
| **Backend/API** | Go (go-nostr), Java (nostr-java), or PHP (nostr-php) |
| **IoT / embedded** | arduino-nostr or nostrduino (ESP32) |
| **Crypto library only** | noscrypt (C) |

### By Priority

| Priority | Recommended |
|----------|-------------|
| Maximum NIP coverage | rust-nostr (Rust native or any binding) |
| Smallest dependency footprint | nostr-tools (JS), dart-nostr (Dart), noscrypt (C) |
| Best documentation | nostr-tools, go-nostr, rust-nostr |
| Production-proven | nostr-tools, go-nostr, rust-nostr |
| Fastest time to prototype | nostr-tools (JS), dart_nostr (Dart), python-nostr |
| Type safety | Rust (native), Haskell (nostr.hs), TypeScript (nostr-tools) |
| Inbox/outbox support built-in | NDK (JS), NDK (Dart), rust-nostr |

---

## NIP Coverage Comparison

Coverage of commonly needed NIPs across the major libraries:

| NIP | Description | rust-nostr | nostr-tools | go-nostr | NDK (Dart) | dart_nostr | nostr-java | NNostr |
|-----|-------------|-----------|------------|---------|-----------|-----------|-----------|--------|
| 01 | Basic protocol | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 02 | Contact list | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 04 | Encrypted DM (legacy) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 05 | DNS identity | Yes | Yes | Yes | Yes | Yes | -- | -- |
| 09 | Event deletion | Yes | Yes | Yes | Yes | Yes | Yes | -- |
| 10 | Replies/threads | Yes | Yes | Yes | Yes | Yes | Yes | -- |
| 11 | Relay info | Yes | Yes | Yes | Yes | Yes | -- | -- |
| 13 | Proof of work | Yes | Yes | Yes | -- | Yes | -- | -- |
| 17 | Private DM | Yes | Yes | -- | Yes | -- | -- | -- |
| 19 | Bech32 entities | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 25 | Reactions | Yes | Yes | Yes | Yes | Yes | -- | -- |
| 42 | Relay auth | Yes | Yes | Yes | Yes | -- | -- | -- |
| 44 | Encryption v2 | Yes | Yes | Yes | Yes | -- | Yes | -- |
| 46 | Nostr Connect | Yes | Yes | -- | Yes | -- | -- | -- |
| 47 | Wallet Connect | Yes | Yes | -- | -- | Yes | -- | -- |
| 50 | Search | Yes | Yes | -- | -- | Yes | -- | -- |
| 57 | Zaps | Yes | Yes | Yes | -- | Yes | -- | -- |
| 59 | Gift wrap | Yes | Yes | -- | Yes | -- | -- | -- |
| 65 | Relay list | Yes | Yes | Yes | Yes | -- | -- | -- |

Legend: **Yes** = implemented, **--** = not implemented or unknown.

---

## Contributing

When adding documentation for a new language or library:

1. Create a directory under `libraries/<language>/` for major ecosystems or a file under `libraries/other/<language>.md` for smaller ones
2. Include: repository URL, installation instructions, key API examples, NIP coverage, and when to use
3. Add an example file under `examples/` with complete, runnable code
4. Update this README with the new library in the comparison matrices
