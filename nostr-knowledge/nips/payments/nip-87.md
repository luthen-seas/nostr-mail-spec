# NIP-87: Ecash Mint Discoverability

## Status
Draft / Optional

## Summary
NIP-87 defines a protocol for discovering ecash mints (both Cashu and Fedimint) through Nostr events. Mint operators publish announcement events (kind 38172 for Cashu, kind 38173 for Fedimint) describing their capabilities, and users publish recommendation events (kind 38000) to endorse mints they trust. Clients aggregate recommendations from a user's social graph to surface trustworthy mints.

## Motivation
Ecash wallets (NIP-60) and nutzaps (NIP-61) require users to choose mints, but there is no standardized way to discover them. Users need to know which mints exist, what capabilities they support, and which ones their peers trust. NIP-87 solves this by creating a social-graph-based mint discovery system: you find mints through the recommendations of people you follow, similar to how NIP-65 relay discovery works through social signals.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 38172 | Cashu Mint Announcement | Addressable (replaceable) | Published by Cashu mint operators |
| 38173 | Fedimint Announcement | Addressable (replaceable) | Published by Fedimint federation operators |
| 38000 | Mint Recommendation | Addressable (replaceable) | Published by users to endorse a mint |

### Tags

**Cashu Mint Announcement (kind 38172):**
- `d` -- mint's public key (hex)
- `u` -- mint URL
- `nuts` -- space-separated list of supported NUT numbers (Cashu protocol extensions)
- `n` -- network: `mainnet`, `testnet`, `signet`, or `regtest`

**Fedimint Announcement (kind 38173):**
- `d` -- federation ID
- `u` -- invite code(s) (one or more `u` tags)
- `modules` -- space-separated list of supported federation modules
- `n` -- network: `mainnet`, `testnet`, `signet`, or `regtest`

**Mint Recommendation (kind 38000):**
- `k` -- kind of mint being recommended (`38172` for Cashu, `38173` for Fedimint)
- `d` -- unique identifier for this recommendation
- `u` -- connection URL(s) of the recommended mint
- `a` -- address pointer to the mint's announcement event with relay hint (e.g., `38172:<pubkey>:<d-tag>:<relay>`)

**Content Field (Announcements):**
- MAY contain stringified JSON with kind-0-style metadata (name, picture, about, etc.)
- Alternatively, the mint operator can rely on their pubkey's existing kind-0 profile.

### Protocol Flow

#### Mint Operator Publishes Announcement

```
Mint Operator                Nostr Relays
      |                          |
      | 1. Publish kind 38172    |
      |    (Cashu) or 38173      |
      |    (Fedimint) with URL,  |
      |    capabilities, network |
      |------------------------->|
```

#### User Recommends a Mint

```
User                         Nostr Relays
  |                              |
  | 1. Discover mint (out-of-band|
  |    or via other users)       |
  |                              |
  | 2. Publish kind 38000        |
  |    recommendation with       |
  |    a-tag pointing to mint    |
  |    announcement              |
  |----------------------------->|
```

#### Client Discovers Mints via Social Graph

```
Client                       Nostr Relays
  |                              |
  | 1. Fetch kind 38000 events   |
  |    from followed pubkeys     |
  |    #k=["38172"]              |
  |----------------------------->|
  |                              |
  | 2. Collect a-tag references  |
  |    from recommendations      |
  |                              |
  | 3. Fetch referenced mint     |
  |    announcements (38172 or   |
  |    38173) via a-tag coords   |
  |----------------------------->|
  |                              |
  | 4. Parse mint capabilities   |
  |    (NUTs, modules, network)  |
  |                              |
  | 5. Rank mints by number of   |
  |    recommendations from      |
  |    trusted follows           |
  |                              |
  | 6. Present mint list to user |
```

#### Alternative: Direct Mint Discovery

```
Client                       Nostr Relays
  |                              |
  | 1. Fetch kind 38172 events   |
  |    directly (broad query)    |
  |----------------------------->|
  |                              |
  | 2. Filter by network,        |
  |    capabilities, etc.        |
  |                              |
  | [Note: vulnerable to spam    |
  |  without social filtering]   |
```

### JSON Examples

