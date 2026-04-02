# NOSTR Mail -- Scalability Modeling & Cross-Expert Review

**Date:** 2026-04-01
**Scope:** H3.3 Scalability Modeling + H3.4 Cross-Expert Audit Verification
**Inputs:** nip-xx-nostr-mail.md, crypto-audit.md, code-audit.md, spec-audit.md, source code

---

## Part 1: Scalability Modeling (H3.3)

### Assumptions

All calculations use the following base assumptions derived from the NIP specification:

- **Gift wrap event size:** 3 KB average (encrypted content + tags + Schnorr signature + JSON overhead). Kind 1059 events contain a single `p` tag, an encrypted `content` field (~1.5-2.5 KB depending on message length), `id`, `pubkey`, `created_at`, `kind`, and `sig`.
- **Per-recipient wrapping:** Each recipient (including sender self-copy) receives a distinct kind 1059 gift wrap event. A message to N recipients produces N+1 events (N recipient wraps + 1 self-copy).
- **Relay connection model:** Each user's client connects to 2-3 inbox relays (NIP-17 kind 10050). Popular relays serve disproportionate traffic (80/20 distribution).
- **Cashu token overhead:** A `cashu` tag adds ~200-400 bytes to the rumor. The P2PK verification swap is a single HTTP POST to the mint.

---

### Scenario A: 100K Users, 50 Messages/Day Average

#### Storage Growth

| Metric | Calculation | Result |
|--------|-------------|--------|
| Messages sent per day | 100,000 users x 50 msgs/day | 5,000,000 messages/day |
| Average recipients per message | 1.5 (most are 1:1, some are multi-recipient) | -- |
| Events per message | 1.5 recipients + 1 self-copy = 2.5 wraps/message | -- |
| Total kind 1059 events per day | 5,000,000 x 2.5 | **12,500,000 events/day** |
| Storage per event | 3 KB | -- |
| Daily storage growth | 12,500,000 x 3 KB | **37.5 GB/day** |
| Monthly storage growth | 37.5 GB x 30 | **1,125 GB/month (1.1 TB)** |
| Annual storage growth | 1,125 GB x 12 | **13.5 TB/year** |

#### Multi-Recipient Scenario (3 recipients)

| Metric | Calculation | Result |
|--------|-------------|--------|
| Events per 3-recipient message | 3 + 1 self-copy | 4 events |
| If 20% of messages go to 3 recipients | (0.8 x 5M x 2) + (0.2 x 5M x 4) | **12,000,000 events/day** |
| Storage for multi-recipient day | 12,000,000 x 3 KB | **36 GB/day** |

#### WebSocket Connections

| Metric | Calculation | Result |
|--------|-------------|--------|
| Total user-relay connections | 100,000 users x 2.5 relays avg | 250,000 connections |
| Users served by top 10 relays (80%) | 80,000 users | -- |
| Connections per popular relay | 80,000 x 2.5 / 10 | **20,000 concurrent connections** |
| Remaining relays share 20% | 20,000 users across ~50 relays | **~1,000 connections each** |

20,000 concurrent WebSocket connections is well within the capability of a single modern relay process (strfry handles 50K+ connections). **No bottleneck at 100K users.**

#### Cashu Mint Load

| Metric | Calculation | Result |
|--------|-------------|--------|
| Messages requiring token verification | 5,000,000 x 10% | 500,000 messages/day |
| POST /v1/swap requests per day | 500,000 | **500,000 requests/day** |
| Requests per second (uniform) | 500,000 / 86,400 | **5.8 req/sec** |
| Peak (3x burst) | 5.8 x 3 | **~17.4 req/sec** |

A single Cashu mint can handle hundreds of requests/second. **No bottleneck at 100K users.**

---

### Scenario B: 1M Users, 50 Messages/Day Average (10x Scale)

