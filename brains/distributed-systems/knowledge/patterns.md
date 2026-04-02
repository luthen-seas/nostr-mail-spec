# Distributed Systems Design Patterns for NOSTR Mail

## Multi-Relay Publication for Reliability

### The Pattern
Publish each outbound message to N relays, where N is the number of the recipient's inbox relays (sourced from their kind 10050 relay list event, per NIP-65). Typically N = 2-3.

### Algorithm
```
function publish_message(event, recipient_inbox_relays):
    results = {}
    for relay in recipient_inbox_relays:
        results[relay] = send_event(relay, event)  // async, parallel

    wait_for_any(results, timeout=5s)

    ok_count = count(r for r in results where r.status == OK)
    if ok_count >= 1:
        return SENT  // at least one relay has the message
    else if all(r.status == TIMEOUT for r in results):
        return QUEUED  // all relays unreachable, queue for retry
    else if all(r.status == REJECTED for r in results):
        return FAILED  // all relays rejected (auth required, event invalid, etc.)
    else:
        return PARTIAL  // some relays responded, retry the rest
```

### Self-Copy Publication
In addition to publishing to the recipient's inbox relays, the sender publishes a self-addressed copy (wrapped to their own pubkey) to their own write relays. This is a separate publication with independent success/failure tracking.

### Failure Handling
| Scenario | Action |
|----------|--------|
| All relays accept | Message sent. |
| Some relays accept | Message sent. Optionally retry failed relays in background. |
| All relays timeout | Queue for retry. Alert user if retry also fails. |
| All relays reject | Publication error. Check event validity, auth status. |
| Relay accepts then crashes | Client got OK, but event may be lost. No action — recipient will not see it from that relay, but should see it from others. |

