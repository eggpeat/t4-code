import { describe, expect, it } from "vite-plus/test";

import { parseFixtureBootOptions } from "../src/fixture/boot.ts";

describe("parseFixtureBootOptions", () => {
  it("parses supported switches", () => {
    const options = parseFixtureBootOptions(
      "?theme=dark&platform=darwin&pane=review&drawer=open&rail=collapsed&reset=1&session=sess-stream",
    );
    expect(options).toEqual({
      theme: "dark",
      platform: "darwin",
      pane: "review",
      terminalDrawer: true,
      railCollapsed: true,
      reset: true,
      session: "sess-stream",
    });
  });

  it("rejects unknown values instead of guessing", () => {
    const options = parseFixtureBootOptions("?theme=neon&platform=windows&drawer=full&rail=big");
    expect(options.theme).toBeNull();
    expect(options.platform).toBeNull();
    expect(options.terminalDrawer).toBe(false);
    expect(options.railCollapsed).toBe(false);
    expect(options.reset).toBe(false);
    expect(options.session).toBeNull();
  });

  it("is inert for an empty query", () => {
    const options = parseFixtureBootOptions("");
    expect(options.theme).toBeNull();
    expect(options.platform).toBeNull();
    expect(options.pane).toBeNull();
  });
});
