// filtered_relay.go
//
// A NOSTR relay with custom event policies: kind whitelist, content filtering,
// pubkey banning, timestamp validation, and multi-layer rate limiting.
// Uses SQLite for persistent storage.
//
// Usage:
//
//	go run filtered_relay.go
//
// Connect with any NOSTR client to ws://localhost:3334
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/fiatjaf/eventstore/sqlite3"
	"github.com/fiatjaf/khatru"
	"github.com/fiatjaf/khatru/policies"
	"github.com/nbd-wtf/go-nostr"
)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// allowedKinds defines which event kinds this relay accepts.
var allowedKinds = map[int]bool{
	0:     true, // metadata (profile)
	1:     true, // short text note
	3:     true, // contacts / follow list
	5:     true, // event deletion
	6:     true, // repost
	7:     true, // reaction
	1984:  true, // reporting
	9735:  true, // zap receipt
	10002: true, // relay list metadata
	30023: true, // long-form content
}

// bannedPubkeys is a set of hex pubkeys that are blocked from publishing.
// In production, load this from a database or config file.
var bannedPubkeys = map[string]bool{
	// Example: "fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52": true,
}

// blockedWords triggers content rejection if found in kind-1 note content.
var blockedWords = []string{
	"free bitcoin",
	"double your sats",
	"send btc to",
	"casino bonus",
}

// ---------------------------------------------------------------------------
// Custom policy functions
// ---------------------------------------------------------------------------

// rejectDisallowedKinds rejects events whose kind is not in the allowedKinds map.
// Ephemeral events (kinds 20000-29999) are always allowed.
func rejectDisallowedKinds(ctx context.Context, event *nostr.Event) (bool, string) {
	// Always allow ephemeral events
	if nostr.IsEphemeralKind(event.Kind) {
		return false, ""
	}
	if !allowedKinds[event.Kind] {
		return true, fmt.Sprintf("blocked: event kind %d is not accepted by this relay", event.Kind)
	}
	return false, ""
}

// rejectBannedPubkeys rejects events from pubkeys in the ban list.
func rejectBannedPubkeys(ctx context.Context, event *nostr.Event) (bool, string) {
	if bannedPubkeys[event.PubKey] {
		return true, "blocked: your public key has been banned from this relay"
	}
	return false, ""
}

// rejectSpamContent scans kind-1 note content for blocked words.
func rejectSpamContent(ctx context.Context, event *nostr.Event) (bool, string) {
	// Only check text notes
	if event.Kind != 1 {
		return false, ""
	}
	lower := strings.ToLower(event.Content)
	for _, word := range blockedWords {
		if strings.Contains(lower, word) {
			return true, "blocked: content violates relay policy"
		}
	}
	return false, ""
}

// rejectOversizedContent rejects events with content larger than 32KB.
func rejectOversizedContent(ctx context.Context, event *nostr.Event) (bool, string) {
	if len(event.Content) > 32*1024 {
		return true, "blocked: event content exceeds 32KB limit"
	}
	return false, ""
}

// limitQueryResults forces a maximum limit on all subscription filters.
func limitQueryResults(ctx context.Context, filter *nostr.Filter) {
	maxLimit := 500
	if filter.Limit == 0 || filter.Limit > maxLimit {
		filter.Limit = maxLimit
	}
}

