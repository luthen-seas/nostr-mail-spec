# Phase 2: NOSTR Mail Delivery Model — TLA+ State Machine Analysis

## Overview

This document provides a rigorous specification of the NOSTR Mail delivery model in structured prose, suitable for direct translation to TLA+. It defines the system model, state machine, properties to verify, failure analysis, invariants, and recommendations.

The delivery model covers: sender publishes kind 1059 (gift-wrapped) events to recipient's inbox relays; recipient subscribes and receives events; mailbox state is synchronized via kind 10099 replaceable events across multiple devices.

---

## A. System Model

### Actors

**Sender**: A NOSTR client that composes, encrypts (NIP-44), wraps (NIP-59 kind 1059), and publishes messages.
- Has: keypair (pubkey, privkey), set of write relays, local state (outbox queue, sent items).
- Actions: compose, encrypt, wrap, publish, retry.

**Recipient**: One or more devices belonging to the same NOSTR identity.
- Has: keypair (same across devices), set of inbox relays (kind 10050), local state (message store, mailbox state, seen event IDs).
- Actions: subscribe, receive, decrypt, unwrap, process, update mailbox state.
- Multi-device: each device is an independent actor sharing the same keypair.

**Relay**: A WebSocket server that stores and serves events.
- Has: event store (set of events), connection state (set of connected clients and their subscriptions).
- Actions: accept event, reject event, store event, match event to subscriptions, deliver event, crash, recover.
- Non-deterministic: may crash at any point, may lose stored events on crash.

**Network**: The communication medium between clients and relays.
- Properties: asynchronous (no bound on delivery time), unreliable (messages may be lost, delayed, reordered), no Byzantine faults (messages are not corrupted — integrity ensured by event signatures).

### State Variables

```
VARIABLES
    \* Relay state: mapping from relay URL to set of stored events
    relay_stores : [Relay -> SUBSET Event]

    \* Per-device local state
    device_inbox : [Device -> SUBSET Event]          \* received and decrypted messages
    device_seen  : [Device -> SUBSET EventId]        \* event IDs already processed
    device_state : [Device -> MailboxState]           \* local mailbox state (read, flags, folders)
    device_queue : [Device -> Seq(QueueItem)]         \* offline publication queue

    \* Network in-flight messages (unordered bag)
    network      : BAG(NetworkMessage)

    \* Mailbox state on relays (replaceable event, latest wins)
    relay_state  : [Relay -> [Pubkey -> StateEvent]]  \* kind 10099, one per pubkey

    \* Connectivity
    connected    : [Device -> SUBSET Relay]           \* which relays each device can reach
```

### Type Definitions

```
Event == [
    id         : EventId,        \* SHA-256 of canonical serialization
    pubkey     : Pubkey,         \* author's public key (outer wrap uses ephemeral key)
    created_at : Timestamp,      \* Unix epoch seconds
    kind       : Nat,            \* 1059 for gift wrap
    tags       : Seq(Tag),       \* includes ["p", recipient_pubkey]
    content    : String,         \* encrypted payload
    sig        : Signature       \* Schnorr signature
]

MailboxState == [
    read    : SUBSET EventId,    \* set of message IDs marked as read
    flagged : SUBSET EventId,    \* set of message IDs marked as flagged
    folders : [EventId -> Folder] \* folder assignment per message
]

StateEvent == [
    created_at : Timestamp,
    content    : MailboxState     \* encrypted in practice, modeled as plaintext
]

QueueItem == [
    event      : Event,
    targets    : SUBSET Relay,
    status     : {"PENDING", "SENDING", "SENT", "FAILED"},
    retries    : Nat
]

NetworkMessage == [
    type    : {"EVENT", "OK", "REQ", "EOSE", "EVENT_PUSH"},
    from    : Actor,
    to      : Actor,
    payload : Any
]
```

### Non-Determinism Sources
- **Relay crashes**: any relay may crash at any step, losing in-flight data.
- **Message delays**: network messages may take arbitrarily long.
- **Message reordering**: messages between the same client-relay pair may arrive out of order.
- **Device offline periods**: any device may lose connectivity for an arbitrary duration.
- **Clock skew**: different devices may have different values for `now()`.
- **Concurrent actions**: multiple devices may act simultaneously.

---

## B. State Machine

### Message Lifecycle States

