// Rail keyboard contract: arrows walk the section list without wrapping,
// Home/End jump, and a stale current id recovers to the first section.
import { describe, expect, it } from "vite-plus/test";

import { railFocusTarget } from "./keyboard.ts";

const SECTIONS = ["general", "appearance", "models"] as const;

describe("rail keyboard navigation", () => {
  it("moves down and up between neighbors", () => {
    expect(railFocusTarget(SECTIONS, "general", "ArrowDown")).toBe("appearance");
    expect(railFocusTarget(SECTIONS, "appearance", "ArrowUp")).toBe("general");
  });

  it("stops at the edges instead of wrapping", () => {
    expect(railFocusTarget(SECTIONS, "models", "ArrowDown")).toBeNull();
    expect(railFocusTarget(SECTIONS, "general", "ArrowUp")).toBeNull();
  });

  it("jumps with Home and End, and stays put when already there", () => {
    expect(railFocusTarget(SECTIONS, "models", "Home")).toBe("general");
    expect(railFocusTarget(SECTIONS, "general", "End")).toBe("models");
    expect(railFocusTarget(SECTIONS, "general", "Home")).toBeNull();
    expect(railFocusTarget(SECTIONS, "models", "End")).toBeNull();
  });

  it("recovers to the first section when the current id is unknown", () => {
    expect(railFocusTarget(SECTIONS, "ghost", "ArrowDown")).toBe("general");
    expect(railFocusTarget([], "general", "ArrowDown")).toBeNull();
  });
});
