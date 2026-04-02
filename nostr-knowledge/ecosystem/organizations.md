# Organizations in the NOSTR Ecosystem

> Companies, nonprofits, and organized groups that contribute to or support the NOSTR ecosystem.
> Last updated: 2026-03-31

---

## Funding Organizations

### OpenSats

**Type**: 501(c)(3) nonprofit
**Website**: [opensats.org](https://opensats.org/)
**Role**: The largest funder of NOSTR development

OpenSats administers **The Nostr Fund**, which has distributed over **$10 million** in grants to open-source NOSTR projects since its inception in July 2023. As of early 2026, OpenSats has completed 14+ waves of Nostr-specific grants, funding work across the entire stack: clients, relays, libraries, developer tools, and individual contributors.

**Key activities:**
- **Grant waves**: Approximately monthly rounds of new grants, each funding 3-12 projects
- **Long-Term Support (LTS) grants**: Sustained funding for core contributors including jb55 (Damus/Notedeck), pablof7z (NDK/Olas), hodlbod (Coracle), and others
- **First wave (July 2023)**: Funded Damus, Coracle, Iris, and other early projects
- **Ongoing**: Funds relays, developer libraries, clients, services, and infrastructure
- Approximately a dozen new grants awarded every month across both their Bitcoin and Nostr funds

OpenSats accepts donations in Bitcoin and fiat, and all funded projects must be open source.

---

### Human Rights Foundation (HRF)

**Type**: Nonprofit
**Website**: [hrf.org](https://hrf.org/)
**Role**: Early and critical funder of NOSTR development

HRF's **Bitcoin Development Fund** provided early funding for NOSTR development, recognizing the protocol's potential for censorship-resistant communication and free expression. HRF grants in 2022-2023 helped bootstrap core development at a time when the ecosystem was small.

**Key contributions:**
- Early grants to NOSTR developers and projects
- Advocacy for censorship-resistant communication tools
- Ongoing support through the Bitcoin Development Fund bounty program
- Raised awareness of NOSTR among human rights and free speech communities

---

## Protocol Organization

### Nostr Protocol (GitHub Organization)

**Type**: Open-source community organization
**GitHub**: [github.com/nostr-protocol](https://github.com/nostr-protocol)
**Role**: Maintains the NIP specifications

The nostr-protocol GitHub organization is the canonical home for the NOSTR protocol specifications. It hosts:

- **[nips](https://github.com/nostr-protocol/nips)**: The NIP (Nostr Implementation Possibilities) specifications that define how the protocol works
- **[nostr](https://github.com/nostr-protocol/nostr)**: The original protocol overview and description

The organization is not a company or foundation. NIP changes are proposed through pull requests and discussed openly. There is no formal governance structure; changes are accepted by rough consensus among active contributors and NIP editors. fiatjaf, as protocol creator, has significant influence but no unilateral authority.

---

## Client Companies and Projects

### Damus

**Type**: Company / open-source project
**Website**: [damus.io](https://damus.io/)
**GitHub**: [github.com/damus-io](https://github.com/damus-io)
**Role**: Flagship iOS client, Notedeck desktop client

Damus is the company behind the Damus iOS client and the Notedeck desktop client, led by William Casarin (jb55). Damus's launch on the Apple App Store on January 31, 2023, was a pivotal moment for NOSTR adoption, bringing hundreds of thousands of users to the network.

**Key products:**
- **Damus** (iOS) -- The flagship iOS NOSTR client, written in Swift
- **Notedeck** (Desktop) -- Rust/egui multi-column desktop client, launched alpha November 2024, targeting Linux, macOS, Windows, and Android
- **nostrdb** -- High-performance embedded database for NOSTR events
- **Damus Purple** -- Premium subscription service for additional features

**Challenges**: Apple's restrictions on in-app zapping have limited revenue potential. In late 2024, Casarin indicated the team was shifting focus toward Notedeck as the next-generation client.

---

### Primal

**Type**: Company
**Website**: [primal.net](https://primal.net/)
**GitHub**: [github.com/PrimalHQ](https://github.com/PrimalHQ)
**Role**: Client with caching infrastructure and built-in wallet

Primal is a company that builds a NOSTR client (web, iOS, and Android) alongside significant caching and discovery infrastructure that benefits the broader ecosystem. Primal received investment from Ten31, a Bitcoin-focused venture fund.

**Key products and contributions:**
- **Primal client** -- Cross-platform client (web, iOS, Android) with a built-in Lightning wallet
- **Primal Server** -- Open-source caching, membership, discovery, and media caching services for NOSTR. Connects to relays, collects events in real time, stores them locally, and serves them via WebSocket API
- **Caching infrastructure** -- Reduces load on the relay network, adds content propagation redundancy, enables fast search, and provides spam filtering
- **Analytics** -- Network statistics and trending content
- **Antiprimal** -- A standards-compliant gateway that exposes Primal's caching through standard NIP messages, making it accessible to any NOSTR client

Primal open-sourced its entire product stack, including the caching service, under the MIT license.

---

### Alby

**Type**: Company
**Website**: [getalby.com](https://getalby.com/)
**GitHub**: [github.com/getAlby](https://github.com/getAlby)
**Role**: Lightning wallet with deep NOSTR integration

Alby provides a browser extension and wallet infrastructure that bridges Lightning Network payments and NOSTR. Alby was instrumental in creating and promoting the **Nostr Wallet Connect (NWC)** standard (NIP-47), which has become the primary way NOSTR apps interact with Lightning wallets.

**Key products and contributions:**
- **Alby Browser Extension** -- NIP-07 signer and Lightning wallet for web browsers; allows signing NOSTR events and making Lightning payments from any web client
- **Nostr Wallet Connect (NWC / NIP-47)** -- Protocol for apps to request Lightning payments on behalf of users with granular permissions; Alby was the primary driver of this standard
- **Alby Hub** -- Self-hosted Lightning node management interface
- **Alby JS SDK** ([getAlby/js-sdk](https://github.com/getAlby/js-sdk)) -- NWC and Lightning integration library
- **NWC MCP Server** -- Connects Lightning wallets to LLMs via Model Context Protocol
- **Alby CLI** -- Command-line tool for NWC and Lightning operations

---

### Mutiny Wallet (Shutdown December 2024)

**Type**: Company (shut down)
**Website**: [mutinywallet.com](https://mutinywallet.com/) (archived)
**GitHub**: [github.com/MutinyWallet](https://github.com/MutinyWallet)
**Role**: Bitcoin wallet with NOSTR features (historical)

Mutiny Wallet was a self-custody Bitcoin/Lightning wallet with deep NOSTR integration, including being one of the only self-custody NOSTR zapping wallets. Mutiny received grants from OpenSats for its NOSTR functionality.

**Timeline:**
- Operated through 2023-2024 with strong NOSTR integration
- August 5, 2024: Announced shutdown, citing technical challenges
- October 1, 2024: Disabled receive functionality; users could only withdraw
- December 31, 2024: App shut down and removed from app stores
- Q1 2025: Emergency Kit for data download sunset

The Mutiny team pivoted to **OpenSecret**, a privacy-focused platform for encrypted applications, with **Maple AI** as their first product.

**Legacy contributions:**
- **blastr** ([MutinyWallet/blastr](https://github.com/MutinyWallet/blastr)) -- Cloudflare Workers proxy that broadcasts events to other relays (open source, still available)
- Demonstrated the viability of self-custody zapping on NOSTR

---

### Zapstore

**Type**: Project / open-source
**Website**: [zapstore.dev](https://zapstore.dev/)
**Role**: Decentralized app store built on NOSTR

Zapstore is an open Android app store built on NOSTR where apps are discovered through your social graph, releases are cryptographically verified by developers, and users can pay developers directly with Bitcoin. Created by pablof7z.

**Key features:**
- **No central gatekeeper** -- Anyone can publish without app-store approval
- **Cryptographic verification** -- Each release is signed by its developer
- **Social discovery** -- Apps surface through your NOSTR social graph; you can see recommendations from people you follow
- **Direct payments** -- Developers receive Bitcoin directly with no platform cut
- **APK Publisher** -- Web-based tool for publishing Android apps to NOSTR

**Planned expansion**: MacOS, Linux, and potentially PWA support.

---

## Other Notable Organizations

### Nos.social

**Website**: [nos.social](https://nos.social/)
**GitHub**: [github.com/planetary-social](https://github.com/planetary-social)

Builds the **Nos** iOS client, which focuses on user experience and safety features. Backed by a mission to make decentralized social media accessible and safe.

### Verse (formerly Nos.social PBC)

Develops the **groups_relay** ([verse-pbc/groups_relay](https://github.com/verse-pbc/groups_relay)), a NIP-29 group relay implementation for community features on NOSTR.

### Bitvora

**GitHub**: [github.com/bitvora](https://github.com/bitvora)

Develops relay infrastructure including **HAVEN** (four relays + Blossom media server in one package), **WoT Relay** (web-of-trust filtered relay), and **SW2** (relay with whitelisting).

### YakiHonne

**Website**: [yakihonne.com](https://yakihonne.com/)

A multi-format content platform on NOSTR, supporting articles, flash news, curations, and more. Available on iOS, Android, and web.

### Highlighter

**Website**: [highlighter.com](https://highlighter.com/)

A curation and publishing platform on NOSTR, focused on sharing insights from articles and long-form content.
