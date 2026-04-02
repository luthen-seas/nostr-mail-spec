# NIP-57: Lightning Zaps

## Status
Draft / Optional

## Summary
NIP-57 defines a two-event protocol for recording Lightning payments between Nostr users. A `zap request` (kind 9734) represents a payer's intent to tip someone, and a `zap receipt` (kind 9735) is published by the recipient's Lightning wallet server to confirm the invoice was paid. Together they enable clients to display verifiable Lightning tips on posts and profiles.

## Motivation
Before NIP-57, there was no standardized way to show that one Nostr user paid another via Lightning. Zaps solve this by creating a public, verifiable record of Lightning payments on the Nostr event graph. This enables social tipping, spam deterrence (proof of payment), and incentive alignment between content creators and consumers.

## Specification

### Event Kinds

| Kind | Name | Published By | Description |
|------|------|-------------|-------------|
| 9734 | Zap Request | Sender's client | Intent to pay -- NOT published to relays, sent to LNURL callback |
| 9735 | Zap Receipt | Recipient's LNURL server | Confirmation of payment -- published to relays |

### Tags

**Zap Request (kind 9734) -- Required:**
- `relays` -- list of relays for the receipt to be published to
- `p` -- hex pubkey of the recipient
- `amount` -- amount in millisatoshis (string, recommended)
- `lnurl` -- bech32-encoded lnurl pay URL of recipient (recommended)

**Zap Request (kind 9734) -- Optional:**
- `e` -- hex event ID being zapped (if zapping an event)
- `a` -- event coordinate for addressable events (e.g., NIP-23 long-form)
- `k` -- stringified kind of the target event

**Zap Receipt (kind 9735) -- Required:**
- `p` -- pubkey of the zap recipient (from zap request)
- `bolt11` -- the description-hash BOLT11 invoice
- `description` -- JSON-encoded zap request event

**Zap Receipt (kind 9735) -- Optional:**
- `e` -- event ID (from zap request, if present)
- `a` -- event coordinate (from zap request, if present)
- `P` -- pubkey of the zap sender (from zap request pubkey)
- `k` -- kind of target event (from zap request, if present)
- `preimage` -- payment preimage (not a true proof of payment)

**`zap` Tag on Other Events:**
- Format: `["zap", "<receiver-pubkey>", "<relay>", "<weight>"]`
- Enables zap splits: multiple recipients with weighted distribution.

### Protocol Flow

This is the complete multi-actor flow involving the sender's client, the recipient's LNURL server, Lightning Network, and Nostr relays.

```
Sender          Sender's        Recipient's         Lightning       Nostr
(User)          Client          LNURL Server        Network         Relays
  |               |                  |                  |              |
  |               | 1. GET lnurl-pay |                  |              |
  |               |    endpoint      |                  |              |
  |               |----------------->|                  |              |
  |               |                  |                  |              |
  |               | 2. Response:     |                  |              |
  |               |    allowsNostr,  |                  |              |
  |               |    nostrPubkey,  |                  |              |
  |               |    callback,     |                  |              |
  |               |    min/max       |                  |              |
  |               |<-----------------|                  |              |
  |               |                  |                  |              |
  | 3. "Zap 21   |                  |                  |              |
  |    sats!"     |                  |                  |              |
  |-------------->|                  |                  |              |
  |               |                  |                  |              |
  |               | 4. Create & sign |                  |              |
  |               |    kind 9734     |                  |              |
  |               |    (zap request) |                  |              |
  |               |                  |                  |              |
  |               | 5. GET callback? |                  |              |
  |               |    amount=21000  |                  |              |
  |               |    &nostr=<9734> |                  |              |
  |               |    &lnurl=<...>  |                  |              |
  |               |----------------->|                  |              |
  |               |                  |                  |              |
  |               |                  | 6. Validate      |              |
  |               |                  |    zap request   |              |
  |               |                  |                  |              |
  |               |                  | 7. Create invoice|              |
  |               |                  |    desc_hash =   |              |
  |               |                  |    SHA256(9734)  |              |
  |               |                  |                  |              |
  |               | 8. {pr: "lnbc.."} |                 |              |
  |               |<-----------------|                  |              |
  |               |                  |                  |              |
  |               | 9. Pay invoice   |                  |              |
  |               |---------------------------------->  |              |
  |               |                  |                  |              |
  |               |                  | 10. Payment      |              |
  |               |                  |     received     |              |
  |               |                  |<-----------------|              |
  |               |                  |                  |              |
  |               |                  | 11. Create kind  |              |
  |               |                  |     9735 (zap    |              |
  |               |                  |     receipt)     |              |
  |               |                  |                  |              |
  |               |                  | 12. Publish to   |              |
  |               |                  |     relays from  |              |
  |               |                  |     zap request  |              |
  |               |                  |-------------------------------->|
  |               |                  |                  |              |
  |               |           13. Clients fetch 9735s from relays     |
  |               |<--------------------------------------------------|
  |               |                  |                  |              |
  |               | 14. Validate     |                  |              |
  |               |     receipt      |                  |              |
  |               |     (Appendix F) |                  |              |
```

