# Data Vending Machines (NIP-90)

## What is a DVM?

A **Data Vending Machine** is a NOSTR-native service provider. It listens for
job requests on relays, processes them, and publishes results. Think of it as
a decentralized API marketplace where:

- **Customers** publish job requests describing what they need.
- **Providers** (DVMs) pick up those requests, do the work, and return results.
- Everything happens over NOSTR relays using signed events.

DVMs can provide any kind of data processing: AI inference, search, content
recommendation, translation, image generation, summarization, and more.

## NIP-90 event kinds

NIP-90 reserves ranges of event kinds for the request/result/feedback cycle:

| Kind range | Purpose | Example |
|---|---|---|
| 5000-5999 | Job requests | 5100 = translation |
| 6000-6999 | Job results | 6100 = translation result |
| 7000 | Job feedback | Status updates |

The result kind is always the request kind + 1000. So a kind 5100 request
produces a kind 6100 result.

### Defined job kinds (partial list)

| Request | Result | Job type |
|---|---|---|
| 5000 | 6000 | Generic (user-defined) |
| 5001 | 6001 | Summarization |
| 5002 | 6002 | Text-to-image |
| 5100 | 6100 | Translation |
| 5200 | 6200 | Content discovery/recommendation |
| 5300 | 6300 | Search |

## Request/Result/Feedback lifecycle

### 1. Customer publishes a job request (kind 5xxx)

```json
{
  "kind": 5100,
  "tags": [
    ["i", "Hello world", "text"],
    ["output", "text/plain"],
    ["bid", "1000"],
    ["p", "<preferred-dvm-pubkey>"]
  ],
  "content": ""
}
```

Key tags:

- `["i", "<data>", "<type>"]` — input data. Type is `text`, `url`, `event`,
  or `job` (for chaining DVMs).
- `["output", "<mime-type>"]` — requested output format.
- `["bid", "<millisats>"]` — maximum the customer is willing to pay.
- `["p", "<pubkey>"]` — optional: target a specific DVM provider.

### 2. Provider sends feedback (kind 7000)

The provider can send status updates as it works:

```json
{
  "kind": 7000,
  "tags": [
    ["e", "<job-request-id>"],
    ["p", "<customer-pubkey>"],
    ["status", "processing"]
  ],
  "content": ""
}
```

Status values:

| Status | Meaning |
|---|---|
| `processing` | Work has begun |
| `success` | Work completed successfully |
| `error` | Work failed (reason in content) |
| `payment-required` | DVM needs payment before delivering result |
| `partial` | Partial result available |

### 3. Provider publishes result (kind 6xxx)

```json
{
  "kind": 6100,
  "tags": [
    ["e", "<job-request-id>"],
    ["p", "<customer-pubkey>"],
    ["request", "<original-request-json>"]
  ],
  "content": "HELLO WORLD"
}
```

The result kind is always `request_kind + 1000`.

## Payment flow

DVMs can require payment (typically Lightning via NIP-57 zaps):

1. Customer includes `["bid", "<amount>"]` in the request.
2. Provider checks the bid. If acceptable, processes the job.
3. If the provider wants payment first, it sends feedback with
   `["status", "payment-required"]` and an `["amount", "<millisats>"]` tag,
   plus a Lightning invoice.
4. Customer pays the invoice.
5. Provider detects the zap receipt and delivers the result.

## Job chaining

DVMs can be chained: the output of one DVM becomes the input of another.
Use `["i", "<job-event-id>", "job"]` to reference a previous job's result
as input.

## Running the example

```bash
npm install nostr-tools ws
npm install -D typescript ts-node @types/node @types/ws

# Terminal 1 — start the provider
DVM_MODE=provider npx ts-node dvm.ts

# Terminal 2 — send a job request
DVM_MODE=customer DVM_INPUT="Hello, translate this please" npx ts-node dvm.ts
```

## Building a real DVM

To build a production DVM:

1. **Choose a job kind** — pick an existing kind or define a new one.
2. **Implement the processing logic** — call your AI model, API, etc.
3. **Handle payments** — integrate Lightning invoices if charging for work.
4. **Monitor multiple relays** — subscribe to job requests on popular relays.
5. **Advertise your DVM** — publish a kind 31990 (NIP-89) app handler event
   so clients can discover your DVM.
