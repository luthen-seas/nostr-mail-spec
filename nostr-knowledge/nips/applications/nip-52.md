# NIP-52: Calendar Events

## Status
Draft / Optional

## Summary
NIP-52 defines a calendar system on NOSTR with four event kinds: date-based calendar events (kind 31922) for all-day or multi-day occasions, time-based calendar events (kind 31923) for events with specific start/end times, calendars (kind 31924) as collections of events, and RSVPs (kind 31925) for attendance responses. All calendar event kinds are addressable (parameterized replaceable), making them updatable and deletable.

## Motivation
Calendar functionality is a natural extension of social protocols. Users need to announce meetups, conferences, and other time-bound events to their NOSTR network. NIP-52 provides a standardized way to create, discover, and respond to calendar events without relying on centralized platforms like Google Calendar or Eventbrite. The decentralized nature means events cannot be censored or de-platformed, and users maintain ownership of their event data.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 31922 | Date-Based Calendar Event | Addressable | All-day or multi-day events (date granularity) |
| 31923 | Time-Based Calendar Event | Addressable | Events with specific start/end timestamps |
| 31924 | Calendar | Addressable | A named collection of calendar events |
| 31925 | Calendar Event RSVP | Addressable | Attendance response to a calendar event |

### Tags

#### Common Tags (shared by 31922 and 31923)

| Tag | Required | Repeatable | Format | Description |
|-----|----------|------------|--------|-------------|
| `d` | Yes | No | `["d", "<unique-id>"]` | Short unique string identifier |
| `title` | Yes | No | `["title", "<event-title>"]` | Name of the calendar event |
| `summary` | No | No | `["summary", "<text>"]` | Brief description for list views |
| `image` | No | No | `["image", "<url>"]` | Preview image URL |
| `location` | No | Yes | `["location", "<place>"]` | Physical or virtual location |
| `g` | No | No | `["g", "<geohash>"]` | Geohash for searchable location |
| `p` | No | Yes | `["p", "<pubkey>", "<relay-url>", "<role>"]` | Participant with optional relay and role |
| `t` | No | Yes | `["t", "<hashtag>"]` | Hashtag categorization |
| `r` | No | Yes | `["r", "<url>"]` | External references/links |

**Content:** Description of the calendar event (free-form text).

#### Date-Based Calendar Event (31922) Specific Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `start` | Yes | `["start", "YYYY-MM-DD"]` | Start date in ISO 8601 format |
| `end` | No | `["end", "YYYY-MM-DD"]` | End date in ISO 8601 format (exclusive; omit for single-day events) |

#### Time-Based Calendar Event (31923) Specific Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `start` | Yes | `["start", "<unix-timestamp>"]` | Start time as Unix timestamp in seconds |
| `end` | No | `["end", "<unix-timestamp>"]` | End time as Unix timestamp in seconds |
| `D` | Yes | `["D", "<unix-timestamp>"]` | Day-granularity Unix timestamp (start of day) |
| `start_tzid` | No | `["start_tzid", "<IANA-timezone>"]` | IANA Time Zone Database identifier for start |
| `end_tzid` | No | `["end_tzid", "<IANA-timezone>"]` | IANA Time Zone Database identifier for end |

#### Calendar (31924) Tags

| Tag | Required | Repeatable | Format | Description |
|-----|----------|------------|--------|-------------|
| `d` | Yes | No | `["d", "<unique-id>"]` | Calendar identifier |
| `title` | Yes | No | `["title", "<calendar-title>"]` | Calendar display name |
| `a` | Yes | Yes | `["a", "<31922 or 31923>:<pubkey>:<d-id>", "<relay-url>"]` | Reference to a calendar event |

**Content:** Description of the calendar.

#### RSVP (31925) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `["d", "<unique-id>"]` | Unique RSVP identifier |
| `a` | Yes | `["a", "<31922 or 31923>:<pubkey>:<d-id>", "<relay-url>"]` | Calendar event being responded to |
| `e` | No | `["e", "<event-id>", "<relay-url>"]` | Event ID of the calendar event |
| `status` | Yes | `["status", "<accepted/declined/tentative>"]` | Attendance status |
| `fb` | No | `["fb", "<free/busy>"]` | Free/busy indicator |
| `p` | No | `["p", "<event-author-pubkey>", "<relay-url>"]` | Calendar event author |

**Content:** Optional note/message with the RSVP.

### Protocol Flow

1. **Organizer creates a calendar event** by publishing a kind 31922 (date-based) or 31923 (time-based) event with title, dates/times, location, and participant tags.
2. **Organizer may create a calendar** (kind 31924) grouping multiple events with `a` tag references.
3. **Invitees discover events** via relay queries, `p` tag mentions, or calendar references.
4. **Invitees respond** by publishing kind 31925 RSVP events with their attendance status.
5. **Organizer updates events** by publishing new versions with the same `d` tag (addressable event replacement).
6. **Organizer deletes events** using NIP-09 deletion events.

### JSON Examples

