# Legacy Email Dissection — Understanding What We're Replacing

> **A comprehensive breakdown of the email protocol stack: SMTP, IMAP/POP3, MIME, DNS, SPF/DKIM/DMARC, TLS, and JMAP — their mechanics, strengths, and structural failures.**

---

## Table of Contents

- [The Email Protocol Stack](#the-email-protocol-stack)
- [SMTP — Simple Mail Transfer Protocol](#smtp--simple-mail-transfer-protocol)
- [IMAP and POP3 — Mailbox Access](#imap-and-pop3--mailbox-access)
- [MIME — Multipurpose Internet Mail Extensions](#mime--multipurpose-internet-mail-extensions)
- [DNS — Mail Routing](#dns--mail-routing)
- [Authentication Stack — SPF, DKIM, DMARC, ARC](#authentication-stack--spf-dkim-dmarc-arc)
- [Transport Security — TLS, MTA-STS, DANE](#transport-security--tls-mta-sts-dane)
- [Modern Extensions — JMAP, BIMI, Autocrypt](#modern-extensions--jmap-bimi-autocrypt)
- [The Full Lifecycle of an Email](#the-full-lifecycle-of-an-email)
- [Identity in Email](#identity-in-email)
- [Why Email Is Broken — The Structural Failures](#why-email-is-broken--the-structural-failures)

---

## The Email Protocol Stack

Email is not one protocol — it's a tower of protocols accumulated over 40+ years:

```
┌──────────────────────────────────────────────────────────────┐
│  User Interface (MUA)          — Thunderbird, Gmail, Outlook │
├──────────────────────────────────────────────────────────────┤
│  Mailbox Access                — IMAP4 (RFC 9051) / POP3    │
│                                  JMAP (RFC 8620/8621)        │
├──────────────────────────────────────────────────────────────┤
│  Message Format                — MIME (RFCs 2045-2049)       │
│                                  Headers (RFC 5322)          │
├──────────────────────────────────────────────────────────────┤
│  Transfer Protocol             — SMTP (RFC 5321)             │
│                                  ESMTP Extensions            │
├──────────────────────────────────────────────────────────────┤
│  Authentication (Retroactive)  — SPF (RFC 7208)              │
│                                  DKIM (RFC 6376)             │
│                                  DMARC (RFC 7489)            │
│                                  ARC (RFC 8617)              │
├──────────────────────────────────────────────────────────────┤
│  Transport Security            — STARTTLS (RFC 3207)         │
│                                  MTA-STS (RFC 8461)          │
│                                  DANE (RFC 7672)             │
├──────────────────────────────────────────────────────────────┤
│  Routing                       — DNS MX Records              │
│                                  PTR (Reverse DNS)           │
├──────────────────────────────────────────────────────────────┤
│  End-to-End Encryption (Opt)   — PGP/GPG (RFC 4880)         │
│                                  S/MIME (RFC 8551)           │
│                                  Autocrypt (Level 1)         │
└──────────────────────────────────────────────────────────────┘
```

Each layer was designed independently, often decades apart, and bolted onto the others. This creates complexity, fragility, and security gaps at every seam.

---

## SMTP — Simple Mail Transfer Protocol

### Core Protocol (RFC 5321, originally RFC 821 in 1982)

SMTP is the **push protocol** for transmitting email between servers. The sender initiates a TCP connection and pushes the message to the receiver.

### The SMTP Conversation

An SMTP session is a text-based command/response exchange:

```
Client connects to port 25 (relay) or 587 (submission)
S: 220 mail.example.com ESMTP ready
C: EHLO sender.com
S: 250-mail.example.com
S: 250-STARTTLS
S: 250-AUTH PLAIN LOGIN
S: 250-SIZE 52428800
S: 250 8BITMIME
C: STARTTLS
S: 220 Ready to start TLS
   [TLS handshake]
C: EHLO sender.com
C: AUTH PLAIN dXNlcjpwYXNz
S: 235 Authentication successful
C: MAIL FROM:<alice@sender.com>
S: 250 OK
C: RCPT TO:<bob@example.com>
S: 250 OK
C: DATA
S: 354 Start mail input
C: From: Alice <alice@sender.com>
C: To: Bob <bob@example.com>
C: Subject: Hello
C: Date: Mon, 1 Apr 2026 12:00:00 +0000
C: Message-ID: <abc123@sender.com>
C:
C: Hello Bob, how are you?
C: .
S: 250 OK: queued as 12345
C: QUIT
S: 221 Bye
```

### Envelope vs. Headers — The Original Sin

This is email's fundamental architectural flaw:

- **Envelope** (`MAIL FROM`, `RCPT TO`): Used by MTAs for routing. Like the address on a physical envelope. The envelope sender receives bounces. The envelope recipients determine actual delivery.
- **Headers** (`From:`, `To:`, `Cc:`, `Subject:`): Part of the message content inside `DATA`. Displayed to the recipient. **Not used for routing. Trivially forgeable.**

The `From:` header that a user sees can be completely different from the `MAIL FROM:` envelope sender. This separation enables email spoofing and phishing, and is why SPF/DKIM/DMARC had to be invented 20+ years later.

### The MTA Relay Model

Email delivery is a chain of Mail Transfer Agents:

```
MUA (Mail User Agent)        — email client (Thunderbird, Gmail web)
 ↓
MSA (Mail Submission Agent)  — accepts from authenticated local users (port 587)
 ↓
MTA (Mail Transfer Agent)    — routes between servers (port 25)
 ↓  [may pass through relay MTAs]
MTA (destination)            — receiving server
 ↓
MDA (Mail Delivery Agent)    — final delivery to mailbox (Dovecot, procmail)
 ↓
Mailbox                      — stored on disk (Maildir/mbox/database)
```

MTAs use **store-and-forward**: if the destination is unreachable, the message is queued and retried (typically over 4-5 days) before generating a bounce. Each MTA prepends a `Received:` header, creating a traceable chain.

### Port Conventions

| Port | Purpose | Encryption | Auth Required |
|------|---------|------------|---------------|
| 25 | MTA-to-MTA relay | STARTTLS (opportunistic) | No |
| 587 | Client submission (MSA) | STARTTLS (mandatory by convention) | Yes (SMTP AUTH) |
| 465 | Client submission (implicit TLS) | TLS from connection start | Yes |

ISPs often block outbound port 25 for residential IPs to prevent spam botnets.

### ESMTP Extensions

Modern SMTP (ESMTP) negotiates extensions via the `EHLO` response:

| Extension | Purpose |
|-----------|---------|
| `8BITMIME` | 8-bit content (vs original 7-bit ASCII) |
| `PIPELINING` | Batch commands without waiting for each response |
| `SIZE` | Declare maximum message size |
| `CHUNKING/BDAT` | Alternative to DATA for binary content |
| `DSN` | Delivery Status Notifications |
| `SMTPUTF8` | Internationalized email addresses |
| `STARTTLS` | Upgrade to TLS encryption |
| `AUTH` | Authentication mechanisms |

---

## IMAP and POP3 — Mailbox Access

### POP3 (Post Office Protocol v3, RFC 1939)

The simpler, older protocol:

- **Download-and-delete model**: Client downloads messages, optionally deletes from server
- Port 110 (plaintext) or 995 (implicit TLS)
- No folder management — everything is one inbox
- No synchronization — changes on one device don't reflect on others
- No server-side search
- Suitable only for single-device access
- Nearly obsolete for modern use

### IMAP (Internet Message Access Protocol v4rev2, RFC 9051)

The rich, stateful protocol for modern multi-device email:

- **Server-side storage model**: Messages stay on server; clients view/manipulate remotely
- Port 143 (STARTTLS) or 993 (implicit TLS)
- **Folder management**: Create, rename, delete, subscribe/unsubscribe to mailboxes
- **Message flags**: `\Seen`, `\Answered`, `\Flagged`, `\Deleted`, `\Draft` — synced across devices
- **Partial fetch**: Download only headers, specific MIME parts, or byte ranges
- **Server-side search**: `SEARCH` and `SORT` commands
- **Concurrent connections**: Multiple clients access the same mailbox simultaneously

### IMAP IDLE (RFC 2177)

The push notification mechanism for email:

- Client sends `IDLE` command and enters a waiting state
- Server pushes notifications on new messages, flag changes, or expunges
- True push — no polling required
- 29-minute timeout (firewalls/servers); clients must periodically re-issue `IDLE`
- **Only works for one mailbox per connection** — monitoring multiple folders requires multiple TCP connections

### IMAP Pain Points

- Extremely complex stateful protocol — difficult to implement correctly
- High connection overhead — persistent TCP connection per client per folder
- Poor mobile performance (battery drain, connection management)
- Server-side search is limited vs modern full-text engines
- Extension ecosystem is fragmented across servers
- No unified push for multiple mailboxes

---

## MIME — Multipurpose Internet Mail Extensions

### The Problem MIME Solves

Original SMTP (1982) only supported 7-bit ASCII text. MIME (RFCs 2045-2049, 1996) extends email to support:
- Non-ASCII character sets (Unicode, CJK, etc.)
- Attachments (files, images, documents)
- HTML-formatted messages
- Multiple content alternatives (text + HTML)
- Nested/hierarchical message structures

### Key MIME Headers

```
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable
Content-Disposition: attachment; filename="report.pdf"
Content-ID: <image001@sender.com>
```

### Content-Transfer-Encoding

| Encoding | Description | Use Case |
|----------|-------------|----------|
| `7bit` | ASCII only, no encoding | Plain ASCII text |
| `quoted-printable` | Non-ASCII as `=XX` hex | Mostly-text with some Unicode |
| `base64` | Binary as ASCII; +33% size | Attachments, binary data |
| `8bit` | Raw 8-bit data | Requires 8BITMIME extension |
| `binary` | Raw binary data | Requires BINARYMIME extension |

### Multipart Message Structure

MIME uses **boundary strings** to separate parts:

```
Content-Type: multipart/mixed; boundary="----=_Part_123"

------=_Part_123
Content-Type: text/plain; charset=UTF-8

Hello, this is the plain text body.

------=_Part_123
Content-Type: application/pdf; name="report.pdf"
Content-Disposition: attachment; filename="report.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK... (base64 encoded PDF data)

------=_Part_123--
```

### Multipart Subtypes

| Subtype | Purpose |
|---------|---------|
| `multipart/mixed` | Message with attachments (most common) |
| `multipart/alternative` | Same content in different formats (text + HTML) |
| `multipart/related` | HTML with inline images (Content-ID references) |
| `multipart/signed` | Message + detached cryptographic signature |
| `multipart/encrypted` | Encrypted message content |
| `multipart/digest` | Collection of messages (mailing list digest) |
| `multipart/report` | Delivery status notifications / MDNs |

### A Typical Modern Email (Nested MIME)

```
multipart/mixed
├── multipart/alternative
│   ├── text/plain                    (plain text fallback)
│   └── multipart/related
│       ├── text/html                 (HTML body)
│       └── image/png                 (inline logo via Content-ID)
└── application/pdf                   (attached file)
```

This nesting complexity is one of email's worst implementation burdens. Parsing MIME correctly is notoriously difficult — edge cases, encoding bugs, and malformed messages are ubiquitous.

---

## DNS — Mail Routing

### MX Records

MX (Mail eXchange) records tell sending MTAs where to deliver mail for a domain:

```
example.com.  IN  MX  10  mail1.example.com.
example.com.  IN  MX  20  mail2.example.com.
```

The number is **priority** (lower = preferred). Sending MTA:
1. Query DNS for MX records of recipient domain
2. Sort by priority (lowest first)
3. Resolve each MX hostname to A/AAAA record
4. Connect via SMTP to highest-priority server
5. On failure, try next priority
6. Same priority → round-robin for load balancing

If no MX record exists, falls back to the A/AAAA record of the domain itself.

### DNS Records Used by Email

| Record | Purpose |
|--------|---------|
| MX | Mail routing — which servers accept mail |
| A/AAAA | IP addresses of mail servers |
| TXT (SPF) | Authorized sending IPs |
| TXT (DKIM) | Public key for signature verification |
| TXT (DMARC) | Authentication policy and reporting |
| TXT (MTA-STS) | MTA-STS policy availability |
| TLSA (DANE) | TLS certificate pinning via DNSSEC |
| PTR | Reverse DNS — IP to hostname (critical for deliverability) |
| TXT (BIMI) | Brand logo URI for inbox display |

### Reverse DNS (PTR Records)

Receiving servers almost universally check that the connecting IP has a valid PTR record that resolves back to the same IP (forward-confirmed reverse DNS). Failure results in rejection or spam classification. This is why self-hosted email on residential IPs or cheap VPS ranges fails — many IP ranges have no PTR records or have generic ones that trigger spam filters.

---

## Authentication Stack — SPF, DKIM, DMARC, ARC

### SPF (Sender Policy Framework, RFC 7208)

**Purpose**: Declare which IPs are authorized to send mail for your domain.

**Mechanism**:
1. Domain publishes DNS TXT record:
   ```
   v=spf1 ip4:203.0.113.0/24 include:_spf.google.com -all
   ```
2. Receiving MTA extracts domain from `MAIL FROM` envelope sender
3. Looks up SPF record for that domain
4. Checks if connecting IP matches any authorized mechanism
5. Result: `pass`, `fail`, `softfail`, `neutral`, `none`, `temperror`, `permerror`

**Limitations**:
- Only checks envelope sender, not `From:` header (what users see)
- **Breaks on forwarding** — forwarding server's IP not in original domain's SPF
- 10 DNS lookup limit for mechanism resolution
- Does not verify message integrity

### DKIM (DomainKeys Identified Mail, RFC 6376)

**Purpose**: Cryptographic proof that specified headers and body have not been altered and were authorized by the signing domain.

**Mechanism**:
1. Sending server's private key; public key published at `selector._domainkey.example.com`
2. Server creates hash of specified headers + body
3. Signs hash with private key
4. Adds `DKIM-Signature` header:
   ```
   DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector1;
       h=from:to:subject:date:message-id;
       bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;
       b=AuUoFEfDxTDkHlLXSZEpZj79LICEps6eda7W3deTVFOk...
   ```
5. Receiving server retrieves public key from DNS, verifies signature

**Limitations**:
- No policy — failed DKIM has no prescribed action
- Breaks if message modified in transit (mailing lists, forwarding)
- Only signing domain matters (may differ from `From:` header domain)

### DMARC (Domain-based Message Authentication, Reporting & Conformance, RFC 7489)

**Purpose**: Tie SPF and DKIM together with the `From:` header domain and specify what to do when authentication fails.

**Mechanism**:
1. Domain publishes TXT record at `_dmarc.example.com`:
   ```
   v=DMARC1; p=reject; rua=mailto:dmarc@example.com; adkim=s; aspf=r
   ```
2. Receiving server performs SPF and DKIM checks
3. **Alignment check**: Does SPF or DKIM domain match the `From:` header domain?
   - SPF alignment: `MAIL FROM` domain matches `From:` domain
   - DKIM alignment: `d=` signing domain matches `From:` domain
   - Strict (`s`) = exact match; Relaxed (`r`) = organizational domain match
4. If neither passes with alignment, apply policy:
   - `p=none` — monitor only (send reports)
   - `p=quarantine` — deliver to spam
   - `p=reject` — reject the message

**Reporting**: Aggregate reports (rua) provide daily XML summaries. Forensic reports (ruf) give individual failures (rarely sent for privacy reasons).

### ARC (Authenticated Received Chain, RFC 8617)

**Purpose**: Preserve authentication results across forwarding hops where SPF/DKIM would break.

**Mechanism**: Each intermediary adds three ARC headers:
1. **ARC-Authentication-Results (AAR)**: SPF/DKIM/DMARC results snapshot at this hop
2. **ARC-Message-Signature (AMS)**: DKIM-like signature over the message at this hop
3. **ARC-Seal (AS)**: Signature over all previous ARC header sets (chain of custody)

The receiving server evaluates whether the chain is trustworthy. If original auth fails but a trusted ARC intermediary vouches for the results, the message can still pass.

**Limitation**: Requires maintaining a list of trusted ARC sealers.

### The Complete Authentication Flow

```
Sender composes message
  → MSA signs with DKIM
  → Sends via SMTP
  → Receiving MTA checks:
       1. SPF: Is this IP authorized for envelope sender domain?
       2. DKIM: Does signature verify against DNS public key?
       3. DMARC: Does SPF/DKIM domain align with From: header?
       4. ARC: If forwarded, is there a trusted chain of custody?
       5. Apply DMARC policy (none / quarantine / reject)
  → MDA delivers (or quarantines / rejects)
```

As of 2025-2026, Google, Microsoft, Yahoo, and Apple **require** SPF, DKIM, and DMARC for bulk senders, with non-compliance resulting in SMTP-level rejection.

---

## Transport Security — TLS, MTA-STS, DANE

### Opportunistic TLS (STARTTLS)

SMTP between MTAs uses opportunistic encryption via STARTTLS by default:

- If both sides support TLS, connection upgrades
- If negotiation fails, connection proceeds **in plaintext**
- No certificate verification typically performed
- Vulnerable to downgrade attacks (MITM strips STARTTLS offer)
- Google's research found ~40-50% of emails exchanged with Gmail lack TLS

### MTA-STS (RFC 8461)

Makes TLS **mandatory** for a domain's inbound mail:

1. DNS TXT record: `_mta-sts.example.com. IN TXT "v=STSv1; id=20240101"`
2. Policy file at `https://mta-sts.example.com/.well-known/mta-sts.txt`
3. Specifies mode (testing/enforce), max_age, and which MX hosts require TLS
4. Sending MTAs cache policy and refuse non-TLS delivery

**Pros**: No DNSSEC required; uses Web PKI.
**Cons**: TOFU (first fetch is unprotected); caching delays policy changes.

### DANE (RFC 7672)

Pins TLS certificates in DNS using DNSSEC:

1. TLSA record: `_25._tcp.mail.example.com. IN TLSA 3 1 1 <hash>`
2. MTA verifies TLS cert matches TLSA record via DNSSEC-validated DNS
3. No Certificate Authorities required

**Pros**: No TOFU; cryptographically verifiable from first connection.
**Cons**: Requires full DNSSEC chain (rare — most domains lack DNSSEC).

### TLS-RPT (RFC 8460)

Reporting for MTA-STS and DANE failures:
```
_smtp._tls.example.com. IN TXT "v=TLSRPTv1; rua=mailto:tls-reports@example.com"
```
Sending servers report TLS successes/failures, enabling detection of downgrade attacks.

---

## Modern Extensions — JMAP, BIMI, Autocrypt

### JMAP (JSON Meta Application Protocol, RFC 8620/8621)

JMAP is the modern replacement for IMAP, designed by Fastmail:

- **HTTP + JSON based**: All operations are HTTPS POST with JSON payloads
- **Stateless**: No persistent TCP connections; works with mobile, firewalls, proxies
- **Request batching**: Multiple operations in a single HTTP request
- **Delta sync**: Only fetch changes since last sync state
- **Server parses MIME**: Clean JSON structures presented to clients
- **Unified protocol**: Email, contacts, calendars in one protocol
- **Push**: Server-Sent Events or Web Push for real-time

JMAP addresses nearly every IMAP pain point. Adoption is limited — Fastmail is the primary deployment; most major providers use proprietary APIs.

### BIMI (Brand Indicators for Message Identification)

Displays verified brand logos next to authenticated emails:

1. Requires DMARC at `p=quarantine` or `p=reject`
2. SVG Tiny P/S logo
3. Verified Mark Certificate (VMC) from a CA (~$1,500/year)
4. DNS: `default._bimi.example.com: v=BIMI1; l=<logo-url>; a=<vmc-url>`

Supported by Google, Apple, Yahoo. Inaccessible to small senders due to VMC cost.

### Autocrypt (Level 1)

Opportunistic end-to-end encryption built on OpenPGP:

- Public keys exchanged via `Autocrypt:` header in outgoing emails
- No keyservers, no web of trust, no manual key exchange
- First message cleartext (key exchange); subsequent can be encrypted
- `prefer-encrypt: mutual` communicates encryption preference
- Implemented in Thunderbird, K-9 Mail, Delta Chat
- Deliberately trades some security for usability (no key verification by default)

---

## The Full Lifecycle of an Email

### Step by Step: Compose to Read Receipt

```
1. COMPOSITION
   User writes message in MUA (mail client)
   Client constructs MIME structure: headers, body (text/html), attachments
   May add Autocrypt header with sender's public key
   
2. SUBMISSION
   MUA → MSA on port 587 (STARTTLS) or 465 (implicit TLS)
   Authenticates via SMTP AUTH (password or OAuth)
   MAIL FROM (envelope) → RCPT TO (envelope) → DATA (MIME message)
   MSA validates, applies sender policies, rate limits
   
3. SIGNING & PROCESSING
   MSA/MTA adds DKIM-Signature header
   May add ARC headers if forwarding
   Queues message for delivery
   
4. DNS RESOLUTION & ROUTING
   Sending MTA extracts recipient domain from envelope
   Queries DNS for MX records → resolves to IP addresses
   Selects highest-priority (lowest number) MX
   
5. SERVER-TO-SERVER TRANSFER
   Sending MTA → Receiving MTA on port 25
   EHLO → STARTTLS upgrade → MAIL FROM → RCPT TO → DATA
   May pass through relay hops (each adds Received: header)
   
6. AUTHENTICATION AT DESTINATION
   SPF check (authorized IP?)
   DKIM verification (signature valid?)
   DMARC evaluation (domain alignment?)
   ARC chain check (if forwarded)
   Reputation check, RBL lookup, content filtering
   
7. DELIVERY
   MTA → MDA → server-side rules (Sieve filters, spam scoring)
   Message placed in recipient's mailbox
   
8. NOTIFICATION & ACCESS
   IMAP IDLE pushes notification to connected clients
   Client downloads headers (IMAP) or full message (POP3)
   User opens message; body/attachments fetched on demand
   
9. READ RECEIPT (Optional, RFC 8098)
   If sender requested MDN (Disposition-Notification-To header)
   Recipient's MUA may prompt to send read receipt
   MDN is a multipart/report message sent back to sender
   Entirely optional — recipient can always refuse
   Trivially fakeable — provides no guarantee
   
10. DELIVERY STATUS NOTIFICATIONS (RFC 3464)
    On delivery failure: receiving MTA generates DSN (bounce)
    Sent to envelope sender (MAIL FROM / Return-Path)
    Machine-readable status codes (e.g., 5.1.1 = mailbox not found)
    Backscatter problem: forged MAIL FROM → bounces to innocent parties
```

---

## Identity in Email

### How Email Addresses Work

`local-part@domain` has two components:
- **Local part**: Arbitrary string (up to 64 bytes), interpreted only by destination server
- **Domain**: DNS-resolvable, determines routing via MX records

The identity system is **domain-centric**:
- `user@gmail.com` — Google controls this identity
- `user@company.com` — employer controls this identity
- `user@yourdomain.com` — you control this (if you own the domain)

### The Portability Problem

If you use `user@gmail.com` for 15 years:
- You cannot take that address to another provider
- Switching means updating every service, contact, and account
- Google can disable your account (and your identity) at any time
- Email history stays with Google unless manually exported
- Domain ownership is the only real portability solution, but requires ongoing cost and DNS knowledge

### Forwarding and Aliasing

- **Server-side forwarding**: Receives mail, re-sends to another address. Breaks SPF. May break DKIM. This is why ARC exists.
- **Plus addressing**: `user+tag@domain` — tag ignored for routing but preserved. Reveals base address. Some services reject `+`.
- **Alias services** (SimpleLogin, AnonAddy, Apple Hide My Email): Generate unique forwarding addresses; can be revoked individually; add dependency on alias provider.

---

## Why Email Is Broken — The Structural Failures

### 1. Spam and Phishing

- Spam accounts for ~45% of all email traffic globally
- SMTP was designed with no sender authentication — spoofing is the default
- SPF/DKIM/DMARC are retroactive patches, not native security
- Sophisticated phishing passes all authentication by using legitimately registered domains
- ML spam filters (Gmail, Microsoft) are opaque and generate false positives
- No standard way to know why a message was classified as spam

### 2. No Native Encryption

- SMTP was designed for plaintext (1982 — different internet)
- Transport encryption (TLS) only protects in transit, not at rest
- End-to-end encryption has catastrophically failed:
  - PGP: 30+ years, still <1% adoption; unusable key management; Web of Trust is dead
  - S/MIME: Requires CAs and corporate PKI; consumer adoption near zero
  - 2018 Efail attack demonstrated fundamental vulnerabilities in both
  - Autocrypt is the most promising but still marginal
- Even with full E2EE, **all metadata remains exposed**

### 3. Metadata Exposure

Even with content encryption:
- Sender and recipient addresses visible to all intermediaries
- Subject lines visible
- Timestamps create activity timelines
- IP addresses in `Received:` headers reveal geography
- Routing information exposes infrastructure
- Email providers mine metadata for advertising with 90%+ accuracy
- Governments mandate metadata retention for surveillance
- **No standard mechanism to encrypt or hide email metadata**

### 4. The Gmail/Microsoft/Yahoo Oligopoly

- Google and Microsoft control the vast majority of email infrastructure
- Google processes ~300 billion emails annually
- Their spam filters are opaque gatekeepers
- They define de facto standards (requiring DMARC, one-click unsubscribe)
- Self-hosting against this oligopoly is near-impossible:
  - VPS IP ranges pre-blocklisted
  - IP warm-up takes weeks/months
  - Single spam complaint can destroy deliverability
  - RBL delisting requires navigating opaque bureaucracy
  - Gmail's enforcement rejects non-compliant mail at SMTP level

### 5. Vendor Lock-In

- Email addresses are domain-dependent — your address is your provider
- No separation between identity and transport
- Switching providers = changing identity or managing forwarding
- Data export is manual, lossy, and format-dependent
- Labels, filters, search indexes are not portable

### 6. Protocol Complexity

- 20-40+ headers per typical email, many machine-generated
- `Received:` header chains are long and hard to parse
- Threading via `Message-ID`/`References`/`In-Reply-To` is fragile and inconsistently implemented
- MIME nesting creates deeply recursive structures
- Character encoding across headers is a notorious source of bugs
- 7+ separate protocols that must interoperate correctly

### 7. Deliverability Hell

- Successful delivery requires: clean IP, correct PTR, SPF, DKIM, DMARC, proper `List-Unsubscribe`, low complaint rate, consistent volume, IP warm-up, feedback loop registration
- Any misconfiguration can silently send mail to spam
- Different providers have different requirements
- No standard way to debug delivery failures
- Deliverability consulting is a $2B+ industry

---

## Summary: What's Worth Preserving vs. What Must Die

### Worth Preserving
- **The addressing model** — `user@domain` is intuitive and universal
- **Threading** — conversations are natural (but the implementation must improve)
- **Rich content** — HTML, attachments, inline images (but not MIME's format)
- **Asynchronous delivery** — store-and-forward is the right model for mail
- **Decentralized architecture** — anyone can run a mail server (in theory)
- **Interoperability** — any client can talk to any server (via standard protocols)

### Must Die
- **SMTP's lack of authentication** — replaced by cryptographic signing
- **MIME's nested encoding** — replaced by JSON + external file references
- **DNS-dependent routing** — replaced by user-published relay preferences
- **The SPF/DKIM/DMARC/ARC stack** — replaced by native signatures
- **Opportunistic TLS** — replaced by mandatory E2EE
- **Domain-dependent identity** — replaced by keypair-based identity
- **IMAP's stateful complexity** — replaced by WebSocket pub/sub
- **The metadata exposure** — replaced by onion-encrypted envelopes
- **Free sending** — replaced by economic proof of commitment
