# pynostr Deep Dive

**Repository:** [github.com/holgern/pynostr](https://github.com/holgern/pynostr)
**PyPI:** `pip install pynostr`
**Python:** >= 3.7
**Crypto backend:** coincurve
**WebSocket layer:** Tornado

pynostr is the most actively maintained pure-Python NOSTR library. Originally forked from jeffthibault/python-nostr, it has since diverged substantially -- replacing secp256k1 with coincurve for cross-platform compatibility, adopting Tornado-based WebSockets, expanding NIP coverage, and restructuring the API.

---

## Table of Contents

1. [Installation and Setup](#installation-and-setup)
2. [Key Management](#key-management)
3. [Events](#events)
4. [Relay Communication](#relay-communication)
5. [Subscriptions and Filters](#subscriptions-and-filters)
6. [Encrypted Direct Messages (NIP-04)](#encrypted-direct-messages-nip-04)
7. [NIP-05 Verification](#nip-05-verification)
8. [NIP-19 Bech32 Encoding](#nip-19-bech32-encoding)
9. [NIP-13 Proof of Work](#nip-13-proof-of-work)
10. [NIP-26 Delegation](#nip-26-delegation)
11. [NIP-02 Contact Lists](#nip-02-contact-lists)
12. [NIP-65 Relay List Metadata](#nip-65-relay-list-metadata)
13. [NIP-56 Reporting](#nip-56-reporting)
14. [Error Handling](#error-handling)
15. [Async Patterns](#async-patterns)
16. [Differences from python-nostr](#differences-from-python-nostr)
17. [Complete NIP Support Table](#complete-nip-support-table)

---

## Installation and Setup

### Basic Installation

```bash
pip install pynostr
```

### With WebSocket Support

The WebSocket client is an optional dependency. For relay communication, install the websocket extras:

```bash
pip install pynostr[websocket-client]
```

### Android / Termux

On Termux, you need additional system packages before installing:

```bash
pkg update
pkg install build-essential
pkg install binutils
pkg install python-cryptography
pip install coincurve --no-binary all
pip install pynostr
```

### Development Setup

```bash
git clone https://github.com/holgern/pynostr.git
cd pynostr
pip install -e .
pip install -r test-requirements.txt
pytest
```

### Dependencies

Core dependencies:
- **coincurve**: Elliptic curve cryptography (secp256k1 via libsecp256k1)
- **cryptography**: For AES encryption (NIP-04)

Optional:
- **websocket-client**: For relay connections
- **tornado**: For async WebSocket handling

---

## Key Management

The `key` module (`pynostr/key.py`) provides `PrivateKey` and `PublicKey` classes for NOSTR identity management.

### Generating a New Key Pair

```python
from pynostr.key import PrivateKey

# Generate a random private key
private_key = PrivateKey()

# Access the corresponding public key
public_key = private_key.public_key

# Raw hex representations
print(f"Private key (hex): {private_key.hex()}")
print(f"Public key (hex):  {public_key.hex()}")

# Bech32 (NIP-19) representations
print(f"nsec: {private_key.bech32()}")
print(f"npub: {public_key.bech32()}")
```

### Importing Existing Keys

```python
from pynostr.key import PrivateKey, PublicKey

# From hex string
private_key = PrivateKey(bytes.fromhex("your_64_char_hex_private_key"))

# From bech32 (nsec)
private_key = PrivateKey.from_nsec("nsec1...")

# Public key from hex
public_key = PublicKey.from_hex("your_64_char_hex_public_key")
```

### Key Properties

```python
private_key = PrivateKey()

# The raw bytes
raw_bytes = private_key.raw_secret  # 32 bytes

# Hex-encoded string (used for signing)
hex_key = private_key.hex()  # 64-char hex string

# Public key is derived automatically
pub = private_key.public_key
pub_hex = pub.hex()
pub_bech32 = pub.bech32()  # "npub1..."
```

---

## Events

The `event` module (`pynostr/event.py`) handles event construction, signing, and serialization. Every action on NOSTR is an event.

### Event Structure

A NOSTR event contains:
- `id`: SHA-256 hash of the serialized event
- `pubkey`: Author's public key (hex)
- `created_at`: Unix timestamp
- `kind`: Integer event type
- `tags`: Array of arrays (metadata)
- `content`: String payload
- `sig`: Schnorr signature

### EventKind Constants

```python
from pynostr.event import EventKind

EventKind.SET_METADATA       # 0
EventKind.TEXT_NOTE          # 1
EventKind.RECOMMEND_RELAY    # 2
EventKind.CONTACTS           # 3
EventKind.ENCRYPTED_DIRECT_MESSAGE  # 4
EventKind.DELETE             # 5
```

### Creating and Signing Events

```python
from pynostr.event import Event, EventKind
from pynostr.key import PrivateKey

private_key = PrivateKey()

# Create a text note
event = Event(
    content="Hello, NOSTR!",
    kind=EventKind.TEXT_NOTE,
)

# Sign the event (sets pubkey, id, and sig)
event.sign(private_key.hex())

# Inspect the signed event
print(f"Event ID:  {event.id}")
print(f"Author:    {event.public_key}")
print(f"Content:   {event.content}")
print(f"Signature: {event.signature}")
print(f"Created:   {event.created_at}")
```

### Adding Tags

Tags are used extensively in NOSTR for threading, mentions, and metadata:

```python
event = Event(content="Replying to a note")

# Reference another event (e tag)
event.add_event_ref("referenced_event_id_hex")

# Reference a pubkey (p tag)
event.add_pubkey_ref("referenced_pubkey_hex")

# Custom tags
event.tags.append(["t", "nostr"])          # Hashtag
event.tags.append(["r", "https://..."])    # URL reference
event.tags.append(["d", "identifier"])     # Parameterized replaceable event identifier

event.sign(private_key.hex())
```

### Replies (NIP-10)

Proper reply threading uses `e` and `p` tags:

```python
from pynostr.event import Event, EventKind
from pynostr.key import PrivateKey

private_key = PrivateKey()

# Original note we are replying to
original_event_id = "abc123..."
original_author_pubkey = "def456..."

reply = Event(
    content="Great post!",
    kind=EventKind.TEXT_NOTE,
)

# Add reply references per NIP-10
reply.add_event_ref(original_event_id)
reply.add_pubkey_ref(original_author_pubkey)

reply.sign(private_key.hex())
```

### Event Serialization

```python
# Serialize to JSON (for relay transmission)
json_str = event.to_message()

# The event as a Python dict
event_dict = event.to_dict()
```

### Event Verification

```python
# Verify an event's signature
is_valid = event.verify()
print(f"Signature valid: {is_valid}")
```

---

## Relay Communication

pynostr provides two levels of relay interaction: `RelayManager` for multi-relay orchestration and `Relay` for single-relay fine-grained control.

### RelayManager (Recommended)

```python
import time
from pynostr.relay_manager import RelayManager
from pynostr.filters import FiltersList, Filters
from pynostr.event import Event, EventKind
from pynostr.key import PrivateKey

private_key = PrivateKey()

# Initialize the relay manager
relay_manager = RelayManager()
relay_manager.add_relay("wss://relay.damus.io")
relay_manager.add_relay("wss://nos.lol")
relay_manager.add_relay("wss://relay.nostr.band")

# Create and publish an event
event = Event(content="Broadcasting to multiple relays!", kind=EventKind.TEXT_NOTE)
event.sign(private_key.hex())
relay_manager.publish_event(event)

# Run the relay manager synchronously
# This opens connections, sends pending messages, and processes responses
relay_manager.run_sync()
time.sleep(2)  # Give relays time to respond

# Check for OK messages (relay acknowledgments)
while relay_manager.message_pool.has_ok_notices():
    ok_msg = relay_manager.message_pool.get_ok_notice()
    print(f"Relay accepted: {ok_msg.event_id} -> {ok_msg.ok}")
```

### Single Relay Connection

For advanced use cases requiring direct relay control:

```python
import tornado.ioloop
from pynostr.relay import Relay
from pynostr.message_pool import MessagePool
from pynostr.filters import FiltersList, Filters
from pynostr.event import EventKind

# Setup
message_pool = MessagePool()
policy = {"read": True, "write": True}

io_loop = tornado.ioloop.IOLoop.current()

relay = Relay(
    "wss://relay.damus.io",
    message_pool,
    io_loop,
    policy,
)

# Add a subscription
filters = FiltersList([Filters(kinds=[EventKind.TEXT_NOTE], limit=5)])
relay.add_subscription("my-sub", filters)

# Connect and run
relay.connect()
io_loop.start()
```

### Relay Policies

When adding relays, you can specify read/write policies:

```python
relay_manager.add_relay("wss://relay.damus.io")     # Default: read + write
# Individual relay policies are controlled through the Relay class
```

---

## Subscriptions and Filters

Subscriptions use the `Filters` and `FiltersList` classes from `pynostr/filters.py`.

### Filter Parameters

```python
from pynostr.filters import Filters, FiltersList
from pynostr.event import EventKind

# Basic filter: last 20 text notes
filters = Filters(
    kinds=[EventKind.TEXT_NOTE],
    limit=20,
)

# Filter by specific authors
filters = Filters(
    authors=["pubkey_hex_1", "pubkey_hex_2"],
    kinds=[EventKind.TEXT_NOTE],
    limit=50,
)

# Filter by event IDs
filters = Filters(
    event_ids=["event_id_hex"],
)

# Filter by time range (Unix timestamps)
filters = Filters(
    kinds=[EventKind.TEXT_NOTE],
    since=1700000000,
    until=1700100000,
)

# Filter by tags (#e, #p, #t, etc.)
filters = Filters(
    kinds=[EventKind.TEXT_NOTE],
    event_refs=["referenced_event_id"],  # #e tag
    pubkey_refs=["referenced_pubkey"],    # #p tag
)
```

### Combining Filters

`FiltersList` wraps multiple `Filters` into a subscription. The relay returns events matching ANY of the filters (logical OR):

```python
# Get both text notes and metadata events
filters_list = FiltersList([
    Filters(kinds=[EventKind.TEXT_NOTE], limit=20),
    Filters(kinds=[EventKind.SET_METADATA], authors=["some_pubkey"]),
])
```

### Creating Subscriptions

```python
relay_manager = RelayManager()
relay_manager.add_relay("wss://relay.damus.io")

# Subscribe on all connected relays
subscription_id = "my-feed"
relay_manager.add_subscription_on_all_relays(
    subscription_id,
    FiltersList([Filters(kinds=[EventKind.TEXT_NOTE], limit=10)])
)

relay_manager.run_sync()

# Process received events
import time
time.sleep(3)

while relay_manager.message_pool.has_events():
    event_msg = relay_manager.message_pool.get_event()
    print(f"[{event_msg.event.created_at}] {event_msg.event.content[:80]}")

# Check for EOSE (End of Stored Events, NIP-15)
while relay_manager.message_pool.has_eose_notices():
    eose = relay_manager.message_pool.get_eose_notice()
    print(f"EOSE received for subscription: {eose.subscription_id}")
```

### Closing Subscriptions

```python
relay_manager.close_subscription_on_all_relays(subscription_id)
```

---

## Encrypted Direct Messages (NIP-04)

The `encrypted_dm` module (`pynostr/encrypted_dm.py`) implements NIP-04 encrypted direct messages using AES-256-CBC.

> **Note:** NIP-04 is considered deprecated in favor of NIP-44 for new implementations. However, it remains widely supported across the ecosystem. pynostr implements NIP-04 but not yet NIP-44.

### Sending an Encrypted DM

```python
from pynostr.encrypted_dm import EncryptedDirectMessage
from pynostr.key import PrivateKey

# Sender and recipient keys
sender_privkey = PrivateKey()
recipient_pubkey_hex = "recipient_64_char_hex_pubkey"

# Create encrypted message
dm = EncryptedDirectMessage(
    recipient_pubkey=recipient_pubkey_hex,
    cleartext_content="This is a secret message!",
)
dm.encrypt(sender_privkey.hex())

# The event is now ready with encrypted content
# dm.content contains the NIP-04 ciphertext
dm.sign(sender_privkey.hex())

# Publish to relays
relay_manager.publish_event(dm)
relay_manager.run_sync()
```

### Decrypting a Received DM

```python
from pynostr.encrypted_dm import EncryptedDirectMessage
from pynostr.key import PrivateKey

recipient_privkey = PrivateKey()

# Given an encrypted event received from a relay
# (event_msg.event contains the NIP-04 encrypted event)
encrypted_event = event_msg.event

# Decrypt using recipient's private key
cleartext = EncryptedDirectMessage.decrypt(
    private_key_hex=recipient_privkey.hex(),
    encrypted_message=encrypted_event.content,
    public_key_hex=encrypted_event.public_key,  # sender's pubkey
)
print(f"Decrypted message: {cleartext}")
```

### Replying to a DM

```python
# Reply in a DM conversation
reply_dm = EncryptedDirectMessage(
    recipient_pubkey=sender_pubkey_hex,
    cleartext_content="Got your message!",
)

# Reference the original DM
reply_dm.add_event_ref(original_dm_event_id)

reply_dm.encrypt(recipient_privkey.hex())
reply_dm.sign(recipient_privkey.hex())
```

---

## NIP-05 Verification

NIP-05 maps DNS-based identifiers (like `user@domain.com`) to NOSTR public keys. pynostr provides utilities for verifying these identifiers.

### Verification Flow

NIP-05 verification works by:
1. Parse the identifier into `<local-part>` and `<domain>`
2. Fetch `https://<domain>/.well-known/nostr.json?name=<local-part>`
3. Check that the returned JSON maps the name to the expected public key

### Using pynostr for NIP-05

```python
import json
import urllib.request

def verify_nip05(identifier: str, expected_pubkey: str) -> bool:
    """
    Verify a NIP-05 identifier against an expected public key.

    Args:
        identifier: NIP-05 identifier (e.g., "user@domain.com")
        expected_pubkey: Expected public key in hex format

    Returns:
        True if the identifier resolves to the expected public key
    """
    try:
        local_part, domain = identifier.split("@")
    except ValueError:
        return False

    url = f"https://{domain}/.well-known/nostr.json?name={local_part}"

    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())
    except Exception:
        return False

    names = data.get("names", {})
    resolved_pubkey = names.get(local_part)

    return resolved_pubkey == expected_pubkey


# Usage
is_valid = verify_nip05("bob@example.com", "expected_pubkey_hex")
print(f"NIP-05 valid: {is_valid}")
```

### Checking Relays from NIP-05

The NIP-05 response can also include recommended relays:

```python
def get_nip05_relays(identifier: str) -> dict:
    """Get relay recommendations from a NIP-05 identifier."""
    local_part, domain = identifier.split("@")
    url = f"https://{domain}/.well-known/nostr.json?name={local_part}"

    with urllib.request.urlopen(url, timeout=10) as response:
        data = json.loads(response.read().decode())

    pubkey = data.get("names", {}).get(local_part)
    if pubkey:
        relays = data.get("relays", {}).get(pubkey, [])
        return {"pubkey": pubkey, "relays": relays}
    return {}
```

---

## NIP-19 Bech32 Encoding

The `bech32` module (`pynostr/bech32.py`) handles encoding and decoding of NOSTR entities in the human-readable bech32 format defined by NIP-19.

### Prefixes

| Prefix | Entity | Description |
|--------|--------|-------------|
| `npub` | Public key | 32-byte public key |
| `nsec` | Private key | 32-byte private key |
| `note` | Note ID | 32-byte event ID |
| `nprofile` | Profile | Public key + relay hints |
| `nevent` | Event | Event ID + relay hints + author |
| `naddr` | Address | Parameterized replaceable event coordinate |

### Encoding

```python
from pynostr.key import PrivateKey, PublicKey

private_key = PrivateKey()
public_key = private_key.public_key

# Basic encoding (npub/nsec)
nsec = private_key.bech32()    # "nsec1..."
npub = public_key.bech32()     # "npub1..."

print(f"Share this: {npub}")
print(f"Keep secret: {nsec}")
```

### Decoding

```python
from pynostr.key import PrivateKey, PublicKey

# Decode nsec back to a PrivateKey
private_key = PrivateKey.from_nsec("nsec1...")

# Decode npub to hex
# PublicKey can be constructed from hex after decoding
```

### Working with bech32 Utilities

The lower-level bech32 module supports the full range of NIP-19 entities:

```python
from pynostr.bech32 import bech32_encode, bech32_decode

# These utilities handle the TLV (Type-Length-Value) encoding
# used by nprofile, nevent, and naddr entities
```

---

## NIP-13 Proof of Work

The `pow` module (`pynostr/pow.py`) implements computational proof of work for events, making spam more expensive.

### Mining a PoW Event

```python
from pynostr.pow import PowEvent
from pynostr.event import EventKind
from pynostr.key import PrivateKey

private_key = PrivateKey()

# Create a PoW event with target difficulty of 20 bits
pow_event = PowEvent(
    content="This note required proof of work!",
    kind=EventKind.TEXT_NOTE,
)

# Mine the event (this may take some time depending on difficulty)
pow_event.mine(difficulty=20)
pow_event.sign(private_key.hex())

print(f"Event ID: {pow_event.id}")
print(f"Difficulty achieved: {pow_event.check_pow()}")
```

### Verifying PoW

```python
# Check the proof of work on a received event
difficulty = pow_event.check_pow()
print(f"PoW difficulty: {difficulty} bits of leading zeros")

if difficulty >= 20:
    print("Meets minimum difficulty threshold")
```

### How PoW Works

NIP-13 PoW works by repeatedly adjusting a `nonce` tag on the event until the event ID (SHA-256 hash) has a specified number of leading zero bits. Higher difficulty means more computation is required:

- Difficulty 10: ~1,024 hash attempts on average
- Difficulty 20: ~1,048,576 hash attempts
- Difficulty 30: ~1,073,741,824 hash attempts

---

## NIP-26 Delegation

The `delegation` module (`pynostr/delegation.py`) enables delegated event signing. An identity key can authorize a disposable "delegatee" key to publish events on its behalf.

### Use Case

Keep your identity private key offline (cold storage) while authorizing a hot key to post on your behalf for a limited time period.

### Creating a Delegation

```python
from pynostr.delegation import Delegation
from pynostr.key import PrivateKey
from pynostr.event import Event, EventKind

# Identity key (kept offline / cold storage)
identity_key = PrivateKey()

# Disposable key (hot, used for day-to-day signing)
delegatee_key = PrivateKey()

# Create delegation: identity authorizes delegatee for TEXT_NOTEs
delegation = Delegation(
    delegator_pubkey=identity_key.public_key.hex(),
    delegatee_pubkey=delegatee_key.public_key.hex(),
    event_kind=EventKind.TEXT_NOTE,
    duration_secs=30 * 24 * 60 * 60,  # 30 days
)

# Sign the delegation token with the identity key
delegation.sign(identity_key.hex())

# Create an event using the delegatee key, with delegation proof
event = Event(
    content="Posted via delegation!",
    kind=EventKind.TEXT_NOTE,
)

# Add delegation tag to the event
event.tags.append(delegation.get_tag())

# Sign with the delegatee key (not the identity key)
event.sign(delegatee_key.hex())
```

### Verifying Delegation

```python
# Relays and clients can verify that:
# 1. The delegation tag is present
# 2. The delegation signature is valid for the delegator pubkey
# 3. The event kind matches the delegated kind
# 4. The event timestamp falls within the delegation period
```

---

## NIP-02 Contact Lists

The `contact_list` module (`pynostr/contact_list.py`) manages contact lists (follow lists).

```python
from pynostr.contact_list import ContactList
from pynostr.event import Event, EventKind
from pynostr.key import PrivateKey

private_key = PrivateKey()

# Build a contact list
contact_list = ContactList()
contact_list.add(
    pubkey="friend_pubkey_hex",
    relay_url="wss://relay.damus.io",
    petname="alice",
)
contact_list.add(
    pubkey="another_friend_pubkey",
    relay_url="wss://nos.lol",
    petname="bob",
)

# Create the contact list event (kind 3)
event = Event(
    kind=EventKind.CONTACTS,
    tags=contact_list.to_tags(),
    content="",  # Content is typically empty for kind 3
)
event.sign(private_key.hex())
```

---

## NIP-65 Relay List Metadata

The `relay_list` module (`pynostr/relay_list.py`) manages the relay list metadata event (kind 10002).

```python
from pynostr.relay_list import RelayList

relay_list = RelayList()
relay_list.add_relay("wss://relay.damus.io", read=True, write=True)
relay_list.add_relay("wss://nos.lol", read=True, write=True)
relay_list.add_relay("wss://nostr.wine", read=True, write=False)  # Read-only

# Convert to event tags for kind 10002
tags = relay_list.to_tags()
```

---

## NIP-56 Reporting

The `report` module (`pynostr/report.py`) implements event and user reporting.

```python
from pynostr.report import Report

# Report types include: spam, illegal, impersonation, etc.
# Used to flag content or users to relay operators
```

---

## Error Handling

### Common Exceptions

pynostr defines custom exceptions in `pynostr/exception.py`:

```python
from pynostr.exception import RelayException

try:
    relay_manager.run_sync()
except RelayException as e:
    print(f"Relay error: {e}")
```

### Relay Communication Errors

Always check the message pool for notices and errors:

```python
relay_manager.run_sync()

import time
time.sleep(3)

# Check for error notices from relays
while relay_manager.message_pool.has_notices():
    notice = relay_manager.message_pool.get_notice()
    print(f"Relay notice: {notice.content}")

# Check OK messages for publish confirmations
while relay_manager.message_pool.has_ok_notices():
    ok_msg = relay_manager.message_pool.get_ok_notice()
    if not ok_msg.ok:
        print(f"Event {ok_msg.event_id} rejected: {ok_msg.message}")
```

### Connection Handling

```python
# Wrap relay operations in try/except for robustness
try:
    relay_manager = RelayManager()
    relay_manager.add_relay("wss://relay.damus.io")
    relay_manager.run_sync()
except Exception as e:
    print(f"Connection failed: {e}")
finally:
    # Clean up
    relay_manager.close_all_relay_connections()
```

---

## Async Patterns

pynostr uses **Tornado's IOLoop** rather than Python's standard asyncio. This is an important architectural detail that affects how you integrate it with other async frameworks.

### Tornado IOLoop Basics

```python
import tornado.ioloop
from pynostr.relay import Relay
from pynostr.message_pool import MessagePool

message_pool = MessagePool()
io_loop = tornado.ioloop.IOLoop.current()

relay = Relay(
    "wss://relay.damus.io",
    message_pool,
    io_loop,
    {"read": True, "write": True},
)

relay.connect()

# Schedule a callback
def check_messages():
    while message_pool.has_events():
        event_msg = message_pool.get_event()
        print(event_msg.event.content)

# Run periodically
periodic = tornado.ioloop.PeriodicCallback(check_messages, 1000)
periodic.start()

io_loop.start()
```

### Synchronous Wrapper (run_sync)

For simple scripts, `RelayManager.run_sync()` abstracts away the event loop:

```python
# This is the simplest pattern -- blocks until complete
relay_manager.run_sync()
```

### Integrating with asyncio

In modern Python (3.10+), Tornado's IOLoop is backed by asyncio. You can run them together with care:

```python
import asyncio
import tornado.ioloop

async def nostr_task():
    relay_manager = RelayManager()
    relay_manager.add_relay("wss://relay.damus.io")
    # ... setup subscriptions ...

    # Use run_sync in a thread to avoid blocking asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, relay_manager.run_sync)

# If you need full asyncio, consider monstr instead
```

### WebSocket Relay Classes

pynostr also provides `websocket_relay.py` and `websocket_relay_manager.py` which offer alternative WebSocket implementations:

```python
from pynostr.websocket_relay_manager import WebsocketRelayManager

# Alternative relay manager using websocket-client directly
# Useful when Tornado is not desired
```

---

## Differences from python-nostr

pynostr originated as a fork of python-nostr but has diverged significantly. Here is a comprehensive comparison:

### Cryptographic Backend

| | python-nostr | pynostr |
|---|---|---|
| Library | secp256k1 | coincurve |
| Windows | Requires manual compilation | Works out of the box |
| Android | Difficult | Supported (with steps) |
| Performance | Native C | Native C (via coincurve) |

### API Naming

```python
# python-nostr
from nostr.filter import Filter, Filters
from nostr.relay_manager import RelayManager

# pynostr
from pynostr.filters import Filters, FiltersList
from pynostr.relay_manager import RelayManager
```

The naming shift (`Filter` -> `Filters`, `Filters` -> `FiltersList`) reflects that a single filter object in pynostr already represents a set of filter conditions, and `FiltersList` wraps multiple such sets.

### Event Signing

```python
# python-nostr: the key signs the event
private_key.sign_event(event)

# pynostr: the event is signed with a key
event.sign(private_key.hex())
```

### Connection Management

```python
# python-nostr: explicit open/close
relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
time.sleep(1)
# ... do work ...
relay_manager.close_connections()

# pynostr: synchronous run
relay_manager.run_sync()
```

### NIP Coverage

pynostr implements significantly more NIPs: NIP-02, 03, 05, 10, 11, 13, 15, 19, 56, and 65 are all present in pynostr but absent from python-nostr.

### Package Name

- python-nostr installs as `nostr` (conflicts with potential future official packages)
- pynostr installs as `pynostr` (no namespace collision)

---

## Complete NIP Support Table

| NIP | Description | Status |
|-----|-------------|--------|
| NIP-01 | Basic protocol flow | Implemented |
| NIP-02 | Contact list and petnames | Implemented |
| NIP-03 | OpenTimestamps attestations | Implemented |
| NIP-04 | Encrypted direct messages | Implemented |
| NIP-05 | DNS-based identifiers | Implemented |
| NIP-06 | Key derivation from mnemonic | Not implemented |
| NIP-08 | Handling mentions | Not implemented |
| NIP-09 | Event deletion | Not implemented |
| NIP-10 | Reply conventions (e/p tags) | Implemented |
| NIP-11 | Relay information document | Implemented |
| NIP-12 | Generic tag queries | Not implemented |
| NIP-13 | Proof of Work | Implemented |
| NIP-14 | Subject tag | Not implemented |
| NIP-15 | End of Stored Events | Implemented |
| NIP-16 | Event treatment | Not implemented |
| NIP-19 | Bech32-encoded entities | Implemented |
| NIP-20 | Command results | Not implemented |
| NIP-21 | nostr: URI scheme | Not implemented |
| NIP-22 | Event created_at limits | Not implemented |
| NIP-23 | Long-form content | Not implemented |
| NIP-25 | Reactions | Not implemented |
| NIP-26 | Delegated event signing | Implemented |
| NIP-28 | Public chat | Not implemented |
| NIP-33 | Parameterized replaceable events | Not implemented |
| NIP-36 | Sensitive content | Not implemented |
| NIP-40 | Expiration timestamp | Not implemented |
| NIP-42 | Authentication | Not implemented |
| NIP-44 | Versioned encryption | Not implemented |
| NIP-46 | Remote signing | Not implemented |
| NIP-50 | Search | Not implemented |
| NIP-56 | Reporting | Implemented |
| NIP-57 | Lightning Zaps | Not implemented |
| NIP-58 | Badges | Not implemented |
| NIP-65 | Relay list metadata | Implemented |

### NIPs You Need But pynostr Does Not Have

If you need these NIPs in Python, consider alternatives:

- **NIP-44 (modern encryption)**: Use **monstr** or **rust-nostr bindings**
- **NIP-46 (remote signing)**: Use **monstr** or **rust-nostr bindings**
- **NIP-59 (gift wraps)**: Use **monstr** or **rust-nostr bindings**
- **NIP-57 (zaps)**: Use **rust-nostr bindings**

---

## Further Reading

- [Python Ecosystem Overview](./README.md)
- [Basic Usage Example](./examples/basic_usage.py)
- [NIP-05 Verification Example](./examples/nip05_verify.py)
- [pynostr GitHub Repository](https://github.com/holgern/pynostr)
- [pynostr on PyPI](https://pypi.org/project/pynostr/)
