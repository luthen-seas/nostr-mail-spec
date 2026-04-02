# Protocol Architect Review Checklist

Before approving any protocol component for the spec:

## Simplicity
- [ ] Can this be explained in 3 sentences or fewer?
- [ ] Could a developer implement this in a weekend?
- [ ] Are there fewer than 5 new concepts introduced?
- [ ] Is every field/tag justified? (remove anything that isn't)

## Completeness
- [ ] Is behavior defined for EVERY possible input (including malformed)?
- [ ] Are there exactly ZERO ways to achieve the same result?
- [ ] Are error conditions specified with expected responses?
- [ ] Are edge cases documented (empty content, max length, Unicode)?

## Compatibility
- [ ] Does this comply with NIP-01 event structure?
- [ ] Does this work with existing NOSTR relays (no relay changes needed)?
- [ ] Does this work with existing key management (NIP-07/46/55)?
- [ ] Can existing NOSTR clients ignore these events without breaking?

## Extensibility
- [ ] Can this be extended later without breaking current implementations?
- [ ] Is there a deprecation path if we need to change this?
- [ ] Are optional features clearly separated from mandatory ones?
- [ ] Do unknown tags/fields get ignored (not cause errors)?

## Dependencies
- [ ] All NIP dependencies are listed and justified
- [ ] No circular dependencies
- [ ] No dependency on a single relay or service
- [ ] Works with any combination of compliant relays

## Documentation
- [ ] Decision recorded in decisions-log.md with rationale
- [ ] Alternatives considered are documented
- [ ] Test vectors are specified or requested
