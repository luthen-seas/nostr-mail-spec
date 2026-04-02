# nostream

> TypeScript Nostr relay with PostgreSQL backend and payment integration.

---

## Overview

**nostream** (formerly nostr-ts-relay) is a production-ready Nostr relay written in TypeScript/Node.js. It uses PostgreSQL for event storage and Redis for caching and real-time data. Created by Cameri, it was one of the first relays to implement payment-gated access via Lightning.

- **Repository**: https://github.com/Cameri/nostream
- **Language**: TypeScript (Node.js 18+)
- **Storage**: PostgreSQL 14+
- **Cache**: Redis
- **License**: MIT

---

## Architecture

```
Client (WebSocket) -> nostream (Node.js) -> PostgreSQL (events)
                                         -> Redis (cache, pubsub)
```

nostream runs as a Node.js process handling WebSocket connections. Events are validated and stored in PostgreSQL. Redis provides caching for hot data and pub/sub for real-time subscription notifications across potential multiple workers.

---

## NIP Support

NIP-01, NIP-02, NIP-04, NIP-09, NIP-11, NIP-11a, NIP-12, NIP-13, NIP-15, NIP-16, NIP-20, NIP-22, NIP-28, NIP-33, NIP-40.

---

## Key Features

- **Payment integration**: Supports ZEBEDEE, Nodeless, OpenNode, LNbits, and LNURL providers (Alby, etc.). Configure minimum balance for event publication and relay admission fees.
- **Rate limiting**: Configurable event rate limits and size constraints.
- **Content filtering**: Customizable content rules.
- **Docker deployment**: Docker Compose is the recommended deployment method.
- **Configuration**: YAML-based settings file at `.nostr/settings.yaml`. Customizable via `NOSTR_CONFIG_DIR` environment variable.
- **Testing**: Unit tests, integration tests (Docker-based), BDD cucumber tests, and NYC coverage reporting.

---

## Deployment

```bash
# Docker Compose (recommended)
git clone https://github.com/Cameri/nostream
cd nostream
docker compose up -d
```

Also supports standalone Node.js installation and systemd service configuration.

---

## See Also

- [Relay overview](../README.md)
- [Full relay catalog](../others/catalog.md)
