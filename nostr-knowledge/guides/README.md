# NOSTR Guides

> Beginner-friendly and architectural guides for developers new to the NOSTR protocol.

---

## Guide Index

| Guide | Description |
|-------|-------------|
| [Getting Started](./getting-started.md) | Zero-to-hero introduction to NOSTR. Covers what it is, core concepts (keys, events, relays, clients), your first steps from generating a keypair to publishing your first note, and common questions. Start here. |
| [Architecture Overview](./architecture-overview.md) | How NOSTR fits together at a technical level. System architecture diagrams, the event as universal data unit, client-relay communication, event flow, the NIP system, the outbox model, event kinds, and comparisons with traditional architectures. |

## Security Guides

| Guide | Description |
|-------|-------------|
| [Key Management](./key-management.md) | Comprehensive key security guide. Covers key generation, storage options (raw nsec, NIP-49 ncryptsec, NIP-07 extensions, NIP-46 remote signers, NIP-55 Android signers, hardware wallets, OS keychains), mnemonic backups (NIP-06), multi-device patterns, key rotation limitations, compromise recovery, and developer responsibilities. |
| [NIP-44 Encryption Guide](./encryption-guide.md) | NIP-44 encryption explained step by step for developers. Covers why NIP-04 is broken (6 specific vulnerabilities), the full NIP-44 encryption/decryption pipeline, code examples with nostr-tools, when to use NIP-44 (DMs, gift wrap, NWC, drafts), security properties, and limitations (no forward secrecy, no deniability). |
| [Spam Prevention](./spam-prevention.md) | Anti-spam and content moderation guide. Covers relay-level defenses (NIP-13 PoW, rate limiting, NIP-42 auth, paid relays), client-level defenses (WoT filtering, mute lists, reporting, labeling, trusted assertions), community-level defenses (NIP-72, NIP-29, WoT relays), write policy plugins (strfry model), ML-based detection, and relay operator best practices. |

## Deeper Reference

Once you have finished the guides above, continue with the detailed protocol documentation:

| Document | Description |
|----------|-------------|
| [Protocol Overview](../protocol/README.md) | Comprehensive protocol reference covering history, design philosophy, core architecture, and comparisons with other protocols. |
| [Event Model](../protocol/event-model.md) | Detailed event structure, serialization, ID computation, signatures, and kind categories. |
| [Relay Protocol](../protocol/relay-protocol.md) | WebSocket protocol messages, subscription filters, connection management. |
| [Cryptography](../protocol/cryptography.md) | secp256k1, Schnorr signatures, NIP-44 encryption. |
| [Identity](../protocol/identity.md) | Keys, NIP-05, NIP-19 encoding, signing delegation. |
| [Data Flow](../protocol/data-flow.md) | End-to-end data flow with diagrams. |
| [Client Architecture](../protocol/client-architecture.md) | Outbox model, subscription management, UI patterns. |
| [Relay Architecture](../protocol/relay-architecture.md) | How relays store, index, and serve events. |

## Code Examples

Working code examples are available in [`../examples/`](../examples/README.md), organized by use case:

- **Basics** — Key generation, event creation, relay connection, publishing, subscribing
- **Social** — Profiles, follows, replies, reactions
- **Messaging** — Encrypted DMs, gift wrap
- **Payments** — Zaps, Nostr Wallet Connect
- **Advanced** — Bots, DVMs, relay building, remote signing

## NIP Reference

See [`../nips/README.md`](../nips/README.md) for the complete NIP index organized by category.

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions.*
