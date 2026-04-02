# NIP-89: Recommended Application Handlers

## Status
Active (Draft, Optional)

## Summary
NIP-89 defines a discovery mechanism for applications that can handle specific Nostr event kinds. It uses two event kinds: `kind:31989` (recommendations from users) and `kind:31990` (handler information published by applications). When a client encounters an unfamiliar event kind, it can query for handlers and redirect the user to an appropriate application.

## Motivation
As the Nostr ecosystem grows, new event kinds are created for specialized use cases (chess games, code snippets, long-form content, etc.). A general-purpose client cannot natively support every kind. NIP-89 solves this by creating a decentralized app-store-like discovery layer: applications advertise what kinds they handle, users recommend applications, and clients query these recommendations to offer users a way to view or interact with unknown event types.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `31989` | Addressable | Recommendation event -- a user recommends handler(s) for a specific event kind |
| `31990` | Addressable | Handler information -- an application advertises itself and the kinds it supports |

### Tags

**`kind:31989` -- Recommendation Event Tags:**

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | **Yes** | The event kind being recommended for (e.g., `"31337"`) |
| `a` | **Yes** (one or more) | Reference to a `kind:31990` handler address, with optional relay hint and platform identifier |

Format of the `a` tag:
```
["a", "31990:<handler-pubkey>:<d-tag>", "<relay-hint>", "<platform>"]
```

Platform values include: `web`, `ios`, `android`, `desktop`, etc.

**`kind:31990` -- Handler Information Tags:**

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | **Yes** | Unique identifier for the handler (often the app name) |
| `k` | **Yes** (one or more) | Event kind(s) this handler supports (e.g., `"1"`, `"30023"`) |
| `web` | Optional | URL template for web platform. Use `<bech32>` as placeholder for NIP-19 encoded entity |
| `ios` | Optional | URL template or app scheme for iOS |
| `android` | Optional | URL template or app scheme for Android |

The `.content` field MAY contain a JSON metadata object with `name`, `about`, `picture`, etc.

**Client Tag (optional, on any published event):**

| Tag | Description |
|-----|-------------|
| `client` | `["client", "<client-name>", "31990:<handler-pubkey>:<d-tag>", "<relay-hint>"]` |

This tag identifies which client was used to publish the event. It has privacy implications and SHOULD be user-configurable.

### Protocol Flow

**Application registration:**
1. An application developer publishes a `kind:31990` event advertising their app's name, supported event kinds (`k` tags), and platform-specific URLs.

**User recommendation:**
2. A user who likes an app publishes a `kind:31989` event for a specific event kind, referencing the handler's `kind:31990` address via `a` tags.

**Discovery by another user:**
3. User B's client encounters an unknown event kind (e.g., `kind:64` chess game).
4. The client queries for `kind:31989` events from User B and their contacts, filtered by `#d` matching the unknown kind.
5. If recommendations are found, the client fetches the referenced `kind:31990` handler information.
6. The client presents the user with options to open the event in a recommended application, using the URL template from the handler and substituting `<bech32>` with the appropriate NIP-19 encoding of the event.

**Alternative direct discovery:**
7. Clients MAY also query `kind:31990` events directly using `#k` tag filters matching the desired event kind, bypassing the recommendation layer.

### JSON Examples

**Handler Information (`kind:31990`) -- a chess client:**
```json
{
  "kind": 31990,
  "pubkey": "<app-developer-pubkey>",
  "created_at": 1700000000,
  "content": "{\"name\": \"ChessNostr\", \"about\": \"A chess client for Nostr\", \"picture\": \"https://example.com/chess-icon.png\"}",
  "tags": [
    ["d", "chessnostr"],
    ["k", "64"],
    ["web", "https://chessnostr.com/<bech32>", "nevent"],
    ["ios", "chessnostr://<bech32>"]
  ]
}
```

**Recommendation (`kind:31989`) -- user recommends ChessNostr for kind 64:**
```json
{
  "kind": 31989,
  "pubkey": "<recommending-user-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["d", "64"],
    ["a", "31990:<app-developer-pubkey>:chessnostr", "wss://relay.example.com", "web"]
  ]
}
```

**Client tag on a published event:**
```json
{
  "kind": 1,
  "content": "Hello from my favorite client!",
  "tags": [
    ["client", "Amethyst", "31990:<amethyst-pubkey>:amethyst", "wss://relay.example.com"]
  ]
}
```

## Implementation Notes

- **Privacy of the `client` tag:** Including a `client` tag reveals which application a user is using. This can be a fingerprinting vector. Clients SHOULD make this opt-in or at least clearly disclosed.
- **Bech32 placeholder:** The `<bech32>` string in URL templates must be replaced with the appropriate NIP-19 encoding: `nevent`, `naddr`, `note`, or `nprofile` depending on the context specified as the second element of the platform tag.
- **Multiple handlers:** A user can recommend multiple handlers for the same kind. Clients should present these as options rather than auto-selecting.
- **Trust model:** Recommendations are social -- they come from the user's contact graph. This provides a natural web-of-trust filter for app discovery.

## Client Behavior

- Clients SHOULD query for `kind:31989` events when encountering unknown event kinds.
- Clients SHOULD prioritize recommendations from the user's contacts.
- Clients MAY fall back to querying `kind:31990` directly if no recommendations are found.
- Clients MAY include a `client` tag when publishing events, but MUST make this user-configurable due to privacy implications.
- Clients SHOULD display handler metadata (name, icon) when presenting recommendations.

## Relay Behavior

- Relays MUST treat `kind:31989` and `kind:31990` as addressable events.
- Relays SHOULD support `#d` and `#k` tag filters for efficient handler discovery queries.

## Dependencies

- **NIP-01** -- Basic protocol, addressable events
- **NIP-19** -- Bech32 encoding for `nevent`, `naddr`, `note`, `nprofile` used in URL templates
- **NIP-02** -- Contact list (for filtering recommendations by social graph)
- **NIP-51** -- Lists (optionally used for curating app recommendations)

## Source Code References

- **nostr-tools:** No dedicated NIP-89 module; handler events are constructed using standard addressable event helpers with `kind:31989` / `kind:31990`.
- **rust-nostr:** `EventBuilder` with kind `31989` / `31990` and appropriate tag construction.
- Clients like **Amethyst**, **Coracle**, and **noStrudel** implement NIP-89 handler discovery.

## Related NIPs

- **NIP-01** -- Event structure and addressable events
- **NIP-19** -- Bech32 entity encoding used in URL templates
- **NIP-02** -- Contact lists for social filtering of recommendations
- **NIP-78** -- Application-specific data (complementary app-layer NIP)
- **NIP-90** -- Data Vending Machines (uses `kind:31990` for service provider discovery)
