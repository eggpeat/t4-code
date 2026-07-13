// Appearance → Accent: an app preference block rendered beneath the
// host-published Appearance section. It is deliberately NOT a catalog row —
// the choice lives in this device's local storage, applies immediately, and
// never enters drafts, saves, or the wire. The chip and help copy say so.
import { Badge, Button, cn } from "@t4-code/ui";
import { Check, RotateCcw } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  ACCENT_LABEL,
  ACCENT_PRESETS,
  type AccentPreset,
  DEFAULT_ACCENT,
  getAccent,
  setAccent,
  subscribeAccent,
} from "../../theme/accent.ts";

function serverAccent(): AccentPreset {
  return DEFAULT_ACCENT;
}

export function AccentRow() {
  const accent = useSyncExternalStore(subscribeAccent, getAccent, serverAccent);
  return (
    <div className="flex min-h-10 flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex min-w-56 max-w-full flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground text-sm" id="accent-color-label">
            Accent color
          </span>
          <Badge variant="outline">App preference · this device</Badge>
        </div>
        <p className="max-w-[70ch] text-muted-foreground text-xs leading-relaxed">
          Colors buttons, focus outlines, selections, and highlights in this app. Saved on this
          device only — it never changes anything on the host.
        </p>
        {accent !== DEFAULT_ACCENT && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <Button onClick={() => setAccent(DEFAULT_ACCENT)} size="xs" variant="ghost">
              <RotateCcw />
              Reset to Pi Pink
            </Button>
          </div>
        )}
      </div>
      <div
        aria-labelledby="accent-color-label"
        className="ms-auto flex max-w-full flex-wrap items-start justify-end gap-x-3 gap-y-2 pt-0.5"
        role="radiogroup"
      >
        {ACCENT_PRESETS.map((preset) => {
          const selected = preset === accent;
          return (
            <label
              className="group/swatch flex w-12 cursor-pointer flex-col items-center gap-1"
              data-accent={preset}
              key={preset}
            >
              <input
                aria-label={ACCENT_LABEL[preset]}
                checked={selected}
                className="peer sr-only"
                name="t4-accent-preset"
                onChange={() => setAccent(preset)}
                type="radio"
                value={preset}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 items-center justify-center rounded-full bg-primary ring-offset-2 ring-offset-background transition-shadow duration-(--motion-duration-fast) ease-(--motion-ease-out)",
                  selected
                    ? "ring-2 ring-ring"
                    : "group-hover/swatch:ring-1 group-hover/swatch:ring-border",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                )}
              >
                {selected && <Check className="size-3.5 text-primary-foreground" />}
              </span>
              <span
                className={cn(
                  "text-xs transition-colors duration-(--motion-duration-fast)",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {ACCENT_LABEL[preset]}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
