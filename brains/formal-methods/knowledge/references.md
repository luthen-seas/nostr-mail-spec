# References for Formal Verification of NOSTR Mail

Curated bibliography of papers, tools, manuals, and published formal analyses relevant to verifying a NOSTR-based email protocol using NIP-44 encryption and NIP-59 Gift Wrap.

---

## 1. Tool Documentation and Manuals

### ProVerif

- **ProVerif Manual** — Bruno Blanchet, Vincent Cheval, Ben Smyth. The definitive reference for the ProVerif input language, semantics, and query types. Updated with each release.
  - URL: https://bblanche.gitlabpages.inria.fr/proverif/manual.pdf
  - Covers: types, constructors/destructors, equations, processes, reachability queries, correspondence, observational equivalence, phases, tables, choice operator

- **ProVerif Tutorial** — Bruno Blanchet. A gentler introduction walking through progressively complex examples.
  - URL: https://bblanche.gitlabpages.inria.fr/proverif/proverif-tutorial.pdf
  - Start here before the full manual

- **ProVerif Source and Examples** — GitLab repository containing the tool and a library of example protocol models.
  - URL: https://gitlab.inria.fr/bblanche/proverif
  - The `examples/` directory contains models for Needham-Schroeder, TLS, Signal, and others. Use these as templates.

- **ProVerif Website** — Download, papers, related tools
  - URL: https://bblanche.gitlabpages.inria.fr/proverif/

### Tamarin Prover

- **Tamarin Manual** — The Tamarin Team (ETH Zurich, CISPA). Comprehensive reference for the Tamarin input language, built-in theories, lemma syntax, and proof strategies.
  - URL: https://tamarin-prover.com/manual/
  - Key chapters: multiset rewriting rules, built-in DH theory, trace properties, observational equivalence, interactive proof mode

- **Tamarin Examples Repository** — Curated collection of protocol models.
  - URL: https://github.com/tamarin-prover/tamarin-prover/tree/develop/examples
  - Notable examples: TLS 1.3, Signal, WireGuard, 5G-AKA, Kerberos
  - The `csf-18-xor/` directory shows how to model XOR-based protocols

- **Tamarin Website** — Download, publications, tutorial
  - URL: https://tamarin-prover.com/

### TLA+

- **Specifying Systems** — Leslie Lamport (2002). The foundational textbook for TLA+. Covers temporal logic, specifications, refinement, and proof.
  - Available free: https://lamport.azurewebsites.net/tla/book.html
  - Essential reading: Chapters 1-8 for specification, Chapters 9-14 for temporal properties

- **TLA+ Video Course** — Leslie Lamport. A series of video lectures introducing TLA+ from scratch.
  - URL: https://lamport.azurewebsites.net/video/videos.html
  - 10 lectures covering the full language and TLC model checker

- **Learn TLA+** — Hillel Wayne. Practical, example-driven introduction.
  - URL: https://learntla.com/
  - More accessible than Lamport's book for getting started quickly

- **TLA+ Tools** — TLC model checker, TLAPS proof system, TLA+ Toolbox IDE
  - URL: https://lamport.azurewebsites.net/tla/tools.html
  - TLC: exhaustive finite-state model checker
  - TLAPS: deductive proof system for infinite-state verification
  - PlusCal: algorithmic language that compiles to TLA+ (useful for pseudocode-to-spec)

- **TLA+ Examples Repository** — Community-maintained collection of specifications.
  - URL: https://github.com/tlaplus/Examples
  - Notable: Paxos, Raft, two-phase commit, various distributed protocols

### CryptoVerif

- **CryptoVerif Manual** — Bruno Blanchet. Reference for the computational model verifier.
  - URL: https://bblanche.gitlabpages.inria.fr/CryptoVerif/
  - Covers: game-based proofs, security assumptions (DDH, IND-CPA, etc.), transformation rules

- **CryptoVerif Source and Examples**
  - URL: https://gitlab.inria.fr/bblanche/CryptoVerif
  - Examples include TLS 1.3, Signal, and Kerberos in the computational model

---

## 2. Landmark Formal Analyses of Cryptographic Protocols

### TLS 1.3

