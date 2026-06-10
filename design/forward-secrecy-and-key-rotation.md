# V2 Design & Execution Plan — Forward Secrecy and Key Rotation

> **Status: Design proposal (V2). Resolves OQ-002 (forward secrecy) and OQ-015 / OQ-009 (key rotation & history). Not yet ratified — this is the plan to take them from "documented limitation" to "shipped, reviewed protocol."**

## Context

The V1 protocol deliberately accepted two limitations (threat-model "What We Do NOT Protect"):

1. **No forward secrecy.** NIP-44 uses *static* ECDH — `ECDH(sender_longterm, recipient_longterm)`. If a recipient's long-term key is ever compromised, **every past message** to that key is decryptable. There is no per-message key erasure and no post-compromise healing.
2. **No key rotation.** A user's Nostr identity key *is* their address. There is no protocol to prove that a new key is "the same person," to migrate mail history, or to make contacts and relays follow the change.

Both are acceptable for V1 but are real gaps for a substrate meant to be SMTP-class and long-lived. This document is the design and the phased plan to close them. It is intentionally honest about what is and isn't achievable in an asynchronous, store-and-forward, multi-device, relay-mediated model.

These two features compose: forward secrecy bounds the damage of a key compromise *going forward in time*; key rotation lets a user *recover* from compromise and practice key hygiene. Together they move the protocol from "one key compromise is catastrophic and permanent" to "compromise is bounded and recoverable."

---

## Part 1 — Forward Secrecy (OQ-002)

### The core difficulty

Forward secrecy normally requires fresh, ephemeral key agreement per session (TLS) or per message (Signal Double Ratchet). Those assume the parties are online together or at least ping-pong. Nostr Mail is **async**: the recipient is usually offline when a message is sent. This is exactly the problem Signal solved with **X3DH + prekeys**: the recipient *pre-publishes* key material so a sender can establish a forward-secret session without the recipient being online.

### Recommended approach: X3DH prekey bundles + symmetric ratchet within threads

A pragmatic adaptation of the Signal async model, scoped so V2 is shippable. Full Double-Ratchet post-compromise security (PCS) is deferred to a later phase.

**Recipient publishes (as Nostr events):**
- **Identity key (IK)** — the user's long-term key (their existing Nostr pubkey, or a dedicated FS identity key cross-signed by it).
- **Signed prekey (SPK)** — a medium-term key, rotated on a schedule (e.g. weekly), signed by IK. Replaceable event.
- **One-time prekeys (OPK)** — a replenished batch of single-use keys. A list event the client tops up.

**Sender, to send a forward-secret message:**
1. Fetch the recipient's `{IK, SPK, OPK_i}` bundle from relays.
2. Run X3DH: `SK = KDF( DH(EK, IK) ‖ DH(IK_s, SPK) ‖ DH(EK, SPK) ‖ DH(EK, OPK_i) )` where `EK` is a fresh sender ephemeral. Delete `EK` after use.
3. Seed a per-thread session from `SK`; derive a message key via a **symmetric KDF ratchet** (one chain step per message). Each message key is deleted after encrypting/decrypting.
4. The new FS ciphertext replaces the NIP-44 rumor encryption *inside* the existing NIP-59 gift wrap — so sender anonymity (ephemeral outer key) and metadata protection are unchanged. FS is a new **inner** encryption mode.

**Forward secrecy comes from:** the sender ephemeral `EK` and the one-time prekey `OPK_i` being deleted after use, plus each ratchet message key being erased after use. A future compromise of `IK`/`SPK` cannot recover already-deleted message keys.

### Hard problems and how this design handles them

