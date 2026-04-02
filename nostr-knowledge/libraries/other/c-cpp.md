# C/C++ Nostr Libraries

## Overview

| Library | Language | Focus | License | Repo |
|---------|----------|-------|---------|------|
| noscrypt | C90 | Cryptography (NIP-01, NIP-44) | LGPL-2.1+ | [vnuge/noscrypt](https://github.com/vnuge/noscrypt) |
| arduino-nostr | C++ | Arduino/ESP32 relay interaction | MIT | [lnbits/arduino-nostr](https://github.com/lnbits/arduino-nostr) |
| nostrduino | C++ | Arduino with NWC support | MIT | [riccardobl/nostrduino](https://github.com/riccardobl/nostrduino) |

---

## noscrypt (vnuge/noscrypt)

A portable C90 cryptography library purpose-built for Nostr operations. Focuses exclusively on the cryptographic primitives needed by Nostr clients and relays -- key operations, signing, verification, and NIP-44 encryption.

- **Repo:** [github.com/vnuge/noscrypt](https://github.com/vnuge/noscrypt)
- **License:** LGPL-2.1-or-later

### Design Philosophy

noscrypt is not a full Nostr client library. It provides only the cryptographic layer:

- No dynamic memory allocation in core library
- Fixed-time comparison for all sensitive operations
- Automatic stack zeroing before function return
- Valgrind memory leak detection in CI
- 100% test pass requirement

### Supported NIPs

| NIP | Coverage |
|-----|----------|
| NIP-01 | Key validation, public key derivation, signing, verification |
| NIP-44 | Encryption, decryption, MAC computation/verification |
| NIP-04 | Planned |

### Platform Support

| Platform | Crypto Backends | Status |
|----------|----------------|--------|
| Windows | OpenSSL 3.0+, Mbed-TLS, BCrypt | Tested |
| Linux | OpenSSL 3.0+, Mbed-TLS | Tested |
| FreeBSD | OpenSSL 3.0+, Mbed-TLS | Untested |

### Installation

**Prerequisites:** CMake, [Taskfile.dev](https://taskfile.dev/), a supported C compiler.

```bash
# Download and build
mkdir noscrypt && cd noscrypt
wget https://www.vaughnnugent.com/public/resources/software/builds/noscrypt/<version>/noscrypt-src.tgz
tar -xzf noscrypt-src.tgz
task          # Build
sudo task install  # Install system-wide
```

Or build from source:

```bash
git clone https://github.com/vnuge/noscrypt.git
cd noscrypt
mkdir build && cd build
cmake ..
make
sudo make install
```

### API Reference

```c
#include <noscrypt.h>

// Initialize library context
NCContext* ctx;
NCInitContext(&ctx);

// --- Key Operations ---

// Validate a secret key (32 bytes)
NCResult result = NCValidateSecretKey(ctx, secretKey);

// Derive public key from secret key
uint8_t publicKey[32];
NCGetPublicKey(ctx, secretKey, publicKey);

// --- Signing and Verification ---

// Sign data with secret key (BIP-340 Schnorr)
uint8_t signature[64];
NCSignData(ctx, secretKey, random32, data, dataLen, signature);

// Verify a signature
NCResult valid = NCVerifyData(ctx, publicKey, data, dataLen, signature);

// --- NIP-44 Encryption ---

// Encrypt plaintext
NCEncryptionArgs encArgs = {
    .version = NC_ENC_VERSION_NIP44,
    .nonce32 = nonce,
    .inputData = plaintext,
    .inputDataLen = plaintextLen,
    .outputData = ciphertext,
    .outputDataLen = &ciphertextLen
};
NCEncrypt(ctx, secretKey, recipientPubKey, &encArgs);

// Decrypt ciphertext
NCDecryptionArgs decArgs = { /* ... */ };
NCDecrypt(ctx, secretKey, senderPubKey, &decArgs);

// --- MAC Operations ---

// Compute MAC for NIP-44
uint8_t mac[32];
NCComputeMac(ctx, secretKey, recipientPubKey, nonce, ciphertext, ciphertextLen, mac);

// Verify MAC
NCResult macValid = NCVerifyMac(ctx, secretKey, senderPubKey, nonce, ciphertext, ciphertextLen, mac);

// --- Cleanup ---
NCDestroyContext(ctx);
```

### Testing

```bash
# Build and run tests
task test
# Includes NIP-44 official test vector validation
```

### Use Cases

- Embedding Nostr crypto in C/C++ applications
- Building custom relays with native performance
- IoT devices needing Nostr signing capability
- Language bindings (noscrypt has C# interop tests)

---

## arduino-nostr (lnbits/arduino-nostr)

A Nostr library for Arduino microcontrollers, primarily targeting ESP32 boards. Enables IoT devices to publish and subscribe to Nostr events.

- **Repo:** [github.com/lnbits/arduino-nostr](https://github.com/lnbits/arduino-nostr)
- **Arduino Library:** [arduinolibraries.info/libraries/nostr](https://www.arduinolibraries.info/libraries/nostr)
- **License:** MIT

### Components

| Class | Purpose |
|-------|---------|
| `NostrEvent` | Create NIP-01 and NIP-04 events |
| `NostrRelayManager` | Manage connections to multiple relays |
| `NostrQueueProcessor` | Queue messages for asynchronous relay delivery |
| `NostrRequestOptions` | Build REQ messages for subscriptions |

### Features

- Broadcast to multiple relays with custom callbacks
- Queue messages for delivery when relays connect
- Subscribe to relay events via REQ messages
- Specify minimum relay count and broadcast timeouts
- NIP-01 (text notes) and NIP-04 (encrypted DMs)

### Installation

Install via the Arduino Library Manager by searching for "Nostr", or download from the GitHub releases.

### Usage

```cpp
#include <NostrEvent.h>
#include <NostrRelayManager.h>
#include <NostrQueueProcessor.h>

NostrEvent nostrEvent;
NostrRelayManager relayManager;
NostrQueueProcessor queueProcessor;

const char* privateKey = "hex_private_key";
const char* publicKey  = "hex_public_key";

// Relay list
const char* relays[] = {
    "relay.damus.io",
    "nos.lol"
};

void setup() {
    Serial.begin(115200);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) delay(500);

    // Set up relay manager callbacks
    relayManager.setMinRelaysAndTimeout(1, 10000);

    // Connect to relays
    for (int i = 0; i < 2; i++) {
        relayManager.addRelay(relays[i]);
    }
    relayManager.connect();
}

void loop() {
    relayManager.loop();
    queueProcessor.loop();

    // Create and publish a text note
    String noteContent = "Temperature: " + String(readSensor()) + "C";
    String signedEvent = nostrEvent.getSignedEvent(
        privateKey,
        publicKey,
        noteContent,
        1  // kind 1 = text note
    );

    // Queue for broadcasting
    queueProcessor.enqueue(signedEvent);

    delay(60000);  // Publish every minute
}

// Callback for received events
void onEvent(const char* payload) {
    Serial.println("Received event:");
    Serial.println(payload);
}
```

### Supported Boards

- **ESP32** (primary target, tested)
- Other Arduino-compatible boards with WiFi capability may work but are untested

### Use Cases

- IoT sensor data publishing to Nostr
- Physical Nostr signing devices
- Nostr-connected hardware buttons/displays
- Mesh networking (NostrMesh project uses ESP32 mesh)

---

## nostrduino (riccardobl/nostrduino)

A fork/rewrite of arduino-nostr with expanded features including Nostr Wallet Connect (NWC) support.

- **Repo:** [github.com/riccardobl/nostrduino](https://github.com/riccardobl/nostrduino)
- **License:** MIT
- **Boards:** ESP32 (out of the box)

### Additional Features over arduino-nostr

- Nostr Wallet Connect (NWC) support
- Redesigned API inspired by nostr-tools
- Expanded event type support

---

## Choosing a Library

| Scenario | Recommended |
|----------|-------------|
| Nostr cryptography in a C/C++ application | noscrypt |
| NIP-44 encryption implementation | noscrypt |
| ESP32/Arduino Nostr publishing | arduino-nostr or nostrduino |
| IoT with NWC (Lightning payments) | nostrduino |
| Building a high-performance relay in C | noscrypt (crypto) + custom relay logic |
