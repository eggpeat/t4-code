# ADR-005: Selective T3 provenance

- Status: Accepted
- Decision: T3 Code is selectively ported from pinned SHA `f61fa9499d96fee825492aba204593c37b27e0cb`, never wholesale. Every copied/adapted blob retains the exact MIT attribution, source path/blob SHA, checksum, classification, and separate source-import and OMP-adaptation commits. No code is claimed copied until an import record exists.
