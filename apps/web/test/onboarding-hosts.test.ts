// Host menu, service, and device-management contracts: every connection
// state has a label/tone/safe-action mapping, cached hosts never read as
// connected, service success only follows confirmed backend events, revoke
// confirmation names its full impact, and no fixture leaks an address,
// path, or token into renderer-facing data.
import { describe, expect, it } from "vite-plus/test";

import {
  buildRevokeConfirmation,
  focusAfterRevoke,
  revokeDevice,
} from "../src/features/onboarding/devices.ts";
import {
  DEVICE_FIXTURES,
  HOST_FIXTURES,
  HOST_MENU_FIXTURE,
  ONBOARDING_EPOCH_MS,
  PAIRING_FIXTURES,
  SERVICE_FIXTURES,
} from "../src/features/onboarding/fixtures.ts";
import {
  groupHosts,
  HOST_CONNECTION_STATES,
  HOST_STATE_META,
  hostIsUsable,
} from "../src/features/onboarding/hosts.ts";
import { formatLastSeen } from "../src/features/onboarding/model.ts";
import { initialService, serviceReduce } from "../src/features/onboarding/service.ts";

describe("host state contract", () => {
  it("every connection state has a fixture, a label, and a reason", () => {
    for (const state of HOST_CONNECTION_STATES) {
      const fixture = HOST_FIXTURES[state];
      expect(fixture.state, state).toBe(state);
      expect(fixture.reason.length, state).toBeGreaterThan(0);
      expect(HOST_STATE_META[state].label.length, state).toBeGreaterThan(0);
    }
  });

  it("every broken state offers a safe action; waiting states offer none", () => {
    expect(HOST_STATE_META.unavailable.action?.id).toBe("retry");
    expect(HOST_STATE_META["offline-cache"].action?.id).toBe("view-cached");
    expect(HOST_STATE_META["version-skew"].action?.id).toBe("upgrade-host");
    expect(HOST_STATE_META["upgrade-required"].action?.id).toBe("update-app");
    expect(HOST_STATE_META.reconnecting.action?.id).toBe("open-diagnostics");
    expect(HOST_STATE_META.starting.action).toBeNull();
    expect(HOST_STATE_META.ready.action).toBeNull();
  });

  it("a cached host never claims to be connected", () => {
    const meta = HOST_STATE_META["offline-cache"];
    expect(meta.label.toLowerCase()).not.toContain("connected");
    expect(meta.label.toLowerCase()).toContain("cached");
    expect(HOST_FIXTURES["offline-cache"].reason).toContain("nothing here is live");
    expect(hostIsUsable("offline-cache")).toBe(false);
  });

  it("only live states pulse", () => {
    for (const state of HOST_CONNECTION_STATES) {
      expect(HOST_STATE_META[state].live, state).toBe(
        state === "starting" || state === "reconnecting",
      );
    }
  });

  it("groups local before remote and keeps order within groups", () => {
    const groups = groupHosts(HOST_MENU_FIXTURE);
    expect(groups.map((group) => group.kind)).toEqual(["local", "remote"]);
    expect(groups[1]?.hosts.map((host) => host.state)).toEqual([
      "reconnecting",
      "offline-cache",
      "version-skew",
      "upgrade-required",
      "read-only",
      "unavailable",
    ]);
  });
});