| Problem | Resolution |
|---|---|
| **One-time prekey consumption needs server state** (relays have no atomic "take one") | Sender picks an OPK pseudo-randomly and records which index it used. Two senders may collide and reuse an OPK; this degrades that message's FS to the *signed-prekey* level (exactly Signal's documented fallback), not to zero. Recipient replenishes OPKs proactively. |
| **Multi-device** (recipient's devices each need the prekey privkeys) | Two options, decided in Phase 0: (a) devices share SPK/OPK private keys via the user's existing encrypted self-sync channel (kind 30099-style, self-encrypted); or (b) each device publishes its *own* bundle and senders wrap per-device (O(devices), same shape as today's multi-recipient). Recommend (a) for UX, (b) as fallback. |
| **No published bundle / sender without FS support** | Capability negotiation: a `["fs", "x3dh-v1"]` tag advertises support. Absent bundle or absent capability ⇒ fall back to V1 static-ECDH. FS is opt-in and gracefully degrading, never a hard break. |
| **One-way threads can't DH-ratchet** | V2 uses a *symmetric* KDF ratchet (per-message FS) which works one-way. A *DH* ratchet (adds post-compromise security) requires ping-pong and is deferred to V2.x for reply threads. |
| **Interaction with deniability** (V1 rumor is unsigned) | FS session binding must not silently reintroduce non-repudiation. Keep the rumor unsigned; bind the session to identities via the seal signature layer only, as today. |

### What V2 forward secrecy does NOT give (documented)
- **No post-compromise security** in the one-way case (no DH ratchet yet) — a compromise of live session state exposes future messages until the next session/prekey refresh. PCS is a later phase.
- FS for **bridged** (SMTP) mail is impossible — the bridge terminates encryption. Unchanged; documented.

---

## Part 2 — Key Rotation (OQ-015) + History (OQ-009)

### The honest threat model first

Rotation must distinguish two cases, because they have very different achievability:

- **Voluntary / proactive rotation** (key hygiene, periodic rotation, device change): *fully solvable.*
- **Compromise recovery** (the old key is in an attacker's hands): *fundamentally limited* — whoever holds the old key can also sign a rotation to a key *they* control. This cannot be solved by signatures from the old key alone. It requires a **pre-committed recovery mechanism** established *before* compromise (a recovery key kept offline, or social/multi-sig recovery — ties into OQ-009). The plan states this limitation plainly rather than pretending rotation alone recovers from theft.

### Mechanism: bidirectional rotation attestation

1. **Rotation event:** the OLD key signs `["rotated-to", new_pubkey, timestamp]`; the NEW key counter-signs `["rotated-from", old_pubkey, timestamp]`. Bidirectional signatures prove both keys consented, preventing a third party from forging a rotation and preventing a stale new-key claim.
2. **Recovery binding (for compromise case):** optionally, the rotation is additionally authorized by a pre-registered **recovery key** (published, offline-held) or an M-of-N social-recovery set. Without this, a stolen old key can rotate; with it, the legitimate owner can out-rotate an attacker. This is the crucial, honest part.
3. **Discovery / follow:** contacts' clients, on seeing a rotation event (and validating both signatures + recovery binding if present), update their address book from old→new. NIP-05 records SHOULD also be updated to point at the current key. Publish to multiple relays to resist eclipse/withholding.
4. **Inbox continuity:** publish a fresh kind-10050 inbox-relay list under the new key; the rotation event lets senders find the new inbox.

### Mail history (OQ-009)

Old mail is encrypted to the old key (and, post-FS, to deleted ephemeral/session keys). Two strategies, default (b):

- **(a) Re-encryption migration:** a client-side tool decrypts old mail with the old key and re-wraps to the new key. Complete but expensive (O(mailbox)) and impossible for FS messages whose keys are already erased.
- **(b) Archived read-only old key (default):** keep the old private key in the user's encrypted backup (NIP-49) for *reading* history; new mail uses the new key. Simple, no bulk re-encryption, and the only option for already-erased FS message keys.

---

## Phased execution plan

Each phase ends green and reviewed before the next — same rigor as the foundational audit.

### Phase 0 — Design ratification (this doc → decisions)
- Resolve the open choices: X3DH parameter set & KDF; symmetric-only vs add DH ratchet now; multi-device key-sharing (a) vs (b); recovery-key requirement for compromise rotation.
- Reserve new event kinds (prekey bundle, one-time prekeys, rotation attestation, recovery-key registration) and tag formats.
- Update `threat-model.md` with FS and rotation scenarios (including the compromise-rotation limitation).

### Phase 1 — Spec (NIP amendments + vectors)
- Write the NIP sections: bundle/prekey/rotation event schemas, X3DH derivation, ratchet, capability negotiation, fallback rules, history handling.
- New canonical **test vectors** with real keys: X3DH derivation, ratchet steps, prekey-collision fallback, rotation-attestation create/verify, recovery-bound rotation.
- Decision-log entries (DEC-0xx) per ratified choice.

### Phase 2 — Crypto core (libs, TS + Go in lockstep)
- Implement X3DH + symmetric ratchet behind a `fs` capability flag; prekey publish/fetch/consume/replenish; rotation create/verify/follow; recovery-key registration.
- **Differential harness** (TS↔Go must agree bit-for-bit on derivations) + **fuzzing** of bundle/rotation parsers + property tests for ratchet erasure.
- Reuse the existing gift-wrap (NIP-59) outer layer unchanged; FS is the new inner mode.

### Phase 3 — Client + bridge
- Client: prekey lifecycle + UX (background replenish), rotation flow with explicit warnings about the compromise limitation, archived-old-key history reading, recovery-key setup.
- Bridge: FS for native paths; document that bridged SMTP cannot be forward-secret.

### Phase 4 — Adversarial review + interop
- Re-run the audit playbook on the new surface: FS under prekey reuse/exhaustion; rotation under a stolen old key (must fail to recover without the recovery binding, succeed with it); eclipse/withholding of rotation events; multi-device key-sync compromise.
- Cross-implementation interop vectors; sign-off + residual-risk doc.

---

## Sequencing recommendation

Ship **key rotation first** (Part 2): it is lower cryptographic complexity, immediately valuable (key hygiene + recovery), and forward secrecy's prekey rotation reuses the same "publish/rotate medium-term key material" plumbing. Then layer **forward secrecy** (Part 1) on top. Each is independently shippable behind a capability flag with graceful V1 fallback, so neither is a flag-day break.

## Out of scope (later than V2)
- Full Double-Ratchet post-compromise security for reply threads (V2.x).
- Group/mailing-list forward secrecy (interacts with OQ-006 O(n) wrapping).
- Hardware-token-backed recovery keys (UX track).
