import { describe, expect, it } from "vite-plus/test";
import WebSocket from "ws";
import { FixtureWebSocketServer } from "../src/ws.ts";

const hello = {
  v: "omp-app/1",
  type: "hello",
  protocol: { min: "omp-app/1", max: "omp-app/1" },
  client: { name: "ws-test", version: "1", build: "test", platform: "linux" },
  requestedFeatures: ["resume"],
  savedCursors: [],
};
function opened(socket: WebSocket): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  socket.once("open", resolve);
  socket.once("error", reject);
  return promise;
}
function closed(socket: WebSocket): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  socket.once("close", (code) => resolve(code));
  socket.once("error", () => resolve(1006));
  return promise;
}
function nextMessage(socket: WebSocket): Promise<unknown> {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  socket.once("message", (data) => resolve(JSON.parse(data.toString("utf8")) as unknown));
  return promise;
}
function messages(socket: WebSocket, count: number): Promise<unknown[]> {
  const values: unknown[] = [];
  const { promise, resolve } = Promise.withResolvers<unknown[]>();
  socket.on("message", (data) => {
    values.push(JSON.parse(data.toString("utf8")) as unknown);
    if (values.length === count) resolve(values);
  });
  return promise;
}

async function start(): Promise<FixtureWebSocketServer> {
  const server = new FixtureWebSocketServer({ scenario: "basic-v1" });
  await server.start();
  return server;
}

describe("loopback fixture websocket", () => {
  it("binds loopback, rejects strict paths/hosts, and cleans up", async () => {
    const server = await start();
    expect(server.address).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/fixture$/u);
    const wrong = new WebSocket(server.address.replace("/fixture", "/wrong"));
    expect(await closed(wrong)).toBeGreaterThan(0);
    const wrongHost = new WebSocket(server.address.replace("127.0.0.1", "localhost"));
    expect(await closed(wrongHost)).toBeGreaterThan(0);
    const socket = new WebSocket(server.address);
    await opened(socket);
    const frameMessages = messages(socket, 3);
    socket.send(JSON.stringify(hello));
    expect(await frameMessages).toHaveLength(3);
    expect(server.clientCount).toBe(1);
    const socketClose = closed(socket);
    await server.stop();
    await socketClose;
    expect(server.clientCount).toBe(0);
    expect(server.port).toBe(0);
    expect(server.engine.scheduler.pending()).toBe(0);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });
  it("honors a requested port and rejects binary and oversized payloads", async () => {
    const first = await start();
    const requestedPort = first.port;
    await first.stop();
    const server = new FixtureWebSocketServer({ scenario: "basic-v1", port: requestedPort });
    await server.start();
    expect(server.port).toBe(requestedPort);
    const binary = new WebSocket(server.address);
    await opened(binary);
    const binaryClosed = closed(binary);
    binary.send(Buffer.from(JSON.stringify(hello)));
    expect(await binaryClosed).toBe(1009);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(server.clientCount).toBe(0);
    const oversized = new WebSocket(server.address);
    await opened(oversized);
    const oversizedClosed = closed(oversized);
    oversized.send("x".repeat(server.maxPayload + 1));
    expect(await oversizedClosed).toBe(1009);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(server.clientCount).toBe(0);
    await server.stop();
  });
  it("passes duplicate-key text through the protocol decoder and cleans disconnected clients", async () => {
    const server = await start();
    const socket = new WebSocket(server.address);
    await opened(socket);
    const handshake = messages(socket, 3);
    socket.send(JSON.stringify(hello));
    await handshake;
    expect(server.clientCount).toBe(1);
    const malformed = nextMessage(socket);
    socket.send('{"v":"omp-app/1","v":"omp-app/1","type":"ping","nonce":"n","timestamp":"t"}');
    expect(await malformed).toMatchObject({ type: "error", code: "INVALID_JSON" });
    const done = closed(socket);
    socket.close();
    await done;
    expect(server.clientCount).toBe(0);
    expect(server.engine.clientCount).toBe(0);
    await server.stop();
  });
});
