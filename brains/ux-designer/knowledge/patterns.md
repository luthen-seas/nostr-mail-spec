# UX Designer — Patterns

## Onboarding Pattern

### Flow: Create Account → Choose Address → Back Up Phrase → Done

**Step 1: "Create Account"**
- Single screen: "Welcome to [App Name]" with a single button: "Create Account"
- Behind the scenes: generate secp256k1 keypair, store private key in OS keychain / secure enclave
- Duration: < 1 second, show brief animation (not a loading spinner)
- No fields, no choices, no decisions — one tap

**Step 2: "Choose Your Address"**
- Screen: "Pick your address" with text field and domain suffix
- Input: `[username]@[domain.com]` — autocomplete domain from app's NIP-05 provider
- Validation: real-time availability check ("alice@nostrmail.com is available!")
- Fallback: if no NIP-05 provider, skip this step (use npub as identifier)
- Allow skip: "I'll set this up later" link at bottom (subtle, not prominent)

**Step 3: "Back Up Your Key"**
- Screen: "Save your backup phrase" — show 12 mnemonic words (NIP-06 / BIP-39) in a numbered grid
- Actions: [Copy to Clipboard] [Write It Down]
- Verification: ask user to confirm 3 random words from the phrase
- Warning if skipped: "Without your backup phrase, you can never recover your account if you lose this device. [Skip Anyway] [Back Up Now]"
- Visual: shield/lock icon, reassuring but serious tone

**Step 4: "You're Ready"**
- Screen: "Your mailbox is ready!" with summary: address, avatar placeholder, relay status
- Pre-configured: 3 default relays already connected (inbox relay + 2 general relays)
- CTA: "Send your first message" or "Share your address"
- Background: first relay connections established, relay list event (kind 10002) published

### Timing Budget
- Total onboarding: under 60 seconds
- Each step: under 15 seconds of active user effort
- No email verification, no phone number, no CAPTCHA

---

## Compose Pattern

### Flow: To → Subject → Body → Attachments → Send

**To Field**
- Autocomplete from contacts (kind 3 follow list + local contact history)
- Search by: display name, NIP-05 address, npub prefix
- Show: avatar + display name + NIP-05 address in dropdown
- Multiple recipients supported (separate with comma or Enter)
- Unknown recipient: show "Not in your contacts" indicator, resolve NIP-05 or accept raw npub
- Validation: verify pubkey exists by checking kind 0 metadata on relays

**Subject Line**
- Optional but encouraged: "Subject (optional)" placeholder
- Maps to `subject` tag in NIP-17 message event
- If omitted: thread displays "(No Subject)" in inbox list
- Character limit: 200 characters (soft limit with counter)

**Body**
- Rich text editor with markdown support
- Toolbar: Bold, Italic, Link, Bulleted List, Numbered List, Code Block, Quote
- Support for @ mentions (resolve to npub, display as name)
- Character limit: 64KB rendered (to stay within event size limits)
- Auto-save draft every 30 seconds

**Attachments**
- Drag and drop or file picker button
- Upload to Blossom server (NIP-B7 compatible)
- Show upload progress, file name, size
- Supported: images (inline preview), documents, archives
- Size limit: per-file limit (e.g., 25MB), total per-message limit (e.g., 100MB)
- Attachment references stored as `imeta` tags in the event

**Send Button**
- States: [Send] → [Sending...] → [Sent] (with checkmark) → (returns to inbox)
- If recipient is a contact: send immediately, no payment prompt
- If recipient is unknown and relay requires postage: show payment prompt (see Payment Prompt Pattern)
- If offline: "Message queued. Will send when you're back online." — save to outbox
- Keyboard shortcut: Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux)

---

## Inbox Pattern

### List View

Each row displays:
```
[Avatar] [Sender Name]                    [Timestamp]
         [Subject Line — bold if unread]
         [Body preview — first line, gray]  [Attachment icon] [Payment icon]
```

**Data sources:**
- Sender name + avatar: resolved from sender's kind 0 metadata event
- Subject: from `subject` tag in the unwrapped NIP-17 event
- Body preview: first 80 characters of decrypted `content` field
- Timestamp: `created_at` from the event, displayed as relative time ("3 min ago", "Yesterday", "Mar 28")

**Visual states:**
- Unread: bold sender name + subject, subtle background highlight or dot indicator
- Read: normal weight text, no highlight
- Flagged/starred: star icon on the row
- Has attachment: paperclip icon
- Has payment: lightning bolt icon (zap attached)
- Bridged from email: subtle mail icon

