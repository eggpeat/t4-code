# T3 provenance policy

No T3 code is claimed copied until a manifest record exists. Every record names source path and blob SHA, Desktop target, classification (`copied`, `adapted`, or `reference-only`), applicable license, target checksum, and separate source-faithful port and OMP-adaptation commit IDs. Preserve the exact MIT notice for every copied or adapted blob. Import and adaptation commits stay separate; generated/binary artifacts use mechanical commits. `source.json` records the pinned upstream identity and must not imply unrecorded imports.
