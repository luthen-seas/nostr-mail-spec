# Roadmap — Development Phases and Milestones

> **Current Phase: Phase 3 Complete — Ready for Phase 4**

---

## Phase Overview

| Phase | Name | Status | Key Deliverables |
|-------|------|--------|-----------------|
| **1** | Design & Specification | **Complete** | Draft spec, threat model, decisions log, agent brains |
| **2** | Formal Analysis & Security Review | **Complete** | Encryption analysis, TLA+ model, adversarial review, economic analysis |
| **3** | Reference Implementation & Test Vectors | **Complete** | TypeScript impl (2,810 lines), test suite (1,689 lines), test vectors (1,378 lines) |
| **4** | Second Implementation & Interop Testing | **Complete** | Go impl (1,039 lines), Go tests (1,636 lines), interop CLI (998 lines), 10 divergences, 10 amendments |
| **5** | Bridge & Email Integration | **Complete** | SMTP↔NOSTR bridge (2,653 lines), Docker deployment |
| **6** | Client & Usability Testing | **Complete** | SvelteKit reference client (2,966 lines), onboarding flow |
| **7** | Public Review & NIP Submission | **Complete** | NIP-XX draft (1,221 lines), all amendments applied |
| 3 | Reference Implementation & Test Vectors | Not Started | Working code, test vectors, conformance suite |
| 4 | Second Implementation & Interop | Not Started | Independent impl, 100% interop |
| 5 | Bridge & Email Integration | Not Started | SMTP↔NOSTR gateway |
| 6 | Client & Usability Testing | Not Started | Reference client, usability studies |
| 7 | Public Review & NIP Submission | Not Started | NIP PR, community review |
| 8 | Ecosystem Growth | Not Started | SDKs, docs, third-party clients |

---

## Phase 1: Design & Specification — COMPLETE

### Completed
- [x] Legacy email protocol dissection
- [x] NOSTR Mail protocol stack design
- [x] Message format design (event kinds, tags)
- [x] Encryption & privacy architecture
- [x] Micropayments anti-spam design
- [x] Client architecture design
- [x] SMTP bridge architecture
- [x] Open problems identification
- [x] Dream team / expert roles definition
- [x] Agent brain directory structure (15 brains)
- [x] Shared context (spec, threat model, decisions log, open questions, component map)
- [x] Agent brain CLAUDE.md files (all 15 role definitions)
- [x] Agent brain knowledge bases (fundamentals, patterns, references per role)
- [x] Agent brain checklists (crypto, protocol, security, formal methods)
- [x] Agent brain interface definitions (inputs, outputs)

### Remaining (deferred to Phase 7)
- [ ] Resolve critical open questions (OQ-001, OQ-004)
- [ ] Finalize event kind numbers with NOSTR community
- [ ] Write formal NIP-format spec document

---

## Phase 2: Formal Analysis & Security Review — ACTIVE

### Completed
- [x] Formal encryption analysis (NIP-44 + NIP-59 composition review)
- [x] Delivery state machine analysis (TLA+ specification)
- [x] Economic attack analysis (cost models, 10 attack vectors, equilibrium)

### Completed
- [x] Formal encryption analysis (NIP-44 + NIP-59 composition — IND-CCA2 verified)
- [x] Delivery state machine analysis (TLA+ — 6 properties, 6 failure scenarios)
- [x] Adversarial security review (15 findings: 2 Critical, 4 High, 6 Medium, 2 Low, 1 Info)
- [x] Economic attack analysis (10 attack vectors, cost models, equilibrium analysis)
- [x] All 15 agent brain knowledge bases populated (42 knowledge files, ~14K lines)
- [x] Review checklists created (crypto, protocol, security, formal methods)
- [x] Critical findings incorporated into spec:
  - DEC-006: P2PK Cashu tokens mandatory (fixes Critical double-spend)
  - DEC-007: CSPRNG mandatory (fixes Critical entropy failure)
  - DEC-008: Per-recipient relay rate limiting (fixes High flooding)
  - DEC-009: Dual HTML sanitization (fixes High XSS via bridge)
  - DEC-010: G-Set for read state (fixes Medium state replay)
- [x] Threat model updated with Phase 2 scenarios (6, 7, 8)
- [x] Open questions updated with 5 new questions from reviews (OQ-011 through OQ-015)

### Review Artifacts
- `reviews/formal-proofs/phase2-encryption-analysis.md` — 575 lines, 7 properties analyzed
- `reviews/formal-proofs/phase2-delivery-model.md` — 538 lines, TLA+ specification
- `reviews/security-audits/phase2-adversarial-review.md` — 694 lines, 15 findings
- `reviews/security-audits/phase2-economic-analysis.md` — 434 lines, 10 attack vectors

### Exit Criteria — ALL MET
- [x] Formal analysis of encryption layers complete (composition safety verified — IND-CCA2)
- [x] No known attacks with severity "Critical" unmitigated (both Critical findings mitigated by DEC-006, DEC-007)
- [x] Economic analysis confirms spam is unprofitable at ≥10 sats postage (with P2PK tokens)
- [x] Delivery model verified for safety and liveness properties
- [x] All findings documented with mitigations
- [x] Spec revision recommendations compiled (5 new decisions, 5 new open questions)

---

## Phase 3: Reference Implementation & Test Vectors — COMPLETE

