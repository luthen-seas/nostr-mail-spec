"""
NOSTR Verify Event Signature — Python

Takes a NOSTR event (as JSON), recomputes the event ID from the canonical
serialization, and verifies the Schnorr signature (BIP-340).

Dependencies:
    pip install pynostr

Run:
    python verify_signature.py

References:
    - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
"""

import hashlib
import json
import time

from pynostr.key import PrivateKey
from pynostr.event import Event

print("=== NOSTR Verify Event Signature ===\n")

# --- Create a sample event to verify ---
# In production, you'd receive this from a relay or another client.
private_key = PrivateKey()
public_key = private_key.public_key

event = Event(
    pubkey=public_key.hex(),
    created_at=int(time.time()),
    kind=1,
    tags=[],
    content="This is a signed NOSTR event for verification testing.",
)
private_key.sign_event(event)

print("Sample event to verify:")
print(json.dumps(event.to_dict(), indent=2))
print()

# --- Step 1: Manually recompute the event ID ---
# The ID is SHA-256 of the canonical serialization:
#   [0, <pubkey>, <created_at>, <kind>, <tags>, <content>]
serialization = json.dumps(
    [0, event.pubkey, event.created_at, event.kind, event.tags, event.content],
    separators=(",", ":"),
    ensure_ascii=False,
)
computed_id = hashlib.sha256(serialization.encode("utf-8")).hexdigest()

print("--- Step 1: Verify Event ID ---")
print(f"  Serialized: {serialization}")
print(f"  Computed ID:  {computed_id}")
print(f"  Event ID:     {event.id}")
print(f"  ID matches:   {computed_id == event.id}")
print()

# --- Step 2: Verify the Schnorr signature ---
# The event's verify() method checks the BIP-340 Schnorr signature.
# It verifies that event.sig is a valid signature over event.id
# using the public key event.pubkey.
is_valid = event.verify()

print("--- Step 2: Verify Schnorr Signature ---")
print(f"  Signature valid: {is_valid}")
print()

# --- Step 3: Demonstrate what happens with a tampered event ---
print("--- Tampering Test ---")

# Create a tampered event with modified content but original ID and sig.
tampered = Event(
    pubkey=event.pubkey,
    created_at=event.created_at,
    kind=event.kind,
    tags=event.tags,
    content="TAMPERED CONTENT",
)
# Manually set the original ID and signature (simulating tampering).
tampered.id = event.id
tampered.sig = event.sig

# Recompute the ID for the tampered event.
tampered_serialization = json.dumps(
    [0, tampered.pubkey, tampered.created_at, tampered.kind, tampered.tags, tampered.content],
    separators=(",", ":"),
    ensure_ascii=False,
)
tampered_computed_id = hashlib.sha256(tampered_serialization.encode("utf-8")).hexdigest()

print(f'  Original content: "{event.content}"')
print(f'  Tampered content: "{tampered.content}"')
print(f"  Tampered computed ID: {tampered_computed_id}")
print(f"  Stored ID:            {tampered.id}")
print(f"  ID matches: {tampered_computed_id == tampered.id}")
print()

# --- Step 4: Explain the full verification flow ---
print("--- Verification Steps ---")
print("1. Serialize: [0, pubkey, created_at, kind, tags, content]")
print("2. Compute SHA-256 of the serialized JSON string")
print("3. Compare computed hash with event.id")
print("4. Verify Schnorr signature (event.sig) over event.id using event.pubkey")
print("5. If ID matches AND signature is valid -> event is authentic")
