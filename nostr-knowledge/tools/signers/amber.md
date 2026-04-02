# Amber -- Android Nostr Signer

- **Repository**: https://github.com/greenart7c3/Amber
- **Platform**: Android
- **NIPs**: NIP-55 (Android Signer), NIP-46 (Nostr Connect / Remote Signing)
- **Distribution**: Zap Store, Obtainium, GitHub Releases, F-Droid

---

## What It Is

Amber is a dedicated Nostr event signer for Android. Its core design principle is that the private key (nsec) should exist in exactly one place -- Amber itself. Client applications (Amethyst, Primal, etc.) never touch the nsec. Instead, they ask Amber to sign events on their behalf through Android's intent system or content resolver.

This follows the security rationale from NIP-46: "Private keys should be exposed to as few systems as possible, as each system adds to the attack surface."

Amber also functions as a NIP-46 bunker, turning your Android phone into a remote signing device for clients on any platform -- no server infrastructure required.

---

## Installation

| Source | Link |
|--------|------|
| Zap Store | Available in Zap Store |
| Obtainium | Point at the GitHub releases URL |
| GitHub Releases | https://github.com/greenart7c3/Amber/releases |
| F-Droid | Available in F-Droid |

All releases are GPG-signed. Verify with:

```bash
# Import Amber's GPG key
gpg --keyserver keyserver.ubuntu.com --recv-keys 44F0AAEB77F373747E3D5444885822EED3A26A6D

# Verify the release
gpg --verify manifest.asc manifest.txt
sha256sum -c manifest.txt
```

---

## How NIP-55 Works

NIP-55 defines how Android applications communicate with a signer app like Amber. There are two approaches:

### Intent-Based Approach

The client app sends an Android intent to Amber, which handles the signing and returns the result.

```
Client App                           Amber
    |                                  |
    |-- Intent: SIGN_EVENT(event) ---->|
    |                                  |-- User approves (or auto-approves)
    |<-- Result: signed event ---------|
    |                                  |
```

**How it works in practice:**
1. The client app creates an unsigned event.
2. It sends an Android intent with the event data to Amber's package.
3. Amber shows the user what is being signed (or auto-signs if the user has granted blanket permission).
4. Amber signs the event with the nsec and returns the signed event via the intent result.

**Supported intent actions:**
- `SIGN_EVENT` -- sign a Nostr event
- `GET_PUBLIC_KEY` -- retrieve the public key
- `NIP04_ENCRYPT` / `NIP04_DECRYPT` -- NIP-04 encryption
- `NIP44_ENCRYPT` / `NIP44_DECRYPT` -- NIP-44 encryption
- `DECRYPT_ZAP_EVENT` -- decrypt zap-related events

### Content Resolver Approach

For background operations where launching an activity is impractical, Amber exposes a content resolver. Client apps query Amber's content provider directly.

**Advantages of the content resolver approach:**
- Works in background services and notifications.
- No UI interruption -- Amber can auto-sign based on remembered permissions.
- Faster for high-frequency operations.

**How it works:**
1. The client queries Amber's content provider URI.
2. Amber checks if the requesting app has stored permissions.
3. If permitted, Amber signs and returns the result immediately.
4. If not, Amber prompts the user.

---

## NIP-46 Bunker Mode

Amber can also act as a NIP-46 remote signer (bunker), allowing clients on other platforms to request signatures over Nostr relays.

```
Desktop Client                    Relay                     Amber (Phone)
    |                               |                           |
    |-- NIP-46 request ------------>|-------------------------->|
    |                               |                           |-- User approves
    |<-- NIP-46 response -----------|<--------------------------|
```

This means you can use a web client on your laptop and have it request signatures from Amber on your phone -- no nsec on the laptop at all.

---

## Security Model

**The nsec never leaves Amber.** This is the fundamental guarantee.

| Property | Detail |
|----------|--------|
| Key storage | nsec is stored only within Amber's Android app sandbox |
| Key exposure | No client app, web page, or relay ever receives the nsec |
| Signing approval | Per-app permissions with user review; can be set to auto-approve |
| Multi-account | Supports multiple Nostr accounts within one Amber instance |
| Build verification | Reproducible Docker builds; GPG-signed releases; certificate fingerprints for AppVerifier and F-Droid |
| Offline capable | Amber works offline for local signing (NIP-55) |

**What Amber protects against:**
- Compromised client apps -- they cannot extract the nsec.
- Key leakage through clipboard, logs, or network.
- Server-side breaches -- no server holds the key (unlike some NIP-46 setups).

**What Amber does NOT protect against:**
- A rooted/compromised Android device with access to Amber's app data.
- Physical access to an unlocked phone with Amber installed.
- Social engineering the user into approving malicious signing requests.

---

## Integration Guide for App Developers

### Intent-Based Integration (Kotlin)

```kotlin
// Request public key
val intent = Intent("com.greenart7c3.nostrsigner.GET_PUBLIC_KEY")
intent.`package` = "com.greenart7c3.nostrsigner"
startActivityForResult(intent, REQUEST_CODE_GET_PUBKEY)

// Sign an event
val intent = Intent("com.greenart7c3.nostrsigner.SIGN_EVENT")
intent.`package` = "com.greenart7c3.nostrsigner"
intent.putExtra("event", unsignedEventJson)
startActivityForResult(intent, REQUEST_CODE_SIGN)
```

### Content Resolver Integration

```kotlin
val uri = Uri.parse("content://com.greenart7c3.nostrsigner.SIGN_EVENT")
val cursor = contentResolver.query(uri, null, unsignedEventJson, null, null)
if (cursor != null && cursor.moveToFirst()) {
    val signedEvent = cursor.getString(0)
    cursor.close()
}
```

### Key Considerations

- Always check if Amber is installed before attempting to use it.
- Handle the case where the user denies signing.
- Use the content resolver for background operations.
- Store the user's pubkey locally after first retrieval to avoid repeated prompts.
- Respect per-event approval -- do not assume blanket permissions.

---

## See Also

- [NIP-55](../../nips/security/) -- the Android signer specification
- [NIP-46](../../nips/security/) -- Nostr Connect / remote signing protocol
- [nos2x](nos2x.md) -- browser equivalent using NIP-07
- [nsec.app](nsec-app.md) -- web-based remote signer
