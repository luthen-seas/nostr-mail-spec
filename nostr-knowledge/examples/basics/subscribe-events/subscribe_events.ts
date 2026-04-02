/**
 * NOSTR Subscribe to Events — TypeScript
 *
 * Subscribe to a relay with filters and handle streaming events in real-time.
 * Demonstrates multiple filter types and the EOSE boundary.
 *
 * Dependencies:
 *   npm install nostr-tools ws
 *   npm install -D @types/ws
 *
 * Run:
 *   npx ts-node subscribe_events.ts
 *
 * References:
 *   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { Relay } from "nostr-tools/relay";
import type { Filter } from "nostr-tools/filter";
import type { Event } from "nostr-tools/pure";

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

const RELAY_URL = "wss://relay.nostr.band";

async function main(): Promise<void> {
  console.log("=== NOSTR Subscribe to Events ===\n");

  // Step 1: Connect to the relay.
  console.log(`Connecting to ${RELAY_URL}...`);
  const relay = await Relay.connect(RELAY_URL);
  console.log(`Connected to ${relay.url}\n`);

  // Step 2: Define subscription filters.
  // You can pass multiple filters — the relay returns events matching ANY of them.
  //
  // Filter fields (all optional, AND-ed within a filter):
  //   ids:     specific event IDs
  //   authors: specific public keys
  //   kinds:   event kinds (1=text note, 0=metadata, 3=contacts, etc.)
  //   #e:      events referenced by "e" tag
  //   #p:      pubkeys referenced by "p" tag
  //   since:   events created after this timestamp
  //   until:   events created before this timestamp
  //   limit:   max number of stored events to return

  const now = Math.floor(Date.now() / 1000);

  // Filter 1: Recent text notes (last 60 seconds).
  const textNotesFilter: Filter = {
    kinds: [1],
    since: now - 60,
    limit: 10,
  };

  // Filter 2: Recent metadata events (kind 0 = user profile).
  const metadataFilter: Filter = {
    kinds: [0],
    limit: 3,
  };

  let storedCount = 0;
  let realtimeCount = 0;
  let eoseReceived = false;

  console.log("Subscribing with two filters:");
  console.log("  1. Kind 1 (text notes) from the last 60 seconds, limit 10");
  console.log("  2. Kind 0 (metadata/profiles), limit 3");
  console.log("Waiting for events...\n");

  // Step 3: Subscribe.
  const sub = relay.subscribe([textNotesFilter, metadataFilter], {
    onevent(event: Event) {
      const label = eoseReceived ? "[REAL-TIME]" : "[STORED]";

      if (eoseReceived) {
        realtimeCount++;
      } else {
        storedCount++;
      }

      // Display event summary.
      const kindLabel = event.kind === 0 ? "metadata" : event.kind === 1 ? "text note" : `kind ${event.kind}`;
      const content = event.content.substring(0, 80).replace(/\n/g, " ");
      const preview = event.content.length > 80 ? content + "..." : content;

      console.log(`${label} ${kindLabel}`);
      console.log(`  ID:      ${event.id.substring(0, 16)}...`);
      console.log(`  Author:  ${event.pubkey.substring(0, 16)}...`);
      console.log(`  Time:    ${new Date(event.created_at * 1000).toISOString()}`);
      console.log(`  Content: ${preview}`);
      console.log();

      // Stop after 3 real-time events for demo purposes.
      if (realtimeCount >= 3) {
        console.log("Received 3 real-time events. Closing...\n");
        sub.close();
        relay.close();
      }
    },

    oneose() {
      eoseReceived = true;
      console.log("=== EOSE (End of Stored Events) ===");
      console.log(`Received ${storedCount} stored events.`);
      console.log("Now waiting for real-time events (will stop after 3)...\n");

      // Set a timeout in case no real-time events arrive.
      setTimeout(() => {
        if (realtimeCount === 0) {
          console.log("No real-time events received within 15 seconds. Closing...\n");
          sub.close();
          relay.close();
        }
      }, 15000);
    },
  });
}

main().catch(console.error);
