# Mostr -- Nostr-Fediverse Bridge

- **Website**: https://mostr.pub
- **Protocol bridge**: Nostr (NIP-01) <-> Fediverse (ActivityPub)

---

## What It Is

Mostr is a bidirectional bridge between Nostr and the Fediverse (Mastodon, Pleroma, Misskey, and other ActivityPub servers). It allows Nostr users to follow and interact with Fediverse accounts, and vice versa, without either side needing to create an account on the other network.

---

## How It Works

Mostr runs as an ActivityPub server that translates between the two protocols:

```
Nostr User                    Mostr Bridge                  Fediverse User
    |                              |                              |
    |-- kind 1 note -------------->|                              |
    |                              |-- ActivityPub Create ------->|
    |                              |                              |
    |                              |<-- ActivityPub Create -------|
    |<-- kind 1 note --------------|                              |
    |                              |                              |
```

### For Nostr Users

- Fediverse accounts appear as Nostr pubkeys on the bridge.
- Follow a Fediverse user by following their bridged Nostr pubkey.
- Reply to bridged posts, and the reply appears on the Fediverse.
- Reactions (NIP-25) translate to Fediverse "favorites."

### For Fediverse Users

- Nostr users appear as ActivityPub actors on the Mostr domain.
- Follow a Nostr user by following `@npub@mostr.pub` (or the bridge's domain).
- Replies, boosts, and favorites translate to Nostr events.

### What Gets Bridged

| Nostr | Direction | Fediverse |
|-------|-----------|-----------|
| Kind 1 (text note) | <-> | Status / Toot |
| Kind 6 (repost) | <-> | Boost / Announce |
| Kind 7 (reaction) | <-> | Favourite |
| Kind 0 (profile metadata) | -> | Actor profile |
| Replies (NIP-10 threading) | <-> | In-reply-to threading |

---

## Usage

### Following a Fediverse User from Nostr

1. Find the bridged pubkey for the Fediverse user on mostr.pub.
2. Follow that pubkey from your Nostr client.
3. Their Fediverse posts will appear in your feed.

### Following a Nostr User from the Fediverse

1. Search for `@npub1...@mostr.pub` from your Fediverse client.
2. Follow the account.
3. Their Nostr notes will appear in your Fediverse feed.

---

## Limitations

- Not all event kinds are bridged (long-form content, zaps, and other Nostr-specific features may not translate).
- Media handling depends on the bridge's configuration.
- There is inherent latency since messages traverse two different protocol stacks.
- Some Fediverse servers block bridges due to moderation concerns.
- The bridge must run as a trusted intermediary -- it sees all bridged content in plaintext.

---

## See Also

- [Matrix Bridge](matrix.md) -- bridging Nostr to Matrix
- [RSS Bridges](rss.md) -- bridging RSS/Atom feeds to Nostr
- [NIP-01](../../nips/core/nip-01.md) -- the Nostr event model that gets translated
