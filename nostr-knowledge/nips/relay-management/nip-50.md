# NIP-50: Search Capability

## Status
Active (draft, optional)

## Summary
NIP-50 adds a `search` field to NIP-01 REQ filters, enabling full-text search across relay event stores. Relays interpret a human-readable query string and return matching events ranked by relevance rather than by `created_at`. The spec also defines optional extensions for filtering by domain, language, sentiment, and spam/NSFW content.

## Motivation
Structured queries by tags, kinds, and IDs (NIP-01) are powerful but insufficient for discovery. Users need to find content by keywords -- searching for topics, people, or specific text. Without a standard search mechanism, each relay and client would implement proprietary search APIs, fragmenting the ecosystem. NIP-50 provides a simple, extensible search framework that relays can implement using whatever search technology they prefer (full-text indexes, vector search, etc.) while clients use a single standard interface.

## Specification

### Event Kinds
NIP-50 does not define new event kinds. It extends the NIP-01 filter object with a new field.

### Tags
NIP-50 does not define new tags. Search is performed against event content and optionally other fields.

### Protocol Flow

1. Client adds a `search` field to one or more filters in a REQ message.
2. Relay receives the REQ and interprets the search string.
3. Relay matches primarily against the `content` field of events, and MAY match against other fields when appropriate for specific kinds.
4. Relay returns matching events sorted by **relevance/quality** (descending), NOT by `created_at`.
5. The `limit` filter is applied AFTER sorting by relevance score.
6. Client receives events via the normal EVENT message flow, followed by EOSE.

### Filter Extension

```json
{
  "kinds": [1],
  "search": "best nostr apps",
  "limit": 20
}
```

The `search` field is a string containing a human-readable query. Relays SHOULD interpret it to the best of their ability.

### Multiple Search Filters

Clients may specify multiple filters with different search terms in a single REQ:

```json
["REQ", "search-sub", {"search": "orange"}, {"kinds": [1, 2], "search": "purple"}]
```

Each filter is independent; results from all filters are combined (OR logic).

### Search Extensions

Relays MAY support key:value pairs within the search string:

| Extension | Description | Example |
|-----------|-------------|---------|
| `include:spam` | Disable spam filtering (if enabled by default) | `"search": "bitcoin include:spam"` |
| `domain:<domain>` | Only events from users with a matching NIP-05 domain | `"search": "nostr domain:iris.to"` |
| `language:<code>` | Only events in a specific language (ISO 639-1) | `"search": "hello language:en"` |
| `sentiment:<value>` | Only events with a specific sentiment | `"search": "bitcoin sentiment:positive"` |
| `nsfw:<bool>` | Include or exclude NSFW content (default: true) | `"search": "art nsfw:false"` |

Relays SHOULD ignore extensions they do not support.

### JSON Examples

#### Basic Search Request

```json
["REQ", "search1", {"search": "best nostr apps", "limit": 20}]
```

#### Search with Kind Filter

```json
["REQ", "search2", {"kinds": [1], "search": "lightning wallet", "limit": 10}]
```

#### Search with Language Extension

```json
["REQ", "search3", {"kinds": [1], "search": "nostr language:en", "limit": 50}]
```

#### Search with Domain Extension

```json
["REQ", "search4", {"search": "photography domain:nostr.com", "limit": 20}]
```

#### Search with Author Filter

```json
["REQ", "search5", {
  "kinds": [1, 30023],
  "authors": ["abcdef1234..."],
  "search": "relay management"
}]
```

#### Search with Spam Included

```json
["REQ", "search6", {"search": "free bitcoin include:spam", "limit": 100}]
```

## Implementation Notes

- The `search` field can be combined with any other NIP-01 filter fields (`kinds`, `authors`, `ids`, `#e`, `#p`, `since`, `until`, `limit`). The relay applies all filter conditions AND the search.
- Result ordering is by relevance, NOT by `created_at`. This is a key difference from normal REQ queries. Clients that expect chronological ordering should not use the search field.
- The search algorithm is entirely implementation-defined. Relays may use simple substring matching, full-text search with stemming, or even AI-powered semantic search. The spec intentionally does not prescribe an algorithm.
- Extensions use a colon-separated `key:value` syntax within the search string itself (not as separate filter fields). This keeps the protocol simple and extensible.
- Relays SHOULD exclude spam from results by default. The `include:spam` extension opts out of this filtering.
- Different relays will have different search indexes, coverage, and quality. Clients SHOULD query multiple relays and merge/deduplicate results.

## Client Behavior

- Clients SHOULD use NIP-11 `supported_nips` to check if a relay supports search before sending search queries.
- Clients MAY send search filters to any relay, but MUST be prepared to handle/filter extraneous responses from relays that do not support NIP-50.
- Clients SHOULD query several relays supporting NIP-50 to compensate for different search implementations.
- Clients MAY verify that returned events actually match the query in a way that suits their use case.
- Clients MAY stop querying relays that consistently return low-precision results.
- Clients SHOULD understand that results are ranked by relevance, not chronologically.

## Relay Behavior

- Relays SHOULD interpret the search string to the best of their ability.
- Relays SHOULD perform matching against the `content` field, and MAY match against other fields when it makes sense for specific kinds.
- Relays SHOULD return results sorted by relevance/quality (descending), not by `created_at`.
- Relays SHOULD apply the `limit` filter after sorting by relevance.
- Relays SHOULD exclude spam from results by default.
- Relays SHOULD ignore search extensions they do not support (do not error on unknown extensions).
- Relays MAY implement any search algorithm they choose.

## Dependencies

- NIP-01 (basic protocol -- REQ/filter syntax)
- NIP-05 (DNS-Based Verification -- referenced by `domain:` extension)
- NIP-11 (Relay Information Document -- capability discovery)

## Source Code References

### strfry
- strfry does not include built-in full-text search but can be extended with plugins.
- The `strfry-policies/` plugin system can intercept and route search queries.

### khatru
- Search capability depends on the storage backend. Khatru's `QueryEvents` handler can be implemented with search support.
- The `eventstore/` packages may include search-capable backends (e.g., PostgreSQL with full-text search).

### nostr-tools (JS)
- Filter objects in `filter.ts` support the `search` field.
- No special client-side processing; search is a filter field like any other.

### rust-nostr
- `Filter` struct in the nostr crate includes a `search` field.
- Search queries are sent as normal REQ messages.

### go-nostr
- `Filter` struct in `filter.go` includes a `Search` field.
- Serialized as part of the normal filter JSON.

## Related NIPs

- NIP-01 (Basic Protocol) -- filter syntax that NIP-50 extends
- NIP-05 (DNS-Based Verification) -- `domain:` extension references NIP-05
- NIP-11 (Relay Information Document) -- capability discovery
- NIP-45 (Counting Results) -- another query extension to the filter system
