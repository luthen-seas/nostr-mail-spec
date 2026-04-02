/*
NOSTR Publish a Text Note — Go

Full end-to-end flow: generate keys, create a kind 1 event,
connect to a relay, publish the event, and receive the OK response.

Dependencies:
	go get github.com/nbd-wtf/go-nostr

Run:
	go run publish_note.go

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

const relayURL = "wss://nos.lol"

func main() {
	fmt.Println("=== NOSTR Publish a Text Note ===")
	fmt.Println()

	// Step 1: Generate a fresh keypair.
	// In a real app, you'd load an existing key from secure storage.
	secretKey := nostr.GeneratePrivateKey()
	publicKey, err := nostr.GetPublicKey(secretKey)
	if err != nil {
		log.Fatalf("Failed to derive public key: %v", err)
	}
	fmt.Println("Generated keypair:")
	fmt.Printf("  Public key: %s\n\n", publicKey)

	// Step 2: Create the event.
	// Kind 1 = text note. The content is the note's text.
	event := nostr.Event{
		PubKey:    publicKey,
		CreatedAt: nostr.Timestamp(time.Now().Unix()),
		Kind:      1,
		Tags:      nostr.Tags{},
		Content:   "Hello from go-nostr! Publishing my first note via the protocol.",
	}

	// Step 3: Sign the event (computes ID and Schnorr signature).
	err = event.Sign(secretKey)
	if err != nil {
		log.Fatalf("Failed to sign event: %v", err)
	}
	fmt.Println("Event created and signed:")
	fmt.Printf("  Event ID: %s\n", event.ID)
	fmt.Printf("  Content:  \"%s\"\n\n", event.Content)

	// Step 4: Connect to the relay.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fmt.Printf("Connecting to %s...\n", relayURL)
	relay, err := nostr.RelayConnect(ctx, relayURL)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer relay.Close()
	fmt.Printf("Connected to %s\n\n", relay.URL)

	// Step 5: Publish the event.
	// This sends ["EVENT", <event>] to the relay and waits for the OK response.
	// The relay responds with ["OK", <event_id>, <success>, <message>].
	fmt.Println("Publishing event...")
	err = relay.Publish(ctx, event)
	if err != nil {
		log.Fatalf("Failed to publish: %v", err)
	}

	fmt.Println("Event published successfully!")
	fmt.Printf("  Relay confirmed acceptance of event %s\n", event.ID)

	// Step 6: Disconnect.
	relay.Close()
	fmt.Println("\nDisconnected from relay.")
}
