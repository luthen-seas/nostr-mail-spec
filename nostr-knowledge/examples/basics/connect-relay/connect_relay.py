"""
NOSTR Connect to Relay — Python

Connects to a NOSTR relay via WebSocket, sends a REQ subscription,
receives events, and handles the EOSE (End Of Stored Events) message.

Dependencies:
    pip install pynostr websocket-client

Run:
    python connect_relay.py

References:
    - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
"""

import json
import uuid
from datetime import datetime, timezone

import websocket

RELAY_URL = "wss://relay.damus.io"


def main():
    print("=== NOSTR Connect to Relay ===\n")

    # Step 1: Connect to the relay via WebSocket.
    print(f"Connecting to {RELAY_URL}...")
    ws = websocket.create_connection(RELAY_URL)
    print(f"Connected to {RELAY_URL}\n")

    # Step 2: Create a subscription ID.
    # Each subscription needs a unique ID so we can match responses.
    subscription_id = str(uuid.uuid4())[:8]

    # Step 3: Define a filter and send a REQ message.
    # REQ format: ["REQ", <subscription_id>, <filter>]
    # This filter requests the 5 most recent kind 1 (text note) events.
    filter_obj = {
        "kinds": [1],    # Kind 1 = text notes
        "limit": 5,      # Only return the 5 most recent
    }

    req_message = json.dumps(["REQ", subscription_id, filter_obj])
    print(f"Sending REQ: {req_message}")
    print("Waiting for events...\n")
    ws.send(req_message)

    # Step 4: Receive messages from the relay.
    # The relay sends three types of messages:
    #   ["EVENT", <sub_id>, <event>]  — an event matching our filter
    #   ["EOSE", <sub_id>]            — end of stored events
    #   ["NOTICE", <message>]         — informational message from relay
    try:
        while True:
            raw = ws.recv()
            message = json.loads(raw)

            if message[0] == "EVENT":
                # An event matching our subscription filter.
                event = message[2]
                ts = datetime.fromtimestamp(event["created_at"], tz=timezone.utc)
                content_preview = event["content"][:100]
                if len(event["content"]) > 100:
                    content_preview += "..."

                print("--- Received Event ---")
                print(f"  ID:      {event['id']}")
                print(f"  Author:  {event['pubkey']}")
                print(f"  Kind:    {event['kind']}")
                print(f"  Time:    {ts.isoformat()}")
                print(f"  Content: {content_preview}")
                print()

            elif message[0] == "EOSE":
                # All stored events have been sent.
                print("=== EOSE (End of Stored Events) ===")
                print("All stored events received. New events would stream in real-time.")
                print("Closing subscription and disconnecting...\n")
                break

            elif message[0] == "NOTICE":
                print(f"NOTICE from relay: {message[1]}")

    finally:
        # Step 5: Clean up.
        # Send CLOSE to unsubscribe, then close the WebSocket.
        close_message = json.dumps(["CLOSE", subscription_id])
        ws.send(close_message)
        ws.close()
        print("Disconnected.")


if __name__ == "__main__":
    main()
