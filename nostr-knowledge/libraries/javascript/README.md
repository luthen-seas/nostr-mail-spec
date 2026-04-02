# JavaScript / TypeScript NOSTR Libraries

The JavaScript/TypeScript ecosystem has the most mature and diverse set of NOSTR libraries. This document covers the major players, their trade-offs, and when to reach for each one.

---

## Core Libraries

### nostr-tools (nbd-wtf/nostr-tools)

**The foundational NOSTR library for JavaScript and TypeScript.**

- **Repository:** https://github.com/nbd-wtf/nostr-tools
- **Registry:** npm (`nostr-tools`) and JSR (`@nostr/tools`)
- **Current version:** 2.23.x
- **License:** Unlicense
- **Dependencies:** Only `@noble/*` and `@scure/*` cryptographic packages

nostr-tools provides the lowest-level protocol primitives: key generation, event signing and verification, relay communication, filter matching, and individual NIP module implementations. Almost every JS-based NOSTR client depends on it either directly or transitively.

Key characteristics:
- Tree-shakeable ESM package with individual NIP module imports
- Pure JavaScript cryptography by default, with optional WASM acceleration (6.8x faster verification)
- TypeScript-first with strict types for events, filters, and all protocol entities
- Zero opinion on framework, state management, or caching
- Covers 30+ NIPs with dedicated submodules

See [nostr-tools.md](./nostr-tools.md) for a comprehensive deep dive and [api-reference.md](./api-reference.md) for the API reference.

---

### NDK (nostr-dev-kit/ndk)

**A high-level framework for building full-featured NOSTR applications.**

- **Repository:** https://github.com/nostr-dev-kit/ndk
- **Website:** https://ndk.fyi
- **Registry:** npm (`@nostr-dev-kit/ndk`)

NDK is a monorepo containing everything needed for modern NOSTR clients, built on top of nostr-tools primitives. It adds substantial abstractions:

- **Outbox model / gossip-style relay selection** -- automatically determines which relays to use for reads and writes based on user relay lists (NIP-65)
- **Database-agnostic caching** -- pluggable cache adapters (IndexedDB, SQLite, Dexie, LevelDB) to reduce relay load and improve responsiveness
- **Subscription deduplication** -- consolidates overlapping subscriptions into single relay requests
- **Signer abstraction** -- unified interface for NIP-07 browser extensions, NIP-46 remote signers, private keys, and hardware wallets
- **Web of Trust scoring** -- built-in trust graph traversal
- **Negentropy sync** -- efficient set reconciliation with relays
- **Framework bindings** -- first-class packages for Svelte (`@nostr-dev-kit/ndk-svelte`), React (`@nostr-dev-kit/ndk-react`), and React Native

---

## When to Use nostr-tools vs NDK

| Criterion | nostr-tools | NDK |
|---|---|---|
| **Use case** | Scripts, bots, CLI tools, low-level protocol work, custom relay logic | Full client apps, social feeds, multi-relay coordination |
| **Abstraction level** | Primitive -- you manage relays, subscriptions, caching | High-level -- outbox model, caching, and dedup built in |
| **Bundle size** | Minimal (tree-shakeable, only import what you need) | Larger (brings relay management, caching infra) |
| **Learning curve** | Must understand NOSTR protocol details | Handles protocol complexity for you |
| **Framework opinion** | None | Svelte, React, React Native bindings available |
| **Relay selection** | Manual -- you specify relay URLs | Automatic via outbox model (NIP-65) |
| **Caching** | None built in | Pluggable cache adapters |
| **Signer management** | Manual event signing | Unified signer abstraction |

**Rule of thumb:**
- Building a bot, relay, CLI tool, or learning the protocol? Use **nostr-tools**.
- Building a user-facing application with feeds, profiles, and DMs? Start with **NDK** (which uses nostr-tools internally).
- Need surgical control over specific protocol operations? Import individual **nostr-tools** NIP modules alongside NDK.

