# NIP-05: Mapping Nostr Keys to DNS-based Internet Identifiers

## Status
Active (final, optional)

## Summary
NIP-05 provides a mechanism to map Nostr public keys to human-readable DNS-based identifiers in the format `name@domain.com`. Clients verify this mapping by querying a well-known URL on the domain, enabling users to associate their Nostr identity with a domain they control or that vouches for them.

## Motivation
Nostr public keys are long hex strings or bech32-encoded npub values that are difficult for humans to remember or communicate. NIP-05 solves this by allowing users to claim a human-readable identifier tied to a DNS domain. Domain owners can use this to attest to user identities (e.g., `bob@example.com` proves the domain owner recognizes Bob). It also serves as a discovery mechanism -- users can look up a Nostr pubkey by querying an identifier.

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| 0    | User Metadata (kind 0 `set_metadata` event) -- contains the `nip05` field |

The `nip05` field is placed inside the JSON `content` of a kind `0` event.

### Tags
No new tags are defined. NIP-05 uses the `content` field of kind `0` events.

### Protocol Flow

**Verification Flow:**

1. User publishes a kind `0` event with a `nip05` field in the content JSON, e.g., `"nip05": "bob@example.com"`.
2. Client parses the identifier into `<local-part>` (`bob`) and `<domain>` (`example.com`).
3. Client makes an HTTP GET request to: `https://example.com/.well-known/nostr.json?name=bob`
4. The server responds with a JSON object containing a `names` mapping.
5. Client checks that the pubkey returned for `bob` matches the pubkey of the kind `0` event.
6. If they match, the identifier is verified.

**Reverse Lookup / Discovery Flow:**

1. A user or client knows the identifier `bob@example.com` but not the pubkey.
2. Client queries `https://example.com/.well-known/nostr.json?name=bob`.
3. Client obtains the pubkey from the response.
4. Client can then fetch kind `0` events for that pubkey to confirm the mapping.

### JSON Examples

**Kind 0 event with nip05 field:**

```json
{
  "kind": 0,
  "content": "{\"name\": \"bob\", \"nip05\": \"bob@example.com\"}"
}
```

**Well-known endpoint response:**

```json
{
  "names": {
    "bob": "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9"
  }
}
```

**Response with optional relays field:**

```json
{
  "names": {
    "bob": "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9"
  },
  "relays": {
    "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9": [
      "wss://relay.example.com",
      "wss://relay2.example.com"
    ]
  }
}
```

## Implementation Notes

- The local part of the identifier MUST only contain the characters `a-z0-9-_.` (lowercase letters, digits, hyphen, underscore, period).
- Public keys in the response MUST be in **lowercase hex format** only (not npub or any other encoding).
- The special identifier `_@domain.com` (underscore as local part) SHOULD be displayed by clients as just `domain.com`.
- The query string format `?name=<local-part>` is used so that both dynamic servers and static file hosts can serve the endpoint.
- The endpoint **MUST NOT** return any HTTP redirects.
- For JavaScript/browser-based applications, the server MUST include the `Access-Control-Allow-Origin: *` CORS header.
- NIP-05 is an **identification** mechanism, not a **verification** mechanism. It does not prove real-world identity; it proves a relationship between a pubkey and a domain.
- Identifiers can change or be revoked at any time by the domain owner updating the well-known file.

## Client Behavior

- Clients MUST always follow **public keys**, not NIP-05 addresses. If a NIP-05 mapping changes, the client should continue following the pubkey, not switch to whatever the identifier now resolves to.
- Clients SHOULD periodically re-verify NIP-05 identifiers to detect changes or revocations.
- Clients SHOULD display the NIP-05 identifier alongside or in place of the raw pubkey for better UX.
- Clients SHOULD display `_@domain.com` as just `domain.com`.
- Clients MAY use the optional `relays` field to discover relay preferences for a user.
- Clients MAY allow users to search/discover other users by NIP-05 identifier.

## Relay Behavior

- Relays have no special behavior for NIP-05. They simply store and serve kind `0` events as usual.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (kind 0 metadata events)

## Source Code References

- **nostr-tools (JS):** `nip05.ts` -- `queryProfile()`, `useFetchImplementation()`
- **rust-nostr:** `nostr/src/nips/nip05.rs` -- verification functions
- **go-nostr:** NIP-05 verification utilities

## Related NIPs

- [NIP-01](../nip-01.md) -- Kind 0 metadata event structure
- [NIP-21](../nip-21.md) -- `nostr:` URI scheme (alternative identifier approach)
- [NIP-39](./nip-39.md) -- External Identities in Profiles (complementary identity linking)
