# Formal Modeling Patterns for NOSTR Mail

Concrete modeling patterns for verifying a NOSTR-based email protocol that uses NIP-44 encryption (ChaCha20/HMAC/HKDF over ECDH) and NIP-59 Gift Wrap (three-layer onion encryption with ephemeral keys).

---

## 1. Modeling NIP-44 in ProVerif

NIP-44 defines versioned encrypted payloads using:
- ECDH shared secret between sender and recipient
- HKDF for key derivation (extract + expand)
- ChaCha20 for symmetric encryption
- HMAC-SHA256 for ciphertext authentication
- Random padding to hide message length

### Primitive Declarations

```proverif
(* Types *)
type privkey.
type pubkey.
type symkey.
type nonce.
type hmackey.
type macval.

(* Key generation *)
fun pk(privkey): pubkey.

(* ECDH *)
fun dh(privkey, pubkey): bitstring.
equation forall a:privkey, b:privkey; dh(a, pk(b)) = dh(b, pk(a)).

(* HKDF: two-stage key derivation *)
fun hkdf_extract(bitstring, bitstring): bitstring.     (* salt, ikm -> prk *)
fun hkdf_expand_enc(bitstring, bitstring): symkey.      (* info, prk -> encryption key *)
fun hkdf_expand_mac(bitstring, bitstring): hmackey.     (* info, prk -> HMAC key *)

(* ChaCha20 symmetric encryption *)
fun chacha20(bitstring, symkey, nonce): bitstring.
reduc forall m:bitstring, k:symkey, n:nonce;
    chacha20_dec(chacha20(m, k, n), k, n) = m.

(* HMAC-SHA256 *)
fun hmac(bitstring, hmackey): macval.
(* Verification: recompute and compare *)
reduc forall m:bitstring, k:hmackey;
    hmac_verify(m, hmac(m, k), k) = true.

(* Padding — model as a function that adds random bytes *)
fun pad(bitstring, nonce): bitstring.
reduc forall m:bitstring, r:nonce; unpad(pad(m, r)) = m.
```

### Full NIP-44 Encrypt/Decrypt Flow

```proverif
(* Conversation key: ECDH shared secret *)
letfun conversation_key(sk:privkey, their_pk:pubkey) =
    dh(sk, their_pk).

(* NIP-44 encrypt *)
letfun nip44_encrypt(sk:privkey, their_pk:pubkey, plaintext:bitstring,
                      salt:bitstring, n:nonce, pad_rand:nonce) =
    let ck = conversation_key(sk, their_pk) in
    let prk = hkdf_extract(salt, ck) in
    let enc_key = hkdf_expand_enc(enc_info, prk) in
    let mac_key = hkdf_expand_mac(mac_info, prk) in
    let padded = pad(plaintext, pad_rand) in
    let ciphertext = chacha20(padded, enc_key, n) in
    let mac = hmac(ciphertext, mac_key) in
    (ciphertext, mac, salt, n).

(* NIP-44 decrypt *)
letfun nip44_decrypt(sk:privkey, their_pk:pubkey,
                      ciphertext:bitstring, mac_val:macval,
                      salt:bitstring, n:nonce) =
    let ck = conversation_key(sk, their_pk) in
    let prk = hkdf_extract(salt, ck) in
    let enc_key = hkdf_expand_enc(enc_info, prk) in
    let mac_key = hkdf_expand_mac(mac_info, prk) in
    let =true = hmac_verify(ciphertext, mac_val, mac_key) in
    let padded = chacha20_dec(ciphertext, enc_key, n) in
    unpad(padded).
```

### Security Queries for NIP-44