---

## Other Notable JavaScript Libraries

### nostr-fetch

- **Repository:** https://github.com/jiftechnify/nostr-fetch
- Utility library for efficiently fetching past events from relays
- Provides `fetchEvents()`, `fetchLastEvent()`, `fetchAllEvents()` with automatic relay management
- Good for read-heavy applications that mostly query historical data

### rx-nostr

- **Repository:** https://github.com/penpenpng/rx-nostr
- RxJS-based reactive NOSTR client
- Models relay communication as observable streams
- Supports flexible multi-relay communication with backpressure
- Best fit for applications already using RxJS

### nostr-hooks

- **Repository:** https://github.com/ostyjs/nostr-hooks
- React hooks library built on top of NDK
- Stateful wrapper providing `useSubscribe`, `useProfile`, `useNdk` hooks
- Automatically consolidates subscriptions from multiple components into single relay requests
- Low bandwidth consumption through intelligent batching

### nostr-react (legacy)

- **Repository:** https://github.com/t4t5/nostr-react
- Earlier React hooks library providing `useNostr` and `useNostrEvents`
- Automatic subscription batching to prevent relay flooding
- Less actively maintained; nostr-hooks or NDK React bindings are generally preferred for new projects

### @nostr/gadgets

- **Registry:** JSR (`@nostr/gadgets`)
- Higher-level companion to `@nostr/tools` from the same maintainer (fiatjaf)
- Provides convenience functions and patterns built on the nostr-tools primitives
- Lighter-weight alternative to NDK for common operations

---

## Runtime Compatibility

nostr-tools targets modern JavaScript runtimes. Compatibility details:

| Runtime | Support | Notes |
|---|---|---|
| **Node.js 18+** | Full | Requires `ws` package for WebSocket support. Older versions also need `node-fetch@2`. |
| **Node.js 20+** | Full | Built-in `fetch`; still needs `ws` for WebSocket. |
| **Deno** | Full | Use JSR import: `@nostr/tools`. Native WebSocket and fetch. |
| **Bun** | Full | Native WebSocket and fetch support. |
| **Browsers** | Full | Primary target. Native WebSocket and fetch. |
| **Cloudflare Workers** | Partial | Works for event creation, signing, and verification. WebSocket usage depends on Workers WebSocket API compatibility. Use `connect()` with the Workers WebSocket constructor. |
| **React Native** | Partial | Works with polyfills for `crypto.getRandomValues`. Consider `react-native-get-random-values`. |

### TypeScript Requirements

nostr-tools v2.x requires **TypeScript 5.0+** due to use of template literal types and `const` type parameters.

### Installation

```bash
# npm (most common)
npm install nostr-tools

# With JSR (for Deno or modern runtimes)
npx jsr add @nostr/tools

# For Node.js, also install WebSocket support
npm install ws
```

---

## Package Ecosystem Map

```
@noble/curves, @noble/hashes, @noble/ciphers
@scure/base, @scure/bip32, @scure/bip39
            |
            v
    +-----------------+
    |  nostr-tools    |  <-- Protocol primitives
    |  (@nostr/tools) |
    +-----------------+
            |
     +------+------+
     |             |
     v             v
+----------+  +------------------+
| @nostr/  |  |       NDK        |  <-- Application framework
| gadgets  |  | @nostr-dev-kit/* |
+----------+  +------------------+
                       |
              +--------+--------+
              |        |        |
              v        v        v
          ndk-svelte  ndk-react  nostr-hooks
```

---

## Further Reading

- [nostr-tools Deep Dive](./nostr-tools.md) -- Comprehensive guide to the core library
- [API Reference](./api-reference.md) -- Key functions and types with code examples
- [Examples](./examples/) -- Runnable TypeScript examples
- [NOSTR Protocol Specification](https://github.com/nostr-protocol/nips) -- The NIPs repository
