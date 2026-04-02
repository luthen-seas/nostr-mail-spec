/*
NOSTR Create & Sign Event — Go

Creates a kind 1 text note event, computes the event ID (SHA-256 of the
canonical serialization), and signs it with a Schnorr signature (BIP-340).

Dependencies:
	go get github.com/nbd-wtf/go-nostr

Run:
	go run create_event.go

References:
	- NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
*/

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/nbd-wtf/go-nostr"
)

func main() {
	// Step 1: Generate keys (in production, load from secure storage).
	secretKey := nostr.GeneratePrivateKey()
	publicKey, err := nostr.GetPublicKey(secretKey)
	if err != nil {
		log.Fatalf("Failed to derive public key: %v", err)
	}

	fmt.Println("=== NOSTR Create & Sign Event ===")
	fmt.Println()
	fmt.Println("Public key:", publicKey)

	// Step 2: Build the event.
	// A kind 1 event is a "text note" — the most basic NOSTR event.
	event := nostr.Event{
		PubKey:    publicKey,
		CreatedAt: nostr.Timestamp(time.Now().Unix()), // Unix timestamp in seconds
		Kind:      1,                                   // Kind 1 = text note (NIP-01)
		Tags:      nostr.Tags{},                        // No tags for a simple note
		Content:   "Hello, NOSTR! This is my first note.",
	}

	// Step 3: Compute the event ID.
	// The ID is SHA-256 of the canonical JSON serialization:
	//   [0, pubkey, created_at, kind, tags, content]
	// go-nostr computes this automatically when you call Sign().

	// Step 4: Sign the event.
	// Sign() sets event.ID (the SHA-256 hash) and event.Sig (Schnorr signature).
	err = event.Sign(secretKey)
	if err != nil {
		log.Fatalf("Failed to sign event: %v", err)
	}

	// Step 5: Display the signed event as JSON.
	eventJSON, err := json.MarshalIndent(event, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal event: %v", err)
	}

	fmt.Println()
	fmt.Println("Signed event:")
	fmt.Println()
	fmt.Println(string(eventJSON))

	// Step 6: Explain the fields.
	fmt.Println()
	fmt.Println("--- Field Breakdown ---")
	fmt.Printf("id:         %s  (SHA-256 of serialized event)\n", event.ID)
	fmt.Printf("pubkey:     %s  (author's public key)\n", event.PubKey)
	fmt.Printf("created_at: %d                   (unix timestamp)\n", event.CreatedAt)
	fmt.Printf("kind:       %d                            (1 = text note)\n", event.Kind)
	fmt.Printf("tags:       %v                           (empty for simple note)\n", event.Tags)
	fmt.Printf("content:    \"%s\"\n", event.Content)
	fmt.Printf("sig:        %s  (Schnorr signature)\n", event.Sig)

	// Step 7: Verify the signature to confirm everything is correct.
	valid, err := event.CheckSignature()
	if err != nil {
		log.Fatalf("Signature check failed: %v", err)
	}
	fmt.Printf("\nSignature valid: %v\n", valid)
}
