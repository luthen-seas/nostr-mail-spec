# NIP-39: External Identities in Profiles

## Status
Active (draft, optional)

## Summary
NIP-39 allows users to declare and prove ownership of external online identities (GitHub, Twitter, Mastodon, Telegram, etc.) by publishing a kind `10011` event with `i` tags. Each tag links a platform identity to a publicly verifiable proof (e.g., a gist, tweet, or post) that contains the user's Nostr public key.

## Motivation
Users often have established identities across multiple platforms. NIP-39 provides a standardized way to link these external identities to a Nostr profile so that others can verify the connection. This builds trust by allowing someone to confirm that the same person controls both the Nostr account and the external platform account, without relying on a centralized verification service.

## Specification

### Event Kinds

| Kind  | Description |
|-------|-------------|
| 10011 | External Identities (replaceable) |

### Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `i` | `["i", "<platform>:<identity>", "<proof>"]` | Declares an external identity with proof |

- The first parameter is `platform:identity` joined with `:`.
- The second parameter is a string or object pointing to the proof of ownership.
- Clients SHOULD process any `i` tags with more than 2 values for future extensibility.

**Platform naming rules:**
- Identity provider names SHOULD only include `a-z`, `0-9` and the characters `._-/`
- Identity provider names MUST NOT include `:`
- Identity names SHOULD be normalized (lowercase, use primary alias)

### Protocol Flow

1. User creates a proof on the external platform (gist, tweet, post) containing their npub-encoded Nostr public key.
2. User publishes a kind `10011` event with `i` tags referencing each external identity and its proof.
3. Clients fetch the proof URL and verify that the content includes the user's Nostr public key.
4. Clients display verified external identities on the user's profile.

### JSON Examples

**Kind 10011 event with multiple external identities:**

```json
{
  "kind": 10011,
  "tags": [
    ["i", "github:semisol", "9721ce4ee4fceb91c9711ca2a6c9a5ab"],
    ["i", "twitter:semisol_public", "1619358434134196225"],
    ["i", "mastodon:bitcoinhackers.org/@semisol", "109775066355589974"],
    ["i", "telegram:1087295469", "nostrdirectory/770"]
  ],
  "content": ""
}
```

### Claim Types

#### `github`

- **Identity:** A GitHub username.
- **Proof:** A GitHub Gist ID.
- **Proof content:** A single file with the text: `Verifying that I control the following Nostr public key: <npub encoded public key>`
- **Proof URL:** `https://gist.github.com/<identity>/<proof>`

#### `twitter`

- **Identity:** A Twitter username.
- **Proof:** A Tweet ID.
- **Proof content:** Tweet text: `Verifying my account on nostr My Public Key: "<npub encoded public key>"`
- **Proof URL:** `https://twitter.com/<identity>/status/<proof>`

#### `mastodon`

- **Identity:** A Mastodon instance and username in the format `<instance>/@<username>`.
- **Proof:** A Mastodon post ID.
- **Proof content:** Post text: `Verifying that I control the following Nostr public key: "<npub encoded public key>"`
- **Proof URL:** `https://<identity>/<proof>`

#### `telegram`

- **Identity:** A Telegram user ID.
- **Proof:** A string in the format `<ref>/<id>` pointing to a message in a public channel/group `<ref>` with message ID `<id>`.
- **Proof content:** Message text: `Verifying that I control the following Nostr public key: "<npub encoded public key>"`
- **Proof URL:** `https://t.me/<proof>`

## Implementation Notes

- Kind `10011` is a replaceable event, so each new publication replaces the previous one entirely.
- Verification requires fetching external URLs, which may fail due to rate limiting, account deletion, or platform API changes.
- Twitter verification is particularly fragile due to API restrictions and the platform's changing policies.
- Clients should cache verification results and re-verify periodically rather than on every profile view.
- The proof text format varies slightly between platforms -- pay attention to the exact expected format for each.
- New platform types can be added without changing the NIP, as long as they follow the `platform:identity` naming convention.

## Client Behavior

- Clients SHOULD verify external identity claims by fetching the proof and checking for the npub.
- Clients SHOULD display verified identities with a visual indicator (e.g., platform icon with checkmark).
- Clients SHOULD gracefully handle verification failures (network errors, deleted proofs).
- Clients SHOULD process `i` tags with more than 2 values for forward compatibility.
- Clients MAY allow users to create proof posts and publish kind `10011` events through an in-app flow.

## Relay Behavior

- Relays MUST treat kind `10011` as a replaceable event, keeping only the latest per pubkey.
- Relays have no special verification responsibilities.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (replaceable events)
- [NIP-19](../nip-19.md) -- bech32-encoded entities (npub format used in proof text)

## Source Code References

- **nostr-tools (JS):** `nip39.ts` -- identity verification utilities
- **rust-nostr:** External identity handling in profile modules

## Related NIPs

- [NIP-05](./nip-05.md) -- DNS-based identity mapping (complementary identity mechanism)
- [NIP-01](../nip-01.md) -- Kind 0 metadata (profile data that NIP-39 extends)
