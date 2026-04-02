# H3.5 / H3.6 / H3.7 — Tags, DPIA, and Documentation Audit

Date: 2026-04-01
Auditor: Claude Opus 4.6 (automated)
Scope: Tag collision check, GDPR DPIA, documentation completeness

---

## H3.5: Full Tag and Convention Collision Check

### Methodology

Every tag name used by NOSTR Mail was checked against the standardized tag
table published in the canonical NIP README at
`https://github.com/nostr-protocol/nips/blob/master/README.md`. NIP-10 and
NIP-7D were read in full to check for `reply`/`thread` naming conflicts.

### Tag-by-Tag Analysis

#### Standard Tags (Reused from Existing NIPs)

| Tag | NIP Origin | NOSTR Mail Usage | Verdict |
|-----|-----------|-----------------|---------|
| `p` | NIP-01 | Extended with index-3 role marker (`to`/`cc`/`bcc`) | **COMPATIBLE.** NIP-01 defines `["p", pubkey, relay-hint]`. Adding index 3 is additive and does not conflict. NIP-02 and NIP-22 also extend `p` with additional positional elements. |
| `subject` | NIP-14, NIP-17 | Mail subject line | **COMPATIBLE.** Exact semantic match. NIP-14 defines `["subject", text]` for subject lines on events. NIP-17 DMs also use it. |
| `d` | NIP-01 | Addressable event identifier on kinds 10099 and 30016 | **COMPATIBLE.** Standard NIP-01 usage for replaceable and addressable events. Kind 10099 is replaceable (no `d` tag needed -- it is keyed by kind+pubkey). Kind 30016 is addressable and correctly uses `d` for draft identity. |
| `e` | NIP-01, NIP-10 | Used in kind 1401 receipts to reference a gift-wrap event ID | **COMPATIBLE.** Standard event reference usage. |
| `status` | NIP-69 (`s` tag) | Used in kind 1401 as `["status", "delivered"|"read"]` | **LOW RISK.** NIP-69 defines an `s` tag (not `status`). The full-word `status` tag is not in the standardized table. No collision. |

#### Novel Tags (Introduced by NOSTR Mail)

| Tag | In NIP Registry? | Collision Risk | Verdict |
|-----|-----------------|----------------|---------|
| `reply` | No | **MEDIUM** | Not in the standardized tag table. However, NIP-10 uses `"reply"` as a **marker value** within `e` tags (e.g., `["e", id, relay, "reply"]`). This creates a semantic overlap: NIP-10 `reply` is a marker at index 3 of an `e` tag, while NOSTR Mail `reply` is a standalone tag name. No structural collision, but **the shared terminology may confuse implementers**. See recommendation below. |
| `thread` | No | **MEDIUM** | Not in the standardized tag table. NIP-7D defines "Thread" as a kind-11 event concept and uses the word conceptually, but does not define a `thread` tag. NIP-10 uses `"root"` as the corresponding marker for thread roots. Again, no structural collision, but **implementers familiar with NIP-10 may expect `e`-tag-based threading**. See recommendation below. |
| `message-id` | No | **NONE** | Not used in the NIP spec (only appears in the bridge source code as an SMTP header field name, not a NOSTR tag). No collision. |
| `attachment` | No | **NONE** | Not in the standardized tag table. NIP-94 file metadata uses tags like `url`, `m`, `x`, `size`, `dim` etc. -- no overlap with `attachment`. |
| `attachment-key` | No | **NONE** | Novel tag. No collision. |
| `blossom` | No | **NONE** | Not in the standardized tag table. NIP-B7 (Blossom) itself does not define a tag with this name in the NIP registry. |
| `cashu` | No | **NONE** | Novel tag for ecash tokens. No collision. |
| `cashu-mint` | No | **NONE** | Novel tag. No collision. |
| `cashu-amount` | No | **NONE** | Novel tag. No collision. |
| `content-type` | No | **LOW** | Not in the standardized tag table. Distinct from `content-warning` (NIP-36). The name follows MIME convention and is self-documenting. However, if a future NIP introduces a general `content-type` tag, it could collide. |
| `inline` | No | **NONE** | Novel tag for inline image references. No collision. |
| `refund` | No | **N/A** | Not used in the NIP spec. Appears only as an internal code concept in `cashu.ts`. Not a protocol-level tag. |
| `receipt-request` | No | **N/A** | Not in the NIP spec. Appears only in `nostr-mail-spec/design/message-format.md` (design doc). Not a protocol-level tag. |
| `bridged-from` | No | **NONE** | Used only by the bridge (`convert.ts`). Novel tag. No collision. |
| `bridged-auth` | No | **NONE** | Used only by the bridge (`convert.ts`). Novel tag. No collision. |
| `bridge` | No | **NONE** | Mentioned in the NIP spec's informational SMTP Bridge section. Novel tag. No collision. |
| `email-to` | No | **NONE** | Used by the bridge for outbound email routing. Novel tag. No collision. |

