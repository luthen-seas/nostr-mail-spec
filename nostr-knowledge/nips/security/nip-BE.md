# NIP-BE: Nostr BLE Communications Protocol

## Status
Draft / Optional

## Summary
NIP-BE defines a Bluetooth Low Energy (BLE) transport layer for Nostr events, enabling device-to-device communication without internet connectivity. Devices advertise via BLE, negotiate roles (GATT Server/Client), and synchronize Nostr events over a chunked, compressed, half-duplex protocol. This enables offline mesh networking, local event exchange, and censorship-resistant communication in environments where internet access is unavailable or restricted.

## Motivation
Nostr's standard transport relies on WebSocket connections to internet-accessible relays. This creates a hard dependency on internet infrastructure, which fails in several scenarios: natural disasters, censored networks, remote areas without connectivity, or privacy-sensitive situations where internet traffic is monitored. NIP-BE solves this by using Bluetooth Low Energy as an alternative transport, allowing nearby devices to exchange Nostr events directly. This enables mesh-like propagation where events can hop between devices until they eventually reach an internet-connected node that can forward them to traditional relays.

## Specification

### Event Kinds
NIP-BE does not define new event kinds. It transports standard NIP-01 events over BLE instead of WebSocket. Any event kind can be transmitted over this protocol.

### Tags
NIP-BE does not define new tags. Standard NIP-01 event tags are preserved as-is during BLE transport.

### BLE Service Architecture

#### Advertisement
Devices advertise using the following BLE service:

| Parameter | Value |
|-----------|-------|
| Service UUID | `0000180f-0000-1000-8000-00805f9b34fb` |
| Advertised Data | Device UUID as ByteArray |

#### GATT Characteristics

The protocol uses a Nordic UART Service (NUS) pattern with two characteristics:

| Characteristic | UUID | Properties | Purpose |
|---------------|------|------------|---------|
| Write | `87654321-0000-1000-8000-00805f9b34fb` | Write | Client sends commands/events to Server |
| Read | `12345678-0000-1000-8000-00805f9b34fb` | Notify, Read | Server sends responses/events to Client |

#### Role Assignment

When two devices discover each other, roles are assigned deterministically:

- **The device with the highest UUID becomes the GATT Server (Relay).**
- **The device with the lowest UUID becomes the GATT Client.**

For fixed-role scenarios (e.g., a dedicated relay device):
- Permanent Server UUID: `FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF`
- Permanent Client UUID: `00000000-0000-0000-0000-000000000000`

### Message Format

#### Compression
All messages follow NIP-01 JSON structure but are compressed using **DEFLATE** before transmission.

#### Chunking
BLE has limited payload capacity (20-23 bytes in BLE 4.2, up to 256 bytes in newer versions). Messages are split into chunks with the following structure:

```
[batch_index (1 byte)][batch_data (N bytes)][total_batches (1 byte)]
```

| Field | Size | Description |
|-------|------|-------------|
| `batch_index` | 1 byte | Zero-based index of this chunk |
| `batch_data` | Variable | The actual compressed data for this chunk |
| `total_batches` | 1 byte | Total number of chunks in this message |

**Maximum message size:** 64KB (after compression)
**Chunk size:** 500 bytes (recommended)

#### Chunking Implementation (Kotlin reference):

```kotlin
fun splitInChunks(message: ByteArray): Array<ByteArray> {
    val chunkSize = 500
    var byteArray = compressByteArray(message)
    val numChunks = (byteArray.size + chunkSize - 1) / chunkSize
    var chunkIndex = 0
    val chunks = Array(numChunks) { ByteArray(0) }

    for (i in 0 until numChunks) {
        val start = i * chunkSize
        val end = minOf((i + 1) * chunkSize, byteArray.size)
        val chunk = byteArray.copyOfRange(start, end)
        val chunkWithIndex = ByteArray(chunk.size + 2)
        chunkWithIndex[0] = chunkIndex.toByte()
        chunk.copyInto(chunkWithIndex, 1)
        chunkWithIndex[chunkWithIndex.size - 1] = numChunks.toByte()
        chunks[i] = chunkWithIndex
        chunkIndex++
    }
    return chunks
}
```