### Publication Confirmation UX
- 1+ relay OK: show "sent" checkmark
- 0 relays OK, retrying: show "sending..." spinner
- All retries exhausted: show "failed to send" with retry button
- Never show "delivered" — NOSTR has no read receipts at the protocol level (the recipient's client may implement them as application-level events)

---

## Efficient Reconnection

### Per-Relay Sync Points
Track the last-seen timestamp for each relay independently. This accounts for different relays having different event sets and different latencies.

```
sync_points = {
    "wss://relay1.example.com": 1711929600,  // timestamp of last EOSE
    "wss://relay2.example.com": 1711929550,
    "wss://relay3.example.com": 1711929580,
}
```

### Reconnection Flow
```
function reconnect(relay):
    connect(relay)
    last_seen = sync_points[relay.url] or 0

    // Request new events since last sync
    subscribe(relay, {
        "#p": [my_pubkey],
        "kinds": [1059],
        "since": last_seen
    })

    // Also fetch latest mailbox state
    subscribe(relay, {
        "authors": [my_pubkey],
        "kinds": [10099]
    })

    on_event(event):
        if not seen(event.id):
            process(event)
            mark_seen(event.id)

    on_eose():
        sync_points[relay.url] = now()
        // Switch to live subscription (no "since")
```

### Deduplication Across Relays
When connected to multiple relays, the same event may arrive from more than one. Deduplicate by event ID:

```
seen_ids = Set()  // in-memory or persisted

function handle_event(event):
    if event.id in seen_ids:
        return  // already processed
    seen_ids.add(event.id)
    process(event)
```

For long-running clients, `seen_ids` should be bounded (e.g., LRU cache of recent IDs, or persisted to local storage with periodic cleanup of IDs older than the oldest sync point).

### Edge Case: Relay Sends Events Older Than `since`
Some relays may not respect the `since` filter precisely (off-by-one, clock skew). The client must handle duplicate delivery gracefully — the dedup layer handles this automatically.

---

## Mailbox State Partitioning

### The Problem
A single kind 10099 replaceable event holding all mailbox state grows unbounded as the user accumulates messages. At 1,000 messages with read/flag/folder state each, the event could exceed relay size limits (typically 64KB-512KB).

### Solution A: Partition by Time Period
Use the `d` tag to scope state to a time period:
```json
{"kind": 10099, "tags": [["d", "state-2026-04"]], "content": "<encrypted state for April 2026>"}
{"kind": 10099, "tags": [["d", "state-2026-03"]], "content": "<encrypted state for March 2026>"}
```

**Pros:**
- Old months rarely change (bounded write amplification).
- Each partition has a bounded size (proportional to monthly message volume).
- Natural archival: old partitions can be deprioritized in sync.

**Cons:**
- Cross-month queries (e.g., "show all unread") require fetching multiple partitions.
- Month boundaries are arbitrary — a message received on March 31 and read on April 1 crosses partitions.
- Partition key must be deterministic: use `created_at` of the message event, not the state change time.

### Solution B: Partition by Folder
```json
{"kind": 10099, "tags": [["d", "state-inbox"]], "content": "<encrypted inbox state>"}
{"kind": 10099, "tags": [["d", "state-archive"]], "content": "<encrypted archive state>"}
{"kind": 10099, "tags": [["d", "state-sent"]], "content": "<encrypted sent state>"}
```

**Pros:**
- Only the active folder (inbox) updates frequently.
- Listing a folder's state requires fetching only one event.
- Natural alignment with user mental model.

**Cons:**
- Moving a message between folders requires atomically updating two events (remove from source, add to destination). Since NOSTR has no transactions, this creates a window where the message appears in both or neither folder.
- Folder count may grow (user-defined folders), creating many small events.

### Solution C: Sparse State Tracking
Only store non-default states. Define defaults:
- Default: unread, unflagged, in inbox folder

Only record deviations:
```json
{
  "read": ["event_id_1", "event_id_2"],
  "flagged": ["event_id_3"],
  "folders": {"archive": ["event_id_4", "event_id_5"]},
  "deleted": ["event_id_6"]
}
```

**Pros:**
- Smallest possible state — most messages stay at defaults.
- Simple G-Set semantics for `read` and `deleted` (grow-only).
- No redundant data for messages that were never interacted with.

**Cons:**
- "List all unread" requires knowing the total message set (all received event IDs) minus the read set.
- Requires maintaining the total message set separately.

### Recommendation
**Solution C (sparse) + Solution A (time partitioning) as a hybrid.** Store only non-default states, partitioned by month. This gives bounded partition size, minimal data, and G-Set semantics for read receipts.

---

## Multi-Device Consistency

### Message Set Consistency
All devices subscribe to the same relays (determined by kind 10050). All devices receive the same events (eventually). Dedup by event ID ensures a consistent message set across devices.

```
Device A sees: {msg1, msg2, msg3}
Device B sees: {msg1, msg2}        // msg3 not yet received
  ... time passes ...
Device B sees: {msg1, msg2, msg3}  // converged
```

### Mailbox State Consistency
Mailbox state is a replaceable event (kind 10099). All devices publish and subscribe to this event. The latest `created_at` wins.

**Happy path:**
1. Device A reads message, publishes state with `created_at: T1`
2. Device B receives the state event, updates local view
3. Both devices agree: message is read

**Race condition:**
1. Device A marks msg1 as read, publishes state at `T=100`
2. Device B marks msg2 as flagged, publishes state at `T=101`
3. Device B's event replaces Device A's — msg1 read state is lost

### Mitigation: Read-Merge-Write
Before publishing a state update, fetch the current state from relays, merge the local change into it, then publish:

```
function update_state(change):
    current = fetch_latest(kind=10099, author=me)
    merged = merge(current.content, change)
    publish(kind=10099, content=merged, created_at=now())
```

This reduces conflicts but does not eliminate them — two devices could read the same state, apply different changes, and publish simultaneously. The one with the later timestamp wins.

### Mitigation: Property-Level Separation
Instead of one monolithic state event, use separate events for orthogonal properties:
```
kind 10099 with ["d", "read-state"]   — read/unread tracking
kind 10099 with ["d", "flag-state"]   — flag tracking
kind 10099 with ["d", "folder-state"] — folder assignments
```

Now, marking a message as read and flagging a different message are independent operations that do not conflict. Conflicts only occur when two devices update the *same property* concurrently.

---

## Offline Queue

### Architecture
```
┌─────────────────────────────────────┐
│              Client                  │
│  ┌───────────┐    ┌───────────────┐ │
│  │  Compose   │───▶│ Offline Queue │ │
│  │  UI        │    │  (local DB)   │ │
│  └───────────┘    └───────┬───────┘ │
│                           │         │
│  ┌───────────┐    ┌───────▼───────┐ │
│  │  Network   │◀──│  Queue        │ │
│  │  Monitor   │───▶│  Processor   │ │
│  └───────────┘    └───────────────┘ │
└─────────────────────────────────────┘
```

### Queue Operations

**Composing a message while offline:**
1. Generate event content (plaintext).
2. Store in local queue with status `PENDING`.
3. Show in sent folder with "pending" indicator.

**On reconnect:**
1. Network monitor detects connectivity.
2. Queue processor iterates pending items in FIFO order.
3. For each item:
   a. Encrypt content (NIP-44).
   b. Create kind 14 (DM) event.
   c. Gift-wrap in kind 1059 (NIP-59).
   d. Publish to recipient's inbox relays.
   e. On OK: update status to `SENT`.
   f. On failure: increment retry count, reschedule.

**Attachment handling:**
1. Queue Blossom upload first.
2. On upload success: get the Blossom URL.
3. Include URL in message content.
4. Proceed with encryption and publication.
5. If upload fails: hold the entire message in queue (attachment is integral).

**State change queue:**
1. Offline state changes (mark read, flag, move to folder) accumulate locally.
2. On reconnect: merge all accumulated changes into current remote state.
3. Publish single merged state event (not one event per change — this avoids unnecessary replaceable event churn).

### Retry Policy
```
attempt 1: immediate
attempt 2: 5 seconds
attempt 3: 30 seconds
attempt 4: 2 minutes
attempt 5: 10 minutes
attempt 6+: 30 minutes (cap)
```

After N failed attempts (configurable, e.g., 10): mark as permanently failed, alert user.

### Queue Persistence
The offline queue must survive app restarts. Store in:
- SQLite (mobile/desktop)
- IndexedDB (web)

Each queue item:
```json
{
    "id": "local-uuid",
    "type": "message|state_change|attachment_upload",
    "payload": { ... },
    "status": "PENDING|SENDING|SENT|FAILED",
    "created_at": 1711929600,
    "retry_count": 0,
    "next_retry_at": null
}
```
