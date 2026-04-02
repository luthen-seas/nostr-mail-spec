# Distributed Systems Fundamentals for NOSTR

## Consistency Models

### Strong Consistency
All reads reflect the most recent write. Requires coordination (consensus protocol) between replicas. **Not achievable in NOSTR's model** — relays are independent and do not coordinate. A client reading from relay A has no guarantee that relay A has received the latest event published to relay B.

### Eventual Consistency
Given no new updates, all replicas eventually converge to the same state. **This is NOSTR's relay model.** If an event is published to relay A, and relay A syncs with (or the client also publishes to) relay B, both relays eventually hold the same event. Convergence time depends on client behavior and network conditions — there is no protocol-level replication between relays.

### Causal Consistency
Causally related events are seen in order. In NOSTR, causal relationships are expressed via tags:
- `["e", <event-id>]` — references a prior event (reply, reaction, quote)
- `["a", <kind:pubkey:d-tag>]` — references an addressable event

NOSTR does not enforce causal ordering at the relay level. A client may receive a reply before the original note. Clients must handle out-of-order delivery by buffering or fetching missing ancestors.

### Last-Write-Wins (LWW)
Conflict resolution by timestamp. **NOSTR's mechanism for replaceable events** (kinds 0, 3, 10000-19999). When multiple versions of a replaceable event exist, the one with the highest `created_at` timestamp wins. Relays discard older versions.

For addressable events (kinds 30000-39999), the same LWW rule applies, scoped by the `d` tag value.

### Read-Your-Own-Writes
A client sees its own updates immediately. Achieved in NOSTR via **local cache**: the client applies its own event to local state before (or simultaneously with) publishing to relays. This means the UI reflects the change instantly, even if no relay has confirmed the event yet.

---

## CAP Theorem and NOSTR

The CAP theorem states that a distributed system can provide at most two of three guarantees: Consistency, Availability, Partition tolerance.

**NOSTR chooses AP (Availability + Partition tolerance) over Consistency.**

| Property | NOSTR Behavior |
|----------|---------------|
| **Availability** | Any relay can accept writes independently. No relay depends on another relay being reachable. |
| **Partition tolerance** | Relays operate in isolation. A network partition between relays has no protocol-level impact — each relay continues serving its own stored events. |
| **Consistency** | Sacrificed. Different relays may have different subsets of events. A client reading from one relay may miss events published to another. |

Key implications:
- Relays are independent — no consensus protocol between them (no Raft, no Paxos, no gossip protocol at the relay layer).
- Publishing the same event to multiple relays provides **redundancy**, not consensus. The relays do not agree on state; they independently store what they receive.
- **Deduplication by event ID** (SHA-256 hash of serialized event data) is the consistency mechanism. Two relays storing the same event will produce identical IDs, allowing clients to merge results.
- **Trade-off**: stale reads are possible. A client connected to relay A may not see an event that was published to relay B ten seconds ago, because no mechanism pushes it from B to A.

---

## Delivery Guarantees

### At-Most-Once
The event is delivered zero or one time. Possible if the client does not retry failed publications — if the relay does not acknowledge, the event may be lost.

### At-Least-Once
The event is delivered one or more times. Achievable if the client retries publication until the relay confirms with `["OK", <event-id>, true, ""]`. The client must track which relays have acknowledged and retry those that have not.

### Exactly-Once
The event is processed exactly one time. Achievable at the **application layer** via event ID deduplication. Even if a client receives the same event from multiple relays (or the same relay on reconnection), it processes it only once by tracking seen event IDs.

### NOSTR's Composite Model
```
Client publishes event
  → Relay receives and sends ["OK", id, true]
  → At-least-once delivery per relay (with client retry)
  → Client deduplicates by event ID
  → Exactly-once processing semantics at the application layer
```

This is a standard pattern in distributed systems: at-least-once delivery + idempotent processing = exactly-once semantics.

---

## Conflict Resolution for Mailbox State

### The Problem
NOSTR Mail uses kind 10099 replaceable events for mailbox state (read/unread, flagged, folder assignments). Multiple devices may update this state concurrently.

### Last-Write-Wins via `created_at`
The default NOSTR mechanism: the replaceable event with the highest `created_at` timestamp is the canonical version. Relays enforce this — they discard events with older timestamps for the same kind+pubkey combination.

**Race condition**: Device A marks message as read at T=100. Device B marks a different message as flagged at T=101. Device B's event replaces Device A's, and the "read" state from Device A is lost.

### Clock Skew
Devices with incorrect clocks can overwrite newer state with older data. If Device A's clock is 5 minutes ahead, its events will appear "newer" even when they were created earlier in real time.

