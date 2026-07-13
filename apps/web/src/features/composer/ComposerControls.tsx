import { Popover } from "@base-ui/react/popover";
import { cn, IconButton } from "@t4-code/ui";
import { Check, ChevronDown, FileText, Image as ImageIcon, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { PromptAttachment } from "../session-runtime/intents.ts";

export interface ControlChoice {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
  /** Present when this choice cannot be picked right now; shown, not hidden. */
  readonly disabledReason?: string | null;
}

export function ControlMenu({
  label,
  value,
  valueLabel,
  choices,
  onSelect,
  disabled,
  busy = false,
  note = null,
  icon,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueLabel: string;
  readonly choices: readonly ControlChoice[];
  readonly onSelect: (id: string) => void;
  readonly disabled: boolean;
  /** A change is in flight: hold the trigger, keep the last honest label. */
  readonly busy?: boolean;
  /** Muted line under the heading (e.g. why every choice is disabled). */
  readonly note?: string | null;
  readonly icon: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger
        aria-busy={busy || undefined}
        aria-label={`${label}: ${valueLabel}`}
        className="flex h-7 max-w-40 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground text-xs outline-none transition-colors duration-(--motion-duration-fast) hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64"
        disabled={disabled || busy}
      >
        {icon}
        <span className={cn("truncate", busy && "animate-pulse motion-reduce:animate-none")}>
          {valueLabel}
        </span>
        <ChevronDown aria-hidden="true" className="size-3 shrink-0 opacity-60" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" side="top" sideOffset={8}>
          <Popover.Popup className="min-w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-(--overlay-shadow) outline-none transition-[scale,opacity] duration-(--motion-duration-fast) data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <p className="px-2 pt-1 pb-1.5 font-medium text-muted-foreground text-xs">{label}</p>
            {note !== null && (
              <p className="px-2 pb-1.5 text-muted-foreground text-xs">{note}</p>
            )}
            <ul role="listbox" aria-label={label}>
              {choices.map((choice) => {
                const choiceDisabled = (choice.disabledReason ?? null) !== null;
                return (
                  <li key={choice.id}>
                    <button
                      aria-disabled={choiceDisabled || undefined}
                      aria-selected={choice.id === value}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-(--motion-duration-fast) hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                        choiceDisabled && "cursor-default opacity-64 hover:bg-transparent",
                      )}
                      onClick={() => {
                        if (choiceDisabled) return;
                        onSelect(choice.id);
                        setOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{choice.label}</span>
                        {(choice.disabledReason ?? choice.detail) !== null && (
                          <span className="block text-muted-foreground text-xs">
                            {choice.disabledReason ?? choice.detail}
                          </span>
                        )}
                      </span>
                      {choice.id === value && <Check aria-hidden="true" className="size-3.5 shrink-0 text-accent-text" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  readonly attachments: readonly PromptAttachment[];
  readonly onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul aria-label="Attachments" className="flex flex-wrap gap-1.5 px-3 pt-2.5">
      {attachments.map((attachment) => (
        <li className="flex h-6 items-center gap-1.5 rounded-md border border-input bg-background pr-0.5 pl-1.5 text-xs" key={attachment.id}>
          {attachment.kind === "image" ? <ImageIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" /> : <FileText aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />}
          <span className="max-w-40 truncate">{attachment.name}</span>
          <IconButton aria-label={`Remove ${attachment.name}`} className="size-5 sm:size-5" onClick={() => onRemove(attachment.id)} size="icon-xs">
            <X className="size-3 sm:size-3" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}
