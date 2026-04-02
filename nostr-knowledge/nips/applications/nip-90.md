# NIP-90: Data Vending Machines

## Status
Active (Draft, Optional)

## Summary
NIP-90 defines a marketplace protocol for on-demand computation over Nostr. Customers publish job requests (kinds 5000-5999), service providers process them and return results (kinds 6000-6999), and intermediate status is communicated via feedback events (kind 7000). This creates a decentralized AI/compute marketplace where multiple providers can compete to fulfill requests for tasks like text generation, image creation, translation, transcription, and more.

## Motivation
AI and compute services are typically locked into centralized platforms with vendor lock-in, API keys, and single points of failure. NIP-90 decentralizes this by turning Nostr into a compute marketplace. Any service provider can listen for job requests, fulfill them, and get paid via Lightning. Customers benefit from competition (multiple providers can bid on the same job), censorship resistance, and a unified protocol for diverse compute tasks. The "Data Vending Machine" metaphor captures the model: insert coins (sats), press a button (job request), receive your product (job result).

## Specification

### Event Kinds

| Kind Range | Description |
|------------|-------------|
| `5000-5999` | **Job Requests** -- published by customers |
| `6000-6999` | **Job Results** -- published by service providers (result kind = request kind + 1000) |
| `7000` | **Job Feedback** -- status updates from service providers |

Well-known job types (defined in separate appendices):

| Request Kind | Result Kind | Job Type |
|-------------|-------------|----------|
| `5000` | `6000` | Text extraction / OCR |
| `5001` | `6001` | Summarization |
| `5002` | `6002` | Translation |
| `5003` | `6003` | Content generation (text-to-text) |
| `5004` | `6004` | Content search / discovery |
| `5005` | `6005` | Translation (alternative) |
| `5050` | `6050` | Text generation (LLM inference) |
| `5100` | `6100` | Image generation |
| `5101` | `6101` | Image-to-image transformation |
| `5200` | `6200` | Video generation |
| `5250` | `6250` | Text-to-speech |
| `5300` | `6300` | Speech-to-text / transcription |

*Note: Specific job type kinds are defined in separate documents. The ranges 5000-5999 and 6000-6999 are reserved, and new job types can be registered.*

### Tags

#### Job Request Tags (kinds 5000-5999)

| Tag | Format | Required | Description |
|-----|--------|----------|-------------|
| `i` | `["i", "<data>", "<input-type>", "<relay>", "<marker>"]` | Optional | Input data for the job |
| `output` | `["output", "<mime-type>"]` | Optional | Expected output MIME type |
| `relays` | `["relays", "wss://...", "wss://..."]` | Optional | Relays where the provider should publish results |
| `bid` | `["bid", "<msat-amount>"]` | Optional | Maximum amount the customer is willing to pay (millisats) |
| `p` | `["p", "<service-provider-pubkey>"]` | Optional | Target specific provider(s). If omitted, any provider may respond |
| `param` | `["param", "<key>", "<value>"]` | Optional | Arbitrary key-value parameters for the job |
| `t` | `["t", "<topic>"]` | Optional | Topic/category tags |
| `encrypted` | `["encrypted"]` | Optional | Marker indicating that inputs/params are encrypted in `.content` |

**Input types for the `i` tag:**

| Input Type | Description |
|------------|-------------|
| `text` | Raw text data passed inline |
| `url` | A URL to fetch data from |
| `event` | A Nostr event ID -- the provider should fetch this event |
| `job` | A previous job request event ID -- chain the output of that job as input to this one |

The `<relay>` field is used when input-type is `event` or `job` to hint where the referenced event can be found.

The `<marker>` field provides optional context about how the input should be used.

#### Job Result Tags (kinds 6000-6999)

| Tag | Format | Required | Description |
|-----|--------|----------|-------------|
| `request` | `["request", "<stringified-job-request-json>"]` | **Yes** | The original job request event as a JSON string |
| `e` | `["e", "<job-request-id>", "<relay-hint>"]` | **Yes** | Reference to the job request event |
| `p` | `["p", "<customer-pubkey>"]` | **Yes** | The customer who requested the job |
| `i` | `["i", "<input-data>"]` | Optional | Echo of the original input (omit if encrypted) |
| `amount` | `["amount", "<msat-amount>", "<bolt11-invoice>"]` | Optional | Payment requested. Third element is an optional Lightning invoice |
| `encrypted` | `["encrypted"]` | Optional | Marker that the result payload in `.content` is encrypted |

