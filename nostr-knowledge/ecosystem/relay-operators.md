# NOSTR Relay Operators and Infrastructure

> Overview of major public relays, paid relays, specialty relays, and how to discover them.
> Last updated: 2026-03-31

---

## Notable Public Relays

These free, open-access relays form the backbone of the NOSTR network. They are operated by individuals and organizations and accept events from anyone.

| Relay | URL | Operator / Notes |
|-------|-----|------------------|
| **relay.damus.io** | `wss://relay.damus.io` | Operated by the Damus team; one of the most widely used default relays |
| **nos.lol** | `wss://nos.lol` | Major public relay; commonly included in default relay lists |
| **relay.nostr.band** | `wss://relay.nostr.band` | Operated by nostr.band; doubles as a search and analytics relay |
| **relay.primal.net** | `wss://relay.primal.net` | Operated by Primal; backed by their caching infrastructure |
| **nostr.mom** | `wss://nostr.mom` | Popular public relay |
| **offchain.pub** | `wss://offchain.pub` | Community relay |
| **relay.nostr.net** | `wss://relay.nostr.net` | Public relay |
| **nostr.bitcoiner.social** | `wss://nostr.bitcoiner.social` | Bitcoin community-oriented relay |
| **nostr.oxtr.dev** | `wss://nostr.oxtr.dev` | Developer-oriented relay |
| **soloco.nl** | `wss://soloco.nl` | European relay (Netherlands) |
| **nostr.einundzwanzig.space** | `wss://nostr.einundzwanzig.space` | German Bitcoin/NOSTR community relay |
| **nostr-pub.wellorder.net** | `wss://nostr-pub.wellorder.net` | One of the earliest public relays; frequently in default configurations |

Most NOSTR clients ship with a default set of relays pre-configured. Common defaults include relay.damus.io, nos.lol, and nostr-pub.wellorder.net.

---

## Paid Relays

Paid relays charge a fee (typically in sats via Lightning) to store and serve events. The fee model helps cover operating costs and reduces spam, since spammers are less likely to pay for relay access.

| Relay | URL | Pricing | Notes |
|-------|-----|---------|-------|
| **nostr.wine** | `wss://nostr.wine` | ~$7/month (or sats equivalent) | The most well-known paid relay; NIP-42 authentication, DM privacy, full-text search (NIP-50), regional mirrors (US, Finland, Japan) |
| **filter.nostr.wine** | `wss://filter.nostr.wine` | 10,000 sats/month (requires nostr.wine membership) | Spam-filtered feed limited to your extended follow graph; full-text search; aggregates from multiple relays |
| **relay.noswhere.com** | `wss://relay.noswhere.com` | Paid | Search relay |
| **Nerostr** | Various | Paid (Monero) | "Expensive relay" paid with Monero for maximum privacy |

**Why paid relays matter:**
- An estimated 95% of free public relays cannot cover their operating costs
- Paid relays provide higher reliability, lower spam, and better performance
- NIP-42 authentication on paid relays enables DM privacy guarantees
- The fee itself acts as a sybil-resistance mechanism

---

## Specialty Relays

These relays serve specific functions beyond general event storage.

### Search Relays

| Relay | Description |
|-------|-------------|
| **relay.nostr.band** | Full-text search across aggregated events; powers nostr.band analytics |
| **relay.noswhere.com** | Search relay |
| **filter.nostr.wine** | Filtered search within your extended social graph |

### Media Relays

| Relay / Service | Description |
|-----------------|-------------|
| **Blossom servers** | Media storage protocol (BUD-01 to BUD-06) for images, video, and files; several public Blossom servers operate alongside relays |
| **void.cat** | File hosting service widely used across the NOSTR ecosystem |

### Broadcast / Aggregation Relays

