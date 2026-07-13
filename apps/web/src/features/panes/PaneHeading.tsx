// Panel heading: every family body opens with its own name in text, so the
// active family is unmistakable even when the shell's icon toggles are
// ambiguous (200% zoom, narrow sheets, screen readers).
import { cn } from "@t4-code/ui";

import { PANE_FAMILY_META } from "../../components/pane-families.tsx";
import type { PaneFamily } from "../../state/workspace-store.ts";

export function PaneHeading({
  family,
  summary,
  className,
}: {
  readonly family: PaneFamily;
  /** One short live fact ("6 agents · 2 running"); plain language. */
  readonly summary?: string | undefined;
  readonly className?: string;
}) {
  const meta = PANE_FAMILY_META.find((entry) => entry.id === family);
  if (meta === undefined) return null;
  const Icon = meta.icon;
  return (
    <h2
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-border border-b px-3 py-1.5",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-medium text-sm">{meta.label}</span>
      {summary !== undefined && (
        <span className="min-w-0 truncate ps-1 font-normal text-muted-foreground text-xs">
          {summary}
        </span>
      )}
    </h2>
  );
}