```proverif
(* Secrecy: adversary cannot learn the plaintext *)
free secret_msg:bitstring [private].
query attacker(secret_msg).

(* Authentication: if Bob decrypts a message as from Alice, Alice sent it *)
event SenderEncrypted(pubkey, pubkey, bitstring).
event ReceiverDecrypted(pubkey, pubkey, bitstring).

query pkA:pubkey, pkB:pubkey, m:bitstring;
    event(ReceiverDecrypted(pkA, pkB, m)) ==>
    event(SenderEncrypted(pkA, pkB, m)).

(* Injective authentication: no replay *)
query pkA:pubkey, pkB:pubkey, m:bitstring;
    inj-event(ReceiverDecrypted(pkA, pkB, m)) ==>
    inj-event(SenderEncrypted(pkA, pkB, m)).

(* Forward secrecy via phases *)
query attacker(secret_msg) phase 0.
(* In phase 1, reveal long-term keys *)
```

### Protocol Processes for NIP-44

```proverif
free c:channel.                  (* public network / relay *)
free enc_info:bitstring.         (* HKDF info strings — public constants *)
free mac_info:bitstring.

let Alice(skA:privkey, pkB:pubkey) =
    new salt:bitstring;
    new n:nonce;
    new pad_rand:nonce;
    event SenderEncrypted(pk(skA), pkB, secret_msg);
    let (ct:bitstring, mac:macval, =salt, =n) =
        nip44_encrypt(skA, pkB, secret_msg, salt, n, pad_rand) in
    out(c, (ct, mac, salt, n, pk(skA))).

let Bob(skB:privkey) =
    in(c, (ct:bitstring, mac:macval, salt:bitstring, n:nonce, pkA:pubkey));
    let plaintext = nip44_decrypt(skB, pkA, ct, mac, salt, n) in
    event ReceiverDecrypted(pkA, pk(skB), plaintext).

process
    new skA:privkey; new skB:privkey;
    out(c, pk(skA)); out(c, pk(skB));
    ( !Alice(skA, pk(skB)) | !Bob(skB) )
```

---

## 2. Modeling NIP-59 Gift Wrap in ProVerif

NIP-59 defines three layers of wrapping:

1. **Rumor** (kind 1059 inner): the actual content event, unsigned (provides deniability)
2. **Seal** (kind 13): the rumor encrypted with NIP-44 to the recipient, signed by the real sender
3. **Gift Wrap** (kind 1059): the seal encrypted with NIP-44 using a fresh ephemeral key, signed by the ephemeral key

The relay only sees the gift wrap, which is signed by an ephemeral key. It cannot determine the real sender.

### Additional Primitives for Gift Wrap

```proverif
(* Nostr event signing — sender signs the event *)
fun nostr_sign(bitstring, privkey): bitstring.
reduc forall m:bitstring, sk:privkey;
    nostr_verify(nostr_sign(m, sk), pk(sk)) = m.

(* Extract message without verification — models that rumors are unsigned *)
reduc forall m:bitstring, sk:privkey;
    nostr_getmsg(nostr_sign(m, sk)) = m.
```

### Three-Layer Gift Wrap Process

