import { describe, expect, it } from "vite-plus/test";
import {
  createRemoteConnectionPlan,
  forgetRemoteHost,
  pairRemoteHost,
  revokeRemoteHost,
  sanitizeConnectionPlan,
  sanitizePairedHostRecord,
  selectRemoteEndpoint,
  TargetCapabilityError,
  TargetCredentialError,
  TargetEndpointError,
  TargetIdentityMismatchError,
  TargetNotPairedError,
  type CredentialEntry,
  type CredentialVault,
  type EndpointProbe,
  type PairedHostRecord,
  type PairingResponse,
  type PrivilegedPairingConnector,
  type TargetRegistry,
} from "../src/target.ts";

const CANARY = "raw-canary-device-token-should-never-leak";
const response: PairingResponse = {
  deviceToken: CANARY,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  hostId: "host-a",
  tailscaleNodeId: "node-a",
  tailscaleLogin: "alice@example.com",
  capabilities: ["sessions.read", "sessions.write"],
  protocolVersion: 1,
  endpoints: [{ transport: "direct", host: "node-a.tail.ts.net", url: "ws://node-a.tail.ts.net:4879/", port: 4879 }],
  metadata: { region: "tailnet", endpoint: "https://secret.example/" },
};

class Vault implements CredentialVault {
  values = new Map<string, string | CredentialEntry>();
  failSet = false;
  failDelete = false;
  async get(ref: string) { return this.values.get(ref) ?? null; }
  async set(ref: string, token: string | CredentialEntry) { if (this.failSet) throw new Error("vault failed"); this.values.set(ref, token); }
  async delete(ref: string) { if (this.failDelete) throw new Error("vault failed"); this.values.delete(ref); }
}
class Registry implements TargetRegistry {
  value: PairedHostRecord | null = null;
  failPut = false;
  failDelete = false;
  async get(targetId: string) { return targetId === this.value?.targetId ? this.value : null; }
  async put(value: PairedHostRecord) { if (this.failPut) throw new Error("registry failed"); this.value = value; }
  async delete() { if (this.failDelete) throw new Error("registry failed"); this.value = null; }
}
class Connector implements PrivilegedPairingConnector {
  readonly value: PairingResponse;
  constructor(value: PairingResponse = response) { this.value = value; }
  async pair(input: { code: string }) { expect(input.code).toBe("123456"); return this.value; }
}
const probe: EndpointProbe = {
  async probe(_endpoint) {
    return { ok: true, protocolVersion: 1, hostId: "host-a", tailscaleNodeId: "node-a", tailscaleLogin: "alice@example.com" };
  },
};

async function paired() {
  const registry = new Registry();
  const vault = new Vault();
  const result = await pairRemoteHost({ targetId: "target-a", label: "Desktop", code: "123456", connector: new Connector(), registry, vault, expectedEndpointHosts: ["node-a.tail.ts.net"], now: Date.now() });
  return { registry, vault, result };
}

