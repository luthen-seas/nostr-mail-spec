#!/usr/bin/env python3
"""
basic_usage.py -- Complete pynostr example

Demonstrates:
  1. Key generation (or import)
  2. Event creation and signing
  3. Connecting to relays
  4. Publishing an event
  5. Subscribing to events with filters
  6. Receiving and processing events

Requirements:
    pip install pynostr[websocket-client]

Usage:
    python basic_usage.py
"""

import time
import sys

from pynostr.key import PrivateKey
from pynostr.event import Event, EventKind
from pynostr.relay_manager import RelayManager
from pynostr.filters import FiltersList, Filters


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RELAYS = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
]

# Set to None to generate a fresh key pair each run.
# Or paste your nsec here to reuse an identity:
NSEC = None  # e.g., "nsec1..."


# ---------------------------------------------------------------------------
# 1. Key Generation
# ---------------------------------------------------------------------------

def get_keys():
    """Generate a new key pair or import from NSEC."""
    if NSEC:
        private_key = PrivateKey.from_nsec(NSEC)
        print(f"Imported existing identity")
    else:
        private_key = PrivateKey()
        print(f"Generated new identity")

    public_key = private_key.public_key

    print(f"  nsec: {private_key.bech32()}")
    print(f"  npub: {public_key.bech32()}")
    print(f"  hex pubkey: {public_key.hex()}")
    print()

    return private_key, public_key


# ---------------------------------------------------------------------------
# 2. Event Creation and Signing
# ---------------------------------------------------------------------------

def create_text_note(private_key, content):
    """Create a kind-1 text note, sign it, and return the Event."""
    event = Event(
        content=content,
        kind=EventKind.TEXT_NOTE,
    )
    event.sign(private_key.hex())

    print(f"Created event:")
    print(f"  id:      {event.id}")
    print(f"  pubkey:  {event.public_key}")
    print(f"  kind:    {event.kind}")
    print(f"  content: {event.content}")
    print(f"  sig:     {event.signature[:32]}...")
    print(f"  valid:   {event.verify()}")
    print()

    return event


# ---------------------------------------------------------------------------
# 3. Relay Connection and Publishing
# ---------------------------------------------------------------------------

def publish_event(event, relays):
    """Connect to relays and publish an event."""
    relay_manager = RelayManager()

    for relay_url in relays:
        relay_manager.add_relay(relay_url)
        print(f"Added relay: {relay_url}")

    # Queue the event for publishing
    relay_manager.publish_event(event)

    # Open connections, send the event, process initial responses
    print("\nConnecting and publishing...")
    relay_manager.run_sync()

    # Wait for relay acknowledgments
    time.sleep(3)

    # Check for OK notices (NIP-20 command results)
    ok_count = 0
    while relay_manager.message_pool.has_ok_notices():
        ok_msg = relay_manager.message_pool.get_ok_notice()
        status = "accepted" if ok_msg.ok else "rejected"
        print(f"  Relay {status}: event {ok_msg.event_id[:16]}...")
        ok_count += 1

    # Check for error notices
    while relay_manager.message_pool.has_notices():
        notice = relay_manager.message_pool.get_notice()
        print(f"  Relay notice: {notice.content}")

    print(f"\nPublish complete ({ok_count} relay acknowledgments)")
    print()

    return relay_manager


# ---------------------------------------------------------------------------
# 4. Subscribing and Receiving Events
# ---------------------------------------------------------------------------

def subscribe_and_receive(relays, authors=None, limit=10):
    """
    Subscribe to text notes from specific authors (or global if None),
    receive events, and print them.
    """
    relay_manager = RelayManager()

    for relay_url in relays:
        relay_manager.add_relay(relay_url)

    # Build filter
    filter_kwargs = {
        "kinds": [EventKind.TEXT_NOTE],
        "limit": limit,
    }
    if authors:
        filter_kwargs["authors"] = authors

    filters = FiltersList([Filters(**filter_kwargs)])

    # Create subscription
    subscription_id = "basic-usage-sub"
    relay_manager.add_subscription_on_all_relays(subscription_id, filters)

    print(f"Subscribing to text notes (limit={limit})...")
    if authors:
        print(f"  Filtering by {len(authors)} author(s)")

    # Connect and fetch
    relay_manager.run_sync()

    # Allow time for events to arrive
    time.sleep(5)

    # Process received events
    events = []
    while relay_manager.message_pool.has_events():
        event_msg = relay_manager.message_pool.get_event()
        events.append(event_msg.event)

    # Check for End of Stored Events (NIP-15)
    while relay_manager.message_pool.has_eose_notices():
        eose = relay_manager.message_pool.get_eose_notice()
        print(f"  EOSE received for subscription: {eose.subscription_id}")

    print(f"\nReceived {len(events)} events:\n")

    for i, evt in enumerate(events, 1):
        # Truncate long content for display
        content_preview = evt.content[:120]
        if len(evt.content) > 120:
            content_preview += "..."

        print(f"  [{i}] Event {evt.id[:16]}...")
        print(f"      Author: {evt.public_key[:16]}...")
        print(f"      Time:   {evt.created_at}")
        print(f"      Content: {content_preview}")
        print()

    # Close subscription
    relay_manager.close_subscription_on_all_relays(subscription_id)
    print("Subscription closed.")
    print()

    return events


# ---------------------------------------------------------------------------
# 5. Complete Workflow: Reply to an Event
# ---------------------------------------------------------------------------

def reply_to_event(private_key, original_event, reply_text, relays):
    """Create and publish a reply to an existing event."""
    reply = Event(
        content=reply_text,
        kind=EventKind.TEXT_NOTE,
    )

    # NIP-10: add references to the original event and author
    reply.add_event_ref(original_event.id)
    reply.add_pubkey_ref(original_event.public_key)

    reply.sign(private_key.hex())

    print(f"Created reply:")
    print(f"  Replying to: {original_event.id[:16]}...")
    print(f"  Content: {reply_text}")
    print(f"  Tags: {reply.tags}")
    print()

    # Publish the reply
    publish_event(reply, relays)

    return reply


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("pynostr Basic Usage Example")
    print("=" * 60)
    print()

    # Step 1: Keys
    print("--- Step 1: Key Generation ---")
    private_key, public_key = get_keys()

    # Step 2: Create an event
    print("--- Step 2: Create and Sign an Event ---")
    event = create_text_note(
        private_key,
        "Hello NOSTR from pynostr! This is a test note."
    )

    # Step 3: Publish
    print("--- Step 3: Publish to Relays ---")
    publish_event(event, RELAYS)

    # Step 4: Subscribe and receive
    print("--- Step 4: Subscribe to Recent Notes ---")
    received = subscribe_and_receive(RELAYS, limit=5)

    # Step 5: Reply (only if we received events)
    if received:
        print("--- Step 5: Reply to First Received Event ---")
        reply_to_event(
            private_key,
            received[0],
            "Interesting note! (automated reply from pynostr example)",
            RELAYS,
        )

    print("=" * 60)
    print("Done.")
    print("=" * 60)


if __name__ == "__main__":
    main()
