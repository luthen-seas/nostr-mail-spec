# Formal Verification Fundamentals for Protocol Analysis

This document covers the four primary tools used in formal verification of cryptographic protocols, with emphasis on their application to NOSTR-based systems using NIP-44 encryption and NIP-59 Gift Wrap.

---

## 1. ProVerif

### Overview

ProVerif is an automatic cryptographic protocol verifier developed by Bruno Blanchet (INRIA). It operates in the **formal (Dolev-Yao) model**, where the adversary controls the network completely but cannot break cryptographic primitives except by using the defined algebraic equations. The tool takes a protocol description in the **applied pi-calculus** and attempts to prove or disprove security properties.

### Input Language: Applied Pi-Calculus

ProVerif models consist of:

- **Types**: declare domains of values
- **Constructors**: functions that build terms (model cryptographic operations)
- **Destructors**: reduction rules that decompose terms (model decryption, verification)
- **Equations**: equational theories for algebraic properties (e.g., Diffie-Hellman commutativity)
- **Processes**: protocol roles described as concurrent processes communicating over channels
- **Queries**: the properties to verify

#### Type Declarations

```proverif
type key.
type privkey.
type pubkey.
type nonce.
```

#### Constructors and Destructors

Symmetric encryption:

```proverif
fun senc(bitstring, key): bitstring.
reduc forall m:bitstring, k:key; sdec(senc(m,k),k) = m.
```

This says: `senc` builds a ciphertext from a message and a key; `sdec` recovers the message only when given the correct key. The adversary can apply both functions but can only decrypt if it knows the key.

Asymmetric encryption:

```proverif
fun pk(privkey): pubkey.
fun aenc(bitstring, pubkey): bitstring.
reduc forall m:bitstring, sk:privkey; adec(aenc(m,pk(sk)),sk) = m.
```

Digital signatures:

```proverif
fun sign(bitstring, privkey): bitstring.
reduc forall m:bitstring, sk:privkey; getmsg(sign(m,sk)) = m.
reduc forall m:bitstring, sk:privkey; checksign(sign(m,sk), pk(sk)) = m.
```

The `checksign` destructor succeeds only when the signature was made with the private key corresponding to the given public key. `getmsg` extracts the signed message (modeling signature schemes where the message is recoverable).

#### Modeling ECDH (Diffie-Hellman Key Exchange)

This is critical for NIP-44, which derives a shared secret via ECDH between sender and recipient.

```proverif
type privkey.
type pubkey.
type key.

(* Key generation *)
fun pk(privkey): pubkey.

(* Diffie-Hellman: dh(a, pk(b)) = dh(b, pk(a)) *)
fun dh(privkey, pubkey): key.
equation forall a:privkey, b:privkey; dh(a, pk(b)) = dh(b, pk(a)).
```

The `equation` keyword tells ProVerif that these two expressions are equal. This models the fundamental ECDH property: Alice computing `a * B` gets the same value as Bob computing `b * A`.

#### HKDF (Key Derivation)

Model HKDF as a keyed hash. For NIP-44's two-step derivation (extract then expand):

```proverif
fun hkdf_extract(bitstring, key): key.
fun hkdf_expand(bitstring, key): key.
```

No destructors needed -- HKDF is a one-way function. The adversary cannot recover the input from the output.

#### Channels

```proverif
free c:channel.              (* public channel — adversary can read/write *)
free secure:channel [private]. (* private channel — adversary cannot access *)
```

In NOSTR modeling, the relay channel is always public (the adversary is the relay operator or a network observer).

#### Processes

A simple sender-receiver protocol:

```proverif
let Sender(skA:privkey, pkB:pubkey) =
    new plaintext:bitstring;
    let shared = dh(skA, pkB) in
    let k = hkdf_expand(info, hkdf_extract(salt, shared)) in
    let ct = senc(plaintext, k) in
    out(c, ct);
    0.

let Receiver(skB:privkey, pkA:pubkey) =
    in(c, ct:bitstring);
    let shared = dh(skB, pkA) in
    let k = hkdf_expand(info, hkdf_extract(salt, shared)) in
    let pt = sdec(ct, k) in
    0.
```

