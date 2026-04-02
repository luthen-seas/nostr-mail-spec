# UX Designer — Fundamentals

## Email UX Conventions Users Expect

Users carry deep mental models from decades of email usage. A NOSTR-based mail client must honor these conventions or face immediate rejection.

### Inbox List
- Chronological or priority-sorted list of received messages
- Each row: sender name/avatar, subject line, body preview (first ~80 chars), timestamp
- Unread indicator (bold text, dot, or highlight)
- Batch actions: select multiple, mark read/unread, archive, delete
- Pull-to-refresh on mobile, auto-refresh on desktop
- Badge count for unread messages (app icon, tab title, sidebar)

### Message View
- Full message body with rich text rendering (markdown at minimum)
- Sender identity prominently displayed (name, avatar, verified address)
- Timestamp with relative ("2 hours ago") and absolute ("Apr 1, 2026 3:14 PM") display
- Reply, Forward, Archive, Delete actions always visible
- Attachments rendered inline (images) or as download links (files)
- Thread context: previous messages in the conversation visible below or collapsible

### Compose Window
- To field with autocomplete from contacts (by name, NIP-05 address, or npub)
- Subject line (maps to subject tag in NIP-17)
- Rich text body editor (markdown with toolbar for bold, italic, links, lists)
- Attachment support (drag-and-drop, file picker)
- Save as draft (locally or as encrypted kind 31234 event)
- Send button with clear feedback: sending, sent, delivered, failed

### Threading
- Messages grouped by conversation (using reply tags / e-tags)
- Thread view shows chronological message history
- Quote reply support (include excerpt of original message)
- Thread subject line derived from first message, "Re:" prefix convention

### Folders / Labels
- Inbox, Sent, Drafts, Archive, Trash as minimum
- Labels/tags for user organization (stored as client-side metadata or parameterized replaceable events)
- Spam/junk folder (client-side classification)
- Smart folders: "Unread", "Flagged", "From contacts"

### Search
- Full-text search across all messages (local index)
- Filter by: sender, date range, has attachments, read/unread
- Search results highlight matching terms
- Recent searches for quick access

### Contacts
- Contact list synced from kind 3 (follow list) and kind 10002 (relay list)
- Contact card: display name, NIP-05 address, avatar, pubkey, relay hints
- Add contact from received message
- Contact groups / categories

---

## The "Zero Inbox" Pattern

Zero Inbox is a productivity workflow where users process every message to empty:

1. **Triage**: scan inbox, make quick decisions
2. **Actions**: reply immediately (< 2 min), defer (flag/snooze), delegate (forward), archive, delete
3. **Goal**: inbox shows zero messages — everything is processed

### Design implications
- Archive action must be one tap/click (not delete — archive)
- Snooze: "remind me about this in 2 hours / tomorrow / next week"
- Quick reply: inline reply without opening full compose
- Swipe gestures on mobile: left = archive, right = snooze (configurable)
- Undo for destructive actions (5-second undo bar, not confirmation dialogs)

---

## Onboarding UX for Key-Based Systems

### Lessons from Crypto Wallets

**Coinbase** (custodial model):
- Email + password signup, keys managed server-side
- Lowest friction, highest adoption, lowest sovereignty
- Lesson: most users will accept custodial if it means easy onboarding

**MetaMask** (self-custody with seed phrase):
- Generate wallet → write down 12-word seed phrase → confirm 3 random words
- Users skip the backup step and lose funds
- Lesson: seed phrase backup must be enforced but not blocking

**BlueWallet** (progressive custody):
- Start with built-in wallet (easy), upgrade to own node later
- Lesson: let users start simple, migrate to full sovereignty when ready

### Recommended NOSTR Mail Onboarding Flow

1. **"Create Account"** — generate keypair invisibly, store in OS keychain / secure enclave
2. **"Choose your address"** — pick a NIP-05 identifier (user@domain.com format)
3. **"Back up your key"** — show mnemonic phrase (NIP-06), strongly encourage backup, allow skip with warning
4. **"You're ready"** — preconfigured default relays, empty inbox, prompt to send first message
5. **Post-onboarding nudge** — remind about backup if skipped, after 7 days and 30 days

