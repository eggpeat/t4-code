# T4 Kubernetes cluster operator

The portable `t4-cluster` chart runs the infrastructure control plane for T4 workspaces and one-session runtime pods. It is disabled by default. Kubernetes owns only infrastructure desired state, placement, PVCs, pods, Services, retention, and infrastructure conditions. OMP remains the sole authority for sessions, agent ids and parentage, lifecycle, turns, prompts, approvals, jobs, IRC, artifacts, terminals, browser commands, cancellation, and takeover through `t4-omp-authority/1`.

## Prerequisites

- Kubernetes 1.30 or newer.
- An administrator-managed StorageClass that actually provisions `ReadWriteMany` volumes.
- Three immutable image digests: `t4-cluster-operator`, `t4-cluster-server`, and `t4-session-runtime`.
- Narrow Kubernetes API, model-route, CI-provider, ingress-controller, and metrics-scraper network identities for the enabled integrations.
- A local T4 client explicitly configured to request the default-false `cluster.operator` feature. Installing this chart does not enable the client feature.

The chart does not install NFS, CSI drivers, a StorageClass, host paths, or backend-specific storage configuration. The cluster administrator must create and validate the RWX StorageClass. Mark a class as reviewed for this controller:

```yaml
metadata:
  annotations:
    cluster.t4.dev/access-modes: ReadWriteMany
```

That declaration does not make a non-RWX backend safe. Missing classes, classes without this exact declaration, unbound claims, and claims without `ReadWriteMany` fail closed. A `T4Session` pod is never created before its workspace claim is both Bound and RWX.

## Install

Installing with defaults creates no controller, gateway, session workload, RBAC, Secret, or network policy:

```sh
helm install t4-cluster deploy/charts/t4-cluster --namespace t4-system --create-namespace
```

Helm processes files in `crds/` separately. Use `--skip-crds` if CRD lifecycle is administered independently. To enable the control plane, provide a private values file or a deployment controller values source:

```yaml
enabled: true
storage:
  adminRWXStorageClass: portable-rwx
images:
  controller:
    repository: registry.example/t4-cluster-operator
    digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
    pullPolicy: IfNotPresent
  server:
    repository: registry.example/t4-cluster-server
    digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
    pullPolicy: IfNotPresent
  sessionRuntime:
    repository: registry.example/t4-session-runtime
    digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
    pullPolicy: IfNotPresent
networkPolicy:
  kubernetesApiCIDRs: [192.0.2.10/32]
  modelRouteCIDRs: [198.51.100.20/32]
  ciProviderCIDRs: [203.0.113.30/32]
  gatewayIngress:
    namespaceSelector:
      matchLabels:
        ingress.example/namespace: gateway
    podSelector:
      matchLabels:
        ingress.example/component: proxy
  observability:
    namespaceSelector:
      matchLabels:
        monitoring.example/namespace: metrics
    podSelector:
      matchLabels:
        monitoring.example/component: prometheus
session:
  nodeExclude: [k3s-worker-02]
```

The sample CIDRs and labels are documentation values, not usable defaults. Keep the chart backend-neutral and set destinations to the actual cluster endpoints. Empty destination lists and selectors deny those flows.

Install or enable with immutable digests:

```sh
helm upgrade --install t4-cluster deploy/charts/t4-cluster --namespace t4-system --values operator-values.yaml
```

The controller always has two replicas and uses a Kubernetes Lease named from `t4-cluster-operator.cluster.t4.dev`; one replica reconciles at a time. The server defaults to three stateless replicas and supports a minimum of two. Its Deployment uses `maxUnavailable: 0`, a `minAvailable: 2` PDB, topology spread, anti-affinity, readiness draining, and an explicit `k3s-worker-02` exclusion. Session pods also exclude that node by default. Additional cluster-specific exclusions belong in deployment values, not this portable chart.

The chart creates `t4-cluster-internal-auth` on first enabled install and retains its token across upgrades. The token is mounted only into the gateway and one-session pods. It is used by the existing `omp-app/1` upstream hello and must never appear in a URL, header, CR, log, or client frame.

