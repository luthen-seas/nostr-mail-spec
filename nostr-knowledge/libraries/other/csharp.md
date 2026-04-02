# C# / .NET Nostr Libraries

## Overview

| Library | Type | NuGet Package | Focus | Repo |
|---------|------|--------------|-------|------|
| NNostr | Client + Relay | `NNostr.Client` | Full-featured client and relay server | [Kukks/NNostr](https://github.com/Kukks/NNostr) |
| Nostr.Client | Client | `Nostr.Client` | Reactive client with Rx.NET | [Marfusios/nostr-client](https://github.com/Marfusios/nostr-client) |
| netstr | Relay | N/A | Production relay (Postgres-backed) | [bezysoftware/netstr](https://github.com/bezysoftware/netstr) |
| rust-nostr C# | Client | N/A (UniFFI) | Rust FFI bindings | [rust-nostr/nostr](https://github.com/rust-nostr/nostr) |

---

## NNostr (Kukks/NNostr)

A Nostr relay and client written in C#. The client library is the most widely used .NET Nostr package.

- **Repo:** [github.com/Kukks/NNostr](https://github.com/Kukks/NNostr)
- **License:** MIT
- **Stars:** 126+

### Installation

```bash
dotnet add package NNostr.Client
```

### Client Usage

```csharp
using NNostr.Client;

// Create and connect to a relay
var client = new NostrClient(new Uri("wss://relay.damus.io"));
await client.Connect();
await client.WaitUntilConnected();

// Listen for events
client.EventsReceived += (sender, args) =>
{
    foreach (var nostrEvent in args.events)
    {
        Console.WriteLine($"Kind {nostrEvent.Kind}: {nostrEvent.Content}");
    }
};

// Subscribe with filters
await client.CreateSubscription("my-sub", new[]
{
    new NostrSubscriptionFilter
    {
        Kinds = new[] { 1 },
        Limit = 25
    }
});

// Create and sign an event
var newEvent = new NostrEvent
{
    Kind = 1,
    Content = "Hello from C#!"
};

// Sign with hex private key
await newEvent.ComputeIdAndSignAsync(privateKeyHex);

// Or sign with nsec
// await newEvent.ComputeIdAndSignAsync(NostrPrivateKey.FromBech32("nsec1..."));

// Publish
await client.SendEventsAndWaitUntilReceived(
    new[] { newEvent },
    CancellationToken.None
);
```

### Relay Server

NNostr includes a full relay implementation with:

- BTCPay Server integration for paid relay access
- Admin commands via DM (`/admin config`, `/admin update`)
- Configurable event costs (flat or per-byte)
- Pubkey whitelist
- Docker deployment support

```bash
# Run via Docker
docker run -e ConnectionStrings__NNostrRelay="..." kukks/nnostr-relay
```

### NIP Support

Core protocol (NIP-01), contacts (NIP-02), encrypted DMs (NIP-04), bech32 encoding (NIP-19), standard event kinds and filtering.

---

## Nostr.Client (Marfusios/nostr-client)

A reactive C# client using Rx.NET (Reactive Extensions) for stream-based event handling. Best for applications that benefit from reactive programming patterns.

- **Repo:** [github.com/Marfusios/nostr-client](https://github.com/Marfusios/nostr-client)
- **License:** Apache 2.0
- **Demo:** [nostrdebug.com](https://nostrdebug.com)

### Installation

```bash
dotnet add package Nostr.Client
```

### Supported NIPs

**Implemented:** NIP-01, 02, 04, 15, 19, 20

**Partial:** NIP-26 (display only)

### Usage

```csharp
using Nostr.Client;
using Nostr.Client.Messages;
using Nostr.Client.Keys;

// Single relay connection
var communicator = new NostrWebsocketCommunicator(
    new Uri("wss://relay.damus.io")
);
var client = new NostrWebsocketClient(communicator);

// Subscribe to event stream (Rx.NET)
client.Streams.EventStream.Subscribe(response =>
{
    var ev = response.Event;
    Console.WriteLine($"[{ev.CreatedAt}] {ev.Pubkey?.Substring(0, 8)}: {ev.Content}");
});

// Start connection
await communicator.Start();

// Request events
client.Send(new NostrRequest("timeline", new NostrFilter
{
    Kinds = new[] { NostrKind.ShortTextNote },
    Limit = 50
}));

// Multi-relay connection
var multi = new NostrMultiWebsocketClient();
multi.RegisterClient(new Uri("wss://relay.damus.io"), client1);
multi.RegisterClient(new Uri("wss://nos.lol"), client2);

multi.Streams.EventStream.Subscribe(response =>
{
    Console.WriteLine($"From {response.CommunicatorName}: {response.Event.Content}");
});

// Create and send an event
var privateKey = NostrPrivateKey.FromHex("hex_key_here");
var ev = new NostrEvent
{
    Kind = NostrKind.ShortTextNote,
    Content = "Hello from Nostr.Client!",
    Tags = new NostrEventTags(
        new NostrEventTag("t", "csharp")
    )
};
var signed = ev.Sign(privateKey);
client.Send(new NostrEventRequest(signed));

// Encrypted DM (NIP-04)
var dm = new NostrEvent
{
    Kind = NostrKind.EncryptedDm,
    Content = "Secret message"
}.EncryptDirect(senderKey, recipientPubkey).Sign(senderKey);
client.Send(new NostrEventRequest(dm));
```

### Testing Support

```csharp
// Replay events from a file for testing
var fileCommunicator = new NostrFileCommunicator("test_data.txt");
var testClient = new NostrWebsocketClient(fileCommunicator);
// Use testClient exactly like a real client
```

---

## netstr (bezysoftware/netstr)

A modern, production-grade Nostr relay written in C# backed by PostgreSQL.

- **Repo:** [github.com/bezysoftware/netstr](https://github.com/bezysoftware/netstr)
- **Dev relay:** [relay-dev.netstr.io](https://relay-dev.netstr.io/)

### Features

- PostgreSQL-backed event storage
- BDD test suite written in SpecFlow/Gherkin (human-readable test scenarios)
- Docker deployment
- High test coverage with NIP compliance tests

### Deployment

```bash
# Docker Compose (includes Postgres)
docker compose up -d
```

This is a relay implementation, not a client library. Use it when you need to run your own relay infrastructure in the .NET ecosystem.

---

## rust-nostr C# Bindings

The [rust-nostr](https://github.com/rust-nostr/nostr) project includes C# bindings via UniFFI, providing access to the full Rust nostr-sdk from .NET applications.

### Status

Alpha -- the API works but will have breaking changes. Suitable for experimentation and prototyping.

### Usage Pattern

```csharp
using NostrSdk;

// Key generation
var keys = Keys.Generate();
var npub = keys.PublicKey().ToBech32();
var nsec = keys.SecretKey().ToBech32();

// Event creation
var ev = EventBuilder.TextNote("Hello from rust-nostr C#!")
    .Tags(new[] { Tag.Hashtag("nostr") })
    .SignWithKeys(keys);

// Client
var client = new Client();
await client.AddRelay("wss://relay.damus.io");
await client.Connect();
await client.SendEvent(ev);
```

### Advantages

- 60+ NIP coverage (far more than native C# libraries)
- Same API surface as Kotlin, Swift, Python, and Flutter bindings
- Battle-tested Rust cryptography

### Disadvantages

- Alpha stability
- Requires native library distribution
- Harder to debug across FFI boundary

---

## Choosing a Library

| Scenario | Recommended |
|----------|-------------|
| .NET client application | NNostr or Nostr.Client |
| Reactive/stream-based architecture | Nostr.Client (Rx.NET) |
| Need a relay server | netstr (production) or NNostr (with BTCPay) |
| Maximum NIP coverage | rust-nostr C# bindings |
| Simple event publishing | NNostr.Client |
