# Protocol Architect References

## Foundational Papers and Dissertations

### "Architectural Styles and the Design of Network-based Software Architectures"
- **Author:** Roy Thomas Fielding
- **Year:** 2000
- **Type:** Doctoral dissertation, University of California, Irvine
- **URL:** https://www.ics.uci.edu/~fielding/pubs/dissertation/top.htm
- **Key contribution:** Defines REST (Representational State Transfer) as an architectural style. Introduces the concepts of resources, representations, and stateless client-server interaction.
- **Relevance to NOSTR Mail:** NOSTR events are resources identified by IDs. Relays are stateless servers. The RESTful principle of uniform interface (every event has the same structure) mirrors NIP-01's design. Fielding's constraint analysis methodology — evaluating architectural styles by their properties (scalability, simplicity, modifiability) — is directly applicable to evaluating NOSTR Mail design choices.

### "End-to-End Arguments in System Design"
- **Authors:** J.H. Saltzer, D.P. Reed, D.D. Clark
- **Year:** 1984
- **Published in:** ACM Transactions on Computer Systems, Vol. 2, No. 4
- **URL:** https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf
- **Key contribution:** Argues that functions placed at low levels of a system may be redundant or of little value when compared to the cost of providing them at that level. Application-level functions should be at the application endpoints.
- **Relevance to NOSTR Mail:** Encryption at the endpoints (client), not in the network (relay). Spam filtering at the endpoints (client), not by the relay. The relay is a dumb pipe. This paper is the theoretical foundation for NOSTR Mail's architecture.

### "The Design Philosophy of the DARPA Internet Protocols"
- **Author:** David D. Clark
- **Year:** 1988
- **Published in:** ACM SIGCOMM Computer Communication Review, Vol. 18, No. 4
- **URL:** https://groups.csail.mit.edu/ana/Publications/PubPDFs/The-design-philosophy-of-the-DARPA-internet-protocols.pdf
- **Key contribution:** Documents the design priorities of the Internet protocol suite, in order: (1) Internet communication must continue despite loss of networks or gateways, (2) support multiple types of communication service, (3) accommodate a variety of networks, (4) permit distributed management, (5) be cost effective, (6) allow host attachment with low effort, (7) be accountable.
- **Relevance to NOSTR Mail:** Priority ordering matters. NOSTR Mail's priorities should be explicit: (1) messages are delivered and readable, (2) messages are private, (3) system is spam-resistant, (4) system is decentralized. When priorities conflict, the ordering determines the resolution.

---

## RFCs (Architectural)

