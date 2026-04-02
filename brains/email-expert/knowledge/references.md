# Email Domain Expert — Key References

> Authoritative RFCs, tools, and resources for the email stack. Organized by topic for quick lookup.

---

## 1. Core Protocol RFCs

### SMTP (Simple Mail Transfer Protocol)

| RFC | Title | Status | Key Content |
|-----|-------|--------|-------------|
| **RFC 5321** | Simple Mail Transfer Protocol | Standard | The SMTP specification. Defines EHLO, MAIL FROM, RCPT TO, DATA, relay model, return path, bounce handling, null sender. The foundational document. |
| RFC 5322 | Internet Message Format | Standard | Defines the format of email messages: headers (From, To, Subject, Date, Message-ID, In-Reply-To, References), body structure, folding, address syntax. |
| RFC 6409 | Message Submission for Mail | Standard | Submission (port 587): requires AUTH, STARTTLS. Distinguishes submission from relay. |
| RFC 3207 | SMTP Service Extension for Secure SMTP over TLS (STARTTLS) | Standard | How SMTP upgrades to TLS mid-connection. |
| RFC 8314 | Cleartext Considered Obsolete: Use of TLS for Email | Best Practice | Recommends implicit TLS (port 465) for submission, STARTTLS for MTA-to-MTA. Deprecates cleartext. |
| RFC 2920 | SMTP Service Extension for Command Pipelining | Standard | Batching SMTP commands to reduce round trips. |
| RFC 3030 | SMTP Service Extensions for Transmission of Large and Binary MIME Messages | Standard | CHUNKING (BDAT command) and BINARYMIME extensions. |
| RFC 1870 | SMTP Service Extension for Message Size Declaration | Standard | SIZE parameter on MAIL FROM; SIZE extension in EHLO. |
| RFC 6152 | SMTP Service Extension for 8-bit MIME Transport | Standard | 8BITMIME extension, BODY parameter on MAIL FROM. |
| RFC 4954 | SMTP Service Extension for Authentication | Standard | AUTH extension, SASL mechanisms for SMTP. |
| RFC 6531 | SMTP Extension for Internationalized Email | Standard | SMTPUTF8 extension for non-ASCII addresses and headers. |
| RFC 7504 | SMTP 521 and 556 Reply Codes | Standard | Codes for hosts that do not accept mail. |

### MIME (Multipurpose Internet Mail Extensions)

| RFC | Title | Key Content |
|-----|-------|-------------|
| **RFC 2045** | MIME Part One: Format of Internet Message Bodies | Content-Type, Content-Transfer-Encoding headers, MIME-Version. |
| **RFC 2046** | MIME Part Two: Media Types | Multipart syntax (mixed, alternative, related, digest), boundary rules, text/plain default. |
| **RFC 2047** | MIME Part Three: Message Header Extensions for Non-ASCII Text | Encoded-word syntax: `=?charset?encoding?text?=` for non-ASCII in headers. |
| RFC 2048 | MIME Part Four: Registration Procedures | How new MIME types are registered with IANA. |
| RFC 2049 | MIME Part Five: Conformance Criteria and Examples | Conformance requirements and worked examples. |
| **RFC 2231** | MIME Parameter Value and Encoded Word Extensions | Long parameter continuation (`param*0=`, `param*1=`), charset/language encoding for parameters. |
| RFC 2183 | Content-Disposition Header Field | `inline` vs `attachment`, filename parameter. |

### IMAP (Internet Message Access Protocol)

| RFC | Title | Key Content |
|-----|-------|-------------|
| **RFC 9051** | Internet Message Access Protocol (IMAP) - Version 4rev2 | The current IMAP specification. Supersedes RFC 3501. Session states, commands, response codes, UID mechanics. |
| RFC 3501 | IMAPv4rev1 | Previous IMAP specification. Still widely implemented. |
| **RFC 2177** | IMAP4 IDLE Command | Server push for real-time mailbox monitoring. Single-mailbox limitation. |
| **RFC 7162** | IMAP Extensions: Quick Flag Changes Resynchronization (CONDSTORE) and Quick Mailbox Resynchronization (QRESYNC) | MODSEQ-based incremental sync. VANISHED responses for expunged UIDs. |
| RFC 5256 | IMAP SORT and THREAD Extensions | Server-side sorting and threading (ORDEREDSUBJECT, REFERENCES). |
| RFC 6851 | IMAP MOVE Extension | Atomic message move between mailboxes. |
| RFC 6154 | IMAP LIST Extension for Special-Use Mailboxes | Standard mailbox roles: `\Drafts`, `\Sent`, `\Trash`, `\Archive`, `\All`, `\Flagged`, `\Junk`. |
| RFC 7888 | IMAP4 Non-synchronizing Literals (LITERAL+) | Faster literal uploads without server confirmation. |
| RFC 2342 | IMAP4 Namespace | Mailbox hierarchy conventions (personal, other users, shared). |
| RFC 5465 | IMAP NOTIFY Extension | Monitor multiple mailboxes for changes (alternative to multiple IDLE connections). |
| RFC 8474 | IMAP Extension for Object Identifiers | Stable MAILBOXID and EMAILID that survive UIDVALIDITY changes. |

