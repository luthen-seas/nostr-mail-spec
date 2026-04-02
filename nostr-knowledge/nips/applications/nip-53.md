# NIP-53: Live Activities

## Status
Draft / Optional

## Summary
NIP-53 defines event kinds for real-time activities on NOSTR: live streaming events (kind 30311) for advertising and managing live streams, live chat messages (kind 1311) for audience participation, meeting spaces (kind 30312) for persistent virtual rooms, meeting room events (kind 30313) for scheduled meetings within spaces, and room presence (kind 10312) for signaling participation. Together these kinds enable live audio/video streaming, interactive chat, and virtual meeting rooms entirely over the NOSTR protocol.

## Motivation
Live streaming and real-time audio/video spaces have become a dominant form of content consumption and social interaction. Centralized platforms control who can go live, who can be seen, and can de-platform creators at will. NIP-53 moves the signaling and social layer of live activities onto NOSTR, allowing any client to discover and participate in live events. The actual media transport (HLS, WebRTC, etc.) happens off-protocol, but NOSTR provides the discovery, metadata, participant management, and chat layer.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 30311 | Live Streaming Event | Addressable | Advertises and manages a live stream |
| 1311 | Live Chat Message | Regular | Chat message within a live activity |
| 30312 | Meeting Space | Addressable | Persistent virtual room for audio/video |
| 30313 | Meeting Room Event | Addressable | Scheduled/live meeting within a space |
| 10312 | Room Presence | Replaceable | Signals listener presence in a room |

### Tags

#### Live Streaming Event (30311) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `["d", "<unique-id>"]` | Unique identifier |
| `title` | No | `["title", "<name>"]` | Event name |
| `summary` | No | `["summary", "<description>"]` | Description |
| `image` | No | `["image", "<url>"]` | Preview image URL |
| `t` | No | `["t", "<hashtag>"]` | Hashtags (repeatable) |
| `streaming` | No | `["streaming", "<url>"]` | Live stream URL (HLS, etc.) |
| `recording` | No | `["recording", "<url>"]` | Post-event recording URL |
| `starts` | No | `["starts", "<unix-timestamp>"]` | Scheduled start time |
| `ends` | No | `["ends", "<unix-timestamp>"]` | Scheduled end time |
| `status` | No | `["status", "<planned/live/ended>"]` | Current status |
| `current_participants` | No | `["current_participants", "<number>"]` | Current viewer/listener count |
| `total_participants` | No | `["total_participants", "<number>"]` | Total unique participants |
| `p` | No | `["p", "<pubkey>", "<relay>", "<role>", "<proof>"]` | Participant (up to 5 positions) |
| `relays` | No | `["relays", "<url>", ...]` | Preferred relay URIs for chat |
| `pinned` | No | `["pinned", "<event-id>"]` | Pinned chat message event ID |

**Content:** Empty string. All metadata is in tags.

**Participant roles:** Host, Speaker, Participant. Providers should keep participant lists under 1000 entries.

#### Live Chat Message (1311) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `a` | Yes | `["a", "30311:<pubkey>:<d-id>", "<relay-url>", "root"]` | Reference to the live activity |
| `e` | No | `["e", "<event-id>"]` | Direct parent message (for threading) |
| `q` | No | `["q", "<event-id-or-address>", "<relay-url>", "<pubkey>"]` | Cited/quoted event (NIP-21 format) |

**Content:** The chat message text.

#### Meeting Space (30312) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `["d", "<room-id>"]` | Room identifier |
| `room` | Yes | `["room", "<display-name>"]` | Human-readable room name |
| `summary` | No | `["summary", "<description>"]` | Room description |
| `image` | No | `["image", "<url>"]` | Room preview image |
| `status` | Yes | `["status", "<open/private/closed>"]` | Room access status |
| `service` | Yes | `["service", "<url>"]` | Room access URL (join link) |
| `endpoint` | No | `["endpoint", "<url>"]` | API endpoint URL for room status |
| `t` | No | `["t", "<hashtag>"]` | Hashtags (repeatable) |
| `p` | Yes | `["p", "<pubkey>", "<relay>", "<role>", "<proof>"]` | At least one Host required |
| `relays` | No | `["relays", "<url>", ...]` | Preferred relay URLs |

**Content:** Empty string.

**Provider roles:** Host (full management), Moderator (moderation capabilities), Speaker (presentation rights).