#### Mailbox State Tags (Kind 10099)

| Tag | In NIP Registry? | Collision Risk | Verdict |
|-----|-----------------|----------------|---------|
| `read` | No | **NONE** | Novel tag inside an encrypted replaceable event. Not visible to relays. No collision. |
| `flag` | No | **NONE** | Novel tag inside an encrypted replaceable event. No collision. |
| `folder` | No | **NONE** | Novel tag inside an encrypted replaceable event. No collision. |
| `deleted` | No | **LOW** | Novel tag. NIP-09 uses kind 5 deletion events with `e`/`a` tags, not a `deleted` tag. No structural collision, but semantic proximity to NIP-09 deletion warrants a note in the spec. |

### Findings

#### FINDING H3.5-1: `reply` and `thread` Tag Names Overlap with NIP-10 Marker Semantics [MEDIUM]

NIP-10 defines `"reply"` and `"root"` as marker values at index 3 of `e` tags.
NOSTR Mail uses `reply` and `thread` as standalone top-level tag names. While
there is no structural collision (NIP-10 markers live inside `e` tags; NOSTR
Mail tags are their own tag arrays), the shared vocabulary creates confusion:

- A developer reading `["reply", eventId, relay]` might assume it follows
  NIP-10 conventions and look for an `e` tag.
- NIP-10 uses `"root"` where NOSTR Mail uses `"thread"` for the same concept
  (thread root). This asymmetry adds cognitive load.

**Recommendation:** Add a brief note to the NIP spec explicitly distinguishing
NOSTR Mail's `reply`/`thread` tags from NIP-10's `e`-tag marker system. Example:

> Note: The `reply` and `thread` tags defined here are standalone tags specific
> to kind 1400 mail events. They are NOT related to NIP-10's `e`-tag markers
> (`"reply"`, `"root"`, `"mention"`), which apply to kind 1 short text notes.
> NOSTR Mail does not use NIP-10's `e`-tag threading model because mail events
> reference gift-wrap event IDs (kind 1059), not the inner rumor IDs.

**Severity:** Medium -- no breakage, but a documentation gap that will cause
implementer confusion.

#### FINDING H3.5-2: Event Kind Table Lists Kind 15 Instead of Kind 1400 [CRITICAL]

The NIP spec Event Kinds table (line 91 of `nip-xx-nostr-mail.md`) lists:

```
| 15 | Mail Message | Unsigned rumor containing mail content | Regular (via gift wrap) |
```

But the rest of the document, all implementations, all test vectors, and both
README files consistently use **kind 1400**. Kind 15 is already assigned in the
NIP registry as **"File Message"**.

This is a copy/paste error in the table. The text immediately below the table
(line 98) correctly says "Kind 1400 and kind 1401 events..."

**Recommendation:** Change `15` to `1400` in the Event Kinds table.

**Severity:** Critical -- the table contradicts the rest of the spec and claims
an already-assigned kind number.

#### FINDING H3.5-3: Receipt Kind Number Inconsistency [HIGH]

The NIP spec has three different kind numbers for mail receipts:

1. **Event Kinds table (line 92):** Kind **1401** ("Mail Receipt")
2. **Section heading (line 687):** "A kind **16** event is an unsigned rumor..."
3. **JSON example (line 708):** `"kind": **1112**`
4. **Client Behavior (lines 878, 884):** References "kind **16**"

Kind 16 is already assigned as **"Generic Repost"** in the NIP registry.
Kind 1112 is unassigned but adjacent to kind 1111 ("Comment").

**Recommendation:** Settle on kind **1401** (as declared in the table) and
fix all three inconsistent references. Update:
- Line 687: "A kind 1401 event..."
- Line 708: `"kind": 1401`
- Lines 834, 878, 884: "kind 1401"

**Severity:** High -- implementers will build incompatible receipt handling.

#### FINDING H3.5-4: Kind 30016 May Conflict with Marketplace Range [LOW]

Kind 30016 (Mail Draft) is unassigned in the NIP registry, but it sits in the
30015-30020 range which is heavily used by marketplace NIPs:
- 30015: Interest sets
- 30017: Stalls
- 30018: Products
- 30019: Marketplace UI/UX
- 30020: Auctions

The gap at 30016 appears intentional, and there is no actual collision today.
However, the marketplace clustering makes 30016 a surprising choice for mail
drafts.

