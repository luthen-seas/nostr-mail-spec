# NOSTR Protocol Overview

> **Notes and Other Stuff Transmitted by Relays**
>
> The simplest open protocol that is able to create a censorship-resistant global social network.

---

## Table of Contents

- [What is NOSTR?](#what-is-nostr)
- [Origin and History](#origin-and-history)
- [Design Philosophy](#design-philosophy)
- [Core Architecture](#core-architecture)
- [Why NOSTR Matters](#why-nostr-matters)
- [How NOSTR Compares to Other Protocols](#how-nostr-compares-to-other-protocols)
- [The NIP System](#the-nip-system)
- [Quick Start: Core Concepts](#quick-start-core-concepts)
- [Protocol Data Flow](#protocol-data-flow)
- [Further Reading](#further-reading)

---

## What is NOSTR?

NOSTR is an open, decentralized protocol for transmitting signed data between users through relay servers over WebSocket connections. It was designed as a minimalist alternative to centralized social media platforms, though its application extends far beyond microblogging to encompass messaging, marketplaces, long-form publishing, code collaboration, livestreaming, and more.

At its core, NOSTR is not a platform or an application. It is a **protocol** — analogous to email (SMTP), the web (HTTP), or RSS — that defines how clients and relays communicate. Multiple interoperable applications implement the same standard, each offering different interfaces and features while sharing the same underlying social graph and data.

The protocol achieves its goals through three fundamental properties:

1. **Decentralization** — It does not rely on any trusted central server, making it resilient against single points of failure and censorship.
2. **Cryptographic integrity** — It is based on public-key cryptography and digital signatures (secp256k1 Schnorr signatures per BIP-340), making all data tamperproof and author-verifiable.
3. **Simplicity** — It does not rely on peer-to-peer networking, distributed hash tables, blockchains, or consensus mechanisms. It uses plain WebSocket connections to simple servers.

---

## Origin and History

NOSTR was created by **fiatjaf** (pseudonym) in late 2020. The initial protocol design was deliberately minimal: a single event format, signed with Schnorr signatures, passed between clients and relays over WebSocket connections. The first specification (NIP-01) was published in the `nostr-protocol/nips` GitHub repository.

The protocol gained significant traction in late 2022 and early 2023, catalyzed by growing concerns about centralized platform censorship and a wave of interest from the Bitcoin community (NOSTR uses the same elliptic curve, secp256k1, as Bitcoin). Jack Dorsey, co-founder of Twitter, contributed funding to NOSTR development through the OpenSats organization.

Key milestones:

- **2020**: fiatjaf publishes the initial NOSTR protocol concept and NIP-01 specification.
- **2021-2022**: Early relay and client implementations emerge. The NIP process formalizes protocol extensions.
- **Late 2022**: Damus (iOS), Amethyst (Android), and several web clients launch. User growth accelerates.
- **2023**: Lightning Network integration via Zaps (NIP-57). Nostr Wallet Connect (NIP-47). Major relay infrastructure scaling.
- **2024**: NIP-44 versioned encryption. Gift Wrap (NIP-59) for metadata-private messaging. Data Vending Machines (NIP-90). Blossom (NIP-B7) for decentralized file storage.
- **2025**: Continued protocol maturation. MLS group messaging, relay-based groups (NIP-29), and expanded application-layer NIPs.

---

## Design Philosophy

NOSTR's design philosophy can be summarized as: **do the simplest thing that works, and let the edges of the network handle complexity.**

### Radical Simplicity

The entire core protocol fits in a single specification document (NIP-01). An event is a JSON object with seven fields. The relay protocol has three client message types and four relay message types. There is no registration, no account creation, no handshake beyond a WebSocket connection. A developer can build a minimal working client in an afternoon.

### Cryptographic Identity, Not Server-Based Identity

Your identity is your keypair. A NOSTR identity is a secp256k1 keypair: the private key (displayed as `nsec`) signs events, and the public key (displayed as `npub`) identifies you. There is no username registration, no email verification, no server-side account. If you have your private key, you are you — on any client, connected to any relay, anywhere in the world.

This means:

- **Account portability is absolute.** Switch clients or relays at will; your identity follows your key.
- **No one can impersonate you** without your private key, because every event carries a cryptographic signature that any party can verify independently.
- **No one can ban your identity** from the network, only from specific relays. You can always publish elsewhere.

### Dumb Relays, Smart Clients

Relays are intentionally simple. They store events and serve them in response to filter queries. They do not run consensus algorithms, they do not federate with each other (by default), and they do not interpret content semantics. The intelligence lives in the client: which relays to connect to, how to discover users across relays, how to render different event kinds, how to manage encryption, and how to present the user experience.

This architecture means:

- **Relays are cheap to run.** A relay can be a single binary with a database, hosted on minimal infrastructure.
- **Relays are replaceable.** If a relay goes offline or becomes hostile, clients simply connect to others.
- **Innovation happens at the client layer** without requiring relay upgrades for every new feature.

### Extensibility Through NIPs

The protocol grows through NIPs (Nostr Implementation Possibilities) — community-authored specification documents that define new event kinds, tag semantics, relay behaviors, and client features. NIPs are optional: clients and relays implement the ones they need. There is no mandatory upgrade path and no breaking changes to the core protocol.

---

## Core Architecture

NOSTR has four fundamental components: **keys**, **events**, **relays**, and **clients**.

### Keys

Every NOSTR user is identified by a secp256k1 keypair:

- **Private key** (`nsec`): A 256-bit secret scalar used to sign events. This is the user's ultimate credential. Possession of the private key IS the identity.
- **Public key** (`npub`): The corresponding 256-bit x-only public key (per BIP-340). This is the user's public identifier, used by others to verify signatures and follow/reference the user.

Key representation:

| Format | Encoding | Used In | Defined By |
|--------|----------|---------|------------|
| Hex | 64-character hexadecimal string | Protocol messages, event JSON, relay communication | NIP-01 |
| Bech32 | npub1.../nsec1... | User display, QR codes, sharing, nostr: URIs | NIP-19 |
| NIP-05 | user@domain.com | Human-readable discovery (resolves to hex pubkey via DNS) | NIP-05 |
| NIP-49 | ncryptsec1... | Encrypted private key export/backup | NIP-49 |

Key management options:

- **Raw key handling**: Client holds the private key directly.
- **Browser extension signing** (NIP-07): A browser extension (e.g., nos2x, Alby) holds the key and signs events on behalf of the client.
- **Remote signing** (NIP-46): A separate signer application (e.g., nsec.app, Amber) holds the key and communicates with the client over NOSTR itself.
- **Android signer** (NIP-55): Android intent-based signing delegation.
- **Mnemonic seed** (NIP-06): BIP-39 mnemonic phrase derivation for key backup (derivation path `m/44'/1237'/0'/0/0`).

### Events

The **event** is the single universal data unit in NOSTR. Everything — text notes, profile metadata, follow lists, reactions, encrypted messages, long-form articles, marketplace listings, zap receipts — is an event.

An event is a JSON object with exactly these fields:

```json
{
  "id": "<32-byte SHA-256 hex of the serialized event>",
  "pubkey": "<32-byte hex public key of the event creator>",
  "created_at": "<Unix timestamp in seconds>",
  "kind": "<integer identifying the event type>",
  "tags": [["<tag name>", "<value>", "<optional additional values>..."]],
  "content": "<arbitrary string>",
  "sig": "<64-byte Schnorr signature hex of the event id>"
}
```

**Event ID computation**: The `id` is the SHA-256 hash of the canonical serialization: `[0, pubkey, created_at, kind, tags, content]` serialized as a JSON array with no whitespace.

**Event kinds** determine semantics. Key categories:

| Kind Range | Category | Behavior |
|------------|----------|----------|
| 0 | Metadata | Replaceable (latest wins) |
| 1 | Short text note | Regular (all stored) |
| 2 | Relay recommendations | Regular (deprecated) |
| 3 | Follow list | Replaceable |
| 4 | Encrypted DM | Regular (deprecated, use NIP-17) |
| 5 | Deletion | Regular |
| 6 | Repost | Regular |
| 7 | Reaction | Regular |
| 1000-9999 | Regular events | All stored |
| 10000-19999 | Replaceable events | Latest per pubkey+kind wins |
| 20000-29999 | Ephemeral events | Not stored by relays |
| 30000-39999 | Parameterized replaceable | Latest per pubkey+kind+d-tag wins |

**Tags** are the structured metadata system. Common tags:

- `["e", "<event-id>", "<relay-url>", "<marker>"]` — Reference to another event
- `["p", "<pubkey>", "<relay-url>"]` — Reference to a user
- `["a", "<kind>:<pubkey>:<d-tag>", "<relay-url>"]` — Reference to a replaceable event
- `["d", "<identifier>"]` — Identifier for parameterized replaceable events
- `["t", "<hashtag>"]` — Hashtag
- `["r", "<url>"]` — URL reference
- `["nonce", "<nonce>", "<target-difficulty>"]` — Proof of work (NIP-13)

### Relays

Relays are WebSocket servers that accept events from clients, store them, and serve them back in response to subscription filters. They are the distribution infrastructure of NOSTR.

**What relays do:**

- Accept `EVENT` messages from clients (publish)
- Accept `REQ` messages with filters (subscribe)
- Send matching events to subscribers
- Send `EOSE` (End of Stored Events) to indicate historical events have been sent
- Send `OK` to acknowledge event receipt (success or failure with reason)
- Optionally require authentication (NIP-42)
- Optionally serve a relay information document at the HTTP endpoint (NIP-11)

**Relay protocol messages:**

| Direction | Message | Format | Purpose |
|-----------|---------|--------|---------|
| Client to Relay | `EVENT` | `["EVENT", <event>]` | Publish an event |
| Client to Relay | `REQ` | `["REQ", <sub-id>, <filter>, ...]` | Subscribe to events matching filters |
| Client to Relay | `CLOSE` | `["CLOSE", <sub-id>]` | Close a subscription |
| Relay to Client | `EVENT` | `["EVENT", <sub-id>, <event>]` | Send a matching event |
| Relay to Client | `OK` | `["OK", <event-id>, <bool>, <message>]` | Acknowledge event publication |
| Relay to Client | `EOSE` | `["EOSE", <sub-id>]` | End of stored events marker |
| Relay to Client | `CLOSED` | `["CLOSED", <sub-id>, <message>]` | Subscription was closed by relay |

**Subscription filters** specify which events a client wants:

```json
{
  "ids": ["<event-id-prefix>..."],
  "authors": ["<pubkey-prefix>..."],
  "kinds": [1, 6, 7],
  "#e": ["<event-id>..."],
  "#p": ["<pubkey>..."],
  "since": 1700000000,
  "until": 1700100000,
  "limit": 100
}
```

**Relay independence and policies:**

- Anyone can run a relay with their own rules (free, paid, invite-only, topic-specific).
- Relays can refuse to store certain events, but they cannot forge or modify events (signatures would become invalid).
- If a relay disappears, the data it stored may be lost unless replicated elsewhere. Clients typically connect to multiple relays for redundancy.
- Relays do not need to communicate with each other (though some implement syncing via NIP-77 Negentropy).

### Clients

Clients are user-facing applications that create events, sign them (or delegate signing), publish them to relays, and subscribe to relays to retrieve events from other users. Clients are the intelligent layer of NOSTR.

**Client responsibilities:**

- **Key management**: Generate, store, or delegate to signers (NIP-07/46/55).
- **Relay management**: Decide which relays to connect to, using the outbox model (NIP-65) for efficient discovery.
- **Event creation**: Construct events with proper kind, tags, content, compute the ID, and sign.
- **Subscription management**: Subscribe to relevant events across multiple relays, deduplicate, and merge results.
- **Content rendering**: Interpret event kinds, render content (Markdown, media, etc.), display threads, profiles, reactions.
- **Encryption/Decryption**: Handle NIP-44 encryption for DMs (NIP-17) and gift wrapping (NIP-59).
- **User experience**: Provide feed algorithms, search, notifications, and all UI concerns.

**The Outbox Model** (NIP-65):

Rather than connecting to a fixed set of relays, modern NOSTR clients use the outbox model: each user publishes a relay list (kind 10002 event) declaring their "read" and "write" relays. When a client wants to fetch events from a user, it reads that user's relay list and connects to their write relays. When publishing an event intended for others to see, the client publishes to its own write relays and, for mentions/replies, also publishes to the write relays of the referenced users. This model enables efficient, decentralized discovery without a global relay or DHT.

---

## Why NOSTR Matters

### Censorship Resistance

No single entity can silence a NOSTR user. Since events are cryptographically signed by the author's private key, they cannot be forged or tampered with. A relay can refuse to store an event, but it cannot prevent the user from publishing to other relays. A client can be deplatformed from app stores, but users can switch to any other client with the same keypair.

### Account Portability

Your identity is your keypair, not a server-side account. You can use any client, connect to any relay, and your identity, social graph, and content travel with you. There is no "export your data" process, no migration tool, no permission needed from a platform. You simply connect with your key.

### No Platform Risk

Application developers building on NOSTR do not face the platform risk inherent in building on Twitter/X, Facebook, or other centralized APIs. The protocol is open and permissionless. No API keys to revoke. No rate limits imposed by a platform owner. No terms of service changes that break your application overnight.

### Verifiable Authorship

Every event carries a cryptographic signature. Anyone can independently verify that a specific event was authored by the holder of a specific public key, without trusting any intermediary. This makes NOSTR data inherently trustworthy in a way that centralized platform data is not.

### Interoperability

Because NOSTR is a protocol, not a platform, applications can interoperate freely. A note published from Damus (iOS) is visible on Amethyst (Android), Primal (web), Gossip (desktop), and any other client. A user's social graph, reactions, and content are accessible from any compliant implementation.

### Simplicity Enables Innovation

The protocol is simple enough that a competent developer can build a basic client or relay in a day. This low barrier to entry has produced a diverse ecosystem of specialized applications: microblogging, long-form publishing, marketplaces, chess games, code collaboration, livestreaming, podcasting, and more — all sharing the same identity layer and social graph.

---

## How NOSTR Compares to Other Protocols

### vs. ActivityPub / Mastodon (Federated)

| Dimension | NOSTR | ActivityPub/Mastodon |
|-----------|-------|---------------------|
| Identity | Cryptographic keypair (user-controlled) | Server-managed account (user@server.social) |
| Portability | Absolute — key works everywhere | Limited — migration requires server cooperation |
| Censorship | Relay can drop events; user publishes elsewhere | Server admin controls account, content, and federation |
| Data model | Signed events (tamperproof) | Server-to-server HTTP (server can forge) |
| Discovery | Outbox model + relay hints | Server-to-server federation |
| Complexity | Simple (WebSocket + JSON) | Complex (HTTP signatures, JSON-LD, multiple specs) |

The fundamental difference: in Mastodon, your server admin controls your identity. If they ban you, you lose your followers and your handle. In NOSTR, your identity is your key. No one controls it but you.

### vs. AT Protocol / Bluesky (Federated)

| Dimension | NOSTR | AT Protocol/Bluesky |
|-----------|-------|---------------------|
| Identity | Self-sovereign keypair | DID-based, but with a centralized DID registry (PLC) |
| Data hosting | Distributed across relays (no canonical source) | Personal Data Server with a canonical data repo |
| Censorship | No global moderation layer | AppView layer can filter/shadowban |
| Relay/Server role | Dumb storage, client-driven intelligence | Complex (PDS, AppView, Relay, BGS) |
| Complexity | Minimal | Substantial (CIDs, DAG-CBOR, XRPC, Lexicons) |

AT Protocol is architecturally more sophisticated but introduces centralization vectors: a single DID registry, a canonical "Big Graph Service" relay, and an AppView layer that can filter content globally. NOSTR has no equivalent centralization points.

### vs. Blockchain-Based Protocols (Lens, Farcaster, etc.)

| Dimension | NOSTR | Blockchain-based |
|-----------|-------|-----------------|
| Cost | Free (no gas fees, no tokens) | Requires cryptocurrency for on-chain operations |
| Speed | Real-time (WebSocket) | Constrained by block times and confirmation |
| Storage | Relays store events (cheap, simple) | On-chain storage is expensive; most use hybrid on/off-chain |
| Token requirement | None | Typically requires native token |
| Consensus | None needed (signatures are self-verifying) | Blockchain consensus (PoS, PoW, etc.) |
| Complexity | WebSocket + JSON + signatures | Smart contracts, gas optimization, indexers, subgraphs |

NOSTR deliberately avoids blockchain. There is no token, no gas, no consensus mechanism, no finality concern. Events are self-authenticating via signatures, eliminating the need for a consensus layer to establish truth. This makes NOSTR free to use, fast, and simple.

### vs. Matrix (Decentralized Messaging)

| Dimension | NOSTR | Matrix |
|-----------|-------|--------|
| Primary use case | Social networking (extensible) | Messaging (extensible) |
| Identity | Keypair | @user:homeserver.org (server-bound) |
| State management | No global state, events are independent | Room state, state resolution algorithms |
| Encryption | NIP-44 (event-level) | Megolm/Olm (session-based) |
| Complexity | Simple | Complex (state resolution, DAGs, federation) |

Matrix is purpose-built for messaging with sophisticated state management and end-to-end encryption. NOSTR is a simpler, more general-purpose protocol that has added messaging capabilities through NIPs. They serve overlapping but distinct niches.

---

## The NIP System

**NIPs** (Nostr Implementation Possibilities) are the specification documents that define NOSTR. They are maintained in the `nostr-protocol/nips` GitHub repository and serve as the canonical, community-governed standard.

### How NIPs Work

- Any developer can propose a NIP by submitting a pull request to the NIPs repository.
- NIPs are discussed, refined, and eventually merged (or rejected) through community consensus.
- NIPs are **optional**: clients and relays implement the NIPs relevant to their use case.
- NIPs define: event kinds, tag semantics, relay protocol extensions, client behaviors, and encoding formats.

### NIP Categories

| Category | Examples | Description |
|----------|----------|-------------|
| Core protocol | NIP-01, NIP-10, NIP-19 | Fundamental event model, relay protocol, encoding |
| Identity | NIP-02, NIP-05, NIP-07, NIP-46 | Key management, discovery, signing delegation |
| Social | NIP-23, NIP-25, NIP-51 | Content types, reactions, lists |
| Messaging | NIP-17, NIP-44, NIP-59 | Encrypted DMs, encryption primitives, metadata hiding |
| Payments | NIP-47, NIP-57, NIP-60 | Lightning Zaps, Wallet Connect, Cashu |
| Media | NIP-71, NIP-92, NIP-B7 | Video, attachments, Blossom file storage |
| Applications | NIP-34, NIP-52, NIP-90 | Git, calendar, Data Vending Machines |
| Relay management | NIP-11, NIP-65, NIP-86 | Relay info, relay lists, relay admin API |
| Security | NIP-13, NIP-42, NIP-98 | Proof of work, authentication, HTTP auth |

### Essential NIPs to Know

These NIPs form the foundation that every NOSTR developer should understand:

- **NIP-01**: Basic protocol flow — event format, relay messages, subscription filters. The bedrock.
- **NIP-02**: Follow lists (kind 3). How social graphs are stored.
- **NIP-05**: DNS-based identifiers (user@domain.com). Human-readable discovery.
- **NIP-10**: Text notes and threading conventions. Reply markers (root, reply, mention).
- **NIP-11**: Relay information document. How relays describe their capabilities.
- **NIP-19**: Bech32-encoded entities (npub, nsec, note, nprofile, nevent, naddr). Display encoding.
- **NIP-21**: `nostr:` URI scheme for embedding references in content.
- **NIP-44**: Versioned encryption. The current standard for encrypting event content.
- **NIP-59**: Gift Wrap. Metadata-hiding encryption layer for private messaging.
- **NIP-65**: Relay list metadata. The outbox model for relay discovery.

---

## Quick Start: Core Concepts

If you are new to NOSTR, here is the minimum you need to understand:

### 1. Generate a Keypair

Your identity is a secp256k1 keypair. Generate one using any NOSTR library or client. The private key (nsec) is your secret; the public key (npub) is your identity. Guard the private key absolutely.

### 2. Connect to Relays

Choose one or more relays to connect to via WebSocket (`wss://relay.example.com`). Popular public relays include `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`. Publish your relay list as a kind 10002 event (NIP-65) so others can find you.

### 3. Publish Events

Create a JSON event, compute its ID (SHA-256 of the serialized form), sign it with your private key (Schnorr signature), and send it to your relays via `["EVENT", <event>]`.

### 4. Subscribe to Events

Send a `["REQ", "<subscription-id>", <filter>]` message to relays. Filters specify which events you want by authors, kinds, tags, time ranges, etc. The relay sends matching events, then `EOSE` to mark the end of stored events, then new events in real-time.

### 5. Verify Everything

Every event you receive can be verified independently: recompute the ID from the event fields and verify the Schnorr signature against the author's public key. No trust in relays required.

### 6. Build Outward

From this foundation, everything else is layered on via NIPs: profiles (kind 0), follow lists (kind 3), reactions (kind 7), DMs (NIP-17), zaps (NIP-57), long-form content (kind 30023), and hundreds of other event kinds.

---

## Protocol Data Flow

A simplified end-to-end flow for publishing and receiving a text note:

```
PUBLISHER                          RELAY                          SUBSCRIBER
    |                                |                                |
    |  1. Generate keypair           |                                |
    |  2. Create event JSON          |                                |
    |  3. Compute SHA-256 id         |                                |
    |  4. Sign with private key      |                                |
    |                                |                                |
    |--- ["EVENT", {signed event}]-->|                                |
    |                                |  5. Verify signature            |
    |                                |  6. Store event                 |
    |<-- ["OK", id, true, ""] ------|                                |
    |                                |                                |
    |                                |<-- ["REQ", "sub1", {filter}] --|
    |                                |                                |
    |                                |--- ["EVENT", "sub1", event] -->|
    |                                |--- ["EOSE", "sub1"] ---------->|
    |                                |                                |
    |                                |  (new event arrives later)     |
    |--- ["EVENT", {new event}] --->|                                |
    |                                |--- ["EVENT", "sub1", event] -->|
    |                                |                                |
```

---

## Further Reading

Deeper documentation in this repository:

| Document | Path | Description |
|----------|------|-------------|
| Event Model | [`protocol/event-model.md`](./event-model.md) | Detailed event structure, serialization, kind categories |
| Relay Protocol | [`protocol/relay-protocol.md`](./relay-protocol.md) | WebSocket protocol, messages, filters, connection management |
| Cryptography | [`protocol/cryptography.md`](./cryptography.md) | secp256k1, Schnorr signatures, NIP-44 encryption |
| Identity | [`protocol/identity.md`](./identity.md) | Keys, NIP-05, NIP-19 encoding, signing delegation |
| Relay Architecture | [`protocol/relay-architecture.md`](./relay-architecture.md) | How relays store, index, and serve events |
| Client Architecture | [`protocol/client-architecture.md`](./client-architecture.md) | Outbox model, subscription management, UI patterns |
| Data Flow | [`protocol/data-flow.md`](./data-flow.md) | End-to-end data flow with diagrams |
| Glossary | [`protocol/glossary.md`](./glossary.md) | Canonical definitions of all NOSTR terms |

### Structured Data

| File | Path | Description |
|------|------|-------------|
| Event Kinds Registry | [`data-models/event-kinds.json`](../data-models/event-kinds.json) | Machine-readable event kinds database |
| NIP Index | [`data-models/nip-index.json`](../data-models/nip-index.json) | Structured NIP metadata |
| NIP-19 Prefixes | [`data-models/nip-19-prefixes.json`](../data-models/nip-19-prefixes.json) | Bech32 encoding reference |
| Tags Reference | [`data-models/tags.json`](../data-models/tags.json) | Standard tags reference |
| Relay Messages | [`data-models/relay-messages.json`](../data-models/relay-messages.json) | Protocol message types |

### NIP Breakdowns

See [`nips/README.md`](../nips/README.md) for the complete NIP index organized by category.

### External Resources

- **Protocol specification**: [github.com/nostr-protocol/nips](https://github.com/nostr-protocol/nips)
- **Protocol overview**: [github.com/nostr-protocol/nostr](https://github.com/nostr-protocol/nostr)
- **Official website**: [nostr.com](https://nostr.com)
- **Getting started guide**: [start.njump.me](https://start.njump.me/)
- **Application directory**: [nostrapps.com](https://nostrapps.com)
- **Network explorer**: [nostr.band](https://nostr.band)

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions and [MASTER-PLAN.md](../MASTER-PLAN.md) for the overall build plan.*
