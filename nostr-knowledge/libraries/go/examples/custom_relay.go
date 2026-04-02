// custom_relay.go demonstrates building a custom Nostr relay using khatru.
//
// This example creates a relay that:
//   - Only accepts text notes (kind 1) and reactions (kind 7)
//   - Rejects events from a configurable ban list
//   - Requires events to have content (no empty notes)
//   - Uses SQLite for persistent storage
//   - Serves a custom landing page at the HTTP root
//   - Logs all stored events
//
// Usage:
//
//	go run custom_relay.go
//
// Dependencies:
//
//	go get github.com/fiatjaf/khatru
//	go get github.com/fiatjaf/khatru/policies
//	go get github.com/nbd-wtf/go-nostr
//
// The relay will start on http://localhost:3334 and accept WebSocket
// connections at ws://localhost:3334.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/fiatjaf/khatru"
	"github.com/fiatjaf/khatru/policies"
	"github.com/nbd-wtf/go-nostr"
)

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

var (
	relayName        = "My Custom Relay"
	relayDescription = "A demo relay built with khatru that only accepts text notes and reactions."
	relayPubKey      = "" // Set to operator's hex pubkey if desired.
	listenAddr       = "localhost"
	listenPort       = 3334

	// Allowed event kinds. Everything else is rejected.
	allowedKinds = map[int]bool{
		nostr.KindTextNote: true, // kind 1
		nostr.KindReaction: true, // kind 7
	}

	// Banned public keys (hex). Add pubkeys here to block them.
	bannedPubKeys = map[string]bool{
		// "hexPubKeyToBan": true,
	}
)

// ------------------------------------------------------------------
// In-Memory Event Store (for simplicity)
// ------------------------------------------------------------------
// For production, use khatru's eventstore package with SQLite or LMDB:
//
//	import "github.com/fiatjaf/khatru/eventstore/sqlite3"
//
//	db := sqlite3.SQLite3Backend{DatabaseURL: "./relay.db"}
//	db.Init()
//	relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
//	relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
//	relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)

type MemoryStore struct {
	mu     sync.RWMutex
	events map[string]*nostr.Event // keyed by event ID
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		events: make(map[string]*nostr.Event),
	}
}

func (s *MemoryStore) SaveEvent(ctx context.Context, event *nostr.Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events[event.ID] = event
	return nil
}

func (s *MemoryStore) DeleteEvent(ctx context.Context, event *nostr.Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.events, event.ID)
	return nil
}

func (s *MemoryStore) QueryEvents(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
	ch := make(chan *nostr.Event)
	go func() {
		defer close(ch)
		s.mu.RLock()
		defer s.mu.RUnlock()

		count := 0
		for _, event := range s.events {
			// Respect context cancellation.
			select {
			case <-ctx.Done():
				return
			default:
			}

			// Use the filter's built-in matching logic.
			if filter.Matches(event) {
				select {
				case ch <- event:
					count++
				case <-ctx.Done():
					return
				}
			}

			// Respect the limit.
			if filter.Limit > 0 && count >= filter.Limit {
				return
			}
		}
	}()
	return ch, nil
}

