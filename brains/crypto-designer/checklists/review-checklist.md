# Crypto Designer Review Checklist

Before signing off on any cryptographic component, verify ALL items:

## Primitive Selection
- [ ] All primitives are established, audited algorithms (no custom crypto)
- [ ] Key sizes meet current security recommendations (≥128-bit security level)
- [ ] Hash functions are collision-resistant and pre-image resistant (SHA-256, HMAC-SHA256)
- [ ] Encryption is authenticated (Encrypt-then-MAC or AEAD)
- [ ] Nonces are sufficiently random (32 bytes from CSPRNG) and never reused

## Composition Safety
- [ ] Each layer's security does not depend on another layer being secure
- [ ] Domain separation is used for all HKDF derivations (distinct salts/info)
- [ ] No key material is reused across different cryptographic operations
- [ ] Sign-then-Encrypt order is justified (vs Encrypt-then-Sign)
- [ ] Multi-layer encryption doesn't create padding oracles across layers

## Threat Model
- [ ] Security properties are formally defined (secrecy, authentication, deniability)
- [ ] Attacker model is clearly specified (Dolev-Yao, computational, etc.)
- [ ] Known limitations are documented (no forward secrecy, etc.)
- [ ] Blast radius of key compromise is documented

## Implementation Requirements
- [ ] All key material operations must be constant-time
- [ ] CSPRNG requirement specified for all random generation
- [ ] Key material zeroing after use is specified
- [ ] No secret-dependent branching or memory access patterns
- [ ] Error messages don't leak information about the plaintext

## Formal Verification
- [ ] Properties to verify are specified for Formal Methods specialist
- [ ] Composition has been analyzed (not just individual primitives)
- [ ] Adversarial Security reviewer has been notified of the design