#### Process Composition and Replication

```proverif
process
    new skA:privkey;
    new skB:privkey;
    let pkA = pk(skA) in
    let pkB = pk(skB) in
    out(c, pkA); out(c, pkB);   (* public keys are public *)
    ( !Sender(skA, pkB) | !Receiver(skB, pkA) )
```

The `!` operator means unbounded replication -- ProVerif considers arbitrarily many sessions. The `|` is parallel composition.

### What ProVerif Can Verify

**Reachability (Secrecy)**:
```proverif
query attacker(plaintext).
```
"Can the adversary ever learn `plaintext`?" ProVerif explores all reachable states. If it finds a trace where the attacker obtains the term, it outputs the attack. If it proves no such trace exists, the property holds.

**Correspondence (Authentication)**:
```proverif
event beginSend(pubkey, pubkey, bitstring).
event endReceive(pubkey, pubkey, bitstring).

query pkA:pubkey, pkB:pubkey, m:bitstring;
    event(endReceive(pkA, pkB, m)) ==> event(beginSend(pkA, pkB, m)).
```
"Every time the receiver accepts a message apparently from A to B, the sender A actually sent that message to B." The `==>` is logical implication over execution traces.

**Injective Correspondence (No Replay)**:
```proverif
query pkA:pubkey, pkB:pubkey, m:bitstring;
    inj-event(endReceive(pkA, pkB, m)) ==> inj-event(beginSend(pkA, pkB, m)).
```
"Each accept event corresponds to a *distinct* send event." This rules out replay attacks.

**Observational Equivalence (Privacy / Anonymity)**:
```proverif
equivalence
    Sender(skA, pkB, msg1)
    Sender(skA, pkB, msg2)
```
"The adversary cannot distinguish the protocol run with `msg1` from the run with `msg2`." This is the strongest form of secrecy and is essential for modeling sender anonymity in NIP-59 Gift Wrap, where the relay should not distinguish who sent a given wrapped event.

### Phases (Modeling Key Compromise)

ProVerif supports `phase` to model forward secrecy:

```proverif
process
    new skA:privkey;
    out(c, pk(skA));
    phase 1;
    out(c, skA).   (* key compromise after protocol completes *)

query attacker(plaintext) phase 0.  (* secret in phase 0 even though key leaks in phase 1 *)
```

This models: "even if the long-term key is compromised later, messages sent before the compromise remain secret."

### Limitations

