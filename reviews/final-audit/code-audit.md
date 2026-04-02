# NOSTR Mail -- Final Code Quality & Security Audit

**Date**: 2026-04-01
**Auditor**: Adversarial Security Researcher / Senior Engineer
**Scope**: nostr-mail-ts (12 files), nostr-mail-go (5 packages + tests), nostr-mail-bridge (7 files), nostr-mail-client (2 files)
**Methodology**: Manual line-by-line review of all source code with adversarial security focus

---

## CRITICAL Findings

### SEC-001 | Critical | nostr-mail-client/src/lib/nostr-mail.ts | Line 584-587
**randomOffset() uses Math.random() instead of CSPRNG**

The client's `randomOffset()` function uses `Math.random()` to generate timestamp jitter for NIP-59 seal and gift wrap timestamps. `Math.random()` is not cryptographically secure and produces predictable output. An attacker observing multiple wraps from the same sender could use statistical analysis of the timestamp distribution to correlate seal/wrap pairs, defeating the metadata protection that timestamp randomization is designed to provide.

The core library (`nostr-mail-ts/src/wrap.ts` line 18) and bridge (`nostr-mail-bridge/src/inbound.ts` line 338) both correctly use `crypto.getRandomValues()`.

**Recommendation**: Replace with `crypto.getRandomValues()` identical to the pattern in `wrap.ts`:
```typescript
function randomOffset(): number {
  const maxOffset = 172800;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const normalized = (buf[0]! / 0x100000000) * 2 - 1;
  return Math.floor(normalized * maxOffset);
}
```

### SEC-002 | Critical | nostr-mail-bridge/src/inbound.ts | Line 543-549
**hexToBytes() does not validate input length or hex content**

The bridge's `hexToBytes()` (also duplicated in `outbound.ts` line 372-378 and `server.ts` line 204-210) does not validate that the input is a valid 64-character hex string. If `BRIDGE_PRIVATE_KEY` is malformed (odd length, non-hex characters), `parseInt` returns `NaN` which is silently coerced to `0`, producing a zeroed private key. A zeroed private key means all encryption is performed with a known key, completely destroying confidentiality.

The core library (`nostr-mail-ts/src/index.ts` line 315-328) correctly validates both odd length and non-hex characters.

**Recommendation**: Add validation to all three copies of `hexToBytes()` in the bridge, or extract to a shared utility:
```typescript
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex: odd length');
  if (!/^[0-9a-f]*$/i.test(hex)) throw new Error('Invalid hex characters');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
```

---

## HIGH Findings

### SEC-003 | High | nostr-mail-bridge/src/sanitize.ts | Lines 62-68
**Regex-based HTML sanitizer is bypassable**

The sanitizer uses regex to strip dangerous tags. This is fundamentally flawed for HTML sanitization because regex cannot correctly parse HTML. Known bypasses include:

1. **Nested/malformed tags**: `<scr<script>ipt>alert(1)</script>` -- the inner `<script>` removal leaves a valid `<script>` tag.
2. **Null bytes**: `<scr\x00ipt>` may bypass the regex but be interpreted by browsers.
3. **Encoding tricks**: The Phase 1 strip runs before Phase 3 attribute sanitization, but self-closing `<script />` variants with attributes like `<script/src=...>` may evade the regex.

The file itself acknowledges this at line 56: "For production deployment, consider a DOM-based sanitizer like DOMPurify."

**Recommendation**: Replace with DOMPurify (server-side via jsdom or linkedom) before public release. The current regex sanitizer should be marked as unsafe for untrusted input.

### SEC-004 | High | nostr-mail-bridge/src/convert.ts | Lines 155-156
**Markdown-to-HTML conversion allows unsanitized img src and a href injection**

The `markdownToHtml()` function converts Markdown to HTML using regex, then sanitizes the output. However, the img/link regex replacements at lines 155-156 insert user-controlled `src` and `href` values directly into HTML before sanitization. While `sanitizeHtml()` runs afterward, the construction of `<img src="$2">` and `<a href="$2">` from Markdown means that if the sanitizer has bypasses (see SEC-003), the URLs flow through unvalidated.

