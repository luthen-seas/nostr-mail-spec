# Nostrillery -- Relay Load Testing

- **Repository**: https://github.com/Cameri/nostrillery
- **Language**: JavaScript
- **Built on**: [Artillery](https://www.artillery.io/)
- **License**: MIT

---

## What It Is

Nostrillery is a load testing tool for Nostr relays, built as a wrapper around Artillery (a general-purpose performance testing framework). It sends configurable volumes of Nostr events to a relay and measures how it handles the load.

Use it to:
- Stress-test a relay before deployment.
- Benchmark different relay implementations (strfry vs. nostream vs. relay-rs, etc.).
- Find the breaking point of your relay under sustained write load.
- Validate relay performance after configuration changes.

---

## Installation

### Prerequisites

- Node.js v18 (use nvm to manage versions)
- npm

### Setup

```bash
# Install nvm if you don't have it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Use Node v18
nvm install 18
nvm use 18

# Clone the repository
git clone https://github.com/Cameri/nostrillery.git
cd nostrillery

# Install Artillery globally
npm install -g artillery

# Install project dependencies
npm install
```

---

## Usage

### Configuration

Edit `config.yml` to specify:
- Target relay WebSocket URL
- Number of virtual users
- Arrival rate (events per second)
- Test duration
- Event kinds and content patterns

### Running a Test

```bash
# Run the load test (SECRET is used for event signing)
SECRET="your-hex-private-key" npm run test:local
```

### What It Measures

- Event publish latency (how long until the relay acknowledges an EVENT)
- Throughput (events per second the relay can sustain)
- Error rates (connection failures, rejected events)
- Response time percentiles (p50, p95, p99)

---

## Tips

- Start with low concurrency and ramp up to find the relay's limits.
- Run nostrillery from a machine close to the relay to minimize network variance.
- Compare results across relay implementations to inform your choice.
- Use `nak serve` to test against a local relay first.

---

## See Also

- [Relay Inspector](relay-inspector.md) -- inspect relay capabilities and health
- [nak serve](../nak.md#nak-serve----serve-a-local-relay) -- run a local relay for testing
- [Relay Protocol](../../protocol/relay-protocol.md) -- understanding relay behavior
