# ADR-006: Deterministic fixtures

- Status: Accepted
- Decision: Fixtures use fixed seed, virtual clock, scenario, and fault script. Canonical frames come from OMP app-wire; repeated inputs produce byte-identical traces and projection hashes. Epoch resets, duplicate entries, gaps, and reconnects are explicit scenarios.
