# NIP-75: Zap Goals

## Status
Draft / Optional

## Summary
NIP-75 defines a fundraising goal event (kind 9041) that allows users to set a target amount and collect Lightning zaps toward it. Clients tally zap receipts sent to the goal event and display progress. Goals can have deadlines, images, descriptions, and multiple beneficiaries via zap splits.

## Motivation
Nostr users and projects need a way to crowdfund -- for travel, development, events, or creative work. Before NIP-75, there was no standard way to set a target amount and track progress. Zap Goals create a dedicated event that aggregates zaps into a visible fundraising campaign, enabling use cases like tip jars with targets, event funding, and community sponsorship.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 9041 | Zap Goal | Regular | A fundraising goal event |

### Tags

**Required:**
- `amount` -- target amount in **millisatoshis** (string)
- `relays` -- list of relays where zaps to this goal should be sent and tallied from

**Optional:**
- `closed_at` -- unix timestamp (seconds) after which zap receipts SHOULD NOT count toward progress
- `image` -- URL of an image for the goal
- `summary` -- brief text description of the goal
- `r` -- URL link associated with the goal
- `a` -- event coordinate linking to an addressable event
- `zap` -- NIP-57 zap split tags for multiple beneficiaries
- `goal` -- (on other events) links an addressable event to a goal by event ID + optional relay hint

### Protocol Flow

```
Creator                     Nostr Relays              Supporters
   |                            |                         |
   | 1. Publish kind 9041       |                         |
   |    with amount, relays     |                         |
   |--------------------------->|                         |
   |                            |                         |
   |                            |  2. Supporters discover |
   |                            |     goal event          |
   |                            |<------------------------|
   |                            |                         |
   |                            |  3. Supporters zap the  |
   |                            |     goal event per      |
   |                            |     NIP-57 flow         |
   |                            |                         |
   |                            |  4. Zap receipts (9735) |
   |                            |     published to relays |
   |                            |     from goal's relays  |
   |                            |     tag                 |
   |                            |                         |
   |                            |  5. Clients fetch 9735s |
   |                            |     with #e=<goal-id>   |
   |                            |     and tally amounts   |
   |                            |                         |
   | 6. Creator (and everyone)  |                         |
   |    sees progress bar       |                         |
   |<---------------------------|                         |
```

**Linking a goal to another event:**

```
Creator                     Nostr Relays
   |                            |
   | 1. Publish kind 9041 goal  |
   |--------------------------->|
   |                            |
   | 2. Publish addressable     |
   |    event (e.g., long-form  |
   |    post, badge, livestream)|
   |    with ["goal", "<id>"]   |
   |--------------------------->|
   |                            |
   | 3. Clients see the linked  |
   |    goal and show progress  |
   |    on the parent event     |
```

### JSON Examples

**Basic Zap Goal:**
```json
{
  "kind": 9041,
  "content": "Nostrasia travel expenses",
  "tags": [
    ["relays", "wss://alicerelay.example.com", "wss://bobrelay.example.com"],
    ["amount", "210000"]
  ],
  "pubkey": "<creator-pubkey>",
  "created_at": 1700000000
}
```

**Zap Goal with deadline, image, and summary:**
```json
{
  "kind": 9041,
  "content": "Help fund our open-source relay implementation",
  "tags": [
    ["relays", "wss://relay.damus.io", "wss://nos.lol"],
    ["amount", "2100000000"],
    ["closed_at", "1703980800"],
    ["image", "https://example.com/relay-project.png"],
    ["summary", "Building a high-performance Nostr relay in Rust"]
  ],
  "pubkey": "<creator-pubkey>",
  "created_at": 1700000000
}
```

**Zap Goal with multiple beneficiaries (zap splits):**
```json
{
  "kind": 9041,
  "content": "Conference speaker fund",
  "tags": [
    ["relays", "wss://relay.damus.io"],
    ["amount", "5000000"],
    ["zap", "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2", "wss://nostr.oxtr.dev", "1"],
    ["zap", "fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52", "wss://nostr.wine/", "1"],
    ["zap", "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c", "wss://nos.lol/", "2"]
  ],
  "pubkey": "<creator-pubkey>",
  "created_at": 1700000000
}
```

**Addressable event linking to a goal:**
```json
{
  "kind": 30023,
  "content": "# My Long-Form Article\n\n...",
  "tags": [
    ["d", "my-article"],
    ["goal", "<goal-event-id>", "wss://relay.damus.io"]
  ],
  "pubkey": "<author-pubkey>"
}
```

## Implementation Notes

- The `amount` tag is in **millisatoshis**, consistent with NIP-57 zap amounts.
- Progress is calculated by summing the `amount` values from validated zap receipts (kind 9735) that reference the goal event via `#e` tag.
- The `closed_at` timestamp is a soft deadline -- clients SHOULD ignore zap receipts with `created_at` after `closed_at`, but there is no protocol enforcement.
- Goals are regular events (not replaceable), so a creator cannot modify the target amount after publication. They would need to create a new goal.
- When using zap splits, the zap flow follows the NIP-57 `zap` tag mechanism -- each beneficiary gets their portion routed through their own LNURL endpoint.
- The `r` and `a` tags are for linking context (a project URL, a related addressable event) but do not affect the zap tally.

## Client Behavior

- Clients MAY display funding goals on user profiles.
- Clients MUST include the relays from the goal's `relays` tag in the zap request's `relays` tag when zapping a goal.
- Clients SHOULD validate zap receipts per NIP-57 Appendix F before counting them toward the goal.
- Clients SHOULD ignore zap receipts after the `closed_at` timestamp.
- When zapping an addressable event that has a `goal` tag, clients SHOULD include the goal event ID in the `e` tag of the zap request.
- Clients SHOULD display a progress indicator (e.g., progress bar) showing current vs. target amount.
- Clients MAY display the zap split configuration if multiple beneficiaries are listed.

## Relay Behavior

- No special relay behavior is required.
- Relays store kind 9041 events as standard regular events.

## Dependencies

- **NIP-01** -- Basic protocol, event structure
- **NIP-57** -- Lightning Zaps (the payment mechanism; zap receipts are what gets tallied)

## Source Code References

- **nostr-tools:** Zap goal support via standard event creation + NIP-57 zap helpers
- **Amethyst:** Android client with zap goal display
- **Coracle:** Web client with zap goal support

## Related NIPs

- **NIP-57** -- Lightning Zaps (required -- goals are funded by zaps)
- **NIP-61** -- Nutzaps (ecash tips could conceptually fund goals, though not yet standardized)
- **NIP-23** -- Long-form Content (can link to goals via `goal` tag)
- **NIP-53** -- Live Activities (livestreams can link to fundraising goals)
