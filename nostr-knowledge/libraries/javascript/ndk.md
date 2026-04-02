# NDK (Nostr Development Kit) -- Deep Dive

> **Repository:** <https://github.com/nostr-dev-kit/ndk>
> **npm:** `@nostr-dev-kit/ndk`
> **Documentation:** <https://ndk.fyi/docs/> | <https://nostr-dev-kit.github.io/ndk/>
> **Author:** Pablo Fernandez ([@pablof7z](https://github.com/pablof7z))
> **License:** MIT

---

## Table of Contents

1. [What NDK Is and Why It Exists](#what-ndk-is-and-why-it-exists)
2. [Architecture: Monorepo Structure](#architecture-monorepo-structure)
3. [Installation and Setup](#installation-and-setup)
4. [Core Concepts](#core-concepts)
   - [NDK Instance](#ndk-instance)
   - [NDKEvent](#ndkevent)
   - [NDKUser](#ndkuser)
   - [NDKFilter and NDKSubscription](#ndkfilter-and-ndksubscription)
   - [NDKRelay and NDKRelaySet](#ndkrelay-and-ndkrelayset)
   - [NDKSigner Interface](#ndksigner-interface)
5. [Caching Layer](#caching-layer)
6. [Outbox Model (NIP-65)](#outbox-model-nip-65)
7. [Subscription Management](#subscription-management)
8. [Event Kinds and Wrappers](#event-kinds-and-wrappers)
9. [Wallet Support](#wallet-support)
10. [Framework Integrations](#framework-integrations)
11. [Comparison with nostr-tools](#comparison-with-nostr-tools)
12. [Common Patterns and Recipes](#common-patterns-and-recipes)
13. [Applications Built with NDK](#applications-built-with-ndk)
14. [Sources](#sources)

---

## What NDK Is and Why It Exists

NDK is a high-level, batteries-included TypeScript/JavaScript framework for building Nostr applications. While lower-level libraries like `nostr-tools` provide raw protocol primitives (event creation, signing, relay communication), NDK sits one abstraction layer higher, offering opinionated defaults, relay management, caching, subscription deduplication, signer abstraction, and framework integrations out of the box.

### The Problem NDK Solves

Building a Nostr client with raw protocol primitives means every developer must independently solve:

- **Relay management** -- which relays to query, how to fan out requests, how to handle failures
- **Caching** -- UX degrades catastrophically when data is not available immediately; every client needs some form of local cache
- **Subscription deduplication** -- multiple UI components requesting the same data should not create redundant relay subscriptions
- **Outbox model** -- NIP-65 relay lists mean the correct relay to find a user's events varies per user; implementing this from scratch is complex
- **Signer abstraction** -- supporting NIP-07 browser extensions, NIP-46 remote signing, and private key signing requires a common interface
- **Event type handling** -- different event kinds (profiles, contacts, articles, zaps) have specific semantics that benefit from typed wrappers

NDK provides opinionated solutions to all of these. The philosophy is: **developers should focus on their application logic, not on re-implementing relay management and caching strategies**.

### Design Principles

- **Intuitive, type-safe APIs** -- TypeScript-first with comprehensive type definitions
- **Database-agnostic caching** -- pluggable cache adapters (Dexie/IndexedDB, Redis, SQLite, in-memory LRU, or custom)
- **Decentralizing by default** -- outbox model support means applications naturally interact with diverse relays
- **Framework-friendly** -- first-class Svelte 5, React, and React Native bindings
- **Modular** -- monorepo of focused packages; import only what you need

---

## Architecture: Monorepo Structure

NDK is organized as a monorepo (using Bun workspaces). The key packages are:

### Core

| Package | npm | Description |
|---------|-----|-------------|
| `ndk` | `@nostr-dev-kit/ndk` | Core library: events, subscriptions, relay management, signers, caching interface |

### Framework Integrations

| Package | npm | Description |
|---------|-----|-------------|
| `ndk-svelte` | `@nostr-dev-kit/ndk-svelte` | Svelte 5 bindings with reactive runes and store-based subscriptions |
| `ndk-react` | `@nostr-dev-kit/ndk-react` | React hooks and context providers (`NDKProvider`, `useNDK`, `useSubscription`) |
| `ndk-mobile` | `@nostr-dev-kit/ndk-mobile` | React Native / Expo integration; re-exports core NDK classes with mobile-optimized defaults |
| `ndk-svelte-components` | `@nostr-dev-kit/ndk-svelte-components` | Pre-built Svelte UI components (user cards, event renderers, etc.) |

### Cache Adapters

| Package | npm | Description |
|---------|-----|-------------|
| `ndk-cache-dexie` | `@nostr-dev-kit/ndk-cache-dexie` | IndexedDB cache via Dexie.js (browser) |
| `ndk-cache-redis` | `@nostr-dev-kit/ndk-cache-redis` | Redis-backed cache (server-side) |
| `ndk-cache-sqlite` | `@nostr-dev-kit/ndk-cache-sqlite` | SQLite cache (mobile / desktop) |
| `ndk-cache-nostr` | `@nostr-dev-kit/ndk-cache-nostr` | Uses a Nostr relay as a cache backend |

### Advanced Features

| Package | npm | Description |
|---------|-----|-------------|
| `ndk-wallet` | `@nostr-dev-kit/ndk-wallet` | NIP-47 (NWC), NIP-57 (Zaps), NIP-60 (Cashu) wallet implementations |
| `ndk-hooks` | `@nostr-dev-kit/ndk-hooks` | Additional React hooks library |

### Other Packages in the Monorepo

- **Messaging** -- NIP-17 direct messages support
- **Multi-account sessions** -- persistent session management with account switching
- **Web of Trust** -- WoT-based filtering and scoring
- **Negentropy sync** -- set reconciliation for efficient relay synchronization (`@nostr-dev-kit/sync`)
- **Blossom** -- media upload/download via the Blossom protocol

### Development

```bash
# Clone and set up
git clone https://github.com/nostr-dev-kit/ndk.git
cd ndk
bun install
bun run build
bun test
bun run dev        # watch mode
```

---

## Installation and Setup

### Install the core package

```bash
npm install @nostr-dev-kit/ndk
# or
yarn add @nostr-dev-kit/ndk
# or
bun add @nostr-dev-kit/ndk
```

### Install optional packages as needed

```bash
# Browser caching
npm install @nostr-dev-kit/ndk-cache-dexie

# Svelte bindings
npm install @nostr-dev-kit/ndk-svelte

# React bindings
npm install @nostr-dev-kit/ndk-react

# Wallet support
npm install @nostr-dev-kit/ndk-wallet
```

---

## Core Concepts

### NDK Instance

The `NDK` class is the central entry point. It manages relay connections, holds a reference to the signer and cache adapter, and provides methods for fetching and subscribing to events.

```typescript
import NDK from "@nostr-dev-kit/ndk";

const ndk = new NDK({
  // Relays to connect to explicitly
  explicitRelayUrls: [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
  ],

  // Outbox model relays (for discovering user relay lists)
  outboxRelayUrls: ["wss://purplepag.es"],

  // Enable the outbox model (NIP-65 relay discovery)
  enableOutboxModel: true,

  // Signer (optional at construction, can be set later)
  signer: undefined,

  // Cache adapter (optional)
  cacheAdapter: undefined,
});

// Connect to all configured relays
await ndk.connect();
```

#### Key NDK Instance Properties and Methods

```typescript
ndk.signer              // Get/set the active signer
ndk.cacheAdapter        // Get/set the cache adapter
ndk.pool                // The NDKPool managing relay connections
ndk.activeUser          // The currently authenticated NDKUser

// Fetching
ndk.fetchEvent(filter)      // Fetch a single event
ndk.fetchEvents(filter)     // Fetch multiple events (returns Set<NDKEvent>)

// Subscribing
ndk.subscribe(filter, opts) // Create a subscription (returns NDKSubscription)

// Sessions (multi-account)
ndk.sessions.login(signer)  // Log in with a signer
```

---

### NDKEvent

`NDKEvent` is the primary abstraction for Nostr events. It wraps the raw event object with convenience methods for signing, publishing, serialization, and relationship traversal.

#### Creating and Publishing an Event

```typescript
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";

const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.damus.io"],
  signer: mySigner,
});
await ndk.connect();

// Create a kind 1 text note
const event = new NDKEvent(ndk);
event.kind = 1;
event.content = "Hello from NDK!";
event.tags = [["t", "nostr"]];

// Sign and publish to connected relays
await event.publish();
```

#### Fetching Events

```typescript
// Fetch a single event by ID
const event = await ndk.fetchEvent("abc123...hexid");

// Fetch events matching a filter
const events = await ndk.fetchEvents({
  kinds: [1],
  authors: ["pubkey_hex..."],
  limit: 20,
});

// Iterate over results
for (const event of events) {
  console.log(event.content);
  console.log(event.created_at);
  console.log(event.pubkey);
}
```

#### NDKEvent Properties and Methods

```typescript
event.id                // Event ID (hex)
event.kind              // Event kind number
event.pubkey            // Author public key (hex)
event.content           // Event content string
event.tags              // Array of tag arrays
event.created_at        // Unix timestamp
event.sig               // Signature

event.author            // NDKUser representing the author
event.ndk               // Reference to the NDK instance

// Methods
await event.sign()              // Sign without publishing
await event.publish()           // Sign + publish to relays
await event.publish(relaySet)   // Publish to a specific relay set
event.rawEvent()                // Get the raw NostrEvent object
event.encode()                  // NIP-19 encode (nevent, naddr, etc.)
event.isReplaceable()           // Whether this is a replaceable event
event.getMatchingTags("p")      // Get all "p" tags
event.tagValue("d")             // Get the value of the first "d" tag
await event.toNostrEvent()      // Serialized NostrEvent for signing
```

#### Reacting, Replying, Reposting

```typescript
// React to an event
await event.react("+");     // NIP-25 reaction
await event.react("🤙");

// Reply to an event (NDK handles proper NIP-10 threading tags)
const reply = new NDKEvent(ndk);
reply.kind = 1;
reply.content = "Great post!";
reply.tag(event);           // Adds appropriate "e" and "p" tags
await reply.publish();

// Repost (NIP-18)
await event.repost();
```

---

### NDKUser

`NDKUser` represents a Nostr identity. It provides methods for fetching profiles, contact lists, relay lists, and publishing user-related events.

```typescript
import { NDKUser } from "@nostr-dev-kit/ndk";

// Create from hex pubkey
const user = new NDKUser({ pubkey: "hex_pubkey..." });
user.ndk = ndk;

// Create from npub
const user2 = ndk.getUser({ npub: "npub1..." });

// Create from NIP-05 identifier
const user3 = await NDKUser.fromNip05("pablo@f7z.io", ndk);
```

#### Fetching Profile Data

```typescript
// Fetch the user's kind 0 profile
await user.fetchProfile();

console.log(user.profile?.name);
console.log(user.profile?.about);
console.log(user.profile?.picture);
console.log(user.profile?.nip05);
console.log(user.profile?.lud16);     // Lightning address
console.log(user.profile?.banner);
console.log(user.profile?.displayName);
```

#### Follows and Contacts

```typescript
// Get the user's follow list (kind 3 contact list)
const follows = await user.follows();

for (const followedUser of follows) {
  console.log(followedUser.pubkey);
}

// Get the user's relay list (NIP-65)
const relayList = await user.relayList();
```

#### NDKUser Key Methods

```typescript
user.pubkey             // Hex public key
user.npub               // Bech32-encoded npub

user.fetchProfile()     // Fetch kind 0 metadata
user.follows()          // Fetch kind 3 contact list (returns Set<NDKUser>)
user.relayList()        // Fetch NIP-65 relay list
user.zap(amount, comment)  // Zap this user
```

---

### NDKFilter and NDKSubscription

#### NDKFilter

Filters follow the NIP-01 specification and define what events to query from relays:

```typescript
import { NDKFilter } from "@nostr-dev-kit/ndk";

// Simple filter: recent text notes from a specific author
const filter: NDKFilter = {
  kinds: [1],
  authors: ["pubkey_hex..."],
  limit: 50,
};

// Filter with tag queries
const hashtagFilter: NDKFilter = {
  kinds: [1],
  "#t": ["nostr", "bitcoin"],
  since: Math.floor(Date.now() / 1000) - 3600,  // last hour
};

// Multiple kinds
const profileAndContactsFilter: NDKFilter = {
  kinds: [0, 3],
  authors: ["pubkey_hex..."],
};
```

#### NDKSubscription

Subscriptions are the primary mechanism for receiving real-time events from relays. NDK provides powerful subscription management including deduplication, caching, and EOSE handling.

```typescript
// Basic subscription
const sub = ndk.subscribe(
  { kinds: [1], limit: 100 },
  { closeOnEose: true }  // close after initial batch
);

sub.on("event", (event: NDKEvent) => {
  console.log("New event:", event.content);
});

sub.on("eose", () => {
  console.log("End of stored events");
});

sub.on("close", () => {
  console.log("Subscription closed");
});
```

#### Subscription Options

```typescript
const sub = ndk.subscribe(filter, {
  // Close the subscription after EOSE (one-shot query)
  closeOnEose: true,

  // Specify which relays to use
  relayUrls: ["wss://relay.damus.io"],

  // Grouping delay in ms (for subscription batching)
  groupableDelay: 100,

  // Whether this subscription can be grouped with others
  groupable: true,

  // Subid for debugging
  subId: "my-feed",
});
```

#### Fetching vs Subscribing

```typescript
// fetchEvents() is a convenience wrapper that creates a subscription,
// collects events until EOSE, and returns them as a Set
const events = await ndk.fetchEvents({ kinds: [1], limit: 10 });

// fetchEvent() returns the first/best matching event
const profile = await ndk.fetchEvent({
  kinds: [0],
  authors: ["pubkey_hex..."],
});

// For real-time streaming, use subscribe()
const liveSub = ndk.subscribe({ kinds: [1], since: now });
liveSub.on("event", handleNewEvent);
```

---

### NDKRelay and NDKRelaySet

#### NDKRelay

Represents a single relay connection. Handles WebSocket lifecycle, authentication (NIP-42), and message queuing.

```typescript
import { NDKRelay } from "@nostr-dev-kit/ndk";

const relay = ndk.pool.getRelay("wss://relay.damus.io");

relay.on("connect", () => console.log("Connected"));
relay.on("disconnect", () => console.log("Disconnected"));
relay.on("auth", (challenge) => {
  // Handle NIP-42 authentication
});

console.log(relay.url);
console.log(relay.connectivity.status);
```

#### NDKRelaySet

A set of relays to use for a specific operation. NDK can automatically calculate the optimal relay set for a query (via the outbox model), or you can specify one manually.

```typescript
import { NDKRelaySet } from "@nostr-dev-kit/ndk";

// Create a relay set manually
const relaySet = NDKRelaySet.fromRelayUrls(
  ["wss://relay.damus.io", "wss://nos.lol"],
  ndk
);

// Publish to a specific relay set
await event.publish(relaySet);

// Fetch from a specific relay set
const events = await ndk.fetchEvents(filter, { relaySet });
```

#### NDKPool

The `NDKPool` manages all relay connections for an NDK instance:

```typescript
ndk.pool.on("relay:connect", (relay) => {
  console.log(`Connected to ${relay.url}`);
});

ndk.pool.on("relay:disconnect", (relay) => {
  console.log(`Disconnected from ${relay.url}`);
});

// Get all connected relays
const relays = ndk.pool.connectedRelays();
```

---

### NDKSigner Interface

NDK abstracts signing behind the `NDKSigner` interface, allowing applications to support multiple signing methods without changing application code.

#### NDKPrivateKeySigner

For direct private key signing (development, server-side, or key-management applications like nsecBunker):

```typescript
import { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

// Generate a new keypair
const signer = NDKPrivateKeySigner.generate();
const user = await signer.user();
console.log("Generated npub:", user.npub);

// From an existing nsec or hex private key
const signer2 = new NDKPrivateKeySigner("nsec1...");
const signer3 = new NDKPrivateKeySigner("hex_privkey...");

// Attach to NDK
const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.primal.net"],
  signer: signer,
});
```

#### NDKNip07Signer

For browser extension signing (Alby, nos2x, Nostore, etc.):

```typescript
import { NDKNip07Signer } from "@nostr-dev-kit/ndk";

// Uses window.nostr provided by the browser extension
const signer = new NDKNip07Signer();

// The signer will prompt the user via their extension
const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.damus.io"],
  signer: signer,
});

// Get the user's public key (triggers extension popup)
const user = await signer.user();
console.log("Logged in as:", user.npub);
```

#### NDKNip46Signer (Nostr Connect / Remote Signing)

For remote signing via NIP-46 (nsecBunker, Amber, etc.):

```typescript
import { NDKNip46Signer } from "@nostr-dev-kit/ndk";

// Remote signer using an npub of the signing service
const signer = new NDKNip46Signer(ndk, "npub_of_remote_signer...");

// Wait for connection to the remote signer
await signer.blockUntilReady();

const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.damus.io"],
  signer: signer,
});
```

#### The NDKSigner Interface

All signers implement this interface, making them interchangeable:

```typescript
interface NDKSigner {
  user(): Promise<NDKUser>;
  sign(event: NostrEvent): Promise<string>;
  encrypt(recipient: NDKUser, value: string): Promise<string>;
  decrypt(sender: NDKUser, value: string): Promise<string>;
  blockUntilReady(): Promise<NDKUser>;
}
```

#### Switching Signers at Runtime

```typescript
// Start without a signer
const ndk = new NDK({ explicitRelayUrls: [...] });
await ndk.connect();

// User clicks "Login with extension"
ndk.signer = new NDKNip07Signer();

// Or use multi-account sessions
await ndk.sessions.login(new NDKNip07Signer());
```

---

## Caching Layer

NDK's caching layer is one of its most important features. Without caching, every navigation in a client triggers relay queries, resulting in loading spinners and poor UX. NDK checks the cache first, returns cached data immediately, then updates from relays in the background.

### How Caching Works

1. When `fetchEvents()` or `subscribe()` is called, NDK first checks the cache adapter
2. Cached events are returned immediately (the `onEvents` handler fires)
3. A relay query is sent simultaneously
4. When relay responses arrive, they update the cache and fire the `onEvent` handler
5. For replaceable events, newer versions replace older cached versions

### Dexie Adapter (Browser / IndexedDB)

The most common adapter for web applications:

```typescript
import NDK from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";

const cacheAdapter = new NDKCacheAdapterDexie({
  dbName: "my-nostr-app",
});

const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.damus.io"],
  cacheAdapter: cacheAdapter,
});
```

Dexie wraps IndexedDB, storing events, user profiles, and tag indexes in the browser's local database. Data persists across sessions.

### Redis Adapter (Server)

```typescript
import NDKCacheAdapterRedis from "@nostr-dev-kit/ndk-cache-redis";

const cacheAdapter = new NDKCacheAdapterRedis({
  url: "redis://localhost:6379",
});

const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.damus.io"],
  cacheAdapter: cacheAdapter,
});
```

### SQLite Adapter (Mobile / Desktop)

Used primarily with `ndk-mobile` for React Native applications:

```typescript
import NDKCacheAdapterSqlite from "@nostr-dev-kit/ndk-cache-sqlite";

const cacheAdapter = new NDKCacheAdapterSqlite("nostr-cache.db");
```

### Custom Cache Adapters

You can implement the `NDKCacheAdapter` interface to use any storage backend:

```typescript
interface NDKCacheAdapter {
  query(subscription: NDKSubscription): Promise<void>;
  setEvent(event: NDKEvent, filters: NDKFilter[]): Promise<void>;
  deleteEvent?(event: NDKEvent): Promise<void>;
  fetchProfile?(pubkey: Hexpubkey): Promise<NDKUserProfile | null>;
  saveProfile?(pubkey: Hexpubkey, profile: NDKUserProfile): Promise<void>;
}
```

---

## Outbox Model (NIP-65)

The outbox model is one of NDK's most sophisticated features. It implements automatic relay selection based on NIP-65 relay lists, ensuring that queries are sent to the relays where target users actually publish their events.

### Why It Matters

Without the outbox model, a client connects to a fixed set of relays and hopes that all desired content is available there. This creates centralization pressure -- everyone gravitates to the same large relays. The outbox model allows Nostr to function as a truly decentralized network where each user can use their preferred relays.

### How It Works

1. NDK discovers each user's relay list (kind 10002 events per NIP-65)
2. When querying for events from specific authors, NDK routes queries to the relays those authors write to
3. When publishing events for others to see, NDK publishes to the relays where followers read from
4. This routing is transparent to the application developer

### Enabling the Outbox Model

```typescript
const ndk = new NDK({
  // Your application's default relays
  explicitRelayUrls: [
    "wss://relay.damus.io",
    "wss://nos.lol",
  ],

  // Relays that aggregate NIP-65 relay lists
  outboxRelayUrls: ["wss://purplepag.es"],

  // Enable the outbox model
  enableOutboxModel: true,
});

await ndk.connect();

// Now, fetching events automatically routes to the correct relays:
const events = await ndk.fetchEvents({
  kinds: [1],
  authors: ["pubkey1_hex", "pubkey2_hex"],
});
// NDK computes: pubkey1 publishes to relay A and B,
// pubkey2 publishes to relay B and C.
// It creates optimized subscriptions to relays A, B, and C.
```

### Outbox Relay Discovery

NDK uses `purplepag.es` (or other configured outbox relays) to bootstrap relay discovery. It fetches kind 10002 events to determine each user's read and write relays, then routes queries accordingly.

---

## Subscription Management

NDK provides sophisticated subscription management that goes well beyond raw relay REQ messages.

### Subscription Deduplication / Batching

When multiple UI components request similar data, NDK batches their requests:

```typescript
// Component A requests user profiles
ndk.subscribe({ kinds: [0], authors: ["pubkey_a"] });

// Component B requests another profile (within the groupable delay window)
ndk.subscribe({ kinds: [0], authors: ["pubkey_b"] });

// NDK combines these into a single relay REQ:
// ["REQ", "sub_id", { "kinds": [0], "authors": ["pubkey_a", "pubkey_b"] }]
```

This is controlled by the `groupableDelay` option (default: a small delay in milliseconds). NDK waits briefly before sending a subscription to allow multiple components to contribute their filters.

### EOSE Handling

EOSE (End Of Stored Events) signals that a relay has sent all its stored events matching a filter. NDK supports two patterns:

```typescript
// One-shot query: close after receiving stored events
const sub = ndk.subscribe(filter, { closeOnEose: true });
sub.on("event", handleEvent);

// Persistent subscription: keep listening for new events after EOSE
const liveSub = ndk.subscribe(filter, { closeOnEose: false });
liveSub.on("event", handleEvent);
liveSub.on("eose", () => {
  console.log("Historical events loaded, now listening for new ones");
});
```

### Closing Subscriptions

```typescript
// Close a specific subscription
sub.stop();

// NDK automatically handles cleanup when subscriptions are garbage collected
// in framework integrations (e.g., Svelte onDestroy, React useEffect cleanup)
```

---

## Event Kinds and Wrappers

NDK provides typed wrapper classes for common event kinds, adding kind-specific convenience methods:

| Kind | NIP | NDK Class / Handling | Description |
|------|-----|---------------------|-------------|
| 0 | NIP-01 | Profile parsing via `NDKUser` | User metadata |
| 1 | NIP-01 | `NDKEvent` | Short text note |
| 3 | NIP-02 | Contact list via `NDKUser.follows()` | Contact list |
| 4 | NIP-04 | Encrypted DMs (legacy) | Direct messages (deprecated) |
| 6 | NIP-18 | `event.repost()` | Reposts |
| 7 | NIP-25 | `event.react()` | Reactions |
| 10002 | NIP-65 | Relay list handling | Relay list metadata |
| 30023 | NIP-23 | Long-form article wrappers | Long-form content |
| 9735 | NIP-57 | Zap receipt handling | Zap receipts |
| 1059 | NIP-59 | Gift wrap / sealed events | NIP-17 DMs |
| 13194 | NIP-47 | Wallet connect info | NWC info event |
| 37375 | NIP-60 | Cashu wallet events | Cashu wallet |

### Working with Specific Event Types

```typescript
// Fetch long-form articles
const articles = await ndk.fetchEvents({
  kinds: [30023],
  authors: ["pubkey_hex..."],
});

for (const article of articles) {
  const title = article.tagValue("title");
  const summary = article.tagValue("summary");
  const dTag = article.tagValue("d");  // article identifier
  console.log(`${title}: ${summary}`);
}

// Fetch a user's NIP-65 relay list
const relayListEvents = await ndk.fetchEvents({
  kinds: [10002],
  authors: ["pubkey_hex..."],
});
```

---

## Wallet Support

The `@nostr-dev-kit/ndk-wallet` package provides comprehensive wallet functionality.

### NIP-47: Nostr Wallet Connect (NWC)

NWC allows applications to interact with Lightning wallets through Nostr:

```typescript
import { NDKNwc } from "@nostr-dev-kit/ndk-wallet";

// Connect to a wallet via NWC connection string
const nwc = new NDKNwc({
  ndk,
  uri: "nostr+walletconnect://pubkey?relay=wss://relay&secret=hex",
});

await nwc.connect();

// Pay an invoice
const result = await nwc.payInvoice("lnbc1...");

// Get balance
const balance = await nwc.getBalance();
```

### NIP-57: Zaps

```typescript
// Zap an event
await event.zap(1000, "Great note!");  // 1000 sats

// Zap a user
await user.zap(5000, "Thanks for your work!");
```

### NIP-60: Cashu eCash Wallets

NDK supports Cashu eCash wallets stored on Nostr relays:

```typescript
import { NDKCashuWallet } from "@nostr-dev-kit/ndk-wallet";

// The wallet discovers Cashu tokens stored as Nostr events
// and provides methods for sending, receiving, and managing eCash
```

### Nutzap Monitor

NDK includes a Nutzap monitor that automatically watches for incoming Nutzaps (NIP-61) and redeems them:

```typescript
import { NDKNutzapMonitor } from "@nostr-dev-kit/ndk-wallet";

const monitor = new NDKNutzapMonitor(ndk, wallet);
monitor.start();
monitor.on("nutzap:redeemed", (nutzap) => {
  console.log(`Redeemed ${nutzap.amount} sats`);
});
```

---

## Framework Integrations

### Svelte (ndk-svelte)

NDK has first-class Svelte 5 support with reactive runes:

```svelte
<script>
  import NDKSvelte from "@nostr-dev-kit/ndk-svelte";
  import { onMount } from "svelte";

  const ndk = new NDKSvelte({
    explicitRelayUrls: ["wss://relay.damus.io"],
  });

  onMount(() => ndk.connect());

  // Reactive subscription -- returns a Svelte store
  const notes = ndk.storeSubscribe(
    { kinds: [1], limit: 50 },
    { closeOnEose: false }
  );
</script>

{#each $notes as note}
  <div class="note">
    <p>{note.content}</p>
    <small>{new Date(note.created_at * 1000).toLocaleString()}</small>
  </div>
{/each}
```

The Svelte store subscription automatically:
- Subscribes on component mount
- Updates reactively as new events arrive
- Unsubscribes when the component is destroyed
- Deduplicates events

### React (ndk-react)

```tsx
import { NDKProvider, useNDK, useSubscription } from "@nostr-dev-kit/ndk-react";

// Wrap your app with NDKProvider
function App() {
  return (
    <NDKProvider
      relayUrls={["wss://relay.damus.io", "wss://nos.lol"]}
    >
      <Feed />
    </NDKProvider>
  );
}

function Feed() {
  const { ndk } = useNDK();

  const { events } = useSubscription({
    filters: [{ kinds: [1], limit: 50 }],
    opts: { closeOnEose: false },
  });

  return (
    <div>
      {events.map((event) => (
        <div key={event.id}>
          <p>{event.content}</p>
        </div>
      ))}
    </div>
  );
}
```

### React Native (ndk-mobile)

```typescript
// IMPORTANT: import from ndk-mobile instead of ndk
import NDK, { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk-mobile";

// ndk-mobile re-exports all core NDK classes with mobile-optimized
// defaults (SQLite cache, etc.)
const ndk = new NDK({
  explicitRelayUrls: ["wss://relay.damus.io"],
});
```

When using `ndk-mobile`, import directly from `@nostr-dev-kit/ndk-mobile` rather than `@nostr-dev-kit/ndk`. The mobile package re-exports the same classes with platform-appropriate defaults.

---

## Comparison with nostr-tools

| Aspect | nostr-tools | NDK |
|--------|-------------|-----|
| **Level** | Low-level protocol primitives | High-level application framework |
| **Philosophy** | Minimal, tree-shakeable, unopinionated | Batteries-included, opinionated defaults |
| **Relay management** | Manual -- you open and manage each connection | Automatic pool management, outbox model |
| **Caching** | None -- you implement your own | Built-in with pluggable adapters |
| **Subscriptions** | Raw REQ/CLOSE, manual dedup | Deduplication, batching, EOSE handling |
| **Signing** | Helper functions | Signer interface with NIP-07, NIP-46, private key |
| **Framework support** | None (framework-agnostic) | Svelte 5, React, React Native bindings |
| **Outbox model** | Not included | Built-in NIP-65 relay routing |
| **Wallet** | Not included | NWC, Cashu, Zap support |
| **Bundle size** | Smaller, tree-shakeable | Larger, but modular packages |
| **Best for** | CLI tools, backends, libraries, learning | Client applications, production apps |
| **NIP coverage** | Broad (individual NIP modules) | Deep (NIP-01, 04, 07, 18, 42, 46, 57, 59, 60, 61, 65) |

### When to Use nostr-tools

- Building a backend service or relay
- Building a library that other developers will consume
- Wanting minimal dependencies and full control
- Learning the Nostr protocol at the wire level
- Command-line tools or scripts

### When to Use NDK

- Building a client application (web, mobile, desktop)
- Wanting relay management, caching, and outbox model handled for you
- Using Svelte, React, or React Native
- Needing wallet integration (NWC, Cashu, Zaps)
- Building a production application where UX (fast loading, offline support) matters
- Multi-account support

### Using Them Together

NDK and nostr-tools are not mutually exclusive. You can use nostr-tools for specific low-level operations within an NDK-based application:

```typescript
import NDK from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

const ndk = new NDK({ explicitRelayUrls: [...] });
await ndk.connect();

// Use nostr-tools for NIP-19 encoding/decoding
const { data } = nip19.decode("npub1...");

// Use NDK for high-level operations
const user = ndk.getUser({ pubkey: data });
await user.fetchProfile();
```

---

## Common Patterns and Recipes

### Pattern 1: Initialize NDK with Full Configuration

```typescript
import NDK from "@nostr-dev-kit/ndk";
import { NDKNip07Signer } from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";

const cacheAdapter = new NDKCacheAdapterDexie({ dbName: "my-app" });
const signer = new NDKNip07Signer();

const ndk = new NDK({
  explicitRelayUrls: [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
    "wss://relay.nostr.band",
  ],
  outboxRelayUrls: ["wss://purplepag.es"],
  enableOutboxModel: true,
  cacheAdapter,
  signer,
});

await ndk.connect();
```

### Pattern 2: Build a Timeline / Feed

```typescript
async function loadFeed(ndk: NDK, pubkeys: string[]) {
  const events = await ndk.fetchEvents({
    kinds: [1, 6],           // notes and reposts
    authors: pubkeys,
    limit: 100,
  });

  // Sort by timestamp, newest first
  return Array.from(events).sort(
    (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)
  );
}
```

### Pattern 3: Publish a Long-Form Article (NIP-23)

```typescript
const article = new NDKEvent(ndk);
article.kind = 30023;
article.content = "# My Article\n\nThis is a long-form article...";
article.tags = [
  ["d", "my-article-slug"],
  ["title", "My Article"],
  ["summary", "A brief summary of my article"],
  ["image", "https://example.com/cover.jpg"],
  ["t", "nostr"],
  ["t", "tutorial"],
  ["published_at", String(Math.floor(Date.now() / 1000))],
];
await article.publish();
```

### Pattern 4: Encrypted Direct Messages (NIP-04 Legacy)

```typescript
const recipient = ndk.getUser({ npub: "npub1..." });

const dm = new NDKEvent(ndk);
dm.kind = 4;
dm.content = await ndk.signer!.encrypt(recipient, "Hello, secret message!");
dm.tags = [["p", recipient.pubkey]];
await dm.publish();
```

### Pattern 5: Fetch and Display a User Profile Card

```typescript
async function getUserCard(ndk: NDK, npub: string) {
  const user = ndk.getUser({ npub });
  await user.fetchProfile();

  return {
    name: user.profile?.displayName || user.profile?.name || "Anonymous",
    about: user.profile?.about || "",
    picture: user.profile?.picture || "/default-avatar.png",
    nip05: user.profile?.nip05 || "",
    npub: user.npub,
    lud16: user.profile?.lud16,  // Lightning address for tipping
  };
}
```

### Pattern 6: Real-Time Global Feed with Hashtag Filter

```typescript
const sub = ndk.subscribe(
  {
    kinds: [1],
    "#t": ["bitcoin"],
    since: Math.floor(Date.now() / 1000),
  },
  { closeOnEose: false }
);

sub.on("event", (event: NDKEvent) => {
  // Append to feed in real-time
  appendToFeed(event);
});
```

### Pattern 7: Multi-Account Session Management

```typescript
// Login with first account
const signer1 = new NDKNip07Signer();
await ndk.sessions.login(signer1);

// Switch to a different account
const signer2 = new NDKPrivateKeySigner("nsec1...");
await ndk.sessions.login(signer2);

// Access active user
const activeUser = ndk.activeUser;
console.log("Current user:", activeUser?.npub);
```

### Pattern 8: Web of Trust Filtering

```typescript
// NDK supports Web of Trust scoring to filter out spam
// The WoT module scores users based on the social graph,
// allowing applications to prioritize content from
// trusted connections
```

### Pattern 9: Negentropy Sync

```typescript
import { NDKSync } from "@nostr-dev-kit/sync";

// Negentropy set reconciliation allows efficient syncing
// between local cache and relays, transferring only the
// difference rather than re-fetching everything
```

---

## Applications Built with NDK

NDK powers many production Nostr clients and tools:

| Application | Framework | Description |
|-------------|-----------|-------------|
| **Highlighter** | Svelte | Social highlighting and annotation platform |
| **Coracle** | Svelte | Feature-rich Nostr client |
| **Zapstr** | Svelte | Music streaming on Nostr |
| **Lume** | Tauri | Desktop Nostr client |
| **Olas** | React Native | Mobile-first Nostr client |
| **Listr.lol** | Svelte | List management |
| **Flockstr** | -- | Events and meetups |
| **Ostrich.work** | Svelte | Task/project management |
| **nsecBunker** | TypeScript | NIP-46 remote signing service |
| **Pinstr** | React | Web client |
| **Nostr App Manager** | React | Application discovery |
| **Stemstr** | -- | Music creation and sharing |
| **zapddit** | -- | Reddit-style discussions |
| **Swarmstr** | -- | Search and discovery |

A full list is maintained in [REFERENCES.md](https://github.com/nostr-dev-kit/ndk/blob/master/REFERENCES.md).

---

## Key Takeaways

1. **NDK is the go-to choice for building Nostr client applications** -- it handles the hard parts (relay management, caching, outbox model) so you can focus on your app.

2. **The outbox model is critical** -- enabling it makes your application a good citizen of the decentralized Nostr network.

3. **Caching is not optional** -- always configure a cache adapter for production applications. Users expect instant loading.

4. **Signers are pluggable** -- design your app against the `NDKSigner` interface, not a specific implementation. Users should be able to log in with browser extensions, remote signers, or private keys.

5. **Subscription deduplication is automatic** -- you do not need to worry about multiple components creating redundant relay traffic.

6. **The monorepo structure is intentional** -- import only the packages you need. A Svelte app uses `ndk` + `ndk-svelte` + `ndk-cache-dexie`. A React Native app uses `ndk-mobile`.

---

## Sources

- [NDK GitHub Repository](https://github.com/nostr-dev-kit/ndk)
- [NDK Documentation Portal](https://nostr-dev-kit.github.io/ndk/)
- [NDK.fyi Documentation](https://ndk.fyi/docs/)
- [NDKit.com Introduction](https://ndkit.com/introduction/)
- [NDK npm Package](https://www.npmjs.com/package/@nostr-dev-kit/ndk)
- [NDK REFERENCES.md -- Projects Using NDK](https://github.com/nostr-dev-kit/ndk/blob/master/REFERENCES.md)
- [NDK Wallet README](https://github.com/nostr-dev-kit/ndk/blob/master/wallet/README.md)
- [NDK Cache Dexie Repository](https://github.com/nostr-dev-kit/ndk-cache-dexie)
- [NDK Svelte Repository](https://github.com/nostr-dev-kit/ndk-svelte)
- [NDK React Repository](https://github.com/nostr-dev-kit/ndk-react)
- [NDK Mobile Package](https://github.com/nostr-dev-kit/ndk/tree/master/ndk-mobile)
- [Hello Nostr Tutorial](https://ndkit.com/tutorials/hello-nostr/)
- [NobsBitcoin: NDK v1.0 Released](https://www.nobsbitcoin.com/ndk-v1-0-0/)
