# Python NOSTR Ecosystem

A comprehensive guide to building NOSTR clients and tools in Python.

## Overview

The Python NOSTR ecosystem has matured into several distinct libraries, each with different design philosophies, maintenance cadences, and target use cases. This document covers the four primary options available to Python developers as of early 2026.

| Library | Package | Author | Crypto Backend | Async Model | Status |
|---------|---------|--------|---------------|-------------|--------|
| **pynostr** | `pynostr` | holgern | coincurve | Tornado IOLoop | Active |
| **python-nostr** | `nostr` | jeffthibault | secp256k1 | threading | Dormant |
| **monstr** | `monstr` | monty888 | — | asyncio | Active (WIP) |
| **rust-nostr bindings** | `nostr-sdk` | rust-nostr | Rust (FFI) | tokio via FFI | Active |

---

## 1. pynostr (holgern/pynostr)

**Repository:** [github.com/holgern/pynostr](https://github.com/holgern/pynostr)
**Install:** `pip install pynostr` or `pip install pynostr[websocket-client]`
**Python:** >= 3.7
**License:** MIT

pynostr is the most actively maintained pure-Python NOSTR library. It forked from python-nostr early in its life and has since diverged significantly. The key architectural decision is using **coincurve** instead of secp256k1 for cryptographic operations, which provides cross-platform support including Windows and Android/Termux without needing to compile C extensions.

### Key Features
- Broadest NIP coverage of the pure-Python libraries (NIP-01, 02, 03, 04, 05, 10, 11, 13, 15, 19, 26, 56, 65)
- RelayManager for multi-relay broadcasting
- Tornado-based WebSocket layer
- Encrypted direct messages (NIP-04)
- NIP-05 DNS identifier verification
- NIP-13 Proof of Work mining
- NIP-19 bech32 encoding/decoding (npub, nsec, note, nprofile, nevent)
- NIP-26 delegated event signing
- Comprehensive test suite (pytest + tox)

### Module Structure

```
pynostr/
    key.py              # PrivateKey, PublicKey
    event.py            # Event construction and signing
    filters.py          # Filters, FiltersList
    relay.py            # Single relay connection
    relay_manager.py    # Multi-relay orchestration
    message_pool.py     # Incoming message handling
    encrypted_dm.py     # NIP-04 encrypted direct messages
    delegation.py       # NIP-26 delegation
    pow.py              # NIP-13 proof of work
    metadata.py         # Profile metadata
    contact_list.py     # NIP-02 contact lists
    relay_list.py       # NIP-65 relay list metadata
    report.py           # NIP-56 reporting
    bech32.py           # NIP-19 encoding
    subscription.py     # Subscription management
    utils.py            # Utility functions
    base_relay.py       # Base relay abstraction
    websocket_relay.py  # WebSocket relay implementation
    cli.py              # Command-line interface
    exception.py        # Custom exceptions
```

### Quick Example

```python
from pynostr.key import PrivateKey
from pynostr.event import Event, EventKind
from pynostr.relay_manager import RelayManager
from pynostr.filters import FiltersList, Filters

# Generate keys
private_key = PrivateKey()
public_key = private_key.public_key
print(f"npub: {public_key.bech32()}")
print(f"nsec: {private_key.bech32()}")

# Create and sign an event
event = Event(content="Hello from pynostr!", kind=EventKind.TEXT_NOTE)
event.sign(private_key.hex())

# Publish to relays
relay_manager = RelayManager()
relay_manager.add_relay("wss://relay.damus.io")
relay_manager.add_relay("wss://nos.lol")
relay_manager.add_subscription_on_all_relays(
    "my-sub",
    FiltersList([Filters(kinds=[EventKind.TEXT_NOTE], limit=10)])
)
relay_manager.run_sync()
```

> **See:** [pynostr.md](./pynostr.md) for a complete deep dive.

---

## 2. python-nostr (jeffthibault/python-nostr)

**Repository:** [github.com/jeffthibault/python-nostr](https://github.com/jeffthibault/python-nostr)
**Install:** `pip install nostr`
**Python:** 3.9+ (developed on 3.9.5)
**License:** MIT

python-nostr is the **original** Python NOSTR library. It laid the groundwork that pynostr later forked from. The library provides a clean, minimal API for key generation, event creation, relay communication, and encrypted messaging.

### Key Features
- Key generation (PrivateKey, PublicKey)
- Event creation, signing, publishing
- RelayManager for multi-relay connections
- Filter-based subscriptions
- NIP-04 encrypted direct messages
- NIP-26 delegation

### API Style

```python
from nostr.key import PrivateKey
from nostr.event import Event, EventKind
from nostr.filter import Filter, Filters
from nostr.relay_manager import RelayManager

private_key = PrivateKey()
event = Event(public_key=private_key.public_key.hex(), content="Hello!")
private_key.sign_event(event)

relay_manager = RelayManager()
relay_manager.add_relay("wss://relay.damus.io")
relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
relay_manager.publish_event(event)
relay_manager.close_connections()
```

### Current Status

The author has acknowledged the library is in "very early development" and may contain bugs. As of 2026, the repository has limited recent activity. For new projects, **pynostr is recommended** as it has continued active development where python-nostr left off.

### Key Differences from pynostr

| Aspect | python-nostr | pynostr |
|--------|-------------|---------|
| Package name | `nostr` | `pynostr` |
| Crypto library | secp256k1 (requires C compilation) | coincurve (pure wheel available) |
| WebSocket | Standard websocket-client | Tornado-based |
| Filter class | `Filter`, `Filters` | `Filters`, `FiltersList` |
| Event signing | `private_key.sign_event(event)` | `event.sign(private_key.hex())` |
| Connection model | `open_connections()` / `close_connections()` | `run_sync()` |
| Windows support | Difficult (secp256k1 compilation) | Native |
| NIP coverage | Basic (01, 04, 26) | Extensive (01-65+) |

---

## 3. monstr (monty888/monstr)

**Repository:** [github.com/monty888/monstr](https://github.com/monty888/monstr)
**Install:** Clone + `pip install .` (not on PyPI as a simple install)
**Python:** 3.10+
**License:** MIT

monstr takes a different approach from the other libraries. It is designed as a more complete toolkit that includes not just client functionality but also a **basic relay implementation** suitable for testing and development. It uses native Python **asyncio** rather than Tornado or threading.

### Key Features
- **Client and ClientPool**: Async relay connection management
- **Built-in relay**: A basic relay for local testing (extensible)
- **KeyStore**: Persistent encrypted key storage (SQLite-backed)
- **NIP-44 encryption**: Modern encryption support alongside NIP-04
- **NIP-46 remote signing**: NIP46ServerConnection and NIP46Signer
- **NIP-49 key encryption**: Encrypted key export/import
- **NIP-59 gift wraps**: Both standard and legacy implementations
- **NIP-19 entity encoding/decoding**
- **Signer abstraction**: Enables hardware wallet integration

### Architecture

monstr is organized around an async-first design:

```python
import asyncio
from monstr.client.client import Client, ClientPool
from monstr.encrypt import Keys

async def main():
    keys = Keys()
    async with ClientPool(["wss://relay.damus.io"]) as pool:
        # Query events
        events = await pool.query({"kinds": [1], "limit": 10})
        for event in events:
            print(event.content)

asyncio.run(main())
```

### When to Use monstr
- You need **asyncio-native** relay communication (e.g., integrating with aiohttp, FastAPI)
- You want a **local test relay** without running separate software
- You need **NIP-44** (modern encryption) or **NIP-46** (remote signing) in Python
- You want **persistent key management** with encrypted storage
- You need **NIP-59 gift-wrapped events**

---

## 4. rust-nostr Python Bindings

**Repository:** [github.com/rust-nostr/nostr](https://github.com/rust-nostr/nostr) (bindings directory)
**Install:** `pip install nostr-sdk`
**License:** MIT

The rust-nostr project provides Python bindings via FFI (Foreign Function Interface) to the Rust implementation. This gives Python developers access to the most comprehensive and performant NOSTR implementation available, at the cost of a binary dependency.

### Key Features
- **Performance**: Rust-native cryptographic operations
- **Comprehensive NIP support**: Inherits all NIPs implemented in rust-nostr
- **Type safety**: Strongly typed API surface
- **Cross-platform**: Pre-built wheels for major platforms
- **Active development**: Benefits from the large rust-nostr contributor base

### Usage Pattern

```python
from nostr_sdk import Keys, Client, EventBuilder, Filter, Kind

# Generate keys
keys = Keys.generate()
print(f"Public key: {keys.public_key().to_bech32()}")

# Create client
client = Client(keys)
client.add_relay("wss://relay.damus.io")
client.connect()

# Publish a text note
builder = EventBuilder.text_note("Hello from rust-nostr Python bindings!")
client.send_event(builder)

# Subscribe
filter = Filter().kind(Kind(1)).limit(10)
client.subscribe([filter])
```

### Trade-offs
- **Pros**: Fastest execution, broadest NIP coverage, shared maintenance with Rust ecosystem
- **Cons**: Binary wheels required (no pure-Python fallback), API follows Rust idioms which may feel unfamiliar, larger package size, harder to debug into library internals

---

## Comparison Matrix

### Feature Coverage

| Feature | pynostr | python-nostr | monstr | rust-nostr |
|---------|---------|-------------|--------|------------|
| NIP-01 Basic Protocol | Yes | Yes | Yes | Yes |
| NIP-02 Contact Lists | Yes | No | Yes | Yes |
| NIP-04 Encrypted DM | Yes | Yes | Yes | Yes |
| NIP-05 DNS Identifiers | Yes | No | Yes | Yes |
| NIP-11 Relay Info | Yes | No | Yes | Yes |
| NIP-13 Proof of Work | Yes | No | No | Yes |
| NIP-19 Bech32 Encoding | Yes | No | Yes | Yes |
| NIP-26 Delegation | Yes | Yes | No | Yes |
| NIP-44 Modern Encryption | No | No | Yes | Yes |
| NIP-46 Remote Signing | No | No | Yes | Yes |
| NIP-59 Gift Wraps | No | No | Yes | Yes |
| NIP-65 Relay Lists | Yes | No | No | Yes |
| Built-in Relay | No | No | Yes | No |
| Async (asyncio) | No (Tornado) | No (threading) | Yes | Via FFI |
| Type Hints | Partial | Minimal | Partial | Full |
| PyPI Package | Yes | Yes | Manual | Yes |

### Decision Guide

**Choose pynostr if:**
- You want the most popular pure-Python library
- You need Windows/Android compatibility without compilation headaches
- You need a straightforward, well-documented API
- Your NIP requirements are covered by its implementation set
- You are migrating from python-nostr

**Choose python-nostr if:**
- You have an existing codebase built on it
- You need only the most basic NOSTR functionality
- (Generally, prefer pynostr for new projects)

**Choose monstr if:**
- You need asyncio-native integration (FastAPI, aiohttp, etc.)
- You need NIP-44, NIP-46, or NIP-59 support in pure Python
- You want a built-in test relay
- You need encrypted key storage
- You prefer an async context manager pattern

**Choose rust-nostr Python bindings if:**
- You need maximum performance
- You need the broadest possible NIP coverage
- You do not mind a binary dependency
- You are comfortable with Rust-influenced API patterns
- You need production-grade reliability

---

## Python-Specific Considerations

### asyncio Integration

Only **monstr** provides native asyncio support. If you are building on an async framework (FastAPI, Starlette, aiohttp), monstr or the rust-nostr bindings are your best options. pynostr uses Tornado's IOLoop, which can coexist with asyncio but requires care:

```python
# pynostr with asyncio (workaround)
import asyncio
from tornado.ioloop import IOLoop

# Tornado's IOLoop wraps asyncio's event loop in modern versions,
# but mixing them in a single application requires caution.
```

### Type Hints

All libraries provide varying levels of type hint coverage. rust-nostr bindings have the most complete type stubs since they are auto-generated from Rust types. For strict mypy usage, expect to add some `# type: ignore` comments with the pure-Python libraries.

### Virtual Environments

Always use virtual environments. The package name collision between `nostr` (python-nostr) and `nostr-sdk` (rust-nostr) can cause confusion:

```bash
# For pynostr
python -m venv venv && source venv/bin/activate
pip install pynostr[websocket-client]

# For rust-nostr bindings
python -m venv venv && source venv/bin/activate
pip install nostr-sdk

# For monstr
python -m venv venv && source venv/bin/activate
git clone https://github.com/monty888/monstr.git
cd monstr && pip install .
```

### Error Handling

NOSTR relay communication is inherently unreliable. All libraries surface relay errors differently:

- **pynostr**: Check `relay_manager.message_pool` for notices and errors
- **python-nostr**: Similar message pool pattern
- **monstr**: Async exceptions and callback-based error handling
- **rust-nostr**: Rust Result types mapped to Python exceptions

### Testing

For local development, monstr's built-in relay is invaluable. Alternatively, you can run a local relay using Docker:

```bash
# Run a local strfry relay for testing
docker run -p 7777:7777 dockurr/strfry
```

---

## Further Reading

- [pynostr Deep Dive](./pynostr.md) -- Complete API reference and patterns
- [Basic Usage Example](./examples/basic_usage.py) -- Key generation, publish, subscribe
- [NIP-05 Verification Example](./examples/nip05_verify.py) -- DNS identifier verification
- [NOSTR Protocol Overview](../../protocol/README.md) -- Protocol fundamentals
- [NIP Index](../../nips/README.md) -- Individual NIP documentation
