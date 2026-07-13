// Editors for each settings control kind. Every editor is a controlled
// component over a SettingValue; validation happens in the store, so these
// only report what the user typed. Field chassis matches the app's input
// vocabulary: --input stroke on popover, accent focus ring, 64% disabled.
import { Badge, Button, cn, IconButton } from "@t4-code/ui";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import type { SettingValue } from "./schema.ts";
import type { ControlModel } from "./view-model.ts";

export const FIELD_CLASS =
  "h-8 min-w-0 rounded-md border border-input bg-popover px-2 text-base text-foreground outline-none transition-shadow duration-(--motion-duration-fast) placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 sm:text-sm";

interface EditorProps {
  readonly id: string;
  readonly control: ControlModel;
  readonly value: SettingValue | undefined;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: SettingValue) => void;
}

function SwitchEditor({ id, value, disabled, onChange }: EditorProps) {
  const checked = value === true;
  return (
    <button
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-(--motion-duration-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        checked ? "border-primary bg-primary" : "border-input bg-secondary",
        disabled && "pointer-events-none opacity-64",
      )}
      disabled={disabled}
      id={id}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-4 rounded-full shadow-xs transition-transform duration-(--motion-duration-fast)",
          checked
            ? "translate-x-4.5 bg-primary-foreground"
            : "translate-x-0.5 bg-muted-foreground",
        )}
      />
    </button>
  );
}

function EnumEditor({ id, control, value, invalid, disabled, onChange }: EditorProps) {
  if (control.kind !== "enum") return null;
  const current = typeof value === "string" ? value : "";
  const selected = control.options.find((option) => option.value === current);
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <select
        aria-invalid={invalid || undefined}
        className={cn(FIELD_CLASS, "w-full max-w-60", invalid && "border-destructive")}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={current}
      >
        {selected === undefined && <option value={current}>{current || "—"}</option>}
        {control.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.help !== undefined && (
        <p className="max-w-60 text-end text-muted-foreground text-xs">{selected.help}</p>
      )}
    </div>
  );
}

const DURATION_UNIT_LABEL: Record<"ms" | "s" | "m", string> = {
  ms: "ms",
  s: "seconds",
  m: "minutes",
};

function NumberEditor({ id, control, value, invalid, disabled, onChange }: EditorProps) {
  if (control.kind !== "number" && control.kind !== "duration") return null;
  const unit = control.kind === "number" ? control.unit : DURATION_UNIT_LABEL[control.unit];
  const step = control.kind === "number" ? control.step : null;
  return (
    <div className="flex items-center gap-1.5">
      <input
        aria-invalid={invalid || undefined}
        className={cn(FIELD_CLASS, "w-28 text-end tabular-nums", invalid && "border-destructive")}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        max={control.max ?? undefined}
        min={control.min ?? undefined}
        onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
        step={step ?? undefined}
        type="number"
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
      />
      {unit !== null && unit !== undefined && (
        <span className="shrink-0 text-muted-foreground text-xs">{unit}</span>
      )}
    </div>
  );
}

function TextEditor({ id, control, value, invalid, disabled, onChange }: EditorProps) {
  const mono = control.kind === "path";
  const placeholder =
    control.kind === "text" ? (control.placeholder ?? undefined) : undefined;
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(FIELD_CLASS, "w-full max-w-80", mono && "font-mono", invalid && "border-destructive")}
      disabled={disabled}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      type="text"
      value={typeof value === "string" ? value : ""}
    />
  );
}

