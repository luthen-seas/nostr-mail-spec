# Getting Started with NOSTR

> A zero-to-hero introduction for developers who are new to NOSTR. No prior knowledge required.

---

## Table of Contents

- [What is NOSTR?](#what-is-nostr)
- [The 4 Core Concepts](#the-4-core-concepts)
- [Your First Steps](#your-first-steps)
  1. [Generate a Keypair](#step-1-generate-a-keypair)
  2. [Choose a Client](#step-2-choose-a-client)
  3. [Understand npub and nsec](#step-3-understand-npub-and-nsec)
  4. [Connect to Relays](#step-4-connect-to-relays)
  5. [Publish Your First Note](#step-5-publish-your-first-note)
  6. [Follow People](#step-6-follow-people)
  7. [Set Up NIP-05 Verification](#step-7-set-up-nip-05-verification)
- [Key Concepts Explained Simply](#key-concepts-explained-simply)
- [Common Questions](#common-questions)
- [Next Steps](#next-steps)

---

## What is NOSTR?

**In plain English:** NOSTR is a way to post things on the internet where no company controls your account. You create a secret key (like a password you never share), and that key IS your identity. You can post notes, messages, articles, or anything else to simple servers called "relays," and anyone running a NOSTR app can see them. No company can delete your account or lock you out, because your account is just a number that you hold.

**Slightly more technical:** NOSTR stands for "Notes and Other Stuff Transmitted by Relays." It is an open protocol -- like email (SMTP) or the web (HTTP) -- that defines how apps and servers communicate. It is not a single app or website. Many different apps all speak the same protocol, so they can all see the same posts, profiles, and social connections.

The protocol has three key properties:

1. **Decentralized** -- There is no central server. Many independent relay servers store and forward your data.
2. **Cryptographically signed** -- Everything you post is signed with your secret key. Nobody can fake your posts or tamper with them.
3. **Simple** -- The entire core protocol fits in one short spec document. A developer can build a basic client in an afternoon.

Think of it this way:

```
Traditional social media:        NOSTR:

  ┌─────────────────────┐        ┌───────┐  ┌───────┐  ┌───────┐
  │   Twitter / X       │        │Relay A│  │Relay B│  │Relay C│
  │                     │        └───┬───┘  └───┬───┘  └───┬───┘
  │  - Owns your account│            │          │          │
  │  - Controls content │        ┌───┴──────────┴──────────┴───┐
  │  - Can ban you      │        │  Open protocol (WebSocket)  │
  │  - Owns the data    │        └───┬──────────┬──────────┬───┘
  │                     │            │          │          │
  └─────────┬───────────┘        ┌───┴───┐  ┌──┴────┐  ┌─┴─────┐
            │                    │Client │  │Client │  │Client │
        ┌───┴───┐               │(Damus)│  │(Primal│  │(Ameth-│
        │ You   │               └───────┘  │  .net)│  │ yst)  │
        │(locked│                          └───────┘  └───────┘
        │  in)  │
        └───────┘               You hold your key. You choose
                                any client. You choose any relay.
    One company controls        Nobody controls everything.
    everything.
```

---

## The 4 Core Concepts

Everything in NOSTR comes down to four things: **keys**, **events**, **relays**, and **clients**.

### 1. Keys -- Your Identity

Your identity is a pair of cryptographic keys:

- **Secret key (nsec):** A long random number that only you know. It signs everything you post. Think of it as your master password that also proves you wrote something. **Never share it.**
- **Public key (npub):** A number mathematically derived from your secret key. This is your public identity -- like a username that nobody else can claim. Share it freely.

There is no "create an account" step on a server. You generate a keypair, and you exist on NOSTR.

### 2. Events -- The Universal Data Unit

Everything on NOSTR is an **event**. A text post is an event. Your profile info is an event. A like is an event. A direct message is an event. An event is a small JSON object that looks like this:

```json
{
  "id": "a1b2c3...",
  "pubkey": "your-public-key-in-hex",
  "created_at": 1711843200,
  "kind": 1,
  "tags": [],
  "content": "Hello, NOSTR!",
  "sig": "your-signature..."
}
```

The `kind` number tells apps what type of event it is. Kind 1 is a short text note (like a tweet). Kind 0 is your profile. Kind 7 is a reaction (like a "like"). There are hundreds of kinds for different purposes.

### 3. Relays -- The Servers

Relays are simple servers that store events and serve them to anyone who asks. They communicate over WebSocket connections (persistent, real-time connections).

Key things to know about relays:

- **Anyone can run one.** They range from free public relays to paid/private ones.
- **They are interchangeable.** If one goes down, you just use another.
- **They are dumb on purpose.** They store and forward events. The intelligence lives in the clients.
- **They cannot forge your posts.** Every event carries a cryptographic signature that anyone can verify.

You typically connect to several relays at once for redundancy.

### 4. Clients -- The Apps

Clients are the apps you actually use -- mobile apps, web apps, desktop apps. They create events, sign them with your key, send them to relays, and fetch events from relays to show you.

Because NOSTR is a protocol, there are many different clients. You can switch between them freely, and they all see the same data:

| Platform | Popular Clients |
|----------|----------------|
| iOS | [Damus](https://damus.io), [Primal](https://primal.net), [Nostur](https://nostur.com) |
| Android | [Amethyst](https://github.com/vitorpamplona/amethyst), [Primal](https://primal.net) |
| Web | [Primal](https://primal.net), [Snort](https://snort.social), [Nostrudel](https://nostrudel.ninja), [Coracle](https://coracle.social) |
| Desktop | [Gossip](https://github.com/mikestaab/gossip) |
| Long-form | [Habla](https://habla.news), [Yakihonne](https://yakihonne.com) |

---

## Your First Steps

### Step 1: Generate a Keypair

Your keypair is your identity. Here is how to generate one using the `nostr-tools` JavaScript library:

```bash
npm install nostr-tools
```

```typescript
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode, nsecEncode } from "nostr-tools/nip19";

// Generate a random secret key (32 bytes)
const secretKey = generateSecretKey();

// Derive the public key
const publicKey = getPublicKey(secretKey);

// Encode to human-readable bech32 format
const npub = npubEncode(publicKey);
const nsec = nsecEncode(secretKey);

console.log("Your public key (share this):", npub);
console.log("Your secret key (KEEP SECRET):", nsec);
```

This produces output like:

```
Your public key (share this): npub1a4b2856bce05c2059f4e8e98f00e419b8c258dfd8eeb6097c2ed...
Your secret key (KEEP SECRET): nsec1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Important:** Back up your secret key somewhere safe (password manager, written on paper in a safe). If you lose it, you lose your identity permanently.

Most users will generate their key inside a client app rather than manually, but understanding what happens under the hood is valuable.

### Step 2: Choose a Client

Pick any client from the list above and create your account using either:

- **Generate a new key inside the client** (easiest for beginners)
- **Import an existing key** (if you generated one in step 1)
- **Use a signer extension** like [Alby](https://getalby.com) or [nos2x](https://github.com/fiatjaf/nos2x) in your browser (recommended for web clients -- your key never touches the web app)

For your first experience, **Primal** (web or mobile) is a good choice -- it has a familiar social media interface and includes a built-in Lightning wallet for zaps.

### Step 3: Understand npub and nsec

You will see two key formats everywhere:

| Format | Starts With | What It Is | Share It? |
|--------|-------------|------------|-----------|
| `npub1...` | npub1 | Your public key (your identity) | Yes -- this is how people find you |
| `nsec1...` | nsec1 | Your secret key (your password) | **NEVER** -- anyone with this IS you |

Under the hood, both are the same 32-byte numbers encoded in a human-friendly format called bech32 (defined in NIP-19). The `npub`/`nsec` prefix makes it obvious which is which, reducing the risk of accidentally sharing your secret key.

You may also encounter:

- **`note1...`** -- A reference to a specific event (post)
- **`nprofile1...`** -- A public key bundled with relay hints (helps other clients find you)
- **`nevent1...`** -- An event reference bundled with relay hints and author info

### Step 4: Connect to Relays

When you use a client, it connects to relays for you. But it helps to understand what is happening:

```
Your Client
    │
    ├── wss://relay.damus.io      (popular free relay)
    ├── wss://nos.lol              (popular free relay)
    ├── wss://relay.nostr.band     (indexing relay, good for search)
    └── wss://relay.primal.net     (Primal's relay)
```

Your client opens WebSocket connections to each relay and:

1. **Publishes** your events (posts, profile updates, follows) to your write relays.
2. **Subscribes** to events from people you follow via their write relays.

Most clients manage relays automatically, but you can add or remove relays in your client's settings. A good starting set:

- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`
- `wss://relay.primal.net`

Advanced: You publish your relay preferences as a **kind 10002 event** (defined in NIP-65). This tells other clients which relays to contact to find your posts. This is called the **outbox model** and it is how decentralized discovery works without a central directory.

### Step 5: Publish Your First Note

In any client, just type a message and hit post. That is it.

Under the hood, the client:

1. Creates a kind 1 event with your text as the `content`.
2. Computes the event ID (SHA-256 hash of the serialized event).
3. Signs it with your secret key (Schnorr signature).
4. Sends `["EVENT", {...}]` to each of your write relays.
5. Each relay verifies the signature and stores it.

Here is what that looks like in code:

```typescript
import { finalizeEvent } from "nostr-tools/pure";
import { Relay } from "nostr-tools/relay";

// Create and sign the event
const event = finalizeEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: "Hello, NOSTR! This is my first note.",
}, secretKey);

// Publish to a relay
const relay = await Relay.connect("wss://relay.damus.io");
await relay.publish(event);
console.log("Published event:", event.id);
```

### Step 6: Follow People

Following someone on NOSTR means adding their public key to your **follow list** -- a kind 3 event. Your client handles this when you tap "Follow," but here is what happens:

1. Your client creates a new kind 3 event.
2. The `tags` field contains a `["p", "<pubkey>"]` entry for each person you follow.
3. This event replaces your previous follow list (kind 3 is "replaceable" -- latest one wins).
4. Your client uses this list to subscribe to events from those pubkeys on their relays.

Some people to follow to get started:

- Search for "fiatjaf" (NOSTR creator)
- Search for "jb55" (Damus creator)
- Search for people you know by their npub or NIP-05 address
- Browse trending content on [nostr.band](https://nostr.band) to discover interesting accounts

### Step 7: Set Up NIP-05 Verification

An npub like `npub1a4b2856bce05c20...` is hard to remember. **NIP-05** lets you have a human-readable identifier like `you@yourdomain.com` that maps to your public key.

How it works:

1. On a domain you control, create a file at `https://yourdomain.com/.well-known/nostr.json`
2. The file contains a JSON mapping of names to public keys:

```json
{
  "names": {
    "you": "a4b2856bce05c2059f4e8e98f00e419b8c258dfd8eeb6097c2ed9e3c5a6b6725"
  }
}
```

3. Set your NIP-05 in your profile (kind 0 event) to `you@yourdomain.com`.
4. When someone looks you up, their client fetches the JSON file and verifies the mapping.

If you do not have your own domain, several services offer free or paid NIP-05 identifiers:

- [nostr.com](https://nostr.com) (you@nostr.com)
- [getalby.com](https://getalby.com) (you@getalby.com)
- Many NOSTR clients offer built-in NIP-05 registration

NIP-05 is not required, but it makes you easier to find and adds a layer of human-readable trust.

---

## Key Concepts Explained Simply

### Why You Own Your Identity

On Twitter, your account is a row in Twitter's database. They can delete it, suspend it, or change its rules anytime. On NOSTR, your identity is a cryptographic keypair that you hold. There is no database row to delete. As long as you have your secret key, you can sign into any NOSTR client and you are you. Nobody grants you this identity and nobody can revoke it.

```
Traditional:   Company creates your account  -->  Company can delete your account
NOSTR:         You generate your keypair     -->  Only you hold the key
```

### Why You Cannot Be Deplatformed

Relays are interchangeable. If relay A bans your events, you publish to relay B. If a client app is removed from the App Store, you download a different client. Your identity and your social graph (follow list) travel with your key. There is no single point where someone can cut you off from the entire network.

```
Relay A bans you?   -->  Publish to Relay B, C, D...
Client gets banned? -->  Switch to any other client
Your key still works everywhere.
```

### Why Content Is Tamper-Proof

Every event includes a **signature** created with your secret key. Anyone can verify that signature using your public key. If even one character of the event is changed, the signature becomes invalid. This means:

- Relays cannot modify your posts.
- Nobody can put words in your mouth.
- Anyone can independently prove that you wrote something.

### How Replies and Threads Work

Replies use **tags** to reference the events they are replying to. When you reply to a post, your event includes:

- An `["e", "<root-event-id>", "<relay>", "root"]` tag pointing to the original post that started the thread.
- An `["e", "<parent-event-id>", "<relay>", "reply"]` tag pointing to the specific post you are replying to.

Clients use these tags to reconstruct threads. This is defined in NIP-10.

```
Original post (kind 1, id: abc123)
  │
  ├── Reply 1 (tags: ["e", "abc123", "", "root"], ["e", "abc123", "", "reply"])
  │     │
  │     └── Reply to Reply 1 (tags: ["e", "abc123", "", "root"], ["e", "reply1-id", "", "reply"])
  │
  └── Reply 2 (tags: ["e", "abc123", "", "root"], ["e", "abc123", "", "reply"])
```

### How Lightning Payments (Zaps) Work

Zaps let you send Bitcoin micropayments (via the Lightning Network) to any NOSTR user, attached to a specific post. Defined in NIP-57, here is the simplified flow:

```
1. You click "Zap" on someone's post.
2. Your client reads their profile to find their Lightning address.
3. Your client creates a "zap request" event (kind 9734) describing the payment.
4. This request is sent to their LNURL server, which generates a Lightning invoice.
5. Your Lightning wallet pays the invoice.
6. The LNURL server creates a "zap receipt" event (kind 9735) proving the payment.
7. This receipt is published to relays, so everyone can see the zap.
```

Zaps are a native part of the NOSTR experience -- many clients display zap totals on posts and show zap animations.

---

## Common Questions

### Can I Change My Key?

No. Your key IS your identity. You cannot change it like you would change a username. If you want a "new identity," you generate a new keypair, but your old followers will not automatically follow the new key. Think of it like an email address: you can create a new one, but people who have the old one need to learn the new one.

### What If I Lose My Secret Key?

If you lose your secret key and have no backup, that identity is gone forever. Nobody can recover it for you because nobody else has it. This is the tradeoff of self-sovereign identity: ultimate control means ultimate responsibility.

**Best practices:**
- Back up your nsec in a password manager (e.g., 1Password, Bitwarden).
- Write it down on paper and store it securely.
- Consider using NIP-06 mnemonic seed words (a 12/24-word phrase that generates your key, similar to Bitcoin wallet backups).
- Use a signer app like [Amber](https://github.com/greenart7c3/Amber) (Android) or [nsec.app](https://nsec.app) (web) that manages your key securely.

### How Do I Find People?

Several approaches:

- **Search by npub or NIP-05:** If you know someone's `npub1...` or `user@domain.com`, search for it in your client.
- **Browse directories:** [nostr.band](https://nostr.band) lets you search profiles and trending content.
- **Follow recommendations:** Many clients suggest people to follow.
- **Ask on NOSTR:** Post asking for follows -- the community is welcoming.
- **Import from Twitter:** Some tools (like [nostr.directory](https://nostr.directory)) help you find your Twitter contacts on NOSTR.

### Is It Private?

**By default, no.** Regular NOSTR events (kind 1 text notes, kind 0 profiles, etc.) are public. Anyone who can access a relay can read them.

**For private messaging:** NOSTR supports encrypted direct messages using NIP-17 (which uses NIP-44 encryption and NIP-59 gift wrapping). The message content is encrypted, and gift wrapping hides the metadata (who is messaging whom). This is significantly more private than, say, Twitter DMs, but you should understand the threat model:

- Message content is end-to-end encrypted.
- Gift wrapping hides sender/recipient metadata from relays.
- However, relay operators can still see IP addresses (use Tor for IP privacy).
- Your relay list (kind 10002) is public, so people know which relays you use.

### Is NOSTR Just for Social Media?

No. The protocol is general-purpose. The same event-and-relay architecture supports:

- **Microblogging** (kind 1) -- the most common use
- **Long-form articles** (kind 30023) -- like a blog
- **Marketplaces** (kind 30017/30018) -- product listings and sales
- **Livestreaming** (kind 30311) -- live video/audio
- **Git collaboration** (kind 30617) -- code repositories
- **Encrypted messaging** (kind 14) -- private DMs
- **Payments** (kind 9734/9735) -- zaps
- **AI/compute** (kind 5000-5999/6000-6999) -- Data Vending Machines
- **Calendar events** (kind 31922/31923) -- scheduling
- **File storage** (Blossom/NIP-B7) -- decentralized media hosting
- **And much more** -- any application that benefits from signed, relayed data

---

## Next Steps

Now that you understand the basics, here is where to go deeper:

| Topic | Resource |
|-------|----------|
| How the architecture fits together | [Architecture Overview](./architecture-overview.md) |
| Full protocol reference | [Protocol Overview](../protocol/README.md) |
| Event structure in detail | [Event Model](../protocol/event-model.md) |
| Relay protocol details | [Relay Protocol](../protocol/relay-protocol.md) |
| Cryptography under the hood | [Cryptography](../protocol/cryptography.md) |
| Working code examples | [Examples](../examples/README.md) |
| All NIPs organized by category | [NIP Index](../nips/README.md) |
| Client implementations | [Clients](../clients/README.md) |
| Relay implementations | [Relays](../relays/) |
| Libraries and SDKs | [Libraries](../libraries/) |

### Essential NIPs to Read First

1. **NIP-01** -- The core protocol (event format, relay messages, filters)
2. **NIP-02** -- Follow lists
3. **NIP-05** -- Human-readable identifiers (user@domain.com)
4. **NIP-10** -- Replies and threading
5. **NIP-19** -- Bech32 encoding (npub, nsec, note, nprofile, nevent)
6. **NIP-65** -- Relay lists and the outbox model

### External Resources

- **Official site:** [nostr.com](https://nostr.com)
- **Protocol spec:** [github.com/nostr-protocol/nips](https://github.com/nostr-protocol/nips)
- **App directory:** [nostrapps.com](https://nostrapps.com)
- **Network explorer:** [nostr.band](https://nostr.band)
- **Getting started portal:** [start.njump.me](https://start.njump.me/)
- **nostr-tools (JS library):** [github.com/nbd-wtf/nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- **NDK (dev kit):** [github.com/nostr-dev-kit/ndk](https://github.com/nostr-dev-kit/ndk)

---

*This document is part of the NOSTR Knowledge Base. See [CLAUDE.md](../CLAUDE.md) for repository conventions.*
