/**
 * dvm.ts — Data Vending Machine (NIP-90) provider and customer.
 *
 * NIP-90 defines a marketplace where clients can request data-processing
 * jobs and providers (DVMs) can fulfill them. This example implements:
 *
 *   PROVIDER SIDE:
 *   1. Subscribe to job requests (kind 5xxx).
 *   2. Send processing feedback (kind 7000).
 *   3. Process the job.
 *   4. Publish the result (kind 6xxx).
 *
 *   CUSTOMER SIDE:
 *   1. Create and publish a job request (kind 5xxx).
 *   2. Subscribe to feedback and results.
 *   3. Handle the result when it arrives.
 *
 * This example uses kind 5100 (text-to-text translation) as a demonstration.
 * The "translation" is a simple uppercase transform for illustration.
 *
 * Dependencies:
 *   npm install nostr-tools ws
 *   npm install -D typescript ts-node @types/node @types/ws
 *
 * Run (provider mode):
 *   DVM_MODE=provider npx ts-node dvm.ts
 *
 * Run (customer mode):
 *   DVM_MODE=customer DVM_INPUT="Hello, please translate this" npx ts-node dvm.ts
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate,
  type Event as NostrEvent,
  type Filter,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { Relay } from "nostr-tools/relay";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAY_URL = process.env.DVM_RELAY || "wss://relay.damus.io";
const MODE = process.env.DVM_MODE || "provider"; // "provider" or "customer"

/**
 * NIP-90 job kind for text translation.
 * Request kind: 5100, Result kind: 6100
 * See: https://github.com/nostr-protocol/nips/blob/master/90.md
 */
const JOB_REQUEST_KIND = 5100;
const JOB_RESULT_KIND = 6100;
const JOB_FEEDBACK_KIND = 7000;

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

function loadKeys(envVar: string): { secretKey: Uint8Array; pubkey: string } {
  const hex = process.env[envVar];
  if (hex) {
    const sk = hexToBytes(hex);
    return { secretKey: sk, pubkey: getPublicKey(sk) };
  }
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  console.log(`[dvm] Generated keypair (${envVar} not set)`);
  console.log(`[dvm]   pubkey: ${pk}`);
  console.log(`[dvm]   secret: ${bytesToHex(sk)}`);
  return { secretKey: sk, pubkey: pk };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * The DVM provider listens for job requests, processes them, and publishes
 * results. The lifecycle of a job from the provider's perspective:
 *
 * 1. Receive a kind 5100 event (job request) with input in the tags.
 * 2. Optionally publish kind 7000 feedback: { status: "processing" }.
 * 3. Perform the work (translation in this case).
 * 4. Publish kind 6100 result with the output.
 */
async function runProvider(): Promise<void> {
  const { secretKey, pubkey } = loadKeys("DVM_PROVIDER_KEY");
  console.log(`[provider] DVM pubkey: ${pubkey}`);

  const relay = await Relay.connect(RELAY_URL);
  console.log(`[provider] Connected to ${RELAY_URL}`);

  // Subscribe to job requests (kind 5100)
  // We also listen for requests that tag us specifically via p-tag,
  // but we also accept un-tagged requests (open market).
  const filter: Filter = {
    kinds: [JOB_REQUEST_KIND],
    since: Math.floor(Date.now() / 1000),
  };

  const processedJobs = new Set<string>();

  relay.subscribe([filter], {
    async onevent(event: NostrEvent) {
      // Deduplicate
      if (processedJobs.has(event.id)) return;
      processedJobs.add(event.id);

      console.log(
        `[provider] Received job request ${event.id.slice(0, 8)}... from ${event.pubkey.slice(0, 8)}...`
      );

      // ------ Step 1: Parse the job request ------
      // NIP-90 input is in "i" tags: ["i", "<data>", "<type>"]
      // Type can be "text", "url", "event", "job" (chained)
      const inputTags = event.tags.filter((t) => t[0] === "i");
      if (inputTags.length === 0) {
        console.log("[provider] Job has no input tags — skipping");
        return;
      }

      const inputText = inputTags[0][1]; // First input's data
      const inputType = inputTags[0][2] || "text";
      console.log(`[provider] Input (${inputType}): "${inputText.slice(0, 100)}"`);

      // ------ Step 2: Publish feedback (status: processing) ------
      const feedback = finalizeEvent(
        {
          kind: JOB_FEEDBACK_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["e", event.id],           // Reference the job request
            ["p", event.pubkey],       // Tag the customer
            ["status", "processing"],  // NIP-90 status
          ],
          content: "",
        } satisfies EventTemplate,
        secretKey
      );

      await relay.publish(feedback);
      console.log("[provider] Published feedback: processing");

      // ------ Step 3: Process the job ------
      // In a real DVM this would call an AI model, search engine, etc.
      // Here we just uppercase the text as a trivial "translation".
      const result = await processTranslation(inputText);

      // ------ Step 4: Publish the result (kind 6100) ------
      const resultEvent = finalizeEvent(
        {
          kind: JOB_RESULT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["e", event.id],            // Reference the job request
            ["p", event.pubkey],        // Tag the customer
            ["request", JSON.stringify(event)], // Include original request
            // Output amount / payment info could go here
          ],
          content: result, // The job result goes in content
        } satisfies EventTemplate,
        secretKey
      );

      await relay.publish(resultEvent);
      console.log(`[provider] Published result: "${result.slice(0, 80)}"`);

      // ------ Optional: Publish completion feedback ------
      const doneFeedback = finalizeEvent(
        {
          kind: JOB_FEEDBACK_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["e", event.id],
            ["p", event.pubkey],
            ["status", "success"],
          ],
          content: "",
        } satisfies EventTemplate,
        secretKey
      );

      await relay.publish(doneFeedback);
      console.log("[provider] Published feedback: success");
    },
    oneose() {
      console.log("[provider] Listening for job requests...");
    },
  });
}