- **"A Comprehensive Symbolic Analysis of TLS 1.3"** — Cas Cremers, Marko Horvat, Jonathan Hoyland, Sam Scott, Thyla van der Merwe. IEEE S&P 2017.
  - The gold standard for protocol verification. Uses Tamarin to analyze all handshake modes of TLS 1.3.
  - Verified: server authentication, client authentication, secrecy of session keys, forward secrecy, downgrade resilience.
  - Methodology: systematic enumeration of threat models (key compromise, state reveal), modular analysis of each handshake mode.
  - **Directly applicable to NOSTR Mail**: their approach to modeling ECDH-based key exchange and layered encryption is a template for NIP-44 analysis.

- **"Implementing and Proving the TLS 1.3 Record Layer"** — Karthikeyan Bhargavan, Antoine Delignat-Lavaud, Cedric Fournet, et al. IEEE S&P 2017.
  - Verified implementation of TLS 1.3 record layer in F*, with proofs of functional correctness and cryptographic security.
  - Relevant for understanding how to bridge formal models and implementations.

- **"miTLS: Verified Reference Implementation of TLS"** — Karthikeyan Bhargavan et al. (Project Everest / INRIA).
  - URL: https://mitls.org/
  - A fully verified implementation of TLS in F*. Demonstrates the path from ProVerif/CryptoVerif models to verified code.

### Signal Protocol

- **"A Formal Security Analysis of the Signal Messaging Protocol"** — Katriel Cohn-Gordon, Cas Cremers, Benjamin Dowling, Luke Garratt, Douglas Stebila. IEEE EuroS&P 2017 / IEEE S&P 2020 (journal version).
  - Tamarin-based analysis of Signal's X3DH key agreement and Double Ratchet.
  - Verified: forward secrecy, post-compromise security, key compromise impersonation resistance.
  - **Critical reference for NOSTR Mail**: NIP-44's ECDH is simpler than Signal's X3DH, but the methodology for modeling key compromise scenarios transfers directly. Signal's Double Ratchet provides forward secrecy that NIP-44 lacks -- this paper helps articulate exactly what properties are and are not achieved.

- **"Automated Verification of the Signal Protocol"** — Nadim Kobeissi, Karthikeyan Bhargavan, Bruno Blanchet. EuroS&P 2017.
  - ProVerif-based analysis of Signal. Uses the applied pi-calculus to model all protocol phases.
  - Demonstrates how to handle the complexity of a multi-stage protocol in ProVerif without non-termination.
  - **Practically useful**: their modeling of ECDH + HKDF is directly reusable for NIP-44.

- **"On the Cryptographic Deniability of the Signal Protocol"** — Vatsal Mishra, Mahdi Sedaghat, Mark Manulis. ACM CCS 2024 (earlier versions 2023).
  - Analyzes the deniability properties of Signal, relevant to NIP-59's deniability claims.
  - Key insight: deniability depends on the specific threat model -- offline deniability vs. online deniability differ.

### MLS (Messaging Layer Security)

- **"On the Security of MLS"** — Joël Alwen, Sandro Coretti, Yevgeniy Dodis, Yiannis Tselekounis. CRYPTO 2020.
  - Formal analysis of the Messaging Layer Security protocol for group messaging.
  - Relevant because NOSTR group messaging (NIP-29 groups, or multi-recipient mail) faces similar challenges: how to efficiently encrypt for N recipients while maintaining forward secrecy.

- **"Insider Security and Policy Enforcement for MLS"** — Joël Alwen, Daniel Jost, Marta Mularczyk. IEEE S&P 2022.
  - Addresses insider threats in group protocols -- relevant for NOSTR Mail scenarios where one group member is compromised.

- **"TreeKEM: Asynchronous Decentralized Key Management for Large Dynamic Groups"** — Joël Alwen et al.
  - The tree-based key management structure used in MLS. If NOSTR Mail extends to groups, this is the relevant formal framework.

### WireGuard

- **"A Formal Analysis of WireGuard"** — Benjamin Dowling, Kenneth Paterson. Journal of Cryptology 2021.
  - Tamarin and computational analysis of WireGuard's Noise-based handshake.
  - WireGuard's use of ChaCha20-Poly1305 + HKDF is structurally similar to NIP-44's use of ChaCha20 + HMAC-SHA256 + HKDF. This paper's modeling choices are a useful reference.

---

## 3. TLA+ in Industry Practice

- **"How Amazon Web Services Uses Formal Methods"** — Chris Newcombe, Tim Rath, Fan Zhang, Bogdan Munteanu, Marc Brooker, Michael Deardeuff. Communications of the ACM 58(4), 2015.
  - Documents AWS's use of TLA+ to verify DynamoDB, S3, IAM, and other critical systems.
  - Key takeaway: TLA+ found subtle bugs that testing and code review missed, particularly in failure handling and recovery logic.
  - **Directly relevant**: their approach to modeling distributed storage systems maps to modeling relay behavior in NOSTR Mail (relay failure, recovery, message persistence).