**Sorting:**
- Default: newest first (reverse chronological)
- Grouped by thread: show latest message timestamp, thread count badge
- Optional: priority inbox (contacts first, then unknown senders)

**Actions (swipe or long-press):**
- Swipe left: Archive
- Swipe right: Snooze (pick time)
- Long press: Select for batch actions (archive, delete, mark read/unread)
- Tap: Open message/thread view

---

## Thread View Pattern

### Layout
```
[Thread Subject Line]
[Participant count: "3 people in this conversation"]

─────────────────────────
[Avatar] [Sender Name]     [Timestamp]
[NIP-05 address]

[Message body — full rendered content]

[Attachment thumbnails/links]
─────────────────────────
[Avatar] [Sender Name]     [Timestamp]
[NIP-05 address]

> [Quoted text from previous message — gray, indented]

[Reply body]
─────────────────────────

[Reply box: "Write a reply..." with formatting toolbar]
[Send button]
```

**Behavior:**
- Messages displayed chronologically (oldest first within thread)
- Thread linked via `e` tags referencing root message and parent message
- Quote indicators: gray left border + indented text for quoted content
- Collapse older messages: "Show 5 earlier messages" link if thread is long (> 10 messages)
- Sender identity badge: checkmark if NIP-05 verified, subtle color coding for contact vs. unknown

---

## Contact Card Pattern

### Display
```
┌─────────────────────────────────────┐
│ [Avatar — large]                     │
│                                      │
│ Alice Johnson                        │
│ alice@nostrmail.com  [Verified ✓]    │
│                                      │
│ npub1abc...xyz (tap to copy)         │
│                                      │
│ Relays:                              │
│   wss://relay.alice.com              │
│   wss://relay.damus.io              │
│                                      │
│ Payment history:                     │
│   3 messages sent, 45 sats total     │
│                                      │
│ [Send Message] [Edit] [Remove]       │
└─────────────────────────────────────┘
```

**Data sources:**
- Name, avatar, about: kind 0 metadata event
- NIP-05 address: kind 0 `nip05` field, verified via DNS lookup
- Relays: kind 10002 relay list event (write relays for sending to them)
- Pubkey: displayed truncated, full value on tap/hover, copy button
- Payment history: local client data (not on relays)

**Actions:**
- Send Message: open compose with To field pre-filled
- Edit: modify local contact notes/labels (not published to relays)
- Remove: remove from contacts list (remove from kind 3 follow list, with confirmation)
- Block: add to mute list (kind 10000), stop receiving messages from this pubkey

---

## Search Pattern

### Interface
```
[Search icon] [Search field: "Search messages..."]

[Scope filters: All | Inbox | Sent | Drafts | Archive]

[Advanced filters (expandable):]
  From: [contact autocomplete]
  Date: [start] to [end]
  Has: [attachments] [payments] [links]
  
[Results list — same format as inbox rows]
[Result count: "23 results for 'invoice'"]
```

**Implementation:**
- Local full-text search index (SQLite FTS5 or similar)
- Index decrypted message content, subject, sender name
- Search triggers on Enter key or after 300ms debounce
- Results sorted by relevance with date as tiebreaker
- Highlight matching terms in results (bold or yellow highlight)
- Recent searches: show last 5 searches below the search field when empty

---

## Settings Progressive Disclosure Pattern

### Basic Settings (visible by default)
- **Profile**: display name, avatar, about text
- **Address**: NIP-05 identifier
- **Notifications**: enable/disable, notification sound
- **Appearance**: light/dark/system theme

### Advanced Settings (behind "Advanced" toggle)
- **Relays**: list of connected relays, add/remove, connection status
- **Spam Policy**: sensitivity slider (aggressive / balanced / permissive)
- **Auto-pay Threshold**: max sats to auto-pay for postage
- **Key Export**: show backup phrase, export nsec (with warning)
- **Default Relay Selection**: manual vs. automatic (outbox model)

### Developer Settings (behind "Developer Mode" toggle, hidden by default)
- **Event Log**: real-time event stream viewer
- **Raw Event Viewer**: see JSON for any event
- **Manual Relay Management**: connect to arbitrary relay URLs
- **Protocol Details**: show NIP numbers, event kinds in UI
- **Debug Logging**: enable verbose logging

---

