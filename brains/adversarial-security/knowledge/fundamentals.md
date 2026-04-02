# Adversarial Security Fundamentals: Attack Taxonomy for NOSTR Mail

## Overview

This document catalogs the full attack surface of NOSTR-based encrypted mail systems. Each category describes the attack class, how it applies to NOSTR Mail specifically, and what attacker capabilities are assumed.

---

## 1. Traffic Analysis Techniques

### 1.1 Timing Correlation Attacks

**Description**: An adversary observing multiple relays correlates the time a gift-wrapped event is submitted by a sender with the time it is delivered to a recipient. Even though NIP-59 randomizes `created_at` fields, the actual WebSocket delivery timestamps are visible to relay operators.

**NOSTR Mail specifics**:
- A relay operator sees when a kind 1059 event arrives and when the `p`-tagged recipient fetches it.
- If Alice always sends mail at 9:00 AM UTC and Bob always checks at 9:05 AM, the correlation is trivial even with randomized event timestamps.
- Multi-relay correlation: A global passive adversary monitoring several relays can correlate submission/retrieval patterns across the network.
- Jitter in `created_at` does not help if the adversary observes WebSocket connection times.

**Attacker model**: Passive adversary with visibility into relay traffic (relay operator, ISP, or network-level observer).

### 1.2 Volume Analysis

**Description**: Even without reading content, an adversary counts the number of kind 1059 events flowing between relays or to specific recipients. Volume spikes correlate with real-world events (e.g., a controversial news event triggers more mail).

**NOSTR Mail specifics**:
- A relay operator can count how many kind 1059 events target a given `p` tag per day.
- Multi-recipient messages produce multiple gift wraps; a volume spike of N wraps at the same time suggests a broadcast to N recipients.
- Mail attachments via Blossom create correlated upload/download traffic that can be linked to mail events.

### 1.3 Intersection Attacks

**Description**: Over time, an adversary observes which parties are online simultaneously during each communication event. The intersection of online sets across multiple observations converges on the true communicating pair.

**NOSTR Mail specifics**:
- NOSTR clients often maintain persistent WebSocket connections. An adversary observing relay connection logs can build session overlap matrices.
- If Alice only sends mail when connected to relay R1, and Bob only receives from R1, the intersection of their sessions narrows rapidly.
- Unlike real-time chat, mail is asynchronous --- this partially mitigates intersection attacks since sender and recipient need not be online simultaneously. However, eager clients that poll frequently still leak timing.

### 1.4 Statistical Disclosure Attacks

**Description**: Danezis (2003) showed that even with mix networks, a long-term passive adversary can statistically determine communication partners by analyzing message patterns over many observations.

**NOSTR Mail specifics**:
- NOSTR has no mix network. Events go directly from sender to relay to recipient.
- Statistical disclosure is therefore trivially possible for any adversary who can observe relay traffic over time.
- The `p` tag on gift wraps directly reveals the recipient, making the "disclosure" immediate for recipient identification. Only sender identity benefits from the ephemeral key layer.

---

## 2. Metadata Attacks on Encrypted Messaging

### 2.1 Sender Identification Despite Ephemeral Keys

**Description**: Gift wraps use ephemeral keys, but several side channels can reveal the true sender:

- **Relay submission patterns**: If Alice always submits gift wraps to the same relay, the relay operator knows Alice's IP and can link her to all gift wraps submitted from that IP/connection.
- **Timing fingerprinting**: The time between a user going online and a gift wrap appearing is a fingerprint.
- **Multi-recipient correlation**: When Alice sends the same message to Bob and Carol, two gift wraps appear at roughly the same time. If the adversary knows one recipient, they can infer the sender from the other wrap's timing.
- **Content length correlation**: NIP-44 padding reduces but does not eliminate length leakage. Power-of-2 padding means messages in the same bucket are indistinguishable, but bucket transitions reveal approximate length.

### 2.2 Conversation Linking

**Description**: Even if individual messages hide the sender, an adversary can link messages into conversations:

