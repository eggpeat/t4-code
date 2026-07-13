# ADR-008: Version and cutover

- Status: Accepted
- Decision: OMP app-wire/appserver merges and tags first. X0a freezes and packs the relative tarball; X0b pins it in Desktop with manifest, compatibility matrix, and lockfile update by the sole integration owner. Hello negotiation accepts only the supported version window. Cutover resets disposable caches, drains sessions, records exact SHAs/checksums, and rollback restores the prior OMP/Desktop pair without touching JSONL.
