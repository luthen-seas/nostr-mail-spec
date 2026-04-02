# Key People in the NOSTR Ecosystem

> Notable contributors who have shaped the NOSTR protocol and ecosystem.
> Only includes publicly known information about public figures in the NOSTR space.
> Last updated: 2026-03-31

---

## Protocol Creator

### fiatjaf (Andre)

**Role**: Creator of the NOSTR protocol

fiatjaf is the pseudonymous Brazilian developer who created NOSTR in 2020. He wrote the original protocol specification as a response to perceived moderation issues on centralized social platforms. Beyond the protocol itself, fiatjaf is one of the most prolific developers in the ecosystem, maintaining core infrastructure that much of the network depends on.

**Key projects:**
- **NOSTR protocol** -- The original specification and protocol design
- **nostr-tools** ([fiatjaf/nostr-tools](https://github.com/fiatjaf/nostr-tools)) -- The canonical JavaScript library, used by most web clients
- **go-nostr** ([fiatjaf/go-nostr](https://github.com/fiatjaf/go-nostr)) -- The canonical Go library, used by khatru and most Go relays
- **khatru** ([fiatjaf/khatru](https://github.com/fiatjaf/khatru)) -- The framework for building custom Go relays; powers many specialized relays
- **nak** ([nak.nostr.com](https://nak.nostr.com)) -- The "Nostr Army Knife" CLI tool, the Swiss-army-knife for debugging and interacting with NOSTR
- **njump** ([fiatjaf/njump](https://github.com/fiatjaf/njump)) -- Static web gateway for rendering nostr: URIs on the web
- **wikistr** ([fiatjaf/wikistr](https://github.com/fiatjaf/wikistr)) -- Wikipedia-style wiki on NOSTR
- **relayer** ([fiatjaf/relayer](https://github.com/fiatjaf/relayer)) -- Predecessor to khatru
- **noscl**, **gitstr**, **yakbak** -- Additional tools and experimental clients

**GitHub**: [github.com/fiatjaf](https://github.com/fiatjaf)

---

## Core Client Developers

### jb55 (William Casarin)

**Role**: Creator of Damus and nostrdb

William Casarin is a Canadian developer who built Damus, the flagship iOS NOSTR client that drove massive early adoption when it launched on the Apple App Store on January 31, 2023. He is also building the next generation of NOSTR client infrastructure.

**Key projects:**
- **Damus** ([damus-io/damus](https://github.com/damus-io/damus)) -- The flagship iOS client; its App Store launch was a watershed moment for NOSTR adoption
- **Notedeck** ([damus-io/notedeck](https://github.com/damus-io/notedeck)) -- Rust/egui multi-column desktop client (TweetDeck-style), launched alpha November 2024
- **nostrdb** -- High-performance embedded database for NOSTR events, written in C
- **nostril** ([jb55/nostril](https://github.com/jb55/nostril)) -- Minimal C tool for event creation and signing

**GitHub**: [github.com/jb55](https://github.com/jb55)
**OpenSats**: Long-Term Support (LTS) grantee

---

### Vitor Pamplona

**Role**: Creator of Amethyst

Vitor Pamplona is a Brazilian developer who built Amethyst, widely considered the most feature-complete Android NOSTR client. Amethyst implements a vast number of NIPs and is often the first client to support experimental features.

**Key projects:**
- **Amethyst** ([vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst)) -- The flagship Android client with extensive NIP support, written in Kotlin
- Active contributor to NIP discussions and protocol evolution

**GitHub**: [github.com/vitorpamplona](https://github.com/vitorpamplona)

---

### Mike Dilger

**Role**: Creator of Gossip client, outbox model pioneer

Mike Dilger is the developer behind Gossip, a Rust desktop client that pioneered the outbox (gossip) relay model -- a fundamental approach to relay discovery and event routing that has become a best practice across the ecosystem.

**Key projects:**
- **Gossip** ([mikedilger/gossip](https://github.com/mikedilger/gossip)) -- Rust/egui desktop client, pioneer of relay-aware outbox model
- **nostr-types** ([mikedilger/nostr-types](https://github.com/mikedilger/nostr-types)) -- Core Rust type definitions for NOSTR
- **Chorus** ([mikedilger/chorus](https://github.com/mikedilger/chorus)) -- Personal/community relay with fine-grained access control

**GitHub**: [github.com/mikedilger](https://github.com/mikedilger)

---

### Pablo Fernandez (pablof7z)

**Role**: Creator of NDK and prolific ecosystem builder

Pablo Fernandez is one of the most prolific developers in the NOSTR ecosystem. He created NDK (Nostr Development Kit), which has become the standard high-level SDK for building NOSTR applications in JavaScript/TypeScript. He is also behind multiple innovative clients and tools.

**Key projects:**
- **NDK** ([nostr-dev-kit/ndk](https://github.com/nostr-dev-kit/ndk)) -- High-level JavaScript/TypeScript SDK with caching, signing, and subscription management; used by many web clients
- **Olas** ([pablof7z/olas](https://github.com/pablof7z/olas)) -- Instagram-like photo sharing client
- **Zapstore** ([zapstore.dev](https://zapstore.dev)) -- Decentralized app store built on NOSTR
- Numerous other ecosystem tools and experimental projects

**GitHub**: [github.com/pablof7z](https://github.com/pablof7z)
**OpenSats**: Long-Term Support (LTS) grantee

---

## Web Client Developers

### Kieran

**Role**: Creator of Snort

Kieran built Snort, a fast and polished React-based web client available at snort.social. Snort was one of the early web clients and helped establish NOSTR's web presence.

**Key projects:**
- **Snort** ([v0l/snort](https://github.com/v0l/snort)) -- Fast React web client at snort.social
- **zap.stream** ([v0l/zap-stream-core](https://github.com/v0l/zap-stream-core)) -- Interactive livestreaming platform with zaps
- **void.cat** -- File hosting service used across the NOSTR ecosystem
- **Dtan** ([v0l/dtan](https://github.com/v0l/dtan)) -- Distributed torrent archive on NOSTR

**GitHub**: [github.com/v0l](https://github.com/v0l)

---

### hodlbod

**Role**: Creator of Coracle

hodlbod built Coracle, a Svelte-based web client that was a pioneer of the outbox model and relay-aware design. Coracle focuses on intelligent relay management and has been influential in how clients think about relay selection.

**Key projects:**
- **Coracle** ([coracle-social/coracle](https://github.com/coracle-social/coracle)) -- Svelte web client, pioneer of outbox model and relay-aware design
- **paravel** ([coracle-social/paravel](https://github.com/coracle-social/paravel)) -- Abstract toolkit for building relay-aware clients
- **multiplextr** ([coracle-social/multiplextr](https://github.com/coracle-social/multiplextr)) -- Custom relay for bandwidth savings
- **zooid** ([coracle-social/zooid](https://github.com/coracle-social/zooid)) -- Multi-tenant relay for communities
- **bucket** ([coracle-social/bucket](https://github.com/coracle-social/bucket)) -- In-memory relay for testing

**GitHub**: [github.com/coracle-social](https://github.com/coracle-social)
**OpenSats**: Long-Term Support (LTS) grantee

---

### hzrd149

**Role**: Creator of noStrudel

hzrd149 built noStrudel, a power-user web client with bleeding-edge NIP support. noStrudel is known for implementing new NIPs quickly and providing advanced features for technically inclined users.

**Key projects:**
- **noStrudel** ([hzrd149/nostrudel](https://github.com/hzrd149/nostrudel)) -- React power-user web client with extensive NIP support
- Various tools and relay experiments

**GitHub**: [github.com/hzrd149](https://github.com/hzrd149)

---

## Infrastructure Developers

### Cameri

**Role**: Creator of nostream relay

Cameri created nostream, a feature-rich TypeScript relay implementation backed by PostgreSQL (formerly nostr-ts-relay). Nostream was one of the most widely deployed relay implementations in the early NOSTR ecosystem.

**Key projects:**
- **nostream** ([Cameri/nostream](https://github.com/Cameri/nostream)) -- Feature-rich TypeScript/PostgreSQL relay
- **nostrillery** -- Load testing tool for NOSTR relays

**GitHub**: [github.com/Cameri](https://github.com/Cameri)

---

## Other Notable Contributors

### Martti Malmi (sirius)
Early Bitcoin contributor who built **Iris** ([irislib/iris-messenger](https://github.com/irislib/iris-messenger)), a feature-rich React web client. Also developed nostr-social-graph and nostr-double-ratchet libraries.

### Doug Hoyte (hoytech)
Creator of **strfry** ([hoytech/strfry](https://github.com/hoytech/strfry)), a high-performance C++ relay backed by LMDB with negentropy sync support. Strfry is one of the most widely deployed relay implementations.

### Yuki Kishimoto
Primary developer of **rust-nostr** ([rust-nostr/nostr](https://github.com/rust-nostr/nostr)), a comprehensive Rust SDK with FFI bindings for Python, JavaScript, Kotlin, and Swift.

### Alex Gleason (soapbox)
Creator of **Ditto** ([ditto.pub](https://ditto.pub)), a social platform with a built-in relay, and **Mostr**, a bridge between NOSTR and the ActivityPub/Fediverse ecosystem.

### Robert Martin (Uncle Bob)
Author of Clean Code, who built **More Speech** ([unclebob/more-speech](https://github.com/unclebob/more-speech)), a Clojure-based NOSTR client.

### DanConwayDev
Creator of **Gitworkshop** ([DanConwayDev/gitworkshop](https://github.com/DanConwayDev/gitworkshop)) and **ngit-cli**, tools for decentralized Git collaboration over NOSTR (NIP-34).

### Aljaz Ceru
Maintains the **awesome-nostr** repository ([aljazceru/awesome-nostr](https://github.com/aljazceru/awesome-nostr)), the community-curated catalog of 650+ NOSTR projects.

### greenart7c3
Creator of **Citrine** ([greenart7c3/Citrine](https://github.com/greenart7c3/Citrine)), a relay that runs on Android devices, and **Amber**, a NOSTR signer app for Android.

### CodyTseng
Creator of **nostr-relay-nestjs** ([CodyTseng/nostr-relay-nestjs](https://github.com/CodyTseng/nostr-relay-nestjs)), a clean NestJS relay, **Jumble** web client, and **nostr-relay-tray** system tray relay manager.

---

## Note on npubs

Public keys (npubs) for these contributors can be found by searching for them on any NOSTR client (e.g., [njump.me](https://njump.me), [nostr.com](https://nostr.com), or [primal.net](https://primal.net)). Since npubs are long and change representation based on encoding, we recommend looking them up directly rather than relying on a static list.
