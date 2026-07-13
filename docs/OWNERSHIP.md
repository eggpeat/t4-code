# Ownership and handoffs

## Sole writers

| Path | Sole writer |
|---|---|
| `apps/web/**`, `packages/ui/**`, `apps/desktop/src/visible-strings.ts`, `apps/desktop/resources/**`, visible copy/assets/screenshots | Fable 5 |
| OMP `packages/app-wire/**` | app-wire protocol lead |
| OMP `packages/appserver/**` | appserver lead; delegated domain subtrees only after contracts freeze |
| Desktop `packages/protocol/**` | protocol-facade owner; re-export only |
| Desktop `packages/client/**`, `packages/fixture-server/**` | backend/client owners |
| Desktop `apps/desktop/src/**` except `visible-strings.ts` | Electron systems owner; consumes but does not author visible copy/resources |
| root manifests and `pnpm-lock.yaml` | integration lead (sole writer) |
| `docs/adr/**`, this file, licenses/notices/provenance | architecture/provenance lead |

A PR exceeding 1,500 semantic LOC MUST split into serial batches with disjoint ownership and a handoff record. No agent edits another owner's path, even to fix a visible defect.

## Handoff contracts

Backend-to-Fable handoff includes app-wire version/features, AppClient selectors/commands, deterministic scenario ID and manifest, IDs/revisions, and loading/empty/stale/reconnect/denied/error states. Fable supplies no shadow schema or invented state. OMP-to-Desktop handoff includes tagged source SHA, package version, tarball/manifest checksums, and golden corpus checksums; Desktop commits only the relative vendored artifact.

Reviewers and test agents are report-only for visible defects: provide reproducible evidence and return the issue to Fable. Root lockfile changes go only through the integration owner. Every T3 port requires an import record before merge.
