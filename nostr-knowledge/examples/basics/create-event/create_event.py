"""
NOSTR Create & Sign Event — Python

Creates a kind 1 text note event, computes the event ID (SHA-256 of the
canonical serialization), and signs it with a Schnorr signature (BIP-340).

Dependencies:
    pip install pynostr

Run:
    python create_event.py

References:
    - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
"""

import json
import time
from pynostr.key import PrivateKey
from pynostr.event import Event

# Step 1: Generate keys (in production, load from secure storage).
private_key = PrivateKey()
public_key = private_key.public_key

print("=== NOSTR Create & Sign Event ===\n")
print(f"Public key: {public_key.hex()}")

# Step 2: Build the event.
# A kind 1 event is a "text note" — the most basic NOSTR event.
event = Event(
    pubkey=public_key.hex(),
    created_at=int(time.time()),    # Unix timestamp in seconds
    kind=1,                          # Kind 1 = text note (NIP-01)
    tags=[],                         # No tags for a simple note
    content="Hello, NOSTR! This is my first note.",
)

# Step 3: Sign the event.
# event.sign() does two things:
#   a) Computes the event ID = SHA-256(canonical JSON serialization)
#      Serialization format: [0, pubkey, created_at, kind, tags, content]
#   b) Signs the ID with a Schnorr signature (BIP-340) using the private key
private_key.sign_event(event)

# Step 4: Display the signed event.
print("\nSigned event:\n")
print(json.dumps(event.to_dict(), indent=2))

# Step 5: Explain the ID computation.
# The event ID is the SHA-256 hash of the following JSON serialization:
serialization = json.dumps(
    [0, event.pubkey, event.created_at, event.kind, event.tags, event.content],
    separators=(",", ":"),
    ensure_ascii=False,
)
print("\n--- ID Computation ---")
print(f"Serialized: {serialization}")
print(f"SHA-256 of above = event ID: {event.id}")

print("\n--- Field Breakdown ---")
print(f"id:         {event.id}")
print(f"pubkey:     {event.pubkey}")
print(f"created_at: {event.created_at}")
print(f"kind:       {event.kind}")
print(f"tags:       {event.tags}")
print(f'content:    "{event.content}"')
print(f"sig:        {event.sig}")
