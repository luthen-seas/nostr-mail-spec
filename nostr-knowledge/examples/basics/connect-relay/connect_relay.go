/*
NOSTR Connect to Relay — Go

Connects to a NOSTR relay via WebSocket, sends a REQ subscription,
receives events, and handles the EOSE (End Of Stored Events) message.

Dependencies:
	go get github.com/nbd-wtf/go-nostr

Run:
	go run connect_relay.go

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

const relayURL = "wss://relay.damus.io"

func main() {
	fmt.Println("=== NOSTR Connect to Relay ===")
	fmt.Println()

	// Step 1: Connect to the relay.
	// This opens a WebSocket connection and performs the initial handshake.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fmt.Printf("Connecting to %s...\n", relayURL)
	relay, err := nostr.RelayConnect(ctx, relayURL)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer relay.Close()
	fmt.Printf("Connected to %s\n\n", relay.URL)

	// Step 2: Define a subscription filter.
	// Filters tell the relay which events we want to receive.
	// This filter requests the 5 most recent kind 1 (text note) events.
	filters := nostr.Filters{
		{
			Kinds: []int{1}, // Kind 1 = text notes
			Limit: 5,        // Only return the 5 most recent
		},
	}

	// Step 3: Subscribe to events matching the filter.
	// The relay sends stored events first, then an EOSE signal,
	// then continues streaming new events in real-time.
	fmt.Printf("Subscribing with filter: kinds=[1], limit=5\n")
	fmt.Println("Waiting for events...\n")

	sub, err := relay.Subscribe(ctx, filters)
	if err != nil {
		log.Fatalf("Failed to subscribe: %v", err)
	}
	defer sub.Unsub()

	// Step 4: Receive events from the subscription.
	// The subscription has two channels:
	//   sub.Events — receives matching events
	//   sub.EndOfStoredEvents — signals that all stored events have been sent
	for {
		select {
		case event := <-sub.Events:
			// An event matching our filter.
			ts := time.Unix(int64(event.CreatedAt), 0).UTC()
			content := event.Content
			if len(content) > 100 {
				content = content[:100] + "..."
			}

			fmt.Println("--- Received Event ---")
			fmt.Printf("  ID:      %s\n", event.ID)
			fmt.Printf("  Author:  %s\n", event.PubKey)
			fmt.Printf("  Kind:    %d\n", event.Kind)
			fmt.Printf("  Time:    %s\n", ts.Format(time.RFC3339))
			fmt.Printf("  Content: %s\n", content)
			fmt.Println()

		case <-sub.EndOfStoredEvents:
			// All stored events have been sent.
			fmt.Println("=== EOSE (End of Stored Events) ===")
			fmt.Println("All stored events received. New events would stream in real-time.")
			fmt.Println("Closing subscription and disconnecting...")
			return

		case <-ctx.Done():
			fmt.Println("Context timeout reached.")
			return
		}
	}
}
