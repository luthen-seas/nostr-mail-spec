# NIP-78: Arbitrary Custom App Data

## Status
Active (Draft, Optional)

## Summary
NIP-78 defines `kind:30078` addressable events for storing arbitrary application-specific data on Nostr relays. It provides a "remoteStorage-like" capability where any application -- Nostr-native or not -- can persist custom data keyed by a `d` tag, without needing interoperability with other applications. This effectively turns Nostr relays into a user-controlled personal database.

## Motivation
Applications often need to store user-specific settings, preferences, or state data. Traditionally this requires a centralized backend. NIP-78 solves this by allowing any application to read and write custom data to Nostr relays under the user's keypair. This enables:

1. **User settings portability** -- personal settings that follow the user across Nostr clients and even non-Nostr applications.
2. **Developer parameter distribution** -- developers can propagate dynamic configuration to users without requiring app updates.
3. **Private app data storage** -- non-Nostr apps can leverage Nostr relays as a personal encrypted database (using NIP-04 or NIP-44 encryption on `.content`).

The key principle is "bring your own database" -- the user designates their relay, and applications store/retrieve data there.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `30078` | Addressable (parameterized replaceable) | Application-specific data storage |

Because `kind:30078` is an addressable event, publishing a new event with the same `d` tag replaces the previous one.

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | **Yes** | Unique identifier string referencing the app name, context, or any arbitrary key. This is the lookup key for the data. |

All other tags are application-defined and can be in any format.

### Protocol Flow

1. An application determines a unique `d` tag value (e.g., `"myapp/user-settings"` or `"com.example.app/theme"`).
2. To **write** data, the application publishes a `kind:30078` event with the chosen `d` tag and the desired `.content` (and/or additional tags).
3. To **read** data, the application subscribes with a filter: `{"kinds": [30078], "authors": ["<user-pubkey>"], "#d": ["<d-tag-value>"]}`.
4. Since `kind:30078` is addressable, each new publish with the same `d` tag replaces the previous event, acting as an upsert.

### JSON Examples

**Storing user theme preferences:**
```json
{
  "kind": 30078,
  "pubkey": "<user-pubkey-hex>",
  "created_at": 1700000000,
  "content": "{\"theme\": \"dark\", \"fontSize\": 16, \"language\": \"en\"}",
  "tags": [
    ["d", "myapp/user-settings"]
  ]
}
```

**Storing encrypted private data:**
```json
{
  "kind": 30078,
  "pubkey": "<user-pubkey-hex>",
  "created_at": 1700000000,
  "content": "<nip-44-encrypted-json-blob>",
  "tags": [
    ["d", "com.example.app/private-notes"]
  ]
}
```

**Developer distributing app configuration:**
```json
{
  "kind": 30078,
  "pubkey": "<developer-pubkey-hex>",
  "created_at": 1700000000,
  "content": "{\"featureFlags\": {\"betaUI\": true, \"maxUploadMB\": 50}, \"apiVersion\": \"2.1\"}",
  "tags": [
    ["d", "myapp/config/v2"]
  ]
}
```

## Implementation Notes

- **Namespace your `d` tags.** Since `kind:30078` is shared across all applications, use a reverse-domain or app-name prefix (e.g., `"com.myapp/settings"`) to avoid collisions with other applications.
- **No interoperability guarantee.** This NIP explicitly does not define a shared schema. Each app defines its own `.content` format. Two apps using the same `d` tag would overwrite each other's data.
- **Encryption.** For private data, encrypt `.content` using NIP-44 (or legacy NIP-04). The `d` tag remains in cleartext, so avoid putting sensitive information in the tag itself.
- **Size limits.** Relays may impose event size limits. Do not use this as a general-purpose file storage system.

## Client Behavior

- Clients SHOULD use unique, namespaced `d` tag values to avoid collisions.
- Clients MAY encrypt `.content` for private data.
- Clients SHOULD handle the case where no `kind:30078` event exists yet (first-time use).
- Clients MUST treat this as an addressable event -- only the latest event per `d` tag is valid.

## Relay Behavior

- Relays MUST treat `kind:30078` as an addressable event per NIP-01, replacing older events with the same `pubkey` + `d` tag combination.
- Relays SHOULD NOT impose special validation on `.content` or tags beyond standard event validation.

## Dependencies

- **NIP-01** -- Basic protocol, addressable event semantics
- **NIP-44** (optional) -- For encrypting `.content` when storing private data

## Source Code References

- **nostr-tools:** Addressable events use the standard event creation functions. No dedicated NIP-78 module; the `d` tag is set manually.
- **rust-nostr:** `EventBuilder` supports arbitrary kind and tag construction for `kind:30078`.

## Related NIPs

- **NIP-01** -- Addressable event replacement semantics
- **NIP-44** -- Versioned encryption for private content
- **NIP-78** is often compared to **NIP-30** (custom emoji) and **NIP-89** (app handlers) as part of the application-layer ecosystem
