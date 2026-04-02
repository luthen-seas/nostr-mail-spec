# Relay Operator — Patterns

## Inbox Relay Configuration for NOSTR Mail

An inbox relay is a specialized relay configured to act as a mailbox for registered users. It accepts encrypted messages (kind 1059 gift-wrapped events) destined for its users and enforces access controls so only the intended recipient can read them.

### Event Acceptance Policy
- **Accept kind 1059 events** where a `p` tag matches a registered user's pubkey
- **Reject kind 1059 events** where no `p` tag matches any registered user (return `["OK", id, false, "blocked: recipient not registered on this relay"]`)
- **Optionally accept** other kinds (kind 0 metadata, kind 10002 relay lists) for registered users
- **Reject** all other event kinds unless specifically needed

### Read Access Control (NIP-42 AUTH Required)
- **Require authentication** for all REQ subscriptions
- **Filter enforcement**: only return events where the `p` tag matches the authenticated pubkey
- A user can only read events addressed to them — never events addressed to other users
- Unauthenticated REQ receives: `["CLOSED", sub_id, "auth-required: please authenticate"]`

### Storage Guarantee
- **Minimum retention**: 90 days for kind 1059 events (configurable per deployment)
- **No premature deletion**: events within retention window MUST NOT be garbage collected
- **Configurable per plan**: free tier = 30 days, paid tier = 365 days, premium = indefinite
- **Notify clients of retention**: advertise via NIP-11 `retention` field

### Rate Limiting (Anti-Flood)
- **Inbound per recipient**: max 100 kind 1059 events per recipient pubkey per hour
- **Inbound per sender IP**: max 200 kind 1059 events per IP per hour
- **Burst allowance**: allow short bursts (e.g., 20 events in 1 minute) for legitimate use (importing messages)
- **Response on limit**: `["OK", id, false, "rate-limited: too many messages to this recipient"]`

### Optional: L402 / Payment Gating
- For non-authenticated publishers (unknown senders), require L402 payment before accepting events
- Payment amount: configurable (e.g., 10-100 sats per event)
- Payment verification: check L402 macaroon / preimage before accepting the EVENT
- Authenticated and whitelisted senders: bypass payment gate
- Purpose: spam prevention for open inbox relays

---

## strfry Deployment Pattern

### Infrastructure
- **Server**: Linux VPS (Ubuntu 22.04+ or Debian 12+), $5-20/month depending on scale
  - Small relay (< 1000 users): 1 vCPU, 2GB RAM, 40GB SSD ($5-10/month)
  - Medium relay (1000-10000 users): 2 vCPU, 4GB RAM, 80GB SSD ($10-20/month)
  - Large relay (10000+ users): 4+ vCPU, 8GB+ RAM, 200GB+ SSD ($40+/month)
- **Domain**: dedicated subdomain (e.g., relay.nostrmail.com)
- **TLS**: required for wss:// — use Let's Encrypt with certbot

### strfry Configuration

Key configuration parameters (`strfry.conf`):
```
db {
    # LMDB max database size — set larger than needed, LMDB uses sparse files
    # Rule of thumb: 10GB per 10,000 active users for kind 1059 events
    maxreaders = 256
    mapsize = 10737418240  # 10GB
}

relay {
    # NIP-11 information
    name = "NostrMail Inbox Relay"
    description = "Inbox relay for NostrMail users"

    # Connection limits
    maxWebsocketPayloadSize = 131072  # 128KB
    
    # Event limits  
    maxFilterLimit = 5000

    # Write policy plugin (custom filtering)
    writePolicy {
        plugin = "/etc/strfry/mail-policy.py"
    }
}
```

### strfry Write Policy Plugin
Custom event filtering script executed for each incoming event. strfry pipes event JSON to stdin, expects accept/reject on stdout.

