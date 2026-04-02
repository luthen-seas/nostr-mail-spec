# NIP-34: git stuff

## Status
Draft / Optional

## Summary
NIP-34 defines a comprehensive set of event kinds for Git-based code collaboration over the NOSTR protocol. It enables repository announcements, patch submission and review, pull requests, issue tracking, and status management -- essentially recreating the core workflows of GitHub/GitLab in a decentralized manner. Repositories are identified by addressable events, while patches, issues, and status changes flow as regular events referencing them.

## Motivation
Centralized code hosting platforms (GitHub, GitLab) represent single points of failure and censorship for open-source collaboration. NIP-34 moves the social layer of Git (issues, patches, code review, merge status) onto NOSTR while keeping Git itself as the underlying version control system. This allows developers to collaborate on code using their existing NOSTR identities, benefit from censorship resistance, and maintain interoperability with standard Git tooling.

## Specification

### Event Kinds

| Kind | Name | Type | Description |
|------|------|------|-------------|
| 30617 | Repository Announcement | Addressable | Asserts maintainership and announces a Git repository |
| 30618 | Repository State Announcement | Addressable | Source-of-truth tracking for branches and tags |
| 1617 | Patch | Regular | Transmits Git format-patch output (code changes) |
| 1618 | Pull Request | Regular | Requests merge of a branch with multiple commits |
| 1619 | Pull Request Update | Regular | Updates commit tip of an existing PR |
| 1621 | Issue | Regular | Bug report, feature request, or discussion thread |
| 1630 | Status: Open | Regular | Marks a patch/PR/issue as open |
| 1631 | Status: Applied/Merged | Regular | Marks a patch as applied or PR as merged |
| 1632 | Status: Closed | Regular | Marks a patch/PR/issue as closed |
| 1633 | Status: Draft | Regular | Marks a patch/PR/issue as draft |
| 10317 | User Grasp List | Replaceable | Specifies preferred Grasp server URLs |

### Tags

#### Repository Announcement (30617) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `d` | `["d", "<repo-id>"]` | Repository identifier, typically kebab-case |
| `name` | `["name", "<human-readable name>"]` | Human-readable project name |
| `description` | `["description", "<text>"]` | Brief project description |
| `web` | `["web", "<url>", ...]` | Browsable URL(s); multiple allowed |
| `clone` | `["clone", "<url>", ...]` | Git clone URL(s); multiple allowed |
| `relays` | `["relays", "<relay-url>", ...]` | Relay(s) monitoring patches/issues |
| `r` | `["r", "<commit-id>", "euc"]` | Earliest unique commit with `euc` marker |
| `maintainers` | `["maintainers", "<pubkey>", ...]` | Recognized maintainer pubkeys |
| `t` | `["t", "<tag>"]` | `"personal-fork"` or hashtag labels |

#### Repository State Announcement (30618) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `d` | `["d", "<repo-id>"]` | Must match repository announcement `d` tag |
| `refs/heads/<name>` or `refs/tags/<name>` | `["refs/heads/main", "<commit-id>"]` | Branch or tag to commit mapping |
| `HEAD` | `["HEAD", "ref: refs/heads/<branch>"]` | Points to default branch |

#### Patch (1617) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `a` | `["a", "30617:<owner-pubkey>:<repo-id>"]` | Reference to repository announcement |
| `r` | `["r", "<earliest-unique-commit-id>"]` | Earliest unique commit of the repo |
| `p` | `["p", "<pubkey>"]` | Repository owner and/or other relevant users |
| `t` | `["t", "root"]` | Marks the first patch in a set (root patch) |
| `t` | `["t", "root-revision"]` | Marks a revision of a previous root patch |
| `commit` | `["commit", "<commit-id>"]` | Current commit ID |
| `r` | `["r", "<current-commit-id>"]` | Current commit (also as `r` tag) |
| `parent-commit` | `["parent-commit", "<commit-id>"]` | Parent commit ID |
| `commit-pgp-sig` | `["commit-pgp-sig", "<signature>"]` | PGP signature or empty string |
| `committer` | `["committer", "<name>", "<email>", "<timestamp>", "<tz-offset>"]` | Committer metadata |

**Content:** The `content` field contains the Git format-patch output (the actual diff). Patches must be under 60KB. Patch sets should use NIP-10 reply tags to link sequential patches.

