# NIP-07: `window.nostr` Capability for Web Browsers

## Status
Active (draft, optional)

## Summary
NIP-07 defines a `window.nostr` JavaScript object that browser extensions (or browsers themselves) can inject into web pages. This object provides methods for Nostr clients running in the browser to request public keys, sign events, and perform encryption/decryption without ever exposing the user's private key to the web application.

## Motivation
Web-based Nostr clients need access to the user's keypair for signing events and decrypting messages. Storing private keys directly in a web app (e.g., in localStorage) is a significant security risk. NIP-07 solves this by defining a standard interface that browser extensions can implement, keeping the private key isolated in the extension while exposing only the necessary signing and encryption operations to web clients.

## Specification

### Event Kinds
No new event kinds are defined. This NIP defines a browser JavaScript API.

### Tags
No new tags are defined.

### Protocol Flow

1. A browser extension or the browser itself injects a `window.nostr` object into web pages.
2. A Nostr web client checks for the existence of `window.nostr`.
3. If available, the client calls methods on `window.nostr` to interact with the user's keys.
4. The extension may prompt the user for approval before performing operations (signing, decryption, etc.).
5. The extension returns results without ever exposing the raw private key to the web page.

### Required Methods

```javascript
// Returns the user's public key as a hex string
async window.nostr.getPublicKey(): string

// Takes an event object, adds `id`, `pubkey`, and `sig` fields, returns the signed event
async window.nostr.signEvent(event: {
  created_at: number,
  kind: number,
  tags: string[][],
  content: string
}): Event
```

### Optional Methods

```javascript
// NIP-04 encryption (DEPRECATED -- use NIP-44 instead)
async window.nostr.nip04.encrypt(pubkey, plaintext): string   // returns ciphertext+iv per NIP-04
async window.nostr.nip04.decrypt(pubkey, ciphertext): string  // decrypts ciphertext per NIP-04

// NIP-44 encryption (recommended)
async window.nostr.nip44.encrypt(pubkey, plaintext): string   // returns ciphertext per NIP-44
async window.nostr.nip44.decrypt(pubkey, ciphertext): string  // decrypts ciphertext per NIP-44
```

### JSON Examples

**Input event object passed to `signEvent`:**

```json
{
  "created_at": 1682327852,
  "kind": 1,
  "tags": [],
  "content": "Hello, Nostr!"
}
```

**Returned signed event from `signEvent`:**

```json
{
  "id": "a3e7...",
  "pubkey": "b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9",
  "created_at": 1682327852,
  "kind": 1,
  "tags": [],
  "content": "Hello, Nostr!",
  "sig": "f1a2b3..."
}
```

## Implementation Notes

- **Extension Manifest:** Chromium and Firefox extension authors should load their content scripts with `"run_at": "document_end"` in the extension's manifest to ensure `window.nostr` is available to Nostr clients on page load.
- The `signEvent` method receives an event without `id`, `pubkey`, or `sig` -- the extension computes and adds these fields.
- Extensions may implement permission models (per-site, per-kind, etc.) to control which web pages can access signing.
- NIP-04 methods are deprecated but still widely used. New implementations should prefer NIP-44.
- The `window.nostr` object must be injected into the page's main world (not the extension's content script world) so the web application can access it.

## Client Behavior

- Clients SHOULD check for `window.nostr` availability before attempting to use it.
- Clients SHOULD fall back gracefully if `window.nostr` is not available (e.g., offer manual key input or NIP-46 remote signing).
- Clients MUST NOT assume any optional methods exist; they should check for `window.nostr.nip04` and `window.nostr.nip44` before calling them.
- Clients SHOULD prefer `window.nostr.nip44` over `window.nostr.nip04` when both are available.
- Clients SHOULD NOT request the private key -- only use the provided methods.

## Relay Behavior

- Relays have no special behavior for NIP-07. This is entirely a client-side browser API.

## Dependencies

- [NIP-01](../nip-01.md) -- Basic protocol (event structure)
- [NIP-04](../nip-04.md) -- Encrypted Direct Messages (deprecated encryption scheme)
- [NIP-44](../nip-44.md) -- Versioned Encryption (recommended encryption scheme)

## Source Code References

- **nostr-tools (JS):** `nip07.ts` -- type definitions for `window.nostr`
- **Notable extensions:** nos2x, Alby, nostr-keyx, Flamingo
- **Reference list:** https://github.com/aljazceru/awesome-nostr#nip-07-browser-extensions

## Related NIPs

- [NIP-46](./nip-46.md) -- Nostr Remote Signing (alternative: remote signer instead of local extension)
- [NIP-55](./nip-55.md) -- Android Signer Application (analogous concept for Android)
- [NIP-04](../nip-04.md) -- Encrypted Direct Messages (deprecated; encryption methods exposed via window.nostr)
- [NIP-44](../nip-44.md) -- Versioned Encryption (recommended; encryption methods exposed via window.nostr)
