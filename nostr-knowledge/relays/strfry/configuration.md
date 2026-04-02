# strfry Configuration Reference

strfry uses a configuration file in the `taocpp::config` format (similar to HOCON/JSON but with relaxed syntax). The default filename is `strfry.conf`.

## Configuration File Location

strfry searches for its config file in the following order:

1. `--config <path>` command-line flag
2. `STRFRY_CONFIG` environment variable
3. `/etc/strfry.conf`
4. `./strfry.conf`

---

## Complete Configuration Reference

### Database Settings

```
db = "./strfry-db/"
```

| Setting | Default | Description |
|---------|---------|-------------|
| `db` | `"./strfry-db/"` | Directory where LMDB database files are stored. Created automatically if it does not exist. |

### Database Internals (dbParams)

```
dbParams {
    maxreaders = 256
    mapsize = 10995116277760
    noReadAhead = false
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `dbParams.maxreaders` | `256` | Maximum number of concurrent LMDB reader slots. Each active thread holds a reader slot. Increase if you see "MDB_READERS_FULL" errors. |
| `dbParams.mapsize` | `10995116277760` (~10 TB) | Maximum database size in bytes. This reserves virtual address space, not physical RAM. Set lower on 32-bit systems. On 64-bit systems the default is fine. |
| `dbParams.noReadAhead` | `false` | When `true`, disables OS read-ahead on the memory-mapped file. May improve performance when the database is much larger than available RAM, as read-ahead would pull in pages that are unlikely to be needed. |

---

### Events Section

```
events {
    maxEventSize = 65536
    rejectEventsNewerThanSeconds = 900
    rejectEventsOlderThanSeconds = 94608000
    rejectEphemeralEventsOlderThanSeconds = 60
    ephemeralEventsLifetimeSeconds = 300
    maxNumTags = 2000
    maxTagValSize = 1024
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `events.maxEventSize` | `65536` (64 KB) | Maximum size of the normalized JSON event in bytes. Events larger than this are rejected. |
| `events.rejectEventsNewerThanSeconds` | `900` (15 min) | Reject events with `created_at` more than this many seconds in the future. Prevents clock-skew abuse. |
| `events.rejectEventsOlderThanSeconds` | `94608000` (~3 years) | Reject events with `created_at` more than this many seconds in the past. Set to `0` to disable. |
| `events.rejectEphemeralEventsOlderThanSeconds` | `60` | Reject ephemeral events (kinds 20000-29999) older than this. |
| `events.ephemeralEventsLifetimeSeconds` | `300` (5 min) | How long ephemeral events are kept in the database before automatic deletion. |
| `events.maxNumTags` | `2000` | Maximum number of tags allowed on a single event. |
| `events.maxTagValSize` | `1024` | Maximum size in bytes of any single tag value. |

---

### Relay Section

#### Network Binding

```
relay {
    bind = "127.0.0.1"
    port = 7777
    nofiles = 0
    realIpHeader = ""
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.bind` | `"127.0.0.1"` | IP address to bind to. Use `"0.0.0.0"` to listen on all interfaces. Default is localhost only -- you must change this or use a reverse proxy. |
| `relay.port` | `7777` | TCP port to listen on. |
| `relay.nofiles` | `0` | Set the `nofile` ulimit (max open file descriptors) on startup. `0` means do not change the current limit. Each WebSocket connection uses a file descriptor. For large relays, set to 65536 or higher. |
| `relay.realIpHeader` | `""` | HTTP header to read the client's real IP from when behind a reverse proxy. Typically `"X-Real-IP"` or `"X-Forwarded-For"`. Empty string means use the socket's remote address. |

#### NIP-42 Authentication

```
relay {
    auth {
        enabled = false
        serviceUrl = ""
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.auth.enabled` | `false` | Enable NIP-42 authentication. When enabled, the relay sends an `AUTH` challenge to clients on connect. |
| `relay.auth.serviceUrl` | `""` | URL used in the authentication challenge. This should be the relay's public WebSocket URL (e.g., `"wss://relay.example.com"`). Required when auth is enabled. |

#### Relay Information (NIP-11)

```
relay {
    info {
        name = "strfry default"
        description = ""
        pubkey = ""
        contact = ""
        icon = ""
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.info.name` | `"strfry default"` | Human-readable relay name shown in NIP-11 info document. |
| `relay.info.description` | `""` | Relay description. |
| `relay.info.pubkey` | `""` | Relay operator's nostr pubkey (hex format). |
| `relay.info.contact` | `""` | Contact information (email, nostr npub, etc.). |
| `relay.info.icon` | `""` | URL to the relay's icon/avatar. |

#### WebSocket and Connection Limits

```
relay {
    maxWebsocketPayloadSize = 131072
    autoPingSeconds = 55
    enableTcpKeepalive = false
    queryTimesliceBudgetMicroseconds = 10000
    maxFilterLimit = 500
    maxSubsPerConnection = 20
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.maxWebsocketPayloadSize` | `131072` (128 KB) | Maximum size of a single WebSocket message. Should be at least as large as `events.maxEventSize`. |
| `relay.autoPingSeconds` | `55` | Interval between automatic WebSocket ping frames. Keeps connections alive through proxies and NAT. Set to `0` to disable. |
| `relay.enableTcpKeepalive` | `false` | Enable TCP keepalive on connections. |
| `relay.queryTimesliceBudgetMicroseconds` | `10000` (10 ms) | Maximum time in microseconds to spend on a single query time-slice before yielding to other work. Prevents long-running queries from starving other clients. |
| `relay.maxFilterLimit` | `500` | Maximum value of the `limit` field in a client's REQ filter. Clients requesting more than this get capped. |
| `relay.maxSubsPerConnection` | `20` | Maximum number of concurrent subscriptions per WebSocket connection. |

#### Thread Configuration

```
relay {
    threads {
        ingester = 3
        reqWorker = 3
        reqMonitor = 3
        negentropy = 2
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.threads.ingester` | `3` | Number of threads for processing incoming events (validation, signature checking, DB writes). |
| `relay.threads.reqWorker` | `3` | Number of threads for processing REQ queries. |
| `relay.threads.reqMonitor` | `3` | Number of threads for monitoring live subscriptions and pushing matching events. |
| `relay.threads.negentropy` | `2` | Number of threads for negentropy sync sessions. |

#### Negentropy Protocol

```
relay {
    negentropy {
        enabled = true
        maxSyncEvents = 1000000
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.negentropy.enabled` | `true` | Enable negentropy (NIP-77) sync protocol support. When enabled, clients and other relays can perform set reconciliation. |
| `relay.negentropy.maxSyncEvents` | `1000000` | Maximum number of events to consider in a single negentropy sync session. Limits memory usage during large syncs. |

#### Compression

```
relay {
    compression {
        enabled = true
        slidingWindow = true
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.compression.enabled` | `true` | Enable WebSocket `permessage-deflate` compression. Reduces bandwidth at the cost of CPU. |
| `relay.compression.slidingWindow` | `true` | Enable sliding window for deflate compression. Improves compression ratio but uses more memory per connection (~300 KB per connection). Disable on memory-constrained systems with many connections. |

#### Write Policy Plugin

```
relay {
    writePolicy {
        plugin = ""
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.writePolicy.plugin` | `""` | Path to the write policy plugin executable. When set, all incoming events are passed to this plugin for accept/reject decisions. See the plugin system documentation in README.md. Empty string means accept all valid events. |

#### Logging

```
relay {
    logging {
        dumpInAll = false
        dumpInEvents = false
        dumpInReqs = false
        dbScanPerf = false
    }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `relay.logging.dumpInAll` | `false` | Log all incoming WebSocket messages (verbose). |
| `relay.logging.dumpInEvents` | `false` | Log incoming EVENT messages. |
| `relay.logging.dumpInReqs` | `false` | Log incoming REQ messages. |
| `relay.logging.dbScanPerf` | `false` | Log database scan performance metrics. Useful for debugging slow queries. |

#### Filter Validation

```
relay {
    numThreads {
        �filterValidation = false
    }
}
```

Note: Filter validation is disabled by default and is an experimental feature. When enabled, it validates that incoming filters are well-formed before executing queries.

---

## Example Configurations

### Public Relay

A relay open to the public internet, behind a reverse proxy:

```
db = "/var/lib/strfry/db/"

dbParams {
    maxreaders = 512
    mapsize = 10995116277760
}

events {
    maxEventSize = 65536
    rejectEventsNewerThanSeconds = 900
    rejectEventsOlderThanSeconds = 94608000
    ephemeralEventsLifetimeSeconds = 300
    maxNumTags = 2000
    maxTagValSize = 1024
}

relay {
    bind = "127.0.0.1"
    port = 7777
    nofiles = 65536
    realIpHeader = "X-Real-IP"

    info {
        name = "My Public Relay"
        description = "A public nostr relay"
        pubkey = "your-hex-pubkey-here"
        contact = "admin@example.com"
    }

    maxWebsocketPayloadSize = 131072
    autoPingSeconds = 55
    enableTcpKeepalive = false
    queryTimesliceBudgetMicroseconds = 10000
    maxFilterLimit = 500
    maxSubsPerConnection = 20

    threads {
        ingester = 4
        reqWorker = 4
        reqMonitor = 4
        negentropy = 2
    }

    negentropy {
        enabled = true
        maxSyncEvents = 1000000
    }

    compression {
        enabled = true
        slidingWindow = true
    }

    writePolicy {
        plugin = ""
    }

    logging {
        dumpInAll = false
        dumpInEvents = false
        dumpInReqs = false
        dbScanPerf = false
    }
}
```

### Private Relay (Whitelist Only)

A relay restricted to a set of approved pubkeys:

```
db = "/var/lib/strfry/db/"

events {
    maxEventSize = 65536
    rejectEventsNewerThanSeconds = 900
    rejectEventsOlderThanSeconds = 94608000
}

relay {
    bind = "127.0.0.1"
    port = 7777
    nofiles = 4096
    realIpHeader = "X-Real-IP"

    info {
        name = "Private Relay"
        description = "Invite-only relay"
        pubkey = "operator-hex-pubkey"
        contact = "admin@example.com"
    }

    auth {
        enabled = true
        serviceUrl = "wss://relay.example.com"
    }

    threads {
        ingester = 2
        reqWorker = 2
        reqMonitor = 2
        negentropy = 1
    }

    negentropy {
        enabled = true
        maxSyncEvents = 500000
    }

    compression {
        enabled = true
        slidingWindow = false
    }

    writePolicy {
        plugin = "/etc/strfry/plugins/whitelist.js"
    }
}
```

Whitelist plugin (`/etc/strfry/plugins/whitelist.js`):

```javascript
#!/usr/bin/env node

const readline = require('readline');

// Add approved pubkeys here
const ALLOWED = new Set([
  'aabbccdd...', // Alice
  'eeff0011...', // Bob
]);

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const req = JSON.parse(line);
  const allowed = ALLOWED.has(req.event.pubkey);
  const res = {
    id: req.event.id,
    action: allowed ? 'accept' : 'reject',
    msg: allowed ? '' : 'restricted: pubkey not on whitelist',
  };
  console.log(JSON.stringify(res));
});
```

### Paid Relay (with NIP-42 Auth)

A relay that requires authentication and could integrate with a payment backend:

```
db = "/var/lib/strfry/db/"

