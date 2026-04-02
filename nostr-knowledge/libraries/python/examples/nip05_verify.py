#!/usr/bin/env python3
"""
nip05_verify.py -- NIP-05 DNS Identifier Verification

NIP-05 maps human-readable identifiers (user@domain.com) to NOSTR public keys
by serving a JSON file at: https://<domain>/.well-known/nostr.json?name=<user>

This script demonstrates:
  1. Parsing a NIP-05 identifier
  2. Fetching the well-known JSON endpoint
  3. Verifying the pubkey mapping
  4. Extracting relay recommendations
  5. Full verification against a known pubkey
  6. Batch verification of multiple identifiers

Requirements:
    pip install pynostr

Usage:
    python nip05_verify.py
    python nip05_verify.py user@domain.com
    python nip05_verify.py user@domain.com --pubkey <hex_pubkey>
"""

import json
import sys
import urllib.request
import urllib.error
import ssl
from dataclasses import dataclass
from typing import Optional


# ---------------------------------------------------------------------------
# Data Structures
# ---------------------------------------------------------------------------

@dataclass
class NIP05Result:
    """Result of a NIP-05 lookup."""
    identifier: str
    local_part: str
    domain: str
    pubkey: Optional[str]         # Hex public key if found
    relays: list                  # Recommended relay URLs
    verified: Optional[bool]      # True/False if checked against expected key
    error: Optional[str]          # Error message if lookup failed

    @property
    def found(self) -> bool:
        return self.pubkey is not None

    def __str__(self):
        lines = [f"NIP-05: {self.identifier}"]
        if self.error:
            lines.append(f"  Error: {self.error}")
        elif self.pubkey:
            lines.append(f"  Pubkey: {self.pubkey}")
            if self.relays:
                lines.append(f"  Relays: {', '.join(self.relays)}")
            if self.verified is not None:
                status = "VERIFIED" if self.verified else "MISMATCH"
                lines.append(f"  Status: {status}")
        else:
            lines.append(f"  Not found at {self.domain}")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Core Verification Functions
# ---------------------------------------------------------------------------

def parse_identifier(identifier: str) -> tuple:
    """
    Parse a NIP-05 identifier into (local_part, domain).

    Handles the special case where the identifier is just a domain
    (implying local_part = "_").

    Args:
        identifier: A NIP-05 identifier like "user@domain.com" or "_@domain.com"

    Returns:
        Tuple of (local_part, domain)

    Raises:
        ValueError: If the identifier format is invalid
    """
    identifier = identifier.strip().lower()

    if "@" not in identifier:
        raise ValueError(
            f"Invalid NIP-05 identifier: '{identifier}' "
            f"(must be in user@domain format)"
        )

    parts = identifier.split("@")
    if len(parts) != 2:
        raise ValueError(
            f"Invalid NIP-05 identifier: '{identifier}' "
            f"(contains multiple @ symbols)"
        )

    local_part, domain = parts

    if not local_part:
        raise ValueError("Local part (before @) cannot be empty")

    if not domain or "." not in domain:
        raise ValueError(f"Invalid domain: '{domain}'")

    return local_part, domain


def fetch_nostr_json(domain: str, local_part: str, timeout: int = 10) -> dict:
    """
    Fetch the .well-known/nostr.json document from a domain.

    Args:
        domain: The domain to query
        local_part: The username to look up (passed as ?name= parameter)
        timeout: HTTP request timeout in seconds

    Returns:
        Parsed JSON response as a dict

    Raises:
        Various exceptions on network/parse errors
    """
    url = f"https://{domain}/.well-known/nostr.json?name={local_part}"

    # Create a request with a reasonable User-Agent
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "nostr-nip05-verify/1.0"},
    )

    # Create SSL context (some domains may have certificate issues)
    ctx = ssl.create_default_context()

    with urllib.request.urlopen(request, timeout=timeout, context=ctx) as response:
        # Verify content type is JSON
        content_type = response.headers.get("Content-Type", "")
        if "json" not in content_type and "text" not in content_type:
            raise ValueError(
                f"Unexpected Content-Type: {content_type} "
                f"(expected application/json)"
            )

        raw = response.read()

        # NIP-05 specifies the response should not exceed a reasonable size
        if len(raw) > 1_000_000:  # 1MB limit
            raise ValueError("Response too large (>1MB)")

        return json.loads(raw.decode("utf-8"))