### JMAP (JSON Meta Application Protocol)

| RFC | Title | Key Content |
|-----|-------|-------------|
| **RFC 8620** | The JSON Meta Application Protocol (JMAP) | Core JMAP protocol: HTTP-based, JSON requests/responses, push notifications, session model. |
| **RFC 8621** | The JSON Meta Application Protocol (JMAP) for Mail | JMAP Mail: mailbox, email, thread, identity, submission objects. Modern alternative to IMAP. |

---

## 2. Authentication and Security RFCs

| RFC | Title | Key Content |
|-----|-------|-------------|
| **RFC 7208** | Sender Policy Framework (SPF) for Authorizing Use of Domains in Email | SPF specification: DNS TXT records, mechanisms (ip4, include, a, mx), qualifiers (+/-/~/?) , 10-lookup limit. |
| **RFC 6376** | DomainKeys Identified Mail (DKIM) Signatures | DKIM specification: signing algorithm, canonicalization, selector DNS lookup, header/body hashing. |
| RFC 8463 | A New Cryptographic Signature Method for DKIM (Ed25519-SHA256) | Ed25519 as an alternative to RSA for DKIM. Smaller keys, faster verification. |
| **RFC 7489** | Domain-based Message Authentication, Reporting, and Conformance (DMARC) | DMARC specification: alignment (SPF/DKIM with From domain), policies (none/quarantine/reject), aggregate and forensic reporting. |
| **RFC 8617** | The Authenticated Received Chain (ARC) Protocol | ARC specification: preserving authentication results across intermediaries. ARC-Seal, ARC-Message-Signature, ARC-Authentication-Results. |
| **RFC 8461** | SMTP MTA Strict Transport Security (MTA-STS) | TLS enforcement for SMTP via HTTPS-published policies. Prevents STARTTLS downgrade attacks. |
| **RFC 7672** | SMTP Security via Opportunistic DNS-Based Authentication of Named Entities (DANE) TLS | DANE for SMTP: TLSA records via DNSSEC for certificate pinning. Stronger than MTA-STS but requires DNSSEC. |
| RFC 8460 | SMTP TLS Reporting | Reporting mechanism for TLS negotiation failures. JSON reports sent to domain operators. |
| RFC 8689 | SMTP Require TLS Option | REQUIRETLS extension: sender can demand TLS for entire delivery chain. |
| RFC 3834 | Recommendations for Automatic Responses to Electronic Mail | Guidelines for auto-responders (vacation, out-of-office). Auto-Submitted header. Loop prevention. |

---

## 3. Notification and Reporting RFCs

| RFC | Title | Key Content |
|-----|-------|-------------|
| **RFC 3464** | An Extensible Message Format for Delivery Status Notifications (DSN) | DSN format: multipart/report with message/delivery-status. Status codes (class.subject.detail). |
| RFC 3461 | SMTP Service Extension for Delivery Status Notifications | SMTP DSN extension: NOTIFY, ORCPT, RET, ENVID parameters. |
| RFC 3463 | Enhanced Mail System Status Codes | The X.Y.Z status code taxonomy used in DSNs and enhanced SMTP replies. |
| **RFC 8098** | Message Disposition Notification (MDN) | Read receipts: request via Disposition-Notification-To header, response as multipart/report with message/disposition-notification. |
| RFC 5965 | An Extensible Format for Email Feedback Reports (ARF) | Abuse Reporting Format: used by ISP feedback loops to report spam complaints. |
| **RFC 8058** | Signaling One-Click Functionality for List Email Headers | List-Unsubscribe-Post header for one-click unsubscribe. Required by Gmail/Yahoo since 2024. |
| RFC 2369 | The Use of URLs as Meta-Syntax for Core Mail List Commands | List-* headers: List-Unsubscribe, List-Post, List-Archive, List-Help, List-Subscribe. |

---

## 4. Reference Implementations and Software

### MTAs (Mail Transfer Agents)

