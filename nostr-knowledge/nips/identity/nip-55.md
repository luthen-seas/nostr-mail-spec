# NIP-55: Android Signer Application

## Status
Active (draft, optional)

## Summary
NIP-55 defines a protocol for bidirectional communication between Android signer applications and Nostr client apps on Android. It uses Android Intents for interactive signing operations and Content Resolvers for background/automated operations, allowing Nostr clients to request signing, encryption, and decryption without directly handling private keys.

## Motivation
Mobile Nostr clients on Android face the same key management challenges as web clients: storing private keys in the app is a security risk. NIP-55 provides a platform-native solution using Android's inter-app communication mechanisms (Intents and Content Resolvers). This allows a dedicated signer app (like Amber) to hold the user's keys securely while any Nostr client can request cryptographic operations through standard Android APIs. It also supports web applications running in Android browsers via URL scheme handling.

## Specification

### Event Kinds
No new event kinds are defined. This NIP defines an Android inter-process communication protocol.

### Tags
No new tags are defined.

### Protocol Flow

#### Prerequisites

**Signer App Setup:**

The signer application must declare the `nostrsigner` intent in its `AndroidManifest.xml`.

**Client App Setup:**

Clients detect signer availability by querying for the `nostrsigner` scheme:

```kotlin
fun isExternalSignerInstalled(context: Context): Boolean {
    val intent = Intent().apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("nostrsigner:")
    }
    val infos = context.packageManager.queryIntentActivities(intent, 0)
    return infos.size > 0
}
```

Clients use `rememberLauncherForActivityResult` (Jetpack Compose) or `registerForActivityResult` to handle Intent responses.

#### Method 1: Intents (Interactive)

Used for operations requiring user confirmation or first-time authorization.

**get_public_key** -- Initiates connection and retrieves the user's public key:

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:"))
intent.putExtra("type", "get_public_key")
// Optional: request specific permissions
intent.putExtra("permissions", permissions.toJson())
// Launch intent and receive pubkey in result
```

Result: Returns the user's public key as a hex string via `intent.getStringExtra("signature")`. Also returns the signer package name via `intent.getStringExtra("package")`.

**sign_event** -- Request event signature:

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$eventJson"))
intent.`package` = "com.example.signer"
intent.putExtra("type", "sign_event")
intent.putExtra("id", event.id)
intent.putExtra("current_user", pubkey)
// Launch intent and receive signature/signed event in result
```

Result: Returns the signature via `intent.getStringExtra("signature")` and optionally the signed event via `intent.getStringExtra("event")`.

**nip04_encrypt / nip44_encrypt** -- Encrypt plaintext:

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$plaintext"))
intent.`package` = "com.example.signer"
intent.putExtra("type", "nip04_encrypt") // or "nip44_encrypt"
intent.putExtra("pubkey", recipientPubkey)
intent.putExtra("current_user", signerPubkey)
intent.putExtra("id", visitorId)
```

Result: Returns ciphertext via `intent.getStringExtra("signature")`.

**nip04_decrypt / nip44_decrypt** -- Decrypt ciphertext:

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$ciphertext"))
intent.`package` = "com.example.signer"
intent.putExtra("type", "nip04_decrypt") // or "nip44_decrypt"
intent.putExtra("pubkey", senderPubkey)
intent.putExtra("current_user", signerPubkey)
intent.putExtra("id", visitorId)
```

Result: Returns plaintext via `intent.getStringExtra("signature")`.

