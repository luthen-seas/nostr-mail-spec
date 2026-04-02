# Developer Ecosystem Fundamentals

## SDK Design Principles

### Principle of Least Surprise
The API should do what the name suggests. A developer reading the code should be able to guess what a method does without reading documentation.

**Good:**
```typescript
mail.send({ to, subject, body })        // Obviously sends a message
mail.inbox({ since })                    // Obviously gets inbox messages
message.reply({ body })                  // Obviously replies to a message
message.markAsRead()                     // Obviously marks as read
```

**Bad:**
```typescript
mail.process({ target, payload, mode })  // What does "process" mean?
mail.execute({ type: 'send', ... })      // Over-abstracted, unclear
mail.handleEvent({ kind: 15, ... })      // Leaks protocol internals
```

**Rules:**
- Method names should be verbs: `send`, `receive`, `reply`, `forward`, `delete`, `search`
- Property names should be nouns: `inbox`, `sender`, `subject`, `body`, `attachments`
- Boolean properties should read as questions: `isRead`, `hasAttachments`, `isEncrypted`
- Avoid abbreviations: `message` not `msg`, `attachment` not `att`, `recipient` not `rcpt`

### Progressive Complexity
Simple things should be simple. Complex things should be possible. The SDK should have layers of abstraction that let a developer choose their depth.

**Layer 1 — One-liner (most common use case):**
```typescript
await mail.send({ to: 'bob@example.com', subject: 'Hello', body: 'World' })
```

**Layer 2 — Customized (power user):**
```typescript
await mail.send({
  to: 'bob@example.com',
  subject: 'Hello',
  body: 'World',
  attachments: [file],
  postage: { amount: 21, unit: 'sat' },
  relays: ['wss://relay.example.com'],
})
```

**Layer 3 — Low-level (library developer):**
```typescript
const event = await mail.buildEvent({ to, subject, body })
const wrapped = await nip59.giftWrap(event, recipientPubkey)
await relay.publish(wrapped)
```

### Sensible Defaults
The SDK should work out of the box without configuration. Defaults should be safe, performant, and aligned with best practices.

**Default behaviors:**
- Encryption: always on (NIP-44 + NIP-59 gift wrap). No plaintext mode.
- Relay selection: use recipient's NIP-65 relay list (outbox model). Fallback to well-known relays.
- Key management: use NIP-07 browser extension signer if available. Prompt for nsec if not.
- Attachments: auto-upload to Blossom, encrypt with message key, include URL in message body.
- Postage: none by default (opt-in per message or per configuration).

**Configuration should be optional:**
```typescript
// Works with zero configuration (uses NIP-07 signer, default relays)
const mail = new NostrMail()

// Fully configured (every option explicit)
const mail = new NostrMail({
  signer: new NSecSigner(privateKey),
  relays: ['wss://relay1.example.com', 'wss://relay2.example.com'],
  blossom: 'https://blossom.example.com',
  cashu: { mint: 'https://mint.example.com', defaultPostage: 21 },
})
```

### Type Safety
Every public API surface should be fully typed. Types are documentation that the compiler enforces.

**TypeScript:**
```typescript
interface SendOptions {
  to: string | string[]            // NIP-05 address or npub
  subject: string
  body: string
  cc?: string | string[]
  bcc?: string | string[]
  attachments?: Attachment[]
  postage?: PostageOptions
  replyTo?: string                 // Event ID of message being replied to
  relays?: string[]                // Override relay selection
}

interface Message {
  id: string                       // Event ID
  sender: Contact                  // Resolved sender info
  recipients: Contact[]
  subject: string
  body: string
  attachments: Attachment[]
  createdAt: Date
  isRead: boolean
  threadId: string | null          // For threading
  postage: PostageInfo | null      // Attached Cashu tokens
}
```

**Rust:**
```rust
pub struct SendOptions {
    pub to: Vec<Recipient>,
    pub subject: String,
    pub body: String,
    pub attachments: Vec<Attachment>,
    pub postage: Option<Postage>,
}
```

