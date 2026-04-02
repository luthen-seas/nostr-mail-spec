# NOSTR Mail Message Format — Event Kinds, Tags & Conventions

> **The mail-specific NIP: event structure, threading, CC/BCC, attachments, read receipts, and how NOSTR events replace MIME.**

---

## Table of Contents

- [Design Principles](#design-principles)
- [Event Kind: Mail Message (Kind 15)](#event-kind-mail-message-kind-15)
- [Tag Conventions](#tag-conventions)
- [Threading Model](#threading-model)
- [CC and BCC Semantics](#cc-and-bcc-semantics)
- [Attachments](#attachments)
- [Rich Content](#rich-content)
- [Read Receipts & Delivery Confirmations](#read-receipts--delivery-confirmations)
- [Drafts](#drafts)
- [Mailbox State](#mailbox-state)
- [Mailing Lists & Group Mail](#mailing-lists--group-mail)
- [Auto-Responders](#auto-responders)
- [MIME vs NOSTR Mail: Format Comparison](#mime-vs-nostr-mail-format-comparison)

---

## Design Principles

1. **Flat, not nested** — No MIME-style recursive structures. One JSON object per message.
2. **References, not inline** — Attachments are external (Blossom hashes), not base64-encoded blobs.
3. **Tags, not headers** — Structured, indexed metadata instead of freeform text headers.
4. **Unsigned rumor** — The inner message layer is unsigned (NIP-59 deniability). Authentication comes from the seal layer.
5. **Encryption by default** — Every mail message is gift-wrapped. Plaintext mail is not a mode.
6. **Backward compatible** — Builds on existing NIP-17 (private DMs), NIP-14 (subject), NIP-44 (encryption), NIP-59 (gift wrap).

---

## Event Kind: Mail Message (Kind 15)

The mail message is a **rumor** — an unsigned event that will be sealed and gift-wrapped per NIP-59.

> **Note:** Kind 15 is proposed here. The actual kind number would be determined during NIP standardization. Kind 14 (NIP-17 DMs) is the closest existing precedent.

### Basic Mail Event

```json
{
  "kind": 15,
  "pubkey": "<sender-pubkey-hex>",
  "created_at": 1711843200,
  "tags": [
    ["p", "<recipient-pubkey>", "<relay-hint>"],
    ["subject", "Q3 Revenue Report"]
  ],
  "content": "Hi Bob,\n\nPlease find the Q3 report attached. Revenue is up 23% QoQ.\n\nBest,\nAlice"
}
```

**Note:** No `id` or `sig` fields — this is a rumor (unsigned). The event ID and signature exist only on the outer gift-wrap (kind 1059) and seal (kind 13) layers.

### Full-Featured Mail Event

```json
{
  "kind": 15,
  "pubkey": "<sender-pubkey-hex>",
  "created_at": 1711843200,
  "tags": [
    ["p", "<recipient-1-pubkey>", "<relay-hint>", "to"],
    ["p", "<recipient-2-pubkey>", "<relay-hint>", "to"],
    ["p", "<cc-recipient-pubkey>", "<relay-hint>", "cc"],
    ["subject", "Q3 Revenue Report"],
    ["reply", "<parent-event-id>", "<relay-hint>"],
    ["thread", "<root-event-id>", "<relay-hint>"],
    ["attachment", "<blossom-sha256>", "Q3-Report.pdf", "application/pdf", "2048576"],
    ["attachment", "<blossom-sha256>", "revenue-chart.png", "image/png", "84000"],
    ["attachment-key", "<blossom-sha256>", "<nip44-encryption-key>"],
    ["blossom", "https://blossom.example.com", "https://blossom.backup.com"],
    ["priority", "normal"],
    ["receipt-request", "delivery"],
    ["receipt-request", "read"],
    ["content-type", "text/markdown"]
  ],
  "content": "Hi team,\n\nPlease find the Q3 report attached.\n\n## Highlights\n- Revenue up **23%** QoQ\n- New users up **45%**\n- Churn down to **2.1%**\n\nBest,\nAlice"
}
```

---

## Tag Conventions

### Recipient Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `p` (to) | `["p", "<pubkey>", "<relay>", "to"]` | Primary recipient |
| `p` (cc) | `["p", "<pubkey>", "<relay>", "cc"]` | Carbon copy recipient |
| `p` (bcc) | Not included in shared tags | Blind carbon copy (see BCC section) |

The fourth element (`"to"`, `"cc"`) indicates the recipient role. If omitted, default is `"to"`.

#### Tag Positional Element Rules (AMEND-003)

NOSTR Mail tags use positional semantics — the meaning of each element is determined by its index within the tag array. When a tag has optional elements:

1. Tags MUST include all positional elements up to and including the last non-empty element.
2. Empty intermediate elements MUST be represented as empty strings (`""`), NOT omitted.
3. Trailing empty elements MAY be omitted.

**Examples**:
- `["p", "<pubkey>", "", "to"]` — VALID: relay hint is empty, role is "to"
- `["p", "<pubkey>", "wss://relay.example.com", "to"]` — VALID: all elements present
- `["p", "<pubkey>", "to"]` — INVALID: "to" is at index 2 (relay position), not index 3 (role position)
- `["p", "<pubkey>"]` — VALID: relay and role both omitted (trailing), defaults apply

Implementations MUST parse tag elements by index. For the `p` tag: index 0 = tag name, index 1 = pubkey, index 2 = relay hint, index 3 = role. Implementations MUST handle tags with fewer elements than the maximum by treating missing trailing elements as empty/default.

#### Tag Element Types (AMEND-010)

Per NIP-01, all tag elements MUST be JSON strings. Numeric values (attachment size, PoW difficulty, Cashu amounts) MUST be serialized as decimal string representations. Example: `"2048576"` not `2048576`. Implementations receiving non-string elements SHOULD coerce to strings, but MUST NOT produce non-string elements.

### Message Metadata Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `subject` | `["subject", "Subject line"]` | Mail subject (NIP-14 compatible) |
| `priority` | `["priority", "high\|normal\|low"]` | Message priority |
| `content-type` | `["content-type", "text/plain\|text/markdown\|text/html"]` | Body format (default: `text/plain`) |
| `content-warning` | `["content-warning", "reason"]` | Content warning (NIP-36) |
| `client` | `["client", "NostrMail/1.0"]` | Sending client identifier |
| `expiration` | `["expiration", "<unix-timestamp>"]` | Message expiry (NIP-40) |

### Threading Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `reply` | `["reply", "<event-id>", "<relay>"]` | Direct parent message ID |
| `thread` | `["thread", "<event-id>", "<relay>"]` | Root message of the thread |
| `references` | `["references", "<event-id>", "<relay>"]` | Other referenced messages |

### Attachment Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `attachment` | `["attachment", "<hash>", "<filename>", "<mime>", "<size>"]` | File reference |
| `attachment-key` | `["attachment-key", "<hash>", "<nip44-key>"]` | Encryption key for file |
| `blossom` | `["blossom", "<url1>", "<url2>"]` | Blossom server URLs |
| `inline` | `["inline", "<hash>", "<content-id>"]` | Inline image reference |

### Payment Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `cashu` | `["cashu", "<serialized-token>"]` | Cashu ecash postage token |
| `zap-receipt` | `["zap-receipt", "<kind-9735-event-id>"]` | Proof of zap payment |
| `l402-preimage` | `["l402-preimage", "<hex-preimage>"]` | L402 payment proof |
| `refund` | `["refund", "<sender-pubkey>"]` | Address for postage refund |

### Receipt Request Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `receipt-request` | `["receipt-request", "delivery"]` | Request delivery confirmation |
| `receipt-request` | `["receipt-request", "read"]` | Request read confirmation |

---

## Threading Model

### Email's Problem

Email threading uses `Message-ID`, `In-Reply-To`, and `References` headers — freeform strings that clients implement inconsistently. Threads break when clients mangle headers. Some clients (Gmail) use subject-line matching instead.

### NOSTR Mail Threading

Threading uses **event ID references** with explicit role markers:

```
Thread Root (Message A):
  No reply or thread tags — this is a new conversation
  tags: [["subject", "Project Update"]]

Reply to Root (Message B):
  tags: [
    ["reply", "<A-event-id>", "<relay>"],      // Parent = A
    ["thread", "<A-event-id>", "<relay>"],     // Root = A
    ["subject", "Re: Project Update"]
  ]

Reply to Reply (Message C):
  tags: [
    ["reply", "<B-event-id>", "<relay>"],      // Parent = B
    ["thread", "<A-event-id>", "<relay>"],     // Root = A (always points to root)
    ["subject", "Re: Project Update"]
  ]

Branch Reply (Message D, also replying to A):
  tags: [
    ["reply", "<A-event-id>", "<relay>"],      // Parent = A
    ["thread", "<A-event-id>", "<relay>"],     // Root = A
    ["subject", "Re: Project Update"]
  ]
```

### Thread Reconstruction

```
Client fetches all messages with ["thread", "<root-id>"]
→ Builds tree from reply→parent relationships:

Message A (root)
├── Message B (reply to A)
│   └── Message C (reply to B)
└── Message D (reply to A)
```

**Advantages over email threading:**
- Deterministic: event IDs are SHA-256 hashes (no ambiguity)
- Explicit: `reply` = parent, `thread` = root (no guessing)
- Relay hints: know where to fetch referenced messages
- Immutable: references can't be broken by header rewriting

**Thread Tag Semantics (AMEND-007)**:
- A message with **no** `reply` tag and **no** `thread` tag is a **root message** starting a new conversation.
- A message with **both** `reply` and `thread` tags is a **reply** within an existing conversation.
- A message with a `thread` tag but **no** `reply` tag SHOULD be treated as a **direct reply to the root** identified by the `thread` tag. This is a shorthand: when the parent is the root, the `reply` tag MAY be omitted since it would be redundant.
- A message with a `reply` tag but **no** `thread` tag SHOULD be treated as a reply whose root is unknown. Implementations SHOULD follow the reply chain to discover the root.

---

## CC and BCC Semantics

### CC (Carbon Copy)

CC recipients are visible to all recipients. The `"cc"` marker in the `p` tag indicates the role:

```json
{
  "kind": 15,
  "tags": [
    ["p", "<alice-pubkey>", "<relay>", "to"],
    ["p", "<bob-pubkey>", "<relay>", "to"],
    ["p", "<charlie-pubkey>", "<relay>", "cc"],
    ["subject", "Meeting Notes"]
  ],
  "content": "Hi Alice and Bob, CC'ing Charlie for visibility..."
}
```

All recipients (Alice, Bob, Charlie) see the full recipient list after decryption. Each recipient gets their own gift-wrapped copy.

### BCC (Blind Carbon Copy)

BCC is inherently supported by gift wrapping. Each recipient gets a **separate** gift-wrapped copy. The BCC recipient's copy contains only their own `p` tag:

```
Gift wrap to Alice (TO):
  Rumor tags: [["p", alice, "to"], ["p", bob, "to"], ["p", charlie, "cc"]]

Gift wrap to Bob (TO):
  Rumor tags: [["p", alice, "to"], ["p", bob, "to"], ["p", charlie, "cc"]]

Gift wrap to Charlie (CC):
  Rumor tags: [["p", alice, "to"], ["p", bob, "to"], ["p", charlie, "cc"]]

Gift wrap to Dave (BCC):
  Rumor tags: [["p", alice, "to"], ["p", bob, "to"], ["p", charlie, "cc"], ["p", dave, "bcc"]]
  // Dave sees he's BCC'd; others don't know Dave received it
  // OR: Dave's copy simply omits mention of Dave in recipient list
```

**Key point:** Because each recipient gets a separate gift wrap, the sender can customize what each copy contains. BCC recipients can receive a copy that includes them (so they know they're BCC'd) or not (completely invisible even to themselves).

---

## Attachments

### Design: References, Not Inline

Unlike MIME, which embeds base64-encoded files inside the message, NOSTR Mail uses external references to files stored on Blossom servers.

### Sending an Attachment

```
1. Encrypt file with NIP-44 (random symmetric key)
2. Upload encrypted file to Blossom server
   POST https://blossom.example.com/upload
   → Response: {"sha256": "abc123...", "url": "https://blossom.example.com/abc123"}
3. Add tags to mail event:
   ["attachment", "abc123...", "report.pdf", "application/pdf", "2048576"]
   ["attachment-key", "abc123...", "<nip44-symmetric-key>"]
   ["blossom", "https://blossom.example.com"]
```

### Receiving an Attachment

```
1. Decrypt mail event → see attachment tags
2. Download encrypted file: GET https://blossom.example.com/abc123...
3. Decrypt file using key from attachment-key tag
4. Save or display to user
```

### Inline Images (for Rich Content)

```json
{
  "tags": [
    ["inline", "<blossom-hash>", "img001"],
    ["attachment-key", "<blossom-hash>", "<key>"],
    ["content-type", "text/markdown"]
  ],
  "content": "Check out this chart:\n\n![Revenue Chart](cid:img001)\n\nLooking good!"
}
```

The client replaces `cid:img001` with the fetched and decrypted image, similar to MIME Content-ID references but with external, encrypted storage.

### Size Limits

| Component | Limit | Rationale |
|-----------|-------|-----------|
| Mail event | ~100 KB | Relay event size limits |
| Content field | ~64 KB | Practical limit for text |
| Attachment (per file) | No protocol limit | Blossom server limits apply |
| Attachment (total) | No protocol limit | Storage cost may apply |

---

## Rich Content

### Content Types

The `content-type` tag declares the body format:

| Value | Description | Example |
|-------|-------------|---------|
| `text/plain` | Plain text (default) | Simple messages |
| `text/markdown` | Markdown | Formatted messages with headers, lists, links |
| `text/html` | HTML | Rich formatting (sanitized by client) |

### Markdown (Recommended Default)

Markdown provides formatting without the complexity or security risks of HTML:

```json
{
  "tags": [["content-type", "text/markdown"]],
  "content": "## Q3 Report Summary\n\n**Revenue**: $2.4M (+23%)\n\n### Key Metrics\n- New users: 45,000\n- Churn: 2.1%\n- NPS: 72\n\n> Revenue growth exceeded projections by 8 points.\n\nSee [full report](cid:attachment-1) for details."
}
```

### HTML (Restricted)

If HTML is used, clients MUST sanitize to prevent XSS:
- Allow: basic formatting tags (`<b>`, `<i>`, `<a>`, `<p>`, `<br>`, `<ul>`, `<ol>`, `<li>`, `<h1>`-`<h6>`, `<blockquote>`, `<pre>`, `<code>`, `<table>`, `<tr>`, `<td>`, `<th>`, `<img>`)
- Strip: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, event handlers (`onclick`, `onerror`, etc.)
- Sanitize: URLs in `href` and `src` (allow `https:`, `cid:`, deny `javascript:`, `data:`)

---

## Read Receipts & Delivery Confirmations

### Requesting Receipts

Sender includes receipt-request tags:
```json
["receipt-request", "delivery"],
["receipt-request", "read"]
```

### Sending a Receipt

A new event kind (e.g., kind 16) for mail receipts:

```json
{
  "kind": 16,
  "pubkey": "<recipient-pubkey>",
  "created_at": 1711850000,
  "tags": [
    ["p", "<sender-pubkey>"],
    ["e", "<original-mail-event-id>"],
    ["status", "delivered"],
    ["status-time", "1711849000"]
  ],
  "content": ""
}
```

Status values: `delivered`, `read`, `deleted`, `denied`

Receipts are also gift-wrapped (kind 1059) for privacy. The sender's client unwraps them to update message status.

### Receipt Behavior

- Receipts are **always optional** — recipient can ignore the request
- Clients SHOULD prompt users before sending read receipts
- Clients MAY auto-send delivery receipts (message received and decrypted)
- Receipts provide no guarantee (same as email MDN)

---

## Drafts

Drafts use an addressable event kind (30000-39999 range) so they can be updated:

```json
{
  "kind": 30015,
  "pubkey": "<user-pubkey>",
  "created_at": 1711840000,
  "tags": [
    ["d", "<unique-draft-id>"],
    ["p", "<intended-recipient>", "", "to"],
    ["subject", "Meeting Follow-up"],
    ["draft-status", "composing"]
  ],
  "content": "<NIP-44 encrypted draft content>"
}
```

- Addressable (kind 30000-39999): only latest per `d` tag retained
- Encrypted: draft content is NIP-44 encrypted to self
- Updatable: publish a new version with the same `d` tag to update
- Deletable: publish a kind 5 deletion event when draft is sent or discarded
- Stored on user's personal relay (not inbox relays)

---

## Mailbox State

A replaceable event (kind 10099 proposed) tracks mail state across devices.

### State Tag Format (AMEND-005)

| Tag | Format | Description |
|-----|--------|-------------|
| `read` | `["read", "<event-id>"]` | Message marked as read (G-Set, append-only per DEC-010) |
| `flag` | `["flag", "<event-id>", "<flag1>", "<flag2>", ...]` | Flags on a message |
| `folder` | `["folder", "<event-id>", "<folder-name>"]` | Folder assignment (event ID at index 1) |
| `deleted` | `["deleted", "<event-id>"]` | Message marked as deleted (G-Set) |

Note: The `folder` tag places the event ID at index 1 and the folder name at index 2. This follows NOSTR convention where the primary indexed value comes first after the tag name.

```json
{
  "kind": 10099,
  "pubkey": "<user-pubkey>",
  "created_at": 1711850000,
  "tags": [
    ["d", "mailbox-state"],
    ["read", "<event-id-1>"],
    ["read", "<event-id-2>"],
    ["flag", "<event-id-3>", "flagged"],
    ["folder", "<event-id-1>", "Work"],
    ["folder", "<event-id-3>", "Work"],
    ["folder", "<event-id-2>", "Personal"],
    ["deleted", "<event-id-5>"]
  ],
  "content": "<NIP-44 encrypted — contains state that shouldn't leak>"
}
```

### State Semantics (DEC-010, AMEND-008)

**Read state**: G-Set (append-only). Once a message is marked read, it stays read. A message cannot be marked "unread" — this is enforced by G-Set merge semantics. "Mark unread" is a UI-only feature (client hides from read set locally).

**Flags and folders**: LWW (last-write-wins) semantics. The entire state event is atomic — the event with the latest `created_at` replaces all previous state.

**Conflict resolution**: If two state events have the same `created_at`, the event with the lexicographically lower `id` (lowercase hex comparison) MUST be considered canonical.

**Multi-device merge**: When a client has local state changes and receives a newer remote state, it SHOULD merge:
- `reads`: G-Set union (add all read markers from both)
- `deleted`: G-Set union (add all deletion markers from both)
- `flags`: Union of flag sets per event ID
- `folders`: Remote wins for events present in both; local-only preserved

After merging, the client SHOULD publish a new kind 10099 with the merged state.

### Scaling Considerations

For users with thousands of messages, a single state event becomes unwieldy. Options:

1. **Partition by time**: `["d", "mailbox-state-2026-04"]` — monthly state events
2. **Partition by folder**: `["d", "mailbox-state-inbox"]`, `["d", "mailbox-state-archive"]`
3. **Delta model**: Only track non-default state (unread is default, track reads)
4. **Compact**: Periodically compact by removing old entries

---

## Mailing Lists & Group Mail

### Simple Distribution List

A pubkey that represents a list. The list operator:
1. Receives mail addressed to the list pubkey
2. Re-wraps and distributes to all subscriber pubkeys
3. Maintains subscriber list (kind 30000 addressable event)

```json
{
  "kind": 39000,
  "pubkey": "<list-operator-pubkey>",
  "created_at": 1711843200,
  "tags": [
    ["d", "engineering-team"],
    ["p", "<member-1-pubkey>"],
    ["p", "<member-2-pubkey>"],
    ["p", "<member-3-pubkey>"],
    ["name", "Engineering Team"],
    ["description", "Internal engineering discussion"],
    ["nip05", "engineering@company.com"]
  ],
  "content": ""
}
```

### NIP-29 Groups Extension

NIP-29 (relay-based groups) could be extended for mail:
- Group relay manages membership and message distribution
- Members publish to the group relay
- Group relay distributes gift-wrapped copies to all members
- Relay enforces access control (who can post, who can read)

---

## Auto-Responders

### Out-of-Office

A replaceable event declaring auto-response status:

```json
{
  "kind": 10098,
  "pubkey": "<user-pubkey>",
  "created_at": 1711843200,
  "tags": [
    ["d", "auto-responder"],
    ["status", "away"],
    ["until", "1712448000"],
    ["respond-to", "contacts"],
    ["rate-limit", "1-per-sender"]
  ],
  "content": "I'm out of office until April 7th. For urgent matters, contact bob@example.com."
}
```

Client behavior:
- When receiving mail, check sender's kind 10098
- If away, display auto-response notice before composing
- If the mail client itself auto-responds, it sends a gift-wrapped kind 15 reply with `["auto-response", "true"]` tag

---

## MIME vs NOSTR Mail: Format Comparison

### A Simple Text Email

**MIME:**
```
From: Alice <alice@example.com>
To: Bob <bob@example.com>
Subject: Hello
Date: Mon, 1 Apr 2026 12:00:00 +0000
Message-ID: <abc123@example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=sel1;
    h=from:to:subject:date:message-id; bh=....; b=....
X-Mailer: Thunderbird 128.0
X-Spam-Status: No, score=-2.1
Received: from mail.example.com (203.0.113.1) by mx.recipient.com ...
Received: from [192.168.1.100] by mail.example.com ...

Hello Bob, how are you?
```

**NOSTR Mail (rumor, before gift wrap):**
```json
{
  "kind": 15,
  "pubkey": "a1b2c3...",
  "created_at": 1711929600,
  "tags": [
    ["p", "b0b123...", "wss://inbox.bob.com", "to"],
    ["subject", "Hello"]
  ],
  "content": "Hello Bob, how are you?"
}
```

### An Email with HTML + Attachment

**MIME (~1.4 MB):**
```
Content-Type: multipart/mixed; boundary="----=_Part_001"

------=_Part_001
Content-Type: multipart/alternative; boundary="----=_Part_002"

------=_Part_002
Content-Type: text/plain; charset=UTF-8

See attached report.

------=_Part_002
Content-Type: text/html; charset=UTF-8

<html><body><p>See attached <b>report</b>.</p></body></html>

------=_Part_002--

------=_Part_001
Content-Type: application/pdf; name="report.pdf"
Content-Disposition: attachment; filename="report.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZw...
[... 1MB of base64 data ...]

------=_Part_001--
```

**NOSTR Mail (~500 bytes + 1MB on Blossom):**
```json
{
  "kind": 15,
  "pubkey": "a1b2c3...",
  "created_at": 1711929600,
  "tags": [
    ["p", "b0b123...", "wss://inbox.bob.com", "to"],
    ["subject", "Q3 Report"],
    ["content-type", "text/markdown"],
    ["attachment", "sha256abc...", "report.pdf", "application/pdf", "1048576"],
    ["attachment-key", "sha256abc...", "enc-key-hex..."],
    ["blossom", "https://blossom.example.com"]
  ],
  "content": "See attached **report**."
}
```

The NOSTR version is orders of magnitude smaller. The attachment lives on Blossom, downloaded on demand. No base64 bloat. No nested boundaries. No Content-Transfer-Encoding. No redundant plain text + HTML.

---

## Event Kind Summary

| Kind | Name | Category | Description |
|------|------|----------|-------------|
| 15 | Mail Message | Rumor (unsigned) | The actual mail content, sealed and wrapped |
| 16 | Mail Receipt | Rumor (unsigned) | Delivery/read confirmations |
| 13 | Seal | Regular | Encrypted rumor, signed by sender |
| 1059 | Gift Wrap | Regular | Encrypted seal, signed by ephemeral key |
| 10050 | DM Relay List | Replaceable | User's preferred inbox relays |
| 10098 | Auto-Responder | Replaceable | Out-of-office / auto-response config |
| 10099 | Mailbox State | Replaceable | Read/flagged/folder state |
| 30015 | Mail Draft | Addressable | Encrypted draft messages |
| 39000 | Mailing List | Addressable | Distribution list definition |
| 5 | Deletion | Regular | Delete request for sent/received mail |
