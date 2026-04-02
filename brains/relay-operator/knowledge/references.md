# Relay Operator — References

## Relay Implementations

### strfry
- **Repository**: https://github.com/hoytech/strfry
- **Language**: C++
- **Storage**: LMDB
- **Key features**: high performance, write policy plugins (stdin/stdout protocol), relay-to-relay streaming, negentropy sync, flat config file, single binary deployment
- **Documentation**: README in repo, config file comments, strfry.conf.example
- **Relevance**: most widely deployed relay implementation. Recommended as the default choice for NOSTR Mail inbox relays due to performance, simplicity, and write policy plugin support.

### khatru
- **Repository**: https://github.com/fiatjaf/khatru
- **Language**: Go
- **Storage**: pluggable (LMDB, SQLite, PostgreSQL, Badger via adapters)
- **Key features**: relay framework (embed in your Go app), custom event handlers, custom filter logic, middleware pattern, built-in NIP-42 auth support
- **Documentation**: README, Go package docs, example relays in repo
- **Relevance**: best choice when you need custom relay logic beyond what strfry plugins can express. Ideal for building a purpose-built inbox relay with complex business logic (user registration, payment verification, per-user storage quotas).

### nostr-rs-relay
- **Repository**: https://github.com/scsibug/nostr-rs-relay
- **Language**: Rust
- **Storage**: SQLite
- **Key features**: configuration via TOML file, NIP-42 auth, event validation, rate limiting, IP-based and pubkey-based access control
- **Documentation**: README, config.toml.example
- **Relevance**: good alternative for operators who prefer Rust and SQLite. Simpler codebase than strfry, easier to understand and modify.

---

## NIP Specifications for Relay Operators

### NIP-01: Basic Protocol
- **Source**: https://github.com/nostr-protocol/nips/blob/master/01.md
- **Content**: defines the core relay protocol — EVENT, REQ, CLOSE messages, filter format, OK/EOSE/CLOSED responses, event format and validation rules
- **Relevance**: the foundational spec. Every relay must implement NIP-01 correctly.

### NIP-11: Relay Information Document
- **Source**: https://github.com/nostr-protocol/nips/blob/master/11.md
- **Content**: defines the HTTP endpoint (same URL as WebSocket) that returns relay metadata as JSON — name, description, supported NIPs, limitations, retention policies
- **Relevance**: clients use NIP-11 to discover relay capabilities. Essential for advertising auth requirements, size limits, and supported NIPs.

### NIP-42: Authentication of Clients to Relays
- **Source**: https://github.com/nostr-protocol/nips/blob/master/42.md
- **Content**: challenge-response authentication protocol. Relay sends AUTH challenge, client signs kind 22242 event with challenge and relay URL, relay verifies.
- **Relevance**: critical for inbox relays. NIP-42 enables read access control (only recipient can read their mail) and write access control (only registered users or paying senders can publish).

### NIP-45: Counting Results (COUNT)
- **Source**: https://github.com/nostr-protocol/nips/blob/master/45.md
- **Content**: COUNT message type — client sends a filter, relay responds with the count of matching events instead of the events themselves
- **Relevance**: useful for inbox badge counts ("you have 5 unread messages") without downloading all events. Reduces bandwidth for mobile clients.

---

## Infrastructure References

### Nginx WebSocket Proxy Configuration
- **Source**: Nginx documentation
- **URL**: https://nginx.org/en/docs/http/websocket.html
- **Key configuration**:
  - `proxy_http_version 1.1` — required for WebSocket upgrade
  - `proxy_set_header Upgrade $http_upgrade` — pass Upgrade header
  - `proxy_set_header Connection "upgrade"` — set Connection header
  - `proxy_read_timeout` — set high (86400s) to keep WebSocket connections alive
- **Relevance**: standard reverse proxy setup for all relay deployments. Handles TLS termination, connection upgrade, and request routing.

### Let's Encrypt / certbot
- **Source**: https://letsencrypt.org/ and https://certbot.eff.org/
- **Usage**: free TLS certificates for relay domains
- **Setup**: `certbot --nginx -d relay.example.com` for automated Nginx integration
- **Renewal**: automatic via systemd timer or cron job (certbot renew)
- **Relevance**: TLS is required for wss:// connections. Let's Encrypt provides free, automated certificates.

### Prometheus + Grafana Monitoring Stack
- **Prometheus**: https://prometheus.io/
  - Time-series database for metrics collection
  - Pull-based: scrapes metrics endpoints at configurable intervals
  - PromQL for querying and alerting
- **Grafana**: https://grafana.com/
  - Visualization and dashboarding
  - Pre-built dashboards for system metrics, custom dashboards for relay metrics
  - Alerting integration (email, Slack, PagerDuty)
- **Relevance**: standard monitoring stack. strfry can expose Prometheus-compatible metrics. Custom exporters can be built for khatru-based relays.

---

## Storage Engine Documentation

### LMDB
- **Source**: https://www.symas.com/lmdb
- **Documentation**: http://www.lmdb.tech/doc/
- **Key concepts**:
  - Memory-mapped I/O: database pages mapped directly into process address space
  - Copy-on-write: readers never block writers, writers never block readers (MVCC)
  - Single-writer: only one write transaction at a time (serialized via mutex)
  - mapsize: maximum database size, must be set at open time, can be increased later
  - maxreaders: maximum concurrent read transactions, must be >= expected connections
- **Relevance**: strfry's storage engine. Understanding LMDB is essential for capacity planning and performance tuning.

---

## Relay-to-Relay Sync

### Negentropy Protocol
- **Source**: https://github.com/hoytech/negentropy
- **Concept**: set reconciliation protocol — two relays efficiently determine which events one has that the other doesn't, then transfer only the missing events
- **How it works**:
  1. Both sides compute a fingerprint of their event sets
  2. Exchange fingerprints to identify differences
  3. Transfer only missing events
  4. Bandwidth: proportional to the difference, not the total set size
- **Implementation**: built into strfry (`strfry sync` command), also available as a library
- **Relevance**: essential for relay replication and geographic distribution. Enables efficient sync between inbox relay replicas without transferring events that already exist on both sides.

---

## Operator Guides

### nostr.how Relay Guides
- **URL**: https://nostr.how/
- **Content**: beginner-friendly guides for setting up NOSTR relays, including step-by-step VPS setup, strfry installation, Nginx configuration, and monitoring
- **Relevance**: good starting point for operators new to relay deployment. Covers the basics that this knowledge base builds upon.

### Relay Operator Community
- **Telegram**: Nostr Relay Operators group
- **Nostr**: follow relay operators on Nostr for operational insights
- **GitHub Discussions**: strfry and khatru repos have active discussions on deployment patterns