def lookup_nip05(identifier: str, timeout: int = 10) -> NIP05Result:
    """
    Look up a NIP-05 identifier and return the associated public key
    and relay recommendations.

    Args:
        identifier: NIP-05 identifier (e.g., "user@domain.com")
        timeout: HTTP request timeout in seconds

    Returns:
        NIP05Result with the lookup results
    """
    try:
        local_part, domain = parse_identifier(identifier)
    except ValueError as e:
        return NIP05Result(
            identifier=identifier,
            local_part="",
            domain="",
            pubkey=None,
            relays=[],
            verified=None,
            error=str(e),
        )

    try:
        data = fetch_nostr_json(domain, local_part, timeout=timeout)
    except urllib.error.HTTPError as e:
        return NIP05Result(
            identifier=identifier,
            local_part=local_part,
            domain=domain,
            pubkey=None,
            relays=[],
            verified=None,
            error=f"HTTP {e.code}: {e.reason}",
        )
    except urllib.error.URLError as e:
        return NIP05Result(
            identifier=identifier,
            local_part=local_part,
            domain=domain,
            pubkey=None,
            relays=[],
            verified=None,
            error=f"Connection failed: {e.reason}",
        )
    except json.JSONDecodeError:
        return NIP05Result(
            identifier=identifier,
            local_part=local_part,
            domain=domain,
            pubkey=None,
            relays=[],
            verified=None,
            error="Invalid JSON in response",
        )
    except Exception as e:
        return NIP05Result(
            identifier=identifier,
            local_part=local_part,
            domain=domain,
            pubkey=None,
            relays=[],
            verified=None,
            error=str(e),
        )

    # Extract pubkey from the "names" field
    names = data.get("names", {})
    pubkey = names.get(local_part)

    # NIP-05 specifies names are case-insensitive
    if pubkey is None:
        # Try case-insensitive match
        for name, pk in names.items():
            if name.lower() == local_part.lower():
                pubkey = pk
                break

    # Extract relay recommendations
    relays = []
    if pubkey:
        relay_data = data.get("relays", {})
        relays = relay_data.get(pubkey, [])

    return NIP05Result(
        identifier=identifier,
        local_part=local_part,
        domain=domain,
        pubkey=pubkey,
        relays=relays,
        verified=None,
        error=None,
    )


def verify_nip05(identifier: str, expected_pubkey: str,
                 timeout: int = 10) -> NIP05Result:
    """
    Verify that a NIP-05 identifier maps to an expected public key.

    Args:
        identifier: NIP-05 identifier (e.g., "user@domain.com")
        expected_pubkey: Expected public key in hex format (64 chars)
        timeout: HTTP request timeout in seconds

    Returns:
        NIP05Result with verified=True/False
    """
    result = lookup_nip05(identifier, timeout=timeout)

    if result.error:
        return result

    # Normalize the expected pubkey (lowercase, strip whitespace)
    expected = expected_pubkey.strip().lower()

    if result.pubkey:
        result.verified = result.pubkey.lower() == expected
    else:
        result.verified = False

    return result


# ---------------------------------------------------------------------------
# Batch Verification
# ---------------------------------------------------------------------------

def batch_lookup(identifiers: list, timeout: int = 10) -> list:
    """
    Look up multiple NIP-05 identifiers.

    Args:
        identifiers: List of NIP-05 identifiers
        timeout: Per-request timeout in seconds

    Returns:
        List of NIP05Result objects
    """
    results = []
    for ident in identifiers:
        print(f"  Looking up {ident}...", end=" ", flush=True)
        result = lookup_nip05(ident, timeout=timeout)
        status = "found" if result.found else (result.error or "not found")
        print(status)
        results.append(result)
    return results


# ---------------------------------------------------------------------------
# Demonstration
# ---------------------------------------------------------------------------

