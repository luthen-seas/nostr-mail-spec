# Email Protocol Fundamentals — Deep Reference

> Comprehensive reference for the legacy email stack: SMTP, MIME, IMAP, threading, authentication, and deliverability. Written for an agent designing an SMTP-NOSTR bridge and ensuring NOSTR Mail achieves email feature parity.

---

## 1. SMTP Deep Mechanics

### 1.1 Connection Lifecycle

```
Client                          Server
  |                                |
  |  ---- TCP connect :25/587 --> |
  |  <--- 220 banner ------------ |
  |  ---- EHLO client.example --> |
  |  <--- 250 extensions -------- |
  |  ---- STARTTLS -------------> |  (if port 587 / submission)
  |  <--- 220 Ready ------------- |
  |  ---- [TLS handshake] ------> |
  |  ---- EHLO client.example --> |  (re-issue after STARTTLS)
  |  <--- 250 extensions -------- |
  |  ---- AUTH PLAIN ... -------> |  (submission only)
  |  <--- 235 Authenticated ----- |
  |  ---- MAIL FROM:<...> ------> |
  |  <--- 250 OK ---------------- |
  |  ---- RCPT TO:<...> --------> |
  |  <--- 250 OK ---------------- |
  |  ---- DATA -----------------> |
  |  <--- 354 Start input -------- |
  |  ---- [headers + body] -----> |
  |  ---- . (lone dot) ---------> |
  |  <--- 250 OK (queue ID) ----- |
  |  ---- QUIT -----------------> |
  |  <--- 221 Bye --------------- |
```

**Port conventions:**
- **25**: MTA-to-MTA relay (no authentication required for inbound)
- **465**: Implicit TLS submission (deprecated, then re-standardized in RFC 8314)
- **587**: STARTTLS submission (requires AUTH)

### 1.2 EHLO Negotiation and Extensions

After `EHLO`, the server advertises capabilities. Each line after the first `250-` is an extension:

```
S: 250-mail.example.com Hello client.example [203.0.113.1]
S: 250-SIZE 52428800
S: 250-8BITMIME
S: 250-STARTTLS
S: 250-AUTH PLAIN LOGIN CRAM-MD5 XOAUTH2
S: 250-ENHANCEDSTATUSCODES
S: 250-PIPELINING
S: 250-CHUNKING
S: 250-SMTPUTF8
S: 250-DSN
S: 250-VRFY
S: 250-BINARYMIME
S: 250 HELP
```

**Common EHLO extensions explained:**

| Extension | RFC | Purpose |
|-----------|-----|---------|
| `SIZE <max>` | 1870 | Maximum message size in bytes the server accepts |
| `8BITMIME` | 6152 | Server accepts 8-bit message bodies (not just 7-bit ASCII) |
| `STARTTLS` | 3207 | Server supports upgrading to TLS |
| `AUTH <mechanisms>` | 4954 | Authentication mechanisms available |
| `ENHANCEDSTATUSCODES` | 2034 | Server returns structured status codes (X.Y.Z format) |
| `PIPELINING` | 2920 | Client may batch commands without waiting for each reply |
| `CHUNKING` | 3030 | Server accepts BDAT command for binary-safe transfer |
| `BINARYMIME` | 3030 | Server accepts binary content (requires CHUNKING) |
| `SMTPUTF8` | 6531 | Server supports internationalized email addresses |
| `DSN` | 3461 | Delivery Status Notification support |
| `VRFY` | 5321 | Verify if a mailbox exists (often disabled) |
| `REQUIRETLS` | 8689 | Require TLS for downstream delivery |

### 1.3 Envelope vs. Headers

This distinction is critical and a common source of confusion. The **envelope** is the SMTP protocol-level addressing. The **headers** are inside the message body.

**Envelope** (SMTP commands):
```
MAIL FROM:<bounces@lists.example.com>
RCPT TO:<alice@example.com>
RCPT TO:<bob@example.com>
```

**Headers** (inside DATA):
```
From: Newsletter <news@example.com>
To: Subscribers <subscribers@lists.example.com>
Reply-To: editor@example.com
Sender: mailer@lists.example.com
```

**How they diverge:**

| Scenario | Envelope FROM | Header From | Why |
|----------|--------------|-------------|-----|
| Mailing list | `bounces+alice=example.com@lists.ml.org` | `originalauthor@example.com` | List needs bounces back; original author stays visible |
| BCC | `RCPT TO:<secret@example.com>` | BCC header stripped or absent | BCC recipients must not appear in delivered headers |
| Forwarding | `MAIL FROM:<forwarder@example.com>` | `From: original@example.com` | SRS rewrites envelope for SPF; header preserved |
| Bounce | `MAIL FROM:<>` (null sender) | `From: mailer-daemon@example.com` | Null sender prevents bounce loops |
| Transactional | `MAIL FROM:<bounce-id-12345@app.example.com>` | `From: noreply@example.com` | VERP encoding for bounce tracking |

**The null sender (`MAIL FROM:<>`):**
- Used exclusively for bounce messages (DSNs) and some auto-responses
- Prevents infinite bounce loops: a bounce of a bounce must never generate another bounce
- Servers MUST accept `MAIL FROM:<>` per RFC 5321
- SPF check for null sender uses the EHLO/HELO identity instead

### 1.4 SMTP AUTH Mechanisms

#### PLAIN (RFC 4616)
```
C: AUTH PLAIN AGFsaWNlAHNlY3JldA==
S: 235 2.7.0 Authentication successful
```
The base64 payload is: `\0username\0password` (NUL-separated). Simple but requires TLS — credentials are effectively cleartext.

