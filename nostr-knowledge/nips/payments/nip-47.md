# NIP-47: Nostr Wallet Connect (NWC)

## Status
Draft / Optional

## Summary
Nostr Wallet Connect (NWC) defines a protocol for clients to interact with a remote Lightning wallet through encrypted Nostr events. A client sends payment requests (kind 23194) to a wallet service, which executes them and returns responses (kind 23195). Communication is end-to-end encrypted, uses ephemeral keypairs unlinked to the user's identity, and supports a rich set of wallet operations including invoicing, payments, balance queries, hold invoices, and real-time notifications.

## Motivation
Users want to pay Lightning invoices, create invoices, and check balances from any Nostr client without exposing their wallet credentials or linking payment activity to their Nostr identity. NWC solves this by creating a standardized, relay-mediated bridge between any client and any wallet (custodial or self-hosted). The connection URI model means users can grant scoped, revocable access to different apps with independent keypairs and optional budget constraints.

## Specification

### Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 13194 | NWC Info Event | Replaceable event published by wallet service advertising capabilities |
| 23194 | NWC Request | Encrypted request from client to wallet service |
| 23195 | NWC Response | Encrypted response from wallet service to client |
| 23196 | NWC Notification (NIP-04) | Legacy notification event encrypted with NIP-04 (deprecated) |
| 23197 | NWC Notification (NIP-44) | Notification event encrypted with NIP-44 |

### Tags

**Info Event (kind 13194):**
- `encryption` -- space-separated list of supported encryption schemes (`nip44_v2`, `nip04`)
- `notifications` -- space-separated list of supported notification types

**Request Event (kind 23194):**
- `p` -- public key of the wallet service
- `encryption` -- encryption scheme used for this request
- `expiration` -- (optional) unix timestamp after which request should be ignored

**Response Event (kind 23195):**
- `p` -- public key of the requesting client
- `e` -- event ID of the request being responded to

**Notification Event (kind 23197):**
- `p` -- public key of the client

### Commands (Methods)

| Method | Description |
|--------|-------------|
| `pay_invoice` | Pay a BOLT11 Lightning invoice |
| `pay_keysend` | Send a keysend payment |
| `make_invoice` | Create a new Lightning invoice |
| `lookup_invoice` | Look up invoice status by payment hash or invoice string |
| `list_transactions` | List invoices and payments with filtering |
| `get_balance` | Get wallet balance in millisatoshis |
| `get_info` | Get wallet/node info (alias, pubkey, network, supported methods) |
| `make_hold_invoice` | Create a hold invoice with a pre-generated payment hash |
| `settle_hold_invoice` | Settle a hold invoice using the preimage |
| `cancel_hold_invoice` | Cancel a hold invoice using the payment hash |

### Error Codes

| Code | Meaning |
|------|---------|
| `RATE_LIMITED` | Too many requests, retry later |
| `NOT_IMPLEMENTED` | Method not known or intentionally unsupported |
| `INSUFFICIENT_BALANCE` | Not enough funds |
| `QUOTA_EXCEEDED` | Spending quota exceeded |
| `RESTRICTED` | Pubkey not allowed for this operation |
| `UNAUTHORIZED` | No wallet connected for this pubkey |
| `INTERNAL` | Internal wallet error |
| `PAYMENT_FAILED` | Payment could not be completed (routing, timeout, etc.) |
| `NOT_FOUND` | Invoice not found |
| `UNSUPPORTED_ENCRYPTION` | Encryption scheme not supported |
| `OTHER` | Catch-all error |

### Protocol Flow

#### Connection Setup

```
Wallet Service                         Client
      |                                   |
      | 1. Generate connection URI        |
      |   nostr+walletconnect://<pubkey>  |
      |   ?relay=wss://...                |
      |   &secret=<32-byte-hex>           |
      |   &lud16=user@wallet.com          |
      |                                   |
      | 2. Display QR / deeplink          |
      |---------------------------------->|
      |                                   |
      |                   3. Client saves  |
      |                      URI + secret  |
      |                                   |
      | 4. Publish info event (kind 13194)|
      |   to relay(s) in URI              |
      |                                   |
      |       5. Client fetches info event|
      |<----------------------------------|
      |                                   |
      |   6. Client reads capabilities    |
      |      and encryption support       |
```

**Connection URI format:**
```
nostr+walletconnect://<wallet-service-pubkey>?relay=<relay-url>&secret=<client-secret>&lud16=<lightning-address>
```

- `<wallet-service-pubkey>` -- 32-byte hex pubkey of the wallet service (SHOULD be unique per client connection)
- `relay` -- (required, may repeat) relay URL where wallet service listens
- `secret` -- (required) 32-byte hex secret the client uses as its private key
- `lud16` -- (recommended) Lightning address for profile auto-configuration

