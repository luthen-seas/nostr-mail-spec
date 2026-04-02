# NIP-45: Counting Results

## Status
Active (draft, optional)

## Summary
NIP-45 introduces a `COUNT` verb that allows clients to request the number of events matching a filter without downloading all the events themselves. Relays respond with a count (and optionally approximate flag), enabling efficient metrics like follower counts, reaction counts, and repost counts. It also defines a HyperLogLog (HLL) mechanism for merging counts across multiple relays without double-counting.

## Motivation
Many common UI patterns require knowing "how many" -- how many followers does a user have, how many reactions does a post have, how many reposts. Without NIP-45, clients must download all matching events just to count them, which wastes bandwidth and is slow for large result sets. The COUNT verb lets relays do the counting server-side and return a single number. The HLL extension goes further by allowing clients to merge counts from multiple relays accurately, solving the double-counting problem inherent in a distributed system.

## Specification

### Event Kinds
NIP-45 does not define new event kinds. It defines a new protocol verb (`COUNT`) that works with existing event kinds.

### Tags
NIP-45 does not define new tags. It uses existing NIP-01 filter structures.

### Protocol Flow

#### Basic Count Request

1. Client sends a `COUNT` message using the same filter syntax as `REQ`:
   ```
   ["COUNT", <subscription_id>, <filter1>, <filter2>, ...]
   ```
2. Relay processes the filters with OR logic (same as REQ) and counts matching events.
3. Relay responds with:
   ```
   ["COUNT", <subscription_id>, {"count": <integer>}]
   ```
4. If the count is an estimate, relay MAY include an `approximate` field:
   ```
   ["COUNT", <subscription_id>, {"count": <integer>, "approximate": true}]
   ```
5. If the relay refuses the request, it MUST return a `CLOSED` message instead.

#### HyperLogLog (HLL) Flow

1. Client sends a COUNT request as above.
2. Relay responds with a count AND a hex-encoded HyperLogLog:
   ```
   ["COUNT", <subscription_id>, {"count": <integer>, "hll": "<hex-encoded-256-bytes>"}]
   ```
3. Client can merge HLL values from multiple relays to get a de-duplicated count.
4. Client can also supplement with locally-computed HLL values from raw events it already has.

#### HLL Algorithm

1. Initialize 256 registers (one byte each), all set to 0.
2. Compute a deterministic offset from the filter's first tag attribute:
   - For pubkeys or event IDs: use the 32-byte hex string directly.
   - For NIP-05 addresses: extract the pubkey.
   - For other strings: compute a hash.
   - Take character at position 32 (0-indexed) of the hex string, convert from hex to int, add 8. This is the offset.
3. For each counted event:
   - Read the pubkey byte at the computed offset position.
   - Use this byte to determine the register index.
   - Count leading zero bits to get the value.
   - Store the maximum value seen for each register.
4. To merge HLLs: take the element-wise maximum across all HLL arrays.

### JSON Examples

#### Basic Count Request

```json
["COUNT", "sub1", {"kinds": [1], "authors": ["abcdef1234..."]}]
```

#### Count Response

```json
["COUNT", "sub1", {"count": 238}]
```

#### Approximate Count Response

```json
["COUNT", "sub1", {"count": 1500, "approximate": true}]
```

#### Count with HyperLogLog

```json
["COUNT", "sub1", {"count": 238, "hll": "0a0b0c0d..."}]
```

#### Follower Count Query

```json
["COUNT", "followers", {"kinds": [3], "#p": ["<target-pubkey>"]}]
```

#### Reaction Count Query

```json
["COUNT", "reactions", {"kinds": [7], "#e": ["<target-event-id>"]}]
```

#### Repost Count Query

```json
["COUNT", "reposts", {"kinds": [6], "#e": ["<target-event-id>"]}]
```

#### Reply Count Query

```json
["COUNT", "replies", {"kinds": [1], "#e": ["<target-event-id>"]}]
```