#### LOGIN (non-standard, widely deployed)
```
C: AUTH LOGIN
S: 334 VXNlcm5hbWU6          (base64 "Username:")
C: YWxpY2U=                   (base64 "alice")
S: 334 UGFzc3dvcmQ6          (base64 "Password:")
C: c2VjcmV0                   (base64 "secret")
S: 235 2.7.0 Authentication successful
```
Two-step challenge-response but still cleartext base64. Requires TLS.

#### CRAM-MD5 (RFC 2195)
```
C: AUTH CRAM-MD5
S: 334 PDEyMzQuYWJjQGV4YW1wbGUuY29tPg==   (base64 challenge)
C: YWxpY2UgNmQ3ZjFiN2M...                   (base64 "alice HMAC-MD5-digest")
S: 235 2.7.0 Authentication successful
```
Password never sent over the wire; server sends a challenge, client responds with `username HMAC-MD5(password, challenge)`. Avoids plaintext passwords but MD5 is cryptographically weak. Requires server to store plaintext or MD5-equivalent passwords.

#### XOAUTH2 (Google/Microsoft proprietary)
```
C: AUTH XOAUTH2 dXNlcj1hbGljZUBnbWFpbC5jb20BYXV0aD1CZWFyZXIgeWE...AQ==
S: 235 2.7.0 Accepted
```
Base64 of: `user=alice@gmail.com\x01auth=Bearer ya29...\x01\x01`
Used by Gmail, Outlook. Requires OAuth 2.0 token obtained via separate flow. Google deprecated "less secure apps" (plain password) in 2022 — XOAUTH2 is now mandatory for Gmail SMTP.

### 1.5 SMTP Pipelining (RFC 2920)

Without pipelining, each command requires waiting for the server response before sending the next. With pipelining, commands can be batched:

```
C: MAIL FROM:<alice@example.com>
C: RCPT TO:<bob@example.com>
C: RCPT TO:<carol@example.com>
C: DATA
S: 250 2.1.0 Sender OK
S: 250 2.1.5 Recipient OK
S: 550 5.1.1 User unknown
S: 354 Start mail input
```

**Rules:**
- Only "safe" commands can be pipelined: `MAIL FROM`, `RCPT TO`, `DATA`, `RSET`, `NOOP`, `QUIT`
- `EHLO`, `STARTTLS`, `AUTH` MUST NOT be pipelined (they change connection state)
- Client must be prepared to handle per-recipient failures (some RCPT accepted, others rejected)
- Pipelining reduces round trips significantly for multi-recipient messages

### 1.6 MAIL FROM Parameters

```
MAIL FROM:<alice@example.com> SIZE=1048576 BODY=8BITMIME RET=HDRS ENVID=msg-12345
```

| Parameter | Extension | Purpose |
|-----------|-----------|---------|
| `SIZE=<bytes>` | SIZE (RFC 1870) | Declared message size; server can reject early if over limit |
| `BODY=7BIT\|8BITMIME` | 8BITMIME (RFC 6152) | Declares body encoding; 8BITMIME allows non-ASCII |
| `RET=FULL\|HDRS` | DSN (RFC 3461) | What to include in bounce: full message or headers only |
| `ENVID=<id>` | DSN (RFC 3461) | Envelope ID echoed back in DSN for correlation |
| `AUTH=<addr>` | AUTH (RFC 4954) | Authenticated sender identity for relaying |
| `SMTPUTF8` | SMTPUTF8 (RFC 6531) | Message contains internationalized addresses |
| `REQUIRETLS` | REQUIRETLS (RFC 8689) | Downstream MTAs must use TLS |

### 1.7 DSN — Delivery Status Notifications (RFC 3464)

DSNs are bounce messages generated by MTAs to inform the sender about delivery success, failure, or delay. They use multipart/report format:

```
Content-Type: multipart/report; report-type=delivery-status;
    boundary="boundary42"

--boundary42
Content-Type: text/plain

Your message could not be delivered.

--boundary42
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.com
Original-Envelope-Id: msg-12345
Arrival-Date: Tue, 01 Apr 2025 12:00:00 +0000

Final-Recipient: rfc822; bob@example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown
Last-Attempt-Date: Tue, 01 Apr 2025 12:00:05 +0000

--boundary42
Content-Type: message/rfc822

[original message headers or full message, per RET parameter]

--boundary42--
```

**DSN Status Codes (Enhanced Status Codes, RFC 3463):**

Format: `class.subject.detail`

| Code | Meaning |
|------|---------|
| **2.x.x** | **Success** |
| 2.0.0 | Generic success |
| 2.1.5 | Destination address valid |
| 2.6.0 | Message content OK |
| **4.x.x** | **Transient failure (retry later)** |
| 4.0.0 | Generic transient failure |
| 4.2.2 | Mailbox full |
| 4.3.1 | Mail system full |
| 4.4.1 | No answer from host |
| 4.4.2 | Bad connection |
| 4.7.0 | Temporary authentication failure |
| **5.x.x** | **Permanent failure (do not retry)** |
| 5.0.0 | Generic permanent failure |
| 5.1.0 | Bad destination mailbox address |
| 5.1.1 | Bad destination mailbox address (user unknown) |
| 5.1.2 | Bad destination system address (domain not found) |
| 5.1.3 | Bad destination mailbox address syntax |
| 5.2.0 | Generic mailbox error |
| 5.2.1 | Mailbox disabled |
| 5.2.2 | Mailbox full (permanent) |
| 5.2.3 | Message length exceeds limit |
| 5.3.0 | Generic mail system issue |
| 5.3.4 | Message too big for system |
| 5.4.0 | Generic routing failure |
| 5.4.4 | Unable to route |
| 5.5.0 | Generic protocol error |
| 5.7.0 | Generic security/policy rejection |
| 5.7.1 | Delivery not authorized (sender blocked) |
| 5.7.23 | SPF validation failed |
| 5.7.25 | Reverse DNS validation failed |
| 5.7.26 | DMARC validation failed |

