/*
NOSTR Verify Event Signature — Go

Takes a NOSTR event, recomputes the event ID from the canonical serialization,
and verifies the Schnorr signature (BIP-340).

Dependencies:
	go get github.com/nbd-wtf/go-nostr

Run:
	go run verify_signature.go

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
	fmt.Println("=== NOSTR Verify Event Signature ===")
	fmt.Println()

	// --- Create a sample event to verify ---
	// In production, you'd receive this from a relay or another client.
	secretKey := nostr.GeneratePrivateKey()
	publicKey, err := nostr.GetPublicKey(secretKey)
	if err != nil {
		log.Fatalf("Failed to derive public key: %v", err)
	}

	event := nostr.Event{
		PubKey:    publicKey,
		CreatedAt: nostr.Timestamp(time.Now().Unix()),
		Kind:      1,
		Tags:      nostr.Tags{},
		Content:   "This is a signed NOSTR event for verification testing.",
	}

	err = event.Sign(secretKey)
	if err != nil {
		log.Fatalf("Failed to sign event: %v", err)
	}

	eventJSON, _ := json.MarshalIndent(event, "", "  ")
	fmt.Println("Sample event to verify:")
	fmt.Println(string(eventJSON))
	fmt.Println()

	// --- Step 1: Verify the event ID ---
	// go-nostr's GetID() recomputes the ID from the canonical serialization:
	//   SHA-256([0, pubkey, created_at, kind, tags, content])
	computedID := event.GetID()

	fmt.Println("--- Step 1: Verify Event ID ---")
	fmt.Printf("  Computed ID: %s\n", computedID)
	fmt.Printf("  Event ID:    %s\n", event.ID)
	fmt.Printf("  ID matches:  %v\n\n", computedID == event.ID)

	// --- Step 2: Verify the Schnorr signature ---
	// CheckSignature() verifies the BIP-340 Schnorr signature.
	// It checks that event.Sig is valid over event.ID using event.PubKey.
	valid, err := event.CheckSignature()
	if err != nil {
		log.Fatalf("Signature check error: %v", err)
	}

	fmt.Println("--- Step 2: Verify Schnorr Signature ---")
	fmt.Printf("  Signature valid: %v\n\n", valid)

	// --- Step 3: Demonstrate what happens with a tampered event ---
	fmt.Println("--- Tampering Test ---")

	// Create a copy with modified content but original ID and sig.
	tampered := event
	tampered.Content = "TAMPERED CONTENT"

	// The ID is no longer correct because content changed.
	tamperedComputedID := tampered.GetID()

	fmt.Printf("  Original content: \"%s\"\n", event.Content)
	fmt.Printf("  Tampered content: \"%s\"\n", tampered.Content)
	fmt.Printf("  Tampered computed ID: %s\n", tamperedComputedID)
	fmt.Printf("  Stored ID:           %s\n", tampered.ID)
	fmt.Printf("  ID matches: %v\n\n", tamperedComputedID == tampered.ID)

	// Even if we try to verify the signature, it will fail because
	// the ID doesn't match, and the signature was over the original ID.
	tamperedValid, _ := tampered.CheckSignature()
	fmt.Printf("  Tampered signature check: %v (expected false)\n\n", tamperedValid)

	// --- Step 4: Explain the verification flow ---
	fmt.Println("--- Verification Steps ---")
	fmt.Println("1. Serialize: [0, pubkey, created_at, kind, tags, content]")
	fmt.Println("2. Compute SHA-256 of the serialized JSON string")
	fmt.Println("3. Compare computed hash with event.id")
	fmt.Println("4. Verify Schnorr signature (event.sig) over event.id using event.pubkey")
	fmt.Println("5. If ID matches AND signature is valid -> event is authentic")
}
