# NIP-19: bech32-Encoded Entities

## Status
Active (draft, optional)

## Summary
NIP-19 defines human-friendly bech32-encoded formats for Nostr keys, event IDs, and shareable identifiers with embedded metadata (relay hints, author info). These encodings are for display, copy-paste, QR codes, and user input only -- they MUST NOT appear in the core protocol (NIP-01 events use raw hex). The spec defines `npub`, `nsec`, `note` for bare keys/IDs, and `nprofile`, `nevent`, `naddr`, `nrelay` for metadata-rich shareable identifiers using TLV encoding.

## Motivation
Raw 32-byte hex strings are unfriendly for humans to read, copy, and share. Bech32 encoding provides error detection, is case-insensitive, and avoids ambiguous characters. Beyond basic encoding, Nostr needs a way to share references that include relay hints and other metadata so that clients can find the referenced content. NIP-19 solves both problems: simple bech32 for bare identifiers, and TLV-encoded bech32 for rich shareable references.

## Specification

### Bare Keys and IDs (Simple bech32)

These encode a raw 32-byte value with a human-readable prefix:

| Prefix | Encodes | Description |
|--------|---------|-------------|
| `npub` | public key | 32-byte secp256k1 public key |
| `nsec` | private key | 32-byte secp256k1 private key |
| `note` | event ID | 32-byte event ID (SHA-256 hash) |

All use bech32 encoding (NOT bech32m).

### Shareable Identifiers with TLV Metadata

These use TLV (Type-Length-Value) binary encoding before bech32 wrapping:

| Prefix | Primary Content | Description |
|--------|----------------|-------------|
| `nprofile` | pubkey | Profile reference with relay hints |
| `nevent` | event ID | Event reference with relay hints, author, kind |
| `naddr` | d-tag value | Addressable event coordinate with author, kind, relays |
| `nrelay` | relay URL | Relay reference (DEPRECATED) |

### TLV Types

| Type | Name | Value Format | Used In | Repeatable |
|------|------|-------------|---------|------------|
| 0 | special | Depends on prefix (see below) | All | No |
| 1 | relay | ASCII relay URL string | All | Yes |
| 2 | author | 32-byte pubkey | `nevent`, `naddr` | No |
| 3 | kind | 32-bit unsigned integer, big-endian | `nevent`, `naddr` | No |

**Type 0 (special) values by prefix:**
- `nprofile`: 32-byte pubkey
- `nevent`: 32-byte event ID
- `naddr`: UTF-8 `d` tag value string
- `nrelay`: ASCII relay URL string

### TLV Binary Encoding

Each TLV entry is encoded as:
```
[type: 1 byte] [length: 1 byte] [value: <length> bytes]
```

Multiple TLV entries are concatenated. The resulting binary is then bech32-encoded with the appropriate prefix.

### Tags

NIP-19 does not define new tags, but the encoded identifiers are used extensively in:
- `nostr:` URI scheme (NIP-21)
- Content inline references (NIP-27)
- Various tag values across other NIPs

### Protocol Flow

**Encoding a profile reference:**
1. Start with a pubkey (32 bytes hex)
2. Create TLV: type=0, length=32, value=pubkey bytes
3. Optionally add TLV: type=1, length=N, value=relay URL bytes (repeat for multiple relays)
4. Concatenate all TLV entries
5. Bech32-encode with prefix `nprofile`

**Encoding an event reference:**
1. Start with an event ID (32 bytes hex)
2. Create TLV: type=0, length=32, value=event ID bytes
3. Optionally add relay hints (type=1), author pubkey (type=2), kind (type=3)
4. Bech32-encode with prefix `nevent`

**Encoding an addressable event reference:**
1. Start with the `d` tag value (UTF-8 string)
2. Create TLV: type=0, length=N, value=d-tag UTF-8 bytes
3. Add author pubkey (type=2, 32 bytes) -- required for resolution
4. Add kind (type=3, 4 bytes big-endian) -- required for resolution
5. Optionally add relay hints (type=1)
6. Bech32-encode with prefix `naddr`