#### Reassembly Implementation (Kotlin reference):

```kotlin
fun joinChunks(chunks: Array<ByteArray>): ByteArray {
    val sortedChunks = chunks.sortedBy { it[0] }
    var reassembledByteArray = ByteArray(0)
    for (chunk in sortedChunks) {
        val chunkData = chunk.copyOfRange(1, chunk.size - 1)
        reassembledByteArray = reassembledByteArray.copyOf(
            reassembledByteArray.size + chunkData.size
        )
        chunkData.copyInto(
            reassembledByteArray,
            reassembledByteArray.size - chunkData.size
        )
    }
    return decompressByteArray(reassembledByteArray)
}
```

### Protocol Flow

The protocol uses **half-duplex** communication. Only one device transmits at a time.

#### Initial Synchronization

```
Client                              Server
  |                                    |
  |--- NEG-OPEN (write) ------------->|   Step 1: Client initiates sync
  |<-- write-success --------------------|   Step 2: Server acknowledges
  |--- read-message ----------------->|   Step 3: Client requests data
  |<-- NEG-MSG -----------------------|   Step 4: Server sends negentropy msg
  |                                    |
  |    [Sync loop begins]             |
  |                                    |
  |--- EVENT (write) ---------------->|   Step 5a: Client sends missing events
  |    OR                              |           (or EOSE if none missing)
  |--- EOSE (write) ----------------->|
  |<-- write-success --------------------|   Step 6: Server acknowledges
  |--- read-message ----------------->|   Step 7: Client requests data
  |<-- EVENT -------------------------|   Step 8a: Server sends missing events
  |    OR                              |           (or EOSE if none missing)
  |<-- EOSE --------------------------|
  |                                    |
  |    [Repeat steps 5-8 until both   |
  |     sides send EOSE]              |
  |                                    |
  |    [SYNCHRONIZED]                  |
```

#### Step-by-Step Detail

1. **Client writes `NEG-OPEN`:** Initiates the negentropy-based synchronization handshake.
2. **Server responds `write-success`:** Acknowledges receipt.
3. **Client sends `read-message`:** Requests the server's response.
4. **Server responds `NEG-MSG`:** Sends its negentropy message describing its event set.
5. **Client evaluates differences:**
   - If the client has events the server lacks, it writes `EVENT` messages.
   - If the client has nothing new, it writes `EOSE` (End of Stored Events).
6. **Server acknowledges** with `write-success`.
7. **Client sends `read-message`** to get the server's turn.
8. **Server evaluates differences:**
   - If the server has events the client lacks, it sends `EVENT` messages.
   - If the server has nothing new, it sends `EOSE`.
9. **Loop:** Steps 5-8 repeat until both sides send `EOSE` consecutively, indicating full synchronization.

#### Post-Synchronization Event Propagation

Once synchronized, devices track which events have been shared with each connected peer. When new events arrive from external sources:

**Pushing to a Server peer (client-initiated):**
1. Client writes the `EVENT` to the server via the Write characteristic.
2. Server acknowledges with `write-success`.

**Pushing to a Client peer (server-initiated):**
1. Server sends an empty notification via the Read characteristic to signal new data.
2. Client sends a `read-message` request.
3. Server responds with the `EVENT`.

### JSON Examples

#### Standard NIP-01 event transported over BLE:

The event format is identical to standard Nostr events. The only difference is the transport layer:

```json
{
  "id": "4376c65d2f232afbe9b882a35baa4f6fe8667c4e684749af565f981833ed6a65",
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
  "created_at": 1673347337,
  "kind": 1,
  "tags": [
    ["e", "3da979448d9ba263864c4d6f14984c423a3838364ec255f03c7904b1ae77f206"]
  ],
  "content": "Sent via BLE mesh!",
  "sig": "908a15e46fb4d8675bab026fc230a0e3542bfade63da02d542fb78b2a8513fcd0092619a2c8c1221e581946e0191f2af505dfdf8657a414dbca329186f009262"
}
```

This JSON is DEFLATE-compressed, chunked into 500-byte segments with index headers, and transmitted over the BLE Write/Read characteristics.

## Implementation Notes

