# Building Custom NOSTR Relays with Khatru

A practical guide from zero to production-ready relay.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Minimal Relay (10 Lines)](#minimal-relay-10-lines)
3. [Adding Event Storage](#adding-event-storage)
4. [Adding Event Validation and Rejection Policies](#adding-event-validation-and-rejection-policies)
5. [Adding Authentication (NIP-42)](#adding-authentication-nip-42)
6. [Adding Rate Limiting](#adding-rate-limiting)
7. [Adding Custom HTTP Endpoints](#adding-custom-http-endpoints)
8. [Building a Paid Relay](#building-a-paid-relay)
9. [Building a WoT (Web of Trust) Relay](#building-a-wot-web-of-trust-relay)
10. [Building a Community Relay with Moderation](#building-a-community-relay-with-moderation)
11. [Testing Your Relay](#testing-your-relay)

---

## Prerequisites

### Install Go

Khatru requires Go 1.24+. Install from [go.dev/dl](https://go.dev/dl/).

### Create a Project

```bash
mkdir my-relay && cd my-relay
go mod init my-relay
go get github.com/fiatjaf/khatru@latest
go get github.com/nbd-wtf/go-nostr@latest
```

---

## Minimal Relay (10 Lines)

The absolute smallest relay that compiles and runs. It responds to NIP-11 info requests but has no storage, so it cannot accept or return events.

```go
package main

import (
    "fmt"
    "net/http"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "minimal relay"
    relay.Info.Description = "the smallest khatru relay possible"
    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

```bash
go run main.go
# Test NIP-11:
curl -H "Accept: application/nostr+json" http://localhost:3334
```

---

## Adding Event Storage

### Option A: In-Memory Storage

Good for testing and ephemeral relays. Events are lost on restart.

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "sync"

    "github.com/fiatjaf/khatru"
    "github.com/nbd-wtf/go-nostr"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "in-memory relay"

    // In-memory event store
    store := make(map[string]*nostr.Event)
    var mu sync.RWMutex

    // Store events
    relay.StoreEvent = append(relay.StoreEvent,
        func(ctx context.Context, event *nostr.Event) error {
            mu.Lock()
            defer mu.Unlock()
            store[event.ID] = event
            return nil
        },
    )

    // Query events
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

    // Delete events
    relay.DeleteEvent = append(relay.DeleteEvent,
        func(ctx context.Context, event *nostr.Event) error {
            mu.Lock()
            defer mu.Unlock()
            delete(store, event.ID)
            return nil
        },
    )

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

### Option B: SQLite Storage (Recommended for Getting Started)

Persistent, single-file database. No external services needed.

```bash
go get github.com/fiatjaf/eventstore@latest
```

```go
package main

import (
    "fmt"
    "net/http"

    "github.com/fiatjaf/eventstore/sqlite3"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "sqlite relay"
    relay.Info.Description = "a relay with persistent SQLite storage"

    // Initialize SQLite backend
    db := sqlite3.SQLite3Backend{DatabaseURL: "./relay.db"}
    if err := db.Init(); err != nil {
        panic(err)
    }

    // Wire up all storage functions
    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.CountEvents = append(relay.CountEvents, db.CountEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
    relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

### Option C: LMDB Storage (Recommended for Production)

High-performance embedded key-value store. Very fast reads.

```bash
go get github.com/fiatjaf/eventstore@latest
```

```go
package main

import (
    "fmt"
    "net/http"
    "os"

    "github.com/fiatjaf/eventstore/lmdb"
    "github.com/fiatjaf/khatru"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "lmdb relay"

    db := lmdb.LMDBBackend{Path: "./data/relay-lmdb"}
    os.MkdirAll(db.Path, 0o755)
    if err := db.Init(); err != nil {
        panic(err)
    }

    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.CountEvents = append(relay.CountEvents, db.CountEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

---

## Adding Event Validation and Rejection Policies

### Using Built-in Policies

The `policies` package ships with common validations.

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "time"

    "github.com/fiatjaf/eventstore/sqlite3"
    "github.com/fiatjaf/khatru"
    "github.com/fiatjaf/khatru/policies"
    "github.com/nbd-wtf/go-nostr"
)

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "policy relay"

    // Storage setup (abbreviated)
    db := sqlite3.SQLite3Backend{DatabaseURL: "./relay.db"}
    if err := db.Init(); err != nil {
        panic(err)
    }
    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
    relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

    // --- Event rejection policies ---

    // Reject events with base64-encoded media
    relay.RejectEvent = append(relay.RejectEvent, policies.RejectEventsWithBase64Media)

    // Reject events older than 30 days
    relay.RejectEvent = append(relay.RejectEvent,
        policies.PreventTimestampsInThePast(30 * 24 * time.Hour),
    )

    // Reject events more than 15 minutes in the future
    relay.RejectEvent = append(relay.RejectEvent,
        policies.PreventTimestampsInTheFuture(15 * time.Minute),
    )

    // Reject events with too many indexable tags
    relay.RejectEvent = append(relay.RejectEvent,
        policies.PreventTooManyIndexableTags(10, nil, nil),
    )

    // Reject events with oversized tag values
    relay.RejectEvent = append(relay.RejectEvent,
        policies.PreventLargeTags(256),
    )

    // --- Filter rejection policies ---

    // Block overly complex queries
    relay.RejectFilter = append(relay.RejectFilter, policies.NoComplexFilters)

    // Block empty filters (no criteria)
    relay.RejectFilter = append(relay.RejectFilter, policies.NoEmptyFilters)

    // Block sync bots that try to fetch all kind:1 without authors
    relay.RejectFilter = append(relay.RejectFilter, policies.AntiSyncBots)

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

### The One-Line Shortcut

For a quick and reasonable default policy set:

```go
policies.ApplySaneDefaults(relay)
```

This adds:
- `RejectEventsWithBase64Media`
- `EventIPRateLimiter(2, 3*time.Minute, 10)`
- `NoComplexFilters`
- `FilterIPRateLimiter(20, time.Minute, 100)`
- `ConnectionRateLimiter(1, 5*time.Minute, 100)`

### Writing Custom Policies

Custom policies are just functions with the right signature.

```go
// Only allow specific event kinds
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        allowedKinds := map[int]bool{
            0:     true,  // metadata
            1:     true,  // short text note
            3:     true,  // contacts
            7:     true,  // reaction
            10002: true,  // relay list
        }
        if !allowedKinds[event.Kind] {
            return true, fmt.Sprintf("kind %d is not allowed on this relay", event.Kind)
        }
        return false, ""
    },
)

// Ban specific pubkeys
bannedPubkeys := map[string]bool{
    "hexkey1...": true,
    "hexkey2...": true,
}

relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        if bannedPubkeys[event.PubKey] {
            return true, "blocked: you are banned from this relay"
        }
        return false, ""
    },
)

// Content filtering -- reject notes containing certain words
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        if event.Kind == 1 {
            blockedWords := []string{"spam", "scam", "free bitcoin"}
            lower := strings.ToLower(event.Content)
            for _, word := range blockedWords {
                if strings.Contains(lower, word) {
                    return true, "blocked: content policy violation"
                }
            }
        }
        return false, ""
    },
)
```

---

## Adding Authentication (NIP-42)

Khatru has NIP-42 built in. The key mechanism is the `"auth-required: "` prefix in rejection messages, which triggers the AUTH flow.

### Auth for Reads Only

```go
relay.RejectFilter = append(relay.RejectFilter,
    func(ctx context.Context, filter nostr.Filter) (bool, string) {
        if khatru.GetAuthed(ctx) == "" {
            return true, "auth-required: please authenticate to read from this relay"
        }
        return false, ""
    },
)
```

### Auth for Writes Only

```go
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        if khatru.GetAuthed(ctx) == "" {
            return true, "auth-required: please authenticate to write to this relay"
        }
        return false, ""
    },
)
```

### Auth for Everything

```go
relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        if khatru.GetAuthed(ctx) == "" {
            return true, "auth-required: authenticate to publish"
        }
        return false, ""
    },
)
relay.RejectFilter = append(relay.RejectFilter, policies.MustAuth)
```

### Whitelist-Only Relay

Only specific pubkeys can read and write.

```go
package main

import (
    "context"
    "fmt"
    "net/http"

    "github.com/fiatjaf/eventstore/sqlite3"
    "github.com/fiatjaf/khatru"
    "github.com/nbd-wtf/go-nostr"
)

var allowedPubkeys = map[string]bool{
    "a1b2c3d4e5f6...": true,  // alice
    "f6e5d4c3b2a1...": true,  // bob
}

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "private relay"
    relay.Info.Description = "invitation-only relay"

    db := sqlite3.SQLite3Backend{DatabaseURL: "./private-relay.db"}
    if err := db.Init(); err != nil {
        panic(err)
    }
    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
    relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

    // Require auth and whitelist for writes
    relay.RejectEvent = append(relay.RejectEvent,
        func(ctx context.Context, event *nostr.Event) (bool, string) {
            authed := khatru.GetAuthed(ctx)
            if authed == "" {
                return true, "auth-required: this is a private relay"
            }
            if !allowedPubkeys[authed] {
                return true, "restricted: you are not on the whitelist"
            }
            return false, ""
        },
    )

    // Require auth and whitelist for reads
    relay.RejectFilter = append(relay.RejectFilter,
        func(ctx context.Context, filter nostr.Filter) (bool, string) {
            authed := khatru.GetAuthed(ctx)
            if authed == "" {
                return true, "auth-required: this is a private relay"
            }
            if !allowedPubkeys[authed] {
                return true, "restricted: you are not on the whitelist"
            }
            return false, ""
        },
    )

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

---

## Adding Rate Limiting

### Basic Rate Limiting

```go
import "github.com/fiatjaf/khatru/policies"

// Limit connections: 1 new connection per 5 minutes per IP, burst of 100
relay.RejectConnection = append(relay.RejectConnection,
    policies.ConnectionRateLimiter(1, 5*time.Minute, 100),
)

// Limit event submissions: 5 events per minute per IP, burst of 20
relay.RejectEvent = append(relay.RejectEvent,
    policies.EventIPRateLimiter(5, time.Minute, 20),
)

// Limit queries: 30 queries per minute per IP, burst of 100
relay.RejectFilter = append(relay.RejectFilter,
    policies.FilterIPRateLimiter(30, time.Minute, 100),
)
```

### Multi-Layer Rate Limiting

Combine IP-based and pubkey-based limits:

```go
// IP-level: catch distributed attacks from a single IP
relay.RejectEvent = append(relay.RejectEvent,
    policies.EventIPRateLimiter(10, time.Minute, 30),
)

// Pubkey-level: prevent any single user from flooding
relay.RejectEvent = append(relay.RejectEvent,
    policies.EventPubKeyRateLimiter(5, time.Minute, 15),
)

// Authenticated pubkey-level: stricter limits for authed users
relay.RejectEvent = append(relay.RejectEvent,
    policies.EventAuthedPubKeyRateLimiter(3, time.Minute, 10),
)
```

### Custom Rate Limiter

If you need something beyond token buckets:

```go
import (
    "sync"
    "time"
)

type rateLimiter struct {
    mu      sync.Mutex
    counts  map[string]int
    resetAt time.Time
    window  time.Duration
    limit   int
}

func newRateLimiter(window time.Duration, limit int) *rateLimiter {
    return &rateLimiter{
        counts: make(map[string]int),
        resetAt: time.Now().Add(window),
        window:  window,
        limit:   limit,
    }
}

func (rl *rateLimiter) allow(key string) bool {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    if time.Now().After(rl.resetAt) {
        rl.counts = make(map[string]int)
        rl.resetAt = time.Now().Add(rl.window)
    }
    rl.counts[key]++
    return rl.counts[key] <= rl.limit
}

// Usage:
limiter := newRateLimiter(time.Minute, 10)

relay.RejectEvent = append(relay.RejectEvent,
    func(ctx context.Context, event *nostr.Event) (bool, string) {
        ip := khatru.GetIP(ctx)
        if !limiter.allow(ip) {
            return true, "rate-limited: too many events, slow down"
        }
        return false, ""
    },
)
```

---

## Adding Custom HTTP Endpoints

Khatru's `Relay` implements `http.Handler`, and you can add routes to its internal mux.

### Custom Landing Page

```go
mux := relay.Router()

mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    // Skip if this is a WebSocket upgrade or NIP-11 request
    if r.Header.Get("Upgrade") == "websocket" {
        relay.HandleWebsocket(w, r)
        return
    }
    if r.Header.Get("Accept") == "application/nostr+json" {
        relay.HandleNIP11(w, r)
        return
    }

    w.Header().Set("Content-Type", "text/html; charset=utf-8")
    fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>My Nostr Relay</title></head>
<body>
    <h1>Welcome to My Nostr Relay</h1>
    <p>Connect with: <code>wss://myrelay.example.com</code></p>
    <p>This relay accepts kind 1 notes from authenticated users.</p>
</body>
</html>`)
})
```

### REST API for Relay Stats

```go
mux := relay.Router()