```proverif
(* Layer 1: Create rumor (unsigned content) *)
letfun create_rumor(content:bitstring, sender_pk:pubkey, created_at:bitstring) =
    (content, sender_pk, created_at).
    (* Critically: NO signature. This is what provides deniability. *)

(* Layer 2: Seal — encrypt rumor to recipient, sign with sender's key *)
let Seal(skSender:privkey, pkRecipient:pubkey, rumor:bitstring) =
    new seal_salt:bitstring;
    new seal_nonce:nonce;
    new seal_pad:nonce;
    let (ct:bitstring, mac:macval, =seal_salt, =seal_nonce) =
        nip44_encrypt(skSender, pkRecipient, rumor, seal_salt, seal_nonce, seal_pad) in
    let seal_event = (ct, mac, seal_salt, seal_nonce) in
    let signed_seal = nostr_sign(seal_event, skSender) in
    signed_seal.

(* Layer 3: Gift Wrap — encrypt seal with ephemeral key, sign with ephemeral key *)
let GiftWrap(pkRecipient:pubkey, signed_seal:bitstring) =
    new skEphemeral:privkey;    (* FRESH ephemeral key — this is the core privacy mechanism *)
    new wrap_salt:bitstring;
    new wrap_nonce:nonce;
    new wrap_pad:nonce;
    let (ct:bitstring, mac:macval, =wrap_salt, =wrap_nonce) =
        nip44_encrypt(skEphemeral, pkRecipient, signed_seal,
                      wrap_salt, wrap_nonce, wrap_pad) in
    let wrap_event = (ct, mac, wrap_salt, wrap_nonce, pk(skEphemeral)) in
    let signed_wrap = nostr_sign(wrap_event, skEphemeral) in
    out(c, signed_wrap).

(* Full sender process *)
let Sender(skA:privkey, pkB:pubkey, content:bitstring) =
    new created_at:bitstring;
    let rumor = create_rumor(content, pk(skA), created_at) in
    event RumorCreated(pk(skA), pkB, content);
    let signed_seal = Seal(skA, pkB, rumor) in
    GiftWrap(pkB, signed_seal).

(* Full recipient process *)
let Recipient(skB:privkey) =
    in(c, signed_wrap:bitstring);
    (* Unwrap layer 3: decrypt with recipient's key *)
    (* The ephemeral pubkey is included in the wrap *)
    let (ct_wrap:bitstring, mac_wrap:macval, salt_wrap:bitstring,
         nonce_wrap:nonce, pkEph:pubkey) = nostr_getmsg(signed_wrap) in
    let signed_seal = nip44_decrypt(skB, pkEph, ct_wrap, mac_wrap,
                                     salt_wrap, nonce_wrap) in
    (* Unwrap layer 2: verify sender signature, decrypt seal *)
    (* Extract sender's pubkey from seal metadata *)
    let seal_event = nostr_verify(signed_seal, pkSender) in
    let (ct_seal:bitstring, mac_seal:macval, salt_seal:bitstring,
         nonce_seal:nonce) = seal_event in
    let rumor = nip44_decrypt(skB, pkSender, ct_seal, mac_seal,
                               salt_seal, nonce_seal) in
    let (content:bitstring, sender_pubkey:pubkey, ts:bitstring) = rumor in
    event MessageReceived(sender_pubkey, pk(skB), content).
```

### Verifying Sender Anonymity (Observational Equivalence)

The key privacy property of NIP-59: the relay (adversary) cannot determine who sent a gift-wrapped event.

```proverif
(* Two senders, Alice and Carol, both sending to Bob *)
(* The adversary should not distinguish which one sent a given wrap *)

let SenderAnon(sk:privkey, pkB:pubkey, content:bitstring) =
    new created_at:bitstring;
    let rumor = create_rumor(content, pk(sk), created_at) in
    new skEph:privkey;
    new seal_salt:bitstring; new seal_nonce:nonce; new seal_pad:nonce;
    let (ct_s:bitstring, mac_s:macval, =seal_salt, =seal_nonce) =
        nip44_encrypt(sk, pkB, rumor, seal_salt, seal_nonce, seal_pad) in
    let signed_seal = nostr_sign((ct_s, mac_s, seal_salt, seal_nonce), sk) in
    new wrap_salt:bitstring; new wrap_nonce:nonce; new wrap_pad:nonce;
    let (ct_w:bitstring, mac_w:macval, =wrap_salt, =wrap_nonce) =
        nip44_encrypt(skEph, pkB, signed_seal, wrap_salt, wrap_nonce, wrap_pad) in
    out(c, nostr_sign((ct_w, mac_w, wrap_salt, wrap_nonce, pk(skEph)), skEph)).

equivalence
    (* World 0: Alice sends *)
    new skA:privkey; new skB:privkey;
    out(c, pk(skA)); out(c, pk(skB));
    SenderAnon(skA, pk(skB), secret_msg)
    (* World 1: Carol sends *)
    new skC:privkey; new skB:privkey;
    out(c, pk(skC)); out(c, pk(skB));
    SenderAnon(skC, pk(skB), secret_msg)
```

If ProVerif proves this equivalence, the relay cannot distinguish Alice-sent wraps from Carol-sent wraps.

### Verifying Deniability

Deniability means: given a rumor, no one can prove to a third party that a specific person authored it, because the rumor is unsigned.