function ListEditor({ id, control, value, disabled, onChange }: EditorProps) {
  const [pending, setPending] = useState("");
  if (control.kind !== "list") return null;
  const items = Array.isArray(value) ? value : [];
  const itemLabel = control.itemLabel ?? "entry";
  const add = () => {
    const trimmed = pending.trim();
    if (trimmed.length === 0 || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setPending("");
  };
  return (
    <div className="flex w-full max-w-80 flex-col items-stretch gap-1.5">
      {items.length > 0 && (
        <ul className="flex flex-wrap justify-end gap-1">
          {items.map((item) => (
            <li className="flex min-w-0 items-center" key={item}>
              <Badge className="max-w-full gap-0 py-0 pe-0" variant="outline">
                <span className="truncate px-1 font-mono">{item}</span>
                <IconButton
                  aria-label={`Remove ${item}`}
                  className="size-4.5 rounded-[.25rem] sm:size-4"
                  disabled={disabled}
                  onClick={() => onChange(items.filter((entry) => entry !== item))}
                  size="icon-xs"
                >
                  <Minus className="size-3" />
                </IconButton>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <input
          aria-label={`Add ${itemLabel}`}
          className={cn(FIELD_CLASS, "h-7 w-full flex-1 font-mono")}
          disabled={disabled}
          id={id}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={`Add ${itemLabel}`}
          spellCheck={false}
          type="text"
          value={pending}
        />
        <Button disabled={disabled || pending.trim().length === 0} onClick={add} size="xs" variant="outline">
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}

function MapEditor({ id, control, value, disabled, onChange }: EditorProps) {
  if (control.kind !== "map") return null;
  const entries =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.entries(value)
      : [];
  const keyLabel = control.keyLabel ?? "name";
  const valueLabel = control.valueLabel ?? "value";
  const rebuild = (next: readonly (readonly [string, string])[]) => {
    const out: Record<string, string> = {};
    for (const [key, entry] of next) out[key] = entry;
    onChange(out);
  };
  return (
    <div className="flex w-full max-w-96 flex-col items-stretch gap-1.5">
      {entries.map(([key, entry], index) => (
        <div className="flex items-center gap-1.5" key={index}>
          <input
            aria-label={`${keyLabel} ${index + 1}`}
            className={cn(FIELD_CLASS, "h-7 w-2/5 font-mono")}
            disabled={disabled}
            onChange={(event) =>
              rebuild(entries.map((pair, at) => (at === index ? [event.target.value, pair[1]] : pair)))
            }
            placeholder={keyLabel}
            spellCheck={false}
            type="text"
            value={key}
          />
          <input
            aria-label={`${valueLabel} for ${key || `${keyLabel} ${index + 1}`}`}
            className={cn(FIELD_CLASS, "h-7 flex-1 font-mono")}
            disabled={disabled}
            onChange={(event) =>
              rebuild(entries.map((pair, at) => (at === index ? [pair[0], event.target.value] : pair)))
            }
            placeholder={valueLabel}
            spellCheck={false}
            type="text"
            value={entry}
          />
          <IconButton
            aria-label={`Remove ${key || `${keyLabel} ${index + 1}`}`}
            disabled={disabled}
            onClick={() => rebuild(entries.filter((_, at) => at !== index))}
            size="icon-xs"
          >
            <Minus />
          </IconButton>
        </div>
      ))}
      <div className="flex justify-end">
        <Button
          disabled={disabled}
          id={entries.length === 0 ? id : undefined}
          onClick={() => rebuild([...entries, ["", ""]])}
          size="xs"
          variant="outline"
        >
          <Plus />
          Add {keyLabel}
        </Button>
      </div>
    </div>
  );
}

function UnsupportedNotice({ control }: { readonly control: ControlModel }) {
  if (control.kind !== "unsupported") return null;
  return (
    <div className="flex max-w-80 flex-col items-end gap-1">
      <Badge variant="outline">
        <span className="font-mono text-xs">{control.declaredKind}</span>
      </Badge>
      <p className="text-end text-muted-foreground text-xs">{control.reason}</p>
    </div>
  );
}

/** Route a row's control model to its editor. Secret rows never come here. */
export function SettingEditor(props: EditorProps) {
  switch (props.control.kind) {
    case "boolean":
      return <SwitchEditor {...props} />;
    case "enum":
      return <EnumEditor {...props} />;
    case "number":
    case "duration":
      return <NumberEditor {...props} />;
    case "text":
    case "path":
      return <TextEditor {...props} />;
    case "list":
      return <ListEditor {...props} />;
    case "map":
      return <MapEditor {...props} />;
    case "unsupported":
      return <UnsupportedNotice control={props.control} />;
    case "secret":
    case "nested":
      return null;
  }
}