### 1.8 SMTP Reply Codes — Complete Taxonomy

**2xx — Success:**
| Code | Meaning |
|------|---------|
| 211 | System status or help reply |
| 214 | Help message |
| 220 | Service ready (banner) |
| 221 | Service closing channel |
| 235 | Authentication successful |
| 250 | Requested action OK |
| 251 | User not local; will forward |
| 252 | Cannot VRFY user but will try delivery |
| 334 | AUTH continuation (server challenge) |
| 354 | Start mail input (end with `<CRLF>.<CRLF>`) |

**4xx — Transient Failure (client should retry):**
| Code | Meaning |
|------|---------|
| 421 | Service not available, closing channel |
| 450 | Mailbox unavailable (busy/locked) |
| 451 | Action aborted: local error in processing |
| 452 | Insufficient storage |
| 455 | Server unable to accommodate parameters |

**5xx — Permanent Failure (do not retry):**
| Code | Meaning |
|------|---------|
| 500 | Syntax error / command unrecognized |
| 501 | Syntax error in parameters |
| 502 | Command not implemented |
| 503 | Bad sequence of commands |
| 504 | Command parameter not implemented |
| 521 | Host does not accept mail (RFC 7504) |
| 530 | Authentication required |
| 535 | Authentication failed |
| 550 | Mailbox unavailable (not found / policy) |
| 551 | User not local; try forwarding |
| 552 | Exceeded storage allocation |
| 553 | Mailbox name not allowed |
| 554 | Transaction failed / no SMTP service here |
| 556 | Domain does not accept mail |

---

## 2. Email Authentication Stack

### 2.1 SPF — Sender Policy Framework (RFC 7208)

SPF validates that the sending IP is authorized by the domain in the envelope `MAIL FROM`.

**DNS record:**
```
v=spf1 ip4:203.0.113.0/24 include:_spf.google.com include:sendgrid.net ~all
```

**Mechanisms:**
| Mechanism | Meaning |
|-----------|---------|
| `ip4:x.x.x.x/cidr` | Match if sender IP is in range |
| `ip6:...` | IPv6 match |
| `a` | Match if sender IP matches domain's A record |
| `mx` | Match if sender IP matches domain's MX hosts |
| `include:domain` | Recursively check another domain's SPF |
| `redirect=domain` | Use another domain's SPF entirely |
| `exists:domain` | Pass if a DNS A record exists (macro-based) |

**Qualifiers:**
| Qualifier | Meaning | DMARC effect |
|-----------|---------|--------------|
| `+` (default) | Pass | Aligned pass |
| `-` | Fail (hard) | Fail |
| `~` | SoftFail | Fail (DMARC treats as fail) |
| `?` | Neutral | None |

**SPF limitations:**
- Breaks on forwarding (forwarder's IP is not in sender's SPF)
- 10-DNS-lookup limit (include chains count; exceeding = permerror)
- Only checks envelope FROM, not header From
- SRS (Sender Rewriting Scheme) works around forwarding breakage

### 2.2 DKIM — DomainKeys Identified Mail (RFC 6376)

DKIM adds a cryptographic signature over specified headers and the body.

**DKIM-Signature header:**
```
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector2024;
    c=relaxed/relaxed; q=dns/txt;
    h=from:to:subject:date:message-id:content-type:mime-version;
    bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;
    b=AuUoFEfDxTDkHlLXSZEpZj79LICEps6eda7W3deTVFOk4yAUoqOB
     4nujc7YopdG5dWLSdNg6xNAZpOPr+kHxt1IrE+NahM6L/LbvaHut
     KVdkLLkpVaVVQPzeRDI009SO2Il5Lu7rDNH6mZckBdrIx0orEtZV
     4bmp/YzhwvcubU4=
```

**Key fields:**
| Tag | Meaning |
|-----|---------|
| `v=1` | Version |
| `a=rsa-sha256` | Signing algorithm (also `ed25519-sha256` per RFC 8463) |
| `d=example.com` | Signing domain (checked for DMARC alignment) |
| `s=selector2024` | DNS selector for public key lookup: `selector2024._domainkey.example.com` |
| `c=relaxed/relaxed` | Canonicalization (header/body): simple or relaxed |
| `h=from:to:...` | Headers included in signature |
| `bh=...` | Body hash (base64 SHA-256 of canonicalized body) |
| `b=...` | Signature (base64 RSA/Ed25519 over headers + bh) |
| `l=...` | Body length limit (dangerous — allows appending) |
| `t=...` | Signature timestamp |
| `x=...` | Signature expiration |

**Canonicalization modes:**
- **simple/simple**: Exact match; any modification breaks signature
- **relaxed/relaxed**: Normalizes whitespace and header case; survives most MTAs
- Best practice: `c=relaxed/relaxed`

**Key sizes:**
- RSA 1024-bit: Minimum, fits in single DNS TXT record, being phased out
- RSA 2048-bit: Current recommended minimum
- Ed25519: Smaller keys, faster, but limited MTA support

### 2.3 DMARC — Domain-based Message Authentication, Reporting, and Conformance (RFC 7489)

DMARC ties SPF and DKIM together, using the header `From` domain as the identifier.

**DNS record at `_dmarc.example.com`:**
```
v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@example.com;
    ruf=mailto:dmarc-forensic@example.com; adkim=s; aspf=r; pct=100; fo=1
```

| Tag | Meaning |
|-----|---------|
| `p=none\|quarantine\|reject` | Policy for exact domain |
| `sp=...` | Policy for subdomains |
| `rua=mailto:...` | Aggregate report destination (daily XML) |
| `ruf=mailto:...` | Forensic/failure report destination |
| `adkim=r\|s` | DKIM alignment mode: relaxed (subdomain OK) or strict |
| `aspf=r\|s` | SPF alignment mode |
| `pct=100` | Percentage of messages to apply policy to |
| `fo=0\|1\|d\|s` | Failure reporting options |