- **"Use of Formal Methods at Amazon Web Services"** — Chris Newcombe et al. (extended technical report).
  - More detail on specific bugs found and specifications written.
  - Includes practical advice on introducing TLA+ to engineering teams.

- **"Formal Reasoning About the Security of Amazon Web Services"** — Byron Cook. CAV 2018 (invited talk).
  - Describes automated reasoning tools used at AWS for security verification.

---

## 4. NOSTR-Specific References

### NIP-44 Specification and Test Vectors

- **NIP-44: Versioned Encryption** — NOSTR protocol specification
  - URL: https://github.com/nostr-protocol/nips/blob/master/44.md
  - Defines: ECDH shared secret, HKDF key derivation, ChaCha20 encryption, HMAC-SHA256 authentication, padding scheme
  - **Test vectors**: The specification includes test vectors for each stage of the encryption pipeline. These are essential for validating that a formal model correctly captures the protocol's behavior. A model that produces different results from the test vectors is wrong.
  - Reference implementation: https://github.com/paulmillr/nip44 (TypeScript)

- **NIP-44 Audit** — Cure53 security audit of the NIP-44 specification
  - Reviewed the cryptographic construction and found it sound, with minor recommendations
  - Useful for understanding which aspects of NIP-44 have already been vetted and which need further formal analysis

### NIP-59 Specification

- **NIP-59: Gift Wrap** — NOSTR protocol specification
  - URL: https://github.com/nostr-protocol/nips/blob/master/59.md
  - Defines: the three-layer wrapping scheme (rumor, seal, gift wrap), ephemeral key usage, timestamp randomization
  - Key security claims to verify formally: sender anonymity, deniability, metadata protection

### NIP-17 (Private Direct Messages)

- **NIP-17: Private Direct Messages** — NOSTR protocol specification
  - URL: https://github.com/nostr-protocol/nips/blob/master/17.md
  - Uses NIP-44 + NIP-59 for private messaging. The DM protocol is the closest existing NOSTR protocol to the mail system being verified.
  - NIP-17 replaces the deprecated NIP-04 (which used AES-256-CBC without authentication -- a known vulnerability).

### Related NOSTR NIPs

- **NIP-04** (deprecated): Original encrypted DMs using AES-256-CBC. Known vulnerabilities: no ciphertext authentication, no padding, metadata exposure. Understanding NIP-04's failures motivates the formal verification of NIP-44/59.
- **NIP-47 (NWC)**: Nostr Wallet Connect. If NOSTR Mail involves Cashu payments, NWC interactions may also need verification.

---

## 5. Foundational Theory

### Applied Pi-Calculus and Protocol Verification

- **"An Efficient Cryptographic Protocol Verifier Based on Prolog Rules"** — Bruno Blanchet. CSFW 2001.
  - The original ProVerif paper. Describes the Horn clause resolution technique.

- **"Modeling and Verifying Security Protocols with the Applied Pi Calculus and ProVerif"** — Bruno Blanchet. Foundations and Trends in Privacy and Security, 2016.
  - Comprehensive survey of ProVerif's theory and practice. The best single reference for understanding what ProVerif can and cannot do.

### Multiset Rewriting and Tamarin

- **"Automated Analysis of DH Protocols with Unbounded Sessions"** — Cas Cremers, Simon Meier, Benedikt Schmidt. CSF 2012.
  - The foundational Tamarin paper. Introduces the constraint-solving approach for DH protocols.

- **"The TAMARIN Prover for the Symbolic Analysis of Security Protocols"** — Simon Meier, Benedikt Schmidt, Cas Cremers, David Basin. CAV 2013.
  - Tool paper describing Tamarin's architecture and capabilities.

### Game-Based Cryptographic Proofs

- **"Sequences of Games: A Tool for Taming Complexity in Security Proofs"** — Victor Shoup. 2004.
  - Foundational paper on the game-hopping technique used by CryptoVerif.

- **"The Joy of Cryptography"** — Mike Rosulek. Open textbook.
  - URL: https://joyofcryptography.com/
  - Accessible introduction to game-based security definitions. Useful background for understanding what CryptoVerif proves.

### Dolev-Yao Model

