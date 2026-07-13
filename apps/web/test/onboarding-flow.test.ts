// First-run flow contract: stage guards actually gate, going back never
// loses data, and every stage change names the element that must receive
// focus.
import { describe, expect, it } from "vite-plus/test";

import {
  advance,
  blockedReason,
  canFinish,
  createOnboarding,
  goBack,
  stepperItems,
} from "../src/features/onboarding/flow.ts";
import { HOST_FIXTURES, SERVICE_FIXTURES } from "../src/features/onboarding/fixtures.ts";

describe("runtime stage guard", () => {
  it("blocks Continue until the appserver is confirmed running", () => {
    for (const status of ["checking", "not-installed", "installing", "install-failed", "stopped", "starting", "start-failed"] as const) {
      const state = createOnboarding(SERVICE_FIXTURES[status]);
      expect(blockedReason(state), status).not.toBeNull();
      expect(advance(state).stage).toBe("runtime");
    }
  });

  it("passes once the service reports running", () => {
    const state = createOnboarding(SERVICE_FIXTURES.running);
    expect(blockedReason(state)).toBeNull();
    expect(advance(state).stage).toBe("hosts");
  });

  it("passes when the user explicitly chooses remote-only", () => {
    const state = { ...createOnboarding(SERVICE_FIXTURES["not-installed"]), remoteOnly: true };
    expect(blockedReason(state)).toBeNull();
    expect(advance(state).stage).toBe("hosts");
  });
});

describe("hosts stage guard", () => {
  const base = { ...createOnboarding(SERVICE_FIXTURES.running), stage: "hosts" as const };

  it("blocks with no hosts, and says to add one", () => {
    expect(blockedReason(base)).toContain("Add at least one host");
  });

  it("blocks when every host is unusable, and says why", () => {
    const state = { ...base, hosts: [HOST_FIXTURES.unavailable, HOST_FIXTURES["upgrade-required"]] };
    expect(blockedReason(state)).toContain("None of your hosts is reachable");
  });

  it("passes with one usable host — including view-only and skewed hosts", () => {
    for (const fixture of [HOST_FIXTURES.ready, HOST_FIXTURES["read-only"], HOST_FIXTURES["version-skew"]]) {
      const state = { ...base, hosts: [fixture] };
      expect(blockedReason(state), fixture.state).toBeNull();
      expect(advance(state).stage).toBe("defaults");
    }
  });

  it("an offline cached host alone does not unlock the flow", () => {
    const state = { ...base, hosts: [HOST_FIXTURES["offline-cache"]] };
    expect(blockedReason(state)).not.toBeNull();
  });
});

describe("navigation and focus restoration", () => {
  it("stage changes set the stage heading as the focus target", () => {
    const state = advance(createOnboarding(SERVICE_FIXTURES.running));
    expect(state.focusTarget).toBe("onboarding-stage-hosts");
    const back = goBack(state);
    expect(back.focusTarget).toBe("onboarding-stage-runtime");
  });

  it("going back from the first stage is a no-op", () => {
    const state = createOnboarding(SERVICE_FIXTURES.running);
    expect(goBack(state)).toBe(state);
  });

  it("going back preserves everything entered so far", () => {
    const filled = {
      ...advance(createOnboarding(SERVICE_FIXTURES.running)),
      hosts: [HOST_FIXTURES.ready],
      defaults: { defaultProject: "t4-code", resume: "ask" as const },
    };
    const back = goBack(filled);
    expect(back.hosts).toEqual(filled.hosts);
    expect(back.defaults).toEqual(filled.defaults);
  });

  it("finishing is only possible from the last stage", () => {
    const runtime = createOnboarding(SERVICE_FIXTURES.running);
    expect(canFinish(runtime)).toBe(false);
    const defaults = { ...runtime, stage: "defaults" as const };
    expect(canFinish(defaults)).toBe(true);
  });
});

describe("stepper projection", () => {
  it("marks done/current/upcoming around the active stage", () => {
    expect(stepperItems("hosts")).toEqual([
      { id: "runtime", state: "done" },
      { id: "hosts", state: "current" },
      { id: "defaults", state: "upcoming" },
    ]);
  });
});