**Python:**
```python
@dataclass
class SendOptions:
    to: str | list[str]
    subject: str
    body: str
    cc: list[str] | None = None
    attachments: list[Attachment] | None = None
    postage: PostageOptions | None = None
```

### Error Handling
Errors should be typed, actionable, and distinguishable. The developer should be able to handle each error case programmatically.

**Error hierarchy:**
```typescript
class NostrMailError extends Error {
  code: string           // Machine-readable error code
  recoverable: boolean   // Can the operation be retried?
}

class RelayError extends NostrMailError {
  relay: string          // Which relay failed
  // Codes: RELAY_UNREACHABLE, RELAY_REJECTED, RELAY_TIMEOUT, RELAY_AUTH_REQUIRED
}

class EncryptionError extends NostrMailError {
  // Codes: RECIPIENT_KEY_NOT_FOUND, DECRYPTION_FAILED, INVALID_GIFT_WRAP
}

class PaymentError extends NostrMailError {
  // Codes: INSUFFICIENT_BALANCE, MINT_UNREACHABLE, TOKEN_EXPIRED, L402_REQUIRED
}

class RecipientError extends NostrMailError {
  // Codes: NIP05_RESOLUTION_FAILED, PUBKEY_INVALID, NO_RELAY_LIST
}
```

**Usage pattern:**
```typescript
try {
  await mail.send({ to: 'bob@example.com', subject: 'Hello', body: 'World' })
} catch (e) {
  if (e instanceof RecipientError && e.code === 'NIP05_RESOLUTION_FAILED') {
    // Show "could not find recipient" UI
  } else if (e instanceof RelayError && e.code === 'RELAY_AUTH_REQUIRED') {
    // Prompt user to authenticate with relay
  } else if (e instanceof PaymentError && e.code === 'L402_REQUIRED') {
    // Show payment prompt
  } else {
    // Unexpected error — log and show generic message
  }
}
```

### Async-First
All network operations must be asynchronous. Never block the main thread.

**Patterns:**
- Single operations return `Promise<T>` (TypeScript) / `Future<T>` (Rust) / `Awaitable[T]` (Python)
- Streaming operations return `AsyncIterable<T>` or equivalent
- Subscriptions return an unsubscribe function or handle

```typescript
// Single operation
const message: Message = await mail.send({ ... })

// Streaming (inbox)
for await (const msg of mail.inbox({ since: lastSync })) {
  handleMessage(msg)
}

// Subscription with cleanup
const sub = mail.subscribe({ kinds: [15] }, (msg) => handleMessage(msg))
// Later:
sub.unsubscribe()
```

### Testability
All external dependencies should be injectable. Tests should not require network access.

**Dependency injection:**
```typescript
const mail = new NostrMail({
  signer: new MockSigner(testKeypair),
  relayPool: new MockRelayPool(testEvents),
  blossom: new MockBlossom(testFiles),
  cashu: new MockCashuWallet(testTokens),
})
```

**Test utilities provided by the SDK:**
```typescript
import { MockSigner, MockRelayPool, TestFixtures } from '@nostr-mail/test-utils'

const fixtures = TestFixtures.load()
// fixtures.keypairs — pre-generated test keypairs (Alice, Bob, Carol)
// fixtures.events — pre-built encrypted events
// fixtures.tokens — test Cashu tokens
// fixtures.messages — fully parsed test messages
```

---

## Documentation Hierarchy

### README (30-second overview)
The README is the front door. A developer should understand what the project does, how to install it, and see a working example in under 30 seconds.

**Required sections:**
1. **One-line description:** "Send and receive encrypted email over NOSTR"
2. **Install:** `npm install @nostr-mail/sdk` (or equivalent for each language)
3. **Quick example:** 5-10 lines of copy-pasteable code that sends a message
4. **Links:** Getting Started guide, API reference, examples, contributing

**Anti-patterns:**
- Long feature lists before any code
- Architecture diagrams in the README (put in guides)
- Multiple installation options before the simplest one
- Badges that push the content below the fold