```proverif
(* The rumor itself carries no signature. Model this as: *)
(* An adversary who obtains the rumor content cannot produce *)
(* a term that links it to the sender's key. *)

(* Concretely: the rumor tuple (content, sender_pk, timestamp) *)
(* does not contain any value computable only by the sender. *)
(* The sender_pk is a claim, not a proof. *)

(* Formal query: after compromise of recipient, *)
(* adversary learns rumor but cannot prove sender authored it *)
query pkA:pubkey, m:bitstring;
    event(ForgedRumor(pkA, m)) ==> event(RumorCreated(pkA, m)).
(* This query should FAIL — meaning the adversary CAN forge rumors *)
(* That's the desired property: if anyone can forge, no one can prove authorship *)
```

The trick: deniability is verified by showing that forgery is *possible*. If ProVerif reports an attack on the authentication of unsigned rumors, that confirms deniability.

### Verifying Per-Layer Secrecy

```proverif
(* Secrecy of content from relay (sees only layer 3) *)
query attacker(secret_content).

(* Secrecy of sender identity from relay *)
free alice_identity:bitstring [private].
query attacker(alice_identity).

(* After recipient compromise, content is revealed but *)
(* other recipients' copies remain secret *)
(* Model with phases: phase 0 = normal, phase 1 = compromise recipient B *)
```

---

## 3. Modeling the Delivery State Machine in TLA+

### State Variables

```tla
CONSTANTS
    Senders,        \* Set of sender agents
    Recipients,     \* Set of recipient agents
    Relays,         \* Set of relay servers
    MaxMessages     \* Bound on number of messages (for finite model checking)

VARIABLES
    msgPool,        \* Function: msgId -> message record
    relayState,     \* Function: relay -> "up" | "down"
    relayStore,     \* Function: relay -> set of wrapped event IDs
    relayQueue,     \* Function: relay -> set of (recipient, wrappedEventId) pending delivery
    clientInbox,    \* Function: recipient -> set of unwrapped message IDs
    publishLog,     \* Set of (msgId, relay) pairs — tracks where each msg was published
    msgStatus       \* Function: msgId -> "composed"|"sealed"|"wrapped"|"published"|"delivered"
```

### Initial State

```tla
Init ==
    /\ msgPool = <<>>
    /\ relayState = [r \in Relays |-> "up"]
    /\ relayStore = [r \in Relays |-> {}]
    /\ relayQueue = [r \in Relays |-> {}]
    /\ clientInbox = [a \in Recipients |-> {}]
    /\ publishLog = {}
    /\ msgStatus = <<>>
```

### Actions

