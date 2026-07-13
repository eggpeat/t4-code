// Keyboard-operable panel resize separator. Drag math reuses the design
// system's pure resize helpers; the live width stays local during a drag and
// commits to the workspace store on release, matching T3's persist-on-release
// behavior. Cancelled drags revert.
import { cn, resolveDragWidth, type WidthBounds } from "@t4-code/ui";
import { type PointerEvent as ReactPointerEvent, useRef } from "react";

const KEYBOARD_STEP = 16;

export function ResizeHandle({
  label,
  edge,
  bounds,
  width,
  onPreview,
  onCommit,
  className,
}: {
  /** Accessible name, e.g. "Resize session list". */
  label: string;
  /** Which panel edge this handle sits on (see resolveDragWidth). */
  edge: "left" | "right";
  bounds: WidthBounds;
  width: number;
  /** Live width during a drag; not persisted. */
  onPreview: (width: number | null) => void;
  /** Final width on pointer release or keyboard step. */
  onCommit: (width: number) => void;
  className?: string;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const endDrag = (event: ReactPointerEvent<HTMLElement>, commitWidth: number | null) => {
    if (dragRef.current === null) return;
    event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
    dragRef.current = null;
    document.documentElement.classList.remove("no-transitions");
    onPreview(null);
    if (commitWidth !== null) onCommit(commitWidth);
  };

  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={bounds.maxWidth}
      aria-valuemin={bounds.minWidth}
      aria-valuenow={Math.round(width)}
      className={cn(
        "relative w-px shrink-0 cursor-col-resize touch-none bg-border outline-none after:absolute after:inset-y-0 after:-left-1 after:w-2 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === "ArrowLeft")
          next = width + (edge === "left" ? KEYBOARD_STEP : -KEYBOARD_STEP);
        else if (event.key === "ArrowRight")
          next = width + (edge === "left" ? -KEYBOARD_STEP : KEYBOARD_STEP);
        else if (event.key === "Home") next = bounds.minWidth;
        else if (event.key === "End") next = bounds.maxWidth;
        if (next === null) return;
        event.preventDefault();
        onCommit(Math.max(bounds.minWidth, Math.min(bounds.maxWidth, next)));
      }}
      onPointerCancel={(event) => endDrag(event, null)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Panel drags suppress transitions, per the design system.
        document.documentElement.classList.add("no-transitions");
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (drag === null || event.pointerId !== drag.pointerId) return;
        onPreview(resolveDragWidth(edge, drag.startX, event.clientX, drag.startWidth, bounds));
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (drag === null || event.pointerId !== drag.pointerId) return;
        endDrag(event, resolveDragWidth(edge, drag.startX, event.clientX, drag.startWidth, bounds));
      }}
      role="separator"
      tabIndex={0}
    />
  );
}