- **Non-termination**: ProVerif may loop forever on complex protocols. It uses Horn clause resolution which can diverge.
- **False attacks**: ProVerif overapproximates -- it may report attacks that are not actually realizable. This happens because it abstracts away some ordering information.
- **No computational guarantees**: The Dolev-Yao model assumes perfect cryptography. A ProVerif proof does not account for, e.g., nonce-reuse vulnerabilities in ChaCha20 or timing side channels.
- **Difficulty with state**: ProVerif handles stateful protocols poorly. For protocols that maintain mutable state (like a relay's event store), TLA+ or Tamarin is more appropriate.

### Best Practices

1. **Start simple**: Model the core key exchange and one message first. Add layers (HMAC, HKDF, Gift Wrap) incrementally.
2. **Name your events**: Insert `event` facts at every significant protocol step to enable correspondence queries.
3. **Test your model**: Before verifying complex properties, run a reachability query on a known-secret value to confirm your model is well-formed.
4. **Use `let` bindings**: Make the model readable; each cryptographic step should be its own `let`.
5. **Separate roles cleanly**: One `let` block per protocol participant.
6. **Add key compromise gradually**: First prove properties without compromise, then add phase-based compromise to test forward secrecy.

---

## 2. Tamarin Prover

### Overview

Tamarin is a protocol verification tool developed at ETH Zurich and CISPA. It uses **multiset rewriting rules** over a symbolic model with support for Diffie-Hellman exponentiation, bilinear pairings, and other algebraic theories built in. Unlike ProVerif, Tamarin supports both **automatic** and **interactive** (human-guided) proof construction.

### Input Language

Tamarin models consist of **rules**, **facts**, and **lemmas**.

#### Facts

- **Linear facts**: consumed when used (e.g., a one-time token)
- **Persistent facts**: prefixed with `!`, never consumed (e.g., a long-term key)
- **Action facts**: recorded in the trace for property verification (appear in `--[ ]-->`)

#### Rules

```tamarin
rule Generate_KeyPair:
    [ Fr(~sk) ]                    // Premise: fresh random value
    --[ GeneratedKey(pk(~sk)) ]-->  // Action fact (recorded in trace)
    [ !Ltk($A, ~sk), !Pk($A, pk(~sk)), Out(pk(~sk)) ]  // Conclusion
```

- `Fr(~sk)`: built-in fact producing a fresh name (random nonce/key)
- `$A`: a public name (agent identity)
- `~sk`: a fresh name (secret key)
- `Out(x)`: message sent to the adversary (public network)
- `In(x)`: message received from the adversary
- `!Ltk($A, ~sk)`: persistent fact storing A's long-term key

#### Modeling ECDH in Tamarin

Tamarin has built-in support for Diffie-Hellman:

```tamarin
builtins: diffie-hellman

rule DH_Exchange:
    [ Fr(~a), !Pk($B, 'g'^~b) ]
    --[ SharedSecret($A, $B, 'g'^(~a*~b)) ]-->
    [ !SharedKey($A, $B, 'g'^(~a*~b)), Out('g'^~a) ]
```

The term `'g'^(~a*~b)` is automatically equated with `'g'^(~b*~a)` by the built-in DH theory.

#### Modeling Key Compromise

```tamarin
rule Compromise_LongTermKey:
    [ !Ltk($A, sk) ]
    --[ Compromised($A) ]-->
    [ Out(sk) ]
```

This rule lets the adversary learn any agent's long-term key at any time. Lemmas then exclude or account for compromise:

```tamarin
lemma secrecy:
    "All A B m #i.
        Secret(A, B, m) @i
        ==> not(Ex #j. K(m) @j)
            | (Ex #c. Compromised(A) @c)
            | (Ex #c. Compromised(B) @c)"
```

"The message is secret unless one of the parties was compromised."

#### Temporal Reasoning

Tamarin's key advantage: action facts are timestamped, enabling temporal properties.

```tamarin
lemma ordering:
    "All A B m #i #j.
        Sent(A, B, m) @i & Received(A, B, m) @j
        ==> i < j"
```

"A message is always sent before it is received." This is trivial here but becomes powerful for complex multi-round protocols.

### When to Use Tamarin Over ProVerif

| Scenario | Recommendation |
|----------|---------------|
| Simple secrecy/authentication | ProVerif (faster, more automated) |
| Stateful protocol (relay stores events) | Tamarin (linear facts model mutable state) |
| Need temporal ordering guarantees | Tamarin (built-in timepoints) |
| Key compromise with fine-grained conditions | Tamarin (action facts + quantified lemmas) |
| Observational equivalence for privacy | ProVerif (more mature support) |
| Very large protocol (many rounds) | Try ProVerif first; fall back to Tamarin interactive mode |
| Need to manually guide the proof | Tamarin (interactive mode) |

### Limitations

- **Non-termination**: Like ProVerif, automatic mode may not terminate.
- **Interactive proofs can be enormous**: Complex protocols may require hundreds of manual proof steps.
- **Learning curve**: The rule-based formalism is less intuitive than ProVerif's process calculus for newcomers.

---

## 3. TLA+ and TLC Model Checker

### Overview

TLA+ (Temporal Logic of Actions) is a formal specification language created by Leslie Lamport for modeling concurrent and distributed systems. Unlike ProVerif and Tamarin, TLA+ does not model a cryptographic adversary. Instead, it excels at verifying **system-level properties**: message ordering, state machine correctness, fault tolerance, and liveness.

For NOSTR Mail, TLA+ is the right tool for verifying the **delivery subsystem**: relay behavior, multi-relay redundancy, failure recovery, and the message lifecycle state machine.

### Core Concepts

- **State**: an assignment of values to all variables
- **Action**: a boolean formula relating a state to its successor (primed variables)
- **Behavior**: an infinite sequence of states
- **Specification**: an initial predicate and a next-state relation, plus fairness constraints

### Syntax

#### Variables and Initial State

```tla
VARIABLES
    messages,      \* Set of messages in the system
    relayStore,    \* Function: relay -> set of events stored
    delivered,     \* Set of (recipient, messageId) pairs
    status         \* Function: messageId -> status enum

Init ==
    /\ messages = {}
    /\ relayStore = [r \in Relays |-> {}]
    /\ delivered = {}
    /\ status = [m \in {} |-> "none"]
```

#### Actions (State Transitions)

```tla
Compose(sender, recipient, body) ==
    /\ \E mid \in MessageIds \ DOMAIN status:
        /\ status' = status @@ (mid :> "composed")
        /\ messages' = messages \union {[id |-> mid, from |-> sender,
                                          to |-> recipient, body |-> body]}
        /\ UNCHANGED <<relayStore, delivered>>

Publish(mid, relay) ==
    /\ status[mid] = "wrapped"
    /\ relayStore' = [relayStore EXCEPT ![relay] = @ \union {mid}]
    /\ status' = [status EXCEPT ![mid] = "published"]
    /\ UNCHANGED <<messages, delivered>>
```

#### Failure Actions

```tla
RelayCrash(relay) ==
    /\ relayStore' = [relayStore EXCEPT ![relay] = {}]
    /\ UNCHANGED <<messages, delivered, status>>

ConnectionDrop(mid, relay) ==
    \* Message was being sent to relay but connection dropped
    \* Status remains "wrapped" -- not "published"
    /\ status[mid] = "wrapped"
    /\ UNCHANGED <<messages, relayStore, delivered, status>>
```

#### The Next-State Relation

```tla
Next ==
    \/ \E s, r \in Agents, b \in Bodies: Compose(s, r, b)
    \/ \E mid \in DOMAIN status: Seal(mid)
    \/ \E mid \in DOMAIN status: Wrap(mid)
    \/ \E mid \in DOMAIN status, r \in Relays: Publish(mid, r)
    \/ \E mid \in DOMAIN status, r \in Relays: Deliver(mid, r)
    \/ \E r \in Relays: RelayCrash(r)
    \/ \E mid \in DOMAIN status, r \in Relays: ConnectionDrop(mid, r)
```

#### The Specification

```tla
Spec == Init /\ [][Next]_vars /\ Fairness

vars == <<messages, relayStore, delivered, status>>
```

`[][Next]_vars` means: every step either satisfies `Next` or leaves all variables unchanged (stuttering). This is standard TLA+ idiom.

### Safety Properties (Invariants)

```tla
NoDoubleDelivery ==
    \A r \in Agents, mid \in DOMAIN status:
        Cardinality({d \in delivered : d.recipient = r /\ d.mid = mid}) <= 1

TypeInvariant ==
    /\ status \in [DOMAIN status -> {"composed","sealed","wrapped","published","delivered"}]
    /\ \A r \in Relays: relayStore[r] \subseteq DOMAIN status
```

"Nothing bad ever happens." TLC checks these hold in every reachable state.

### Liveness Properties

```tla
EventualDelivery ==
    \A mid \in DOMAIN status:
        status[mid] = "published" ~> status[mid] = "delivered"
```

`~>` is "leads to" (temporal operator). "Every published message is eventually delivered." This requires fairness assumptions (e.g., weak fairness on the `Deliver` action).

```tla
Fairness == \A mid \in DOMAIN status, r \in Relays:
    WF_vars(Deliver(mid, r))
```

### TLC Model Checker

TLC exhaustively explores the state space for a **finite instantiation**:

```tla
CONSTANTS
    Agents = {alice, bob, carol}
    Relays = {relay1, relay2, relay3}
    Bodies = {body1, body2}
    MessageIds = {m1, m2, m3}
```

TLC will explore all possible interleavings of actions with these finite sets. It reports counterexamples as concrete execution traces.

### Limitations

- **State space explosion**: grows exponentially with the number of agents, relays, and messages. Practical limit is typically 3-5 of each.
- **No cryptographic adversary**: TLA+ does not model an attacker who can decrypt or forge. Use ProVerif/Tamarin for that.
- **Finite instantiation required**: TLC cannot check infinite-state models directly. TLAPS (the TLA+ proof system) can, but requires manual proof.
- **No direct probabilistic reasoning**: cannot model probabilistic adversaries or quantify attack success probability.

### Best Practices

1. **Abstract aggressively**: model encryption as a function call, not its internals. TLA+ cares about message flow, not crypto correctness.
2. **Start with safety, add liveness later**: invariants are easier to check and debug.
3. **Use symmetry sets**: tell TLC that all agents/relays are interchangeable to reduce state space.
4. **Separate concerns**: one TLA+ spec for the delivery layer, another for the relay coordination protocol.
5. **Validate your model**: write simple sanity-check invariants that you know should fail (e.g., "no message is ever delivered") to confirm your model has the expected behaviors.

---

## 4. CryptoVerif

### Overview

CryptoVerif, also by Bruno Blanchet, operates in the **computational model** rather than the symbolic model. Instead of treating cryptographic primitives as perfect black boxes, it reasons about computationally bounded adversaries and proves security via **game-based reductions** to standard cryptographic assumptions (e.g., DDH, PRF, IND-CPA).

### Relationship to ProVerif

| Aspect | ProVerif | CryptoVerif |
|--------|----------|-------------|
| Model | Symbolic (Dolev-Yao) | Computational |
| Adversary | Unbounded, follows algebraic rules | Polynomially bounded |
| Crypto primitives | Perfect (equations) | Reduced to assumptions |
| Guarantees | Sound in symbolic model | Sound in computational model |
| Automation | Highly automated | Semi-automated |
| Difficulty | Moderate | High |

### When to Use CryptoVerif for NOSTR Mail

Use CryptoVerif **after** establishing properties in ProVerif, specifically to verify:

- That NIP-44's combination of ChaCha20 + HMAC-SHA256 + HKDF is IND-CPA and INT-CTXT secure under standard assumptions
- That the ECDH shared secret derivation is secure under the DDH assumption
- That the ephemeral key wrapping in NIP-59 provides computational unlinkability

### Modeling Approach

CryptoVerif uses a game-based language:

```cryptoverif
param N.  (* number of sessions *)

type key [large, fixed].
type nonce [large, fixed].

(* Symmetric encryption assumption: IND-CPA + INT-CTXT *)
proba Penc.
expand IND_CPA_INT_CTXT_sym_enc(key, bitstring, bitstring, enc, dec, injbot, Z, Penc).
```

The `expand` macro instantiates the standard security definition for symmetric encryption. CryptoVerif then transforms the protocol game step by step, replacing real cryptographic operations with ideal ones, accumulating a negligible probability bound.

### Limitations

- **Harder to specify**: requires understanding of game-based security definitions
- **Less automated**: may require manual guidance for game transitions
- **Longer development time**: a CryptoVerif proof of NIP-44 would take significantly more effort than a ProVerif proof
- **Complementary, not replacement**: use alongside ProVerif, not instead of it

---

## Tool Selection Guide for NOSTR Mail Verification

| What to Verify | Tool | Why |
|---------------|------|-----|
| NIP-44 encryption secrecy | ProVerif | Symbolic secrecy of encrypted content |
| NIP-44 authentication | ProVerif | Correspondence: HMAC ensures ciphertext integrity |
| NIP-59 sender anonymity | ProVerif | Observational equivalence: relay cannot identify sender |
| NIP-59 deniability | ProVerif | Unsigned rumor cannot be attributed |
| Forward secrecy (key compromise) | ProVerif (phases) or Tamarin | After key compromise, old messages stay secret |
| Delivery state machine | TLA+ / TLC | Safety and liveness of message lifecycle |
| Multi-relay redundancy | TLA+ / TLC | Delivery succeeds despite relay failures |
| No double-delivery | TLA+ / TLC | Safety invariant on delivery |
| Cashu double-spend prevention | Tamarin | Stateful protocol with mutable spent-secret DB |
| Computational security of NIP-44 | CryptoVerif | Reduction to DDH, IND-CPA, INT-CTXT assumptions |
| Multi-recipient unlinkability | ProVerif | Observational equivalence across recipient wraps |
