# NOSTR Ecosystem Catalog

> Comprehensive catalog of the NOSTR open-source ecosystem.
> Last updated: 2026-03-31
> Primary source: [awesome-nostr](https://github.com/aljazceru/awesome-nostr) + independent research

---

## Table of Contents

- [Protocol and Specifications](#protocol-and-specifications)
- [Relay Implementations](#relay-implementations)
- [Client Applications](#client-applications)
- [Libraries and SDKs](#libraries-and-sdks)
- [Developer Tools](#developer-tools)
- [Bridges and Gateways](#bridges-and-gateways)
- [Infrastructure](#infrastructure)
- [AI and Data Vending Machines](#ai-and-data-vending-machines)
- [Marketplaces and Commerce](#marketplaces-and-commerce)
- [Notable Multi-Tool Authors](#notable-multi-tool-authors)

---

## Protocol and Specifications

| Name | URL | Description |
|------|-----|-------------|
| **NIPs** | [nostr-protocol/nips](https://github.com/nostr-protocol/nips) | The canonical specification documents (Nostr Implementation Possibilities) |
| **nostr** | [nostr-protocol/nostr](https://github.com/nostr-protocol/nostr) | Original protocol overview and description by fiatjaf |
| **awesome-nostr** | [aljazceru/awesome-nostr](https://github.com/aljazceru/awesome-nostr) | Community-curated list of 650+ nostr projects and resources |
| **Nostrbook** | [nostrbook.dev](https://nostrbook.dev) | Comprehensive registry of Nostr documentation |

---

## Relay Implementations

### Rust

| Name | URL | Description |
|------|-----|-------------|
| **nostr-rs-relay** | [sr.ht/~gheartsfield/nostr-rs-relay](https://sr.ht/~gheartsfield/nostr-rs-relay) | Minimalistic relay with SQLite backend; one of the earliest stable implementations |
| **rnostr** | [rnostr/rnostr](https://github.com/rnostr/rnostr) | High-performance relay with RocksDB backend |
| **Chorus** | [mikedilger/chorus](https://github.com/mikedilger/chorus) | Personal/community relay with fine-grained access control |
| **sostr** | [metasikander/s0str](https://github.com/metasikander/s0str) | Private relay written in Rust |

### C++

| Name | URL | Description |
|------|-----|-------------|
| **strfry** | [hoytech/strfry](https://github.com/hoytech/strfry) | High-performance relay backed by LMDB with negentropy sync; widely deployed |
| **cagliostr** | [mattn/cagliostr](https://github.com/mattn/cagliostr) | Speed-focused C++ relay |
| **nostr_client_relay** | [pedro-vicente/nostr_client_relay](https://github.com/pedro-vicente/nostr_client_relay) | C++ engine for building Nostr applications |

### Go

| Name | URL | Description |
|------|-----|-------------|
| **khatru** | [fiatjaf/khatru](https://github.com/fiatjaf/khatru) | THE framework for building custom Go relays; powers many specialized relays |
| **relayer** | [fiatjaf/relayer](https://github.com/fiatjaf/relayer) | Server framework for custom relays (predecessor to khatru) |
| **HAVEN** | [bitvora/haven](https://github.com/bitvora/haven) | Four relays + Blossom media server in one package |
| **WoT relay** | [bitvora/wot-relay](https://github.com/bitvora/wot-relay) | Web-of-trust filtered relay |
| **grain** | [0ceanslim/grain](https://github.com/0ceanslim/grain) | Highly configurable multipurpose relay with MongoDB |
| **Immortal** | [dezh-tech/immortal](https://github.com/dezh-tech/immortal) | Designed for scale and high-load environments |
| **gnost-relay** | [barkyq/gnost-relay](https://github.com/barkyq/gnost-relay) | Go relay implementation |
| **ORLY** | [next.orly.dev](https://next.orly.dev) | Fast relay in Go |
| **nostr-relay** | [mattn/nostr-relay](https://github.com/mattn/nostr-relay) | Simple Go relay |
| **rely** | [pippellia-btc/rely](https://github.com/pippellia-btc/rely) | Go framework for custom relays |
| **Bostr2** | [Yonle/bostr2](https://github.com/Yonle/bostr2) | Bouncer relay aggregator in Go |
| **tandem** | [TheRebelOfBabylon/tandem](https://github.com/TheRebelOfBabylon/tandem) | Community-focused relay |
| **SW2** | [bitvora/sw2](https://github.com/bitvora/sw2) | Relay with read/write whitelisting |
| **Shugur** | [Shugur-Network/relay](https://github.com/Shugur-Network/relay) | High-performance relay |

### TypeScript / JavaScript

| Name | URL | Description |
|------|-----|-------------|
| **nostream** | [Cameri/nostream](https://github.com/Cameri/nostream) | Feature-rich relay with PostgreSQL; formerly nostr-ts-relay |
| **Bostr** | [Yonle/bostr](https://github.com/Yonle/bostr) | Bouncer relay aggregator in NodeJS |
| **nostr-relay-nestjs** | [CodyTseng/nostr-relay-nestjs](https://github.com/CodyTseng/nostr-relay-nestjs) | Clean NestJS architecture, multiple storage backends |
| **Nosflare** | [Spl0itable/nosflare](https://github.com/Spl0itable/nosflare) | Serverless relay on Cloudflare Workers |
| **zooid** | [coracle-social/zooid](https://github.com/coracle-social/zooid) | Multi-tenant relay for communities |
| **nostring** | [xbol0/nostring](https://github.com/xbol0/nostring) | Relay written in Deno |
| **Bucket** | [coracle-social/bucket](https://github.com/coracle-social/bucket) | In-memory relay for testing |

### Python

| Name | URL | Description |
|------|-----|-------------|
| **Nostpy** | [UTXOnly/nost-py](https://github.com/UTXOnly/nost-py) | Easy to deploy and audit Python relay |
| **PyRelay** | [johnny423/pyrelay](https://github.com/johnny423/pyrelay) | Python relay implementation |
| **nostr_relay** | [pobblelabs/nostr_relay](https://code.pobblelabs.org/fossil/nostr_relay) | Python relay |

### Other Languages

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **netstr** | [bezysoftware/netstr](https://github.com/bezysoftware/netstr) | C# | General purpose .NET relay |
| **NNostr** | [Kukks/NNostr](https://github.com/Kukks/NNostr) | C# | .NET relay and library |
| **Nex** | [lebrunel/nex](https://github.com/lebrunel/nex) | Elixir | Scalable relay leveraging OTP |
| **Astro** | [Nostrology/astro](https://github.com/Nostrology/astro) | Elixir | Elixir-based relay |
| **SuperConductor** | [avlo/superconductor](https://github.com/avlo/superconductor) | Java | Spring Boot relay framework |
| **Citrine** | [greenart7c3/Citrine](https://github.com/greenart7c3/Citrine) | Kotlin | Relay on Android devices |
| **Fenrir-s** | [rushmi0/Fenrir-s](https://github.com/rushmi0/Fenrir-s) | Kotlin | Kotlin relay |
| **knostr** | [lpicanco/knostr](https://github.com/lpicanco/knostr) | Kotlin | Kotlin relay with PostgreSQL |
| **Transpher** | [nostriphant/transpher](https://github.com/nostriphant/transpher) | PHP | Experimental PHP relay |
| **Notra** | [lontivero/Nostra](https://github.com/lontivero/Nostra) | F# | F# relay backed by SQLite |
| **me.untethr.nostr-relay** | [atdixon/me.untethr.nostr-relay](https://github.com/atdixon/me.untethr.nostr-relay) | Clojure | Clojure relay |

### Specialized Relays

| Name | URL | Description |
|------|-----|-------------|
| **blastr** | [MutinyWallet/blastr](https://github.com/MutinyWallet/blastr) | Cloudflare Workers proxy that broadcasts to other relays |
| **broadcastr** | [codonaft/broadcastr](https://github.com/codonaft/broadcastr) | Relay that retransmits to other relays |
| **multiplextr** | [coracle-social/multiplextr](https://github.com/coracle-social/multiplextr) | Custom relay for bandwidth savings |
| **nostr-filter-relay** | [atrifat/nostr-filter-relay](https://github.com/atrifat/nostr-filter-relay) | AI-powered content filtering by type and language |
| **Ephemerelay** | [soapbox-pub/ephemerelay](https://gitlab.com/soapbox-pub/ephemerelay) | In-memory relay with no persistent storage |
| **Nerostr** | [pluja/nerostr](https://codeberg.org/pluja/nerostr) | Expensive relay paid with Monero |
| **cfrelay** | [haorendashu/cfrelay](https://github.com/haorendashu/cfrelay) | Personal relay on Cloudflare Workers |
| **NIP-29 Groups Relay** | [max21dev/groups-relay](https://github.com/max21dev/groups-relay) | Group chat relay based on khatru |
| **groups_relay** | [verse-pbc/groups_relay](https://github.com/verse-pbc/groups_relay) | NIP-29 group relay implementation |
| **swarm** | [HiveTalk/swarm](https://github.com/HiveTalk/swarm) | Team relay with additional controls |
| **noshtastic** | [ksedgwic/noshtastic](https://github.com/ksedgwic/noshtastic) | Geo-specific virtual relay |
| **keychat-relay-ext** | [keychat-io/keychat-relay-ext](https://github.com/keychat-io/keychat-relay-ext) | Cashu ecash payments per message |

---

## Client Applications

### Web Clients -- Social / Microblogging

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Snort** | [v0l/snort](https://github.com/v0l/snort) | React | Fast, polished web client at snort.social |
| **Coracle** | [coracle-social/coracle](https://github.com/coracle-social/coracle) | Svelte | Pioneer of outbox model and relay-aware design |
| **Iris** | [irislib/iris-messenger](https://github.com/irislib/iris-messenger) | React | Feature-rich client by early Bitcoin contributor Martti Malmi |
| **noStrudel** | [hzrd149/nostrudel](https://github.com/hzrd149/nostrudel) | React | Power-user client with bleeding-edge NIP support |
| **Primal** | [primal.net](https://primal.net) | Various | Lightning-fast client with analytics and caching CDN |
| **nostter** | [SnowCait/nostter](https://github.com/SnowCait/nostter) | SvelteKit | Twitter-like UI for easy onboarding |
| **Ditto** | [ditto.pub](https://ditto.pub) | TypeScript | Social platform with built-in relay |
| **Rabbit** | [syusui-s/rabbit](https://github.com/syusui-s/rabbit) | TypeScript | TweetDeck-style multi-column client |
| **Jumble** | [CodyTseng/jumble](https://github.com/CodyTseng/jumble) | TypeScript | Relay-feed-centric browsing |
| **Flycat** | [digi-monkey/flycat-web](https://github.com/digi-monkey/flycat-web) | TypeScript | Retro 2000s-style interface |
| **Satellite** | [lovvtide/satellite-web](https://github.com/lovvtide/satellite-web) | TypeScript | Reddit-style threaded discussions |
| **Fevela** | [dtonon/fevela](https://github.com/dtonon/fevela) | TypeScript | Innovative social interface |
| **Lumilumi** | [lumilumi.app](http://lumilumi.app) | TypeScript | Lightweight web client |

### Web Clients -- Long-Form Content

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Habla.news** | [verbiricha/habla.news](https://github.com/verbiricha/habla.news) | Next.js | THE long-form content client (NIP-23) |
| **Highlighter** | [highlighter.com](https://highlighter.com) | TypeScript | Curate and share insights from articles |
| **Pareto** | [pareto.space](https://pareto.space/read) | TypeScript | Publishing ecosystem for citizen journalism |
| **Breefly** | [breefly.social](https://breefly.social) | TypeScript | Low-stimulus article reading environment |
| **Alexandria** | [gc-alexandria](https://github.com/ShadowySupercode/gc-alexandria) | TypeScript | Knowledge base and eReader |
| **notestack** | [notestack.com](https://notestack.com) | TypeScript | Blogging with markdown support |
| **uBlog** | [nodetec/ublog](https://github.com/nodetec/ublog) | TypeScript | Minimalist micro-blogging |
| **Oracolo** | [dtonon/oracolo](https://github.com/dtonon/oracolo) | TypeScript | Minimalist Nostr-powered blog |

### Web Clients -- Chat and Messaging

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **NostrChat.io** | [nostrchat.io](https://nostrchat.io) | TypeScript | Group chats, DMs, and threads |
| **Groups** | [max21dev/groups](https://github.com/max21dev/groups) | TypeScript | NIP-29 group chat client |
| **Blowater** | [blowater.deno.dev](https://blowater.deno.dev) | TypeScript | Desktop-focused chat client |
| **n_cord** | [0n4t3/n_cord](https://github.com/0n4t3/n_cord) | TypeScript | Discord-inspired chat |
| **Denny** | [denostr-lab/denny](https://github.com/denostr-lab/denny) | TypeScript | Secure private group messaging |
| **gupt** | [gupt.app](https://gupt.app) | TypeScript | Instant zero-config chat |
| **nostri.chat** | [nostri.chat](https://nostri.chat) | TypeScript | Embeddable chat widget |

### Web Clients -- Specialty / Niche

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Olas** | [pablof7z/olas](https://github.com/pablof7z/olas) | TypeScript | Instagram-like photo client |
| **LUMINA** | [lumina-rocks/lumina](https://github.com/lumina-rocks/lumina) | TypeScript | Picture-first image feed |
| **Formstr** | [abhay-raizada/nostr-forms](https://github.com/abhay-raizada/nostr-forms) | React | Google Forms alternative |
| **Wired** | [smolgrrr/Wired](https://github.com/smolgrrr/Wired) | TypeScript | Anonymous PoW notes (4chan-style) |
| **zapddit** | [zapddit.com](https://zapddit.com) | TypeScript | Reddit-style topic following |
| **Asknostr** | [asknostr.site](https://asknostr.site) | TypeScript | Q&A platform |
| **Zap Cooking** | [zap.cooking](https://zap.cooking) | TypeScript | Recipe sharing |
| **mapstr** | [mapstr.xyz](https://mapstr.xyz) | TypeScript | Bitcoin merchant map |
| **Bookstr** | [bookstr.xyz](https://bookstr.xyz) | TypeScript | Book discovery and tracking |
| **Memestr** | [memestr.app](https://memestr.app) | TypeScript | Meme sharing hub |
| **wikistr** | [fiatjaf/wikistr](https://github.com/fiatjaf/wikistr) | TypeScript | Wikipedia on Nostr |
| **Pollerama** | [pollerama.fun](https://pollerama.fun) | TypeScript | Polls on Nostr |
| **Sendstr** | [sendstr.com](https://sendstr.com) | TypeScript | Shared clipboard between devices |
| **nosbin** | [nosbin.com](https://nosbin.com) | TypeScript | Pastebin on Nostr |
| **Nostree** | [gzuuus/linktr-nostr](https://github.com/gzuuus/linktr-nostr) | TypeScript | Linktree alternative |
| **Shipyard** | [shipyard.pub](https://shipyard.pub) | TypeScript | Note scheduling and boosting |
| **Meetstr** | [gillohner/meetstr](https://github.com/gillohner/meetstr) | TypeScript | NIP-52 calendar/events |
| **njump** | [fiatjaf/njump](https://github.com/fiatjaf/njump) | Go | Static web gateway for nostr: URIs |
| **Disgus** | [carlitoplatanito/disgus](https://github.com/carlitoplatanito/disgus) | TypeScript | Disqus-like comment widget |
| **Docstr** | [sepehr-safari/docstr](https://github.com/sepehr-safari/docstr) | TypeScript | Collaborative documents |
| **Dtan** | [v0l/dtan](https://github.com/v0l/dtan) | TypeScript | Distributed torrent archive |
| **Listr** | [listr.lol](https://listr.lol) | TypeScript | Create and browse Nostr lists |
| **Blobbi** | [blobbi.pet](https://blobbi.pet) | TypeScript | Virtual pet on Nostr |
| **Treasures** | [treasures.to](https://treasures.to) | TypeScript | Decentralized geocaching |
| **Heya.fund** | [heya.fund](https://heya.fund) | TypeScript | Crowdfunding with Lightning |
| **Jester** | [jesterui/jesterui](https://github.com/jesterui/jesterui) | TypeScript | Chess over Nostr |

### Web Clients -- Git Collaboration

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Gitworkshop** | [DanConwayDev/gitworkshop](https://github.com/DanConwayDev/gitworkshop) | TypeScript | Decentralized GitHub alternative (NIP-34) |
| **gitstr** | [fiatjaf/gitstr](https://github.com/fiatjaf/gitstr) | Go | Git patch workflow via Nostr |
| **gittr** | [arbadacarbaYK/gittr](https://github.com/arbadacarbaYK/gittr) | TypeScript | Decentralized git platform |
| **gitplaza** | [dluvian/gitplaza](https://codeberg.org/dluvian/gitplaza) | Kotlin | Desktop git client for Nostr |

### Mobile Clients -- iOS

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Damus** | [damus-io/damus](https://github.com/damus-io/damus) | Swift | THE flagship iOS client; drove early Nostr adoption |
| **Nos** | [planetary-social/nos](https://github.com/planetary-social/nos) | Swift | UX-focused client with safety features |
| **Nostur** | [nostur.com](https://nostur.com) | Swift | Full-featured iOS/macOS client |
| **Nooti** | [nootti.com](https://nootti.com) | Swift | Cross-posting iOS and iPad client |
| **Tamga** | [erdaltoprak/tamga](https://github.com/erdaltoprak/tamga) | Swift | Offline-first contact manager |
| **Pika** | [sledtools/pika](https://github.com/sledtools/pika) | Swift | E2E encrypted messaging |

### Mobile Clients -- Android

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Amethyst** | [vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst) | Kotlin | THE flagship Android client; extensive NIP support |
| **Voyage** | [dluvian/voyage](https://github.com/dluvian/voyage) | Kotlin | Reddit-like UI for topic browsing |
| **Nostros** | [KoalaSat/nostros](https://github.com/KoalaSat/nostros) | React Native | Android social client |
| **Nosky** | [KotlinGeekDev/Nosky](https://github.com/KotlinGeekDev/Nosky) | Kotlin | Native Android client |
| **Pokey** | [KoalaSat/Pokey](https://github.com/KoalaSat/Pokey) | Kotlin | Push notifications for Android |
| **Spring Browser** | [spring.site](https://spring.site) | Kotlin | Nostr-focused browser |
| **Zemzeme** | [whisperbit-labs/zemzeme-android](https://github.com/whisperbit-labs/zemzeme-android) | Kotlin | Private messaging |

### Mobile Clients -- Cross-Platform

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **0xchat** | [0xchat-app](https://github.com/0xchat-app) | Dart/Flutter | Telegram-like messaging for iOS and Android |
| **Nostrmo** | [haorendashu/nostrmo](https://github.com/haorendashu/nostrmo) | Dart/Flutter | Multi-platform Flutter client |
| **Primal** | [primal.net](https://primal.net) | Various | iOS, Android, and web with built-in wallet |
| **YakiHonne** | [yakihonne.com](https://yakihonne.com) | Various | Multi-format content protocol |
| **Nostrid** | [lapulpeta/Nostrid](https://github.com/lapulpeta/Nostrid) | C#/MAUI | Android, Windows, macOS, Linux |
| **Wherostr** | [mapboss/wherostr_social](https://github.com/mapboss/wherostr_social) | Dart | Geo-social for iOS and Android |
| **Keychat** | [keychat-io/keychat-app](https://github.com/keychat-io/keychat-app) | Dart/Flutter | Signal-protocol encrypted chat |
| **Camelus** | [camelus-hq/camelus](https://github.com/camelus-hq/camelus) | Dart | Simplicity-focused client |

### Desktop Clients

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Notedeck** | [damus-io/notedeck](https://github.com/damus-io/notedeck) | Rust/egui | Multi-column TweetDeck-style browser by Damus team |
| **Gossip** | [mikedilger/gossip](https://github.com/mikedilger/gossip) | Rust/egui | Pioneer of the outbox/gossip relay model |
| **Nostria** | [nostria.app](https://nostria.app) | TypeScript | Cross-platform (Web, Desktop, iOS, Android) |
| **More Speech** | [unclebob/more-speech](https://github.com/unclebob/more-speech) | Clojure | By Uncle Bob Martin (author of Clean Code) |
| **futr** | [prolic/futr](https://github.com/prolic/futr) | Haskell | Functional approach to Nostr |
| **loquaz** | [emeceve/loquaz](https://github.com/emeceve/loquaz) | Rust | Encrypted direct chat |
| **OstrichGram** | [ostrichgram.com](https://ostrichgram.com) | C++ | Telegram-style desktop app |
| **Pretty Good Apps** | [wds4/pretty-good](https://github.com/wds4/pretty-good) | Electron | Reputation and trust focused |
| **nostr-relay-tray** | [CodyTseng/nostr-relay-tray](https://github.com/CodyTseng/nostr-relay-tray) | Electron | System tray relay manager |

### Video and Audio Clients

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **zap.stream** | [v0l/zap-stream-core](https://github.com/v0l/zap-stream-core) | Rust | Interactive livestreaming with zaps |
| **Corny Chat** | [vicariousdrama/cornychat](https://github.com/vicariousdrama/cornychat) | JavaScript | Clubhouse-style audio spaces |
| **HiveTalk** | [hivetalk/hivetalksfu](https://github.com/hivetalk/hivetalksfu) | JavaScript | Real-time video conferencing |
| **nostube** | [flox1an/nostube](https://github.com/flox1an/nostube) | TypeScript | YouTube-like video sharing |
| **Nostr Nests** | [nostrnests/nests](https://github.com/nostrnests/nests) | TypeScript | Audio brainstorming spaces |
| **YakBak** | [fiatjaf/yakbak2](https://github.com/fiatjaf/yakbak2) | TypeScript | Voice message social platform |
| **Divine** | [divinevideo/divine-mobile](https://github.com/divinevideo/divine-mobile) | Dart | Short-form video sharing |

---

## Libraries and SDKs

### Rust

| Name | URL | Description |
|------|-----|-------------|
| **rust-nostr** | [rust-nostr/nostr](https://github.com/rust-nostr/nostr) | Comprehensive SDK with FFI bindings for Python, JS, Kotlin, Swift |
| **nostr_rust** | [0xtlt/nostr_rust](https://github.com/0xtlt/nostr_rust) | Functional Rust implementation |
| **nostr-types** | [mikedilger/nostr-types](https://github.com/mikedilger/nostr-types) | Core type definitions used by Gossip |
| **nostr-bot** | [slaninas/nostr-bot](https://github.com/slaninas/nostr-bot) | Bot development framework |
| **notemine** | [sandwichfarm/notemine](https://github.com/sandwichfarm/notemine) | WASM proof-of-work note miner |
| **noscrypt** | [vnuge/noscrypt](https://github.com/vnuge/noscrypt) | C89 cryptography library (usable from Rust) |
| **mostro-core** | [MostroP2P/mostro-core](https://github.com/MostroP2P/mostro-core) | Common types for Mostro P2P exchange |

### JavaScript / TypeScript

| Name | URL | Description |
|------|-----|-------------|
| **nostr-tools** | [fiatjaf/nostr-tools](https://github.com/fiatjaf/nostr-tools) | THE canonical JS library; used by most web clients |
| **NDK** | [nostr-dev-kit/ndk](https://github.com/nostr-dev-kit/ndk) | High-level SDK with caching, signing, subscription management |
| **rx-nostr** | [penpenpng/rx-nostr](https://github.com/penpenpng/rx-nostr) | RxJS-based reactive relay communication |
| **nostr-fetch** | [jiftechnify/nostr-fetch](https://github.com/jiftechnify/nostr-fetch) | Efficient historical event retrieval |
| **nostr-hooks** | [ostyjs/nostr-hooks](https://github.com/ostyjs/nostr-hooks) | React hooks with NDK integration |
| **nostr-react** | [t4t5/nostr-react](https://github.com/t4t5/nostr-react) | React hooks for Nostr |
| **nostr-connect** | [nostr-connect/connect](https://github.com/nostr-connect/connect) | NIP-46 remote signing SDK |
| **NIP-44** | [paulmillr/nip44](https://github.com/paulmillr/nip44) | Reference NIP-44 encryption implementation |
| **Alby JS SDK** | [getAlby/js-sdk](https://github.com/getAlby/js-sdk) | NWC and Lightning integration |
| **nwcjs** | [supertestnet/nwcjs](https://github.com/supertestnet/nwcjs) | Lightweight Nostr Wallet Connect |
| **paravel** | [coracle-social/paravel](https://github.com/coracle-social/paravel) | Abstract toolkit for relay-aware clients |
| **nostr-relaypool-ts** | [adamritter/nostr-relaypool-ts](https://github.com/adamritter/nostr-relaypool-ts) | Relay pool management |
| **nostr-relay (lib)** | [CodyTseng/nostr-relay](https://github.com/CodyTseng/nostr-relay) | TS library for building relays |
| **nostr-double-ratchet** | [mmalmi/nostr-double-ratchet](https://github.com/mmalmi/nostr-double-ratchet) | Signal-style secure messaging |
| **nostr-social-graph** | [mmalmi/nostr-social-graph](https://github.com/mmalmi/nostr-social-graph) | Social graph computation |
| **nostr-js** | [jb55/nostr-js](https://github.com/jb55/nostr-js) | Early JavaScript implementation |
| **nostr-ts** | [franzos/nostr-ts](https://github.com/franzos/nostr-ts) | TypeScript implementation |
| **nostr-typedef** | [penpenpng/nostr-typedef](https://github.com/penpenpng/nostr-typedef) | TypeScript type definitions |
| **nostr-geotags** | [sandwichfarm/nostr-geotags](https://github.com/sandwichfarm/nostr-geotags) | Geotag generation for events |
| **nip07-awaiter** | [penpenpng/nip07-awaiter](https://github.com/penpenpng/nip07-awaiter) | Safe NIP-07 interface access |
| **@bitmacro/relay-connect** | [bitmacro/relay-connect](https://github.com/bitmacro/relay-connect) | NIP-46 and NIP-07 SDK |

### Python

| Name | URL | Description |
|------|-----|-------------|
| **python-nostr** | [jeffthibault/python-nostr](https://github.com/jeffthibault/python-nostr) | The original Python Nostr library |
| **pynostr** | [holgern/pynostr](https://github.com/holgern/pynostr) | Actively maintained Python library |
| **monstr** | [monty888/monstr](https://github.com/monty888/monstr) | Full-featured Python toolkit |
| **nostrclient** | [duozhutuan/nostrclient](https://github.com/duozhutuan/nostrclient) | Python client library |

### Go

| Name | URL | Description |
|------|-----|-------------|
| **go-nostr** | [fiatjaf/go-nostr](https://github.com/fiatjaf/go-nostr) | THE canonical Go library; used by khatru and most Go relays |
| **mleku/nostr** | [mleku/nostr](https://git.mleku.dev/mleku/nostr) | Performance-focused with hand-written JSON codecs |

### Swift

| Name | URL | Description |
|------|-----|-------------|
| **nostr-sdk-ios** | [nostr-sdk/nostr-sdk-ios](https://github.com/nostr-sdk/nostr-sdk-ios) | Official Swift SDK for Apple platforms |
| **NostrKit** | [cnixbtc/NostrKit](https://github.com/cnixbtc/NostrKit) | Swift library for relay interaction |
| **swift-nostr-client** | [yysskk/swift-nostr-client](https://github.com/yysskk/swift-nostr-client) | Modern async/await Swift library |

### Kotlin

| Name | URL | Description |
|------|-----|-------------|
| **NostrPostr** | [Giszmo/NostrPostr](https://github.com/Giszmo/NostrPostr) | Kotlin library with relay/client support |
| **amberflutter** | [sebdeveloper6952/amberflutter](https://github.com/sebdeveloper6952/amberflutter) | Flutter wrapper for Amber signer |

### Dart / Flutter

| Name | URL | Description |
|------|-----|-------------|
| **dart NDK** | [relaystr/ndk](https://github.com/relaystr/ndk) | Primary Nostr Development Kit for Dart |
| **dart-nostr** | [ethicnology/dart-nostr](https://github.com/ethicnology/dart-nostr) | Dart protocol library |
| **dart_nostr** | [anasfik/nostr](https://github.com/anasfik/nostr) | DX-focused Dart library |
| **flutter_nostr** | [anasfik/flutter_nostr](https://github.com/anasfik/flutter_nostr) | Scalable Flutter Nostr apps |
| **nostr_relay_management** | [anasfik/nostr_relay_management](https://github.com/anasfik/nostr_relay_management) | NIP-86 relay management for Dart |

### Other Languages

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **nostr-java** | [tcheeric/nostr-java](https://github.com/tcheeric/nostr-java) | Java | Primary Java library |
| **nostr-spring-boot-starter** | [theborakompanioni/nostr-spring-boot-starter](https://github.com/theborakompanioni/nostr-spring-boot-starter) | Java | Spring Boot integration |
| **nostr-php** | [swentel/nostr-php](https://github.com/swentel/nostr-php) | PHP | PHP Nostr library |
| **nostr-ruby** | [dtonon/nostr-ruby](https://github.com/dtonon/nostr-ruby) | Ruby | Ruby implementation |
| **nostr (gem)** | [wilsonsilva/nostr](https://github.com/wilsonsilva/nostr) | Ruby | Alternative Ruby gem |
| **NNostr.Client** | [Kukks/NNostr](https://github.com/Kukks/NNostr) | C# | .NET client library |
| **Nostra** | [lontivero/Nostra](https://github.com/lontivero/Nostra) | F# | F# NuGet package |
| **nmostr** | [Gruruya/nmostr](https://github.com/Gruruya/nmostr) | Nim | Nim library |
| **nostr.hs** | [delirehberi/nostr.hs](https://github.com/delirehberi/nostr.hs) | Haskell | Haskell client library |
| **arduino-nostr** | [lnbits/arduino-nostr](https://github.com/lnbits/arduino-nostr) | C++ | Arduino/IoT library |
| **sonos** | [bvcxza/sonos](https://github.com/bvcxza/sonos) | C++ | C++ library and CLI |
| **QNostr** | [Aseman-Land/QNostr](https://github.com/Aseman-Land/QNostr) | C++ | Qt module for Nostr |
| **noscrypt** | [vnuge/noscrypt](https://github.com/vnuge/noscrypt) | C | C89 Nostr cryptography |

---

## Developer Tools

### CLI Tools

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **nak** | [nak.nostr.com](https://nak.nostr.com) | Go | THE Swiss-army-knife CLI by fiatjaf (Nostr Army Knife) |
| **noscl** | [fiatjaf/noscl](https://github.com/fiatjaf/noscl) | Go | Basic CLI client for posting and reading |
| **nostril** | [jb55/nostril](https://github.com/jb55/nostril) | C | Minimal event creation and signing |
| **nostcat** | [blakejakopovic/nostcat](https://github.com/blakejakopovic/nostcat) | Rust | Unix-philosophy cat for relay websockets |
| **nostr-tool** | [0xtrr/nostr-tool](https://github.com/0xtrr/nostr-tool) | Rust | Event generation and publishing |
| **nostr-commander** | [8go/nostr-commander-rs](https://github.com/8go/nostr-commander-rs) | Rust | Full-featured CLI application |
| **ngit-cli** | [DanConwayDev/ngit-cli](https://github.com/DanConwayDev/ngit-cli) | Rust | Git collaboration via Nostr (NIP-34) |
| **nosdump** | [jiftechnify/nosdump](https://github.com/jiftechnify/nosdump) | Go | Relay event dumping |
| **nostr_console** | [vishalxl/nostr_console](https://github.com/vishalxl/nostr_console) | Dart | TUI client with threaded view |
| **nostpy-cli** | [UTXOnly/nostpy-cli](https://github.com/UTXOnly/nostpy-cli) | Python | Python CLI tool |
| **ni.py** | [0n4t3/nipy](https://github.com/0n4t3/nipy) | Python | Post-only CLI client |
| **knob** | [plantimals/knob](https://github.com/plantimals/knob) | Go | Post text files to Nostr |
| **nostui** | [akiomik/nostui](https://github.com/akiomik/nostui) | Rust | TUI client for Nostr |
| **gnost-deflate-client** | [barkyq/gnost-deflate-client](https://github.com/barkyq/gnost-deflate-client) | Go | CLI client with compression |

### Key Management and Signing

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Amber** | [greenart7c3/Amber](https://github.com/greenart7c3/Amber) | Kotlin | THE Android signer (NIP-46, NIP-55) |
| **nsec.app** | [nsec.app](https://nsec.app) | TypeScript | Web-based NIP-46 remote signer |
| **nos2x** | [nickytonline/nos2x](https://github.com/nickytonline/nos2x) | JavaScript | Original NIP-07 browser extension |
| **keystr-rs** | [keystr/keystr-rs](https://github.com/keystr/keystr-rs) | Rust | Desktop key management |
| **nostrame** | [Anderson-Juhasc/nostrame](https://github.com/Anderson-Juhasc/nostrame) | TypeScript | Signer and account management |
| **nip06-cli** | [jaonoctus/nip06-cli](https://github.com/jaonoctus/nip06-cli) | TypeScript | NIP-06 mnemonic generation/restore |
| **nip06-web** | [jaonoctus/nip06-web](https://github.com/jaonoctus/nip06-web) | TypeScript | NIP-06 web interface |
| **nkcli** | [mdzz-club/nkcli](https://github.com/mdzz-club/nkcli) | Go | CLI key management |
| **lnpass** | [lnpass.github.io](https://lnpass.github.io) | TypeScript | Key manager for Lightning and Nostr |
| **BlazeJump.NostrConnect** | [drmikesamy/BlazeJump.NostrConnect](https://github.com/drmikesamy/BlazeJump.NostrConnect) | C# | Android remote signer |

### Debugging, Testing, and Analysis

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **nostrillery** | [Cameri/nostrillery](https://github.com/Cameri/nostrillery) | TypeScript | Relay load testing and benchmarking |
| **nostr-relay-inspector** | [dskvr/nostr-relay-inspector](https://github.com/dskvr/nostr-relay-inspector) | TypeScript | Relay capability inspection |
| **nostr-spam-detection** | [blakejakopovic/nostr-spam-detection](https://github.com/blakejakopovic/nostr-spam-detection) | Python | ML spam detection model |
| **Bucket** | [coracle-social/bucket](https://github.com/coracle-social/bucket) | TypeScript | In-memory test relay |
| **nostr-post-checker** | [koteitan/nostr-post-checker](https://github.com/koteitan/nostr-post-checker) | TypeScript | Verify events exist on relays |
| **Nostr Events Monitor** | [Catrya/Nostr-Events-Monitor](https://github.com/Catrya/Nostr-Events-Monitor) | TypeScript | Web monitor for events |
| **nostreq** | [blakejakopovic/nostreq](https://github.com/blakejakopovic/nostreq) | Rust | Relay event request generator |
| **nostr-wtf** | [LightningK0ala/nostr-wtf](https://github.com/LightningK0ala/nostr-wtf) | TypeScript | Developer tool suite |
| **nostro** | [r3drun3/nostro](https://github.com/r3drun3/nostro) | Go | Nostr OSINT tool |
| **nostrends** | [akiomik/nostrends](https://github.com/akiomik/nostrends) | TypeScript | Trending content dashboard |
| **advanced-nostr-search** | [advancednostrsearch.vercel.app](https://advancednostrsearch.vercel.app) | TypeScript | Advanced note search |

---

## Bridges and Gateways

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Mostr** | [soapbox-pub/mostr](https://gitlab.com/soapbox-pub/mostr) | TypeScript | Nostr <-> Fediverse/ActivityPub bridge |
| **matrix-nostr-bridge** | [8go/matrix-nostr-bridge](https://github.com/8go/matrix-nostr-bridge) | Python | Nostr <-> Matrix bridge |
| **nostrss** | [Asone/nostrss](https://github.com/Asone/nostrss) | Rust | RSS feed broadcaster to Nostr |
| **rssnotes** | [trinidz/rssnotes](https://github.com/trinidz/rssnotes) | Go | RSS/Atom to Nostr relay |
| **atomstr** | [psic4t/atomstr](https://github.com/psic4t/atomstr) | Go | RSS/Atom gateway |
| **smtp-nostr-gateway** | [Cameri/smtp-nostr-gateway](https://github.com/Cameri/smtp-nostr-gateway) | TypeScript | Email to Nostr DMs |
| **Meshtastic bridge** | [geoffwhittington/meshtastic-bridge](https://github.com/geoffwhittington/meshtastic-bridge) | Python | LoRa mesh to Nostr |
| **NostrBridge** | [duozhutuan/NostrBridge](https://github.com/duozhutuan/NostrBridge) | TypeScript | WebSocket message forwarding |
| **granary** | [snarfed/granary](https://github.com/snarfed/granary) | Python | Multi-format conversion (ActivityPub, RSS, Atom) |
| **narr** | [fiatjaf/narr](https://github.com/fiatjaf/narr) | Go | Self-hosted Nostr + RSS reader |
| **Noflux** | [fiatjaf/noflux](https://github.com/fiatjaf/noflux) | Go | Minimalist feed reader |
| **Hugo2Nostr** | [delirehberi/hugo2nostr](https://github.com/delirehberi/hugo2nostr) | Go | Sync Hugo blog to Nostr |
| **nostr-to-rss** | [gustavonmartins/nostr-to-rss](https://github.com/gustavonmartins/nostr-to-rss) | TypeScript | Nostr to RSS |
| **blogsync** | [canostrical/blogsync](https://github.com/canostrical/blogsync) | TypeScript | Self-host blog from notes |
| **Samiz** | [KoalaSat/Samiz](https://github.com/KoalaSat/Samiz) | Kotlin | BLE mesh for offline Nostr |

---

## Infrastructure

### Relay Monitoring and Discovery

| Name | URL | Description |
|------|-----|-------------|
| **nostr.watch** | [nostr.watch](https://nostr.watch) | THE relay monitoring and directory service |
| **nostr.io** | [nostr.io](https://nostr.io) | Network statistics dashboard |
| **navigatr** | [coracle-social/navigatr](https://github.com/coracle-social/navigatr) | Relay discovery utility |
| **nostr registry** | [rsbondi/nostr-registry](https://codeberg.org/rsbondi/nostr-registry) | Database of known relays |
| **nashboard** | [vinliao/nashboard](https://github.com/vinliao/nashboard) | Network dashboard |
| **Amethyst crawler** | [crawler.amethyst.social](https://crawler.amethyst.social) | Event discovery and broadcasting |

### NIP-05 and Identity

| Name | URL | Description |
|------|-----|-------------|
| **nostrcheck-server** | [quentintaranpino/nostrcheck-server](https://github.com/quentintaranpino/nostrcheck-server) | All-in-one: NIP-05, media hosting, relay |
| **nostr.json generator** | [SnowCait/nostr-json-generator](https://github.com/SnowCait/nostr-json-generator) | Generate NIP-05 verification files |
| **nostr.directory** | [pseudozach/nostr.directory](https://github.com/pseudozach/nostr-directory) | Searchable user database |
| **Nostr profile manager** | [metadata.nostr.com](https://metadata.nostr.com) | Profile backup and metadata management |
| **npub.world** | [npub.world](https://npub.world) | Profile search engine |
| **Bech32 for Nostr** | [nostr.xport.top](https://nostr.xport.top/bech32-for-nostr) | Bech32 converter |
| **NAKE** | [tsukemonogit.github.io/nake-website](https://tsukemonogit.github.io/nake-website) | Browser extension for ID conversion |

### Media Hosting

| Name | URL | Description |
|------|-----|-------------|
| **Bloom** | [Letdown2491/bloom](https://github.com/Letdown2491/bloom) | File manager for Blossom and NIP-96 servers |
| **zapstore/server** | [zapstore/server](https://github.com/zapstore/server) | Combined relay and Blossom media server |
| **Servus** | [ibz/servus](https://github.com/ibz/servus) | Self-contained CMS with built-in relay and media |
| **NIP-36 Image Redirector** | [ryogrid/NostrNIP36ImageRedirector](https://github.com/ryogrid/NostrNIP36ImageRedirector) | Reverse proxy for sensitive images |

### Deployment and Hosting

| Name | URL | Description |
|------|-----|-------------|
| **Cloud Seeder** | [ipv6rslimited/cloudseeder](https://github.com/ipv6rslimited/cloudseeder) | One-click relay deployment |
| **nostr-rs-relay-compose** | [vdo/nostr-rs-relay-compose](https://github.com/vdo/nostr-rs-relay-compose) | Docker Compose relay deployment |
| **sovereign-stack** | [sovereign-stack.org](https://www.sovereign-stack.org) | Full sovereign infrastructure deployment |
| **hostr** | [studiokaiji/nostr-webhost](https://github.com/studiokaiji/nostr-webhost) | SPA hosting on Nostr relays |
| **nostr-launch** | [rsbondi/nostr-launch](https://codeberg.org/rsbondi/nostr-launch) | Launch relays and clients |
| **homebrew-nostr** | [nostorg/homebrew-nostr](https://github.com/nostorg/homebrew-nostr) | Homebrew tap for Nostr software |

### Notifications and Broadcasting

| Name | URL | Description |
|------|-----|-------------|
| **nostr-broadcast** | [leesalminen/nostr-broadcast](https://github.com/leesalminen/nostr-broadcast) | Broadcast events between relays |
| **nostr-notification-server** | [mmalmi/nostr-notification-server](https://github.com/mmalmi/nostr-notification-server) | Push notification server |
| **nostr-notify** | [jb55/nostr-notify](https://github.com/jb55/nostr-notify) | Desktop notifications via libnotify |
| **nostr-proxy** | [dolu89/nostr-proxy](https://github.com/dolu89/nostr-proxy) | Multi-relay proxy |
| **http-nostr-publisher** | [getAlby/http-nostr-publisher](https://github.com/getAlby/http-nostr-publisher) | HTTP to Nostr publishing worker |

### Plugins and Integrations

| Name | URL | Description |
|------|-----|-------------|
| **nostr-cln-events** | [jb55/nostr-cln-events](http://git.jb55.com/nostr-cln-events) | Core Lightning plugin for Nostr events |
| **nostrify (CLN)** | [joelklabo/nostrify](https://github.com/joelklabo/nostrify) | Core Lightning Nostr plugin |
| **nostr-simple-publish** | [drupal.org](https://www.drupal.org/project/nostr_simple_publish) | Drupal module for Nostr |
| **Postr For Nostr** | [joel-st/postr-for-nostr](https://github.com/joel-st/postr-for-nostr) | WordPress plugin |
| **NOW** | [Mnpezz/nostr-outbox-for-wordpress](https://github.com/Mnpezz/nostr-outbox-for-wordpress) | WordPress notifications via Nostr |
| **nostr-components** | [saiy2k/nostr-components](https://github.com/saiy2k/nostr-components) | Embed profiles in websites |
| **nostr-share-component** | [tsukemonogit/nostr-share-component](https://tsukemonogit.github.io/nostr-share-component) | Web component for sharing |
| **danmakustr** | [CodyTseng/danmakustr](https://github.com/CodyTseng/danmakustr) | Chrome extension for YouTube comments on Nostr |
| **Nostrobots** | [ocknamo/n8n-nodes-nostrobots](https://github.com/ocknamo/n8n-nodes-nostrobots) | N8N workflow automation nodes |
| **Nostr GitHub Action** | [snow-actions/nostr](https://github.com/snow-actions/nostr) | CI/CD integration |

### Social Graph and Moderation Tools

| Name | URL | Description |
|------|-----|-------------|
| **contact cloud** | [canostrical/contact_cloud](https://github.com/canostrical/contact_cloud) | Discover contact list graph |
| **Nostr Follow Organizer** | [tsukemonogit.github.io/NFO](https://tsukemonogit.github.io/NFO) | Organize follow lists |
| **NostrFlu** | [heguro.github.io/nostr-following-list-util](https://heguro.github.io/nostr-following-list-util) | Collect and resend following lists |
| **following.space** | [callebtc/following.space](https://github.com/callebtc/following.space) | Create and explore follow packs |
| **Mutable** | [mutable.top](https://mutable.top) | Mute list management |
| **Mute-o-Scope** | [mutable.top/mute-o-scope](https://www.mutable.top/mute-o-scope) | Search who is muting you |
| **Contact list backup** | [nostr.xport.top](https://nostr.xport.top/contact-list-backup) | Backup and restore contacts |
| **Clonable** | [mutable.top/clonable](https://www.mutable.top/clonable) | Migrate profile and settings |
| **Chief** | [0xtrr/chief](https://github.com/0xtrr/chief) | Strfry write policy plugin |

---

## AI and Data Vending Machines

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **nostr-filter-relay** | [atrifat/nostr-filter-relay](https://github.com/atrifat/nostr-filter-relay) | TypeScript | AI content classification relay |
| **Clawstr** | [clawstr/clawstr](https://github.com/clawstr/clawstr) | TypeScript | Social network for AI agents |
| **Gravity Swarm MCP** | [antoinedelorme/gravity-swarm-mcp](https://github.com/antoinedelorme/gravity-swarm-mcp) | TypeScript | MCP server for agent reputation |
| **Stacks** | [getstacks.dev](https://getstacks.dev) | TypeScript | AI template sharing marketplace |
| **lightning-memory** | [singularityjason/lightning-memory](https://github.com/singularityjason/lightning-memory) | TypeScript | Decentralized agent memory |
| **cafe-society** | [colealbon/cafe-society](https://github.com/colealbon/cafe-society) | JavaScript | ML training for content filtering |
| **nostr-spam-detection** | [blakejakopovic/nostr-spam-detection](https://github.com/blakejakopovic/nostr-spam-detection) | Python | ML spam detection model |

---

## Marketplaces and Commerce

| Name | URL | Language | Description |
|------|-----|----------|-------------|
| **Shopstr** | [shopstr-eng/shopstr](https://github.com/shopstr-eng/shopstr) | TypeScript | Lightning and Cashu marketplace |
| **Plebeian Market** | [PlebeianTech/plebeian-market](https://github.com/PlebeianTech/plebeian-market) | Python/JS | Self-sovereign marketplace with auctions |
| **LNBits Nostrmarket** | [lnbits/nostrmarket](https://github.com/lnbits/nostrmarket) | Python | LNBits marketplace extension |
| **SatShoot** | [satshoot.com](https://satshoot.com) | TypeScript | Freelancing marketplace |
| **Zapstore** | [zapstore.dev](https://zapstore.dev) | Dart | WoT-based app store |
| **MostroP2P** | [MostroP2P/mostro-core](https://github.com/MostroP2P/mostro-core) | Rust | P2P Bitcoin exchange protocol |
| **P2P band** | [p2p.band](https://p2p.band) | Various | P2P Bitcoin exchanges |
| **Lightning.Pub** | [shocknet/Lightning.Pub](https://github.com/shocknet/Lightning.Pub) | Go | Lightning node management daemon |
| **Bold Wallet** | [BoldBitcoinWallet/BoldWallet](https://github.com/BoldBitcoinWallet/BoldWallet) | Various | Bitcoin wallet with MPC TSS |

---

## Notable Multi-Tool Authors

These individuals and organizations have built multiple significant tools across the Nostr ecosystem:

### fiatjaf (creator of Nostr)
- **nostr-tools** (JS library), **go-nostr** (Go library), **khatru** (relay framework), **relayer** (relay framework), **nak** (CLI), **noscl** (CLI), **njump** (web gateway), **wikistr** (wiki client), **gitstr** (git patches), **narr** (RSS reader), **noflux** (feed reader), **yakbak2** (voice), and many more

### jb55 (Will Casarin, Damus creator)
- **Damus** (iOS client), **Notedeck** (desktop client), **nostril** (C CLI), **nostr-js** (JS library), **nostr-notify** (notifications), **nostr-cln-events** (CLN plugin)

### Cameri
- **nostream** (relay), **nostrillery** (benchmarking), **nostr-fzf** (search), **smtp-nostr-gateway** (bridge)

### pablof7z
- **NDK** (development kit), **Olas** (image client), various NIP proposals

### vitorpamplona
- **Amethyst** (Android client), Amethyst crawler, extensive NIP implementations

### coracle-social
- **Coracle** (web client), **paravel** (toolkit), **navigatr** (relay discovery), **zooid** (multi-tenant relay), **bucket** (test relay), **multiplextr** (proxy relay)

### v0l (Kieran)
- **Snort** (web client), **zap.stream** (livestreaming), **dtan** (torrents)

### mikedilger
- **Gossip** (desktop client), **Chorus** (relay), **nostr-types** (Rust types)

### CodyTseng
- **nostr-relay-nestjs** (relay), **nostr-relay** (TS library), **jumble** (web client), **nostr-relay-tray** (tray app), **danmakustr** (Chrome extension)

### hzrd149
- **noStrudel** (web client) - known for bleeding-edge NIP support

### KoalaSat
- **Nostros** (Android client), **Pokey** (notifications), **Samiz** (BLE mesh)

### greenart7c3
- **Amber** (Android signer), **Citrine** (Android relay)

### sepehr-safari
- **Pinstr**, **Docstr**, **nostribe-web-client**, **nostr-playground**, **mkpinja**, **pinja**

### bitvora
- **HAVEN** (relay stack), **WoT relay**, **SW2** (whitelisted relay)

### mmalmi (Martti Malmi, early Bitcoin contributor)
- **Iris** (web client), **nostr-double-ratchet** (encryption), **nostr-social-graph**, **nostr-notification-server**

---

## Quick Reference: Critical Repos

The absolute must-know repositories for any Nostr developer:

| Category | Repo | Why |
|----------|------|-----|
| Spec | [nostr-protocol/nips](https://github.com/nostr-protocol/nips) | The protocol specification |
| JS Library | [fiatjaf/nostr-tools](https://github.com/fiatjaf/nostr-tools) | Standard JS library |
| JS SDK | [nostr-dev-kit/ndk](https://github.com/nostr-dev-kit/ndk) | High-level development kit |
| Go Library | [fiatjaf/go-nostr](https://github.com/fiatjaf/go-nostr) | Standard Go library |
| Rust Library | [rust-nostr/nostr](https://github.com/rust-nostr/nostr) | Standard Rust library with FFI |
| Relay Framework | [fiatjaf/khatru](https://github.com/fiatjaf/khatru) | Build custom relays in Go |
| Relay | [hoytech/strfry](https://github.com/hoytech/strfry) | Most deployed relay |
| CLI | [nak.nostr.com](https://nak.nostr.com) | Essential dev/debug tool |
| iOS Client | [damus-io/damus](https://github.com/damus-io/damus) | Flagship iOS |
| Android Client | [vitorpamplona/amethyst](https://github.com/vitorpamplona/amethyst) | Flagship Android |
| Web Client | [v0l/snort](https://github.com/v0l/snort) | Top web client |
| Signer | [greenart7c3/Amber](https://github.com/greenart7c3/Amber) | Android key management |
