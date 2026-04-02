# Lightning Zaps (NIP-57)

Zaps are the native tipping mechanism for Nostr, built on the Lightning Network.

## How Zaps Work

Zaps involve four parties working together:

```
Sender (Client)         LNURL Server          Lightning Network      Relay
      |                      |                       |                  |
      |  1. Fetch lud16      |                       |                  |
      |--------------------->|                       |                  |
      |  LNURL-pay metadata  |                       |                  |
      |<---------------------|                       |                  |
      |                      |                       |                  |
      |  2. Create zap request (kind 9734)           |                  |
      |  3. Send to callback |                       |                  |
      |--------------------->|                       |                  |
      |  bolt11 invoice      |                       |                  |
      |<---------------------|                       |                  |
      |                      |                       |                  |
      |  4. Pay invoice      |                       |                  |
      |--------------------------------------------->|                  |
      |                      |  5. Payment confirmed |                  |
      |                      |<----------------------|                  |
      |                      |                       |                  |
      |                      |  6. Publish zap receipt (kind 9735)      |
      |                      |---------------------------------------->|
      |                      |                       |                  |
      |  7. Client sees zap receipt via subscription  |                  |
      |<-----------------------------------------------------------------|
```

## Event Kinds

### Zap Request (Kind 9734)

Created by the sender. NOT published to relays directly — it is sent to the LNURL
callback as a query parameter.

```json
{
  "kind": 9734,
  "content": "Great post!",           // optional comment
  "tags": [
    ["p", "<recipient-pubkey>"],       // required: who to zap
    ["e", "<event-id>"],               // optional: which event to zap
    ["relays", "wss://relay1", "..."], // required: where to publish receipt
    ["amount", "21000"]                // required: millisatoshis
  ],
  "pubkey": "<sender-pubkey>",
  "sig": "..."
}
```

### Zap Receipt (Kind 9735)

Created by the LNURL server after the Lightning invoice is paid. Published to relays.

```json
{
  "kind": 9735,
  "content": "",
  "tags": [
    ["p", "<recipient-pubkey>"],
    ["e", "<event-id>"],
    ["bolt11", "lnbc..."],               // the paid invoice
    ["description", "{...}"],             // the original zap request (JSON)
    ["preimage", "abc123..."]             // proof of payment (optional)
  ],
  "pubkey": "<lnurl-server-pubkey>",
  "sig": "..."
}
```

## Verification Checklist

To verify a zap receipt is legitimate:

1. **Signature** — The receipt event signature must be valid
2. **Server pubkey** — The receipt must be signed by the LNURL server's pubkey
   (from the `nostrPubkey` field in the LNURL-pay response)
3. **Embedded zap request** — The `description` tag must contain a valid kind 9734 event
4. **Matching tags** — The `p` (and `e`) tags in the receipt must match those in the zap request
5. **Amount** — The bolt11 invoice amount should match the zap request's `amount` tag

## Lightning Address Resolution

A Lightning address like `user@domain.com` resolves to:

```
https://domain.com/.well-known/lnurlp/user
```

The response includes:
- `allowsNostr: true` — confirms NIP-57 support
- `nostrPubkey` — the server's pubkey for signing zap receipts
- `callback` — the URL to send the zap request to
- `minSendable` / `maxSendable` — amount limits in millisatoshis

## Anonymous Zaps

To send an anonymous zap, generate a random keypair for the zap request instead of
using your real identity key. The recipient will see the zap amount but not who sent it.

## References

- [NIP-57: Lightning Zaps](https://github.com/nostr-protocol/nips/blob/master/57.md)
- [LUD-06: LNURL Pay](https://github.com/lnurl/luds/blob/luds/06.md)
- [LUD-16: Lightning Address](https://github.com/lnurl/luds/blob/luds/16.md)
