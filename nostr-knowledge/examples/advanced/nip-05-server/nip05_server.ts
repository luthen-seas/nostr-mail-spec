/**
 * nip05_server.ts — A NIP-05 identity verification server.
 *
 * NIP-05 lets users claim internet identifiers like user@domain.com
 * by hosting a JSON file at:
 *   https://domain.com/.well-known/nostr.json?name=user
 *
 * This server:
 *   1. Serves /.well-known/nostr.json with proper CORS headers.
 *   2. Looks up user->pubkey mappings from an in-memory database.
 *   3. Optionally returns relay recommendations per user.
 *   4. Supports the ?name= query parameter for individual lookups.
 *
 * Dependencies:
 *   npm install nostr-tools
 *   npm install -D typescript ts-node @types/node
 *
 * Run:
 *   npx ts-node nip05_server.ts
 */

import * as http from "http";
import * as url from "url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.NIP05_PORT || "3000", 10);

/**
 * The domain this server is authoritative for.
 * In production this must match the domain in the user's NIP-05 identifier.
 */
const DOMAIN = process.env.NIP05_DOMAIN || "example.com";

// ---------------------------------------------------------------------------
// User database
// ---------------------------------------------------------------------------

/**
 * In production you would read from a database or config file.
 * Each entry maps a local-part (the part before @) to:
 *   - pubkey: the user's 64-char hex public key
 *   - relays: optional list of relay URLs where this user publishes
 */
interface UserRecord {
  pubkey: string;
  relays?: string[];
}

const users: Map<string, UserRecord> = new Map([
  [
    "alice",
    {
      pubkey:
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      relays: [
        "wss://relay.damus.io",
        "wss://relay.snort.social",
      ],
    },
  ],
  [
    "bob",
    {
      pubkey:
        "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      relays: ["wss://nos.lol"],
    },
  ],
  [
    "_",
    {
      // The special name "_" is the root identifier (just @domain.com)
      pubkey:
        "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
      relays: ["wss://relay.damus.io"],
    },
  ],
]);

// ---------------------------------------------------------------------------
// NIP-05 response builder
// ---------------------------------------------------------------------------

/**
 * Build the NIP-05 JSON response.
 *
 * If a `name` query parameter is provided, only that user is included.
 * Otherwise all users are returned (some servers restrict this).
 *
 * Response format (per NIP-05):
 * {
 *   "names": {
 *     "alice": "<hex-pubkey>",
 *     "bob": "<hex-pubkey>"
 *   },
 *   "relays": {
 *     "<hex-pubkey>": ["wss://relay1", "wss://relay2"]
 *   }
 * }
 */
function buildNostrJson(name?: string): object | null {
  const names: Record<string, string> = {};
  const relays: Record<string, string[]> = {};

  if (name) {
    // Single-user lookup
    const user = users.get(name.toLowerCase());
    if (!user) {
      return null; // User not found
    }
    names[name.toLowerCase()] = user.pubkey;
    if (user.relays && user.relays.length > 0) {
      relays[user.pubkey] = user.relays;
    }
  } else {
    // Return all users
    for (const [username, record] of users.entries()) {
      names[username] = record.pubkey;
      if (record.relays && record.relays.length > 0) {
        relays[record.pubkey] = record.relays;
      }
    }
  }

  return { names, relays };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  // Parse the request URL
  const parsedUrl = url.parse(req.url || "", true);
  const pathname = parsedUrl.pathname || "";

  console.log(`[nip05] ${req.method} ${req.url}`);

  // ------ CORS headers ------
  // NIP-05 requires that the server returns CORS headers so that
  // browser-based NOSTR clients can fetch the JSON.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ------ Route: /.well-known/nostr.json ------
  if (pathname === "/.well-known/nostr.json" && req.method === "GET") {
    const nameParam = parsedUrl.query.name as string | undefined;

    const body = buildNostrJson(nameParam);

    if (body === null) {
      // User requested a specific name that does not exist
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "user not found" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      // Cache for 1 hour — adjust based on how often mappings change
      "Cache-Control": "max-age=3600",
    });
    res.end(JSON.stringify(body, null, 2));
    return;
  }

  // ------ Route: health check ------
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  // ------ 404 for everything else ------
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`[nip05] NIP-05 server running at http://localhost:${PORT}`);
  console.log(`[nip05] Domain: ${DOMAIN}`);
  console.log(
    `[nip05] Try: http://localhost:${PORT}/.well-known/nostr.json?name=alice`
  );
});

// ---------------------------------------------------------------------------
// Admin: add/remove users at runtime (for demonstration)
// ---------------------------------------------------------------------------

/**
 * In a real server you would expose an authenticated admin API
 * or read from a database. These functions show the operations involved.
 */
export function addUser(
  name: string,
  pubkey: string,
  relayList?: string[]
): void {
  users.set(name.toLowerCase(), { pubkey, relays: relayList });
  console.log(`[nip05] Added user: ${name} -> ${pubkey.slice(0, 8)}...`);
}

export function removeUser(name: string): boolean {
  const deleted = users.delete(name.toLowerCase());
  if (deleted) {
    console.log(`[nip05] Removed user: ${name}`);
  }
  return deleted;
}