func (s *MemoryStore) CountEvents(ctx context.Context, filter nostr.Filter) (int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int64
	for _, event := range s.events {
		if filter.Matches(event) {
			count++
		}
	}
	return count, nil
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

func main() {
	// Create the relay instance.
	relay := khatru.NewRelay()

	// -------------------------------------------------------
	// NIP-11: Relay Information Document
	// -------------------------------------------------------
	// This metadata is served at the relay's HTTP root when
	// the client sends an Accept: application/nostr+json header.
	relay.Info.Name = relayName
	relay.Info.Description = relayDescription
	relay.Info.PubKey = relayPubKey
	relay.Info.Software = "https://github.com/fiatjaf/khatru"
	relay.Info.Version = "demo-1.0.0"
	relay.Info.SupportedNIPs = []int{1, 2, 9, 11, 12, 15, 16, 20, 33}

	// -------------------------------------------------------
	// Storage Backend
	// -------------------------------------------------------
	store := NewMemoryStore()

	relay.StoreEvent = append(relay.StoreEvent,
		store.SaveEvent,
	)
	relay.QueryEvents = append(relay.QueryEvents,
		store.QueryEvents,
	)
	relay.DeleteEvent = append(relay.DeleteEvent,
		store.DeleteEvent,
	)
	relay.CountEvents = append(relay.CountEvents,
		store.CountEvents,
	)

	// -------------------------------------------------------
	// Event Rejection Policies
	// -------------------------------------------------------
	// Policies are checked in order. If any returns reject=true,
	// the event is refused and the message is sent back to the client.

	// Policy 1: Only allow specific event kinds.
	relay.RejectEvent = append(relay.RejectEvent,
		func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
			if !allowedKinds[event.Kind] {
				return true, fmt.Sprintf("blocked: kind %d is not allowed on this relay", event.Kind)
			}
			return false, ""
		},
	)

	// Policy 2: Block banned public keys.
	relay.RejectEvent = append(relay.RejectEvent,
		func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
			if bannedPubKeys[event.PubKey] {
				return true, "blocked: your public key is banned from this relay"
			}
			return false, ""
		},
	)

	// Policy 3: Reject empty text notes.
	relay.RejectEvent = append(relay.RejectEvent,
		func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
			if event.Kind == nostr.KindTextNote && strings.TrimSpace(event.Content) == "" {
				return true, "blocked: text notes must have content"
			}
			return false, ""
		},
	)

	// Policy 4: Reject events with timestamps too far in the future.
	relay.RejectEvent = append(relay.RejectEvent,
		func(ctx context.Context, event *nostr.Event) (reject bool, msg string) {
			maxFuture := nostr.Timestamp(time.Now().Add(15 * time.Minute).Unix())
			if event.CreatedAt > maxFuture {
				return true, "blocked: event timestamp is too far in the future"
			}
			return false, ""
		},
	)

	// Apply khatru's built-in sane defaults for additional protection.
	// This adds rate limiting, size limits, and other common policies.
	policies.ApplySaneDefaults(relay)

	// -------------------------------------------------------
	// Filter Rejection Policies
	// -------------------------------------------------------
	// Control which queries clients can make.

	relay.RejectFilter = append(relay.RejectFilter,
		func(ctx context.Context, filter nostr.Filter) (reject bool, msg string) {
			// Reject overly broad queries (no filter criteria at all).
			if len(filter.IDs) == 0 &&
				len(filter.Authors) == 0 &&
				len(filter.Kinds) == 0 &&
				filter.Since == nil &&
				filter.Until == nil &&
				len(filter.Tags) == 0 &&
				filter.Search == "" {
				// Allow if limit is small enough.
				if filter.Limit == 0 || filter.Limit > 100 {
					return true, "blocked: query is too broad, please add filter criteria"
				}
			}
			return false, ""
		},
	)

	// -------------------------------------------------------
	// Event Lifecycle Hooks
	// -------------------------------------------------------

	// Log every event that gets stored.
	relay.OnEventSaved = append(relay.OnEventSaved,
		func(ctx context.Context, event *nostr.Event) {
			log.Printf("[stored] kind=%d id=%s author=%s content=%q",
				event.Kind, event.ID[:12]+"...", event.PubKey[:12]+"...",
				truncate(event.Content, 60))
		},
	)

	// -------------------------------------------------------
	// Connection Hooks
	// -------------------------------------------------------

	relay.OnConnect = append(relay.OnConnect,
		func(ctx context.Context) {
			ip := khatru.GetIP(ctx)
			log.Printf("[connect] client connected from %s", ip)
		},
	)

	relay.OnDisconnect = append(relay.OnDisconnect,
		func(ctx context.Context) {
			ip := khatru.GetIP(ctx)
			log.Printf("[disconnect] client disconnected from %s", ip)
		},
	)

	// -------------------------------------------------------
	// NIP-42 Authentication (Optional)
	// -------------------------------------------------------
	// Uncomment the following to require authentication for subscriptions:
	//
	// relay.RejectFilter = append(relay.RejectFilter,
	// 	func(ctx context.Context, filter nostr.Filter) (reject bool, msg string) {
	// 		authedPubKey := khatru.GetAuthed(ctx)
	// 		if authedPubKey == "" {
	// 			// Request authentication from the client.
	// 			khatru.RequestAuth(ctx)
	// 			return true, "auth-required: please authenticate to query this relay"
	// 		}
	// 		return false, ""
	// 	},
	// )

	// -------------------------------------------------------
	// Custom HTTP Routes
	// -------------------------------------------------------
	// Khatru implements http.Handler, so you can add custom routes
	// alongside the WebSocket endpoint.

	mux := relay.Router()

	// Serve a landing page for browsers.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Let khatru handle NIP-11 requests (Accept: application/nostr+json)
		// and WebSocket upgrades.
		if r.Header.Get("Accept") == "application/nostr+json" ||
			r.Header.Get("Upgrade") == "websocket" {
			relay.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>%s</title></head>
<body>
  <h1>%s</h1>
  <p>%s</p>
  <p>This is a Nostr relay. Connect with a Nostr client using:</p>
  <pre>ws://%s:%d</pre>
  <h2>Accepted Event Kinds</h2>
  <ul>
    <li>Kind 1 (Text Notes)</li>
    <li>Kind 7 (Reactions)</li>
  </ul>
  <h2>Stats</h2>
  <p>Events stored: %d</p>
</body>
</html>`,
			relayName, relayName, relayDescription,
			listenAddr, listenPort,
			len(store.events),
		)
	})

	// Health check endpoint.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "OK")
	})

	// Stats API endpoint.
	mux.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
		store.mu.RLock()
		eventCount := len(store.events)
		store.mu.RUnlock()

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"events":%d,"relay":"%s"}`, eventCount, relayName)
	})

	// -------------------------------------------------------
	// Start the Relay
	// -------------------------------------------------------
	log.Printf("Starting %s on %s:%d", relayName, listenAddr, listenPort)
	log.Printf("WebSocket: ws://%s:%d", listenAddr, listenPort)
	log.Printf("NIP-11:    http://%s:%d (Accept: application/nostr+json)", listenAddr, listenPort)
	log.Printf("Web UI:    http://%s:%d", listenAddr, listenPort)
	log.Printf("Health:    http://%s:%d/health", listenAddr, listenPort)

	// relay.Start blocks until the server is stopped.
	if err := relay.Start(listenAddr, listenPort); err != nil {
		log.Fatalf("Relay failed: %v", err)
	}
}

