# ADR-000: Dual-repository workspace

- Status: Accepted
- Decision: Desktop keeps its own pnpm workspace; OMP keeps its Bun workspace. No committed absolute-path dependency. The only cross-repo handoff is the immutable relative `vendor/app-wire/oh-my-pi-app-wire-<version>.tgz` and manifest after X0a/X0b.
- Consequence: OMP merges and tags canonical app-wire first; Desktop pins the artifact second.
