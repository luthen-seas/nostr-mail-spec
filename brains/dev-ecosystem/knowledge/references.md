# Developer Ecosystem References

## NOSTR Libraries and SDKs

### nostr-tools (TypeScript/JavaScript)
- **Repository:** https://github.com/nbd-wtf/nostr-tools
- **Package:** `npm install nostr-tools`
- **Documentation:** https://github.com/nbd-wtf/nostr-tools/blob/master/README.md
- **Key modules:**
  - `nostr-tools/pure` — Core event creation and signing (no side effects)
  - `nostr-tools/relay` — Single relay connection
  - `nostr-tools/pool` — Multi-relay connection pool
  - `nostr-tools/nip04` — Deprecated DM encryption
  - `nostr-tools/nip44` — Current encryption (ChaCha20-Poly1305)
  - `nostr-tools/nip59` — Gift wrapping
  - `nostr-tools/nip19` — Bech32 encoding (npub, nsec, nevent, nprofile)
  - `nostr-tools/nip05` — NIP-05 address resolution
- **Relevance:** Primary reference implementation for NOSTR Mail TypeScript SDK. Most functions needed for NOSTR Mail already exist in nostr-tools.

### NDK (Nostr Development Kit)
- **Repository:** https://github.com/nostr-dev-kit/ndk
- **Package:** `npm install @nostr-dev-kit/ndk`
- **Documentation:** https://ndk.fyi/
- **Key features:**
  - Signer abstraction (NIP-07, NIP-46, private key)
  - Relay pool with automatic outbox model (NIP-65)
  - Event caching and deduplication
  - Subscription management
  - Zap (NIP-57) support
  - Built-in NIP-05 resolution
- **Relevance:** Higher-level alternative to nostr-tools. NOSTR Mail SDK could be built on top of NDK for relay management and signer abstraction.

