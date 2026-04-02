# nak -- Nostr Army Knife

**The definitive command-line tool for Nostr development, debugging, and scripting.**

- **Repository**: https://github.com/fiatjaf/nak
- **Author**: fiatjaf
- **Language**: Go
- **License**: Unlicense (public domain)

nak is the Swiss Army knife of Nostr. It handles event creation, relay queries, key management, NIP-19 encoding/decoding, event verification, remote signing, local relay serving, and much more. If you work with Nostr, nak should be your first install.

---

## Installation

### One-liner (recommended)

```bash
curl -sSL https://raw.githubusercontent.com/fiatjaf/nak/master/install.sh | sh
```

### Go install

```bash
go install github.com/fiatjaf/nak@latest
```

### Homebrew (macOS)

```bash
brew install nak
```

### Arch Linux

```bash
paru -S nak
# or
yay -S nak
```

### Nix

```bash
nix-env -iA nixpkgs.nak
```

### Binary downloads

Pre-built binaries for Linux, macOS, and Windows are available on the [GitHub releases page](https://github.com/fiatjaf/nak/releases).

### Docker

```bash
docker build -t nak .
docker run --rm nak --help
```

---

## Key Commands

### `nak event` -- Create and Publish Events

Create a Nostr event, sign it, and optionally publish it to relays.

```bash
# Create a kind 1 text note (prints signed JSON to stdout)
nak event --content "Hello Nostr!" --sec <nsec-or-hex>

# Publish directly to relays
nak event --content "Hello from nak" --sec <nsec> wss://relay.damus.io wss://nos.lol

# Create a specific event kind
nak event --kind 30023 --content "Long-form article..." --sec <nsec>

# Add tags
nak event --content "Tagged post" -t p=<pubkey-hex> -t t=nostr --sec <nsec>

# Set a custom created_at timestamp
nak event --content "Backdated" --created-at 1700000000 --sec <nsec>

# Create an event with proof-of-work (NIP-13)
nak event --content "PoW note" --pow 20 --sec <nsec>

# Publish using a bunker URI (NIP-46, no direct key exposure)
nak event --content "Signed remotely" --connect <bunker-uri> wss://relay.damus.io
```

**Key flags:**
- `--content`, `-c` -- event content
- `--kind`, `-k` -- event kind (default: 1)
- `--sec` -- private key (hex or nsec)
- `--connect` -- bunker URI for remote signing
- `-t` -- add tags (format: `key=value` or `key=v1=v2=...`)
- `--pow` -- required proof-of-work difficulty
- `--created-at` -- Unix timestamp

### `nak req` -- Query Relays

Send REQ filters to relays and stream matching events.

```bash
# Query recent kind 1 events from a relay
nak req -k 1 -l 10 wss://relay.damus.io

# Query events by a specific author (hex pubkey)
nak req -k 1 -a <pubkey-hex> wss://nos.lol

# Query by multiple authors
nak req -a <pubkey1> -a <pubkey2> wss://relay.damus.io

# Query by tag
nak req -t t=nostr wss://relay.damus.io

# Query multiple kinds
nak req -k 0 -k 3 -a <pubkey-hex> wss://relay.damus.io

# Query with a time range (since/until as Unix timestamps)
nak req -k 1 --since 1700000000 --until 1700086400 wss://relay.damus.io

# Query multiple relays simultaneously
nak req -k 1 -l 5 wss://relay.damus.io wss://nos.lol wss://relay.nostr.band

# Stream events (stay connected, print as they arrive)
nak req -k 1 --stream wss://relay.damus.io
```

**Key flags:**
- `-k`, `--kind` -- filter by event kind
- `-a`, `--author` -- filter by author pubkey (hex)
- `-t`, `--tag` -- filter by tag (format: `key=value`)
- `-l`, `--limit` -- maximum number of events to return
- `--since` -- events after this Unix timestamp
- `--until` -- events before this Unix timestamp
- `--stream` -- keep connection open and stream new events
- `-e` -- filter by event ID

### `nak decode` -- Decode NIP-19 Entities

Decode bech32-encoded NIP-19 strings (npub, nsec, note, nprofile, nevent, naddr) into their raw components.

```bash
# Decode an npub to hex pubkey
nak decode npub1xxxxxx...

# Decode an nsec to hex private key
nak decode nsec1xxxxxx...

# Decode a note ID
nak decode note1xxxxxx...

# Decode an nprofile (pubkey + relay hints)
nak decode nprofile1xxxxxx...

# Decode an nevent (event ID + relay hints + author)
nak decode nevent1xxxxxx...

# Decode an naddr (parameterized replaceable event reference)
nak decode naddr1xxxxxx...
```

Output is JSON with the decoded fields:

```json
{
  "pubkey": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
  "relays": ["wss://relay.damus.io"]
}
```

### `nak encode` -- Encode to NIP-19

Encode raw hex values into bech32 NIP-19 format.

```bash
# Encode a hex pubkey as npub
nak encode npub <hex-pubkey>

# Encode a hex private key as nsec
nak encode nsec <hex-privkey>

# Encode a hex event ID as note
nak encode note <hex-event-id>

# Encode an nprofile with relay hints
nak encode nprofile <hex-pubkey> --relay wss://relay.damus.io --relay wss://nos.lol

# Encode an nevent with relay hints
nak encode nevent <hex-event-id> --relay wss://relay.damus.io --author <hex-pubkey>

# Encode an naddr (parameterized replaceable event coordinate)
nak encode naddr --kind 30023 --pubkey <hex-pubkey> --identifier <d-tag-value>
```

### `nak key` -- Key Generation and Conversion

Generate keys, derive public keys, and handle NIP-49 encryption.

```bash
# Generate a new private key (outputs hex)
nak key generate

# Derive public key from private key
nak key public <hex-or-nsec-privkey>

# Encrypt a private key with a passphrase (NIP-49 -> ncryptsec)
nak key encrypt <hex-or-nsec-privkey>
# (prompts for passphrase)

# Decrypt an ncryptsec back to nsec
nak key decrypt <ncryptsec>
# (prompts for passphrase)
```

### `nak relay` -- Relay Information

Fetch relay metadata (NIP-11 information document).

```bash
# Get relay information
nak relay wss://relay.damus.io

# Query multiple relays
nak relay wss://relay.damus.io wss://nos.lol wss://relay.nostr.band
```

Returns the relay's NIP-11 document (name, description, supported NIPs, limitations, etc.).

### `nak verify` -- Verify Event Signatures

Validate that a Nostr event's `id` and `sig` fields are correct.

```bash
# Verify an event from stdin
echo '{"id":"...","pubkey":"...","sig":"...","kind":1,...}' | nak verify

# Verify an event from a file
nak verify < event.json
```

Returns silently on success, error message on failure. Useful for debugging signing issues.

### `nak bunker` -- NIP-46 Remote Signing

Run a local NIP-46 bunker for remote signing, or connect to an external one.

```bash
# Start a bunker with your private key
nak bunker --sec <nsec> wss://relay.damus.io
# Outputs a bunker:// URI that clients can connect to

# Start a bunker with persistent metadata
nak bunker --sec <nsec> --name "My Bunker" wss://relay.damus.io

# Generate a QR code for the bunker URI
nak bunker --sec <nsec> --qr wss://relay.damus.io
```

The bunker listens on specified relays and responds to NIP-46 signing requests from authorized clients.

### `nak serve` -- Serve a Local Relay

Run a local Nostr relay for development and testing.

```bash
# Start a basic local relay
nak serve

# Start with verbose logging
nak serve --verbose

# Start with negentropy (NIP-77) support
nak serve --negentropy

# Start a GRASP server
nak serve --grasp
```

---

## Common Workflows

### Publish a Note from the CLI

```bash
# Generate a key (if you don't have one)
nak key generate
# -> outputs hex private key

# Publish a note
nak event --content "My first note from nak!" \
  --sec <your-hex-privkey> \
  wss://relay.damus.io wss://nos.lol
```

### Query Events by Author, Kind, and Tag

```bash
# Get someone's profile (kind 0)
nak req -k 0 -a <hex-pubkey> wss://relay.damus.io

# Get their recent notes (kind 1, last 20)
nak req -k 1 -a <hex-pubkey> -l 20 wss://relay.damus.io

# Get their follow list (kind 3)
nak req -k 3 -a <hex-pubkey> wss://relay.damus.io

# Find events tagged with a specific topic
nak req -k 1 -t t=bitcoin -l 10 wss://relay.nostr.band
```

### Decode an npub / nsec / nevent

```bash
# Who is this npub?
nak decode npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m
# -> {"pubkey": "8211..."}

# Then fetch their profile
nak req -k 0 -a 8211... wss://relay.damus.io

# Decode an nevent to find the relay hints
nak decode nevent1qqst...
# -> {"id": "abc...", "relays": ["wss://relay.damus.io"], "author": "..."}
```

### Test Relay Connectivity

```bash
# Check if a relay is reachable and get its NIP-11 info
nak relay wss://relay.damus.io

# Try querying it
nak req -k 1 -l 1 wss://relay.damus.io

# Test publishing (with a throwaway key)
nak key generate > /tmp/testkey
nak event --content "relay test" --sec $(cat /tmp/testkey) wss://relay.damus.io
```

### Debug Event Signing Issues

```bash
# Create an event without publishing (just print JSON)
nak event --content "test" --sec <nsec>

# Pipe to verify
nak event --content "test" --sec <nsec> | nak verify

# Inspect the raw event structure
nak event --content "test" --sec <nsec> | jq .

# Check if an event from a relay has a valid signature
nak req -k 1 -l 1 wss://relay.damus.io | nak verify
```

---

## Scripting with nak

nak is designed for Unix-style composition. Every command reads from stdin and writes to stdout.

### Piping Between nak Commands

```bash
# Fetch events and verify them all
nak req -k 1 -l 100 wss://relay.damus.io | nak verify

# Fetch an event, then republish to another relay
nak req -e <event-id> wss://relay.damus.io | nak event --publish wss://nos.lol

# Decode an npub, extract the pubkey, query their events
PUBKEY=$(nak decode npub1... | jq -r '.pubkey')
nak req -k 1 -a $PUBKEY -l 10 wss://relay.damus.io
```

### Integration with jq

```bash
# Get all note contents from an author
nak req -k 1 -a <pubkey> -l 50 wss://relay.damus.io | jq -r '.content'

# Get event IDs only
nak req -k 1 -l 10 wss://relay.damus.io | jq -r '.id'

# Extract all p-tags (mentioned pubkeys) from events
nak req -k 1 -l 50 wss://relay.damus.io | jq -r '.tags[] | select(.[0]=="p") | .[1]'

# Count events by kind
nak req -l 1000 wss://relay.damus.io | jq -r '.kind' | sort | uniq -c | sort -rn

# Pretty-print a specific event
nak req -e <event-id> wss://relay.damus.io | jq .
```

### Batch Operations

```bash
# Publish to many relays from a file
RELAYS=$(cat relays.txt)  # one wss:// URL per line
nak event --content "Broadcast" --sec <nsec> $RELAYS

# Query multiple authors from a file
while read PUBKEY; do
  nak req -k 0 -a "$PUBKEY" wss://relay.damus.io
done < pubkeys.txt

# Sync events between relays using negentropy
nak req -k 1 -a <pubkey> wss://old-relay.example.com | \
  nak event --publish wss://new-relay.example.com
```

### Environment Variables

```bash
# Avoid passing --sec every time
export NOSTR_SECRET_KEY=nsec1...
nak event --content "No --sec needed"
```

---

## Advanced Features

### Gift Wrapping (NIP-59)

```bash
# Encrypt an event to a specific recipient
nak event --content "Secret message" --sec <sender-nsec> | \
  nak giftwrap --to <recipient-pubkey>
```

### File Uploads (Blossom)

```bash
# Upload a file to a Blossom server
nak blossom upload <file> --server https://blossom.example.com --sec <nsec>

# Download a file
nak blossom download <hash> --server https://blossom.example.com
```

### Wallet Operations (NIP-60)

```bash
# List wallet balances
nak wallet list --sec <nsec> wss://relay.damus.io

# Send a payment
nak wallet send --amount 1000 --to <recipient> --sec <nsec>
```

### Negentropy Sync (NIP-77)

```bash
# Efficient sync between two relays
nak req --negentropy -a <pubkey> wss://source-relay.com wss://dest-relay.com
```

### Git Operations (NIP-34)

```bash
# Clone a Nostr-hosted git repository
nak git clone <naddr>

# Push changes
nak git push --sec <nsec>
```

---

## Tips

- Use `nak --help` and `nak <command> --help` liberally -- the built-in help is good.
- Pipe everything through `jq` for readability: `nak req ... | jq .`
- When debugging, create events without publishing (omit relay URLs) to inspect the JSON.
- Use `nak key generate | nak key public` to quickly generate a keypair.
- The `--sec` flag accepts hex, nsec, and ncryptsec formats.
- Combine with `watch` for live monitoring: `watch -n 5 'nak req -k 1 -l 3 wss://relay.damus.io | jq -r .content'`

---

## See Also

- [Signers](signers/) -- nos2x, Amber, nsec.app for delegated key management
- [NIP-19 (Bech32 Encoding)](../nips/core/nip-19.md)
- [NIP-46 (Remote Signing)](../nips/security/) -- the bunker protocol nak implements
- [NIP-01 (Core Protocol)](../nips/core/nip-01.md) -- understanding events and relays