#### Pay Invoice Flow

```
User        Client                  Relay              Wallet Service        LN Network
 |            |                       |                      |                   |
 | 1. "Pay"   |                       |                      |                   |
 |----------->|                       |                      |                   |
 |            |                       |                      |                   |
 |            | 2. Create kind 23194  |                      |                   |
 |            |    encrypt(pay_invoice)|                     |                   |
 |            |    sign with secret   |                      |                   |
 |            |---------------------->|                      |                   |
 |            |                       |                      |                   |
 |            |                       | 3. Forward event     |                   |
 |            |                       |--------------------->|                   |
 |            |                       |                      |                   |
 |            |                       |           4. Decrypt |                   |
 |            |                       |              Verify  |                   |
 |            |                       |              auth    |                   |
 |            |                       |                      |                   |
 |            |                       |                      | 5. Send payment   |
 |            |                       |                      |------------------>|
 |            |                       |                      |                   |
 |            |                       |                      | 6. Preimage       |
 |            |                       |                      |<------------------|
 |            |                       |                      |                   |
 |            |                       | 7. Kind 23195        |                   |
 |            |                       |    encrypt(preimage) |                   |
 |            |                       |<---------------------|                   |
 |            |                       |                      |                   |
 |            | 8. Receive response   |                      |                   |
 |            |<----------------------|                      |                   |
 |            |                       |                      |                   |
 | 9. "Paid!" |                       |                      |                   |
 |<-----------|                       |                      |                   |
```

#### Hold Invoice Flow

```
Client                    Wallet Service              Payer
  |                             |                       |
  | 1. Generate preimage        |                       |
  |    Compute payment_hash     |                       |
  |                             |                       |
  | 2. make_hold_invoice        |                       |
  |    {payment_hash}           |                       |
  |---------------------------->|                       |
  |                             |                       |
  | 3. Response: invoice        |                       |
  |<----------------------------|                       |
  |                             |                       |
  |              [invoice shared with payer]             |
  |                             |                       |
  |                             | 4. Payer pays invoice |
  |                             |<----------------------|
  |                             |                       |
  | 5. Notification:            |                       |
  |    hold_invoice_accepted    |                       |
  |<----------------------------|                       |
  |                             |                       |
  | 6a. settle_hold_invoice     |                       |
  |     {preimage}              |                       |
  |---------------------------->|                       |
  |       OR                    |                       |
  | 6b. cancel_hold_invoice     |                       |
  |     {payment_hash}          |                       |
  |---------------------------->|                       |
```

#### Encryption Negotiation

1. Wallet service publishes `encryption` tag in info event (kind 13194): `["encryption", "nip44_v2 nip04"]`
2. Client reads info event and selects the best encryption (prefer `nip44_v2`).
3. Client includes `["encryption", "nip44_v2"]` tag in each request.
4. If wallet service does not support the scheme, it returns `UNSUPPORTED_ENCRYPTION` error.
5. Absence of `encryption` tag implies NIP-04 only (legacy).

For notifications: if wallet service supports both, it publishes kind 23196 (NIP-04) AND kind 23197 (NIP-44). If NIP-44 only, it publishes only kind 23197.

### JSON Examples

**Info Event (kind 13194):**
```json
{
  "kind": 13194,
  "pubkey": "c04ccd5c82fc1ea3499b9c6a5c0a7ab627fbe00a0116110d4c750faeaecba1e2",
  "created_at": 1713883677,
  "tags": [
    ["encryption", "nip44_v2 nip04"],
    ["notifications", "payment_received payment_sent"]
  ],
  "content": "pay_invoice pay_keysend get_balance get_info make_invoice lookup_invoice list_transactions notifications",
  "sig": "31f57b369459b..."
}
```

**pay_invoice Request (kind 23194):**
```json
{
  "kind": 23194,
  "tags": [
    ["encryption", "nip44_v2"],
    ["p", "c04ccd5c82fc1ea3..."]
  ],
  "content": "<nip44_encrypt({\"method\":\"pay_invoice\",\"params\":{\"invoice\":\"lnbc50n1...\"}})>"
}
```

**pay_invoice Response (kind 23195):**
```json
{
  "kind": 23195,
  "tags": [
    ["p", "<client-pubkey>"],
    ["e", "<request-event-id>"]
  ],
  "content": "<nip44_encrypt({\"result_type\":\"pay_invoice\",\"error\":null,\"result\":{\"preimage\":\"0123456789abcdef...\",\"fees_paid\":100}})>"
}
```

**Error Response:**
```json
{
  "kind": 23195,
  "tags": [
    ["p", "<client-pubkey>"],
    ["e", "<request-event-id>"]
  ],
  "content": "<nip44_encrypt({\"result_type\":\"pay_invoice\",\"error\":{\"code\":\"INSUFFICIENT_BALANCE\",\"message\":\"Not enough funds\"},\"result\":null})>"
}
```

