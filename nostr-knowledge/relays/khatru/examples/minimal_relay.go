// minimal_relay.go
//
// A minimal but functional NOSTR relay using khatru with in-memory storage.
// This relay stores events in a simple Go map and supports basic NOSTR
// operations: publishing events, querying events, and deleting events.
//
// Usage:
//
//	go run minimal_relay.go
//
// Then connect with any NOSTR client to ws://localhost:3334
// Or check NIP-11 info: curl -H "Accept: application/nostr+json" http://localhost:3334
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/fiatjaf/khatru"
	"github.com/nbd-wtf/go-nostr"
)

func main() {
	// Create the relay instance. This initializes default WebSocket settings,
	// NIP-11 support, and the hook pipeline.
	relay := khatru.NewRelay()

	// Configure NIP-11 relay information.
	// This is returned when clients request relay metadata.
	relay.Info.Name = "Minimal Khatru Relay"
	relay.Info.PubKey = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
	relay.Info.Description = "a minimal NOSTR relay built with khatru and in-memory storage"
	relay.Info.Software = "https://github.com/fiatjaf/khatru"

	// ---------------------------------------------------------------
	// Storage: simple in-memory map protected by a read-write mutex.
	// Events are lost when the process exits.
	// ---------------------------------------------------------------
	store := make(map[string]*nostr.Event, 1000)
	var mu sync.RWMutex

	// StoreEvent: called when a new event passes validation.
	// All functions in this slice are called (not short-circuited).
	relay.StoreEvent = append(relay.StoreEvent,
		func(ctx context.Context, event *nostr.Event) error {
			mu.Lock()
			defer mu.Unlock()
			store[event.ID] = event
			log.Printf("stored event %s (kind %d) from %s",
				event.ID[:16], event.Kind, event.PubKey[:16])
			return nil
		},
	)

	// QueryEvents: called when a client sends a REQ subscription.
	// Must return a channel of matching events, then close it.
	relay.QueryEvents = append(relay.QueryEvents,
		func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
			ch := make(chan *nostr.Event)
			go func() {
				defer close(ch)
				mu.RLock()
				defer mu.RUnlock()
				for _, evt := range store {
					// go-nostr provides a Matches method that checks all filter criteria:
					// kinds, authors, IDs, tags, since, until, etc.
					if filter.Matches(evt) {
						select {
						case ch <- evt:
						case <-ctx.Done():
							return
						}
					}
				}
			}()
			return ch, nil
		},
	)

	// DeleteEvent: called when processing kind-5 deletion events.
	relay.DeleteEvent = append(relay.DeleteEvent,
		func(ctx context.Context, event *nostr.Event) error {
			mu.Lock()
			defer mu.Unlock()
			delete(store, event.ID)
			log.Printf("deleted event %s", event.ID[:16])
			return nil
		},
	)

	// ---------------------------------------------------------------
	// Optional: log connections
	// ---------------------------------------------------------------
	relay.OnConnect = append(relay.OnConnect,
		func(ctx context.Context) {
			ip := khatru.GetIP(ctx)
			log.Printf("new connection from %s", ip)
		},
	)

	relay.OnDisconnect = append(relay.OnDisconnect,
		func(ctx context.Context) {
			ip := khatru.GetIP(ctx)
			log.Printf("disconnected: %s", ip)
		},
	)

	// ---------------------------------------------------------------
	// Optional: add a simple landing page
	// ---------------------------------------------------------------
	mux := relay.Router()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Let khatru handle WebSocket upgrades and NIP-11
		if r.Header.Get("Upgrade") == "websocket" ||
			r.Header.Get("Accept") == "application/nostr+json" {
			relay.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>Minimal Khatru Relay</title></head>
<body>
<h1>Minimal Khatru Relay</h1>
<p>Connect your NOSTR client to: <code>ws://localhost:3334</code></p>
<p>Events stored in memory: they will be lost on restart.</p>
</body>
</html>`)
	})

	// ---------------------------------------------------------------
	// Start the server
	// ---------------------------------------------------------------
	addr := ":3334"
	fmt.Printf("Minimal khatru relay running on %s\n", addr)
	if err := http.ListenAndServe(addr, relay); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
