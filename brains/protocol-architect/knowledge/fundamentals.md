# Protocol Architect Fundamentals

## Protocol Design Principles

### Postel's Law (The Robustness Principle)

> "Be liberal in what you accept, and conservative in what you send."
> — Jon Postel, RFC 761 (1980)

**Application to NOSTR Mail:**
- **Conservative sending:** A NOSTR Mail client MUST produce strictly conformant events. Kind 15 events must have exactly the specified tags, the content must be properly encrypted, gift wrapping must follow NIP-59 precisely.
- **Liberal receiving:** A NOSTR Mail client SHOULD accept events that are slightly non-conformant. Unknown tags should be ignored. Missing optional fields should be handled gracefully. Future extensions should not break existing parsers.

**The tension:** Postel's Law can lead to "implementation-defined behavior" where different clients interpret ambiguous input differently. NOSTR Mail should minimize ambiguity by being precise in the specification, while still tolerating minor deviations in received events.

**Practical rules:**
- Unknown tags: ignore (do not error)
- Unknown fields in content JSON: ignore (do not error)
- Missing optional fields: use default values (document the defaults)
- Malformed events: reject at the protocol level (invalid signature, wrong kind), tolerate at the application level (missing subject line)

### End-to-End Principle

> "The function in question can completely and correctly be implemented only with the knowledge and help of the application standing at the end points of the communication system."
> — Saltzer, Reed, Clark (1984)

**Application to NOSTR Mail:**
- **Encryption is end-to-end:** Relays never see plaintext. Only sender and recipient can decrypt. No "relay-side" decryption, scanning, or filtering of content.
- **Authentication is end-to-end:** Message authenticity is verified by the recipient using the sender's public key. Relays do not vouch for message authenticity.
- **Spam filtering is at the edges:** Relays can enforce coarse policies (require postage, require NIP-05), but fine-grained spam detection happens at the client.
- **Search is at the edges:** Encrypted content cannot be indexed by relays. Search is a client-side operation over decrypted local data.

**Corollary:** The relay should be as simple as possible. A relay is a "dumb pipe" that stores and forwards encrypted blobs. Intelligence belongs in the client.

### Robustness Through Simplicity

> "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."
> — Antoine de Saint-Exupery

**Application to NOSTR Mail:**
- Every feature added to the core protocol is a feature that every implementation must support
- A feature that only 10% of users need should not be in the core — it should be an extension
- The core protocol should be implementable in a weekend by a competent developer
- Fewer moving parts mean fewer failure modes, fewer security vulnerabilities, fewer interop issues

**Decision framework for feature inclusion:**
1. Can a basic client work without this feature? If yes, it is not core.
2. Does this feature require relay changes? If yes, very high bar for inclusion.
3. Does this feature add a new kind? Acceptable — kinds are cheap.
4. Does this feature change an existing kind? Very high bar — breaking change.
5. Does this feature add a new tag? Acceptable — tags are cheap and ignorable.

### Extensibility Through Ignorance

NOSTR's core design enables extension without coordination:
- **Unknown tags are ignored:** A client that doesn't understand a tag simply skips it. This means new tags can be added without breaking old clients.
- **Unknown kinds are stored:** A relay stores events of any kind, even kinds it doesn't understand. This means new event types can be deployed without relay upgrades.
- **Unknown fields are ignored:** JSON parsing should discard unknown fields rather than erroring.

**This is the most important architectural property of NOSTR.** It enables permissionless innovation: anyone can propose a new kind or tag and deploy it without coordinating with relay operators or other client developers.

**NOSTR Mail should preserve this property:**
- New NOSTR Mail features should use new tags (not overload existing ones)
- Optional features should be detectable by the presence of specific tags
- Clients should gracefully degrade when encountering unknown features

### Minimal Mandatory Surface

The less you require, the more implementations you get.

**NOSTR Mail minimum viable implementation:**
- Send a kind 15 event with encrypted content (NIP-44 + NIP-59)
- Receive and decrypt kind 15 events
- That's it. Everything else is optional.