| Software | Language | Documentation | Notes |
|----------|----------|---------------|-------|
| **Postfix** | C | https://www.postfix.org/documentation.html | The reference open-source MTA. Modular architecture, extensive documentation, widely deployed. Best for learning SMTP internals. |
| **Exim** | C | https://www.exim.org/docs.html | Highly configurable MTA, dominant in cPanel hosting. Complex configuration language. |
| **Sendmail** | C | https://www.proofpoint.com/us/products/email-protection/open-source-email-solution | The original MTA. Historical significance but complex configuration (m4 macros). |
| **Haraka** | Node.js | https://haraka.github.io/ | Plugin-based MTA in JavaScript. Good for custom bridging logic. |
| **OpenSMTPD** | C | https://www.opensmtpd.org/manual.html | BSD-origin MTA. Clean, simple configuration. Good security track record. |

### IMAP Servers

| Software | Language | Documentation | Notes |
|----------|----------|---------------|-------|
| **Dovecot** | C | https://doc.dovecot.org/ | The reference IMAP server. Supports IMAP4rev1/rev2, JMAP, extensive plugin system. Most deployed IMAP server. |
| **Cyrus IMAP** | C | https://www.cyrusimap.org/imap/ | Enterprise IMAP server from Carnegie Mellon. JMAP support, CalDAV, CardDAV. |
| **Stalwart Mail** | Rust | https://stalw.art/docs/ | Modern all-in-one mail server: SMTP, IMAP, JMAP, ManageSieve. Written in Rust. |

### Libraries for Building Email Bridges

| Library | Language | Purpose |
|---------|----------|---------|
| `nodemailer` | Node.js | SMTP sending, MIME construction. Most popular Node.js email library. |
| `mailparser` | Node.js | MIME parsing. Handles malformed messages well. |
| `smtp-server` | Node.js | SMTP server implementation for receiving mail. |
| `email` (stdlib) | Python | MIME parsing and construction. Part of Python standard library. |
| `aiosmtpd` | Python | Async SMTP server for Python. |
| `lettre` | Rust | SMTP client and MIME builder for Rust. |
| `mail-parser` | Rust | RFC 5322 / MIME parser for Rust. Handles malformed input. |
| `go-mail` | Go | Email sending library for Go. |
| `net/smtp` | Go | Standard library SMTP client. Basic but reliable. |

---

## 5. Threading References

| Resource | URL / Reference | Notes |
|----------|----------------|-------|
| **JWZ Threading Algorithm** | https://www.jwz.org/doc/threading.html | Jamie Zawinski's definitive description. Includes pseudocode and edge case handling. The standard reference for implementing email threading. |
| RFC 5256 Section 3 | REFERENCES threading algorithm | IMAP server-side threading specification. Based on JWZ but adapted for IMAP SEARCH/THREAD. |
| Gmail threading behavior | https://support.google.com/mail/answer/5900 | Google's public documentation on conversation grouping. Explains subject-based grouping behavior. |

---

## 6. Deliverability Tools

### Reputation Monitoring

| Tool | URL | Purpose |
|------|-----|---------|
| **Google Postmaster Tools** | https://postmaster.google.com/ | Domain and IP reputation at Gmail. Spam rate, authentication results, delivery errors. Essential for any sender targeting Gmail. |
| **Microsoft SNDS** | https://sendersupport.olc.protection.outlook.com/snds/ | Smart Network Data Services. Delivery data for Outlook.com/Hotmail. IP reputation, complaint data. |
| **Sender Score** | https://senderscore.org/ | Validity's sender reputation score (0-100). Free lookup by IP. |
| **Talos Intelligence** | https://talosintelligence.com/reputation_center | Cisco's IP/domain reputation lookup. |

### DNS and Deliverability Diagnostics

| Tool | URL | Purpose |
|------|-----|---------|
| **MX Toolbox** | https://mxtoolbox.com/ | Comprehensive DNS diagnostics: MX lookup, SPF/DKIM/DMARC validation, blacklist check (100+ lists), SMTP test, header analysis. The Swiss Army knife for email deliverability. |
| **mail-tester.com** | https://www.mail-tester.com/ | Send a test email, get a deliverability score with detailed feedback on SPF, DKIM, DMARC, content, blacklists. |
| **dmarcian** | https://dmarcian.com/dmarc-tools/ | DMARC record checker, SPF surveyor, DKIM inspector. Useful for validating authentication setup. |
| **DKIM Core Tools** | https://dkimcore.org/tools/ | DKIM key generator and validator. |

### Testing and Development