events {
    maxEventSize = 131072
    rejectEventsNewerThanSeconds = 900
    rejectEventsOlderThanSeconds = 94608000
    maxNumTags = 5000
    maxTagValSize = 2048
}

relay {
    bind = "127.0.0.1"
    port = 7777
    nofiles = 32768
    realIpHeader = "X-Forwarded-For"

    info {
        name = "Premium Relay"
        description = "Paid relay with guaranteed storage and uptime"
        pubkey = "operator-hex-pubkey"
        contact = "support@premiumrelay.example.com"
    }

    auth {
        enabled = true
        serviceUrl = "wss://premium.example.com"
    }

    maxWebsocketPayloadSize = 262144
    maxFilterLimit = 1000
    maxSubsPerConnection = 50

    threads {
        ingester = 4
        reqWorker = 6
        reqMonitor = 4
        negentropy = 2
    }

    negentropy {
        enabled = true
        maxSyncEvents = 2000000
    }

    compression {
        enabled = true
        slidingWindow = true
    }

    writePolicy {
        plugin = "/etc/strfry/plugins/paid-check.py"
    }
}
```

### Minimal Configuration

The smallest possible configuration file:

```
db = "./strfry-db/"
```

All other settings use defaults. The relay listens on 127.0.0.1:7777, accepts all valid events, and uses the default thread counts.

### High-Performance / High-Traffic Configuration

For relays expecting heavy load:

```
db = "/var/lib/strfry/db/"