### rust-nostr
- **Repository:** https://github.com/rust-nostr/nostr
- **Crate:** `nostr` (protocol), `nostr-sdk` (client SDK)
- **Documentation:** https://docs.rs/nostr-sdk/
- **Key features:**
  - Complete NIP implementation in Rust
  - FFI bindings via UniFFI (Python, Kotlin, Swift, JavaScript, C#, Flutter)
  - NIP-44 and NIP-59 support
  - Relay pool with NIP-65
- **Relevance:** If building NOSTR Mail core in Rust with multi-language bindings, rust-nostr is the foundation.

### go-nostr
- **Repository:** https://github.com/nbd-wtf/go-nostr
- **Module:** `github.com/nbd-wtf/go-nostr`
- **Documentation:** https://pkg.go.dev/github.com/nbd-wtf/go-nostr
- **Key features:**
  - Event creation, signing, verification
  - Relay pool
  - NIP-44, NIP-59 support
  - NIP-05 resolution
- **Relevance:** Foundation for Go-based NOSTR Mail relay or bridge implementations.

---

## Cashu Libraries

### @cashu/cashu-ts (TypeScript)
- **Repository:** https://github.com/cashubtc/cashu-ts
- **Package:** `npm install @anthropic-ai/cashu-ts`
- **Documentation:** https://github.com/cashubtc/cashu-ts/blob/main/README.md
- **Key classes:**
  - `CashuMint` — Mint interaction (get keys, request mint, melt)
  - `CashuWallet` — Wallet operations (receive, send, check proofs)
  - `Token` — Token encoding/decoding (cashuA... format)
- **Relevance:** Primary library for Cashu postage implementation in TypeScript NOSTR Mail client.

### cdk (Cashu Development Kit — Rust)
- **Repository:** https://github.com/cashubtc/cdk
- **Crate:** `cdk`
- **Relevance:** For Rust-based NOSTR Mail implementations or mint operators.

### nutshell (Cashu reference mint — Python)
- **Repository:** https://github.com/cashubtc/nutshell
- **Relevance:** Reference Cashu mint implementation; useful for running test mints during development.

---

## SDK Design References (Gold Standards)

### Stripe SDK
- **Documentation:** https://stripe.com/docs
- **Why it is the gold standard:**
  - Progressive complexity: one-liner for simple charges, full control for complex flows
  - Consistent naming across languages (JS, Python, Ruby, Go, Java, .NET, PHP)
  - Typed errors with machine-readable codes
  - Idempotency keys for safe retries
  - Comprehensive webhook handling
  - Test mode with test API keys (no real money)
  - Request/response logging for debugging
- **Patterns to adopt:**
  - Resource-based API: `mail.messages.send()`, `mail.contacts.list()`
  - Consistent pagination: `{ data: T[], hasMore: boolean, cursor: string }`
  - Auto-pagination: `for await (const msg of mail.messages.list())`
  - Typed error codes: `error.code === 'recipient_not_found'`

### Twilio SDK
- **Documentation:** https://www.twilio.com/docs
- **Why it is relevant:**
  - Messaging-focused API (SMS, email via SendGrid, voice)
  - Simple send: `client.messages.create({ to, from, body })`
  - Webhook-based incoming message handling
  - Multi-channel abstraction
- **Patterns to adopt:**
  - Message-centric API design
  - Status callbacks for delivery confirmation
  - Conversation threading

### AWS SDK v3
- **Documentation:** https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/
- **Why it is relevant:**
  - Modular design: import only what you need
  - Middleware stack: intercept and modify requests/responses
  - Credential provider chain: multiple auth methods with fallback
- **Patterns to adopt:**
  - Modular imports: `import { send } from '@nostr-mail/send'`
  - Middleware for logging, retry, auth
  - Signer provider chain: NIP-07 -> NIP-46 -> nsec prompt

---

## API Documentation Generation

### TypeDoc (TypeScript)
- **URL:** https://typedoc.org/
- **Usage:** Generate HTML/JSON API docs from TypeScript source + JSDoc comments
- **Configuration:** `typedoc.json` at project root
- **Best practices:**
  - Document every exported function, class, interface, type, and enum
  - Use `@param`, `@returns`, `@throws`, `@example` tags
  - Group related items with `@category`
  - Use `@link` for cross-references

### Rustdoc (Rust)
- **URL:** https://doc.rust-lang.org/rustdoc/
- **Usage:** `cargo doc --open`
- **Best practices:**
  - Every public item gets a doc comment (`///`)
  - Include examples in doc comments (they are tested by `cargo test`)
  - Use `# Examples`, `# Errors`, `# Panics` sections

### Sphinx + autodoc (Python)
- **URL:** https://www.sphinx-doc.org/
- **Alternative:** mkdocstrings (https://mkdocstrings.github.io/) with MkDocs
- **Best practices:**
  - Google or NumPy docstring style
  - Type hints in function signatures (enforced by mypy)
  - Auto-generated from source with manual narrative guides

### GoDoc (Go)
- **URL:** https://pkg.go.dev/
- **Usage:** Comments directly above exported identifiers are documentation
- **Best practices:**
  - First sentence is the summary (shown in package listings)
  - Include example functions (`func ExampleSend()`) — they are tested

---

## Testing Frameworks

### Vitest (TypeScript — recommended)
- **URL:** https://vitest.dev/
- **Why:** Fast, ESM-native, compatible with Jest API, built-in TypeScript support, watch mode
- **Usage:** `npx vitest` (runs all `*.test.ts` files)
- **Key features:** Snapshot testing, mocking, code coverage, concurrent tests

### Jest (TypeScript — alternative)
- **URL:** https://jestjs.io/
- **Why:** Most widely used, massive ecosystem, well-documented
- **Note:** Requires additional configuration for TypeScript and ESM

### pytest (Python)
- **URL:** https://docs.pytest.org/
- **Why:** De facto standard for Python testing
- **Key plugins:** pytest-asyncio (for async tests), pytest-cov (coverage)

### cargo test (Rust)
- **Built-in:** No additional framework needed
- **Key features:** Doc tests (examples in documentation are tested), integration tests in `tests/` directory

### go test (Go)
- **Built-in:** No additional framework needed
- **Conventions:** Test files named `*_test.go`, test functions named `TestXxx`

---

## Runtime Considerations

### Bun
- **URL:** https://bun.sh/
- **Relevance:** Fast JavaScript/TypeScript runtime; native WebSocket support; built-in test runner
- **Advantages for NOSTR Mail:** Faster startup, native TypeScript execution, built-in SQLite (for local message storage)
- **Consideration:** Smaller ecosystem than Node.js; some npm packages may have compatibility issues

### Node.js
- **URL:** https://nodejs.org/
- **Relevance:** Most widely deployed JavaScript runtime; maximum compatibility
- **WebSocket:** Requires `ws` package (not built-in in Node.js < 21; experimental in 21+)
- **Consideration:** Slower than Bun for many operations; requires TypeScript compilation step

### Browser
- **Relevance:** NOSTR Mail clients may run in the browser (web app, browser extension)
- **WebSocket:** Native `WebSocket` API
- **Crypto:** Web Crypto API for standard algorithms; `@noble/ciphers` for NIP-44 (ChaCha20 not in Web Crypto)
- **Storage:** IndexedDB for local message storage; localStorage for settings
- **Consideration:** CORS restrictions on NIP-05 resolution; no filesystem access for attachments

### Deno
- **URL:** https://deno.land/
- **Relevance:** Secure-by-default runtime; native TypeScript; npm compatibility
- **Consideration:** Growing adoption but smaller than Node.js; good for relay implementations

---

## WebSocket Libraries

### ws (Node.js)
- **Package:** `npm install ws`
- **URL:** https://github.com/websockets/ws
- **Relevance:** Standard WebSocket implementation for Node.js; used by nostr-tools internally

### Native WebSocket (Browser / Bun / Deno)
- **No package needed:** Built into the runtime
- **API:** Standard `WebSocket` constructor
- **Consideration:** Reconnection logic must be implemented manually (or use a wrapper)

### WebSocket reconnection patterns
- **reconnecting-websocket:** `npm install reconnecting-websocket` — drop-in replacement with auto-reconnect
- **Custom implementation:** Exponential backoff with jitter; track relay health; circuit breaker pattern

---

## Build and Distribution

### Package Managers
- **npm:** Primary distribution for TypeScript/JavaScript packages
- **crates.io:** Primary distribution for Rust crates
- **PyPI:** Primary distribution for Python packages
- **Go modules:** Distributed via Git repository (no central registry)

### Monorepo Tools
- **Turborepo:** https://turbo.build/ — for managing multiple packages in one repo
- **nx:** https://nx.dev/ — alternative monorepo tool
- **Relevance:** NOSTR Mail SDK may be a monorepo with multiple packages (`@nostr-mail/sdk`, `@nostr-mail/cli`, `@nostr-mail/test-utils`, etc.)

### CI/CD
- **GitHub Actions:** Standard for open-source projects; free for public repos
- **Key workflows:**
  - Test on push/PR (all supported platforms)
  - Lint and format check
  - Build and type check
  - Publish to package registry on tag/release
  - Security audit (`npm audit`, `cargo audit`)