| Tool | URL | Purpose |
|------|-----|---------|
| **Mailtrap** | https://mailtrap.io/ | Fake SMTP server for development. Captures emails without delivering. Inspects headers, MIME structure, spam score. |
| **Mailhog** | https://github.com/mailhog/MailHog | Self-hosted fake SMTP server with web UI. Good for local development. |
| **Greenmail** | https://greenmail-mail-test.github.io/greenmail/ | Java-based test mail server (SMTP, IMAP, POP3). For integration testing. |
| **swaks** | https://www.jetmore.org/john/code/swaks/ | Swiss Army Knife for SMTP. Command-line tool for crafting and sending test emails with precise control over SMTP conversation. |
| **msmtp** | https://marlam.de/msmtp/ | Lightweight SMTP client. Useful for scripting email sends. |

### Blacklist Checking

| Service | URL | Coverage |
|---------|-----|----------|
| **MX Toolbox Blacklist Check** | https://mxtoolbox.com/blacklists.aspx | Checks 100+ blacklists simultaneously |
| **MultiRBL** | https://multirbl.valli.org/ | Checks 300+ DNS-based blacklists |
| **Spamhaus Lookup** | https://check.spamhaus.org/ | Check against Spamhaus ZEN (SBL+XBL+PBL+CSS) |

---

## 7. Standards and Industry Resources

### Industry Requirements Documents

| Resource | URL | Notes |
|----------|-----|-------|
| **Gmail Sender Guidelines** | https://support.google.com/a/answer/81126 | Google's requirements for bulk senders. Updated 2024 to require DMARC, one-click unsubscribe, <0.3% complaint rate. |
| **Yahoo Sender Requirements** | https://senders.yahooinc.com/best-practices/ | Yahoo's parallel requirements (aligned with Gmail's 2024 changes). |
| **Microsoft Outlook Sender Guidelines** | https://sendersupport.olc.protection.outlook.com/ | Microsoft's sender best practices and troubleshooting. |
| **M3AAWG Best Practices** | https://www.m3aawg.org/published-documents | Messaging, Malware and Mobile Anti-Abuse Working Group. Industry best practices for email sending, authentication, abuse handling. |

### IANA Registries

| Registry | URL | Content |
|----------|-----|---------|
| **Media Types** | https://www.iana.org/assignments/media-types/ | Official MIME type registry. Authoritative list of all registered Content-Types. |
| **SMTP Enhanced Status Codes** | https://www.iana.org/assignments/smtp-enhanced-status-codes/ | Complete registry of X.Y.Z status codes. |
| **Email Authentication Parameters** | https://www.iana.org/assignments/email-auth/ | DKIM, SPF, DMARC parameter registries. |
| **Message Headers** | https://www.iana.org/assignments/message-headers/ | Official registry of all email header fields. |

---

## 8. Books and Long-Form References

| Title | Author | Notes |
|-------|--------|-------|
| *The Book of Postfix* | Ralf Hildebrandt, Patrick Koetter | Comprehensive Postfix administration. Good for understanding MTA internals. |
| *Postfix: The Definitive Guide* | Kyle Dent (O'Reilly) | Practical Postfix configuration and deployment. |
| *Programming Internet Email* | David Wood (O'Reilly) | MIME and email protocol programming. Older but fundamentals still apply. |
| *Email and the Internet* | Various RFCs | The RFCs themselves are the ultimate reference. Start with RFC 5321 and RFC 5322, then branch out as needed. |

---

## 9. Quick RFC Lookup by Topic

For fast navigation when you need a specific RFC:

| Topic | Primary RFC | Also See |
|-------|------------|----------|
| How SMTP works | 5321 | 6409, 8314 |
| How email messages are formatted | 5322 | 2045-2049 |
| How MIME works | 2045, 2046 | 2047, 2231, 2183 |
| How non-ASCII works in headers | 2047 | 2231 |
| How SPF works | 7208 | — |
| How DKIM works | 6376 | 8463 |
| How DMARC works | 7489 | — |
| How ARC works | 8617 | — |
| How IMAP works | 9051 | 3501 |
| How IMAP push works | 2177 | 5465 |
| How IMAP sync works efficiently | 7162 | — |
| How JMAP works | 8620, 8621 | — |
| How bounces are formatted | 3464 | 3461, 3463 |
| How read receipts work | 8098 | — |
| How unsubscribe works | 8058 | 2369 |
| How TLS is enforced | 8461, 7672 | 8460, 8689 |
| How to handle auto-responses | 3834 | — |
| How abuse reports are formatted | 5965 | — |