dbParams {
    maxreaders = 1024
    mapsize = 10995116277760
    noReadAhead = true
}

events {
    maxEventSize = 65536
    maxNumTags = 2000
    maxTagValSize = 1024
}

relay {
    bind = "0.0.0.0"
    port = 7777
    nofiles = 131072
    realIpHeader = "X-Real-IP"

    info {
        name = "High Performance Relay"
        description = "Optimized for throughput"
        pubkey = "operator-hex-pubkey"
        contact = "ops@relay.example.com"
    }

    maxWebsocketPayloadSize = 131072
    autoPingSeconds = 55
    queryTimesliceBudgetMicroseconds = 5000
    maxFilterLimit = 200
    maxSubsPerConnection = 10

    threads {
        ingester = 8
        reqWorker = 8
        reqMonitor = 8
        negentropy = 4
    }

    negentropy {
        enabled = true
        maxSyncEvents = 2000000
    }

    compression {
        enabled = true
        slidingWindow = false
    }

    logging {
        dumpInAll = false
        dumpInEvents = false
        dumpInReqs = false
        dbScanPerf = false
    }
}
```

Key tuning notes for high-traffic relays:

- **noReadAhead = true** -- when the database is much larger than RAM, disabling read-ahead prevents the OS from pulling in unnecessary pages
- **slidingWindow = false** -- saves ~300 KB per connection; with thousands of connections this is significant
- **Lower maxFilterLimit and maxSubsPerConnection** -- prevents individual clients from consuming excessive resources
- **Lower queryTimesliceBudgetMicroseconds** -- more aggressive yielding keeps the relay responsive under load
- **Higher thread counts** -- scale with available CPU cores
- **Higher nofiles** -- each connection uses a file descriptor; 131072 supports a very large number of concurrent clients
