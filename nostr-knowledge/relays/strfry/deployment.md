# strfry Deployment Guide

This guide covers building, deploying, and operating a strfry relay in production.

---

## Building from Source

### Debian / Ubuntu

```bash
# Install dependencies
sudo apt update
sudo apt install -y \
  git g++ make \
  libssl-dev zlib1g-dev \
  liblmdb-dev libflatbuffers-dev \
  libsecp256k1-dev libzstd-dev

# Clone and build
git clone https://github.com/hoytech/strfry.git
cd strfry/
git submodule update --init
make setup-golpe
make -j$(nproc)

# Verify the build
./strfry --help
```

### FreeBSD

```bash
pkg install gcc gmake cmake git perl5 \
  openssl lmdb flatbuffers \
  libuv libinotify zstr secp256k1 zlib-ng

git clone https://github.com/hoytech/strfry.git
cd strfry/
git submodule update --init
make setup-golpe
gmake -j$(nproc)
```

### Install the Binary

```bash
sudo cp strfry /usr/local/bin/strfry
sudo chmod +x /usr/local/bin/strfry
```

### Upgrading

```bash
cd /path/to/strfry/
git pull
make update-submodules
make -j$(nproc)
sudo cp strfry /usr/local/bin/strfry
sudo systemctl restart strfry
```

---

## Docker Deployment

### Using the Official Dockerfile

strfry provides a multi-stage Alpine-based Dockerfile.

```bash
git clone https://github.com/hoytech/strfry.git
cd strfry/

# Build the image
docker build -t strfry .

# Run with default config
docker run -d \
  --name strfry \
  -p 7777:7777 \
  -v /var/lib/strfry/data:/app/strfry-db \
  -v /etc/strfry/strfry.conf:/app/strfry.conf \
  strfry relay
```

The Docker image:
- Uses `alpine:3.18.3` as the base (multi-stage build)
- Build stage installs all compilation dependencies
- Runtime stage includes only: lmdb, flatbuffers, libsecp256k1, libb2, zstd, libressl
- Exposes port 7777
- Entry point is `/app/strfry` with default command `relay`

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  strfry:
    build: .
    # Or use a pre-built image if available:
    # image: strfry:latest
    container_name: strfry
    restart: unless-stopped
    ports:
      - "7777:7777"
    volumes:
      - strfry-data:/app/strfry-db
      - ./strfry.conf:/app/strfry.conf:ro
      - ./plugins:/app/plugins:ro
    command: relay
    ulimits:
      nofile:
        soft: 65536
        hard: 65536

volumes:
  strfry-data:
    driver: local
```

Important Docker considerations:

- **Bind address:** In your `strfry.conf`, set `relay.bind = "0.0.0.0"` so the relay listens on all interfaces inside the container. Docker port mapping handles external exposure.
- **Persistent storage:** Always mount the database directory as a volume. LMDB data is lost if the container is removed without a volume.
- **File descriptor limits:** Set ulimits in Docker Compose or use `--ulimit nofile=65536:65536` with `docker run`.
- **Plugin mounting:** If using write policy plugins, mount the plugin directory into the container and ensure the runtime has the necessary interpreter (e.g., Node.js for JS plugins -- you may need a custom image).

---

## systemd Service Setup

### Create a System User

```bash
sudo useradd -r -s /usr/sbin/nologin -d /var/lib/strfry strfry
sudo mkdir -p /var/lib/strfry/db
sudo chown -R strfry:strfry /var/lib/strfry
```

### Configuration File

```bash
sudo mkdir -p /etc/strfry
sudo cp strfry.conf /etc/strfry/strfry.conf
sudo chown strfry:strfry /etc/strfry/strfry.conf
```

Edit `/etc/strfry/strfry.conf` and set at minimum:

```
db = "/var/lib/strfry/db/"

relay {
    bind = "127.0.0.1"
    port = 7777
    nofiles = 65536
    realIpHeader = "X-Real-IP"

    info {
        name = "My Relay"
        description = "A nostr relay"
        pubkey = "your-hex-pubkey"
        contact = "admin@example.com"
    }
}
```

### Service Unit File

Create `/etc/systemd/system/strfry.service`:

```ini
[Unit]
Description=strfry nostr relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=strfry
Group=strfry
ExecStart=/usr/local/bin/strfry --config /etc/strfry/strfry.conf relay
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/strfry
PrivateTmp=true
ProtectKernelTunables=true
ProtectControlGroups=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=strfry

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable strfry
sudo systemctl start strfry
sudo systemctl status strfry

# View logs
sudo journalctl -u strfry -f
```

### Zero-Downtime Restart

strfry supports zero-downtime restarts using `SO_REUSEPORT`:

```bash
# Start a new instance (binds to the same port)
sudo systemctl start strfry

