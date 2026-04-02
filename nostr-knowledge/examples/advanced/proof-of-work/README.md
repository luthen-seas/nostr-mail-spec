# NIP-13 Proof-of-Work

## What is PoW on NOSTR?

NIP-13 defines a proof-of-work mechanism for NOSTR events. By mining an event
(finding a nonce that produces an event ID with leading zero bits), a publisher
demonstrates that computational effort was invested. This serves as:

- **Spam deterrence** — relays can require a minimum PoW difficulty for events,
  making mass spam expensive.
- **Priority signal** — clients can sort events by difficulty, surfacing
  high-effort content.
- **Rate limiting** — a relay can require higher difficulty during high load.

## How it works

### The event ID is a SHA-256 hash

Every NOSTR event has an `id` field which is the SHA-256 hash of the
serialized event:

```
SHA-256([0, pubkey, created_at, kind, tags, content])
```

### The nonce tag

To mine an event, the publisher adds a **nonce tag**:

```json
["nonce", "<counter>", "<target-difficulty>"]
```

- `counter` — the miner increments this value until a valid hash is found.
- `target-difficulty` — the number of leading zero bits the publisher was
  aiming for (committed upfront so it cannot be faked after the fact).

### Mining algorithm

1. Set `nonce = 0`.
2. Build the event with `["nonce", nonce.toString(), targetDifficulty.toString()]`.
3. Compute the event ID (SHA-256).
4. Count leading zero bits in the ID.
5. If `leading_zeros >= target`, sign and publish. Otherwise increment
   nonce and go to step 2.

### Difficulty calculation

The difficulty is the number of **leading zero bits** in the event ID (hex).

| Leading zero bits | Expected attempts | Hex prefix looks like |
|---|---|---|
| 8 | ~256 | `00xxxxxx...` |
| 16 | ~65,536 | `0000xxxx...` |
| 20 | ~1,048,576 | `00000xxx...` |
| 24 | ~16,777,216 | `000000xx...` |
| 32 | ~4,294,967,296 | `00000000...` |

Each additional bit doubles the expected number of attempts.

### Counting leading zero bits

For each hex character (4 bits):

| Hex | Binary | Leading zeros |
|---|---|---|
| `0` | `0000` | 4 |
| `1` | `0001` | 3 |
| `2` | `0010` | 2 |
| `3` | `0011` | 2 |
| `4`-`7` | `01xx` | 1 |
| `8`-`f` | `1xxx` | 0 |

Count full zero hex chars (4 bits each), then add the partial bits from the
first non-zero hex char.

## Verification

When receiving an event with a nonce tag, a relay or client can verify PoW:

1. Check that the `nonce` tag exists and has a target difficulty in `[2]`.
2. Count the leading zero bits of the event `id`.
3. Verify that `actual_bits >= claimed_target`.

**Important:** The target difficulty is committed in the nonce tag. This
prevents a miner from computing a random event and retroactively claiming
whatever difficulty it happens to have.

## Relay policies

Relays can enforce PoW requirements:

- **Minimum difficulty** — reject events below a threshold (e.g., 16 bits).
- **Dynamic difficulty** — increase the requirement during high load.
- **Kind-specific** — require higher PoW for kind 1 (notes) than kind 7
  (reactions).

## Running

```bash
npm install nostr-tools
npm install -D typescript ts-node @types/node

npx ts-node proof_of_work.ts
```

The script will mine a note, verify it, and run a benchmark across several
difficulty levels.
