# Connect to a Relay

Connect to a NOSTR relay via WebSocket, subscribe to events, and handle responses.

## What This Does

1. **Opens a WebSocket connection** to a public NOSTR relay
2. **Sends a REQ message** with a subscription filter (latest 5 text notes)
3. **Receives EVENT messages** — each containing a matching NOSTR event
4. **Handles EOSE** (End Of Stored Events) — the signal that stored events are done
5. **Closes** the subscription and disconnects

## NOSTR Relay Protocol (NIP-01)

NOSTR relays communicate over WebSockets using JSON arrays. There are three message types sent by clients and three by relays:

### Client-to-Relay Messages

| Message | Format | Purpose |
|---------|--------|---------|
| `REQ` | `["REQ", <sub_id>, <filter>, ...]` | Subscribe to events matching filters |
| `EVENT` | `["EVENT", <event>]` | Publish a signed event |
| `CLOSE` | `["CLOSE", <sub_id>]` | Close a subscription |

### Relay-to-Client Messages

| Message | Format | Purpose |
|---------|--------|---------|
| `EVENT` | `["EVENT", <sub_id>, <event>]` | Send event matching a subscription |
| `EOSE` | `["EOSE", <sub_id>]` | All stored events for this subscription sent |
| `OK` | `["OK", <event_id>, <bool>, <message>]` | Acknowledge event publication |
| `NOTICE` | `["NOTICE", <message>]` | Human-readable notice |

### Subscription Flow

```
Client                          Relay
  |                               |
  |  ["REQ", "sub1", {filter}]    |
  |------------------------------>|
  |                               |
  |  ["EVENT", "sub1", event1]    |
  |<------------------------------|
  |  ["EVENT", "sub1", event2]    |
  |<------------------------------|
  |  ["EOSE", "sub1"]             |
  |<------------------------------|
  |                               |
  |  (real-time events stream)    |
  |  ["EVENT", "sub1", event3]    |
  |<------------------------------|
  |                               |
  |  ["CLOSE", "sub1"]            |
  |------------------------------>|
```

## Filter Object

Filters specify which events to receive:

```json
{
  "ids": ["<hex>", ...],       // Event IDs
  "authors": ["<hex>", ...],   // Public keys
  "kinds": [1, 2, ...],        // Event kinds
  "#e": ["<hex>", ...],        // Events referenced in tags
  "#p": ["<hex>", ...],        // Pubkeys referenced in tags
  "since": 1234567890,         // Events after this timestamp
  "until": 1234567890,         // Events before this timestamp
  "limit": 10                  // Max number of stored events to return
}
```

All fields are optional. Multiple conditions are AND-ed together. Multiple values within a field are OR-ed.

## Files

| File | Language | Library |
|------|----------|---------|
| `connect_relay.ts` | TypeScript | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| `connect_relay.py` | Python | [pynostr](https://github.com/holgern/pynostr) + [websocket-client](https://github.com/websocket-client/websocket-client) |
| `connect_relay.go` | Go | [go-nostr](https://github.com/nbd-wtf/go-nostr) |

## Setup

### TypeScript

```bash
npm init -y
npm install nostr-tools ws
npm install -D @types/ws typescript ts-node
npx ts-node connect_relay.ts
```

### Python

```bash
pip install pynostr websocket-client
python connect_relay.py
```

### Go

```bash
go mod init connect-relay
go get github.com/nbd-wtf/go-nostr
go run connect_relay.go
```

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Defines the WebSocket protocol, message types, filter format, and subscription flow