```
COMPOSING ──▶ ENCRYPTING ──▶ WRAPPING ──▶ PUBLISHING ──▶ RELAYED ──▶ DELIVERED ──▶ DECRYPTED
                                              │                          │
                                              ▼                          ▼
                                         QUEUED (offline)          DUPLICATE (already seen)
                                              │
                                              ▼
                                         FAILED (all retries exhausted)
```

**States:**

| State | Description |
|-------|------------|
| `COMPOSING` | Plaintext message exists in sender's local state. |
| `ENCRYPTING` | NIP-44 encryption in progress (sender encrypts to recipient's pubkey). |
| `WRAPPING` | NIP-59 gift wrapping in progress (kind 14 wrapped in kind 13 sealed, then kind 1059 gift wrap with ephemeral key). |
| `PUBLISHING` | Event sent to relay(s), awaiting OK response. |
| `QUEUED` | Device is offline; event stored in local queue for later publication. |
| `RELAYED` | At least one relay has stored the event (sent OK confirmation). |
| `DELIVERED` | Event has been transmitted from relay to recipient's client via subscription match. |
| `DECRYPTED` | Recipient has unwrapped and decrypted the message; plaintext is in local inbox. |
| `DUPLICATE` | Event ID already in recipient's seen set; event is discarded. |
| `FAILED` | All publication attempts exhausted; message could not reach any relay. |

### Transitions (Actions)

**Sender-side actions:**

```
Compose(sender, content, recipient):
    PRE:  sender is a valid device
    POST: new QueueItem with status PENDING in sender's queue

Encrypt(sender, queue_item):
    PRE:  queue_item.status = PENDING
    POST: queue_item contains NIP-44 encrypted content

Wrap(sender, queue_item):
    PRE:  queue_item contains encrypted content
    POST: queue_item.event is a valid kind 1059 event with ephemeral pubkey and ["p", recipient] tag

Publish(sender, queue_item, relay):
    PRE:  queue_item.event is a valid kind 1059 event
          relay ∈ connected[sender]
    POST: NetworkMessage{type: EVENT, from: sender, to: relay, payload: queue_item.event}
          added to network bag

QueueOffline(sender, queue_item):
    PRE:  connected[sender] = {} (no relays reachable)
    POST: queue_item.status = QUEUED

RetryFromQueue(sender, queue_item, relay):
    PRE:  queue_item.status = QUEUED
          relay ∈ connected[sender]
    POST: same as Publish
```

**Relay-side actions:**

```
ReceiveEvent(relay, event):
    PRE:  event is a valid signed event
          relay has capacity (not full, event not rejected by policy)
    POST: event ∈ relay_stores[relay]
          NetworkMessage{type: OK, from: relay, to: sender, payload: {id: event.id, success: true}}
          For each subscription S matching event: NetworkMessage{type: EVENT_PUSH, from: relay, to: S.client, payload: event}

RejectEvent(relay, event, reason):
    PRE:  event fails validation or policy check
    POST: NetworkMessage{type: OK, from: relay, to: sender, payload: {id: event.id, success: false, message: reason}}

RelayCrash(relay):
    PRE:  true (can happen at any time)
    POST: relay_stores[relay] = {} or relay_stores[relay] (non-deterministic: may or may not lose data)
          All connections to relay are severed
          All in-flight messages to/from relay are lost

RelayRecover(relay):
    PRE:  relay has crashed
    POST: relay accepts new connections (with whatever data survived the crash)
```

**Recipient-side actions:**

```
Subscribe(device, relay, filter):
    PRE:  relay ∈ connected[device]
    POST: relay registers subscription; begins matching stored and new events

ReceiveStoredEvent(device, relay, event):
    PRE:  event ∈ relay_stores[relay]
          event matches device's subscription filter
    POST: if event.id ∉ device_seen[device]:
              device_inbox[device] = device_inbox[device] ∪ {event}
              device_seen[device] = device_seen[device] ∪ {event.id}
          else:
              discard (DUPLICATE)

ReceiveEOSE(device, relay):
    PRE:  relay has sent all stored events matching subscription
    POST: device updates sync point for this relay
          device transitions to "live mode" for this subscription

ReceiveLiveEvent(device, relay, event):
    PRE:  event was published to relay AFTER EOSE
          event matches device's subscription filter
    POST: same as ReceiveStoredEvent (dedup applies)

Decrypt(device, event):
    PRE:  event ∈ device_inbox[device]
          event has not been decrypted yet
    POST: plaintext message extracted and stored in device's message view
```

**Mailbox state actions:**

```
UpdateState(device, change):
    PRE:  device has a local mailbox state
    POST: device_state[device] = apply(device_state[device], change)
          device publishes new kind 10099 event to its relays

ReceiveStateEvent(device, relay, state_event):
    PRE:  state_event.kind = 10099
          state_event.pubkey = device's pubkey
    POST: if state_event.created_at > device_state[device].created_at:
              device_state[device] = state_event.content
          else:
              discard (older state)
```

**Network actions:**

```
Deliver(message):
    PRE:  message ∈ network
          message.to ∈ connected entities
    POST: message removed from network, delivered to message.to

Drop(message):
    PRE:  message ∈ network
    POST: message removed from network (lost)

Delay(message):
    PRE:  message ∈ network
    POST: message remains in network (will be delivered later, non-deterministically)

Partition(device, relay):
    PRE:  relay ∈ connected[device]
    POST: relay ∉ connected[device]
          In-flight messages between device and relay may be lost

Heal(device, relay):
    PRE:  relay ∉ connected[device]
    POST: relay ∈ connected[device]
```

---

## C. Properties to Verify

### Safety Properties

**S1: Sender Authentication Integrity**
```
THEOREM SenderAuthIntegrity ==
    ∀ device ∈ Devices, event ∈ device_inbox[device]:
        Decrypt(event).sender_pubkey = event.inner_event.pubkey
        ∧ VerifySignature(event.inner_event) = TRUE
```
*A message is never attributed to the wrong sender after decryption.* The inner event (kind 14) carries the true sender's pubkey and signature. Gift wrapping uses an ephemeral key for the outer layer, but the inner signature is from the real sender. Decryption reveals the inner event, and the client MUST verify its signature.

**S2: Recipient Targeting**
```
THEOREM RecipientTargeting ==
    ∀ device ∈ Devices, event ∈ device_inbox[device]:
        device.pubkey ∈ event.tags["p"]
```
*A message is never delivered to the wrong recipient.* The kind 1059 event is encrypted to the recipient's pubkey — only the holder of the corresponding private key can decrypt it. Even if a relay delivers the event to a non-targeted client (subscription filter mismatch), decryption will fail.

**S3: Idempotent Processing**
```
THEOREM IdempotentProcessing ==
    ∀ device ∈ Devices, event ∈ Event:
        LET result1 = Process(device, event)
            result2 = Process(device, event)
        IN result1 = result2
        ∧ |{e ∈ device_inbox[device] : e.id = event.id}| ≤ 1
```
*Receiving the same event twice produces the same result.* The `device_seen` set ensures that duplicate event IDs are discarded. The first processing adds to inbox; subsequent arrivals of the same ID are no-ops.

**S4: No State Regression (under G-Set model)**
```
THEOREM NoStateRegression ==
    ∀ device ∈ Devices, event_id ∈ EventId, t1 < t2:
        event_id ∈ device_state[device].read @ t1
        ⟹ event_id ∈ device_state[device].read @ t2
```
*Under a G-Set model for read receipts, a read message never becomes unread.* This property ONLY holds if the read set is implemented as a grow-only CRDT. Under pure LWW, this property can be violated by a stale state event overwriting a newer one.

### Liveness Properties

**L1: Eventual Deliverability**
```
THEOREM EventualDeliverability ==
    ∀ sender, recipient, event:
        Published(sender, event, relay) ∧ relay ∈ recipient.inbox_relays ∧ ¬Crashed(relay)
        ⟹ ◇ (event ∈ relay_stores[relay])
```
*If the sender publishes to at least one available relay that is one of the recipient's inbox relays, the message is eventually stored and therefore deliverable.* This does NOT guarantee the recipient will receive it — they must connect to that relay and subscribe.

**L2: Post-Reconnection Completeness**
```
THEOREM PostReconnectionCompleteness ==
    ∀ device, relay, t_disconnect, t_reconnect:
        Connected(device, relay) @ t_reconnect
        ∧ Subscribes(device, relay, {since: t_disconnect})
        ⟹ ◇ ∀ event ∈ relay_stores[relay]:
            event.created_at > t_disconnect ∧ MatchesFilter(event, device.filter)
            ⟹ event ∈ device_inbox[device]
```
*After reconnection with a `since` filter, all events stored on that relay since the disconnect time are eventually received.* Assumes the relay correctly implements `since` filtering and does not lose events between disconnect and reconnect.

**L3: Multi-Device Convergence**
```
THEOREM MultiDeviceConvergence ==
    ∀ device_a, device_b sharing the same keypair:
        ◇ (device_state[device_a] = device_state[device_b])
```
*Two devices that sync mailbox state eventually converge.* Under LWW, this means both devices eventually receive and apply the same latest state event. Under CRDTs, this means both devices eventually compute the same merged state.

### Fairness Assumptions
These liveness properties require fairness assumptions:
- **Weak fairness on network delivery**: if a message is persistently in the network, it is eventually delivered.
- **Weak fairness on relay processing**: if a relay has a pending event to store, it eventually stores it.
- **Eventual connectivity**: devices eventually reconnect to at least one relay.
- **No permanent relay failure**: at least one of the recipient's inbox relays is eventually available.

---

## D. Failure Analysis

### F1: All Relays Crash Simultaneously
**Scenario**: Sender publishes a kind 1059 event. All of the recipient's inbox relays crash before any can persist the event.

**Outcome**: Message is lost from the relay layer. The sender's client still has the event locally (in the sent queue or sent items).

**Detection**: Sender's client received no OK confirmations (or received OK but relays lost data on crash).

**Recovery**: Sender's client retries publication when relays recover. If sender's client also crashes (or user clears data), the message is permanently lost.

**Mitigation**: Clients should persist sent events locally until confirmed by at least one relay. Consider this an extreme edge case — simultaneous crash of all inbox relays is unlikely.

**TLA+ encoding**: This is modeled by enabling the `RelayCrash` action for all relays in the recipient's inbox set in the same step.

### F2: Relay Accepts but Crashes Before Persisting
**Scenario**: Relay receives an event, sends `["OK", id, true]` to the sender, then crashes before writing the event to durable storage.

**Outcome**: Sender believes the message is stored (received OK). Relay recovers without the event. Recipient never receives the message from this relay.

**Detection**: No direct detection. The sender cannot know whether the relay persisted the event. The recipient simply never receives it from this relay.

**Recovery**: If the sender published to multiple relays, the message may exist on others. If this was the only relay, the message is effectively lost despite the OK confirmation.

**Mitigation**: Publish to multiple relays (N >= 2). The probability of this failure on all relays simultaneously is low. Relay implementations should use write-ahead logging or fsync before sending OK.

**TLA+ encoding**: Model `ReceiveEvent` as two sub-steps: (1) send OK, (2) persist. Allow crash between them.

### F3: Clock Skew Causes State Regression
**Scenario**: Device A's clock is accurate (T=100). Device B's clock is 60 seconds behind (thinks T=40). Device A marks a message as read and publishes state with `created_at: 100`. Device B, unaware of A's update, makes a different change and publishes with `created_at: 41`. Device A's state wins (100 > 41), which is correct.

**Reverse scenario**: Device B's clock is 60 seconds AHEAD. B publishes state at `created_at: 161`. Later, Device A makes a more recent change at real time T=105, publishing with `created_at: 105`. B's stale state (161 > 105) overwrites A's newer state.

**Outcome**: Newer real-world state is overwritten by older state with a higher timestamp.

**Detection**: Difficult to detect without comparing device clocks.

**Mitigation**:
1. NTP synchronization on all devices (reduces but does not eliminate skew).
2. Hybrid Logical Clocks: attach a logical counter alongside the wall-clock time. On receiving a state event, set local logical clock to max(local, received) + 1.
3. Read-merge-write: always fetch current remote state before publishing.
4. Tolerance window: reject state events with `created_at` more than N minutes in the future.

**TLA+ encoding**: Model `now()` as a non-deterministic function returning a value within `[real_time - skew, real_time + skew]`.

### F4: Relay Replays Old Events
**Scenario**: Due to a bug or restore from backup, a relay delivers events the client has already seen.

**Outcome**: No impact. The client's deduplication layer (checking `event.id` against `device_seen`) discards the duplicate. The message is not processed twice.

**Verification**: This is exactly Safety property S3 (Idempotent Processing). The seen-set is the defense.

**TLA+ encoding**: Model `ReceiveStoredEvent` with the possibility of the relay sending any event in its store, regardless of whether it was already sent.

### F5: Network Reorders Messages
**Scenario**: Sender publishes event A (at T=100) then event B (at T=101). The network delivers B to the recipient before A.

**Outcome**: Recipient processes B first, then A. For independent messages, this is harmless — messages are displayed by `created_at` timestamp, not delivery order. For causally related messages (e.g., B references A via `e` tag), the client may need to buffer B until A arrives, or display B with a placeholder for A.

**Mitigation**: Clients should sort messages by `created_at` for display. For causal dependencies, implement a buffer/fetch mechanism: if a referenced event is missing, request it explicitly.

**TLA+ encoding**: The `network` bag has no ordering guarantees. The `Deliver` action can select any message from the bag.

### F6: Recipient Changes Inbox Relays Mid-Flight
**Scenario**: Sender reads recipient's kind 10050 (inbox relay list) showing relays R1, R2. Sender publishes to R1, R2. Meanwhile, recipient updates kind 10050 to R3, R4. Recipient is now subscribed to R3, R4 and no longer monitors R1, R2.

**Outcome**: Message is stored on R1, R2 but recipient is not subscribed there. Message is not delivered.

**Detection**: Recipient does not know a message was sent. Sender does not know the relay list changed.

**Mitigation**:
1. Recipients should monitor old relays for a transition period after changing relay lists.
2. Sender could re-check the recipient's relay list before publishing (but this adds latency and the list could change between check and publish).
3. Social layer: if the recipient doesn't respond, the sender may re-send.

**TLA+ encoding**: Allow the recipient's `inbox_relays` set to change non-deterministically.

---

## E. Invariants

### I1: Event ID Uniqueness
```
INVARIANT EventIdUniqueness ==
    ∀ e1, e2 ∈ AllEvents:
        e1.id = e2.id ⟹ e1 = e2
```
No two different events share an ID. This follows from the construction: `id = SHA-256(serialize(0, pubkey, created_at, kind, tags, content))`. A collision would require a SHA-256 collision, which is computationally infeasible.

**Implication**: Event ID is a reliable deduplication key. This invariant is assumed, not verified by the model (it depends on the hash function, not the protocol logic).

### I2: Signature Validity
```
INVARIANT SignatureValidity ==
    ∀ relay ∈ Relays, event ∈ relay_stores[relay]:
        VerifySchnorr(event.pubkey, event.id, event.sig) = TRUE
```
All events in relay stores have valid signatures. Relays MUST verify signatures on ingestion (NIP-01 requirement). If a relay stores an event with an invalid signature, it is a relay implementation bug.

**Client-side**: Clients MUST also verify signatures on receipt. A malicious relay could serve forged events; signature verification is the defense.

### I3: Deduplication
```
INVARIANT ClientDeduplication ==
    ∀ device ∈ Devices:
        ∀ e1, e2 ∈ device_inbox[device]:
            e1.id ≠ e2.id
```
A client never has two copies of the same event ID in its inbox. Enforced by checking `device_seen` before adding to `device_inbox`.

### I4: State Monotonicity (G-Set Properties Only)
```
INVARIANT ReadMonotonicity ==
    ∀ device ∈ Devices, t1 < t2:
        device_state[device].read @ t1 ⊆ device_state[device].read @ t2
```
The read set only grows — once a message is read, it stays read. This invariant holds ONLY if the read set is implemented as a G-Set CRDT. Under pure LWW on the full state event, this invariant can be violated (see F3: Clock Skew).

**Note**: This is a design choice, not an inherent protocol property. If the spec adopts G-Set semantics for read receipts, this invariant should be enforced. If the spec uses LWW, this invariant does not hold.

### I5: Relay Store Consistency
```
INVARIANT RelayStoreConsistency ==
    ∀ relay ∈ Relays, event ∈ relay_stores[relay]:
        event.kind = 10099 ∧ event.pubkey = pk
        ⟹ |{e ∈ relay_stores[relay] : e.kind = 10099 ∧ e.pubkey = pk ∧ e.tags["d"] = event.tags["d"]}| = 1
```
For replaceable events (including kind 10099), a relay stores at most one event per (kind, pubkey, d-tag) tuple — the one with the highest `created_at`. Relays MUST enforce this.

### I6: Gift Wrap Opacity
```
INVARIANT GiftWrapOpacity ==
    ∀ relay ∈ Relays, event ∈ relay_stores[relay]:
        event.kind = 1059
        ⟹ relay.CanDetermineSender(event) = FALSE
```
The relay cannot determine the true sender of a gift-wrapped event. The outer event uses an ephemeral pubkey; the real sender is hidden inside the encrypted payload. This is a privacy invariant, not directly verifiable in TLA+ (it depends on cryptographic properties), but it constrains the model: the relay's `MatchSubscription` function can only use outer event fields, not inner content.

---

## F. Recommendations for the Spec

Based on the state machine analysis, the following recommendations address identified weaknesses in the delivery model:

### R1: Adopt G-Set Semantics for Read Receipts
**Finding**: Under LWW on a monolithic state event, concurrent state updates from multiple devices cause data loss (one device's changes overwrite another's). Read status is particularly affected — a message can appear to flip between read and unread.

**Recommendation**: Define the read set as a grow-only set. The mailbox state event should contain the set of read message IDs. When merging two state events, the result is the union of their read sets. This ensures Invariant I4 (Read Monotonicity) holds.

**Implementation**: The kind 10099 event content should contain a `read` array. On conflict (two state events with the same `created_at` or from different devices), the merge operation is set union, not replacement.

### R2: Partition Mailbox State by Property
**Finding**: A single kind 10099 event for all mailbox state creates write contention across orthogonal operations (marking read vs. flagging vs. moving folders).

**Recommendation**: Use separate `d` tag values for independent state properties:
- `["d", "read"]` — read/unread state (G-Set)
- `["d", "flags"]` — flagged messages (OR-Set or LWW)
- `["d", "folders"]` — folder assignments (LWW or OR-Set)

This reduces conflicts: marking a message as read on Device A while flagging a different message on Device B are now independent updates.

### R3: Mandate Multi-Relay Publication
**Finding**: Publishing to a single relay creates a single point of failure. If that relay crashes before persisting (F2), the message is lost despite an OK confirmation.

**Recommendation**: The spec should recommend (SHOULD, not MUST) publishing to at least 2 of the recipient's inbox relays. Clients should track per-relay acknowledgment and warn the user if fewer than 2 relays confirm.

### R4: Define a Relay Transition Period
**Finding**: When a recipient changes inbox relays (F6), messages published to old relays are lost.

**Recommendation**: The spec should recommend that recipients maintain subscriptions to their previous inbox relays for a transition period (e.g., 7 days) after publishing an updated kind 10050. The old relay list should be retained locally for this purpose.

### R5: Include Timestamp Tolerance in Relay Validation
**Finding**: Clock skew (F3) can cause state regression. Events with future timestamps are particularly dangerous — they can permanently "win" LWW conflicts.

**Recommendation**: Relays should reject replaceable events with `created_at` more than N seconds in the future (e.g., N=600, i.e., 10 minutes). This bounds the damage from clock skew. NIP-01 already permits relays to reject events; this recommendation makes the tolerance explicit for kind 10099.

### R6: Define Offline Queue Behavior
**Finding**: The spec does not address offline composition. Clients need guidance on queue ordering, retry policy, and interaction with gift wrapping (should events be wrapped at composition time or at publication time?).

**Recommendation**: Events should be wrapped at publication time, not composition time. Reason: the gift wrap's `created_at` should reflect publication time (with randomization per NIP-59), not composition time. The inner event (kind 14) should carry the composition timestamp. This ensures that the relay's `created_at`-based filtering works correctly for delta sync.

### R7: Add a Delivery Confirmation Mechanism (Optional)
**Finding**: The sender has no way to know if the recipient received the message. The only confirmation is the relay's OK, which only confirms storage, not delivery.

**Recommendation**: Consider an optional delivery receipt mechanism (a new kind, sent by the recipient's client when a message is decrypted). This should be opt-in and privacy-preserving (also gift-wrapped). This is explicitly a V2 feature — the protocol works without it, but it would improve UX for reliability-sensitive use cases.

### R8: Specify Event ID Retention Policy for Deduplication
**Finding**: The `device_seen` set grows unboundedly. Clients need guidance on when it is safe to prune old event IDs.

**Recommendation**: Clients may prune event IDs from `device_seen` that are older than the oldest `since` value used in any active subscription. Events older than this threshold will not be re-delivered by relays (assuming relays correctly implement `since` filtering), so their IDs are no longer needed for deduplication.
