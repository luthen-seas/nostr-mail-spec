# nsec.app -- Web-Based Remote Signer (NIP-46 Bunker)

- **Website**: https://nsec.app
- **NIP**: NIP-46 (Nostr Connect / Remote Signing)
- **Platform**: Web (any browser)

---

## What It Is

nsec.app is a web-based Nostr key manager and remote signer that implements the NIP-46 "bunker" protocol. You store your private key in nsec.app, and client applications request signatures through Nostr relays -- they never see the nsec itself.

It bridges the gap between convenience and security: you get the portability of a web app without giving every client your private key.

---

## How the NIP-46 Bunker Protocol Works

NIP-46 defines a protocol where a "bunker" (the signer, like nsec.app) communicates with a "client" (the app that needs signing) through Nostr relays, using encrypted messages.

### Connection Flow

```
1. User opens nsec.app and imports/generates their nsec
2. nsec.app generates a bunker:// URI (or nostrconnect:// URI)
3. User pastes the URI into a client app (or scans a QR code)
4. Client sends an encrypted NIP-46 request to the relay
5. nsec.app receives the request, decrypts it, shows it to the user
6. User approves -> nsec.app signs and sends the result back via relay
7. Client receives the signed event

Client App              Relay              nsec.app (Bunker)
    |                     |                      |
    |                     |    [User provides     |
    |                     |     bunker URI]       |
    |                     |                      |
    |-- connect --------->|--------------------->|
    |                     |                      |-- User approves
    |<-- ack -------------|<---------------------|
    |                     |                      |
    |-- sign_event ------>|--------------------->|
    |                     |                      |-- User approves
    |<-- signed event ----|<---------------------|
    |                     |                      |
```

### The bunker:// URI Format

```
bunker://<signer-pubkey>?relay=wss://relay.example.com&secret=<random-token>
```

- `signer-pubkey`: the hex pubkey of the bunker (nsec.app's ephemeral key for this session)
- `relay`: the relay both parties communicate through
- `secret`: a one-time secret to authenticate the initial connection

---

## Supported Methods

nsec.app supports the standard NIP-46 method set:

| Method | Description |
|--------|-------------|
| `connect` | Establish the session between client and bunker |
| `get_public_key` | Return the user's Nostr public key |
| `sign_event` | Sign a Nostr event and return the signed JSON |
| `nip04_encrypt` | Encrypt a message using NIP-04 |
| `nip04_decrypt` | Decrypt a NIP-04 message |
| `nip44_encrypt` | Encrypt a message using NIP-44 |
| `nip44_decrypt` | Decrypt a NIP-44 message |

All requests and responses are NIP-44 encrypted between the client and the bunker. The relay only sees encrypted blobs -- it cannot read the signing requests or results.

---

## Security Model

### What nsec.app Protects

| Property | Detail |
|----------|--------|
| Key isolation | The nsec lives only in nsec.app; client apps never receive it |
| Transport encryption | All NIP-46 messages are end-to-end encrypted (NIP-44) |
| Per-request approval | Each signing request can require explicit user approval |
| No client-side key | Client applications only hold a session key, not the nsec |
| Relay opacity | Relays relay encrypted blobs -- they cannot read signing requests |

### How Keys Are Stored

nsec.app stores the private key in the browser's local storage, encrypted. The key is decrypted in memory only when needed for signing operations. Some implementations offer password-protected access.

### Threat Model

**Protected against:**
- Compromised client applications -- they never see the nsec.
- Relay operators -- all messages are encrypted.
- Network eavesdroppers -- encrypted transport.

**NOT protected against:**
- Compromised browser on the machine running nsec.app (XSS, malicious extensions).
- If the user loses access to the browser where nsec.app stores the key.
- nsec.app service compromise (if it is hosted rather than self-hosted).
- Physical access to the unlocked machine running nsec.app.

### Comparison with Other Signers

| | nsec.app | nos2x | Amber |
|---|---------|-------|-------|
| Protocol | NIP-46 | NIP-07 | NIP-55 + NIP-46 |
| Platform | Any browser | Chrome | Android |
| Key location | Browser (web app) | Browser extension | Android app sandbox |
| Remote signing | Yes (over relays) | No (local only) | Yes (NIP-46 mode) |
| Cross-device | Yes | No | Yes (NIP-46 mode) |

---

## Usage

### Setting Up nsec.app

1. Navigate to https://nsec.app in your browser.
2. Import an existing nsec or generate a new keypair.
3. Set a password to protect the stored key.
4. nsec.app displays your bunker URI.

### Connecting a Client

1. In the client app, look for "Login with bunker" or "NIP-46" or "Remote signer."
2. Paste the `bunker://` URI from nsec.app (or scan the QR code).
3. nsec.app will show a connection request -- approve it.
4. The client is now connected. Future signing requests will appear in nsec.app for approval.

### Using with nak

```bash
# Connect nak to nsec.app using the bunker URI
nak event --content "Signed via nsec.app" --connect "bunker://..." wss://relay.damus.io
```

---

## See Also

- [NIP-46](../../nips/security/) -- the Nostr Connect specification
- [nos2x](nos2x.md) -- browser extension signer (NIP-07, local only)
- [Amber](amber.md) -- Android signer (NIP-55 + NIP-46)
- [nak bunker](../nak.md#nak-bunker----nip-46-remote-signing) -- run your own bunker from the CLI