The `.content` field contains the job result payload.

#### Job Feedback Tags (kind 7000)

| Tag | Format | Required | Description |
|-----|--------|----------|-------------|
| `status` | `["status", "<status>", "<extra-info>"]` | **Yes** | Current job status |
| `e` | `["e", "<job-request-id>", "<relay-hint>"]` | **Yes** | Reference to the job request |
| `p` | `["p", "<customer-pubkey>"]` | **Yes** | The customer who requested the job |
| `amount` | `["amount", "<msat-amount>", "<bolt11-invoice>"]` | Optional | Payment amount with optional invoice (used with `payment-required` status) |

**Status values:**

| Status | Description |
|--------|-------------|
| `payment-required` | Provider requires payment before starting or continuing the job |
| `processing` | Provider is currently working on the job |
| `error` | Provider cannot process the job. Extra info should explain why |
| `success` | Job completed successfully |
| `partial` | Job partially completed. `.content` may contain a sample/preview of results |

### Protocol Flow

The complete Data Vending Machine interaction:

```
Customer                          Service Provider
   |                                     |
   |  1. Publish job request (5xxx)      |
   |------------------------------------>|
   |                                     |
   |  2. (Optional) Feedback: processing |
   |<------------------------------------|
   |                                     |
   |  3a. Feedback: payment-required     |
   |<------------------------------------|
   |                                     |
   |  4. Customer pays bolt11/zap        |
   |------------------------------------>|
   |                                     |
   |  3b. Publish job result (6xxx)      |
   |<------------------------------------|
   |                                     |
```

**Step-by-step:**

1. **Customer publishes a job request** (`kind:5xxx`) to one or more relays, specifying inputs, desired output, parameters, and optionally a bid amount and target provider(s).
2. **Service providers subscribe** to job request kinds they can handle. Upon receiving a request, a provider MAY publish a `kind:7000` feedback event with status `processing`.
3. **Provider decides on payment timing:**
   - **Pay-before:** Provider sends feedback with status `payment-required` and an `amount` tag containing a bolt11 invoice. Work begins after payment is confirmed.
   - **Pay-after:** Provider completes the work first and includes an `amount` tag in the job result.
   - **Free:** Provider completes work without requiring payment.
4. **Customer pays** (if required) via Lightning bolt11 invoice or NIP-57 zap.
5. **Provider publishes the job result** (`kind:6xxx`, where kind = request kind + 1000) with the output in `.content`, the original request in the `request` tag, and a reference back to the request via the `e` tag.
6. **Customer receives the result** by subscribing to `kind:6xxx` events that reference their job request.

### Encrypted Parameters

For sensitive job requests (e.g., private AI prompts), the customer can encrypt inputs and parameters:

1. Customer moves all sensitive `i` and `param` tags into an array.
2. Customer encrypts this array using NIP-04 encryption with the target provider's pubkey.
3. The encrypted blob goes into the event's `.content` field.
4. An `["encrypted"]` tag is added to signal that `.content` contains encrypted parameters.
5. A `["p", "<provider-pubkey>"]` tag MUST be present (encryption requires a target).

**Pre-encryption tag array:**
```json
[
  ["i", "what is the capital of France?", "text"],
  ["param", "model", "LLaMA-2"],
  ["param", "max_tokens", "512"],
  ["param", "temperature", "0.5"],
  ["param", "top-k", "50"],
  ["param", "top-p", "0.7"],
  ["param", "frequency_penalty", "1"]
]
```

**Encrypted job request event:**
```json
{
  "kind": 5050,
  "content": "BE2Y4xvS6HIY7TozIgbEl3sAHkdZoXyLRRkZv4fLPh3R7LtviLKAJM5qpkC7D6VtMbgIt4iNcMpLtpo...",
  "tags": [
    ["p", "04f74530a6ede6b24731b976b8e78fb449ea61f40ff10e3d869a3030c4edc91f"],
    ["encrypted"]
  ]
}
```

Similarly, providers encrypt results back to the customer when the request was encrypted, placing the encrypted payload in `.content` and adding the `["encrypted"]` tag.

