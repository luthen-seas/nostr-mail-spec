# NIP-06: Basic Key Derivation from Mnemonic Seed Phrase

## Status
Active (draft, optional)

## Summary
NIP-06 specifies how to derive Nostr keypairs from BIP-39 mnemonic seed phrases using BIP-32 hierarchical deterministic key derivation. This allows users to back up their Nostr identity with a standard mnemonic word sequence and derive multiple keys from a single seed.

## Motivation
Private key management is one of the biggest UX challenges in Nostr. By standardizing key derivation from mnemonic seed phrases (already familiar to Bitcoin users), NIP-06 enables portable, recoverable Nostr identities. Users can write down 12 or 24 words and restore their Nostr identity on any compliant client. It also supports deriving multiple distinct keypairs from a single seed for advanced use cases.

## Specification

### Event Kinds
No new event kinds are defined. This NIP specifies key derivation only.

### Tags
No new tags are defined.

### Protocol Flow

1. **Mnemonic Generation:** Use [BIP-39](https://bips.xyz/39) to generate a mnemonic seed phrase (12 or 24 words) and derive a binary seed from it.
2. **Key Derivation:** Use [BIP-32](https://bips.xyz/32) hierarchical deterministic derivation with the path:
   ```
   m/44'/1237'/<account>'/0/0
   ```
   - `44'` is the BIP-44 purpose field.
   - `1237'` is the Nostr coin type registered in [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
   - `<account>'` is the account index (start with `0` for basic usage).
   - The trailing `/0/0` completes the 5-level BIP-44 path.
3. **Basic Usage:** A simple client uses `account = 0` to derive a single key.
4. **Advanced Usage:** Increment `account` to generate additional keypairs (e.g., `m/44'/1237'/1'/0/0`, `m/44'/1237'/2'/0/0`, etc.).
5. The derived private key is used as the Nostr secp256k1 secret key.

### JSON Examples

No JSON event examples (this NIP does not define events).

### Test Vectors

**Test Vector 1 (12-word mnemonic):**

```
mnemonic:     leader monkey parrot ring guide accident before fence cannon height naive bean
private key:  7f7ff03d123792d6ac594bfa67bf6d0c0ab55b6b1fdb6249303fe861f1ccba9a
nsec:         nsec10allq0gjx7fddtzef0ax00mdps9t2kmtrldkyjfs8l5xruwvh2dq0lhhkp
public key:   17162c921dc4d2518f9a101db33695df1afb56ab82f5ff3e5da6eec3ca5cd917
npub:         npub1zutzeysacnf9rru6zqwmxd54mud0k44tst6l70ja5mhv8jjumytsd2x7nu
```

**Test Vector 2 (24-word mnemonic):**

```
mnemonic:     what bleak badge arrange retreat wolf trade produce cricket blur garlic valid proud rude strong choose busy staff weather area salt hollow arm fade
private key:  c15d739894c81a2fcfd3a2df85a0d2c0dbc47a280d092799f144d73d7ae78add
nsec:         nsec1c9wh8xy5eqdzln7n5t0ctgxjcrdug73gp5yj0x03gntn67h83twssdfhel
public key:   d41b22899549e1f3d335a31002cfd382174006e166d3e658e3a5eecdb6463573
npub:         npub16sdj9zv4f8sl85e45vgq9n7nsgt5qphpvmf7vk8r5hhvmdjxx4es8rq74h
```

## Implementation Notes

- All derivation levels use **hardened derivation** (indicated by the `'` suffix) for the first three levels, per BIP-44 standard.
- The coin type `1237` is officially registered in SLIP-44 for Nostr.
- Clients that do not need multiple accounts should default to `account = 0`.
- Other types of clients may use different derivation paths for their own purposes, but the standard path above ensures interoperability.
- Mnemonic phrases should be generated with sufficient entropy (128 bits for 12 words, 256 bits for 24 words).
- The private key derived is a raw 32-byte secp256k1 scalar.

## Client Behavior

- Clients SHOULD allow users to import a mnemonic seed phrase to derive their Nostr keypair.
- Clients SHOULD allow users to generate a new mnemonic and display it for backup.
- Clients MUST use the derivation path `m/44'/1237'/0'/0/0` for the default account.
- Clients MAY support multiple accounts by incrementing the account index.
- Clients SHOULD warn users to store their mnemonic securely and never share it.
- Clients SHOULD validate the mnemonic checksum before deriving keys.

## Relay Behavior

- Relays have no special behavior for NIP-06. Key derivation is entirely client-side.

## Dependencies

- [BIP-39](https://bips.xyz/39) -- Mnemonic code for generating deterministic keys
- [BIP-32](https://bips.xyz/32) -- Hierarchical Deterministic Wallets
- [BIP-44](https://bips.xyz/44) -- Multi-Account Hierarchy for Deterministic Wallets
- [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) -- Registered coin types (Nostr = 1237)

## Source Code References

- **nostr-tools (JS):** `nip06.ts` -- `generateSeedWords()`, `privateKeyFromSeedWords()`, `accountFromSeedWords()`
- **rust-nostr:** `nostr/src/nips/nip06.rs` -- `FromMnemonic` trait, key derivation
- **go-nostr:** BIP-32/39 integration for key derivation

## Related NIPs

- [NIP-49](./nip-49.md) -- Private Key Encryption (complementary: encrypting the derived key for storage)
- [NIP-07](./nip-07.md) -- Browser extension signing (alternative key management approach)
- [NIP-46](./nip-46.md) -- Nostr Remote Signing (alternative key management approach)
