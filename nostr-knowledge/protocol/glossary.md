# NOSTR Protocol Glossary

> Canonical definitions of every important term in the NOSTR ecosystem. Entries are alphabetically ordered. Each includes a definition, the governing NIP (if applicable), and cross-references to related terms.

---

## A

### Addressable Event
An event that is uniquely identified by the combination of its `kind`, `pubkey`, and `d` tag value, rather than by its event ID alone. Publishing a new addressable event with the same kind, pubkey, and d-tag replaces the previous one. Addressable events use kind numbers in the ranges 30000-39999. They are the mechanism behind profiles, relay lists, long-form content, wiki articles, and many other mutable data structures in NOSTR.
- **NIP Reference**: NIP-01 (core definition of addressable/parameterized replaceable events)
- **See Also**: d-tag, Replaceable Event, Parameterized Replaceable Event, Event Kind

### AUTH
A protocol message used for client authentication to relays. The client sends an `AUTH` message containing a signed kind 22242 event to prove it controls a particular public key. Relays can challenge clients with an `AUTH` message containing a challenge string, which the client must sign and return. This enables relays to implement access control, restrict writes, or gate content behind identity verification.
- **NIP Reference**: NIP-42
- **See Also**: Relay, Client, Public Key, Signature

---

## B

### Badge
A mechanism for issuing and displaying verifiable achievements or credentials on NOSTR. Badge definitions (kind 30009) describe the badge itself, while badge awards (kind 8) grant a badge to a user. Users can curate which badges they display via profile badge events (kind 30008). Badges are signed by the issuer's key, making them cryptographically verifiable.
- **NIP Reference**: NIP-58
- **See Also**: Event Kind, Addressable Event, Public Key