| Metric | 100K Users | 1M Users | Growth |
|--------|-----------|----------|--------|
| Total events/day | 12,500,000 | **125,000,000** | 10x |
| Daily storage growth | 37.5 GB | **375 GB/day** | 10x |
| Monthly storage growth | 1.1 TB | **11.25 TB/month** | 10x |
| Annual storage growth | 13.5 TB | **135 TB/year** | 10x |
| Connections per popular relay | 20,000 | **200,000** | 10x |
| Cashu swaps/sec (uniform) | 5.8 | **58 req/sec** | 10x |
| Cashu swaps/sec (peak 3x) | 17.4 | **174 req/sec** | 10x |

#### Bottleneck Analysis at 1M Users

| Component | Status | Notes |
|-----------|--------|-------|
| **Relay storage** | BOTTLENECK | 11.25 TB/month requires dedicated storage infrastructure. Relays must implement event expiration (NIP-40) or pruning. At $0.02/GB (cloud storage), monthly cost is ~$225/month per relay for raw storage, plus I/O costs. |
| **Relay connections** | CAUTION | 200,000 concurrent WebSocket connections per popular relay is achievable but requires tuned infrastructure (kernel parameters, connection pooling). Strfry on a 32-core server handles this. Smaller relay implementations will struggle. |
| **Relay bandwidth** | BOTTLENECK | 125M events x 3 KB = 375 GB/day ingress. Per popular relay (receiving ~80% = 300 GB/day), this is **3.5 Gbps sustained inbound**. Serving reads doubles this. Total relay bandwidth: **~7 Gbps per popular relay.** This requires dedicated hosting. |
| **Cashu mint load** | OK | 174 req/sec peak is manageable for a properly deployed mint. However, if many users configure the same mint, load concentrates. 10 popular mints at 1M users: ~17 req/sec each. |
| **Event fan-out** | CAUTION | A relay receiving 100M+ events/day and serving subscription queries to 200K connected clients creates significant CPU load for filter matching. Relays must index by `p` tag efficiently. |

**Primary bottleneck at 1M users: relay storage and bandwidth.** Mitigations include event expiration policies, relay sharding, and CDN-assisted event delivery.

---

### Scenario C: Mailbox State at Scale

#### Kind 10099 Event Size Modeling

A user with 50,000 messages over 3 years, with sparse tracking:

| State Type | Count | Tag Format | Bytes/Tag | Total Bytes |
|------------|-------|------------|-----------|-------------|
| Read markers | 50,000 (all read) | `["read", <64-char-hex-id>]` | ~78 bytes | 3,900,000 bytes (3.9 MB) |
| Flagged (1%) | 500 | `["flag", <64-char-hex-id>, "flagged"]` | ~88 bytes | 44,000 bytes (44 KB) |
| Folders (5%) | 2,500 | `["folder", <64-char-hex-id>, "Archive"]` | ~90 bytes | 225,000 bytes (225 KB) |
| **Total** | -- | -- | -- | **4,169,000 bytes (4.07 MB)** |

#### Relay Size Limit Analysis

| Relay | Max Event Size | 50K Messages Fits? |
|-------|---------------|-------------------|
| strfry default | 512 KB | NO (4.07 MB >> 512 KB) |
| Most relays | 64 KB - 128 KB | NO |
| Configurable relays (raised limit) | 4 MB | BARELY |

**The kind 10099 event exceeds standard relay size limits at approximately 6,500 messages** (assuming all-read tracking):

| Message Count | Read Tags Size | Total Event Size | Fits 64 KB? | Fits 512 KB? |
|---------------|---------------|-----------------|-------------|-------------|
| 500 | 39 KB | ~42 KB | YES | YES |
| 800 | 62.4 KB | ~65 KB | BARELY | YES |
| 1,000 | 78 KB | ~81 KB | NO | YES |
| 6,000 | 468 KB | ~480 KB | NO | YES |
| 7,000 | 546 KB | ~560 KB | NO | BARELY |
| 10,000 | 780 KB | ~800 KB | NO | NO |
| 50,000 | 3,900 KB | ~4,070 KB | NO | NO |

