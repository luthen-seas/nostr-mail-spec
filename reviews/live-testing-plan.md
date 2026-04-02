# Live Testing Plan — Final Phase

> **How to test NOSTR Mail against real relays, real clients, and real network conditions.**

---

## Why Live Testing Is the Final Phase

Everything so far has been tested in isolation — unit tests, interop with local function calls, theoretical analysis. Live testing proves the protocol works in the real world: real WebSocket connections, real relay behavior, real latency, real failure modes.

---

## Option 1: Local Test Relay (Easiest, No Internet Required)

Run a NOSTR relay locally and test against it.

```bash
# Install strfry (most popular NOSTR relay)
docker run -d --name strfry -p 7777:7777 hoytech/strfry

# Or use nostr-rs-relay
docker run -d --name nostr-relay -p 8080:8080 scsibug/nostr-rs-relay

# Test with nak CLI tool
brew install nak  # or: go install github.com/fiatjaf/nak@latest

# Publish a test event
echo '{"kind":1,"content":"hello","tags":[],"created_at":'$(date +%s)'}' | \
  nak event --sec <test-privkey> ws://localhost:7777

# Subscribe to events
nak req --kinds 1059 ws://localhost:7777
```

**What to test:**
- [ ] Publish kind 1059 gift-wrapped events → relay accepts (OK response)
- [ ] Subscribe with `#p` filter → receive only our events
- [ ] Publish kind 10097, 10099 → relay handles as replaceable events
- [ ] Publish kind 30016 → relay handles as addressable event
- [ ] Publish kind 1400 (rumor, should NOT be published directly — test that clients don't do this)
- [ ] Verify NIP-42 AUTH works (if relay supports it)
- [ ] Full round-trip: TS SDK wraps → publishes → subscribes → receives → unwraps

**Effort**: 1-2 hours to set up and run.

## Option 2: Public Test Relays (Real Network, No Setup)

Use public NOSTR relays for testing (free, no account needed).

```
Public relays suitable for testing:
  wss://relay.damus.io      — popular, well-maintained
  wss://nos.lol              — fast, reliable
  wss://relay.nostr.band     — supports search (NIP-50)
  wss://relay.primal.net     — popular mobile relay
  wss://nostr.wine           — paid relay (for premium testing)
```

**What to test:**
- [ ] Publish kind 1059 events to public relays → accepted
- [ ] Subscribe from different IP/device → receive events
- [ ] Multi-relay publication → events available on all relays
- [ ] Real-world latency measurement (time from publish to subscribe delivery)
- [ ] NIP-11 relay info document check (do relays report our kinds as supported?)

**Effort**: 30 minutes with `nak` CLI.

## Option 3: Write a Live Integration Test Script

A Node.js script that runs the full NOSTR Mail flow against real relays.

```typescript
// live-test.ts
import { NostrMail } from '@nostr-mail/core'
import { generateSecretKey, getPublicKey } from 'nostr-tools'

const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol']

// Generate test keypairs
const aliceSk = generateSecretKey()
const alicePk = getPublicKey(aliceSk)
const bobSk = generateSecretKey()
const bobPk = getPublicKey(bobSk)

// Alice sends to Bob
const alice = NostrMail.init({ privateKey: aliceSk, relays: RELAYS })
await alice.send({
  to: bobPk,  // Direct pubkey (no NIP-05 for test)
  subject: 'Live Test',
  body: 'This is a live test of NOSTR Mail.',
})
console.log('Alice sent message')

// Bob receives
const bob = NostrMail.init({ privateKey: bobSk, relays: RELAYS })
for await (const msg of bob.inbox()) {
  console.log(`Bob received: ${msg.subject} from ${msg.from.pubkey}`)
  break  // Just need one message for the test
}
```

**What to test:**
- [ ] Full send/receive flow over real WebSocket connections
- [ ] Gift wrap accepted by real relays
- [ ] Subscribe + receive works with real latency
- [ ] Multi-relay delivery (publish to 2 relays, receive from either)
- [ ] Self-copy appears in sender's subscription

**Effort**: 1 hour to write and run.

## Option 4: Existing NOSTR Client Compatibility Check

Install real NOSTR clients and verify our events don't break them.

```bash
# Use nak to publish our event kinds to a relay Alice uses in Damus
# Then open Damus and verify it doesn't crash or show errors

# Test kinds:
# 1059 (gift wrap) — should be processed by NIP-17-supporting clients
# 10097 (spam policy) — should be silently stored by relays
# 10099 (mailbox state) — should be silently stored by relays
# 30016 (draft) — should be silently stored by relays
# 1400 (mail rumor) — should NEVER appear on relays directly
```

**What to test:**
- [ ] Damus (iOS): doesn't crash when kind 1059 events with kind 1400 inner rumor exist
- [ ] Amethyst (Android): same
- [ ] Gossip (desktop): same
- [ ] Primal (web): same
- [ ] All clients ignore unknown replaceable kinds (10097, 10099)

**Effort**: 1 hour (requires iOS/Android devices or emulators).

## Option 5: Full End-to-End with Bridge

Test the SMTP bridge against real email providers.

```bash
# Deploy bridge to a VPS
docker-compose up -d

# Configure DNS:
#   MX record: nostrmail-test.yourdomain.com → your VPS IP
#   SPF record: v=spf1 ip4:<VPS-IP> -all
#   DKIM: generate keys and publish to DNS

# Test inbound: send email from Gmail to user@nostrmail-test.yourdomain.com
# → Verify it appears in NOSTR Mail inbox

# Test outbound: send from NOSTR Mail to a Gmail address
# → Verify it arrives (check spam folder initially)
```

**What to test:**
- [ ] Inbound: Gmail → bridge → NOSTR Mail
- [ ] Inbound: Outlook → bridge → NOSTR Mail
- [ ] Outbound: NOSTR Mail → bridge → Gmail
- [ ] Threading: email reply → bridge preserves thread
- [ ] Attachments: email with PDF → bridge → Blossom → NOSTR Mail
- [ ] HTML: rich email → bridge sanitizes → NOSTR Mail displays

**Effort**: 4-8 hours (VPS setup, DNS propagation, DKIM generation, warm-up).

---

## Recommended Order

1. **Option 1 (local relay)** — Fastest validation, do first
2. **Option 3 (live test script)** — Proves it works over real internet
3. **Option 2 (public relays)** — Validates with production relays
4. **Option 4 (client compat)** — Proves we don't break existing ecosystem
5. **Option 5 (bridge)** — Full email integration, do last

Options 1-3 can be done in a single session. Option 4 needs devices. Option 5 needs a VPS and DNS setup.

---

## What Live Testing Proves That Unit Tests Don't

| Unit Tests | Live Tests |
|-----------|-----------|
| Encryption is correct | Encrypted events are accepted by real relays |
| Tags are well-formed | Real relay subscription filters work |
| Round-trip works in memory | Round-trip works over WebSocket with real latency |
| State serialization is correct | Replaceable events actually replace on real relays |
| Code compiles | Dependencies resolve in production environment |
