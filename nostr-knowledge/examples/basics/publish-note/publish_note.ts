/**
 * NOSTR Publish a Text Note — TypeScript
 *
 * Full end-to-end flow: generate keys, create a kind 1 event,
 * connect to a relay, publish the event, and receive the OK response.
 *
 * Dependencies:
 *   npm install nostr-tools ws
 *   npm install -D @types/ws
 *
 * Run:
 *   npx ts-node publish_note.ts
 *
 * References:
 *   - NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import { Relay } from "nostr-tools/relay";
import type { EventTemplate } from "nostr-tools/pure";

import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

const RELAY_URL = "wss://nos.lol";

async function main(): Promise<void> {
  console.log("=== NOSTR Publish a Text Note ===\n");

  // Step 1: Generate a fresh keypair.
  // In a real app, you'd load an existing key from secure storage.
  const secretKey = generateSecretKey();
  const publicKey = getPublicKey(secretKey);
  console.log("Generated keypair:");
  console.log(`  Public key: ${publicKey}\n`);

  // Step 2: Create the event template.
  // Kind 1 = text note. The content is the note's text.
  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: "Hello from nostr-tools! Publishing my first note via the protocol.",
  };

  // Step 3: Finalize the event (compute ID + sign).
  const signedEvent = finalizeEvent(eventTemplate, secretKey);
  console.log("Event created and signed:");
  console.log(`  Event ID: ${signedEvent.id}`);
  console.log(`  Content:  "${signedEvent.content}"\n`);

  // Step 4: Connect to the relay.
  console.log(`Connecting to ${RELAY_URL}...`);
  const relay = await Relay.connect(RELAY_URL);
  console.log(`Connected to ${relay.url}\n`);

  // Step 5: Publish the event.
  // This sends ["EVENT", <event>] to the relay.
  // The relay responds with ["OK", <event_id>, <success>, <message>].
  console.log("Publishing event...");
  try {
    await relay.publish(signedEvent);
    console.log("Event published successfully!");
    console.log(`  Relay confirmed acceptance of event ${signedEvent.id}`);
  } catch (err) {
    console.error("Failed to publish event:", err);
  }

  // Step 6: Disconnect.
  relay.close();
  console.log("\nDisconnected from relay.");
}

main().catch(console.error);