def demo_parse():
    """Demonstrate identifier parsing."""
    print("--- Parsing NIP-05 Identifiers ---\n")

    test_cases = [
        "bob@example.com",
        "_@domain.com",
        "alice@nostr.directory",
        "UPPER@Case.COM",
    ]

    for ident in test_cases:
        local_part, domain = parse_identifier(ident)
        url = f"https://{domain}/.well-known/nostr.json?name={local_part}"
        print(f"  {ident}")
        print(f"    -> local_part: {local_part}")
        print(f"    -> domain:     {domain}")
        print(f"    -> URL:        {url}")
        print()

    # Show error cases
    bad_cases = [
        ("nodomain", "missing @ symbol"),
        ("a@b@c.com", "multiple @ symbols"),
        ("user@", "empty domain"),
    ]

    print("  Error cases:")
    for ident, desc in bad_cases:
        try:
            parse_identifier(ident)
        except ValueError as e:
            print(f"    {ident} ({desc}): {e}")
    print()


def demo_lookup():
    """Demonstrate live NIP-05 lookups."""
    print("--- Live NIP-05 Lookups ---\n")

    # Well-known NOSTR identifiers to look up.
    # These may or may not resolve depending on the domain's availability.
    identifiers = [
        "_@nostr.com",
        "bob@stacker.news",
    ]

    results = batch_lookup(identifiers)

    print()
    for result in results:
        print(result)
        print()


def demo_verification():
    """Demonstrate verification against a known pubkey."""
    print("--- NIP-05 Verification ---\n")

    # Example: verify an identifier against a known pubkey
    # Replace these with real values for actual verification
    identifier = "_@nostr.com"
    known_pubkey = "0000000000000000000000000000000000000000000000000000000000000000"

    print(f"  Verifying: {identifier}")
    print(f"  Against:   {known_pubkey[:32]}...")

    result = verify_nip05(identifier, known_pubkey)
    print(f"  Result:    {result.verified}")
    print()


def demo_with_pynostr():
    """
    Demonstrate integration with pynostr key classes.
    Requires: pip install pynostr
    """
    print("--- Integration with pynostr Keys ---\n")

    try:
        from pynostr.key import PrivateKey
    except ImportError:
        print("  pynostr not installed. Skipping this demo.")
        print("  Install with: pip install pynostr")
        print()
        return

    # Generate a key pair
    private_key = PrivateKey()
    public_key = private_key.public_key

    print(f"  Generated key pair:")
    print(f"    npub: {public_key.bech32()}")
    print(f"    hex:  {public_key.hex()}")
    print()

    # To set up NIP-05 for this key, you would:
    # 1. Host a file at https://yourdomain.com/.well-known/nostr.json
    # 2. With contents like:
    nip05_json = {
        "names": {
            "yourname": public_key.hex()
        },
        "relays": {
            public_key.hex(): [
                "wss://relay.damus.io",
                "wss://nos.lol",
            ]
        }
    }

    print(f"  To claim yourname@yourdomain.com, serve this JSON at:")
    print(f"  https://yourdomain.com/.well-known/nostr.json\n")
    print(f"  {json.dumps(nip05_json, indent=2)}")
    print()

    # Then anyone can verify:
    # result = verify_nip05("yourname@yourdomain.com", public_key.hex())
    print(f"  Then verify with:")
    print(f'    verify_nip05("yourname@yourdomain.com", "{public_key.hex()[:16]}...")')
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("NIP-05 DNS Identifier Verification")
    print("=" * 60)
    print()

    if len(sys.argv) > 1:
        # CLI mode: look up or verify a specific identifier
        identifier = sys.argv[1]

        if "--pubkey" in sys.argv:
            # Verification mode
            pubkey_index = sys.argv.index("--pubkey") + 1
            if pubkey_index >= len(sys.argv):
                print("Error: --pubkey requires a hex public key argument")
                sys.exit(1)
            expected_pubkey = sys.argv[pubkey_index]

            print(f"Verifying {identifier} against {expected_pubkey[:32]}...\n")
            result = verify_nip05(identifier, expected_pubkey)
        else:
            # Lookup mode
            print(f"Looking up {identifier}...\n")
            result = lookup_nip05(identifier)

        print(result)

        if result.found:
            sys.exit(0)
        else:
            sys.exit(1)

    else:
        # Demo mode: run all demonstrations
        demo_parse()
        demo_lookup()
        demo_verification()
        demo_with_pynostr()

    print("=" * 60)
    print("Done.")
    print("=" * 60)


if __name__ == "__main__":
    main()
