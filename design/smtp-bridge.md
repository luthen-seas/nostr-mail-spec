# SMTP Bridge — Interoperability with Legacy Email

> **How NOSTR Mail can send to and receive from traditional email addresses during the transition period, using a bidirectional SMTP↔NOSTR gateway.**

---

## Table of Contents

- [Why a Bridge Is Essential](#why-a-bridge-is-essential)
- [Architecture Overview](#architecture-overview)
- [Inbound: Email → NOSTR](#inbound-email--nostr)
- [Outbound: NOSTR → Email](#outbound-nostr--email)
- [Identity Mapping](#identity-mapping)
- [Provenance & Trust](#provenance--trust)
- [Attachment Handling](#attachment-handling)
- [Threading Across Protocols](#threading-across-protocols)
- [Deployment Models](#deployment-models)
- [Security Considerations](#security-considerations)
- [Limitations](#limitations)

---

## Why a Bridge Is Essential

NOSTR Mail cannot exist in isolation. The network effect of email is immense — billions of email addresses, decades of infrastructure. For NOSTR Mail to gain adoption, it must be able to:

1. **Receive** traditional email and present it in the NOSTR Mail inbox
2. **Send** to traditional email addresses from a NOSTR Mail client
3. Do both **transparently** so the user doesn't need to think about which protocol the recipient uses

This is analogous to how iMessage handles SMS: if the recipient is on iMessage, use the native protocol; if not, fall back to SMS. NOSTR Mail clients should detect whether a recipient has a NOSTR identity and choose the protocol accordingly.

---

## Architecture Overview

```
┌─────────────────┐                              ┌─────────────────┐
│  Email Sender    │                              │  NOSTR Mail     │
│  (Gmail, etc.)   │                              │  Recipient      │
└────────┬────────┘                              └────────▲────────┘
         │ SMTP                                           │ kind 1059
         │                                                │
┌────────▼────────────────────────────────────────────────┴────────┐
│                      SMTP ↔ NOSTR BRIDGE                         │
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────────────────┐   │
│  │  SMTP Server      │         │  NOSTR Client                │   │
│  │  (port 25, MX)    │         │  (WebSocket to relays)       │   │
│  │                    │         │                              │   │
│  │  Receive email     │────────>│  Gift-wrap & publish         │   │
│  │  DKIM/SPF/DMARC    │         │  to recipient's relays       │   │
│  │  verify            │         │                              │   │
│  └──────────────────┘         └──────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────────────────┐   │
│  │  NOSTR Subscriber │         │  SMTP Client                 │   │
│  │  (WebSocket)      │         │  (port 587/465)              │   │
│  │                    │         │                              │   │
│  │  Receive kind 1059 │────────>│  Convert to MIME             │   │
│  │  Decrypt event     │         │  DKIM sign & send            │   │
│  │                    │         │  via SMTP                    │   │
│  └──────────────────┘         └──────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Identity Mapper                                          │    │
│  │  NIP-05 ↔ email address mapping                          │    │
│  │  Pubkey ↔ bridge-assigned address                        │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Inbound: Email → NOSTR

When a traditional email is sent to a NOSTR Mail user:

### Flow

```
1. RECEIVE SMTP
   External MTA connects to bridge's SMTP server (port 25)
   Bridge's domain has MX records pointing to itself:
     nostrmail.com. IN MX 10 mx.nostrmail.com.
   
   Traditional sender sends to: alice@nostrmail.com

2. AUTHENTICATE
   Bridge verifies:
   - SPF: Is sending IP authorized?
   - DKIM: Is signature valid?
   - DMARC: Does domain align?
   - Result stored for provenance

3. PARSE MIME
   Extract from email:
   - From header → sender identity
   - To/CC headers → recipient mapping
   - Subject → subject tag
   - Body (text/html) → content field
   - Attachments → upload to Blossom
   - Message-ID → reference tag
   - In-Reply-To / References → thread tags
   - Date → created_at

4. RESOLVE RECIPIENT
   alice@nostrmail.com → look up in identity mapper
   → Alice's NOSTR pubkey
   → Alice's inbox relays (kind 10050)

5. CREATE NOSTR MAIL EVENT
   {
     kind: 15,
     pubkey: "<bridge-pubkey>",
     tags: [
       ["p", "<alice-pubkey>", "<relay>", "to"],
       ["subject", "Meeting Tomorrow"],
       ["bridged-from", "smtp", "bob@gmail.com"],
       ["bridged-auth", "spf:pass", "dkim:pass", "dmarc:pass"],
       ["bridged-message-id", "<original-message-id@gmail.com>"],
       ["content-type", "text/html"],
       // Attachments if any
     ],
     content: "<email body converted to markdown or HTML>"
   }

6. GIFT WRAP & DELIVER
   Bridge seals the rumor (signed by bridge's key)
   Gift wraps to Alice's pubkey
   Publishes to Alice's inbox relays

7. Alice receives in NOSTR Mail client
   Client recognizes ["bridged-from", "smtp"] → displays email icon
   Shows: "From: bob@gmail.com (via SMTP bridge)"
   Authentication status shown from bridged-auth tag
```

### Content Conversion

| Email Format | NOSTR Mail Conversion |
|-------------|----------------------|
| `text/plain` | Direct → content field |
| `text/html` | Convert to Markdown (preferred) or pass through with `["content-type", "text/html"]` |
| `multipart/alternative` | Prefer HTML → convert to Markdown; keep plain text as fallback |
| `multipart/mixed` | Extract body + upload attachments to Blossom |
| `multipart/related` | Extract inline images → upload to Blossom → use `["inline", hash, cid]` tags |
| Nested MIME | Flatten: extract all content parts and attachments |

### Handling Encrypted Email (PGP/S/MIME)

If the incoming email is PGP or S/MIME encrypted:
- Bridge **cannot decrypt** (doesn't have recipient's PGP/S/MIME key)
- Bridge passes the encrypted payload as-is in the content field
- Tags: `["bridged-encryption", "pgp"]` or `["bridged-encryption", "smime"]`
- Recipient's NOSTR client would need PGP/S/MIME support to decrypt

Alternatively: if the recipient has registered their PGP public key with the bridge, the bridge could re-encrypt from PGP to NIP-44. This is a trust decision.

---

## Outbound: NOSTR → Email

When a NOSTR Mail user sends to a traditional email address:

### Flow

```
1. DETECT RECIPIENT TYPE
   User composes to: bob@gmail.com
   Client checks: does bob@gmail.com resolve via NIP-05?
   → Fetch https://gmail.com/.well-known/nostr.json?name=bob
   → Likely fails (Gmail doesn't serve nostr.json)
   → Conclusion: bob@gmail.com is a traditional email address

2. ROUTE TO BRIDGE
   Client sends the mail to the bridge's NOSTR pubkey:
   {
     kind: 15,
     tags: [
       ["p", "<bridge-pubkey>", "<bridge-relay>", "bridge"],
       ["email-to", "bob@gmail.com"],
       ["email-cc", "charlie@outlook.com"],
       ["subject", "Hello from NOSTR"],
       // Attachments if any
     ],
     content: "Hi Bob, writing from the future..."
   }
   
   Sealed and gift-wrapped to bridge's pubkey
   Published to bridge's inbox relay

3. BRIDGE RECEIVES & DECRYPTS
   Bridge decrypts gift wrap → seal → rumor
   Extracts: email recipients, subject, body, attachments

4. CONVERT TO MIME
   Build email headers:
     From: alice@nostrmail.com  (bridge-assigned address)
     To: bob@gmail.com
     CC: charlie@outlook.com
     Subject: Hello from NOSTR
     Date: <current time>
     Message-ID: <generated>
     MIME-Version: 1.0
     X-Nostr-Pubkey: <alice-pubkey>
     X-Nostr-NIP05: alice@example.com
   
   Build MIME body:
     multipart/mixed
     ├── multipart/alternative
     │   ├── text/plain (content converted from markdown)
     │   └── text/html (content rendered from markdown)
     └── attachments (downloaded from Blossom, base64 encoded)

5. SIGN & SEND
   Bridge signs with DKIM (domain: nostrmail.com)
   Sends via SMTP to recipient's MX servers
   SPF record for nostrmail.com includes bridge's IP

6. DELIVERY CONFIRMATION
   If SMTP delivery succeeds:
     Bridge sends kind 16 receipt back to Alice:
     {kind: 16, tags: [["status", "delivered"], ["e", "<original-id>"]]}
   If bounced:
     Bridge forwards bounce info as kind 16 with ["status", "bounced"]
```

### Sender Address Mapping

The bridge needs to present a valid email address for the NOSTR sender:

**Option A: Bridge domain address**
```
Alice (npub1abc...) → alice@nostrmail.com
```
- Bridge maintains a mapping: pubkey → email address
- User registers their bridge address during onboarding
- All outbound mail appears from `@nostrmail.com`

**Option B: Custom domain**
```
Alice (npub1abc...) → alice@example.com (Alice's own domain)
```
- Alice configures her domain's MX to point to the bridge
- Alice sets up SPF/DKIM for the bridge's sending IP
- Mail appears from Alice's own domain (best for credibility)

**Option C: Forwarding address**
```
Alice (npub1abc...) → alice_nostr@nostrmail.com
  with Reply-To: alice@example.com
```
- Bridge generates unique addresses
- Reply-To points to Alice's preferred address
- Replies may go to email or back through the bridge

---

## Identity Mapping

### NIP-05 as the Bridge

NIP-05 already provides `user@domain` format. The bridge leverages this:

```
NOSTR → Email identity:
  User sets NIP-05: alice@nostrmail.com
  Bridge configures: alice@nostrmail.com → MX → bridge server
  Traditional email to alice@nostrmail.com → bridge → NOSTR

Email → NOSTR identity:
  User registers NIP-05 on bridge: alice@nostrmail.com
  Bridge maps: alice@nostrmail.com ↔ npub1abc...
  Bridge serves: nostrmail.com/.well-known/nostr.json
    {"names": {"alice": "abc123..."}}
```

### Custom Domain Bridge

For users with their own domains:

```
1. User owns example.com
2. User configures:
   - MX record → bridge server
   - SPF → includes bridge IP
   - DKIM → bridge's public key
   - NIP-05 → .well-known/nostr.json on example.com
3. Bridge handles:
   - Inbound: SMTP to alice@example.com → NOSTR
   - Outbound: NOSTR from Alice → SMTP as alice@example.com
4. Result: alice@example.com works for both email AND NOSTR
```

---

## Provenance & Trust

### Bridged Message Indicators

NOSTR Mail clients should clearly indicate bridged messages:

```
BRIDGED FROM EMAIL:
  • Display: "📧 From: bob@gmail.com (via SMTP bridge)"
  • Show auth results: "SPF ✓  DKIM ✓  DMARC ✓"
  • Show bridge identity: "Bridged by nostrmail.com"
  • Warning if auth failed: "⚠ Authentication failed — may be spoofed"

BRIDGED TO EMAIL:
  • Display: "📧 To: bob@gmail.com (via SMTP bridge)"
  • Show delivery status: "Delivered" / "Bounced" / "Pending"
  • Note: "This message was sent as traditional email"
```

### Trust Tags

```json
["bridged-from", "smtp", "bob@gmail.com"],
["bridged-via", "<bridge-pubkey>", "nostrmail.com"],
["bridged-auth", "spf:pass", "dkim:pass", "dmarc:pass"],
["bridged-message-id", "<original-message-id>"],
["bridged-received", "<received-header-chain>"]
```

### Trust Model

The bridge is a **trusted intermediary** for bridged messages:
- The bridge's NOSTR pubkey signs the seal (it's the sender from NOSTR's perspective)
- Recipients must trust that the bridge accurately represented the email
- The bridge can provide original email headers for verification
- Multiple independent bridges can exist (like multiple email providers)

---

## Attachment Handling

### Inbound (Email → NOSTR)

```
1. Bridge extracts MIME attachments from email
2. For each attachment:
   a. Decode from base64
   b. Encrypt with random NIP-44 key
   c. Upload to Blossom server
   d. Add to rumor tags:
      ["attachment", "<hash>", "report.pdf", "application/pdf", "size"]
      ["attachment-key", "<hash>", "<key>"]
3. Inline images (multipart/related):
   a. Match Content-ID references in HTML
   b. Upload to Blossom
   c. Replace cid: references with Blossom URLs or ["inline"] tags
```

### Outbound (NOSTR → Email)

```
1. Bridge extracts attachment tags from decrypted rumor
2. For each attachment:
   a. Download from Blossom server
   b. Decrypt with key from attachment-key tag
   c. Base64 encode
   d. Add as MIME part with Content-Disposition: attachment
3. Inline images:
   a. Download and decrypt
   b. Add as multipart/related parts with Content-ID
   c. Reference from HTML body
```

---

## Threading Across Protocols

### Email Thread → NOSTR Thread

```
Email thread:
  Message A: Message-ID: <aaa@gmail.com>
  Message B: In-Reply-To: <aaa@gmail.com>, References: <aaa@gmail.com>
  Message C: In-Reply-To: <bbb@gmail.com>, References: <aaa@gmail.com> <bbb@gmail.com>

Bridge conversion:
  NOSTR Message A: (root, no thread tags)
    ["bridged-message-id", "<aaa@gmail.com>"]
  
  NOSTR Message B:
    ["reply", "<nostr-event-id-A>"]
    ["thread", "<nostr-event-id-A>"]
    ["bridged-message-id", "<bbb@gmail.com>"]
  
  NOSTR Message C:
    ["reply", "<nostr-event-id-B>"]
    ["thread", "<nostr-event-id-A>"]
    ["bridged-message-id", "<ccc@gmail.com>"]
```

Bridge maintains a mapping: `Message-ID → NOSTR event ID` for thread continuity.

### NOSTR Thread → Email Thread

```
NOSTR thread:
  Event A (root): subject "Project Update"
  Event B: ["reply", "A"], ["thread", "A"]
  Event C: ["reply", "B"], ["thread", "A"]

Bridge conversion:
  Email A:
    Message-ID: <nostr-A@nostrmail.com>
    Subject: Project Update
  
  Email B:
    Message-ID: <nostr-B@nostrmail.com>
    In-Reply-To: <nostr-A@nostrmail.com>
    References: <nostr-A@nostrmail.com>
    Subject: Re: Project Update
  
  Email C:
    Message-ID: <nostr-C@nostrmail.com>
    In-Reply-To: <nostr-B@nostrmail.com>
    References: <nostr-A@nostrmail.com> <nostr-B@nostrmail.com>
    Subject: Re: Project Update
```

---

## Deployment Models

### Hosted Bridge Service

```
Provider runs the bridge as a service:
  • nostrmail.com, nostrbridge.io, etc.
  • Users sign up, get user@provider.com address
  • Provider manages MX, SPF, DKIM, DMARC
  • Provider runs NOSTR relays for bridge events
  • Revenue model: freemium, paid tiers, or micropayments

Pros: Easy onboarding, managed infrastructure
Cons: Centralization risk, trust in provider, potential censorship
```

### Self-Hosted Bridge

```
User runs their own bridge:
  • On their own domain (example.com)
  • Docker container or standalone binary
  • Manages own MX/SPF/DKIM/DMARC
  • Connects to chosen NOSTR relays

Pros: Full control, no third-party trust
Cons: Technical skill required, deliverability challenges (IP reputation)
```

### Federated Bridge Network

```
Multiple independent bridge operators:
  • Each operates their own domain
  • Shared protocol for bridge-to-bridge communication
  • Users can choose any bridge operator
  • Bridges can vouch for each other (web of trust)

Pros: Decentralized, competitive market
Cons: Complexity, coordination overhead
```

---

## Security Considerations

### Bridge as Attack Surface

The bridge is a single point of trust for bridged messages. Threats:

| Threat | Mitigation |
|--------|-----------|
| Bridge reads all bridged mail | Minimize data retention; users accept trust trade-off |
| Bridge forges messages | Bridge reputation; signed provenance tags; multiple bridges |
| Bridge is compromised | Bridge key rotation; monitoring; users can switch bridges |
| Bridge censors messages | Multiple independent bridges; self-hosting option |
| Spam through bridge | Bridge applies email-side spam filtering before conversion |
| Phishing via bridge | Bridge preserves and displays email auth results |

### What the Bridge Sees

For inbound email → NOSTR:
- The bridge sees the full email (headers, body, attachments)
- After conversion, the bridge gift-wraps for the recipient
- The bridge does not need to retain the email after conversion

For outbound NOSTR → email:
- The bridge must decrypt the NOSTR message to convert to MIME
- The bridge sees the full content
- The bridge does not need to retain after sending

**Key principle**: The bridge is a necessary trust point during the email↔NOSTR transition. As NOSTR Mail adoption grows, the bridge becomes less necessary.

---

## Limitations

1. **Privacy degradation**: Bridged messages pass through the bridge in cleartext. The bridge operator can read all bridged mail. This is inherent — email is not encrypted, so the bridge must handle plaintext.

2. **Metadata exposure on email side**: Even though NOSTR side uses gift wrap, the email side exposes full metadata (sender, recipient, subject, timestamps). The bridge cannot fix email's metadata problem.

3. **Authentication asymmetry**: NOSTR messages are cryptographically signed by the sender. Bridged email messages are signed by the bridge, not the original email sender. Recipients must trust the bridge's auth verification.

4. **Deliverability**: Outbound email from the bridge faces the same deliverability challenges as any email sender (IP reputation, warm-up, RBLs). Established bridge services will have better deliverability.

5. **Feature parity**: Some email features have no direct NOSTR equivalent and vice versa:
   - Email: delivery status notifications, return receipts, priority headers
   - NOSTR: micropayments, PoW, cryptographic deniability
   - The bridge makes best-effort translations for each.

6. **Latency**: Bridged messages have additional latency (email reception → parsing → conversion → gift wrap → relay publication). This adds seconds to minutes compared to native NOSTR Mail.

7. **Cost**: Running a bridge requires email infrastructure (SMTP server, MX records, IP address with good reputation, DKIM keys) plus NOSTR infrastructure (relay connections, event publication). This has ongoing operational cost.
