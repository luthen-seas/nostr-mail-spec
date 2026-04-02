# Known Attack Patterns: Lessons from Published Research

## Overview

This document maps historically successful attacks on related protocols to the NOSTR Mail attack surface. Each section describes the original attack, what made it possible, and how the same class of vulnerability applies (or does not apply) to NOSTR Mail.

---

## 1. POODLE: Version Downgrade in TLS (Moller et al., 2014)

### Original Attack
POODLE (Padding Oracle On Downgraded Legacy Encryption) exploited TLS's backward-compatible version negotiation. An active attacker could force a TLS connection to fall back from TLS 1.2 to SSL 3.0, then exploit a padding oracle in SSL 3.0's CBC mode to decrypt content byte-by-byte.

### Why It Worked
- TLS supported version negotiation with fallback to insecure legacy versions.
- SSL 3.0 had a fundamental flaw in its padding scheme (padding bytes were not fully verified).
- The attacker only needed to be a network man-in-the-middle.

### Relevance to NOSTR Mail
**NIP-44 has no version negotiation.** The version byte is set by the encryptor (currently `0x02`) and the decryptor either supports that version or rejects the message. There is no fallback mechanism. This is a critical design advantage.

**However**, the risk reappears if:
- A future NIP-44 version (e.g., `0x03`) is introduced and clients continue to accept `0x02`.
- An attacker replays old messages with version `0x02` that have weaker properties.
- The protocol does not mandate minimum version enforcement.

**Lesson**: When NIP-44 is eventually upgraded, clients MUST enforce a minimum version and MUST NOT fall back to older versions at an attacker's request. The decision to encrypt with a specific version must be the sender's alone, with no negotiation channel an attacker can influence.

---

## 2. Efail: HTML Rendering in PGP/S/MIME Clients (Poddebniak et al., 2018)

### Original Attack
Efail demonstrated two attack classes against encrypted email:
1. **Direct exfiltration**: The attacker modified the ciphertext to inject HTML image tags that, when rendered, sent the decrypted plaintext to an attacker-controlled server via a URL parameter.
2. **CBC/CFB gadget attacks**: The attacker exploited malleability in CBC and CFB modes to modify ciphertext so that decrypted plaintext contained attacker-controlled HTML.

### Why It Worked
- PGP encrypted content was embedded in MIME structures. The email client decrypted the PGP content and then rendered it as HTML, including fetching external resources.
- S/MIME's CBC mode was malleable (no authentication). PGP's CFB mode was similarly exploitable.
- The email clients did not isolate decrypted content from the rendering engine.

### Relevance to NOSTR Mail
**NIP-44 uses authenticated encryption (HMAC-SHA256 before decryption).** Any ciphertext modification causes HMAC verification to fail, and the message is rejected. This prevents the CBC/CFB gadget class of Efail attacks entirely.

**The direct exfiltration class remains relevant** if NOSTR Mail clients:
- Render HTML or rich content from decrypted messages.
- Automatically fetch external resources (images, links) referenced in message content.
- Do not sanitize decrypted content before rendering.

**Specific risk with Blossom attachments**: If a message references a Blossom URL for an attachment, and the client automatically fetches it, the Blossom server learns:
- The recipient's IP address.
- The time the message was read.
- Which attachment was accessed (potentially linking to the message).

**Lesson**: NOSTR Mail clients MUST treat decrypted content as untrusted input. External resource loading MUST require explicit user action. Content rendering MUST be sandboxed. Blossom URLs SHOULD be fetched through a proxy or with user confirmation.

---

## 3. Timing Attacks on Tor (Various, 2004-2020)

### Original Research
Multiple papers demonstrated that Tor's anonymity can be defeated by traffic analysis:
- **Murdoch and Danezis (2005)**: Used traffic analysis to identify which Tor relays were on a circuit.
- **Johnson et al. (2013)**: Showed that a moderate adversary observing both ends of a Tor connection could correlate traffic within minutes.
- **Sun et al. (2015)**: Demonstrated that website fingerprinting could identify visited sites despite Tor encryption.

