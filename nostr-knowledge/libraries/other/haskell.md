# Haskell Nostr Libraries

## nostr.hs (delirehberi/nostr.hs)

A NIP-01 compliant Nostr library for Haskell providing type-safe event handling, cryptographic signing, and relay communication.

- **Repo:** [github.com/delirehberi/nostr.hs](https://github.com/delirehberi/nostr.hs)
- **License:** MIT
- **Language:** Haskell (98.4%), Nix (1.5%)

### Features

- **Pure Haskell Schnorr signatures** using `ppad-secp256k1` (BIP-340)
- **Type-safe design** with strong types for event IDs, public keys, and signatures
- **WebSocket relay communication** with automatic reconnection and exponential backoff
- **TLS support** for secure relay connections
- **Concurrent relay queries** across multiple relays simultaneously
- **High-level and low-level APIs**

### Supported NIPs

| NIP | Feature |
|-----|---------|
| 01 | Basic protocol flow |
| 02 | Contact lists |
| 05 | DNS-based identity verification |
| 09 | Event deletion |
| 10 | Text notes and threads |
| 19 | Bech32 entity encoding |
| 21 | `nostr:` URI scheme |
| 42 | Relay authentication |

### Installation

The project uses Nix for reproducible builds:

```bash
git clone https://github.com/delirehberi/nostr.hs.git
cd nostr.hs
nix develop
cabal build all
```

Alternatively, add as a Cabal dependency if published:

```cabal
build-depends: nostr
```

### API Levels

#### High-Level API (Recommended)

The `Nostr.Client` module provides a monadic interface with automatic reconnection and TLS handling.

```haskell
import Nostr.Client
import Nostr.Types

main :: IO ()
main = do
  -- Generate a new keypair
  keys <- generateKeys
  let pubkey = publicKey keys
      seckey = secretKey keys

  -- Connect to a relay
  withRelay "wss://relay.damus.io" $ \relay -> do

    -- Publish a text note
    let note = newEvent
          { eventKind    = TextNote
          , eventContent = "Hello Nostr from Haskell!"
          , eventTags    = [Tag "t" ["haskell"]]
          }
    signed <- signEvent seckey note
    publish relay signed

    -- Subscribe to events
    let filt = defaultFilter
          { filterKinds = Just [TextNote]
          , filterLimit = Just 20
          }
    subscribe relay filt $ \event -> do
      putStrLn $ "Received: " ++ eventContent event
      putStrLn $ "Author:   " ++ show (eventPubkey event)
```

#### Low-Level API

Direct event creation and signing via `Nostr.Event` and `Nostr.Crypto`:

```haskell
import Nostr.Event
import Nostr.Crypto
import Nostr.Types

-- Create an event manually
createTextNote :: SecretKey -> Text -> IO Event
createTextNote sk content = do
  timestamp <- getCurrentTime
  let unsigned = UnsignedEvent
        { ueKind      = 1
        , ueContent   = content
        , ueTags      = []
        , ueCreatedAt = timestamp
        , uePubkey    = derivePubkey sk
        }
  signEvent sk unsigned
```

### Key Operations

```haskell
import Nostr.Keys
import Nostr.Bech32

-- Generate keys
keys <- generateKeys

-- From existing secret key (hex)
let sk = parseSecretKey "hex_string_here"

-- Bech32 encoding
let npub = toBech32Npub (publicKey keys)
let nsec = toBech32Nsec (secretKey keys)

-- Bech32 decoding
let Right pk = fromBech32Npub "npub1..."
```

### Contact Lists (NIP-02)

```haskell
-- Follow a user
let followEvent = newEvent
      { eventKind = ContactList
      , eventTags =
          [ PTag targetPubkey (Just "wss://relay.damus.io") (Just "alias")
          ]
      }
signed <- signEvent seckey followEvent
publish relay signed
```

### Event Deletion (NIP-09)

```haskell
-- Delete an event
let deleteEvent = newEvent
      { eventKind    = EventDeletion
      , eventContent = "posted by mistake"
      , eventTags    = [ETag eventIdToDelete]
      }
signed <- signEvent seckey deleteEvent
publish relay signed
```

### Querying Multiple Relays

```haskell
-- Query events across relays concurrently
let relays = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]
let filt = defaultFilter { filterKinds = Just [TextNote], filterLimit = Just 50 }

events <- queryRelays relays filt
-- Returns deduplicated events from all relays
forM_ events $ \ev ->
  putStrLn $ eventContent ev
```

### Type Safety

Haskell's type system enforces correctness at compile time:

```haskell
-- These are distinct types, not raw strings
newtype EventId   = EventId   ByteString
newtype PublicKey  = PublicKey ByteString
newtype SecretKey  = SecretKey ByteString
newtype Signature  = Signature ByteString

-- You cannot accidentally pass a public key where a secret key is expected
signEvent :: SecretKey -> UnsignedEvent -> IO Event  -- Type-safe
```

### Use Cases

- Type-safe Nostr clients with compile-time correctness guarantees
- Relay implementations leveraging Haskell's concurrency primitives (STM, async)
- Nostr bots and automation scripts
- Academic/research implementations of the Nostr protocol
