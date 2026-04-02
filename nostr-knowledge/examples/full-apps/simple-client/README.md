# Simple NOSTR Client

A complete, minimal NOSTR client in a single TypeScript file demonstrating the core protocol flows.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Interactive CLI                     │
│  Commands: note, reply, react, follow, feed, thread │
├─────────────────────────────────────────────────────┤
│                 Client State                         │
│  - profiles Map<pubkey, Profile>                     │
│  - events Map<id, Event>                             │
│  - following Set<pubkey>                             │
│  - activeSubscriptions Map<name, sub>                │
├─────────────────────────────────────────────────────┤
│              Event Publishing                        │
│  publishNote → publishEvent → finalizeEvent → pool   │
│  publishReply (NIP-10 threading)                     │
│  publishReaction (NIP-25)                            │
│  publishProfile (kind 0, replaceable)                │
├─────────────────────────────────────────────────────┤
│            SimplePool (nostr-tools)                   │
│  Manages WebSocket connections to multiple relays    │
│  Deduplicates events, handles reconnection           │
├─────────────────────────────────────────────────────┤
│          Relay 1    Relay 2    Relay 3                │
└─────────────────────────────────────────────────────┘
```

### Key Management

The client generates a fresh keypair on each run, or imports one from the `NOSTR_NSEC` environment variable:

```bash
# Generate new identity (printed on startup)
npx tsx client.ts

# Reuse an existing identity
NOSTR_NSEC=nsec1abc... npx tsx client.ts
```

### Event Flow

1. **Publishing**: User input → `EventTemplate` → `finalizeEvent()` (signs with secret key) → `pool.publish()` broadcasts to all relays
2. **Subscribing**: `pool.subscribeMany()` sends REQ to all relays → events arrive via callback → displayed and cached
3. **Threading**: NIP-10 `e` tags with `root`/`reply` markers form a tree structure. Replies include `p` tags so all thread participants get notified.

### Profile Resolution

When events arrive, we batch-fetch kind 0 (profile metadata) events for unknown authors. Production clients cache these aggressively with TTL-based expiry.

## Running

```bash
npm install
npx tsx client.ts
```

### Example Session

```
nostr> profile {"name":"alice","about":"testing nostr"}
nostr> note Hello from my minimal NOSTR client!
nostr> follow npub1xtscya34g58tk0z602fbd76e67587jxc0arcal0nmjrzf9ec6hsqc02r9k
nostr> feed
nostr> reply note1abc... Great post!
nostr> react note1abc... 🤙
nostr> thread note1abc...
nostr> whoami
nostr> quit
```

## package.json

```json
{
  "name": "nostr-simple-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx client.ts"
  },
  "dependencies": {
    "nostr-tools": "^2.10.0",
    "websocket-polyfill": "^0.0.3"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

## What a Production Client Would Add

### Essential
- **NIP-07 / NIP-46 signing** — Never hold raw secret keys in the client. Use browser extensions (NIP-07) or remote signers (NIP-46) so the key material stays in a secure environment.
- **Kind 3 contact list** — Publish and sync the follow list as a kind 3 event so it roams across clients.
- **Kind 10002 relay list** — Publish preferred relays per NIP-65 so others know where to find your events.
- **Persistent storage** — SQLite or IndexedDB for events, profiles, and relay state. The in-memory cache here is lost on restart.
- **Relay discovery** — Fetch relay lists from followed users and connect to relays where your social graph publishes.

### Performance
- **Event deduplication** — While SimplePool deduplicates, a production client needs content-hash or ID-based dedup at the storage layer.
- **Profile caching with TTL** — Don't re-fetch profiles every session. Cache for hours, refresh in background.
- **Lazy loading** — Fetch threads and profiles on demand, not eagerly.
- **Pagination** — Use `until` and `limit` in filters to paginate through history instead of loading everything.

### Features
- **NIP-04 / NIP-44 encrypted DMs** — Direct messages using shared-secret encryption.
- **NIP-42 relay authentication** — Some relays require auth before accepting events.
- **NIP-57 zaps** — Lightning payments as social signals.
- **Media uploads** — NIP-94 file metadata, Blossom/nostr.build for hosting.
- **NIP-05 verification** — Verify `user@domain.com` identifiers via DNS.
- **Mute lists, bookmarks, long-form content** — The protocol supports rich social features via different event kinds.

### Resilience
- **Outbox model** — Write to your preferred relays, read from the relays your follows prefer (NIP-65).
- **Relay health monitoring** — Track latency, uptime, and error rates. Rotate unhealthy relays.
- **Offline queue** — Queue events when offline, publish when connectivity returns.
- **Rate limit handling** — Back off when relays signal rate limits.
