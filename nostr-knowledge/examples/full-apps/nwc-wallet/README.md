# NWC Wallet Connect Client

A complete NWC (Nostr Wallet Connect, NIP-47) client application that interfaces with Lightning wallets through the NOSTR protocol.

## What is NWC?

NWC uses NOSTR as a transport layer between apps and Lightning wallets. Instead of apps needing direct access to a Lightning node, they communicate through encrypted NOSTR events:

```
┌─────────────┐        ┌───────────┐        ┌──────────────┐
│  This App   │◄──────►│   Relay   │◄──────►│ Wallet       │
│  (NWC       │  kind  │  (wallet  │  kind  │ Service      │
│   client)   │ 23194  │   relay)  │ 23195  │ (Alby, etc.) │
│             │ 23195  │           │ 23194  │              │
└─────────────┘        └───────────┘        └──────────────┘
    Signs with             Routes              Signs with
    app secret           encrypted             wallet key
                          events
```

### Event Flow

1. **App sends request** (kind 23194): Encrypts JSON command with NIP-44, signs with app secret key, publishes to wallet's relay
2. **Wallet receives request**: Decrypts, validates permissions, executes the Lightning operation
3. **Wallet sends response** (kind 23195): Encrypts JSON result with NIP-44, signs with wallet key, publishes to same relay
4. **App receives response**: Decrypts, processes result

### The Connection String

```
nostr+walletconnect://<wallet-pubkey>?relay=<relay-url>&secret=<app-secret-hex>
```

- **wallet-pubkey**: The wallet service's NOSTR pubkey (used as encryption target)
- **relay**: Where the wallet listens for requests
- **secret**: A private key generated specifically for this app connection

The wallet service generates this string with specific permissions (e.g., "can pay up to 1000 sats per transaction"). The user copies it to the app.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                Interactive CLI                    │
│  balance, pay, transactions, incoming, outgoing  │
├──────────────────────────────────────────────────┤
│              NWCClient                            │
│  sendRequest() → encrypt → sign → publish        │
│  handleResponse() → decrypt → resolve promise    │
│  pendingRequests Map<requestId, Promise>          │
├──────────────────────────────────────────────────┤
│           NIP-44 Encryption Layer                 │
│  XChaCha20-Poly1305 + HKDF key derivation        │
│  Shared secret from ECDH(app_secret, wallet_pub) │
├──────────────────────────────────────────────────┤
│         SimplePool (nostr-tools)                  │
│  Subscribes to kind 23195 from wallet pubkey     │
│  Publishes kind 23194 to wallet relay            │
└──────────────────────────────────────────────────┘
```

## Running

```bash
npm install

# Set your NWC connection string (from your wallet)
export NOSTR_NWC_URI="nostr+walletconnect://abc123...?relay=wss://relay.example.com&secret=def456..."

npx tsx nwc_app.ts
```

### Example Session

```
nwc> balance
  Balance: 50,000 sats (50000000 msats)

nwc> pay lnbc10u1pj...
  Payment successful!
  Preimage: abc123...
  Fees paid: 1 sats

nwc> transactions 5
  Recent Transactions (5):
  ------------------------------------------------------------
   IN |      10000 sats | 3/15/2026, 2:30:00 PM
       Zap from alice
  OUT |       5000 sats | 3/15/2026, 1:15:00 PM
       Coffee payment
  ------------------------------------------------------------

nwc> quit
```

## package.json

```json
{
  "name": "nostr-nwc-wallet",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx nwc_app.ts"
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

## Security Considerations

### Connection String is a Bearer Token

The NWC connection string contains a secret key that grants access to wallet operations. Treat it like a password:

- **Never log it** — Mask it in UI, never print to console or send to analytics
- **Store encrypted** — Use OS keychain (macOS Keychain, Windows Credential Manager) or encrypted storage
- **Revoke when compromised** — Wallet services provide a way to revoke connection strings
- **Scope permissions** — When creating the connection, grant minimal permissions (e.g., "pay up to 100 sats" instead of unlimited)

### NIP-44 vs NIP-04

NWC uses NIP-44 encryption, which is significantly stronger than the older NIP-04:

| Feature | NIP-04 | NIP-44 |
|---------|--------|--------|
| Algorithm | AES-256-CBC | XChaCha20-Poly1305 |
| Authentication | None (malleable) | AEAD (tamper-proof) |
| Padding | None (leaks length) | Random padding |
| IV/Nonce | 16-byte IV | 24-byte nonce |

### Relay Trust

The wallet relay sees encrypted events but knows:
- When you send requests (timing)
- That you are communicating with the wallet (pubkey metadata)
- Request/response patterns (event sizes, frequency)

The relay cannot read the encrypted content, but metadata leakage is real. Some wallet services run their own relay to minimize this exposure.

### Error Handling in Production

- **QUOTA_EXCEEDED**: The connection has hit its spending limit. Show the user and suggest they increase it in their wallet settings.
- **INSUFFICIENT_BALANCE**: The wallet doesn't have enough funds. This is a normal condition, not an error.
- **PAYMENT_FAILED**: Lightning routing failed. Retry with a different route or ask the user to try again later.
- **UNAUTHORIZED**: The connection string may have been revoked. Prompt the user to reconnect.
- **Timeout**: The wallet service may be offline. Queue the request for retry.

## What a Production NWC App Would Add

- **Permission display** — Show the user what permissions the connection has (get_info response includes supported methods and budget)
- **Budget tracking** — Track spending against the connection's budget locally
- **Connection management** — Support multiple wallet connections, switch between them
- **QR code scanning** — Parse NWC URIs from QR codes (common mobile wallet flow)
- **Secure storage** — Encrypt the connection string at rest using OS-level key management
- **Retry logic** — Exponential backoff for failed requests, queue for offline scenarios
- **Invoice decoding** — Parse BOLT-11 invoices locally to show amount/description before paying
- **LNURL support** — Resolve LNURL-pay and LNURL-withdraw before creating NWC requests
