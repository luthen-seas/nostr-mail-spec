# nostr-mail-spec

Research, design, and formal analysis for the NOSTR Mail protocol — encrypted, self-sovereign email reimagined on NOSTR with micropayment anti-spam.

## What This Is

This repository contains the complete design process behind NOSTR Mail:

- **Protocol design documents** (`design/`) — Full protocol stack, message format, encryption model, anti-spam system, SMTP bridge, client architecture
- **Formal analysis** (`reviews/`) — Encryption composition review, TLA+ delivery model, adversarial security audit (15 findings), economic attack analysis
- **15 domain expert knowledge bases** (`brains/`) — Specialized reference material for cryptography, formal methods, UX, legal, payments, and more
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
├── brains/              ← 15 domain expert knowledge bases (63 files)
├── reviews/             ← Security audits, formal proofs, interop results
└── nostr-knowledge/     ← NOSTR protocol knowledge base (77K+ lines)
```

## License

MIT


---

## Project Layout — NOSTR Mail Ecosystem

The NOSTR Mail project is split across six repositories with clear ownership of each artifact:

| Repo | Source of truth for | This repo? |
|---|---|---|
| [nostr-mail-spec](https://github.com/luthen-seas/nostr-mail-spec) | Living spec, threat model, decisions log, design docs | ✅ |
| [nostr-mail-nip](https://github.com/luthen-seas/nostr-mail-nip) | Submission-ready NIP draft, **canonical test vectors** |  |
| [nostr-mail-ts](https://github.com/luthen-seas/nostr-mail-ts) | TypeScript reference implementation |  |
| [nostr-mail-go](https://github.com/luthen-seas/nostr-mail-go) | Go second implementation (interop) |  |
| [nostr-mail-bridge](https://github.com/luthen-seas/nostr-mail-bridge) | SMTP ↔ NOSTR gateway |  |
| [nostr-mail-client](https://github.com/luthen-seas/nostr-mail-client) | Reference web client (SvelteKit) |  |

**Test vectors** are canonical in `nostr-mail-nip/test-vectors/` and consumed by the implementation repos via git submodule. Do not edit a local copy in an impl repo — submit changes to `nostr-mail-nip`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the cross-repo contribution workflow, [SECURITY.md](SECURITY.md) for vulnerability reporting, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards.
