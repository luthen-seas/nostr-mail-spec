# Bridge Design Patterns — SMTP to NOSTR and Back

> Reference material for designing a bidirectional SMTP-NOSTR bridge. Covers conversion logic in both directions and the deliverability strategy needed to make bridged messages survive the modern email ecosystem.

---

## 1. SMTP to NOSTR Conversion Patterns

### 1.1 MIME to JSON Conversion Rules

The bridge must decompose a MIME message into NOSTR Mail event structure (Kind 15 rumor inside Gift Wrap). Each MIME Content-Type maps to a specific representation:

| MIME Content-Type | NOSTR Representation |
|-------------------|---------------------|
| `text/plain` | Event `content` field (primary body) |
| `text/html` | `["html", "<full html>"]` tag, or converted to Markdown for `content` |
| `text/markdown` | Event `content` field directly |
| `text/calendar` | `["attachment", "<blossom-hash>", "text/calendar", "<filename>.ics"]` tag |
| `multipart/mixed` | Flatten: first text part becomes `content`, others become attachment tags |
| `multipart/alternative` | Pick best representation (see section 1.4) |
| `multipart/related` | Extract inline images via Content-ID, convert to Blossom (see section 1.3) |
| `multipart/signed` | Verify signature, store result in tag, pass through body |
| `multipart/encrypted` | See section 1.10 |
| `multipart/report` | Parse DSN/MDN; generate appropriate NOSTR event |
| `application/*` | Upload to Blossom, reference as `["attachment", "<sha256>", "<mime-type>", "<filename>"]` |
| `image/*` | Upload to Blossom, reference with `["image", "<blossom-url>", "<sha256>"]` tag |
| `message/rfc822` | Recursively convert enclosed message; attach as nested event or Blossom blob |

### 1.2 Flattening Nested Multipart into NOSTR Tags

Email MIME trees can be deeply nested. NOSTR Mail uses a flat tag structure. The bridge must walk the MIME tree depth-first and produce a flat list:

```
Email MIME tree:
  multipart/mixed
    multipart/alternative
      text/plain         --> content field
      multipart/related
        text/html        --> ["html", "..."] tag
        image/png (cid:logo)  --> ["image", "https://blossom.example/sha256", "sha256hex"]
    application/pdf      --> ["attachment", "sha256hex", "application/pdf", "report.pdf"]
    image/jpeg           --> ["attachment", "sha256hex", "image/jpeg", "photo.jpg"]

NOSTR Mail tags (flattened):
  ["subject", "Quarterly Report"]
  ["html", "<html>...<img src='https://blossom.example/sha256'>...</html>"]
  ["image", "https://blossom.example/sha256hex", "sha256hex"]
  ["attachment", "sha256hex1", "application/pdf", "report.pdf"]
  ["attachment", "sha256hex2", "image/jpeg", "photo.jpg"]
  content: "Plain text version of the email body..."
```

**Flattening rules:**
1. Walk MIME tree depth-first
2. First `text/plain` part in the first `multipart/alternative` becomes `content`
3. Corresponding `text/html` becomes `["html", "..."]` tag
4. Inline images (Content-Disposition: inline + Content-ID) become `["image", ...]` tags with their Content-ID references rewritten to Blossom URLs in the HTML
5. All other parts become `["attachment", ...]` tags
6. Preserve original filename from Content-Disposition `filename` parameter or Content-Type `name` parameter
7. Preserve MIME type for each attachment

### 1.3 Inline Image Extraction (Content-ID to Blossom)

Email HTML references inline images via `cid:` URIs:

```html
<!-- Email HTML -->
<img src="cid:logo@example.com" alt="Logo">
```

```
MIME part:
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-ID: <logo@example.com>
Content-Disposition: inline; filename="logo.png"

iVBORw0KGgoAAAANS...
```

**Bridge conversion steps:**
1. Decode the base64 image data
2. Compute SHA-256 hash of raw bytes
3. Upload to one or more Blossom servers via `PUT /upload` with `Authorization` header (NIP-98)
4. Receive Blossom URL: `https://blossom.example.com/<sha256hex>`
5. Rewrite `cid:` references in HTML:
   ```html
   <img src="https://blossom.example.com/abc123def..." alt="Logo">
   ```
