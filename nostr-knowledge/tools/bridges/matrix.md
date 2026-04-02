# Matrix-Nostr Bridge

Bridging between Nostr and the Matrix chat protocol.

---

## What It Is

A Matrix-Nostr bridge connects Nostr relay communication with Matrix rooms, allowing messages posted on one network to appear on the other. This is particularly useful for group chat scenarios where some participants prefer Matrix clients (Element, FluffyChat) and others use Nostr clients.

---

## How It Works

The bridge runs as a Matrix Application Service (appservice) that connects to both a Matrix homeserver and one or more Nostr relays.

```
Nostr Client           Nostr Relay           Bridge           Matrix Homeserver         Matrix Client
    |                      |                   |                     |                       |
    |-- EVENT (kind 9) --->|------------------>|                     |                       |
    |                      |                   |-- m.room.message -->|---------------------->|
    |                      |                   |                     |                       |
    |                      |                   |<-- m.room.message --|<----------------------|
    |<-- EVENT (kind 9) ---|<------------------|                     |                       |
```

### What Gets Bridged

| Nostr Side | Matrix Side |
|------------|-------------|
| Kind 9 (chat message, NIP-29 groups) | `m.room.message` |
| Kind 1 (text note, where applicable) | `m.room.message` |
| User profiles (kind 0) | Matrix display names and avatars |

---

## Use Cases

- **Community chat**: Run a group chat accessible from both Nostr and Matrix clients.
- **Migration**: Allow a community to gradually move from Matrix to Nostr (or vice versa) without losing connectivity.
- **Client choice**: Let users participate in the same conversation using whichever protocol and client they prefer.

---

## Considerations

- **Identity**: Users appear as "puppeted" accounts on the other side. A Nostr user shows up as a Matrix ghost user, and vice versa.
- **Encryption**: Matrix E2EE (end-to-end encryption) cannot be bridged transparently. Bridged rooms typically use unencrypted Matrix rooms.
- **Media**: Image and file bridging depends on the bridge implementation. Some bridges handle media uploads; others bridge text only.
- **Moderation**: Each side has its own moderation model. Banning a user on Matrix does not ban them on Nostr.
- **Latency**: Messages pass through the bridge, adding some delay.

---

## Deployment

Matrix-Nostr bridges are typically self-hosted. You need:

1. A Matrix homeserver (Synapse, Dendrite, Conduit) with appservice support.
2. The bridge application configured with:
   - Matrix homeserver URL and appservice registration.
   - Nostr relay URLs to connect to.
   - Room/channel mapping configuration.
3. Nostr relay access (the bridge acts as a regular Nostr client).

---

## See Also

- [Mostr (Fediverse Bridge)](fediverse.md) -- bridging Nostr to ActivityPub
- [RSS Bridges](rss.md) -- one-way feed bridging
- [NIP-29](../../nips/) -- Relay-based groups (the Nostr-side group chat protocol)
