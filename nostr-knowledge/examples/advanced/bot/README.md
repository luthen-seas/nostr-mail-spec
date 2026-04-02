# NOSTR Bot

## Overview

A NOSTR bot is a program that connects to relays with its own keypair,
subscribes to events of interest, and publishes events in response. This
example demonstrates the core patterns:

- **Auto-reply** to mentions (events with a `p` tag matching the bot's pubkey)
- **Keyword reactions** (kind 7 reactions to notes containing certain words)
- **Periodic posts** (scheduled status updates)

## Bot patterns

### Key management

A bot needs a persistent identity. Options:

1. **Environment variable** — store the 32-byte secret key as hex in an env
   var. Simple and works well for single-instance bots.
2. **File on disk** — write the key to a file with restricted permissions.
3. **NIP-46 bunker** — the bot holds no keys; it requests signatures from a
   remote signer. More secure but more complex.

This example uses option 1 (`BOT_SECRET_KEY` env var) and falls back to
generating a fresh key if none is provided.

### Relay selection

Choose relays based on your bot's purpose:

- **Popular relays** (relay.damus.io, nos.lol) for broad reach.
- **Specialized relays** (relay.nostr.band) for search/discovery features.
- **Your own relay** for guaranteed storage of your events.

Connect to 2-5 relays. More than that wastes bandwidth and your events will
propagate via relay-to-relay gossip anyway.

### Subscription strategy

The bot uses two subscriptions:

1. **Mentions** — filter: `{ kinds: [1], "#p": [botPubkey], since: now }`.
   This is precise and low-volume.
2. **Keyword stream** — filter: `{ kinds: [1], since: now, limit: 50 }`.
   This is a firehose approach. For production, consider using NIP-50 search
   filters or subscribing to specific authors/topics.

### Rate limiting

Without rate limiting, a bot can be tricked into spamming. This example
implements a simple cooldown: at most one reply per pubkey per 60 seconds.

Production bots should also consider:

- **Global rate limit** — max N events published per minute total.
- **Deduplication** — track processed event IDs to avoid double-processing.
- **Blocklist** — ignore known spam pubkeys.

## Event kinds used

| Kind | Purpose |
|---|---|
| 1 | Text note (replies and periodic posts) |
| 7 | Reaction (NIP-25) |

## Running

```bash
npm install nostr-tools ws
npm install -D typescript ts-node @types/node @types/ws

# Optional: set a persistent identity
export BOT_SECRET_KEY=<64-char-hex-secret-key>

npx ts-node bot.ts
```

## Extending the bot

Ideas for extending this example:

- **NIP-04/NIP-44 encrypted DMs** — respond to direct messages.
- **NIP-57 zap receipts** — thank users who zap you.
- **NIP-50 search** — use relay search capabilities for keyword matching.
- **Command parsing** — handle `!help`, `!price btc`, etc.
- **Database** — persist state across restarts (seen events, user prefs).