### RFC 1958 — "Architectural Principles of the Internet"
- **Authors:** B. Carpenter (editor)
- **Year:** 1996
- **URL:** https://www.rfc-editor.org/rfc/rfc1958
- **Key principles:**
  - "Be strict when sending and tolerant when receiving" (Postel's Law)
  - "Keep it simple" — complexity is the enemy of interoperability
  - "Make it extensible" — design for the features you cannot foresee
  - "Performance and cost must be considered as well as functionality"
- **Relevance:** These principles directly inform NOSTR Mail's protocol design. Every design decision should be evaluated against these principles.

### RFC 3439 — "Some Internet Architectural Guidelines and Philosophy"
- **Authors:** R. Bush, D. Meyer
- **Year:** 2002
- **URL:** https://www.rfc-editor.org/rfc/rfc3439
- **Key insight:** "In general, the community believes that the end-to-end argument is one of the key architectural guidelines of the Internet" and "one should be very careful about migrating functions from the endpoints to the middle of the network."
- **Relevance:** Reinforces the case for keeping relays simple and pushing intelligence to clients. Also discusses the tension between end-to-end principle and practical concerns (like NAT traversal and firewalls — analogous to NOSTR Mail's relay policies for spam prevention).

### RFC 5218 — "What Makes for a Successful Protocol?"
- **Authors:** D. Thaler, B. Aboba
- **Year:** 2008
- **URL:** https://www.rfc-editor.org/rfc/rfc5218
- **Key factors for success:**
  - Positive net value for early adopters (not just late adopters)
  - Low barriers to entry
  - Incremental deployability
  - Open specification
  - No single point of control
- **Relevance:** NOSTR Mail must provide value to early adopters even before network effects kick in. The SMTP bridge is the key enabler — a NOSTR Mail user can communicate with anyone who has an email address, providing immediate value.

---

## NOSTR Protocol References

### NIP-01 — "Basic Protocol Flow Description"
- **URL:** https://github.com/nostr-protocol/nips/blob/master/01.md
- **Status:** Final
- **Content:** Defines the event structure, relay-client WebSocket protocol, subscription filters, and basic event kinds.
- **Relevance:** The foundation on which NOSTR Mail is built. Every NOSTR Mail event is a NIP-01 event. Every NOSTR Mail relay is a NIP-01 relay. Understanding NIP-01 deeply is prerequisite to designing NOSTR Mail.

### NIP-17 — "Private Direct Messages"
- **URL:** https://github.com/nostr-protocol/nips/blob/master/17.md
- **Status:** Final (replaces NIP-04)
- **Content:** Defines kind 14 DMs using NIP-44 encryption and NIP-59 gift wrapping.
- **Relevance:** NIP-17 is the closest existing NIP to NOSTR Mail. NOSTR Mail (kind 15) extends NIP-17's model with email-specific features (subject, threading, attachments, postage). Understanding NIP-17's design decisions informs NOSTR Mail's design.

### NIP-44 — "Versioned Encryption"
- **URL:** https://github.com/nostr-protocol/nips/blob/master/44.md
- **Status:** Final
- **Content:** Defines encryption using secp256k1 ECDH, HKDF-SHA256 key derivation, and ChaCha20-Poly1305-IETF symmetric encryption with padding.
- **Relevance:** The encryption layer for NOSTR Mail message content.

### NIP-59 — "Gift Wrap"
- **URL:** https://github.com/nostr-protocol/nips/blob/master/59.md
- **Status:** Final
- **Content:** Defines a mechanism to wrap a signed event (the "rumor") inside an encrypted outer event, hiding the author and content from relays.
- **Relevance:** The metadata protection layer for NOSTR Mail. Gift wrapping ensures relays cannot see who sent a message.

### NIP-65 — "Relay List Metadata"
- **URL:** https://github.com/nostr-protocol/nips/blob/master/65.md
- **Status:** Final
- **Content:** Defines kind 10002 events that advertise a user's preferred relays (read relays and write relays).
- **Relevance:** Relay discovery for NOSTR Mail. To send a message to Bob, look up Bob's NIP-65 relay list and publish to his write relays.

### fiatjaf's NOSTR Design Rationale
- **URL:** https://fiatjaf.com/nostr.html
- **Author:** fiatjaf (NOSTR creator)
- **Content:** Explains why NOSTR was designed the way it is — why events, why relays, why no blockchain, why no DHT, why WebSocket, why JSON.
- **Relevance:** Understanding the original design intent prevents repeating rejected alternatives and helps maintain philosophical consistency.

---

## Protocol Design Literature

### "In Search of an Understandable Consensus Algorithm" (Raft Paper)
- **Authors:** Diego Ongaro, John Ousterhout
- **Year:** 2014
- **Published in:** USENIX Annual Technical Conference
- **URL:** https://raft.github.io/raft.pdf
- **Key contribution:** Presents the Raft consensus algorithm as an understandable alternative to Paxos.
- **Relevance to NOSTR Mail:** Primarily as a case study of when NOT to use consensus. NOSTR Mail does not need distributed consensus because:
  - Events are signed by their author (no dispute about who created them)
  - Relays are independent (no need to agree on global state)
  - LWW is sufficient for mutable state (no concurrent multi-writer conflict)
  - The lesson: resist the urge to add consensus mechanisms when simpler approaches suffice

### "Protocol Buffers vs JSON: Why NOSTR Chose JSON"
- **Context:** NOSTR uses JSON for all event encoding, despite Protocol Buffers (protobuf), MessagePack, CBOR, and other binary formats being more efficient.
- **Rationale (from fiatjaf and community discussions):**
  1. Human-readable: developers can inspect events with curl and jq
  2. Universal support: every programming language has a JSON parser
  3. No schema compilation: no protoc step, no code generation
  4. Debuggability: paste an event into a text editor and read it
  5. Good enough performance: for messaging (not video streaming), JSON overhead is negligible
- **Trade-off acknowledged:** JSON is larger than binary formats (typically 2-5x). For NOSTR Mail, this is acceptable — a 1KB JSON message vs a 300-byte protobuf message is irrelevant when the bottleneck is network latency, not bandwidth.
- **Relevance:** NOSTR Mail should use JSON for its content format (inside encryption) for the same reasons.

### XMPP Post-Mortem Analysis
- **Source:** Various community analyses; most cited: "XMPP: The Protocol That Lost" (multiple blog posts and conference talks)
- **Key failure modes:**
  1. **XEP fragmentation:** Hundreds of extensions, no mandatory subset beyond the minimal core. "XMPP-compatible" was meaningless.
  2. **Complexity barrier:** Implementing a competitive XMPP client required supporting dozens of XEPs. New developers gave up.
  3. **Federation cost:** Google Talk and Facebook Chat dropped XMPP federation because maintaining interoperability was too expensive.
  4. **Encryption chaos:** OTR, OMEMO, OpenPGP — three competing encryption standards, none mandatory. Most messages were unencrypted.
  5. **Mobile unfriendly:** XMPP's persistent connection model was designed for desktop clients; mobile push notifications were bolted on badly.
- **Lessons for NOSTR Mail:**
  - Define compliance levels (Basic, Standard, Full) with specific feature sets
  - Mandate encryption (no optional/competing standards)
  - Keep relay requirements minimal (do not repeat XMPP server complexity)
  - Design for mobile from the start (NOSTR's subscription model is already better than XMPP's persistent connections)

---

## Books

### "The Mythical Man-Month" — Frederick P. Brooks Jr. (1975, anniversary edition 1995)
- **Publisher:** Addison-Wesley
- **Key chapters:**
  - Chapter 5: "The Second-System Effect" — over-designing the next version
  - Chapter 7: "Why Did the Tower of Babel Fail?" — communication and organization in large projects
  - Chapter 16: "No Silver Bullet" — essential vs accidental complexity
- **Relevance:** The Second System Effect is the single biggest risk for NOSTR Mail protocol design. The temptation to add "just one more feature" must be resisted.

### "A Philosophy of Software Design" — John Ousterhout (2018)
- **Publisher:** Yaknyam Press
- **Key concepts:**
  - Deep modules: simple interface, complex implementation (good)
  - Shallow modules: complex interface, simple implementation (bad)
  - Information hiding: each module should encapsulate a design decision
  - Define errors out of existence: design APIs so that error cases do not arise
- **Relevance:** NOSTR Mail's SDK should be a "deep module" — simple API (`mail.send()`), complex implementation (encryption, relay selection, gift wrapping). The protocol should define errors out of existence where possible (e.g., mandatory encryption eliminates "sent unencrypted by mistake").

### "Designing Data-Intensive Applications" — Martin Kleppmann (2017)
- **Publisher:** O'Reilly
- **Key chapters:**
  - Chapter 5: "Replication" — leader-based, multi-leader, leaderless
  - Chapter 9: "Consistency and Consensus" — when you need it and when you don't
  - Chapter 12: "The Future of Data Systems" — unbundling, stream processing
- **Relevance:** NOSTR's relay model is "leaderless replication" — events can be published to any relay and replicated to others. Understanding the consistency trade-offs (eventual consistency, conflict resolution) informs NOSTR Mail's approach to mutable state.

---

## Additional References

### NOSTR Ecosystem Resources
- **Awesome Nostr:** https://github.com/aljazceru/awesome-nostr — comprehensive catalog of NOSTR projects
- **nostr.com:** https://nostr.com/ — official introduction and resources
- **NOSTR NIPs repository:** https://github.com/nostr-protocol/nips — all NIP specifications
- **nostr.watch:** https://nostr.watch/ — relay monitoring and statistics

### Cryptography References
- **NIP-44 Audit:** Independent security audit of the NIP-44 encryption specification
- **BIP-340:** Schnorr signatures for secp256k1 — https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
- **RFC 8439:** ChaCha20 and Poly1305 for IETF Protocols — https://www.rfc-editor.org/rfc/rfc8439
- **RFC 5869:** HMAC-based Extract-and-Expand Key Derivation Function (HKDF) — https://www.rfc-editor.org/rfc/rfc5869

### Email Protocol References (For Bridge Design)
- **RFC 5321:** Simple Mail Transfer Protocol (SMTP) — https://www.rfc-editor.org/rfc/rfc5321
- **RFC 5322:** Internet Message Format — https://www.rfc-editor.org/rfc/rfc5322
- **RFC 8551:** S/MIME 4.0 — https://www.rfc-editor.org/rfc/rfc8551
- **RFC 4880:** OpenPGP Message Format — https://www.rfc-editor.org/rfc/rfc4880
- **RFC 6376:** DomainKeys Identified Mail (DKIM) — https://www.rfc-editor.org/rfc/rfc6376
- **RFC 7208:** Sender Policy Framework (SPF) — https://www.rfc-editor.org/rfc/rfc7208
- **RFC 7489:** DMARC — https://www.rfc-editor.org/rfc/rfc7489
