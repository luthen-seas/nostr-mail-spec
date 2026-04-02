# NIP-64: Chess (PGN)

## Status
Active (Draft, Optional)

## Summary
NIP-64 defines `kind:64` events for representing chess games using Portable Game Notation (PGN) format. The `.content` field contains a PGN-database string that is both human-readable and compatible with standard chess software. This enables chess games to be shared, replayed, and analyzed across the Nostr network.

## Motivation
Chess is one of the most universally understood games, and PGN is the established standard for recording chess games digitally. By encoding chess games as Nostr events, players can share games publicly, annotate positions, and build social chess experiences on top of the Nostr protocol without requiring centralized chess servers.

## Specification

### Event Kinds

| Kind | Description |
|------|-------------|
| `64` | Chess game in PGN format |

### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `alt` | Optional | Alternative text description for clients that do not support NIP-64 |

Standard Nostr tags (e.g., `p`, `e`, `t`) may also be used as appropriate.

### Protocol Flow

1. A user composes or imports a chess game in PGN format.
2. The client validates the PGN for correct formatting and move legality.
3. The client publishes a `kind:64` event with the PGN string as `.content`.
4. Receiving clients parse the PGN and render a visual chessboard.
5. Users can replay moves, analyze positions, and fork games.

### JSON Examples

**Minimal event -- incomplete game:**
```json
{
  "kind": 64,
  "content": "1. e4 *",
  "tags": [],
  "created_at": 1700000000,
  "pubkey": "<pubkey-hex>"
}
```

**Complete game with Seven Tag Roster (Fischer vs Spassky, 1992):**
```json
{
  "kind": 64,
  "content": "[Event \"F/S Return Match\"]\n[Site \"Belgrade, Serbia JUG\"]\n[Date \"1992.11.04\"]\n[Round \"29\"]\n[White \"Fischer, Robert J.\"]\n[Black \"Spassky, Boris V.\"]\n[Result \"1/2-1/2\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7 25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6 30. a3 Kd5 31. axb4 cxb4 32. Ra5+ Kd6 33. Ra8 1/2-1/2",
  "tags": [
    ["alt", "Chess game: Fischer vs Spassky, 1992 Round 29"]
  ],
  "created_at": 1700000000,
  "pubkey": "<pubkey-hex>"
}
```

## Implementation Notes

- **Export vs Import format:** Clients MUST publish PGN in "export format" (strict, machine-generated). Clients MUST accept incoming PGN in "import format" (lax, human-created). This means be strict in what you send and lenient in what you accept.
- **Move legality:** Clients SHOULD validate that all moves in the PGN are legal chess moves.
- **Multiple games:** A PGN-database string can contain multiple games separated by blank lines. Clients should handle multi-game content gracefully.
- **Incomplete games:** The result marker `*` indicates an ongoing or incomplete game. Clients should render these without errors.

## Client Behavior

- Clients MUST display the `.content` as a visual chessboard representation.
- Clients MUST publish PGN in export format.
- Clients MUST accept PGN in import format.
- Clients SHOULD validate PGN formatting and move legality.
- Clients MAY include an `alt` tag for non-supporting clients.
- Clients MAY provide game analysis, move-by-move replay, and position sharing features.

## Relay Behavior

- Relays MAY validate PGN content and reject events with invalid PGN.
- Relays SHOULD otherwise treat `kind:64` events like any other replaceable or regular event.

## Dependencies

- None beyond the base Nostr protocol (NIP-01).
- Externally depends on the [PGN Specification](https://www.chessclub.com/help/PGN-spec) for format rules.

## Source Code References

- **nostr-tools:** No dedicated NIP-64 module; events are standard `kind:64` objects.
- **Chess PGN parsers:** Libraries like `chess.js` or `pgn-parser` are commonly used client-side to parse and validate PGN content.

## Related NIPs

- **NIP-01** -- Basic event structure
- **NIP-16** -- Event treatment (regular events)
