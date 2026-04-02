# Adversarial Security References

## Overview

Curated bibliography of attack research, security analyses, and defensive guidelines relevant to NOSTR Mail's threat model. Organized by topic area. Each entry includes the citation, a brief summary, and the specific NOSTR Mail component it informs.

---

## 1. Attacks on Messaging Protocols

### Signal Protocol

- **Cohn-Gordon, A. et al. (2017).** "A Formal Security Analysis of the Signal Messaging Protocol." *IEEE European Symposium on Security and Privacy (EuroS&P).*
  - Formal verification of Signal's double ratchet. Establishes the properties (forward secrecy, future secrecy) that NOSTR Mail explicitly lacks.
  - **Relevance**: Baseline for what NOSTR Mail gives up by using static ECDH instead of ratcheting.

- **Lund, J. (2018).** "Technology Preview: Sealed Sender for Signal." *Signal Blog.*
  - Description of Signal's sealed sender feature: hides the sender's identity from Signal's servers using a sender certificate encrypted to the recipient.
  - **Relevance**: Direct architectural analogue to NIP-59 Gift Wrap. Study the limitations Signal discovered.

- **Tyagi, N. et al. (2019).** "Metadata-private Communication for the Paranoid: Sealed Sender Revisited." *Cryptology ePrint Archive, 2019/1376.*
  - Analysis of metadata leakage in sealed sender. Proposes improvements using anonymous credentials.
  - **Relevance**: Identifies the same class of metadata leakage that affects Gift Wrap (recipient visible, timing correlation possible).

### Matrix / Megolm

- **Albrecht, M. et al. (2022).** "Practically-exploitable Cryptographic Vulnerabilities in Matrix." *IEEE S&P 2022.*
  - Demonstrates impersonation, confidentiality breaks, and protocol confusion in Matrix's encryption.
  - **Relevance**: Warns against the dangers of composing multiple cryptographic sub-protocols (NOSTR Mail composes NIP-44 + NIP-59 + Cashu + L402).

### XMPP / OTR

- **Borisov, N., Goldberg, I., and Brewer, E. (2004).** "Off-the-Record Communication, or, Why Not To Use PGP." *WPES '04.*
  - Introduces deniability and forward secrecy for messaging. NIP-59 rumors provide deniability but not forward secrecy.
  - **Relevance**: The deniability property of unsigned rumors mirrors OTR's design goal.

---

## 2. Traffic Analysis

### Statistical Disclosure

