# Crypto Designer — Inputs from Other Roles

## From Protocol Architect
- Protocol structure and message flows (what needs to be encrypted, signed, wrapped)
- Design constraints (must work async, must be relay-agnostic, must support multi-recipient)
- Feature requests that have crypto implications

## From Formal Methods
- Verification results (properties proven, counterexamples found)
- Model assumptions that need validation
- Suggestions for construction improvements based on analysis

## From Adversarial Security
- Attack reports on crypto components
- Side-channel concerns from implementation review
- Metadata leakage findings

## From Payment Specialist
- Cashu BDHKE construction details for review
- Token binding mechanism proposals
- L402 macaroon security properties for verification

## From NOSTR Expert
- Current NIP-44 and NIP-59 implementation status across clients
- Known issues or discussions about existing crypto NIPs
- Compatibility constraints with deployed implementations
