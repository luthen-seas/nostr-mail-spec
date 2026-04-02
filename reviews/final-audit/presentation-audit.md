# NOSTR Mail -- Final Presentation Audit

**Date**: 2026-04-01
**Scope**: All 6 NOSTR Mail repositories
**Auditor**: Developer Ecosystem Specialist

---

## Findings

### Critical

| ID | Repo | Description | Recommendation |
|----|------|-------------|----------------|
| PA-001 | ALL | No LICENSE file exists in any of the 6 repositories. All READMEs state "MIT" but there is no actual LICENSE file. npm and Go tooling rely on this file for license detection; GitHub will show "No license" on every repo page. | Add a standard MIT LICENSE file (with correct year and copyright holder) to every repository root. |
| PA-002 | nostr-mail-go | `go.mod` declares module path `github.com/nostr-mail/second-go` but the repo is named `nostr-mail-go`, the README says `go get github.com/nostr-mail/nostr-mail-go`, and the quick-start import uses `github.com/nostr-mail/nostr-mail-go/pkg/mail`. The module path, README, and actual repo name are all inconsistent. All internal imports in `pkg/` and `cmd/` use `second-go`. This will cause build failures for anyone who clones and tries to `go build`. | Rename the module in `go.mod` to `github.com/nostr-mail/nostr-mail-go` and update all internal imports across every `.go` file. |
| PA-003 | nostr-mail-nip | README references `impl/reference/`, `impl/second-go/`, and `impl/test-vectors/` directories, but no `impl/` directory exists. The test vectors are at `test-vectors/` (top-level), and there are no implementation subdirectories. These are broken internal references. | Update the README table to point to the actual external repos (nostr-mail-ts, nostr-mail-go) and correct the test vectors path to `test-vectors/`. |

### High

| ID | Repo | Description | Recommendation |
|----|------|-------------|----------------|
| PA-004 | nostr-mail-bridge | README and source code contain 8+ references to internal design decision IDs (DEC-007, DEC-009) that are meaningful only within the nostr-mail-spec repo. External users will have no idea what "DEC-009" means. Found in: `README.md` (3 occurrences), `src/sanitize.ts` (2), `src/convert.ts` (2), `src/inbound.ts` (2). | Replace DEC-XXX references with descriptive text. For example, change "sanitized per DEC-009" to "sanitized (scripts, event handlers, and dangerous URL schemes are stripped)". |
| PA-005 | nostr-mail-client | README line 7 says "This is the **Phase 6 reference client**" -- an internal project phase reference that means nothing to outside users. | Change to "This is the **reference client** for the NOSTR Mail protocol." Remove the phase number. |
| PA-006 | nostr-mail-client | README line 99 references `../reference/` as the location of the core library. This is a relative path that only made sense in a monorepo layout. The actual library is in the separate `nostr-mail-ts` repo. | Change `../reference/` to a proper link: `[nostr-mail-ts](https://github.com/nostr-mail/nostr-mail-ts)` or the equivalent URL. |
| PA-007 | nostr-mail-ts | README has no "Related Repositories" section. A first-time visitor finding the library has no way to discover the spec, bridge, client, or NIP repos. | Add a Related Repositories table matching the format used in nostr-mail-spec's README. |
| PA-008 | nostr-mail-go | README has no "Related Repositories" section. Same issue as PA-007. | Add a Related Repositories table. |
| PA-009 | nostr-mail-bridge | README has no "Related Repositories" section. Same issue as PA-007. | Add a Related Repositories table. |
| PA-010 | nostr-mail-client | README has no "Related Repositories" section. Same issue as PA-007. | Add a Related Repositories table. |
| PA-011 | nostr-mail-nip | README has no "Related Repositories" section linking to the other repos by their GitHub URLs. The "Related Implementations" table references `impl/reference/` and `impl/second-go/` which do not exist (see PA-003). | Replace with a proper Related Repositories table using GitHub URLs. |

### Medium

