# NIP-66: Relay Discovery and Liveness Monitoring

## Status
Active (draft, optional)

## Summary
NIP-66 defines two event kinds for relay discovery and health monitoring. `kind:30166` events are published by relay monitors to document relay characteristics (latency, network type, supported NIPs, requirements). `kind:10166` events announce a monitor's intent to publish regular monitoring data. Together they enable decentralized relay discovery -- clients can find online relays, filter by capabilities, and assess performance without relying on centralized relay lists.

## Motivation
The NOSTR network has thousands of relays, but clients have no protocol-native way to discover which relays exist, which are online, what they support, or how fast they are. Centralized relay directories are a single point of failure and trust. NIP-66 solves this by creating a decentralized monitoring layer: independent monitors probe relays and publish their findings as NOSTR events. Clients can query multiple monitors, apply web-of-trust filtering, and make informed relay selection decisions.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| `30166` | Relay Discovery | Parameterized Replaceable | Published by monitors. Documents a single relay's characteristics. The `d` tag is the relay URL. |
| `10166` | Monitor Announcement | Replaceable | Published by monitors. Advertises the monitor's identity, frequency, and check types. |

### Tags for kind:30166 (Relay Discovery)

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | **Required.** Normalized relay URL (or hex pubkey for non-URL relays). | `["d", "wss://some.relay/"]` |
| `rtt-open` | Open connection round-trip time in milliseconds. | `["rtt-open", "234"]` |
| `rtt-read` | Read operation round-trip time in milliseconds. | `["rtt-read", "150"]` |
| `rtt-write` | Write operation round-trip time in milliseconds. | `["rtt-write", "200"]` |
| `n` | Network type. One of: `clearnet`, `tor`, `i2p`, `loki`. | `["n", "clearnet"]` |
| `T` | Relay type in PascalCase (e.g., `PrivateInbox`, `Public`). | `["T", "PrivateInbox"]` |
| `N` | Supported NIP number. One tag per NIP. | `["N", "42"]` |
| `R` | Requirement flags from NIP-11 limitations. Prefix with `!` for false. | `["R", "auth"]`, `["R", "!payment"]` |
| `t` | Topic/tag associated with the relay. | `["t", "nsfw"]` |
| `k` | Accepted kinds. Prefix with `!` for rejected kinds. | `["k", "1"]`, `["k", "!42"]` |
| `g` | NIP-52 geohash for the relay's physical location. | `["g", "ww8p1r4t8"]` |
| `l` | Language label (ISO-639-1). | `["l", "en", "ISO-639-1"]` |

**Important:** Tags with multiple values MUST be repeated as separate tags, not combined into a single tag. For example, use `[["t", "cats"], ["t", "dogs"]]` instead of `[["t", "cats", "dogs"]]`.

The `content` field MAY contain the stringified JSON of the relay's NIP-11 information document.

### Tags for kind:10166 (Monitor Announcement)

| Tag | Description | Example |
|-----|-------------|---------|
| `frequency` | How often the monitor publishes, in seconds. | `["frequency", "3600"]` |
| `timeout` | Timeout in ms for checks. Index 2 specifies which check (optional). | `["timeout", "open", "5000"]` |
| `c` | Check type performed by the monitor (lowercase). | `["c", "ws"]`, `["c", "nip11"]` |
| `g` | NIP-52 geohash for the monitor's location. | `["g", "ww8p1r4t8"]` |

Common check types (`c` tag values):
- `open` -- WebSocket connection test
- `read` -- Read operation test
- `write` -- Write operation test
- `auth` -- NIP-42 authentication test
- `nip11` -- NIP-11 document fetch test
- `dns` -- DNS resolution test
- `geo` -- Geolocation check
- `ws` -- General WebSocket connectivity
- `ssl` -- TLS/SSL certificate check

### Protocol Flow

#### Monitor Publishing Discovery Data

1. Monitor operator runs a service that periodically probes known relays.
2. For each relay, the monitor:
   a. Attempts to connect via WebSocket and measures RTT.
   b. Fetches the NIP-11 document.
   c. Tests read and write capabilities.
   d. Records supported NIPs, requirements, network type, etc.
3. Monitor publishes a `kind:30166` event for each relay, with the `d` tag set to the relay's normalized URL.
4. Because `kind:30166` is parameterized replaceable, only the latest observation per relay per monitor is stored.

#### Monitor Announcing Itself

1. Monitor publishes a `kind:10166` event describing its capabilities and schedule.
2. This allows clients to discover active monitors and understand their methodology.
3. Monitors SHOULD also publish `kind:0` (profile) and `kind:10002` (relay list) events.

#### Client Using Discovery Data

1. Client queries for `kind:30166` events, optionally filtering by tags (network, NIP support, etc.).
2. Client receives relay discovery data from one or more monitors.
3. Client applies web-of-trust filtering (trust monitors they follow or that are vouched for).
4. Client uses the data to select relays -- fast, online relays that support needed NIPs.

