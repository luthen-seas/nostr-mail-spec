# Legal & Regulatory Patterns

## Structural Patterns for Minimizing Regulatory Risk

### Client as "Mere Software"

**Pattern:** The NOSTR Mail client is a tool, not a service. It is software that runs on the user's device, controlled entirely by the user. The client:
- Does not operate servers
- Does not hold user data (beyond local storage on the user's own device)
- Does not custody funds
- Does not make decisions about data processing — the user does

**Legal analogy:** The client is like a word processor or an email client (Thunderbird, Apple Mail). The software vendor is not a "service provider" — they distribute software. The user is the controller of their own data.

**Regulatory implications:**
- Not a "data controller" or "data processor" under GDPR (the user is the controller)
- Not a "money transmitter" under FinCEN (software does not accept or transmit funds)
- Not a "platform" under content moderation laws (no hosting, no curation)
- Not subject to CAN-SPAM as a "sender" (the user is the sender)

**Implementation requirements:**
- Client must not phone home (no telemetry without explicit consent)
- Client must not proxy relay connections through vendor servers
- Client must store private keys locally only (or delegate to user-controlled signer)
- Client must not have a server component that processes user data

### Relay as "Hosting Provider"

**Pattern:** The relay is a general-purpose event storage and forwarding service. It stores encrypted blobs (gift-wrapped events) and serves them to authorized recipients. The relay:
- Does not read message content (E2EE)
- Does not determine who communicates with whom (users choose relays independently)
- Stores events in encrypted form only
- Honors deletion requests (kind 5) per its stated policy

**Legal analogy:** The relay is like a hosting provider (AWS S3, a colo facility) or a postal service. It carries sealed envelopes without reading the contents.

**Regulatory implications:**
- **GDPR:** Processor, not controller. Must have a Data Processing Agreement (DPA) with users.
- **Section 230 (US):** Protected as an "interactive computer service" for third-party content.
- **E-Commerce Directive (EU):** "Hosting" safe harbor (Article 14) — not liable for stored content if unaware of illegality and acts expeditiously upon notice.
- **eDiscovery:** Cannot produce plaintext (does not have decryption keys).

**Implementation requirements:**
- Relay must not decrypt events (even if technically possible for non-gift-wrapped events)
- Relay must publish clear terms of service and privacy policy
- Relay must document data retention and deletion policies
- Relay must respond to lawful takedown requests (for metadata it can see)

### Mint as the Regulated Entity

**Pattern:** The Cashu mint is the entity that issues and redeems ecash tokens. It is the custodial intermediary in the payment flow. The mint:
- Accepts Lightning payments and issues Cashu tokens (money reception)
- Redeems Cashu tokens and sends Lightning payments (money transmission)
- Maintains a ledger of issued and spent tokens
- Bears the regulatory obligations of a money services business

**Legal analogy:** The mint is like a prepaid card issuer or a money order company.

**Regulatory implications:**
- **US:** Must register as an MSB with FinCEN; may need state money transmitter licenses
- **EU:** May need E-Money Institution authorization under EMD2 or registration under MiCA
- **AML/KYC:** Must implement anti-money laundering program and know-your-customer procedures (depending on jurisdiction and transaction volume)
- **Record-keeping:** Must maintain transaction records per BSA/AMLD requirements

**NOSTR Mail design principle:** The protocol cleanly separates the mint from the messaging system. The client interacts with the mint for token operations and with relays for message delivery. This separation ensures regulatory obligations fall on the appropriate entity.

### Bridge as the Trust Boundary

**Pattern:** The SMTP-NOSTR bridge processes plaintext email on one side and encrypted NOSTR events on the other. It is the most legally exposed component because it:
- Processes plaintext email content (personal data in the clear)
- Performs encryption/decryption at the boundary
- Handles email headers containing PII (email addresses, IP addresses, routing info)
- May cache or log data during processing

**Legal analogy:** The bridge is like a mail sorting facility or a translation service — it must handle the content to perform its function.

**Regulatory implications:**
- **GDPR:** Controller or joint controller (makes decisions about how email data is processed for conversion to NOSTR events)
- **CAN-SPAM / ePrivacy:** May be considered a "sender" if it transmits commercial messages
- **Data retention:** Must minimize retention of plaintext data; encrypt or delete after processing
- **Breach notification:** Holds the highest-risk data; must be prioritized for security

**Implementation requirements:**
- Process email in memory only; do not write plaintext to disk
- Log only metadata necessary for debugging; redact content from logs
- Implement TLS for all SMTP connections (inbound and outbound)
- Conduct regular security audits
- Maintain a DPIA specific to bridge operations

---

## GDPR Compliance Pattern

### Data Minimization

**Principle:** Collect and store only the minimum data necessary for the service.

**NOSTR Mail implementation:**
- Relay stores encrypted events only — cannot access content
- `p` tags (recipient pubkeys) are visible but pseudonymous
- Gift wrapping (NIP-59) hides sender pubkey from relay
- No IP address logging by default (relay operator choice)
- No user registration — pubkeys are self-generated, no PII required

**Metadata minimization hierarchy:**
1. **Best:** Full gift wrap — relay sees only recipient pubkey and timestamp (which can be randomized)
2. **Good:** NIP-44 encryption — relay sees sender pubkey, recipient pubkey, timestamp
3. **Minimum:** All message content encrypted — relay never sees plaintext

### Right to Erasure Implementation

**Protocol mechanism:** Kind 5 deletion events (NIP-09)

**Pattern:**
1. User publishes a kind 5 event referencing the event IDs to delete
2. Relay receives kind 5 event and removes referenced events from storage
3. Relay stops serving deleted events in response to queries
4. Relay may retain the kind 5 event itself as a deletion record

**Compliance strengthening:**
- Relay terms of service explicitly commit to honoring kind 5 deletions
- Relay implements automated deletion on kind 5 receipt (not manual review)
- Relay publishes SLA for deletion processing time (e.g., "within 24 hours")
- Relay provides deletion confirmation mechanism (query for deleted event returns nothing)
- Relay implements retention limits as a backstop (auto-delete events older than X days)

**Gap analysis:**
- Other relays that have a copy of the event may not honor the deletion
- Solution: user publishes kind 5 to all relays where the event was published
- Solution: relay-to-relay deletion propagation (not currently in any NIP but could be proposed)

### Data Portability Implementation

**NOSTR events are the ideal portable data format:**
- Standardized JSON structure (NIP-01)
- Cryptographically signed (self-authenticating, no need for platform endorsement)
- Self-contained (event includes all data needed to verify and interpret it)
- Relay-agnostic (can be imported to any compliant relay)

**Export pattern:**
```
1. User requests export from relay (or uses CLI tool like `nak`)
2. Relay returns all events authored by the user's pubkey
3. Events are in standard JSON format, one per line (JSONL) or JSON array
4. User can import events to any other relay
```

**Portability advantages over traditional email:**
- No vendor lock-in (unlike Gmail, Outlook, etc.)
- No format conversion needed (unlike MBOX, EML, PST)
- Cryptographic proof of authorship travels with the data
- No need for a "data portability" API — standard relay protocol serves this purpose

### Privacy by Design

**GDPR Article 25:** "Data protection by design and by default"

**NOSTR Mail satisfies this through:**
1. **Encryption by default:** All message content is encrypted (NIP-44); no plaintext mode
2. **Metadata hiding by default:** Gift wrapping (NIP-59) conceals sender from relays
3. **Pseudonymity by default:** Users are identified by cryptographic keys, not PII
4. **Minimal data collection:** Relay stores only what users publish; no tracking, profiling, or analytics by protocol design
5. **User control:** User holds their own keys, chooses their own relays, controls their own data
6. **No central authority:** No single entity has access to all data or all metadata

---

## Financial Regulation Avoidance Pattern

### Client Never Custodies Funds

**Pattern:** The NOSTR Mail client facilitates Cashu token attachment but never holds tokens in a custodial capacity.

**Flow:**
1. User's Cashu wallet (separate from NOSTR Mail client, or integrated but user-controlled) creates tokens
2. Client takes the token and includes it in the encrypted message payload
3. Client publishes the encrypted event to relays
4. At no point does the client operator hold, control, or have access to the tokens

**Analogy:** A word processor that lets you type "I owe you $100" is not a financial institution. A messaging client that lets you attach a Cashu token is not a money transmitter.

**Implementation requirements:**
- Client must not operate a Cashu mint
- Client must not hold Cashu tokens in an escrow or pool
- Client must not swap, convert, or exchange tokens
- Token operations must be user-initiated, not automated by the client vendor

### Relay L402 as "Pay for Service"

**Pattern:** Relay charges Lightning payment (via L402/HTTP 402) for message delivery. This is payment for a service, not money transmission.

**Legal analysis:**
- The relay provides a service: storing and delivering messages
- The user pays for that service: Lightning invoice
- This is a commercial transaction between service provider and customer
- Comparable to: a website paywall, a SaaS subscription, a vending machine

**Distinctions from money transmission:**
- Relay does not accept funds from one party to transmit to another party
- Relay does not hold funds on behalf of users
- Relay does not facilitate transfers between users
- Payment is for the relay's own service, not for value transfer

**Implementation requirements:**
- L402 invoice must be issued by the relay operator (not a third party)
- Payment must be for the relay's service specifically
- Relay must not act as a pass-through for payments between users

### Refundable Postage as Peer-to-Peer

**Pattern:** Sender attaches Cashu tokens as "postage" to prove message legitimacy. Recipient can claim tokens or refund them.

**Legal analysis:**
- This is a peer-to-peer token transfer embedded in a message
- No intermediary handles the tokens (relay sees only encrypted blob)
- Comparable to: putting cash in a letter (peer-to-peer, no intermediary)
- FinCEN P2P exemption: transfers between two individuals, not "as a business"

**Key requirement:** The protocol must not require any intermediary to facilitate the token transfer. The tokens travel directly from sender to recipient inside the encrypted message.

---

## Open Source Exemption Pattern

### EAR License Exception TSU

**Pattern:** Publish all protocol specifications and software as open source to qualify for the TSU (Technology and Software Unrestricted) exception to US encryption export controls.

**Requirements:**
1. Source code must be publicly available (GitHub, GitLab, etc.)
2. Notification must be sent to BIS and NSA:
   - Email to: `crypt@bis.doc.gov` and `enc@nsa.gov`
   - Include: URL of source code, brief description, point of contact
3. After notification, code can be freely distributed worldwide (except to embargoed countries/entities)

**What must be notified:**
- Any software that implements encryption with key lengths above Category 5 thresholds
- NOSTR Mail: NIP-44 (ChaCha20-Poly1305, 256-bit key), secp256k1 (256-bit ECC)
- Dependencies: libsecp256k1, @noble/ciphers, or equivalent libraries (may already have their own TSU notifications)

### Standard Algorithms Only

**Pattern:** Use only well-known, publicly documented cryptographic algorithms. Do not invent custom cryptography.

**NOSTR Mail algorithms:**
- **Key agreement:** secp256k1 ECDH (same curve as Bitcoin, widely implemented)
- **Symmetric encryption:** ChaCha20-Poly1305 (IETF RFC 8439)
- **Key derivation:** HKDF-SHA256 (RFC 5869)
- **Hashing:** SHA-256 (FIPS 180-4)
- **Message signing:** Schnorr signatures over secp256k1 (BIP-340)

**Why this matters for regulation:**
- No proprietary algorithms means no claims of novel cryptographic capabilities
- Standard algorithms are already analyzed and approved by national security agencies
- Export control review is straightforward when using well-known primitives
- Reduces risk of being classified as a "cryptographic item" requiring individual export licenses

### Publication and Transparency

**Pattern:** Maximum transparency minimizes regulatory risk.

**Checklist:**
- [ ] All protocol specifications published as public NIPs
- [ ] All reference implementations published as open-source code
- [ ] All cryptographic choices documented with rationale
- [ ] Security audits published publicly
- [ ] TSU notification filed with BIS/NSA
- [ ] No proprietary extensions or secret protocol features
- [ ] Bug bounty program for security researchers
