/*
NOSTR Key Generation — Go

Generates a secp256k1 keypair for use with the NOSTR protocol.
The private key is used to sign events; the public key is your identity.

Dependencies:
	go get github.com/nbd-wtf/go-nostr

Run:
	go run generate_keys.go

References:
	- NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
	- NIP-19: https://github.com/nostr-protocol/nips/blob/master/19.md
*/

package main

import (
	"fmt"
	"log"

	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip19"
)

func main() {
	// Step 1: Generate a random secret key.
	// go-nostr returns the key as a hex string.
	secretKey := nostr.GeneratePrivateKey()

	// Step 2: Derive the public key from the secret key.
	// This performs elliptic curve multiplication on secp256k1.
	// The result is the x-only public key (32 bytes, hex-encoded).
	publicKey, err := nostr.GetPublicKey(secretKey)
	if err != nil {
		log.Fatalf("Failed to derive public key: %v", err)
	}

	// Step 3: Encode to bech32 format (NIP-19).
	// npub = bech32-encoded public key (starts with "npub1")
	// nsec = bech32-encoded secret key (starts with "nsec1")
	npub, err := nip19.EncodePublicKey(publicKey)
	if err != nil {
		log.Fatalf("Failed to encode npub: %v", err)
	}

	nsec, err := nip19.EncodePrivateKey(secretKey)
	if err != nil {
		log.Fatalf("Failed to encode nsec: %v", err)
	}

	// Step 4: Display the results.
	fmt.Println("=== NOSTR Key Generation ===")
	fmt.Println()
	fmt.Println("Secret key (hex):", secretKey)
	fmt.Println("Public key (hex):", publicKey)
	fmt.Println()
	fmt.Println("npub (bech32):", npub)
	fmt.Println("nsec (bech32):", nsec)
	fmt.Println()
	fmt.Println("WARNING: Never share your secret key (nsec) with anyone.")
	fmt.Println("Your public key (npub) is your identity — share it freely.")
}
