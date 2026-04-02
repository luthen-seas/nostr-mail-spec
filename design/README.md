# NOSTR Mail — Reimagining the Email Protocol Stack

> **A comprehensive design exploration for replacing the legacy email stack with NOSTR, augmented by Lightning/Cashu micropayments for anti-spam.**

---

## Why This Exists

Email is 7+ protocols duct-taped together over 40 years (SMTP, IMAP, POP3, MIME, SPF, DKIM, DMARC, ARC, MTA-STS, DANE...). Its fundamental problems — spoofing, no native encryption, metadata exposure, vendor lock-in, spam — are **architectural**. They stem from decisions made in 1982 and cannot be patched away.

NOSTR solves most of these problems **by design**, not by bolting on retroactive fixes. This section explores what a NOSTR-based email protocol stack would look like — from identity to delivery to payments.

---

## Documents

| Document | Description |
|----------|-------------|
| [Legacy Email Dissection](legacy-email-dissection.md) | Deep dive into SMTP, IMAP, MIME, DNS, SPF/DKIM/DMARC, TLS, JMAP — understanding what we're replacing and why |
| [Protocol Stack](protocol-stack.md) | The NOSTR Mail protocol stack — layer-by-layer design replacing every email component |
| [Message Format](message-format.md) | Event kinds, tag conventions, threading, CC/BCC, attachments, read receipts — the mail-specific NIP |
| [Encryption & Privacy](encryption-privacy.md) | Three-layer encryption model (NIP-44 + NIP-59 Gift Wrap), metadata hiding, comparison to PGP/S/MIME |
| [Micropayments Anti-Spam](micropayments-anti-spam.md) | L402 and Cashu integration for economic spam prevention — postage stamps for the digital age |
| [Client Architecture](client-architecture.md) | How to build a NOSTR mail client — inbox, compose, sync, search, multi-device, UX patterns |
| [SMTP Bridge](smtp-bridge.md) | Bridging NOSTR Mail ↔ legacy email for interoperability during transition |
| [Open Problems](open-problems.md) | Storage persistence, search, onboarding, large attachments, and other unsolved challenges |
| [The Dream Team](dream-team.md) | 14 expert roles needed, lessons from protocol history (SMTP, TLS, Signal, Bitcoin, HTTP), development lifecycle, what "done" looks like |

---

## The Core Thesis

A NOSTR-based email stack doesn't just replicate email — it **eliminates entire categories of problems**:

| Problem | Email's Attempt | NOSTR's Answer |
|---------|----------------|----------------|
| Spoofing | SPF+DKIM+DMARC (4 specs, 20 years) | Cryptographic signatures (native to every event) |
| Encryption | PGP (30 years, <1% adoption) | NIP-44 (built in, transparent to user) |
| Metadata privacy | Nothing | Gift Wrap (3-layer onion encryption) |
| Vendor lock-in | IMAP export (manual, lossy) | Relay-based storage (switch clients instantly) |
| Identity portability | Own a domain (technical, costly) | Own a keypair (free, permanent) |
| Spam | $2B/year filtration industry | 10-sat postage stamp |
| Deliverability | Warm IPs, pray to Gmail | Publish to relays, done |
| Phishing | User training + ML filters | Cannot forge cryptographic signatures |

---

## Quick Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     NOSTR MAIL CLIENT                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Compose  │ │  Inbox   │ │ Contacts │ │  Key Management   │  │
│  │(kind 15) │ │(REQ 1059)│ │ (kind 3) │ │ (NIP-07/46/55)   │  │
│  └────┬─────┘ └────┬─────┘ └──────────┘ └───────────────────┘  │
│       │             │                                            │
│  ┌────▼─────────────▼────────────────────────────────────────┐  │
│  │              NOSTR MAIL ENGINE                             │  │
│  │  • NIP-44 encryption / decryption                         │  │
│  │  • NIP-59 gift wrap / unwrap                              │  │
│  │  • NIP-65 relay selection (outbox model)                  │  │
│  │  • Cashu / L402 payment handling                          │  │
│  │  • Blossom attachment upload / download                   │  │
│  │  • Thread reconstruction (event tag graph)                │  │
│  └────┬──────────────────────────────────────────┬───────────┘  │
└───────┼──────────────────────────────────────────┼──────────────┘
        │ WebSocket                                │ HTTPS
   ┌────▼────────────────┐                ┌────────▼──────────┐
   │   NOSTR RELAYS      │                │  BLOSSOM SERVERS  │
   │  (message storage   │                │  (attachments)    │
   │   & delivery)       │                │                   │
   │                     │                │  CASHU MINTS      │
   │  Store kind 1059    │                │  (micropayments)  │
   │  Serve via REQ      │                │                   │
   │  NIP-42 AUTH        │                │  NIP-05 SERVERS   │
   └─────────────────────┘                │  (discovery)      │
                                          └───────────────────┘
