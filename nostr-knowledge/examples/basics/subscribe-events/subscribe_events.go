/*
NOSTR Subscribe to Events — Go

Subscribe to a relay with filters and handle streaming events in real-time.
Demonstrates multiple filter types and the EOSE boundary.

Dependencies:
	go get github.com/nbd-wtf/go-nostr

Run:
	go run subscribe_events.go

References:
	- NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
*/

package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/nbd-wtf/go-nostr"
)

const relayURL = "wss://relay.nostr.band"

func main() {
	fmt.Println("=== NOSTR Subscribe to Events ===")
	fmt.Println()

	// Step 1: Connect to the relay.
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	fmt.Printf("Connecting to %s...\n", relayURL)
	relay, err := nostr.RelayConnect(ctx, relayURL)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer relay.Close()
	fmt.Printf("Connected to %s\n\n", relay.URL)

	// Step 2: Define subscription filters.
	// Multiple filters — relay returns events matching ANY filter.
	//
	// Filter fields (all optional, AND-ed within a single filter):
	//   IDs:     specific event IDs
	//   Authors: specific public keys
	//   Kinds:   event kinds (1=text note, 0=metadata, etc.)
	//   Tags:    tag-based filters (#e, #p, etc.)
	//   Since:   events after this timestamp
	//   Until:   events before this timestamp
	//   Limit:   max stored events to return

	now := nostr.Timestamp(time.Now().Unix())
	since := nostr.Timestamp(time.Now().Add(-60 * time.Second).Unix())

	filters := nostr.Filters{
		// Filter 1: Recent text notes (last 60 seconds).
		{
			Kinds: []int{1},
			Since: &since,
			Until: &now,
			Limit: 10,
		},
		// Filter 2: Recent metadata events (kind 0 = user profiles).
		{
			Kinds: []int{0},
			Limit: 3,
		},
	}

	fmt.Println("Subscribing with two filters:")
	fmt.Println("  1. Kind 1 (text notes) from the last 60 seconds, limit 10")
	fmt.Println("  2. Kind 0 (metadata/profiles), limit 3")
	fmt.Println("Waiting for events...\n")

	// Step 3: Subscribe.
	sub, err := relay.Subscribe(ctx, filters)
	if err != nil {
		log.Fatalf("Failed to subscribe: %v", err)
	}
	defer sub.Unsub()

	// Step 4: Process events.
	storedCount := 0
	realtimeCount := 0
	eoseReceived := false
	maxRealtime := 3

	for {
		select {
		case event := <-sub.Events:
			label := "[STORED]"
			if eoseReceived {
				label = "[REAL-TIME]"
				realtimeCount++
			} else {
				storedCount++
			}

			// Determine kind name.
			kindLabel := fmt.Sprintf("kind %d", event.Kind)
			switch event.Kind {
			case 0:
				kindLabel = "metadata"
			case 1:
				kindLabel = "text note"
			}

			// Preview content (truncated).
			content := event.Content
			if len(content) > 80 {
				content = content[:80] + "..."
			}

			ts := time.Unix(int64(event.CreatedAt), 0).UTC().Format(time.RFC3339)

			fmt.Printf("%s %s\n", label, kindLabel)
			fmt.Printf("  ID:      %s...\n", event.ID[:16])
			fmt.Printf("  Author:  %s...\n", event.PubKey[:16])
			fmt.Printf("  Time:    %s\n", ts)
			fmt.Printf("  Content: %s\n\n", content)

			if realtimeCount >= maxRealtime {
				fmt.Printf("Received %d real-time events. Closing...\n\n", maxRealtime)
				fmt.Printf("Summary: %d stored + %d real-time = %d total events\n",
					storedCount, realtimeCount, storedCount+realtimeCount)
				return
			}

		case <-sub.EndOfStoredEvents:
			eoseReceived = true
			fmt.Println("=== EOSE (End of Stored Events) ===")
			fmt.Printf("Received %d stored events.\n", storedCount)
			fmt.Printf("Now waiting for real-time events (will stop after %d)...\n\n", maxRealtime)

		case <-ctx.Done():
			fmt.Println("Context timeout reached.")
			fmt.Printf("\nSummary: %d stored + %d real-time = %d total events\n",
				storedCount, realtimeCount, storedCount+realtimeCount)
			return
		}
	}
}
