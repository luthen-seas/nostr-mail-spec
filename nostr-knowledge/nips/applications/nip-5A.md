# NIP-5A: Pubkey Static Websites

## Status
Active (Draft, Optional)

## Summary
NIP-5A defines a method for hosting static websites under Nostr public keys using specialized host servers ("nsite" hosts). Site manifests are published as Nostr events (kind 15128 for root sites, kind 35128 for named sites) containing path-to-hash mappings. Host servers resolve these manifests, fetch the corresponding files from Blossom servers, and serve them over HTTP. This effectively gives every Nostr keypair the ability to host a website without traditional web hosting.

## Motivation
Hosting a website today requires domain registration, DNS configuration, server provisioning, and ongoing maintenance -- all of which create centralized dependencies and censorship vectors. NIP-5A eliminates these by leveraging existing Nostr infrastructure: your keypair is your identity, relays store your site manifest, and Blossom (content-addressable blob storage) hosts your files. The result is a fully decentralized web hosting solution where sites are addressed by public key and cannot be taken down without compromising the relay or storage network.

## Specification

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| `15128` | Replaceable | **Root site manifest** -- one per pubkey, serves as the primary website |
| `35128` | Addressable | **Named site manifest** -- uses a `d` tag as a sub-domain identifier. Multiple per pubkey |
| `34128` | Addressable | **Legacy named site** (deprecated, for backward compatibility only) |

### Tags

**Path tags (required, repeatable):**

| Tag | Format | Description |
|-----|--------|-------------|
| `path` | `["path", "/absolute/path", "<sha256-hash>"]` | Maps a URL path to the SHA-256 hash of the file content. The hash is used to fetch the file from Blossom servers. |

**Metadata tags (optional):**

| Tag | Format | Description |
|-----|----------|-------------|
| `d` | `["d", "<site-name>"]` | Required for `kind:35128` named sites. The site name identifier (1-13 chars, `^[a-z0-9-]{1,13}$`, no trailing hyphens). |
| `server` | `["server", "<blossom-server-url>"]` | Hint for which Blossom server(s) host the files |
| `title` | `["title", "<site-name>"]` | Human-readable site title |
| `description` | `["description", "<text>"]` | Site description |
| `source` | `["source", "<repo-url>"]` | Repository URL (HTTP/HTTPS) for the site source code |
| `favicon.ico` | `["favicon.ico", "<sha256-hash>"]` | SHA-256 hash of the site's favicon |

### Protocol Flow

**Publishing a site:**

1. Developer builds a static site (HTML, CSS, JS, images).
2. Developer uploads all files to one or more Blossom servers (content-addressable by SHA-256 hash).
3. Developer constructs a manifest event:
   - `kind:15128` for a root site (no `d` tag needed).
   - `kind:35128` for a named site (with `d` tag).
4. Each file gets a `path` tag mapping its URL path to its SHA-256 hash.
5. Developer optionally adds `server` tags hinting where files are stored.
6. Developer signs and publishes the manifest to their relays.

**Resolving a site (host server):**

1. Host server receives an HTTP request.
2. It parses the leftmost DNS label from the hostname:
   - For root sites: the label is an `npub` (NIP-19 encoded pubkey).
   - For named sites: the label is `<pubkeyB36><dTag>` where `pubkeyB36` is the pubkey encoded in base36 (lowercase, exactly 50 characters) followed by the `d` tag name.
3. Host server queries the user's relay list (`kind:10002` event).
4. Host server fetches the appropriate manifest event:
   - Root: `{"kinds": [15128], "authors": ["<pubkey>"]}`
   - Named: `{"kinds": [35128], "authors": ["<pubkey>"], "#d": ["<site-name>"]}`
5. Host server extracts the `path` tag matching the requested URL path.
6. If the path ends in `/` or has no file extension, the server applies `/index.html` fallback.
7. Host server resolves the SHA-256 hash to a file URL:
   - First checks `server` tags from the manifest.
   - Falls back to the user's `kind:10063` (BUD-03) Blossom server list.
   - If neither exists, returns 404.
8. Host server fetches the file from the Blossom server and proxies it to the client.
9. Host server forwards `Content-Type` and `Content-Length` headers from the Blossom response.

### URL Structure

**Root sites:**
```
https://<npub>.nsite-host.com/path/to/page
```

**Named sites:**
```
https://<pubkeyB36><dTag>.nsite-host.com/path/to/page
```

Where `pubkeyB36` is the public key encoded in base36 (lowercase, digits 0-9 then letters a-z, no padding), always exactly 50 characters.

