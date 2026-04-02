# NOSTR Architecture Overview

> A technical but accessible overview of how NOSTR fits together. For developers who have read [Getting Started](./getting-started.md) and want to understand the system design.

---

## Table of Contents

- [System Architecture Diagram](#system-architecture-diagram)
- [The NOSTR Stack](#the-nostr-stack)
- [The Event as Universal Data Unit](#the-event-as-universal-data-unit)
- [Client-Relay Communication Model](#client-relay-communication-model)
- [How Events Flow Through the Network](#how-events-flow-through-the-network)
- [The Outbox Model (NIP-65)](#the-outbox-model-nip-65)
- [Event Kinds and Their Purpose](#event-kinds-and-their-purpose)
- [The NIP System and Protocol Evolution](#the-nip-system-and-protocol-evolution)
- [Comparison with Traditional Architectures](#comparison-with-traditional-architectures)

---

## System Architecture Diagram

```
                            THE NOSTR NETWORK
 ═══════════════════════════════════════════════════════════════════

 IDENTITY LAYER (self-sovereign, no servers needed)
 ┌──────────────────────────────────────────────────────────────┐
 │                    secp256k1 Keypairs                        │
 │                                                              │
 │  User A: nsec1... ──> npub1abc...                           │
 │  User B: nsec1... ──> npub1def...                           │
 │  User C: nsec1... ──> npub1ghi...                           │
 │                                                              │
 │  Keys are generated offline. No registration required.       │
 └──────────────────────────────────────────────────────────────┘
               │                              │
               │ signs events                 │ signs events
               ▼                              ▼
 EVENT LAYER (signed JSON objects)
 ┌──────────────────────────────────────────────────────────────┐
 │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
 │  │ kind 0      │  │ kind 1      │  │ kind 7      │  ...    │
 │  │ Profile     │  │ Text note   │  │ Reaction    │         │
 │  │ metadata    │  │ "Hello!"    │  │ "+"         │         │
 │  │             │  │             │  │             │         │
 │  │ sig: valid  │  │ sig: valid  │  │ sig: valid  │         │
 │  └─────────────┘  └─────────────┘  └─────────────┘         │
 └──────────────────────────────────────────────────────────────┘
               │              │               │
               │   published via WebSocket    │
               ▼              ▼               ▼
 RELAY LAYER (dumb storage and forwarding)
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
 │  │ Relay 1  │    │ Relay 2  │    │ Relay 3  │   ...        │
 │  │ (public, │    │ (paid,   │    │ (private,│              │
 │  │  free)   │    │  fast)   │    │  curated)│              │
 │  └──────────┘    └──────────┘    └──────────┘              │
 │                                                              │
 │  Relays are independent. They do not federate by default.   │
 │  Each stores events and serves them to subscribers.          │
 └──────────────────────────────────────────────────────────────┘
               │              │               │
               │  WebSocket subscriptions     │
               ▼              ▼               ▼
 CLIENT LAYER (intelligent applications)
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
 │  │ Damus    │  │ Amethyst │  │ Primal   │  │ Gossip   │   │
 │  │ (iOS)    │  │ (Android)│  │ (Web)    │  │ (Desktop)│   │
 │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
 │                                                              │
 │  Clients handle: key management, relay selection,            │
 │  encryption, UI, feed algorithms, content rendering          │
 └──────────────────────────────────────────────────────────────┘
               │
               ▼
 NIP LAYER (protocol extensions)
 ┌──────────────────────────────────────────────────────────────┐
 │  NIP-01: Core protocol     NIP-57: Zaps (Lightning)         │
 │  NIP-02: Follow lists      NIP-65: Relay lists (outbox)     │
 │  NIP-05: DNS identifiers   NIP-17: Private DMs              │
 │  NIP-10: Threading         NIP-90: Data Vending Machines    │
 │  NIP-19: Bech32 encoding   NIP-44: Encryption               │
 │  ...and hundreds more, each optional                         │
 └──────────────────────────────────────────────────────────────┘
```

---

## The NOSTR Stack

Think of NOSTR as a five-layer stack. Each layer builds on the one below:

```
┌─────────────────────────────────────────────────────────┐
│  5. NIPs          Protocol extensions (optional specs)  │
├─────────────────────────────────────────────────────────┤
│  4. Clients       User-facing applications              │
├─────────────────────────────────────────────────────────┤
│  3. Relays        WebSocket servers (storage + forward) │
├─────────────────────────────────────────────────────────┤
│  2. Events        Signed JSON data units                │
├─────────────────────────────────────────────────────────┤
│  1. Keys          secp256k1 cryptographic identity      │
└─────────────────────────────────────────────────────────┘
```

**Layer 1 -- Keys:** Your identity. A secp256k1 keypair generated offline. The private key signs events; the public key identifies you. No server involved.

**Layer 2 -- Events:** The universal data format. A JSON object with seven fields: `id`, `pubkey`, `created_at`, `kind`, `tags`, `content`, `sig`. Everything in NOSTR is an event.

**Layer 3 -- Relays:** The infrastructure. WebSocket servers that accept events, store them, and serve them to subscribers. They validate signatures but do not interpret content. Intentionally simple.

**Layer 4 -- Clients:** The intelligence. Applications that manage keys, choose relays, create/sign events, subscribe to feeds, handle encryption, and render everything into a user interface.

**Layer 5 -- NIPs:** The extensions. Specification documents that define new event kinds, tag conventions, relay behaviors, and client features. Each NIP is optional. Clients and relays implement the ones they need.

---

## The Event as Universal Data Unit

The event is the single most important concept in NOSTR. Everything -- posts, profiles, follows, reactions, messages, marketplace listings, code commits -- is represented as an event. This uniformity is what makes the protocol so flexible.

### Event Structure

```
┌─────────────────────────────────────────────────────────┐
│                      EVENT                               │
├─────────────────────────────────────────────────────────┤
│  id         32-byte SHA-256 hash (hex)                  │
│             Computed from: [0, pubkey, created_at,      │
│             kind, tags, content]                         │
├─────────────────────────────────────────────────────────┤
│  pubkey     32-byte public key (hex)                    │
│             The author's identity                        │
├─────────────────────────────────────────────────────────┤
│  created_at Unix timestamp (seconds)                    │
├─────────────────────────────────────────────────────────┤
│  kind       Integer (determines event semantics)        │
├─────────────────────────────────────────────────────────┤
│  tags       Array of arrays                             │
│             [["e", "event-id"], ["p", "pubkey"], ...]   │
│             Structured metadata, references, labels     │
├─────────────────────────────────────────────────────────┤
│  content    String (meaning depends on kind)            │
│             Could be: text, JSON, encrypted blob, ""    │
├─────────────────────────────────────────────────────────┤
│  sig        64-byte Schnorr signature (hex)             │
│             Signs the id using the author's private key │
└─────────────────────────────────────────────────────────┘
```

### Why One Data Unit?

Having a single data format means:

- **Relays only need to understand one thing.** Store events, serve events. No special handling per content type.
- **Clients can be progressive.** A client that does not understand kind 30023 (articles) can simply ignore those events. It does not break.
- **New features do not require relay upgrades.** Define a new kind and tag convention in a NIP, and clients that support it will handle it. Relays store and forward it without changes.
- **Verification is universal.** The same signature check works for every event, regardless of kind.

### Event Lifecycle

```
 CREATE           SIGN              PUBLISH           STORE
 ┌──────┐        ┌──────┐         ┌──────┐         ┌──────┐
 │Build │        │Hash  │         │Send  │         │Relay │
 │JSON  │──────> │to id,│──────>  │EVENT │──────>  │verif-│
 │object│        │Schnorr│        │msg to│         │ies & │
 │      │        │sign  │         │relays│         │stores│
 └──────┘        └──────┘         └──────┘         └──────┘
                                                      │
 DISCOVER         DELIVER          VERIFY              │
 ┌──────┐        ┌──────┐         ┌──────┐            │
 │Other │        │Relay │         │Client│            │
 │client│<────── │sends │<────────│re-   │<───────────┘
 │sub-  │        │match-│         │checks│
 │scribes│       │ing   │         │sig   │
 └──────┘        │events│         └──────┘
                 └──────┘
```

---

## Client-Relay Communication Model

Clients and relays communicate over WebSocket connections using a simple message protocol. There are only three message types from client to relay, and four from relay to client.

### Message Flow

```
          CLIENT                              RELAY
            │                                   │
            │──── ["EVENT", <event>] ──────────>│  Publish an event
            │<─── ["OK", <id>, true, ""] ──────│  Acknowledgment
            │                                   │
            │──── ["REQ", "sub1", <filter>] ───>│  Subscribe to events
            │<─── ["EVENT", "sub1", <event>] ──│  Historical match
            │<─── ["EVENT", "sub1", <event>] ──│  Historical match
            │<─── ["EOSE", "sub1"] ────────────│  "End of stored events"
            │                                   │
            │         (time passes)             │
            │                                   │
            │<─── ["EVENT", "sub1", <event>] ──│  New real-time match
            │                                   │
            │──── ["CLOSE", "sub1"] ───────────>│  Close subscription
            │<─── ["CLOSED", "sub1", ""] ──────│  Confirmation
            │                                   │
```

### Subscription Filters

When a client sends a `REQ` message, it includes one or more filters that tell the relay what events to return:

```json
{
  "authors": ["pubkey1", "pubkey2"],
  "kinds": [1, 6, 7],
  "#e": ["event-id"],
  "since": 1711843200,
  "limit": 50
}
```

Filters support:

| Field | Meaning |
|-------|---------|
| `ids` | Specific event IDs (or prefixes) |
| `authors` | Events by specific pubkeys (or prefixes) |
| `kinds` | Event kind numbers |
| `#<tag>` | Events with specific tag values (e.g., `#e`, `#p`, `#t`) |
| `since` | Events after this timestamp |
| `until` | Events before this timestamp |
| `limit` | Maximum number of events to return (from most recent) |

A client typically maintains many subscriptions across many relays simultaneously. For example, a social client might have:

```
Relay A:
  ├── Sub "feed":    authors=[followed pubkeys], kinds=[1,6], limit=50
  ├── Sub "replies": #p=[my pubkey], kinds=[1], since=last_check
  └── Sub "profile": authors=[viewed profile], kinds=[0,3,10002]

Relay B:
  ├── Sub "feed":    authors=[followed pubkeys], kinds=[1,6], limit=50
  └── Sub "dms":     #p=[my pubkey], kinds=[1059], since=last_check

Relay C:
  └── Sub "search":  kinds=[1], #t=["bitcoin"], limit=20
```

---

## How Events Flow Through the Network

NOSTR has no central routing. Events flow through the network because clients actively push to relays and pull from relays. Here is a complete example of Alice posting a note that Bob sees:

```
Alice's Client                   Relays                    Bob's Client
     │                                                          │
     │  1. Alice writes "Hello!"                                │
     │  2. Client creates kind 1 event                          │
     │  3. Client signs with Alice's nsec                       │
     │                                                          │
     │                      ┌───────────┐                       │
     │── ["EVENT", {...}] ─>│ Relay A   │                       │
     │                      │ (Alice's  │                       │
     │                      │  write    │                       │
     │── ["EVENT", {...}] ─>│  relay)   │                       │
     │                      └─────┬─────┘                       │
     │                      ┌─────┴─────┐                       │
     │── ["EVENT", {...}] ─>│ Relay B   │<── ["REQ", ...] ─────│
     │                      │ (shared)  │                       │
     │                      │           │── ["EVENT", sub, e] ─>│
     │                      └───────────┘                       │
     │                                                          │
     │                                     4. Bob's client      │
     │                                        receives event    │
     │                                     5. Verifies signature│
     │                                     6. Displays note     │
```

Key insight: Alice and Bob do not need to be connected to the same relay. As long as Bob's client knows to check Alice's write relays (via the outbox model), Bob will find Alice's posts. The client does the work of figuring out where to look.

### Multi-Relay Publishing

In practice, clients publish to multiple relays for redundancy:

```
Alice's Client
     │
     ├──> Relay A  (Alice's primary write relay)
     ├──> Relay B  (popular public relay)
     └──> Relay C  (Bob's read relay, because Alice is replying to Bob)
```

This ensures the event is available from multiple sources and reaches the intended audience even if one relay is down.

---

## The Outbox Model (NIP-65)

The outbox model is how NOSTR solves the problem of "how do I find someone's posts without a central directory?"

### The Problem

In a decentralized system with thousands of relays, how does Bob's client know which relays have Alice's posts?

### The Solution: Relay List Metadata

Each user publishes a **kind 10002 event** declaring their relay preferences:

```json
{
  "kind": 10002,
  "tags": [
    ["r", "wss://alice-relay.com", "write"],
    ["r", "wss://nos.lol", "write"],
    ["r", "wss://relay.damus.io", "read"],
    ["r", "wss://relay.nostr.band", "read"]
  ],
  "content": ""
}
```

- **Write relays:** "I publish my events here. Look here to find my stuff."
- **Read relays:** "I read from here. If you want me to see something (like a reply), publish it here."

### How It Works in Practice

```
┌─────────────────────────────────────────────────────────────┐
│                     OUTBOX MODEL FLOW                        │
│                                                              │
│  Alice's relay list (kind 10002):                            │
│    WRITE: wss://alice-relay.com, wss://nos.lol               │
│    READ:  wss://relay.damus.io                               │
│                                                              │
│  Bob's relay list (kind 10002):                              │
│    WRITE: wss://bob-relay.com, wss://nos.lol                 │
│    READ:  wss://relay.damus.io, wss://nos.lol                │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │ When Bob's client wants to see Alice's posts:    │       │
│  │                                                   │       │
│  │ 1. Fetch Alice's kind 10002 from a known relay   │       │
│  │ 2. Read her WRITE relays: alice-relay.com, nos.lol│       │
│  │ 3. Connect to those relays                        │       │
│  │ 4. Subscribe for Alice's events there             │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │ When Alice replies to Bob:                        │       │
│  │                                                   │       │
│  │ 1. Alice's client reads Bob's kind 10002          │       │
│  │ 2. Notes Bob's READ relays: relay.damus.io,       │       │
│  │    nos.lol                                        │       │
│  │ 3. Publishes the reply to Bob's READ relays       │       │
│  │    (in addition to Alice's own WRITE relays)      │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  Result: Events reach the right people without a central     │
│  directory. Each user declares where they publish and read.  │
└─────────────────────────────────────────────────────────────┘
```

This is a key architectural insight: **the network is not a fixed topology.** Each client dynamically connects to the relays it needs based on the relay lists of the users it cares about. The network topology is emergent, shaped by user preferences.

---

## Event Kinds and Their Purpose

Event kinds are how NOSTR multiplexes many different applications over one protocol. The `kind` integer in an event determines what the event means and how clients should handle it.

### Kind Categories

```
┌─────────────────────────────────────────────────────────────┐
│  KIND RANGES AND STORAGE BEHAVIOR                            │
│                                                              │
│  0-999          Regular events (+ some replaceable ones)    │
│  1000-9999      Regular events (all stored)                 │
│  10000-19999    Replaceable events (latest per pubkey+kind) │
│  20000-29999    Ephemeral events (NOT stored by relays)     │
│  30000-39999    Parameterized replaceable events            │
│                 (latest per pubkey+kind+d-tag)              │
└─────────────────────────────────────────────────────────────┘
```

**Regular events:** Every one is stored. Example: kind 1 text notes. You can post many and all are kept.

**Replaceable events:** Only the latest one per author is kept. Example: kind 0 profile metadata. When you update your profile, the old one is replaced.

**Ephemeral events:** Not stored at all -- only forwarded to current subscribers. Example: kind 22242 (client authentication).

**Parameterized replaceable events:** Only the latest per author + `d` tag value is kept. Example: kind 30023 long-form articles. Each article has a unique `d` tag (like a slug), and updating the article replaces the old version.

### Feature-to-Kind Mapping

Here is how different applications map to event kinds:

```
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION          KINDS USED           NIP              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SOCIAL NETWORKING                                           │
│  ├─ Profile info      0 (replaceable)      NIP-01           │
│  ├─ Text notes        1                    NIP-01           │
│  ├─ Follow lists      3 (replaceable)      NIP-02           │
│  ├─ Reposts           6                    NIP-18           │
│  ├─ Reactions         7                    NIP-25           │
│  ├─ Event deletion    5                    NIP-09           │
│  └─ User lists        30000               NIP-51           │
│                                                              │
│  MESSAGING                                                   │
│  ├─ Private DMs       14 (via gift wrap)   NIP-17           │
│  ├─ Gift wraps        1059                 NIP-59           │
│  └─ Group chat        9/10/11/12          NIP-29           │
│                                                              │
│  LONG-FORM CONTENT                                           │
│  └─ Articles          30023 (param repl.)  NIP-23           │
│                                                              │
│  PAYMENTS                                                    │
│  ├─ Zap requests      9734                 NIP-57           │
│  ├─ Zap receipts      9735                 NIP-57           │
│  └─ Wallet Connect    23194/23195         NIP-47           │
│                                                              │
│  MARKETPLACE                                                 │
│  ├─ Product listings  30017 (param repl.)  NIP-15           │
│  ├─ Stalls            30017               NIP-15           │
│  └─ Orders            various             NIP-15           │
│                                                              │
│  MEDIA                                                       │
│  ├─ Video events      34235               NIP-71           │
│  └─ File metadata     1063                NIP-94           │
│                                                              │
│  DEVELOPER TOOLS                                             │
│  ├─ Git repos         30617 (param repl.)  NIP-34           │
│  ├─ Git patches       1617                NIP-34           │
│  └─ Git issues        1621                NIP-34           │
│                                                              │
│  AI / COMPUTE                                                │
│  ├─ DVM requests      5000-5999           NIP-90           │
│  └─ DVM results       6000-6999           NIP-90           │
│                                                              │
│  INFRASTRUCTURE                                              │
│  ├─ Relay lists       10002 (replaceable)  NIP-65           │
│  ├─ Relay info        HTTP endpoint        NIP-11           │
│  └─ Auth challenges   22242 (ephemeral)   NIP-42           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The beauty of this system: a relay does not need to know what kind 30017 means. It just stores the event and serves it to subscribers who ask for `kinds: [30017]`. Only the client needs to know how to render a marketplace listing.

---

## The NIP System and Protocol Evolution

NIPs (Nostr Implementation Possibilities) are how NOSTR evolves without a central authority.

### How a NIP Becomes Part of the Protocol

```
 IDEA              DRAFT             REVIEW            MERGE
 ┌──────┐         ┌──────┐         ┌──────┐         ┌──────┐
 │Dev has│         │Write │         │Commun-│         │PR is │
 │an idea│──────>  │spec  │──────>  │ity    │──────>  │merged│
 │for new│         │as PR │         │reviews│         │into  │
 │feature│         │to    │         │discuss│         │nips  │
 │       │         │nips  │         │refine │         │repo  │
 └──────┘         │repo  │         └──────┘         └──────┘
                  └──────┘                                │
                                                          ▼
                                                   ┌──────────┐
                                                   │Clients & │
                                                   │relays    │
                                                   │optionally│
                                                   │implement │
                                                   │it        │
                                                   └──────────┘
```

Key properties of the NIP system:

- **No mandatory upgrades.** A client that only implements NIP-01 still works. It just has fewer features.
- **Backward compatible.** New NIPs define new kinds and tag conventions. Old clients ignore what they do not understand.
- **Community governed.** Anyone can propose a NIP. Acceptance is by rough consensus.
- **Progressive enhancement.** Clients can add NIP support incrementally. Users get more features as clients catch up.

### The Essential NIPs

If you are building on NOSTR, learn these first:

| NIP | Name | Why It Matters |
|-----|------|---------------|
| 01 | Basic Protocol | The foundation: event format, relay protocol, filters. Everything depends on this. |
| 02 | Follow Lists | How social graphs are stored. Kind 3 events with `p` tags. |
| 05 | DNS Identifiers | Human-readable addresses (user@domain.com). Makes NOSTR usable for normal people. |
| 10 | Text Notes & Threading | How replies, threads, and mentions work. Critical for social apps. |
| 11 | Relay Information | How relays describe their capabilities, limitations, and policies. |
| 19 | Bech32 Encoding | npub, nsec, note, nprofile, nevent, naddr. How entities are displayed to users. |
| 44 | Versioned Encryption | The current standard encryption for DMs and other private content. |
| 57 | Lightning Zaps | How payments work on NOSTR. The economic layer. |
| 59 | Gift Wrap | Metadata-hiding encryption. Makes DMs truly private. |
| 65 | Relay List Metadata | The outbox model. How decentralized discovery works. |

---

## Comparison with Traditional Architectures

### vs. Twitter / X (Centralized)

```
Twitter Architecture:                 NOSTR Architecture:

┌─────────────────────┐              ┌───────┐ ┌───────┐ ┌───────┐
│   Twitter Server    │              │Relay 1│ │Relay 2│ │Relay 3│
│                     │              └───┬───┘ └───┬───┘ └───┬───┘
│ - Owns all accounts │                  │         │         │
│ - Stores all tweets │              (WebSocket connections)
│ - Controls the feed │                  │         │         │
│ - Can ban anyone    │              ┌───┴─────────┴─────────┴───┐
│ - Owns the API      │              │ Client (the smart layer)  │
│                     │              │ - Manages keys             │
└────────┬────────────┘              │ - Chooses relays           │
         │ API                       │ - Renders content          │
         │ (controlled by Twitter)   │ - Constructs feeds         │
┌────────┴────────────┐              └───────────────────────────┘
│  Twitter App        │
│  (only client)      │              Any of dozens of clients.
└─────────────────────┘              User picks. User switches freely.
```

| Aspect | Twitter | NOSTR |
|--------|---------|-------|
| Identity | Company-controlled account | Self-sovereign keypair |
| Data ownership | Twitter owns your data | You sign your data; relays store copies |
| Censorship | Twitter decides what is allowed | Individual relays set policies; users route around |
| Feed algorithm | Twitter controls what you see | Client-side; you choose your algorithm |
| API access | Twitter controls API terms, rate limits, pricing | Open protocol; no permission needed |
| Portability | Cannot take followers elsewhere | Key + follow list work on any client |
| Monetization | Ads + subscription | Zaps, paid relays, voluntary |

### vs. Email (Federated)

Email is actually the closest architectural comparison to NOSTR:

```
Email:                              NOSTR:

┌──────────┐   ┌──────────┐       ┌──────────┐   ┌──────────┐
│Gmail     │   │Outlook   │       │Relay A   │   │Relay B   │
│(SMTP     │<->│(SMTP     │       │(stores & │   │(stores & │
│ server)  │   │ server)  │       │ serves)  │   │ serves)  │
└────┬─────┘   └────┬─────┘       └────┬─────┘   └────┬─────┘
     │              │                  │              │
┌────┴─────┐   ┌────┴─────┐       ┌────┴──────────────┴─────┐
│Gmail app │   │Outlook   │       │    Any NOSTR client      │
│          │   │app       │       │                          │
└──────────┘   └──────────┘       └──────────────────────────┘
```

| Aspect | Email | NOSTR |
|--------|-------|-------|
| Identity | user@server (server-bound) | keypair (server-independent) |
| Server role | Smart (routes, filters, stores) | Dumb (stores and serves) |
| Portability | Hard (new address, tell everyone) | Instant (same key, any relay) |
| Content integrity | No signatures (can be forged) | Every event is signed |
| Protocol | SMTP/IMAP (complex, 40+ years old) | NIP-01 (simple, 5 years old) |

### vs. RSS (Decentralized Publishing)

```
RSS:                                NOSTR:

┌──────────┐                       ┌──────────┐
│Blog A    │──> RSS feed           │Relay A   │<── subscribe
│(hosts    │     │                  └──────────┘       │
│own feed) │  ┌──┴───────┐                       ┌────┴─────┐
└──────────┘  │RSS Reader│                       │NOSTR     │
              │(Feedly)  │                       │Client    │
┌──────────┐  └──┬───────┘                       └────┬─────┘
│Blog B    │     │                                    │
│(hosts    │──> RSS feed           ┌──────────┐       │
│own feed) │                       │Relay B   │<── subscribe
└──────────┘                       └──────────┘
```

| Aspect | RSS | NOSTR |
|--------|-----|-------|
| Publishing | Each publisher hosts their own feed | Publish to shared relays |
| Social features | None (one-way) | Replies, reactions, follows, DMs, zaps |
| Identity | Domain-based | Cryptographic keypair |
| Discovery | Manual (find the feed URL) | Outbox model + relay lists |
| Real-time | Polling-based | WebSocket (instant) |

NOSTR can be thought of as "RSS with signatures, social features, and real-time delivery."

---

## Putting It All Together

Here is the complete mental model. When you interact with NOSTR, this is what happens:

```
YOU (hold a keypair)
 │
 ├── Your CLIENT creates an EVENT (JSON + signature)
 │
 ├── Client publishes EVENT to your WRITE RELAYS
 │
 ├── Other people's CLIENTS discover your relays via the OUTBOX MODEL (NIP-65)
 │
 ├── Their clients SUBSCRIBE to your relays with FILTERS
 │
 ├── Relays DELIVER matching events over WebSocket
 │
 ├── Receiving clients VERIFY the signature (no trust in relays needed)
 │
 └── The NIP that defines the event KIND tells clients how to RENDER it
     (as a post, a profile update, a DM, a marketplace listing, etc.)
```

The protocol is simple enough to fit in this diagram. Everything else -- feeds, threads, DMs, zaps, marketplaces, livestreams -- is built from these same primitives using different event kinds and tag conventions, each defined by a NIP.

That simplicity is NOSTR's core strength. The protocol does not try to be smart. It provides signed data, dumb storage, and a flexible extension system. The intelligence lives at the edges, in the clients, where innovation is fastest and competition is fiercest.

---

## Further Reading

| Topic | Resource |
|-------|----------|
| Getting started hands-on | [Getting Started Guide](./getting-started.md) |
| Full protocol reference | [Protocol Overview](../protocol/README.md) |
| Event structure deep dive | [Event Model](../protocol/event-model.md) |
| Relay protocol details | [Relay Protocol](../protocol/relay-protocol.md) |
| Data flow end-to-end | [Data Flow](../protocol/data-flow.md) |
| Client architecture patterns | [Client Architecture](../protocol/client-architecture.md) |
| Relay implementation details | [Relay Architecture](../protocol/relay-architecture.md) |
| All NIPs by category | [NIP Index](../nips/README.md) |
| Working code examples | [Examples](../examples/README.md) |

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions.*