**Recommendation:** Consider moving to a higher addressable kind (e.g., 30400)
to cluster with the 1400 mail kind. Not urgent since 30016 is currently free.

**Severity:** Low -- no collision exists, purely aesthetic/organizational.

#### FINDING H3.5-5: `d` Tag Not Needed on Kind 10099 [INFO]

Kind 10099 is a replaceable event (10000-19999 range). Per NIP-01, replaceable
events are identified by `(kind, pubkey)` -- the `d` tag is only required for
addressable events (30000-39999). The spec does not place a `d` tag on 10099,
which is correct. No issue.

### Summary Table

| Finding | Severity | Action Required |
|---------|----------|-----------------|
| H3.5-1: reply/thread vs NIP-10 | Medium | Add disambiguation note |
| H3.5-2: Kind 15 in table | Critical | Fix to 1400 |
| H3.5-3: Receipt kind inconsistency | High | Standardize on 1401 |
| H3.5-4: Kind 30016 in marketplace range | Low | Consider relocation |
| H3.5-5: d tag on 10099 | Info | No action needed |

---

## H3.6: Privacy Impact Assessment (GDPR DPIA)

### NOSTR Mail Protocol — Data Protection Impact Assessment

Prepared in accordance with GDPR Article 35 and WP29 Guidelines on DPIAs
(wp248rev.01).

### 1. Description of Processing

#### 1.1 Nature of Processing

NOSTR Mail transmits encrypted asynchronous messages between parties over a
network of independent relay servers using the NOSTR protocol. Messages are
end-to-end encrypted using NIP-44 (ChaCha20-Poly1305 via HKDF-derived keys)
and wrapped in three layers of encryption (NIP-59 Gift Wrap) before
publication to relays.

#### 1.2 Personal Data Inventory

| Data Element | Where It Appears | Encrypted? | Visible To |
|-------------|-----------------|------------|-----------|
| Sender public key | Rumor `pubkey` field | Yes (inside seal + wrap) | Recipient only |
| Recipient public key | Gift wrap `p` tag | **No** | Relays, network observers |
| Message content (body) | Rumor `content` field | Yes (inside seal + wrap) | Recipient only |
| Subject line | Rumor `subject` tag | Yes (inside seal + wrap) | Recipient only |
| File attachments | Blossom server (encrypted) | Yes (AES-256-GCM) | Blossom operator sees ciphertext |
| Timestamps | Rumor `created_at` | Yes (real time); Seal/Wrap `created_at` randomized | Relays see randomized times only |
| NIP-05 identifier | Kind 10097 spam policy, DNS lookup | Partially | DNS resolvers, relay operators (for kind 0 metadata) |
| Relay URLs | Kind 10050 relay list | **No** (public event) | Anyone |
| IP addresses | TCP connections to relays and Blossom servers | **No** (transport layer) | Relay operators, ISPs, network observers |
| Contact list (kind 3) | Public event | **No** | Anyone |
| Mailbox state (kind 10099) | Encrypted to self | Yes (NIP-44) | User only |
| Cashu tokens | Rumor `cashu` tag | Yes (inside seal + wrap) | Recipient only; mint sees redemption |
| Email addresses | Bridge `bridged-from` tag, `email-to` tag | Yes (inside seal + wrap) | Recipient and bridge operator |

#### 1.3 Data Subjects

- Message senders and recipients (identified by secp256k1 public keys)
- NIP-05 domain owners (DNS infrastructure operators)
- Email users interacting via SMTP bridge (identified by email address)

#### 1.4 Scale

The protocol is designed for person-to-person messaging. Volume depends on
adoption. Each message produces 1 gift wrap event per recipient plus 1 self-copy
(N+1 events for N recipients).

### 2. Necessity and Proportionality

| Data Element | Necessary? | Justification | Can We Minimize Further? |
|-------------|-----------|--------------|------------------------|
| Recipient pubkey in gift wrap `p` tag | **Yes** | Relays need this to route events to the correct subscriber. Without it, the recipient cannot discover their mail. | No. This is the minimum routing identifier. Relay-level AUTH (NIP-42) can restrict who queries by `p` tag, limiting enumeration. |
| Sender pubkey in rumor | **Yes** | Recipient must verify sender identity (authentication). | No. Already hidden from relays by encryption. |
| Message content | **Yes** | Core purpose of the protocol. | Already encrypted. |
| Timestamps | **Partially** | Real timestamps on rumors enable message ordering. Seal/wrap timestamps are randomized to prevent timing correlation. | Rumor timestamps could be rounded to reduce precision, but this would harm UX. Current approach (real rumor time, randomized outer times) is a reasonable balance. |
| NIP-05 identifier | **Optional** | Used for anti-spam tier 1. Not required for basic messaging. | Users can opt out of NIP-05 verification. |
| IP addresses | **Unavoidable** | TCP requires IP addresses. | Users can use Tor or VPN. The protocol itself does not mandate IP collection. |
| Contact list | **Optional** | Used for anti-spam tier 0. Not required for messaging. | Users choose whether to publish kind 3. |
| Relay URLs (kind 10050) | **Yes** | Senders need to know where to deliver mail. | Users choose which relays to list. Minimum: 1 relay. |
| Cashu tokens | **Optional** | Anti-spam mechanism for unknown senders. | Tokens are only included when needed (tier 3). P2PK prevents front-running. |

