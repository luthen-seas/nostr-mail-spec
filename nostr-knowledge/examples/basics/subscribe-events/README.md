# Subscribe to Events

Subscribe to a NOSTR relay with filters and receive events in real-time.

## What This Does

1. **Connects to a relay** via WebSocket
2. **Sends a REQ** with multiple filters (text notes + metadata)
3. **Receives stored events** that match the filters
4. **Handles EOSE** — the boundary between stored and real-time events
5. **Receives real-time events** as they are published by other clients
6. **Closes** the subscription after receiving a few real-time events

## Filter Reference

Filters are JSON objects with optional fields. All fields within a single filter are AND-ed together. Multiple values within a field are OR-ed.

```json
{
  "ids": ["abc...", "def..."],     // Match specific event IDs (prefix match)
  "authors": ["abc...", "def..."], // Match specific author pubkeys (prefix match)
  "kinds": [0, 1, 3],             // Match specific event kinds
  "#e": ["abc..."],               // Match events with "e" tag containing this value
  "#p": ["abc..."],               // Match events with "p" tag containing this value
  "#t": ["nostr"],                // Match events with "t" tag (hashtags)
  "since": 1700000000,            // Only events created after this timestamp
  "until": 1700100000,            // Only events created before this timestamp
  "limit": 20                     // Max stored events to return (not for real-time)
}
```

### Multiple Filters

You can include multiple filters in a single REQ. Events matching ANY filter are returned:

```json
["REQ", "sub1", {"kinds": [1], "limit": 10}, {"kinds": [0], "limit": 5}]
```

### Common Event Kinds

| Kind | Description |
|------|-------------|
| 0 | Metadata (user profile) |
| 1 | Text note (short text) |
| 2 | Recommend relay (deprecated) |
| 3 | Contact list |
| 4 | Encrypted direct message (NIP-04, deprecated) |
| 5 | Event deletion |
| 6 | Repost |
| 7 | Reaction |
| 1984 | Report |
| 30023 | Long-form content |

## EOSE: Stored vs Real-Time

When you subscribe, the relay first sends all **stored events** that match your filters. After that, it sends an **EOSE** message:

```json
["EOSE", "sub1"]
```

This marks the boundary:
- **Before EOSE**: Events from the relay's database (historical)
- **After EOSE**: Events arriving in real-time from other clients

The `limit` field only applies to stored events, not real-time ones.

## Files

| File | Language | Library |
|------|----------|---------|
| `subscribe_events.ts` | TypeScript | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| `subscribe_events.py` | Python | [pynostr](https://github.com/holgern/pynostr) + [websocket-client](https://github.com/websocket-client/websocket-client) |
| `subscribe_events.go` | Go | [go-nostr](https://github.com/nbd-wtf/go-nostr) |

## Setup

### TypeScript

```bash
npm init -y
npm install nostr-tools ws
npm install -D @types/ws typescript ts-node
npx ts-node subscribe_events.ts
```

### Python

```bash
pip install pynostr websocket-client
python subscribe_events.py
```

### Go

```bash
go mod init subscribe-events
go get github.com/nbd-wtf/go-nostr
go run subscribe_events.go
```

## Relevant NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — REQ/EVENT/EOSE message flow, filter format, subscription lifecycle
