# Desktop Client Catalog

> Comprehensive catalog of Nostr desktop clients for Linux, macOS, and Windows.

---

## Native Desktop Clients

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Gossip** | [mikedilger/gossip](https://github.com/mikedilger/gossip) | Rust/egui | Pioneer of the outbox/gossip relay model. LMDB storage, 70+ settings, Rhai spam scripting. Privacy-focused. See [deep dive](gossip.md). |
| **Notedeck** | [damus-io/notedeck](https://github.com/damus-io/notedeck) | Rust/egui | Multi-column TweetDeck-style browser by the Damus team. Fast native rendering. |
| **Nostria** | [nostria.app](https://nostria.app) | TypeScript | Cross-platform app (Web, Desktop, iOS, Android). Desktop via Electron/Tauri. |
| **More Speech** | [unclebob/more-speech](https://github.com/unclebob/more-speech) | Clojure | By Uncle Bob Martin (author of Clean Code). Functional approach. |
| **futr** | [prolic/futr](https://github.com/prolic/futr) | Haskell | Functional programming approach to Nostr. |
| **loquaz** | [emeceve/loquaz](https://github.com/emeceve/loquaz) | Rust | Encrypted direct message chat client. |
| **OstrichGram** | [ostrichgram.com](https://ostrichgram.com) | C++ | Telegram-style desktop messaging app. |
| **Pretty Good Apps** | [wds4/pretty-good](https://github.com/wds4/pretty-good) | Electron | Reputation and trust-focused client. Web-of-trust experiments. |
| **nostr-relay-tray** | [CodyTseng/nostr-relay-tray](https://github.com/CodyTseng/nostr-relay-tray) | Electron | System tray relay manager. Run a local relay from the menubar. |

---

## Desktop-Capable Cross-Platform Clients

These are primarily web or mobile clients that also offer desktop builds:

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Nostrmo** | [haorendashu/nostrmo](https://github.com/haorendashu/nostrmo) | Dart/Flutter | Multi-platform Flutter client: desktop, mobile, and web. |
| **Nostrid** | [lapulpeta/Nostrid](https://github.com/lapulpeta/Nostrid) | C#/MAUI | .NET MAUI: runs on Windows, macOS, Linux, Android. |
| **Nostur** | [nostur.com](https://nostur.com) | Swift | iOS and macOS native (Apple Silicon). |

---

## TUI / Terminal Clients

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **nostui** | [akiomik/nostui](https://github.com/akiomik/nostui) | Rust | TUI client for terminal users. |
| **nostr_console** | [vishalxl/nostr_console](https://github.com/vishalxl/nostr_console) | Dart | Terminal client with threaded view. |

---

## Key Differentiators

| Client | Relay Model | Storage | UI Toolkit | Unique Strength |
|--------|-------------|---------|-----------|-----------------|
| Gossip | Outbox (NIP-65) | LMDB | egui | Relay-aware fetching, privacy |
| Notedeck | Standard | -- | egui | Multi-column speed, Damus ecosystem |
| More Speech | Standard | -- | Clojure GUI | Clean Code architecture |
| OstrichGram | Standard | -- | Qt/native | Telegram-like messaging UX |

---

## See Also

- [Client overview](../README.md)
- [Gossip deep dive](gossip.md)
- [Web clients](../web/catalog.md)
- [Mobile clients](../mobile/catalog.md)
- [Specialty clients](../specialty/catalog.md)