```tla
(* Sender composes a new message *)
Compose(sender, recipient, body) ==
    /\ Len(msgPool) < MaxMessages
    /\ LET mid == Len(msgPool) + 1
           msg == [id |-> mid, from |-> sender, to |-> recipient,
                   body |-> body, wraps |-> {}]
       IN /\ msgPool' = Append(msgPool, msg)
          /\ msgStatus' = Append(msgStatus, "composed")
          /\ UNCHANGED <<relayState, relayStore, relayQueue, clientInbox, publishLog>>

(* Seal: encrypt rumor to recipient *)
SealMessage(mid) ==
    /\ msgStatus[mid] = "composed"
    /\ msgStatus' = [msgStatus EXCEPT ![mid] = "sealed"]
    /\ UNCHANGED <<msgPool, relayState, relayStore, relayQueue, clientInbox, publishLog>>

(* Wrap: encrypt seal with ephemeral key *)
WrapMessage(mid) ==
    /\ msgStatus[mid] = "sealed"
    /\ msgStatus' = [msgStatus EXCEPT ![mid] = "wrapped"]
    /\ UNCHANGED <<msgPool, relayState, relayStore, relayQueue, clientInbox, publishLog>>

(* Publish to a specific relay *)
PublishToRelay(mid, relay) ==
    /\ msgStatus[mid] = "wrapped"
    /\ relayState[relay] = "up"
    /\ relayStore' = [relayStore EXCEPT ![relay] = @ \union {mid}]
    /\ relayQueue' = [relayQueue EXCEPT ![relay] =
                        @ \union {<<msgPool[mid].to, mid>>}]
    /\ publishLog' = publishLog \union {<<mid, relay>>}
    /\ msgStatus' = [msgStatus EXCEPT ![mid] = "published"]
    /\ UNCHANGED <<msgPool, relayState, clientInbox>>

(* Relay delivers to recipient's client *)
RelayDeliver(relay, recipient, mid) ==
    /\ relayState[relay] = "up"
    /\ <<recipient, mid>> \in relayQueue[relay]
    /\ clientInbox' = [clientInbox EXCEPT ![recipient] = @ \union {mid}]
    /\ relayQueue' = [relayQueue EXCEPT ![relay] = @ \ {<<recipient, mid>>}]
    /\ msgStatus' = [msgStatus EXCEPT ![mid] = "delivered"]
    /\ UNCHANGED <<msgPool, relayState, relayStore, publishLog>>

(* FAILURE: Relay crashes — loses all stored data *)
RelayCrash(relay) ==
    /\ relayState[relay] = "up"
    /\ relayState' = [relayState EXCEPT ![relay] = "down"]
    /\ relayStore' = [relayStore EXCEPT ![relay] = {}]
    /\ relayQueue' = [relayQueue EXCEPT ![relay] = {}]
    /\ UNCHANGED <<msgPool, clientInbox, publishLog, msgStatus>>

(* FAILURE: Relay recovers but with empty store *)
RelayRecover(relay) ==
    /\ relayState[relay] = "down"
    /\ relayState' = [relayState EXCEPT ![relay] = "up"]
    /\ UNCHANGED <<msgPool, relayStore, relayQueue, clientInbox, publishLog, msgStatus>>

(* FAILURE: Publish attempt fails due to connection drop *)
PublishFail(mid, relay) ==
    /\ msgStatus[mid] = "wrapped"
    /\ UNCHANGED <<msgPool, relayState, relayStore, relayQueue,
                   clientInbox, publishLog, msgStatus>>
    \* Status stays "wrapped" — sender can retry

(* Sender retries publish to a different relay *)
RetryPublish(mid, relay) ==
    /\ msgStatus[mid] \in {"wrapped", "published"}
    /\ relayState[relay] = "up"
    /\ mid \notin relayStore[relay]
    /\ relayStore' = [relayStore EXCEPT ![relay] = @ \union {mid}]
    /\ relayQueue' = [relayQueue EXCEPT ![relay] =
                        @ \union {<<msgPool[mid].to, mid>>}]
    /\ publishLog' = publishLog \union {<<mid, relay>>}
    /\ msgStatus' = [msgStatus EXCEPT ![mid] = "published"]
    /\ UNCHANGED <<msgPool, relayState, clientInbox>>
```

### Next-State Relation

```tla
Next ==
    \/ \E s \in Senders, r \in Recipients, b \in Bodies: Compose(s, r, b)
    \/ \E mid \in 1..Len(msgPool): SealMessage(mid)
    \/ \E mid \in 1..Len(msgPool): WrapMessage(mid)
    \/ \E mid \in 1..Len(msgPool), r \in Relays: PublishToRelay(mid, r)
    \/ \E r \in Relays, rcpt \in Recipients, mid \in 1..Len(msgPool):
        RelayDeliver(r, rcpt, mid)
    \/ \E r \in Relays: RelayCrash(r)
    \/ \E r \in Relays: RelayRecover(r)
    \/ \E mid \in 1..Len(msgPool), r \in Relays: PublishFail(mid, r)
    \/ \E mid \in 1..Len(msgPool), r \in Relays: RetryPublish(mid, r)
```

### Safety Properties