| ID | Repo | Description | Recommendation |
|----|------|-------------|----------------|
| PA-012 | ALL | No CONTRIBUTING.md exists in any repository. For public open-source projects, this is a standard expectation that signals how to contribute. | Add a shared CONTRIBUTING.md (or at minimum one in nostr-mail-spec that others can reference) covering: how to report issues, PR guidelines, coding standards, and test expectations. |
| PA-013 | nostr-mail-ts | `package.json` is missing standard npm fields: `repository`, `keywords`, `author`, `license` (the field itself -- npm uses this for registry display), `engines`, `files`. This will look incomplete on npmjs.com. | Add: `"license": "MIT"`, `"repository": { "type": "git", "url": "https://github.com/nostr-mail/nostr-mail-ts" }`, `"keywords": ["nostr", "mail", "encryption", "nip-44", "nip-59", "cashu"]`, `"author"`, `"engines": { "node": ">=18" }`, `"files": ["dist"]`. |
| PA-014 | nostr-mail-bridge | `package.json` is missing the same standard fields as PA-013. | Same recommendation as PA-013, adapted for the bridge package. |
| PA-015 | nostr-mail-client | `package.json` is missing `description`, `license`, `repository`, `keywords`, `author`, and `engines` fields. | Add the missing fields. |
| PA-016 | nostr-mail-spec | README mentions "15 AI agent knowledge bases" and the structure shows `brains/` described as "15 agent knowledge bases (63 files)". The word "agent" in this context could confuse visitors (AI-built project?). For a public-facing spec repo this is fine as transparency, but the phrasing "AI agent knowledge bases" is unusual for a protocol spec. | Consider rephrasing to "15 domain knowledge bases" or "15 specialist reference guides" if you want to downplay the AI tooling. Alternatively, keep as-is if AI-transparency is intentional. |
| PA-017 | nostr-mail-spec | A `.DS_Store` file exists at `nostr-knowledge/tools/.DS_Store`. While `.DS_Store` is in `.gitignore`, this file was committed before the gitignore was added. | Remove the committed `.DS_Store` file: `git rm --cached nostr-knowledge/tools/.DS_Store`. |
| PA-018 | nostr-mail-bridge | `src/outbound.ts` line 292 contains the comment "Find the pubkey for this address (or use a placeholder)". While this is normal code commentary (not a TODO), the word "placeholder" in production code warrants review to confirm it is not a stub. | Review `outbound.ts` line 292 to confirm the placeholder fallback logic is intentional and documented. |
| PA-019 | nostr-mail-spec | `reviews/interop-results/phase4-interop-analysis.md` line 5 says "Reviewer: Phase 4 Interop Analysis Agent". This reveals the AI-agent authorship of the review. | If AI-transparency is not desired, change to a neutral attribution. If transparency is intentional, leave as-is. |
| PA-020 | nostr-mail-nip | README still uses "NIP-XX" as the NIP number placeholder throughout. The main spec file is named `nip-xx-nostr-mail.md`. | This is acceptable for a draft NIP (the number is assigned upon merge). However, add a note in the README: "The NIP number (XX) will be assigned upon acceptance into the nostr-protocol/nips repository." |

### Low

| ID | Repo | Description | Recommendation |
|----|------|-------------|----------------|
| PA-021 | nostr-mail-go | The module was clearly the "second implementation" during development (module name `second-go`). Beyond the go.mod issue (PA-002), this naming may persist in commit messages, comments, or documentation. | Grep for "second" references in Go source files and update any that reference the old naming. |
| PA-022 | nostr-mail-bridge | Dockerfile uses `node:22-alpine`. Node 22 is current LTS, which is good. No issue, just noting it is up to date. | No action needed. |
| PA-023 | nostr-mail-ts | The README code example uses `privateKey: 'your-hex-nsec'` which is slightly confusing -- an nsec is bech32-encoded, not hex. If the API accepts hex, the example text should say "hex private key", not "hex nsec". | Change to `privateKey: 'your-hex-private-key'` or use an nsec example with proper bech32 format. |
| PA-024 | nostr-mail-spec | The `shared/status/roadmap.md` and `design/` files contain extensive Phase references and AMEND-XXX identifiers. These are appropriate for the spec repo (which documents the design process) but would be confusing if someone reads them expecting a clean public spec. | Add a note at the top of the spec README clarifying that design/ and reviews/ document the development process and use internal identifiers. |
| PA-025 | nostr-mail-bridge | The `.gitignore` for the bridge repo should be verified to include `.env` to prevent accidental credential commits. | Verify `.env` is in `.gitignore`. If not, add it. |
| PA-026 | nostr-mail-client | `package.json` lists `svelte: ^4.0.0` but SvelteKit 2 ships with Svelte 4. This is fine but may become outdated as Svelte 5 becomes standard. | No immediate action, but note for future maintenance. |

### Info