**Decoding any NIP-19 string:**
1. Bech32-decode to get prefix and data bytes
2. If prefix is `npub`, `nsec`, or `note`: data is the raw 32-byte value
3. If prefix is `nprofile`, `nevent`, `naddr`, or `nrelay`: parse TLV entries from data
4. Ignore unrecognized TLV types (do not error)

### JSON Examples

NIP-19 strings appear in event content and URIs, not as event structures themselves. Here are usage examples:

**nprofile in a nostr: URI (used in content per NIP-27):**
```
nostr:nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p
```

**nevent in a nostr: URI:**
```
nostr:nevent1qqstna2yrezu5wghjvswqqculvvwxsrcvu7uc0f78gan4xqhvz49d9spr3mhxue69uhkummnw3ez6un9d3shjtn4de6x2argwghx6egpr4mhxue69uhkummnw3ez6ur4vgh8wetvd3hhyer9wghxuet5nxnepm
```

**npub (bare public key):**
```
npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9
```

**Example: How nprofile encodes to TLV (conceptual):**
```
Pubkey (hex): 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
Relay hint: wss://relay.example.com

TLV bytes:
  [0x00] [0x20] [3bf0c63f...fa459d]     # type=0 (special), 32 bytes, pubkey
  [0x01] [0x18] [wss://relay.example.com] # type=1 (relay), 24 bytes, URL

Bech32 encode with prefix "nprofile" -> nprofile1qqsrhuxx8l9ex335q7...
```

## Implementation Notes

1. **npub/nsec MUST NOT appear in NIP-01 events:** The core protocol uses only lowercase hex for pubkeys and event IDs. NIP-19 encodings are exclusively for user-facing display and input.

2. **npub/nsec MUST NOT appear in NIP-05 JSON responses:** Only hex format is valid in `/.well-known/nostr.json`.

3. **Bech32, not bech32m:** NIP-19 uses the original bech32 encoding (BIP-173), not bech32m (BIP-350).

4. **Length limit:** Bech32 strings SHOULD stay under 5000 characters.

5. **Unknown TLV types:** Decoders MUST silently ignore unrecognized TLV types. This enables forward compatibility.

6. **Relay hints are hints:** The relay URLs in TLV type 1 are suggestions, not guarantees. Clients should try these relays but also use other discovery mechanisms.

7. **nrelay is deprecated:** The `nrelay` prefix is deprecated and should not be used in new implementations.

8. **nsec handling:** Clients should be extremely careful with `nsec` values. Never display them publicly, never include them in event content, and ideally use NIP-07/NIP-46 signer extensions instead of raw private keys.

## Client Behavior

- Clients MUST be able to decode all NIP-19 prefixes (`npub`, `nsec`, `note`, `nprofile`, `nevent`, `naddr`)
- Clients MUST use hex (not NIP-19) in NIP-01 event fields
- Clients SHOULD encode references as `nprofile` or `nevent` (with relay hints) rather than bare `npub`/`note` when sharing
- Clients SHOULD use relay hints from decoded TLV to fetch referenced content
- Clients SHOULD silently ignore unknown TLV types
- Clients MUST NOT include `nsec` values in published events
- Clients MAY display NIP-19 strings with truncation (e.g., `npub1abc...xyz`)

## Relay Behavior

- Relays have no special behavior for NIP-19 (it is a client-side encoding)
- Relays deal exclusively in hex-encoded keys and IDs per NIP-01

## Dependencies
- NIP-01: Base protocol (defines the hex identifiers that NIP-19 encodes)

## Source Code References

- **nostr-tools (JS):** `nip19.ts` -- encode/decode functions for all NIP-19 types
- **rust-nostr:** `nostr/src/nips/nip19.rs` -- Rust bech32 encoding/decoding
- **go-nostr:** `nip19/nip19.go` -- Go implementation
- **python-nostr:** Various bech32 encoding utilities

## Related NIPs
- NIP-01: Base protocol (hex format for events)
- NIP-05: Mapping Nostr keys to DNS identifiers (uses hex, not NIP-19)
- NIP-21: `nostr:` URI scheme (wraps NIP-19 strings)
- NIP-27: Text Note References (uses `nostr:` + NIP-19 in content)