```tla
(* No message is delivered to the wrong recipient *)
CorrectDelivery ==
    \A rcpt \in Recipients, mid \in 1..Len(msgPool):
        mid \in clientInbox[rcpt] => msgPool[mid].to = rcpt

(* No double delivery from the same relay *)
NoDoubleDeliveryPerRelay ==
    \A r \in Relays, rcpt \in Recipients, mid \in 1..Len(msgPool):
        \* Once delivered and removed from queue, cannot be re-delivered
        (mid \in clientInbox[rcpt] /\ <<rcpt, mid>> \notin relayQueue[r])
        => [](<<rcpt, mid>> \notin relayQueue[r])

(* Status monotonicity: messages only move forward in lifecycle *)
StatusMonotonicity ==
    \A mid \in 1..Len(msgPool):
        LET s == msgStatus[mid] IN
        /\ s = "delivered" => s' # "composed" /\ s' # "sealed" /\ s' # "wrapped"
        /\ s = "published" => s' # "composed" /\ s' # "sealed"
```

### Liveness Properties

```tla
(* If published to at least one live relay, eventually delivered *)
EventualDelivery ==
    \A mid \in 1..Len(msgPool):
        (\E r \in Relays: mid \in relayStore[r] /\ relayState[r] = "up")
        ~> (mid \in clientInbox[msgPool[mid].to])

(* Stronger: if published to N relays and at most N-1 crash, delivery happens *)
RedundantDelivery(N) ==
    \A mid \in 1..Len(msgPool):
        (Cardinality({r \in Relays : <<mid, r>> \in publishLog}) >= N)
        ~> (mid \in clientInbox[msgPool[mid].to])
```

### Fairness Constraints

```tla
Fairness ==
    /\ \A r \in Relays, rcpt \in Recipients, mid \in 1..Len(msgPool):
        WF_vars(RelayDeliver(r, rcpt, mid))
    /\ \A r \in Relays:
        WF_vars(RelayRecover(r))

Spec == Init /\ [][Next]_vars /\ Fairness
```

### Model Checking Configuration

```tla
\* For TLC model checking, use small finite instantiation:
CONSTANTS
    Senders = {s1}
    Recipients = {r1, r2}
    Relays = {relay1, relay2, relay3}
    Bodies = {b1}
    MaxMessages = 2

\* Check:
\* INVARIANT CorrectDelivery
\* INVARIANT TypeInvariant
\* PROPERTY EventualDelivery
```

---

## 4. Modeling Cashu Token Verification

Cashu tokens (used for paid NOSTR Mail) rely on blind signatures. The core security properties are no-double-spend and blindness (unlinkability of issuance to redemption).

### Tamarin Model for Cashu Tokens

```tamarin
theory CashuTokens
begin

builtins: signing, hashing

(* Blind signature scheme *)
functions: blind/2, unblind/2, blindsign/2, blindverify/3
equations: unblind(blindsign(blind(m, r), sk), r) = sign(m, sk)

(* Mint generates a key *)
rule Mint_Setup:
    [ Fr(~sk) ]
    --[ MintKey(pk(~sk)) ]-->
    [ !MintSk(~sk), !MintPk(pk(~sk)), Out(pk(~sk)) ]

(* User requests token: blinds a secret, sends to mint *)
rule User_Request:
    [ Fr(~secret), Fr(~blind_factor), !MintPk(mpk) ]
    --[ TokenRequested(~secret) ]-->
    [ Out(blind(~secret, ~blind_factor)),
      UserState($User, ~secret, ~blind_factor) ]

(* Mint signs the blinded value *)
rule Mint_Sign:
    [ In(blinded_msg), !MintSk(sk) ]
    --[ MintSigned(blinded_msg) ]-->
    [ Out(blindsign(blinded_msg, sk)) ]

(* User unblinds to get valid token *)
rule User_Unblind:
    [ In(blind_sig), UserState($User, ~secret, ~blind_factor) ]
    --[ TokenCreated($User, ~secret) ]-->
    [ UserToken($User, ~secret, unblind(blind_sig, ~blind_factor)) ]

(* User redeems token *)
rule User_Redeem:
    [ UserToken($User, secret, sig), !MintPk(mpk) ]
    --[ TokenRedeemed($User, secret) ]-->
    [ Out(<secret, sig>) ]

(* Mint verifies and marks as spent *)
rule Mint_Verify:
    [ In(<secret, sig>), !MintSk(sk),
      (* Linear fact: secret not yet spent *)
      Fr(~session) ]
    --[ Verified(secret), SpentSecret(secret) ]-->
    [ SpentDB(secret) ]

(* Double-spend attempt: same secret presented again *)
rule Mint_Reject_DoubleSpend:
    [ In(<secret, sig>), SpentDB(secret) ]
    --[ DoubleSpendAttempt(secret) ]-->
    [ SpentDB(secret) ]  (* SpentDB is persistent — remains *)

(* === Lemmas === *)

(* No double spend: a secret is verified at most once *)
lemma no_double_spend:
    "All s #i #j. Verified(s) @i & Verified(s) @j ==> #i = #j"

(* Blindness: mint cannot link signing to redemption *)
(* This is modeled as: the mint's signed value and the redeemed *)
(* value are unlinkable — the blind factor hides the connection *)
lemma blindness:
    "All u s #i #j.
        MintSigned(blind(s, bf)) @i & TokenRedeemed(u, s) @j
        ==> not(Ex #k. K(bf) @k)"
    (* The mint never learns the blinding factor *)

end
```

