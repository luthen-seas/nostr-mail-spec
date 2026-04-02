# HAVEN

> Four relays and a Blossom media server in one package. The sovereign personal relay.

---

## Overview

**HAVEN** is a Go-based Nostr relay stack by bitvora that combines four purpose-specific relays and an integrated Blossom media server into a single binary. It is designed as the ultimate personal relay: run one process and get a complete, self-sovereign Nostr infrastructure.

- **Repository**: https://github.com/bitvora/haven
- **Language**: Go
- **Storage**: BadgerDB (default) or LMDB
- **License**: MIT
- **Status**: Feature-complete, bug-fix-only maintenance

---

## The Four Relays

HAVEN exposes four distinct relay endpoints on a single port (default: 3355):

### 1. Private Relay
Only accessible by the relay owner and explicitly whitelisted npubs. Intended for sensitive content: drafts, financial data, private notes. Requires NIP-42 authentication.

### 2. Chat Relay
Restricted to encrypted direct messages (NIP-04, NIP-44) and group chats. Protected by authentication. Access limited to web-of-trust members.

### 3. Inbox Relay
Aggregates notes where the owner is mentioned or tagged. HAVEN automatically pulls these from other relays. This is your personal "notifications" store.

### 4. Outbox Relay
Publicly readable. Contains the owner's published notes and whitelisted content. Automatically broadcasts to other relays via Blastr integration.

### 5. Blossom Media Server
Integrated image and video hosting with restricted upload permissions. Handles media that would otherwise require a separate hosting service.

---

## Key Features

- **Web of Trust (WoT)**: Spam protection through trust-based access control. Only notes from trusted pubkeys (within N hops) are accepted.
- **Blastr integration**: Automatic broadcasting of outbox notes to configured external relays.
- **Import/Export**: JSONL-based backup. Supports periodic uploads to cloud storage.
- **No external database**: BadgerDB and LMDB are both embedded -- no PostgreSQL or other service needed.
- **LMDB option**: For NVMe systems, LMDB offers better read performance with configurable map sizing.

---

## Deployment

Pre-built binaries for Linux, macOS, and Windows. Also supports:
- Systemd service (Linux)
- Reverse proxy configs for Nginx, Apache, Caddy
- Docker (community-maintained)
- Start9, Umbrel wrappers
- macOS native app (community)

Configuration via `.env` file and JSON relay lists (`relays_import.json`, `relays_blastr.json`).

---

## When to Choose HAVEN

- You want a single binary that replaces multiple relay + media hosting setups.
- You want inbox/outbox relay separation for the NIP-65 gossip model.
- You want built-in WoT spam filtering.
- You want media hosting without a separate service.

---

## See Also

- [Relay overview](../README.md)
- [Full relay catalog](catalog.md)