Named site `d` tag constraints:
- 1 to 13 characters
- Pattern: `^[a-z0-9-]{1,13}$`
- No trailing hyphens

### JSON Examples

**Root site manifest (kind 15128):**
```json
{
  "kind": 15128,
  "pubkey": "<site-owner-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["path", "/index.html", "a1b2c3d4e5f6...sha256hash..."],
    ["path", "/style.css", "f6e5d4c3b2a1...sha256hash..."],
    ["path", "/app.js", "1234abcd5678...sha256hash..."],
    ["path", "/images/logo.png", "deadbeef1234...sha256hash..."],
    ["server", "https://blossom.example.com"],
    ["title", "My Nostr Site"],
    ["description", "A personal website hosted on Nostr"],
    ["favicon.ico", "abcdef012345...sha256hash..."]
  ]
}
```

**Named site manifest (kind 35128):**
```json
{
  "kind": 35128,
  "pubkey": "<site-owner-pubkey>",
  "created_at": 1700000000,
  "content": "",
  "tags": [
    ["d", "blog"],
    ["path", "/index.html", "a1b2c3d4e5f6...sha256hash..."],
    ["path", "/posts/first-post.html", "b2c3d4e5f6a1...sha256hash..."],
    ["path", "/style.css", "c3d4e5f6a1b2...sha256hash..."],
    ["server", "https://blossom.example.com"],
    ["title", "My Blog"],
    ["source", "https://github.com/user/blog"]
  ]
}
```

## Implementation Notes

- **Base36 encoding:** The pubkeyB36 is a specific encoding: base36 using lowercase letters and digits (0-9, a-z), no padding, always 50 characters. Implementations must match this exactly or named site URLs will not resolve.
- **Index fallback:** If a requested path has no file extension or ends with `/`, the host server appends `/index.html`. For example, `/about/` resolves to `/about/index.html`.
- **File resolution priority:** Server tags in the manifest take priority over `kind:10063` BUD-03 user server lists. If no server information is available at all, the host MUST return 404.
- **Legacy kind 34128:** Older implementations may use `kind:34128` for named sites. Host servers SHOULD support this for backward compatibility but new implementations MUST use `kind:35128`.
- **Content-addressable files:** Files are identified by their SHA-256 hash. Updating a file means uploading the new version to Blossom and publishing a new manifest with the updated hash. The old file remains available (content-addressable storage is immutable).
- **DNS label length:** Total DNS label (pubkeyB36 + dTag) must fit within the 63-character DNS label limit. With 50 chars for pubkeyB36 and max 13 for dTag, this fits exactly.

## Client Behavior

Here "client" refers to the nsite host server software, not end-user browsers:

- Host servers MUST parse the leftmost DNS label to determine pubkey and site type.
- Host servers MUST query `kind:10002` for the user's relay list.
- Host servers MUST apply `/index.html` fallback for directory-like paths.
- Host servers MUST forward `Content-Type` and `Content-Length` headers from Blossom responses.
- Host servers MUST return 404 if no server information is available to resolve file hashes.
- Host servers SHOULD cache manifest events and file content for performance.
- Host servers SHOULD support legacy `kind:34128` for backward compatibility.

## Relay Behavior

- Relays MUST treat `kind:15128` as a replaceable event (one per pubkey).
- Relays MUST treat `kind:35128` as an addressable event (one per pubkey + `d` tag).
- Relays SHOULD support efficient `#d` tag filtering for named site lookups.

## Dependencies

- **NIP-01** -- Basic protocol, replaceable and addressable event semantics
- **NIP-19** -- Bech32 encoding (`npub`) for root site URLs
- **NIP-65** -- Relay list metadata (`kind:10002`) for discovering user's relays
- **Blossom Protocol** -- Content-addressable blob storage for hosting files
  - BUD-03 (`kind:10063`) -- User's Blossom server list

## Source Code References

- **nsite** -- Reference implementation of the host server
- **rust-nostr / nostr-tools:** Standard event construction for kinds 15128 and 35128

## Related NIPs

- **NIP-01** -- Event structure, replaceable/addressable semantics
- **NIP-19** -- Bech32 encoding for pubkeys in URLs
- **NIP-65** -- Relay list metadata
- **NIP-34** -- Git repositories (complementary: source code hosting on Nostr)
- **NIP-78** -- Application-specific data (alternative for simple key-value storage)
- **NIP-89** -- Application handlers (for discovering nsite-capable clients)