# Signal the old instance to gracefully stop
# (it finishes serving existing connections then exits)
kill -SIGUSR1 <old-pid>
```

For routine restarts where brief interruptions are acceptable, `systemctl restart strfry` works fine.

---

## Reverse Proxy Configuration

strfry's default bind address is localhost. A reverse proxy handles TLS termination, WebSocket upgrades, and public-facing connections.

### Nginx

Install nginx and create `/etc/nginx/sites-available/strfry`:

```nginx
upstream strfry_backend {
    server 127.0.0.1:7777;
    keepalive 64;
}

server {
    listen 80;
    server_name relay.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name relay.example.com;

    ssl_certificate /etc/letsencrypt/live/relay.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # WebSocket proxy
    location / {
        proxy_pass http://strfry_backend;
        proxy_http_version 1.1;

        # Required for WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Pass real client IP
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;

        # Timeouts for long-lived WebSocket connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # Buffer settings
        proxy_buffering off;
        proxy_cache off;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/strfry /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Make sure `relay.realIpHeader = "X-Real-IP"` is set in `strfry.conf`.

### Caddy

Caddy handles TLS automatically via Let's Encrypt. Create `/etc/caddy/Caddyfile`:

```
relay.example.com {
    reverse_proxy 127.0.0.1:7777 {
        # WebSocket support is automatic in Caddy
        flush_interval -1
    }

    header {
        X-Real-IP {remote_host}
    }
}
```

Or using the `@websocket` matcher for more control:

```
relay.example.com {
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }

    reverse_proxy @websocket 127.0.0.1:7777 {
        flush_interval -1
    }

    reverse_proxy 127.0.0.1:7777
}
```

```bash
sudo systemctl reload caddy
```

### HAProxy

For operators already using HAProxy:

```
frontend nostr_front
    bind *:443 ssl crt /etc/haproxy/certs/relay.example.com.pem
    default_backend strfry_back

backend strfry_back
    server strfry1 127.0.0.1:7777 check
    timeout server 86400s
    timeout tunnel 86400s
```

---

## TLS Certificates

### Let's Encrypt with Certbot

```bash
# For Nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d relay.example.com

# For standalone (Caddy handles this automatically)
sudo certbot certonly --standalone -d relay.example.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

---

## Monitoring and Logging

### Prometheus Metrics

strfry exposes Prometheus metrics at `http://localhost:7777/metrics`. Available metrics:

| Metric | Description |
|--------|-------------|
| `nostr_client_messages_total{verb="EVENT"}` | Total EVENT messages received from clients |
| `nostr_client_messages_total{verb="REQ"}` | Total REQ messages received |
| `nostr_client_messages_total{verb="CLOSE"}` | Total CLOSE messages received |
| `nostr_relay_messages_total{verb="EVENT"}` | Total EVENT messages sent to clients |
| `nostr_relay_messages_total{verb="EOSE"}` | Total EOSE messages sent |
| `nostr_relay_messages_total{verb="OK"}` | Total OK messages sent |
| `nostr_events_total{kind="1"}` | Total events stored by kind |

Add a Prometheus scrape target:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'strfry'
    static_configs:
      - targets: ['localhost:7777']
    metrics_path: /metrics
    scrape_interval: 15s
```

Note: Metrics are per-process and reset on restart. If you need persistent metrics, consider using a Prometheus recording rule or long-term storage backend.

### Grafana Dashboard

Create a Grafana dashboard with panels for:

- **Events ingested per second:** `rate(nostr_client_messages_total{verb="EVENT"}[5m])`
- **Queries per second:** `rate(nostr_client_messages_total{verb="REQ"}[5m])`
- **Events served per second:** `rate(nostr_relay_messages_total{verb="EVENT"}[5m])`
- **Events by kind:** `rate(nostr_events_total[5m])` grouped by `kind`

### Log Management

strfry logs to stdout/stderr. When running under systemd, logs go to the journal:

```bash
# Follow logs
sudo journalctl -u strfry -f

# Logs from the last hour
sudo journalctl -u strfry --since "1 hour ago"

# Only error-level messages
sudo journalctl -u strfry -p err

# Export logs for analysis
sudo journalctl -u strfry --output=json > strfry-logs.json
```

Enable verbose logging temporarily for debugging:

```
relay {
    logging {
        dumpInAll = true
        dbScanPerf = true
    }
}
```

strfry hot-reloads configuration, so these changes take effect without a restart. Remember to disable verbose logging after debugging.

---

## Backup Strategies

### LMDB Backup

LMDB databases consist of a single `data.mdb` file (and optionally a `lock.mdb` file). Backup strategies:

#### Method 1: strfry export (Recommended for Portability)

```bash
# Export all events as JSONL
strfry --config /etc/strfry/strfry.conf export > /backup/strfry-$(date +%Y%m%d).jsonl

# Export with compression
strfry --config /etc/strfry/strfry.conf export | zstd > /backup/strfry-$(date +%Y%m%d).jsonl.zst

# Restore from backup
zstd -d /backup/strfry-20250101.jsonl.zst | strfry --config /etc/strfry/strfry.conf import
```

Pros: Portable, human-readable, can be imported into any relay implementation.
Cons: Slower than filesystem-level backup for large databases.

#### Method 2: strfry compact (Recommended for LMDB-to-LMDB)

```bash
# Create a compacted copy of the database
strfry --config /etc/strfry/strfry.conf compact /backup/strfry-compact/
```

This creates a fresh LMDB copy without fragmentation or free pages. It can be done while the relay is running (LMDB supports concurrent readers).

#### Method 3: Filesystem Snapshot

If your filesystem supports snapshots (ZFS, LVM, Btrfs):

```bash
# ZFS example
zfs snapshot tank/strfry@backup-$(date +%Y%m%d)

# LVM example
lvcreate --snapshot --name strfry-snap --size 10G /dev/vg0/strfry
```

This is the fastest backup method and produces a point-in-time consistent copy because LMDB uses copy-on-write within its own transactions.

#### Method 4: Direct File Copy

```bash
# Stop the relay first for a guaranteed consistent copy
sudo systemctl stop strfry
cp /var/lib/strfry/db/data.mdb /backup/data.mdb
sudo systemctl start strfry
```

You can also copy `data.mdb` while strfry is running. LMDB's architecture ensures readers always see a consistent state. However, the copied file may include data from an in-progress write transaction, so it is safest to stop the relay first or use `strfry compact`.

### Automated Backup Script

```bash
#!/bin/bash
# /etc/cron.daily/strfry-backup

BACKUP_DIR="/backup/strfry"
RETENTION_DAYS=14
CONFIG="/etc/strfry/strfry.conf"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Export and compress
/usr/local/bin/strfry --config "$CONFIG" export | zstd -T0 > "$BACKUP_DIR/strfry-$DATE.jsonl.zst"

# Remove old backups
find "$BACKUP_DIR" -name "strfry-*.jsonl.zst" -mtime +$RETENTION_DAYS -delete

echo "Backup complete: strfry-$DATE.jsonl.zst"
```

---

## Scaling Considerations

### Vertical Scaling

strfry scales vertically by adding more CPU cores and RAM:

- **CPU:** More cores allow more ingester, reqWorker, and reqMonitor threads. Scale thread counts to match available cores, leaving some headroom for the OS and other processes.
- **RAM:** LMDB performance depends on how much of the database fits in the OS page cache. More RAM means more of the database can be cached, reducing disk I/O. For a 50 GB database, 64 GB of RAM ensures most of it stays cached.
- **Storage:** Use SSDs (NVMe preferred). LMDB's random read pattern performs poorly on spinning disks. For very large databases, ensure sufficient IOPS.

### Horizontal Scaling

strfry does not natively support clustering, but there are patterns for horizontal scaling:

#### Pattern 1: Negentropy Sync Cluster

Run multiple strfry instances and sync them with negentropy:

```bash
# On relay-1, periodically sync with relay-2
strfry sync wss://relay-2.internal:7777 --dir both
```

Or use the router for continuous synchronization:

```
streams {
    cluster {
        dir = "both"
        urls = ["wss://relay-2.internal:7777", "wss://relay-3.internal:7777"]
    }
}
```

Place a load balancer in front of the instances. Each instance has a full copy of the data, so any instance can serve any request.

#### Pattern 2: Read Replicas

Use `strfry router` with `dir = "down"` to create read replicas:

```
streams {
    primary {
        dir = "down"
        urls = ["wss://primary-relay.internal:7777"]
    }
}
```

Read replicas handle query traffic. Writes go only to the primary.

#### Pattern 3: Sharded by Kind or Pubkey

Run multiple strfry instances, each handling specific event kinds or pubkey ranges. Use a routing layer to direct requests.

### Connection Limits

Each WebSocket connection consumes:
- One file descriptor
- ~10-50 KB of memory for connection state
- ~300 KB additional if `compression.slidingWindow = true`

For 10,000 concurrent connections with sliding window compression:
- File descriptors: 10,000 (set `nofiles` accordingly)
- Memory for connections: ~3.5 GB
- Plus LMDB page cache usage

---

## Common Operational Tasks

### Database Compaction

LMDB databases grow monotonically. Deleted events leave free pages inside the file but do not shrink it. Compact periodically:

```bash
# Stop the relay (optional but safest)
sudo systemctl stop strfry

# Create compacted copy
strfry --config /etc/strfry/strfry.conf compact /tmp/strfry-compact/

# Replace old database
mv /var/lib/strfry/db/data.mdb /var/lib/strfry/db/data.mdb.old
mv /tmp/strfry-compact/data.mdb /var/lib/strfry/db/data.mdb
chown strfry:strfry /var/lib/strfry/db/data.mdb
rm /var/lib/strfry/db/data.mdb.old

# Restart
sudo systemctl start strfry
```

### Deleting Events

```bash
# Delete by filter (e.g., all kind 4 events)
strfry --config /etc/strfry/strfry.conf delete --filter '{"kinds":[4]}'

# Delete a specific event by ID
strfry --config /etc/strfry/strfry.conf delete --filter '{"ids":["abc123..."]}'

# Delete events from a specific pubkey
strfry --config /etc/strfry/strfry.conf delete --filter '{"authors":["def456..."]}'
```

### Importing and Exporting Data

```bash
# Export all events
strfry export > all-events.jsonl

# Export events from a time range
strfry export --since 1700000000 --until 1710000000 > january-events.jsonl

# Export in reverse chronological order
strfry export --reverse > events-newest-first.jsonl

# Export with precomputed FlatBuffers data (faster import)
strfry export --fried > events-fried.jsonl

# Import from JSONL
cat events.jsonl | strfry import

# Import from another relay via download
strfry download wss://relay.example.com --filter '{"kinds":[0,1,3]}'
```

### Querying the Database

```bash
# Scan for events matching a filter
strfry scan '{"authors":["abc123..."],"kinds":[1],"limit":10}'

# Count events
strfry scan '{"kinds":[1]}' | wc -l
```

### Migrating Between Servers

```bash
# On the old server: export
strfry --config /etc/strfry/strfry.conf export | zstd > strfry-export.jsonl.zst

# Transfer the file
rsync -avP strfry-export.jsonl.zst newserver:/tmp/

# On the new server: import
zstd -d /tmp/strfry-export.jsonl.zst | strfry --config /etc/strfry/strfry.conf import
```

Or use negentropy sync for a live migration:

```bash
# On the new server, sync from the old server
strfry sync wss://old-server.example.com:7777 --dir down
```

### Disk Space Optimization with Zstd Compression

```bash
# Train a dictionary on existing events
strfry dict train --filter '{"kinds":[1]}'

# Compress kind 1 events
strfry dict compress --filter '{"kinds":[1]}'

# Check compression stats
strfry dict stats
```

Typical compression ratios for text events (kind 1) are 40-60% size reduction.

---

## Firewall Configuration

If not using a reverse proxy, open port 7777 (or your configured port):

```bash
# UFW
sudo ufw allow 7777/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 7777 -j ACCEPT
```

When using a reverse proxy, only ports 80 and 443 need to be open. strfry should bind to 127.0.0.1.

---

## Health Checks

### Basic WebSocket Check

```bash
# Using websocat
echo '["REQ","healthcheck",{"limit":1}]' | websocat ws://localhost:7777

# Using curl (NIP-11 info document)
curl -H "Accept: application/nostr+json" http://localhost:7777/
```

### systemd Watchdog (Optional)

Add a health check script and integrate it with systemd:

```bash
#!/bin/bash
# /usr/local/bin/strfry-health.sh
curl -sf -H "Accept: application/nostr+json" http://localhost:7777/ > /dev/null 2>&1
```

---

## Troubleshooting

### Common Issues

**"MDB_READERS_FULL" error:**
Increase `dbParams.maxreaders` in strfry.conf. This happens when too many concurrent threads/connections are trying to read the database.

**"MDB_MAP_FULL" error:**
The database has reached the configured `mapsize` limit. Increase `dbParams.mapsize` and restart.

**High memory usage:**
LMDB's memory-mapped file appears as resident memory in tools like `top` or `htop`, but this is the OS page cache, not heap memory. The actual process memory is much lower. To verify, check `RssAnon` in `/proc/<pid>/status`.

**Slow queries:**
Enable `relay.logging.dbScanPerf = true` to see query performance metrics. Common causes: queries without indexed fields, very broad time ranges, or high `limit` values.

**WebSocket connections dropping:**
Check `proxy_read_timeout` in Nginx (should be 86400s for long-lived WebSocket connections). Also verify `relay.autoPingSeconds` is set to keep connections alive through intermediate proxies and NAT.

**Events not being accepted:**
Check write policy plugin logs. If using a plugin, ensure it is executable, has the correct shebang line, and flushes stdout after each response.