describe("service reducer honesty", () => {
  it("running only ever follows a confirmed backend event", () => {
    let service = initialService("systemd");
    service = serviceReduce(service, { kind: "check-missing" });
    service = serviceReduce(service, { kind: "install-requested" });
    expect(service.status).toBe("installing");
    service = serviceReduce(service, { kind: "install-succeeded" });
    // Install success is NOT running; starting is a separate confirmed step.
    expect(service.status).toBe("stopped");
    service = serviceReduce(service, { kind: "start-requested" });
    expect(service.status).toBe("starting");
    service = serviceReduce(service, { kind: "start-confirmed", version: "0.3.0" });
    expect(service.status).toBe("running");
    expect(service.detail).toContain("0.3.0");
  });

  it("failure keeps the diagnostics evidence for the handoff", () => {
    let service = serviceReduce(initialService("launchd"), { kind: "check-found-stopped" });
    service = serviceReduce(service, { kind: "start-requested" });
    service = serviceReduce(service, {
      kind: "start-failed",
      detail: "The appserver exited right after starting (exit 101).",
      diagnostics: ["Service entered failed state after 2 restarts"],
    });
    expect(service.status).toBe("start-failed");
    expect(service.diagnostics).toHaveLength(1);
    // Recovery clears stale evidence.
    service = serviceReduce(service, { kind: "start-confirmed", version: "0.3.0" });
    expect(service.diagnostics).toHaveLength(0);
  });

  it("platform wording follows the actual platform", () => {
    const systemd = serviceReduce(initialService("systemd"), { kind: "check-missing" });
    expect(systemd.detail).toContain("systemd user service");
    const launchd = serviceReduce(initialService("launchd"), { kind: "check-missing" });
    expect(launchd.detail).toContain("launchd agent");
  });
});

describe("device revoke", () => {
  const device = DEVICE_FIXTURES[0];
  if (device === undefined) throw new Error("fixture missing");

  it("confirmation names the device, the host, and the capability impact", () => {
    const confirmation = buildRevokeConfirmation(device, "This computer", "revoke-device-x");
    expect(confirmation.title).toContain(device.label);
    expect(confirmation.body).toContain("This computer");
    expect(confirmation.body).toContain(device.identity.account);
    expect(confirmation.body).toContain("see sessions");
    expect(confirmation.body).toContain("control sessions");
    expect(confirmation.body).toContain("open terminals");
    expect(confirmation.confirmLabel).toContain(device.label);
  });

  it("revoking removes exactly one device; unknown ids change nothing", () => {
    const after = revokeDevice(DEVICE_FIXTURES, device.id);
    expect(after).toHaveLength(DEVICE_FIXTURES.length - 1);
    expect(after.some((entry) => entry.id === device.id)).toBe(false);
    expect(revokeDevice(DEVICE_FIXTURES, "device-unknown")).toBe(DEVICE_FIXTURES);
  });

  it("focus lands on the next row's revoke button, then previous, then the list", () => {
    expect(focusAfterRevoke(DEVICE_FIXTURES, "device-mbp")).toBe("revoke-device-device-phone");
    expect(focusAfterRevoke(DEVICE_FIXTURES, "device-work")).toBe("revoke-device-device-phone");
    const only = DEVICE_FIXTURES.slice(0, 1);
    expect(focusAfterRevoke(only, "device-mbp")).toBe("paired-device-list");
  });
});

describe("renderer-facing fixture hygiene", () => {
  it("no fixture carries an IP, filesystem path, port, or bearer token", () => {
    const serialized = JSON.stringify({
      hosts: HOST_MENU_FIXTURE,
      hostStates: HOST_FIXTURES,
      services: SERVICE_FIXTURES,
      devices: DEVICE_FIXTURES,
      pairing: PAIRING_FIXTURES,
    });
    expect(serialized).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(serialized).not.toMatch(/(^|[^\w])\/(run|etc|var|home|usr|Library|opt)\//);
    expect(serialized).not.toMatch(/:\d{4,5}\b/);
    expect(serialized).not.toContain("BEARER-TOKEN");
  });

  it("relative time labels stay deterministic against the fixture epoch", () => {
    const device = DEVICE_FIXTURES[1];
    expect(formatLastSeen(device?.lastSeenAt ?? null, ONBOARDING_EPOCH_MS)).toBe("1d ago");
    expect(formatLastSeen(null, ONBOARDING_EPOCH_MS)).toBe("Never connected");
  });
});