1. **BLE version compatibility:** BLE 4.2 supports only 20-23 byte payloads per write, making chunking essential. BLE 5.0+ supports up to 256 bytes, reducing the number of chunks needed. The 500-byte chunk size in the reference implementation suggests negotiated MTU or multiple BLE writes per logical chunk.

2. **DEFLATE compression:** All messages are compressed before chunking. This is critical for BLE efficiency since Nostr events (especially with signatures) can be several hundred bytes as JSON.

3. **Half-duplex constraint:** BLE GATT is inherently half-duplex. The protocol respects this by strictly alternating between write and read phases. Implementations must not attempt simultaneous bidirectional communication.

4. **Negentropy synchronization:** The `NEG-OPEN` and `NEG-MSG` messages suggest use of the negentropy set reconciliation protocol, which efficiently determines which events each side is missing without transmitting full event lists.

5. **64KB message limit:** After compression, a single message cannot exceed 64KB. This limits the size of individual events that can be transmitted. Most standard Nostr events are well within this limit.

6. **Chunk ordering:** Chunks may arrive out of order over BLE. The `batch_index` byte allows correct reassembly regardless of arrival order.

7. **Connection range:** BLE typically has a range of 10-100 meters depending on the device and environment. This is a proximity-based protocol, not a long-range transport.

8. **Battery considerations:** BLE is designed for low power consumption, but continuous scanning and event synchronization will drain mobile device batteries. Implementations should use conservative scan intervals.

9. **Security model:** BLE transport inherits Nostr's cryptographic security. Events are signed by their authors and can be verified by any recipient. However, BLE traffic itself is observable by nearby devices -- the content is not encrypted at the transport layer (though NIP-04/NIP-44 encrypted content remains encrypted).

10. **Role determinism:** The UUID-based role assignment ensures two devices always agree on who is the server and who is the client without negotiation, avoiding connection setup race conditions.

## Client Behavior

- Clients MUST advertise using the specified Service UUID (`0000180f-0000-1000-8000-00805f9b34fb`).
- Clients MUST include their Device UUID in the advertisement data.
- Clients MUST assume the GATT Client role if their UUID is lower than the peer's.
- Clients MUST use DEFLATE compression on all messages before chunking.
- Clients MUST chunk messages exceeding the BLE MTU using the specified packet format.
- Clients MUST initiate synchronization by sending `NEG-OPEN`.
- Clients SHOULD track which events have been shared with each peer to avoid redundant transmissions.
- Clients MAY use the fixed UUID `00000000-0000-0000-0000-000000000000` to always assume the Client role.
- Clients SHOULD propagate newly received events to other connected peers.

## Relay Behavior

In NIP-BE, "relay" refers to the GATT Server role, not a traditional WebSocket relay. The device with the higher UUID acts as the relay.

- The GATT Server MUST expose the Write and Read characteristics with the specified UUIDs.
- The GATT Server MUST respond to `NEG-OPEN` with appropriate negentropy messages.
- The GATT Server MUST accept `EVENT` writes from connected clients.
- The GATT Server MUST send `EVENT` messages when it has events the client lacks.
- The GATT Server SHOULD send empty notifications to signal new events to connected clients.
- The GATT Server MAY use the fixed UUID `FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF` to always assume the Server role.
- The GATT Server SHOULD forward events received from one peer to other connected peers (mesh behavior).

## Dependencies

- **NIP-01** -- Core event format. All events transmitted over BLE are standard NIP-01 events.

## Source Code References

- The reference implementation appears to be in **Kotlin** (Android), based on the code examples in the spec.
- Look for BLE-related Nostr projects on GitHub:
  - **Pokey** (Android Nostr notification client) has explored BLE features.
  - Search for repos implementing `0000180f-0000-1000-8000-00805f9b34fb` in the Nostr ecosystem.
- No known implementations in nostr-tools (JS), rust-nostr, or go-nostr at this time, as BLE is platform-specific.

## Related NIPs

- **NIP-01** -- Core event format transported over BLE.
- **NIP-44** -- Encrypted payloads. Particularly relevant for BLE where nearby eavesdropping is possible.
- **NIP-59** -- Gift Wraps. Can be used for private messaging over BLE mesh.
