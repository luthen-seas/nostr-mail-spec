# NIP-85: Trusted Assertions

## Status
Active (draft, optional)

## Summary
NIP-85 allows users to delegate computationally expensive Web of Trust (WoT) calculations to trusted service providers. These providers publish signed "Trusted Assertion" events containing pre-computed metrics (follower counts, reputation scores, zap totals, etc.) that clients can consume directly, avoiding the need to process massive volumes of raw events locally.

## Motivation
Many useful Nostr features require processing large volumes of events or significant computing power -- for example, calculating a user's WoT score, counting followers, or rating content. Performing these calculations directly on clients is impractical or impossible, especially on mobile devices. NIP-85 solves this by establishing a standard for trusted third-party services to publish pre-computed assertion events. Users explicitly declare which providers they trust, preserving the decentralized nature of Nostr while enabling rich computed metadata.

## Specification

### Event Kinds

| Kind  | Description |
|-------|-------------|
| 30382 | Trusted Assertion -- Users (pubkeys) as subject |
| 30383 | Trusted Assertion -- Events as subject |
| 30384 | Trusted Assertion -- Addressable Events as subject |
| 30385 | Trusted Assertion -- NIP-73 External Identifiers as subject |
| 10040 | Trusted Service Provider declaration (replaceable) |

All assertion kinds (30382-30385) are **addressable (replaceable) events** with the `d` tag pointing to the subject.

### Tags

**Assertion Event Tags:**

| Tag | Format | Description |
|-----|--------|-------------|
| `d` | `["d", "<subject-identifier>"]` | The subject of the assertion (pubkey, event_id, event_address, or NIP-73 identifier) |
| Various result tags | `["<tag-name>", "<value>"]` | Pre-computed metric results (see tables below) |
| `p` | `["p", "<pubkey>", "<relay-hint>"]` | Optional relay hint for user subjects |
| `e` | `["e", "<event-id>", "<relay-hint>"]` | Optional relay hint for event subjects |
| `a` | `["a", "<event-address>", "<relay-hint>"]` | Optional relay hint for addressable event subjects |

**Provider Declaration Tags (kind 10040):**

| Tag | Format | Description |
|-----|--------|-------------|
| `<kind:tag>` | `["<kind:tag>", "<service-key>", "<relay-hint>"]` | Declares a trusted provider for a specific assertion type |

### Subject-to-Kind Mapping

| Subject Type | Event Kind | `d` Tag Value |
|-------------|------------|---------------|
| User (pubkey) | 30382 | `<pubkey>` |
| Event | 30383 | `<event_id>` |
| Addressable Event | 30384 | `<event_address>` |
| NIP-73 Identifier | 30385 | `<i-tag>` |

### Kind 30382: User Assertion Result Tags

| Result Type | Tag Name | Value Format |
|------------|----------|-------------|
| Follower Count | `followers` | int |
| User Rank | `rank` | int, normalized 0-100 |
| First Post Time | `first_created_at` | unix timestamp |
| Post Count | `post_cnt` | int |
| Reply Count | `reply_cnt` | int |
| Reactions Count | `reactions_cnt` | int |
| Zap Amount Received | `zap_amt_recd` | int, sats |
| Zap Amount Sent | `zap_amt_sent` | int, sats |
| Zap Number Received | `zap_cnt_recd` | int |
| Zap Number Sent | `zap_cnt_sent` | int |
| Avg Zap Amount/Day Received | `zap_avg_amt_day_recd` | int, sats |
| Avg Zap Amount/Day Sent | `zap_avg_amt_day_sent` | int, sats |
| Reports Received | `reports_cnt_recd` | int |
| Reports Sent | `reports_cnt_sent` | int |
| Common Topics | `t` | string |
| Generally Active Start | `active_hours_start` | int, 0-24, UTC |
| Generally Active End | `active_hours_end` | int, 0-24, UTC |

### Kind 30383: Event Assertion Result Tags

| Result Type | Tag Name | Value Format |
|------------|----------|-------------|
| Event Rank | `rank` | int, normalized 0-100 |
| Event Comment Count | `comment_cnt` | int |
| Event Quote Count | `quote_cnt` | int |
| Event Repost Count | `repost_cnt` | int |
| Event Reaction Count | `reaction_cnt` | int |
| Event Zap Count | `zap_cnt` | int |
| Event Zap Amount | `zap_amount` | int, sats |

### Kind 30384: Addressable Event Assertion Result Tags

| Result Type | Tag Name | Value Format |
|------------|----------|-------------|
| Address Rank | `rank` | int, normalized 0-100 |
| Address Comment Count | `comment_cnt` | int |
| Address Quote Count | `quote_cnt` | int |
| Address Repost Count | `repost_cnt` | int |
| Address Reaction Count | `reaction_cnt` | int |
| Address Zap Count | `zap_cnt` | int |
| Address Zap Amount | `zap_amount` | int, sats |

### Kind 30385: External Identifier Assertion Result Tags

| Result Type | Tag Name | Value Format |
|------------|----------|-------------|
| Rank | `rank` | int, normalized 0-100 |
| Comment Count | `comment_cnt` | int |
| Reaction Count | `reaction_cnt` | int |

NIP-73 `k` tags should also be included in kind 30385 events.

### Protocol Flow

**Setting Up Trusted Providers:**