### Job Chaining

Jobs can be chained so that the output of one job becomes the input of another:

1. Customer publishes Job A (e.g., `kind:5300` speech-to-text transcription).
2. Customer publishes Job B (e.g., `kind:5001` summarization) with an `i` tag using input-type `job` referencing Job A's event ID.
3. The provider for Job B waits for Job A's result, then uses that output as its input.

**Chained job request example:**
```json
{
  "kind": 5001,
  "content": "",
  "tags": [
    ["i", "<job-a-event-id>", "job"],
    ["param", "max_length", "200"]
  ]
}
```

This enables complex multi-step pipelines like: audio file -> transcription -> translation -> summarization.

### Job Cancellation

A customer can cancel a pending job by publishing a `kind:5` deletion event (per NIP-09) targeting the original job request event ID.

### Service Provider Discovery

Providers advertise their capabilities using `kind:31990` events (defined in NIP-89):

```json
{
  "kind": 31990,
  "pubkey": "<provider-pubkey>",
  "content": "{\"name\": \"Translating DVM\", \"about\": \"I'm a DVM specialized in translating Bitcoin content.\"}",
  "tags": [
    ["k", "5005"],
    ["t", "bitcoin"]
  ]
}
```

Customers can query for `kind:31990` events with `#k` tag filters to find providers for specific job types.

### JSON Examples

**Text generation job request (kind 5050):**
```json
{
  "kind": 5050,
  "pubkey": "<customer-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["i", "Write a haiku about Bitcoin", "text"],
    ["param", "model", "gpt-4"],
    ["param", "max_tokens", "100"],
    ["output", "text/plain"],
    ["relays", "wss://relay.damus.io", "wss://nos.lol"],
    ["bid", "5000"]
  ]
}
```

**Image generation job request (kind 5100):**
```json
{
  "kind": 5100,
  "pubkey": "<customer-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["i", "A cyberpunk city at sunset, neon lights reflecting on wet streets", "text"],
    ["param", "model", "stable-diffusion-xl"],
    ["param", "size", "1024x1024"],
    ["output", "image/png"],
    ["bid", "10000"]
  ]
}
```

**Translation job request (kind 5002):**
```json
{
  "kind": 5002,
  "pubkey": "<customer-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["i", "Bitcoin is a decentralized digital currency.", "text"],
    ["param", "language", "es"],
    ["output", "text/plain"]
  ]
}
```

**Transcription job request referencing an event (kind 5300):**
```json
{
  "kind": 5300,
  "pubkey": "<customer-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["i", "<audio-event-id>", "event", "wss://relay.example.com"],
    ["output", "text/plain"],
    ["bid", "20000"]
  ]
}
```

**Job result for text generation (kind 6050):**
```json
{
  "kind": 6050,
  "pubkey": "<provider-pubkey>",
  "created_at": 1700000001,
  "content": "Blocks chain one by one\nSatoshi's dream takes its form\nFreedom, peer to peer",
  "tags": [
    ["request", "{\"kind\":5050,\"pubkey\":\"<customer-pubkey>\",\"content\":\"\",\"tags\":[[\"i\",\"Write a haiku about Bitcoin\",\"text\"],[\"param\",\"model\",\"gpt-4\"],[\"param\",\"max_tokens\",\"100\"],[\"output\",\"text/plain\"],[\"relays\",\"wss://relay.damus.io\",\"wss://nos.lol\"],[\"bid\",\"5000\"]]}"],
    ["e", "<job-request-event-id>", "wss://relay.damus.io"],
    ["i", "Write a haiku about Bitcoin", "text"],
    ["p", "<customer-pubkey>"],
    ["amount", "5000", "lnbc50n1pj..."]
  ]
}
```

**Job feedback -- payment required:**
```json
{
  "kind": 7000,
  "pubkey": "<provider-pubkey>",
  "created_at": 1700000001,
  "content": "",
  "tags": [
    ["status", "payment-required", "Please pay to proceed"],
    ["amount", "10000", "lnbc100n1pj..."],
    ["e", "<job-request-event-id>", "wss://relay.damus.io"],
    ["p", "<customer-pubkey>"]
  ]
}
```

