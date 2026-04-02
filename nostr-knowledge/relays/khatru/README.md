# Khatru: Deep Dive

> **Repository:** [github.com/fiatjaf/khatru](https://github.com/fiatjaf/khatru)
> **Package:** `github.com/fiatjaf/khatru` (v0.19.1)
> **License:** Unlicense (public domain)
> **Author:** fiatjaf
> **Language:** Go

Khatru is the most widely used Go framework for building custom NOSTR relays. It provides a minimal core with maximum flexibility through a hook-based architecture, allowing developers to build everything from a 10-line toy relay to a full-featured production system with custom policies, authentication, rate limiting, and pluggable storage.

---

## Table of Contents

1. [What Khatru Is](#what-khatru-is)
2. [Design Philosophy](#design-philosophy)
3. [Architecture](#architecture)
4. [Core API](#core-api)
5. [Event Lifecycle Hooks](#event-lifecycle-hooks)
6. [Storage Backends](#storage-backends)
7. [Built-in Policies](#built-in-policies)
8. [NIP Support](#nip-support)
9. [Authentication (NIP-42)](#authentication-nip-42)
10. [Rate Limiting](#rate-limiting)
11. [Management API (NIP-86)](#management-api-nip-86)
12. [Comparison with Other Relay Implementations](#comparison-with-other-relay-implementations)
13. [Ecosystem: Relays Built on Khatru](#ecosystem-relays-built-on-khatru)

---

## What Khatru Is

Khatru is a Go library, not a standalone relay binary. It gives you the building blocks to construct a NOSTR relay with whatever behavior you want. You bring your own:

- **Storage** -- in-memory maps, SQLite, LMDB, PostgreSQL, Elasticsearch, or anything else
- **Policies** -- which events to accept, which queries to allow, who can connect
- **Authentication** -- NIP-42 challenge-response, or no auth at all
- **HTTP endpoints** -- custom web pages, APIs, Blossom media storage

The framework compiles your relay into a **single static binary** that is trivial to deploy.

### Minimal Example

```go
package main

import (
    "fmt"
    "net/http"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "tiny relay"
    relay.Info.Description = "the smallest possible khatru relay"
    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

This compiles, runs, and responds to NIP-11 info requests. It just does not store anything yet.

---

## Design Philosophy

### Minimal Core, Maximum Hooks

Khatru deliberately avoids baking in opinions about storage, policy, or authentication. The core handles only:

- WebSocket connection lifecycle (upgrade, ping/pong, read/write)
- NOSTR message parsing (EVENT, REQ, CLOSE, COUNT, AUTH)
- NIP-11 relay information endpoint
- Event signature and ID verification
- The hook dispatch pipeline

Everything else is expressed as **slices of callback functions** that you append to. This means:

1. **No storage is included** -- you must wire up at least `StoreEvent` and `QueryEvents`
2. **No policies are enforced** -- by default, every event is accepted and every query is allowed
3. **Multiple callbacks stack** -- you can append several `RejectEvent` functions and they all run in sequence; the first one to reject wins
4. **Order matters** -- callbacks run in slice order, so put cheap checks first

### Why Slices of Functions?

Most relay frameworks use interfaces (implement `Storage`, implement `Policy`). Khatru uses `[]func(...)` instead. This is a deliberate design choice:

```go
// Interface approach (NOT how khatru works):
type EventStore interface {
    Save(ctx context.Context, event *nostr.Event) error
    Query(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error)
    Delete(ctx context.Context, event *nostr.Event) error
}

// Khatru's approach -- slices of functions:
relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
relay.StoreEvent = append(relay.StoreEvent, myAuditLogger)
relay.StoreEvent = append(relay.StoreEvent, myReplicationForwarder)
```

Benefits:
- **Composable** -- mix storage backends, add logging, add replication, all by appending
- **No wrapper types** -- no need to wrap a database in an adapter struct
- **Easy inline** -- simple policies are just anonymous functions
- **Multiple backends** -- store events in both LMDB and a search index simultaneously

---

## Architecture

### Request Flow

```
Client WebSocket Connection
         |
         v
  RejectConnection[] -----> reject? close connection
         |
         v
   WebSocket Upgrade
         |
         v
   OnConnect[] callbacks
         |
         v
  Message Read Loop
    |         |         |           |
    v         v         v           v
  EVENT      REQ      CLOSE       AUTH
    |         |         |           |
    v         v         v           v
 handleEvent handleReq  remove    NIP-42
    |         |       listener   verify
    v         v
(see below) (see below)
```

### EVENT Processing Pipeline

When a client sends an EVENT message:

```
1. Parse JSON envelope
2. Verify event ID (hash matches)
3. Verify event signature (schnorr)
4. Check NIP-70 protected event rules
5. Route by event kind:
   |
   +-- Ephemeral (20000-29999) --> OnEphemeralEvent[] --> broadcast to listeners
   |
   +-- Deletion (kind 5) --> handleDeleteRequest
   |       |
   |       v
   |   Query for target events
   |   OverwriteDeletionOutcome[] (optional override)
   |   DeleteEvent[] for each target
   |
   +-- Regular / Replaceable / Addressable --> handleNormal
           |
           v
       RejectEvent[] -----> any reject? --> send OK false
           |
           v
       Check if already deleted (query kind 5 events)
           |
           v
       [Regular kinds]          [Replaceable/Addressable kinds]
       StoreEvent[]             Check for existing older version
           |                    ReplaceEvent[] (if available)
           v                    OR: delete old + StoreEvent[]
       OnEventSaved[]                  |
           |                           v
           v                    OnEventSaved[]
       Register with                   |
       expiration manager              v
           |                    Register with
           v                    expiration manager
       OverwriteResponseEvent[]        |
           |                           v
           v                    OverwriteResponseEvent[]
       Broadcast to                    |
       matching listeners              v
                                Broadcast to
                                matching listeners
```

### REQ Processing Pipeline

When a client sends a REQ message:

```
1. Parse REQ envelope (subscription ID + filters)
2. For each filter:
   |
   v
   RejectFilter[] -----> any reject? --> send CLOSED
   |
   v
   OverwriteFilter[] (modify filter in-place)
   |
   v
   QueryEvents[] --> iterate results --> send EVENT messages
3. After all filters processed:
   |
   v
   Send EOSE (End of Stored Events)
   |
   v
   Register subscription as listener for future events
```

### COUNT Processing Pipeline

```
1. Parse COUNT envelope
2. For each filter:
   |
   v
   RejectCountFilter[] -----> any reject? --> send CLOSED
   |
   v
   CountEvents[] or CountEventsHLL[] --> aggregate
3. Send COUNT response
```

---

## Core API

### The Relay Struct

```go
type Relay struct {
    // Override auto-detected base URL
    ServiceURL string

    // NIP-11 relay information (editable)
    Info *nip11.RelayInformationDocument

    // Logger (default: stdlib logger prefixed "[khatru-relay] ")
    Log *log.Logger

    // Enable NIP-77 negentropy sync
    Negentropy bool

    // For Relay.Start() convenience method
    Addr string

    // WebSocket tuning
    WriteWait      time.Duration  // time allowed to write a message (default 10s)
    PongWait       time.Duration  // time allowed to read next pong (default 60s)
    PingPeriod     time.Duration  // ping interval, must be < PongWait (default 54s)
    MaxMessageSize int64          // max message size from peer (default 512KB)

    // --- Hook slices (see Event Lifecycle Hooks section) ---
    RejectConnection             []func(r *http.Request) bool
    OnConnect                    []func(ctx context.Context)
    OnDisconnect                 []func(ctx context.Context)
    RejectEvent                  []func(ctx context.Context, event *nostr.Event) (reject bool, msg string)
    StoreEvent                   []func(ctx context.Context, event *nostr.Event) error
    ReplaceEvent                 []func(ctx context.Context, event *nostr.Event) error
    DeleteEvent                  []func(ctx context.Context, event *nostr.Event) error
    OnEventSaved                 []func(ctx context.Context, event *nostr.Event)
    OnEphemeralEvent             []func(ctx context.Context, event *nostr.Event)
    OverwriteDeletionOutcome     []func(ctx context.Context, target *nostr.Event, deletion *nostr.Event) (acceptDeletion bool, msg string)
    RejectFilter                 []func(ctx context.Context, filter nostr.Filter) (reject bool, msg string)
    RejectCountFilter            []func(ctx context.Context, filter nostr.Filter) (reject bool, msg string)
    OverwriteFilter              []func(ctx context.Context, filter *nostr.Filter)
    QueryEvents                  []func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error)
    CountEvents                  []func(ctx context.Context, filter nostr.Filter) (int64, error)
    CountEventsHLL               []func(ctx context.Context, filter nostr.Filter, offset int) (int64, *hyperloglog.HyperLogLog, error)
    OverwriteRelayInformation    []func(ctx context.Context, r *http.Request, info nip11.RelayInformationDocument) nip11.RelayInformationDocument
    OverwriteResponseEvent       []func(ctx context.Context, event *nostr.Event)
    PreventBroadcast             []func(ws *WebSocket, event *nostr.Event) bool

    // NIP-86 Management API
    ManagementAPI RelayManagementAPI
}
```

### Constructor

```go
func NewRelay() *Relay
```

Creates a new Relay with sensible defaults:
- Supported NIPs: 1, 11, 40, 42, 70, 86
- WebSocket buffer sizes configured
- Default ping/pong/write timeouts
- NIP-40 expiration manager initialized

### Key Methods

```go
// ServeHTTP makes Relay implement http.Handler.
// Routes to WebSocket, NIP-11, NIP-86, or custom mux handlers.
func (rl *Relay) ServeHTTP(w http.ResponseWriter, r *http.Request)

// Router returns the internal http.ServeMux for adding custom HTTP routes.
func (rl *Relay) Router() *http.ServeMux

// Start is a convenience method that creates an HTTP server and listens.
func (rl *Relay) Start(host string, port int, started ...chan bool) error

// Shutdown gracefully shuts down the relay.
func (rl *Relay) Shutdown(ctx context.Context)

// AddEvent programmatically adds an event (as if a client sent it).
func (rl *Relay) AddEvent(ctx context.Context, evt *nostr.Event) (skipBroadcast bool, writeError error)

// BroadcastEvent sends an event to all connected clients with matching subscriptions.
// Returns the number of clients that received the event.
func (rl *Relay) BroadcastEvent(evt *nostr.Event) int

// GetListeningFilters returns all active subscription filters across all clients.
func (rl *Relay) GetListeningFilters() []nostr.Filter
```

### Context Helpers

These functions extract information from the `context.Context` passed to hook callbacks:

```go
// GetAuthed returns the authenticated public key, or "" if not authed.
func GetAuthed(ctx context.Context) string

// GetIP returns the client's IP address.
func GetIP(ctx context.Context) string

// GetIPFromRequest extracts IP from an HTTP request (X-Forwarded-For aware).
func GetIPFromRequest(r *http.Request) string

// GetConnection returns the *WebSocket for the current connection.
func GetConnection(ctx context.Context) *WebSocket

// GetSubscriptionID returns the current subscription ID.
func GetSubscriptionID(ctx context.Context) string

// RequestAuth signals that authentication is required for this connection.
func RequestAuth(ctx context.Context)

// IsInternalCall returns true when QueryEvents is called internally
// (e.g., during deletion or expiration processing).
func IsInternalCall(ctx context.Context) bool
```

### The WebSocket Struct

```go
type WebSocket struct {
    Request         *http.Request
    Context         context.Context

    // NIP-42 Authentication
    Challenge       string        // random challenge sent to client
    AuthedPublicKey string        // set after successful AUTH
    Authed          chan struct{} // closed when auth completes
}

func (ws *WebSocket) WriteJSON(any any) error
func (ws *WebSocket) WriteMessage(t int, b []byte) error
```

---

## Event Lifecycle Hooks

Every hook is a slice of functions. Multiple functions can be appended and they run in order. This section documents each hook, its signature, when it fires, and practical use cases.

### Connection Hooks

#### `RejectConnection []func(r *http.Request) bool`

Fires before the WebSocket upgrade. Return `true` to reject the connection.

```go
relay.RejectConnection = append(relay.RejectConnection,
    func(r *http.Request) bool {
        ip := khatru.GetIPFromRequest(r)
        return isBlacklisted(ip)
    },
)
```

Use cases: IP banning, geo-blocking, connection rate limiting.

#### `OnConnect []func(ctx context.Context)`

Fires after WebSocket upgrade completes. The context contains the connection info.

```go
relay.OnConnect = append(relay.OnConnect,
    func(ctx context.Context) {
        ip := khatru.GetIP(ctx)
        log.Printf("new connection from %s", ip)
    },
)
```

#### `OnDisconnect []func(ctx context.Context)`

Fires when a WebSocket connection closes.

```go
relay.OnDisconnect = append(relay.OnDisconnect,
    func(ctx context.Context) {
        log.Printf("client disconnected: %s", khatru.GetIP(ctx))
    },
)
```

### Event Acceptance Hooks

#### `RejectEvent []func(ctx context.Context, event *nostr.Event) (reject bool, msg string)`

Fires before an event is stored. Return `true` and a message to reject. The first function to reject stops the chain.

```go
relay.RejectEvent = append(relay.RejectEvent,
    // Block a specific pubkey
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        if event.PubKey == "fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52" {
            return true, "blocked: you are banned"
        }
        return false, ""
    },
    // Block events older than 24 hours
    policies.PreventTimestampsInThePast(24 * time.Hour),
    // Block events more than 15 minutes in the future
    policies.PreventTimestampsInTheFuture(15 * time.Minute),
    // Block events with base64 embedded media
    policies.RejectEventsWithBase64Media,
)
```

**Important:** The `msg` string has special meaning. If it starts with `"auth-required: "`, khatru will send an AUTH challenge to the client.

### Storage Hooks

#### `StoreEvent []func(ctx context.Context, event *nostr.Event) error`

Stores a regular (non-replaceable) event. All functions in the slice are called (not short-circuited on first success).

```go
relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
relay.StoreEvent = append(relay.StoreEvent, searchIndex.IndexEvent)
```

#### `ReplaceEvent []func(ctx context.Context, event *nostr.Event) error`

Handles replaceable and addressable events (kinds 0, 3, 10000-19999, 30000-39999). If not set, khatru falls back to manually querying for the old event, deleting it, and calling `StoreEvent`.

```go
relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)
```

#### `DeleteEvent []func(ctx context.Context, event *nostr.Event) error`

Deletes an event from storage. Called when processing kind-5 deletion events.

```go
relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
```

#### `OverwriteDeletionOutcome []func(ctx context.Context, target *nostr.Event, deletion *nostr.Event) (acceptDeletion bool, msg string)`

Override the default deletion behavior. Lets you prevent or allow deletions based on custom logic.

### Post-Storage Hooks

#### `OnEventSaved []func(ctx context.Context, event *nostr.Event)`

Fires after an event has been successfully stored. Useful for side effects like notifications, replication, or analytics.

```go
relay.OnEventSaved = append(relay.OnEventSaved,
    func(ctx context.Context, event *nostr.Event) {
        if event.Kind == 1 {
            log.Printf("new note from %s: %s", event.PubKey[:8], event.Content[:50])
        }
    },
)
```

#### `OnEphemeralEvent []func(ctx context.Context, event *nostr.Event)`

Fires for ephemeral events (kinds 20000-29999) which are broadcast but never stored.

### Query Hooks

#### `RejectFilter []func(ctx context.Context, filter nostr.Filter) (reject bool, msg string)`

Fires before a REQ filter is processed. Return `true` to reject the subscription.

```go
relay.RejectFilter = append(relay.RejectFilter,
    policies.NoComplexFilters,
    policies.NoEmptyFilters,
)
```

Like `RejectEvent`, returning a message starting with `"auth-required: "` will trigger NIP-42 authentication.

#### `RejectCountFilter []func(ctx context.Context, filter nostr.Filter) (reject bool, msg string)`

Same as `RejectFilter` but for COUNT requests (NIP-45).

#### `OverwriteFilter []func(ctx context.Context, filter *nostr.Filter)`

Modify a filter before it is used for querying. The filter is passed by pointer so you can mutate it in place.

```go
relay.OverwriteFilter = append(relay.OverwriteFilter,
    func(ctx context.Context, filter *nostr.Filter) {
        // Force a maximum limit of 100
        if filter.Limit == 0 || filter.Limit > 100 {
            filter.Limit = 100
        }
    },
)
```

#### `QueryEvents []func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error)`

The main query function. Returns a channel that yields matching events. The channel must be closed when done.

```go
relay.QueryEvents = append(relay.QueryEvents,
    func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
        ch := make(chan *nostr.Event)
        go func() {
            defer close(ch)
            for _, evt := range store {
                if filter.Matches(evt) {
                    ch <- evt
                }
            }
        }()
        return ch, nil
    },
)
```

#### `CountEvents []func(ctx context.Context, filter nostr.Filter) (int64, error)`

Returns a count of matching events (NIP-45).

### Response Hooks

#### `OverwriteRelayInformation []func(ctx context.Context, r *http.Request, info nip11.RelayInformationDocument) nip11.RelayInformationDocument`

Modify the NIP-11 response dynamically per request.

#### `OverwriteResponseEvent []func(ctx context.Context, event *nostr.Event)`

Modify events before they are sent to clients. Useful for redaction or annotation.

#### `PreventBroadcast []func(ws *WebSocket, event *nostr.Event) bool`

Prevent specific events from being broadcast to specific connected clients.

```go
relay.PreventBroadcast = append(relay.PreventBroadcast,
    func(ws *WebSocket, event *nostr.Event) bool {
        // Don't echo events back to the sender
        return ws.AuthedPublicKey == event.PubKey
    },
)
```

---

## Storage Backends

Khatru does not include any storage. You must provide your own by wiring up `StoreEvent`, `QueryEvents`, `DeleteEvent`, and optionally `ReplaceEvent` and `CountEvents`.

### The eventstore Package

The companion library [github.com/fiatjaf/eventstore](https://github.com/fiatjaf/eventstore) provides ready-made storage adapters that implement the exact function signatures khatru expects.

#### Available Backends

| Backend | Package | Notes |
|---------|---------|-------|
| **LMDB** | `github.com/fiatjaf/eventstore/lmdb` | Fast embedded KV store; recommended for production |
| **SQLite3** | `github.com/fiatjaf/eventstore/sqlite3` | Good all-around embedded database |
| **BoltDB/bbolt** | `github.com/fiatjaf/eventstore/bolt` | Pure Go embedded store |
| **PostgreSQL** | External / custom | Wire up your own using pgx |
| **Elasticsearch** | Example in khatru repo | Full-text search support |
| **Badger** | Example in khatru repo | Another Go embedded KV store |
| **In-memory** | Roll your own (see examples) | For testing or ephemeral relays |

#### Wiring Up an eventstore Backend

Every eventstore backend exposes the same interface. Here is the SQLite3 example:

```go
import (
    "github.com/fiatjaf/eventstore/sqlite3"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()

    db := sqlite3.SQLite3Backend{DatabaseURL: "/tmp/khatru-sqlite-tmp"}
    if err := db.Init(); err != nil {
        panic(err)
    }

    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.CountEvents = append(relay.CountEvents, db.CountEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
    relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

    http.ListenAndServe(":3334", relay)
}
```

And LMDB:

```go
import (
    "os"
    "github.com/fiatjaf/eventstore/lmdb"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()

    db := lmdb.LMDBBackend{Path: "/data/relay-lmdb"}
    os.MkdirAll(db.Path, 0o755)
    if err := db.Init(); err != nil {
        panic(err)
    }

    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.CountEvents = append(relay.CountEvents, db.CountEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)

    http.ListenAndServe(":3334", relay)
}
```

### Custom / In-Memory Storage

For testing or special use cases, you can implement storage with a simple map:

```go
store := make(map[string]*nostr.Event)
var mu sync.RWMutex

relay.StoreEvent = append(relay.StoreEvent,
    func(ctx context.Context, event *nostr.Event) error {
        mu.Lock()
        defer mu.Unlock()
        store[event.ID] = event
        return nil
    },
)

relay.QueryEvents = append(relay.QueryEvents,
    func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
        ch := make(chan *nostr.Event)
        go func() {
            defer close(ch)
            mu.RLock()
            defer mu.RUnlock()
            for _, evt := range store {
                if filter.Matches(evt) {
                    ch <- evt
                }
            }
        }()
        return ch, nil
    },
)

relay.DeleteEvent = append(relay.DeleteEvent,
    func(ctx context.Context, event *nostr.Event) error {
        mu.Lock()
        defer mu.Unlock()
        delete(store, event.ID)
        return nil
    },
)
```

### Multiple Backends Simultaneously

Because hooks are slices, you can store events in multiple places:

```go
// Primary storage
relay.StoreEvent = append(relay.StoreEvent, lmdbBackend.SaveEvent)
// Also index in Elasticsearch for search
relay.StoreEvent = append(relay.StoreEvent, esBackend.IndexEvent)
// Also forward to a backup relay
relay.StoreEvent = append(relay.StoreEvent, forwardToBackup)
```

---

## Built-in Policies

The `github.com/fiatjaf/khatru/policies` package provides reusable policy functions.

### Event Rejection Policies

```go
// Reject events with too many single-character (indexable) tags.
// ignoreKinds: exempt these kinds. onlyKinds: only apply to these kinds.
func PreventTooManyIndexableTags(max int, ignoreKinds []int, onlyKinds []int) func(context.Context, *nostr.Event) (bool, string)

// Reject events with tag values longer than maxTagValueLen.
func PreventLargeTags(maxTagValueLen int) func(context.Context, *nostr.Event) (bool, string)

// Only allow specific event kinds. Set allowEphemeral to always permit ephemeral events.
func RestrictToSpecifiedKinds(allowEphemeral bool, kinds ...uint16) func(context.Context, *nostr.Event) (bool, string)

// Reject events with timestamps too far in the past.
func PreventTimestampsInThePast(threshold time.Duration) func(context.Context, *nostr.Event) (bool, string)

// Reject events with timestamps too far in the future.
func PreventTimestampsInTheFuture(threshold time.Duration) func(context.Context, *nostr.Event) (bool, string)

// Reject events containing base64-encoded media (data:image/, data:video/).
func RejectEventsWithBase64Media(ctx context.Context, evt *nostr.Event) (bool, string)

// Only accept NIP-70 protected events.
func OnlyAllowNIP70ProtectedEvents(ctx context.Context, event *nostr.Event) (reject bool, msg string)
```

### Filter Rejection Policies

```go
// Reject filters that combine too many criteria (>4 items with >2 tags).
func NoComplexFilters(ctx context.Context, filter nostr.Filter) (bool, string)

// Require authentication for all queries.
func MustAuth(ctx context.Context, filter nostr.Filter) (bool, string)

// Reject empty filters (no kinds, IDs, authors, or tags).
func NoEmptyFilters(ctx context.Context, filter nostr.Filter) (bool, string)

// Prevent bots from syncing all kind:1 events without specifying authors.
func AntiSyncBots(ctx context.Context, filter nostr.Filter) (bool, string)

// Block search queries.
func NoSearchQueries(ctx context.Context, filter nostr.Filter) (bool, string)
```

### Filter Modification Policies

```go
// Strip search parameters from filters.
func RemoveSearchQueries(ctx context.Context, filter *nostr.Filter)

// Remove all event kinds except the specified ones.
func RemoveAllButKinds(kinds ...uint16) func(ctx context.Context, filter *nostr.Filter)

// Remove all tag filters except the specified tag names.
func RemoveAllButTags(tags ...string) func(ctx context.Context, filter *nostr.Filter)
```

### Rate Limiting

```go
// Rate limit EVENT submissions by client IP.
func EventIPRateLimiter(tokensPerInterval int, interval time.Duration, maxTokens int) func(context.Context, *nostr.Event) (bool, string)

// Rate limit EVENT submissions by event pubkey.
func EventPubKeyRateLimiter(tokensPerInterval int, interval time.Duration, maxTokens int) func(context.Context, *nostr.Event) (bool, string)

// Rate limit EVENT submissions by authenticated pubkey.
func EventAuthedPubKeyRateLimiter(tokensPerInterval int, interval time.Duration, maxTokens int) func(context.Context, *nostr.Event) (bool, string)

// Rate limit WebSocket connections by IP.
func ConnectionRateLimiter(tokensPerInterval int, interval time.Duration, maxTokens int) func(r *http.Request) bool

// Rate limit REQ filter queries by IP.
func FilterIPRateLimiter(tokensPerInterval int, interval time.Duration, maxTokens int) func(context.Context, nostr.Filter) (bool, string)
```

### Sane Defaults

Apply a curated set of sensible policies with one call:

```go
policies.ApplySaneDefaults(relay)
```

This appends:
- `RejectEventsWithBase64Media` to `RejectEvent`
- `EventIPRateLimiter(2, 3*time.Minute, 10)` to `RejectEvent`
- `NoComplexFilters` to `RejectFilter`
- `FilterIPRateLimiter(20, time.Minute, 100)` to `RejectFilter`
- `ConnectionRateLimiter(1, 5*time.Minute, 100)` to `RejectConnection`

---

## NIP Support

Khatru announces support for these NIPs by default: **1, 11, 40, 42, 70, 86**.

### Built-in NIP Support

| NIP | Description | How |
|-----|-------------|-----|
| NIP-01 | Basic protocol (EVENT, REQ, CLOSE) | Core WebSocket handler |
| NIP-11 | Relay information document | `relay.Info` + `HandleNIP11` |
| NIP-20 | Command results (OK messages) | Automatic for all EVENT processing |
| NIP-40 | Event expiration | Built-in `expirationManager` |
| NIP-42 | Authentication | `"auth-required: "` prefix in rejection messages |
| NIP-45 | Event counts | `CountEvents` / `CountEventsHLL` hooks |
| NIP-70 | Protected events | Checked before hook dispatch |
| NIP-77 | Negentropy sync | Set `relay.Negentropy = true` |
| NIP-86 | Relay management API | `relay.ManagementAPI` struct |

### Adding Support for Additional NIPs

To support a new NIP, implement the logic in the appropriate hooks:

```go
// Example: NIP-09 event deletion -- already built in, but for illustration:
// The handleDeleteRequest method processes kind-5 events automatically.

// Example: NIP-04 DM restrictions -- use RejectEvent
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        if event.Kind == 4 {
            authed := khatru.GetAuthed(ctx)
            if authed == "" {
                return true, "auth-required: you must authenticate to send DMs"
            }
            if authed != event.PubKey {
                return true, "you can only send DMs as yourself"
            }
        }
        return false, ""
    },
)

// Update the NIP-11 document to advertise support
relay.Info.SupportedNIPs = append(relay.Info.SupportedNIPs, 4)
```

---

## Authentication (NIP-42)

Khatru has built-in NIP-42 support. When a WebSocket connects, khatru automatically:

1. Generates a random challenge string
2. Stores it on the `WebSocket.Challenge` field
3. Sends an `AUTH` challenge message to the client

When the client responds with a signed AUTH event, khatru verifies it and sets `WebSocket.AuthedPublicKey`.

### Requiring Auth for Reads

```go
relay.RejectFilter = append(relay.RejectFilter,
    func(ctx context.Context, filter nostr.Filter) (reject bool, msg string) {
        if khatru.GetAuthed(ctx) == "" {
            return true, "auth-required: only authenticated users can read"
        }
        return false, ""
    },
)
```

The `"auth-required: "` prefix is special. When khatru sees this prefix in a rejection message, it:
1. Sends an `AUTH` challenge to the client (if not already sent)
2. Sends a `CLOSED` message with the reason
3. The client can then authenticate and re-send the REQ

### Requiring Auth for Writes

```go
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
        if khatru.GetAuthed(ctx) == "" {
            return true, "auth-required: authenticate to publish events"
        }
        return false, ""
    },
)
```

### Only Allow Specific Users

```go
allowedPubkeys := map[string]bool{
    "npub1...decoded_hex_pubkey...": true,
}

relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        authed := khatru.GetAuthed(ctx)
        if !allowedPubkeys[authed] {
            return true, "auth-required: you are not on the whitelist"
        }
        return false, ""
    },
)
```

### Using the Policies Helper

```go
// Require auth for all queries with one line:
relay.RejectFilter = append(relay.RejectFilter, policies.MustAuth)
```

---

## Rate Limiting

Khatru's policies package includes token-bucket rate limiters.

### Parameters

All rate limiters accept three parameters:
- `tokensPerInterval` -- how many tokens are added per interval
- `interval` -- the refill interval (e.g., `time.Minute`)
- `maxTokens` -- the maximum burst capacity

### Example: Multi-Layer Rate Limiting

```go
// Layer 1: Connection rate limit by IP
relay.RejectConnection = append(relay.RejectConnection,
    policies.ConnectionRateLimiter(1, 5*time.Minute, 100),
)

// Layer 2: Event submission rate limit by IP
relay.RejectEvent = append(relay.RejectEvent,
    policies.EventIPRateLimiter(5, time.Minute, 20),
)

// Layer 3: Event submission rate limit by pubkey
relay.RejectEvent = append(relay.RejectEvent,
    policies.EventPubKeyRateLimiter(3, time.Minute, 15),
)

// Layer 4: Query rate limit by IP
relay.RejectFilter = append(relay.RejectFilter,
    policies.FilterIPRateLimiter(30, time.Minute, 100),
)
```

---

## Management API (NIP-86)

Khatru supports NIP-86, which allows authenticated relay operators to manage the relay via JSON-RPC over HTTP.

```go
relay.ManagementAPI = khatru.RelayManagementAPI{
    RejectAPICall: []func(ctx context.Context, mp nip86.MethodParams) (bool, string){
        func(ctx context.Context, mp nip86.MethodParams) (bool, string) {
            authed := khatru.GetAuthed(ctx)
            if authed != "your-admin-pubkey-hex" {
                return true, "only the admin can use this API"
            }
            return false, ""
        },
    },
    BanPubKey: func(ctx context.Context, pubkey string, reason string) error {
        bannedKeys[pubkey] = true
        return nil
    },
    ListBannedPubKeys: func(ctx context.Context) ([]nip86.PubKeyReason, error) {
        // return list
    },
    // ... implement other methods as needed
}
```

The full `RelayManagementAPI` struct supports:
- `BanPubKey` / `AllowPubKey` / `ListBannedPubKeys` / `ListAllowedPubKeys`
- `BanEvent` / `AllowEvent` / `ListBannedEvents` / `ListAllowedEvents`
- `ListEventsNeedingModeration`
- `ChangeRelayName` / `ChangeRelayDescription` / `ChangeRelayIcon`
- `AllowKind` / `DisallowKind` / `ListAllowedKinds` / `ListDisAllowedKinds`
- `BlockIP` / `UnblockIP` / `ListBlockedIPs`
- `Stats`
- `GrantAdmin` / `RevokeAdmin`
- `Generic` (catch-all for custom methods)

---

## Comparison with Other Relay Implementations

### Khatru vs. relayer (Predecessor)

[relayer](https://github.com/fiatjaf/relayer) was fiatjaf's earlier Go relay framework. Key differences:

| Feature | relayer | khatru |
|---------|---------|--------|
| Architecture | Interface-based (`relayer.Storage`) | Hook-based (slices of functions) |
| Composability | Single storage backend | Multiple backends, stackable hooks |
| Policies | Manual implementation | Built-in policies package |
| NIP-42 Auth | Manual | Built-in with `"auth-required: "` convention |
| NIP-86 Management | No | Built-in |
| Negentropy (NIP-77) | No | Built-in |
| NIP-40 Expiration | No | Built-in expiration manager |
| Status | Deprecated | Active / maintenance mode |

Khatru is the spiritual successor to relayer. Migration is straightforward since the concepts map directly.

### Khatru vs. strfry

[strfry](https://github.com/hoytech/strfry) is a high-performance C++ relay.

| Feature | khatru (Go) | strfry (C++) |
|---------|-------------|--------------|
| Language | Go | C++ |
| Deployment | Single binary, easy cross-compile | Requires C++ toolchain |
| Customization | Full programmatic control via hooks | Config file + write policy plugin (external process) |
| Storage | Pluggable (LMDB, SQLite, etc.) | LMDB only |
| Performance | Good (Go runtime overhead) | Excellent (bare metal, zero-copy) |
| Negentropy | Supported | First-class support |
| Use case | Custom relay logic, specialized relays | High-throughput general-purpose relay |

**Choose khatru when:** you need custom business logic, authentication flows, or specialized relay behavior.

**Choose strfry when:** you need raw throughput and are okay with limited customization via an external write policy script.

### Khatru vs. nostr-rs-relay

[nostr-rs-relay](https://github.com/scsibug/nostr-rs-relay) is a Rust relay.

| Feature | khatru | nostr-rs-relay |
|---------|--------|----------------|
| Language | Go | Rust |
| Customization | Programmatic hooks | Configuration file |
| Storage | Pluggable | SQLite |
| Target | Framework for building custom relays | Ready-to-run relay binary |

---

## Ecosystem: Relays Built on Khatru

Khatru has spawned a rich ecosystem of specialized relays.

### wot-relay

> **Repository:** [github.com/bitvora/wot-relay](https://github.com/bitvora/wot-relay)

A Web of Trust relay that archives notes from people you follow, and people they follow. Configurable trust depth, minimum follower thresholds, and periodic refresh of the social graph.

Key features:
- Crawls the follow graph starting from an owner pubkey
- Configurable `MINIMUM_FOLLOWERS` threshold (default: 3)
- Periodic refresh of the WoT graph (`REFRESH_INTERVAL_HOURS`, default: 24)
- Archival sync from other relays
- Built on khatru with LMDB storage

### Haven

> **Repository:** [github.com/barrydeen/haven](https://github.com/barrydeen/haven)

HAVEN (High Availability Vault for Events on Nostr) is a personal relay designed for storing sensitive data: eCash tokens, private chats, drafts.

Key features:
- Private relay accessible only by the owner and whitelisted pubkeys (NIP-42 protected)
- Web of Trust filtering for the public-facing relay
- Whitelisting and blacklisting
- JSONL backup/restore with cloud backup support
- Built-in Blossom media server
- Blastr (forward notes to other relays)
- Import old notes from other relays

### Khatru Pyramid

> **Repository:** [github.com/github-tijlxyz/khatru-pyramid](https://github.com/github-tijlxyz/khatru-pyramid)

An invite-hierarchy relay where new users must be invited by existing members, creating a pyramid-shaped trust structure.

### Grain

> **Repository:** [github.com/0ceanSlim/grain](https://github.com/0ceanslim/grain)

GRAIN (Go Relay Architecture for Implementing Nostr) is a highly configurable multipurpose relay using MongoDB for storage. While not built directly on khatru, it is part of the same Go relay ecosystem and shares design ideas.

### nostr-relay-khatru

> **Repository:** [github.com/Yonle/nostr-relay-khatru](https://github.com/Yonle/nostr-relay-khatru)

A straightforward, ready-to-run NOSTR relay software built on the khatru module.

### nostr-relay (nogringo)

> **Repository:** [github.com/nogringo/nostr-relay](https://github.com/nogringo/nostr-relay)

A privacy-focused relay with NIP-59 (Gift Wrap), NIP-77 (Negentropy), NIP-17 (Private DMs), and NIP-42 (AUTH). Built with Go and khatru.

### relay29

> **Repository:** [github.com/fiatjaf/relay29](https://github.com/fiatjaf/relay29)

A NIP-29 group relay implementation by fiatjaf, built on khatru.

---

## Quick Reference

### Install

```bash
go get github.com/fiatjaf/khatru@latest
go get github.com/fiatjaf/eventstore@latest
```

### Typical Import Block

```go
import (
    "github.com/fiatjaf/khatru"
    "github.com/fiatjaf/khatru/policies"
    "github.com/fiatjaf/eventstore/sqlite3"  // or lmdb, bolt, etc.
    "github.com/nbd-wtf/go-nostr"
)
```

### Project Structure Convention

```
my-relay/
  main.go          # Entry point, relay setup
  storage.go       # Custom storage logic (if not using eventstore)
  policies.go      # Custom rejection/acceptance policies
  handlers.go      # Custom HTTP handlers
  go.mod
  go.sum
```

---

## Sources

- [khatru GitHub repository](https://github.com/fiatjaf/khatru)
- [khatru pkg.go.dev documentation](https://pkg.go.dev/github.com/fiatjaf/khatru)
- [khatru official site](https://khatru.nostr.technology/)
- [eventstore GitHub repository](https://github.com/fiatjaf/eventstore)
- [wot-relay GitHub](https://github.com/bitvora/wot-relay)
- [Haven GitHub](https://github.com/barrydeen/haven)
- [Khatru Pyramid GitHub](https://github.com/github-tijlxyz/khatru-pyramid)
- [Grain GitHub](https://github.com/0ceanslim/grain)
