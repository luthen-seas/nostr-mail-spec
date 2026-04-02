# Component Map — Which Role Owns Which Component

> **Maps every protocol component to its primary owner and reviewers. No component should be designed without its owner, and no component should ship without its reviewers signing off.**

---

## Component Ownership

| Component | Primary Owner | Required Reviewers | Description |
|-----------|--------------|-------------------|-------------|
| **Core Protocol** | | | |
| Event kind definitions | Protocol Architect | Crypto Designer, Standards Writer | Kind 15, 16, 10097, 10098, 10099, 30015, 39000 |
| Tag conventions | Protocol Architect | Email Expert, Standards Writer | All tag formats and semantics |
| Threading model | Protocol Architect | Email Expert, UX Designer | Reply/thread tag conventions |
| Extension mechanism | Protocol Architect | Standards Writer | How future features are added |
| **Encryption** | | | |
| NIP-44 integration | Crypto Designer | Formal Methods, Adversarial Security | Encryption/decryption of mail content |
| Gift Wrap (NIP-59) construction | Crypto Designer | Formal Methods, Adversarial Security | Three-layer encryption model |
| Multi-recipient encryption | Crypto Designer | Formal Methods | CC/BCC privacy, per-recipient wrapping |
| Key management | Crypto Designer | UX Designer, Adversarial Security | NIP-07/46/55 integration, key rotation |
| **Anti-Spam** | | | |
| Cashu token format | Payment Specialist | Crypto Designer, Adversarial Security | Token attachment, verification, redemption |
| L402 relay gating | Payment Specialist | Relay Operator, Crypto Designer | Invoice generation, macaroon verification |
| PoW requirements | Protocol Architect | Adversarial Security | NIP-13 difficulty calibration |
| Spam policy event | Protocol Architect | Payment Specialist, UX Designer | Kind 10097 format and semantics |
| Tier evaluation logic | Payment Specialist | Adversarial Security | Contact → NIP-05 → PoW → Cashu → L402 |
| Refundable postage | Payment Specialist | UX Designer | Refund flow and UX |
| **Delivery** | | | |
| Relay selection (outbox) | Distributed Systems | Relay Operator | How senders find recipient relays |
| Delivery guarantees | Distributed Systems | Relay Operator | Multi-relay publication, retry logic |
| Push notifications | Distributed Systems | UX Designer | Real-time delivery to clients |
| Inbox relay spec | Relay Operator | Protocol Architect | Storage, AUTH, rate limiting requirements |
| **State & Sync** | | | |
| Mailbox state format | Distributed Systems | Protocol Architect | Kind 10099 structure and partitioning |
| Multi-device sync | Distributed Systems | Systems Programmer | Conflict resolution, delta sync |
| Draft storage | Protocol Architect | Distributed Systems | Kind 30015 format |
| **Attachments** | | | |
| Blossom integration | Systems Programmer | Crypto Designer | Encrypted upload/download, hash references |
| Attachment tags | Protocol Architect | Email Expert | Tag format for file references |
| Inline images | Protocol Architect | UX Designer | Content-ID equivalent |
| **Bridge** | | | |
| SMTP → NOSTR conversion | Email Expert | Crypto Designer, Adversarial Security | MIME parsing, DKIM verification, event creation |
| NOSTR → SMTP conversion | Email Expert | Systems Programmer | Event to MIME, DKIM signing, delivery |
| Identity mapping | Email Expert | Protocol Architect | NIP-05 ↔ email address |
| Threading across protocols | Email Expert | Protocol Architect | Message-ID ↔ event ID |
| **Verification** | | | |
| Formal encryption proof | Formal Methods | Crypto Designer | ProVerif/Tamarin models |
| State machine model | Formal Methods | Distributed Systems | TLA+ delivery model |
| Test vectors | Systems Programmer | Standards Writer, Second Impl | Canonical input/output pairs |
| Conformance test suite | Standards Writer | Systems Programmer, Second Impl | Automated correctness checks |
| Interop testing | Second Impl | Systems Programmer | Cross-implementation compatibility |
| **Security** | | | |
| Adversarial review | Adversarial Security | Crypto Designer | Attack surface analysis |
| Traffic analysis resistance | Adversarial Security | Crypto Designer, Distributed Systems | Timing/volume correlation defenses |
| Bridge security | Adversarial Security | Email Expert | Injection, spoofing, relay abuse |
| Economic attack analysis | Adversarial Security | Payment Specialist | Payment system gaming |
| **UX** | | | |
| Onboarding flow | UX Designer | Protocol Architect | Key gen, NIP-05, relay setup |
| Compose/inbox UX | UX Designer | Email Expert | Core mail experience |
| Payment UX | UX Designer | Payment Specialist | How users experience anti-spam payments |
| Key management UX | UX Designer | Crypto Designer | Backup, recovery, device migration |
| **Specification** | | | |
| NIP document(s) | Standards Writer | All roles | The canonical spec |
| Test vector document | Standards Writer | Systems Programmer | Published test vectors |
| Conformance spec | Standards Writer | Systems Programmer, Second Impl | What implementations must pass |
| **Legal** | | | |
| Regulatory review | Legal/Regulatory | Payment Specialist, Protocol Architect | Compliance across jurisdictions |
| Privacy impact assessment | Legal/Regulatory | Crypto Designer | GDPR, data protection |
| Payment regulation | Legal/Regulatory | Payment Specialist | Money transmission, FinCEN, PSD2 |
| **Ecosystem** | | | |
| SDK design | Dev Ecosystem | Systems Programmer | Library API for client developers |
| Documentation | Dev Ecosystem | Standards Writer | Developer docs, tutorials |
| CLI tools | Dev Ecosystem | Systems Programmer | Testing and debugging tools |