### Why It Worked
- Tor encrypts content but preserves packet timing and volume patterns.
- An adversary observing both the client's ISP and the destination server can correlate patterns.
- Even observing only one end, statistical methods can fingerprint traffic patterns unique to specific activities.

### Relevance to NOSTR Mail
NOSTR has **no onion routing or mix network**. Events travel directly from sender to relay to recipient. This means:

- **Timing correlation is trivial for relay operators.** A relay sees when an event is submitted and when the `p`-tagged recipient retrieves it.
- **Multi-relay observation is even more powerful.** If Alice posts to relay A and Bob reads from relay B (with the event synced between them), an adversary monitoring both relays sees the full path.
- **NIP-59 timestamp randomization helps against external observers** who only see event `created_at`, but does nothing against relay operators who see actual submission/delivery times.

**The NOSTR Mail situation is worse than Tor** in several respects:
- No layered routing (events are not onion-encrypted through multiple relays).
- The `p` tag directly identifies the recipient (Tor hides the destination).
- No padding of relay traffic (idle connections do not generate cover traffic).

**Lesson**: NOSTR Mail should consider:
1. Recommending clients add random delay before publishing events.
2. Using multiple relays with different submission times.
3. Generating cover traffic (dummy gift wraps that recipients silently discard).
4. Long-term: a relay mix-net layer for kind 1059 events.

---

## 4. Double-Spend Attacks in Lightning/Ecash

### Original Research
- **Lightning**: If a channel counterparty broadcasts an old channel state, the other party has a limited time to submit a justice transaction. If they fail (offline, delayed), funds are stolen.
- **Ecash (Chaum, 1983; Cashu, 2023)**: Ecash tokens are bearer instruments. The mint can detect double-spends at redemption time, but the window between issuance and redemption is vulnerable.

### Why It Worked
- Bearer instruments are inherently vulnerable to the "spend-before-redeem" problem.
- Lightning's security depends on liveness (being online to detect fraud).
- Ecash mints are trusted custodians; if the mint colludes with the attacker, double-spend detection fails.

### Relevance to NOSTR Mail
**Cashu tokens as postage have a critical double-spend window:**

1. Alice creates a Cashu token (worth N sats).
2. Alice encrypts it inside a gift-wrapped mail to Bob.
3. Alice publishes the gift wrap to a relay.
4. **Before Bob reads his mail and redeems the token**, Alice redeems the same token at the mint.
5. Bob opens the mail, tries to redeem the token, and the mint rejects it as already spent.

**The attacker IS the sender.** Unlike traditional double-spend where an external attacker races, here the sender themselves can trivially double-spend because they created the token and know its secret.

**Mitigation approaches**:
- **Lock tokens to recipient**: Use a token scheme where the mint will only redeem for a specific pubkey (P2PK Cashu). The sender cannot redeem because they are not the designated recipient.
- **Immediate redemption**: The recipient's client immediately redeems tokens upon decrypting the mail, minimizing the window.
- **Escrow**: A trusted third party holds the token until delivery is confirmed (adds complexity and trust).

**Lesson**: Cashu postage MUST use P2PK (pay-to-public-key) locking to bind tokens to the recipient's public key. Unlocked bearer tokens are trivially double-spendable by the sender.

---

## 5. Metadata Analysis Defeating Encrypted Email

### Original Research
- **Mayer (2016)**: Analyzed PGP keyserver traffic to map social networks of PGP users.
- **Greenwald (2014)**: Snowden documents revealed NSA's collection of email metadata ("We kill people based on metadata" --- Gen. Michael Hayden).
- **Greschbach et al. (2012)**: Showed that email metadata alone reveals organizational structures, communication frequency, and relationship strength.

### Why It Worked
- Email encryption (PGP, S/MIME) only encrypts the body. Headers (From, To, Subject, Date, CC, BCC) are plaintext.
- Even when headers are partially encrypted, the SMTP envelope (sender/recipient addresses) must be plaintext for routing.
- Metadata is structured and highly informative; it is often more valuable than content for surveillance.

