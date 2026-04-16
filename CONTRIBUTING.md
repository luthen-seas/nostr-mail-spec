# Contributing to the NOSTR Mail project

Thanks for your interest! This repository is part of the **NOSTR Mail** project — encrypted, asynchronous, peer-to-peer email built on NOSTR with economic anti-spam (Lightning + Cashu).

## Project layout

| Repo | Role |
|---|---|
| [nostr-mail-spec](https://github.com/luthen-seas/nostr-mail-spec) | Living spec: threat model, design decisions, open questions, expert knowledge bases |
| [nostr-mail-nip](https://github.com/luthen-seas/nostr-mail-nip) | Submission-ready NIP draft + canonical test vectors |
| [nostr-mail-ts](https://github.com/luthen-seas/nostr-mail-ts) | TypeScript reference implementation |
| [nostr-mail-go](https://github.com/luthen-seas/nostr-mail-go) | Go second implementation (interop validation) |
| [nostr-mail-bridge](https://github.com/luthen-seas/nostr-mail-bridge) | SMTP ↔ NOSTR gateway |
| [nostr-mail-client](https://github.com/luthen-seas/nostr-mail-client) | Reference web client (SvelteKit) |

## Where to file issues

- **Protocol design / NIP wording / threat model** → `nostr-mail-spec` or `nostr-mail-nip`
- **Implementation bugs / language-specific issues** → the relevant impl repo
- **Cross-repo coordination** → `nostr-mail-spec` with labels for affected repos

## Workflow

1. **Open an issue first** for non-trivial changes so the approach can be discussed.
2. **Branch from `main`** with a descriptive name (e.g., `fix/cashu-token-validation`).
3. **One logical change per PR.** Keep PRs reviewable.
4. **CI must pass.** Lint, build, tests, and (where applicable) test-vector conformance run on every PR.
5. **Coordinate cross-repo changes.** If your change affects the spec or the NIP, open a coordinating issue or PR there as well.

## Test vectors

Canonical test vectors live in [`nostr-mail-nip/test-vectors`](https://github.com/luthen-seas/nostr-mail-nip/tree/main/test-vectors). Implementations consume them via git submodule. Do not edit a local copy in an impl repo — submit changes to `nostr-mail-nip`.

## Commit messages

- Imperative subject ("Add X", not "Added X" or "Adds X")
- Explain *why* in the body, not *what* (the diff shows what)
- Reference issues with `#NNN` and cross-repo issues with `luthen-seas/repo#NNN`

## Code of Conduct

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md). Please do not open a public issue for security reports.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