/**
 * Simulate job processing. A real DVM would call an API or run a model.
 * This example just uppercases the input text after a short delay.
 */
async function processTranslation(input: string): Promise<string> {
  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return input.toUpperCase();
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

/**
 * The DVM customer creates a job request, publishes it, and waits for the
 * result. The lifecycle:
 *
 * 1. Build a kind 5100 event with input in "i" tags.
 * 2. Publish to relay.
 * 3. Subscribe to kind 6100 (results) and kind 7000 (feedback) that
 *    reference our job request.
 * 4. Process feedback and result as they arrive.
 */
async function runCustomer(): Promise<void> {
  const { secretKey, pubkey } = loadKeys("DVM_CUSTOMER_KEY");
  console.log(`[customer] Customer pubkey: ${pubkey}`);

  const inputText =
    process.env.DVM_INPUT || "Hello world, this is a test job for the DVM.";

  const relay = await Relay.connect(RELAY_URL);
  console.log(`[customer] Connected to ${RELAY_URL}`);

  // ------ Step 1: Build the job request ------
  const jobRequest = finalizeEvent(
    {
      kind: JOB_REQUEST_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        // Input data with type "text"
        ["i", inputText, "text"],
        // Optional: specify output format
        ["output", "text/plain"],
        // Optional: bid (max sats willing to pay)
        // ["bid", "1000"],
        // Optional: target a specific DVM by pubkey
        // ["p", "<dvm-pubkey>"],
      ],
      content: "",
    } satisfies EventTemplate,
    secretKey
  );

  console.log(`[customer] Job request ID: ${jobRequest.id}`);
  console.log(`[customer] Input: "${inputText}"`);

  // ------ Step 2: Subscribe to results and feedback BEFORE publishing ------
  // This way we do not miss events that arrive quickly.
  let resultReceived = false;

  // Filter for results (kind 6100) that reference our job
  const resultFilter: Filter = {
    kinds: [JOB_RESULT_KIND],
    "#e": [jobRequest.id],
    since: Math.floor(Date.now() / 1000) - 10,
  };

  // Filter for feedback (kind 7000) that references our job
  const feedbackFilter: Filter = {
    kinds: [JOB_FEEDBACK_KIND],
    "#e": [jobRequest.id],
    since: Math.floor(Date.now() / 1000) - 10,
  };

  relay.subscribe([resultFilter, feedbackFilter], {
    onevent(event: NostrEvent) {
      if (event.kind === JOB_FEEDBACK_KIND) {
        // ------ Handle feedback ------
        const statusTag = event.tags.find((t) => t[0] === "status");
        const status = statusTag ? statusTag[1] : "unknown";
        console.log(
          `[customer] Feedback from ${event.pubkey.slice(0, 8)}...: status=${status}`
        );
      } else if (event.kind === JOB_RESULT_KIND) {
        // ------ Handle result ------
        console.log(
          `[customer] Result from ${event.pubkey.slice(0, 8)}...:`
        );
        console.log(`[customer]   "${event.content}"`);
        resultReceived = true;
      }
    },
    oneose() {
      console.log("[customer] Subscribed — waiting for DVM responses...");
    },
  });

  // ------ Step 3: Publish the job request ------
  await relay.publish(jobRequest);
  console.log("[customer] Job request published");

  // ------ Step 4: Wait for result (with timeout) ------
  const TIMEOUT_MS = 60_000;
  const start = Date.now();

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (resultReceived || Date.now() - start > TIMEOUT_MS) {
        clearInterval(check);
        if (!resultReceived) {
          console.log("[customer] Timed out waiting for result");
        }
        resolve();
      }
    }, 500);
  });

  relay.close();
  console.log("[customer] Done");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[dvm] Mode: ${MODE}`);
  console.log(`[dvm] Relay: ${RELAY_URL}`);

  if (MODE === "provider") {
    await runProvider();
  } else if (MODE === "customer") {
    await runCustomer();
  } else {
    console.error(`[dvm] Unknown mode: ${MODE}. Use "provider" or "customer".`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[dvm] Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[dvm] Shutting down...");
  process.exit(0);
});