- **Reply chains**: If the rumor inside the gift wrap contains `e` tags referencing previous message IDs, and the adversary can decrypt any message in the chain, the entire conversation is linked.
- **Temporal clustering**: Messages in a conversation tend to cluster in time.
- **Size patterns**: A question-and-answer pattern produces predictable size alternation (short question, long answer).

### 2.3 Social Graph Inference

**Description**: Even without decrypting any content, the pattern of `p` tags on kind 1059 events reveals who receives mail. Over time, the set of recipients forms a social graph. This graph itself is sensitive metadata.

---

## 3. Side-Channel Attacks

### 3.1 Timing Attacks on Encryption/Decryption

**Description**: Variations in encryption or decryption time can leak information about the key or plaintext.

**NOSTR Mail specifics**:
- NIP-44 uses ChaCha20 (constant-time in most implementations) and HMAC-SHA256 (also typically constant-time). The primary risk is in the ECDH step on secp256k1.
- Some secp256k1 implementations have variable-time scalar multiplication. If a client decrypts a gift wrap and the decryption time is observable (e.g., via a timing oracle on a web API), the private key could be partially recovered.
- Padding verification: The step that checks all padding bytes are zero could be variable-time if implemented naively (early return on first non-zero byte).

### 3.2 Cache Timing Attacks

**Description**: CPU cache access patterns during cryptographic operations can leak key material to co-located attackers.

**NOSTR Mail specifics**:
- Relevant when NOSTR Mail clients run in shared environments (cloud VMs, shared hosting for bridges).
- ChaCha20 is inherently cache-timing resistant (no table lookups). HMAC-SHA256 is also resistant. The main risk is in secp256k1 ECDH if using a non-hardened implementation.
- SMTP bridges running on shared infrastructure are the highest-risk component.

### 3.3 Power Analysis

**Description**: Electromagnetic emissions or power consumption during cryptographic operations can reveal key material.

**NOSTR Mail specifics**:
- Primarily relevant for mobile clients (phones) and hardware signers.
- NIP-46 remote signing mitigates this by moving key operations to a dedicated signer, but the signer itself must be hardened.
- Unlikely to be a practical attack vector for most NOSTR Mail users, but relevant for high-value targets.

---

## 4. Economic Attacks

### 4.1 Cashu Token Double-Spend

**Description**: The sender attaches a Cashu ecash token as "postage" inside the encrypted mail content. Before the recipient redeems the token at the mint, the sender (or a colluding party) redeems it first.

**Attack window**: The time between sending the mail and the recipient's client redeeming the token. For asynchronous mail, this window can be hours or days.

**NOSTR Mail specifics**:
- The token is inside the NIP-44 encrypted content, so only the recipient can see it. But the *sender* created it and knows its secret.
- A malicious sender can create the token, embed it, send the mail, then immediately redeem the token at the mint.
- The recipient's client discovers an invalid/spent token and must decide how to handle the message (reject? flag? accept anyway?).

### 4.2 Front-Running

**Description**: An adversary who can observe unconfirmed transactions attempts to front-run economic actions.

**NOSTR Mail specifics**:
- If the Cashu mint operator is adversarial, they could see a redemption request, delay it, and allow a double-spend.
- If L402 invoices are reused or predictable, an adversary could pre-pay to obtain the preimage and replay it.

### 4.3 Griefing Attacks

**Description**: An attacker imposes costs on victims without direct economic benefit.

**NOSTR Mail specifics**:
- **Postage griefing**: Send mail with tokens from an invalid or offline mint. The recipient's client wastes time trying to verify/redeem.
- **PoW griefing**: Submit gift wraps with just enough PoW to pass relay thresholds but containing garbage content, wasting recipient processing time.
- **Refund griefing**: If the protocol supports refundable postage (sender can reclaim if recipient does not read), the sender floods mail and reclaims all tokens, paying only transaction costs.

### 4.4 Sybil Attacks on Payment Systems

**Description**: An attacker creates many identities to exploit economic mechanisms.

**NOSTR Mail specifics**:
- Creating NOSTR keypairs is free. An attacker can generate millions of identities.
- If postage is per-sender (first message from a new sender requires more postage), the attacker rotates identities to always appear as a new sender.
- If reputation systems track sender behavior, sybil identities dilute reputation signals.

---

