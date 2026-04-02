# NIP-21: nostr: URI Scheme

## Status
Active (draft, optional)

## Summary
NIP-21 standardizes the `nostr:` URI scheme for maximum interoperability across Nostr clients and the broader web. The identifiers following `nostr:` are the same NIP-19 bech32-encoded entities (except `nsec`). This provides a universal way to link to Nostr profiles, events, and other entities both within Nostr content and from external HTML pages.

## Motivation
A standardized URI scheme enables Nostr references to be clickable links in any context: within note content, in web pages, in QR codes, and across applications. By building on NIP-19 encodings, the `nostr:` scheme carries relay hints and metadata that help clients resolve references. The URI scheme also enables HTML pages to declare relationships with Nostr entities via `<link>` tags.

## Specification

### URI Format

```
nostr:<NIP-19 bech32 string>
```

The NIP-19 identifiers that may follow `nostr:` are:
- `npub` -- public key reference
- `nprofile` -- profile reference with relay hints
- `note` -- event ID reference
- `nevent` -- event reference with relay hints and metadata
- `naddr` -- addressable event coordinate

**`nsec` MUST NOT be used in `nostr:` URIs.**

### Tags

NIP-21 does not define new event tags. The URI scheme is used within:
- Event `.content` fields (per NIP-27)
- HTML `<link>` tags (see below)
- Any context where a URI is expected

### Protocol Flow

**Using nostr: URIs in event content:**
1. Author writes a note mentioning another user or event
2. Client inserts `nostr:nprofile1...` or `nostr:nevent1...` into the `.content` string
3. Optionally adds corresponding `p`, `e`, or `q` tags per NIP-10/NIP-18/NIP-27
4. Reader client parses `.content`, finds `nostr:` URIs
5. Client decodes the NIP-19 string, fetches the referenced entity, and renders it appropriately (link, preview, etc.)

**Linking HTML pages to Nostr entities:**
1. Web server serves an HTML page with a `<link>` tag in `<head>`
2. Crawlers or clients discover the Nostr association

### HTML Link Tags

#### Associating a webpage with a Nostr event (`rel="alternate"`):

When the same content exists as both a web page and a Nostr event (e.g., a blog post served as HTML and as a `kind:30023` event):

```html
<head>
  <link rel="alternate" href="nostr:naddr1qqyrzwrxvc6ngvfkqyghwumn8ghj7enfv96x5ctx9e3k7mgzyqalp33lewf5vdq847t6te0wvnags0gs0mu72kz8938tn24wlfze6qcyqqq823cph95ag" />
</head>
```

#### Declaring authorship of a webpage (`rel="me"` or `rel="author"`):

```html
<head>
  <link rel="me" href="nostr:nprofile1qyxhwumn8ghj7mn0wvhxcmmvqyd8wumn8ghj7un9d3shjtnhv4ehgetjde38gcewvdhk6qpq80cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwswpnfsn" />
</head>
```

### JSON Examples

**Event content with nostr: URI mentions:**
```json
{
  "kind": 1,
  "content": "Check out nostr:npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9's latest post!",
  "tags": [
    ["p", "84dee6e676e5bb67b4ad4e042cf70cbd8681155db535942fcc6a0533858a7240"]
  ]
}
```

**Event content with nevent reference:**
```json
{
  "kind": 1,
  "content": "This is what I was talking about nostr:nevent1qqstna2yrezu5wghjvswqqculvvwxsrcvu7uc0f78gan4xqhvz49d9spr3mhxue69uhkummnw3ez6un9d3shjtn4de6x2argwghx6egpr4mhxue69uhkummnw3ez6ur4vgh8wetvd3hhyer9wghxuet5nxnepm",
  "tags": [
    ["q", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://relay.example.com", "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93"]
  ]
}
```

**Event content with nprofile reference (includes relay hint):**
```json
{
  "kind": 1,
  "content": "hello nostr:nprofile1qqszclxx9f5haga8sfjjrulaxncvkfekj097t6f3pu65f86rvg49ehqj6f9dh",
  "tags": [
    ["p", "2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc"]
  ]
}
```

**Examples of valid nostr: URIs:**
```
nostr:npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9
nostr:nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p
nostr:nevent1qqstna2yrezu5wghjvswqqculvvwxsrcvu7uc0f78gan4xqhvz49d9spr3mhxue69uhkummnw3ez6un9d3shjtn4de6x2argwghx6egpr4mhxue69uhkummnw3ez6ur4vgh8wetvd3hhyer9wghxuet5nxnepm
nostr:naddr1qqyrzwrxvc6ngvfkqyghwumn8ghj7enfv96x5ctx9e3k7mgzyqalp33lewf5vdq847t6te0wvnags0gs0mu72kz8938tn24wlfze6qcyqqq823cph95ag
```

## Implementation Notes

1. **URI parsing:** When scanning `.content` for `nostr:` URIs, use a regex or parser that captures everything after `nostr:` up to a whitespace or non-bech32 character. Bech32 characters are: `qpzry9x8gf2tvdw0s3jn54khce6mua7l` plus `1` as separator.

2. **Prefer nprofile/nevent over npub/note:** When generating URIs for sharing, prefer the TLV-encoded forms (`nprofile`, `nevent`, `naddr`) because they include relay hints that help the recipient find the content.

3. **nsec security:** Never generate `nostr:nsec1...` URIs. This would expose private keys.

4. **Fallback behavior:** If a client cannot resolve a `nostr:` URI, it should display the raw bech32 string (possibly truncated) as a non-functional reference rather than hiding it.

5. **HTML integration:** The `<link rel="alternate">` pattern enables web-to-Nostr discovery. Search engines and Nostr crawlers can use this to bridge web content with Nostr events.

## Client Behavior

- Clients MUST recognize and parse `nostr:` URIs in event content
- Clients MUST decode the NIP-19 entity from the URI
- Clients SHOULD render `nostr:` URIs as clickable links or rich previews
- Clients SHOULD use relay hints from decoded entities to fetch referenced content
- Clients SHOULD NOT generate `nostr:nsec1...` URIs under any circumstances
- Clients MAY register as a handler for the `nostr:` URI scheme on the operating system
- Clients MAY parse HTML `<link>` tags to discover Nostr associations

## Relay Behavior

- Relays have no special behavior for NIP-21 (it is a client-side concern)
- Relays store and return event content as-is, including any `nostr:` URIs within

## Dependencies
- NIP-19: bech32-encoded entities (defines the identifiers used after `nostr:`)

## Source Code References

- **nostr-tools (JS):** `nip21.ts` -- URI parsing and generation
- **rust-nostr:** `nostr/src/nips/nip21.rs`
- **go-nostr:** NIP-21 URI utilities

## Related NIPs
- NIP-19: bech32-encoded entities (the encoding used in URIs)
- NIP-27: Text Note References (how clients handle `nostr:` URIs in content)
- NIP-10: Text Notes threading (tags that accompany inline references)
- NIP-18: Reposts (quote tags for inline event references)
