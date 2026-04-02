# NOSTR Mail — Core Protocol Specification (Living Draft)

> **Status: Pre-Draft — Design phase. Not yet submitted as a NIP.**

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
| NIP-02 | Follow List | Contact list (address book, spam bypass) |
| NIP-05 | DNS Identifiers | Human-readable mail addresses |
| NIP-09 | Event Deletion | Delete sent/received messages |
| NIP-13 | Proof of Work | Free-tier anti-spam |
| NIP-14 | Subject Tag | Mail subject lines |
| NIP-17 | Private DMs | Foundation for encrypted messaging |
| NIP-42 | Authentication | Relay access control |
| NIP-44 | Encryption | Content encryption (ChaCha20/HMAC) |
| NIP-47 | Wallet Connect | Lightning payment integration |
| NIP-51 | Lists | Mute/block lists |
| NIP-57 | Zaps | Payment verification |
| NIP-59 | Gift Wrap | Metadata-hiding envelope encryption |
| NIP-60 | Cashu Wallet | Ecash token management |
| NIP-65 | Relay Lists | Mail routing (outbox model) |
| NIP-B7 | Blossom | Decentralized file attachments |
| NIP-94 | File Metadata | Attachment metadata |

## Event Kinds (Proposed)

| Kind | Name | Category | Description |
|------|------|----------|-------------|
| 15 | Mail Message | Rumor (unsigned) | The mail content, sealed and wrapped |
| 16 | Mail Receipt | Rumor (unsigned) | Delivery/read confirmations |
| 13 | Seal | Regular | NIP-59 encrypted rumor layer |
| 1059 | Gift Wrap | Regular | NIP-59 outer encrypted layer |
| 10050 | DM Relay List | Replaceable | User's inbox relays |
| 10097 | Spam Policy | Replaceable | User's anti-spam configuration |
| 10098 | Auto-Responder | Replaceable | Out-of-office configuration |
| 10099 | Mailbox State | Addressable | Read/flagged/folder state |
| 30015 | Mail Draft | Addressable | Encrypted draft messages |
| 39000 | Mailing List | Addressable | Distribution list definition |

## Open Questions

See [open-questions.md](open-questions.md) for unresolved design decisions.

## Detailed Specification

See [/design/](../../design/) for the full design documents:
- [Message Format](../../email/message-format.md)
- [Encryption & Privacy](../../email/encryption-privacy.md)
- [Micropayments Anti-Spam](../../email/micropayments-anti-spam.md)
- [Protocol Stack](../../email/protocol-stack.md)
