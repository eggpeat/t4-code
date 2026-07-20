import { describe, expect, test } from "bun:test";
import type { RemoteConnection } from "@t4-code/host-service";
import { ClusterInternalRemotePolicy, sessionHostConfigFromEnv } from "../src/session-host-policy.ts";

const connection = {
	connectionId: "connection-one",
	peer: {
		identity: { nodeId: "cluster-server", addresses: ["10.42.0.10"], source: "direct" },
		address: "10.42.0.10",
		source: "direct",
	},
	socket: { connectionId: "connection-one", peer: {} as never, send: () => true, close: () => undefined },
} as RemoteConnection;
const hello = {
	v: "omp-app/1" as const,
	type: "hello" as const,
	protocol: { min: "omp-app/1", max: "omp-app/1" },
	client: { name: "cluster-server", version: "1", build: "test", platform: "linux" },
	requestedFeatures: ["resume", "session.state", "cluster.operator"],
	savedCursors: [],
	capabilities: { client: ["sessions.read", "sessions.prompt", "preview.control", "ci.trigger"] },
	authentication: { deviceId: "cluster-server", deviceToken: "s".repeat(32) },
};

describe("one-session pod host authority", () => {
	test("accepts only the mounted internal credential and never grants cluster-server-only names upstream", async () => {
		const policy = new ClusterInternalRemotePolicy({
			token: "s".repeat(32),
			supportedCapabilities: ["sessions.read", "sessions.prompt", "preview.control"],
			supportedFeatures: ["resume", "session.state"],
		});
		expect(await policy.authenticate(connection, hello)).toEqual({
			authenticated: true,
			authentication: "paired",
			deviceId: "cluster-server",
			grantedCapabilities: ["sessions.read", "sessions.prompt", "preview.control"],
			grantedFeatures: ["resume", "session.state"],
		});
		expect(
			await policy.authenticate(connection, {
				...hello,
				authentication: { deviceId: "cluster-server", deviceToken: "x".repeat(32) },
			}),
		).toMatchObject({ authenticated: false, authentication: "denied" });
	});

	test("authorizes only negotiated command capabilities on an authenticated connection", async () => {
		const policy = new ClusterInternalRemotePolicy({
			token: "s".repeat(32),
			supportedCapabilities: ["sessions.read"],
			supportedFeatures: ["resume"],
		});
		await policy.authenticate(connection, hello);
		expect(await policy.authorize(connection, { v: "omp-app/1", type: "ping", nonce: "one" }, { connectionId: "connection-one", peer: connection.peer })).toBe(true);
		expect(await policy.authorize(connection, {
			v: "omp-app/1", type: "command", requestId: "r1", commandId: "c1", hostId: "pod-host",
			sessionId: "private-session", command: "session.attach", args: {},
		}, { connectionId: "connection-one", peer: connection.peer })).toBe(true);
		expect(await policy.authorize(connection, {
			v: "omp-app/1", type: "command", requestId: "r2", commandId: "c2", hostId: "pod-host",
			sessionId: "private-session", command: "session.prompt", args: { message: "hello" },
		}, { connectionId: "connection-one", peer: connection.peer })).toBe(false);
	});

	test("parses a fixed, path-safe session host environment", () => {
		expect(sessionHostConfigFromEnv({
			T4_CLUSTER_INTERNAL_TOKEN: "s".repeat(32),
			T4_SESSION_NAME: "session-one",
			T4_OMP_EXECUTABLE: "/opt/t4/bin/omp",
			T4_SESSION_STATE_ROOT: "/workspace/.t4/sessions/session-one",
			T4_SESSION_HOST_PORT: "8787",
		})).toEqual({
			internalToken: "s".repeat(32),
			sessionName: "session-one",
			ompExecutable: "/opt/t4/bin/omp",
			stateRoot: "/workspace/.t4/sessions/session-one",
			port: 8787,
		});
		expect(() => sessionHostConfigFromEnv({ ...process.env, T4_CLUSTER_INTERNAL_TOKEN: "short" })).toThrow("token");
	});
});
