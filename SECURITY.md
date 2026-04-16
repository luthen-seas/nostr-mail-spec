# Security Policy

The NOSTR Mail project handles encryption, key material, and economic systems (Lightning, Cashu). Security issues are taken seriously.

## Reporting a Vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

### Preferred channel: GitHub Private Vulnerability Reporting

Use the **"Report a vulnerability"** button on the [Security tab](../../security) of this repository. The report is visible only to maintainers.

### Alternative: NOSTR DM

You can also reach the maintainer via NOSTR DM at the npub linked from the project README, encrypted with NIP-44.

## Scope

**In scope:**
- Cryptographic flaws (gift-wrap composition, key derivation, signature validation, nonce reuse)
- Spec ambiguities that lead to insecure implementations
- Economic attacks on the anti-spam mechanism (Cashu postage forgery, double-spend, replay)
- Privacy leaks in the bridge or client (metadata exposure, sender unmasking, timing side-channels)
- Sandbox escapes in the SMTP bridge's HTML/MIME handling

**Out of scope:**
- Issues in upstream dependencies (`nostr-tools`, `go-nostr`, `cashu-ts`, `nodemailer`, `mailparser`) — please report to those projects directly
- Relay-side denial of service
- Issues requiring physical access to the user's device

## Coordinated disclosure

For protocol-level issues affecting all implementations, disclosure is coordinated across `nostr-mail-ts`, `nostr-mail-go`, `nostr-mail-bridge`, `nostr-mail-client`, and the spec repos. Please allow up to **90 days** for fixes to ship across the ecosystem before public disclosure.

## Acknowledgement

Researchers who follow coordinated disclosure are credited (with permission) in the relevant security advisory and the project changelog.
