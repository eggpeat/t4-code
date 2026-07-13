# ADR-004: Disposable client state

- Status: Accepted
- Decision: Desktop owns disposable projections only: one connection supervisor and cache namespace per host, one reducer per stream, epoch/cursor replay, and explicit disposal on disconnect/session switch. Cached state is stale data and never claims to be live; unknown-outcome commands are not auto-replayed.