Example mail relay policy (Python):
```python
#!/usr/bin/env python3
import sys
import json

# Load registered users (pubkey set)
REGISTERED_USERS = set(open("/etc/strfry/registered_users.txt").read().split())

for line in sys.stdin:
    event = json.loads(line)
    action = event.get("type", "")
    
    if action == "new":
        evt = event["event"]
        kind = evt["kind"]
        
        # Accept kind 1059 (gift wrap) only if p-tag matches a registered user
        if kind == 1059:
            p_tags = [t[1] for t in evt["tags"] if t[0] == "p"]
            if any(p in REGISTERED_USERS for p in p_tags):
                result = {"id": event["event"]["id"], "action": "accept"}
            else:
                result = {"id": event["event"]["id"], "action": "reject", "msg": "recipient not registered"}
        else:
            result = {"id": event["event"]["id"], "action": "reject", "msg": "only kind 1059 accepted"}
    
        print(json.dumps(result), flush=True)
```

### Nginx Reverse Proxy with TLS

```nginx
server {
    listen 443 ssl http2;
    server_name relay.nostrmail.com;

    ssl_certificate /etc/letsencrypt/live/relay.nostrmail.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.nostrmail.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

server {
    listen 80;
    server_name relay.nostrmail.com;
    return 301 https://$server_name$request_uri;
}
```

### Monitoring with Prometheus and Grafana
- strfry exposes metrics at a configurable endpoint
- Key metrics to collect:
  - `strfry_events_total` — total events stored (by kind)
  - `strfry_connections_active` — current WebSocket connections
  - `strfry_events_received_total` — events received (accepted vs rejected)
  - `strfry_db_size_bytes` — LMDB database size
- Grafana dashboard: connection count, event ingestion rate, storage growth, error rate

### Certbot TLS Setup
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d relay.nostrmail.com
# Auto-renewal via systemd timer (certbot installs this automatically)
```

---

## khatru Deployment Pattern

### Architecture
khatru is a Go library/framework for building custom NOSTR relays. Unlike strfry (which is a standalone binary with plugin system), khatru is embedded in your Go application.

### Custom Event Handlers for Mail Relay
```go
package main

import (
    "github.com/fiatjaf/khatru"
    "github.com/nbd-wtf/go-nostr"
)