6. Add image tag to event: `["image", "https://blossom.example.com/abc123def...", "abc123def..."]`
7. Store a Content-ID to Blossom hash mapping for any other references to the same CID

**Edge cases:**
- Multiple HTML parts referencing the same CID: upload once, rewrite all references
- CID without angle brackets: some mailers send `cid:logo` instead of `cid:<logo@example.com>` — handle both
- Missing Content-ID on inline images: generate a reference by position/filename

### 1.4 Handling multipart/alternative

`multipart/alternative` presents the same content in multiple formats, ordered from least preferred to most preferred (per RFC 2046):

```
multipart/alternative
  text/plain          (least preferred)
  text/html           (most preferred)
```

**Bridge strategy:**
1. Always extract `text/plain` for the NOSTR event `content` field (universal fallback)
2. If `text/html` exists, include as `["html", "..."]` tag
3. If only `text/html` exists (no text/plain):
   - Convert HTML to Markdown for `content` field
   - Preserve original HTML in `["html", "..."]` tag
4. If only `text/plain` exists: use directly as `content`, no HTML tag
5. Ignore other alternatives (e.g., `text/enriched`, `application/rtf`) unless they are the only part
6. If `multipart/related` is nested inside alternative (common pattern for HTML + inline images), process the related part as described in section 1.3

### 1.5 Threading Preservation

Email uses Message-ID / In-Reply-To / References headers. NOSTR uses event `e` tags with markers.

**Mapping strategy:**

The bridge must maintain a persistent bidirectional mapping table:

```
email_message_id  <-->  nostr_event_id
```

**SMTP to NOSTR threading conversion:**
1. Extract `Message-ID` from the incoming email
2. Extract `In-Reply-To` and `References` headers
3. Look up the `In-Reply-To` Message-ID in the mapping table:
   - If found: add `["e", "<nostr-event-id>", "", "reply"]` tag
   - If not found: the parent message may not have been bridged; store a placeholder
4. Look up the first Message-ID in `References` (the thread root):
   - If found: add `["e", "<nostr-event-id>", "", "root"]` tag
   - If not found and In-Reply-To was found: walk References from right to left until a known ID is found for root
5. Generate the NOSTR event and store the mapping: `this-message-id <--> new-event-id`

**Deferred threading:**
If a reply arrives before the original (out-of-order delivery), store the incomplete reference. When the original arrives later, update the reply event's tags retroactively (if possible) or maintain the mapping for future replies.

### 1.6 Email Address to NOSTR Pubkey Resolution

**NIP-05 resolution:**
Given an email address `alice@example.com`, the bridge attempts to resolve the NOSTR pubkey:

1. Query `https://example.com/.well-known/nostr.json?name=alice`
2. If the response contains a valid pubkey for `alice`, use that pubkey as the event author/recipient
3. If NIP-05 resolution fails, the bridge has several options:
   - **Bridge-assigned pubkey**: Generate a keypair for the email address and manage it in the bridge's keystore
   - **Placeholder identity**: Use a well-known bridge pubkey and include the email address in a tag: `["email", "alice@example.com"]`
   - **Reject**: If policy requires all participants to have NOSTR identities

**Caching:**
NIP-05 results should be cached with a TTL (e.g., 1 hour) to avoid excessive lookups. Respect HTTP cache headers from the NIP-05 endpoint.

### 1.7 Authentication Result Representation

The bridge should preserve the email authentication results for transparency:

```json
{
  "tags": [
    ["bridged-auth", "spf", "pass", "smtp.mailfrom=alice@example.com"],
    ["bridged-auth", "dkim", "pass", "header.d=example.com", "header.s=selector2024"],
    ["bridged-auth", "dmarc", "pass", "header.from=example.com"],
    ["bridged-auth", "arc", "pass", "i=1"],
    ["bridged-from", "smtp", "alice@example.com"],
    ["bridged-via", "bridge.nostr.example.com"]
  ]
}
```

**Trust levels:**
| Auth Result | Bridge Action |
|-------------|--------------|
| SPF pass + DKIM pass + DMARC pass | High confidence — bridge with full attribution |
| DKIM pass, SPF fail (forwarded) | Medium confidence — check ARC chain |
| DMARC fail | Low confidence — add warning tag `["bridged-warning", "dmarc-fail"]` |
| No authentication | Minimal confidence — mark as unverified `["bridged-warning", "unauthenticated"]` |