### Relevance to NOSTR Mail
NIP-59 Gift Wrap hides more metadata than PGP email:
- **Sender is hidden** (ephemeral key replaces real pubkey on the outer event).
- **No subject line** visible in the outer event.
- **Content is doubly encrypted** (seal + wrap).

**But significant metadata still leaks:**
- **Recipient is visible** via the `p` tag on the gift wrap (necessary for routing).
- **Message size** (encrypted payload length, minus NIP-44 padding).
- **Timing** of event creation and retrieval.
- **Relay used** for delivery.
- **Proof-of-work difficulty** (if present, indicates sender capability).

**NOSTR Mail is better than PGP email for metadata protection, but worse than Signal's sealed sender.** Signal hides the recipient from the server (the server cannot tell who a sealed-sender message is for without the recipient's key). In NOSTR Mail, the relay always knows the recipient.

**Lesson**: The `p` tag is the biggest metadata leak. Future protocol versions should explore blind routing where the relay can deliver events without learning the recipient's pubkey (e.g., using blind tokens or PIR techniques).

---

## 6. Signal's Sealed Sender: Metadata Analysis (Lund, 2018; Tyagi et al., 2019)

### Original Research
Signal introduced "sealed sender" to hide the sender's identity from Signal's servers. Subsequent analysis revealed:
- **Delivery receipts** could be correlated with messages to identify senders.
- **Timing analysis** of sealed-sender messages could narrow the sender set.
- **Abuse reporting** was harder because the server could not attribute messages to senders.
- **Tyagi et al. (2019)** proposed improvements but noted fundamental limits: any system where the server routes messages leaks *some* metadata.

### Why It Worked (Partially)
- Signal's sealed sender hides the sender from the server but the server still knows the recipient (it must deliver the message).
- Delivery receipts and read receipts create bidirectional traffic that can be correlated.
- The server processes messages synchronously, so timing correlation is possible.