**Optional layers (in order of importance):**
1. NIP-05 address resolution (nice to have, not required — can use raw pubkeys)
2. Threading (reply-to via `e` tags — nice to have, not required)
3. Attachments (Blossom — nice to have, not required)
4. Cashu postage (spam prevention — nice to have, not required)
5. L402 relay payment (relay-specific, not protocol-level)
6. Read receipts (ephemeral events — nice to have, not required)
7. Typing indicators (ephemeral — nice to have, not required)

### Wire Format Stability

Once the wire format is deployed, it cannot change without versioning. This is the hardest constraint in protocol design.

**Rules:**
- The event structure (id, pubkey, created_at, kind, tags, content, sig) is immutable — it is NIP-01
- The encrypted content format within kind 15 events must be stable once deployed
- New fields can be added (ignored by old clients) but existing fields cannot change meaning
- Tag names and semantics, once defined, cannot be changed (only deprecated)

**Versioning the content format:**
- Include a version indicator in the encrypted content (e.g., `"v": 1`)
- Future versions can change the content structure
- Clients should handle unknown versions gracefully (show "unsupported message version" rather than crashing)

---

## Protocol Layering

### Clean Separation Between Layers

NOSTR Mail is an application layer built on top of the NOSTR protocol layer:

```
┌─────────────────────────────┐
│   NOSTR Mail Application    │  Kind 15, threading, postage, attachments
├─────────────────────────────┤
│   NOSTR Messaging Layer     │  NIP-17 concepts, NIP-44, NIP-59
├─────────────────────────────┤
│   NOSTR Protocol Layer      │  NIP-01 events, relays, subscriptions
├─────────────────────────────┤
│   Transport Layer           │  WebSocket, TCP
└─────────────────────────────┘
```

**Each layer should be independently replaceable:**
- NOSTR Mail does not depend on specific relay software — any NIP-01 compliant relay works
- NOSTR Mail does not depend on specific encryption — if NIP-44 is superseded, only the messaging layer changes
- NOSTR Mail does not depend on specific transport — if WebSocket is replaced, only the transport layer changes

### Don't Leak Abstractions

Higher layers should not need to know lower-layer details.

**Good:**
```typescript
await mail.send({ to: 'bob@example.com', subject: 'Hello', body: 'World' })
// The developer does not need to know about:
// - NIP-44 encryption parameters
// - NIP-59 gift wrap structure
// - WebSocket frame format
// - Relay OK/NOTICE messages
```

**Bad:**
```typescript
await mail.send({
  to: 'bob@example.com',
  subject: 'Hello',
  body: 'World',
  nip44Version: 2,           // Leaks encryption layer
  giftWrapKind: 1059,        // Leaks protocol layer
  relayTimeout: 5000,        // Leaks transport layer
})
```

**Exception:** Power users and library developers need access to lower layers. Provide it through separate APIs, not by leaking internals into the high-level API.

---

## Extension Mechanisms

### The NIP Model

NIPs (Nostr Implementation Possibilities) are NOSTR's extension mechanism. They are:
- **Optional:** No NIP is mandatory except NIP-01
- **Numbered:** Sequential, with categories (messaging, payments, metadata, etc.)
- **Community-driven:** Anyone can propose a NIP; adoption is by implementer choice
- **Loosely coupled:** Most NIPs can be implemented independently

**Strengths:**
- Low barrier to proposing new features
- No central authority gatekeeping extensions
- Implementations can adopt NIPs incrementally
- Failed experiments can be deprecated without breaking the core

**Weaknesses:**
- No formal versioning — NIP text can change after implementations ship
- "Optional" NIPs can become de facto mandatory (NIP-65 relay lists)
- Conflicting NIPs can emerge (NIP-04 vs NIP-44 for encryption)
- No interoperability testing framework

### Tag-Based Extension

Adding new tags to existing event kinds is the lightest-weight extension mechanism.

**Properties:**
- Backward compatible: old clients ignore unknown tags
- No relay changes needed: relays store all tags regardless
- Discoverable: clients can query for events with specific tags
- Composable: multiple tag-based extensions can coexist on the same event

**Example — adding "priority" to NOSTR Mail:**
```json
{
  "kind": 15,
  "tags": [
    ["p", "<recipient-pubkey>"],
    ["subject", "Urgent: Server Down"],
    ["priority", "high"]
  ],
  "content": "<encrypted>"
}
```