**Assessment:** Each data element serves a specific protocol function. The
encryption architecture minimizes exposure. The only plaintext metadata visible
to relays is the recipient's public key, which is the irreducible minimum for
a store-and-forward messaging system.

### 3. Risks to Data Subjects

| Risk | Likelihood | Impact | Overall |
|------|-----------|--------|---------|
| **R1: Relay compromise exposing recipient pubkeys** | Medium | Low | Medium |
| Relay operators can enumerate which pubkeys receive mail. This reveals communication patterns (who receives messages) but not sender identity or content. | | | |
| **R2: Metadata correlation / traffic analysis** | Medium | Medium | Medium |
| Timing, frequency, and size patterns on relays could be correlated to deanonymize communication pairs, especially with a small user base. Timestamp randomization mitigates but does not eliminate this. | | | |
| **R3: Key compromise (no forward secrecy)** | Low | Critical | High |
| NIP-44 uses static ECDH. If a private key is compromised, ALL past and future messages to/from that key can be decrypted. There is no ratchet or ephemeral key exchange for message-layer encryption. | | | |
| **R4: Blossom server logging** | Medium | Low | Low |
| Blossom operators can see which hashes are uploaded/downloaded and from which IPs. Files are encrypted, so content is protected. | | | |
| **R5: Cashu mint linkability** | Low | Low | Low |
| When a recipient redeems a Cashu token, the mint sees the redemption. If the mint logs transactions, it could correlate sender-recipient pairs (sender minted, recipient redeemed). P2PK mitigates front-running but not mint-level surveillance. | | | |
| **R6: NIP-05 DNS surveillance** | Low | Low | Low |
| DNS lookups for NIP-05 verification leak the queried domain to DNS resolvers. DNS-over-HTTPS mitigates this. | | | |
| **R7: Bridge operator as trusted intermediary** | High (if bridge used) | High | High |
| The SMTP bridge decrypts messages to convert between NOSTR and email. The bridge operator has access to plaintext content, sender/recipient identities, and email addresses. This is an inherent limitation of bridging to a non-E2EE protocol. | | | |
| **R8: Kind 10050 relay list reveals inbox location** | Medium | Low | Low |
| Anyone can read a user's kind 10050 event to discover their inbox relays. Combined with R1, this enables targeted surveillance of a specific user's incoming mail patterns. | | | |

### 4. Measures to Mitigate Risks

| Risk | Mitigation | Residual Risk |
|------|-----------|---------------|
| R1 | NIP-42 AUTH restricts relay queries to authorized pubkeys. Relays SHOULD enforce access control on kind 1059 events. | Low (if relays implement AUTH) |
| R2 | Timestamp randomization (+/- 2 days). Ephemeral keys per wrap. Users can spread across multiple relays. | Medium (timing analysis remains possible) |
| R3 | **No protocol-level mitigation.** Users requiring forward secrecy should use MLS-based protocols (NIP-EE) or Signal. Key rotation (generating new keys periodically) partially mitigates. | High |
| R4 | Files encrypted with AES-256-GCM before upload. Users can self-host Blossom servers. Tor/VPN for IP hiding. | Low |
| R5 | P2PK spending conditions. Users can use different mints. Cashu's blind signature scheme provides some unlinkability at the token level. | Low |
| R6 | DNS-over-HTTPS. NIP-05 is optional. | Negligible |
| R7 | Bridge is clearly marked with `bridged-from` and `bridged-auth` tags. Users are informed that E2E encryption terminates at the bridge. Use of DKIM/SPF/DMARC for email authentication. | High (inherent to bridging) |
| R8 | Users can use relays that require AUTH for kind 10050 queries. Users can use general-purpose relays to reduce targeting. | Low |

### 5. Data Controller/Processor Mapping

