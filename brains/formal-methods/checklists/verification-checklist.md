# Formal Methods Verification Checklist

## Encryption Properties (ProVerif/Tamarin)
- [ ] Message secrecy: adversary controlling all relays cannot learn plaintext
- [ ] Sender authentication: recipient can verify sender via seal signature
- [ ] Sender anonymity from relay: relay cannot determine sender from gift wrap
- [ ] Deniability: sender cannot be proven to have sent specific content to third party
- [ ] Timestamp privacy: relay cannot determine actual send time
- [ ] Multi-recipient independence: compromising one copy doesn't help decrypt another

## Delivery Properties (TLA+)
- [ ] Liveness: message is eventually deliverable if ≥1 relay available
- [ ] Safety: message never attributed to wrong sender after decryption
- [ ] Idempotency: receiving same event twice produces no side effects
- [ ] No deadlock: delivery protocol cannot enter a state where no progress is possible
- [ ] State convergence: multiple devices eventually agree on mailbox state

## Anti-Spam Properties (ProVerif/Tamarin)
- [ ] Token uniqueness: Cashu token cannot deliver two different messages
- [ ] Payment binding: payment proof cannot be transferred between messages
- [ ] Non-forgeability: valid payment proofs cannot be created without paying

## Model Validation
- [ ] Model accurately represents the protocol (validated by Crypto Designer)
- [ ] All assumptions are explicitly documented
- [ ] Both positive results (property holds) and negative (attack found) are reported
- [ ] Models are published alongside proofs for reproducibility
- [ ] Counterexamples are analyzed (real attack vs model artifact?)
