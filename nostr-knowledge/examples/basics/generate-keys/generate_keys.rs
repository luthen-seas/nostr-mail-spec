//! NOSTR Key Generation — Rust
//!
//! Generates a secp256k1 keypair for use with the NOSTR protocol.
//! The private key is used to sign events; the public key is your identity.
//!
//! Dependencies (Cargo.toml):
//!   [dependencies]
//!   nostr-sdk = "0.35"
//!   tokio = { version = "1", features = ["full"] }
//!
//! Run:
//!   cargo run
//!
//! References:
//!   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
//!   - NIP-19: https://github.com/nostr-protocol/nips/blob/master/19.md

use nostr_sdk::prelude::*;

fn main() {
    // Step 1: Generate a random keypair.
    // Keys::generate() creates a cryptographically random secp256k1 keypair.
    let keys = Keys::generate();

    // Step 2: Extract the secret key and public key.
    // The secret key is 32 bytes; the public key is the x-only coordinate (32 bytes).
    let secret_key = keys.secret_key();
    let public_key = keys.public_key();

    // Step 3: Display in hex format.
    println!("=== NOSTR Key Generation ===\n");
    println!("Secret key (hex): {}", secret_key.display_secret());
    println!("Public key (hex): {}", public_key);

    // Step 4: Encode to bech32 format (NIP-19).
    // npub = bech32-encoded public key (starts with "npub1")
    // nsec = bech32-encoded secret key (starts with "nsec1")
    println!();
    println!("npub (bech32): {}", public_key.to_bech32().expect("bech32 encode"));
    println!("nsec (bech32): {}", secret_key.to_bech32().expect("bech32 encode"));

    println!();
    println!("WARNING: Never share your secret key (nsec) with anyone.");
    println!("Your public key (npub) is your identity — share it freely.");
}