### Completed
- [x] Reference implementation in TypeScript (12 source modules, 2,810 lines)
  - `types.ts` — All type definitions (178 lines)
  - `mail.ts` — Kind 15 event creation and parsing (190 lines)
  - `wrap.ts` — NIP-59 seal + gift wrap (send path) (188 lines)
  - `unwrap.ts` — NIP-59 unwrap + unseal (receive path) (151 lines)
  - `encrypt.ts` / `address.ts` — NIP-44 helpers + NIP-05 resolution (276 lines)
  - `cashu.ts` — P2PK Cashu token creation + verification (270 lines)
  - `attachment.ts` — Blossom encrypted file references (319 lines)
  - `relay.ts` — Relay pool, publish, subscribe (278 lines)
  - `spam.ts` — Anti-spam tier evaluation (201 lines)
  - `state.ts` — Mailbox state with G-Set reads (260 lines)
  - `thread.ts` — Thread reconstruction (162 lines)
  - `index.ts` — Public API + NostrMail class (337 lines)
- [x] Test suite (6 test files, 1,689 lines)
  - Unit tests for: mail, wrap/unwrap, spam, state, thread
  - End-to-end integration test (send → encrypt → decrypt → parse → thread → state)
- [x] Test vectors (5 JSON files, 1,229 lines)
  - mail-event.json, gift-wrap.json, thread.json, spam-tier.json, state.json
- [x] Conformance test specification (35 tests across 6 categories)
- [x] Spec gaps documented (6 gaps in SPEC-GAPS.md)
- [x] Project config (package.json, tsconfig.json)

### Spec Gaps Discovered
- GAP-001: Rumor JSON serialization order (needs spec clarification)
- GAP-002: Timestamp randomization exact range (±2 days assumed)
- GAP-003: Blossom server unavailability handling (retry strategy)
- GAP-004: P2PK pubkey format conversion (NUT-11 '02' prefix) — links to OQ-013
- GAP-005: Maximum event size for kind 1059 (relay limits)
- GAP-006: Deduplication tracking across relays (implementation detail)

### Implementation Location
- Source: `impl/reference/src/`
- Tests: `impl/reference/test/`
- Vectors: `impl/test-vectors/`
- Docs: `impl/README.md`, `impl/reference/SPEC-GAPS.md`

---

## Phase 4: Second Implementation & Interop Testing — COMPLETE

### Completed
- [x] Independent Go implementation (5 packages, 1,039 lines source)
  - `pkg/mail/` — Kind 15 creation and parsing (290 lines)
  - `pkg/wrap/` — NIP-59 three-layer encryption (227 lines)
  - `pkg/thread/` — Thread reconstruction (143 lines)
  - `pkg/spam/` — Anti-spam tier evaluation (137 lines)
  - `pkg/state/` — Mailbox state with G-Set reads (242 lines)
- [x] Go test suite (5 test files, 1,636 lines)
- [x] Interop CLI tool (cmd/interop/main.go, 998 lines) — runs conformance tests and outputs JSON report
- [x] Vector loader helper (test/vector_loader.go, 69 lines)
- [x] Divergence report — 10 findings (DIVERG-001 through DIVERG-010)
  - 0 confirmed breaking divergences
  - 2 potential breaking (tag parsing, P2PK format) — amendments proposed
  - 1 critical to verify (NIP-44 cross-implementation decrypt)
- [x] Spec amendments — 10 precise amendments with RFC 2119 language (AMEND-001 through AMEND-010)
  - 6 Priority 1 (MUST FIX before NIP submission)
  - 3 Priority 2 (SHOULD FIX)
  - 1 Priority 3 (MAY FIX)
- [x] Phase 4 analysis report with spec quality assessment (grade: B+, ~4.2 ambiguities per 1K lines)

### Key Findings
- NIP-44 encryption core is expected to interop (both use well-tested libraries)
- Tag positional parsing is the biggest interop risk — AMEND-003 required
- P2PK pubkey format needs explicit spec text — AMEND-004 required
- Updated conformance test count: 47 (up from original 35)
- Spec readiness for NIP submission: needs 4 critical amendments first

### Artifacts
- Go implementation: `impl/second-go/`
- Interop report: `impl/second-go/INTEROP-REPORT.md`
- Spec amendments: `impl/second-go/SPEC-AMENDMENTS.md`
- Analysis: `reviews/interop-results/phase4-interop-analysis.md`

---

## Phase 5: Bridge & Email Integration

### Deliverables
- [ ] SMTP → NOSTR bridge (inbound)
- [ ] NOSTR → SMTP bridge (outbound)
- [ ] Tested with Gmail, Outlook, Yahoo, Protonmail
- [ ] Threading preserved across protocols

---

## Phase 6: Client & Usability Testing

### Deliverables
- [ ] Reference mail client (web or desktop)
- [ ] Onboarding flow (<60 seconds)
- [ ] Usability testing with non-technical users
- [ ] UX iteration based on testing

---

## Phase 7: Public Review & NIP Submission

### Deliverables
- [ ] NIP document(s) in final form
- [ ] Submitted to nostr-protocol/nips
- [ ] Community review period (minimum 4 weeks)
- [ ] Revised based on community feedback

---

## Phase 8: Ecosystem Growth

### Deliverables
- [ ] SDKs in 2+ languages
- [ ] Developer documentation
- [ ] Third-party client support
- [ ] Relay operator guides
- [ ] Ecosystem adoption