describe("remote paired target contract", () => {
  it("serializes only sanitized views and never the token", async () => {
    const { result } = await paired();
    const serialized = JSON.stringify(result.view);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).not.toContain("credentialRef");
    expect(serialized).not.toContain("node-a.tail.ts.net");
    expect(JSON.stringify(sanitizePairedHostRecord(result.record))).not.toContain(CANARY);
  });

  it("rejects malicious URLs, LAN/public IPs, userinfo and query/hash", async () => {
    const registry = new Registry();
    const vault = new Vault();
    const bad = (url: string, host = "node-a.tail.ts.net") => pairRemoteHost({ targetId: "x", label: "x", code: "123456", connector: new Connector({ ...response, endpoints: [{ transport: "direct", host, url, port: 4879 }] }), registry, vault, expectedEndpointHosts: [host] });
    await expect(bad("ws://192.168.1.4:4879/")).rejects.toBeInstanceOf(TargetEndpointError);
    await expect(bad("ws://8.8.8.8:4879/", "8.8.8.8")).rejects.toBeInstanceOf(TargetEndpointError);
    await expect(bad("ws://node-a.tail.ts.net:4879/?token=evil")).rejects.toBeInstanceOf(TargetEndpointError);
    await expect(bad("ws://user:pass@node-a.tail.ts.net:4879/")).rejects.toBeInstanceOf(TargetEndpointError);
    await expect(bad("wss://node-a.tail.ts.net:8443/", "node-a.tail.ts.net")).rejects.toBeInstanceOf(TargetEndpointError);
    await expect(pairRemoteHost({ targetId: "x", label: "x", code: "123456", connector: new Connector(), registry, vault, expectedEndpointHosts: ["public.example.com"] })).rejects.toBeInstanceOf(TargetEndpointError);
  });

  it("rolls vault back if registry write fails", async () => {
    const registry = new Registry();
    registry.failPut = true;
    const vault = new Vault();
    await expect(pairRemoteHost({ targetId: "target-a", label: "Desktop", code: "123456", connector: new Connector(), registry, vault, expectedEndpointHosts: ["node-a.tail.ts.net"] })).rejects.toBeInstanceOf(Error);
    expect(vault.values.size).toBe(0);
    expect(registry.value).toBeNull();
  });

  it("denies absent, revoked, expired and under-capability targets before probing", async () => {
    const { registry, vault } = await paired();
    let probes = 0;
    const counting: EndpointProbe = { probe: async () => { probes += 1; return probe.probe({} as never, new AbortController().signal); } };
    await expect(createRemoteConnectionPlan({ targetId: "missing", registry, vault, probe })).rejects.toBeInstanceOf(TargetNotPairedError);
    vault.values.clear();
    await expect(createRemoteConnectionPlan({ targetId: "target-a", registry, vault, probe })).rejects.toBeInstanceOf(TargetCredentialError);
    vault.values.set("remote/target-a", { token: CANARY, expiresAt: 1 });
    await expect(createRemoteConnectionPlan({ targetId: "target-a", registry, vault, probe })).rejects.toBeInstanceOf(TargetCredentialError);
    registry.value = { ...registry.value!, capabilities: [] };
    vault.values.set("remote/target-a", { token: CANARY, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    await expect(createRemoteConnectionPlan({ targetId: "target-a", registry, vault, probe: counting })).rejects.toBeInstanceOf(TargetCapabilityError);
    expect(probes).toBe(0);
  });

  it("pins host/node/login and hard-fails identity swaps", async () => {
    const { registry } = await paired();
    const swapped: EndpointProbe = { probe: async () => ({ ok: true, protocolVersion: 1, hostId: "host-b", tailscaleNodeId: "node-b", tailscaleLogin: "mallory@example.com" }) };
    await expect(selectRemoteEndpoint({ record: registry.value!, probe: swapped })).rejects.toBeInstanceOf(TargetIdentityMismatchError);
  });

  it("uses direct before Serve and keeps plan secrets out of its view", async () => {
    const { registry, vault } = await paired();
    registry.value = { ...registry.value!, endpoints: [
      { transport: "serve", host: "node-a.tail.ts.net", url: "wss://node-a.tail.ts.net/", port: 443 },
      registry.value!.endpoints[0]!,
    ] };
    const plan = await createRemoteConnectionPlan({ targetId: "target-a", registry, vault, probe });
    expect(plan.endpoint.transport).toBe("direct");
    expect(plan.authorization.value).toContain(CANARY);
    expect(JSON.stringify(sanitizeConnectionPlan(plan))).not.toContain(CANARY);
    expect(JSON.stringify(sanitizeConnectionPlan(plan))).not.toContain("tail.ts.net");
  });

  it("forgets both records and vault entries without transport side effects", async () => {
    const { registry, vault } = await paired();
    await forgetRemoteHost({ targetId: "target-a", registry, vault });
    expect(registry.value).toBeNull();
    expect(vault.values.size).toBe(0);
  });
});
it("remotes revoke before local deletion and preserves local state on remote failure", async () => {
  const { registry, vault } = await paired();
  let calls = 0;
  const connector = { revoke: async () => { calls += 1; throw new Error("remote refused"); } };
  await expect(revokeRemoteHost({ targetId: "target-a", registry, vault, connector })).rejects.toBeDefined();
  expect(calls).toBe(1);
  expect(registry.value).not.toBeNull();
  expect(vault.values.size).toBe(1);
});

it("cleans local state only after remote revoke succeeds", async () => {
  const { registry, vault } = await paired();
  let calls = 0;
  const connector = { revoke: async () => { calls += 1; } };
  await revokeRemoteHost({ targetId: "target-a", registry, vault, connector });
  expect(calls).toBe(1);
  expect(registry.value).toBeNull();
  expect(vault.values.size).toBe(0);
});