Additionally, the `markdownToHtml` function does not escape HTML entities in the Markdown source before processing formatting, so content like `<img onerror=alert(1)>` embedded in Markdown would be passed through the formatting regex unmodified, relying entirely on the sanitizer for safety.

**Recommendation**: Escape all HTML entities in the input before applying Markdown formatting rules, or use a proper Markdown parser (marked, markdown-it) with sanitization.

### SEC-005 | High | nostr-mail-client/src/lib/nostr-mail.ts | Lines 302-324
**unwrapMail() does not verify seal signature**

The client's `unwrapMail()` method decrypts both layers but never calls `verifyEvent()` on the seal. This means a malicious relay or MITM could forge a seal claiming to be from any sender, and the client would display it as authentic. The core library (`nostr-mail-ts/src/unwrap.ts` line 91) and bridge (`nostr-mail-bridge/src/outbound.ts` line 221) both correctly verify the seal signature.

**Recommendation**: Add seal signature verification:
```typescript
import { verifyEvent } from 'nostr-tools';
// After parsing seal:
if (!verifyEvent(seal)) return null;
```

### SEC-006 | High | nostr-mail-go/pkg/spam/spam.go | Lines 103-123
**Go spam evaluator does not check P2PK flag on Cashu postage**

The Go `EvaluateTier()` function checks `postage.Amount >= policy.CashuMinSats` but does not verify `postage.P2PK == true`. A non-P2PK token (bearer token) can be double-spent -- the sender could attach the same token to messages to many recipients. The TypeScript core library correctly checks `cashuPostage.p2pk` at `spam.ts` line 87.

The Go test `TestCashu_NonP2PKRejected` at `spam_test.go` line 153-174 expects non-P2PK tokens to be rejected, but the test only asserts the result is NOT tier 3 -- it passes because the amount check happens to pass and tier 3 is returned. This is a test bug: the test passes for the wrong reason.

**Recommendation**: Add `postage.P2PK` check in Go:
```go
if postage != nil && postage.P2PK && postage.Amount >= policy.CashuMinSats && policy.CashuMinSats > 0 {
```

---

## MEDIUM Findings

### SEC-007 | Medium | nostr-mail-bridge/src/server.ts | Lines 46-52
**Bridge private key logged on generation in dev mode**

When `BRIDGE_PRIVATE_KEY` is not set, the bridge generates an ephemeral keypair and logs the public key (line 52). While the private key itself is not logged, the generated key is stored in the `privateKeyHex` local variable which is then passed into `BridgeConfig`. The config object is used throughout the bridge and if any error handler or debug logging serializes the config, the private key would leak.

**Recommendation**: Never store the raw hex private key in the config object. Convert to `Uint8Array` immediately and zero the hex string. Consider a `SecretKey` wrapper type.

### SEC-008 | Medium | nostr-mail-bridge/src/outbound.ts | Lines 278-295
**Email recipient mapping is fragile and produces incorrect routing**

The `processGiftWrap` function at line 284 finds `email-to` tags but then maps them to `p` tags using a flawed heuristic: `emailToTags.find(t => t[1])` returns the FIRST email-to tag for ALL p-tags, rather than matching email addresses to specific recipients. If a rumor has multiple `p` tags and multiple `email-to` tags, all recipients map to the same email address.

**Recommendation**: The `email-to` tag should include a pubkey reference (e.g., `["email-to", "user@example.com", pubkey]`) or the mapping should use a secondary lookup.

### SEC-009 | Medium | nostr-mail-bridge/src/inbound.ts | Lines 39-40
**SMTP server disables authentication entirely**

`disabledCommands: ['AUTH']` and `authOptional: true` means any host on the network can inject email through the bridge. While this is noted as appropriate for an inbound relay, the `requireAuth` config flag only checks SPF/DKIM on the email content, not SMTP-level auth. In deployment, this server must be behind a firewall or reverse proxy.

**Recommendation**: Document the security requirement clearly. Add IP allowlisting or SMTP AUTH for submission-port usage.

### TYP-001 | Medium | nostr-mail-client/src/lib/nostr-mail.ts | Multiple lines
**Excessive use of `any` type undermines type safety**

