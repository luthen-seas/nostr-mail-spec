# NOSTR Mail — Core Protocol Specification (Living Draft)

> **Status — pre-submission audit in progress. Spec, NIP draft, and reference impls are being reconciled before public review.**

---

## Overview

NOSTR Mail is a protocol for asynchronous, encrypted, self-sovereign messaging built on the NOSTR protocol. It replaces the legacy email stack (SMTP, IMAP, MIME, SPF/DKIM/DMARC) with NOSTR events, NIP-44 encryption, NIP-59 Gift Wrap, and economic anti-spam via Lightning/Cashu micropayments.

## Design Principles

1. **Encryption by default** — Every message is gift-wrapped. Plaintext mail is not a mode.
2. **Authentication by default** — Every event is signed. Spoofing is cryptographically impossible.
3. **Metadata hiding** — Gift Wrap hides sender identity and timestamps from relays.
4. **Self-sovereign identity** — Users own their keypairs. No provider controls their identity.
5. **Relay-agnostic** — Users choose their relays. No relay is privileged.
6. **Minimal core** — The smallest possible mandatory spec. Everything else is optional.
7. **Economic spam prevention** — Sending has a cost; receiving has a reward.
8. **Backward compatible** — Builds on existing NIP-17/NIP-44/NIP-59 infrastructure.
9. **Implementation-friendly** — A basic client should be buildable in a weekend.

## Dependencies

| NIP | Name | Role |
|-----|------|------|
| NIP-01 | Basic Protocol | Event structure, relay protocol |
| NIP-02 | Follow List | Kind 3 contact list — source for tier-0 anti-spam evaluation |
| NIP-05 | DNS Identifiers | Address resolution only — NOT a trust signal |
| NIP-09 | Event Deletion | Delete sent/received gift wraps |
| NIP-14 | Subject Tag | Mail subject lines |
| NIP-17 | Private DMs | Foundation for encrypted messaging; kind 10050 DM relay list |
| NIP-42 | Authentication | Relay access control |
| NIP-44 | Encryption | Content encryption (ChaCha20/HMAC-SHA256) |
| NIP-59 | Gift Wrap | Three-layer metadata-hiding envelope |
| NIP-65 | Relay Lists | Mail routing (outbox model) |
| NIP-94 | File Metadata | Attachment metadata |

### Optional dependencies

| NIP | Name | Role |
|-----|------|------|
| NIP-B7 | Blossom | Decentralized file attachments. Clients without Blossom MAY omit attachment functionality; the core mail protocol does not depend on Blossom. |

### Removed dependencies (post-DEC-015 simplification)

NIP-13 (PoW) and NIP-05-as-trust-signal were both removed from the tier model in Phase 8. The 5-tier scheme (Contact → NIP-05 → PoW → Cashu → L402) collapsed to 3 tiers (Contact → Cashu → Quarantine). NIP-47 (NWC), NIP-51 (Lists), NIP-57 (Zaps), and NIP-60 (Cashu Wallet) are also no longer dependencies of the core mail protocol; clients MAY use them for wallet integration but the protocol does not require them.

## Event Kinds (Proposed)

| Kind | Name | Category | Description |
|------|------|----------|-------------|
| 1400 | Mail Message | Rumor (unsigned) | The mail content, sealed and wrapped. Includes `message-id` tag for stable identity. |
| 1401 | Mail Receipt | Rumor (unsigned) | Delivery/read confirmations |
| 10050 | DM Relay List | Replaceable | User's inbox relays (NIP-17 inheritance) |
| 10097 | Spam Policy | Replaceable | User's anti-spam configuration (PUBLIC, unencrypted) |
| 30099 | Mailbox State | Addressable | Read/flagged/folder state, partitioned by month (`d` = `YYYY-MM`). Encrypted JSON content; only `d` tag visible. |
| 30016 | Mail Draft | Addressable | Encrypted draft messages |

Kinds 13 (Seal) and 1059 (Gift Wrap) are NIP-59 inheritance and are not introduced by this NIP.

### Future kinds (out of V1 scope)

| Kind | Name | Status |
|------|------|--------|
| 10098 | Auto-Responder | Future — out-of-office configuration. Not specified in V1. |
| 39000 | Mailing List | Future — distribution list definition. Not specified in V1. |

## Open Questions

See [open-questions.md](open-questions.md) for unresolved design decisions.

## Detailed Specification

See [/design/](../../design/) for the full design documents:
- [Message Format](../../design/message-format.md)
- [Encryption & Privacy](../../design/encryption-privacy.md)
- [Micropayments Anti-Spam](../../design/micropayments-anti-spam.md)
- [Protocol Stack](../../design/protocol-stack.md)
