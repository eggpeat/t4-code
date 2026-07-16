## Named local profiles

T4 Code v0.1.20 discovers the named OMP profiles on your machine (the `~/.omp/profiles` layout plus the default) and runs a separate appserver for each one. Every profile is its own local host with its own socket, service registration, and log directory. The Hosts screen starts, stops, or restarts a profile and can mark it to start with T4; the default profile keeps starting automatically.

## Host-aware settings and account visibility

Settings carry an explicit host selector, and each connected host keeps its own staged drafts. For hosts that grant `broker.read`, a one-sentence status line reports where that host's accounts come from: local files, a connected broker endpoint, or a missing token. The line never includes credentials, and hosts that cannot answer are labeled unsupported instead of guessed at.

A per-host Usage screen reads provider limits, usage windows, and reset times through `usage.read`. Reports show their age and are labeled stale after five minutes. Provider-specific metadata and raw payloads are dropped before anything reaches the screen.

## Semantic session controls and continuity

The thinking menu lists Off, Auto, and only the concrete effort levels the current model supports, in the order the host reports them. Off floors to the provider's minimum on models that cannot disable reasoning, and fast mode is offered only when the model supports it. A control change from a second client converges everywhere as host-confirmed state, and reconnects resume the session without duplicate output.

## Runtime provenance

T4 Code v0.1.20 vendors app-wire 0.5.7 from integration commit [ee1b794f](https://github.com/lyc-aon/oh-my-pi/commit/ee1b794f1d0638b3d6797c5220e5eafe69d693db), source tree `421e29e6ed9203113345906e2d24c042949d0f61`. The client contract remains `omp-app/1`.

The matching OMP 17.0.0 runtime is built from the same commit [ee1b794f](https://github.com/lyc-aon/oh-my-pi/commit/ee1b794f1d0638b3d6797c5220e5eafe69d693db) and tagged [t4code-17.0.0-appserver-4](https://github.com/lyc-aon/oh-my-pi/tree/t4code-17.0.0-appserver-4). This revision scopes each appserver to its OMP profile, adds host-scoped usage and broker-status commands, reports semantic thinking and fast state, and bounds project catalog resolution. Fork CI requires the release commit to descend from the exact official base.

The integration is based on the official upstream [v17.0.0 tag](https://github.com/can1357/oh-my-pi/tree/v17.0.0), commit [d5cd24f3](https://github.com/can1357/oh-my-pi/commit/d5cd24f39a951bfbd50dc8f50bcf095d59694d6c). Official upstream OMP v17.0.0 has no `appserver` command and cannot host T4 Code.

## Packages

The Android APK is signed and supports Android 7.0 or later. Linux packages target x86_64. macOS packages target Apple Silicon.

The macOS build is unsigned and unnotarized. Gatekeeper will block the first launch. After copying T4 Code to Applications, run:

```sh
xattr -dr com.apple.quarantine "/Applications/T4 Code.app"
```

Verify downloads with `SHA256SUMS.txt`.
