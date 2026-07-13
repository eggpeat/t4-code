// Disclosure anchor coordination: outside a scrollable timeline the toggle
// degrades to a plain mutation (nothing to compensate, no follow freeze).
// The full ≤1px viewport-anchor contract is exercised headed (browser proof)
// because it depends on real layout; this pins the seam's fallback contract.
import { describe, expect, it } from "vite-plus/test";

import { createAnchoredToggle } from "../src/features/transcript/disclosure-anchor.tsx";

function fakeControl(): HTMLElement {
  return {
    parentElement: null,
    isConnected: true,
    getBoundingClientRect: () => ({ top: 0 }),
  } as unknown as HTMLElement;
}

describe("createAnchoredToggle without a scroll container", () => {
  it("runs the mutation exactly once and never freezes the pin", () => {
    let began = 0;
    let settled = 0;
    let mutations = 0;
    const controller = createAnchoredToggle({
      onBegin: () => {
        began += 1;
      },
      onSettle: () => {
        settled += 1;
      },
    });
    controller.toggle(fakeControl(), () => {
      mutations += 1;
    });
    expect(mutations).toBe(1);
    expect(began).toBe(0);
    expect(settled).toBe(0);
  });

  it("propagates mutation synchronously (no deferral, content never waits)", () => {
    const controller = createAnchoredToggle({ onBegin: () => {}, onSettle: () => {} });
    let done = false;
    controller.toggle(fakeControl(), () => {
      done = true;
    });
    expect(done).toBe(true);
  });
});