### Key Insight for NOSTR Mail

When modeling Cashu in the context of NOSTR Mail:
- The token is included in the gift-wrapped message
- The recipient extracts and redeems the token
- The mint's spent-secret database is the critical stateful component
- Tamarin's linear facts naturally model the "spent once" property

---

## 5. Modeling Multi-Recipient Encryption

When a sender sends to N recipients, each gets an independent gift wrap with a unique ephemeral key.

### ProVerif Model

```proverif
(* Send same content to two recipients with independent wraps *)
let MultiRecipientSender(skA:privkey, pkB:pubkey, pkC:pubkey,
                          content:bitstring) =
    (* Wrap for B *)
    new skEph_B:privkey;
    new salt_B:bitstring; new nonce_B:nonce; new pad_B:nonce;
    new seal_salt_B:bitstring; new seal_nonce_B:nonce; new seal_pad_B:nonce;
    let rumor = (content, pk(skA)) in
    let (ct_seal_B:bitstring, mac_seal_B:macval, _, _) =
        nip44_encrypt(skA, pkB, rumor, seal_salt_B, seal_nonce_B, seal_pad_B) in
    let signed_seal_B = nostr_sign((ct_seal_B, mac_seal_B), skA) in
    let (ct_wrap_B:bitstring, mac_wrap_B:macval, _, _) =
        nip44_encrypt(skEph_B, pkB, signed_seal_B, salt_B, nonce_B, pad_B) in
    out(c, nostr_sign((ct_wrap_B, mac_wrap_B, pk(skEph_B)), skEph_B));

    (* Wrap for C — completely independent ephemeral key and randomness *)
    new skEph_C:privkey;
    new salt_C:bitstring; new nonce_C:nonce; new pad_C:nonce;
    new seal_salt_C:bitstring; new seal_nonce_C:nonce; new seal_pad_C:nonce;
    let (ct_seal_C:bitstring, mac_seal_C:macval, _, _) =
        nip44_encrypt(skA, pkC, rumor, seal_salt_C, seal_nonce_C, seal_pad_C) in
    let signed_seal_C = nostr_sign((ct_seal_C, mac_seal_C), skA) in
    let (ct_wrap_C:bitstring, mac_wrap_C:macval, _, _) =
        nip44_encrypt(skEph_C, pkC, signed_seal_C, salt_C, nonce_C, pad_C) in
    out(c, nostr_sign((ct_wrap_C, mac_wrap_C, pk(skEph_C)), skEph_C)).
```

### Security Queries for Multi-Recipient

```proverif
(* Compromising B reveals nothing about C's copy *)
(* Model: give adversary skB, verify C's content stays secret *)
process
    new skA:privkey; new skB:privkey; new skC:privkey;
    out(c, pk(skA)); out(c, pk(skB)); out(c, pk(skC));
    out(c, skB);  (* Compromise recipient B *)
    MultiRecipientSender(skA, pk(skB), pk(skC), secret_msg) |
    !Recipient(skC)

query attacker(secret_msg).  (* Should hold: C's copy is still secret *)
```