**Alignment logic:**
- SPF passes DMARC if: SPF passes AND `MAIL FROM` domain aligns with header `From` domain
- DKIM passes DMARC if: DKIM passes AND `d=` domain aligns with header `From` domain
- Either one passing is sufficient for DMARC pass

### 2.4 ARC — Authenticated Received Chain (RFC 8617)

ARC preserves authentication results across intermediaries (mailing lists, forwarders) that break SPF/DKIM. Each hop adds three headers:

```
ARC-Authentication-Results: i=1; mx.google.com;
    dkim=pass header.d=example.com;
    spf=pass smtp.mailfrom=example.com;
    dmarc=pass header.from=example.com
ARC-Message-Signature: i=1; a=rsa-sha256; d=google.com; s=arc-20160816;
    h=from:to:subject:date; bh=...; b=...
ARC-Seal: i=1; a=rsa-sha256; d=google.com; s=arc-20160816;
    cv=none; b=...
```

`i=` increments with each hop. `cv=` (chain validation) is `none` for first hop, `pass` for subsequent.

---

## 3. MIME Deep Mechanics

### 3.1 MIME Structure Overview (RFC 2045-2049)

MIME extends the original RFC 5322 message format to support:
- Non-ASCII text (character sets beyond US-ASCII)
- Non-text attachments (images, documents, archives)
- Multi-part message bodies
- Non-ASCII header fields

### 3.2 Content-Type Registry

