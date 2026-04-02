# NIP-51: Lists

## Status
Active (draft)

## Summary
NIP-51 defines a comprehensive system for user-created lists of things -- people, notes, relays, hashtags, and more. Lists can contain both public items (in event tags) and private/encrypted items (NIP-44 encrypted in the content field). The NIP defines two categories: standard lists (one per kind per user) and sets (multiple per kind, differentiated by `d` tag).

## Motivation
Users need to organize the Nostr ecosystem: who they follow, what they mute, which relays to use, bookmarks, communities, emoji collections, and more. NIP-51 provides a unified framework for all these list types, supporting both public and private entries. This replaces ad-hoc approaches and gives clients a reliable set of list kinds to build features on.

## Specification

### Event Kinds

#### Standard Lists (one per user)
| Kind  | Name              | Description                                                | Expected Tag Items |
|-------|-------------------|------------------------------------------------------------|--------------------|
| 3     | Follow list       | Microblogging basic follow list (NIP-02)                   | `"p"` (pubkeys with optional relay hint and petname) |
| 10000 | Mute list         | Things the user does not want to see in feeds              | `"p"` (pubkeys), `"t"` (hashtags), `"word"` (lowercase strings), `"e"` (threads) |
| 10001 | Pinned notes      | Events to showcase on profile page                         | `"e"` (kind:1 notes) |
| 10002 | Read/write relays | Where user publishes and expects mentions (NIP-65)         | See NIP-65 |
| 10003 | Bookmarks         | Uncategorized global bookmarks                             | `"e"` (kind:1 notes), `"a"` (kind:30023 articles) |
| 10004 | Communities       | NIP-72 communities the user belongs to                     | `"a"` (kind:34550 community definitions) |
| 10005 | Public chats      | NIP-28 chat channels the user is in                        | `"e"` (kind:40 channel definitions) |
| 10006 | Blocked relays    | Relays clients should never connect to                     | `"relay"` (relay URLs) |
| 10007 | Search relays     | Relays for search queries                                  | `"relay"` (relay URLs) |
| 10009 | Simple groups     | NIP-29 groups the user is in                               | `"group"` (group id + relay URL + optional name), `"r"` (relay URLs) |
| 10012 | Relay feeds       | Favorite browsable relays and relay sets                   | `"relay"` (relay URLs), `"a"` (kind:30002 relay set) |
| 10015 | Interests         | Topics and interest pointers                               | `"t"` (hashtags), `"a"` (kind:30015 interest set) |
| 10020 | Media follows     | Multimedia (photos, short video) follow list               | `"p"` (pubkeys with optional relay hint and petname) |
| 10030 | Emojis            | Preferred emojis and emoji set pointers                    | `"emoji"` (NIP-30), `"a"` (kind:30030 emoji set) |
| 10050 | DM relays         | Where to receive NIP-17 direct messages                    | `"relay"` (NIP-17) |
| 10101 | Good wiki authors | NIP-54 recommended wiki authors                           | `"p"` (pubkeys) |
| 10102 | Good wiki relays  | NIP-54 relays hosting useful articles                      | `"relay"` (relay URLs) |
| 10017 | Git authors       | Code (NIP-34 events) follow list                           | `"p"` (pubkeys with optional relay hint and petname) |
| 10018 | Git repositories  | NIP-34 followed repositories                               | `"a"` (kind:30617 repository announcements) |

