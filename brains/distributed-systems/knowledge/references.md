# Distributed Systems References for NOSTR Mail

## Foundational Texts

### "Designing Data-Intensive Applications" — Martin Kleppmann (2017)
The most relevant single reference for NOSTR's distributed model. Key chapters:
- **Chapter 5: Replication** — leaderless replication (NOSTR's relay model is leaderless), quorum writes/reads, last-write-wins, conflict resolution. NOSTR's multi-relay publication is analogous to leaderless replication with client-driven writes.
- **Chapter 7: Transactions** — isolation levels, the absence of transactions in NOSTR (no atomicity across relays or across multiple event kinds).
- **Chapter 9: Consistency and Consensus** — linearizability, causal consistency, the impossibility results that explain why NOSTR cannot provide strong consistency without coordination.
- **Chapter 11: Stream Processing** — event sourcing, CQRS. NOSTR's event model is a natural event-sourced system where the event log is the source of truth.
- **Chapter 12: The Future of Data Systems** — unbundled databases, derived data. NOSTR relays as unbundled storage with client-side derivation of state.

### "Time, Clocks, and the Ordering of Events in a Distributed System" — Leslie Lamport (1978)
The foundational paper on distributed time. Directly relevant to NOSTR's `created_at` timestamp-based ordering:
- Physical clocks are unreliable — clock skew is inevitable.
- Logical clocks (Lamport timestamps) provide causal ordering without wall-clock time.
- Happened-before relation: if event A causally precedes event B, then A's timestamp must be less than B's.
- NOSTR uses physical timestamps (`created_at` is Unix epoch seconds), making it vulnerable to clock skew. Hybrid logical clocks (HLC) would be an improvement for mailbox state ordering.

### "A comprehensive study of Convergent and Commutative Replicated Data Types" — Shapiro et al. (2011)
The definitive CRDT survey. Relevant structures for NOSTR Mail:
- **G-Counter**: monotonically increasing counter. Could track unread count across devices.
- **G-Set**: grow-only set. Perfect for read receipts — once read, always read.
- **OR-Set (Observed-Remove Set)**: supports add and remove. Suitable for folder membership where messages can be moved in and out.
- **LWW-Register**: last-write-wins register. What NOSTR's replaceable events already implement.
- **LWW-Element-Set**: set where each element has a timestamp; add/remove resolved by timestamp. Could model mailbox state where each message's state is independently timestamped.

---

## NOSTR Protocol Specifications

### NIP-01: Basic Protocol Flow
The delivery mechanism itself. Key aspects for distributed systems analysis:
- WebSocket-based client-relay communication.
- `["EVENT", <event>]` for publication; `["OK", <id>, <bool>, <message>]` for acknowledgment.
- `["REQ", <sub-id>, <filter>]` for subscription; `["EOSE", <sub-id>]` for end of stored events.
- No relay-to-relay protocol — clients are the replication agents.
- Event ID is SHA-256 of canonical serialization — content-addressed, deduplication is inherent.

### NIP-59: Gift Wrapping
The encryption and metadata-hiding layer for NOSTR Mail (kind 1059 events):
- Outer layer hides sender identity from relays.
- Inner layer (kind 14 via NIP-17) contains the actual message.
- Random padding in timestamps prevents timing analysis.
- Implication: relays cannot index by sender, only by recipient `p` tag.

### NIP-65: Relay List Metadata (Outbox Model)
Relay discovery and routing:
- Kind 10002 events declare a user's read and write relays.
- Kind 10050 events declare inbox relays (for DMs/mail).
- Clients must fetch the recipient's relay list to know where to publish.
- If the recipient changes their relay list, messages sent to old relays may not be received.
- Stale relay lists are a delivery failure mode.

### NIP-17: Private Direct Messages
The DM protocol built on gift wrapping:
- Kind 14 inner events for direct messages.
- Defines the conversation model and threading via `e` and `p` tags.
- Self-addressed copies for sent message tracking.

### NIP-44: Encrypted Payloads
The encryption standard used inside gift wraps:
- XChaCha20-Poly1305 with HKDF-derived shared secret.
- Padding to prevent content-length analysis.
- Versioned — allows future algorithm upgrades.

---

## Distributed Systems Testing and Verification

### Jepsen Testing Methodology — Kyle Kingsbury
Framework for testing distributed systems under failure conditions. Applicable to NOSTR Mail:
- **Nemesis**: inject relay crashes, network partitions, clock skew.
- **Workload**: publish messages, read mailbox state, update state concurrently.
- **Checker**: verify safety properties (no lost messages given sufficient relay redundancy, no state regression, deduplication correctness).
- Not directly applicable to NOSTR (Jepsen targets databases with consensus), but the methodology of adversarial testing under partition is directly relevant.

### TLA+ and Formal Specification — Leslie Lamport
Model-checking for distributed protocols:
- Define the state machine (relay stores, client state, network).
- Specify safety and liveness properties.
- Model-check all possible interleavings of concurrent actions.
- Particularly useful for verifying mailbox state convergence under concurrent updates.

---

## Architecture Patterns

### Event Sourcing and CQRS
NOSTR is inherently event-sourced:
- **Event log**: the sequence of signed events is the source of truth.
- **Derived state**: client-side views (inbox, sent, folders) are derived from the event log.
- **CQRS**: writes go to relays (command side); reads derive from local cache (query side).
- Rebuilding state from events: a client can reconstruct its entire mailbox by replaying all kind 1059 events tagged to its pubkey and applying all kind 10099 state events.

### Outbox Pattern (NOSTR-specific)
A variant of the publish-subscribe pattern where the subscriber discovers the publisher's preferred relay:
1. Alice wants to send to Bob.
2. Alice fetches Bob's kind 10050 (inbox relay list).
3. Alice publishes to Bob's declared inbox relays.
4. Bob subscribes to his own inbox relays.
5. The relay acts as a message broker, not a peer.

This is analogous to **mailbox-based actor model** (Erlang/Akka): each actor has a mailbox address, senders deliver to the mailbox, the actor processes messages from its mailbox.

### WebSocket Reliability Patterns
Relevant for maintaining persistent relay connections:
- **Heartbeat/ping-pong**: detect dead connections (WebSocket protocol-level pings).
- **Exponential backoff with jitter**: for reconnection attempts.
- **Connection multiplexing**: one WebSocket per relay, multiple subscriptions per connection.
- **Graceful degradation**: if a relay is unreachable, continue operating with remaining relays.

---

## Additional References

### Papers
- "Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services" — Gilbert & Lynch (2002). Formal proof of the CAP theorem.
- "Harvest, Yield, and Scalable Tolerant Systems" — Fox & Brewer (1999). Practical trade-offs beyond binary CAP choices.
- "Building on Quicksand" — Helland & Campbell (2009). Designing systems that embrace uncertainty — relevant to NOSTR's eventual consistency model.
- "Life Beyond Distributed Transactions" — Pat Helland (2007). How to build correct applications without distributed transactions — directly applicable to NOSTR's per-relay-independent model.

### Tools
- **nak** (Nostr Army Knife): CLI tool for publishing, subscribing, and debugging NOSTR events. Essential for testing delivery patterns.
- **strfry**: High-performance relay implementation (C++/LMDB) — useful as reference for understanding relay storage and query behavior.
- **khatru**: Go relay framework — useful for building test relays with controllable failure injection.

### Standards
- RFC 6455: The WebSocket Protocol — the transport layer for NOSTR.
- RFC 7693: BLAKE2 (referenced in some NIP discussions, though NOSTR uses SHA-256).
- RFC 8439: ChaCha20-Poly1305 — the cipher used in NIP-44.
