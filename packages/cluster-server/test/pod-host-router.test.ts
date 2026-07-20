import { expect, it } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketPodHostConnector } from "../src/pod-host-router.ts";

class MemoryWebSocket {
	readyState = WebSocket.CONNECTING;
	readonly sent = Promise.withResolvers<string>();
	readonly #listeners: Record<string, Array<(event: unknown) => void>> = {};
	addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
		const callback = typeof listener === "function" ? listener : event => listener.handleEvent(event as Event);
		(this.#listeners[type] ??= []).push(callback);
	}
	send(value: string | ArrayBufferLike | Blob | ArrayBufferView): void {
		this.sent.resolve(String(value));
	}
	close(): void { this.readyState = WebSocket.CLOSED; }
	emit(type: string, event: unknown = {}): void {
		if (type === "open") this.readyState = WebSocket.OPEN;
		for (const listener of this.#listeners[type] ?? []) listener(event);
	}
}

it("pod connector reads the current projected identity and presents it in the existing hello authentication field", async () => {
	const directory = await mkdtemp(join(tmpdir(), "t4-pod-identity-"));
	try {
		const path = join(directory, "token");
		const token = `header.payload.${"s".repeat(64)}`;
		await writeFile(path, token, { mode: 0o400 });
		const socket = new MemoryWebSocket();
		const connector = new WebSocketPodHostConnector({
			identityTokenFile: path,
			webSocketFactory: () => socket as unknown as WebSocket,
		});
		const pending = connector.connect({ clusterSessionId: "session-one", url: "ws://session-one:8787/v1/ws" }, () => undefined);
		socket.emit("open");
		const hello = JSON.parse(await socket.sent.promise);
		expect(hello.authentication).toEqual({ deviceId: "cluster-server", deviceToken: token });
		socket.emit("message", { data: JSON.stringify({
			v: "omp-app/1",
			type: "welcome",
			selectedProtocol: "omp-app/1",
			hostId: "host-a",
			ompVersion: "17.0.5",
			ompBuild: "test",
			appserverVersion: "0.1.30",
			appserverBuild: "cluster-session",
			epoch: "pod-epoch",
			grantedCapabilities: [],
			grantedFeatures: [],
			negotiatedLimits: {},
			authentication: "paired",
			resumed: false,
		}) });
		const connection = await pending;
		expect(connection.hostId).toBe("host-a");
		connection.close();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
