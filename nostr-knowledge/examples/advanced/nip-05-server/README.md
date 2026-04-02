# NIP-05 Identity Verification Server

## What is NIP-05?

NIP-05 defines a way to map **internet identifiers** (like `alice@example.com`)
to NOSTR public keys. It piggybacks on DNS: if you control `example.com`, you
can vouch that the public key `abc123...` belongs to the user "alice" on your
domain.

This gives users human-readable, verifiable identities without any central
registry.

## How verification works

When a NOSTR client sees a profile with `nip05: "alice@example.com"`, it:

1. Extracts the **local part** (`alice`) and the **domain** (`example.com`).
2. Sends an HTTP GET to:
   ```
   https://example.com/.well-known/nostr.json?name=alice
   ```
3. Expects a JSON response:
   ```json
   {
     "names": {
       "alice": "a1b2c3d4...hex pubkey..."
     },
     "relays": {
       "a1b2c3d4...hex pubkey...": ["wss://relay.damus.io"]
     }
   }
   ```
4. Checks that the pubkey in the response matches the pubkey on the profile
   event (kind 0) the client already has.
5. If they match, the identifier is **verified** and typically shown with a
   checkmark in the client UI.

## The `relays` field

The optional `relays` object maps pubkeys to a list of relay URLs. Clients
can use these hints to find events from the user more efficiently. This is
especially useful for discovery: if you know someone's NIP-05, you can
resolve their pubkey AND learn which relays to connect to.

## The special `_` name

The identifier `_@example.com` (or just `@example.com`) uses the name `_`.
This is the "root" identity for the domain. Domain owners often claim this
for themselves.

## DNS setup

To host this in production:

1. Point your domain's A/AAAA record to your server.
2. Set up HTTPS (required by NIP-05 — clients must use `https://`).
3. Ensure the path `/.well-known/nostr.json` is routed to this server.

If using a reverse proxy (nginx, Caddy):

```nginx
# nginx example
location /.well-known/nostr.json {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;

    # CORS (also set by the app, but belt-and-suspenders)
    add_header Access-Control-Allow-Origin "*" always;
}
```

```
# Caddyfile example
example.com {
    handle /.well-known/nostr.json {
        reverse_proxy localhost:3000
    }
}
```

## Running

```bash
npm install nostr-tools
npm install -D typescript ts-node @types/node

# Optionally set the domain and port
export NIP05_DOMAIN=yourdomain.com
export NIP05_PORT=3000

npx ts-node nip05_server.ts
```

Then test:

```bash
curl http://localhost:3000/.well-known/nostr.json?name=alice
```

## Security considerations

- **Always serve over HTTPS** in production. NIP-05 clients will not accept
  HTTP (except for localhost during development).
- **CORS headers** are required so browser-based NOSTR clients can fetch the
  JSON via `fetch()`.
- **Rate limit** the endpoint to prevent abuse.
- **Validate usernames** — only allow characters that make sense in an
  internet identifier (lowercase alphanumeric, hyphens, underscores).