| Actor | GDPR Role | Rationale |
|-------|----------|-----------|
| **Message sender** | Data Controller | Determines the purpose (communication) and means (choosing recipient, content, relay). Decides to process recipient's pubkey. |
| **Message recipient** | Data Controller (of their own data) | Controls their relay list, spam policy, mailbox state. Decides whether to store, delete, or forward messages. |
| **Relay operator** | Data Processor | Stores and serves events on behalf of users. Does not determine the purpose of processing. Has limited visibility (only recipient pubkey and encrypted ciphertext). |
| **Blossom server operator** | Data Processor | Stores encrypted file blobs. Cannot determine purpose or access content. |
| **SMTP bridge operator** | Joint Controller or Processor | If the bridge operator determines which emails to bridge and how, they are a joint controller. If they merely operate infrastructure on behalf of users, they are a processor. This depends on the deployment model. A user-operated bridge is a processor; a third-party bridge service is likely a joint controller. |
| **Cashu mint operator** | Independent Controller | Operates independently. Processes token data for its own purposes (preventing double-spend). Not under the direction of sender or recipient. |
| **Client developer** | Neither | The client software is a tool. The developer does not process personal data unless the client phones home (which it MUST NOT do). |

### 6. Lawful Basis (GDPR Article 6)

| Processing Activity | Lawful Basis | Justification |
|---------------------|-------------|---------------|
| Sending a message (processing recipient pubkey) | **Art. 6(1)(f) Legitimate Interest** | The sender has a legitimate interest in communicating with the recipient. The recipient's pubkey is a pseudonymous identifier, not directly identifying. The anti-spam system provides the recipient with control over unsolicited messages. |
| Storing messages on relays | **Art. 6(1)(f) Legitimate Interest** | Relay operators have a legitimate interest in providing infrastructure. They process only pseudonymous identifiers and encrypted content. |
| Spam policy publication (kind 10097) | **Art. 6(1)(a) Consent** | The user voluntarily publishes their spam preferences. |
| NIP-05 verification | **Art. 6(1)(a) Consent** | The user voluntarily registers a NIP-05 identifier. |
| SMTP bridge processing | **Art. 6(1)(a) Consent** or **Art. 6(1)(b) Contract** | Users opt in to bridge services. If the bridge is a paid service, contractual basis applies. |
| Cashu token redemption | **Art. 6(1)(f) Legitimate Interest** | The recipient has a legitimate interest in redeeming payment attached to a message. The mint has a legitimate interest in preventing double-spend. |

**Note on Consent:** Pure consent (Art. 6(1)(a)) is fragile because it must be
freely given, specific, informed, and withdrawable. For relay storage, legitimate
interest is more appropriate because the processing is low-risk (pseudonymous
data, encrypted content) and withdrawal would break the messaging system.

### 7. Data Subject Rights

| Right | Protocol Support | Implementation |
|-------|-----------------|----------------|
| **Access (Art. 15)** | **Full.** Users can read all their own events from relays. Kind 10099 (mailbox state) is encrypted to self and fully accessible. Gift wraps are decryptable by the recipient. | Client provides "export all" function. |
| **Rectification (Art. 16)** | **Partial.** Replaceable events (kind 10097, 10099) can be updated by publishing a newer version. Sent messages cannot be rectified (immutable once wrapped). | Client can update profile, spam policy, mailbox state. |
| **Erasure (Art. 17)** | **Partial.** NIP-09 deletion requests (kind 5) ask relays to delete events. Relays SHOULD honor deletion requests but are not obligated. Users can also request deletion from specific relays via relay-specific APIs. | Client sends kind 5 deletion events. Cannot guarantee erasure across all relays. |
| **Restriction (Art. 18)** | **Partial.** Users can stop publishing to a relay (restricting future processing). Cannot restrict processing of already-stored events except via deletion. | User removes relay from kind 10050 list. |
| **Portability (Art. 20)** | **Full.** All events are JSON. Users can export their events from any relay and import to another. The data format is standardized and machine-readable. | Client provides JSON export. Events are relay-portable by design. |
| **Objection (Art. 21)** | **Full.** Users can object to receiving messages by not publishing relay lists, blocking senders, or configuring strict spam policies. | Client-side blocking. Spam policy (kind 10097) with `unknown-action: reject`. |
| **Automated decision-making (Art. 22)** | **N/A.** The anti-spam tier system is fully transparent and deterministic. Users configure their own thresholds. No opaque ML-based decisions. | Spam tiers are defined in the public spec. |

### 8. International Transfers

**Challenge:** NOSTR relays can be located in any jurisdiction worldwide. A
message sent from an EU user may be stored on relays in the US, Asia, or
anywhere else.

**Safeguards:**