- **"On the Security of Public Key Protocols"** — Danny Dolev, Andrew Yao. IEEE FOCS 1981 / IEEE Transactions on Information Theory 1983.
  - The original paper defining the adversary model used by ProVerif and Tamarin: the attacker controls the network, can intercept/inject/modify messages, but cannot break crypto primitives.

---

## 6. Formal Methods for Specific Cryptographic Primitives

### ECDH and Diffie-Hellman

- **"Computational Soundness of Formal Models for Diffie-Hellman"** — Gergei Bana, Hubert Comon-Lundh. 2012.
  - Proves that symbolic (Dolev-Yao) analysis of DH protocols is sound with respect to computational security under DDH. This justifies using ProVerif for NIP-44's ECDH component.

### HKDF

- **"Cryptographic Extraction and Key Derivation: The HKDF Scheme"** — Hugo Krawczyk. CRYPTO 2010.
  - The definitive paper on HKDF. Proves security of the extract-then-expand paradigm.
  - NIP-44 uses HKDF with SHA-256. This paper's security analysis applies directly.

### ChaCha20

- **"ChaCha, a variant of Salsa20"** — Daniel J. Bernstein. 2008.
  - Original specification. ChaCha20 is the stream cipher used in NIP-44.
  - For formal verification purposes, model ChaCha20 as an IND-CPA secure symmetric cipher (no authentication by itself -- that is provided by the HMAC layer).

### HMAC

- **"Keying Hash Functions for Message Authentication"** — Mihir Bellare, Ran Canetti, Hugo Krawczyk. CRYPTO 1996.
  - The foundational HMAC paper. Proves HMAC is a secure MAC under the assumption that the hash function is a PRF.

---

## 7. Blind Signatures and E-Cash (for Cashu Verification)

- **"Blind Signatures for Untraceable Payments"** — David Chaum. CRYPTO 1982.
  - The original e-cash paper. Cashu is a modern implementation of Chaumian e-cash.

- **"Transferable E-Cash: A Cleaner Model and the First Practical Instantiation"** — Balthazar Bauer, Georg Fuchsbauer, Chen Qian. PKC 2021.
  - Modern treatment of e-cash with formal security definitions.

- **Cashu Protocol Specification** — https://github.com/cashubtc/nuts
  - The NUTs (Notation, Usage, and Terminology) define the Cashu protocol. Relevant NUTs for formal verification:
  - NUT-00: Notation and models
  - NUT-01: Mint public key exchange
  - NUT-02: Keysets and keyset rotation
  - NUT-03: Token swap (split/merge)
  - NUT-04: Mint tokens (issuance)
  - NUT-05: Melt tokens (redemption)

---

## 8. Recommended Reading Order

For an agent building formal models of NOSTR Mail:

1. **Start with tool basics**: ProVerif tutorial, TLA+ video course (lectures 1-5)
2. **Study a landmark analysis**: Cremers et al. TLS 1.3 paper (for methodology), Kobeissi et al. Signal paper (for ProVerif technique on ECDH + HKDF)
3. **Read the NOSTR specs**: NIP-44, NIP-59, NIP-17 in detail
4. **Study ProVerif examples**: DH key exchange examples from the ProVerif repository, then build up to the full NIP-44 model
5. **Build the TLA+ model**: Use AWS's TLA+ paper as inspiration for modeling the relay delivery layer
6. **Compose the models**: Verify the full three-layer NIP-59 construction in ProVerif
7. **Extend to Cashu**: Use Tamarin for the stateful token verification
8. **Optional -- computational assurance**: Use CryptoVerif to verify NIP-44 under computational assumptions

---

## 9. Tool Installation and Versions

| Tool | Installation | Recommended Version |
|------|-------------|-------------------|
| ProVerif | `opam install proverif` or binary from website | 2.05+ |
| Tamarin | `brew install tamarin-prover` (macOS) or from GitHub | 1.8+ |
| TLA+ Toolbox | Download from GitHub releases | 1.7.1+ |
| TLC (standalone) | Included in TLA+ Toolbox, or `java -jar tla2tools.jar` | Same as Toolbox |
| CryptoVerif | Binary from website (INRIA) | 2.08+ |
| Maude (for Tamarin backend) | `brew install maude` | 3.2+ |

All tools are free for academic and research use. ProVerif, Tamarin, and CryptoVerif run on Linux and macOS. TLA+ Toolbox is Java-based and cross-platform.