## 5. Replay Attacks

### 5.1 Event Replay

**Description**: A previously valid gift-wrapped event is re-submitted to a relay.

**NOSTR Mail specifics**:
- Each NOSTR event has a unique `id` (SHA-256 hash). Relays can deduplicate by `id`.
- However, if the recipient's client does not track seen event IDs, a re-delivered event could appear as a new message.
- Replayed events are still valid (signature checks pass), so relays may accept them if their deduplication window has expired.

### 5.2 Token Replay

**Description**: A Cashu token, once spent, is re-attached to a different message.

**NOSTR Mail specifics**:
- The mint tracks spent tokens, so a properly functioning mint prevents this.
- Risk: If the token is bound to a specific message but the binding is not verified, an attacker could extract a valid token from one message and present it in another context.
- If the protocol does not cryptographically bind the token to the message content, token replay is possible across messages.

### 5.3 Payment Proof Replay (L402)

**Description**: An L402 proof consists of a macaroon and a payment preimage. If the preimage is not bound to a specific action, it can be reused.

**NOSTR Mail specifics**:
- If the relay uses L402 for access gating, an attacker who obtains a valid preimage can replay it.
- Preimages are typically revealed on payment and are 32 bytes. If the relay does not track used preimages, the same proof grants unlimited access.
- **Cross-relay replay**: If multiple relays use the same LNURL provider, a preimage obtained from one relay might work at another.

---

## 6. Relay Abuse

### 6.1 Selective Delivery

**Description**: A malicious relay selectively drops or delays certain events.

**NOSTR Mail specifics**:
- The relay sees the `p` tag and can selectively drop mail to specific recipients.
- The relay cannot read the content but can perform censorship based on recipient pubkey, sender IP, or event timing.
- For NOSTR Mail, this is equivalent to a mail server silently dropping email --- the sender gets no bounce notification.

### 6.2 Event Injection

**Description**: A relay injects fabricated events into the stream.

