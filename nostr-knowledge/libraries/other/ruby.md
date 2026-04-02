# Ruby Nostr Libraries

## Overview

The Ruby ecosystem has two primary Nostr libraries, each with a different focus.

| Library | Gem | Focus | NIPs | Repo |
|---------|-----|-------|------|------|
| wilsonsilva/nostr | `nostr` | Async client, typed | 4 (01, 02, 04, 19) | [GitHub](https://github.com/wilsonsilva/nostr) |
| dtonon/nostr-ruby | `nostr_ruby` | Event creation, messaging | 10+ | [GitHub](https://github.com/dtonon/nostr-ruby) |

---

## wilsonsilva/nostr

An asynchronous, type-safe Nostr client library for Ruby. Emphasizes code quality with 100% test coverage, RBS type signatures, and RuboCop linting.

**Documentation:** [nostr-ruby.com](https://www.nostr-ruby.com/)

### Installation

```ruby
# Gemfile
gem 'nostr'

# or directly
gem install nostr
```

### Supported NIPs

NIP-01 (basic protocol), NIP-02 (contact lists), NIP-04 (encrypted direct messages), NIP-19 (bech32 encoding).

### Usage

```ruby
require 'nostr'

# --- Key Generation ---

keygen = Nostr::Keygen.new

# Generate a new keypair
keypair = keygen.generate_key_pair
puts "Public key: #{keypair.public_key}"
puts "Private key: #{keypair.private_key}"

# Derive from existing private key
keypair = keygen.extract_key_pair(keypair.private_key)

# --- Event Creation ---

user = Nostr::User.new(keypair: keypair)

# Create and sign a text note
event = user.create_event(
  kind: Nostr::EventKind::TEXT_NOTE,
  content: 'Hello Nostr from Ruby!'
)

# --- Relay Connection ---

relay = Nostr::Relay.new(url: 'wss://relay.damus.io', name: 'Damus')
client = Nostr::Client.new

client.on(:connect) do
  puts 'Connected to relay'

  # Publish event
  client.publish(event)

  # Subscribe to events
  filter = Nostr::Filter.new(
    kinds: [Nostr::EventKind::TEXT_NOTE],
    limit: 25
  )
  client.subscribe(filter: filter)
end

client.on(:message) do |message|
  puts "Received: #{message}"
end

client.on(:error) do |error|
  puts "Error: #{error.message}"
end

# Connect (non-blocking)
client.connect(relay)
```

### Features

- Non-blocking I/O for relay connections
- Full RBS type annotations for editor autocompletion
- Clean separation of `Keygen`, `User`, `Client`, `Relay`, and `Filter` classes

---

## dtonon/nostr-ruby

A Ruby library focused on event creation, encryption, and relay interaction. More NIP coverage than wilsonsilva/nostr but less emphasis on type safety.

**Gem:** `nostr_ruby`

> **Note:** This library is under active development. The current version has breaking API changes from v0.2.0.

### Installation

```ruby
# Gemfile
gem 'nostr_ruby'

# or directly
gem install nostr_ruby
```

### Supported NIPs

NIP-01, 02, 04 (deprecated, use NIP-17), 05, 13 (proof of work), 17 (private messages), 19 (bech32 entities), 26 (delegation).

### Usage

```ruby
require 'nostr_ruby'

# --- Key Generation ---

private_key = Nostr::Key.generate_private_key
public_key = Nostr::Key.get_public_key(private_key)

# Bech32 encoding/decoding
npub = Nostr::Key.to_bech32('npub', public_key)
nsec = Nostr::Key.to_bech32('nsec', private_key)

# --- Client Initialization ---

client = Nostr::Client.new(private_key: private_key)

# --- Publishing Events ---

# Text note
event = client.create_event(
  kind: 1,
  content: 'Hello from nostr_ruby!'
)
client.publish(event, relay: 'wss://relay.damus.io')

# Async publishing
client.publish_async(event, relay: 'wss://relay.damus.io')

# --- Profile Management ---

profile = client.set_metadata(
  name: 'RubyDev',
  about: 'Building with nostr_ruby',
  picture: 'https://example.com/avatar.jpg',
  nip05: 'rubydev@example.com'
)

# --- Encrypted Direct Messages ---

# NIP-04 (deprecated but supported)
encrypted = client.encrypt(recipient_pubkey, 'Secret message')
decrypted = client.decrypt(sender_pubkey, encrypted_content)

# --- Entity Encoding ---

# Encode to nprofile, nevent, naddr
nprofile = Nostr::Bech32.encode_nprofile(public_key, ['wss://relay.damus.io'])
nevent = Nostr::Bech32.encode_nevent(event_id, ['wss://relay.damus.io'], public_key)

# Proof of work
client.difficulty = 20  # Require 20 leading zero bits
pow_event = client.create_event(kind: 1, content: 'PoW note')
```

---

## Choosing Between Them

| Criteria | wilsonsilva/nostr | dtonon/nostr-ruby |
|----------|-------------------|-------------------|
| Type safety (RBS) | Yes | No |
| Test coverage | 100% | Partial |
| NIP coverage | 4 NIPs | 10+ NIPs |
| Encryption | NIP-04 | NIP-04, NIP-17 |
| Proof of work | No | Yes (NIP-13) |
| Delegation | No | Yes (NIP-26) |
| API stability | Stable | Breaking changes |
| Best for | Production clients needing type safety | Broader NIP coverage, scripting |