#### Pull Request (1618) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `a` | `["a", "30617:<owner-pubkey>:<repo-id>"]` | Reference to repository announcement |
| `r` | `["r", "<earliest-unique-commit-id>"]` | Earliest unique commit of the repo |
| `p` | `["p", "<pubkey>"]` | Repository owner and/or other users |
| `subject` | `["subject", "<PR-title>"]` | Pull request title |
| `t` | `["t", "<label>"]` | PR labels |
| `c` | `["c", "<commit-id>"]` | Current commit tip |
| `clone` | `["clone", "<url>", ...]` | Clone URL(s) for the branch |
| `branch-name` | `["branch-name", "<name>"]` | Recommended branch name |
| `e` | `["e", "<root-patch-event-id>"]` | Links to earlier patch event (for revisions) |
| `merge-base` | `["merge-base", "<commit-id>"]` | Most recent common ancestor |

**Content:** Markdown description of the PR. Branches should be pushed to `refs/nostr/` before signing the event.

#### Pull Request Update (1619) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `a` | `["a", "30617:<owner-pubkey>:<repo-id>"]` | Reference to repository announcement |
| `r` | `["r", "<earliest-unique-commit-id>"]` | Earliest unique commit of the repo |
| `p` | `["p", "<pubkey>"]` | Repository owner and/or other users |
| `E` | `["E", "<pull-request-event-id>"]` | The PR event being updated (uppercase E) |
| `P` | `["P", "<pull-request-author>"]` | PR author pubkey (uppercase P) |
| `c` | `["c", "<commit-id>"]` | Updated commit tip |
| `clone` | `["clone", "<url>", ...]` | Clone URL(s) |
| `merge-base` | `["merge-base", "<commit-id>"]` | Common ancestor commit |

#### Issue (1621) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `a` | `["a", "30617:<owner-pubkey>:<repo-id>"]` | Reference to repository announcement |
| `p` | `["p", "<repository-owner>"]` | Repository owner pubkey |
| `subject` | `["subject", "<issue-title>"]` | Issue title |
| `t` | `["t", "<label>"]` | Issue labels (multiple allowed) |

**Content:** Markdown body of the issue.

#### Status Events (1630-1633) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `e` | `["e", "<root-event-id>", "", "root"]` | Root issue/PR/patch event ID |
| `e` | `["e", "<revision-id>", "", "reply"]` | Accepted revision root ID |
| `p` | `["p", "<pubkey>"]` | Repository owner, root author, revision author |
| `a` | `["a", "30617:<owner>:<repo-id>", "<relay-url>"]` | Repository address with relay |
| `r` | `["r", "<earliest-unique-commit-id>"]` | Earliest unique commit |
| `q` | `["q", "<patch-event-id>", "<relay-url>", "<pubkey>"]` | Applied/merged patch reference |
| `merge-commit` | `["merge-commit", "<commit-id>"]` | The merge commit ID |
| `r` | `["r", "<merge-commit-id>"]` | Merge commit (as `r` tag) |
| `applied-as-commits` | `["applied-as-commits", "<commit-id>", ...]` | Commit IDs in target branch |

**Status semantics:** Only the most recent status event from the repository owner or a recognized maintainer is authoritative. Anyone can publish status events, but clients should prioritize maintainer statuses.

#### User Grasp List (10317) Tags

| Tag | Format | Description |
|-----|--------|-------------|
| `g` | `["g", "<grasp-service-websocket-url>"]` | Grasp server URL |

### Protocol Flow

#### Publishing a Repository
1. Maintainer creates a kind 30617 event with repository metadata (name, description, clone URLs, relay preferences).
2. Optionally publishes a kind 30618 state event with current branch/tag refs.
3. Other developers discover the repository via relay queries filtering on kind 30617.

#### Submitting a Patch
1. Developer creates changes locally using Git.
2. Developer runs `git format-patch` to generate patch file(s).
3. For each patch, developer publishes a kind 1617 event with the patch content and appropriate tags.
4. The first patch in a set gets the `t:root` tag. Subsequent patches use NIP-10 reply threading.
5. Maintainer reviews, comments (using standard NIP-10 replies), and publishes a status event (1630-1633).