func main() {
    relay := khatru.NewRelay()
    
    relay.Info.Name = "NostrMail Inbox Relay"
    relay.Info.Description = "Inbox relay for NostrMail users"
    relay.Info.SupportedNIPs = []int{1, 11, 42, 44, 59}
    
    // Require authentication
    relay.RequireAuth = true
    
    // Custom event acceptance policy
    relay.RejectEvent = append(relay.RejectEvent,
        func(ctx context.Context, event *nostr.Event) (bool, string) {
            // Only accept kind 1059 (gift wrap)
            if event.Kind != 1059 {
                return true, "only kind 1059 accepted"
            }
            // Check p-tag matches registered user
            for _, tag := range event.Tags {
                if tag[0] == "p" && isRegisteredUser(tag[1]) {
                    return false, "" // accept
                }
            }
            return true, "recipient not registered"
        },
    )
    
    // Custom read filter: only return events addressed to authenticated user
    relay.RejectFilter = append(relay.RejectFilter,
        func(ctx context.Context, filter nostr.Filter) (bool, string) {
            pubkey := khatru.GetAuthed(ctx)
            if pubkey == "" {
                return true, "auth-required: please authenticate"
            }
            // Ensure filter only queries events for the authenticated user
            if !containsOnly(filter.Tags["p"], pubkey) {
                return true, "restricted: can only query your own events"
            }
            return false, ""
        },
    )
    
    // Start server
    relay.Start("0.0.0.0", 7777)
}
```

### Storage Backend Options
- **LMDB** via `khatru/lmdb` adapter — same performance characteristics as strfry
- **SQLite** via `khatru/sqlite3` adapter — simpler, good for smaller deployments
- **PostgreSQL** via custom adapter — for large-scale deployments
- **Badger** via `khatru/badger` adapter — write-optimized alternative

### Deployment
- Build: `go build -o nostrmail-relay .`
- Deploy as systemd service, Docker container, or on fly.io / Railway
- Same Nginx + TLS setup as strfry

---

## Scaling Patterns

### Vertical Scaling
- **More RAM**: LMDB performance directly correlates with how much of the database fits in RAM
  - Rule: RAM should be >= active dataset size for optimal performance
  - If DB = 10GB but only 2GB recent data is "hot", 4GB RAM may suffice
- **Faster SSD**: NVMe > SATA SSD for both read and write performance
  - LMDB write performance limited by fsync latency — NVMe helps significantly
- **More CPU**: helps with signature verification (CPU-bound) and subscription matching
  - strfry parallelizes signature verification across cores

### Horizontal Scaling

**Geographic Replicas**
- Deploy relay instances in multiple regions (US-East, EU-West, Asia)
- User publishes to nearest relay (lowest latency)
- Relays sync events to each other via:
  - **strfry stream**: built-in relay-to-relay streaming (strfry-specific)
  - **Negentropy protocol**: set reconciliation for efficient relay-to-relay sync
- Benefits: lower latency for users, geographic redundancy, fault tolerance

**Read Replicas**
- Primary relay: accepts writes (EVENT messages)
- Read replicas: serve subscriptions (REQ messages) from replicated data
- Replication: strfry stream from primary to replicas, or database-level replication (PostgreSQL streaming replication)
- Load balancer: Nginx upstream distributes REQ connections across replicas, routes EVENT to primary

**Sharding (Advanced)**
- Shard by recipient pubkey range (e.g., first 2 hex chars of pubkey)
- Each shard handles a subset of users
- Router layer inspects `p` tag and routes to correct shard
- Complexity: high — only needed at very large scale (100K+ active users)

---

## Monitoring (Privacy-Preserving)

### Metrics to Collect

**Event Metrics (by kind, NOT by author)**
- `events_stored_total{kind="1059"}` — total gift-wrapped events stored
- `events_received_total{kind="1059", status="accepted"}` — accepted events
- `events_received_total{kind="1059", status="rejected"}` — rejected events
- `events_expired_total{kind="1059"}` — events removed by retention policy
- Storage growth rate (bytes per hour/day)

**Connection Metrics**
- `connections_active` — current WebSocket connections
- `connections_total` — cumulative connections since startup
- `connections_authenticated` — connections with NIP-42 auth completed
- `subscriptions_active` — current active subscriptions

**Performance Metrics**
- Event receipt to subscriber delivery latency (p50, p95, p99)
- Signature verification latency
- Subscription matching latency
- Database query latency (read, write)

**Error Metrics**
- Error rate by type: validation failure, rate limit, auth failure, storage error
- WebSocket errors: connection reset, timeout, protocol error

**Infrastructure Metrics**
- CPU utilization, memory usage, disk I/O
- LMDB map usage (percentage of max database size used)
- Network bandwidth (in/out)

### What NOT to Log or Monitor

Privacy is a core property of a mail relay. The following data MUST NOT be collected, logged, or stored outside of the event storage itself:

- **Event content**: never log decrypted content (you cannot decrypt kind 1059 anyway, but do not log encrypted content either)
- **Specific author-recipient pairs**: do not log which pubkeys are communicating with each other
- **IP-to-pubkey mapping**: do not log which IP addresses are associated with which pubkeys (this de-anonymizes users)
- **Individual user activity**: do not log how many messages a specific user sends or receives
- **Subscription filters**: do not log the specific filters in REQ messages (reveals what a user is looking for)
- **Query patterns**: do not log timing patterns that could reveal communication metadata

### Alerting Thresholds
- Storage > 80% of LMDB max size: alert to increase mapsize
- Connection count > 80% of max: alert to scale
- Event rejection rate > 50%: alert for potential spam attack
- p99 latency > 5 seconds: alert for performance degradation
- Disk space < 20% free: critical alert

### Log Retention
- Access logs (IP, timestamp, connection/disconnection): retain 7 days max, then delete
- Error logs: retain 30 days
- Metric time series: retain 90 days at full resolution, 1 year at reduced resolution
- Audit logs (admin actions): retain 1 year