### JSON Examples

#### Relay Discovery Event (kind 30166)

```json
{
  "id": "<event-id>",
  "pubkey": "<monitor-pubkey>",
  "created_at": 1700000000,
  "kind": 30166,
  "tags": [
    ["d", "wss://some.relay/"],
    ["n", "clearnet"],
    ["N", "1"],
    ["N", "11"],
    ["N", "42"],
    ["N", "50"],
    ["R", "!payment"],
    ["R", "auth"],
    ["g", "ww8p1r4t8"],
    ["l", "en", "ISO-639-1"],
    ["t", "nsfw"],
    ["rtt-open", "234"],
    ["rtt-read", "150"],
    ["rtt-write", "200"]
  ],
  "content": "{\"name\":\"some.relay\",\"description\":\"A relay\",\"supported_nips\":[1,11,42,50]}",
  "sig": "<signature>"
}
```

#### Monitor Announcement Event (kind 10166)

```json
{
  "id": "<event-id>",
  "pubkey": "<monitor-pubkey>",
  "created_at": 1700000000,
  "kind": 10166,
  "tags": [
    ["timeout", "open", "5000"],
    ["timeout", "read", "3000"],
    ["timeout", "write", "3000"],
    ["timeout", "nip11", "3000"],
    ["frequency", "3600"],
    ["c", "ws"],
    ["c", "nip11"],
    ["c", "ssl"],
    ["c", "dns"],
    ["c", "geo"],
    ["g", "ww8p1r4t8"]
  ],
  "content": "",
  "sig": "<signature>"
}
```

#### Client Query: Find All Clearnet Relays Supporting NIP-50

```json
["REQ", "relay-search", {
  "kinds": [30166],
  "#n": ["clearnet"],
  "#N": ["50"]
}]
```

#### Client Query: Find All Relays Without Payment Required

```json
["REQ", "free-relays", {
  "kinds": [30166],
  "#R": ["!payment"]
}]
```

## Implementation Notes

- The `d` tag MUST be set to the relay's normalized URL per RFC 3986 Section 6. This ensures that different monitors use the same identifier for the same relay.
- The `content` field containing the NIP-11 document is optional but useful -- it saves clients a separate HTTP request to each relay.
- Monitor data MAY contradict a relay's own NIP-11 claims. This is intentional: monitors report what they observe, which may differ from what the relay advertises.
- RTT values are point-in-time measurements from the monitor's location. Different monitors in different geographic locations will report different RTT values for the same relay.
- The `R` tag uses `!` prefix for false values (e.g., `!payment` means payment is NOT required). This is a compact boolean representation.
- The `k` tag similarly uses `!` prefix for rejected kinds.

## Client Behavior

- Clients MUST NOT require `kind:30166` events to function. Absence of monitoring data MUST NOT prevent relay connections.
- Clients SHOULD NOT trust a single monitor. Defenses include:
  - Web-of-trust filtering (only trust monitors followed by the user or by trusted accounts).
  - Querying multiple monitors and comparing results.
  - Discarding filter results if they would remove an unreasonable proportion of relays.
- Clients MAY use monitoring data to optimize relay selection (prefer low-latency, high-availability relays).
- Clients MAY filter relays by network type, supported NIPs, requirements, geographic location, or topics.
- Clients SHOULD gracefully handle conflicting data from different monitors.

## Relay Behavior

- Relays have no special obligations for NIP-66. They store and serve `kind:30166` and `kind:10166` events like any other events.
- Relays that are being monitored do not need to do anything special -- monitors probe them externally.

## Dependencies

- NIP-01 (basic protocol -- parameterized replaceable events)
- NIP-11 (Relay Information Document -- monitor reads and re-publishes this data)
- NIP-52 (Calendar Events -- geohash format reused for `g` tag)

## Source Code References

### Monitor Implementations
- Various community-built relay monitors publish `kind:30166` events. These are standalone services, not part of relay software.
- Example monitors can be found on GitHub by searching for "nostr relay monitor" or "nip-66 monitor".

### nostr-tools (JS)
- Filter support for querying `kind:30166` events with tag filters works with existing code.
- No NIP-66-specific helper module as of this writing.

### rust-nostr
- `kind:30166` events can be queried using standard `Filter` with tag filters.

### go-nostr
- Standard filter queries work for `kind:30166`. No NIP-66-specific helpers.

### strfry / khatru
- No special handling needed. These relays store and serve the events normally.

## Related NIPs

- NIP-01 (Basic Protocol) -- parameterized replaceable event semantics
- NIP-11 (Relay Information Document) -- the data that monitors observe and report
- NIP-52 (Calendar Events) -- geohash format
- NIP-65 (Relay List Metadata) -- user relay preferences; NIP-66 helps discover relays to include in relay lists