### Common Canonical Queries

The spec identifies six frequently-cached queries:

| Query | Kind | Tag Filter | Description |
|-------|------|------------|-------------|
| Reaction count | `7` | `#e` = event ID | How many reactions an event received |
| Repost count | `6` | `#e` = event ID | How many reposts an event received |
| Quote count | `1` | `#q` = event ID | How many quotes an event received |
| Reply count | `1` | `#e` = event ID | How many replies an event received |
| Comment count | `1111` | `#e` or `#E` = event ID | How many comments an event received |
| Follower count | `3` | `#p` = pubkey | How many follow lists include a pubkey |

## Implementation Notes

- The COUNT verb uses the exact same filter syntax as REQ from NIP-01. Any valid REQ filter is a valid COUNT filter.
- Multiple filters in a single COUNT are combined with OR logic, and the total count is returned.
- Relays that do not support NIP-45 will likely ignore or reject the COUNT message. Clients should check `supported_nips` in NIP-11.
- The HLL mechanism uses 256 registers (256 bytes), which is compact enough to include in every response.
- HLL provides an estimate with a known error bound -- it is NOT exact for large sets, but it solves the critical problem of de-duplicating counts across relays.
- The `approximate` flag lets relays signal when they are returning an estimate rather than an exact count (e.g., from a probabilistic data structure or capped query).
- Relays MAY refuse COUNT requests (e.g., for expensive queries) by returning a CLOSED message.

### Security Considerations

- The HLL algorithm is vulnerable to pubkey mining attacks: an adversary can craft pubkeys that map to specific HLL registers, inflating counts. Mitigation: clients should prefer filtered/curated relays over open relays when using HLL data.

## Client Behavior

- Clients SHOULD check NIP-11 `supported_nips` for NIP-45 before sending COUNT requests.
- Clients SHOULD handle CLOSED responses gracefully (fall back to downloading events and counting locally).
- Clients MAY merge HLL responses from multiple relays to get de-duplicated counts.
- Clients MAY supplement HLL data with locally-computed values from events they already have cached.
- Clients MAY progressively update stored HLL values with new data to minimize future bandwidth.
- Clients SHOULD prefer filtered relays over open relays when using HLL data to mitigate manipulation.
- Clients SHOULD treat counts with `"approximate": true` as estimates and display them accordingly (e.g., "~1.5K" instead of "1500").

## Relay Behavior

- Relays MUST respond to COUNT requests with a `COUNT` response or a `CLOSED` message.
- Relays MUST use the same subscription ID in the response as was sent in the request.
- Relays SHOULD set `"approximate": true` when the count is an estimate.
- Relays MAY include HLL data in responses to enable cross-relay de-duplication.
- Relays MAY refuse expensive COUNT queries by returning CLOSED.
- Relays MAY cache count results for common queries (reactions, followers, etc.).

## Dependencies

- NIP-01 (basic protocol -- filter syntax, subscription IDs)
- NIP-11 (Relay Information Document -- `supported_nips` discovery)

## Source Code References

### strfry
- `src/RelayServer.cpp` -- handles the `COUNT` verb if enabled.
- strfry supports COUNT natively; enable via configuration.

### khatru
- `khatru.go` -- the `CountEvents` handler processes COUNT requests.
- The relay framework exposes a count callback that storage backends implement.

### nostr-tools (JS)
- `relay.ts` or `pool.ts` -- `count()` method sends COUNT requests and parses responses.

### rust-nostr
- `nostr-relay-pool` crate -- count request support in the relay pool.
- `Filter` struct supports the count operation.

### go-nostr
- `relay.go` -- `Count(ctx, filters)` method sends COUNT and returns the integer result.

## Related NIPs

- NIP-01 (Basic Protocol) -- filter syntax reused by COUNT
- NIP-11 (Relay Information Document) -- capability discovery
- NIP-50 (Search Capability) -- another query extension to the filter system