## API configuration

All APIs are namespaced under `cluster.t4.dev/v1alpha1`:

- `T4ClusterHost` selects the reviewed RWX StorageClass, allowed runtime profile names, bounded projection policy, exact HTTPS origins, and optional CI Secret/ConfigMap references.
- `T4Workspace` selects a host, bounded repository metadata, size, and `Retain` or `Delete` storage retention. The controller always requests `ReadWriteMany`.
- `T4Session` selects a host, workspace, allowlisted runtime profile, optional initial-prompt Secret reference, GUI policy, and optional allowlisted CI repository/ref/commit metadata.

Images, provider endpoints, resource policy, model routes, shell text, raw prompts, tokens, and secret values are not accepted in CRs. Status contains only `observedGeneration`, Kubernetes object references, infrastructure phases, PVC capacity/phase, and bounded conditions. It never reports OMP ids, agent trees, or runtime lifecycle truth.

The optional initial prompt is referenced by Secret name and key `prompt`; the Secret is mounted only into that session pod. Do not place prompt content in the CR or Helm values.

`T4Workspace` has `cluster.t4.dev/workspace-protection`. With `retentionPolicy: Delete`, deletion waits for its PVC to disappear. With `Retain`, the controller first removes its owner reference and marks it retained, then permits workspace deletion. `T4Session` has `cluster.t4.dev/session-cleanup` and waits for its pod and Service to disappear.

## Images and runtime

`cluster/images/controller/Dockerfile`, `cluster/images/cluster-server/Dockerfile`, and `cluster/images/session-runtime/Dockerfile` use digest-pinned build bases. Published chart values also require image digests.

The session runtime verifies and builds the exact OMP tag `t4code-17.0.5-appserver-10` at commit `8476f4451ed95c5d5401785d279a93d3c659fac4`. It preserves `t4-omp-authority/1`, starts the existing T4 session-host entrypoint, and provides Xvfb, a minimal window manager, and Chromium without privileged mode or host display access. The shared claim is mounted at `/workspace`; authority and browser state live in controller-selected per-session subdirectories. `/dev/shm` is an explicit memory-backed volume. Browser Preview remains the existing GUI stream and control surface.

Session pods do not receive ServiceAccount tokens. All containers drop capabilities, disallow privilege escalation, use RuntimeDefault seccomp, and use read-only root filesystems. No per-session NodePort, LoadBalancer, host network, host PID, host display, or hostPath is created.

## Upgrade and rollback

CRD changes must remain structural and additive. Helm installs files under `crds/` on first install but does not upgrade or delete them. Before `helm upgrade`, an administrator should review and server-side apply the newer CRDs, then upgrade the chart with the new immutable image digests. Wait for the server Deployment to retain at least two ready replicas and for the controller Lease holder to reconcile the new generation.

```sh
helm upgrade t4-cluster deploy/charts/t4-cluster --namespace t4-system --values operator-values.yaml
```

For an application rollback, retain the additive CRDs and use the previous known-compatible values and image digest set:

```sh
helm rollback t4-cluster REVISION --namespace t4-system
```

Do not roll OMP independently of the T4 session runtime. Roll back the known-compatible T4/OMP image set together. The pinned authority boundary is not negotiated down.

## Uninstall

1. Stop accepting new workspace/session mutations at the gateway.
2. Delete `T4Session` resources and wait for their pods and Services to be removed.
3. Review every `T4Workspace` retention policy. `Delete` removes its PVC; `Retain` deliberately leaves an orphaned PVC for administrator recovery.
4. Run `helm uninstall t4-cluster --namespace t4-system`.
5. After no session pod remains, delete the retained `t4-cluster-internal-auth` Secret if the installation will not be restored.
6. Remove retained PVCs only after their contents have been recovered or confirmed disposable.

CRDs are not removed by `helm uninstall`. This preserves custom resources and retained storage across rollback/reinstall. Remove the three CRDs only as a separate, explicit administrative operation after confirming no instances remain; CRD deletion removes all instances regardless of their retention intent.