The client library uses `any` in 16+ locations: `signEvent(event: any)`, `subscribeInbox(onMessage: (wrap: any) => void)`, `fetchInbox(): Promise<any[]>`, `unwrapMail(wrapEvent: any)`, `createGiftWrap(rumor: any, ...)`, `computeEventId(event: any)`, and `(window as any).nostr`. These bypass TypeScript's type system entirely and prevent compile-time detection of property access errors.

**Recommendation**: Define proper interfaces for all event types and use the `NostrEvent` / `VerifiedEvent` types from nostr-tools.

### INTEROP-001 | Medium | Multiple files
**State serialization format differs between Go and TypeScript**

The Go `state.go` serializes flags as `["flagged", eventId]` (one tag per flag type) at line 195, while TypeScript `state.ts` serializes as `["flag", eventId, flag1, flag2, ...]` (all flags in one tag) at line 203. The Go `FromTags` only parses `"flagged"` tags (line 229), while TypeScript `tagsToState` parses `"flag"` tags (line 239). These cannot interoperate.

Similarly, folder tags differ: Go uses `["folder", folderName, eventId]` (line 201) while TypeScript uses `["folder", eventId, folderName]` (line 209). The argument order is reversed.

The client's `tagsToState` (nostr-mail-client) matches the TypeScript core library format, not Go.

**Recommendation**: Align on a single serialization format. The TypeScript format is more flexible (supports multiple flag names per tag). Update Go to match.

### INTEROP-002 | Medium | nostr-mail-go/pkg/mail/mail.go vs nostr-mail-ts/src/mail.ts
**Go supports InlineImage tags; TypeScript does not**

The Go `CreateRumor` emits `["inline", hash, contentId]` tags (line 149) and `ParseRumor` parses them (line 251). The TypeScript `createMailRumor` and `parseMailRumor` have no inline image support. A Go-produced rumor with inline images will have those images silently dropped when parsed by TypeScript.

**Recommendation**: Add inline image support to the TypeScript implementation, or document this as a Go-only extension.

### INTEROP-003 | Medium | nostr-mail-go/pkg/mail/mail.go vs nostr-mail-ts/src/mail.ts
**Go does not emit cashu-mint and cashu-amount tags**

The Go `CreateRumor` only emits `["cashu", token]` (line 168) but not `["cashu-mint", url]` or `["cashu-amount", sats]`. The Go `ParseRumor` correctly reads all three tags (lines 265-285). TypeScript emits all three (mail.ts lines 99-101). This means TypeScript cannot fully parse Cashu postage from Go-produced rumors because the mint and amount are missing from the tags.

**Recommendation**: Add mint and amount tags to Go's `CreateRumor`:
```go
if p.Postage != nil {
    tags = append(tags, []string{"cashu", p.Postage.Token})
    tags = append(tags, []string{"cashu-mint", p.Postage.Mint})
    tags = append(tags, []string{"cashu-amount", fmt.Sprintf("%d", p.Postage.Amount)})
}
```

---

## LOW Findings

### SEC-010 | Low | nostr-mail-bridge/src/server.ts | Line 115
**Health endpoint exposes bridge pubkey and configuration**

The health check endpoint returns the bridge pubkey, relay list, and Blossom server URLs. While not secret, this information aids reconnaissance.

**Recommendation**: Return only `{ status: "healthy", uptime: N }` by default; expose details only on an authenticated management endpoint.

### SEC-011 | Low | nostr-mail-ts/src/cashu.ts | Lines 165-188
**P2PK verification checks only the JSON format, not cryptographic validity**

`verifyPostage()` parses the proof secret as JSON and checks if the `data` field matches the recipient's compressed pubkey, but it doesn't verify the P2PK signature on the proof itself. The actual cryptographic verification happens at the mint during the swap (step 5), but if the mint is unreachable, the function reports `valid: false` even though the token structure was correct.

**Recommendation**: Consider a local signature verification step before attempting the mint swap, to distinguish between "structurally valid but mint unreachable" and "structurally invalid."

### QUA-001 | Low | nostr-mail-ts/src/relay.ts | Lines 125-226
**subscribeInbox seenIds Set grows without bound**