**decrypt_zap_event** -- Decrypt a zap event:

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nostrsigner:$eventJson"))
intent.`package` = "com.example.signer"
intent.putExtra("type", "decrypt_zap_event")
intent.putExtra("current_user", signerPubkey)
intent.putExtra("id", visitorId)
```

Result: Returns decrypted event content via `intent.getStringExtra("signature")`.

#### Method 2: Content Resolvers (Background/Automated)

Used when the user has previously authorized the operation ("remember my choice"). Enables silent background processing without user interaction.

**Content Resolver URIs follow the pattern:**
```
content://com.example.signer.<METHOD_NAME>
```

**sign_event example:**

```kotlin
val result = context.contentResolver.query(
    Uri.parse("content://com.example.signer.SIGN_EVENT"),
    listOf("$eventJson", "", "$logged_in_user_pubkey"),
    null, null, null
)
```

The query projection array contains:
- Position 0: The data to process (event JSON, plaintext, ciphertext)
- Position 1: Additional parameter (e.g., recipient pubkey for encryption)
- Position 2: The current user's pubkey

**Content Resolver operations:**

| Operation | URI Suffix | Projection[0] | Projection[1] |
|-----------|-----------|---------------|---------------|
| sign_event | SIGN_EVENT | event JSON | (empty) |
| nip04_encrypt | NIP04_ENCRYPT | plaintext | recipient pubkey |
| nip44_encrypt | NIP44_ENCRYPT | plaintext | recipient pubkey |
| nip04_decrypt | NIP04_DECRYPT | ciphertext | sender pubkey |
| nip44_decrypt | NIP44_DECRYPT | ciphertext | sender pubkey |
| decrypt_zap_event | DECRYPT_ZAP_EVENT | event JSON | (empty) |
| get_public_key | GET_PUBLIC_KEY | (empty) | (empty) |

Results are returned in cursor columns specific to each operation type.

#### Method 3: Web Application Support

Web apps running in Android browsers can use URL scheme navigation:

```javascript
window.href = `nostrsigner:${eventJson}?compressionType=none&returnType=signature&type=sign_event&callbackUrl=https://example.com/?event=`;
```

**URL Parameters:**
- `compressionType`: `none` or `gzip` (for large payloads)
- `returnType`: `signature` or `event`
- `type`: The operation type (same as Intent types)
- `callbackUrl`: URL where the signer redirects with the result appended
- If no `callbackUrl` is provided, the result is placed in the clipboard

### JSON Examples

**Permissions request (JSON format for get_public_key):**

```json
[
  {
    "type": "sign_event",
    "kind": 22242
  },
  {
    "type": "nip44_encrypt"
  },
  {
    "type": "nip44_decrypt"
  }
]
```

## Implementation Notes

- The signer app package name should be stored by the client after the initial `get_public_key` call for subsequent operations.
- Content Resolvers only work after the user has granted permission via an Intent-based interaction first.
- For web applications, gzip compression is recommended for large event payloads to stay within URL length limits.
- The `current_user` parameter is important for signers that manage multiple accounts.
- The spec recommends NIP-46 (Nostr Connect) for better web experiences, since URL-scheme-based communication has inherent limitations.
- The `id` extra in intents helps the client correlate requests and responses.
- Signer apps should implement a permission model allowing users to grant blanket permissions per client app per operation type.

## Client Behavior

- Clients MUST check for signer availability before attempting to use NIP-55.
- Clients SHOULD use Intents for first-time operations and Content Resolvers for subsequent authorized operations.
- Clients MUST store the signer's package name after initial connection for directing subsequent intents.
- Clients SHOULD handle the case where the signer is not installed gracefully (offer alternative key management).
- Clients SHOULD use the `current_user` parameter when the signer manages multiple accounts.
- Web clients SHOULD prefer NIP-46 over NIP-55 URL schemes when possible.
- Web clients MAY use gzip compression for large payloads.

## Relay Behavior

- Relays have no special behavior for NIP-55. This is entirely a client-side Android protocol.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (event structure)
- [NIP-04](../nip-04.md) -- Encrypted Direct Messages (for nip04 encrypt/decrypt operations)
- [NIP-44](../nip-44.md) -- Versioned Encryption (for nip44 encrypt/decrypt operations)
- Android SDK -- Intents, Content Resolvers, URI schemes

## Source Code References

- **Amber (Android signer):** Reference implementation of NIP-55 signer -- https://github.com/greenart7c3/Amber
- **Amethyst (Android client):** Reference implementation of NIP-55 client integration
- **rust-nostr:** Android integration utilities via FFI bindings

## Related NIPs

- [NIP-07](./nip-07.md) -- Browser extension signing (web equivalent of NIP-55)
- [NIP-46](./nip-46.md) -- Nostr Remote Signing (platform-agnostic alternative; recommended for web)
- [NIP-04](../nip-04.md) -- Encrypted Direct Messages (encryption method supported)
- [NIP-44](../nip-44.md) -- Versioned Encryption (encryption method supported)
- [NIP-49](./nip-49.md) -- Private Key Encryption (complementary: encrypted key storage)
