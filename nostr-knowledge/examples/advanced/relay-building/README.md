# Building a Minimal NOSTR Relay

## What is a NOSTR relay?

A relay is a WebSocket server that stores and forwards NOSTR events. It speaks
the NIP-01 protocol and processes three message types from clients:

| Client message | Purpose |
|---|---|
| `["EVENT", <event>]` | Publish an event to the relay |
| `["REQ", <sub_id>, <filter>...]` | Subscribe to events matching filters |
| `["CLOSE", <sub_id>]` | Cancel a subscription |

The relay responds with:

| Relay message | Purpose |
|---|---|
| `["EVENT", <sub_id>, <event>]` | Deliver an event to a subscriber |
| `["OK", <event_id>, <bool>, <msg>]` | Acknowledge an EVENT submission |
| `["EOSE", <sub_id>]` | Signal end of stored events for a REQ |
| `["NOTICE", <text>]` | Human-readable error or info |

## Message processing flow

### EVENT processing

1. Parse the JSON message.
2. **Validate structure** — check that all required fields exist and the `id`
   is the SHA-256 hash of `[0, pubkey, created_at, kind, tags, content]`.
3. **Verify signature** — the `sig` field is a Schnorr signature over the
   event `id`, verifiable against the `pubkey`.
4. **Store** — add to the event store (reject duplicates gracefully).
5. **Reply OK** — `["OK", <id>, true, ""]` on success.
6. **Broadcast** — for every connected client, check all of their active
   subscriptions. If the new event matches any filter, send it.

### REQ processing

1. Parse subscription ID and one or more filters.
2. Register (or replace) the subscription in per-client state.
3. Query the event store for each filter and send matching historical events.
4. Send `["EOSE", <sub_id>]` to signal the end of the backfill.
5. From this point on, new events that arrive via EVENT and match the filters
   will be pushed in real time.

### CLOSE processing

1. Remove the subscription from per-client state.

## Filter matching algorithm

Each filter is an object with optional conditions. An event matches a filter
only if **all** present conditions are satisfied (AND logic). Multiple filters
in a single REQ are OR-ed together.

| Field | Match rule |
|---|---|
| `ids` | `event.id` starts with any of the given hex prefixes |
| `authors` | `event.pubkey` starts with any of the given hex prefixes |
| `kinds` | `event.kind` is in the list |
| `since` | `event.created_at >= since` |
| `until` | `event.created_at <= until` |
| `#<tag>` | Event has a tag `[<tag>, <value>]` where value is in the list |
| `limit` | Return at most N events (newest first) |

### Prefix matching

The `ids` and `authors` fields support **prefix matching**. This means a
client can request all events whose id starts with `"abc"`. This enables
efficient "id hint" lookups without transmitting full 64-character hex IDs.

## Running

```bash
npm install ws nostr-tools
npm install -D @types/ws typescript ts-node
npx ts-node simple_relay.ts
```

The relay listens on `ws://localhost:7777` by default. Set the `RELAY_PORT`
environment variable to change it.

## Limitations of this example

- **In-memory only** — events are lost on restart. A production relay would
  use SQLite, PostgreSQL, or LMDB.
- **No NIP-11** — does not serve relay information at the HTTP endpoint.
- **No rate limiting** — a production relay must limit events per second.
- **No authentication** — does not implement NIP-42 AUTH.
- **No replaceable event logic** — kinds 0, 3, 10000-19999, 30000-39999
  have special replacement rules that are not enforced here.
