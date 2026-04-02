/**
 * nip19_encoding.ts
 *
 * Demonstrates NIP-19 bech32 encoding and decoding:
 *   - npub / nsec (public and secret keys)
 *   - note (event IDs)
 *   - nprofile (pubkey + relay hints)
 *   - nevent (event ID + relay hints + author + kind)
 *   - naddr (replaceable event addresses)
 *   - Decoding any bech32 entity
 *   - Type guards
 *   - nostr: URI handling
 *
 * Install:
 *   npm install nostr-tools
 *
 * Run:
 *   npx tsx nip19_encoding.ts
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { bytesToHex } from '@noble/hashes/utils'

// Generate a keypair to work with
const sk = generateSecretKey()
const pk = getPublicKey(sk)

console.log('=== Raw Key Material ===')
console.log('Secret key (hex):', bytesToHex(sk))
console.log('Public key (hex):', pk)
console.log()

// ---------------------------------------------------------------------------
// 1. npub -- Encoding and Decoding Public Keys
// ---------------------------------------------------------------------------

const npub = nip19.npubEncode(pk)
console.log('=== npub (Public Key) ===')
console.log('Encoded:', npub)

const decodedNpub = nip19.decode(npub)
console.log('Decoded type:', decodedNpub.type) // 'npub'
console.log('Decoded data:', decodedNpub.data) // hex pubkey string
console.log('Round-trip matches:', decodedNpub.data === pk)
console.log()

// ---------------------------------------------------------------------------
// 2. nsec -- Encoding and Decoding Secret Keys
// ---------------------------------------------------------------------------

const nsec = nip19.nsecEncode(sk)
console.log('=== nsec (Secret Key) ===')
console.log('Encoded:', nsec)

const decodedNsec = nip19.decode(nsec)
console.log('Decoded type:', decodedNsec.type) // 'nsec'
// decodedNsec.data is Uint8Array, not hex
console.log('Decoded data (hex):', bytesToHex(decodedNsec.data as Uint8Array))
console.log()

// ---------------------------------------------------------------------------
// 3. note -- Encoding and Decoding Event IDs
// ---------------------------------------------------------------------------

// Use a sample event ID (64-char hex)
const sampleEventId = 'a'.repeat(64) // placeholder for demonstration

const noteEncoded = nip19.noteEncode(sampleEventId)
console.log('=== note (Event ID) ===')
console.log('Encoded:', noteEncoded)

const decodedNote = nip19.decode(noteEncoded)
console.log('Decoded type:', decodedNote.type) // 'note'
console.log('Decoded data:', (decodedNote.data as string).substring(0, 16) + '...')
console.log()

// ---------------------------------------------------------------------------
// 4. nprofile -- Public Key with Relay Hints
// ---------------------------------------------------------------------------

const nprofile = nip19.nprofileEncode({
  pubkey: pk,
  relays: ['wss://relay.damus.io', 'wss://nos.lol'],
})
console.log('=== nprofile (Pubkey + Relays) ===')
console.log('Encoded:', nprofile)

const decodedProfile = nip19.decode(nprofile)
console.log('Decoded type:', decodedProfile.type) // 'nprofile'
if (decodedProfile.type === 'nprofile') {
  console.log('Pubkey:', decodedProfile.data.pubkey)
  console.log('Relays:', decodedProfile.data.relays)
}
console.log()

// ---------------------------------------------------------------------------
// 5. nevent -- Event ID with Relay Hints, Author, and Kind
// ---------------------------------------------------------------------------

const nevent = nip19.neventEncode({
  id: sampleEventId,
  relays: ['wss://relay.damus.io', 'wss://relay.snort.social'],
  author: pk, // optional: helps clients find the event
  kind: 1, // optional: helps clients validate
})
console.log('=== nevent (Event + Metadata) ===')
console.log('Encoded:', nevent)

const decodedEvent = nip19.decode(nevent)
console.log('Decoded type:', decodedEvent.type) // 'nevent'
if (decodedEvent.type === 'nevent') {
  console.log('Event ID:', decodedEvent.data.id.substring(0, 16) + '...')
  console.log('Relays:', decodedEvent.data.relays)
  console.log('Author:', decodedEvent.data.author?.substring(0, 16) + '...')
  console.log('Kind:', decodedEvent.data.kind)
}
console.log()

// ---------------------------------------------------------------------------
// 6. naddr -- Replaceable Event Address
// ---------------------------------------------------------------------------

// naddr is used for parameterized replaceable events (kinds 30000-39999)
// such as long-form articles (kind 30023)
const naddr = nip19.naddrEncode({
  identifier: 'my-first-article', // the 'd' tag value
  pubkey: pk,
  kind: 30023, // LongFormArticle
  relays: ['wss://relay.damus.io'],
})
console.log('=== naddr (Replaceable Event Address) ===')
console.log('Encoded:', naddr)

const decodedAddr = nip19.decode(naddr)
console.log('Decoded type:', decodedAddr.type) // 'naddr'
if (decodedAddr.type === 'naddr') {
  console.log('Identifier:', decodedAddr.data.identifier)
  console.log('Pubkey:', decodedAddr.data.pubkey.substring(0, 16) + '...')
  console.log('Kind:', decodedAddr.data.kind)
  console.log('Relays:', decodedAddr.data.relays)
}
console.log()

// ---------------------------------------------------------------------------
// 7. Generic Decode -- Handling Any Bech32 Entity
// ---------------------------------------------------------------------------

console.log('=== Generic Decoding ===')

function describeNostrEntity(bech32str: string): string {
  try {
    const decoded = nip19.decode(bech32str)
    switch (decoded.type) {
      case 'npub':
        return `Public key: ${decoded.data}`
      case 'nsec':
        return `Secret key: [REDACTED]`
      case 'note':
        return `Event ID: ${decoded.data}`
      case 'nprofile':
        return `Profile: pubkey=${decoded.data.pubkey.substring(0, 16)}... relays=${decoded.data.relays?.join(', ')}`
      case 'nevent':
        return `Event: id=${decoded.data.id.substring(0, 16)}... author=${decoded.data.author?.substring(0, 16) ?? 'unknown'}`
      case 'naddr':
        return `Address: kind=${decoded.data.kind} id="${decoded.data.identifier}" by ${decoded.data.pubkey.substring(0, 16)}...`
      default:
        return `Unknown type`
    }
  } catch (e) {
    return `Invalid bech32: ${(e as Error).message}`
  }
}

console.log('npub:', describeNostrEntity(npub))
console.log('nsec:', describeNostrEntity(nsec))
console.log('note:', describeNostrEntity(noteEncoded))
console.log('nprofile:', describeNostrEntity(nprofile))
console.log('nevent:', describeNostrEntity(nevent))
console.log('naddr:', describeNostrEntity(naddr))
console.log()

// ---------------------------------------------------------------------------
// 8. Type Guards
// ---------------------------------------------------------------------------

console.log('=== Type Guards ===')
console.log(`"${npub.substring(0, 12)}..." is npub:`, nip19.NostrTypeGuard.isNPub(npub))
console.log(`"${nsec.substring(0, 12)}..." is nsec:`, nip19.NostrTypeGuard.isNSec(nsec))
console.log(`"${noteEncoded.substring(0, 12)}..." is note:`, nip19.NostrTypeGuard.isNote(noteEncoded))
console.log(`"${nprofile.substring(0, 12)}..." is nprofile:`, nip19.NostrTypeGuard.isNProfile(nprofile))
console.log(`"${nevent.substring(0, 12)}..." is nevent:`, nip19.NostrTypeGuard.isNEvent(nevent))
console.log(`"${naddr.substring(0, 12)}..." is naddr:`, nip19.NostrTypeGuard.isNAddr(naddr))

// Cross-checks
console.log(`npub is nsec?`, nip19.NostrTypeGuard.isNSec(npub)) // false
console.log(`note is nevent?`, nip19.NostrTypeGuard.isNEvent(noteEncoded)) // false
console.log()

// ---------------------------------------------------------------------------
// 9. nostr: URI Handling
// ---------------------------------------------------------------------------

console.log('=== nostr: URI Decoding ===')
const nostrUri = `nostr:${npub}`
console.log('URI:', nostrUri)

const fromUri = nip19.decodeNostrURI(nostrUri)
console.log('Decoded type:', fromUri.type)
console.log('Decoded data:', (fromUri.data as string).substring(0, 32) + '...')

// Also works with nprofile URIs
const profileUri = `nostr:${nprofile}`
const fromProfileUri = nip19.decodeNostrURI(profileUri)
if (fromProfileUri.type === 'nprofile') {
  console.log('Profile URI relays:', fromProfileUri.data.relays)
}
console.log()

// ---------------------------------------------------------------------------
// 10. Regex for Matching Bech32 Entities in Text
// ---------------------------------------------------------------------------

console.log('=== Bech32 Regex Matching ===')
const sampleText = `Check out ${npub} and this event ${noteEncoded} on nostr!`
const matches = sampleText.match(new RegExp(nip19.BECH32_REGEX.source, 'g'))
console.log('Found entities in text:', matches?.length ?? 0)
matches?.forEach((m, i) => {
  const decoded = nip19.decode(m)
  console.log(`  Match ${i + 1}: type=${decoded.type}`)
})

console.log()
console.log('Done.')
