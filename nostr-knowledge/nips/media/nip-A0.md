# NIP-A0: Voice Messages

## Status
Active (Draft, Optional)

## Summary
NIP-A0 defines two event kinds for voice messaging on Nostr: `kind:1222` for root voice messages and `kind:1244` for voice replies. The event's `.content` field contains a direct URL to an audio file. Optional `imeta` tags can carry waveform visualization data and duration, allowing clients to render audio previews without downloading the file.

## Motivation
Voice messages are a fundamental communication primitive in modern messaging. Text-only Nostr clients miss this capability. NIP-A0 provides a lightweight, purpose-built event kind for voice messages rather than overloading `kind:1` notes with audio attachments. By defining dedicated kinds, clients can build voice-centric UIs (think WhatsApp/Telegram voice notes) and relays can filter/index voice content specifically.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `1222` | Regular | Root voice message (standalone) |
| `1244` | Regular | Voice reply (threaded, follows NIP-22 structure) |

### Tags

#### Required (by event structure)
The `.content` field itself is required and MUST be a URL pointing directly to an audio file. This is not a tag but is the core payload.

#### Optional Tags
| Tag | Description | Example |
|-----|-------------|---------|
| `t` | Hashtag for categorization | `["t", "podcast"]` |
| `g` | Geohash location tag | `["g", "u4pruydqqv"]` |
| `imeta` | Inline media metadata (NIP-92) with voice-specific fields | See below |

#### Voice-Specific `imeta` Fields
In addition to standard NIP-92 fields, NIP-A0 defines:
- `waveform` -- Amplitude values over time, space-separated full integers. Less than 100 values is recommended. Used by clients to render a visual waveform without downloading the audio.
- `duration` -- Length of the audio in seconds.

#### Reply Structure (kind 1244)
Reply events MUST follow NIP-22 threading conventions, including appropriate `e` and `p` tags for the parent event and author.

### Audio Format Requirements
- **Recommended:** `audio/mp4` (.m4a) with AAC or Opus encoding
- **Also acceptable:** `audio/ogg`, `audio/webm`, `audio/mpeg`
- **Duration limit:** SHOULD NOT exceed 60 seconds

### Protocol Flow

#### Sending a Voice Message
1. User records audio in the client (ideally as .m4a with AAC or Opus).
2. Client uploads the audio file to a hosting service (e.g., Blossom server).
3. Client obtains the file URL and computes waveform data from the audio.
4. Client constructs a `kind:1222` event (or `kind:1244` for a reply) with:
   - `.content` = the audio file URL
   - Optional `imeta` tag with `url`, `m`, `waveform`, `duration`, and any other NIP-92 fields.
5. Event is signed and published to relays.

#### Receiving a Voice Message
1. Client fetches events of kind 1222 and 1244.
2. Client checks for an `imeta` tag:
   - If `waveform` is present, renders a waveform visualization.
   - If `duration` is present, displays the length.
3. Client provides a play button; on tap, streams or downloads the audio from the `.content` URL.
4. For `kind:1244` replies, client threads them under the parent event per NIP-22.

### JSON Examples

#### Root Voice Message (kind 1222)
```json
{
  "kind": 1222,
  "content": "https://blossom.example.com/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2.m4a",
  "created_at": 1700000000,
  "tags": [
    ["imeta",
      "url https://blossom.example.com/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2.m4a",
      "m audio/mp4",
      "waveform 0 5 12 28 45 67 89 100 95 80 63 45 30 18 8 2 0 3 10 25 50 75 92 100 88 70 50 30 15 5",
      "duration 8"
    ]
  ]
}
```

#### Voice Reply (kind 1244)
```json
{
  "kind": 1244,
  "content": "https://blossom.example.com/f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d.m4a",
  "created_at": 1700000060,
  "tags": [
    ["e", "abc123parenteventid", "wss://relay.example.com", "root"],
    ["e", "def456parenteventid", "wss://relay.example.com", "reply"],
    ["p", "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"],
    ["imeta",
      "url https://blossom.example.com/f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d.m4a",
      "m audio/mp4",
      "waveform 0 10 30 55 80 100 90 70 45 20 5 0",
      "duration 4"
    ]
  ]
}
```

## Implementation Notes
- The 60-second duration limit is a SHOULD, not a MUST -- clients may allow longer recordings but should be aware that some clients may truncate or refuse to play longer messages.
- Waveform data should use less than 100 amplitude values. More values increase event size without meaningful visual improvement.
- The `.content` field is the audio URL itself (not a text description with an embedded URL). This differs from `kind:1` notes.
- Clients generating waveform data should normalize amplitudes to a consistent range (e.g., 0-100).
- Audio encoding as Opus in an MP4 container (.m4a) provides the best balance of quality, compression, and browser compatibility.

## Client Behavior
- Clients MUST set `.content` to a direct audio file URL.
- Clients SHOULD encode audio as `audio/mp4` (.m4a) with AAC or Opus.
- Clients SHOULD limit recordings to 60 seconds.
- Clients SHOULD include an `imeta` tag with `waveform` and `duration` for preview rendering.
- Clients SHOULD render waveform visualizations when the `imeta` tag includes `waveform` data.
- Clients SHOULD display duration before playback.
- Clients MAY support additional audio formats (ogg, webm, mpeg) for playback.
- Clients MUST use NIP-22 reply structure for `kind:1244` events.

## Relay Behavior
- Relays MUST accept kinds 1222 and 1244 if they support this NIP.
- Relays MAY apply size limits or content policies to voice message events.
- Relays handle these as standard regular events (not replaceable, not addressable).

## Dependencies
- [NIP-92](nip-92.md) -- Media Attachments (`imeta` tag format)
- NIP-22 -- Comment/Reply threading (required for `kind:1244` replies)
- [NIP-B7](nip-B7.md) / Blossom -- Recommended for hosting audio files

## Source Code References
- Look for kind 1222 and 1244 definitions in client codebases
- Waveform generation typically uses Web Audio API (browser) or platform audio APIs (mobile)
- `imeta` parsing reuses NIP-92 logic

## Related NIPs
- [NIP-92](nip-92.md) -- Media Attachments (imeta tag, waveform/duration fields)
- [NIP-71](nip-71.md) -- Video Events (similar pattern for video content)
- [NIP-94](nip-94.md) -- File Metadata (field vocabulary)
- [NIP-B7](nip-B7.md) -- Blossom (file hosting)
- NIP-22 -- Comments/Replies (threading for kind 1244)