The `seenIds` Set in `subscribeInbox()` accumulates every event ID for the lifetime of the subscription. For long-running subscriptions, this is a memory leak.

**Recommendation**: Use a bounded LRU cache (e.g., 10,000 entries) or periodically clear old entries based on timestamp.

### QUA-002 | Low | nostr-mail-bridge/src/identity.ts | Lines 10-17
**Identity maps are unbounded in-memory stores**

`emailToNostrMap`, `nostrToEmailMap`, and `messageIdMap` grow without limit. The file notes this is for the reference implementation, but production deployments would OOM.

**Recommendation**: Add LRU eviction or document the production requirement for persistent storage (Redis, SQLite).

### QUA-003 | Low | nostr-mail-ts/src/wrap.ts | Line 92
**Ephemeral private key not zeroed after use**

After generating and using the ephemeral key at line 76, the `ephemeralPrivkey` Uint8Array remains in memory until garbage collected. In JavaScript this cannot be fully mitigated, but the key should be overwritten as a best-effort defense.

**Recommendation**: Add `ephemeralPrivkey.fill(0)` after signing the wrap.

### QUA-004 | Low | nostr-mail-client/src/lib/nostr-mail.ts | Line 489-491
**Seal encryption fails silently when nip44 is unavailable**

If `this.signer.nip44` is undefined, `encryptedRumor` is set to `''` (empty string), and the seal is created with an empty content field. This produces a structurally valid but completely broken gift wrap that the recipient cannot decrypt. It would be silently published to relays.

**Recommendation**: Throw an error if `nip44` is not available:
```typescript
if (!this.signer.nip44) throw new Error('Signer does not support NIP-44 encryption');
```

### QUA-005 | Low | nostr-mail-bridge/src/inbound.ts | Lines 50-64
**SMTP callback fires before async processing completes**

`processInboundEmail` is called asynchronously, and `callback()` is called immediately on stream end (line 65). This acknowledges receipt to the sending MTA before processing is complete. If processing fails, the email is lost -- the sender's MTA believes delivery succeeded.

**Recommendation**: Wait for processing to complete before calling `callback()`, or use a persistent queue.

---

## INFO / Clean Findings

### CLEAN-001 | Clean | nostr-mail-ts/src/wrap.ts
**NIP-59 three-layer encryption is correctly implemented**

The core wrap/unwrap implementation correctly:
- Uses NIP-44 v2 for both encryption layers
- Generates fresh ephemeral keys per wrap
- Randomizes timestamps with CSPRNG
- Verifies seal signatures on unwrap
- Produces correct kind 13 seal (empty tags) and kind 1059 wrap (p-tag)

### CLEAN-002 | Clean | nostr-mail-ts/src/attachment.ts
**AES-256-GCM file encryption is correct**

- Uses Web Crypto API (CSPRNG for IV and key)
- Correct IV prepending format
- Hash verification before decryption (integrity check)
- Proper error handling for short ciphertext

### CLEAN-003 | Clean | nostr-mail-go/pkg/wrap/wrap.go
**Go NIP-59 implementation is correct and well-tested**

Test coverage includes: round-trip, ephemeral key uniqueness, timestamp randomization, non-recipient rejection, sender identity verification, multi-recipient wrapping, self-copy, structural checks, and seal layer inspection.

### CLEAN-004 | Clean | nostr-mail-ts/src/address.ts
**NIP-05 resolution handles edge cases well**

Validates domain format, uses timeout with AbortController, validates hex pubkey format, filters relay URLs to wss:// only, handles all error cases gracefully.

### CLEAN-005 | Clean | nostr-mail-ts/src/state.ts
**CRDT merge semantics are correctly implemented**

G-Set union for reads and deletes, LWW for folders with b-wins convention, union merge for flags. Immutable update pattern (returns new objects).

### CLEAN-006 | Info | nostr-mail-bridge/src/convert.ts | Line 71
**Link regex does not handle all href patterns**

`<a[^>]*href="([^"]*)"[^>]*>` only matches double-quoted href attributes. Single-quoted or unquoted href values are not captured. This is a correctness issue for HTML-to-Markdown conversion, not a security issue.

### CLEAN-007 | Info | nostr-mail-ts/src/index.ts | Line 184
**Self-copy relays array is empty**