### 1.8 Mailing List Message Handling

Mailing list messages have distinctive headers:

```
List-Id: <dev.example.com>
List-Unsubscribe: <https://example.com/unsub>, <mailto:unsub@lists.example.com>
List-Post: <mailto:dev@lists.example.com>
List-Archive: <https://lists.example.com/archive/dev>
Precedence: list
X-Mailing-List: dev@lists.example.com
```

**Bridge handling:**
1. Detect mailing list via `List-Id` or `Precedence: list` header
2. Map the list to a NOSTR equivalent:
   - Option A: Bridge to a specific NOSTR group/community (NIP-72)
   - Option B: Bridge as regular messages with list metadata tags
3. Add list metadata tags:
   ```json
   ["list-id", "dev.example.com"]
   ["list-post", "mailto:dev@lists.example.com"]
   ```
4. Thread list messages using References/In-Reply-To (not subject-based)
5. Deduplicate: if the bridge receives both the direct copy and the list copy of the same message (same Message-ID), prefer the list copy and discard the duplicate

### 1.9 Auto-Generated Message Handling

**Vacation replies / auto-responders:**
Detected via:
- `Auto-Submitted: auto-replied` (RFC 3834)
- `X-Auto-Response-Suppress: All`
- `Precedence: bulk` or `Precedence: junk`

Bridge action: Mark with `["auto-generated", "vacation"]` tag. Do NOT trigger auto-responses from NOSTR side (prevents loops).

**Delivery Status Notifications:**
- Content-Type: `multipart/report; report-type=delivery-status`
- Parse the `message/delivery-status` part for Action and Status fields
- Bridge as a system notification event, not a regular message
- Map DSN status codes to human-readable status

**Read receipts (MDN):**
- Content-Type: `multipart/report; report-type=disposition-notification`
- Parse `message/disposition-notification` for Disposition field
- Consider mapping to NOSTR read receipt mechanism if one exists

### 1.10 Encrypted Email Handling (PGP/MIME, S/MIME)

**PGP/MIME (multipart/encrypted):**
```
multipart/encrypted; protocol="application/pgp-encrypted"
  application/pgp-encrypted    (Version: 1)
  application/octet-stream     (PGP encrypted data)
```

Bridge options:
1. **Pass-through**: Store the encrypted blob on Blossom, reference in event with `["encrypted", "pgp-mime", "<sha256>"]`. Recipient needs PGP key to decrypt — bridge cannot help.
2. **Bridge-decrypt-reencrypt**: If the bridge holds a PGP key (e.g., for a bridge-managed identity), decrypt the email, then re-encrypt for NOSTR using NIP-44/NIP-59 Gift Wrap. This requires the bridge to be a trusted intermediary.
3. **Reject**: Refuse to bridge encrypted email, send a bounce suggesting the sender use NOSTR directly.

**S/MIME (application/pkcs7-mime):**
Same three options as PGP/MIME. S/MIME is certificate-based (X.509), adding a PKI dependency. The bridge would need the recipient's private key to decrypt.

**Recommendation:** Default to pass-through (option 1) for maximum transparency. Document that end-to-end encrypted email cannot be meaningfully bridged without key escrow.

---

## 2. NOSTR to SMTP Conversion Patterns

### 2.1 Kind 15 Rumor to MIME Construction

A NOSTR Mail event (Kind 15 rumor inside Kind 1059 Gift Wrap) must be converted to a valid RFC 5322 message.

**Event structure (simplified):**
```json
{
  "kind": 15,
  "pubkey": "abc123...",
  "content": "Hello from NOSTR!\n\nThis is a test message.",
  "tags": [
    ["subject", "Test from NOSTR"],
    ["p", "def456...", "", "to"],
    ["p", "ghi789...", "", "cc"],
    ["html", "<html><body><h1>Hello from NOSTR!</h1><p>This is a test message.</p></body></html>"],
    ["image", "https://blossom.example.com/aaa111", "aaa111"],
    ["attachment", "bbb222", "application/pdf", "document.pdf"],
    ["e", "parent-event-id", "", "reply"],
    ["e", "root-event-id", "", "root"]
  ],
  "created_at": 1711929600
}
```

