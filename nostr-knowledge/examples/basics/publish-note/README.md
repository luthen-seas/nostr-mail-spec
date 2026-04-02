# Publish a Text Note

End-to-end flow: generate keys, create a signed event, connect to a relay, and publish.

## What This Does

1. **Generates a fresh keypair** (secp256k1)
2. **Creates a kind 1 event** (text note) with a message
3. **Signs the event** (compute ID via SHA-256, sign with Schnorr/BIP-340)
4. **Connects to a relay** via WebSocket
5. **Publishes the event** by sending `["EVENT", <signed_event>]`
6. **Receives OK** — the relay's acknowledgment of acceptance or rejection

## The OK Message

When you publish an event, the relay responds with:

```json
["OK", "<event_id>", true, ""]
```

| Field | Meaning |
|-------|---------|
| `"OK"` | Message type |
| `<event_id>` | The ID of the event you published |
| `true/false` | Whether the relay accepted the event |
| `<message>` | Optional reason (useful when rejected) |

Common rejection reasons:
- `"blocked: "` — the relay doesn't accept events from this pubkey
- `"rate-limited: "` — too many events too quickly
- `"invalid: "` — the event is malformed or has a bad signature
- `"pow: "` — the relay requires proof-of-work (NIP-13)
- `"duplicate: "` — the relay already has this event

## Publishing Flow

```
Client                          Relay
  |                               |
  |  [WebSocket handshake]        |
  |<----------------------------->|
  |                               |
  |  ["EVENT", {signed event}]    |
  |------------------------------>|
  |                               |
  |  ["OK", "abc...", true, ""]   |
  |<------------------------------|
  |                               |
  |  [WebSocket close]            |
  |------------------------------>|
```

## Files

| File | Language | Library |
|------|----------|---------|
| `publish_note.ts` | TypeScript | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| `publish_note.py` | Python | [pynostr](https://github.com/holgern/pynostr) + [websocket-client](https://github.com/websocket-client/websocket-client) |
| `publish_note.go` | Go | [go-nostr](https://github.com/nbd-wtf/go-nostr) |

## Setup

### TypeScript

```bash
npm init -y
npm install nostr-tools ws
npm install -D @types/ws typescript ts-node
npx ts-node publish_note.ts
```

### Python

```bash
pip install pynostr websocket-client
python publish_note.py
```

### Go

```bash
go mod init publish-note
go get github.com/nbd-wtf/go-nostr
go run publish_note.go
```

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Event publishing, OK responses, and relay communication
