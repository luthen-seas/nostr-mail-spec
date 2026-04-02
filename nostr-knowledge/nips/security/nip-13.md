# NIP-13: Proof of Work

## Status
Draft / Optional

## Summary
NIP-13 defines a hashcash-like Proof of Work (PoW) scheme for Nostr events. By requiring that an event's ID (a SHA-256 hash) begins with a certain number of leading zero bits, publishers prove they have expended computational effort before broadcasting. This serves as a spam deterrent that any relay or client can verify with minimal code.

## Motivation
Open relay networks are vulnerable to spam flooding. Without rate limiting or identity verification, any pubkey can broadcast unlimited events. NIP-13 provides a permissionless, decentralized anti-spam mechanism: publishers must "mine" their events by iterating a nonce until the resulting event ID has enough leading zero bits. This raises the cost of bulk spam without requiring trust, reputation, or payment infrastructure.

## Specification

### Event Kinds
NIP-13 does not define new event kinds. It applies to **any** event kind defined by NIP-01. The PoW is embedded in the event's tags and validated against the event's `id` field.

### Tags

#### `nonce` Tag
The sole tag introduced by NIP-13:

```
["nonce", "<nonce_value>", "<target_difficulty>"]
```

| Position | Field | Description |
|----------|-------|-------------|
| 0 | `"nonce"` | Fixed tag name |
| 1 | Nonce value | An incrementing counter (as a string) that the miner updates each iteration |
| 2 | Target difficulty | The committed difficulty target (number of leading zero bits). SHOULD be included. |

- The **second entry** is the value that gets incremented during mining.
- The **third entry** SHOULD contain the target difficulty so validators can reject events where a lower-difficulty miner got lucky. Clients MAY reject notes that match difficulty but lack a committed target.

### Protocol Flow

#### Mining Algorithm

1. Construct the event per NIP-01 (set `pubkey`, `kind`, `content`, `tags`, `created_at`).
2. Add a `["nonce", "0", "<target>"]` tag to the `tags` array, where `<target>` is the desired difficulty (e.g., `"20"`).
3. Serialize the event to compute the event ID per NIP-01:
   ```
   SHA256(JSON.serialize([0, pubkey, created_at, kind, tags, content]))
   ```
4. Count leading zero bits in the resulting 32-byte hash.
5. If the count >= target difficulty, the event is mined. Sign it and broadcast.
6. Otherwise, increment the nonce value (second element of the nonce tag), optionally update `created_at`, and go to step 3.

#### Difficulty Calculation

`difficulty` = the number of leading zero bits in the event `id` (hex-encoded, 64 characters / 32 bytes).

**Counting rules:**
- Each hex digit `0` contributes 4 zero bits.
- For the first non-zero hex digit, count its leading zero bits in 4-bit binary representation.
- Hex digits `0`-`7` have at least 1 leading zero bit; do not forget to count them.

**Example:** `000000000e9d97a1...` has 36 leading zero bits (9 hex zeroes = 36 bits, then `0` in the leading bit of `e` which is `1110` = 0 additional).

Wait -- let's be precise: 8 hex `0` digits = 32 bits, then `0` = 4 more bits = 36. Then `e` = `1110`, which has 0 leading zeroes. Total = 36.

Another example: `002f...` = `0000 0000 0010 1111...` = 10 leading zero bits.

#### Validation (Reference Implementations)

**C implementation:**

```c
int zero_bits(unsigned char b)
{
    int n = 0;

    if (b == 0)
        return 8;

    while (b >>= 1)
        n++;

    return 7 - n;
}

/* find the number of leading zero bits in a hash */
int count_leading_zero_bits(unsigned char *hash)
{
    int bits, total, i;
    for (i = 0, total = 0; i < 32; i++) {
        bits = zero_bits(hash[i]);
        total += bits;
        if (bits != 8)
            break;
    }
    return total;
}
```

**JavaScript implementation:**