**Resulting MIME message:**
```
From: npub1abc12...@bridge.nostr.example.com
To: npub1def45...@bridge.nostr.example.com
Cc: npub1ghi78...@bridge.nostr.example.com
Subject: Test from NOSTR
Date: Mon, 01 Apr 2024 12:00:00 +0000
Message-ID: <nostr-abc123-1711929600@bridge.nostr.example.com>
In-Reply-To: <nostr-parent-event-id@bridge.nostr.example.com>
References: <nostr-root-event-id@bridge.nostr.example.com>
    <nostr-parent-event-id@bridge.nostr.example.com>
MIME-Version: 1.0
X-Nostr-Event-Id: abc123...
X-Nostr-Pubkey: abc123...
Content-Type: multipart/mixed; boundary="nostr-boundary-1"

--nostr-boundary-1
Content-Type: multipart/alternative; boundary="nostr-boundary-2"

--nostr-boundary-2
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Hello from NOSTR!

This is a test message.

--nostr-boundary-2
Content-Type: multipart/related; boundary="nostr-boundary-3"

--nostr-boundary-3
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html><body><h1>Hello from NOSTR!</h1><p>This is a test message.</p></body></html>

--nostr-boundary-3
Content-Type: image/png
Content-Transfer-Encoding: base64
Content-ID: <aaa111@blossom>
Content-Disposition: inline; filename="aaa111.png"

[base64 encoded image data downloaded from Blossom]

--nostr-boundary-3--
--nostr-boundary-2--
--nostr-boundary-1
Content-Type: application/pdf
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="document.pdf"

[base64 encoded PDF data downloaded from Blossom]

--nostr-boundary-1--
```

### 2.2 Markdown to HTML Conversion

NOSTR event `content` is typically plain text or Markdown. For email delivery, convert to HTML:

**Conversion rules:**
| Markdown | HTML |
|----------|------|
| `**bold**` | `<strong>bold</strong>` |
| `*italic*` | `<em>italic</em>` |
| `` `code` `` | `<code>code</code>` |
| `[text](url)` | `<a href="url">text</a>` |
| `![alt](url)` | `<img src="url" alt="alt">` |
| `\n\n` (double newline) | `<p>` paragraph break |
| `\n` (single newline) | `<br>` |
| `> quote` | `<blockquote>quote</blockquote>` |
| `- item` | `<ul><li>item</li></ul>` |
| `# heading` | `<h1>heading</h1>` |

**NOSTR-specific conversions:**
- `nostr:npub1...` mentions: Convert to display name (via NIP-05 reverse lookup or metadata event) and hyperlink to a web client profile page
- `nostr:note1...` references: Convert to hyperlink to a web client event view
- `nostr:nevent1...` references: Same as note references

**Email HTML best practices:**
- Use inline CSS (no `<style>` blocks — many email clients strip them)
- Use `<table>` layout for complex formatting (email clients have poor CSS support)
- Include both plain text and HTML parts (multipart/alternative)
- Set `Content-Type: text/html; charset=utf-8`

### 2.3 Blossom References to MIME Attachments

For each `["attachment", "<sha256>", "<mime-type>", "<filename>"]` tag:

1. **Download** from Blossom: `GET https://blossom.example.com/<sha256>`
2. **Verify** SHA-256 hash of downloaded data matches the tag
3. **Base64 encode** the binary data
4. **Construct MIME part:**
   ```
   Content-Type: <mime-type>
   Content-Transfer-Encoding: base64
   Content-Disposition: attachment; filename="<filename>"
   
   [base64 data, wrapped at 76 characters]
   ```
5. Add to `multipart/mixed` container

**For `["image", "<url>", "<sha256>"]` inline images:**
1. Download and verify as above
2. Assign a Content-ID: `<sha256@blossom>`
3. Add as `Content-Disposition: inline` part inside `multipart/related`
4. Reference in HTML as `cid:<sha256@blossom>`

**Failure handling:**
- If Blossom download fails: include a placeholder text part explaining the attachment is unavailable, with the original Blossom URL for manual retrieval
- If hash verification fails: reject the attachment, log the discrepancy
- Size limits: check total MIME message size against destination server's SIZE limit (from EHLO); if exceeded, consider omitting large attachments and including download links instead

### 2.4 Event Tag Threading to Email Headers