#### Meeting Room Event (30313) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `d` | Yes | `["d", "<event-id>"]` | Event identifier |
| `a` | Yes | `["a", "30312:<pubkey>:<room-id>", "<relay-url>"]` | Parent space reference |
| `title` | Yes | `["title", "<meeting-title>"]` | Meeting title |
| `summary` | No | `["summary", "<description>"]` | Meeting description |
| `image` | No | `["image", "<url>"]` | Meeting preview image |
| `starts` | Yes | `["starts", "<unix-timestamp>"]` | Start timestamp |
| `ends` | No | `["ends", "<unix-timestamp>"]` | End timestamp |
| `status` | Yes | `["status", "<planned/live/ended>"]` | Meeting status |
| `total_participants` | No | `["total_participants", "<number>"]` | Registered participant count |
| `current_participants` | No | `["current_participants", "<number>"]` | Active participant count |
| `p` | No | `["p", "<pubkey>", "<relay>", "<role>"]` | Participant with role |

**Content:** Empty string.

**Auto-expiry:** Events without updates for 1 hour MAY be marked as ended by clients.

#### Room Presence (10312) Tags

| Tag | Required | Format | Description |
|-----|----------|--------|-------------|
| `a` | Yes | `["a", "<room-a-tag>", "<relay-hint>", "root"]` | Room reference |
| `hand` | No | `["hand", "1"]` | Raised hand flag (1 = raised, 0 = lowered) |

### Protocol Flow

#### Live Streaming
1. **Streamer sets up media transport** (e.g., OBS pushing to an HLS endpoint).
2. **Streamer publishes kind 30311** with `status: planned`, `streaming` URL, and `starts` timestamp.
3. **When going live**, streamer updates the event with `status: live`.
4. **Viewers discover** the stream by querying for kind 30311 with `status: live`.
5. **Viewers send chat messages** as kind 1311 events referencing the stream's `a` tag.
6. **Host pins messages** by updating the `pinned` tag on the kind 30311 event.
7. **When stream ends**, streamer updates to `status: ended` and optionally adds a `recording` URL.

#### Meeting Spaces
1. **Host creates a space** by publishing kind 30312 with room details, service URL, and at least one Host `p` tag.
2. **Host schedules a meeting** by publishing kind 30313 referencing the space via `a` tag.
3. **Participants join** by connecting to the `service` URL and publishing kind 10312 presence events.
4. **Raised hands** are indicated by updating the kind 10312 event with `hand: 1`.
5. **Meeting concludes** when host updates kind 30313 to `status: ended`.

### Proof of Agreement Mechanism

The 5th parameter in `p` tags provides a **proof of agreement** that prevents malicious inclusion of participants:

1. The activity address is constructed: `<kind>:<pubkey>:<d-tag>` (e.g., `30311:abc123:my-stream`).
2. The participant SHA-256 hashes this complete address string.
3. The participant signs the hash with their private key.
4. The hex-encoded signature is placed as the proof (5th position in the `p` tag).

Clients MAY display participants without proof as "invited" (unconfirmed) and participants with valid proof as "confirmed."

### JSON Examples

**Live Streaming Event:**
```json
{
  "kind": 30311,
  "content": "",
  "tags": [
    ["d", "demo-cf-stream"],
    ["title", "Adult Swim Metalocalypse"],
    ["summary", "Live stream from IPTV-ORG collection"],
    ["streaming", "https://adultswim-vodlive.cdn.turner.com/live/metalocalypse/stream.m3u8"],
    ["starts", "1687182672"],
    ["status", "live"],
    ["t", "animation"],
    ["t", "iptv"],
    ["image", "https://i.imgur.com/CaKq6Mt.png"],
    ["p", "91cf9..4e5ca", "wss://provider1.com/", "Host", "<proof-hex>"],
    ["p", "14aeb..8dad4", "wss://provider2.com/nostr", "Speaker"],
    ["p", "612ae..e610f", "ws://provider3.com/ws", "Participant"],
    ["relays", "wss://relay.damus.io", "wss://nos.lol"],
    ["current_participants", "42"],
    ["total_participants", "185"]
  ]
}
```

**Live Chat Message:**
```json
{
  "kind": 1311,
  "content": "Zaps to live streams is beautiful.",
  "tags": [
    ["a", "30311:1597246ac22f7d1375041054f2a4986bd971d8d196d7997e48973263ac9879ec:demo-cf-stream", "", "root"]
  ]
}
```