**get_balance Request/Response:**
```json
// Request content (decrypted):
{"method": "get_balance", "params": {}}

// Response content (decrypted):
{"result_type": "get_balance", "error": null, "result": {"balance": 10000}}
```

**make_invoice Request/Response:**
```json
// Request content (decrypted):
{
  "method": "make_invoice",
  "params": {
    "amount": 21000,
    "description": "Payment for services"
  }
}

// Response content (decrypted):
{
  "result_type": "make_invoice",
  "error": null,
  "result": {
    "type": "incoming",
    "state": "pending",
    "invoice": "lnbc210n1...",
    "payment_hash": "abc123...",
    "amount": 21000,
    "created_at": 1700000000,
    "expires_at": 1700003600
  }
}
```

**list_transactions Request/Response:**
```json
// Request content (decrypted):
{
  "method": "list_transactions",
  "params": {
    "from": 1693876973,
    "until": 1703225078,
    "limit": 10,
    "offset": 0,
    "type": "incoming"
  }
}

// Response content (decrypted):
{
  "result_type": "list_transactions",
  "error": null,
  "result": {
    "transactions": [
      {
        "type": "incoming",
        "state": "settled",
        "invoice": "lnbc...",
        "preimage": "abc123...",
        "payment_hash": "def456...",
        "amount": 21000,
        "fees_paid": 0,
        "created_at": 1700000000,
        "settled_at": 1700000060
      }
    ]
  }
}
```

**payment_received Notification (kind 23197):**
```json
{
  "kind": 23197,
  "tags": [
    ["p", "<client-pubkey>"]
  ],
  "content": "<nip44_encrypt({\"notification_type\":\"payment_received\",\"notification\":{\"type\":\"incoming\",\"state\":\"settled\",\"invoice\":\"lnbc...\",\"preimage\":\"abc...\",\"payment_hash\":\"def...\",\"amount\":21000,\"settled_at\":1700000060}})>"
}
```

## Implementation Notes

- The `secret` in the connection URI is used as the client's **private key**, not a shared secret. The wallet service derives the corresponding public key.
- The wallet service SHOULD NOT store the client secret. It only needs the client's public key (derived from the secret) to encrypt/decrypt.
- Each connection SHOULD use a unique keypair to prevent linking payment activity across apps.
- Amounts throughout NWC are in **millisatoshis** (msats).
- Relays used for NWC should ideally not close connections on inactivity, to avoid dropping ephemeral events.
- Metadata on transactions MUST NOT exceed 4096 characters.
- NWC relays SHOULD allow at least 64KB payload size.
- Clients SHOULD fetch small page sizes (max 20 transactions) to avoid relay rejection.
- Hold invoices SHOULD be settled or canceled within a few minutes of the `hold_invoice_accepted` notification to avoid locking channel liquidity.

## Client Behavior

- Clients MUST store the connection URI securely.
- Clients MUST use the `secret` from the URI to sign all request events.
- Clients MUST read the info event (kind 13194) to discover supported methods and encryption.
- Clients SHOULD prefer NIP-44 encryption when supported.
- Clients SHOULD include an `encryption` tag in each request event.
- Clients MAY include an `expiration` tag on requests.
- Clients SHOULD verify that the `result_type` in responses matches the method they called.

## Relay Behavior

- Relays MUST treat kind 13194 as a replaceable event.
- Relays SHOULD support at least 64KB payload sizes for NWC events.
- Relays SHOULD NOT close idle connections (to support always-on wallet services).
- No special authentication is required, but custodial services MAY use a dedicated relay with NIP-42 auth to prevent metadata leaks.

## Dependencies

- **NIP-01** -- Basic protocol, event structure
- **NIP-04** -- Legacy encryption (deprecated but supported for backward compatibility)
- **NIP-44** -- Preferred encryption for all NWC communication
- **NIP-40** -- Expiration tag (optional on requests)

## Source Code References

- **nostr-tools:** `nip47.ts` -- NWC client helpers, connection URI parsing
- **Alby NWC SDK:** `@getalby/sdk` -- Full NWC client implementation (TypeScript)
- **NWC Server (Alby Hub):** Reference wallet service implementation
- **nostr-wallet-connect (Mutiny):** Rust-based NWC bridge

## Related NIPs

- **NIP-57** -- Lightning Zaps (NWC can be used to pay zap invoices; zap metadata can be stored in NWC transaction metadata)
- **NIP-60** -- Cashu Wallet (alternative wallet protocol using ecash instead of Lightning)
- **NIP-61** -- Nutzaps (ecash-based tips that complement Lightning zaps)