### Key Principle: Never Show a Private Key as Hex
- Always mnemonic words (12 or 24 words per NIP-06 / BIP-39)
- Never nsec unless user explicitly requests "advanced export"
- Never raw hex under any circumstance in normal UI

---

## Progressive Disclosure

Hide complexity, reveal on demand. Users should never need to understand the protocol to use the product.

### Layer 0 — Invisible (user never sees)
- Keypair generation, Schnorr signatures, event serialization
- Relay connections, WebSocket management, subscription filters
- NIP-44 encryption/decryption, NIP-59 gift wrapping
- Event kind numbers, tag structures, event IDs

### Layer 1 — Simple (shown to all users)
- Your address (NIP-05): alice@nostrmail.com
- Your contacts (names and avatars)
- Message status: sent, delivered, read
- Basic settings: display name, avatar, notification preferences

### Layer 2 — Intermediate (available on request)
- Relay list management ("Where your messages are stored")
- Backup phrase export
- Spam filter sensitivity
- Payment settings (default tip amount, auto-pay threshold)

### Layer 3 — Advanced (hidden behind "Developer" or "Advanced" toggle)
- Raw event viewer
- Manual relay management (add/remove specific relay URLs)
- Key export (nsec, hex)
- Protocol-level details (NIP numbers, event kinds)
- Custom relay policies

---

## Moxie's Principle

> "Security tools must be as easy as the insecure alternative, or nobody uses them."
> — Moxie Marlinspike (Signal creator)

### Applied to NOSTR Mail
- Encryption must be automatic and invisible — no "encrypt this message" toggle
- Key management must be simpler than password management
- Sending a message must be as fast as Gmail, not slower
- Reading a message must never show a decryption step or progress bar
- If a security operation fails, the user sees a human error, not a protocol error
- The secure path must be the default path, not an opt-in

### Practical Implications
- Pre-compute encryption when composing (encrypt on send, not as separate step)
- Cache decrypted messages locally (encrypted at rest with device key)
- Never ask "do you want to encrypt?" — always encrypt
- Never show "decrypting..." — show loading spinner with no protocol detail

---

## Cognitive Load Theory Applied to Protocol UX

### Miller's Law
Users can hold 7 plus or minus 2 chunks of information in working memory. A NOSTR mail client must minimize active concepts.

### Concepts a User Must Understand
**Minimum viable (3 concepts):**
1. You have an address (like email)
2. You send and receive messages
3. You have a backup phrase (like a password, but more important)

**Extended (5-7 concepts for power users):**
4. Relays store your messages (like email servers)
5. You can use multiple relays (redundancy)
6. Contacts have addresses too
7. Payments can be attached to messages

### Concepts a User Must NEVER Need to Understand
- Public/private key cryptography
- Schnorr signatures or secp256k1
- Event kinds, tags, or JSON structure
- NIP numbers or protocol specifications
- WebSocket connections or relay protocols
- Gift wrapping, encryption layers, or nonce generation

---

## Error State Design

### Principle: Tell Users What Happened and What To Do, Not Why

**Bad errors (protocol-leaking):**
- "NIP-44 decryption failed: invalid MAC"
- "Relay wss://relay.example.com returned CLOSED: auth-required"
- "Event ID 3a8f... not found on any connected relay"
- "Kind 1059 event missing p-tag"

**Good errors (human-readable):**
- "This message couldn't be read. It may have been corrupted in transit. [Try Again]"
- "You need to sign in to access this mailbox. [Sign In]"
- "Message not found. It may have been deleted by the sender. [OK]"
- "Something went wrong. [Report Problem] [Dismiss]"

### Error Categories and Patterns

