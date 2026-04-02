# Adversarial Security Review Checklist

Before signing off on any component:

## Metadata Analysis
- [ ] What does the relay learn from this event? (Document explicitly)
- [ ] Can timing correlation narrow sender identity?
- [ ] Can event size reveal content type or length?
- [ ] Can publication patterns reveal communication graph?
- [ ] Can multiple relays collude to learn more than one relay alone?

## Cryptographic Attack Surface
- [ ] Can any encrypted value be replayed in a different context?
- [ ] Can any signature be reused or transferred?
- [ ] Are there padding oracles? Timing oracles? Error oracles?
- [ ] What happens if the RNG fails or is predictable?
- [ ] What is the blast radius of a key compromise?

## Economic Attack Surface
- [ ] Can payment proofs be reused, shared, or forged?
- [ ] Can tokens be double-spent before redemption?
- [ ] Is there a profitable attack at any scale?
- [ ] Can the refund mechanism be gamed?
- [ ] What's the cheapest way to spam N messages?

## Relay Abuse
- [ ] Can the relay be flooded with events?
- [ ] Can rate limiting be bypassed?
- [ ] Can the relay be used as a spam amplifier?
- [ ] What if the relay is malicious? (selective delivery, injection, replay)

## Bridge Attack Surface
- [ ] Can malicious email content reach the NOSTR side unsanitized?
- [ ] Can email headers be injected through the bridge?
- [ ] Can the bridge be used to amplify spam?
- [ ] What if the bridge operator is malicious?

## Identity Attacks
- [ ] Can NIP-05 be hijacked to redirect mail?
- [ ] Can key rotation be exploited?
- [ ] Can contact list be poisoned?

## State Attacks
- [ ] Can mailbox state be corrupted by replay?
- [ ] Can drafts be exfiltrated?
- [ ] Can state sync be used for DoS?
