// basic_usage.go demonstrates core go-nostr operations:
// key generation, event creation, relay connection, publishing, and subscribing.
//
// Usage:
//
//	go run basic_usage.go
//
// Dependencies:
//
//	go get github.com/nbd-wtf/go-nostr
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip19"
	"github.com/nbd-wtf/go-nostr/nip44"
)

func main() {
	// Enable go-nostr info logging for visibility.
	nostr.InfoLogger.SetOutput(os.Stdout)

	fmt.Println("=== go-nostr Basic Usage ===")
	fmt.Println()

	// -------------------------------------------------------
	// 1. Key Generation
	// -------------------------------------------------------
	fmt.Println("--- 1. Key Generation ---")

	sk := nostr.GeneratePrivateKey()
	pk, err := nostr.GetPublicKey(sk)
	if err != nil {
		log.Fatalf("Failed to derive public key: %v", err)
	}

	// Encode to bech32 human-readable format (NIP-19).
	nsec, _ := nip19.EncodePrivateKey(sk)
	npub, _ := nip19.EncodePublicKey(pk)

	fmt.Printf("Secret key (hex):    %s\n", sk)
	fmt.Printf("Public key (hex):    %s\n", pk)
	fmt.Printf("Secret key (bech32): %s\n", nsec)
	fmt.Printf("Public key (bech32): %s\n", npub)
	fmt.Println()

	// -------------------------------------------------------
	// 2. NIP-19 Encoding and Decoding
	// -------------------------------------------------------
	fmt.Println("--- 2. NIP-19 Encoding/Decoding ---")

	// Encode a profile with relay hints.
	nprofile, _ := nip19.EncodeProfile(pk, []string{
		"wss://relay.damus.io",
		"wss://nos.lol",
	})
	fmt.Printf("nprofile: %s\n", nprofile)

	// Decode any NIP-19 string back to its components.
	prefix, value, err := nip19.Decode(npub)
	if err != nil {
		log.Fatalf("Failed to decode NIP-19: %v", err)
	}
	fmt.Printf("Decoded %s: prefix=%s value=%s\n", npub[:20]+"...", prefix, value.(string)[:16]+"...")
	fmt.Println()

	// -------------------------------------------------------
	// 3. Event Creation and Signing
	// -------------------------------------------------------
	fmt.Println("--- 3. Event Creation and Signing ---")

	// Create a text note (kind 1).
	evt := nostr.Event{
		PubKey:    pk,
		CreatedAt: nostr.Now(),
		Kind:      nostr.KindTextNote,
		Tags: nostr.Tags{
			{"t", "go-nostr"},
			{"t", "tutorial"},
		},
		Content: "Hello from go-nostr! This is a test note.",
	}

	// Sign the event (sets both ID and Sig fields).
	if err := evt.Sign(sk); err != nil {
		log.Fatalf("Failed to sign event: %v", err)
	}

	fmt.Printf("Event ID:  %s\n", evt.ID)
	fmt.Printf("Event Sig: %s...\n", evt.Sig[:32])
	fmt.Printf("Kind:      %d\n", evt.Kind)
	fmt.Printf("Content:   %s\n", evt.Content)

	// Verify the signature.
	valid, err := evt.CheckSignature()
	if err != nil {
		log.Fatalf("Signature check error: %v", err)
	}
	fmt.Printf("Signature valid: %v\n", valid)
	fmt.Println()

	// -------------------------------------------------------
	// 4. NIP-44 Encryption
	// -------------------------------------------------------
	fmt.Println("--- 4. NIP-44 Encryption ---")

	// Generate a second key pair (the recipient).
	recipientSK := nostr.GeneratePrivateKey()
	recipientPK, _ := nostr.GetPublicKey(recipientSK)

	// Sender encrypts a message to the recipient.
	conversationKey, err := nip44.GenerateConversationKey(recipientPK, sk)
	if err != nil {
		log.Fatalf("Failed to generate conversation key: %v", err)
	}

	plaintext := "This is a secret message using NIP-44 encryption."
	ciphertext, err := nip44.Encrypt(plaintext, conversationKey)
	if err != nil {
		log.Fatalf("Failed to encrypt: %v", err)
	}
	fmt.Printf("Ciphertext: %s...\n", ciphertext[:40])

	// Recipient decrypts the message.
	recipientConvKey, err := nip44.GenerateConversationKey(pk, recipientSK)
	if err != nil {
		log.Fatalf("Failed to generate recipient conversation key: %v", err)
	}

	decrypted, err := nip44.Decrypt(ciphertext, recipientConvKey)
	if err != nil {
		log.Fatalf("Failed to decrypt: %v", err)
	}
	fmt.Printf("Decrypted:  %s\n", decrypted)
	fmt.Println()

	// -------------------------------------------------------
	// 5. Connect to a Relay
	// -------------------------------------------------------
	fmt.Println("--- 5. Relay Connection ---")

	// Use a top-level context that we can cancel to clean up everything.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	relayURL := "wss://relay.damus.io"
	relay, err := nostr.RelayConnect(ctx, relayURL)
	if err != nil {
		log.Fatalf("Failed to connect to %s: %v", relayURL, err)
	}
	defer relay.Close()

	fmt.Printf("Connected to %s\n", relay.URL)
	fmt.Println()

	// -------------------------------------------------------
	// 6. Publish an Event
	// -------------------------------------------------------
	fmt.Println("--- 6. Publishing ---")

	publishCtx, publishCancel := context.WithTimeout(ctx, 10*time.Second)
	defer publishCancel()

	if err := relay.Publish(publishCtx, evt); err != nil {
		// Not fatal -- the relay may reject our event for policy reasons.
		fmt.Printf("Publish failed (this may be expected): %v\n", err)
	} else {
		fmt.Printf("Published event %s to %s\n", evt.ID[:16]+"...", relay.URL)
	}
	fmt.Println()

	// -------------------------------------------------------
	// 7. Subscribe and Receive Events
	// -------------------------------------------------------
	fmt.Println("--- 7. Subscribing ---")

	// Subscribe to recent text notes. Use a short timeout for this demo.
	subCtx, subCancel := context.WithTimeout(ctx, 10*time.Second)
	defer subCancel()

	filters := nostr.Filters{{
		Kinds: []int{nostr.KindTextNote},
		Limit: 5,
	}}

	sub, err := relay.Subscribe(subCtx, filters)
	if err != nil {
		log.Fatalf("Failed to subscribe: %v", err)
	}

	fmt.Printf("Subscription active, waiting for events (10s timeout)...\n")
	count := 0
	for evt := range sub.Events {
		count++
		// Truncate content for display.
		content := evt.Content
		if len(content) > 80 {
			content = content[:80] + "..."
		}
		fmt.Printf("  [%d] kind=%d author=%s... content=%q\n",
			count, evt.Kind, evt.PubKey[:12], content)

		if count >= 5 {
			break
		}
	}
	subCancel() // Explicitly cancel to clean up the subscription goroutine.
	fmt.Printf("Received %d events.\n", count)
	fmt.Println()

	// -------------------------------------------------------
	// 8. Using SimplePool for Multiple Relays
	// -------------------------------------------------------
	fmt.Println("--- 8. SimplePool (Multi-Relay) ---")

	pool := nostr.NewSimplePool(ctx)

	relays := []string{
		"wss://relay.damus.io",
		"wss://nos.lol",
		"wss://relay.nostr.band",
	}

	poolCtx, poolCancel := context.WithTimeout(ctx, 10*time.Second)
	defer poolCancel()

	filter := nostr.Filter{
		Kinds: []int{nostr.KindTextNote},
		Limit: 3,
	}

	fmt.Printf("Fetching events from %d relays...\n", len(relays))
	poolCount := 0
	for relayEvent := range pool.FetchMany(poolCtx, relays, filter) {
		poolCount++
		content := relayEvent.Event.Content
		if len(content) > 60 {
			content = content[:60] + "..."
		}
		fmt.Printf("  [%s] %s\n", relayEvent.Relay.URL, content)

		if poolCount >= 9 {
			break
		}
	}
	poolCancel()
	pool.Close("demo complete")
	fmt.Printf("Fetched %d events from pool.\n", poolCount)
	fmt.Println()

	// -------------------------------------------------------
	// 9. Filter Construction Examples
	// -------------------------------------------------------
	fmt.Println("--- 9. Filter Examples ---")

	// Filter by author and kind.
	f1 := nostr.Filter{
		Kinds:   []int{nostr.KindTextNote},
		Authors: []string{pk},
		Limit:   50,
	}
	fmt.Printf("Author filter: kinds=%v authors=[%s...] limit=%d\n",
		f1.Kinds, f1.Authors[0][:12], f1.Limit)

	// Filter by tag (e.g., replies to an event).
	f2 := nostr.Filter{
		Kinds: []int{nostr.KindTextNote, nostr.KindReaction},
		Tags: nostr.TagMap{
			"e": []string{evt.ID},
		},
	}
	fmt.Printf("Tag filter: kinds=%v tags=#e=[%s...]\n",
		f2.Kinds, evt.ID[:12])

	// Time-ranged filter.
	since := nostr.Timestamp(time.Now().Add(-1 * time.Hour).Unix())
	f3 := nostr.Filter{
		Kinds: []int{nostr.KindTextNote},
		Since: &since,
		Limit: 100,
	}
	fmt.Printf("Time filter: since=%v limit=%d\n",
		since.Time().Format(time.RFC3339), f3.Limit)

	// Check if an event matches a filter locally.
	matches := f1.Matches(&evt)
	fmt.Printf("Does our event match f1? %v\n", matches)
	fmt.Println()

	// -------------------------------------------------------
	// 10. Working with Tags
	// -------------------------------------------------------
	fmt.Println("--- 10. Tag Operations ---")

	tags := nostr.Tags{
		{"e", "abc123", "wss://relay.example.com", "reply"},
		{"p", "def456"},
		{"t", "nostr"},
		{"t", "golang"},
		{"d", "my-identifier"},
	}

	// Find first tag with key "t".
	tTag := tags.Find("t")
	fmt.Printf("First 't' tag: %v\n", tTag)

	// Find all tags with key "t" (returns an iterator).
	fmt.Print("All 't' tags: ")
	for tag := range tags.FindAll("t") {
		fmt.Printf("%v ", tag)
	}
	fmt.Println()

	// Get the "d" tag value (used for addressable events).
	dValue := tags.GetD()
	fmt.Printf("'d' tag value: %s\n", dValue)

	// Find a tag with a specific key and value.
	replyTag := tags.FindWithValue("e", "abc123")
	fmt.Printf("Reply tag: %v\n", replyTag)
	fmt.Println()

	// -------------------------------------------------------
	// 11. Event Kind Classification
	// -------------------------------------------------------
	fmt.Println("--- 11. Event Kind Classification ---")

	kinds := []int{0, 1, 5, 7, 10002, 20000, 30023, 34550}
	for _, k := range kinds {
		fmt.Printf("  Kind %5d: regular=%-5v replaceable=%-5v ephemeral=%-5v addressable=%-5v\n",
			k,
			nostr.IsRegularKind(k),
			nostr.IsReplaceableKind(k),
			nostr.IsEphemeralKind(k),
			nostr.IsAddressableKind(k),
		)
	}
	fmt.Println()

	// -------------------------------------------------------
	// Done
	// -------------------------------------------------------
	fmt.Println("=== Demo Complete ===")
	fmt.Println("Press Ctrl+C to exit or wait for cleanup...")

	// Graceful shutdown on interrupt.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
		fmt.Println("Shutting down...")
	case <-time.After(2 * time.Second):
		// Auto-exit after a short delay in demo mode.
	}

	cancel() // Cancel the top-level context, cleaning up all connections.
	fmt.Println("Goodbye!")
}
