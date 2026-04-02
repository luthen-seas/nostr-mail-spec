"""
NOSTR Publish a Text Note — Python

Full end-to-end flow: generate keys, create a kind 1 event,
connect to a relay, publish the event, and receive the OK response.

Dependencies:
    pip install pynostr websocket-client

Run:
    python publish_note.py

References:
    - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
"""

import json
import time

import websocket
from pynostr.key import PrivateKey
from pynostr.event import Event

RELAY_URL = "wss://nos.lol"


def main():
    print("=== NOSTR Publish a Text Note ===\n")

    # Step 1: Generate a fresh keypair.
    # In a real app, you'd load an existing key from secure storage.
    private_key = PrivateKey()
    public_key = private_key.public_key
    print("Generated keypair:")
    print(f"  Public key: {public_key.hex()}\n")

    # Step 2: Create and sign the event.
    # Kind 1 = text note. The content is the note's text.
    event = Event(
        pubkey=public_key.hex(),
        created_at=int(time.time()),
        kind=1,
        tags=[],
        content="Hello from pynostr! Publishing my first note via the protocol.",
    )
    private_key.sign_event(event)

    print("Event created and signed:")
    print(f"  Event ID: {event.id}")
    print(f'  Content:  "{event.content}"\n')

    # Step 3: Connect to the relay via WebSocket.
    print(f"Connecting to {RELAY_URL}...")
    ws = websocket.create_connection(RELAY_URL)
    print(f"Connected to {RELAY_URL}\n")

    # Step 4: Publish the event.
    # Send ["EVENT", <event_json>] to the relay.
    event_message = json.dumps(["EVENT", event.to_dict()])
    print("Publishing event...")
    ws.send(event_message)

    # Step 5: Wait for the OK response.
    # The relay responds with ["OK", <event_id>, <success: bool>, <message>].
    raw = ws.recv()
    response = json.loads(raw)

    if response[0] == "OK":
        event_id = response[1]
        success = response[2]
        message = response[3] if len(response) > 3 else ""

        if success:
            print("Event published successfully!")
            print(f"  Relay confirmed acceptance of event {event_id}")
        else:
            print(f"Relay rejected event: {message}")
    elif response[0] == "NOTICE":
        print(f"Relay notice: {response[1]}")
    else:
        print(f"Unexpected response: {response}")

    # Step 6: Disconnect.
    ws.close()
    print("\nDisconnected from relay.")


if __name__ == "__main__":
    main()