**Job feedback -- processing:**
```json
{
  "kind": 7000,
  "pubkey": "<provider-pubkey>",
  "created_at": 1700000002,
  "content": "",
  "tags": [
    ["status", "processing", "Generating image, 45% complete"],
    ["e", "<job-request-event-id>", "wss://relay.damus.io"],
    ["p", "<customer-pubkey>"]
  ]
}
```

**Job feedback -- error:**
```json
{
  "kind": 7000,
  "pubkey": "<provider-pubkey>",
  "created_at": 1700000002,
  "content": "",
  "tags": [
    ["status", "error", "Model not available"],
    ["e", "<job-request-event-id>", "wss://relay.damus.io"],
    ["p", "<customer-pubkey>"]
  ]
}
```

**Job feedback -- partial result:**
```json
{
  "kind": 7000,
  "pubkey": "<provider-pubkey>",
  "created_at": 1700000002,
  "content": "Here is a low-resolution preview of your image...",
  "tags": [
    ["status", "partial", "Low-res preview"],
    ["e", "<job-request-event-id>", "wss://relay.damus.io"],
    ["p", "<customer-pubkey>"]
  ]
}
```

## Implementation Notes

- **Payment flexibility:** The protocol deliberately does not enforce a single payment flow. Providers choose their risk model -- they can require payment upfront, deliver results with an invoice, or offer free processing. This is by design.
- **Multiple competing providers:** Multiple providers can respond to the same job request. Customers may receive multiple results and can choose the best one. This creates a competitive marketplace.
- **Result kind calculation:** The result kind is always the request kind + 1000. A `kind:5100` image generation request yields a `kind:6100` result.
- **Job chaining complexity:** When chaining jobs, the downstream provider must wait for the upstream job to complete. There is no built-in timeout mechanism -- clients should implement their own.
- **Encrypted jobs are single-provider only:** Because encryption requires a specific pubkey, encrypted job requests can only be fulfilled by the targeted provider. This sacrifices the competitive marketplace benefit.
- **Idempotency:** Providers should check if they have already processed a job request before starting work again (e.g., after a relay reconnection).
- **Large payloads:** For large results (images, audio), providers typically include a URL in `.content` rather than the raw binary data.

## Client Behavior

- Clients MUST subscribe to both `kind:6xxx` (results) and `kind:7000` (feedback) events referencing their job request.
- Clients SHOULD display feedback status updates to the user (processing, payment-required, etc.).
- Clients SHOULD support paying bolt11 invoices from `amount` tags.
- Clients MAY present multiple results from competing providers and let the user choose.
- Clients MAY support NIP-57 zaps as an alternative payment method.
- Clients SHOULD support job cancellation via `kind:5` deletion events.

## Relay Behavior

- Relays SHOULD support the full kind ranges 5000-5999, 6000-6999, and kind 7000.
- Relays SHOULD support tag-based filtering (`#e`, `#p`, `#i`) for efficient job/result matching.
- Relays MAY impose rate limits on job request kinds to prevent spam.
- Relays SHOULD NOT require special handling beyond standard event storage and retrieval.

## Dependencies

- **NIP-01** -- Basic protocol flow
- **NIP-04** -- Encryption for encrypted job parameters and results
- **NIP-09** -- Event deletion (for job cancellation via `kind:5`)
- **NIP-57** -- Zaps (alternative payment method)
- **NIP-89** -- Recommended Application Handlers (`kind:31990` for provider discovery)

## Source Code References

- **nostr-tools:** No dedicated NIP-90 module in core; DVM libraries like `nostr-dvm` (Python) and various TypeScript DVM frameworks build on top of nostr-tools.
- **rust-nostr:** Supports constructing events in the 5000-7000 kind ranges using `EventBuilder`.
- **Notable DVM implementations:**
  - `nostr-dvm` (Python) -- reference implementation of DVM service providers
  - Various community DVM providers for translation, image generation, and AI inference

## Related NIPs

- **NIP-01** -- Event structure and relay communication
- **NIP-04** -- Encryption for private job parameters
- **NIP-09** -- Deletion events for job cancellation
- **NIP-57** -- Lightning zaps for payment
- **NIP-89** -- Application handler discovery (provider advertisements)
- **NIP-78** -- Application-specific data (complementary app-layer protocol)