### Bech32
A human-readable encoding format used in NOSTR (borrowed from Bitcoin's BIP-173) to represent keys, event IDs, and other entities with built-in error detection. NOSTR uses bech32-encoded strings with specific prefixes (`npub`, `nsec`, `note`, `nprofile`, `nevent`, `naddr`, `nrelay`) to differentiate entity types. The encoding prevents accidental modification and makes identifiers easy to copy and share.
- **NIP Reference**: NIP-19
- **See Also**: npub, nsec, note, nprofile, nevent, naddr, TLV

### Blossom
A protocol for storing and retrieving binary large objects (blobs) such as images, videos, and files on dedicated media servers, integrated with NOSTR identity. Users authenticate to Blossom servers using their NOSTR keys and can publish a server list (kind 10063) so clients know where to find their media. Blossom replaced the earlier NIP-96 HTTP file storage approach.
- **NIP Reference**: NIP-B7
- **See Also**: Relay, Event Kind, Metadata

### Bunker
A remote signing service that holds a user's private key and signs events on their behalf, accessed via the Nostr Connect protocol. The user's client never touches the private key directly; instead, it communicates signing requests to the bunker over encrypted NOSTR messages. This architecture improves key security by isolating the private key from potentially untrusted client applications.
- **NIP Reference**: NIP-46
- **See Also**: Nostr Connect, Private Key, nsec, window.nostr

---

## C

### Cashu
An ecash protocol integrated with NOSTR for lightweight, privacy-preserving token transfers. NOSTR's Cashu wallet specification (kind 7374-7376, kind 17375) defines how users manage ecash wallets using NOSTR events, including token storage, transaction history, and mint preferences. Cashu tokens can be sent peer-to-peer as Nutzaps, offering an alternative payment rail to Lightning.
- **NIP Reference**: NIP-60 (Cashu Wallet), NIP-61 (Nutzaps), NIP-87 (Ecash Mint Discoverability)
- **See Also**: Nutzap, Ecash, Zap, Lightning

### Client
An application (web, mobile, or desktop) that users interact with to read and write data on the NOSTR network. Clients connect to one or more relays via WebSocket, create and sign events with the user's private key, publish those events, and subscribe to events from other users. Clients determine the user experience and can implement any subset of NIPs; multiple clients can operate on the same user identity simultaneously.
- **NIP Reference**: NIP-01 (basic protocol flow)
- **See Also**: Relay, Event, WebSocket, Subscription

### CLOSE
A client-to-relay message that terminates a previously opened subscription. The client sends `["CLOSE", <subscription_id>]` to tell the relay to stop sending events for that subscription. After receiving CLOSE, the relay will no longer send EVENT messages for that subscription ID.
- **NIP Reference**: NIP-01
- **See Also**: REQ, Subscription, EOSE

### Contact List
The historical name for a user's follow list, stored as a kind 3 event. It contains `p` tags referencing the public keys of accounts the user follows, optionally with relay hints. The contact list is a replaceable event, meaning each new publication overwrites the previous one. Modern usage prefers the term "follow list."
- **NIP Reference**: NIP-02
- **See Also**: Follow List, p-tag, Replaceable Event

### Content Warning
A tag (`content-warning`) applied to events to indicate that the content may be sensitive or objectionable. Clients that support this tag can hide the content behind a warning screen, giving users the choice to view it. The tag value can contain a brief reason string describing why the content is flagged.
- **NIP Reference**: NIP-36
- **See Also**: Sensitive Content, Tag, Label

### Conversation Key
A shared secret derived from one party's private key and another party's public key using Elliptic Curve Diffie-Hellman (ECDH) on the secp256k1 curve. The conversation key is used as the basis for NIP-44 encryption and decryption of messages between two participants. Because ECDH is symmetric, both parties independently derive the same key without exchanging secrets.
- **NIP Reference**: NIP-44
- **See Also**: Encrypted Payload, Seal, Gift Wrap, secp256k1, HMAC

### Custom Emoji
A mechanism for defining and using custom emoji in NOSTR events via shortcode syntax (e.g., `:custom_emoji_name:`). Custom emoji are referenced by `emoji` tags that map shortcodes to image URLs. Users can maintain emoji sets (kind 30030) for their preferred custom emoji, and clients render these inline when displaying events.
- **NIP Reference**: NIP-30
- **See Also**: Tag, Event Kind, List

---

## D

### d-tag
A special tag (`["d", "<value>"]`) used in addressable events (kinds 30000-39999) to create a unique identifier within a given kind and pubkey combination. The d-tag value, together with the event kind and author pubkey, forms the "address" of an addressable event. Publishing a new event with the same kind, pubkey, and d-tag value replaces the previous event with that address.
- **NIP Reference**: NIP-01
- **See Also**: Addressable Event, Tag, Parameterized Replaceable Event, naddr

### Data Vending Machine (DVM)
A protocol for using NOSTR as a marketplace for computational services. Clients publish job request events (kinds 5000-5999) specifying work to be done (e.g., text translation, image generation, content recommendation), and DVM service providers respond with job result events (kinds 6000-6999). Job feedback events (kind 7000) provide status updates. DVMs enable a decentralized compute marketplace over NOSTR.
- **NIP Reference**: NIP-90
- **See Also**: Event Kind, Subscription, Filter

### Delegation
A deprecated mechanism that allowed one keypair to authorize another keypair to sign events on its behalf using a special `delegation` tag containing a signature and conditions. This approach has been superseded by NIP-26's unrecommended status, with modern alternatives like NIP-46 (Nostr Connect / Bunker) providing more secure delegation patterns.
- **NIP Reference**: NIP-26 (Unrecommended)
- **See Also**: Bunker, Nostr Connect, Signature

### Direct Message
A private message sent between two NOSTR users. The modern implementation (NIP-17) uses the Gift Wrap protocol (NIP-59) to encrypt the message content and obscure metadata such as the sender and recipient. Kind 14 events carry the actual message content inside sealed and gift-wrapped layers. The older NIP-04 encrypted DM system is deprecated due to metadata leakage.
- **NIP Reference**: NIP-17 (Private Direct Messages), NIP-04 (deprecated)
- **See Also**: Gift Wrap, Seal, Encrypted Payload, Conversation Key

---

## E

### e-tag
A tag (`["e", "<event_id>", "<relay_url>", "<marker>"]`) that references another event by its ID. The e-tag is used extensively for replies, mentions, reposts, reactions, and any event that relates to another event. Optional positional fields include a recommended relay URL and a marker (`root`, `reply`, `mention`) that indicates the relationship type within a thread.
- **NIP Reference**: NIP-01, NIP-10
- **See Also**: Tag, p-tag, Thread, Event ID

### Ecash
A general term for digital bearer tokens that provide privacy-preserving payments. In the NOSTR context, ecash refers specifically to Cashu tokens managed through NOSTR events. NIP-87 defines how ecash mints (Cashu and Fedimint) announce themselves on NOSTR, enabling discovery and interoperability. Ecash provides an alternative to Lightning for small-value transfers with stronger privacy.
- **NIP Reference**: NIP-60 (Cashu Wallet), NIP-87 (Ecash Mint Discoverability)
- **See Also**: Cashu, Nutzap, Lightning, Zap

### Encrypted Payload
The output of NIP-44's versioned encryption algorithm, which uses XChaCha20-Poly1305 authenticated encryption with a conversation key derived via ECDH. Encrypted payloads are placed in the `content` field of events such as seals (kind 13) and gift wraps (kind 1059). The payload format includes a version byte, nonce, ciphertext, and authentication tag, with padding applied to obscure message length.
- **NIP Reference**: NIP-44
- **See Also**: Conversation Key, Seal, Gift Wrap, HMAC

### Ephemeral Event
An event with a kind number in the range 20000-29999 that relays are not expected to store persistently. Ephemeral events are intended for real-time communication such as typing indicators, presence notifications, or authentication challenges. Relays should forward them to active subscribers but may discard them immediately after delivery.
- **NIP Reference**: NIP-01
- **See Also**: Event Kind, Subscription, AUTH

### EOSE
"End Of Stored Events" -- a relay-to-client message (`["EOSE", <subscription_id>]`) indicating that all events matching the subscription filter that were already stored on the relay have been sent. After EOSE, any subsequent EVENT messages on that subscription represent new, real-time events. Clients use EOSE to know when initial data loading is complete and to switch from "loading" to "live" state.
- **NIP Reference**: NIP-01
- **See Also**: REQ, Subscription, Filter, CLOSE

### Event
The fundamental data object in the NOSTR protocol. Every piece of data in NOSTR is an event -- a JSON object containing fields for `id`, `pubkey`, `created_at`, `kind`, `tags`, `content`, and `sig`. Events are cryptographically signed by their author and identified by a SHA-256 hash of their canonical serialization. Events are immutable once signed; they can only be created or (requested to be) deleted, never modified in place.
- **NIP Reference**: NIP-01
- **See Also**: Event ID, Event Kind, Tag, Signature, Public Key

### Event ID
A 32-byte (256-bit) identifier for an event, computed as the SHA-256 hash of the event's canonical JSON serialization: `[0, <pubkey>, <created_at>, <kind>, <tags>, <content>]`. The event ID is deterministic -- anyone can verify it by recomputing the hash. In bech32 encoding, event IDs are represented with the `note` prefix (for bare IDs) or `nevent` prefix (with relay hints).
- **NIP Reference**: NIP-01
- **See Also**: Event, note, nevent, Signature, SHA-256

### Event Kind
An integer field in every NOSTR event that determines the event's type and semantics. Kind numbers are grouped into ranges with different behavior: regular events (1, 2, 4-44, 1000-9999) are stored normally; replaceable events (0, 3, 10000-19999) are overwritten by newer events of the same kind and pubkey; ephemeral events (20000-29999) are not stored; and addressable events (30000-39999) are replaceable based on kind, pubkey, and d-tag. Each NIP defines one or more kinds.
- **NIP Reference**: NIP-01 (kind ranges), various NIPs (specific kinds)
- **See Also**: Event, Replaceable Event, Addressable Event, Ephemeral Event

---

## F

### Filter
A JSON object sent by clients inside REQ messages to specify which events they want to receive from a relay. Filters can match on `ids`, `authors`, `kinds`, `#<tag>` (tag values), `since`, `until`, and `limit`. Multiple filters can be sent in a single REQ; the relay returns events matching any of them. Filters are the primary query mechanism in the NOSTR protocol.
- **NIP Reference**: NIP-01
- **See Also**: REQ, Subscription, Relay, Event

### Follow List
A kind 3 replaceable event containing `p` tags for every public key a user follows. The follow list is the core social graph primitive in NOSTR, used by clients to populate timelines and by the outbox model to determine which relays to query. Each publication of a kind 3 event fully replaces the previous follow list. Historically called "contact list."
- **NIP Reference**: NIP-02
- **See Also**: Contact List, p-tag, Relay List, Outbox Model

---

## G

### Gift Wrap
A three-layer encryption protocol that protects both the content and metadata of a message. The innermost layer is a "rumor" (an unsigned event containing the actual content). The rumor is encrypted and placed inside a "seal" (kind 13), which is signed by the real author. The seal is then encrypted and placed inside a "gift wrap" (kind 1059), which is signed by a random, disposable key. This construction hides the sender, recipient, and content from relay operators and observers.
- **NIP Reference**: NIP-59
- **See Also**: Seal, Direct Message, Encrypted Payload, Conversation Key, Rumor

---

## H

### Highlight
A mechanism for users to mark and share notable excerpts from long-form content or other text on NOSTR. Highlights are published as kind 9802 events containing the selected text in the content field, with tags referencing the source event or URL. They function similarly to annotations or bookmarks with public visibility.
- **NIP Reference**: NIP-84
- **See Also**: Long-form Content, Tag, e-tag

### HMAC
Hash-based Message Authentication Code, used within NIP-44's encryption scheme to ensure message integrity and authenticity. The HMAC is computed over the ciphertext using a key derived from the conversation key, and it is verified before decryption to detect any tampering. NIP-44 uses HMAC-SHA256 as part of its authenticated encryption construction.
- **NIP Reference**: NIP-44
- **See Also**: Encrypted Payload, Conversation Key, Signature

---

## K

### Kind
See **Event Kind**. The integer `kind` field of a NOSTR event that determines its type, semantics, and storage behavior. Common kinds include: 0 (user metadata), 1 (short text note), 3 (follows), 5 (deletion request), 6 (repost), 7 (reaction), 1059 (gift wrap), 9734/9735 (zap request/receipt), 30023 (long-form content).
- **NIP Reference**: NIP-01
- **See Also**: Event Kind, Event

---

## L

### Label
A general-purpose annotation mechanism that allows users and automated systems to tag events, pubkeys, or other content with structured metadata. Labels (kind 1985) use `L` (namespace) and `l` (value) tags to categorize content. Labels can be used for content moderation, classification, topic tagging, quality scoring, and other purposes without modifying the original events.
- **NIP Reference**: NIP-32
- **See Also**: Tag, Content Warning, Sensitive Content

### Lightning
The Bitcoin Lightning Network, a layer-2 payment network used for instant, low-fee transactions. NOSTR integrates with Lightning primarily through zaps (NIP-57) and Nostr Wallet Connect (NIP-47), enabling users to send and receive Bitcoin payments directly within NOSTR clients. Lightning is the most widely adopted payment rail in the NOSTR ecosystem.
- **NIP Reference**: NIP-57 (Zaps), NIP-47 (Wallet Connect)
- **See Also**: Zap, Zap Request, Zap Receipt, NWC (Nostr Wallet Connect)

### List
A general mechanism for users to maintain categorized collections of pubkeys, events, relays, hashtags, and other references. Lists are published as replaceable or addressable events with kind numbers in the 10000 and 30000 ranges. Specific list types include mute lists (kind 10000), pin lists (kind 10001), bookmark lists (kind 10003), relay lists (kind 10002), follow sets (kind 30000), relay sets (kind 30002), and many others. Lists can be public or have their entries encrypted in the content field for privacy.
- **NIP Reference**: NIP-51
- **See Also**: Mute List, Follow List, Relay List, Relay Set, Addressable Event

### Long-form Content
Articles and blog posts published on NOSTR as kind 30023 addressable events. Long-form content supports Markdown formatting, has a `d` tag for a unique slug, and can include metadata tags for title, summary, image, and publication date. Draft long-form content uses kind 30024. This enables NOSTR to function as a decentralized blogging platform.
- **NIP Reference**: NIP-23
- **See Also**: Addressable Event, d-tag, Highlight, Text Note

---

## M

### Marketplace
A decentralized commerce protocol built on NOSTR events. Merchants create stalls (kind 30017) and products (kind 30018), buyers place orders through direct messages, and the entire transaction lifecycle is managed via NOSTR events. The marketplace specification supports auctions (kind 30020) and custom UI/UX definitions (kind 30019). Payments typically occur via Lightning or ecash.
- **NIP Reference**: NIP-15
- **See Also**: Lightning, Cashu, Addressable Event

### Mention
A reference to another user or event within a NOSTR event's content. Modern mentions use `nostr:` URI scheme references inline (e.g., `nostr:npub1...` or `nostr:nevent1...`), which clients render as clickable links or embedded previews. The referenced entities should also appear in the event's tags. The older NIP-08 mention system using `#[index]` notation is deprecated.
- **NIP Reference**: NIP-27 (Text Note References), NIP-21 (URI Scheme)
- **See Also**: e-tag, p-tag, URI Scheme, Tag

### Metadata
User profile information published as a kind 0 replaceable event. The content field contains a JSON object with fields such as `name`, `about`, `picture`, `banner`, `nip05`, `lud16` (Lightning address), and `website`. Since kind 0 is replaceable, each new metadata publication overwrites the previous profile. Additional metadata fields are defined in NIP-24.
- **NIP Reference**: NIP-01 (kind 0), NIP-24 (extra fields)
- **See Also**: Replaceable Event, NIP-05, Event Kind

### Mnemonic
A set of 12 or 24 words (from the BIP-39 word list) that can be used to derive a NOSTR keypair deterministically. The mnemonic seed phrase provides a human-friendly backup mechanism for private keys. The derivation path follows BIP-32/BIP-44 conventions with a NOSTR-specific coin type (1237).
- **NIP Reference**: NIP-06
- **See Also**: Private Key, Public Key, secp256k1

### Mute List
A kind 10000 replaceable event containing public keys, event IDs, keywords, or hashtags that a user wants to suppress from their feed. Public entries appear in tags; private entries can be encrypted in the content field. Clients use mute lists to filter content before display. Kind mute sets (kind 30007) allow muting specific event kinds.
- **NIP Reference**: NIP-51
- **See Also**: List, Filter, Tag

---

## N

### naddr
A bech32-encoded string (prefixed `naddr`) that identifies an addressable event by its kind, pubkey, d-tag value, and optionally one or more relay hints. Unlike `nevent` which references an event by ID, `naddr` references an event by its replaceable address, meaning it always points to the latest version. The encoding uses TLV (type-length-value) format to pack the metadata.
- **NIP Reference**: NIP-19
- **See Also**: Addressable Event, d-tag, Bech32, TLV, nevent

### Negentropy
A set reconciliation protocol used for efficient syncing of events between clients and relays (or between relays). Rather than transferring full event sets or all event IDs, Negentropy uses range-based set reconciliation to identify differences with minimal bandwidth. Messages are binary (hex-encoded for NOSTR transport) and exchanged as a protocol extension. This dramatically reduces sync overhead for large event stores.
- **NIP Reference**: NIP-77
- **See Also**: Relay, Subscription, Filter

### nevent
A bech32-encoded string (prefixed `nevent`) that identifies a specific event by its ID, along with optional relay hints, author pubkey, and kind metadata encoded in TLV format. Unlike the bare `note` encoding, `nevent` carries enough context for a client to locate and fetch the referenced event. It is the preferred way to share references to specific events.
- **NIP Reference**: NIP-19
- **See Also**: Event ID, note, Bech32, TLV, naddr

### NIP
"Nostr Implementation Possibilities" -- documents that specify protocol features, event kinds, message formats, and conventions for NOSTR-compatible software. NIPs are the specification layer of NOSTR, analogous to RFCs or BIPs. They describe what MUST, SHOULD, and MAY be implemented. Each NIP is numbered (some using hexadecimal) and has a status of Active, Unrecommended, or Draft. The NIP repository on GitHub is the canonical source.
- **NIP Reference**: N/A (meta-concept)
- **See Also**: Event Kind, Tag, Relay

### NIP-05
A specification that maps NOSTR public keys to human-readable internet identifiers using DNS and HTTP. A NIP-05 identifier looks like `user@domain.com` and is verified by fetching `https://domain.com/.well-known/nostr.json?name=user` and confirming it returns the expected public key. NIP-05 provides a decentralized, domain-based naming layer without introducing trusted third parties for key custody.
- **NIP Reference**: NIP-05
- **See Also**: Public Key, Metadata, npub

### NIP-19
The specification for bech32-encoded NOSTR entities. It defines the encoding format and prefix conventions for `npub` (public keys), `nsec` (private keys), `note` (event IDs), `nprofile` (profiles with relay hints), `nevent` (events with metadata), `naddr` (addressable event coordinates), and `nrelay` (relay URLs). TLV encoding is used for the shareable entity types that carry additional metadata.
- **NIP Reference**: NIP-19
- **See Also**: Bech32, npub, nsec, note, nprofile, nevent, naddr, TLV

### note
A bech32-encoded string (prefixed `note`) representing a bare event ID without any additional metadata. The `note` encoding is the simplest way to reference a specific event but does not include relay hints, making it harder for clients to locate the event. For sharing, `nevent` is generally preferred as it includes relay and author context.
- **NIP Reference**: NIP-19
- **See Also**: Event ID, nevent, Bech32

### Nostr Connect
A protocol (also called "remote signing" or "bunker protocol") that allows a client to request event signing from a remote signer without ever accessing the private key. Communication occurs over encrypted NOSTR messages (kind 24133) between the client and the signer. The protocol supports methods like `sign_event`, `get_public_key`, `nip44_encrypt`, and `nip44_decrypt`. Connection is initiated via `bunker://` or `nostrconnect://` URIs.
- **NIP Reference**: NIP-46
- **See Also**: Bunker, Private Key, window.nostr

### npub
A bech32-encoded NOSTR public key, prefixed with `npub1`. This is the standard human-readable format for sharing a user's identity. The encoding wraps the raw 32-byte (hex) public key with error detection. Example: `npub1qqqqqq...`. The `npub` format does not include relay hints; use `nprofile` when relay context is needed.
- **NIP Reference**: NIP-19
- **See Also**: Public Key, nsec, nprofile, Bech32

### nprofile
A bech32-encoded string (prefixed `nprofile`) containing a user's public key plus one or more relay URLs where their events can be found, encoded in TLV format. The `nprofile` encoding is preferred over bare `npub` when sharing user identifiers because it tells the recipient's client where to look for that user's data.
- **NIP Reference**: NIP-19
- **See Also**: npub, Public Key, Bech32, TLV, Relay

### nsec
A bech32-encoded NOSTR private (secret) key, prefixed with `nsec1`. This encoding wraps the raw 32-byte private key. The `nsec` should never be shared publicly or entered into untrusted applications. Best practice is to use a signer (NIP-07, NIP-46, NIP-55) rather than directly handling nsec values. Encrypted storage of nsec is defined in NIP-49.
- **NIP Reference**: NIP-19, NIP-49 (encrypted storage)
- **See Also**: Private Key, npub, Bunker, Nostr Connect

### Nutzap
A peer-to-peer payment mechanism that sends Cashu ecash tokens as zaps on NOSTR. The sender mints or swaps Cashu tokens locked to the recipient's public key (using P2PK), then publishes a kind 9321 event containing the token proofs. The recipient redeems the tokens at the specified mint. Nutzaps require the recipient to publish a kind 10019 event listing their trusted mints.
- **NIP Reference**: NIP-61
- **See Also**: Cashu, Ecash, Zap, Lightning

### NWC (Nostr Wallet Connect)
A protocol that connects NOSTR clients to Lightning wallets via NOSTR events, enabling in-app payments without exposing wallet credentials. The wallet service publishes a kind 13194 info event describing its capabilities. Clients send encrypted payment requests (kind 23194) and receive encrypted responses (kind 23195). NWC enables any NOSTR client to initiate Lightning payments through a user's preferred wallet.
- **NIP Reference**: NIP-47
- **See Also**: Lightning, Zap, Wallet

---

## O

### OK Message
A relay-to-client message (`["OK", <event_id>, <accepted>, <message>]`) sent in response to an EVENT submission. The boolean `accepted` field indicates whether the relay stored the event, and the `message` field provides a human-readable reason if rejected (e.g., "blocked: content policy", "duplicate:", "pow: difficulty too low"). Clients use OK messages to confirm successful publication or diagnose failures.
- **NIP Reference**: NIP-01
- **See Also**: Event, Relay, REQ

### Outbox Model
The recommended architecture pattern for NOSTR clients to efficiently discover and fetch events. In the outbox model, users declare which relays they write to (via kind 10002 relay list metadata), and followers read from those declared relays. This avoids the need to query every known relay and ensures content reaches the intended audience. The outbox model is considered essential for building censorship-resistant, scalable clients.
- **NIP Reference**: NIP-65
- **See Also**: Relay List, Follow List, Relay, Client

---

## P

### p-tag
A tag (`["p", "<pubkey>", "<relay_url>"]`) that references another user by their public key. The p-tag is used in reactions, replies, mentions, zaps, direct messages, follow lists, and virtually any event that involves another user. The optional relay URL hint tells clients where to find the referenced user's events. Multiple p-tags can appear in a single event.
- **NIP Reference**: NIP-01, NIP-10
- **See Also**: Tag, e-tag, Public Key, Mention

### Parameterized Replaceable Event
The original (now largely synonymous) term for addressable events -- events in the kind range 30000-39999 that are replaceable based on the combination of kind, pubkey, and d-tag value. The term "parameterized" refers to the d-tag acting as a parameter that distinguishes between multiple replaceable events of the same kind from the same author. Modern NOSTR documentation increasingly uses "addressable event" instead.
- **NIP Reference**: NIP-01
- **See Also**: Addressable Event, d-tag, Replaceable Event

### Petname
A user-assigned local nickname for another user's public key. Petnames exist only on the client side and are not published to relays, allowing users to maintain their own private address book of meaningful names for contacts regardless of what those contacts call themselves. Some clients store petnames in the follow list's tag entries.
- **NIP Reference**: NIP-02
- **See Also**: Follow List, Metadata, NIP-05

### Poll
A mechanism for creating and responding to polls on NOSTR. Poll events (kind 1068) contain the question and options, while poll response events (kind 1018) record individual votes. Polls can support single-choice or multiple-choice voting. The poll creator can optionally restrict voting or require zaps as votes.
- **NIP Reference**: NIP-88
- **See Also**: Event Kind, Reaction, Zap

### Private Key
A 32-byte secret number that serves as a user's master credential in NOSTR. The private key is used to sign events (producing Schnorr signatures), derive the corresponding public key, and compute conversation keys for encryption. Possession of the private key is equivalent to full control of the identity. Private keys should be stored securely, preferably in signers or encrypted (NIP-49), and never shared.
- **NIP Reference**: NIP-01 (signing), NIP-06 (derivation), NIP-49 (encryption)
- **See Also**: nsec, Public Key, Schnorr Signature, secp256k1, Mnemonic

### Proof of Work
A mechanism that requires event creators to perform computational work (finding a nonce that produces an event ID with a certain number of leading zero bits) before publishing. Relays can require minimum proof of work to mitigate spam and denial-of-service attacks. The difficulty is specified as the number of leading zero bits in the event ID, indicated by a `nonce` tag.
- **NIP Reference**: NIP-13
- **See Also**: Event ID, Tag, Relay, Spam

### Protected Event
An event that includes a `-` tag (`["-"]`), signaling to relays that it should only be accepted from the event's author (verified via AUTH). Protected events prevent unauthorized republishing -- even though events are publicly signed and verifiable, a relay honoring the `-` tag will reject the event if submitted by anyone other than the original signer. This is useful for events intended only for specific relays.
- **NIP Reference**: NIP-70
- **See Also**: AUTH, Tag, Relay, Signature

### Proxy Tag
A tag (`["proxy", "<url>", "<protocol>"]`) that indicates an event was bridged from another protocol (such as ActivityPub, RSS, or ATProto). The proxy tag contains the original identifier and protocol name, enabling clients to link back to the source and avoid duplicate content. This facilitates interoperability between NOSTR and other networks.
- **NIP Reference**: NIP-48
- **See Also**: Tag, Event

### Public Chat
A channel-based group messaging system built on NOSTR events. Channel creation (kind 40), metadata updates (kind 41), and messages (kind 42) are all regular events published to relays. Channel messages reference the channel creation event. Channels also support message hiding (kind 43) and user muting (kind 44) by channel operators.
- **NIP Reference**: NIP-28
- **See Also**: Direct Message, Event Kind, Tag

### Public Key
A 32-byte value derived from the private key on the secp256k1 elliptic curve, serving as a user's unique identifier on NOSTR. The public key appears in the `pubkey` field of every event and is used by others to verify signatures, encrypt messages, and reference the user in tags. In human-readable form, it is encoded as an `npub` string. A user's NOSTR identity IS their public key.
- **NIP Reference**: NIP-01
- **See Also**: npub, Private Key, secp256k1, Schnorr Signature

---

## R

### Reaction
A kind 7 event expressing a response to another event, typically a like ("+"), dislike ("-"), or emoji. Reactions reference the target event with an `e` tag and the target author with a `p` tag. The content field contains the reaction symbol. Custom emoji reactions are supported via NIP-30. Kind 17 events represent reactions to websites (URLs). Reactions are one of the most common social interaction primitives on NOSTR.
- **NIP Reference**: NIP-25
- **See Also**: e-tag, p-tag, Custom Emoji, Event Kind

### Relay
A server that receives, stores, and serves NOSTR events over WebSocket connections. Relays implement the server side of the NOSTR protocol: accepting EVENT messages from clients, processing REQ subscriptions and returning matching events, and sending real-time updates. Each relay independently decides which events to store, for how long, and which users to serve. Users typically connect to multiple relays for redundancy and reach. Relays do NOT relay events to each other by default (unlike nodes in peer-to-peer networks); clients are responsible for distributing events.
- **NIP Reference**: NIP-01
- **See Also**: WebSocket, Client, Subscription, Filter, Outbox Model

### Relay Information Document
A JSON document served by a relay at its HTTP endpoint (using `Accept: application/nostr+json` header) that describes the relay's capabilities, policies, and metadata. The document includes fields like `name`, `description`, `pubkey` (operator), `contact`, `supported_nips`, `software`, `version`, and various policy limits (max message length, max subscriptions, etc.). Clients use this to determine relay compatibility.
- **NIP Reference**: NIP-11
- **See Also**: Relay, NIP

### Relay List
A kind 10002 replaceable event in which a user declares the relays they use for reading and writing. Each relay entry is an `r` tag with an optional `read` or `write` marker. This event is the foundation of the outbox model, enabling other clients to discover where a user publishes and where to send events directed at them. Also called "relay list metadata."
- **NIP Reference**: NIP-65, NIP-51
- **See Also**: Outbox Model, Relay, List, Follow List

### Relay Set
An addressable event (kind 30002) that defines a named collection of relays for a specific purpose. Unlike the user's primary relay list (kind 10002), relay sets allow users to maintain multiple curated groups of relays (e.g., "media relays," "DM relays," "search relays"). Relay sets are part of the broader lists system.
- **NIP Reference**: NIP-51
- **See Also**: Relay List, List, Addressable Event

### Replaceable Event
An event with a kind number in the ranges 0, 3, or 10000-19999 where only the latest event per kind and pubkey is considered valid. When a relay receives a newer replaceable event, it may discard the older one. This mechanism is used for data that has only one current value per user, such as profile metadata (kind 0), follow lists (kind 3), mute lists (kind 10000), and relay lists (kind 10002). Addressable events extend this concept with the d-tag.
- **NIP Reference**: NIP-01
- **See Also**: Addressable Event, Event Kind, Metadata, Follow List

### Repost
A kind 6 event that shares another user's text note (kind 1) with one's own followers. The reposted event's ID is referenced in an `e` tag, and the original author in a `p` tag. The content field may contain the full JSON of the reposted event for convenience. Kind 16 extends this to generic reposts of any event kind. Reposts are NOSTR's equivalent of retweets.
- **NIP Reference**: NIP-18
- **See Also**: e-tag, p-tag, Text Note, Event Kind

### REQ
A client-to-relay message (`["REQ", <subscription_id>, <filter1>, <filter2>, ...]`) that opens a subscription for events matching the specified filters. The relay responds with stored matching events, followed by an EOSE message, and then continues to send new matching events in real-time until the subscription is closed. Multiple filters in a single REQ are OR-combined.
- **NIP Reference**: NIP-01
- **See Also**: Filter, Subscription, EOSE, CLOSE, Event

### Rumor
An unsigned NOSTR event (a JSON object with all standard fields except `sig` is absent or empty). Rumors are used as the innermost layer of the Gift Wrap protocol -- the actual message content is serialized as a rumor, then encrypted and placed inside a Seal. Because rumors lack a valid signature, they cannot be verified or published independently, providing deniability.
- **NIP Reference**: NIP-59
- **See Also**: Gift Wrap, Seal, Direct Message

---

## S

### Schnorr Signature
The digital signature scheme used by NOSTR, specifically BIP-340 Schnorr signatures over the secp256k1 curve. Every NOSTR event includes a 64-byte Schnorr signature in its `sig` field, computed over the event ID (which is the SHA-256 hash of the event's canonical serialization). Schnorr signatures are compact, support batch verification, and are the same signature scheme used by Bitcoin's Taproot.
- **NIP Reference**: NIP-01
- **See Also**: Signature, secp256k1, Event ID, Private Key, Public Key

### Seal
A kind 13 event used in the Gift Wrap protocol that contains an encrypted rumor in its content field. The seal is signed by the actual author of the message, but its content is encrypted to the recipient's public key so only the recipient can read the inner rumor. The seal's tags do not reveal the recipient (no `p` tag), providing sender-only identification to relay observers.
- **NIP Reference**: NIP-59
- **See Also**: Gift Wrap, Rumor, Encrypted Payload, Conversation Key

### secp256k1
The specific elliptic curve used for all NOSTR cryptography, including key generation, Schnorr signatures (BIP-340), and ECDH key agreement (for NIP-44 encryption). It is the same curve used by Bitcoin. NOSTR public keys are 32-byte x-only representations of points on this curve. The curve's properties ensure that deriving a private key from a public key is computationally infeasible.
- **NIP Reference**: NIP-01 (implicit), NIP-44 (ECDH)
- **See Also**: Schnorr Signature, Public Key, Private Key, Conversation Key

### Sensitive Content
Content flagged with a `content-warning` tag to indicate material that some users may find objectionable or that requires viewer discretion. Clients supporting NIP-36 hide such content behind a warning overlay by default. The tag value can describe the nature of the sensitivity (e.g., "nudity", "spoiler", "violence"). Users can configure their clients to auto-show or always-hide sensitive content.
- **NIP Reference**: NIP-36
- **See Also**: Content Warning, Label, Tag

### Signature
The 64-byte Schnorr signature (`sig` field) attached to every NOSTR event, proving that the event was created by the holder of the corresponding private key. Signatures are computed over the event ID using BIP-340. Anyone with the event's public key can verify the signature, ensuring authenticity and integrity. An event with an invalid signature must be rejected by relays and clients.
- **NIP Reference**: NIP-01
- **See Also**: Schnorr Signature, Event ID, Private Key, Public Key

### Subscription
A persistent connection-level request from a client to a relay, created by a REQ message and identified by a subscription ID string. A subscription tells the relay to send all matching stored events (followed by EOSE) and then continue sending new matching events in real-time. Subscriptions remain active until the client sends a CLOSE message or disconnects. Each WebSocket connection can have multiple concurrent subscriptions.
- **NIP Reference**: NIP-01
- **See Also**: REQ, Filter, EOSE, CLOSE, WebSocket

---

## T

### Tag
An array element in an event's `tags` field, structured as `["<tag_name>", "<value1>", "<value2>", ...]`. Tags are the primary mechanism for adding structured metadata, references, and relationships to events. Standard tags include `e` (event reference), `p` (pubkey reference), `d` (identifier for addressable events), `t` (hashtag), `r` (reference/relay), `a` (addressable event reference), `nonce` (proof of work), and many NIP-specific tags. Tags are indexable by relays for efficient querying.
- **NIP Reference**: NIP-01, various NIPs
- **See Also**: e-tag, p-tag, d-tag, Filter

### Text Note
A kind 1 event containing a short-form text message, the most basic content type in NOSTR and the equivalent of a tweet or post. Text notes can contain plain text, `nostr:` URI mentions, hashtags, and URLs. They form the backbone of NOSTR's microblogging functionality. Text notes can reference other notes via e-tags to form threads.
- **NIP Reference**: NIP-01, NIP-10
- **See Also**: Event Kind, Thread, Long-form Content, Mention

### Thread
A hierarchical chain of events linked by `e` tags with `root` and `reply` markers, forming a conversation tree. The root event starts the thread, and subsequent reply events reference both the root (for thread grouping) and their immediate parent (for nesting). NIP-10 defines the threading conventions for text notes, while NIP-7D defines a dedicated kind 11 thread event type.
- **NIP Reference**: NIP-10, NIP-7D
- **See Also**: e-tag, Text Note, Event Kind

### TLV
Type-Length-Value, a binary encoding format used in NIP-19 bech32 entities (`nprofile`, `nevent`, `naddr`, `nrelay`) to pack multiple pieces of metadata into a single encoded string. Each TLV entry consists of a 1-byte type identifier, a 1-byte length, and a variable-length value. Defined types include: `0` for special (pubkey, event ID, or d-tag depending on context), `1` for relay URL, `2` for author pubkey, and `3` for kind number.
- **NIP Reference**: NIP-19
- **See Also**: Bech32, nprofile, nevent, naddr

---

## U

### URI Scheme
The `nostr:` URI scheme used for referencing NOSTR entities within text content. URIs take the form `nostr:<bech32_entity>` (e.g., `nostr:npub1...`, `nostr:nevent1...`, `nostr:naddr1...`). Clients parse these URIs and render them as clickable profile links, embedded notes, or other appropriate UI elements. The URI scheme enables rich content references without relying on platform-specific formatting.
- **NIP Reference**: NIP-21
- **See Also**: Bech32, NIP-19, Mention, npub, nevent, naddr

### User Status
A mechanism for users to publish short-lived status messages (kind 30315) indicating what they are currently doing, listening to, or their general availability. User statuses are addressable events with a `d` tag specifying the status type (e.g., "general", "music"). They can include expiration tags and references to external content like songs or activities.
- **NIP Reference**: NIP-38
- **See Also**: Addressable Event, Metadata, Tag

---

## V

### Vanish
A request (kind 62 event) from a user to relays asking them to delete all of that user's stored events. The Request to Vanish is a courtesy mechanism -- relays SHOULD honor it by purging the requester's events, but compliance is voluntary since NOSTR is a decentralized protocol and relays operate independently. The vanish event includes relay hints and is intended as a "right to be forgotten" signal.
- **NIP Reference**: NIP-62
- **See Also**: Relay, Event, Protected Event

---

## W

### Web of Trust
A decentralized trust model where users' social graphs (follow lists, mute lists, reactions) create implicit trust networks. In NOSTR, Web of Trust (WoT) is not defined by a single NIP but emerges from the social graph data available on the protocol. Clients and relays can use WoT metrics (e.g., "follows of follows," mutual follow counts) to rank content, filter spam, and make content moderation decisions without relying on centralized authorities.
- **NIP Reference**: No single NIP; built on NIP-02 (Follow List), NIP-51 (Lists), NIP-32 (Labels)
- **See Also**: Follow List, Mute List, Label, Relay

### WebSocket
The transport protocol used for all client-relay communication in NOSTR. Clients establish persistent WebSocket connections (using the `wss://` scheme) to relays and exchange JSON messages over these connections. WebSockets provide full-duplex communication, enabling relays to push new events to clients in real-time. A single client typically maintains WebSocket connections to multiple relays simultaneously.
- **NIP Reference**: NIP-01
- **See Also**: Relay, Client, Subscription

### Wiki
A collaborative knowledge base system built on NOSTR where users publish wiki articles as kind 30818 addressable events. Articles are identified by their `d` tag (the article title/slug) and can be edited by anyone, with each author's version stored separately. Merge requests (kind 818) enable editorial workflows. NIP-54 also defines redirects (kind 30819) for article renaming.
- **NIP Reference**: NIP-54
- **See Also**: Addressable Event, Long-form Content, d-tag

### window.nostr
A JavaScript API specification that browser extensions (such as nos2x, Alby, or Nostr Connect adapters) inject into web pages at `window.nostr`. The API provides methods like `getPublicKey()`, `signEvent(event)`, `nip44.encrypt()`, and `nip44.decrypt()`, allowing web-based NOSTR clients to request cryptographic operations without ever accessing the user's private key directly. This is the primary signer interface for web clients.
- **NIP Reference**: NIP-07
- **See Also**: Bunker, Nostr Connect, Private Key, Client

---

## Z

### Zap
A Lightning Network payment sent through the NOSTR protocol, creating a publicly verifiable payment receipt on the network. The zap flow involves the sender's client creating a zap request (kind 9734), sending it to the recipient's Lightning address (LNURL server), which generates a Lightning invoice. Upon payment, the recipient's LNURL server publishes a zap receipt (kind 9735) to relays. Zaps are the primary tipping/payment mechanism in the NOSTR social layer.
- **NIP Reference**: NIP-57
- **See Also**: Zap Request, Zap Receipt, Lightning, NWC (Nostr Wallet Connect)

### Zap Goal
A kind 9041 event that sets a fundraising target, allowing users to crowdfund a specific amount of satoshis for a stated purpose. Zap goals include a target amount and description; clients can display progress toward the goal by summing zap receipts that reference the goal event. Zap goals enable transparent, decentralized fundraising campaigns on NOSTR.
- **NIP Reference**: NIP-75
- **See Also**: Zap, Zap Receipt, Lightning

### Zap Receipt
A kind 9735 event published by a recipient's LNURL server (or compatible service) after a Lightning payment is confirmed. The zap receipt contains the original zap request, the payment preimage (bolt11 invoice), and the amount paid. It serves as a publicly verifiable proof of payment on the NOSTR network. Clients display zap receipts as social signals on events and profiles.
- **NIP Reference**: NIP-57
- **See Also**: Zap, Zap Request, Lightning

### Zap Request
A kind 9734 event created by the sender's client when initiating a zap. The zap request includes tags referencing the target event or user, the desired amount, and the relays where the zap receipt should be published. This event is sent to the recipient's LNURL server, which uses it to generate a Lightning invoice and, after payment, to construct the corresponding zap receipt.
- **NIP Reference**: NIP-57
- **See Also**: Zap, Zap Receipt, Lightning, LNURL

---

## Additional Protocol Terms

### CLOSED
A relay-to-client message (`["CLOSED", <subscription_id>, <message>]`) indicating that a subscription has been terminated by the relay, along with a machine-readable reason. Common reasons include authentication requirements (`auth-required:`), rate limiting, or policy restrictions. Unlike EOSE, CLOSED means the subscription is fully terminated and no further events will be sent.
- **NIP Reference**: NIP-01
- **See Also**: REQ, EOSE, Subscription, AUTH

### Comment
A kind 1400 event that provides a universal commenting mechanism for any NOSTR event, web URL, or external resource. Comments use specific tags to reference their target and support threading. NIP-22 unifies the commenting pattern across all content types (articles, videos, images, etc.) rather than requiring each content kind to define its own reply mechanism.
- **NIP Reference**: NIP-22
- **See Also**: Thread, e-tag, Text Note, Long-form Content

### COUNT
A client-to-relay message requesting the count of events matching specified filters, without returning the events themselves. The relay responds with a COUNT message containing the result. This is useful for displaying notification badges, follower counts, or reaction totals without transferring full event data.
- **NIP Reference**: NIP-45
- **See Also**: REQ, Filter, Relay

### Deletion Request
A kind 5 event requesting that relays delete previously published events. The deletion request includes `e` tags or `a` tags referencing the events to be deleted, and optionally a `k` tag specifying the kind. Relays SHOULD delete the referenced events and SHOULD prevent their future re-storage. However, deletion is a request, not a guarantee -- events may persist on relays that do not honor deletions.
- **NIP Reference**: NIP-09
- **See Also**: Event, Relay, Vanish, Protected Event

### Draft Event
A kind 31234 addressable event used to store unpublished drafts of any event kind. Drafts allow users to save work-in-progress events (articles, posts, etc.) across client sessions. The draft content can be encrypted for privacy. When ready to publish, the client creates the final event from the draft and optionally deletes the draft.
- **NIP Reference**: NIP-37
- **See Also**: Long-form Content, Addressable Event

### Expiration
A tag (`["expiration", "<unix_timestamp>"]`) that indicates when an event should be considered expired. Relays MAY delete expired events, and clients SHOULD NOT display them after the expiration time. Expiration is advisory; there is no protocol-level guarantee that expired events will be purged from all relays.
- **NIP Reference**: NIP-40
- **See Also**: Tag, Ephemeral Event, Relay

### LNURL
A protocol for simplifying Lightning Network payment flows using HTTP callbacks. In the NOSTR context, LNURL (specifically `lud16` Lightning Addresses) is used by the zap protocol: when a client initiates a zap, it contacts the recipient's LNURL server to generate a Lightning invoice. The LNURL server also publishes the zap receipt. LNURL is external to NOSTR but essential to the zap ecosystem.
- **NIP Reference**: NIP-57 (uses LNURL)
- **See Also**: Zap, Lightning, Zap Request, Zap Receipt

### NOTICE
A relay-to-client message (`["NOTICE", <message>]`) containing a human-readable string for informational or error purposes. Notices are not machine-parseable in a standardized way and are primarily used for debugging or operator messages. Clients may display notices to users or log them.
- **NIP Reference**: NIP-01
- **See Also**: OK Message, CLOSED, Relay

### Relay-based Groups
A group communication system where the relay acts as the authority for group management and message ordering. Groups are identified by a relay URL plus a group ID, and the relay controls membership, permissions, and content moderation. Group events (kinds 9000-9030 for control, 39000-39099 for metadata) are specific to the hosting relay. This model trades some decentralization for better UX in group settings.
- **NIP Reference**: NIP-29
- **See Also**: Public Chat, Relay, Direct Message

### SHA-256
The cryptographic hash function used to compute NOSTR event IDs. The event ID is the SHA-256 hash of the canonical JSON serialization `[0, <pubkey>, <created_at>, <kind>, <tags>, <content>]`. SHA-256 produces a 256-bit (32-byte) digest, ensuring that any modification to the event data produces a completely different ID. SHA-256 is also used internally in Schnorr signature computation and HMAC operations.
- **NIP Reference**: NIP-01 (implicit)
- **See Also**: Event ID, Schnorr Signature, HMAC

### Subject
A tag (`["subject", "<text>"]`) that adds a subject line or title to a text note, similar to an email subject. Clients can display the subject prominently when rendering events. While not widely used for kind 1 notes, subjects are more common in specific contexts like group messages and channels.
- **NIP Reference**: NIP-14
- **See Also**: Tag, Text Note, Thread

---

## Quick Reference: Event Kinds

| Kind | Name | NIP |
|------|------|-----|
| 0 | User Metadata | 01 |
| 1 | Short Text Note | 10 |
| 3 | Follows | 02 |
| 5 | Event Deletion Request | 09 |
| 6 | Repost | 18 |
| 7 | Reaction | 25 |
| 8 | Badge Award | 58 |
| 13 | Seal | 59 |
| 14 | Direct Message | 17 |
| 16 | Generic Repost | 18 |
| 40-44 | Public Chat (create, meta, msg, hide, mute) | 28 |
| 62 | Request to Vanish | 62 |
| 1059 | Gift Wrap | 59 |
| 1063 | File Metadata | 94 |
| 1068 | Poll | 88 |
| 1111 | Comment | 22 |
| 1985 | Label | 32 |
| 5000-5999 | DVM Job Request | 90 |
| 6000-6999 | DVM Job Result | 90 |
| 7000 | DVM Job Feedback | 90 |
| 9041 | Zap Goal | 75 |
| 9321 | Nutzap | 61 |
| 9734 | Zap Request | 57 |
| 9735 | Zap Receipt | 57 |
| 9802 | Highlight | 84 |
| 10000 | Mute List | 51 |
| 10002 | Relay List Metadata | 65 |
| 10003 | Bookmark List | 51 |
| 10019 | Nutzap Mint Recommendation | 61 |
| 10063 | User Server List (Blossom) | B7 |
| 13194 | NWC Wallet Info | 47 |
| 22242 | Client Authentication | 42 |
| 23194 | NWC Wallet Request | 47 |
| 23195 | NWC Wallet Response | 47 |
| 24133 | Nostr Connect | 46 |
| 30000 | Follow Sets | 51 |
| 30002 | Relay Sets | 51 |
| 30008 | Profile Badges | 58 |
| 30009 | Badge Definition | 58 |
| 30023 | Long-form Content | 23 |
| 30030 | Emoji Sets | 51 |
| 30078 | Application-specific Data | 78 |
| 30311 | Live Event | 53 |
| 30315 | User Statuses | 38 |
| 30402 | Classified Listing | 99 |
| 30818 | Wiki Article | 54 |
| 31234 | Draft Event | 37 |

## Quick Reference: Message Types

### Client to Relay
| Message | Purpose | NIP |
|---------|---------|-----|
| `EVENT` | Publish an event | 01 |
| `REQ` | Subscribe to events | 01 |
| `CLOSE` | End a subscription | 01 |
| `AUTH` | Authenticate to relay | 42 |
| `COUNT` | Request event counts | 45 |

### Relay to Client
| Message | Purpose | NIP |
|---------|---------|-----|
| `EVENT` | Send matching events | 01 |
| `OK` | Acknowledge event submission | 01 |
| `EOSE` | End of stored events | 01 |
| `CLOSED` | Subscription terminated | 01 |
| `NOTICE` | Human-readable message | 01 |
| `AUTH` | Authentication challenge | 42 |
| `COUNT` | Return event counts | 45 |

## Quick Reference: Bech32 Prefixes

| Prefix | Entity | Contains | NIP |
|--------|--------|----------|-----|
| `npub` | Public key | 32-byte pubkey | 19 |
| `nsec` | Private key | 32-byte secret key | 19 |
| `note` | Event ID | 32-byte event hash | 19 |
| `nprofile` | Profile + relays | Pubkey + relay hints (TLV) | 19 |
| `nevent` | Event + metadata | Event ID + relays + author + kind (TLV) | 19 |
| `naddr` | Addressable event | Kind + pubkey + d-tag + relays (TLV) | 19 |
| `nrelay` | Relay URL | Relay URL (TLV) | 19 |

---

> **Sources**: [NIP repository](https://github.com/nostr-protocol/nips), [nostr.com](https://nostr.com), [nips.nostr.com](https://nips.nostr.com), [nostr.how](https://nostr.how), [LearnNostr](https://www.learnnostr.org/definitions)