```proverif
(* Relay cannot correlate wraps belonging to same message *)
(* Model as observational equivalence: *)
(* World 0: Alice sends "hello" to both B and C *)
(* World 1: Alice sends "hello" to B, Carol sends "world" to C *)
(* Relay cannot distinguish these worlds *)

equivalence
    (* World 0: same sender, same message *)
    new skA:privkey; new skB:privkey; new skC:privkey;
    out(c, pk(skA)); out(c, pk(skB)); out(c, pk(skC));
    MultiRecipientSender(skA, pk(skB), pk(skC), msg1)

    (* World 1: different senders *)
    new skA:privkey; new skCarol:privkey; new skB:privkey; new skC:privkey;
    out(c, pk(skA)); out(c, pk(skCarol)); out(c, pk(skB)); out(c, pk(skC));
    SingleSender(skA, pk(skB), msg1) | SingleSender(skCarol, pk(skC), msg2)
```

---

## 6. Common Pitfalls and Mitigations

### Over-Abstraction

**Problem**: Modeling encryption as a single `enc(m, k)` constructor hides real-world attacks that exploit the composition of HKDF + ChaCha20 + HMAC.

**Mitigation**: Model each stage separately. If NIP-44 uses HKDF to derive separate encryption and MAC keys, model that derivation explicitly. If the HMAC covers only the ciphertext but not the nonce, model that precisely -- it could reveal an authentication gap.

### Under-Abstraction

**Problem**: Modeling every byte of the NIP-44 payload format (version byte, nonce, padded length, ciphertext, MAC) causes ProVerif to diverge.

**Mitigation**: Abstract the wire format. Model the *cryptographic operations* faithfully but treat serialization as a simple tuple. Verify the crypto properties, not the parsing.

### Missing Composition Verification

**Problem**: Proving NIP-44 secure in isolation and NIP-59 wrapping secure in isolation does not guarantee the composition is secure. The three layers interact: if the seal layer leaks timing information through the ciphertext length, the gift wrap layer's padding may or may not compensate.

**Mitigation**: Always build a **composed model** that runs all three layers in sequence within a single ProVerif process. Verify properties against the full composition, not individual layers.

### Forgetting Key Compromise Scenarios

**Problem**: Proving secrecy assuming all keys are safe is necessary but insufficient. NIP-44/59 should provide forward secrecy and limit the damage of key compromise.

**Mitigation**: Systematically model these scenarios:
1. **Long-term key compromise after protocol run**: use ProVerif phases
2. **Ephemeral key compromise**: add `out(c, skEph)` and re-check properties
3. **Recipient compromise**: add `out(c, skRecipient)` and check sender anonymity persists for other recipients
4. **Relay compromise**: already modeled by the public channel, but verify that relay learning the gift wrap reveals nothing about the rumor

### Timing and Metadata Leakage

**Problem**: Formal models typically abstract away timing. But in NOSTR, the `created_at` timestamp in the gift wrap, the relay's observation of when events arrive, and message sizes can leak information.

**Mitigation**: Model timing as an explicit adversary observation:
```proverif
(* Model timestamp as adversary-observable value *)
new real_timestamp:bitstring;
let fake_timestamp = random_timestamp() in  (* NIP-59 recommends randomizing *)
out(c, fake_timestamp);  (* Adversary sees the gift wrap timestamp *)
(* Verify: adversary cannot determine real_timestamp from fake_timestamp *)
query attacker(real_timestamp).
```

### State Space Explosion in TLA+

**Problem**: With 3 senders, 3 recipients, 3 relays, and 3 messages, TLC may explore billions of states.

**Mitigation**:
1. Use **symmetry sets** to reduce equivalent states
2. Start with 1 sender, 1 recipient, 2 relays, 1 message
3. Abstract the crypto layers entirely (TLA+ verifies delivery, not encryption)
4. Use **state constraints** to prune unreachable states
5. Consider **simulation mode** (random walk) for larger models before exhaustive checking