#### Sets (multiple per user, distinguished by `d` tag)
| Kind  | Name                   | Description                                                              | Expected Tag Items |
|-------|------------------------|--------------------------------------------------------------------------|--------------------|
| 30000 | Follow sets            | Categorized groups of users                                              | `"p"` (pubkeys) |
| 30002 | Relay sets             | User-defined relay groups                                                | `"relay"` (relay URLs) |
| 30003 | Bookmark sets          | Categorized bookmark groups                                              | `"e"` (kind:1 notes), `"a"` (kind:30023 articles) |
| 30004 | Curation sets          | Groups of articles picked as interesting                                 | `"a"` (kind:30023 articles), `"e"` (kind:1 notes) |
| 30005 | Curation sets (video)  | Groups of videos                                                         | `"e"` (kind:21 videos) |
| 30006 | Curation sets (picture)| Groups of pictures                                                       | `"e"` (kind:20 pictures) |
| 30007 | Kind mute sets         | Mute pubkeys by kind (`d` tag MUST be the kind string)                   | `"p"` (pubkeys) |
| 30015 | Interest sets          | Interest topics as hashtags                                              | `"t"` (hashtags) |
| 30030 | Emoji sets             | Categorized emoji groups                                                 | `"emoji"` (NIP-30) |
| 30063 | Release artifact sets  | Software release artifacts                                               | `"e"` (kind:1063 file metadata), `"a"` (software app event) |
| 30267 | App curation sets      | References to software applications                                      | `"a"` (software application event) |
| 31924 | Calendar               | Set of calendar events                                                   | `"a"` (calendar event) |
| 39089 | Starter packs          | Named set of profiles to follow together                                 | `"p"` (pubkeys) |
| 39092 | Media starter packs    | Same as above for multimedia clients                                     | `"p"` (pubkeys) |

#### Deprecated Standard Lists
| Kind  | `d` tag        | Use Instead              |
|-------|----------------|--------------------------|
| 30000 | `"mute"`       | kind 10000 mute list     |
| 30001 | `"pin"`        | kind 10001 pin list      |
| 30001 | `"bookmark"`   | kind 10003 bookmarks     |
| 30001 | `"communities"`| kind 10004 communities   |

### Tags
| Tag           | Description                                          |
|---------------|------------------------------------------------------|
| `d`           | Unique identifier for sets (required for all sets)   |
| `title`       | Optional display name for a set                      |
| `image`       | Optional image URL for a set                         |
| `description` | Optional description for a set                       |
| `p`           | Pubkey reference                                     |
| `e`           | Event reference                                      |
| `a`           | Addressable event reference                          |
| `t`           | Hashtag/topic                                        |
| `relay`       | Relay URL                                            |
| `word`        | Lowercase word to mute                               |
| `group`       | NIP-29 group reference                               |
| `emoji`       | NIP-30 custom emoji                                  |