**Mapping `e` tags to Message-ID / In-Reply-To / References:**

```
Event tags:
  ["e", "root-event-id", "", "root"]
  ["e", "parent-event-id", "", "reply"]

Email headers:
  Message-ID: <nostr-{this-event-id}@bridge.nostr.example.com>
  In-Reply-To: <nostr-{parent-event-id}@bridge.nostr.example.com>
  References: <nostr-{root-event-id}@bridge.nostr.example.com>
      <nostr-{parent-event-id}@bridge.nostr.example.com>
```

**Message-ID generation rules:**
- Format: `<nostr-{event-id-hex}@{bridge-domain}>`
- Deterministic: same event always produces the same Message-ID
- Must be globally unique (the event ID hex ensures this)
- Check mapping table for existing email Message-ID (if the event originated from email)

**Building the References chain:**
If the bridge has knowledge of the full thread (via `e` tag traversal):
1. Start with the root event's Message-ID
2. Walk the reply chain from root to parent
3. Each event ID maps to `<nostr-{id}@bridge-domain>` or its original email Message-ID if it was bridged from email
4. Construct References as a space-separated list, root first, parent last

### 2.5 NIP-05 to From Header

The bridge must construct a valid RFC 5322 `From` header for outbound email.

**Resolution steps:**
1. Look up the sender's pubkey metadata (Kind 0 event) for `display_name` and `nip05`
2. If NIP-05 is set (e.g., `alice@example.com`):
   - Verify NIP-05 resolves back to this pubkey
   - Use as basis: `From: Alice <alice@example.com>` (but see DKIM alignment below)
3. **DKIM alignment requirement**: The From header domain must align with the bridge's DKIM `d=` domain
   - Solution: Always use bridge domain in From, set original identity in Reply-To:
     ```
     From: Alice via NOSTR <alice=example.com@bridge.nostr.example.com>
     Reply-To: alice@example.com
     Sender: bridge@bridge.nostr.example.com
     ```
   - The `=` replaces `@` in the local part (SRS-style encoding)
4. If no NIP-05: use npub as local part:
   ```
   From: npub1abc123...@bridge.nostr.example.com
   ```

### 2.6 DKIM Signing

The bridge must DKIM-sign all outbound messages.

**Key management:**
- Generate RSA 2048-bit (or Ed25519) keypair
- Publish public key in DNS: `selector2024._domainkey.bridge.nostr.example.com TXT "v=DKIM1; k=rsa; p=MIIBIj..."`
- Sign with `d=bridge.nostr.example.com` and `s=selector2024`
- Rotate keys annually: generate new selector (e.g., `selector2025`), publish new DNS record, start signing with new key, keep old key published for 30 days for in-flight messages

**Headers to sign (recommended set):**
```
h=from:reply-to:to:cc:subject:date:message-id:in-reply-to:references:
  content-type:mime-version:list-unsubscribe:list-unsubscribe-post
```

Always include `from` (required by DMARC). Sign `content-type` and `mime-version` to prevent content injection.

**Canonicalization:** Use `c=relaxed/relaxed` to survive intermediate MTA modifications.

### 2.7 SPF Record Management

```
bridge.nostr.example.com. IN TXT "v=spf1 ip4:203.0.113.0/24 ip6:2001:db8::/32 -all"
```

- List all IPs the bridge sends from
- Use `-all` (hard fail) for maximum DMARC alignment
- If using a cloud provider, include their SPF: `include:_spf.google.com` or `include:amazonses.com`
- Keep total DNS lookups under 10 (SPF evaluation limit)
- Update SPF record whenever sending infrastructure changes

### 2.8 Handling Events With No Email Equivalent

Some NOSTR event features have no direct email representation:

| NOSTR Feature | Bridge Strategy |
|---------------|----------------|
| Cashu tokens (`["cashu", "..."]`) | Include as text in body: "This message includes a Cashu token: [token]. Open in a NOSTR client to redeem." Add token as `text/plain` attachment. |
| Proof of Work (`["nonce", "..."]`) | Include as `X-Nostr-PoW: <difficulty>` custom header. Mention in footer if relevant. |
| Emoji reactions (Kind 7) | Do not bridge as email (no equivalent). Optionally aggregate and include in periodic digest. |
| Zap receipts (Kind 9735) | Include as informational footer: "This message received X sats via Lightning." |
| Event deletions (Kind 5) | Cannot recall sent email. Send follow-up message: "The sender has retracted the previous message." |
| Relay hints in tags | Irrelevant for email. Ignore. |
| Content warnings (`["content-warning", "..."]`) | Map to `Subject: [CW: reason] Original Subject`. Optionally hide body behind a warning in HTML. |