**text/*:**
| Type | Usage |
|------|-------|
| `text/plain` | Plain text, the default if no Content-Type |
| `text/html` | HTML formatted body |
| `text/calendar` | iCalendar data (meeting invitations) |
| `text/csv` | Comma-separated values |
| `text/markdown` | Markdown text |
| `text/xml` | XML data |
| `text/enriched` | Enriched text (legacy, RFC 1896) |

**multipart/*:**
| Type | Usage |
|------|-------|
| `multipart/mixed` | Multiple independent parts (body + attachments) |
| `multipart/alternative` | Same content in different formats (text + HTML) |
| `multipart/related` | Parts that reference each other (HTML + inline images) |
| `multipart/signed` | Signed message (body + detached signature) |
| `multipart/encrypted` | Encrypted message (control info + encrypted body) |
| `multipart/report` | Delivery/disposition notifications (DSN/MDN) |
| `multipart/digest` | Collection of messages (each part defaults to message/rfc822) |
| `multipart/parallel` | Parts to be displayed simultaneously |
| `multipart/form-data` | HTML form submissions (rarely in email) |

**application/*:**
| Type | Usage |
|------|-------|
| `application/octet-stream` | Generic binary (default for unknown types) |
| `application/pdf` | PDF documents |
| `application/zip` | ZIP archives |
| `application/json` | JSON data |
| `application/xml` | XML data |
| `application/pgp-encrypted` | PGP encryption control (always "Version: 1") |
| `application/pgp-signature` | PGP detached signature |
| `application/pkcs7-mime` | S/MIME encrypted or signed data |
| `application/pkcs7-signature` | S/MIME detached signature |
| `application/ics` | iCalendar (alternative to text/calendar) |
| `application/ms-tnef` | Microsoft TNEF (winmail.dat) |

**message/*:**
| Type | Usage |
|------|-------|
| `message/rfc822` | Encapsulated email message (forwarded message) |
| `message/delivery-status` | DSN machine-readable part |
| `message/disposition-notification` | MDN machine-readable part |
| `message/external-body` | Reference to external content |

**image/*, audio/*, video/*:**
Common subtypes: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `audio/mpeg`, `video/mp4`. Used as inline content (via Content-ID) or attachments.

### 3.3 Multipart Boundary Syntax

```
Content-Type: multipart/mixed;
    boundary="----=_Part_12345_1234567890.1234567890"
```

**Boundary rules (RFC 2046):**
- Maximum 70 characters
- Composed of: alphanumerics, `'`, `(`, `)`, `+`, `_`, `,`, `-`, `.`, `/`, `:`, `=`, `?`, space (space only allowed if quoted)
- Must not occur in any of the body parts
- Delimiter line: `--boundary` (two hyphens + boundary string)
- Closing delimiter: `--boundary--`
- CRLF before delimiter is part of the delimiter, not the body
- Anything before the first boundary is the "preamble" (typically ignored)
- Anything after the closing delimiter is the "epilogue" (typically ignored)

**Example multipart/alternative:**
```
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="alt-boundary"

--alt-boundary
Content-Type: text/plain; charset=utf-8

Hello, world!

--alt-boundary
Content-Type: text/html; charset=utf-8

<html><body><h1>Hello, world!</h1></body></html>

--alt-boundary--
```

### 3.4 Content-Transfer-Encoding

| Encoding | Use When | How It Works |
|----------|----------|-------------|
| `7bit` | ASCII-only text | No transformation; default for text/plain |
| `8bit` | UTF-8 text, 8BITMIME server | No transformation; requires 8BITMIME extension |
| `quoted-printable` | Mostly ASCII with some non-ASCII | `=XX` hex encoding for non-ASCII bytes; lines limited to 76 chars; `=` at end of line = soft line break |
| `base64` | Binary data (images, attachments) | Base64 encoding; 76-char lines; ~33% size increase |
| `binary` | Raw binary via BDAT/CHUNKING | No transformation; requires BINARYMIME + CHUNKING |

**When to choose:**
- **text/plain, text/html (UTF-8)**: Use `quoted-printable` if mostly ASCII, `base64` if heavily non-ASCII
- **Attachments**: Always `base64`
- **Already 7-bit ASCII**: `7bit` (no encoding needed)
- **Modern servers**: `8bit` for text if 8BITMIME is supported

### 3.5 Character Encoding in Headers — RFC 2047

Headers are technically 7-bit ASCII only. Non-ASCII in headers uses encoded-word syntax:

```
=?charset?encoding?encoded-text?=
```

- **charset**: Character set (e.g., `UTF-8`, `ISO-8859-1`)
- **encoding**: `B` (base64) or `Q` (quoted-printable variant)
- **encoded-text**: The encoded bytes

**Examples:**
```
Subject: =?UTF-8?B?0J/RgNC40LLQtdGC?=
   (base64-encoded Russian word "Привет")

Subject: =?UTF-8?Q?Re=3A_Caf=C3=A9_menu?=
   (quoted-printable: "Re: Cafe menu" with accented e)

From: =?UTF-8?B?5bGx55Sw?= <yamada@example.jp>
   (Japanese name in base64)
```

**Rules:**
- Encoded-words may only appear in: Subject, Comments, any structured header's comment field, display name in From/To/Cc
- Each encoded-word is max 75 characters
- Adjacent encoded-words separated only by whitespace are concatenated before decoding
- Encoded-words MUST NOT appear in the middle of a token (e.g., not inside an email address)

### 3.6 RFC 2231 — MIME Parameter Encoding

For long or non-ASCII MIME parameters (e.g., filenames):

```
Content-Disposition: attachment;
    filename*=UTF-8''%E5%B1%B1%E7%94%B0.pdf

Content-Type: application/pdf;
    filename*0="very-long-filename-that-exceeds-the-line";
    filename*1="-length-limit.pdf"
```

**Syntax:**
- `parameter*=charset'language'encoded-value` — charset/language/percent-encoding
- `parameter*0=`, `parameter*1=`, ... — continuation for long values
- `parameter*0*=charset'language'encoded-value` — combined continuation + encoding

### 3.7 Structured vs. Unstructured Headers

**Structured headers** have defined syntax that parsers must understand:
- `From`, `To`, `Cc`, `Bcc`: Address lists (`display-name <addr-spec>`)
- `Date`: RFC 5322 date-time (`Thu, 01 Apr 2025 12:00:00 +0000`)
- `Message-ID`: Unique identifier (`<unique@domain>`)
- `In-Reply-To`, `References`: Message-ID lists
- `Content-Type`: MIME type with parameters
- `Content-Disposition`: `inline` or `attachment` with parameters
- `Received`: Trace information (each MTA adds one)
- `MIME-Version`: Always `1.0`
- `Return-Path`: Set by final delivery MTA from envelope FROM

**Unstructured headers** are freeform text:
- `Subject`: Freeform (but `Re:` prefix convention for replies)
- `Comments`: Freeform
- `X-*`: Custom extension headers

### 3.8 Common Malformed MIME and Handling Strategies

**Missing boundary in multipart Content-Type:**
```
Content-Type: multipart/mixed
   (no boundary parameter)
```
Strategy: Attempt to detect boundary by scanning for `--` prefixed lines. If unrecoverable, treat entire body as `text/plain`.

**Wrong Content-Transfer-Encoding:**
```
Content-Transfer-Encoding: base64
   (but body is actually quoted-printable or raw UTF-8)
```
Strategy: Attempt declared encoding first. If decode fails (invalid base64 characters), fall back to raw/quoted-printable. Log warning.

**Nested multipart with same boundary string:**
```
Content-Type: multipart/mixed; boundary="SAME"
--SAME
Content-Type: multipart/alternative; boundary="SAME"
```
Strategy: This is technically invalid. Use a stack-based parser that tracks nesting depth. When encountering `--SAME--`, pop one level. Most robust parsers treat this as an error and stop parsing inner parts.

**Mixed line endings (CR, LF, CRLF):**
Email standard requires CRLF (`\r\n`). In practice:
- Some systems generate bare LF (`\n`) — common on Unix-origin messages
- Rare: bare CR (`\r`) — legacy Mac systems
Strategy: Normalize all line endings to CRLF before parsing. Be tolerant on input.

**Header injection via newlines:**
```
Subject: Normal subject\r\nBcc: attacker@evil.com
```
Strategy: Strip or reject any bare CR or LF within a single header value that is not a proper continuation (folding). Continuation lines must start with whitespace.

**Overly deep nesting (>10 levels):**
```
multipart/mixed
  multipart/mixed
    multipart/mixed
      ... (20 levels deep)
```
Strategy: Enforce a maximum nesting depth (10 is reasonable). Beyond that, treat nested content as opaque `application/octet-stream`.

**Conflicting charset declarations:**
```
Content-Type: text/html; charset=iso-8859-1
   (but HTML <meta> says charset=utf-8)
```
Strategy: MIME Content-Type header takes precedence over HTML `<meta>` per RFC 2045. However, if decoding with the declared charset produces errors, try the HTML-declared charset as fallback.

---

## 4. IMAP Mechanics

### 4.1 Session States

```
                 +----------------------+
                 |  Not Authenticated   |
                 +----------------------+
                        |
                   LOGIN / AUTHENTICATE
                        |
                        v
                 +----------------------+
                 |    Authenticated     |
                 +----------------------+
                        |
                      SELECT / EXAMINE
                        |
                        v
                 +----------------------+
                 |      Selected        |
                 +----------------------+
                        |
                    CLOSE / LOGOUT
                        |
                        v
                 +----------------------+
                 |       Logout         |
                 +----------------------+
```

**Not Authenticated:** Only `CAPABILITY`, `NOOP`, `LOGOUT`, `STARTTLS`, `LOGIN`, `AUTHENTICATE` allowed.

**Authenticated:** Can `LIST`, `CREATE`, `DELETE`, `RENAME`, `SUBSCRIBE`, `UNSUBSCRIBE`, `LSUB`, `STATUS`, `APPEND`, `SELECT`, `EXAMINE`.

**Selected:** Full access to selected mailbox: `FETCH`, `STORE`, `SEARCH`, `COPY`, `MOVE`, `EXPUNGE`, `CHECK`, `CLOSE`, `UID` variants of all.

### 4.2 Critical Commands

**SELECT / EXAMINE:**
```
C: a1 SELECT INBOX
S: * 172 EXISTS
S: * 1 RECENT
S: * OK [UNSEEN 12]
S: * OK [UIDVALIDITY 3857529045]
S: * OK [UIDNEXT 4392]
S: * FLAGS (\Answered \Flagged \Deleted \Seen \Draft)
S: * OK [PERMANENTFLAGS (\Answered \Flagged \Deleted \Seen \Draft \*)]
S: a1 OK [READ-WRITE] SELECT completed
```
`EXAMINE` is identical but opens read-only.

**FETCH:**
```
C: a2 FETCH 1:* (FLAGS ENVELOPE)
C: a3 UID FETCH 4350:4392 (BODY[HEADER] BODY[TEXT] FLAGS)
C: a4 UID FETCH 4350 (BODY[1.2])    -- fetch specific MIME part
C: a5 UID FETCH 4350 BODYSTRUCTURE   -- get MIME structure without content
```

**STORE (flag manipulation):**
```
C: a6 UID STORE 4350 +FLAGS (\Seen)        -- mark read
C: a7 UID STORE 4350 -FLAGS (\Flagged)     -- unflag
C: a8 UID STORE 4350:4360 +FLAGS (\Deleted) -- mark for deletion
```

**SEARCH:**
```
C: a9 UID SEARCH SINCE 01-Mar-2025 FROM "alice" UNSEEN
C: a10 UID SEARCH OR (FROM "alice") (FROM "bob") NOT DELETED
C: a11 UID SEARCH HEADER "X-Custom" "value"
```

**COPY / MOVE:**
```
C: a12 UID COPY 4350:4360 "Archive"
C: a13 UID MOVE 4350 "Trash"           -- requires MOVE extension
```

**EXPUNGE:**
```
C: a14 EXPUNGE                    -- removes all \Deleted messages
C: a15 UID EXPUNGE 4350:4360     -- remove specific UIDs (requires UIDPLUS)
```

### 4.3 UIDs vs. Sequence Numbers

| Property | Sequence Number | UID |
|----------|----------------|-----|
| Stability | Changes on EXPUNGE | Stable within UIDVALIDITY |
| Range | 1..N (N = EXISTS) | Assigned monotonically, never reused |
| Reset | Continuous, no gaps after EXPUNGE | Gaps allowed; never decreases |
| Use for sync | Unreliable | Essential for offline sync |

**UIDVALIDITY:** If this value changes between sessions, all cached UIDs are invalid and the client must re-sync the entire mailbox. This happens on mailbox recreation or corruption recovery.

### 4.4 IMAP IDLE (RFC 2177)

IDLE provides server push for new messages in the currently selected mailbox.

```
C: a16 IDLE
S: + idling
   ... (server sends untagged responses when state changes)
S: * 173 EXISTS          -- new message arrived
S: * 2 EXPUNGE           -- message 2 removed
C: DONE
S: a16 OK IDLE terminated
```

**Limitations and behavior:**
- Only monitors the currently `SELECT`ed mailbox — one mailbox per connection
- To monitor multiple mailboxes, open multiple IMAP connections
- Servers may terminate IDLE after 30 minutes (RFC recommends clients re-issue every 29 minutes)
- Client sends `DONE` (not tagged) to exit IDLE state
- During IDLE, the client must not send any other commands
- Network proxies/firewalls may kill idle TCP connections; clients should use TCP keepalives
- Not all events trigger EXISTS — flag changes during IDLE may or may not generate `FETCH` responses depending on server

### 4.5 CONDSTORE / QRESYNC (RFC 7162)

These extensions enable efficient incremental sync by tracking modification sequences.

**CONDSTORE** adds a `MODSEQ` attribute to every message:
```
C: a17 SELECT INBOX (CONDSTORE)
S: * OK [HIGHESTMODSEQ 715194045]
...
C: a18 UID FETCH 1:* (FLAGS) (CHANGEDSINCE 715194000)
S: * 5 FETCH (UID 4350 FLAGS (\Seen) MODSEQ (715194042))
S: * 8 FETCH (UID 4365 FLAGS (\Seen \Flagged) MODSEQ (715194045))
```

Only messages modified since the given MODSEQ are returned — critical for efficient sync.

**QRESYNC** (Quick Resynchronization) extends CONDSTORE to also report expunged UIDs:
```
C: a19 SELECT INBOX (QRESYNC (3857529045 715194000 1:4392))
S: * VANISHED (EARLIER) 4351,4355:4358
S: * 5 FETCH (UID 4350 FLAGS (\Seen) MODSEQ (715194042))
```

The `VANISHED` response tells the client which UIDs were expunged since last sync, without needing to compare full UID lists.

### 4.6 Important IMAP Extensions

| Extension | RFC | Purpose |
|-----------|-----|---------|
| `SORT` | 5256 | Server-side sorting by date, from, subject, size |
| `THREAD` | 5256 | Server-side threading (ORDEREDSUBJECT, REFERENCES algorithms) |
| `LITERAL+` | 7888 | Non-synchronizing literals (faster uploads) |
| `SPECIAL-USE` | 6154 | Standard mailbox roles: `\Drafts`, `\Sent`, `\Trash`, `\Jstrash`, `\Archive`, `\All`, `\Flagged` |
| `MOVE` | 6851 | Atomic move operation (vs. COPY + STORE \Deleted + EXPUNGE) |
| `NAMESPACE` | 2342 | Mailbox hierarchy prefixes |
| `ID` | 2971 | Client/server identification for debugging |
| `COMPRESS` | 4978 | DEFLATE compression on the connection |
| `NOTIFY` | 5465 | Monitor multiple mailboxes for changes (alternative to multiple IDLE connections) |
| `OBJECTID` | 8474 | Stable identifiers for mailboxes and messages (survives UIDVALIDITY changes) |

---

## 5. Threading Algorithms

### 5.1 JWZ Threading Algorithm

Designed by Jamie Zawinski for Netscape Mail. The definitive algorithm for reconstructing email thread trees from Message-ID, In-Reply-To, and References headers.

**Input:** A flat list of messages, each with:
- `Message-ID`: Unique identifier (e.g., `<abc123@example.com>`)
- `In-Reply-To`: Message-ID of the direct parent (e.g., `<parent@example.com>`)
- `References`: Ordered list of ancestor Message-IDs (root first, parent last)

**Step 1: Build ID Table**
Create a hash table mapping Message-ID to a "container" object. Each container holds an optional message and optional children.

```
For each message:
  1. Find or create container for this Message-ID
  2. Attach the message to the container
  3. Walk the References header left to right:
     - For each reference, find or create its container
     - Link each reference as parent of the next one
       (unless it would create a loop)
  4. Set the last reference (or In-Reply-To) as parent of this message's container
     (unless it would create a loop)
```

**Step 2: Find Root Set**
Collect all containers with no parent. These are the thread roots.

**Step 3: Prune Empty Containers**
Walk each root's subtree:
- If a container has no message and no children: delete it
- If a container has no message and one child: promote the child to replace the container
- If a container has no message and multiple children: keep it as a synthetic root (placeholder for a missing message)

**Step 4: Group Root Set by Subject**
Optional step to merge threads with the same base subject:
- Strip `Re:`, `Fwd:`, `[list-tag]` prefixes to get base subject
- If two roots have the same base subject, merge them:
  - If one is a reply (has Re:) and the other is not, make the reply a child of the non-reply
  - If both are replies or both are originals, create a synthetic parent

**Step 5: Sort**
Sort siblings by date (ascending). Sort root set by date of oldest message in each thread.

**Why this matters for NOSTR bridge:**
Email threads are reconstructed from headers post-hoc. NOSTR events use explicit `e` tags with reply markers (`root`, `reply`), giving a cleaner threading model. The bridge must map between these two approaches.

### 5.2 Gmail's Threading Approach

Gmail uses a hybrid approach:
- Primary: Message-ID / In-Reply-To / References (standard JWZ-like)
- Secondary: Subject-based grouping — messages with the same subject (after stripping Re:/Fwd:) sent within a time window are grouped
- Gmail may group messages that share no Message-ID linkage, purely on subject match
- Users sometimes experience "wrong" threading due to subject-based grouping (e.g., "Meeting notes" from different contexts)

### 5.3 Threading Challenges

**Missing Message-ID:** Some MUAs omit Message-ID entirely. Without it, threading is impossible except via subject matching.

**Broken References chains:** Mailing list software or forwarding may truncate or rewrite the References header. The JWZ algorithm handles this gracefully because it links pairwise from left to right.

**Mailing list header rewriting:** Lists may:
- Modify Subject (add `[list-name]` prefix)
- Rewrite From (for DMARC compliance)
- Rewrite Message-ID (rare but devastating for threading)
- Add `Reply-To: list-address` (hides original author's address)

**In-Reply-To pointing to unknown message:** Common when only part of a conversation is available. JWZ creates a placeholder container for the unknown parent.

---

## 6. Deliverability

### 6.1 IP Reputation Systems

| System | Operator | Data Source | Query Method |
|--------|----------|-------------|-------------|
| Spamhaus ZEN | Spamhaus | Spam traps, reports | DNSBL (`zen.spamhaus.org`) |
| Spamhaus DBL | Spamhaus | Domain reputation | DNSBL (`dbl.spamhaus.org`) |
| SORBS | Proofpoint | Spam traps, open relays | DNSBL (`dnsbl.sorbs.net`) |
| Barracuda | Barracuda Networks | Customer data | DNSBL (`b.barracudacentral.org`) |
| SpamCop | Cisco | User reports | DNSBL (`bl.spamcop.net`) |
| UCEPROTECT | UCEPROTECT | Automated | DNSBL (Level 1/2/3) |

**DNSBL query mechanism:**
To check if IP `203.0.113.42` is listed on `zen.spamhaus.org`:
1. Reverse the IP: `42.113.0.203`
2. Query: `42.113.0.203.zen.spamhaus.org`
3. If A record exists (e.g., `127.0.0.2`), IP is listed; specific return code indicates list category

### 6.2 Sender Score and Domain Reputation

**Sender Score** (Validity/Return Path): 0-100 score based on complaint rates, unknown users, infrastructure, and volume. Scores below 70 face significant deliverability issues.

**Domain reputation** (distinct from IP reputation): Gmail, Microsoft, and Yahoo maintain domain-level reputation independent of sending IP. This is why shared IP senders still face issues — poor domain reputation follows you across IPs.

### 6.3 IP Warm-Up

New IPs have no reputation and are treated with suspicion. Warm-up schedule:

| Week | Daily Volume | Notes |
|------|-------------|-------|
| 1 | 50-100 | Send only to most engaged recipients |
| 2 | 200-500 | Maintain high engagement rate |
| 3 | 500-1,000 | Monitor bounce rate closely |
| 4 | 1,000-5,000 | Watch for any throttling |
| 5 | 5,000-10,000 | Should be establishing positive reputation |
| 6+ | Double weekly | Continue until target volume reached |

**Key rules:**
- Send to engaged recipients first (those who open/click)
- Do NOT send to old/stale lists during warm-up
- Monitor 421 responses (throttling) — back off if seen
- Different ISPs warm at different rates; segment by destination domain
- Authentication (SPF+DKIM+DMARC) must be perfect from day one

### 6.4 Feedback Loops (FBL)

ISPs report spam complaints back to senders via ARF (Abuse Reporting Format, RFC 5965):

```
Content-Type: multipart/report; report-type=feedback-report

--boundary
Content-Type: text/plain
This is a spam complaint.

--boundary
Content-Type: message/feedback-report
Feedback-Type: abuse
User-Agent: ISP-FBL/1.0
Version: 1
Original-Mail-From: sender@example.com
Arrival-Date: Tue, 01 Apr 2025 12:00:00 +0000
Source-IP: 203.0.113.42

--boundary
Content-Type: message/rfc822
[original message]

--boundary--
```

**Major FBL programs:**
- **Microsoft JMRP**: Covers Outlook.com, Hotmail, Live.com
- **Yahoo CFL**: Complaint Feedback Loop
- **AOL**: Legacy but still active
- **Gmail**: Does NOT operate a traditional FBL; instead provides Postmaster Tools dashboard

### 6.5 List-Unsubscribe (RFC 8058)

Required by Gmail and Yahoo since February 2024 for bulk senders (>5,000 messages/day to Gmail).

```
List-Unsubscribe: <https://example.com/unsub?id=12345>,
    <mailto:unsub-12345@example.com>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

**RFC 8058 one-click unsubscribe:**
- Client (Gmail/Yahoo) sends `POST` to the HTTPS URL with body `List-Unsubscribe=One-Click`
- No user interaction required beyond clicking in the email client
- If only `mailto:` URL is provided, the email client sends an email to that address
- `List-Unsubscribe-Post` header is required for HTTPS one-click

### 6.6 Gmail 2024-2025 Requirements (for senders of >5,000/day to Gmail)

1. **SPF or DKIM** authentication (both recommended)
2. **DMARC** policy published (at least `p=none`)
3. **One-click unsubscribe** via List-Unsubscribe + List-Unsubscribe-Post
4. **Spam complaint rate** below 0.3% (monitored via Postmaster Tools)
5. **Valid PTR record** for sending IP
6. **TLS** for transmission
7. **RFC 5322 compliant** formatting
8. **No impersonation** of Gmail From: headers

Yahoo adopted near-identical requirements simultaneously.

### 6.7 Common Rejection Reasons and Codes

| SMTP Code | Enhanced Code | Typical Cause |
|-----------|--------------|---------------|
| 421 4.7.0 | — | IP temporarily rate-limited |
| 450 4.2.1 | — | Mailbox temporarily unavailable |
| 451 4.7.1 | — | Greylisting (retry in 5-15 minutes) |
| 550 5.1.1 | 5.1.1 | User does not exist |
| 550 5.2.1 | 5.2.1 | Mailbox disabled/suspended |
| 550 5.7.1 | 5.7.1 | Message rejected by policy (content filter, RBL) |
| 550 5.7.23 | 5.7.23 | SPF validation failed |
| 550 5.7.25 | 5.7.25 | PTR record validation failed |
| 550 5.7.26 | 5.7.26 | DMARC validation failed |
| 552 5.2.2 | 5.2.2 | Mailbox full (over quota) |
| 552 5.2.3 | 5.2.3 | Message too large |
| 553 5.1.3 | 5.1.3 | Malformed address syntax |
| 554 5.7.1 | 5.7.1 | Rejected by content filter (spam) |

---

## 7. Additional Protocols

### 7.1 JMAP — JSON Meta Application Protocol (RFC 8620/8621)

JMAP is the modern replacement for IMAP, designed for mobile and web clients:

- **HTTP-based**: No persistent TCP connection required (unlike IMAP)
- **JSON over HTTP POST**: Structured requests and responses
- **Stateless sync**: Uses `queryChanges` method with `sinceQueryState` token
- **Push notifications**: Via EventSource (Server-Sent Events) or Web Push (RFC 8030)
- **Batched operations**: Multiple method calls in a single HTTP request
- **Binary uploads/downloads**: Separate endpoints for blob management

**Key advantages over IMAP:**
- No need to manage multiple connections (IDLE per mailbox)
- Better for mobile (less chatty, works over REST)
- Native support for multiple mailbox monitoring
- Standardized push mechanism

### 7.2 MTA-STS — SMTP MTA Strict Transport Security (RFC 8461)

Prevents TLS downgrade attacks on SMTP:

```
DNS: _mta-sts.example.com TXT "v=STSv1; id=20250401"
HTTPS: https://mta-sts.example.com/.well-known/mta-sts.txt

version: STSv1
mode: enforce
mx: mx1.example.com
mx: mx2.example.com
max_age: 604800
```

- Sending MTA fetches the policy over HTTPS
- If `mode: enforce`, sending MTA must use TLS and validate the MX certificate
- Prevents an attacker from stripping STARTTLS via DNS/network manipulation

### 7.3 DANE — DNS-based Authentication of Named Entities (RFC 7672)

Uses DNSSEC-signed TLSA records to pin certificates for SMTP:

```
_25._tcp.mx.example.com. IN TLSA 3 1 1 abc123...
```

- Requires DNSSEC on the domain
- Less widely deployed than MTA-STS but cryptographically stronger
- No dependency on the CA system — domain operator specifies exact certificate/key

### 7.4 SMTP TLS Reporting (RFC 8460)

Receiving reports about TLS failures:
```
DNS: _smtp._tls.example.com TXT "v=TLSRPTv1; rua=mailto:tls-reports@example.com"
```

Sending MTAs report TLS negotiation failures as JSON, helping domain operators detect MitM attacks or misconfigurations.