## Payment Prompt Pattern

### Standard Prompt (unknown recipient with postage requirement)
```
┌─────────────────────────────────────┐
│                                      │
│  📬 Postage Required                 │
│                                      │
│  This recipient requires a small     │
│  payment to receive messages from    │
│  new senders.                        │
│                                      │
│  Amount: 10 sats (~$0.01)           │
│                                      │
│  [Pay & Send]          [Cancel]      │
│                                      │
└─────────────────────────────────────┘
```

**Behavior:**
- Biometric confirmation for amounts under auto-pay threshold: skip this dialog entirely
- For amounts over threshold: show dialog, require explicit tap on "Pay & Send"
- Payment via NIP-47 (Nostr Wallet Connect) to user's connected wallet
- On success: message sends, dialog closes, brief "Sent" confirmation
- On failure: "Payment failed. [Retry] [Cancel]" — do not lose the composed message
- Show fiat equivalent in user's local currency (configurable)

### Payment States in Compose Flow
1. **No payment needed**: contact or relay with no postage — send button works normally
2. **Auto-pay**: amount under threshold — send, pay silently, show "Sent (10 sats postage)"
3. **Confirm-pay**: amount over threshold — show payment prompt before sending
4. **Insufficient funds**: show "Add Funds" option linking to wallet
5. **Wallet not connected**: "Connect a wallet to send paid messages. [Set Up Wallet]"

---

## Error Patterns

### Transient Errors (auto-resolve)
- **"Message queued — will send when you're online"**
  - Context: user hit Send while offline
  - Visual: message appears in Sent with a clock icon and subtle "Queued" badge
  - Resolution: auto-sends on reconnect, badge updates to checkmark

- **"Delivery confirmed to 2/3 relays"**
  - Context: message sent to recipient's relays, not all acknowledged
  - Visual: subtle delivery status below message (like WhatsApp double-check)
  - Resolution: retry failed relays in background, update status silently

### Actionable Errors (user must act)
- **"Could not reach recipient's relays — retry?"**
  - Context: all of recipient's write relays are unreachable
  - Actions: [Retry Now] [Save as Draft] [Send Anyway] (to general relays)
  
- **"This contact hasn't set up their mailbox yet"**
  - Context: recipient has no kind 10002 relay list or no inbox relays
  - Actions: [Send to Default Relays] [Cancel]

### Non-Actionable Errors (inform only)
- **"This message could not be decrypted"**
  - Context: NIP-44 decryption failure (corrupted event, wrong key)
  - Visual: message placeholder with lock icon
  - No action available — inform only, with "Report" option for support

---

## Empty States

### Empty Inbox
```
┌─────────────────────────────────────┐
│                                      │
│         [Mailbox illustration]       │
│                                      │
│      No messages yet                 │
│                                      │
│  Share your address to start         │
│  receiving messages:                 │
│                                      │
│  alice@nostrmail.com  [Copy]         │
│                                      │
│  [Send Your First Message]           │
│                                      │
└─────────────────────────────────────┘
```

### Empty Search Results
```
No results for "invoice"

Try:
- Check your spelling
- Use fewer or different keywords
- Search in All instead of Inbox
```

### Empty Contacts
```
┌─────────────────────────────────────┐
│                                      │
│     [People illustration]            │
│                                      │
│     No contacts yet                  │
│                                      │
│  Add contacts by their NOSTR         │
│  address or import from your         │
│  existing network.                   │
│                                      │
│  [Add Contact] [Import Contacts]     │
│                                      │
└─────────────────────────────────────┘
```

---

## Bridged Message Indicator

### Design Principle
Users should know a message came "via email" without it being confusing or prominent.

### Visual Pattern
- Small icon in the message header: a subtle envelope-with-arrow icon
- Tooltip on hover: "This message was received via email bridge"
- In thread view: show bridged messages with a thin left border accent (different color)
- In inbox list: tiny bridge icon next to timestamp

### What NOT to Do
- Do not show "SMTP" or "bridged" as prominent text
- Do not use different fonts or layouts for bridged messages
- Do not add banner warnings like "This message is from outside your network"
- Do not require different actions for replying to bridged vs. native messages

### Reply Behavior
- Reply to bridged message: compose normally, bridge handles conversion back to email
- Visual hint in compose: "This reply will be delivered via email" (subtle, below compose area)
- No extra steps: user hits Reply, types, hits Send — bridge is invisible
