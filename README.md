# nostr-mail-spec

Research, design, and formal analysis for the NOSTR Mail protocol — encrypted, self-sovereign email reimagined on NOSTR with micropayment anti-spam.

## What This Is

This repository contains the complete design process behind NOSTR Mail:

- **Protocol design documents** (`design/`) — Full protocol stack, message format, encryption model, anti-spam system, SMTP bridge, client architecture
- **Formal analysis** (`reviews/`) — Encryption composition review, TLA+ delivery model, adversarial security audit (15 findings), economic attack analysis
- **15 AI agent knowledge bases** (`brains/`) — Specialized domain knowledge for crypto, formal methods, UX, legal, payments, and more
- **Living specification** (`shared/`) — Threat model, 11 design decisions, 15 open questions, component ownership map
- **77,000+ lines of NOSTR protocol knowledge** (`nostr-knowledge/`) — All 96 NIPs, 8 language SDKs, relay and client deep dives

## Related Repositories

| Repo | Description |
|------|-------------|
| **nostr-mail-nip** | The formal NIP specification (for submission to nostr-protocol/nips) |
| **nostr-mail-ts** | TypeScript reference implementation (npm library) |
| **nostr-mail-go** | Go second implementation (interop-validated) |
| **nostr-mail-bridge** | SMTP ↔ NOSTR bidirectional gateway |
| **nostr-mail-client** | Reference web mail client (SvelteKit) |

## Structure

```
nostr-mail-spec/
├── shared/              ← Living spec, threat model, decisions log, roadmap
├── design/              ← Protocol design documents (10 files)
├── brains/              ← 15 agent knowledge bases (63 files)
├── reviews/             ← Security audits, formal proofs, interop results
└── nostr-knowledge/     ← NOSTR protocol knowledge base (77K+ lines)
```

## License

MIT
