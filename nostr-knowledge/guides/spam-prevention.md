# Spam Prevention and Content Moderation in NOSTR

> In a decentralized protocol with no central authority, spam prevention is a shared responsibility between relays, clients, and communities. There is no single "report and remove" button. Instead, NOSTR provides a layered toolkit of economic, cryptographic, and social mechanisms.

---

## Table of Contents

1. [The Spam Problem in Decentralized Systems](#the-spam-problem-in-decentralized-systems)
2. [Relay-Level Defenses](#relay-level-defenses)
3. [Client-Level Defenses](#client-level-defenses)
4. [Community-Level Defenses](#community-level-defenses)
5. [Write Policy Plugins (strfry Model)](#write-policy-plugins)
6. [ML-Based Spam Detection](#ml-based-spam-detection)
7. [Best Practices for Relay Operators](#best-practices-for-relay-operators)

---

## The Spam Problem in Decentralized Systems

In a centralized platform (Twitter, Reddit), spam is handled by a single moderation team with full database access. They can delete content, ban accounts, and train ML models on their entire dataset. Users trust the platform to filter.

NOSTR has none of this. Its design properties create a fundamentally different spam landscape:

| Property | Consequence for Spam |
|----------|---------------------|
| **Anyone can publish** | No registration barrier. A spammer can generate millions of keypairs and publish from each one. |
| **Anyone can run a relay** | No chokepoint for enforcement. A relay that blocks a spammer does not affect other relays. |
| **Events are cryptographically signed** | Events cannot be forged, but they also cannot be "unsigned" -- once published, they exist. |
| **No global state** | There is no shared blocklist. Each relay and client makes independent decisions. |
| **Pseudonymous identity** | A banned pubkey can be replaced instantly with a new one. Banning by pubkey alone is whack-a-mole. |

The solution is not a single mechanism but a **layered defense strategy** where relays, clients, and communities each contribute filters. A spam event that gets past one layer may be caught by another.

---

## Relay-Level Defenses

Relays are the first line of defense. They decide which events to accept, store, and serve. A relay that accepts everything will be overwhelmed. Effective relays implement multiple filtering layers.

### NIP-13: Proof of Work Requirements

NIP-13 defines a hashcash-like proof of work scheme where event IDs must have a minimum number of leading zero bits. See the [NIP-13 breakdown](../nips/security/nip-13.md).

**How it works:**
- The publisher adds a `["nonce", "<value>", "<target>"]` tag to the event.
- The publisher iterates the nonce value until the SHA-256 event ID has at least `<target>` leading zero bits.
- The relay verifies the PoW before accepting the event.

**Configuration example:**

```
Relay policy: Require minimum 20-bit PoW for kind 1 events from unauthenticated pubkeys
```

**Trade-offs:**

| Pros | Cons |
|------|------|
| Permissionless -- no registration needed | Raises cost for legitimate low-power devices (phones) |
| Easy to verify (single SHA-256 check) | ASICs/GPUs can produce PoW cheaply at scale |
| Committed difficulty prevents lucky low-effort miners from passing | Does not distinguish good content from expensive spam |
| Can be delegated (NIP-13 delegated PoW) | Mining difficulty 20 takes seconds; difficulty 30+ takes minutes to hours |

**Recommended settings:**

| Use Case | Difficulty | Approximate Mining Time |
|----------|-----------|------------------------|
| Low barrier (most events) | 16-20 | < 5 seconds |
| Medium barrier (profile updates) | 20-24 | 5-30 seconds |
| High barrier (expensive operations) | 28+ | Minutes |

### Rate Limiting

Rate limiting restricts how many events a single source can publish within a time window.

**Strategies:**

| Strategy | Description | Evasion Risk |
|----------|-------------|-------------|
| **Per-IP** | Limit events per IP address per time window | Easily evaded with rotating IPs, VPNs, Tor |
| **Per-pubkey** | Limit events per pubkey per time window | Evaded by generating new keypairs |
| **Per-IP + per-pubkey** | Both limits must be satisfied | Better, but still evadable |
| **Sliding window** | Use a rolling time window instead of fixed intervals | Smoother limiting, harder to game timing |
| **Token bucket** | Allow burst capacity with a refill rate | Good UX for bursty legitimate usage |
| **Adaptive** | Increase limits for trusted pubkeys, decrease for new ones | Requires trust scoring |

**Example configuration (strfry):**

```
rate_limit {
  events_per_second = 5          # Global per-connection limit
  burst = 20                     # Allow short bursts
  new_pubkey_events_per_minute = 2   # Stricter for unknown pubkeys
}
```

### NIP-42: Authentication Requirements

NIP-42 defines a challenge-response authentication protocol. Relays can require clients to prove they control a specific pubkey before allowing reads, writes, or both. See the [NIP-42 breakdown](../nips/identity/nip-42.md).

**Anti-spam applications:**

- **Write-gating:** Only authenticated pubkeys can publish events. This does not stop a determined spammer (who can authenticate with throwaway keys) but raises the friction.
- **Read-gating for DMs:** Only the sender or recipient can read kind 4 / kind 1059 events, preventing metadata harvesting.
- **Allowlist enforcement:** Authenticate first, then check the pubkey against an allowlist before accepting events.
- **Rate limiting by authenticated identity:** Per-pubkey rate limits are more meaningful when the pubkey is authenticated.

### Paid Relays (Lightning Payments)

Economic barriers are among the most effective anti-spam mechanisms. A relay that charges for publishing (even a small amount like 1-10 sats per event, or a monthly subscription) makes bulk spam economically infeasible.

**Models:**

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| **Per-event payment** | Pay Lightning invoice per published event | Directly proportional cost to spam volume | UX friction for legitimate users |
| **Subscription** | Pay monthly for write access | Good UX, predictable cost | Spammer pays once, spams all month |
| **Deposit + penalty** | Pay deposit, forfeit on spam reports | Strong deterrent | Complex to implement fairly |
| **Tiered** | Free for small volumes, paid above threshold | Good free tier UX | Spammer stays under free tier |

**Implementation:** The relay publishes payment requirements in its NIP-11 information document. Clients that support paid relays (via NIP-47 Nostr Wallet Connect or manual Lightning payment) can pay automatically.

### Kind and Content Filtering

Relays can restrict which event kinds they accept and filter content.

**Kind filtering:**
```
# Accept only social events (metadata, text notes, reactions, follows, DMs)
accepted_kinds = [0, 1, 3, 5, 6, 7, 9735, 10002, 30023]

# Or: reject specific high-spam kinds
rejected_kinds = [1111]  # If community posts are being abused
```

**Content filtering:**
- Reject events with content matching known spam patterns (URLs, phrases).
- Reject events exceeding a content size limit.
- Reject events with excessive tags (tag stuffing).
- Reject events with content that is entirely non-text (base64 blobs in kind 1).

### Event Size Limits

Large events consume storage and bandwidth. Relays should enforce maximum event sizes.

**Recommended limits:**

| Component | Reasonable Limit |
|-----------|-----------------|
| Total event JSON size | 64 KiB - 128 KiB |
| Number of tags | 2000-5000 |
| Content field length | 64 KiB |
| Tag value length | 1024 bytes per element |
| Number of `p` tags | 1000 (prevents tag-spam notification attacks) |

---

## Client-Level Defenses

Even if a relay accepts spam, the client does not have to display it. Client-level filtering is the user's last line of defense.

### Web of Trust (WoT) Filtering

Web of Trust is the most powerful client-level anti-spam mechanism. It uses the social graph to determine which pubkeys are trustworthy.

**How it works:**

1. Start with the user's own follow list (kind 3) as the "trust anchor."
2. Assign trust levels based on social distance:
   - **Degree 0:** The user themselves.
   - **Degree 1:** People the user follows directly.
   - **Degree 2:** People followed by people the user follows (friends-of-friends).
   - **Degree 3+:** Increasingly distant, increasingly untrusted.
3. Weight trust by the number of paths: a pubkey followed by 10 of your follows is more trusted than one followed by 1.
4. Filter or deprioritize content from pubkeys outside the trust radius.

**Implementation approaches:**

- **Binary cutoff:** Show only degree-1 and degree-2 content. Hide everything else.
- **Weighted scoring:** Compute a WoT score for each pubkey. Show content above a threshold. Let users adjust the threshold.
- **NIP-85 Trusted Assertions:** Delegate WoT computation to a trusted service provider. The provider publishes pre-computed trust scores (kind 30382 events) that the client consumes. See the [NIP-85 breakdown](../nips/identity/nip-85.md).

**Effectiveness:** WoT is highly effective against automated spam because spammers cannot easily infiltrate the trust graph. A new spammer keypair has degree-infinity (no connections). Even with purchased follows, reaching degree-2 for a large portion of the network requires compromising real accounts.

### Mute Lists (NIP-51)

NIP-51 defines kind 10000 mute lists. Users can mute specific pubkeys, event IDs, hashtags, and words. See the [NIP-51 breakdown](../nips/social/nip-51.md).

**Mutable targets:**

| Tag | What It Mutes |
|-----|--------------|
| `"p"` | All events from a specific pubkey |
| `"e"` | A specific event (thread) |
| `"t"` | All events with a specific hashtag |
| `"word"` | All events containing a specific word (case-insensitive) |

**Private muting:** Mute list entries can be encrypted (NIP-44) in the event content field, hiding from public view which pubkeys or words the user has muted. This prevents spammers from knowing they have been muted and adapting.

### Reporting (NIP-56)

NIP-56 defines kind 1984 reporting events. Users can report pubkeys and specific events for spam, nudity, malware, illegal content, impersonation, or profanity. See the [NIP-56 breakdown](../nips/social/nip-56.md).

**How reporting enables moderation:**

1. Users publish kind 1984 report events tagging the offending pubkey and/or event.
2. Relays and clients query for reports from **trusted reporters** (not all reports -- that would be gameable).
3. If enough trusted reporters flag a pubkey or event, the relay or client takes action (hiding, banning, deprioritizing).

**Report types:**

| Type | Use Case |
|------|----------|
| `spam` | Unsolicited bulk content, promotional spam |
| `nudity` | Explicit content posted without content warnings |
| `malware` | Links to malicious software |
| `illegal` | Content illegal in relevant jurisdictions |
| `impersonation` | Identity fraud |
| `profanity` | Hate speech, harassment |
| `other` | Catch-all |

**Key principle:** Reports are only useful when consumed selectively. A client that hides content based on reports from *any* pubkey can be weaponized (mass false reporting). Reports should be filtered through the user's WoT.

### Labeling (NIP-32)

NIP-32 provides a general-purpose labeling system using kind 1985 events. Labels can classify content by topic, quality, safety, or any other dimension. See the [NIP-32 breakdown](../nips/social/nip-32.md).

**Anti-spam applications:**

- Trusted labelers can tag events as `spam`, `bot`, `low-quality`.
- Clients can subscribe to labels from labelers the user trusts.
- Labels can be more nuanced than binary report/no-report: e.g., `"confidence": "0.95"`, `"category": "promotional"`.
- Multiple labelers can provide overlapping coverage (defense in depth).

**Example label event:**

```json
{
  "kind": 1985,
  "tags": [
    ["L", "nip56.report"],
    ["l", "spam", "nip56.report"],
    ["e", "<spam-event-id>"],
    ["p", "<spammer-pubkey>"]
  ],
  "content": "Automated spam detection: promotional content with suspicious URL pattern"
}
```

### Content Warnings (NIP-36)

NIP-36 defines the `content-warning` tag for marking events as containing sensitive material. See the [NIP-36 breakdown](../nips/social/nip-36.md).

While not directly anti-spam, content warnings:
- Allow clients to hide potentially objectionable content behind a click-to-reveal.
- When combined with NIP-32 labels, enable automated classification of content that should be hidden.
- Provide a social norm: content that should have a warning but does not gets reported.

### Trusted Assertions (NIP-85)

NIP-85 allows users to delegate expensive computations (WoT scores, follower counts, reputation metrics) to trusted service providers. See the [NIP-85 breakdown](../nips/identity/nip-85.md).

**Anti-spam applications:**

- A trusted provider computes spam scores for pubkeys based on analysis the client cannot perform (e.g., analyzing posting patterns across many relays).
- Providers publish kind 30382 assertion events with pre-computed metrics.
- Clients consume these assertions to filter without doing the computation themselves.
- Users explicitly choose which providers to trust (kind 10040 declaration), preserving decentralization.

---

## Community-Level Defenses

Individual relay and client filters are powerful, but communities can organize collective defenses.

### Moderated Communities (NIP-72)

NIP-72 defines Reddit-style communities with designated moderators. See the [NIP-72 breakdown](../nips/social/nip-72.md).

**How moderation works:**

1. A community is defined by a kind 34550 event listing moderators (in `p` tags with "moderator" role).
2. Users post to the community via kind 1400 (NIP-22 comment) events scoped to the community.
3. Moderators publish kind 4550 approval events for posts they want visible.
4. Clients display only approved posts (or show unapproved posts with a lower priority / warning).

**Anti-spam properties:**

- Spam posts are simply not approved. They exist on relays but are invisible to clients that respect the moderation model.
- Moderation is transparent: approval events are public, so users can see what was approved and by whom.
- Multiple moderators provide redundancy and reduce single-point-of-failure.
- Users can choose which moderators' approvals to honor, preventing moderator abuse.

### Relay-Based Groups (NIP-29)

NIP-29 defines relay-managed groups with enforced access control. See the [NIP-29 breakdown](../nips/messaging/nip-29.md).

**Key difference from NIP-72:** The relay itself enforces membership and permissions, not just clients.

**Anti-spam properties:**

- **Closed groups:** Only members can post. The relay rejects events from non-members.
- **Role-based administration:** Admins can remove users (kind 9001), delete events (kind 9005), and manage membership.
- **Invite-only:** Groups can require invite codes (kind 9009) for joining.
- **Relay enforcement:** Because the relay enforces rules, a malicious client cannot bypass them.

### WoT Relays

A "WoT relay" is a relay that uses Web of Trust as its acceptance criterion. It maintains a trust graph rooted in one or more anchor pubkeys and only accepts events from pubkeys within a certain trust distance.

**Example: wot-relay**

The `wot-relay` project implements this concept:
1. The relay operator specifies anchor pubkeys (their own follow list, or a set of trusted community members).
2. The relay builds a trust graph by fetching follow lists (kind 3) from the anchors and their follows.
3. Only events from pubkeys within the trust radius (e.g., degree 2) are accepted.
4. The trust graph is periodically refreshed.

**Effectiveness:** Very high. A spammer must first be followed by real users within the trust graph to publish. The relay is effectively a "curated commons" -- open to the community but closed to outsiders.

**Trade-off:** New users who are not yet in the trust graph cannot publish. This creates an onboarding challenge. Some WoT relays solve this by allowing a probationary period, requiring PoW from untrusted pubkeys, or allowing anyone to publish but only serving events from trusted pubkeys to subscribers.

---

## Write Policy Plugins

### The strfry Model

[strfry](https://github.com/hoytech/strfry) is the most deployed relay implementation. It supports **write policy plugins** -- external programs that the relay invokes for each incoming event to decide whether to accept or reject it.

**How it works:**

1. An event arrives at the relay.
2. strfry serializes the event as JSON and passes it to the plugin via stdin.
3. The plugin processes the event (checking PoW, querying a blocklist, running ML classification, etc.).
4. The plugin writes a JSON response to stdout: `{"action": "accept"}` or `{"action": "reject", "msg": "reason"}`.
5. strfry accepts or rejects the event based on the response.

**Plugin interface:**

```json
// Input (stdin, one event per line):
{"type": "new", "event": {"id": "...", "pubkey": "...", "kind": 1, "content": "Buy cheap NFTs!", ...}}

// Output (stdout):
{"id": "...", "action": "reject", "msg": "blocked: spam content detected"}
```

**Example plugins:**

| Plugin | Function |
|--------|----------|
| **PoW check** | Verify NIP-13 difficulty meets relay minimum |
| **Blocklist** | Reject events from known spam pubkeys |
| **WoT filter** | Accept only events from pubkeys in the trust graph |
| **Rate limiter** | Track per-pubkey event rates, reject above threshold |
| **Content filter** | Regex or keyword matching against known spam patterns |
| **ML classifier** | Run event content through a spam classification model |
| **Allowlist** | Accept only events from a curated set of pubkeys |

**Writing a basic plugin (Python):**

```python
#!/usr/bin/env python3
import sys
import json

BLOCKED_WORDS = ['buy now', 'free bitcoin', 'click here', 'dm me for']

for line in sys.stdin:
    event = json.loads(line)
    evt = event.get('event', {})
    content = evt.get('content', '').lower()

    action = 'accept'
    msg = ''

    # Check for spam phrases
    for word in BLOCKED_WORDS:
        if word in content:
            action = 'reject'
            msg = f'blocked: contains spam phrase "{word}"'
            break

    result = {'id': evt.get('id', ''), 'action': action, 'msg': msg}
    print(json.dumps(result), flush=True)
```

**strfry configuration:**

```
write_policy {
    plugin = "/etc/strfry/plugins/spam-filter.py"
}
```

### Other Relay Frameworks

- **khatru (Go):** Provides `RejectEvent` hooks in Go code. Equivalent to strfry plugins but compiled into the relay.
- **nostream (TypeScript):** Supports event validation middleware in TypeScript.
- **Custom relays:** Any relay implementation can add pre-acceptance filtering. The pattern is universal.

---

## ML-Based Spam Detection

Machine learning can catch spam that rule-based filters miss, especially when spammers adapt their content to bypass keyword filters.

### Approach 1: Text Classification

Train a classifier on labeled NOSTR events (spam vs. not-spam).

**Features:**
- Event content text (TF-IDF, embeddings, or language model features)
- Event metadata (kind, tag count, content length, created_at patterns)
- Pubkey features (account age, follow count, historical event rate)
- URL analysis (domain reputation, URL shortener usage)

**Models:**
- Lightweight: Logistic regression or random forest on TF-IDF features (runs on relay hardware).
- Medium: Fine-tuned DistilBERT or similar small transformer.
- Heavy: API call to a large language model (adds latency, cost, and external dependency).

### Approach 2: Behavioral Analysis

Instead of classifying individual events, classify pubkey behavior patterns.

**Signals:**
- Posting frequency (events per minute/hour)
- Content repetition (same or near-identical content from the same or different pubkeys)
- Follow graph anomalies (pubkeys that follow no one, or follow only other spam pubkeys)
- Event kind distribution (legitimate users post diverse kinds; spammers often post only kind 1)
- Temporal patterns (bursts of activity followed by inactivity, or precise periodic posting)
- Reply/engagement ratio (spammers often post but never reply or react)

### Approach 3: Collaborative Filtering

Aggregate signals from multiple relays and trusted labelers.

1. Trusted labelers (NIP-32) publish spam labels for events and pubkeys.
2. Relays subscribe to labels from labelers they trust.
3. A pubkey labeled as spam by multiple independent labelers is very likely spam.
4. New relays can bootstrap their spam filters by importing labels from established labelers.

### Deployment Considerations

| Concern | Recommendation |
|---------|---------------|
| **Latency** | Keep ML inference under 50ms per event to avoid relay backpressure. Use lightweight models. |
| **False positives** | A false positive blocks a legitimate user. Err on the side of allowing. Use ML as a scoring input, not a binary gate. |
| **Adversarial adaptation** | Spammers will adapt to your model. Retrain regularly. Combine ML with non-ML defenses. |
| **Privacy** | Do not send event content to external APIs unless users consent. Prefer on-device/on-relay inference. |
| **Transparency** | If using ML to filter, document the policy. Users should know why their events might be rejected. |

---

## Best Practices for Relay Operators

### Defense in Depth Configuration

A well-configured relay layers multiple defenses:

```
Layer 1: Network-level
  - Rate limit connections per IP (e.g., 10 new WebSocket connections per minute per IP)
  - Block known Tor exit nodes if appropriate for your relay's use case
  - DDoS protection (Cloudflare, nginx rate limiting)

Layer 2: Protocol-level
  - NIP-42 authentication required for writes
  - NIP-13 PoW required (minimum 16-20 bits for unauthenticated pubkeys)
  - Event size limits (64 KiB max)
  - Tag count limits (2000 max)
  - Reject events with created_at too far in the past or future (e.g., +/- 15 minutes)

Layer 3: Identity-level
  - WoT filtering (accept events only from pubkeys within N degrees of trust anchors)
  - Or: paid relay (Lightning subscription/per-event payment)
  - Or: allowlist (curated set of accepted pubkeys)

Layer 4: Content-level
  - Write policy plugin (keyword filter, ML classifier)
  - Reject known spam patterns (URL patterns, repeated content)
  - NIP-32 label consumption from trusted labelers

Layer 5: Reactive
  - Honor NIP-56 reports from trusted reporters
  - Manual review queue for flagged events
  - Operator ability to ban pubkeys and delete events
```

### Monitoring and Alerting

- Track events-per-second by kind and by pubkey. Alert on anomalies.
- Monitor storage growth rate. Sudden spikes indicate spam floods.
- Log rejected events (reason, pubkey, kind) for pattern analysis.
- Track the ratio of accepted to rejected events. A high rejection rate may indicate an ongoing attack.

### Transparency

- Publish your relay's policies in the NIP-11 information document.
- Document PoW requirements, rate limits, accepted kinds, and any allowlist/WoT criteria.
- If you use ML filtering, disclose it and provide a contact for false positive appeals.

### Coordination with Other Operators

- Share blocklists of known spam pubkeys with trusted relay operators.
- Subscribe to NIP-32 spam labels from established labelers.
- Participate in relay operator communities (e.g., Telegram/Signal groups, NOSTR itself) to share intelligence about emerging spam campaigns.
- Consider publishing your relay's blocklist as a NIP-51 set (kind 30000) for other operators to subscribe to.

### Handling Persistent Spammers

When a spammer continuously generates new keypairs to evade pubkey-based bans:

1. **Switch to IP-based blocking** if the spammer uses a small set of IPs.
2. **Increase PoW requirements** dynamically during attacks.
3. **Enable NIP-42 auth + WoT filtering** -- new keypairs have no trust connections.
4. **Deploy content-based filtering** -- ML models or keyword filters catch the content regardless of which pubkey sends it.
5. **Require payment** -- the most effective defense against bulk spam. Even 1 sat per event makes millions of spam events cost real money.

---

## Summary: The Layered Defense Model

No single mechanism is sufficient. The strength of NOSTR's anti-spam approach is the combination:

| Layer | Mechanism | Catches |
|-------|-----------|---------|
| **Economic** | Paid relays, PoW | Bulk automated spam |
| **Identity** | WoT, NIP-42 auth, allowlists | New/unknown spammers |
| **Content** | Keyword filters, ML, NIP-32 labels | Adapted spam from trusted-looking accounts |
| **Social** | NIP-56 reports, NIP-72 moderation, NIP-29 groups | Content that passes automated filters |
| **User** | NIP-51 mute lists, client WoT display | Individual user preferences |

Each layer compensates for the others' weaknesses. Economic barriers stop volume. Identity filtering stops unknown actors. Content filtering stops sophisticated spam. Social moderation catches edge cases. User muting gives final control.

---

## References

- [NIP-13: Proof of Work](../nips/security/nip-13.md)
- [NIP-29: Relay-based Groups](../nips/messaging/nip-29.md)
- [NIP-32: Labeling](../nips/social/nip-32.md)
- [NIP-36: Sensitive Content](../nips/social/nip-36.md)
- [NIP-42: Authentication of Clients to Relays](../nips/identity/nip-42.md)
- [NIP-51: Lists (Mute Lists)](../nips/social/nip-51.md)
- [NIP-56: Reporting](../nips/social/nip-56.md)
- [NIP-72: Moderated Communities](../nips/social/nip-72.md)
- [NIP-85: Trusted Assertions](../nips/identity/nip-85.md)
- [strfry relay](https://github.com/hoytech/strfry) -- Write policy plugin architecture
- [khatru relay framework](https://github.com/fiatjaf/khatru) -- Go relay with event hooks
- [wot-relay](https://github.com/bitvora/wot-relay) -- Web of Trust relay implementation

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions.*