**Cashu Mint Announcement (kind 38172):**
```json
{
  "kind": 38172,
  "pubkey": "<mint-operator-pubkey>",
  "content": "{\"name\":\"Stablenut Mint\",\"about\":\"USD and SAT ecash mint\",\"picture\":\"https://stablenut.umint.cash/logo.png\"}",
  "tags": [
    ["d", "<mint-public-key-hex>"],
    ["u", "https://stablenut.umint.cash"],
    ["nuts", "0 1 2 3 4 5 6 7 8 9 10 11 12"],
    ["n", "mainnet"]
  ],
  "created_at": 1700000000
}
```

**Fedimint Announcement (kind 38173):**
```json
{
  "kind": 38173,
  "pubkey": "<federation-operator-pubkey>",
  "content": "{\"name\":\"Bitcoin Beach Federation\",\"about\":\"Community custody federation\"}",
  "tags": [
    ["d", "<federation-id>"],
    ["u", "fed11qgqz...invite-code-1"],
    ["u", "fed11qgqz...invite-code-2"],
    ["modules", "ln-gateway mint wallet"],
    ["n", "mainnet"]
  ],
  "created_at": 1700000000
}
```

**Mint Recommendation (kind 38000):**
```json
{
  "kind": 38000,
  "pubkey": "<recommending-user-pubkey>",
  "content": "",
  "tags": [
    ["k", "38172"],
    ["d", "stablenut-recommendation"],
    ["u", "https://stablenut.umint.cash"],
    ["a", "38172:<mint-operator-pubkey>:<mint-pubkey-hex>", "wss://relay.damus.io"]
  ],
  "created_at": 1700000000
}
```

**Filter for Cashu mint recommendations from follows:**
```json
{
  "kinds": [38000],
  "authors": ["<follow-pubkey-1>", "<follow-pubkey-2>"],
  "#k": ["38172"]
}
```

**Filter for specific mint announcement:**
```json
{
  "kinds": [38172],
  "#d": ["<mint-public-key-hex>"]
}
```

## Implementation Notes

- Mint recommendations (kind 38000) are parameterized replaceable events, so a user can update or remove their endorsement by publishing a new event with the same `d` tag.
- The social-graph-based discovery approach (filtering recommendations by followed pubkeys) provides natural Sybil resistance -- spam mints cannot easily get recommendations from real users.
- Direct querying of kind 38172/38173 events is possible but should be combined with spam prevention measures (e.g., proof of work, relay allowlists).
- The `nuts` tag on Cashu announcements lists supported NUT numbers. NUT-11 (P2PK) and NUT-12 (DLEQ) are particularly important for NIP-61 nutzap compatibility.
- The `content` field for announcements is optional. If present, it should be stringified JSON following the kind-0 metadata format (name, about, picture, etc.).
- Fedimint announcements can have multiple `u` tags for different invite codes to the same federation.

## Client Behavior

- Clients SHOULD discover mints through the user's social graph (kind 38000 from follows) rather than broad queries.
- Clients SHOULD display the number of trusted recommendations per mint.
- Clients SHOULD check mint capabilities (NUTs/modules) against the requirements of the intended use case (e.g., NUT-11 + NUT-12 for nutzaps).
- Clients MAY allow users to publish mint recommendations (kind 38000).
- Clients MAY display mint metadata from the announcement's content field or the operator's kind-0 profile.
- Clients SHOULD filter by `n` tag to ensure network compatibility (mainnet vs. testnet).

## Relay Behavior

- Relays MUST treat kinds 38172, 38173, and 38000 as addressable/parameterized replaceable events.
- No special relay behavior is required beyond standard event handling.
- Relays MAY implement spam filtering on mint announcement events.

## Dependencies

- **NIP-01** -- Basic protocol, event structure, addressable events
- **NIP-65** -- Relay list metadata (for social graph relay hints)

## Source Code References

- **Minibits:** Mobile wallet with mint discovery support
- **cashu.me:** Web wallet with mint selection
- **Fedimint:** Federation software publishing kind 38173 events

## Related NIPs

- **NIP-60** -- Cashu Wallet (wallets need mints; NIP-87 helps find them)
- **NIP-61** -- Nutzaps (recipients list trusted mints in kind 10019; NIP-87 helps users choose which mints to trust)
- **NIP-57** -- Lightning Zaps (alternative payment system that does not require mint discovery)