#### Submitting a Pull Request
1. Developer pushes branch to a publicly accessible Git remote (preferably under `refs/nostr/`).
2. Developer publishes a kind 1618 event with clone URL, commit tip, and branch name.
3. For force-pushes or updates, a kind 1619 event is published referencing the original PR.
4. Maintainer reviews and publishes a status event.

#### Filing an Issue
1. User publishes a kind 1621 event with the issue title and description.
2. Discussion happens via NIP-10 threaded replies to the issue event.
3. Maintainer publishes a status event to close/resolve the issue.

### JSON Examples

**Repository Announcement:**
```json
{
  "kind": 30617,
  "content": "",
  "tags": [
    ["d", "my-cool-project"],
    ["name", "My Cool Project"],
    ["description", "A really cool open source project"],
    ["web", "https://gitworkshop.dev/repo/my-cool-project"],
    ["clone", "https://github.com/user/my-cool-project.git", "git@github.com:user/my-cool-project.git"],
    ["relays", "wss://relay.damus.io", "wss://nos.lol"],
    ["r", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", "euc"],
    ["maintainers", "abcd1234...pubkey-hex"],
    ["t", "rust"],
    ["t", "nostr"]
  ]
}
```

**Repository State Announcement:**
```json
{
  "kind": 30618,
  "content": "",
  "tags": [
    ["d", "my-cool-project"],
    ["refs/heads/main", "abc123def456abc123def456abc123def456abc123"],
    ["refs/heads/feature-branch", "789def012345789def012345789def012345789def"],
    ["refs/tags/v1.0.0", "fedcba987654fedcba987654fedcba987654fedcba"],
    ["HEAD", "ref: refs/heads/main"]
  ]
}
```

**Patch (root of a patch set):**
```json
{
  "kind": 1617,
  "content": "From abc123 Mon Sep 17 00:00:00 2001\nFrom: Alice <alice@example.com>\nDate: Mon, 1 Jan 2024 12:00:00 +0000\nSubject: [PATCH 1/2] Add new feature\n\n---\n src/main.rs | 10 ++++++++++\n 1 file changed, 10 insertions(+)\n\ndiff --git a/src/main.rs b/src/main.rs\nindex abc123..def456 100644\n--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1,3 +1,13 @@\n fn main() {\n+    println!(\"new feature\");\n }\n",
  "tags": [
    ["a", "30617:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:my-cool-project"],
    ["r", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
    ["t", "root"],
    ["commit", "def456789abc0123def456789abc0123def456789"],
    ["r", "def456789abc0123def456789abc0123def456789"],
    ["parent-commit", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["commit-pgp-sig", "-----BEGIN PGP SIGNATURE-----\n...\n-----END PGP SIGNATURE-----"],
    ["committer", "Alice", "alice@example.com", "1704067200", "+0000"]
  ]
}
```

**Pull Request:**
```json
{
  "kind": 1618,
  "content": "## Summary\n\nThis PR adds a new caching layer to improve query performance by 3x.\n\n## Changes\n- Added LRU cache module\n- Integrated cache with query engine\n- Added cache invalidation on writes",
  "tags": [
    ["a", "30617:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:my-cool-project"],
    ["r", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
    ["subject", "Add LRU caching layer for query engine"],
    ["t", "enhancement"],
    ["t", "performance"],
    ["c", "789abc0123456789abc0123456789abc012345678"],
    ["clone", "https://github.com/alice/my-cool-project.git"],
    ["branch-name", "feature/lru-cache"],
    ["merge-base", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"]
  ]
}
```

**Pull Request Update:**
```json
{
  "kind": 1619,
  "content": "",
  "tags": [
    ["a", "30617:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:my-cool-project"],
    ["r", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
    ["E", "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"],
    ["P", "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"],
    ["c", "newcommit0123456789abc0123456789abc012345"],
    ["clone", "https://github.com/alice/my-cool-project.git"],
    ["merge-base", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"]
  ]
}
```

