// Small shared pieces for the onboarding surfaces: the semantic tone dot
// (existing hues only — success/warning/destructive/info/status-working;
// brand pink never appears here) and the labeled row chrome the host menu and
// service card share.
import { cn } from "@t4-code/ui";

import type { HostStateTone } from "./hosts.ts";

const TONE_TEXT: Readonly<Record<HostStateTone, string>> = {
  working: "text-status-working",
  success: "text-success-foreground",
  error: "text-destructive-foreground",
  muted: "text-muted-foreground",
  warning: "text-warning-foreground",
  info: "text-info-foreground",
};

const TONE_DOT: Readonly<Record<HostStateTone, string>> = {
  working: "bg-status-working-dot",
  success: "bg-success",
  error: "bg-destructive",
  muted: "bg-muted-foreground",
  warning: "bg-warning",
  info: "bg-info",
};

/**
 * Dot + sentence-case label, the same shape as the session status pill.
 * Only live (actively changing) states pulse, and the pulse hides under
 * reduced motion.
 */
export function ToneBadge({
  tone,
  label,
  live = false,
  className,
}: {
  readonly tone: HostStateTone;
  readonly label: string;
  readonly live?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 font-medium text-xs",
        TONE_TEXT[tone],
        className,
      )}
      data-tone={tone}
    >
      <span aria-hidden="true" className="relative flex size-1.5">
        {live && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-75 motion-reduce:hidden",
              TONE_DOT[tone],
            )}
          />
        )}
        <span className={cn("relative inline-flex size-1.5 rounded-full", TONE_DOT[tone])} />
      </span>
      {label}
    </span>
  );
}

/** Uppercase group heading used above host groups and device lists. */
export function GroupLabel({
  children,
  id,
}: {
  readonly children: string;
  readonly id?: string;
}) {
  return (
    <h3
      className="px-1 pb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide"
      id={id}
    >
      {children}
    </h3>
  );
}