1. **Encryption as a safeguard.** All message content is end-to-end encrypted.
   Relay operators in any jurisdiction see only the recipient's public key and
   ciphertext. Under the EDPB's Recommendations 01/2020 on supplementary
   measures, strong encryption where the data importer (relay) does not possess
   the decryption key is an effective supplementary measure.

2. **User control over relay selection.** Users choose their own relays via
   kind 10050 and kind 10002. An EU user can choose EU-based relays. The
   protocol does not mandate specific relays.

3. **Pseudonymous identifiers.** Public keys are pseudonymous. Without
   additional information (NIP-05, kind 0 metadata), a public key does not
   identify a natural person.

4. **No centralized data store.** There is no single entity that holds all
   data. Data is distributed across user-chosen relays, reducing concentration
   risk.

**Residual risk:** If a user publishes identifying metadata (kind 0 profile
with real name and photo), that metadata is public and unencrypted. Relay
operators worldwide can access it. Users should be informed that profile
metadata is public.

### DPIA Conclusion

The NOSTR Mail protocol presents a **moderate** overall privacy risk profile.
The strong encryption architecture (NIP-44 + NIP-59 three-layer gift wrap)
effectively protects message content and sender identity. The primary residual
risks are:

1. **Recipient pubkey exposure** on the gift wrap `p` tag (inherent to
   store-and-forward messaging).
