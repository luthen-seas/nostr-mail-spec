# NOSTR Network Statistics and Growth

> Key metrics, milestones, and growth data for the NOSTR network.
> Statistics are approximate and sourced from public dashboards and research.
> Last updated: 2026-03-31

---

## User Counts and Growth

Measuring NOSTR users is inherently different from centralized platforms because there is no single user database. Different sources measure different things (pubkeys seen, profiles created, active posters, etc.).

| Metric | Value | Source / Date |
|--------|-------|---------------|
| Total pubkeys observed | ~33.5 million | nostr.band, August 2024 |
| Pubkeys with profiles and contact lists | ~9+ million | nostr.band / nostr.info, 2025 |
| Daily active users (posting) | ~3,600-21,000+ | Varies by measurement method, October 2025 |
| Monthly participation rate | ~69% of active users | October 2025 |

**Growth trajectory:**
- Pre-2023: Small community of protocol experimenters, primarily Bitcoin developers
- January 2023: Explosive growth following Damus App Store launch; ~315,000+ users by June 2023
- 2024: Steady growth in events and infrastructure, even as daily active user counts fluctuated
- 2025: Continued organic growth with deepening Lightning integration and expanding use cases

**Note**: The gap between total pubkeys (33M+) and profiles with contact lists (9M+) reflects many one-time key generations, bots, and experimental use. The daily active user count (thousands) represents the core engaged community.

---

## Event Volume

NOSTR events include notes (kind 1), reactions, zaps, metadata updates, relay lists, and many other event kinds.

| Metric | Value | Date |
|--------|-------|------|
| Total note events (kind 1) | ~17.8 million | 2023 |
| Total note events (kind 1) | ~304 million | August 2024 |
| Year-over-year growth | ~1,607% | 2023 to 2024 |
| Total events (all kinds) | 100+ million posts | Estimated, 2025 |

The massive event growth from 2023 to 2024 reflects both genuine user activity and the proliferation of bots, bridges, and automated posting tools.

---

## Relay Counts

| Metric | Value | Date |
|--------|-------|------|
| Total relays observed | ~1,005 | 2025 |
| Public relays (open to all) | ~471 | 2025 |
| Restricted relays (paid or whitelisted) | ~191 | 2025 |
| Offline / intermittent relays | ~343 | 2025 |
| Active relays | 600+ | Estimated, 2025 |

**Geographic distribution:**
- Relays operate across 50+ countries
- No single country or autonomous system accounts for more than 25% of relays
- North America leads with ~470 relays
- United States has the highest single-country count at ~260 relays
- Significant relay presence in Europe (Germany, Finland, Netherlands) and Asia (Japan)

---

## Most-Used Clients

Based on community adoption and ecosystem prominence (no precise market share data is publicly available):

| Client | Platform | Notes |
|--------|----------|-------|
| **Damus** | iOS | Drove early mass adoption; flagship iOS experience |
| **Amethyst** | Android | Most feature-complete Android client; extensive NIP support |
| **Primal** | Web, iOS, Android | Lightning-fast with built-in wallet and caching CDN |
| **Coracle** | Web | Pioneer of outbox model; relay-aware design |
| **Snort** | Web | Fast, polished React web client |
| **noStrudel** | Web | Power-user client with bleeding-edge NIP support |
| **Gossip** | Desktop | Rust desktop client; outbox model pioneer |
| **Notedeck** | Desktop | Next-gen multi-column desktop client by jb55 |
| **0xchat** | iOS, Android | Telegram-like messaging client |
| **Nos** | iOS | UX-focused with safety features |

---

## Zap Volume and Lightning Integration

Zaps (Lightning micropayments sent through NOSTR) are a defining feature of the ecosystem.

| Metric | Value | Date |
|--------|-------|------|
| Total zaps | ~1.65 billion sats | First half of 2024 |

**Lightning integration milestones:**
- **NIP-57 (Zaps)**: Defined the standard for Lightning payments on NOSTR; widely adopted by 2023
- **NIP-47 (Nostr Wallet Connect / NWC)**: Enabled apps to request payments on behalf of users; driven primarily by Alby
- **In-app wallet**: Primal integrated a built-in Lightning wallet, lowering the barrier to zapping
- **2025**: U.S. users can buy Bitcoin directly inside NOSTR through DMs, deepening Bitcoin-NOSTR integration

**Zap use cases:**
- Tipping content creators for individual notes
- Supporting developers directly
- Livestream monetization on zap.stream
- Crowdfunding via platforms like Heya.fund
- Value-for-value podcasting and media

---

## Key Milestones

| Date | Event |
|------|-------|
| **November 2020** | fiatjaf publishes the first NOSTR client and protocol description |
| **December 2022** | Jack Dorsey donates 14 BTC (~$245,000) to fiatjaf, split with jb55 |
| **January 31, 2023** | Damus launches on the Apple App Store; Jack Dorsey calls it "a milestone for open protocols" |
| **February 2, 2023** | Damus removed from China App Store within days of global launch |
| **June 2023** | NOSTR surpasses 315,000 users with profiles |
| **July 2023** | OpenSats announces first wave of Nostr grants (Damus, Coracle, Iris, and others) |
| **2023** | Major web clients launch: Snort, Coracle, Iris, noStrudel |
| **2024** | Event volume explodes from 17.8M to 304M+ notes (1,607% growth) |
| **August 2024** | Mutiny Wallet announces shutdown |
| **November 2024** | Notedeck Alpha launches (Rust-based desktop client by jb55) |
| **December 2024** | Mutiny Wallet shuts down; Damus team signals shift toward Notedeck |
| **2025** | Jack Dorsey makes $10 million donation to NOSTR development |
| **2025** | OpenSats surpasses $10 million in total Nostr Fund grants |
| **2025** | NIP-55 signer proliferation; NDK achieves 162x cache speedup |
| **2025** | Zapstore expands as a decentralized app distribution channel |

---

## Where to Find Live Statistics

These resources provide real-time and historical NOSTR network data:

| Resource | URL | What It Tracks |
|----------|-----|----------------|
| **nostr.band Stats** | [stats.nostr.band](https://stats.nostr.band/) | Daily/weekly active users, retention, new users, trending content |
| **nostr.watch** | [nostr.watch](https://nostr.watch/) | Real-time relay directory: uptime, speed, supported NIPs, geographic distribution |
| **nostr.info** | [nostr.info](https://nostr.info/) | Network stats, charts, live monitors, resources |
| **Primal Analytics** | [primal.net](https://primal.net/) | Trending content, network activity (via Primal's caching layer) |
| **nostr-stats** | [github.com/andotherstuff/nostr-stats](https://github.com/andotherstuff/nostr-stats) | Dashboard displaying stats from Pensieve |
| **Manifold Markets** | [manifold.markets](https://manifold.markets/) | Prediction markets on NOSTR growth targets |

**Academic research:**
- "An Empirical Analysis of the Nostr Social Network" (2024) -- Published analysis of decentralization, availability, and replication overhead on NOSTR ([arxiv.org/html/2402.05709v2](https://arxiv.org/html/2402.05709v2))
