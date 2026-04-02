# Crypto Designer — Outputs to Other Roles

## To Protocol Architect
- Security property definitions for each component
- Encryption algorithm specifications with all parameters
- Recommendation on mandatory vs optional crypto features
- Assessment of crypto complexity impact on implementability

## To Formal Methods
- Precise construction descriptions to model
- Security properties to verify (formal definitions)
- Attacker model specification
- Composition analysis (what interactions to check)

## To Adversarial Security
- Known limitations and accepted risks
- Areas where attacks are most likely
- Key compromise blast radius analysis

## To Systems Programmer
- Algorithm specification with every parameter (key sizes, nonce sizes, padding scheme)
- Constant-time requirements for each operation
- CSPRNG requirements
- Key material handling requirements (zeroing, no logging)
- Test vector specifications

## To Standards Writer
- Crypto section text for the NIP
- Algorithm step descriptions in implementer-friendly language
- Security considerations section
