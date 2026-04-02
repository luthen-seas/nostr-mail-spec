# NOSTR Relay From Scratch

A complete, minimal NOSTR relay in a single TypeScript file. Implements NIP-01 (the core protocol) and NIP-11 (relay information document).

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  HTTP Server                          │
│  GET / with Accept: application/nostr+json → NIP-11  │
│  WebSocket upgrade → NOSTR protocol handler          │
├──────────────────────────────────────────────────────┤
│              WebSocket Layer (ws)                     │
│  Per-connection: ConnectionState                     │
│    - subscriptions Map<subId, {filters}>             │
│    - rateLimiter (sliding window)                    │
├──────────────────────────────────────────────────────┤
│              NostrRelay                               │
│  handleEvent: validate → store → notify subscribers  │
│  handleReq: query → send matches → EOSE → track sub │
│  handleClose: remove subscription                    │
├──────────────────────────────────────────────────────┤
│              EventStore                               │
│  Primary: events Map<id, Event>                      │
│  Indexes:                                            │
│    byAuthor Map<pubkey, Set<id>>                     │
│    byKind Map<kind, Set<id>>                         │
│    byTag Map<"tagname:value", Set<id>>               │
│  Replaceable event handling (kinds 0, 3, 10k-20k)   │
│  Parameterized replaceable (kinds 30k-40k)           │
└──────────────────────────────────────────────────────┘
```

### Message Flow

```
Client                         Relay
  │                              │
  │── ["EVENT", <event>] ───────>│  validate → store → notify subs
  │<─ ["OK", id, true, ""] ─────│
  │                              │
  │── ["REQ", "sub1", filter] ──>│  query store → send matches
  │<─ ["EVENT", "sub1", ev1] ───│
  │<─ ["EVENT", "sub1", ev2] ───│
  │<─ ["EOSE", "sub1"] ─────────│  (now streaming live)
  │                              │
  │     (new event arrives)      │
  │<─ ["EVENT", "sub1", ev3] ───│  (matches sub1 filter)
  │                              │
  │── ["CLOSE", "sub1"] ────────>│  remove subscription
```

### Filter Matching Strategy

The store uses indexes to minimize scanning. When a filter specifies `authors` and `kinds`, we:

1. Look up the `byAuthor` index for each author → get candidate event IDs
2. Look up the `byKind` index for each kind → get candidate event IDs
3. Intersect the two sets → much smaller candidate pool
4. For each candidate, check `since`, `until`, and tag filters
5. Sort by `created_at` descending, apply `limit`

This is O(result_set) instead of O(all_events) for most queries.

## Running

```bash
npm install
npx tsx relay.ts
```

### Testing with the Simple Client

```bash
# Terminal 1: Start the relay
cd relay-from-scratch && npx tsx relay.ts

# Terminal 2: Connect the client (edit DEFAULT_RELAYS to ws://localhost:7777)
cd simple-client && npx tsx client.ts
```

### Testing with websocat

```bash
# Subscribe to all kind 1 events
echo '["REQ","test",{"kinds":[1]}]' | websocat ws://localhost:7777

# Fetch NIP-11 relay info
curl -H "Accept: application/nostr+json" http://localhost:7777
```

## package.json

```json
{
  "name": "nostr-relay-from-scratch",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx relay.ts"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "nostr-tools": "^2.10.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0"
  }
}
```

## What a Production Relay Would Add

### Storage
- **Persistent database** — SQLite (strfry), PostgreSQL (nostr-rs-relay), or LMDB. In-memory doesn't survive restarts.
- **Event expiry** — Ephemeral events (kind 20000-29999) should be deleted after relay-defined TTL.
- **Deletion** — NIP-09 kind 5 deletion requests. The relay should remove (or mark) the referenced events.
- **Database indexes** — The in-memory indexes here mirror what you'd create as B-tree indexes in SQL.

### Authentication & Authorization
- **NIP-42 AUTH** — Challenge-response authentication. Required for paid relays, private communities, or write-restricted relays.
- **NIP-70 protected events** — Events that should only be stored if the author is authenticated.
- **Write policies** — Allow/deny lists, paid-only writing, proof-of-work requirements.

### Performance
- **Connection pooling** — Handle 10,000+ concurrent connections with proper backpressure.
- **Query optimization** — The naive filter matching here does full scans when no index applies. Production relays need query planning.
- **Event streaming** — Send events as they're found rather than buffering (important for large result sets).
- **Memory limits** — Cap total stored events, evict old/low-value events.

### Protocol
- **NIP-45 COUNT** — Return event counts without sending all events (useful for "42 replies" badges).
- **NIP-50 SEARCH** — Full-text search across event content.
- **NIP-42 AUTH** — Required for NIP-29 groups, NIP-70 protected events, and private relays.
- **NIP-96 file storage** — Accept and serve media uploads.

### Operations
- **Metrics** — Prometheus counters for events/sec, connections, query latency, rejection reasons.
- **Logging** — Structured logs with connection IDs for debugging.
- **Rate limiting by pubkey and IP** — The per-connection limiter here is trivially bypassed by reconnecting.
- **Reverse proxy** — Nginx/Caddy in front for TLS termination, IP-based rate limiting, and DDoS protection.
- **Backup and replication** — Replicate events to other relays or cold storage.
