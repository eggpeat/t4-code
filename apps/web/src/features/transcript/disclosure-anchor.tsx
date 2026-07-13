// Disclosure/scroll coordination for the virtualized transcript. Expanding
// or collapsing a reasoning/tool/unknown-entry disclosure must keep the
// clicked control at the same viewport-relative position (≤1px) and keep
// focus on it — a user disclosure is a reading action, never a reason to
// jump, and never a reason to re-pin to the bottom.
//
// Mechanism (no timeouts): capture the control's rect and its scroll
// container BEFORE the state mutation, commit the mutation synchronously
// (flushSync), compensate the exact layout delta in the same task, then keep
// compensating through LegendList's asynchronous remeasure via a
// ResizeObserver (fires in the layout phase, before paint) until the layout
// has been quiet for a few frames. While a compensation is active the
// timeline suppresses follow-to-bottom so item-layout growth from the
// disclosure is never mistaken for streamed output.
import { createContext, useContext } from "react";
import { flushSync } from "react-dom";

export interface DisclosureAnchorController {
  /**
   * Run `mutate` (a React state toggle) while preserving `control`'s
   * viewport position and focus.
   */
  toggle(control: HTMLElement, mutate: () => void): void;
}

export const DisclosureAnchorContext = createContext<DisclosureAnchorController | null>(null);

/**
 * Hook used by disclosure rows. Falls back to a plain mutation outside a
 * timeline (tests, gallery mounts) where no scroll container exists.
 */
export function useAnchoredDisclosure(): DisclosureAnchorController["toggle"] {
  const controller = useContext(DisclosureAnchorContext);
  if (controller === null) return (_control, mutate) => mutate();
  return controller.toggle;
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element.parentElement;
  while (node !== null) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export interface AnchoredToggleHooks {
  /** Called before the mutation; the timeline freezes follow-to-bottom. */
  readonly onBegin: () => void;
  /** Called after layout settles; the timeline re-reads its pin state. */
  readonly onSettle: () => void;
}

/** Frames of unchanged layout before a compensation is considered settled. */
const QUIET_FRAMES = 3;

/**
 * The controller implementation. Owned by TranscriptTimeline; kept apart so
 * the anchor math stays testable without the list.
 */
export function createAnchoredToggle(hooks: AnchoredToggleHooks): DisclosureAnchorController {
  let active = 0;
  return {
    toggle(control, mutate) {
      const scroller = findScrollParent(control);
      if (scroller === null) {
        mutate();
        return;
      }
      const anchorTop = control.getBoundingClientRect().top;
      active += 1;
      if (active === 1) hooks.onBegin();

      // Commit synchronously so the DOM mutation and the first compensation
      // land in the same task — before the browser paints.
      flushSync(mutate);

      const compensate = () => {
        if (!control.isConnected) return;
        const delta = control.getBoundingClientRect().top - anchorTop;
        // Sub-pixel scroll writes are lossy on some DPRs; only correct real
        // drift and correct it exactly.
        if (delta !== 0) scroller.scrollTop += delta;
      };
      compensate();

      // LegendList repositions siblings asynchronously (its own
      // ResizeObserver). The observer only marks the layout dirty; the rAF
      // tick below does the single per-frame compensation, so an animated
      // expansion costs one rect read per frame instead of two.
      const observed = scroller.firstElementChild ?? scroller;
      let quiet = 0;
      let frame = 0;
      const observer = new ResizeObserver(() => {
        quiet = 0;
      });
      observer.observe(observed);

      const finish = () => {
        observer.disconnect();
        active -= 1;
        if (active === 0) hooks.onSettle();
        // The toggle never moves focus; if the browser dropped it (e.g. the
        // control re-rendered), put it back without scrolling.
        if (
          control.isConnected &&
          document.activeElement !== control &&
          (document.activeElement === document.body || document.activeElement === null)
        ) {
          control.focus({ preventScroll: true });
        }
      };

      const tick = () => {
        compensate();
        quiet += 1;
        if (quiet >= QUIET_FRAMES) {
          finish();
          return;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      void frame;
    },
  };
}
