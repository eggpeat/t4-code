# ADR-002: OMP runtime boundary

- Status: Accepted
- Decision: OMP owns `packages/app-wire/**` and `packages/appserver/**`; OMP is runtime authority. `ompd` launches exactly one `omp --mode rpc` child per live session. Desktop has no appserver or adapter package and consumes the checked-in protocol artifact.
- Consequence: process-global OMP state remains isolated; child failure affects only its session.
