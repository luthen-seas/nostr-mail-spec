/**
 * NOSTR Connect to Relay — TypeScript
 *
 * Connects to a NOSTR relay via WebSocket, sends a REQ subscription,
 * receives events, and handles the EOSE (End Of Stored Events) message.
 *
 * Dependencies:
 *   npm install nostr-tools ws
 *   npm install -D @types/ws
 *
 * Run:
 *   npx ts-node connect_relay.ts
 *
 * References:
 *   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { Relay } from "nostr-tools/relay";
import type { Filter } from "nostr-tools/filter";
import type { Event } from "nostr-tools/pure";

// For Node.js, we need a WebSocket polyfill.
// In browser environments, the native WebSocket is used automatically.
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

const RELAY_URL = "wss://relay.damus.io";

async function main(): Promise<void> {
  console.log("=== NOSTR Connect to Relay ===\n");

  // Step 1: Connect to the relay.
  // This opens a WebSocket connection and waits for the connection to be established.
  console.log(`Connecting to ${RELAY_URL}...`);
  const relay = await Relay.connect(RELAY_URL);
  console.log(`Connected to ${relay.url}\n`);

  // Step 2: Define a subscription filter.
  // Filters tell the relay which events we want to receive.
  // This filter requests the 5 most recent kind 1 (text note) events.
  const filter: Filter = {
    kinds: [1],    // Kind 1 = text notes
    limit: 5,     // Only return the 5 most recent
  };

  // Step 3: Subscribe to events matching the filter.
  // The relay sends matching stored events, then an EOSE message,
  // then continues streaming new events that match in real-time.
  console.log("Subscribing with filter:", JSON.stringify(filter));
  console.log("Waiting for events...\n");

  const sub = relay.subscribe([filter], {
    // Called for each event received (both stored and real-time).
    onevent(event: Event) {
      console.log("--- Received Event ---");
      console.log(`  ID:      ${event.id}`);
      console.log(`  Author:  ${event.pubkey}`);
      console.log(`  Kind:    ${event.kind}`);
      console.log(`  Time:    ${new Date(event.created_at * 1000).toISOString()}`);
      console.log(`  Content: ${event.content.substring(0, 100)}${event.content.length > 100 ? "..." : ""}`);
      console.log();
    },

    // Called when the relay has sent all stored events matching the filter.
    // After EOSE, any new events are real-time.
    oneose() {
      console.log("=== EOSE (End of Stored Events) ===");
      console.log("All stored events received. New events would stream in real-time.");
      console.log("Closing subscription and disconnecting...\n");

      // Step 4: Clean up.
      sub.close();       // Unsubscribe (sends CLOSE to relay)
      relay.close();     // Close WebSocket connection
    },
  });
}

main().catch(console.error);
