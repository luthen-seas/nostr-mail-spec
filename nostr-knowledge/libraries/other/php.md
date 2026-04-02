# PHP Nostr Libraries

## nostr-php (swentel/nostr-php)

The primary PHP library for the Nostr protocol, providing key management, event signing, and relay communication.

- **Repo:** [github.com/swentel/nostr-php](https://github.com/swentel/nostr-php) (also mirrored at [nostrver-se/nostr-php](https://github.com/nostrver-se/nostr-php))
- **Docs:** [nostr-php.dev](https://nostr-php.dev)
- **API Reference:** [phpdoc.nostr-php.dev](https://phpdoc.nostr-php.dev)
- **License:** MIT

### Installation

```bash
composer require swentel/nostr-php
```

### Supported NIPs

| NIP | Feature |
|-----|---------|
| 01 | Basic protocol flow (publish and request events) |
| 04 | Encrypted direct messages |
| 05 | DNS-based identity mapping (NIP-05 verification) |
| 17 | Private direct messages |
| 19 | Bech32-encoded identifiers (npub, nsec, note, nprofile, nevent) |
| 24 | Extra metadata fields and tags |
| 42 | Relay authentication |
| 44 | Encrypted payloads (versioned) |
| 65 | Relay list metadata |

**Planned:** Multi-threading, NIP-29 (groups), NIP-46 (remote signing), NIP-50 (search).

### Key Generation

```php
use swentel\nostr\Key\Key;

$key = new Key();

// Generate a new private key
$privateKey = $key->generatePrivateKey();

// Derive the public key
$publicKey = $key->getPublicKey($privateKey);

// Convert to bech32
$npub = $key->convertPublicKeyToBech32($publicKey);
$nsec = $key->convertPrivateKeyToBech32($privateKey);

echo "npub: $npub\n";
echo "nsec: $nsec\n";
```

### Event Creation and Signing

```php
use swentel\nostr\Event\Event;
use swentel\nostr\Sign\Sign;

// Create a text note (kind 1)
$note = new Event();
$note->setContent('Hello Nostr from PHP!');
$note->setKind(1);
$note->setTags([
    ['t', 'nostr'],
    ['t', 'php'],
]);

// Sign the event
$signer = new Sign();
$signer->signEvent($note, $privateKey);

echo "Event ID: " . $note->getId() . "\n";
echo "Signature: " . $note->getSig() . "\n";
```

### Publishing to a Relay

```php
use swentel\nostr\Relay\Relay;
use swentel\nostr\Message\EventMessage;

$eventMessage = new EventMessage($note);

$relay = new Relay('wss://relay.damus.io');
$relay->setMessage($eventMessage);
$result = $relay->send();

if ($result->isSuccess()) {
    echo "Event published successfully.\n";
} else {
    echo "Error: " . $result->getMessage() . "\n";
}
```

### Publishing to Multiple Relays

```php
use swentel\nostr\Relay\RelaySet;

$relaySet = new RelaySet();
$relaySet->setRelays([
    new Relay('wss://relay.damus.io'),
    new Relay('wss://nos.lol'),
    new Relay('wss://relay.nostr.band'),
]);
$relaySet->setMessage($eventMessage);
$results = $relaySet->send();

foreach ($results as $relayUrl => $result) {
    echo "$relayUrl: " . ($result->isSuccess() ? 'OK' : $result->getMessage()) . "\n";
}
```

### Reading Events from a Relay

```php
use swentel\nostr\Filter\Filter;
use swentel\nostr\Message\RequestMessage;
use swentel\nostr\Request\Request;
use swentel\nostr\Relay\Relay;

$filter = new Filter();
$filter->setKinds([1]);           // Text notes
$filter->setLimit(25);            // Last 25 events
// $filter->setAuthors(['hex_pubkey_here']);
// $filter->setSince(time() - 3600);  // Last hour

$subscriptionId = bin2hex(random_bytes(16));
$requestMessage = new RequestMessage($subscriptionId, [$filter]);

$relay = new Relay('wss://relay.damus.io');
$request = new Request($relay, $requestMessage);
$response = $request->send();

foreach ($response as $event) {
    echo "Author: " . $event['pubkey'] . "\n";
    echo "Content: " . $event['content'] . "\n";
    echo "---\n";
}
```

### NIP-05 Verification

```php
use swentel\nostr\Nip05\Nip05;

$nip05 = new Nip05();
$result = $nip05->verify('user@example.com', $expectedPubkeyHex);

if ($result) {
    echo "NIP-05 identity verified.\n";
}
```

### Encrypted Messages (NIP-44)

```php
use swentel\nostr\Encryption\Nip44;

$nip44 = new Nip44();

// Encrypt
$encrypted = $nip44->encrypt($plaintext, $senderPrivkey, $recipientPubkey);

// Decrypt
$decrypted = $nip44->decrypt($encrypted, $recipientPrivkey, $senderPubkey);
```

### Use Cases

nostr-php is well-suited for:

- **Server-side Nostr bots** that listen for events and auto-reply
- **Web applications** that publish events on behalf of users
- **WordPress/CMS plugins** cross-posting content to Nostr
- **API backends** serving Nostr data to frontend clients
- **Cron jobs** for periodic Nostr publishing or monitoring