mux.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    filters := relay.GetListeningFilters()
    json.NewEncoder(w).Encode(map[string]any{
        "active_subscriptions": len(filters),
        "uptime":              time.Since(startTime).String(),
    })
})
```

### Health Check Endpoint

```go
mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ok"))
})
```

---

## Building a Paid Relay

A relay that requires Lightning payment to publish events. This example uses NIP-42 auth to identify the payer and checks a database of paid users.

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "sync"
    "time"

    "github.com/fiatjaf/eventstore/sqlite3"
    "github.com/fiatjaf/khatru"
    "github.com/fiatjaf/khatru/policies"
    "github.com/nbd-wtf/go-nostr"
)

// Paid subscribers (in production, use a real database)
var (
    paidUsers   = make(map[string]time.Time) // pubkey -> expiration
    paidUsersMu sync.RWMutex
)

func isPaid(pubkey string) bool {
    paidUsersMu.RLock()
    defer paidUsersMu.RUnlock()
    exp, ok := paidUsers[pubkey]
    return ok && time.Now().Before(exp)
}

func addPaidUser(pubkey string, duration time.Duration) {
    paidUsersMu.Lock()
    defer paidUsersMu.Unlock()
    paidUsers[pubkey] = time.Now().Add(duration)
}

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "paid relay"
    relay.Info.Description = "a relay that requires payment to publish"
    relay.Info.Limitation = &nip11.RelayLimitations{
        PaymentRequired: true,
    }

    // Storage
    db := sqlite3.SQLite3Backend{DatabaseURL: "./paid-relay.db"}
    if err := db.Init(); err != nil {
        panic(err)
    }
    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
    relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

    // Reading is free
    // Writing requires payment
    relay.RejectEvent = append(relay.RejectEvent,
        func(ctx context.Context, event *nostr.Event) (bool, string) {
            authed := khatru.GetAuthed(ctx)
            if authed == "" {
                return true, "auth-required: authenticate to publish"
            }
            if !isPaid(authed) {
                return true, "restricted: payment required -- visit https://myrelay.example.com/pay"
            }
            return false, ""
        },
    )

    // Rate limits even for paid users
    relay.RejectEvent = append(relay.RejectEvent,
        policies.EventPubKeyRateLimiter(10, time.Minute, 50),
    )

    // Sane defaults for filters
    relay.RejectFilter = append(relay.RejectFilter, policies.NoComplexFilters)

    // Custom payment endpoint
    mux := relay.Router()
    mux.HandleFunc("/api/pay", func(w http.ResponseWriter, r *http.Request) {
        // In production: generate a Lightning invoice, wait for payment,
        // then add the pubkey to the paid users list.
        pubkey := r.URL.Query().Get("pubkey")
        if pubkey == "" {
            http.Error(w, "missing pubkey parameter", http.StatusBadRequest)
            return
        }

        // Simulate payment success (replace with real Lightning integration)
        addPaidUser(pubkey, 30*24*time.Hour) // 30 days

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{
            "status":  "paid",
            "expires": time.Now().Add(30 * 24 * time.Hour).Format(time.RFC3339),
        })
    })

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

---

## Building a WoT (Web of Trust) Relay

A relay that only accepts events from pubkeys within your Web of Trust -- people you follow, and optionally people they follow.

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "sync"
    "time"

    "github.com/fiatjaf/eventstore/lmdb"
    "github.com/fiatjaf/khatru"
    "github.com/fiatjaf/khatru/policies"
    "github.com/nbd-wtf/go-nostr"
)

var (
    // The owner's pubkey (hex)
    ownerPubkey = os.Getenv("RELAY_OWNER_PUBKEY")

    // Web of Trust: pubkeys that are allowed to write
    wot   = make(map[string]bool)
    wotMu sync.RWMutex

    // How many hops in the follow graph (1 = only your follows, 2 = follows of follows)
    trustDepth = 2
)

func isInWoT(pubkey string) bool {
    wotMu.RLock()
    defer wotMu.RUnlock()
    return wot[pubkey]
}

func addToWoT(pubkey string) {
    wotMu.Lock()
    defer wotMu.Unlock()
    wot[pubkey] = true
}

// refreshWoT crawls the follow graph starting from ownerPubkey
// and populates the WoT set. In production, this would connect to
// other relays to fetch kind:3 (contacts) events.
func refreshWoT() {
    log.Printf("refreshing WoT from owner %s...", ownerPubkey[:16])

    // Start with the owner
    addToWoT(ownerPubkey)

    // In a real implementation, you would:
    // 1. Connect to several relays
    // 2. Fetch the kind:3 contacts list for ownerPubkey
    // 3. Parse the "p" tags to get followed pubkeys
    // 4. Add them to the WoT
    // 5. If trustDepth > 1, repeat for each followed pubkey
    //
    // Using go-nostr:
    //
    // ctx := context.Background()
    // pool := nostr.NewSimplePool(ctx)
    // currentLayer := []string{ownerPubkey}
    //
    // for depth := 0; depth < trustDepth; depth++ {
    //     nextLayer := []string{}
    //     for _, pubkey := range currentLayer {
    //         events := pool.QuerySync(ctx, []string{
    //             "wss://relay.damus.io",
    //             "wss://nos.lol",
    //             "wss://relay.nostr.band",
    //         }, nostr.Filter{
    //             Kinds:   []int{3},
    //             Authors: []string{pubkey},
    //             Limit:   1,
    //         })
    //         for _, evt := range events {
    //             for _, tag := range evt.Tags {
    //                 if len(tag) >= 2 && tag[0] == "p" {
    //                     followedPubkey := tag[1]
    //                     if !isInWoT(followedPubkey) {
    //                         addToWoT(followedPubkey)
    //                         nextLayer = append(nextLayer, followedPubkey)
    //                     }
    //                 }
    //             }
    //         }
    //     }
    //     currentLayer = nextLayer
    // }

    wotMu.RLock()
    log.Printf("WoT refreshed: %d pubkeys in trust set", len(wot))
    wotMu.RUnlock()
}

func main() {
    if ownerPubkey == "" {
        log.Fatal("RELAY_OWNER_PUBKEY environment variable is required")
    }

    relay := khatru.NewRelay()
    relay.Info.Name = "WoT Relay"
    relay.Info.Description = "a relay that only accepts events from the owner's Web of Trust"

    // LMDB storage
    db := lmdb.LMDBBackend{Path: "./data/wot-relay"}
    os.MkdirAll(db.Path, 0o755)
    if err := db.Init(); err != nil {
        panic(err)
    }
    relay.StoreEvent  = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
    relay.CountEvents = append(relay.CountEvents, db.CountEvents)
    relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)

    // Build initial WoT
    refreshWoT()

    // Periodically refresh the WoT
    go func() {
        for {
            time.Sleep(24 * time.Hour)
            refreshWoT()
        }
    }()

    // Only allow events from pubkeys in the WoT
    relay.RejectEvent = append(relay.RejectEvent,
        func(ctx context.Context, event *nostr.Event) (bool, string) {
            if !isInWoT(event.PubKey) {
                return true, "restricted: your pubkey is not in this relay's web of trust"
            }
            return false, ""
        },
    )

    // Standard protections
    relay.RejectEvent = append(relay.RejectEvent,
        policies.RejectEventsWithBase64Media,
        policies.PreventTooManyIndexableTags(10, nil, nil),
        policies.PreventLargeTags(256),
    )

    relay.RejectFilter = append(relay.RejectFilter,
        policies.NoComplexFilters,
        policies.NoEmptyFilters,
    )

    relay.RejectEvent = append(relay.RejectEvent,
        policies.EventIPRateLimiter(5, time.Minute, 20),
    )

    relay.RejectFilter = append(relay.RejectFilter,
        policies.FilterIPRateLimiter(30, time.Minute, 100),
    )

    // WoT status endpoint
    mux := relay.Router()
    mux.HandleFunc("/api/wot", func(w http.ResponseWriter, r *http.Request) {
        wotMu.RLock()
        count := len(wot)
        wotMu.RUnlock()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "trust_depth":  trustDepth,
            "total_pubkeys": count,
        })
    })

    mux.HandleFunc("/api/wot/check", func(w http.ResponseWriter, r *http.Request) {
        pubkey := r.URL.Query().Get("pubkey")
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "pubkey":   pubkey,
            "in_wot":   isInWoT(pubkey),
        })
    })

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}
```