func main() {
	// ------------------------------------------------------------------
	// Initialize relay
	// ------------------------------------------------------------------
	relay := khatru.NewRelay()
	relay.Info.Name = "Filtered Relay"
	relay.Info.Description = "a NOSTR relay with strict event policies, content filtering, and rate limiting"
	relay.Info.Software = "https://github.com/fiatjaf/khatru"
	relay.Info.Version = "0.1.0"

	// ------------------------------------------------------------------
	// Storage: SQLite (persistent, single-file database)
	// ------------------------------------------------------------------
	db := sqlite3.SQLite3Backend{DatabaseURL: "./filtered-relay.db"}
	if err := db.Init(); err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}

	relay.StoreEvent   = append(relay.StoreEvent, db.SaveEvent)
	relay.QueryEvents  = append(relay.QueryEvents, db.QueryEvents)
	relay.CountEvents  = append(relay.CountEvents, db.CountEvents)
	relay.DeleteEvent  = append(relay.DeleteEvent, db.DeleteEvent)
	relay.ReplaceEvent = append(relay.ReplaceEvent, db.ReplaceEvent)

	// ------------------------------------------------------------------
	// Event rejection policies (order matters -- cheap checks first)
	// ------------------------------------------------------------------

	relay.RejectEvent = append(relay.RejectEvent,
		// 1. Check the ban list (O(1) map lookup, very cheap)
		rejectBannedPubkeys,

		// 2. Check event kind whitelist
		rejectDisallowedKinds,

		// 3. Reject oversized content
		rejectOversizedContent,

		// 4. Content filtering for spam
		rejectSpamContent,

		// 5. Reject events with base64-encoded images/videos
		policies.RejectEventsWithBase64Media,

		// 6. Reject events with timestamps too far in the past (30 days)
		policies.PreventTimestampsInThePast(30*24*time.Hour),

		// 7. Reject events with timestamps in the future (15 minutes grace)
		policies.PreventTimestampsInTheFuture(15*time.Minute),

		// 8. Reject events with too many indexable tags
		policies.PreventTooManyIndexableTags(10, nil, nil),

		// 9. Reject events with oversized tag values
		policies.PreventLargeTags(256),

		// 10. Rate limit by IP: 10 events per minute, burst of 30
		policies.EventIPRateLimiter(10, time.Minute, 30),

		// 11. Rate limit by pubkey: 5 events per minute, burst of 15
		policies.EventPubKeyRateLimiter(5, time.Minute, 15),
	)

	// ------------------------------------------------------------------
	// Filter rejection policies
	// ------------------------------------------------------------------

	relay.RejectFilter = append(relay.RejectFilter,
		// Block overly complex queries
		policies.NoComplexFilters,

		// Block empty filters (must specify at least one criterion)
		policies.NoEmptyFilters,

		// Block sync bots that try to dump all kind:1 events
		policies.AntiSyncBots,

		// Rate limit queries: 30 per minute per IP, burst of 100
		policies.FilterIPRateLimiter(30, time.Minute, 100),
	)

	// ------------------------------------------------------------------
	// Filter modification: enforce maximum query limits
	// ------------------------------------------------------------------

	relay.OverwriteFilter = append(relay.OverwriteFilter, limitQueryResults)

	// ------------------------------------------------------------------
	// Connection rate limiting: 1 new connection per 5 minutes per IP
	// ------------------------------------------------------------------

	relay.RejectConnection = append(relay.RejectConnection,
		policies.ConnectionRateLimiter(1, 5*time.Minute, 100),
	)

	// ------------------------------------------------------------------
	// Logging hooks
	// ------------------------------------------------------------------

	relay.OnConnect = append(relay.OnConnect,
		func(ctx context.Context) {
			log.Printf("[connect] ip=%s", khatru.GetIP(ctx))
		},
	)

	relay.OnEventSaved = append(relay.OnEventSaved,
		func(ctx context.Context, event *nostr.Event) {
			contentPreview := event.Content
			if len(contentPreview) > 80 {
				contentPreview = contentPreview[:80] + "..."
			}
			log.Printf("[event] kind=%d id=%s pubkey=%s content=%q",
				event.Kind, event.ID[:16], event.PubKey[:16], contentPreview)
		},
	)

	// ------------------------------------------------------------------
	// Custom HTTP endpoints
	// ------------------------------------------------------------------

	mux := relay.Router()

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Landing page
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") == "websocket" ||
			r.Header.Get("Accept") == "application/nostr+json" {
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
<h2>Policies</h2>
<ul>
  <li>Allowed event kinds: 0, 1, 3, 5, 6, 7, 1984, 9735, 10002, 30023</li>
  <li>Maximum content size: 32KB</li>
  <li>No base64-encoded media</li>
  <li>No events older than 30 days</li>
  <li>Rate limited: 10 events/min per IP, 5 events/min per pubkey</li>
  <li>Query limit: 500 events per subscription</li>
</ul>
<h2>Connect</h2>
<p><code>wss://your-domain.com</code></p>
</body>
</html>`, relay.Info.Name, relay.Info.Name, relay.Info.Description)
	})

	// ------------------------------------------------------------------
	// Start the server
	// ------------------------------------------------------------------
	addr := ":3334"
	fmt.Printf("Filtered relay running on %s\n", addr)
	fmt.Printf("  Allowed kinds: ")
	for k := range allowedKinds {
		fmt.Printf("%d ", k)
	}
	fmt.Println()
	fmt.Printf("  Blocked words: %d patterns\n", len(blockedWords))
	fmt.Printf("  Banned pubkeys: %d\n", len(bannedPubkeys))

	if err := http.ListenAndServe(addr, relay); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