### Public vs. Private Items
- **Public items**: Specified in the event `tags` array (visible to everyone).
- **Private items**: Specified as a JSON array mimicking the `tags` structure, then stringified and encrypted using NIP-44 (shared key computed from the author's own public and private key), stored in `.content`.
- **Backward compatibility**: Clients can detect NIP-04 vs NIP-44 encryption by checking for `"iv"` in the ciphertext. NIP-04 encryption is deprecated.

### Protocol Flow
1. **Creating a list**: User publishes an event of the appropriate kind with items in `tags` (public) and/or encrypted in `.content` (private).
2. **Updating a list**: Publish a new event of the same kind (and same `d` tag for sets). The new event replaces the old one.
3. **Appending items**: When adding new items, clients SHOULD append to the end of the list to maintain chronological order.
4. **Reading a list**: Clients fetch the event, read public items from `tags`, and decrypt `.content` for private items (if the viewer is the list author).
5. **Reading others' lists**: Non-authors can only see public items.

### JSON Examples

**A mute list with public and encrypted private items:**
```json
{
  "id": "a92a316b75e44cfdc19986c634049158d4206fcc0b7b9c7ccbcdabe28beebcd0",
  "pubkey": "854043ae8f1f97430ca8c1f1a090bdde6488bd5115c7a45307a2a212750ae4cb",
  "created_at": 1699597889,
  "kind": 10000,
  "tags": [
    ["p", "07caba282f76441955b695551c3c5c742e5b9202a3784780f8086fdcdc1da3a9"],
    ["p", "a55c15f5e41d5aebd236eca5e0142789c5385703f1a7485aa4b38d94fd18dcc4"]
  ],
  "content": "TJob1dQrf2ndsmdbeGU+05HT5GMnBSx3fx8QdDY/g3NvCa7klfzgaQCmRZuo1d3WQjHDOjzSY1+MgTK5WjewFFumCcOZniWtOMSga9tJk1ky00tLoUUzyLnb1v9x95h/iT/KpkICJyAwUZ+LoJBUzLrK52wNTMt8M5jSLvCkRx8C0BmEwA/00pjOp4eRndy19H4WUUehhjfV2/VV/k4hMAjJ7Bb5Hp9xdmzmCLX9+64+MyeIQQjQAHPj8dkSsRahP7KS3MgMpjaF8nL48Bg5suZMxJayXGVp3BLtgRZx5z5nOk9xyrYk+71e2tnP9IDvSMkiSe76BcMct+m7kGVrRcavDI4n62goNNh25IpghT+a1OjjkpXt9me5wmaL7fxffV1pchdm+A7KJKIUU3kLC7QbUifF22EucRA9xiEyxETusNludBXN24O3llTbOy4vYFsq35BeZl4v1Cse7n2htZicVkItMz3wjzj1q1I1VqbnorNXFgllkRZn4/YXfTG/RMnoK/bDogRapOV+XToZ+IvsN0BqwKSUDx+ydKpci6htDRF2WDRkU+VQMqwM0CoLzy2H6A2cqyMMMD9SLRRzBg==?iv=S3rFeFr1gsYqmQA7bNnNTQ==",
  "sig": "1173822c53261f8cffe7efbf43ba4a97a9198b3e402c2a1df130f42a8985a2d0d3430f4de350db184141e45ca844ab4e5364ea80f11d720e36357e1853dba6ca"
}
```

**A curation set of articles and notes about yaks:**
```json
{
  "id": "567b41fc9060c758c4216fe5f8d3df7c57daad7ae757fa4606f0c39d4dd220ef",
  "pubkey": "d6dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c",
  "created_at": 1695327657,
  "kind": 30004,
  "tags": [
    ["d", "jvdy9i4"],
    ["title", "Yaks"],
    ["image", "https://cdn.britannica.com/40/188540-050-9AC748DE/Yak-Himalayas-Nepal.jpg"],
    ["description", "The domestic yak, also known as the Tartary ox, grunting ox, or hairy cattle, is a species of long-haired domesticated cattle found throughout the Himalayan region of the Indian subcontinent, the Tibetan Plateau, Gilgit-Baltistan, Tajikistan and as far north as Mongolia and Siberia."],
    ["a", "30023:26dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:95ODQzw3ajNoZ8SyMDOzQ"],
    ["a", "30023:54af95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:1-MYP8dAhramH9J5gJWKx"],
    ["a", "30023:f8fe95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:D2Tbd38bGrFvU0bIbvSMt"],
    ["e", "d78ba0d5dce22bfff9db0a9e996c9ef27e2c91051de0c4e1da340e0326b4941e"]
  ],
  "content": "",
  "sig": "a9a4e2192eede77e6c9d24ddfab95ba3ff7c03fbd07ad011fff245abea431fb4d3787c2d04aad001cb039cb8de91d83ce30e9a94f82ac3c5a2372aa1294a96bd"
}
```

**A release artifact set:**
```json
{
  "id": "567b41fc9060c758c4216fe5f8d3df7c57daad7ae757fa4606f0c39d4dd220ef",
  "pubkey": "d6dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c",
  "created_at": 1695327657,
  "kind": 30063,
  "content": "Release notes in markdown",
  "tags": [
    ["d", "com.example.app@0.0.1"],
    ["e", "d78ba0d5dce22bfff9db0a9e996c9ef27e2c91051de0c4e1da340e0326b4941e"],
    ["e", "f27e2c91051de0c4e1da0d5dce22bfff9db0a9340e0326b4941ed78bae996c9e"],
    ["e", "9d24ddfab95ba3ff7c03fbd07ad011fff245abea431fb4d3787c2d04aad02332"],
    ["e", "340e0326b340e0326b4941ed78ba340e0326b4941ed78ba340e0326b49ed78ba"],
    ["a", "32267:d6dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:com.example.app"]
  ],
  "sig": "a9a4e2192eede77e6c9d24ddfab95ba3ff7c03fbd07ad011fff245abea431fb4d3787c2d04aad001cb039cb8de91d83ce30e9a94f82ac3c5a2372aa1294a96bd"
}
```

**An app curation set:**
```json
{
  "id": "d8037fa866eb5acd2159960b3ada7284172f7d687b5289cc72a96ca2b431b611",
  "pubkey": "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d",
  "sig": "c1ce0a04521c020ae7485307cd86285530c1f778766a3fd594d662a73e7c28f307d7cd9a9ab642ae749fce62abbabb3a32facfe8d19a21fba551b60fae863d95",
  "kind": 30267,
  "created_at": 1729302793,
  "content": "My nostr app selection",
  "tags": [
    ["d", "nostr"],
    ["a", "32267:7579076d9aff0a4cfdefa7e2045f2486c7e5d8bc63bfc6b45397233e1bbfcb19:com.example.app1"],
    ["a", "32267:045f2486c7e5d8bc63bfc6b45397233e1bbfcb197579076d9aff0a4cfdefa7e2:net.example.app2"],
    ["a", "32267:264387284e647ba6938995735ec8c7d5c5a6f026307d78ce6faa725737e55130:pl.code.app3"]
  ]
}
```

### Encryption Process Pseudocode
```scala
val private_items = [
  ["p", "07caba282f76441955b695551c3c5c742e5b9202a3784780f8086fdcdc1da3a9"],
  ["a", "a55c15f5e41d5aebd236eca5e0142789c5385703f1a7485aa4b38d94fd18dcc4"],
]
val base64blob = nip44.encrypt(json.encode_to_string(private_items))
event.content = base64blob
```

## Implementation Notes
- Standard lists are normal replaceable events -- each user can have exactly one of each kind. Sets are addressable (parameterized replaceable) events, so users can have many of each kind differentiated by the `d` tag.
- Private items use NIP-44 encryption where the shared key is derived from the author's OWN public and private key (encrypting to self).
- For backward compatibility, clients should detect NIP-04 encryption (contains `"iv"` in ciphertext) and fall back accordingly, but new lists MUST use NIP-44.
- When appending items, add to the end of the tags array to maintain chronological ordering.
- The deprecated list formats (kind 30000 with `d`="mute", kind 30001 with `d`="pin"/"bookmark"/"communities") should be migrated to their respective standard list kinds.
- Sets can have `title`, `image`, and `description` tags for enhanced UI display.

## Client Behavior
- Clients MUST use the correct kind for each list type.
- Clients SHOULD support both public and private items in lists.
- Clients MUST use NIP-44 encryption for private items in new lists.
- Clients SHOULD detect NIP-04 encrypted content for backward compatibility.
- Clients SHOULD append new items to the end of lists.
- Clients SHOULD display set metadata (`title`, `image`, `description`) when available.
- Clients SHOULD migrate deprecated list formats to standard kinds.
- Clients MAY provide UI for creating and managing sets (relay sets, bookmark sets, etc.).

## Relay Behavior
- Relays MUST treat standard lists (kind 3, 10000-10102) as replaceable events.
- Relays MUST treat sets (kind 30000-39092) as addressable (parameterized replaceable) events.
- Relays SHOULD support efficient querying by kind and `d` tag.

## Dependencies
- [NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md) -- Follow list (kind 3)
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) -- Encryption for private items
- [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) -- Legacy encryption (deprecated, backward compat)
- [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) -- Relay list metadata (kind 10002)

## Source Code References
- **nostr-tools** (JS): `nip51.ts` -- list encryption/decryption helpers
- **rust-nostr**: Kind constants for all list types, NIP-44 encryption
- **go-nostr**: Replaceable and addressable event handling

## Related NIPs
- [NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md) -- Follow list
- [NIP-28](https://github.com/nostr-protocol/nips/blob/master/28.md) -- Public chat (kind 10005 references)
- [NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md) -- Simple groups (kind 10009)
- [NIP-30](https://github.com/nostr-protocol/nips/blob/master/30.md) -- Custom emoji (kind 10030, 30030)
- [NIP-34](https://github.com/nostr-protocol/nips/blob/master/34.md) -- Git stuff (kind 10017, 10018)
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) -- Versioned encryption
- [NIP-54](https://github.com/nostr-protocol/nips/blob/master/54.md) -- Wiki (kind 10101, 10102)
- [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) -- Relay list metadata
- [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) -- Moderated communities (kind 10004)
