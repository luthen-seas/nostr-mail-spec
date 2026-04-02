/**
 * Threads and Replies (Kind 1) — NIP-10
 *
 * Demonstrates how to:
 *   1. Post a root note (thread starter)
 *   2. Reply with proper e-tag markers (root, reply)
 *   3. Build a nested reply chain
 *   4. Fetch all replies to build a thread view
 *
 * NIP-10 defines how e-tags should be structured with "markers" to
 * indicate the thread root and the specific event being replied to.
 *
 * Run:
 *   npx ts-node threads.ts
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type Event,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import "websocket-polyfill";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// ---------------------------------------------------------------------------
// 1. Post a root note (thread starter)
// ---------------------------------------------------------------------------

function createRootNote(sk: Uint8Array): Event {
  // A root note is a normal kind 1 with no e-tag references.
  // It is the start of a thread.
  return finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", "nostr"]],
      content:
        "What is the most underrated feature of NOSTR? I think relay-based content routing is incredibly powerful but rarely discussed.",
    },
    sk
  );
}

// ---------------------------------------------------------------------------
// 2. Reply to a root note (direct reply)
// ---------------------------------------------------------------------------

function createReply(
  sk: Uint8Array,
  rootEvent: Event,
  replyToEvent: Event
): Event {
  // NIP-10 marker-based threading:
  //
  // When replying, include e-tags with markers:
  //   ["e", <root-event-id>, <relay-url>, "root"]   — always points to thread root
  //   ["e", <reply-to-event-id>, <relay-url>, "reply"] — the specific event being replied to
  //
  // Also include p-tags for all participants being replied to.
  //
  // If replying directly to the root, root and reply point to the same event.

  const isDirectReplyToRoot = rootEvent.id === replyToEvent.id;

  const tags: string[][] = [
    // Root marker — always present, always points to the thread's first event
    ["e", rootEvent.id, RELAYS[0], "root"],
  ];

  // Reply marker — only add if we are replying to a non-root event
  if (!isDirectReplyToRoot) {
    tags.push(["e", replyToEvent.id, RELAYS[0], "reply"]);
  }

  // P-tags for participants
  // Always tag the root author
  tags.push(["p", rootEvent.pubkey]);

  // Tag the author of the event we are replying to (if different from root)
  if (replyToEvent.pubkey !== rootEvent.pubkey) {
    tags.push(["p", replyToEvent.pubkey]);
  }

  return finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: isDirectReplyToRoot
        ? "Great question! I think NIP-65 relay lists are underrated. They enable true decentralization of content routing."
        : "Building on that point, relay discovery through NIP-65 makes it possible for small relays to participate in the global conversation.",
    },
    sk
  );
}

// ---------------------------------------------------------------------------
// 3. Build a complete thread (root + multiple replies)
// ---------------------------------------------------------------------------

async function buildThread(pool: SimplePool): Promise<{
  root: Event;
  replies: Event[];
}> {
  console.log("=== Build a Thread ===\n");

  // Create three participants
  const aliceSk = generateSecretKey();
  const bobSk = generateSecretKey();
  const carolSk = generateSecretKey();

  const alicePk = getPublicKey(aliceSk);
  const bobPk = getPublicKey(bobSk);
  const carolPk = getPublicKey(carolSk);

  console.log("Participants:");
  console.log("  Alice:", alicePk.slice(0, 16) + "...");
  console.log("  Bob:  ", bobPk.slice(0, 16) + "...");
  console.log("  Carol:", carolPk.slice(0, 16) + "...\n");

  // 1. Alice posts the root note
  const root = createRootNote(aliceSk);
  await Promise.allSettled(pool.publish(RELAYS, root));
  console.log("[Root]  Alice:", root.content.slice(0, 60) + "...");
  console.log("        Event ID:", root.id, "\n");

  // 2. Bob replies to the root
  const bobReply = createReply(bobSk, root, root);
  await Promise.allSettled(pool.publish(RELAYS, bobReply));
  console.log("[Reply] Bob (to root):", bobReply.content.slice(0, 60) + "...");
  console.log("        Event ID:", bobReply.id);
  printETagMarkers(bobReply);

  // 3. Carol replies to Bob's reply (nested)
  const carolReply = createReply(carolSk, root, bobReply);
  await Promise.allSettled(pool.publish(RELAYS, carolReply));
  console.log(
    "\n[Reply] Carol (to Bob):",
    carolReply.content.slice(0, 60) + "..."
  );
  console.log("        Event ID:", carolReply.id);
  printETagMarkers(carolReply);

  // 4. Alice replies to Carol (deeper nesting)
  const aliceFollowUp = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", root.id, RELAYS[0], "root"],           // always the root
        ["e", carolReply.id, RELAYS[0], "reply"],     // replying to Carol
        ["p", carolPk],
        ["p", bobPk],
      ],
      content:
        "Exactly! And with outbox model implementations, clients can automatically discover the right relays for each user.",
    },
    aliceSk
  );
  await Promise.allSettled(pool.publish(RELAYS, aliceFollowUp));
  console.log(
    "\n[Reply] Alice (to Carol):",
    aliceFollowUp.content.slice(0, 60) + "..."
  );
  console.log("        Event ID:", aliceFollowUp.id);
  printETagMarkers(aliceFollowUp);

  console.log();
  return { root, replies: [bobReply, carolReply, aliceFollowUp] };
}

// ---------------------------------------------------------------------------
// Helper: print e-tag markers for debugging
// ---------------------------------------------------------------------------

function printETagMarkers(event: Event): void {
  const eTags = event.tags.filter((t) => t[0] === "e");
  for (const tag of eTags) {
    const marker = tag[3] || "(no marker)";
    console.log(`        e-tag: ${tag[1].slice(0, 16)}... [${marker}]`);
  }
}

// ---------------------------------------------------------------------------
// 4. Fetch and reconstruct a thread from the network
// ---------------------------------------------------------------------------

async function fetchThread(rootEventId: string): Promise<void> {
  console.log("=== Fetch Thread ===");
  console.log("Root event:", rootEventId, "\n");

  const pool = new SimplePool();

  try {
    // Step 1: Fetch the root event
    const rootEvents = await pool.querySync(RELAYS, {
      ids: [rootEventId],
    });

    if (rootEvents.length === 0) {
      console.log("Root event not found.");
      return;
    }

    const root = rootEvents[0];
    console.log("Root note found:");
    console.log(`  Author: ${root.pubkey.slice(0, 16)}...`);
    console.log(`  Content: ${root.content.slice(0, 80)}...`);
    console.log(
      `  Time: ${new Date(root.created_at * 1000).toISOString()}\n`
    );

    // Step 2: Fetch all replies that reference this root event via e-tag
    const replies = await pool.querySync(RELAYS, {
      kinds: [1],
      "#e": [rootEventId],
    });

    console.log(`Found ${replies.length} reply event(s)\n`);

    // Step 3: Build the thread tree
    // Parse e-tag markers to determine parent-child relationships
    interface ThreadNode {
      event: Event;
      children: ThreadNode[];
      parentId: string | null;
    }

    const nodeMap = new Map<string, ThreadNode>();

    // Add root
    nodeMap.set(root.id, { event: root, children: [], parentId: null });

    // Add replies
    for (const reply of replies) {
      const eTags = reply.tags.filter((t) => t[0] === "e");

      // Find the "reply" marker to determine the direct parent
      // If no markers, use positional convention (last e-tag = reply-to)
      let parentId: string | null = null;

      const replyTag = eTags.find((t) => t[3] === "reply");
      const rootTag = eTags.find((t) => t[3] === "root");

      if (replyTag) {
        // Marker-based: "reply" marker points to direct parent
        parentId = replyTag[1];
      } else if (rootTag && eTags.length === 1) {
        // Only a root marker, no reply marker — direct reply to root
        parentId = rootTag[1];
      } else if (eTags.length > 0) {
        // Positional fallback (deprecated): last e-tag = reply-to
        parentId = eTags[eTags.length - 1][1];
      }

      nodeMap.set(reply.id, { event: reply, children: [], parentId });
    }

    // Link children to parents
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      }
    }

    // Sort children by created_at
    for (const node of nodeMap.values()) {
      node.children.sort(
        (a, b) => a.event.created_at - b.event.created_at
      );
    }

    // Step 4: Render the thread tree
    console.log("--- Thread View ---\n");
    const rootNode = nodeMap.get(root.id);
    if (rootNode) {
      renderThread(rootNode, 0);
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
}

function renderThread(
  node: { event: Event; children: { event: Event; children: any[] }[] },
  depth: number
): void {
  const indent = "  ".repeat(depth);
  const time = new Date(node.event.created_at * 1000).toLocaleTimeString();
  const author = node.event.pubkey.slice(0, 12) + "...";
  const content =
    node.event.content.length > 70
      ? node.event.content.slice(0, 70) + "..."
      : node.event.content;

  console.log(`${indent}[${time}] ${author}`);
  console.log(`${indent}${content}`);
  console.log();

  for (const child of node.children) {
    renderThread(child, depth + 1);
  }
}

// ---------------------------------------------------------------------------
// Bonus: fetch a real thread from the network
// ---------------------------------------------------------------------------

async function fetchRealThread(): Promise<void> {
  console.log("=== Fetch a Thread from the Network ===\n");

  const pool = new SimplePool();

  try {
    // Find a recent note that has replies (look for notes referenced by others)
    const recentReplies = await pool.querySync(RELAYS, {
      kinds: [1],
      limit: 20,
    });

    // Find one that is a reply (has e-tags with "root" marker)
    for (const reply of recentReplies) {
      const rootTag = reply.tags.find(
        (t) => t[0] === "e" && t[3] === "root"
      );

      if (rootTag) {
        const rootId = rootTag[1];
        console.log("Found a reply referencing root:", rootId.slice(0, 16) + "...");

        // Fetch the root
        const rootEvents = await pool.querySync(RELAYS, { ids: [rootId] });
        if (rootEvents.length > 0) {
          const root = rootEvents[0];
          console.log("Root content:", root.content.slice(0, 80) + "...");

          // Fetch all replies to this root
          const allReplies = await pool.querySync(RELAYS, {
            kinds: [1],
            "#e": [rootId],
            limit: 20,
          });

          console.log(`Thread has ${allReplies.length} reply event(s)\n`);

          // Show first few replies
          for (const r of allReplies.slice(0, 5)) {
            console.log(
              `  ${r.pubkey.slice(0, 12)}...: ${r.content.slice(0, 60)}...`
            );
          }
        }

        break; // Only show one thread
      }
    }
  } finally {
    pool.close(RELAYS);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("NOSTR Threads and Replies (NIP-10) Example\n");
  console.log("===========================================\n");

  const pool = new SimplePool();

  try {
    // Build a sample thread
    const { root } = await buildThread(pool);

    // Fetch and render it
    await fetchThread(root.id);
  } finally {
    pool.close(RELAYS);
  }

  // Try fetching a real thread from the network
  await fetchRealThread();

  console.log("Done.");
}

main().catch(console.error);