**NOSTR Mail specifics**:
- The relay cannot forge valid gift wraps (it does not know the recipient's private key to create a decryptable event).
- However, a relay CAN inject garbage kind 1059 events with valid `p` tags. The recipient's client will attempt decryption, fail, and must handle the error gracefully.
- Injection of many undecryptable events is a DoS vector (waste recipient CPU on failed decryption attempts).

### 6.3 Censorship

**Description**: A relay refuses to store or forward certain events.

**NOSTR Mail specifics**:
- If a user's kind 10050 relay list points to a small number of relays, censorship by those relays effectively silences the user's mailbox.
- Unlike regular NOSTR posts which propagate widely, mail is targeted to specific relays. Censoring the mail relays is censoring the mail.

### 6.4 Surveillance

**Description**: A relay logs all metadata it can observe.

**NOSTR Mail specifics**:
- The relay sees: recipient pubkey (from `p` tag), submission IP, submission time, event size, NIP-42 auth identity (if required), and proof-of-work difficulty.
- Over time, this metadata forms a complete picture of who receives mail, how often, from which IP addresses, and at what times.

---

## 7. SMTP Bridge Attacks

### 7.1 Header Injection

**Description**: An attacker crafts an email with malicious headers that, when processed by the bridge, inject additional headers or alter routing in the NOSTR event.

**Attack vector**: CRLF sequences (`\r\n`) in email headers that are not sanitized by the bridge.

**Impact**: Could inject fake sender information, alter routing tags, or add malicious content to the NOSTR event.

### 7.2 MIME Confusion

**Description**: Exploiting ambiguity in MIME parsing between the bridge and downstream clients.

**NOSTR Mail specifics**:
- The bridge must convert MIME-structured email into NOSTR event content. If the bridge and the NOSTR client parse MIME differently, an attacker can craft a message that appears benign to one parser but malicious to another.
- Multipart MIME with conflicting Content-Type headers is a classic confusion vector.

### 7.3 SPF/DKIM/DMARC Bypass

**Description**: The bridge sends outbound email on behalf of NOSTR users. If SPF/DKIM is misconfigured, attackers can spoof email appearing to come from the bridge's domain.

**NOSTR Mail specifics**:
- The bridge must sign outbound email with DKIM using its own domain key. If the DKIM signing is weak (e.g., short key, weak algorithm), the signature can be forged.
- SPF records must be maintained for the bridge's sending IPs. If the bridge scales to multiple IPs, SPF records must be updated accordingly.
- If the bridge does not implement DMARC, receiving mail servers may accept spoofed email.

### 7.4 Spoofing Through Bridge

**Description**: An attacker on the NOSTR side sends a gift-wrapped message with a forged `From` address, and the bridge faithfully converts it to an email with that forged address.

**Impact**: The bridge becomes a spoof relay, sending email that appears to come from anyone.

**Mitigation requirement**: The bridge MUST verify that the NOSTR sender controls the email address they claim, or MUST rewrite the `From` header to a bridge-controlled address.

---

## 8. Identity Attacks

### 8.1 NIP-05 Domain Hijacking

**Description**: An attacker gains control of the DNS or web server for a domain used in NIP-05 identifiers.

**NOSTR Mail specifics**:
- NIP-05 identifiers (e.g., `alice@example.com`) are resolved via `https://example.com/.well-known/nostr.json`. If the attacker controls the domain, they can point `alice` to their own pubkey.
- For NOSTR Mail, this means mail addressed to `alice@example.com` would be routed to the attacker's pubkey and their relay list.
- This is the NOSTR equivalent of email account takeover via DNS hijacking.

### 8.2 DNS Poisoning

**Description**: An attacker poisons DNS caches to redirect NIP-05 lookups.

**NOSTR Mail specifics**:
- NIP-05 lookups use HTTPS, so DNS poisoning alone is insufficient (the attacker also needs a valid TLS certificate for the domain).
- However, if the client does not properly validate TLS certificates, DNS poisoning could redirect NIP-05 resolution.
- DNSSEC adoption is low; most domains are vulnerable to cache poisoning if HTTPS validation is bypassed.

### 8.3 Key Confusion

**Description**: An attacker generates a keypair whose public key is visually similar to a target's public key (prefix collision).

**NOSTR Mail specifics**:
- NOSTR public keys are 32-byte hex strings. Users rarely compare full keys; they rely on NIP-05 identifiers or the first/last few characters.
- An attacker can grind keys until they find one matching the first N characters of the target. At 4 bits per hex character, matching 8 hex chars (32 bits) requires ~2^32 operations --- feasible on consumer hardware.
- If a client displays truncated pubkeys, a key-confused attacker can impersonate the target.

---

## 9. State Attacks

### 9.1 Mailbox State Corruption

**Description**: Kind 10099 replaceable events store mailbox state (read/unread status, folder assignments). An attacker who can publish a kind 10099 event with the victim's pubkey can corrupt this state.

**NOSTR Mail specifics**:
- Only the key holder can sign a kind 10099 event for their pubkey. So this attack requires key compromise.
- However, a replay attack is possible: an adversary stores an old kind 10099 event and re-publishes it. If the relay accepts it (e.g., its `created_at` is manipulated to appear newer), the mailbox state rolls back.
- Replaceable events use `created_at` for conflict resolution (latest wins). If the relay's clock is wrong or the adversary can manipulate timestamps, state corruption is possible.

### 9.2 Draft Exfiltration

**Description**: If drafts are stored as encrypted events on relays, a compromised relay could store and later leak draft content if the encryption key is compromised.

**NOSTR Mail specifics**:
- Drafts encrypted with NIP-44 to the user's own pubkey are only decryptable by the user. The relay sees only ciphertext.
- However, if drafts use a predictable structure (e.g., always the same kind, always self-addressed), a relay operator knows which events are drafts even without decrypting them.
- If the user's private key is later compromised, all stored drafts become readable.

### 9.3 Folder Manipulation

**Description**: If folder metadata is stored in replaceable events, an attacker with key access can reorganize or delete folder structures.

**NOSTR Mail specifics**:
- Requires key compromise (same pubkey signing requirement).
- A more subtle attack: if the folder structure is in a replaceable event and the adversary replays an old version, recently created folders disappear.

---

## 10. Denial of Service

### 10.1 Relay Flooding

**Description**: An attacker submits massive numbers of kind 1059 events to a relay.

**NOSTR Mail specifics**:
- Each gift wrap is signed by an ephemeral key. Rate limiting by pubkey is ineffective because each event has a unique pubkey.
- NIP-13 proof-of-work raises the cost, but an attacker with GPUs or ASICs can produce high-difficulty PoW cheaply.
- The relay must store opaque encrypted events it cannot verify for usefulness. Storage exhaustion is a real risk.

### 10.2 Storage Exhaustion

**Description**: An attacker fills relay storage with valid but unwanted events.

**NOSTR Mail specifics**:
- Kind 1059 events cannot be deduplicated by content (content is encrypted). The relay can only deduplicate by event `id`.
- An attacker generates unique events rapidly (different ephemeral key = different content = different ID).
- Cashu postage mitigates this by imposing a per-message cost, but the cost must be high enough to deter flooding while low enough for legitimate users.

### 10.3 Subscription Bombing

**Description**: An attacker opens many subscriptions to a relay, requesting all kind 1059 events for many pubkeys.

**NOSTR Mail specifics**:
- NIP-42 AUTH limits access to kind 1059 events to the `p`-tagged recipient. But the attacker can create many keypairs and subscribe for all of them.
- Each subscription consumes relay resources (memory, CPU for filtering).

---

## 11. Social Engineering Enabled by Protocol Design

### 11.1 Phishing via Bridged Email

**Description**: An attacker sends a phishing email from the traditional email system. The SMTP bridge converts it into a NOSTR Mail message. The recipient sees it in their NOSTR client, which may not have the anti-phishing protections of traditional email clients (no "external sender" warnings, no phishing URL detection).

**Impact**: NOSTR clients are newer and less hardened against phishing than mature email clients.

### 11.2 Impersonation via Similar NIP-05

**Description**: An attacker registers a NIP-05 identifier similar to the target's (e.g., `alice@examp1e.com` vs `alice@example.com`).

**NOSTR Mail specifics**:
- NIP-05 identifiers look like email addresses, making typosquatting familiar and effective.
- If the NOSTR client does not prominently display the full NIP-05 domain, users may not notice the difference.

### 11.3 Reply-To Manipulation

**Description**: An attacker sends a NOSTR Mail message where the visible "sender" and the reply-to address differ.

**NOSTR Mail specifics**:
- In NOSTR, the sender is the seal's pubkey (cryptographically verified). But if the rumor content contains a "reply-to" field that differs from the seal pubkey, a naive client might direct replies to the wrong person.
- The bridge must be particularly careful: inbound email `Reply-To` headers could direct NOSTR replies to the attacker.

---

## 12. Cryptographic Attacks

### 12.1 Weak RNG / Entropy Failure

**Description**: If the random number generator used for ephemeral keys, NIP-44 nonces, or Cashu token secrets is weak or predictable, the entire security model collapses.

**Impact by component**:
- **Ephemeral key entropy failure**: If two gift wraps use the same ephemeral key, they are linkable. If the ephemeral private key is predictable, the outer encryption layer is broken.
- **NIP-44 nonce reuse**: Same conversation key + same nonce = identical keystream. XOR of two ciphertexts reveals XOR of plaintexts (two-time pad).
- **Cashu token secret predictability**: If the token secret is predictable, anyone can redeem it.

### 12.2 No Forward Secrecy

**Description**: NIP-44 uses static ECDH. If a private key is compromised at any point, all past and future messages encrypted to/from that key are compromised.

**NOSTR Mail specifics**:
- Email is long-lived. Messages stored on relays for months/years are all decryptable with a single key compromise.
- Unlike Signal (which has ratcheting forward secrecy), NOSTR Mail provides no mechanism to limit the blast radius of key compromise.

### 12.3 No Post-Quantum Security

**Description**: secp256k1 ECDH is vulnerable to Shor's algorithm on a sufficiently powerful quantum computer.

**NOSTR Mail specifics**:
- Harvest-now-decrypt-later: An adversary recording encrypted mail today could decrypt it when quantum computers become available.
- NIP-44 is versioned, so a post-quantum version could be introduced, but migration would require all participants to upgrade.