### 2.9 Return-Path and Bounce Handling

**Outbound (NOSTR to SMTP):**
```
MAIL FROM:<bounce+nostr-eventid-hash@bridge.nostr.example.com>
```

- Use VERP (Variable Envelope Return Path) encoding to identify the original event and recipient
- Format: `bounce+{event-id-short}-{recipient-hash}@bridge.nostr.example.com`
- When a bounce returns to this address, the bridge can identify which event to which recipient failed

**Bounce processing:**
1. Receive bounce at the VERP address
2. Parse the DSN (multipart/report with message/delivery-status)
3. Extract: Final-Recipient, Action (failed/delayed/delivered), Status code, Diagnostic-Code
4. Map back to NOSTR event and recipient using VERP encoding
5. Generate a NOSTR notification to the original sender:
   - Kind 15 message from bridge identity
   - Content: "Delivery to {email} failed: {reason}"
   - Tag: `["e", "{original-event-id}", "", "root"]` to thread with original

**Bounce categories and actions:**
| DSN Status | Action |
|------------|--------|
| 5.1.1 (user unknown) | Permanent failure — notify sender, flag address |
| 5.2.2 (mailbox full) | Retry once after 24h, then notify sender |
| 5.7.1 (policy rejection) | Permanent — likely spam block; notify sender with details |
| 4.x.x (transient) | Retry with exponential backoff: 5min, 15min, 1h, 4h, 24h |
| No bounce after 48h | Assume delivered (no news is good news in email) |

---

## 3. Deliverability Strategy for the Bridge

### 3.1 Infrastructure Setup

**Dedicated IP with proper DNS:**
```
Forward DNS:
  bridge.nostr.example.com  A     203.0.113.42

Reverse DNS (PTR):
  42.113.0.203.in-addr.arpa  PTR  bridge.nostr.example.com
```

The PTR record MUST resolve back to the forward DNS. Many receivers reject mail from IPs without matching PTR records. This is a Day 1 requirement, not optional.

**Additional DNS records:**
```
; SPF
bridge.nostr.example.com. IN TXT "v=spf1 ip4:203.0.113.42 -all"

; DKIM
selector2024._domainkey.bridge.nostr.example.com. IN TXT "v=DKIM1; k=rsa; p=MIIBIjAN..."

; DMARC
_dmarc.bridge.nostr.example.com. IN TXT "v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc-agg@bridge.nostr.example.com; ruf=mailto:dmarc-forensic@bridge.nostr.example.com; adkim=s; aspf=s; pct=100; fo=1"

; MTA-STS
_mta-sts.bridge.nostr.example.com. IN TXT "v=STSv1; id=20250401"

; TLS Reporting
_smtp._tls.bridge.nostr.example.com. IN TXT "v=TLSRPTv1; rua=mailto:tls-reports@bridge.nostr.example.com"
```

**MTA-STS policy file** at `https://mta-sts.bridge.nostr.example.com/.well-known/mta-sts.txt`:
```
version: STSv1
mode: enforce
mx: bridge.nostr.example.com
max_age: 604800
```

### 3.2 Authentication Configuration

**SPF: Strict pass**
- Only the bridge's own IPs in the SPF record
- Use `-all` (hard fail) since the bridge has full control of sending infrastructure
- No `include:` to third parties unless necessary

**DKIM: 2048-bit RSA, annual rotation**
- Generate new keypair each year with date-based selector (e.g., `s202501`)
- Publish new key 30 days before rotation
- Switch signing to new key on rotation date
- Keep old key published for 30 days after rotation (for delayed deliveries / retries)
- Sign all outbound mail — no exceptions

**DMARC: `p=reject` from day one**
- Strict alignment (`adkim=s; aspf=s`) since the bridge controls both SPF and DKIM domains
- Aggregate reports (`rua`) to monitor authentication results across receiving domains
- Forensic reports (`ruf`) for debugging individual failures
- Process DMARC reports daily; alert on authentication pass rate below 99%