**Date-Based Calendar Event (kind 31922):**
```json
{
  "kind": 31922,
  "pubkey": "<organizer-pubkey-hex>",
  "created_at": 1700000000,
  "content": "Annual NOSTR developer conference with workshops, talks, and hacking sessions.",
  "tags": [
    ["d", "nostrconf-2024"],
    ["title", "NOSTRConf 2024"],
    ["start", "2024-03-15"],
    ["end", "2024-03-17"],
    ["location", "Costa Rica"],
    ["g", "9g3q"],
    ["summary", "3-day developer conference for the NOSTR ecosystem"],
    ["image", "https://example.com/nostrconf-banner.jpg"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", "wss://relay.damus.io", "speaker"],
    ["p", "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", "wss://nos.lol", "organizer"],
    ["t", "conference"],
    ["t", "nostr"],
    ["r", "https://nostrconf.com"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Time-Based Calendar Event (kind 31923):**
```json
{
  "kind": 31923,
  "pubkey": "<organizer-pubkey-hex>",
  "created_at": 1700000000,
  "content": "Weekly NOSTR development call. Open to all contributors.",
  "tags": [
    ["d", "weekly-dev-call"],
    ["title", "NOSTR Weekly Dev Call"],
    ["summary", "Open development discussion for NOSTR protocol"],
    ["image", "https://example.com/dev-call.png"],
    ["start", "1710500400"],
    ["end", "1710504000"],
    ["D", "82549"],
    ["start_tzid", "America/New_York"],
    ["end_tzid", "America/New_York"],
    ["location", "https://meet.jit.si/nostr-dev"],
    ["g", "dr5ru"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", "wss://relay.damus.io", "host"],
    ["t", "development"],
    ["t", "nostr"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Calendar (kind 31924):**
```json
{
  "kind": 31924,
  "pubkey": "<organizer-pubkey-hex>",
  "created_at": 1700000000,
  "content": "All official NOSTR community events and meetups.",
  "tags": [
    ["d", "nostr-community-calendar"],
    ["title", "NOSTR Community Calendar"],
    ["a", "31922:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:nostrconf-2024", "wss://relay.damus.io"],
    ["a", "31923:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:weekly-dev-call", "wss://relay.damus.io"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

**Calendar Event RSVP (kind 31925):**
```json
{
  "kind": 31925,
  "pubkey": "<attendee-pubkey-hex>",
  "created_at": 1700000000,
  "content": "Looking forward to it! Will be arriving on the 14th.",
  "tags": [
    ["e", "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210", "wss://relay.damus.io"],
    ["a", "31922:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:nostrconf-2024", "wss://relay.damus.io"],
    ["d", "rsvp-nostrconf-2024"],
    ["status", "accepted"],
    ["fb", "busy"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", "wss://relay.damus.io"]
  ],
  "id": "<event-id-hex>",
  "sig": "<signature-hex>"
}
```

## Implementation Notes

- **No recurring events:** The spec deliberately excludes recurring events. Clients that need recurrence should implement it client-side (e.g., creating multiple individual events or computing occurrences from a pattern stored in an extension tag).
- **The `D` tag** on time-based events provides a day-granularity Unix timestamp, enabling efficient filtering for "events on this day" without parsing individual start/end times.
- **Date format:** Date-based events use ISO 8601 `YYYY-MM-DD` strings, NOT Unix timestamps.
- **End date exclusivity:** For date-based events, the `end` date is typically exclusive (an event on March 15-17 means the event runs through March 16, ending before March 17).
- **Timezone handling:** The `start_tzid` and `end_tzid` tags use IANA Time Zone Database identifiers (e.g., `America/New_York`, `Europe/London`). Clients should use these to display correct local times.
- **RSVP addressability:** RSVPs are addressable events, so a user can update their RSVP by publishing a new one with the same `d` tag.
- **Participant roles:** The `p` tag's third position can contain roles like "speaker", "organizer", "host", "attendee", etc. These are free-form strings.
- **Geohash:** The `g` tag enables location-based discovery (e.g., "find events near me").

## Client Behavior

- Clients SHOULD display calendar events with appropriate date/time formatting based on the user's locale and timezone.
- Clients SHOULD use `start_tzid`/`end_tzid` to convert timestamps to local time when available.
- Clients SHOULD allow users to RSVP to events they are invited to (tagged with `p`).
- Clients SHOULD aggregate RSVPs to show attendance counts and lists.
- Clients MAY display calendars (kind 31924) as grouped views of multiple events.
- Clients SHOULD support deletion of calendar events via NIP-09.
- Clients MAY implement client-side recurrence patterns on top of the spec.
- Clients SHOULD use the `g` tag for proximity-based event search.

## Relay Behavior

- Relays SHOULD accept all NIP-52 event kinds.
- Relays SHOULD support filtering by `d`, `a`, `t`, and `g` tags for efficient calendar queries.
- Relays SHOULD support addressable event replacement semantics for all four kinds.
- No special validation is required beyond standard event verification.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-09** -- Event Deletion (for cancelling events)
- **NIP-51** -- Lists (conceptual overlap with calendar as a list of events)

## Source Code References

- **nostr-tools**: Check for kind 31922/31923/31924/31925 constants
- **rust-nostr**: `crates/nostr/src/event/kind.rs` for kind definitions
- **flockstr** -- Calendar-focused NOSTR client implementing NIP-52

## Related NIPs

- **NIP-01** -- Basic protocol flow
- **NIP-09** -- Event deletion (cancel events)
- **NIP-51** -- Lists (calendars are conceptually lists of events)
- **NIP-53** -- Live Activities (often paired with calendar events for scheduled live streams)