**Issue:**
```json
{
  "kind": 1621,
  "content": "## Bug Description\n\nThe application crashes when processing events with empty `content` fields.\n\n## Steps to Reproduce\n1. Create an event with `content: \"\"`\n2. Submit to relay\n3. Client crashes on render\n\n## Expected Behavior\nEmpty content should be handled gracefully.",
  "tags": [
    ["a", "30617:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:my-cool-project"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
    ["subject", "Crash on empty content field"],
    ["t", "bug"],
    ["t", "crash"]
  ]
}
```

**Status Event (Applied/Merged):**
```json
{
  "kind": 1631,
  "content": "Merged! Great work on the caching implementation.",
  "tags": [
    ["e", "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210", "", "root"],
    ["e", "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff", "", "reply"],
    ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
    ["p", "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"],
    ["a", "30617:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789:my-cool-project", "wss://relay.damus.io"],
    ["r", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    ["merge-commit", "aabbccdd0011223344556677889900aabbccdd00"],
    ["r", "aabbccdd0011223344556677889900aabbccdd00"],
    ["applied-as-commits", "aabbccdd0011223344556677889900aabbccdd00", "11223344556677889900aabbccddeeff00112233"]
  ]
}
```

**User Grasp List:**
```json
{
  "kind": 10317,
  "content": "",
  "tags": [
    ["g", "wss://grasp.example.com"]
  ]
}
```

## Implementation Notes

- **Patch size limit:** Patches in kind 1617 events MUST be under 60KB. For larger changesets, use pull requests (kind 1618) instead, pushing the branch to a remote.
- **Earliest unique commit (EUC):** The `r` tag with `"euc"` marker identifies the repository uniquely across forks. This is typically the initial commit or earliest commit unique to the project.
- **Patch threading:** In a multi-patch set, the first patch is tagged `t:root`. Subsequent patches use NIP-10 reply tags to form a thread. This allows clients to reconstruct patch order.
- **Root revision:** When revising a previously submitted patch set, the new root patch gets `t:root-revision` and should reference the original root patch.
- **Status authority:** Anyone can publish status events, but only the most recent status from the repository owner or a recognized maintainer (listed in `maintainers` tag) is authoritative.
- **Personal forks:** A repository announcement with `t:personal-fork` indicates the publisher is not claiming maintainer status -- they are simply announcing their fork.
- **PR branch convention:** Branches for PRs should be pushed to `refs/nostr/<event-id>` or similar namespaced refs to avoid conflicts.
- **The `q` tag** in status events references the specific patch event that was applied/merged, with relay URL and pubkey for fetching.
- **Uppercase tags `E` and `P`** in kind 1619 (PR Update) are intentionally uppercase to distinguish them from standard NIP-10 `e` and `p` tags.

## Client Behavior

- Clients MUST resolve the current status of a patch/PR/issue by finding the most recent status event (1630-1633) from an authorized maintainer.
- Clients SHOULD display repository metadata from the kind 30617 event.
- Clients SHOULD use the `relays` tag from the repository announcement to query for related patches, issues, and status events.
- Clients MAY render patch content as syntax-highlighted diffs.
- Clients SHOULD support NIP-10 threaded replies for code review comments on patches and issues.
- Clients SHOULD display the `subject` tag as the title for issues and PRs.
- Clients MAY use kind 30618 events to display branch/tag status without requiring Git access.
- Clients SHOULD validate that patch content is valid Git format-patch output before displaying.

## Relay Behavior

- Relays SHOULD accept all NIP-34 event kinds.
- Relays listed in a repository's `relays` tag SHOULD expect to receive and serve patches, issues, and status events for that repository.
- No special validation is required beyond standard event verification.

## Dependencies

- **NIP-01** -- Basic event structure
- **NIP-10** -- Reply threading for patch sets and code review
- **NIP-22** -- Comment/reply conventions (used by kind 1619 for PR references)
- **Git** -- The underlying version control system; patches must be valid `git format-patch` output

## Source Code References

- **gitworkshop.dev** -- Primary web client implementing NIP-34
- **ngit** -- CLI tool for interacting with NIP-34 repos (`npm install -g @nickg/ngit`)
- **nostr-tools**: Check for NIP-34 kind constants and tag utilities
- **rust-nostr**: `crates/nostr/src/event/kind.rs` for kind definitions

## Related NIPs

- **NIP-01** -- Basic protocol flow and event structure
- **NIP-10** -- Event threading and reply conventions
- **NIP-22** -- Comments
- **NIP-42** -- Authentication (relevant for push-based workflows)