### Relevance to NOSTR Mail
**NOSTR Mail's Gift Wrap is architecturally similar to Signal's sealed sender:**
- Sender hidden behind ephemeral key (cf. Signal's sealed sender certificate).
- Recipient visible to the relay (cf. Signal server knowing the recipient).
- Bidirectional communication creates correlatable patterns.

**NOSTR Mail has additional challenges Signal does not:**
- **No centralized abuse reporting**: Signal can revoke sealed-sender privileges. NOSTR has no equivalent.
- **Multiple relays**: Events may be stored on multiple relays, increasing the number of parties who see metadata.
- **Persistence**: NOSTR events are stored (potentially forever). Signal messages are delivered and deleted from the server.
- **No rate limiting by identity**: Signal can rate-limit a sender even under sealed sender (via their account). NOSTR's ephemeral keys make rate limiting per-sender impossible.

**Lesson**: NOSTR Mail should study Signal's sealed sender deployment closely, particularly:
1. How abuse reporting works without sender identification.
2. How delivery receipts can be privacy-preserving.
3. How rate limiting works when the sender is hidden.

---

## 7. Email Header Injection

### Original Research
Header injection in email has been studied since the early 2000s:
- **CRLF injection**: Inserting `\r\n` in user-controlled input that ends up in email headers allows injection of arbitrary headers or even a second message body.
- **Klein (2006)**: Demonstrated header injection in PHP's `mail()` function.
- **OWASP**: Documents header injection as a persistent web application vulnerability.

### How It Works
```
Intended header:
  From: user@example.com

Injected input:
  user@example.com\r\nBCC: attacker@evil.com\r\n\r\nInjected body

Result:
  From: user@example.com
  BCC: attacker@evil.com

  Injected body
```

### Relevance to NOSTR Mail
**The SMTP bridge is the primary attack surface.** The bridge converts between NOSTR events and email. If the bridge:

1. **Inbound (email to NOSTR)**: Takes email headers and includes them in the NOSTR event content without sanitization, the NOSTR event could contain injected content.
2. **Outbound (NOSTR to email)**: Takes NOSTR event fields and places them in email headers without sanitization, the attacker can inject arbitrary email headers.

**Specific attack scenarios**:
- An attacker sends an email to the bridge with a `Subject` containing CRLF. The bridge places this in an email header on the outbound side, injecting a BCC to the attacker.
- An attacker creates a NOSTR event with content containing CRLF sequences. The bridge naively copies this to email headers, causing header injection.

**Lesson**: The bridge MUST strip or encode all CRLF sequences in any data flowing between NOSTR and email. All user-controlled data must be treated as untrusted in both directions.

---

## 8. DKIM Replay Attacks

### Original Research
- **Schemers (2020)**: Demonstrated that DKIM-signed emails can be replayed to arbitrary recipients because DKIM does not authenticate the envelope recipient.
- **Hu et al. (2023)**: Showed large-scale DKIM replay abuse for spam delivery, bypassing reputation systems.

### How It Works
1. An attacker sends a legitimate email to themselves via a reputable sender's service (e.g., a mailing list, a SaaS notification).
2. The email is DKIM-signed by the reputable sender's domain.
3. The attacker extracts the DKIM-signed email and replays it (via direct SMTP) to millions of recipients.
4. Receiving servers verify the DKIM signature, see it is valid from a reputable domain, and accept the email.
5. The attacker has now sent spam that passes DKIM validation for a domain they do not control.

### Relevance to NOSTR Mail
**The SMTP bridge signs outbound email with DKIM.** If the bridge's DKIM signing:
- Does not include sufficient headers in the signed set (e.g., omits `To`, `CC`, `Date`).
- Signs emails that can be triggered by arbitrary NOSTR users.

Then an attacker can:
1. Send a NOSTR Mail message that the bridge converts to a DKIM-signed email.
2. Intercept or receive that email.
3. Replay the DKIM-signed email to arbitrary recipients, with the bridge's domain reputation.

**Mitigation**: The bridge MUST:
- Sign all relevant headers in the DKIM signature (`From`, `To`, `Date`, `Subject`, `Message-ID`, `MIME-Version`, `Content-Type`).
- Include a short DKIM signature expiration (`x=` tag).
- Monitor for DKIM replay by tracking outbound email volume per message.
- Consider ARC (Authenticated Received Chain) for forwarded messages.

---

## 9. Matrix Protocol Vulnerabilities (2022)

### Original Research
- **Albrecht et al. (2022)**: "Practically-exploitable Cryptographic Vulnerabilities in Matrix" demonstrated multiple attacks on Matrix's Megolm encryption, including:
  - Impersonation through malicious key forwarding.
  - Breaking confidentiality via malicious device injection.
  - Protocol confusion attacks exploiting the interaction between Olm and Megolm.

### Relevance to NOSTR Mail
While NOSTR's encryption is simpler than Matrix's (no ratcheting, no group key management), several lessons apply:
- **Key verification is critical**: Matrix attacks exploited unverified key exchanges. NOSTR's static keys are simpler but NIP-05 domain verification is the main trust anchor --- if it is compromised, all bets are off.
- **Multi-device support introduces complexity**: If NOSTR Mail supports multiple devices, key synchronization between devices is an attack surface.
- **Protocol composition is dangerous**: Matrix's bugs arose from the interaction between multiple cryptographic sub-protocols. NOSTR Mail composes NIP-44 + NIP-59 + Cashu + L402 + NIP-13, and the interactions between these are the most likely source of vulnerabilities.

---

## 10. XMPP/Jabber Historical Vulnerabilities

### Key Lessons
- **Plaintext fallback**: Early XMPP implementations would fall back to plaintext if STARTTLS failed. NOSTR Mail must never have a plaintext fallback.
- **Server trust**: XMPP servers see all metadata and (historically) all content. NOSTR relays see less (encrypted content), but the metadata exposure is similar.
- **Federation complexity**: XMPP's federation model (server-to-server communication) introduced authentication and trust issues. NOSTR's relay model is simpler but the SMTP bridge reintroduces federation-like complexity.
- **XEP fragmentation**: XMPP's many optional extensions (XEPs) led to interoperability problems and security gaps. NOSTR's NIP system has similar risks --- a client that implements NIP-59 but not NIP-44 correctly is vulnerable.
