# NOSTR Protocol Examples

Working code examples for fundamental NOSTR operations, implemented in TypeScript, Python, Go, and Rust.

## Basics

| Example | Description | Languages |
|---------|-------------|-----------|
| [generate-keys](./basics/generate-keys/) | Generate secp256k1 keypairs, derive public keys, encode to bech32 (npub/nsec) | TS, PY, GO, RS |
| [create-event](./basics/create-event/) | Create a kind 1 text note, compute the event ID, sign with Schnorr | TS, PY, GO |
| [connect-relay](./basics/connect-relay/) | Connect to a relay via WebSocket, send REQ, receive events, handle EOSE | TS, PY, GO |
| [publish-note](./basics/publish-note/) | Full end-to-end flow: generate keys, create event, publish to relay, get OK | TS, PY, GO |
| [subscribe-events](./basics/subscribe-events/) | Subscribe with filters, handle streaming events and EOSE | TS, PY, GO |
| [verify-signature](./basics/verify-signature/) | Verify a Schnorr signature on a NOSTR event | TS, PY, GO |

## How to Use

Each example directory contains:

- **Source files** in multiple languages (TypeScript, Python, Go, and sometimes Rust)
- **README.md** explaining the concept, relevant NIPs, and setup instructions

Every code file is **self-contained and runnable**. See the README in each directory for dependency installation instructions.

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Basic protocol flow (events, subscriptions, filters)
- [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) — bech32-encoded entities (npub, nsec, note, nprofile, etc.)

## Common Relay URLs

These examples use public relays:

- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`