**Meeting Space:**
```json
{
  "kind": 30312,
  "content": "",
  "tags": [
    ["d", "main-conference-room"],
    ["room", "Main Conference Hall"],
    ["summary", "Our primary conference space"],
    ["image", "https://example.com/room.jpg"],
    ["status", "open"],
    ["service", "https://meet.example.com/room"],
    ["endpoint", "https://api.example.com/room"],
    ["t", "conference"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca", "wss://nostr.example.com/", "Host"],
    ["p", "14aeb..8dad4", "wss://provider2.com/", "Moderator"],
    ["relays", "wss://relay1.com", "wss://relay2.com"]
  ]
}
```

**Meeting Room Event:**
```json
{
  "kind": 30313,
  "content": "",
  "tags": [
    ["d", "annual-meeting-2025"],
    ["a", "30312:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:main-conference-room", "wss://nostr.example.com"],
    ["title", "Annual Company Meeting 2025"],
    ["summary", "Yearly company-wide meeting"],
    ["image", "https://example.com/meeting.jpg"],
    ["starts", "1676262123"],
    ["ends", "1676269323"],
    ["status", "live"],
    ["total_participants", "180"],
    ["current_participants", "175"],
    ["p", "91cf9..4e5ca", "wss://provider1.com/", "Speaker"]
  ]
}
```

**Room Presence:**
```json
{
  "kind": 10312,
  "content": "",
  "tags": [
    ["a", "30312:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:main-conference-room", "wss://nostr.example.com", "root"],
    ["hand", "1"]
  ]
}
```

## Implementation Notes

- **Frequent updates:** Kind 30311 events are updated frequently as participant lists change and metrics update. Clients should expect many replacements.
- **Participant limit:** Providers should keep `p` tag lists under 1000 participants. When limits are approached, select a representative subset. Clients should not expect the participant list to be comprehensive.
- **Media transport is external:** NOSTR handles discovery and metadata only. The actual streaming (HLS, RTMP, WebRTC) happens via the URLs in `streaming` and `service` tags.
- **Proof is optional:** The proof of agreement in `p` tags is optional. Without proof, clients may show participants as "invited" rather than "confirmed."
- **Chat relay preferences:** The `relays` tag on kind 30311 indicates where chat messages (kind 1311) should be sent and queried.
- **Pinned messages:** Hosts update the `pinned` tag to highlight specific chat messages. Only one message can be pinned at a time (the most recent `pinned` tag value).
- **Meeting auto-expiry:** Kind 30313 events not updated for 1 hour may be considered ended.
- **Room presence staleness:** Kind 10312 events are replaceable. Clients should filter out presence events beyond a configurable time window to handle users who disconnect without publishing an update.

## Client Behavior

- Clients SHOULD poll or subscribe to kind 30311 updates to reflect current stream status and participants.
- Clients SHOULD display live chat (kind 1311) in real-time alongside the stream.
- Clients SHOULD allow users to send kind 1311 messages during live activities.
- Clients SHOULD use the `relays` tag from the activity event to determine where to send/query chat.
- Clients SHOULD validate proof of agreement in `p` tags when available and display unproven participants differently.
- Clients MAY implement rate limiting on chat messages to prevent spam.
- Clients SHOULD display `status` (planned/live/ended) prominently.
- Clients SHOULD support zapping live activities via NIP-57.
- Clients SHOULD display raised hands from kind 10312 events in meeting spaces.

## Relay Behavior

- Relays SHOULD accept all NIP-53 event kinds.
- Relays SHOULD efficiently handle the high update frequency of kind 30311 events.
- Relays SHOULD support addressable event replacement for kinds 30311, 30312, and 30313.
- Relays SHOULD support replaceable event semantics for kind 10312.
- Relays MAY implement rate limiting on kind 1311 to prevent chat spam.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-10** -- Threading for chat replies
- **NIP-21** -- `nostr:` URI scheme (for `q` tag citations in chat)
- **NIP-57** -- Lightning Zaps (for zapping live activities)

## Source Code References

- **zap.stream** -- Primary live streaming client implementing NIP-53
- **flare.pub** -- Another streaming client
- **nostrudel.ninja** -- General client with NIP-53 support
- **nostr-tools**: Check for kind 30311/1311 constants
- **rust-nostr**: Kind definitions in `crates/nostr/src/event/kind.rs`

## Related NIPs

- **NIP-01** -- Basic protocol flow
- **NIP-10** -- Reply threading
- **NIP-21** -- `nostr:` URI scheme
- **NIP-52** -- Calendar Events (for scheduling live activities)
- **NIP-57** -- Zaps (for live stream monetization)