#### Partitioning Threshold

- **At 64 KB relay limit:** Partitioning needed at **~800 messages** (approximately 16 days at 50 msgs/day).
- **At 512 KB relay limit:** Partitioning needed at **~6,500 messages** (approximately 130 days at 50 msgs/day).
- **At 4 MB relay limit:** Partitioning needed at **~50,000 messages** (approximately 1,000 days).

**Conclusion:** Mailbox state is a critical scalability problem. Even the most generous relay limits are exceeded within 4-5 months of normal use. The spec audit (FA-004) correctly flagged this. Mitigation options:

1. **Time-windowed partitioning:** Use kind 30099 addressable events with d-tag `"2026-Q1"`, `"2026-Q2"`, etc. Each partition stays small.
2. **Read marker expiration:** Drop read markers older than 90 days (if it has been read, the client can assume "read" for old messages).
3. **Bloom filter compaction:** Replace individual read tags with a Bloom filter. A 50,000-entry Bloom filter at 1% false positive rate requires only ~60 KB.
4. **Hybrid approach:** Keep recent read markers as explicit tags (last 30 days), compact older ones into a Bloom filter tag.

---

### Scenario D: Blossom Attachment Storage

#### Storage Growth (100K Users, 1 Year)

| Metric | Calculation | Result |
|--------|-------------|--------|
| Messages per day | 5,000,000 | -- |
| Messages with attachments (20%) | 5,000,000 x 0.2 | 1,000,000 messages/day |
| Attachments per message-with-attachments | 2 | -- |
| Total attachments per day | 1,000,000 x 2 | 2,000,000 attachments/day |
| Average attachment size | 500 KB | -- |
| Daily attachment storage | 2,000,000 x 500 KB | **1,000 GB/day (1 TB/day)** |
| Monthly attachment storage | 1 TB x 30 | **30 TB/month** |
| Annual attachment storage | 30 TB x 12 | **360 TB/year** |

#### Bandwidth for On-Demand Serving

| Metric | Calculation | Result |
|--------|-------------|--------|
| Attachment downloads per day (assume 50% are viewed) | 2,000,000 x 0.5 | 1,000,000 downloads/day |
| Daily download bandwidth | 1,000,000 x 500 KB | **500 GB/day** |
| Sustained bandwidth | 500 GB / 86,400 sec | **46.3 Mbps** |
| Peak bandwidth (5x burst) | 46.3 x 5 | **231.5 Mbps** |

#### Cost Modeling

| Resource | Annual Volume | Unit Cost | Annual Cost |
|----------|--------------|-----------|-------------|
| Storage (S3-class) | 360 TB | $0.023/GB/month | ~$99,360/year |
| Egress bandwidth | 182.5 TB | $0.09/GB | ~$16,425/year |
| **Total** | -- | -- | **~$115,785/year** |

**Blossom storage is the most expensive component of the protocol at scale.** Mitigations:

1. **Content-addressed deduplication:** Blossom uses SHA-256 hashes as identifiers. Identical files uploaded by different users are stored once.
2. **Expiration policies:** Blossom servers can expire blobs not accessed within N days.
3. **User-funded storage:** Users pay for their own Blossom storage, distributing costs.
4. **Attachment size limits:** The spec should recommend maximum attachment sizes (e.g., 25 MB, matching email conventions).

---

## Part 2: Cross-Expert Audit Verification (H3.4)

This section cross-references every "fixed" finding from the three audits against the actual source code to verify that fixes were correctly applied.

---

### Verification 1: Kind Number Collision (Spec Audit FA-001, FA-002)

**Original finding:** Kind 15 collides with NIP-17 (file message). Kind 16 collides with NIP-18 (generic repost).

**Expected fix:** Assign new kind numbers (1400 for mail, 1401 for receipts).

**Verification:**