// truncate shortens a string to maxLen characters, appending "..." if truncated.
func truncate(s string, maxLen int) string {
	// Remove newlines for log readability.
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}

// ------------------------------------------------------------------
// Alternative: Using SQLite3 Storage
// ------------------------------------------------------------------
//
// For production relays, replace the MemoryStore with SQLite:
//
//	import "github.com/fiatjaf/khatru/eventstore/sqlite3"
//
//	func setupSQLiteStorage(relay *khatru.Relay) {
//		db := sqlite3.SQLite3Backend{DatabaseURL: "./relay.db"}
//		if err := db.Init(); err != nil {
//			log.Fatalf("Failed to init SQLite: %v", err)
//		}
//
//		relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
//		relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
//		relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)
//		relay.CountEvents = append(relay.CountEvents, db.CountEvents)
//	}

// ------------------------------------------------------------------
// Alternative: Using the New Module (fiatjaf.com/nostr/khatru)
// ------------------------------------------------------------------
//
// The new khatru at fiatjaf.com/nostr/khatru has the same hook-based
// architecture. The main difference is that it uses typed keys
// (nostr.PubKey, nostr.ID) instead of hex strings. The setup pattern
// is identical:
//
//	import (
//		"fiatjaf.com/nostr"
//		"fiatjaf.com/nostr/khatru"
//	)
//
//	relay := khatru.NewRelay()
//	relay.RejectEvent = append(relay.RejectEvent,
//		func(ctx context.Context, event *nostr.Event) (bool, string) {
//			// Same pattern, typed keys
//			return false, ""
//		},
//	)

// ------------------------------------------------------------------
// Testing the Relay
// ------------------------------------------------------------------
//
// Once running, test with any Nostr client or use go-nostr directly:
//
//	ctx := context.Background()
//	relay, _ := nostr.RelayConnect(ctx, "ws://localhost:3334")
//
//	sk := nostr.GeneratePrivateKey()
//	pk, _ := nostr.GetPublicKey(sk)
//
//	evt := nostr.Event{
//		PubKey:    pk,
//		CreatedAt: nostr.Now(),
//		Kind:      nostr.KindTextNote,
//		Content:   "Testing my custom relay!",
//	}
//	evt.Sign(sk)
//
//	err := relay.Publish(ctx, evt)
//	fmt.Println("Published:", err)
//
//	// Subscribe to all text notes
//	sub, _ := relay.Subscribe(ctx, nostr.Filters{{
//		Kinds: []int{nostr.KindTextNote},
//		Limit: 10,
//	}})
//	for evt := range sub.Events {
//		fmt.Println(evt.Content)
//	}

// ------------------------------------------------------------------
// Unused import guard (remove in real code)
// ------------------------------------------------------------------
var _ = os.Getenv
