# nos2x -- NIP-07 Browser Extension Signer

- **Repository**: https://github.com/fiatjaf/nos2x
- **Platform**: Chrome / Chromium browsers
- **NIP**: NIP-07
- **Firefox alternative**: [nos2x-fox](https://github.com/nicholasgasior/nos2x-fox)
- **License**: Public domain

---

## What It Is

nos2x (pronounced "nostr signer extension") is a Chrome browser extension that provides a `window.nostr` object to web pages. Web-based Nostr clients use this object to request signatures, public keys, and encryption/decryption without ever handling the user's private key directly.

It is the reference implementation of NIP-07.

---

## Installation

### Chrome Web Store

Install directly from the [Chrome Extension Store](https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblomihpgcdlhiodkdc).

### Manual / Development Build

```bash
git clone https://github.com/fiatjaf/nos2x.git
cd nos2x
yarn
yarn build
# Then in Chrome: Settings -> Extensions -> Developer Mode -> Load Unpacked
# Select the `extension/` directory
```

---

## How NIP-07 `window.nostr` Works

When nos2x is installed, it injects a `window.nostr` object into every web page. Nostr web clients detect this object and use it instead of asking users to paste their nsec.

### Supported Methods

```javascript
// Get the user's public key (hex)
const pubkey = await window.nostr.getPublicKey();

// Sign an event (returns the event with id and sig fields populated)
const signedEvent = await window.nostr.signEvent(unsignedEvent);

// NIP-04: Encrypt a message to a recipient
const ciphertext = await window.nostr.nip04.encrypt(recipientPubkey, plaintext);

// NIP-04: Decrypt a message from a sender
const plaintext = await window.nostr.nip04.decrypt(senderPubkey, ciphertext);

// NIP-44: Encrypt (versioned encryption, preferred over NIP-04)
const ciphertext = await window.nostr.nip44.encrypt(recipientPubkey, plaintext);

// NIP-44: Decrypt
const plaintext = await window.nostr.nip44.decrypt(senderPubkey, ciphertext);
```

### Typical Client Integration

```javascript
// Check if a NIP-07 signer is available
if (window.nostr) {
  const pubkey = await window.nostr.getPublicKey();
  console.log("Logged in as:", pubkey);

  // Create and sign an event
  const event = {
    kind: 1,
    content: "Hello from my app!",
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await window.nostr.signEvent(event);
  // signed now has .id, .pubkey, and .sig -- ready to send to a relay
} else {
  console.log("No NIP-07 signer found. Ask user to install nos2x.");
}
```

---

## Security Model

**What nos2x protects:**
- The private key (nsec) is stored only inside the extension. Web pages never see it.
- Each signing request triggers a user confirmation popup (unless the user has chosen to always allow for that domain).

**What nos2x does NOT protect against:**
- A compromised browser or malicious extension could read memory.
- If the user clicks "always allow" for a malicious site, that site can sign arbitrary events.
- The extension has access to the raw nsec in memory -- it is not a hardware-level isolation.

**Permission model:**
- On first use with a new site, nos2x prompts the user to allow or deny.
- Users can configure per-site permissions (allow, deny, always allow).
- The extension options page allows managing stored keys and permissions.

**Best practices for users:**
- Do not use "always allow" for untrusted sites.
- Consider nos2x suitable for hot keys (daily use), not for high-value keys.
- For stronger isolation, use NIP-46 remote signing (nsec.app or Amber) where the key lives on a separate device entirely.

---

## Limitations

- Chromium-only (use nos2x-fox for Firefox).
- Single key at a time (no multi-account support in the standard version).
- No NIP-46 support -- it is a local signer only.
- Mobile browsers generally do not support extensions, so nos2x is desktop-only.

---

## See Also

- [NIP-07 Documentation](../../nips/identity/nip-07.md) -- the protocol specification nos2x implements
- [Amber](amber.md) -- Android equivalent using NIP-55
- [nsec.app](nsec-app.md) -- remote signing via NIP-46
- [nak](../nak.md) -- CLI tool that can also use bunker signing