| Category | User Sees | Action Offered |
|----------|-----------|----------------|
| Network offline | "You're offline. Messages will send when connected." | None (auto-retry) |
| Relay unreachable | "Delivery delayed. Retrying..." | None (auto-retry) |
| All relays failed | "Message couldn't be delivered. Check your connection." | [Retry] [Save as Draft] |
| Decryption failure | "This message can't be read." | [Report Problem] |
| Auth required | "Sign in to continue." | [Sign In] |
| Rate limited | "Too many messages. Try again in a moment." | Auto-retry with backoff |
| Payment required | "This recipient requires postage." | [Pay & Send] [Cancel] |

### Error Logging
- Log full technical details locally for debugging (accessible via "Advanced > Logs")
- Never surface protocol details in the UI
- Include a "Copy Debug Info" button in error dialogs for support requests

---

## Accessibility

### WCAG 2.1 AA Minimum Requirements

**Perceivable:**
- Color contrast ratio minimum 4.5:1 for normal text, 3:1 for large text
- Do not use color alone to convey information (unread status needs bold + color)
- Alt text for all images (avatars, attachments, inline images)
- Captions for any audio/video attachments
- Responsive text sizing (support up to 200% zoom without horizontal scroll)

**Operable:**
- Full keyboard navigation: Tab through all interactive elements, Enter to activate
- Keyboard shortcuts for common actions: R (reply), A (archive), Delete (trash), N (new message)
- No time limits on interactions (or user-adjustable)
- Skip navigation links ("Skip to inbox", "Skip to message body")
- Focus indicators visible on all interactive elements

**Understandable:**
- Consistent navigation across all views
- Labels on all form fields (not placeholder-only)
- Error messages associated with their fields (aria-describedby)
- Predictable behavior: same action, same result, every time

**Robust:**
- Semantic HTML: use proper heading hierarchy, lists, buttons (not div-with-onclick)
- ARIA landmarks: main, navigation, complementary, contentinfo
- ARIA live regions for dynamic content (new message notifications, status updates)
- Test with screen readers: VoiceOver (macOS/iOS), TalkBack (Android), NVDA (Windows)

---

## Mobile-First Constraints

### Touch Targets
- Minimum 44x44pt (Apple HIG) or 48x48dp (Material Design)
- Adequate spacing between targets (at least 8pt)
- Primary actions (Send, Reply) larger: 56pt height minimum
- Swipe gestures for common actions (archive, delete, snooze)

### Offline Handling
- Cache inbox locally (encrypted at rest)
- Queue outgoing messages when offline
- Show clear offline indicator (banner, not modal)
- Sync on reconnect with visual progress
- Conflict resolution: last-write-wins for drafts

### Background Sync
- iOS: background fetch + push notifications via APNs (requires relay-side push service)
- Android: WorkManager for periodic sync, FCM for push
- Progressive Web App: service worker + Background Sync API
- Sync strategy: poll relay for new kind 1059 events since last check

### Push Notifications
- Show: sender name, subject line (if available), timestamp
- Do NOT show: message body preview (privacy — encrypted content should not appear in notification)
- Tap notification: open directly to the message
- Badge count: update with unread count
- Notification grouping: by conversation thread

---

## Payment UX

### The Apple Pay Model: Invisible Payments
1. User taps "Send"
2. If payment required, single biometric confirmation (Face ID / fingerprint)
3. Payment completes, message sends
4. Total time added: < 2 seconds

### Progressive Escalation

| Scenario | UX |
|----------|----|
| Message to contact (no postage) | Send instantly, no payment prompt |
| Message to stranger (low postage, e.g., 10 sats) | "Postage: 10 sats [Send]" — one tap |
| Message to stranger (high postage, e.g., 1000 sats) | "This recipient charges 1,000 sats postage. [Pay & Send] [Cancel]" |
| Insufficient balance | "Insufficient balance. [Add Funds] [Cancel]" |
| Payment failed | "Payment failed. [Retry] [Send Without Payment]" (if relay allows) |

### Design Rules for Payment UX
- Never require a payment for messages to existing contacts
- Show cumulative spend in settings ("You've spent 450 sats on postage this month")
- Allow setting auto-pay threshold ("Auto-pay postage under 100 sats")
- Payment confirmation must not interrupt flow for small amounts
- Always show amount in user's preferred denomination (sats, BTC, fiat equivalent)