For a production WoT relay, see [bitvora/wot-relay](https://github.com/bitvora/wot-relay) which implements the full follow-graph crawling logic.

---

## Building a Community Relay with Moderation

A relay for a specific community with moderators who can ban users and delete events via the NIP-86 management API.

```go
package main

import (
    "context"
    "fmt"
    "log"
    "net"
    "net/http"
    "sync"
    "time"

    "github.com/fiatjaf/eventstore/sqlite3"
    "github.com/fiatjaf/khatru"
    "github.com/fiatjaf/khatru/policies"
    "github.com/nbd-wtf/go-nostr"
    "github.com/nbd-wtf/go-nostr/nip86"
)

var (
    // Admin pubkey (hex)
    adminPubkey = "your-admin-pubkey-hex"

    // Moderator pubkeys
    moderators = map[string]bool{
        "mod1-pubkey-hex": true,
        "mod2-pubkey-hex": true,
    }

    // Banned pubkeys
    bannedPubkeys   = make(map[string]string) // pubkey -> reason
    bannedPubkeysMu sync.RWMutex

    // Banned events
    bannedEvents   = make(map[string]string) // event ID -> reason
    bannedEventsMu sync.RWMutex
)

func isAdmin(pubkey string) bool {
    return pubkey == adminPubkey
}

func isModerator(pubkey string) bool {
    return moderators[pubkey] || isAdmin(pubkey)
}

func isBannedPubkey(pubkey string) bool {
    bannedPubkeysMu.RLock()
    defer bannedPubkeysMu.RUnlock()
    _, banned := bannedPubkeys[pubkey]
    return banned
}

func main() {
    relay := khatru.NewRelay()
    relay.Info.Name = "Community Relay"
    relay.Info.Description = "a moderated community relay"
    relay.Info.PubKey = adminPubkey
    relay.Info.Contact = "admin@example.com"

    // Storage
    db := sqlite3.SQLite3Backend{DatabaseURL: "./community-relay.db"}
    if err := db.Init(); err != nil {
        panic(err)
    }
    relay.StoreEvent   = append(relay.StoreEvent, db.SaveEvent)
    relay.QueryEvents  = append(relay.QueryEvents, db.QueryEvents)
    relay.CountEvents  = append(relay.CountEvents, db.CountEvents)
    relay.DeleteEvent  = append(relay.DeleteEvent, db.DeleteEvent)
    relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

    // --- Moderation policies ---

    // Reject events from banned pubkeys
    relay.RejectEvent = append(relay.RejectEvent,
        func(ctx context.Context, event *nostr.Event) (bool, string) {
            if isBannedPubkey(event.PubKey) {
                return true, "blocked: you have been banned from this relay"
            }
            return false, ""
        },
    )

    // Only allow common event kinds
    relay.RejectEvent = append(relay.RejectEvent,
        policies.RestrictToSpecifiedKinds(true, // allow ephemeral
            0,     // metadata
            1,     // short text note
            3,     // contacts
            5,     // deletion
            6,     // repost
            7,     // reaction
            9735,  // zap receipt
            10002, // relay list metadata
            30023, // long-form content
        ),
    )

    // Standard protections
    relay.RejectEvent = append(relay.RejectEvent,
        policies.RejectEventsWithBase64Media,
        policies.PreventLargeTags(256),
        policies.PreventTimestampsInThePast(90 * 24 * time.Hour),
        policies.PreventTimestampsInTheFuture(15 * time.Minute),
    )

    // Rate limiting
    relay.RejectEvent = append(relay.RejectEvent,
        policies.EventIPRateLimiter(5, time.Minute, 20),
        policies.EventPubKeyRateLimiter(3, time.Minute, 15),
    )

    relay.RejectFilter = append(relay.RejectFilter,
        policies.NoComplexFilters,
        policies.FilterIPRateLimiter(30, time.Minute, 100),
    )

    relay.RejectConnection = append(relay.RejectConnection,
        policies.ConnectionRateLimiter(1, 5*time.Minute, 100),
    )

    // Filter out banned events from query results
    relay.OverwriteResponseEvent = append(relay.OverwriteResponseEvent,
        func(ctx context.Context, event *nostr.Event) {
            bannedEventsMu.RLock()
            _, banned := bannedEvents[event.ID]
            bannedEventsMu.RUnlock()
            if banned {
                // Clear the event content to effectively hide it
                event.Content = "[removed by moderator]"
            }
        },
    )

    // Log new events
    relay.OnEventSaved = append(relay.OnEventSaved,
        func(ctx context.Context, event *nostr.Event) {
            if event.Kind == 1 {
                ip := khatru.GetIP(ctx)
                log.Printf("[new note] from=%s ip=%s content=%s",
                    event.PubKey[:16], ip, truncate(event.Content, 80))
            }
        },
    )

    // --- NIP-86 Management API ---
    relay.ManagementAPI = khatru.RelayManagementAPI{
        RejectAPICall: []func(ctx context.Context, mp nip86.MethodParams) (bool, string){
            func(ctx context.Context, mp nip86.MethodParams) (bool, string) {
                authed := khatru.GetAuthed(ctx)
                if !isModerator(authed) {
                    return true, "only moderators can use the management API"
                }
                return false, ""
            },
        },
        BanPubKey: func(ctx context.Context, pubkey string, reason string) error {
            bannedPubkeysMu.Lock()
            defer bannedPubkeysMu.Unlock()
            bannedPubkeys[pubkey] = reason
            log.Printf("[moderation] banned pubkey %s: %s", pubkey[:16], reason)
            return nil
        },
        ListBannedPubKeys: func(ctx context.Context) ([]nip86.PubKeyReason, error) {
            bannedPubkeysMu.RLock()
            defer bannedPubkeysMu.RUnlock()
            result := make([]nip86.PubKeyReason, 0, len(bannedPubkeys))
            for pk, reason := range bannedPubkeys {
                result = append(result, nip86.PubKeyReason{PubKey: pk, Reason: reason})
            }
            return result, nil
        },
        BanEvent: func(ctx context.Context, id string, reason string) error {
            bannedEventsMu.Lock()
            defer bannedEventsMu.Unlock()
            bannedEvents[id] = reason
            log.Printf("[moderation] banned event %s: %s", id[:16], reason)
            return nil
        },
        ListBannedEvents: func(ctx context.Context) ([]nip86.IDReason, error) {
            bannedEventsMu.RLock()
            defer bannedEventsMu.RUnlock()
            result := make([]nip86.IDReason, 0, len(bannedEvents))
            for id, reason := range bannedEvents {
                result = append(result, nip86.IDReason{ID: id, Reason: reason})
            }
            return result, nil
        },
        BlockIP: func(ctx context.Context, ip net.IP, reason string) error {
            log.Printf("[moderation] blocked IP %s: %s", ip.String(), reason)
            // In production, add to a persistent blocklist
            return nil
        },
    }

    fmt.Println("running on :3334")
    http.ListenAndServe(":3334", relay)
}

func truncate(s string, maxLen int) string {
    if len(s) > maxLen {
        return s[:maxLen] + "..."
    }
    return s
}
```

---

## Testing Your Relay

### Using nak (Command-Line Tool)

[nak](https://github.com/fiatjaf/nak) is fiatjaf's command-line NOSTR tool.

```bash
# Install nak
go install github.com/fiatjaf/nak@latest

# Check NIP-11 relay info
nak relay wss://localhost:3334

# Publish a test event
echo "hello from nak" | nak event --kind 1 -s <your-secret-key> | nak event --publish wss://localhost:3334

# Query events
nak req -k 1 -l 10 wss://localhost:3334

# Query events by author
nak req -a <pubkey-hex> wss://localhost:3334
```

### Using websocat

```bash
# Install websocat
brew install websocat  # macOS
# or: cargo install websocat

# Connect and send a REQ
echo '["REQ","test-sub",{"kinds":[1],"limit":5}]' | websocat ws://localhost:3334

# Send an EVENT (you need a properly signed event JSON)
echo '["EVENT",{"id":"...","pubkey":"...","created_at":...,"kind":1,"tags":[],"content":"hello","sig":"..."}]' | websocat ws://localhost:3334
```

### Using curl for NIP-11

```bash
curl -s -H "Accept: application/nostr+json" http://localhost:3334 | jq .
```

### Programmatic Tests in Go

```go
package main

import (
    "context"
    "testing"
    "time"

    "github.com/fiatjaf/khatru"
    "github.com/nbd-wtf/go-nostr"
)

func TestRelayAcceptsEvents(t *testing.T) {
    relay := khatru.NewRelay()

    // In-memory storage for testing
    store := make(map[string]*nostr.Event)
    relay.StoreEvent = append(relay.StoreEvent,
        func(ctx context.Context, event *nostr.Event) error {
            store[event.ID] = event
            return nil
        },
    )
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

    // Start the relay in background
    started := make(chan bool)
    go relay.Start("localhost", 13334, started)
    <-started
    defer relay.Shutdown(context.Background())

    // Connect as a client
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    conn, err := nostr.RelayConnect(ctx, "ws://localhost:13334")
    if err != nil {
        t.Fatalf("failed to connect: %v", err)
    }
    defer conn.Close()

    // Generate a test key
    sk := nostr.GeneratePrivateKey()
    pk, _ := nostr.GetPublicKey(sk)

    // Create and sign a test event
    evt := nostr.Event{
        PubKey:    pk,
        CreatedAt: nostr.Now(),
        Kind:      1,
        Content:   "test event from Go test",
        Tags:      nostr.Tags{},
    }
    evt.Sign(sk)

    // Publish
    err = conn.Publish(ctx, evt)
    if err != nil {
        t.Fatalf("failed to publish: %v", err)
    }

    // Query back
    sub, err := conn.Subscribe(ctx, []nostr.Filter{{
        Kinds:   []int{1},
        Authors: []string{pk},
        Limit:   1,
    }})
    if err != nil {
        t.Fatalf("failed to subscribe: %v", err)
    }

    select {
    case ev := <-sub.Events:
        if ev.ID != evt.ID {
            t.Errorf("got wrong event: expected %s, got %s", evt.ID, ev.ID)
        }
    case <-time.After(3 * time.Second):
        t.Error("timed out waiting for event")
    }
}
```

### Testing Rejection Policies

```go
func TestRelayRejectsBlockedKinds(t *testing.T) {
    relay := khatru.NewRelay()

    // Only allow kind 1
    relay.RejectEvent = append(relay.RejectEvent,
        policies.RestrictToSpecifiedKinds(false, 1),
    )

    relay.StoreEvent = append(relay.StoreEvent,
        func(ctx context.Context, event *nostr.Event) error {
            return nil
        },
    )

    started := make(chan bool)
    go relay.Start("localhost", 13335, started)
    <-started
    defer relay.Shutdown(context.Background())

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    conn, err := nostr.RelayConnect(ctx, "ws://localhost:13335")
    if err != nil {
        t.Fatalf("failed to connect: %v", err)
    }
    defer conn.Close()

    sk := nostr.GeneratePrivateKey()
    pk, _ := nostr.GetPublicKey(sk)

    // Try to publish a kind 30023 (long-form) event -- should be rejected
    evt := nostr.Event{
        PubKey:    pk,
        CreatedAt: nostr.Now(),
        Kind:      30023,
        Content:   "this should be rejected",
        Tags:      nostr.Tags{},
    }
    evt.Sign(sk)

    err = conn.Publish(ctx, evt)
    if err == nil {
        t.Error("expected event to be rejected, but it was accepted")
    }
}
```

---

## Deployment Tips

### Building a Static Binary

```bash
CGO_ENABLED=0 go build -o relay .
# If using SQLite (needs CGO):
CGO_ENABLED=1 go build -o relay .
```

### Running with systemd

```ini
# /etc/systemd/system/nostr-relay.service
[Unit]
Description=Nostr Relay
After=network.target

[Service]
Type=simple
User=nostr
WorkingDirectory=/opt/relay
ExecStart=/opt/relay/relay
Restart=always
RestartSec=5

# Environment variables
Environment=RELAY_OWNER_PUBKEY=abc123...

[Install]
WantedBy=multi-user.target
```

### Running Behind nginx

```nginx
server {
    listen 443 ssl;
    server_name relay.example.com;

    ssl_certificate /etc/letsencrypt/live/relay.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3334;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## Sources

- [khatru GitHub repository](https://github.com/fiatjaf/khatru)
- [khatru pkg.go.dev documentation](https://pkg.go.dev/github.com/fiatjaf/khatru)
- [khatru official site](https://khatru.nostr.technology/)
- [eventstore GitHub repository](https://github.com/fiatjaf/eventstore)
- [wot-relay GitHub](https://github.com/bitvora/wot-relay)
- [Haven GitHub](https://github.com/barrydeen/haven)
- [nak CLI tool](https://github.com/fiatjaf/nak)
