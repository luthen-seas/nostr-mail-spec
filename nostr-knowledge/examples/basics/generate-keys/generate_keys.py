"""
NOSTR Key Generation — Python

Generates a secp256k1 keypair for use with the NOSTR protocol.
The private key is used to sign events; the public key is your identity.

Dependencies:
    pip install pynostr

Run:
    python generate_keys.py

References:
    - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
    - NIP-19: https://github.com/nostr-protocol/nips/blob/master/19.md
"""

from pynostr.key import PrivateKey

# Step 1: Generate a random private key.
# PrivateKey() with no arguments generates a cryptographically random 32-byte key.
private_key = PrivateKey()

# Step 2: Derive the public key from the private key.
# This performs elliptic curve multiplication on secp256k1.
# The result is the x-only public key (32 bytes), as NOSTR uses Schnorr signatures (BIP-340).
public_key = private_key.public_key

# Step 3: Display in hex format.
# The raw hex is the canonical representation used in NOSTR events.
print("=== NOSTR Key Generation ===\n")
print(f"Secret key (hex): {private_key.hex()}")
print(f"Public key (hex): {public_key.hex()}")

# Step 4: Encode to bech32 format (NIP-19).
# npub = bech32-encoded public key (starts with "npub1")
# nsec = bech32-encoded secret key (starts with "nsec1")
print(f"\nnpub (bech32): {public_key.bech32()}")
print(f"nsec (bech32): {private_key.bech32()}")

print("\nWARNING: Never share your secret key (nsec) with anyone.")
print("Your public key (npub) is your identity — share it freely.")
