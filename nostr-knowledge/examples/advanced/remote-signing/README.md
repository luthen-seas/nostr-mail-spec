# NIP-46 Nostr Connect (Remote Signing)

## What is NIP-46?

NIP-46 defines a protocol for **remote signing**. Instead of pasting your
secret key into every NOSTR client, you run a "bunker" (remote signer) on a
trusted device. Client applications communicate with the bunker over NOSTR
relays to request signatures, without ever seeing the secret key.

This is the NOSTR equivalent of a hardware wallet: the key never leaves the
signer.

## The bunker protocol

### Actors

- **Bunker (signer)** — holds the user's secret key. Runs on a trusted
  device (phone, dedicated server, hardware device).
- **Client (application)** — the NOSTR app the user interacts with
  (web client, mobile app). Needs signatures but never holds the key.

### Communication channel

All messages are exchanged via **kind 24133** events on NOSTR relays, encrypted
with NIP-04 (soon migrating to NIP-44 for better encryption).

The flow:

1. Client encrypts an RPC request with the bunker's pubkey.
2. Client publishes a kind 24133 event tagged with `["p", bunkerPubkey]`.
3. Bunker receives the event, decrypts, processes the request.
4. Bunker encrypts the response and publishes a kind 24133 event tagged with
   `["p", clientPubkey]`.

### RPC methods

| Method | Params | Description |
|---|---|---|
| `connect` | `[clientPubkey, secret?]` | Establish a session |
| `get_public_key` | `[]` | Return the user's pubkey |
| `sign_event` | `[eventJSON]` | Sign an event |
| `nip04_encrypt` | `[pubkey, plaintext]` | Encrypt with NIP-04 |
| `nip04_decrypt` | `[pubkey, ciphertext]` | Decrypt with NIP-04 |
| `nip44_encrypt` | `[pubkey, plaintext]` | Encrypt with NIP-44 |
| `nip44_decrypt` | `[pubkey, ciphertext]` | Decrypt with NIP-44 |

### Request format

```json
{
  "id": "<random-hex>",
  "method": "sign_event",
  "params": ["{\"kind\":1,\"content\":\"hello\",...}"]
}
```

### Response format

```json
{
  "id": "<matching-id>",
  "result": "{\"id\":\"abc\",\"sig\":\"def\",...}"
}
```

Or on error:

```json
{
  "id": "<matching-id>",
  "error": "user rejected the request"
}
```

## The bunker URI

To connect a client to a bunker, the bunker generates a URI:

```
bunker://<user-pubkey>?relay=wss://relay.example.com&secret=<optional-token>
```

- `<user-pubkey>` — the public key of the user (whose events will be signed).
- `relay` — the relay where NIP-46 messages are exchanged.
- `secret` — an optional one-time token for authentication.

The user copies this URI into the client application to establish the
connection.

## Security model

- The **secret key never leaves the bunker**. The client only receives
  signed events.
- The bunker can **prompt the user** before signing (approve/reject).
- The bunker can enforce **policies**: only sign certain event kinds,
  rate-limit signatures, require re-authentication.
- Communication is **end-to-end encrypted** via NIP-04/NIP-44.
- The **relay** sees encrypted blobs and cannot read the RPC content.

## Running the example

```bash
npm install nostr-tools ws
npm install -D typescript ts-node @types/node @types/ws

# Terminal 1 — start the bunker
NIP46_MODE=bunker npx ts-node remote_signing.ts

# Copy the bunker:// URI printed by the bunker

# Terminal 2 — run the client
NIP46_MODE=client NIP46_BUNKER_URI="bunker://..." npx ts-node remote_signing.ts
```

## Real-world bunker implementations

- **nsecBunker** — a production NIP-46 signer with web UI and policy engine.
- **Amber** — Android signer app with NIP-46 support.
- **Keystache** — desktop bunker application.