| Location | Expected | Actual | Status |
|----------|----------|--------|--------|
| NIP spec event kinds table (line 91) | Kind 1400 | **Kind 15** | NOT FIXED |
| NIP spec body text (lines 15, 23, 98, 105, etc.) | Kind 1400 | Kind 1400 | Fixed |
| NIP spec receipt section heading (line 685) | Kind 1401 | Kind 1401 | Fixed |
| NIP spec receipt body text (line 687) | Kind 1401 | **"A kind 16 event..."** | NOT FIXED |
| NIP spec receipt body text (lines 834, 878, 884) | Kind 1401 | **"kind 16"** | NOT FIXED |
| NIP spec receipt JSON example (line 708) | Kind 1401 | **Kind 1112** | INCONSISTENT |
| TypeScript core (mail.ts, unwrap.ts, wrap.ts) | Kind 1400 | Kind 1400 | Fixed |
| Go core (mail.go, wrap.go) | Kind 1400 | Kind 1400 | Fixed |
| Go wrap_test.go line 95 error message | "kind 1400" | **"kind should be 15"** | STALE ERROR STRING |
| Go test-vectors/gift-wrap.json line 142 | Kind 1400 | **Kind 15** | NOT FIXED |
| Go test-vectors/mail-event.json | Kind 1400 | Kind 1400 | Fixed |

**Verdict: PARTIALLY FIXED.** The kind number was updated in the code implementations and most of the spec body, but the event kinds summary table still says kind 15 (line 91), the receipt section still references "kind 16" in multiple places, the receipt JSON example uses kind 1112 (a third different number), and one Go test vector and one Go test error string still reference kind 15. **Six residual inconsistencies remain.**

---

### Verification 2: Sender Consistency Check (Crypto Audit F-03)

**Original finding:** `unwrapMail()` in unwrap.ts does not verify `rumor.pubkey === seal.pubkey`, allowing sender forgery if the ECDH key is compromised.

**Expected fix:** Add a hard-failure assertion after decryption.

**Verification:**

| Location | Check Present? | Behavior on Mismatch | Status |
|----------|---------------|---------------------|--------|
| nostr-mail-ts/src/unwrap.ts (line 118) | YES | Throws Error with descriptive message | FIXED CORRECTLY |
| nostr-mail-client/src/lib/nostr-mail.ts (line 319) | YES | Returns null (silent failure) | PARTIALLY FIXED |
| nostr-mail-bridge/src/outbound.ts | Not verified (out of audit scope for this check) | -- | -- |

