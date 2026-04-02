# Relay Inspector and Debugging Tools

Tools for inspecting relay capabilities, monitoring health, and debugging connectivity.

---

## nostr-watch

- **Repository**: https://github.com/dskvr/nostr-watch
- **Website**: https://nostr.watch
- **Language**: TypeScript (monorepo)
- **NIP**: NIP-66 (Relay Monitoring System)
- **Status**: Alpha (funded by OpenSats)

### What It Is

nostr-watch is the primary infrastructure for observing the Nostr relay network. It implements NIP-66 to assess relay health, capabilities, and performance, then publishes monitoring data as Nostr events.

### Components

**Applications:**

| Package | Purpose |
|---------|---------|
| `@nostrwatch/gui` | Web dashboard for visualizing relay data |
| `@nostrwatch/relaymon` | Monitoring agent that publishes NIP-66 events |
| `@nostrwatch/trawler` | Relay data crawler |
| `@nostrwatch/rstate` | Relay intelligence state machine with REST and MCP endpoints |
| `@nostrwatch/purist` | Browser-based relay scanner |

**Libraries:**

| Package | Purpose |
|---------|---------|
| `@nostrwatch/nocap` | Relay capability discovery framework |
| `@nostrwatch/route66` | NIP-66 aggregation and state management |
| `@nostrwatch/auditor` | Validates relays against their advertised NIP support |
| `@nostrwatch/relay-chronicle` | Historical relay data from NIP-66 events |

### What It Checks

- **Connectivity**: Can the relay accept WebSocket connections?
- **NIP support**: Does the relay actually support the NIPs it advertises in NIP-11?
- **Latency**: How fast does the relay respond to queries?
- **Uptime**: Historical availability tracking.
- **Capacity**: Read/write limitations, event size limits.
- **NIP-11 compliance**: Does the relay serve a valid information document?

---

## Quick Relay Debugging with nak

For ad-hoc relay debugging, nak is usually sufficient. You do not need a full monitoring setup to check if a relay is working.

### Check if a Relay is Reachable

```bash
# Fetch NIP-11 information document
nak relay wss://relay.damus.io
```

If this returns JSON with the relay name, description, and supported NIPs, the relay is up and serving its info document.

### Test Read Capability

```bash
# Try to fetch a few events
nak req -k 1 -l 3 wss://relay.damus.io
```

If events come back, the relay is accepting REQ messages and returning stored events.

### Test Write Capability

```bash
# Publish a test event
nak event --content "relay write test" --sec $(nak key generate) wss://relay.damus.io
```

If you get an OK response, the relay accepts writes. If you get an error, the relay may require authentication (NIP-42), payment, or have write restrictions.

### Check Supported NIPs

```bash
# Parse NIP-11 for supported NIPs
nak relay wss://relay.damus.io | jq '.supported_nips'
```

### Measure Latency

```bash
# Time a simple query
time nak req -k 0 -l 1 wss://relay.damus.io > /dev/null
```

### Test NIP-42 Authentication

```bash
# Some relays require AUTH before accepting events
# nak handles this automatically when --sec is provided
nak req -k 1 -l 1 --sec <nsec> wss://auth-required-relay.example.com
```

---

## Debugging Checklist

When a relay is not behaving as expected:

1. **Is it reachable?** -- `nak relay wss://...` (checks NIP-11)
2. **Does it accept connections?** -- `nak req -k 1 -l 1 wss://...`
3. **Does it accept writes?** -- `nak event --content "test" --sec <key> wss://...`
4. **What NIPs does it support?** -- Check NIP-11 `supported_nips` field
5. **Does it require AUTH?** -- Try with `--sec` flag
6. **Is it rate-limiting?** -- Send several rapid requests and check for errors
7. **Are events being stored?** -- Publish an event, then query for it by ID
8. **Load test** -- Use [Nostrillery](nostrillery.md) for sustained load testing

---

## See Also

- [Nostrillery](nostrillery.md) -- load testing relays
- [nak relay](../nak.md#nak-relay----relay-information) -- quick relay info
- [NIP-11 (Relay Information)](../../nips/relay-management/nip-11.md)
- [Relay Protocol](../../protocol/relay-protocol.md)
