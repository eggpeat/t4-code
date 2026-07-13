# ADR-007: Electron and remote security boundary

- Status: Accepted
- Decision: Local Unix socket is default. Remote is disabled until proof, authenticated and server-side capability checked. Electron uses sandbox, context isolation, narrow allowlisted IPC/preload, CSP, and navigation/window restrictions with no renderer Node integration. Flows are preview, confirm, then execute; this ADR does not specify low-level cryptography.