### 3.3 IP Warm-Up Schedule

| Day | Daily Volume | Target Recipients | Notes |
|-----|-------------|-------------------|-------|
| 1-3 | 50 | Known-good addresses (test accounts at Gmail/Outlook/Yahoo) | Verify inbox placement |
| 4-7 | 100 | Active NOSTR users with verified email | High engagement expected |
| 8-14 | 250-500 | Expanding recipient base | Monitor bounce rate (<2%) |
| 15-21 | 500-1,000 | Broader audience | Watch for 421 throttling |
| 22-28 | 1,000-2,500 | Normal growth | Check Postmaster Tools |
| 29-42 | 2,500-10,000 | Double weekly | Maintain complaint rate <0.1% |
| 43+ | 10,000+ | Full volume | Continue monitoring |

**Abort conditions (pause and investigate):**
- Bounce rate exceeds 5%
- Complaint rate exceeds 0.1%
- Any 5xx rejections mentioning blocklist
- Gmail Postmaster Tools shows "Bad" domain reputation

### 3.4 Monitoring

**Metrics to track:**

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Delivery rate (accepted/attempted) | >98% | <95% |
| Bounce rate (hard bounces/sent) | <1% | >2% |
| Complaint rate (complaints/inbox) | <0.05% | >0.1% |
| SPF pass rate | 100% | <99% |
| DKIM pass rate | 100% | <99% |
| DMARC pass rate | 100% | <99% |
| Inbox placement (seed tests) | >90% | <80% |

**Monitoring tools:**
- **Google Postmaster Tools**: Domain reputation, spam rate, authentication results for Gmail
- **Microsoft SNDS**: Delivery data for Outlook/Hotmail
- **DMARC aggregate reports**: Automated parsing (e.g., `parsedmarc`, `dmarc-report-converter`)
- **Seed list testing**: Send to test addresses at major providers, check inbox/spam placement
- **Internal logging**: Every SMTP transaction logged with response codes, recipient domain, TLS version, delivery time

### 3.5 Feedback Loop Registration

Register for FBL programs with major providers:

| Provider | Program | Registration |
|----------|---------|-------------|
| Microsoft | JMRP + SNDS | https://sendersupport.olc.protection.outlook.com/snds/ |
| Yahoo | Complaint Feedback Loop | https://senders.yahooinc.com/fbl/ |
| Gmail | Postmaster Tools (not traditional FBL) | https://postmaster.google.com/ |
| Comcast | Feedback Loop | https://postmaster.comcast.net/ |
| AOL | Feedback Loop | Via Verizon Media postmaster |

**FBL processing:**
1. Parse incoming ARF reports
2. Extract the original recipient who complained
3. Add to suppression list immediately (do not send further bridged email)
4. Notify the NOSTR sender that the recipient does not wish to receive bridged email
5. Track complaint rate per destination domain

### 3.6 Blocklist Incident Response

**Detection:**
- Sudden spike in 5xx rejections with RBL references in diagnostic messages
- Direct DNSBL queries (check bridge IP against major lists hourly)
- DMARC reports showing unexpected failures

**Response procedure:**
1. **Identify** which blocklist(s) via MXToolbox or direct DNSBL queries
2. **Investigate** the cause: compromised account? Bridging spam? Misconfigured system?
3. **Mitigate** the root cause immediately (block offending traffic)
4. **Gather evidence**: logs showing the issue is resolved, volume of affected messages, timeline
5. **Request delisting**:
   - Spamhaus: https://www.spamhaus.org/lookup/ (self-service for some lists)
   - Barracuda: https://www.barracudacentral.org/rbl/removal-request
   - SpamCop: Auto-expires after 24h if no new reports
   - Microsoft: https://sender.office.com/ (delist request)
6. **Monitor** for re-listing in the following 7 days
7. **Post-mortem**: Document incident and implement preventive measures

**Prevention:**
- Rate-limit bridged messages per NOSTR sender (prevent abuse)
- Content scanning for obvious spam patterns before bridging
- Maintain suppression list for invalid addresses (hard bounces)
- Do not bridge Kind 1 (public notes) to email — only Kind 14/15 (DMs/mail)
- Require NOSTR senders to have some minimum identity (NIP-05 or web-of-trust threshold)