When creating the self-copy wrap at line 139, the relays are `[]`. The caller is responsible for knowing where to publish their own self-copy, but this could cause the self-copy to be silently dropped if the caller doesn't handle empty relay arrays.

### CLEAN-008 | Info | Multiple files
**hexToBytes is duplicated in 4 locations**

The `hexToBytes` function appears in: `nostr-mail-ts/src/index.ts`, `nostr-mail-bridge/src/inbound.ts`, `nostr-mail-bridge/src/outbound.ts`, `nostr-mail-bridge/src/server.ts`, and `nostr-mail-client/src/lib/nostr-mail.ts`. Three of these lack input validation (SEC-002).

**Recommendation**: Extract to a shared utility module.

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 6 |
| Low | 6 |
| Info/Clean | 8 |
| **Total** | **26** |

---

## Code Quality Grades

### nostr-mail-ts (Core Library): **A-**

Strengths: Clean type definitions, correct NIP-59 implementation, proper CSPRNG usage, good error handling, immutable state patterns, comprehensive JSDoc comments. Well-structured module boundaries.

Weaknesses: No input validation on pubkey format in `createMailRumor`. Self-copy relay handling could be clearer. Minor: `seenIds` memory growth in relay subscriptions.

### nostr-mail-go (Go Library): **B+**

Strengths: Correct NIP-59 wrap/unwrap with thorough test coverage (40+ test cases). Clean Go idioms. Proper crypto/rand usage. Good error wrapping with `fmt.Errorf`.

Weaknesses: Missing P2PK check in spam evaluator (SEC-006). Missing cashu-mint/cashu-amount tag emission (INTEROP-003). State serialization format incompatible with TypeScript (INTEROP-001). No inline image support parity gap (INTEROP-002).

### nostr-mail-bridge (Bridge): **B-**

Strengths: Good architecture (clean inbound/outbound separation), proper NIP-59 implementation in both directions, decent HTML sanitizer structure, graceful shutdown handling.

Weaknesses: Regex-based HTML sanitizer is bypassable (SEC-003). Unvalidated hexToBytes in 3 locations (SEC-002). SMTP callback fires before processing (QUA-005). Fragile email-to-pubkey mapping (SEC-008). Unbounded in-memory stores (QUA-002).

### nostr-mail-client (Svelte Client): **C+**

Strengths: Clean Svelte store architecture, good derived store usage for filtering/threading, proper pool cleanup on disconnect.

Weaknesses: Math.random() for timestamp jitter (SEC-001). No seal signature verification (SEC-005). Excessive `any` usage (TYP-001). Silent failure on missing NIP-44 (QUA-004). Missing input validation on hexToBytes. Types are redefined locally rather than imported from the core library.

---

## Interoperability Assessment

The TypeScript core and Go implementations share compatible NIP-59 wrap/unwrap (verified by matching test vectors). However, three interop gaps would cause failures:

1. **State serialization**: Tag names and argument order differ (INTEROP-001) -- will corrupt mailbox state when syncing between TS and Go clients.
2. **Cashu tag emission**: Go omits mint/amount tags (INTEROP-003) -- TS cannot determine postage value from Go-produced rumors.
3. **Inline images**: Go-only feature (INTEROP-002) -- silently dropped by TS, data loss.

These must be resolved before claiming cross-implementation compatibility.

---

## Sign-Off

This audit identified 2 critical, 4 high, 6 medium, and 6 low severity findings across the four codebases. The critical findings (Math.random for crypto jitter, unvalidated hex-to-bytes) must be fixed before any public release. The high findings (bypassable sanitizer, missing seal verification, missing P2PK check) represent significant security gaps that should be addressed in the next development cycle.

The core protocol implementation in nostr-mail-ts is solid and demonstrates strong cryptographic hygiene. The Go implementation is well-tested but has interoperability gaps. The bridge needs the most work before production readiness. The client should not ship without fixing SEC-001 and SEC-005.

**Overall Assessment**: Ready for private beta with critical/high fixes applied. Not ready for public release until the sanitizer is replaced and interop gaps are closed.

**Signed**: Adversarial Security Researcher, 2026-04-01