```javascript
// hex should be a hexadecimal string (with no 0x prefix)
function countLeadingZeroes(hex) {
  let count = 0;

  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16);
    if (nibble === 0) {
      count += 4;
    } else {
      count += Math.clz32(nibble) - 28;
      break;
    }
  }

  return count;
}
```

### JSON Examples

#### Nonce tag in an unsigned event (pre-mining):

```json
{
  "content": "It's just me mining my own business",
  "tags": [
    ["nonce", "1", "21"]
  ]
}
```

#### Fully mined and signed event:

```json
{
  "id": "000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358",
  "pubkey": "a48380f4cfcc1ad5378294fcac36439770f9c878dd880ffa94bb74ea54a6f243",
  "created_at": 1651794653,
  "kind": 1,
  "tags": [
    ["nonce", "776797", "20"]
  ],
  "content": "It's just me mining my own business",
  "sig": "284622fc0a3f4f1303455d5175f7ba962a3300d136085b9566801bc2e0699de0c7e31e44c81fb40ad9049173742e904713c3594a1da0fc5d2382a25c11aba977"
}
```

In this example the event ID starts with `000006d8...`. Converting to binary:
- `0` x 5 = 20 zero bits
- `6` = `0110` = 1 leading zero bit
- Total = 21 leading zero bits

The committed target is `"20"`, and the actual difficulty is 21, so it passes validation.

## Implementation Notes

1. **Nonce iteration strategy:** The spec does not prescribe how to increment the nonce. Implementations typically use a simple integer counter, but random values also work.

2. **Updating `created_at`:** It is recommended to update `created_at` during mining to keep the timestamp fresh. Relays that reject old events could otherwise reject a long-mined event.

3. **Committed difficulty vs. actual difficulty:** A spammer targeting difficulty 10 may occasionally produce an ID with 30+ leading zeroes by luck. The committed target (third element of the nonce tag) lets validators distinguish honest high-difficulty miners from lucky low-difficulty spammers.

4. **Delegated Proof of Work:** Since the event ID is computed from the serialized event *without* the signature, PoW can be outsourced. A third party can mine the nonce and return the result; the original author then signs. This is useful for energy-constrained devices (mobile phones) that can pay a PoW provider.

5. **Performance considerations:** Mining difficulty 20 typically takes seconds; difficulty 30+ can take minutes to hours depending on hardware. Each increment requires a full SHA-256 computation.

6. **No replay protection from PoW alone:** PoW proves work was done but does not prevent the same event from being rebroadcast. Relays still need deduplication by event ID.

## Client Behavior

- Clients SHOULD include the target difficulty as the third element of the `nonce` tag.
- Clients MAY reject events that match a target difficulty but are missing a difficulty commitment.
- Clients MAY display PoW difficulty as a quality/trust signal to users.
- Clients SHOULD update `created_at` during mining to avoid timestamp staleness.
- Clients on resource-constrained devices MAY delegate PoW to external services.

## Relay Behavior

- Relays MAY require a minimum PoW difficulty for event acceptance.
- Relays MUST validate the PoW by checking leading zero bits in the event ID.
- Relays MAY use committed target difficulty (third nonce tag element) to reject events from miners targeting a lower difficulty.
- Relays SHOULD communicate their minimum PoW requirements (though the mechanism for this is not specified in NIP-13 itself).
- Relays MAY set different PoW requirements for different event kinds.

## Dependencies

- **NIP-01** -- Event format, event ID computation (SHA-256 of the serialized event array), and signature scheme.

## Source Code References

- **nostr-tools (JS/TS):** `nip13.ts` -- provides `getPow()` to count leading zero bits and `minePow()` to mine events to a target difficulty.
- **rust-nostr:** `crate::nips::nip13` -- PoW mining and validation.
- **go-nostr:** Check for PoW-related utilities in the `nip13` package or event validation helpers.

## Related NIPs

- **NIP-01** -- Core event format and ID computation (the foundation for PoW).
- **NIP-42** -- Client authentication to relays (an alternative/complementary anti-spam approach).