1. User discovers available service providers (via follow lists, recommendations, or provider discoverability).
2. User publishes a kind `10040` event declaring which providers they trust for which assertion types.
3. Providers may be declared publicly in tags or privately by encrypting the tag list with NIP-44 into the `.content` field.

**Consuming Assertions:**

1. Client reads the user's kind `10040` event to discover trusted providers.
2. For each provider and assertion type, client queries the specified relay for the relevant assertion kind (30382-30385).
3. Client displays the pre-computed values from the assertion events.

**Provider Publishing Flow:**

1. Service provider monitors Nostr events and computes metrics.
2. Provider publishes assertion events signed with the service key.
3. Provider updates assertions as new information arrives (but only if values actually change).

### JSON Examples

**Assertion event: User ranked with WoT score of 89 (kind 30382):**

```json
{
  "kind": 30382,
  "pubkey": "<service-pubkey>",
  "tags": [
    ["d", "e88a691e98d9987c964521dff60025f60700378a4879180dcbbb4a5027850411"],
    ["rank", "89"]
  ],
  "content": "",
  "created_at": 1682327852,
  "id": "...",
  "sig": "..."
}
```

**Provider declaration event (kind 10040) with public and private providers:**

```json
{
  "kind": 10040,
  "tags": [
    ["30382:rank", "4fd5e210530e4f6b2cb083795834bfe5108324f1ed9f00ab73b9e8fcfe5f12fe", "wss://nip85.nostr.band"],
    ["30382:rank", "3d842afecd5e293f28b6627933704a3fb8ce153aa91d790ab11f6a752d44a42d", "wss://nostr.wine"],
    ["30382:zap_amt_sent", "4fd5e210530e4f6b2cb083795834bfe5108324f1ed9f00ab73b9e8fcfe5f12fe", "wss://nip85.nostr.band"]
  ],
  "content": "<nip44-encrypted-json-of-private-provider-tags>",
  "created_at": 1682327852,
  "id": "...",
  "sig": "..."
}
```

**Encrypted content (before encryption) for private providers:**

```json
[
  ["30383:rank", "4fd5e210530e4f6b2cb083795834bfe5108324f1ed9f00ab73b9e8fcfe5f12fe", "wss://nip85.nostr.band"],
  ["30384:rank", "4fd5e210530e4f6b2cb083795834bfe5108324f1ed9f00ab73b9e8fcfe5f12fe", "wss://nip85.nostr.band"]
]
```

**Service provider metadata (kind 0 for a service key):**

```json
{
  "kind": 0,
  "pubkey": "<service-pubkey>",
  "tags": [],
  "content": "{\"name\": \"Vitor's Brainstormer\", \"about\": \"A Web of Trust algorithm from Vitor's point of view that considers Follows and Mutes, but no reports, and gives extra score points for anyone around Boston\", \"picture\": \"https://brainstorm.com/logo.png\", \"website\": \"https://brainstorm.com\"}"
}
```

## Implementation Notes

- **Service keys per algorithm:** Providers MUST use different service keys for distinct algorithms, including a separate key per user when the algorithm is personalized to that user's perspective or settings.
- **Update frequency:** Providers SHOULD update assertions as fast as new information arrives, but only if the content actually changes (to avoid clients re-downloading identical data).
- **Paid relays:** Providers MAY limit access to results by publishing to paid relays.
- **Relay hints:** `p`, `e`, and `a` tags with the same value as the `d` tag MAY be used to add relay hints.
- **Multiple providers for same metric:** Users can declare multiple providers for the same assertion type. Different providers may compute the same metric differently (e.g., one follower count excludes muted users, another includes them).
- **Provider discoverability** relies on the kind `0` metadata of service keys and the social graph (following other users' kind `10040` events).

## Client Behavior

- Clients SHOULD read the user's kind `10040` event to discover trusted providers.
- Clients SHOULD fetch assertion events from the relays specified in the provider declarations.
- Clients SHOULD display assertion values alongside profile and content data.
- Clients MAY offer a UI for users to discover and select service providers.
- Clients wishing to offer a list of providers SHOULD:
  1. Download kind `10040` events of the user's follow list.
  2. Connect to each listed relay and download the kind `0` of the respective service keys.
  3. Parse the kind `0` and collect the `website` property.
  4. Load the OpenGraph tags of that website and display them as clickable items.
- Clients SHOULD handle both public tags and NIP-44 encrypted content in kind `10040` events.

## Relay Behavior

- Relays MUST treat kinds 30382-30385 as addressable (replaceable) events.
- Relays MUST treat kind 10040 as a replaceable event.
- Relays MAY implement access controls (paid relays) for assertion events.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (addressable/replaceable events)
- [NIP-44](../nip-44.md) -- Versioned Encryption (for encrypting private provider lists)
- [NIP-73](../nip-73.md) -- External Content IDs (for kind 30385 subjects)

## Source Code References

- **Early implementations:** nostr.band (WoT scoring), various WoT algorithm providers
- This NIP is relatively new and implementations are still emerging.

## Related NIPs

- [NIP-73](../nip-73.md) -- External Content IDs (subjects for kind 30385)
- [NIP-44](../nip-44.md) -- Versioned Encryption (private provider declarations)
- [NIP-32](../nip-32.md) -- Labeling (related concept: labeling/categorizing content)
- [NIP-56](../nip-56.md) -- Reporting (related: `reports_cnt_recd`/`reports_cnt_sent` metrics)
- [NIP-57](../nip-57.md) -- Lightning Zaps (related: zap metrics in assertions)
