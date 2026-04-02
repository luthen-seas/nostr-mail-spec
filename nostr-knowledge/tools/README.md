# Nostr Developer Tools

A curated reference for essential tools in the Nostr ecosystem, organized by category.

---

## CLI Tools

| Tool | Description | Link |
|------|-------------|------|
| [nak](nak.md) | **Nostr Army Knife** -- the definitive CLI for interacting with relays, managing keys, creating events, encoding/decoding NIP-19 entities, and much more. The single most important developer tool in Nostr. | [GitHub](https://github.com/fiatjaf/nak) |

---

## Signers

Key management applications that keep private keys isolated from client applications.

| Tool | Platform | NIP | Description |
|------|----------|-----|-------------|
| [nos2x](signers/nos2x.md) | Chrome/Chromium | NIP-07 | Browser extension providing `window.nostr` for web clients |
| [Amber](signers/amber.md) | Android | NIP-55, NIP-46 | Android signer app -- nsec never leaves the device |
| [nsec.app](signers/nsec-app.md) | Web | NIP-46 | Web-based remote signer using the bunker protocol |

---

## Debugging and Testing

| Tool | Description |
|------|-------------|
| [Nostrillery](debugging/nostrillery.md) | Relay load testing tool built on Artillery |
| [Relay Inspector](debugging/relay-inspector.md) | Relay inspection, capability discovery, and monitoring tools |

---

## Bridges

Tools that connect Nostr to other networks and protocols.

| Tool | Bridge Target | Description |
|------|---------------|-------------|
| [Mostr](bridges/fediverse.md) | Fediverse (ActivityPub) | Bidirectional Nostr-Fediverse bridge |
| [Matrix Bridge](bridges/matrix.md) | Matrix | Bridge between Nostr and Matrix chat rooms |
| [RSS Bridges](bridges/rss.md) | RSS/Atom | Publish RSS/Atom feeds as Nostr events |

---

## How Signers Fit Together

Nostr separates key custody from client applications. This is a core architectural principle:

```
+------------------+       +------------------+       +------------------+
|   Web Client     | NIP-07|     nos2x        |       |                  |
|   (browser)      |<----->| (browser ext)    |       |                  |
+------------------+       +------------------+       |                  |
                                                      |   Private Key    |
+------------------+       +------------------+       |   (nsec)         |
|   Android App    | NIP-55|     Amber         |       |                  |
|   (native)       |<----->| (Android signer) |------>|   Stored in ONE  |
+------------------+       +------------------+       |   place only     |
                                                      |                  |
+------------------+       +------------------+       |                  |
|   Any Client     | NIP-46|    nsec.app       |       |                  |
|   (any platform) |<----->| (remote bunker)  |       |                  |
+------------------+       +------------------+       +------------------+
```

- **NIP-07**: Browser extension injects `window.nostr` -- web apps call it to sign events
- **NIP-55**: Android intent/content-resolver system -- native apps delegate signing to Amber
- **NIP-46**: Remote signing over Nostr relays -- any client can use a bunker for key custody

---

## See Also

- [Protocol Overview](../protocol/README.md) -- how Nostr works at the wire level
- [NIP Index](../nips/README.md) -- detailed NIP documentation
- [Ecosystem](../ecosystem/awesome-nostr.md) -- broader Nostr ecosystem
