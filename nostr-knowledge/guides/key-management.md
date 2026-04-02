# NOSTR Key Management and Security Guide

> Your keys are your identity. There is no password reset, no customer support, no account recovery. If you lose your private key, you lose your identity. If someone else gets your private key, they become you.

---

## Table of Contents

1. [Why Key Management Matters](#why-key-management-matters)
2. [Key Generation Best Practices](#key-generation-best-practices)
3. [Key Storage Options](#key-storage-options)
4. [Comparison Matrix](#comparison-matrix)
5. [Mnemonic Seed Backup (NIP-06)](#mnemonic-seed-backup-nip-06)
6. [Multi-Device Usage Patterns](#multi-device-usage-patterns)
7. [Key Rotation Limitations](#key-rotation-limitations)
8. [What to Do If Your Key Is Compromised](#what-to-do-if-your-key-is-compromised)
9. [Developer Responsibilities](#developer-responsibilities)

---

## Why Key Management Matters

NOSTR identity is a secp256k1 keypair. That is the entirety of it. There is no server-side account, no email address, no phone number. Your public key (`npub`) is your globally unique identity. Your private key (`nsec`) proves you are that identity.

This design has profound consequences:

- **No password reset.** If you lose your `nsec`, no one can restore it. Every event you ever published still exists on relays, but you can never publish as that identity again.
- **No account recovery.** There is no "forgot password" flow. There is no support email. There is no multi-factor fallback. The key is the identity.
- **Full impersonation on compromise.** If an attacker obtains your `nsec`, they can publish events as you, read your encrypted DMs, sign NIP-42 auth challenges as you, drain any NWC (NIP-47) wallet connections tied to that key, and update your profile metadata (kind 0) to redirect your followers.
- **Permanent damage.** Because NOSTR has no native key rotation protocol (see [Key Rotation Limitations](#key-rotation-limitations)), a compromised key cannot be "revoked" in any enforceable way. Events signed by the attacker are cryptographically indistinguishable from your own.

The security of your NOSTR identity is exactly the security of your private key storage.

---

## Key Generation Best Practices

### Entropy Requirements

A NOSTR private key is a 256-bit (32-byte) scalar on the secp256k1 curve. It must be generated from a cryptographically secure random number generator (CSPRNG).

**Acceptable entropy sources:**

| Source | Platform | Notes |
|--------|----------|-------|
| `crypto.getRandomValues()` | Browser (Web Crypto API) | The standard for web clients |
| `crypto.randomBytes()` | Node.js | Uses OpenSSL CSPRNG |
| `os.urandom()` | Python | Reads from `/dev/urandom` (Linux/macOS) or `CryptGenRandom` (Windows) |
| `getrandom()` | Rust (`rand` crate) | Kernel-level CSPRNG |
| `/dev/urandom` | Linux/macOS | Kernel entropy pool; suitable for key generation |
| `SecRandomCopyBytes` | iOS/macOS | Apple's CSPRNG |
| `java.security.SecureRandom` | Android/JVM | Uses `/dev/urandom` or hardware RNG on Android |

**Never use:**

- `Math.random()` (JavaScript) -- not cryptographically secure, predictable
- `random.random()` (Python) -- Mersenne Twister, fully predictable after observing 624 outputs
- Timestamp-based seeds -- trivially guessable
- User-typed "passwords" as raw key material -- insufficient entropy
- Online "vanity key" generators -- you have no guarantee the server did not retain your key

### Generation Procedure

```typescript
// Using nostr-tools (recommended for JS/TS)
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { nsecEncode, npubEncode } from 'nostr-tools/nip19'

const sk = generateSecretKey()  // Uint8Array(32) from crypto.getRandomValues
const pk = getPublicKey(sk)     // hex string

console.log('nsec:', nsecEncode(sk))
console.log('npub:', npubEncode(pk))

// CRITICAL: zero out sk when done
sk.fill(0)
```

### Verification After Generation

After generating a key, verify:

1. The private key is exactly 32 bytes.
2. The private key is not all zeros and not greater than or equal to the curve order `n`.
3. The derived public key is a valid point on secp256k1.
4. A test sign-and-verify round-trip succeeds.

---

## Key Storage Options

### 1. Raw `nsec` (Plaintext Private Key)

**Format:** `nsec1...` (bech32-encoded 32-byte private key per NIP-19)

**How it works:** The raw private key is stored directly -- in a text file, clipboard, environment variable, or application database -- with no encryption.

**Security level: DANGEROUS**

- Anyone who sees the string has full control of your identity.
- Clipboard contents are accessible to every application on your system.
- Text files are indexed by search, backed up to cloud, synced across devices.
- Browser localStorage is accessible to any JavaScript running on the same origin (XSS attack vector).

**When acceptable:**

- Throwaway/testing keys that hold no reputation or value.
- Brief display during initial generation for the user to copy once into a secure store.
- Never for long-term storage of a key you care about.

---

### 2. NIP-49 Encrypted `nsec` (`ncryptsec`)

**Format:** `ncryptsec1...` (bech32-encoded encrypted key)

**How it works:** The private key is encrypted with a user-chosen password using scrypt key derivation and XChaCha20-Poly1305 authenticated encryption. The result is a bech32 string that is visually distinct from a raw `nsec`. See the [NIP-49 breakdown](../nips/identity/nip-49.md) for the full specification.

**Security properties:**

- **Password-based protection.** The key is encrypted at rest. An attacker who obtains the `ncryptsec` string must also crack the password.
- **scrypt hardening.** The key derivation uses scrypt with configurable cost (LOG_N parameter). At LOG_N=20, each password guess costs ~1 GiB of memory and ~2 seconds, making brute force expensive.
- **Authenticated encryption.** XChaCha20-Poly1305 prevents tampering. The KEY_SECURITY_BYTE is included as authenticated associated data.
- **Non-deterministic.** Encrypting the same key with the same password produces different `ncryptsec` strings due to random salt and nonce.

**Workflow:**

1. Generate or import your `nsec`.
2. Choose a strong password (high entropy -- passphrase recommended).
3. Encrypt to `ncryptsec` using a NIP-49-compliant tool.
4. Store the `ncryptsec` string (password manager, paper backup, etc.).
5. When a client needs the key, enter the `ncryptsec` + password.
6. The client decrypts in memory, uses the key, then zeros it.

**Best for:** Long-term encrypted backup. Paper backups. Password manager storage. Transferring keys between devices over insecure channels.

**Limitations:**

- Security depends entirely on password strength. A weak password with a stolen `ncryptsec` is trivially cracked.
- The key is fully exposed in memory while the client is running.
- Never publish `ncryptsec` strings to relays -- attackers can amass them for offline cracking.

---

### 3. NIP-07 Browser Extensions

**Examples:** nos2x, Alby, nostr-keyx, Flamingo

**How it works:** A browser extension injects a `window.nostr` object into web pages. Web clients call `window.nostr.signEvent(event)` to get events signed and `window.nostr.nip44.encrypt()`/`decrypt()` for encryption, without ever seeing the private key. The extension holds the key in its isolated extension storage and may prompt the user for approval on each operation. See the [NIP-07 breakdown](../nips/identity/nip-07.md).

**Security properties:**

- **Key isolation.** The private key stays in the extension's sandboxed storage. Web applications cannot access it through the `window.nostr` API.
- **Per-operation approval.** Extensions can prompt before each signing operation, giving users visibility into what they are authorizing.
- **Per-site permissions.** Extensions can restrict which origins can request signing.
- **No key transmission.** The key never crosses the extension boundary.

**Threat model:**

- **Protected against:** XSS attacks on the web client, malicious web apps requesting key export, accidental key exposure in client code.
- **Vulnerable to:** Malicious browser extensions with broad permissions, browser zero-day exploits, physical access to the unlocked browser, extension storage extraction if disk is unencrypted.

**Best for:** Web-based NOSTR clients (Snort, Coracle, Nostrudel, etc.). Daily use where convenience matters.

**Limitations:**

- Desktop/laptop only (browser extensions do not exist on mobile browsers in most cases).
- Trust is placed in the extension developer -- a compromised extension update could exfiltrate keys.
- The key is still "hot" -- it exists in memory on a general-purpose computer.

---

### 4. NIP-46 Remote Signers (Nostr Connect / Bunker)

**Examples:** nsec.app, nsecBunker, Amber (also supports NIP-46)

**How it works:** The private key lives on a separate device or server (the "remote signer" or "bunker"). The client and signer communicate through encrypted NOSTR events (kind 24133, encrypted with NIP-44). When the client needs to sign an event, it sends a request over the relay; the signer signs it and sends back the signature. The client never sees the private key. See the [NIP-46 breakdown](../nips/identity/nip-46.md).

**Connection methods:**

- **`bunker://` URI:** The signer provides a connection string. The user pastes it into the client.
- **`nostrconnect://` URI:** The client generates a QR code. The user scans it with their signer app.

**Security properties:**

- **Key never leaves the signer.** The client only receives signatures and encrypted/decrypted content.
- **Device separation.** If the client device is compromised, the attacker cannot extract the key (they can only request signatures while the session is active).
- **Permission scoping.** Signers can restrict which operations and event kinds a client is allowed to request.
- **Session-based.** Connections can be revoked by the signer at any time.
- **Multi-client support.** One signer can serve multiple clients simultaneously.

**Threat model:**

- **Protected against:** Client-side compromises (XSS, malware on the client device), key extraction from the client.
- **Vulnerable to:** Compromise of the signer device/server itself, relay-level MITM (mitigated by NIP-44 encryption), session hijacking if the client keypair is stolen.

**Best for:** High-security setups. Organizational key custody. Using NOSTR across many clients without exposing the key to any of them.

**Limitations:**

- Requires network connectivity between client and signer (via relays).
- Adds latency to signing operations (relay round-trip).
- More complex setup than local key storage.
- The signer device itself becomes the critical security asset.

---

### 5. NIP-55 Android Signers

**Examples:** Amber

**How it works:** On Android, a dedicated signer app holds the private key and exposes signing, encryption, and decryption operations via Android Intents (for interactive use) and Content Resolvers (for background/automated use). Client apps send requests through standard Android inter-process communication. The key never leaves the signer app's process. See the [NIP-55 breakdown](../nips/identity/nip-55.md).

**Security properties:**

- **OS-level process isolation.** Android's sandboxing prevents other apps from accessing the signer's memory or storage.
- **Permission gating.** Users explicitly approve operations via Intent prompts. Repeat permissions can be granted for silent background signing.
- **No network dependency.** Unlike NIP-46, NIP-55 operates entirely on-device via IPC. No relay round-trip needed.

**Best for:** Android users who want NIP-07-like convenience with stronger isolation than a browser extension.

**Limitations:**

- Android only. No equivalent exists for iOS (yet).
- Web apps in Android browsers can use NIP-55 via URL schemes, but the UX is less smooth than native apps.
- Still depends on the security of the Android device itself.

---

### 6. Hardware Wallets and YubiKeys

**How it works:** The private key is generated and stored on a dedicated hardware device (hardware wallet like Ledger/Trezor, or a security key like YubiKey). Signing operations happen on the device; the key never leaves the secure element. The device communicates with the client via USB, NFC, or Bluetooth.

**Security properties:**

- **Strongest key isolation.** The key exists only in tamper-resistant hardware. It cannot be extracted by software.
- **Air-gapped operation.** Some hardware wallets can operate fully offline.
- **Physical confirmation.** Operations require physical button presses, preventing remote exploitation.

**Current status in NOSTR:**

- Native hardware wallet support for NOSTR signing is still emerging. Some hardware wallets support secp256k1 signing (since it is the same curve as Bitcoin), but NOSTR-specific integration (Schnorr signing per BIP-340, NIP-44 encryption) varies.
- A hardware wallet can be combined with NIP-46: the remote signer runs on a computer connected to the hardware wallet, using it for all cryptographic operations.
- YubiKey support for secp256k1 is possible via PIV or OpenPGP applets with custom tooling.

**Best for:** Maximum security for high-value identities. Defense against software-level attacks.

**Limitations:**

- Limited ecosystem support. Few NOSTR clients natively support hardware signing today.
- Slower UX -- each operation requires physical interaction with the device.
- NIP-44 encryption/decryption support on hardware is not widely implemented.
- Risk of loss: if the hardware device is lost and no backup exists, the key is gone.

---

### 7. OS Keychain / Secure Enclave

**How it works:** The operating system provides a secure key storage facility:

| Platform | Facility | Isolation |
|----------|----------|-----------|
| macOS | Keychain Services / Secure Enclave | Hardware-backed on Apple Silicon; encrypted at rest, per-app access control |
| iOS | Keychain Services / Secure Enclave | Hardware-backed; keys can be marked non-exportable |
| Android | Android KeyStore / StrongBox | Hardware-backed on devices with secure element; key material never enters app process |
| Windows | DPAPI / Windows Credential Manager | Encrypted with user credentials; no hardware isolation on most devices |
| Linux | libsecret / GNOME Keyring / KDE Wallet | Encrypted at rest, unlocked on login; no hardware isolation |

**Security properties:**

- **Encrypted at rest.** Keys are encrypted on disk and only accessible after user authentication (biometrics, PIN, password).
- **Per-app access control.** On mobile platforms, each app can only access keys it created.
- **Hardware backing (when available).** On Apple Silicon, modern Android devices, and TPM-equipped PCs, keys can be stored in a secure element that resists even root-level software attacks.

**Best for:** Native NOSTR client apps (Damus on iOS, Amethyst on Android) that need persistent key storage with platform-level security.

**Limitations:**

- Not portable across platforms. A key in macOS Keychain cannot be directly transferred to Android KeyStore.
- Backup depends on platform mechanisms (iCloud Keychain, Google Backup). This may create unwanted cloud copies.
- Applications must be carefully written to use non-exportable key storage correctly.

---

## Comparison Matrix

| Storage Method | Key Exposure | Security Level | Convenience | Works Offline | Multi-Platform | Setup Complexity |
|---|---|---|---|---|---|---|
| Raw `nsec` | Full exposure | Very Low | Very High | Yes | Yes | None |
| NIP-49 `ncryptsec` | Exposed when decrypted | Medium | Medium | Yes | Yes | Low |
| NIP-07 Extension | Isolated in extension | Medium-High | High | Yes | Desktop browsers | Low |
| NIP-46 Remote Signer | Never on client | High | Medium | No | Yes | Medium |
| NIP-55 Android Signer | Isolated in signer app | High | High | Yes | Android only | Low |
| Hardware Wallet | Never in software | Very High | Low | Yes | Limited | High |
| OS Keychain | Isolated in OS | Medium-High | High | Yes | Per-platform | Low |

**Recommended approach by use case:**

| Use Case | Recommended Storage |
|----------|-------------------|
| Throwaway testing key | Raw `nsec` |
| Personal daily use (web) | NIP-07 extension + NIP-49 backup |
| Personal daily use (Android) | NIP-55 (Amber) + NIP-49 backup |
| Personal daily use (iOS) | OS Keychain (Damus) + NIP-06 mnemonic backup |
| High-security identity | NIP-46 remote signer + hardware wallet + NIP-06 mnemonic in secure cold storage |
| Organization / shared identity | NIP-46 bunker with access controls + hardware-backed key on the signer |

---

## Mnemonic Seed Backup (NIP-06)

NIP-06 specifies how to derive NOSTR keypairs from BIP-39 mnemonic seed phrases. This is the most human-friendly backup mechanism. See the [NIP-06 breakdown](../nips/identity/nip-06.md).

### How It Works

1. **Generate** a BIP-39 mnemonic (12 or 24 words) with proper entropy (128 or 256 bits).
2. **Derive** the NOSTR private key using BIP-32 hierarchical derivation at path `m/44'/1237'/0'/0/0`.
3. The derived key is a standard secp256k1 private key usable as a NOSTR identity.

### Generation

```typescript
import { generateSeedWords, privateKeyFromSeedWords } from 'nostr-tools/nip06'
import { getPublicKey } from 'nostr-tools/pure'

const mnemonic = generateSeedWords()  // 12-word BIP-39 mnemonic
const sk = privateKeyFromSeedWords(mnemonic)  // hex private key
const pk = getPublicKey(sk)

console.log('Mnemonic:', mnemonic)
console.log('Public key:', pk)
```

### Storage Best Practices

- **Write it down on paper.** Not on a computer, not in a screenshot, not in a notes app.
- **Use metal backup** (e.g., stamped steel plates) for fire/water resistance.
- **Store in a physically secure location** (safe, safety deposit box).
- **Never store digitally** unless encrypted (e.g., in a NIP-49 `ncryptsec` form, or in an encrypted volume).
- **Never share.** Anyone with the mnemonic can derive your private key.
- **Test recovery** before relying on the backup. Generate the key from the mnemonic in a separate tool and verify the derived `npub` matches.

### Recovery

```typescript
import { privateKeyFromSeedWords } from 'nostr-tools/nip06'

const mnemonic = 'leader monkey parrot ring guide accident before fence cannon height naive bean'
const sk = privateKeyFromSeedWords(mnemonic)
// sk = '7f7ff03d123792d6ac594bfa67bf6d0c0ab55b6b1fdb6249303fe861f1ccba9a'
```

### Advanced: Multiple Keys from One Seed

NIP-06 supports deriving multiple keypairs by incrementing the account index:

- `m/44'/1237'/0'/0/0` -- primary identity
- `m/44'/1237'/1'/0/0` -- secondary identity (bot, alt account)
- `m/44'/1237'/2'/0/0` -- tertiary identity

```typescript
import { accountFromSeedWords } from 'nostr-tools/nip06'

const sk0 = accountFromSeedWords(mnemonic, 0)  // Primary
const sk1 = accountFromSeedWords(mnemonic, 1)  // Secondary
```

---

## Multi-Device Usage Patterns

Using the same NOSTR identity across multiple devices is common and presents specific security challenges.

### Pattern 1: Key Copied to Each Device

The `nsec` or `ncryptsec` is imported into each device's client independently.

- **Risk:** Each device holding the key is an attack surface. A compromise of any device compromises the identity.
- **Mitigation:** Use NIP-49 for transfer. Use OS keychain storage on each device. Minimize the number of devices.

### Pattern 2: NIP-07 Extension + NIP-55 Signer

Use a browser extension on desktop and an Android signer on mobile. Both hold a copy of the key but in isolated storage.

- **Risk:** Same as Pattern 1 but with better per-device isolation.
- **Benefit:** Keys are isolated from web/app code on both platforms.

### Pattern 3: NIP-46 Remote Signer (Recommended for High Security)

The key exists only on a single dedicated signer device/server. All other devices connect via NIP-46.

- **Risk:** Single point of failure (the signer). Network dependency.
- **Benefit:** Only one device to secure. Compromise of any client device does not expose the key.
- **Recommendation:** Run the signer on a dedicated device (old phone, Raspberry Pi) with minimal attack surface.

### Pattern 4: NIP-06 Mnemonic as Cold Root

Generate the key from a mnemonic. Import the derived key into hot clients. Keep the mnemonic in cold storage.

- **Risk:** Hot clients still hold the derived key.
- **Benefit:** If all devices are lost, the mnemonic restores the identity.
- **Recommendation:** Combine with NIP-46 for best of both worlds.

---

## Key Rotation Limitations

**NOSTR has no native key rotation mechanism.** This is a fundamental design trade-off that every user and developer must understand.

### What "No Key Rotation" Means

- There is no protocol-level message that says "public key A is now replaced by public key B."
- There is no on-chain revocation list. There is no certificate authority. There is no key expiry field in events.
- If you generate a new keypair, it is a completely new identity. Your old followers, your old reputation, your old NIP-05 verification -- none of these automatically transfer.

### Implications

1. **A compromised key is compromised forever.** Even if you move to a new key, the attacker can still publish events under the old key. Relays and clients have no way to know the old key is compromised.
2. **Identity migration is manual and lossy.** To "rotate" keys, you must:
   - Generate a new keypair.
   - Publish a kind 0 (metadata) event on the OLD key recommending migration (convention, not enforced).
   - Re-establish NIP-05 verification on the new key.
   - Ask followers to re-follow the new key.
   - Accept that old events remain associated with the old key.
3. **Social graph fragmentation.** Followers of the old key may never see the migration notice. Your identity is split.

### Community Approaches (Not Protocol-Enforced)

- **NIP-05 as migration signal.** Update your NIP-05 domain to point to the new pubkey. Users who verify via NIP-05 will discover the change. But NIP-05 is optional and centralized (relies on a web server).
- **Kind 0 migration notice.** Publish a final metadata event on the old key with a message like "Migrated to npub1..." in the `about` field. This is purely advisory.
- **Relay-level key linking.** Some relays or clients may implement custom logic to honor migration events. This is not standardized.

### Takeaway

Because rotation is so costly, **invest heavily in key protection from the start.** The best time to secure your key is when you generate it, not after it is compromised.

---

## What to Do If Your Key Is Compromised

If you suspect your `nsec` has been exposed:

### Immediate Actions

1. **Stop using the compromised key immediately.** Do not sign any more events with it.
2. **Publish a migration notice.** If the attacker has not yet changed your profile, publish a kind 0 event on the old key directing people to your new identity.
3. **Generate a new keypair** using proper entropy.
4. **Update your NIP-05** to point to the new pubkey.
5. **Notify your contacts** through out-of-band channels (Signal, email, in-person). Do not rely solely on NOSTR -- the attacker may publish competing messages.
6. **Revoke NWC connections.** If you had NIP-47 (Nostr Wallet Connect) sessions tied to the compromised key, revoke them in your wallet immediately to prevent fund theft.
7. **Alert relevant relays.** Some relay operators may be willing to delete events from the compromised key upon verification of the compromise.

### Long-Term Recovery

1. **Re-establish your social graph.** Publish a new follow list (kind 3) on the new key. Ask followers to follow the new key.
2. **Re-create profile metadata.** Publish kind 0 with your name, avatar, bio, and NIP-05 on the new key.
3. **Update external references.** Website links, DNS records, social media bios.
4. **Strengthen security.** Move to a more secure key storage method (NIP-46, hardware wallet).
5. **Assess the damage.** Check what the attacker published under your old key. Alert contacts if the attacker sent malicious DMs or published harmful content.

---

## Developer Responsibilities

If you are building a NOSTR client, library, or tool, you have a duty of care to your users' keys.

### Never Log Private Keys

```typescript
// NEVER DO THIS
console.log('User nsec:', nsec)
logger.info({ privateKey: sk })
Sentry.captureMessage(`Key: ${nsecEncode(sk)}`)

// CORRECT: log only public information
console.log('User npub:', npubEncode(pk))
```

Private keys must never appear in:
- Application logs (any log level)
- Error reporting services (Sentry, Bugsnag, etc.)
- Analytics events
- Network requests (except to the user's own signer)
- Browser console output
- Crash dumps

### Memory Zeroing

After using a private key, overwrite the memory:

```typescript
// TypeScript / JavaScript
function zeroOut(arr: Uint8Array): void {
  arr.fill(0)
}

const sk = generateSecretKey()
try {
  const sig = signEvent(event, sk)
  // ... use sig
} finally {
  zeroOut(sk)  // zero the key regardless of success/failure
}
```

```rust
// Rust -- use zeroize crate
use zeroize::Zeroize;

let mut sk: [u8; 32] = generate_secret_key();
let sig = sign_event(&event, &sk);
sk.zeroize();  // overwrites memory
```

**Caveats:**
- JavaScript garbage collection may copy values before zeroing. This is a known limitation. Zeroing is still better than not zeroing.
- In Rust, use the `zeroize` crate to prevent compiler optimizations from eliding the zeroing.
- In C, use `explicit_bzero()` or `SecureZeroMemory()` -- plain `memset` may be optimized away.

### Secure Transport

- Never transmit raw `nsec` over unencrypted channels.
- If a client must receive a key from the user (e.g., import flow), do so over HTTPS only.
- Prefer NIP-46 remote signing over key import whenever possible.
- If you must accept `nsec` input, immediately encrypt it (NIP-49) or store it in the OS keychain. Do not hold it in plaintext in application state longer than necessary.

### Input Validation

- Detect when a user pastes an `nsec` into a public content field and warn them before publishing.
- Detect when a user pastes an `ncryptsec` into a field expecting an `nsec` and explain the difference.
- Validate key format and curve membership before use.

### Clipboard Hygiene

- If your application places an `nsec` on the clipboard (e.g., key export), offer to clear the clipboard after a timeout.
- On mobile, consider using platform-specific "sensitive content" clipboard APIs that prevent clipboard history recording.

### Storage Guidance for Client Developers

| Platform | Recommended Storage | Avoid |
|----------|-------------------|-------|
| Web (browser) | NIP-07 extension (do not store key at all) | localStorage, sessionStorage, cookies, IndexedDB |
| Desktop (Electron/Tauri) | OS keychain via native module | Config files, environment variables, plaintext database |
| iOS | Keychain Services with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | UserDefaults, plaintext files, Core Data |
| Android | Android KeyStore / NIP-55 (Amber) | SharedPreferences, plaintext files, SQLite |
| Server-side (bots) | NIP-49 encrypted + env-var password; or NIP-46 signer | Plaintext in config, environment variables without encryption, hardcoded in source |

---

## References

- [NIP-06: Basic Key Derivation from Mnemonic Seed Phrase](../nips/identity/nip-06.md)
- [NIP-07: window.nostr Capability for Web Browsers](../nips/identity/nip-07.md)
- [NIP-19: bech32 Entities (nsec, npub, ncryptsec)](../nips/core/nip-19.md)
- [NIP-42: Authentication of Clients to Relays](../nips/identity/nip-42.md)
- [NIP-46: Nostr Remote Signing (Bunker)](../nips/identity/nip-46.md)
- [NIP-49: Private Key Encryption (ncryptsec)](../nips/identity/nip-49.md)
- [NIP-55: Android Signer Application](../nips/identity/nip-55.md)
- [Protocol: Cryptography](../protocol/cryptography.md)
- [Protocol: Identity](../protocol/identity.md)

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions.*