```

---

## What Switching Mail Clients Looks Like

**Email today** — Switching from Gmail to Protonmail:
- New email address (or expensive domain migration)
- Manual export/import of mail history (if possible)
- Update every service that has your old address
- Lose contacts, labels, filters, search index
- Different apps on every device

**NOSTR Mail** — Switching from Client A to Client B:
1. Open Client B
2. Sign in with your nsec (or connect your NIP-46 remote signer)
3. Client B reads your kind 10050 (inbox relays) and kind 10002 (general relays)
4. Client B subscribes to your relays — your entire mailbox appears
5. Contacts, threads, identity — all intact
6. **Done.**

---

## Existing NOSTR Primitives That Apply

| Primitive | NIP | Role in NOSTR Mail |
|-----------|-----|--------------------|
| Keypair identity | Core | User's permanent, portable identity |
| NIP-05 identifiers | NIP-05 | Human-readable `user@domain` addresses |
| Event signing | NIP-01 | Every message is authenticated by default |
| NIP-44 encryption | NIP-44 | Content encryption (ChaCha20 + HMAC) |
| Gift Wrap | NIP-59 | Metadata-hiding envelope encryption |
| Private DMs | NIP-17 | Foundation for mail message delivery |
| Relay lists | NIP-65 | Mail routing (replaces DNS MX records) |
| DM relay preferences | Kind 10050 | Inbox relay selection |
| Subject tags | NIP-14 | Email subject lines |
| Event deletion | NIP-09 | Delete sent/received messages |
| Follow lists | NIP-02 | Contact list / address book |
| Mute lists | NIP-51 | Block senders |
| Proof of work | NIP-13 | Free-tier anti-spam |
| Relay AUTH | NIP-42 | Inbox access control |
| Blossom | NIP-B7 | Decentralized file attachments |
| File metadata | NIP-94 | Attachment metadata |
| Zaps | NIP-57 | Payment verification |
| Wallet Connect | NIP-47 | Lightning payment integration |
| Cashu wallet | NIP-60/61 | Ecash token management |
| Remote signing | NIP-46 | Secure key management |

---

## New NIPs Required

| Component | Description | Priority |
|-----------|-------------|----------|
| Mail event kind | Define kind 15 (or similar) for structured mail messages | Critical |
| CC/BCC semantics | Multi-recipient tag conventions with privacy for BCC | Critical |
| Mailbox state | Replaceable event for read/flagged/archived/folder state | High |
| Read receipts | Kind for delivery/read confirmations | Medium |
| Cashu postage | Convention for attaching ecash tokens as anti-spam postage | High |
| L402 relay gating | Relay behavior for Lightning-gated message delivery | Medium |
| Mail relay behavior | Inbox relay requirements (storage guarantees, AUTH policies) | High |
| SMTP bridge protocol | Conventions for bridged messages (provenance, headers) | Medium |
| Mailing lists | Group mail distribution via NIP-29 extension | Medium |
| Auto-responders | Convention for out-of-office and auto-reply events | Low |

---

## Reading Order

1. **[Legacy Email Dissection](legacy-email-dissection.md)** — Understand what we're replacing
2. **[Protocol Stack](protocol-stack.md)** — The NOSTR Mail architecture
3. **[Message Format](message-format.md)** — Event structure and conventions
4. **[Encryption & Privacy](encryption-privacy.md)** — How encryption works
5. **[Micropayments Anti-Spam](micropayments-anti-spam.md)** — Economic spam prevention
6. **[Client Architecture](client-architecture.md)** — Building a mail client
7. **[SMTP Bridge](smtp-bridge.md)** — Interoperability with legacy email
8. **[Open Problems](open-problems.md)** — Unsolved challenges
