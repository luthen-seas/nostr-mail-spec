"""
NOSTR Subscribe to Events — Python

Subscribe to a relay with filters and handle streaming events in real-time.
Demonstrates multiple filter types and the EOSE boundary.

Dependencies:
    pip install pynostr websocket-client

Run:
    python subscribe_events.py

References:
    - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
"""

import json
import time
import uuid

import websocket

RELAY_URL = "wss://relay.nostr.band"


def main():
    print("=== NOSTR Subscribe to Events ===\n")

    # Step 1: Connect to the relay.
    print(f"Connecting to {RELAY_URL}...")
    ws = websocket.create_connection(RELAY_URL, timeout=30)
    print(f"Connected to {RELAY_URL}\n")

    # Step 2: Create a subscription ID.
    subscription_id = "sub_" + str(uuid.uuid4())[:8]

    # Step 3: Define subscription filters.
    # Multiple filters in one REQ — relay returns events matching ANY filter.
    #
    # Filter fields (all optional, AND-ed within a single filter):
    #   ids:     specific event IDs
    #   authors: specific public keys
    #   kinds:   event kinds (1=text note, 0=metadata, 3=contacts, etc.)
    #   #e:      events referenced by "e" tag
    #   #p:      pubkeys referenced by "p" tag
    #   since:   events after this unix timestamp
    #   until:   events before this unix timestamp
    #   limit:   max stored events to return

    now = int(time.time())

    # Filter 1: Recent text notes (last 60 seconds).
    text_notes_filter = {
        "kinds": [1],
        "since": now - 60,
        "limit": 10,
    }

    # Filter 2: Recent metadata events (kind 0 = user profiles).
    metadata_filter = {
        "kinds": [0],
        "limit": 3,
    }

    # Step 4: Send REQ with multiple filters.
    # Format: ["REQ", <sub_id>, <filter1>, <filter2>, ...]
    req = json.dumps(["REQ", subscription_id, text_notes_filter, metadata_filter])
    print("Subscribing with two filters:")
    print("  1. Kind 1 (text notes) from the last 60 seconds, limit 10")
    print("  2. Kind 0 (metadata/profiles), limit 3")
    print("Waiting for events...\n")
    ws.send(req)

    # Step 5: Receive and process messages.
    stored_count = 0
    realtime_count = 0
    eose_received = False
    max_realtime = 3

    try:
        while True:
            raw = ws.recv()
            message = json.loads(raw)

            if message[0] == "EVENT" and message[1] == subscription_id:
                event = message[2]

                if eose_received:
                    label = "[REAL-TIME]"
                    realtime_count += 1
                else:
                    label = "[STORED]"
                    stored_count += 1

                # Determine event kind name.
                kind = event["kind"]
                kind_label = {0: "metadata", 1: "text note"}.get(kind, f"kind {kind}")

                # Preview content (truncated).
                content = event["content"][:80].replace("\n", " ")
                if len(event["content"]) > 80:
                    content += "..."

                ts = time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ",
                    time.gmtime(event["created_at"]),
                )

                print(f"{label} {kind_label}")
                print(f"  ID:      {event['id'][:16]}...")
                print(f"  Author:  {event['pubkey'][:16]}...")
                print(f"  Time:    {ts}")
                print(f"  Content: {content}")
                print()

                # Stop after a few real-time events for demo purposes.
                if realtime_count >= max_realtime:
                    print(f"Received {max_realtime} real-time events. Closing...\n")
                    break

            elif message[0] == "EOSE" and message[1] == subscription_id:
                eose_received = True
                print("=== EOSE (End of Stored Events) ===")
                print(f"Received {stored_count} stored events.")
                print(f"Now waiting for real-time events (will stop after {max_realtime})...\n")

                # Set a shorter timeout for real-time waiting.
                ws.settimeout(15)

            elif message[0] == "NOTICE":
                print(f"NOTICE: {message[1]}")

    except websocket.WebSocketTimeoutException:
        print("No more real-time events received within timeout. Closing...\n")

    finally:
        # Step 6: Clean up.
        close_msg = json.dumps(["CLOSE", subscription_id])
        ws.send(close_msg)
        ws.close()
        print("Disconnected.")
        print(f"\nSummary: {stored_count} stored + {realtime_count} real-time = {stored_count + realtime_count} total events")


if __name__ == "__main__":
    main()