- **Danezis, G. (2003).** "Statistical Disclosure Attacks: Traffic Confirmation in Open Environments." *Security and Privacy in the Age of Uncertainty (SEC '03).*
  - Shows that a passive adversary observing a mix network over time can identify communication partners statistically.
  - **Relevance**: NOSTR has no mix network, making statistical disclosure trivially achievable for relay operators.

- **Danezis, G. and Serjantov, A. (2004).** "Statistical Disclosure or Intersection Attacks on Anonymity Systems." *IH '04.*
  - Extends the statistical disclosure attack and compares with intersection attacks.
  - **Relevance**: Directly applicable to NOSTR relay traffic analysis.

### Tor Traffic Analysis

- **Murdoch, S. and Danezis, G. (2005).** "Low-cost Traffic Analysis of Tor." *IEEE S&P 2005.*
  - Identifies Tor relays on a circuit via traffic analysis. Cost is minimal.
  - **Relevance**: If NOSTR ever implements relay-based mixing, this research shows the difficulty of doing so securely.

- **Johnson, A. et al. (2013).** "Users Get Routed: Traffic Correlation on Tor by Realistic Adversaries." *ACM CCS '13.*
  - Demonstrates that a realistic adversary (e.g., a few ASes) can correlate Tor traffic within months.
  - **Relevance**: Establishes the baseline difficulty of traffic analysis defense. NOSTR Mail's current design does not attempt to resist traffic analysis.

- **Sun, Y. et al. (2015).** "RAPTOR: Routing Attacks on Privacy in Tor." *USENIX Security '15.*
  - BGP-level attacks to deanonymize Tor users.
  - **Relevance**: Network-level adversaries are relevant when NOSTR clients connect to relays without VPN/Tor.

### Website Fingerprinting

- **Wang, T. et al. (2014).** "Effective Attacks and Provable Defenses for Website Fingerprinting." *USENIX Security '14.*
  - Classifies encrypted web traffic by pattern. Relevant to identifying NOSTR activity types from encrypted WebSocket traffic.
  - **Relevance**: An ISP-level adversary can distinguish NOSTR Mail traffic from regular NOSTR traffic by message size and frequency patterns.

---

## 3. Email Encryption Attacks

### Efail

- **Poddebniak, D. et al. (2018).** "Efail: Breaking S/MIME and OpenPGP Email Encryption using Exfiltration Channels." *USENIX Security '18.*
  - Two attack classes: direct exfiltration via HTML rendering and CBC/CFB gadget attacks on malleable ciphertext.
  - **Relevance**: NIP-44's authenticated encryption prevents the gadget attack. The exfiltration attack is relevant to content rendering in NOSTR clients, especially with Blossom attachment URLs.

### Email Metadata

- **Mayer, J. (2016).** "MetaPhone: The Sensitivity of Telephone Metadata." *Stanford Law Review.*
  - Demonstrates that communication metadata alone reveals intimate details of people's lives.
  - **Relevance**: Even with encrypted content, NOSTR Mail metadata (recipient pubkeys, timing, relay usage) is highly sensitive.

---

## 4. Email Header Injection and DKIM

### Header Injection

- **Klein, A. (2006).** "HTTP Response Splitting, Web Cache Poisoning Attacks, and Related Topics." (Covers analogous injection in email context.)
  - Classic reference on injection attacks via unsanitized headers.
  - **Relevance**: Direct threat to the SMTP bridge component.

- **OWASP. "Testing for HTTP Incoming Requests (OWASP-DV-015)" and "Email Injection."**
  - Comprehensive guidance on preventing header injection.
  - **Relevance**: The SMTP bridge must implement all OWASP-recommended sanitization.

### DKIM Replay

- **Hu, D. et al. (2023).** "Revisiting DKIM Replay Attacks." *IMC '23.*
  - Large-scale study of DKIM replay attacks in the wild. Shows how legitimate DKIM signatures are repurposed for spam.
  - **Relevance**: The SMTP bridge's DKIM signing must include protective measures (header coverage, signature expiration).

- **Schemers, R. (2020).** "DKIM Replay Problem Statement." *IETF Draft.*
  - Formalizes the DKIM replay problem.
  - **Relevance**: Direct input for the bridge's DKIM implementation.

### SPF/DMARC

- **Kitterman, S. (2014).** RFC 7208: "Sender Policy Framework (SPF) for Authorizing Use of Domains in Email."
  - SPF specification.
  - **Relevance**: The bridge must maintain accurate SPF records.

- **Kucherawy, M. and Zwicky, E. (2015).** RFC 7489: "Domain-based Message Authentication, Reporting, and Conformance (DMARC)."
  - DMARC specification.
  - **Relevance**: The bridge should implement DMARC with `p=reject` for its domain.

---

## 5. Ecash and Payment Security

### Cashu

- **Cashu Protocol Documentation.** https://github.com/cashubtc/nuts
  - Official Cashu NUT specifications. NUT-00 through NUT-17.
  - **Relevance**: Defines the token format, mint API, and P2PK locking (NUT-11) that NOSTR Mail should use.

- **Cashu NUT-11: Pay-to-Public-Key (P2PK).**
  - Allows locking ecash tokens to a specific public key so only the key holder can redeem.
  - **Relevance**: Critical mitigation for Cashu double-spend in NOSTR Mail. Tokens MUST be P2PK-locked to the recipient.

- **Chaum, D. (1983).** "Blind Signatures for Untraceable Payments." *Advances in Cryptology (Crypto '82).*
  - Foundational ecash paper. Describes blind signatures and the double-spend detection mechanism.
  - **Relevance**: Theoretical foundation for understanding Cashu's security model and limitations.

### L402 / Macaroons

- **Birgisson, A. et al. (2014).** "Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud." *NDSS '14.*
  - Introduces macaroons as bearer credentials with attenuation via caveats.
  - **Relevance**: L402 uses macaroons. The security of L402 relay gating depends on proper caveat construction.

- **Lightning Labs. "L402 Protocol Specification."**
  - Defines the combination of macaroon + Lightning payment for API access.
  - **Relevance**: Direct input for relay payment gating. Key concern: preimage reuse and cross-relay replay.

### Lightning Security

- **Roasbeef (Osuntokun, O.) et al. (2016-present).** Lightning Network Daemon security considerations.
  - Various discussions of Lightning channel security, routing privacy, and payment probing.
  - **Relevance**: Lightning underlies both zaps (NIP-57) and L402 relay payments.

- **Perez-Sola, C. et al. (2019).** "Lockdown: Balance Sniffing and Probing Attacks on Lightning Network." *Financial Cryptography '19.*
  - Demonstrates balance probing attacks on Lightning channels.
  - **Relevance**: If the SMTP bridge or relay uses Lightning for payments, its channel balances may be probed.

---

## 6. NOSTR-Specific Security Research

### NIP-44 Audit

- **Cure53 (2023).** "NIP-44 Encryption Audit Report."
  - Professional security audit of NIP-44 version 2 cryptographic design.
  - **Relevance**: Establishes that NIP-44 itself is sound. Vulnerabilities are more likely in composition and implementation.

### NOSTR Protocol Analysis

- **fiatjaf (2023-present).** Various discussions on NOSTR protocol security in GitHub issues and on NOSTR itself.
  - Ongoing protocol design discussions including NIP-59 threat model, relay trust, and anti-spam mechanisms.
  - **Relevance**: Primary source for understanding protocol designer intent and known limitations.

- **NIP-59 Discussion Threads.** https://github.com/nostr-protocol/nips/pull/716 and related issues.
  - Community discussion of Gift Wrap privacy properties, threat models, and limitations.
  - **Relevance**: Documents the acknowledged metadata leakage and design tradeoffs.

### NOSTR Relay Security

- **hoytech/strfry documentation.** Rate limiting, PoW requirements, and abuse prevention.
  - Practical relay operator perspective on anti-spam.
  - **Relevance**: Relay-side mitigations for kind 1059 flooding and subscription abuse.

---

## 7. Cryptographic Foundations

### ECDH and secp256k1

- **Bernstein, D.J. and Lange, T. (2014).** "SafeCurves: Choosing Safe Curves for Elliptic-Curve Cryptography." https://safecurves.cr.yp.to/
  - Analysis of elliptic curve security properties. Notes on secp256k1's resistance to various attack classes.
  - **Relevance**: secp256k1 is the curve used in NIP-44 ECDH. Understanding its properties and limitations.

### ChaCha20

- **Bernstein, D.J. (2008).** "ChaCha, a Variant of Salsa20." *SASC '08.*
  - Defines ChaCha20, the stream cipher used in NIP-44.
  - **Relevance**: Constant-time implementation properties make ChaCha20 resistant to cache timing attacks.

### HKDF

- **Krawczyk, H. (2010).** RFC 5869: "HMAC-based Extract-and-Expand Key Derivation Function (HKDF)."
  - Defines HKDF, used in NIP-44 for conversation key and message key derivation.
  - **Relevance**: Correct usage of HKDF (proper salt, proper info fields) is critical.

### Post-Quantum Threats

- **NIST (2024).** "Post-Quantum Cryptography Standardization."
  - ML-KEM (CRYSTALS-Kyber), ML-DSA (CRYSTALS-Dilithium) standardized.
  - **Relevance**: Future NIP-44 versions should consider PQ-hybrid key exchange for harvest-now-decrypt-later defense.

---

## 8. OWASP and Web Security Guidelines

### Relevant to SMTP Bridge

- **OWASP. "Email Injection Prevention Cheat Sheet."**
  - Comprehensive guide to preventing email header injection.
  - **Relevance**: Must-implement for the SMTP bridge.

- **OWASP. "Input Validation Cheat Sheet."**
  - General input validation guidance.
  - **Relevance**: All bridge inputs (from email and from NOSTR) must be validated.

- **OWASP. "Cryptographic Storage Cheat Sheet."**
  - Guidelines for storing cryptographic keys.
  - **Relevance**: The bridge handles private keys for DKIM signing and possibly NOSTR signing.

### Relevant to NOSTR Clients

- **OWASP. "Content Security Policy (CSP)."**
  - Preventing content injection and exfiltration in web-based clients.
  - **Relevance**: Web-based NOSTR Mail clients must implement strict CSP to prevent Efail-style exfiltration.

- **OWASP. "Cross-Site Scripting (XSS) Prevention Cheat Sheet."**
  - XSS prevention.
  - **Relevance**: Decrypted mail content rendered in web clients is an XSS vector.

---

## 9. Regulatory and Compliance References

- **EU General Data Protection Regulation (GDPR).** Regulation (EU) 2016/679.
  - Right to erasure conflicts with immutable relay storage. Encrypted events may still constitute personal data.
  - **Relevance**: Relay operators and bridge operators may have GDPR obligations.

- **EU Digital Markets Act (DMA) and interoperability mandates.**
  - May require messaging interoperability, affecting bridge design.
  - **Relevance**: The SMTP bridge is a form of interoperability that may be mandated.

- **NIST SP 800-63B: Digital Identity Guidelines.**
  - Authentication and identity verification standards.
  - **Relevance**: NIP-05 identity verification and NIP-42 relay authentication should be evaluated against NIST guidelines.

---

## 10. Additional Resources

### Tools for Security Analysis

- **nak (Nostr Army Knife)**: CLI tool for creating, inspecting, and testing NOSTR events. Essential for manual security testing.
- **Wireshark with WebSocket dissector**: For analyzing relay traffic patterns.
- **mitmproxy**: For intercepting and modifying relay communications during testing.
- **Cashu test mint**: For testing token double-spend scenarios without real funds.

### NOSTR Security Community

- **nostr:npub1...** (security-focused NOSTR accounts): Various security researchers active on NOSTR who discuss protocol vulnerabilities.
- **GitHub Issues on nostr-protocol/nips**: Ongoing security discussions for each NIP.
- **NOSTR-dev mailing list / Telegram groups**: Real-time protocol security discussions.

### Ongoing Research Areas

1. **Blind relay routing**: PIR (Private Information Retrieval) or blind token schemes to hide the recipient from relays.
2. **Post-quantum NIP-44**: Hybrid key exchange adding ML-KEM alongside secp256k1 ECDH.
3. **Forward secrecy for NOSTR**: Double ratchet or similar mechanism within the Gift Wrap framework.
4. **Formal verification of NIP-44 + NIP-59 composition**: No published formal analysis of the composed protocol exists.
5. **Decoy traffic generation**: Cover traffic schemes to resist traffic analysis at the relay level.