Old clients: ignore the `priority` tag, show the message normally.
New clients: display a priority indicator.

### Kind-Based Extension

New event kinds are the mechanism for fundamentally new functionality.

**Properties:**
- Forward compatible: relays store events of any kind
- Clean namespace: each kind has its own semantics, no conflicts
- Discoverable: clients can subscribe to specific kinds
- Independent: new kinds do not affect existing kinds

**When to use a new kind vs a new tag:**
- New kind: fundamentally different behavior (e.g., read receipt vs message)
- New tag: additional metadata on an existing behavior (e.g., priority on a message)

### The Danger Zone: "Optional" Becomes Mandatory

A protocol extension starts as optional. Over time, if enough clients implement it and enough users expect it, it becomes de facto mandatory. This creates two problems:

1. **New implementations face a high bar:** They must implement many "optional" features to be competitive
2. **The core becomes ambiguous:** Is it NIP-01, or NIP-01 + the 20 most popular NIPs?

**NOSTR Mail should resist this by:**
- Keeping the core spec minimal (send, receive, encrypt)
- Documenting a clear "compliance levels" (Basic, Standard, Full)
- Ensuring Basic level is genuinely useful without any extensions

---

## Versioning Strategies

### No Versioning (NOSTR's Current Approach)

NOSTR has no version field in events. The protocol is simple enough that changes are made by:
- Adding new kinds (no conflict with existing kinds)
- Adding new tags (ignored by old clients)
- Deprecating old patterns (NIP-04 -> NIP-44)

**When this works:** Protocol is simple, changes are additive, old behavior remains valid.
**When this breaks:** A change is not purely additive (e.g., changing encryption algorithm).

### Feature Flags / Capability Advertisement

Advertise what features a client or relay supports, then negotiate per-connection.

**Relay capability example (NIP-11):**
```json
{
  "supported_nips": [1, 2, 9, 11, 15, 17, 42, 44, 59, 65],
  "nostr_mail": {
    "version": "1.0",
    "supports_postage": true,
    "supports_l402": true,
    "max_attachment_size": 10485760
  }
}
```

**Client capability example (event tag):**
```json
["client", "nostr-mail", "1.0", "postage,attachments,threads"]
```

**When to use:** When different implementations support different subsets of features and need to discover each other's capabilities.

### Clean Break

A new version is a new protocol. No backward compatibility.

**Example:** TLS 1.3 is not backward compatible with TLS 1.2. They are negotiated independently.

**When to use:** When the old protocol has fundamental flaws that cannot be fixed incrementally. Hopefully never needed for NOSTR Mail.

### Why Version Negotiation Is Dangerous

Version negotiation creates downgrade attack vectors:
- TLS downgrade attacks: MITM forces negotiation to weaker version
- In NOSTR Mail: attacker could force use of deprecated NIP-04 encryption if version negotiation exists

**Defense:** Do not support downgrade. The current version is the only version. If a breaking change is needed, use a new kind number (clean namespace separation).

---

## The Second System Effect

> "The general tendency is to over-design the second system, using all the ideas and frills that were cautiously sidetracked on the first system."
> — Fred Brooks, The Mythical Man-Month (1975)

**NOSTR Mail temptations to resist:**
- "Let's add folders and labels to the protocol" (client-side concern)
- "Let's add rich text / HTML formatting" (complexity explosion)
- "Let's add group chat" (different problem, different protocol)
- "Let's add video/voice calling" (different problem, different protocol)
- "Let's add a reputation system" (social layer, not messaging layer)
- "Let's add marketplace features" (different problem, NIP-15 exists)

**Decision rule:** If a feature can be implemented entirely in the client without any protocol changes, it should not be in the protocol. The protocol is for interoperability — the minimum shared understanding needed for two independent implementations to communicate.

**What belongs in the protocol:**
- Event structure and encryption (must agree to interoperate)
- Tag semantics (must agree to interpret correctly)
- Relay behavior requirements (must agree on storage/delivery semantics)

**What does NOT belong in the protocol:**
- UI decisions (folders, themes, notification preferences)
- Local storage format (SQLite schema, IndexedDB structure)
- Search indexing strategy
- Offline behavior
- Client-side spam heuristics