| ID | Repo | Description | Recommendation |
|----|------|-------------|----------------|
| PA-027 | ALL | Test vectors are consistent across all three repos that include them (nostr-mail-ts, nostr-mail-go, nostr-mail-nip). File headers match. The NIP repo additionally includes `conformance-spec.md` (also present in TS and Go repos). | No action needed. Good. |
| PA-028 | ALL | All six repos have `.gitignore` files with appropriate entries for their respective ecosystems. | No action needed. |
| PA-029 | ALL | No TODO, FIXME, or HACK comments found in any source code files (`.ts`, `.go`, `.js`, `.svelte`). | No action needed. Clean. |
| PA-030 | ALL | No Lorem ipsum or "TODO: write this" placeholder text found. | No action needed. Clean. |
| PA-031 | ALL | Naming conventions are consistent across repos: `nostr-mail-{purpose}` pattern, npm scoped as `@nostr-mail/{name}`. | No action needed. |
| PA-032 | ALL | All READMEs clearly explain what the repo is within the first 2 sentences. | No action needed. |
| PA-033 | nostr-mail-bridge | Dockerfile is well-structured with multi-stage build, health check, proper port exposure, and production-only dependencies. | No action needed. Professional quality. |

---

## Readiness Assessment

| Repository | Status | Blocking Issues | Summary |
|-----------|--------|----------------|---------|
| **nostr-mail-spec** | Needs Work | PA-001 (LICENSE) | Strong README, good structure. Needs LICENSE file. Minor: committed .DS_Store (PA-017), agent references are acceptable if transparency is intentional (PA-016, PA-019). |
| **nostr-mail-ts** | Needs Work | PA-001 (LICENSE), PA-007 (no cross-links) | Clean README with install/quickstart/features. Needs LICENSE file, Related Repos section, package.json metadata, and the nsec/hex terminology fix. |
| **nostr-mail-go** | Not Ready | PA-001 (LICENSE), PA-002 (broken module path), PA-008 (no cross-links) | The `go.mod` module path mismatch (`second-go` vs `nostr-mail-go`) will cause build failures for any external user. This is the highest-priority fix across all repos. Also needs LICENSE and cross-links. |
| **nostr-mail-bridge** | Needs Work | PA-001 (LICENSE), PA-004 (DEC-XXX refs), PA-009 (no cross-links) | Excellent README with architecture diagrams, config reference, DNS setup, and Docker instructions. The internal DEC-XXX references will confuse external users. Needs LICENSE and cross-links. |
| **nostr-mail-client** | Needs Work | PA-001 (LICENSE), PA-005 (Phase ref), PA-006 (broken link), PA-010 (no cross-links) | Good README with feature list and architecture explanation. Needs LICENSE, removal of Phase reference, fix of `../reference/` broken link, and cross-links. |
| **nostr-mail-nip** | Not Ready | PA-001 (LICENSE), PA-003 (broken `impl/` refs), PA-011 (no cross-links) | The README references directories that do not exist (`impl/reference/`, `impl/second-go/`, `impl/test-vectors/`). This is immediately confusing. The NIP document itself appears well-written. Needs LICENSE, fixed paths, and proper cross-links. |

---

## Priority Fix Order

1. **Add MIT LICENSE file to all 6 repos** (PA-001) -- 10 minutes, unblocks all repos
2. **Fix nostr-mail-go module path** (PA-002) -- 30 minutes, requires updating go.mod + all .go imports
3. **Fix nostr-mail-nip broken directory references** (PA-003) -- 15 minutes
4. **Add Related Repositories tables to TS, Go, Bridge, Client, NIP READMEs** (PA-007 through PA-011) -- 30 minutes
5. **Remove DEC-XXX references from bridge code and README** (PA-004) -- 20 minutes
6. **Fix client README Phase reference and broken link** (PA-005, PA-006) -- 5 minutes
7. **Add package.json metadata to TS, Bridge, Client** (PA-013, PA-014, PA-015) -- 15 minutes
8. **Remove committed .DS_Store** (PA-017) -- 1 minute
9. **Fix nsec/hex terminology in TS README** (PA-023) -- 1 minute
10. **Add CONTRIBUTING.md** (PA-012) -- 20 minutes

**Estimated total remediation time: ~2.5 hours**

---

## Summary

The NOSTR Mail repositories demonstrate strong technical substance -- clean code (no TODOs/FIXMEs), consistent test vectors, well-structured READMEs with working examples, and professional Dockerfiles. The primary gaps are **packaging and cross-referencing**: no LICENSE files anywhere, missing cross-repo links, internal identifiers leaking into public-facing repos, and a critical module path mismatch in the Go repo that will break builds. None of these are architectural issues -- they are all presentation fixes that can be completed in a single focused session.
