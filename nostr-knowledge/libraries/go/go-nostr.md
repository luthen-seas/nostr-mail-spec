# go-nostr Deep Dive

> **Import**: `github.com/nbd-wtf/go-nostr` (v0.52.x, maintenance mode)
> **Successor**: `fiatjaf.com/nostr` (active development, pre-v1)
> **License**: MIT
> **Go Version**: 1.21+

go-nostr is the canonical Go library for the Nostr protocol. It provides types, relay communication, cryptographic operations, and NIP-specific helpers for building Nostr clients and tools.

---

## Table of Contents

- [Installation](#installation)
- [Package Structure](#package-structure)
- [Core Types](#core-types)
- [Key Generation and Management](#key-generation-and-management)
- [Event Creation and Signing](#event-creation-and-signing)
- [Relay Connections](#relay-connections)
- [Subscription Patterns](#subscription-patterns)
- [Filter Construction](#filter-construction)
- [SimplePool -- Multi-Relay Operations](#simplepool----multi-relay-operations)
- [NIP Sub-Packages](#nip-sub-packages)
- [Context Usage and Cancellation](#context-usage-and-cancellation)
- [Error Handling Patterns](#error-handling-patterns)
- [Logging and Debugging](#logging-and-debugging)
- [Build Tags](#build-tags)
- [Transition to fiatjaf.com/nostr](#transition-to-fiatjafcomnostr)

---

## Installation

```bash
go get github.com/nbd-wtf/go-nostr
```

For specific NIP sub-packages:

```bash
go get github.com/nbd-wtf/go-nostr/nip19
go get github.com/nbd-wtf/go-nostr/nip44
go get github.com/nbd-wtf/go-nostr/nip46
```

---

## Package Structure

```
github.com/nbd-wtf/go-nostr/
    nostr.go            # Core types: Event, Filter, Tag, Tags, Timestamp
    relay.go            # Relay connection and subscription
    pool.go             # SimplePool for multi-relay
    connection.go       # Low-level WebSocket connection
    envelopes.go        # Protocol message types (EVENT, REQ, OK, etc.)
    keys.go             # Key generation and validation
    pointers.go         # EventPointer, ProfilePointer, EntityPointer
    kinds.go            # Event kind constants (100+ defined)
    filter.go           # Filter type and matching logic
    tags.go             # Tag and Tags types
    normalize.go        # URL normalization utilities
    subscription.go     # Subscription type and lifecycle
    nip04/              # Legacy encrypted DMs
    nip05/              # DNS identity verification
    nip13/              # Proof of work
    nip19/              # Bech32 encoding (nsec, npub, note, nprofile, nevent, naddr)
    nip42/              # Relay authentication
    nip44/              # Modern encrypted messages
    nip46/              # Remote signing (Nostr Connect)
    nip57/              # Lightning Zaps
    nip77/              # Negentropy sync
    sdk/                # High-level SDK with caching and outbox model
    libsecp256k1/       # Optional fast crypto backend
```

---

## Core Types

### Event

The fundamental Nostr data structure, mapping directly to the NIP-01 event JSON.

```go
type Event struct {
    ID        string    // 32-byte hex-encoded SHA-256 of the serialized event
    PubKey    string    // 32-byte hex-encoded public key of the event creator
    CreatedAt Timestamp // Unix timestamp in seconds
    Kind      int       // Event kind (0=metadata, 1=text note, etc.)
    Tags      Tags      // Array of tag arrays
    Content   string    // Arbitrary string content
    Sig       string    // 64-byte hex-encoded Schnorr signature
}
```

**Methods:**

```go
// Identity and validation
func (evt Event) GetID() string                      // Compute ID from content
func (evt Event) CheckID() bool                      // Verify ID matches computed
func (evt Event) Serialize() []byte                  // Serialize for hashing (NIP-01 format)

// Signing and verification
func (evt *Event) Sign(secretKey string) error       // Sign and set ID + Sig fields
func (evt Event) CheckSignature() (bool, error)      // Verify Schnorr signature

// Serialization
func (evt Event) MarshalJSON() ([]byte, error)
func (evt *Event) UnmarshalJSON(data []byte) error
```

### Filter

Specifies which events to retrieve from a relay (NIP-01 REQ filters).

```go
type Filter struct {
    IDs       []string   // Event IDs to match
    Kinds     []int      // Event kinds to match
    Authors   []string   // Public keys of authors
    Tags      TagMap     // Tag filters (e.g., #e, #p, #t)
    Since     *Timestamp // Events after this timestamp
    Until     *Timestamp // Events before this timestamp
    Limit     int        // Maximum number of events to return
    Search    string     // Full-text search (NIP-50)
    LimitZero bool       // True when the filter explicitly sets "limit":0
}
```

**Methods:**

```go
func (f Filter) Matches(event *Event) bool                           // Check if event passes filter
func (f Filter) MatchesIgnoringTimestampConstraints(event *Event) bool
func (f Filter) Clone() Filter                                       // Deep copy
```

### Tag and Tags

Tags are the extensible metadata system in Nostr events.

```go
type Tag []string    // e.g., ["e", "<event-id>", "<relay-url>"]
type Tags []Tag      // Array of tags
```

**Tag methods:**

```go
func (t Tag) Key() string              // First element (deprecated, use t[0])
func (t Tag) Value() string            // Second element (deprecated, use t[1])
func (t Tag) Relay() string            // Third element (deprecated, use t[2])
func (t Tag) Clone() Tag
func (t Tag) StartsWith(prefix []string) bool  // deprecated
```

**Tags methods:**

```go
// Primary query methods
func (tags Tags) Find(key string) Tag                           // First tag with this key
func (tags Tags) FindLast(key string) Tag                       // Last tag with this key
func (tags Tags) FindAll(key string) iter.Seq[Tag]              // Iterator over all with key
func (tags Tags) FindWithValue(key, value string) Tag           // Match key and second element
func (tags Tags) FindLastWithValue(key, value string) Tag
func (tags Tags) GetD() string                                  // Shorthand for "d" tag value
func (tags Tags) ContainsAny(tagName string, values []string) bool

// Deprecated query methods (still functional)
func (tags Tags) GetFirst(tagPrefix []string) *Tag
func (tags Tags) GetLast(tagPrefix []string) *Tag
func (tags Tags) GetAll(tagPrefix []string) Tags

// Mutation
func (tags Tags) AppendUnique(tag Tag) Tags                    // Append if not duplicate (deprecated)
func (tags Tags) FilterOut(tagPrefix []string) Tags             // Exclude matching (deprecated)
func (tags Tags) FilterOutInPlace(tagPrefix []string)

// Cloning
func (tags Tags) Clone() Tags                                  // Shallow copy
func (tags Tags) CloneDeep() Tags                              // Deep copy
```

### Timestamp

```go
type Timestamp int64

func Now() Timestamp                    // Current time as Nostr timestamp
func (t Timestamp) Time() time.Time    // Convert to Go time.Time
```

### Relay

Represents a WebSocket connection to a single Nostr relay.

```go
type Relay struct {
    URL               string
    Connection        *Connection
    Subscriptions     *xsync.MapOf[int64, *Subscription]
    ConnectionError   error
    AssumeValid       bool  // Skip signature verification if true
}
```

### Subscription

An active subscription to a relay, delivering events through a channel.

```go
type Subscription struct {
    Events <-chan *Event  // Channel of incoming events
    // unexported fields for lifecycle management
}
```

**Methods:**

```go
func (sub *Subscription) GetID() string
func (sub *Subscription) Unsub()                                // Unsubscribe
func (sub *Subscription) Close()                                // Close subscription
func (sub *Subscription) Fire() error                           // Send/resend the REQ
func (sub *Subscription) Sub(_ context.Context, filters Filters) // Update filters
```

### SimplePool

Manages connections to multiple relays with deduplication and batching.

```go
type SimplePool struct {
    // unexported connection management fields
}
```

### Pointer Types

References to Nostr entities, used with NIP-19 encoding.

```go
type ProfilePointer struct {
    PublicKey string
    Relays    []string
}

type EventPointer struct {
    ID     string
    Relays []string
    Author string
    Kind   int
}

type EntityPointer struct {
    PublicKey   string
    Kind        int
    Identifier  string
    Relays      []string
}
```

All implement the `Pointer` interface:

```go
type Pointer interface {
    AsTagReference() string
    AsTag() Tag
    AsFilter() Filter
    MatchesEvent(Event) bool
}
```

### Event Kind Constants

Over 100 event kind constants are defined:

```go
const (
    KindProfileMetadata         = 0
    KindTextNote                = 1
    KindRecommendServer         = 2
    KindFollowList              = 3
    KindEncryptedDirectMessage  = 4     // NIP-04 (deprecated)
    KindDeletion                = 5
    KindRepost                  = 6
    KindReaction                = 7
    KindSimpleGroupChat         = 9
    KindSimpleGroupThread       = 11
    KindRelayListMetadata       = 10002 // NIP-65
    KindGiftWrap                = 1059  // NIP-59
    KindZapRequest              = 9734
    KindZap                     = 9735
    KindArticle                 = 30023
    KindLiveEvent               = 30311
    KindCommunityDefinition     = 34550
    // ... and many more
)
```

**Kind classification helpers:**

```go
func IsRegularKind(kind int) bool       // Normal events
func IsReplaceableKind(kind int) bool   // 0, 3, or 10000-19999
func IsEphemeralKind(kind int) bool     // 20000-29999
func IsAddressableKind(kind int) bool   // 30000-39999
```

---

## Key Generation and Management

### Generate a New Key Pair

```go
import (
    "fmt"
    "github.com/nbd-wtf/go-nostr"
    "github.com/nbd-wtf/go-nostr/nip19"
)

// Generate hex-encoded secret key
sk := nostr.GeneratePrivateKey()  // returns 64-char hex string

// Derive public key
pk, err := nostr.GetPublicKey(sk)
if err != nil {
    log.Fatal(err)
}

// Encode to human-readable formats
nsec, _ := nip19.EncodePrivateKey(sk)   // "nsec1..."
npub, _ := nip19.EncodePublicKey(pk)    // "npub1..."

fmt.Println("Secret key (hex):", sk)
fmt.Println("Public key (hex):", pk)
fmt.Println("Secret key (bech32):", nsec)
fmt.Println("Public key (bech32):", npub)
```

### Validate Keys

```go
// Check if a string is a valid 32-byte hex public key
if nostr.IsValidPublicKey(pk) {
    fmt.Println("Valid public key")
}

// General 32-byte hex validation
if nostr.IsValid32ByteHex(someHex) {
    fmt.Println("Valid 32-byte hex string")
}
```

### Keyer, Signer, and Cipher Interfaces

For abstracted key management (useful with NIP-46 remote signing):

```go
// Signer can sign events
type Signer interface {
    Sign(ctx context.Context, event *Event) (*Event, error)
}

// Cipher can encrypt/decrypt
type Cipher interface {
    Encrypt(ctx context.Context, plaintext, recipientPublicKey string) (string, error)
    Decrypt(ctx context.Context, base64ciphertext, senderPublicKey string) (string, error)
}

// Keyer combines both
type Keyer interface {
    Signer
    Cipher
}
```

---

## Event Creation and Signing

### Create and Sign a Text Note

```go
sk := nostr.GeneratePrivateKey()
pk, _ := nostr.GetPublicKey(sk)

evt := nostr.Event{
    PubKey:    pk,
    CreatedAt: nostr.Now(),
    Kind:      nostr.KindTextNote,
    Tags:      nostr.Tags{},
    Content:   "Hello from go-nostr!",
}

// Sign sets both evt.ID and evt.Sig
err := evt.Sign(sk)
if err != nil {
    log.Fatal(err)
}

// Verify
valid, err := evt.CheckSignature()
fmt.Printf("Valid signature: %v\n", valid)
fmt.Printf("Event ID: %s\n", evt.ID)
```

### Create an Event with Tags

```go
// Reply to another event
evt := nostr.Event{
    PubKey:    pk,
    CreatedAt: nostr.Now(),
    Kind:      nostr.KindTextNote,
    Content:   "This is a reply!",
    Tags: nostr.Tags{
        {"e", parentEventID, "wss://relay.example.com", "reply"},
        {"p", parentAuthorPubKey},
        {"t", "nostr"},
    },
}
evt.Sign(sk)
```

### Create a Replaceable Event (Profile Metadata)

```go
evt := nostr.Event{
    PubKey:    pk,
    CreatedAt: nostr.Now(),
    Kind:      nostr.KindProfileMetadata, // Kind 0
    Content:   `{"name":"satoshi","about":"Building on Nostr","picture":"https://example.com/avatar.png"}`,
}
evt.Sign(sk)
```

### Create an Addressable Event (Article)

```go
evt := nostr.Event{
    PubKey:    pk,
    CreatedAt: nostr.Now(),
    Kind:      nostr.KindArticle, // Kind 30023
    Content:   "# My Article\n\nLong-form content here...",
    Tags: nostr.Tags{
        {"d", "my-article-slug"},       // Required identifier for addressable events
        {"title", "My Article"},
        {"summary", "A summary of the article"},
        {"published_at", "1700000000"},
    },
}
evt.Sign(sk)
```

---

## Relay Connections

### Connect to a Single Relay

```go
ctx := context.Background()

// RelayConnect creates a Relay and calls Connect
relay, err := nostr.RelayConnect(ctx, "wss://relay.damus.io")
if err != nil {
    log.Fatal(err)
}
defer relay.Close()

fmt.Printf("Connected to %s\n", relay.URL)
```

### Connect with Options

```go
relay := nostr.NewRelay(ctx, "wss://relay.damus.io",
    nostr.WithNoticeHandler(func(notice string) {
        log.Printf("NOTICE from relay: %s\n", notice)
    }),
    nostr.WithRequestHeader(http.Header{
        "User-Agent": []string{"my-nostr-client/1.0"},
    }),
)

err := relay.Connect(ctx)
if err != nil {
    log.Fatal(err)
}
defer relay.Close()
```

### Connect with TLS Configuration

```go
tlsConfig := &tls.Config{
    InsecureSkipVerify: true, // for testing only
}
err := relay.ConnectWithTLS(ctx, tlsConfig)
```

### Publish an Event

```go
err := relay.Publish(ctx, evt)
if err != nil {
    // Error could be:
    // - Connection closed
    // - Event rejected by relay (check OKEnvelope reason)
    // - Context timeout/cancellation
    log.Printf("Failed to publish: %v\n", err)
}
```

### NIP-42 Authentication

```go
err := relay.Auth(ctx, func(event *nostr.Event) error {
    // Sign the auth challenge event
    return event.Sign(sk)
})
if err != nil {
    log.Printf("Auth failed: %v\n", err)
}
```

### Query Events Synchronously

```go
events, err := relay.QuerySync(ctx, nostr.Filter{
    Kinds:   []int{nostr.KindTextNote},
    Authors: []string{pk},
    Limit:   20,
})
if err != nil {
    log.Fatal(err)
}

for _, evt := range events {
    fmt.Printf("[%s] %s\n", evt.CreatedAt.Time().Format(time.RFC3339), evt.Content)
}
```

---

## Subscription Patterns

### Basic Subscription

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

sub, err := relay.Subscribe(ctx, nostr.Filters{{
    Kinds:   []int{nostr.KindTextNote},
    Authors: []string{pk},
    Limit:   10,
}})
if err != nil {
    log.Fatal(err)
}

// Range over the Events channel -- blocks until context is canceled or relay closes
for evt := range sub.Events {
    fmt.Printf("%s: %s\n", evt.PubKey[:8], evt.Content)
}
```

### Long-Running Subscription with Goroutine

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

sub, err := relay.Subscribe(ctx, nostr.Filters{{
    Kinds: []int{nostr.KindTextNote},
    Since: func() *nostr.Timestamp { t := nostr.Now(); return &t }(),
}})
if err != nil {
    log.Fatal(err)
}

// Process events in the background
go func() {
    for evt := range sub.Events {
        handleEvent(evt)
    }
    fmt.Println("Subscription closed")
}()

// Do other work...
time.Sleep(5 * time.Minute)
cancel() // This closes the subscription and stops the goroutine
```

### Subscription with Duplicate Checking

```go
sub, err := relay.Subscribe(ctx, filters,
    nostr.WithCheckDuplicate(),             // Deduplicate by event ID
    nostr.WithCheckDuplicateReplaceable(),  // Deduplicate replaceable events
    nostr.WithLabel("my-sub"),              // Label for debugging
)
```

### Manual Subscription Lifecycle

```go
// Prepare without sending REQ
sub := relay.PrepareSubscription(ctx, filters)

// Manually fire the subscription
err := sub.Fire()
if err != nil {
    log.Fatal(err)
}

// Update filters on the fly
sub.Sub(ctx, nostr.Filters{{
    Kinds: []int{nostr.KindReaction},
    Since: func() *nostr.Timestamp { t := nostr.Now(); return &t }(),
}})

// Explicitly unsubscribe (sends CLOSE to relay)
sub.Unsub()
```

---

## Filter Construction

### Simple Filters

```go
// Get the latest 50 text notes from a specific author
filter := nostr.Filter{
    Kinds:   []int{nostr.KindTextNote},
    Authors: []string{"hexPubKey1234..."},
    Limit:   50,
}

// Get specific events by ID
filter := nostr.Filter{
    IDs: []string{"hexEventId1...", "hexEventId2..."},
}

// Get events within a time range
since := nostr.Timestamp(time.Now().Add(-24 * time.Hour).Unix())
until := nostr.Now()
filter := nostr.Filter{
    Kinds: []int{nostr.KindTextNote},
    Since: &since,
    Until: &until,
}
```

### Tag Filters

```go
// Events referencing a specific event (replies, reactions, etc.)
filter := nostr.Filter{
    Kinds: []int{nostr.KindTextNote, nostr.KindReaction},
    Tags: nostr.TagMap{
        "e": []string{"target-event-id-hex"},
    },
}

// Events mentioning a specific user
filter := nostr.Filter{
    Tags: nostr.TagMap{
        "p": []string{"target-pubkey-hex"},
    },
}

// Events with specific hashtags
filter := nostr.Filter{
    Kinds: []int{nostr.KindTextNote},
    Tags: nostr.TagMap{
        "t": []string{"bitcoin", "nostr"},
    },
}
```

### Full-Text Search (NIP-50)

```go
filter := nostr.Filter{
    Kinds:  []int{nostr.KindTextNote},
    Search: "go-nostr tutorial",
    Limit:  20,
}
```

### Filter Matching

```go
// Check if an event matches a filter (client-side)
if filter.Matches(&event) {
    fmt.Println("Event matches filter")
}

// Compare filters for equality
if nostr.FilterEqual(filter1, filter2) {
    fmt.Println("Filters are identical")
}

// Get theoretical maximum events a filter could return
maxEvents := nostr.GetTheoreticalLimit(filter)
```

---

## SimplePool -- Multi-Relay Operations

SimplePool manages connections to multiple relays, handling deduplication, batching, and connection lifecycle.

### Create a Pool

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

pool := nostr.NewSimplePool(ctx,
    nostr.WithPenaltyBox(),                    // Temporarily disable failing relays
    nostr.WithDuplicateMiddleware(),           // Deduplicate events across relays
    nostr.WithAuthHandler(func(ctx context.Context, relay *nostr.Relay, challenge string) error {
        // Handle NIP-42 auth for any relay in the pool
        return relay.Auth(ctx, func(event *nostr.Event) error {
            return event.Sign(sk)
        })
    }),
)
defer pool.Close("shutting down")
```

### Subscribe to Multiple Relays

```go
relays := []string{
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
}

filter := nostr.Filter{
    Kinds:   []int{nostr.KindTextNote},
    Authors: []string{pk},
    Limit:   50,
}

// SubscribeMany keeps the subscription open (long-running)
for relayEvent := range pool.SubscribeMany(ctx, relays, filter) {
    fmt.Printf("[%s] %s: %s\n",
        relayEvent.Relay.URL,
        relayEvent.Event.PubKey[:8],
        relayEvent.Event.Content,
    )
}
```

### Fetch with EOSE (End of Stored Events)

```go
// FetchMany closes after receiving EOSE from all relays
for relayEvent := range pool.FetchMany(ctx, relays, filter) {
    fmt.Printf("Got event: %s\n", relayEvent.Event.ID[:8])
}
fmt.Println("All stored events received")
```

### Query a Single Event

```go
// QuerySingle returns the first matching event across all relays
result := pool.QuerySingle(ctx, relays, nostr.Filter{
    IDs: []string{targetEventID},
})
if result != nil {
    fmt.Printf("Found event on %s: %s\n", result.Relay.URL, result.Event.Content)
}
```

### Publish to Multiple Relays

```go
for result := range pool.PublishMany(ctx, relays, evt) {
    if result.Error != nil {
        fmt.Printf("Failed on %s: %v\n", result.RelayURL, result.Error)
    } else {
        fmt.Printf("Published to %s\n", result.RelayURL)
    }
}
```

### Batched Subscriptions (Directed Filters)

Send different filters to different relays in a single operation:

```go
directedFilters := []nostr.DirectedFilter{
    {
        Relay: "wss://relay.damus.io",
        Filter: nostr.Filter{
            Kinds:   []int{nostr.KindTextNote},
            Authors: []string{author1},
            Limit:   10,
        },
    },
    {
        Relay: "wss://nos.lol",
        Filter: nostr.Filter{
            Kinds:   []int{nostr.KindTextNote},
            Authors: []string{author2},
            Limit:   10,
        },
    },
}

for relayEvent := range pool.BatchedSubManyEose(ctx, directedFilters) {
    fmt.Printf("Event from %s\n", relayEvent.Relay.URL)
}
```

### Count Events

```go
count := pool.CountMany(ctx, relays, nostr.Filter{
    Kinds:   []int{nostr.KindTextNote},
    Authors: []string{pk},
}, nil)
fmt.Printf("Total events: %d\n", count)
```

### Fetch Replaceable Events

```go
// Returns a concurrent map keyed by ReplaceableKey
results := pool.FetchManyReplaceable(ctx, relays, nostr.Filter{
    Kinds:   []int{nostr.KindProfileMetadata},
    Authors: []string{pk1, pk2, pk3},
})

results.Range(func(key nostr.ReplaceableKey, event *nostr.Event) bool {
    fmt.Printf("Profile for %s: %s\n", key.PubKey[:8], event.Content)
    return true // continue iterating
})
```

---

## NIP Sub-Packages

### nip04 -- Legacy Encrypted Direct Messages

> **Deprecated**: NIP-04 has known security weaknesses. Use NIP-44 for new implementations.

```go
import "github.com/nbd-wtf/go-nostr/nip04"

// Encrypt
sharedSecret, err := nip04.ComputeSharedSecret(recipientPubKey, senderSecretKey)
ciphertext, err := nip04.Encrypt(plaintext, sharedSecret)

// Decrypt
plaintext, err := nip04.Decrypt(ciphertext, sharedSecret)
```

### nip05 -- DNS Identity Verification

Verifies `user@domain.com` identifiers by querying `https://domain.com/.well-known/nostr.json?name=user`.

```go
import "github.com/nbd-wtf/go-nostr/nip05"

// Verify a NIP-05 identifier
result, err := nip05.QueryIdentifier(ctx, "satoshi@example.com")
if err == nil && result.PublicKey == expectedPubKey {
    fmt.Println("Verified!")
}
```

### nip13 -- Proof of Work

Generate events with a target difficulty (leading zero bits in the event ID).

```go
import "github.com/nbd-wtf/go-nostr/nip13"

// Check difficulty of an existing event
difficulty := nip13.Difficulty(eventID)

// Generate PoW for an event (mines a nonce tag)
event, err := nip13.Generate(event, targetDifficulty, timeout)
```

### nip19 -- Bech32 Encoding/Decoding

The most widely-used sub-package, providing human-readable encoding for Nostr identifiers.

```go
import "github.com/nbd-wtf/go-nostr/nip19"

// Encode keys
nsec, err := nip19.EncodePrivateKey(hexSecretKey)      // "nsec1..."
npub, err := nip19.EncodePublicKey(hexPublicKey)        // "npub1..."

// Encode event references
note, err := nip19.EncodeNote(hexEventID)               // "note1..."

// Encode with relay hints (shareable identifiers)
nprofile, err := nip19.EncodeProfile(hexPubKey, []string{
    "wss://relay.damus.io",
    "wss://nos.lol",
})  // "nprofile1..."

nevent, err := nip19.EncodeEvent(hexEventID, []string{
    "wss://relay.damus.io",
}, authorHexPubKey)  // "nevent1..."

naddr, err := nip19.EncodeEntity(hexPubKey, 30023, "article-slug", []string{
    "wss://relay.damus.io",
})  // "naddr1..."

// Decode any NIP-19 string
prefix, value, err := nip19.Decode("npub1abc...")
switch prefix {
case "npub":
    pubkey := value.(string)
case "nsec":
    seckey := value.(string)
case "note":
    eventID := value.(string)
case "nprofile":
    profile := value.(nostr.ProfilePointer)
    fmt.Println(profile.PublicKey, profile.Relays)
case "nevent":
    event := value.(nostr.EventPointer)
    fmt.Println(event.ID, event.Relays, event.Author)
case "naddr":
    entity := value.(nostr.EntityPointer)
    fmt.Println(entity.PublicKey, entity.Kind, entity.Identifier)
}

// Convert to Pointer interface
pointer, err := nip19.ToPointer("nevent1...")
```

### nip42 -- Relay Authentication

NIP-42 defines the AUTH flow where a relay challenges a client. This is handled at the Relay level:

```go
// On a single relay
err := relay.Auth(ctx, func(event *nostr.Event) error {
    return event.Sign(sk)
})

// On a pool (handles auth for all relays automatically)
pool := nostr.NewSimplePool(ctx,
    nostr.WithAuthHandler(func(ctx context.Context, relay *nostr.Relay, challenge string) error {
        return relay.Auth(ctx, func(event *nostr.Event) error {
            return event.Sign(sk)
        })
    }),
)
```

### nip44 -- Modern Encrypted Messages

NIP-44 is the replacement for NIP-04, using XChaCha20 with proper padding and an audited design.

```go
import "github.com/nbd-wtf/go-nostr/nip44"

// Step 1: Generate a conversation key (deterministic from both parties' keys)
conversationKey, err := nip44.GenerateConversationKey(recipientPubKey, senderSecretKey)
if err != nil {
    log.Fatal(err)
}

// Step 2: Encrypt
ciphertext, err := nip44.Encrypt(plaintext, conversationKey)
if err != nil {
    log.Fatal(err)
}

// Step 3: Decrypt (recipient uses the same conversation key derivation)
conversationKey, err = nip44.GenerateConversationKey(senderPubKey, recipientSecretKey)
plaintext, err := nip44.Decrypt(ciphertext, conversationKey)
```

**Constants:**

```go
const (
    MinPlaintextSize = 0x0001  // 1 byte, padded to 32 bytes
    MaxPlaintextSize = 0xffff  // 65535 bytes (64KB - 1)
)
```

**Testing with custom nonce:**

```go
ciphertext, err := nip44.Encrypt(plaintext, conversationKey,
    nip44.WithCustomNonce(nonceBytes),
)
```

### nip46 -- Remote Signing (Nostr Connect)

NIP-46 allows a client to request signing from a remote signer (bunker), keeping the secret key on a separate device.

```go
import "github.com/nbd-wtf/go-nostr/nip46"

// The nip46 package provides:
// - BunkerClient for connecting to remote signers
// - Methods: connect, sign_event, nip44_encrypt, nip44_decrypt
// - NIP-44 encrypted communication channel between client and signer
```

### nip57 -- Lightning Zaps

```go
import "github.com/nbd-wtf/go-nostr/nip57"

// nip57 provides helpers for:
// - Creating zap request events (kind 9734)
// - Validating zap receipt events (kind 9735)
// - Extracting zap amounts and sender info
```

### nip77 -- Negentropy Sync

```go
import "github.com/nbd-wtf/go-nostr/nip77"

// nip77 provides the negentropy set reconciliation protocol
// for efficient sync between relays and clients
```

### sdk -- High-Level Client SDK

The SDK package provides a higher-level abstraction with caching and outbox model support:

```go
import "github.com/nbd-wtf/go-nostr/sdk"

// The SDK provides:
// - Automatic relay discovery via NIP-65 (relay list metadata)
// - Profile caching
// - Outbox model for finding events across the user's declared relays
// - Data loading utilities
```

---

## Context Usage and Cancellation

Context is the primary lifecycle management mechanism in go-nostr. Every relay operation accepts a `context.Context`.

### Timeouts

```go
// 5-second timeout for a subscription
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

sub, err := relay.Subscribe(ctx, filters)
for evt := range sub.Events {
    // Channel closes when context expires
    processEvent(evt)
}
// After 5 seconds, subscription auto-closes
```

### Cancellation

```go
ctx, cancel := context.WithCancel(context.Background())

// Start a long-running subscription
go func() {
    sub, _ := relay.Subscribe(ctx, filters)
    for evt := range sub.Events {
        processEvent(evt)
    }
}()

// Later: cancel everything
cancel()
// All subscriptions, connections, and goroutines using this context are cleaned up
```

### Nested Contexts for Scoped Operations

```go
// App-level context
appCtx, appCancel := context.WithCancel(context.Background())
defer appCancel()

pool := nostr.NewSimplePool(appCtx)

// Per-query context with timeout
queryCtx, queryCancel := context.WithTimeout(appCtx, 10*time.Second)
defer queryCancel()

events := pool.FetchMany(queryCtx, relays, filter)
for evt := range events {
    // Process events -- stops after 10 seconds or when appCtx is canceled
}
```

### Critical: Goroutine Leak Prevention

From the go-nostr documentation:

> "Remember to cancel subscriptions, either by calling `.Unsub()` on them or ensuring their `context.Context` will be canceled at some point. If you don't do that they will keep creating a new goroutine for every new event."

```go
// WRONG -- goroutine leak
sub, _ := relay.Subscribe(context.Background(), filters) // no cancel, no timeout
// Events pile up if nobody reads from sub.Events

// CORRECT -- always cancel
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
sub, _ := relay.Subscribe(ctx, filters)
```

---

## Error Handling Patterns

### Connection Errors

```go
relay, err := nostr.RelayConnect(ctx, "wss://relay.example.com")
if err != nil {
    // Common errors:
    // - DNS resolution failure
    // - TCP connection refused
    // - WebSocket handshake failure
    // - Context deadline exceeded
    log.Printf("Failed to connect: %v\n", err)
    return
}
```

### Publish Errors

```go
err := relay.Publish(ctx, evt)
if err != nil {
    // The error may contain the relay's rejection reason
    // from the OK message (NIP-01)
    log.Printf("Publish error: %v\n", err)
}
```

### Subscription Errors

```go
sub, err := relay.Subscribe(ctx, filters)
if err != nil {
    // Could fail if:
    // - Relay is disconnected
    // - Context already canceled
    log.Printf("Subscribe error: %v\n", err)
    return
}
```

### Pool Error Handling

```go
// PublishMany provides per-relay results
for result := range pool.PublishMany(ctx, relays, evt) {
    if result.Error != nil {
        log.Printf("Failed on %s: %v\n", result.RelayURL, result.Error)
    }
}

// EnsureRelay for explicit connection checks
relay, err := pool.EnsureRelay("wss://relay.example.com")
if err != nil {
    log.Printf("Cannot connect to relay: %v\n", err)
}
```

---

## Logging and Debugging

### Default Loggers

By default, logging is discarded:

```go
var (
    InfoLogger  = log.New(io.Discard, "[go-nostr][info] ", log.LstdFlags)
    DebugLogger = log.New(io.Discard, "[go-nostr][debug] ", log.LstdFlags)
)
```

### Enable Logging Programmatically

```go
import (
    "os"
    "github.com/nbd-wtf/go-nostr"
)

// Enable info logging
nostr.InfoLogger.SetOutput(os.Stdout)

// Enable debug logging
nostr.DebugLogger.SetOutput(os.Stderr)
```

### Suppress Logging

```go
nostr.InfoLogger = log.New(io.Discard, "", 0)
```

---

## Build Tags

```bash
# Default: pure Go crypto, no logging
go build ./...

# Enable verbose info logging to stdout
go build -tags debug ./...

# Use fast libsecp256k1 (requires CGO and libsecp256k1 installed)
go build -tags libsecp256k1 ./...

# Both
go build -tags "debug libsecp256k1" ./...

# WebAssembly target
GOOS=js GOARCH=wasm go build ./...
```

---

## Protocol Message Envelopes

go-nostr provides typed envelopes for all NIP-01 protocol messages. All implement the `Envelope` interface:

```go
type Envelope interface {
    Label() string
    FromJSON(data string) error
    MarshalJSON() ([]byte, error)
    String() string
}
```

| Envelope Type | Wire Format | Direction |
|---------------|-------------|-----------|
| `EventEnvelope` | `["EVENT", <sub_id>, <event>]` | Both |
| `ReqEnvelope` | `["REQ", <sub_id>, <filter>...]` | Client -> Relay |
| `CloseEnvelope` | `["CLOSE", <sub_id>]` | Client -> Relay |
| `EOSEEnvelope` | `["EOSE", <sub_id>]` | Relay -> Client |
| `OKEnvelope` | `["OK", <event_id>, <accepted>, <msg>]` | Relay -> Client |
| `NoticeEnvelope` | `["NOTICE", <message>]` | Relay -> Client |
| `CountEnvelope` | `["COUNT", <sub_id>, <count>]` | Both |
| `AuthEnvelope` | `["AUTH", <challenge/event>]` | Both |
| `ClosedEnvelope` | `["CLOSED", <sub_id>, <reason>]` | Relay -> Client |

### Parsing Messages

```go
parser := nostr.NewMessageParser()
envelope, err := parser.ParseMessage(rawJSON)
if err != nil {
    log.Fatal(err)
}

switch env := envelope.(type) {
case *nostr.EventEnvelope:
    fmt.Printf("Event: %s\n", env.Event.ID)
case *nostr.OKEnvelope:
    fmt.Printf("OK: %s accepted=%v reason=%s\n", env.EventID, env.OK, env.Reason)
case *nostr.EOSEEnvelope:
    fmt.Printf("EOSE for subscription: %s\n", string(*env))
case *nostr.NoticeEnvelope:
    fmt.Printf("Notice: %s\n", string(*env))
}
```

---

## Transition to `fiatjaf.com/nostr`

The `nbd-wtf/go-nostr` repository is in maintenance mode. The rewrite at `fiatjaf.com/nostr` introduces:

### API Changes

```go
// OLD (nbd-wtf/go-nostr)
sk := nostr.GeneratePrivateKey()           // returns string
pk, _ := nostr.GetPublicKey(sk)            // string -> string
evt.Sign(sk)                                // accepts string

// NEW (fiatjaf.com/nostr)
sk := nostr.Generate()                     // returns SecretKey ([32]byte)
pk := sk.Public()                          // SecretKey -> PubKey
sk.Sign(&evt)                              // method on SecretKey

// OLD
sk := nostr.GeneratePrivateKey()           // hex string
// NEW
sk := nostr.Generate()                     // SecretKey
skHex := sk.Hex()                          // convert to hex when needed
sk, err := nostr.SecretKeyFromHex(hexStr)  // parse hex into SecretKey
```

### Type Changes

| Concept | nbd-wtf/go-nostr | fiatjaf.com/nostr |
|---------|------------------|-------------------|
| Secret key | `string` (hex) | `SecretKey` (`[32]byte`) |
| Public key | `string` (hex) | `PubKey` (`[32]byte`) |
| Event ID | `string` (hex) | `ID` (`[32]byte`) |
| Event kind | `int` | `Kind` (`uint16`) |
| Pool type | `SimplePool` | `Pool` |

### Module Layout

The new module is a monorepo:

```
fiatjaf.com/nostr              # Core library
fiatjaf.com/nostr/khatru       # Relay framework
fiatjaf.com/nostr/eventstore   # Storage backends (SQLite, LMDB, BoltDB, Bleve)
fiatjaf.com/nostr/sdk          # High-level client SDK
fiatjaf.com/nostr/keyer        # Key/bunker management
```

### Migration Advice

1. **New projects**: Use `fiatjaf.com/nostr@master`. It is under active development and will eventually stabilize at v1.
2. **Existing projects**: `nbd-wtf/go-nostr` remains functional and safe for production. Migrate when the new module reaches a stable release.
3. **Relay projects**: Use `fiatjaf.com/nostr/khatru@master` as the original `github.com/fiatjaf/khatru` is archived.

---

## Further Reading

- [go-nostr on pkg.go.dev](https://pkg.go.dev/github.com/nbd-wtf/go-nostr)
- [fiatjaf.com/nostr on pkg.go.dev](https://pkg.go.dev/fiatjaf.com/nostr)
- [nbd-wtf/go-nostr on GitHub](https://github.com/nbd-wtf/go-nostr)
- [Basic Usage Example](./examples/basic_usage.go)
- [Custom Relay Example](./examples/custom_relay.go)
