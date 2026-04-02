# RSS/Atom to Nostr Bridges

Tools that publish RSS and Atom feed content as Nostr events.

---

## Overview

RSS-to-Nostr bridges monitor RSS/Atom feeds and publish new items as Nostr events (typically kind 1 text notes or kind 30023 long-form articles). This is a one-way bridge: content flows from RSS into Nostr, not the reverse.

Use cases:
- Republish a blog's RSS feed to Nostr automatically.
- Bring news sources, podcasts, or any RSS-publishing site into the Nostr network.
- Create a Nostr presence for content that originates outside Nostr.

---

## Tools

### nostrss

A daemon that monitors RSS feeds and publishes new items as Nostr events.

- **What it does**: Polls configured RSS/Atom feeds at regular intervals, creates kind 1 events from new items, and publishes them to configured relays.
- **Configuration**: YAML or TOML config file specifying feeds, polling intervals, relay lists, and the signing key.
- **Typical setup**:
  ```yaml
  feeds:
    - url: https://example.com/feed.xml
      interval: 300  # seconds
      relays:
        - wss://relay.damus.io
        - wss://nos.lol
  private_key: <hex-or-nsec>
  ```

### rsslay

A specialized Nostr relay that serves RSS feeds as if they were Nostr events. Instead of bridging into existing relays, rsslay itself acts as a relay that clients can connect to.

- **How it works**: Clients connect to rsslay and send REQ filters. rsslay fetches the corresponding RSS feed, converts items to Nostr events on the fly, and returns them.
- **Advantage**: No need to publish events to public relays. The RSS content exists only on the rsslay instance.
- **Use case**: Add an rsslay URL to your client's relay list to see RSS content inline with your Nostr feed.

### atomstr

Bridges Atom feeds to Nostr, with a focus on the Atom format specifically.

- **What it does**: Similar to nostrss but optimized for Atom feeds. Handles Atom-specific features like entry summaries, categories (mapped to Nostr tags), and author metadata.

---

## Event Format

Most RSS bridges produce events like this:

```json
{
  "kind": 1,
  "content": "Article Title\n\nArticle summary or description...\n\nhttps://example.com/article-link",
  "tags": [
    ["r", "https://example.com/article-link"],
    ["t", "category1"],
    ["t", "category2"]
  ],
  "created_at": 1700000000
}
```

Some bridges support kind 30023 (long-form content) for full article bridging:

```json
{
  "kind": 30023,
  "content": "Full article markdown content...",
  "tags": [
    ["d", "article-slug"],
    ["title", "Article Title"],
    ["published_at", "1700000000"],
    ["r", "https://example.com/article-link"],
    ["t", "category"]
  ]
}
```

---

## Considerations

- **One-way only**: These bridges push content from RSS to Nostr. Nostr replies do not flow back to the original source.
- **Deduplication**: Good bridges track which items have already been published to avoid duplicates on relay restart.
- **Key management**: The bridge signs events with its own key. The resulting Nostr profile represents the feed, not the original author.
- **Rate limiting**: Be mindful of relay rate limits when bridging high-volume feeds.
- **Attribution**: Include the original URL in an `r` tag so readers can find the source.

---

## See Also

- [Mostr (Fediverse Bridge)](fediverse.md) -- bidirectional Nostr-Fediverse bridge
- [Matrix Bridge](matrix.md) -- bridging Nostr to Matrix
- [NIP-23 (Long-form Content)](../../nips/social/nip-23.md) -- the event kind for articles
