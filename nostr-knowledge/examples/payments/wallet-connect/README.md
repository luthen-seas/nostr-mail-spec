# Nostr Wallet Connect (NIP-47)

NWC lets any Nostr client control a remote Lightning wallet using encrypted Nostr events.

## How NWC Works

```
Client App                    Relay                    Wallet Service
    |                           |                           |
    |  1. User provides NWC URI (contains wallet pubkey,    |
    |     relay, and client secret)                         |
    |                           |                           |
    |  2. Publish kind 23194    |                           |
    |     (encrypted request)   |                           |
    |-------------------------->|                           |
    |                           |  3. Wallet receives       |
    |                           |     request event         |
    |                           |-------------------------->|
    |                           |                           |
    |                           |  4. Wallet processes      |
    |                           |     (e.g. pays invoice)   |
    |                           |                           |
    |                           |  5. Publish kind 23195    |
    |                           |     (encrypted response)  |
    |                           |<--------------------------|
    |  6. Client receives       |                           |
    |     response              |                           |
    |<--------------------------|                           |
```

## Connection URI

The wallet provider generates a URI when the user authorizes a connection:

```
nostr+walletconnect://<wallet-pubkey>?relay=<relay-url>&secret=<hex-secret>&lud16=<address>
```

| Parameter | Description |
|-----------|-------------|
| `wallet-pubkey` | The wallet service's Nostr pubkey (hex) |
| `relay` | The relay URL for NWC communication |
| `secret` | A dedicated secret key for this connection (hex) |
| `lud16` | Optional Lightning address for receiving payments |

## Event Kinds

### Wallet Info (Kind 13194) — Replaceable

Published by the wallet service to advertise supported methods:

```json
{
  "kind": 13194,
  "content": "pay_invoice get_balance make_invoice lookup_invoice list_transactions",
  "tags": [],
  "pubkey": "<wallet-service-pubkey>"
}
```

### Request (Kind 23194)

Published by the client. Content is NIP-44 encrypted JSON-RPC:

```json
{
  "kind": 23194,
  "content": "<NIP-44 encrypted payload>",
  "tags": [
    ["p", "<wallet-service-pubkey>"]
  ],
  "pubkey": "<client-pubkey>"
}
```

Decrypted content:

```json
{
  "method": "pay_invoice",
  "params": {
    "invoice": "lnbc..."
  }
}
```

### Response (Kind 23195)

Published by the wallet service. Content is NIP-44 encrypted JSON-RPC:

```json
{
  "kind": 23195,
  "content": "<NIP-44 encrypted payload>",
  "tags": [
    ["p", "<client-pubkey>"],
    ["e", "<request-event-id>"]
  ],
  "pubkey": "<wallet-service-pubkey>"
}
```

Decrypted content (success):

```json
{
  "result_type": "pay_invoice",
  "result": {
    "preimage": "0123456789abcdef..."
  }
}
```

Decrypted content (error):

```json
{
  "result_type": "pay_invoice",
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Not enough funds"
  }
}
```

## Supported Methods

| Method | Description |
|--------|-------------|
| `pay_invoice` | Pay a bolt11 Lightning invoice |
| `pay_keysend` | Send a keysend payment (no invoice) |
| `make_invoice` | Create a new invoice to receive payment |
| `lookup_invoice` | Check status of a specific invoice |
| `get_balance` | Get wallet balance (in millisatoshis) |
| `get_info` | Get wallet/node information |
| `list_transactions` | List recent transactions |

## Error Codes

| Code | Meaning |
|------|---------|
| `RATE_LIMITED` | Too many requests |
| `NOT_IMPLEMENTED` | Method not supported |
| `INSUFFICIENT_BALANCE` | Not enough funds |
| `QUOTA_EXCEEDED` | Spending limit reached |
| `RESTRICTED` | Method not permitted for this connection |
| `UNAUTHORIZED` | Invalid or expired connection |
| `INTERNAL` | Wallet service internal error |
| `OTHER` | Generic error |

## Security Notes

- NWC uses NIP-44 encryption (XChaCha20-Poly1305), NOT the older NIP-04 (AES-CBC)
- Each connection gets its own dedicated keypair (the `secret` in the URI)
- Wallet services can restrict which methods a connection can use
- Connections can have spending limits and expiration dates
- The client secret should be stored securely (it controls wallet access)

## Wallet Providers

Popular NWC-compatible wallets:
- **Alby** — browser extension and custodial wallet
- **Mutiny Wallet** — self-custodial, mobile-first
- **LNbits** — self-hosted Lightning accounting
- **Umbrel** — self-hosted node with NWC plugin

## References

- [NIP-47: Nostr Wallet Connect](https://github.com/nostr-protocol/nips/blob/master/47.md)
- [NIP-44: Versioned Encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