2. **No forward secrecy** (inherent to NIP-44's static ECDH design).
3. **Bridge operator trust** (inherent to SMTP interoperability).

These risks are documented in the spec's Security Considerations section. No
processing should be blocked, but the following actions are recommended:

- **Action DPIA-1:** Add a user-facing privacy notice to the reference client
  explaining what metadata is visible to relays.
- **Action DPIA-2:** Document the bridge operator's GDPR obligations in the
  bridge README (data processing agreement template, logging policy).
- **Action DPIA-3:** Consider adding relay AUTH requirement language to the
  spec's Relay Behavior section to strengthen recipient metadata protection.
- **Action DPIA-4:** Add a note about forward secrecy limitations to the
  spec's Security Considerations with a pointer to NIP-EE for users who need it.

---

## H3.7: Documentation Completeness Check

### Repository README Audit

Each of the five shipping repos was checked for: API accuracy, function
documentation, cross-repo links, GitHub URL correctness, and stale text.

---

### nostr-mail-ts (TypeScript Reference Library)

**File:** `/Users/tommyexodus/nostr-mail/nostr-mail-ts/README.md`

#### FINDING H3.7-1: Quick Start Uses `NostrMail.init()` but API Has `new NostrMail()` [HIGH]

The README Quick Start (line 17) shows:

```typescript
const mail = NostrMail.init({ privateKey: 'your-hex-nsec' })
```

But the actual exported class (`src/index.ts` line 103) uses a standard
constructor:

```typescript
const mail = new NostrMail({ privateKey: 'hex-key' })
```

There is no `init()` static method on the `NostrMail` class.

**Recommendation:** Update README Quick Start to `new NostrMail(...)`.

#### FINDING H3.7-2: Quick Start Parameter Name Says "nsec" but Expects Hex [LOW]

Line 17: `privateKey: 'your-hex-nsec'`. An nsec is a bech32-encoded key
(NIP-19), but the actual API expects raw hex. The comment is misleading.

**Recommendation:** Change to `privateKey: 'your-hex-private-key'`.

#### FINDING H3.7-3: Quick Start `mail.send()` Signature Mismatch [MEDIUM]

The README shows:

```typescript
await mail.send({ to: 'bob@example.com', subject: '...', body: '...' })
```

But the actual `send()` method (line 145) accepts `SendOptions` with a `to`
field that expects a **hex public key or array of hex public keys**, not a
NIP-05 address. The README implies NIP-05 resolution is built into `send()`,
but it is not -- `address.ts` must be called separately.

**Recommendation:** Update example to use hex pubkeys, or add a note about
resolving NIP-05 first.

#### FINDING H3.7-4: `mail.inbox()` Async Iterator Does Not Exist [HIGH]

Lines 28-32 show:

```typescript
for await (const msg of mail.inbox()) { ... }
```

The `NostrMail` class does not have an `inbox()` method. There is no async
iterator for receiving messages. The actual API uses `receive(wrapEvent)` to
decrypt individual events.

**Recommendation:** Replace with a realistic example showing `receive()`.

#### FINDING H3.7-5: Public Functions Spot-Check [INFO]

| Function | Documented? | Exported? |
|----------|------------|----------|
| `createMailRumor()` | JSDoc: Yes | Yes |
| `parseMailRumor()` | JSDoc: Yes | Yes |
| `wrapMail()` | JSDoc: Yes | Yes |
| `evaluateSpamTier()` | JSDoc: Yes | Yes |
| `mergeStates()` | JSDoc: Yes | Yes |

All 5 spot-checked functions have JSDoc comments and are properly exported
from `index.ts`.

#### FINDING H3.7-6: Module Table Lists `mail.ts` as "Kind 1400" [INFO]

The module table correctly says "Kind 1400 event creation and parsing."
Consistent with implementation.

---

### nostr-mail-go (Go Implementation)

**File:** `/Users/tommyexodus/nostr-mail/nostr-mail-go/README.md`

#### FINDING H3.7-7: Import Path Mismatch with GitHub URL [MEDIUM]

The README shows:

```
go get github.com/nostr-mail/nostr-mail-go
```

The `go.mod` confirms this module path. However, the NIP README references
GitHub URLs under `github.com/luthen-seas/nostr-mail-go`. If the actual
GitHub repo is under `luthen-seas`, the `go get` command will fail because
Go resolves module paths via HTTPS.

**Recommendation:** Ensure `go.mod` module path matches the actual GitHub
hosting location, or set up a vanity import redirect.

#### FINDING H3.7-8: Go CreateRumor Omits cashu-mint and cashu-amount Tags [HIGH]

The Go `CreateRumor()` function (line 166-169) only emits the `["cashu", token]`
tag when postage is provided. It does NOT emit `["cashu-mint", url]` or
`["cashu-amount", sats]` tags, which the NIP spec requires alongside the
`cashu` tag and which the TypeScript implementation correctly emits.

This means Go-created mail with Cashu postage will be missing metadata that
recipients need for quick structural validation (Phase 1 of two-phase
validation).

**Recommendation:** Add cashu-mint and cashu-amount tag emission to
`CreateRumor()` in `pkg/mail/mail.go`.

#### FINDING H3.7-9: Go Default CashuMinSats = 10 vs NIP Spec Default = 1 [MEDIUM]

The Go `DefaultPolicy()` in `pkg/spam/spam.go` (line 49) sets
`CashuMinSats: 10`, but the NIP spec (line 569) defines the default as `1`:

```
| `cashu-min-sats` | `["cashu-min-sats", "<n>"]` | Minimum Cashu postage in sats (default: `"1"`) |
```

The TS implementation correctly uses `cashuMinSats: 1`.

**Recommendation:** Change Go default to `CashuMinSats: 1`.

#### FINDING H3.7-10: Public Functions Spot-Check [INFO]

| Function | Documented? | Exported? |
|----------|------------|----------|
| `mail.CreateRumor()` | GoDoc: Yes | Yes |
| `mail.ParseRumor()` | GoDoc: Yes | Yes |
| `wrap.SealAndWrap()` | GoDoc: Yes | Yes (checked) |
| `spam.Evaluate()` | GoDoc: Yes | Yes (checked) |
| `state.Merge()` | GoDoc: Yes | Yes (checked) |

All 5 spot-checked functions have GoDoc comments and are exported.

---

### nostr-mail-bridge (SMTP Bridge)

**File:** `/Users/tommyexodus/nostr-mail/nostr-mail-bridge/README.md`

#### FINDING H3.7-11: Bridge README References Kind 1400 Correctly [INFO]

The bridge README consistently references "kind 1400 rumor" throughout.
No kind number errors found.

#### FINDING H3.7-12: Bridge README Does Not Mention GDPR/Privacy Obligations [MEDIUM]

The bridge operator decrypts plaintext messages. The README has no mention of
data protection obligations, logging policy, or data retention. Given the
bridge is a trust boundary where E2EE terminates, this is a significant
documentation gap.

**Recommendation:** Add a "Privacy and Data Protection" section covering:
- What data the bridge accesses in plaintext
- Recommended logging policy (minimal, no message content)
- GDPR processor obligations if operating in the EU
- Data retention and deletion procedures

#### FINDING H3.7-13: Architecture Diagram Shows Kind 1059 Correctly [INFO]

Line 9: "Subscribe kind 1059" -- correct.

---

### nostr-mail-client (Reference Client)

**File:** `/Users/tommyexodus/nostr-mail/nostr-mail-client/README.md`

#### FINDING H3.7-14: Broken Cross-Repo Link to `../reference/` [HIGH]

Line 99:

> "see `../reference/`"

The directory `/Users/tommyexodus/nostr-mail/reference/` does not exist. The
reference library is at `../nostr-mail-ts/`. This is a broken relative link.

**Recommendation:** Change `../reference/` to `../nostr-mail-ts/`.

#### FINDING H3.7-15: Protocol Coverage Table Says "Kind 1400 mail rumors" Under NIP-17 [MEDIUM]

Line 37:

```
| NIP-17 | Private DMs | Kind 1400 mail rumors |
```

NIP-17 defines kind 14 (DMs), not kind 1400 (mail). The table implies NOSTR
Mail IS NIP-17, but it is a separate protocol built on the same encryption
infrastructure. This is misleading.

**Recommendation:** Change to:

```
| NIP-XX | NOSTR Mail | Kind 1400 mail messages |
| NIP-17 | Private DMs | Encryption model reused (NIP-59) |
```

---

### nostr-mail-nip (NIP Specification)

**File:** `/Users/tommyexodus/nostr-mail/nostr-mail-nip/README.md`

#### FINDING H3.7-16: GitHub URLs Use `luthen-seas` Organization [MEDIUM]

Lines 45-46:

```
| Reference | TypeScript | [nostr-mail-ts](https://github.com/luthen-seas/nostr-mail-ts) |
| Second | Go | [nostr-mail-go](https://github.com/luthen-seas/nostr-mail-go) |
```

The Go module path uses `github.com/nostr-mail/nostr-mail-go`. If the repos
are actually hosted under `luthen-seas`, these URLs may be correct but the Go
module path is wrong (or vice versa). One of them must be updated for
consistency.

**Recommendation:** Verify the actual GitHub organization and ensure module
paths and README URLs match.

#### FINDING H3.7-17: NIP Spec Lists 6 Event Kinds but NIP README Lists Only 6 [INFO]

The NIP README correctly lists all 6 event kinds (1400, 1401, 10050, 10097,
10099, 30016). Consistent with the spec.

---

### Summary of All Findings

| ID | Location | Severity | Description |
|----|----------|----------|-------------|
| H3.5-1 | NIP spec | Medium | reply/thread tag names overlap with NIP-10 marker semantics |
| H3.5-2 | NIP spec, line 91 | **Critical** | Event Kinds table says kind 15 instead of 1400 |
| H3.5-3 | NIP spec, lines 687/708/834/878/884 | **High** | Receipt kind number is 1401, 16, and 1112 in different places |
| H3.5-4 | NIP spec | Low | Kind 30016 sits in marketplace kind range |
| H3.5-5 | NIP spec | Info | d tag usage on 10099/30016 is correct |
| H3.6 | DPIA | -- | See 4 action items (DPIA-1 through DPIA-4) |
| H3.7-1 | nostr-mail-ts README | **High** | `NostrMail.init()` should be `new NostrMail()` |
| H3.7-2 | nostr-mail-ts README | Low | Parameter comment says "nsec" but expects hex |
| H3.7-3 | nostr-mail-ts README | Medium | `send()` example uses NIP-05 address instead of hex pubkey |
| H3.7-4 | nostr-mail-ts README | **High** | `mail.inbox()` async iterator does not exist in API |
| H3.7-5 | nostr-mail-ts | Info | All 5 spot-checked functions documented |
| H3.7-6 | nostr-mail-ts README | Info | Kind 1400 reference correct |
| H3.7-7 | nostr-mail-go README | Medium | Import path may not match GitHub org |
| H3.7-8 | nostr-mail-go code | **High** | CreateRumor omits cashu-mint and cashu-amount tags |
| H3.7-9 | nostr-mail-go code | Medium | Default CashuMinSats=10 vs spec default=1 |
| H3.7-10 | nostr-mail-go | Info | All 5 spot-checked functions documented |
| H3.7-11 | nostr-mail-bridge | Info | Kind numbers correct |
| H3.7-12 | nostr-mail-bridge | Medium | No GDPR/privacy section for bridge operators |
| H3.7-13 | nostr-mail-bridge | Info | Architecture diagram correct |
| H3.7-14 | nostr-mail-client | **High** | Broken `../reference/` link |
| H3.7-15 | nostr-mail-client | Medium | Protocol table misattributes kind 1400 to NIP-17 |
| H3.7-16 | nostr-mail-nip | Medium | GitHub URLs use luthen-seas, Go module uses nostr-mail |
| H3.7-17 | nostr-mail-nip | Info | Event kind list consistent |

### Critical/High Items Requiring Immediate Fix

1. **H3.5-2:** Fix kind 15 -> 1400 in NIP spec Event Kinds table
2. **H3.5-3:** Standardize receipt kind to 1401 across entire NIP spec
3. **H3.7-1:** Fix NostrMail.init() -> new NostrMail() in TS README
4. **H3.7-4:** Remove fictional inbox() async iterator from TS README
5. **H3.7-8:** Add cashu-mint and cashu-amount tags to Go CreateRumor()
6. **H3.7-14:** Fix broken ../reference/ link in client README

---

End of audit.