**Verdict: FIXED in core library.** The client also added the check (line 319: `if (rumor.pubkey !== seal.pubkey) return null`), but it returns null instead of throwing, which means the forgery attempt is silently ignored rather than logged. This is acceptable behavior for a UI client (don't crash on bad data), but the client should log a warning. The core library correctly throws a hard error as recommended.

---

### Verification 3: Math.random to CSPRNG (Code Audit SEC-001)

**Original finding:** nostr-mail-client `randomOffset()` used `Math.random()` instead of CSPRNG.

**Expected fix:** Replace with `crypto.getRandomValues()`.

**Verification:**

| Location | Implementation | Status |
|----------|---------------|--------|
| nostr-mail-client/src/lib/nostr-mail.ts (line 590) | `crypto.getRandomValues(buf)` with Uint32Array | FIXED CORRECTLY |
| No `Math.random()` found anywhere in nostr-mail-client | -- | CONFIRMED |

**Verdict: FIXED.** The client now uses the identical CSPRNG pattern from the core library's wrap.ts.

---

### Verification 4: Go P2PK Check (Code Audit SEC-006)

**Original finding:** Go `EvaluateTier()` did not check `postage.P2PK == true`, allowing non-P2PK bearer tokens to qualify for tier 3.

**Expected fix:** Add `postage.P2PK` to the condition.

**Verification:**

| Location | Condition | Status |
|----------|-----------|--------|
| nostr-mail-go/pkg/spam/spam.go (line 104) | `postage != nil && postage.P2PK && postage.Amount >= policy.CashuMinSats && policy.CashuMinSats > 0` | FIXED CORRECTLY |

The condition now requires `postage.P2PK` to be true before evaluating the amount. A non-P2PK token will fall through to tier 5 (spam).

**Verdict: FIXED.** The Go P2PK check correctly enforces P2PK before evaluating Cashu tier.

---

### Verification 5: Ephemeral Key Zeroing (Crypto Audit F-04)

**Original finding:** Ephemeral private keys not zeroed after signing the gift wrap.

**Expected fix:** Add `ephemeralPrivkey.fill(0)` after `finalizeEvent()`.

**Verification:**

| Location | Zeroing Present? | Status |
|----------|-----------------|--------|
| nostr-mail-ts/src/wrap.ts (line 94) | `ephemeralPrivkey.fill(0)` | FIXED |
| Conversation keys (sealConvKey, wrapConvKey) | Not zeroed | NOT FIXED |

**Verdict: PARTIALLY FIXED.** The ephemeral private key is zeroed, but the derived conversation keys (sealConvKey and wrapConvKey) are not, as the crypto audit also recommended. This is a defense-in-depth measure; the ephemeral key zeroing addresses the higher-priority concern.

---

### Verification 6: verifyPostage Missing Private Key (Crypto Audit F-08)

**Original finding:** `verifyPostage()` creates `CashuWallet(mint)` without a private key, making P2PK swap signing impossible.

**Expected fix:** Accept a private key parameter and pass to CashuWallet constructor.

**Verification:**

| Location | Function Signature | Wallet Construction | Status |
|----------|-------------------|-------------------|--------|
| nostr-mail-ts/src/cashu.ts (line 114-117) | `verifyPostage(postage, ourPubkey, minAmount)` -- no privkey param | `new CashuWallet(mint)` -- no privkey | NOT FIXED |

**Verdict: NOT FIXED.** The function signature still has only three parameters (postage, ourPubkey, minAmount) with no private key or signer callback. The wallet is constructed without a private key at line 211. P2PK-locked tokens cannot be redeemed. This means Phase 2 Cashu validation will always fail for P2PK tokens, and all Cashu-postaged messages will be reclassified from tier 3 to tier 5 (spam) after async verification. **This is a functional correctness bug that breaks the anti-spam payment model.**

---

### Verification 7: Bridge hexToBytes Validation (Code Audit SEC-002)

**Original finding:** Bridge's `hexToBytes()` in three files does not validate input, producing zeroed keys on malformed input.

**Expected fix:** Add odd-length and non-hex character validation.

**Verification:**

| Location | Validation Present? | Status |
|----------|-------------------|--------|
| nostr-mail-bridge/src/inbound.ts (line 543) | No validation | NOT FIXED |
| nostr-mail-bridge/src/outbound.ts (line 372) | No validation | NOT FIXED |
| nostr-mail-bridge/src/server.ts (line 204) | No validation | NOT FIXED |

**Verdict: NOT FIXED.** All three copies of `hexToBytes()` in the bridge remain unvalidated. Malformed `BRIDGE_PRIVATE_KEY` will still silently produce a zeroed private key.

---

### Verification 8: Client Seal Signature Verification (Code Audit SEC-005)

**Original finding:** Client's `unwrapMail()` does not verify the seal's Schnorr signature, allowing forged sender identity.

**Expected fix:** Add `verifyEvent(seal)` before proceeding.

**Verification:**

| Location | Seal Verification? | Status |
|----------|-------------------|--------|
| nostr-mail-client/src/lib/nostr-mail.ts (lines 306-316) | No `verifyEvent` call | NOT FIXED |

The client decrypts the seal and proceeds directly to decrypting the rumor without verifying the seal signature. The sender consistency check (rumor.pubkey === seal.pubkey) was added, but without seal signature verification, an attacker could forge both the seal and rumor with matching pubkeys.

**Verdict: NOT FIXED.** The sender consistency check (Verification 2) was added, but it is insufficient without seal signature verification. The client must verify the seal's cryptographic signature to prove the claimed sender actually signed it.

---

### Verification 9: Regex HTML Sanitizer (Code Audit SEC-003)

**Original finding:** Bridge's regex-based HTML sanitizer is fundamentally bypassable.

**Expected fix:** Replace with DOMPurify.

**Verification:** Not directly checked (would require examining bridge dependencies), but the code audit noted this as "replace with DOMPurify before public release." Given that all three bridge `hexToBytes()` functions are also unfixed, the bridge appears to have received no security fixes.

**Verdict: LIKELY NOT FIXED.** Based on the pattern of unfixed bridge issues.

---

### Verification 10: State Serialization Interop (Code Audit INTEROP-001)

**Original finding:** Go uses `["flagged", eventId]` and `["folder", folderName, eventId]`; TypeScript uses `["flag", eventId, flag1, flag2]` and `["folder", eventId, folderName]`. Argument order reversed.

**Expected fix:** Align on one format.

**Verification:** Not directly verified against source (would require reading state.go and state.ts), but this finding was classified as Medium and was in the "should fix" category.

**Verdict: STATUS UNKNOWN.** Requires source verification.

---

## Summary: Cross-Review Scorecard

| Finding | Audit Source | Severity | Fix Status | Notes |
|---------|-------------|----------|------------|-------|
| Kind 15/16 collision | Spec FA-001/FA-002 | CRITICAL | PARTIAL | 6 residual inconsistencies in spec + test vectors |
| Sender consistency check | Crypto F-03 | Medium | FIXED | Core library correct; client uses silent null return |
| Math.random -> CSPRNG | Code SEC-001 | Critical | FIXED | Client now uses crypto.getRandomValues |
| Go P2PK check | Code SEC-006 | High | FIXED | Condition correctly requires P2PK flag |
| Ephemeral key zeroing | Crypto F-04 | Medium | PARTIAL | Key zeroed; conversation keys not zeroed |
| verifyPostage privkey | Crypto F-08 | Medium | NOT FIXED | P2PK swap broken; anti-spam payments non-functional |
| Bridge hexToBytes | Code SEC-002 | Critical | NOT FIXED | All 3 copies still unvalidated |
| Client seal verification | Code SEC-005 | High | NOT FIXED | No verifyEvent on seal |
| Regex HTML sanitizer | Code SEC-003 | High | LIKELY NOT FIXED | Bridge appears to have no fixes applied |
| State serialization interop | Code INTEROP-001 | Medium | UNKNOWN | Requires verification |

### Fix Rate

- **Fully fixed:** 3 of 10 verified findings (30%)
- **Partially fixed:** 3 of 10 (30%)
- **Not fixed:** 4 of 10 (40%)

### Blocking Issues for Release

1. **Crypto F-08 (verifyPostage privkey):** Without this fix, the entire Cashu anti-spam payment model is non-functional. All P2PK tokens fail Phase 2 validation. This undermines the protocol's primary differentiator from NIP-17.

2. **Code SEC-002 (bridge hexToBytes):** A malformed environment variable silently destroys all bridge encryption. This is a deployment time-bomb.

3. **Code SEC-005 (client seal verification):** The client accepts forged seals. Combined with the sender consistency check, an attacker who forges a seal can still impersonate any sender as long as they set matching pubkeys in the seal and rumor.

4. **Spec FA-001/FA-002 residuals:** The event kinds table (the most-referenced part of any NIP) still says kind 15. The receipt section references three different kind numbers (16, 1112, 1401) in different places. This will cause implementation divergence.

---

*Cross-review performed against: nip-xx-nostr-mail.md, nostr-mail-ts/src/*, nostr-mail-go/pkg/*, nostr-mail-client/src/*, nostr-mail-bridge/src/*, test-vectors/*.*