### Getting Started Guide (5-minute tutorial)
Walk the developer from zero to working application in 5 minutes.

**Structure:**
1. Install the SDK
2. Set up a signer (NIP-07 or nsec)
3. Send your first message
4. Read your inbox
5. Reply to a message
6. Next steps (links to conceptual guides)

**Rules:**
- Every code block must be copy-pasteable and runnable
- Do not explain theory — link to conceptual guides for the "why"
- Include expected output after each step
- Show error cases and how to handle them

### Conceptual Guides
Explain the "why" behind design decisions. These are for developers who want to understand the system, not just use it.

**Topics:**
- How encryption works in NOSTR Mail (NIP-44, NIP-59, gift wrapping)
- How relay selection works (outbox model, NIP-65)
- How payments work (Cashu postage, L402, refunds)
- How attachments work (Blossom, encryption, URL references)
- How threading works (reply chains, `e` tags)
- How spam prevention works (postage, relay policies, WoT)

### API Reference
Every public function, class, type, method, property, and parameter documented.

**For each item:**
- Name and signature
- Description (one sentence)
- Parameters (name, type, required/optional, default, description)
- Return type and description
- Throws (which errors, under what conditions)
- Example (minimal, focused on this specific method)
- Since (version introduced)

**Generation tools:**
- TypeScript: TypeDoc
- Rust: rustdoc (`cargo doc`)
- Python: Sphinx with autodoc, or mkdocstrings
- Go: GoDoc (standard tooling)

### Examples
Copy-pasteable code for every common pattern. Examples should be complete (runnable) and minimal (no unnecessary code).

**Organization:**
```
examples/
  basics/
    send-message.ts
    read-inbox.ts
    reply-to-message.ts
  attachments/
    send-with-attachment.ts
    download-attachment.ts
  payments/
    send-with-postage.ts
    claim-postage.ts
    l402-relay.ts
  contacts/
    manage-contacts.ts
    resolve-nip05.ts
  advanced/
    custom-relay-pool.ts
    custom-signer.ts
    event-inspection.ts
```

### Troubleshooting
Common errors and their solutions. Written for the developer who is stuck.

**Format:**
```
## Error: NIP05_RESOLUTION_FAILED

**Symptom:** `RecipientError: Could not resolve NIP-05 address`

**Causes:**
1. The NIP-05 address is incorrect (typo)
2. The domain's `.well-known/nostr.json` is not accessible
3. The domain returns a CORS error (browser only)

**Solutions:**
1. Verify the address is correct
2. Test resolution: `curl https://domain.com/.well-known/nostr.json?name=user`
3. For CORS: the server must return `Access-Control-Allow-Origin: *`
```

---

## Developer Tool Design

### CLI Should Mirror SDK API
The command-line tool should feel like the SDK but in shell form. Same concepts, same names, same structure.

**CLI design:**
```bash
# Send (mirrors mail.send())
nostr-mail send --to alice@example.com --subject "Hello" --body "World"

# Read inbox (mirrors mail.inbox())
nostr-mail inbox --since 1h --limit 20

# Reply (mirrors message.reply())
nostr-mail reply --id <event-id> --body "Thanks!"

# Forward
nostr-mail forward --id <event-id> --to carol@example.com

# Search
nostr-mail search --query "project update" --from bob@example.com