**Mitigations**:
- **NTP synchronization**: ensure all devices use accurate clocks (standard practice, but not guaranteed)
- **Logical timestamps (Lamport clocks)**: increment a counter with each state change; use counter as tiebreaker
- **Hybrid logical clocks (HLC)**: combine wall-clock time with logical counter for better ordering
- **Read-before-write**: fetch current state, merge changes, publish — reduces (but does not eliminate) conflicts

### CRDTs (Conflict-free Replicated Data Types)
An alternative to LWW that guarantees convergence without coordination.

**G-Set (grow-only set)** for read receipts:
- Once a message is marked read, it stays read.
- The "read set" can only grow — no operation removes from it.
- Two devices independently marking different messages as read produces a union of both sets.
- Convergence is automatic: the union of all received G-Sets is the current state.

**OR-Set (observed-remove set)** for folder assignments:
- Supports both add and remove operations.
- Each add is tagged with a unique identifier; remove only removes observed tags.
- Concurrent add and remove of the same element results in the element being present (add wins).
- More complex to implement but handles folder moves cleanly.

**Trade-offs**:
| Approach | Complexity | Convergence | Data Loss Risk |
|----------|-----------|-------------|----------------|
| LWW (replaceable event) | Low | Eventual | Concurrent updates lost |
| G-Set (grow-only) | Low | Automatic | None (for grow-only properties) |
| OR-Set | Medium | Automatic | None |
| Full CRDT framework | High | Automatic | None |

**Recommendation**: LWW is sufficient for V1. G-Set semantics for read receipts (a natural fit). Consider OR-Set for folder management if concurrent folder moves become a real problem.

---

## Failure Modes

### Relay Crash
- Events in flight (published but not acknowledged) may be lost.
- Client detects via WebSocket close or timeout on `["OK"]` response.
- **Recovery**: retry publication to other relays. If client published to N relays and at least one survived, the event is not lost.

### Network Partition
- Client disconnected from some or all relays.
- Events composed offline accumulate in a local queue.
- **Recovery**: on reconnection, publish queued events and resync state.

### Relay Data Loss
- Relay loses its storage (disk failure, database corruption).
- All events on that relay are gone.
- **Recovery**: events should exist on other relays (if client published to multiple). There is no automatic relay-to-relay recovery — the client is the replication agent.
- **Implication**: publishing to only one relay is risky. The minimum recommendation is 2-3 relays.

### Split Brain
- Two devices are offline simultaneously and make conflicting state changes.
- Both publish state events on reconnection.
- LWW resolves by timestamp — one device's changes win, the other's are lost.
- **Mitigation**: merge-before-publish (read current state, apply local changes, publish merged result).

### Clock Skew
- Devices disagree on current time.
- LWW may produce unexpected results: a device 5 minutes behind may have its state event appear older than it actually is, while a device 5 minutes ahead "wins" unfairly.
- **Mitigation**: NTP, hybrid logical clocks, or tolerance windows.

### Subscription Loss
- WebSocket drops silently (no close frame).
- Client does not receive events during the gap.
- **Recovery**: detect via ping/pong timeout, resubscribe with `"since"` set to the timestamp of the last received event (or last EOSE).

---

## Sync Patterns

### Full Sync
Fetch all events matching a filter (no `since` or `until` constraints). Expensive — suitable only for first launch or account recovery. For a mailbox, this means fetching all kind 1059 events tagged with the user's pubkey.

### Delta Sync
Fetch events since the last sync point: `{"since": <last_sync_timestamp>}`. Efficient for regular use — only new events are transferred. The sync point should be stored per relay, since different relays may have different latencies.

### Catch-up Sync
On reconnection after a disconnect, request events since the last EOSE timestamp for that relay. This is a specialized delta sync that accounts for the gap created by the disconnection.

```
Disconnect at T=100
Reconnect at T=200
Request: {"since": 100} → relay sends events from T=100 to T=200
Relay sends EOSE → client updates sync point to T=200
```

### State Snapshot + Delta
For mailbox state (kind 10099), the pattern is:
1. On launch: fetch the latest replaceable event (the full state snapshot).
2. Subscribe for updates: any new kind 10099 event replaces the previous one.
3. The replaceable event itself IS the snapshot — no separate snapshot mechanism needed.

This is a natural fit for NOSTR's replaceable event model: the latest event is always the full state.

### Sync Point Management
- Store one sync point per relay (not a global sync point).
- Use the timestamp from the relay's EOSE marker, not the client's local clock.
- On relay change (user adds/removes relays via NIP-65): full sync from new relays, stop syncing from removed relays.
