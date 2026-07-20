import { describe, expect, test } from "bun:test";
import {
	KubernetesApiClient,
	KubernetesGatewayMutationBackend,
	semanticResourceHash,
} from "../src/kubernetes-client.ts";

function recordingFetch(responses: unknown[]) {
	const requests: Array<{ url: string; init?: RequestInit }> = [];
	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		requests.push({ url: String(input), init });
		return Response.json(responses.shift() ?? {}, { status: init?.method === "POST" ? 201 : 200 });
	}) as typeof globalThis.fetch;
	return { requests, fetch };
}

describe("namespaced Kubernetes client", () => {
	test("lists and watches only the three cluster.t4.dev resources with bounded resource versions", async () => {
		const values = recordingFetch([
			{ metadata: { resourceVersion: "20" }, items: [] },
			{ metadata: { resourceVersion: "21" }, items: [] },
			{ metadata: { resourceVersion: "22" }, items: [] },
		]);
		const client = new KubernetesApiClient({
			baseUrl: "https://kubernetes.default.svc",
			namespace: "development",
			token: "service-account-token",
			fetch: values.fetch,
		});
		const listed = await client.listInfrastructure();
		expect(listed.resourceVersion).toBe("22");
		expect(values.requests.map(request => request.url)).toEqual([
			"https://kubernetes.default.svc/apis/cluster.t4.dev/v1alpha1/namespaces/development/t4clusterhosts?limit=256",
			"https://kubernetes.default.svc/apis/cluster.t4.dev/v1alpha1/namespaces/development/t4workspaces?limit=256",
			"https://kubernetes.default.svc/apis/cluster.t4.dev/v1alpha1/namespaces/development/t4sessions?limit=1000",
		]);
		for (const request of values.requests) expect(request.init?.headers).toMatchObject({ Authorization: "Bearer service-account-token" });
		expect(JSON.stringify(listed)).not.toContain("service-account-token");
	});

	test("persists idempotent CR identity as command id plus semantic hash without credentials or arbitrary URLs", async () => {
		const values = recordingFetch([]);
		const client = new KubernetesApiClient({
			baseUrl: "https://kubernetes.default.svc",
			namespace: "development",
			token: "service-account-token",
			fetch: values.fetch,
		});
		const backend = new KubernetesGatewayMutationBackend({ client, hostRef: "primary" });
		const workspaceArgs = {
			displayName: "Created workspace",
			retentionPolicy: "Retain" as const,
			capacity: "20Gi",
			storageClass: "t4-workspaces-rwx",
			repository: { repositoryId: "t4-code", ref: "refs/heads/main", commit: "abc" },
		};
		await backend.createWorkspace("command-create-workspace", workspaceArgs);
		const workspaceBody = JSON.parse(String(values.requests[0]?.init?.body));
		expect(values.requests[0]).toMatchObject({
			url: "https://kubernetes.default.svc/apis/cluster.t4.dev/v1alpha1/namespaces/development/t4workspaces",
			init: { method: "POST" },
		});
		expect(workspaceBody).toMatchObject({
			apiVersion: "cluster.t4.dev/v1alpha1",
			kind: "T4Workspace",
			metadata: {
				name: expect.stringMatching(/^workspace-[a-f0-9]{16}$/),
				annotations: {
					"cluster.t4.dev/command-id": "command-create-workspace",
					"cluster.t4.dev/semantic-hash": semanticResourceHash(workspaceArgs),
				},
			},
			spec: { hostRef: "primary", displayName: "Created workspace", retentionPolicy: "Retain", size: "20Gi" },
		});
		expect(JSON.stringify(workspaceBody)).not.toContain("token");
		expect(JSON.stringify(workspaceBody)).not.toContain("url");

		await backend.createSession("command-create-session", {
			workspaceId: "workspace-one",
			title: "Task",
			runtimeProfile: "omp-17.0.5",
			guiEnabled: true,
			ci: { provider: "woodpecker", repositoryId: "t4-code", ref: "refs/heads/main", commit: "abc" },
		});
		const sessionBody = JSON.parse(String(values.requests[1]?.init?.body));
		expect(sessionBody).toMatchObject({
			apiVersion: "cluster.t4.dev/v1alpha1",
			kind: "T4Session",
			metadata: { name: expect.stringMatching(/^session-[a-f0-9]{16}$/) },
			spec: { hostRef: "primary", workspaceRef: "workspace-one", runtimeProfile: "omp-17.0.5", gui: { enabled: true } },
		});
	});

	test("reuses an existing exact command annotation and rejects semantic conflicts", async () => {
		const args = { displayName: "Created", retentionPolicy: "Delete" as const, capacity: "10Gi" };
		const existing = {
			metadata: {
				name: "workspace-existing",
				resourceVersion: "9",
				annotations: {
					"cluster.t4.dev/command-id": "command-one",
					"cluster.t4.dev/semantic-hash": semanticResourceHash(args),
				},
			},
			status: { revision: "workspace-r1" },
		};
		const values = recordingFetch([{ items: [existing], metadata: { resourceVersion: "9" } }]);
		const backend = new KubernetesGatewayMutationBackend({
			client: new KubernetesApiClient({ baseUrl: "https://kubernetes.default.svc", namespace: "development", token: "token", fetch: values.fetch }),
			hostRef: "primary",
		});
		expect(await backend.createWorkspace("command-one", args)).toEqual({ id: "workspace-existing", revision: "9" });
		expect(values.requests.every(request => request.init?.method !== "POST")).toBe(true);
	});
});