# Contacts
nostr-mail contacts list
nostr-mail contacts add alice@example.com --name "Alice"
```

**CLI conventions:**
- `--verbose` / `-v`: show relay communication, event JSON
- `--json`: output machine-readable JSON instead of human-readable text
- `--dry-run`: show what would happen without actually doing it
- `--relay`: override relay selection
- `--signer`: specify signer (nsec, NIP-07, NIP-46)

### Debug Mode
When things go wrong, the developer needs to see what is happening at every layer.

**Debug output levels:**
1. **Normal:** "Message sent to bob@example.com"
2. **Verbose (-v):** "Resolved bob@example.com to npub1abc... via NIP-05 / Publishing to wss://relay1.example.com, wss://relay2.example.com / Event ID: abc123"
3. **Debug (-vv):** Full event JSON, WebSocket frames, encryption parameters (key IDs, not keys), relay responses
4. **Trace (-vvv):** Raw bytes, timing information, full protocol trace

**SDK equivalent:**
```typescript
const mail = new NostrMail({
  logLevel: 'debug',  // 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  logger: customLogger, // Optional: plug in your own logger
})
```

### Event Inspector
A tool for debugging NOSTR Mail events. Paste an event ID or raw event JSON and see a human-readable breakdown.

**Features:**
- Parse event kind, tags, created_at
- Show sender (resolve NIP-05 if possible)
- Show recipients (from p tags)
- Attempt decryption if private key is available
- Show gift wrap layers (outer event, rumor, inner content)
- Validate signature
- Show relay status (which relays have this event)

**CLI:**
```bash
nostr-mail inspect <event-id>
nostr-mail inspect --raw '{"id":"...","kind":1059,...}'
```

### Test Relay
A local relay for development, pre-loaded with test data.

**Features:**
- Starts locally on a configurable port (default: ws://localhost:7777)
- Pre-loaded with test keypairs (Alice, Bob, Carol, Dave)
- Pre-loaded with test messages (plain, encrypted, with attachments, with postage)
- Supports all NIP-01 operations (publish, subscribe, query)
- Supports kind 5 deletions
- Supports NIP-42 AUTH (optional, configurable)
- Supports L402 paywalls (optional, configurable with test Lightning)
- Reset to initial state with a single command

**Usage:**
```bash
# Start test relay
nostr-mail dev-relay start

# Start with specific options
nostr-mail dev-relay start --port 7777 --auth --l402

# Reset to initial state
nostr-mail dev-relay reset

# Stop
nostr-mail dev-relay stop
```

---

## Open Source Community

### CONTRIBUTING.md Structure
A contributing guide should answer: "I want to help. What do I do?"

**Required sections:**
1. **Quick start:** Fork, clone, install, run tests — in 5 commands or fewer
2. **Development setup:** Prerequisites, environment variables, local relay
3. **Code style:** Formatter (prettier/rustfmt/black), linter (eslint/clippy/ruff), naming conventions
4. **Testing:** How to run tests, how to write tests, what coverage is expected
5. **PR process:** Branch naming, commit messages, review expectations, merge policy
6. **Architecture overview:** Brief description of codebase structure for orientation
7. **Good first issues:** Link to labeled issues for newcomers

### Issue Templates

**Bug report:**
- Description (what happened)
- Expected behavior (what should have happened)
- Steps to reproduce (numbered, minimal)
- Environment (OS, runtime, SDK version, relay software)
- Logs (relevant error output, with sensitive data redacted)

**Feature request:**
- Problem description (what is painful or missing)
- Proposed solution (how you would like it to work)
- Alternatives considered
- Additional context (links, examples from other projects)

**Spec question:**
- NIP reference (which NIP is relevant)
- Question (specific, answerable)
- Context (why you are asking, what you are trying to build)

### Governance
Decisions about the project should be transparent and predictable.

**Model (for a small project):**
- Core maintainers: 2-3 people with merge authority
- Decision process: lazy consensus (silence = approval after 72 hours)
- Conflict resolution: maintainer vote, majority wins
- RFC process: for significant changes, write an RFC, discuss for 2 weeks, then decide

### Release Process

**Semver (Semantic Versioning):**
- MAJOR: breaking API changes
- MINOR: new features, backward compatible
- PATCH: bug fixes, backward compatible

**Release checklist:**
1. All tests pass on CI
2. Changelog updated (auto-generated from conventional commits + manual curation)
3. Version bumped in package.json / Cargo.toml / pyproject.toml
4. Migration guide written (for MAJOR versions)
5. Tag created (v1.2.3)
6. Package published (npm / crates.io / PyPI)
7. GitHub Release created with changelog
8. Announcement posted (NOSTR note, blog, social media)