**Step-by-step detail:**

1. Client resolves the recipient's LNURL from their `lud16` profile field (e.g., `user@domain.com` becomes `https://domain.com/.well-known/lnurlp/user`) or from a `zap` tag on the event.
2. Client GETs the LNURL pay endpoint. Checks for `allowsNostr: true` and a valid `nostrPubkey`.
3. User initiates a zap.
4. Client creates a kind 9734 event with `p`, `relays`, `amount`, optional `e`/`a`/`k` tags, and optional `.content` message. Signs it with the sender's key.
5. Client sends the 9734 event (URI-encoded JSON) as the `nostr` query param to the LNURL `callback` URL, along with `amount` and `lnurl` params.
6. LNURL server validates the zap request (see validation rules below).
7. Server creates a BOLT11 invoice where the `description_hash` commits to the JSON of the 9734 event (and nothing else).
8. Server returns `{pr: "lnbc..."}` to the client.
9. Client (or user's wallet) pays the invoice.
10. Server detects payment.
11. Server creates a kind 9735 zap receipt event, signed by its `nostrPubkey`.
12. Server publishes the 9735 to all relays listed in the zap request's `relays` tag.
13. Any client can fetch 9735 events using `{"kinds": [9735], "#e": [...]}` or `{"kinds": [9735], "#p": [...]}`.
14. Clients validate receipts before displaying them.

### Zap Request Validation (LNURL Server)

The server MUST validate:
1. Valid Nostr signature
2. Has tags
3. Exactly one `p` tag
4. Zero or one `e` tags
5. A `relays` tag should be present
6. If `amount` tag present, it MUST equal the `amount` query parameter
7. If `a` tag present, it MUST be a valid event coordinate
8. Zero or one `P` tags; if present, MUST equal the zap receipt's `pubkey`

### Zap Receipt Validation (Clients)

Clients MUST validate:
1. The 9735 event's `pubkey` matches the recipient's LNURL server's `nostrPubkey`
2. The `bolt11` invoice amount matches the `amount` tag in the embedded zap request
3. The `lnurl` in the zap request (if present) matches the recipient's known lnurl

### Zap Splits

Events can include multiple `zap` tags to split payments across recipients:
```json
["zap", "<pubkey-a>", "<relay>", "1"]
["zap", "<pubkey-b>", "<relay>", "1"]
["zap", "<pubkey-c>", "<relay>", "2"]
```
Weights are relative. In this example: A gets 25%, B gets 25%, C gets 50%. Recipients without a weight get 0%.

### JSON Examples

**Zap Request (kind 9734):**
```json
{
  "kind": 9734,
  "content": "Zap!",
  "tags": [
    ["relays", "wss://nostr-pub.wellorder.com", "wss://anotherrelay.example.com"],
    ["amount", "21000"],
    ["lnurl", "lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0dajx2mrv92x9xp"],
    ["p", "04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9"],
    ["e", "9ae37aa68f48645127299e9453eb5d908a0cbb6058ff340d528ed4d37c8994fb"],
    ["k", "1"]
  ],
  "pubkey": "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322",
  "created_at": 1679673265,
  "id": "30efed56a035b2549fcaeec0bf2c1595f9a9b3bb4b1a38abaf8ee9041c4b7d93",
  "sig": "f2cb581a84ed10e4dc84937bd98e27acac71ab057255f6aa8dfa561808c981fe..."
}
```

**Zap Receipt (kind 9735):**
```json
{
  "id": "67b48a14fb66c60c8f9070bdeb37afdfcc3d08ad01989460448e4081eddda446",
  "pubkey": "9630f464cca6a5147aa8a35f0bcdd3ce485324e732fd39e09233b1d848238f31",
  "created_at": 1674164545,
  "kind": 9735,
  "tags": [
    ["p", "32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245"],
    ["P", "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322"],
    ["e", "3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8"],
    ["k", "1"],
    ["bolt11", "lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0"],
    ["description", "{\"pubkey\":\"97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322\",\"content\":\"\",\"id\":\"d9cc14d50fcb8c27539aacf776882942c1a11ea4472f8cdec1dea82fab66279d\",\"created_at\":1674164539,\"sig\":\"77127f636577e9029276be060332ea565deaf89ff215a494ccff16ae3f757065e2bc59b2e8c113dd407917a010b3abd36c8d7ad84c0e3ab7dab3a0b0caa9835d\",\"kind\":9734,\"tags\":[[\"e\",\"3624762a1274dd9636e0c552b53086d70bc88c165bc4dc0f9e836a1eaf86c3b8\"],[\"p\",\"32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245\"],[\"relays\",\"wss://relay.damus.io\",\"wss://nostr-relay.wlvs.space\",\"wss://nostr.fmt.wiz.biz\",\"wss://relay.nostr.bg\",\"wss://nostr.oxtr.dev\",\"wss://nostr.v0l.io\",\"wss://brb.io\",\"wss://nostr.bitcoiner.social\",\"ws://monad.jb55.com:8080\",\"wss://relay.snort.social\"]]}"],
    ["preimage", "5d006d2cf1e73c7148e7519a4c68adc81642ce0e25a432b2434c99f97344c15f"]
  ],
  "content": ""
}
```

**HTTP Request to LNURL Callback (JavaScript):**
```javascript
const amount = 21 * 1000; // 21 sats in msats
const relays = ['wss://nostr-pub.wellorder.net'];
const event = encodeURI(JSON.stringify(await signEvent({
  kind: 9734,
  content: "",
  pubkey: senderPubkey,
  created_at: Math.round(Date.now() / 1000),
  tags: [
    ["relays", ...relays],
    ["amount", amount.toString()],
    ["lnurl", lnurl],
    ["p", recipientPubkey],
  ],
})));

const {pr: invoice} = await fetchJson(
  `${callback}?amount=${amount}&nostr=${event}&lnurl=${lnurl}`
);
```

## Implementation Notes

- The zap receipt is NOT a cryptographic proof of payment. It proves a Nostr user fetched an invoice and claims it was paid. A rogue LNURL server could fabricate receipts.
- The `description_hash` in the BOLT11 invoice MUST commit to the zap request JSON and nothing else (no additional LNURL metadata).
- The `preimage` tag in the zap receipt is informational; it does not constitute payment proof since the LNURL server already knows it.
- The `created_at` of the zap receipt SHOULD match the invoice's `paid_at` timestamp for idempotency.
- Zap requests are NEVER published to relays. They are only sent as HTTP query parameters.
- The `P` tag (uppercase) on the receipt contains the sender's pubkey; the `p` tag (lowercase) contains the recipient's pubkey.
- Zap splits use relative weights, not percentages. The client calculates the percentage from total weight.
- Future work mentions encrypted zap requests for private zaps, but this is deferred.

## Client Behavior

- Clients MUST validate zap receipts per Appendix F before displaying them.
- Clients MUST resolve the recipient's LNURL and verify `allowsNostr` and `nostrPubkey` before attempting a zap.
- Clients SHOULD display a zap button on posts and profiles when the user's LNURL supports Nostr zaps.
- Clients SHOULD include the `relays` tag in zap requests so the receipt gets published where it can be found.
- Clients MAY display the zap request `.content` as a zap comment.
- Clients MAY display zap split configuration on events with multiple `zap` tags.
- When zapping an event with `zap` tags, clients SHOULD calculate LNURL from the tag values instead of the author's profile.

## Relay Behavior

- Relays have no special behavior for zap events.
- Relays store kind 9735 events as regular events.
- Relays SHOULD support filtering by `#e`, `#p`, and `#P` tags for efficient zap queries.

## Dependencies

- **NIP-01** -- Basic protocol, event structure
- **LNURL** -- LUD-06 (pay request), LUD-16 (Lightning addresses), LUD-12 (comments)
- **BOLT-11** -- Lightning invoice format and description hash

## Source Code References

- **nostr-tools:** `nip57.ts` -- Zap request creation, zap receipt validation
- **cln-nostr-zapper:** Reference LNURL server implementation (CLN plugin)
- **LNbits:** NIP-57 zap support in its LNURL provider
- **rust-nostr:** `nip57` module for zap event construction

## Related NIPs

- **NIP-47** -- Nostr Wallet Connect (can be used to pay zap invoices programmatically)
- **NIP-61** -- Nutzaps (ecash-based alternative to Lightning zaps)
- **NIP-75** -- Zap Goals (fundraising targets using zaps)
- **NIP-09** -- Event deletion