| Relay | Description |
|-------|-------------|
| **blastr** ([MutinyWallet/blastr](https://github.com/MutinyWallet/blastr)) | Cloudflare Workers proxy that rebroadcasts events to many relays |
| **broadcastr** ([codonaft/broadcastr](https://github.com/codonaft/broadcastr)) | Retransmits events to other relays for propagation |
| **multiplextr** ([coracle-social/multiplextr](https://github.com/coracle-social/multiplextr)) | Custom relay for bandwidth savings |
| **Bostr / Bostr2** | Bouncer relay aggregators that combine multiple relays behind a single connection |

### Group / Community Relays

| Relay | Description |
|-------|-------------|
| **NIP-29 Groups Relay** ([max21dev/groups-relay](https://github.com/max21dev/groups-relay)) | Group chat relay based on khatru |
| **groups_relay** ([verse-pbc/groups_relay](https://github.com/verse-pbc/groups_relay)) | NIP-29 group relay implementation |
| **zooid** ([coracle-social/zooid](https://github.com/coracle-social/zooid)) | Multi-tenant relay for communities |
| **swarm** ([HiveTalk/swarm](https://github.com/HiveTalk/swarm)) | Team relay with additional controls |

### Web-of-Trust Relays

| Relay | Description |
|-------|-------------|
| **WoT Relay** ([bitvora/wot-relay](https://github.com/bitvora/wot-relay)) | Only accepts events from pubkeys within a configured web-of-trust graph |
| **nostr-filter-relay** ([atrifat/nostr-filter-relay](https://github.com/atrifat/nostr-filter-relay)) | AI-powered content filtering by type and language |

### Personal / Self-Hosted Relays

| Relay | Description |
|-------|-------------|
| **HAVEN** ([bitvora/haven](https://github.com/bitvora/haven)) | Four relays + Blossom media server in one package; designed for personal hosting |
| **Citrine** ([greenart7c3/Citrine](https://github.com/greenart7c3/Citrine)) | Relay that runs on Android devices |
| **Chorus** ([mikedilger/chorus](https://github.com/mikedilger/chorus)) | Personal/community relay with fine-grained access control |
| **Nosflare** ([Spl0itable/nosflare](https://github.com/Spl0itable/nosflare)) | Serverless relay on Cloudflare Workers (free or low-cost personal relay) |
| **cfrelay** ([haorendashu/cfrelay](https://github.com/haorendashu/cfrelay)) | Personal relay on Cloudflare Workers |
| **Ephemerelay** ([soapbox-pub/ephemerelay](https://gitlab.com/soapbox-pub/ephemerelay)) | In-memory relay with no persistent storage; useful for testing |

---

## Major Relay Software

The relay software that powers the network (what operators choose to run):

| Software | Language | Key Feature | Estimated Deployment |
|----------|----------|-------------|---------------------|
| **strfry** | C++ | High performance, LMDB, negentropy sync | Widely deployed; powers many large relays |
| **khatru** | Go | Framework for custom relays | Powers many specialized relays |
| **nostream** | TypeScript | Feature-rich, PostgreSQL | One of the earliest widely deployed relays |
| **nostr-rs-relay** | Rust | Minimalistic, SQLite | Early stable implementation |
| **HAVEN** | Go | All-in-one personal relay bundle | Growing adoption for self-hosting |
| **grain** | Go | Highly configurable, MongoDB | Multipurpose relay |
| **Nosflare** | TypeScript | Serverless on Cloudflare | Popular for zero-infrastructure relays |

---

## How to Find Relays

### nostr.watch

**Website**: [nostr.watch](https://nostr.watch/)

The primary relay discovery tool. Provides a real-time directory of public relays with:
- Uptime monitoring
- Response speed measurements
- Supported NIPs per relay
- Geographic location
- Online/offline status

### NIP-66 (Relay Discovery)

NIP-66 defines a standard for relay metadata and monitoring events published to NOSTR itself. This allows clients to discover relays programmatically by querying for relay metadata events on the network, rather than relying on a centralized directory.

nostr.watch uses NIP-66 as its underlying data source.

### Other Discovery Methods

| Method | Description |
|--------|-------------|
| **Client defaults** | Most clients ship with 3-8 default relays pre-configured |
| **NIP-65 (Relay List Metadata)** | Users publish their preferred relays as events; clients use this for outbox model routing |
| **nostr.info/relays** | Relay directory at [nostr.info/relays](https://nostr.info/relays/) |
| **nostr.co.uk/relays** | Curated relay directory at [nostr.co.uk/relays](https://nostr.co.uk/relays/) |
| **Word of mouth** | Many relay operators announce their relays on NOSTR itself |

---

## Running Your Own Relay

Running a personal relay is encouraged in the NOSTR ecosystem. Benefits include:

- **Guaranteed availability** of your own events
- **Privacy** for DMs and private events (NIP-42 auth)
- **Performance** for your own read/write operations
- **Sovereignty** over your data

Popular choices for personal relays include HAVEN (all-in-one package), Citrine (runs on Android), Nosflare/cfrelay (serverless on Cloudflare), and any of the major relay implementations configured for single-user use.

See the [Awesome NOSTR Catalog](awesome-nostr.md) for the full list of relay implementations across Rust, Go, C++, TypeScript, Python, and other languages.
