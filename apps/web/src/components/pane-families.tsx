// The five right-pane families. Fixed taxonomy: Agents, Activity, Review,
// Files, Terminals. Lane C fills these panels; the shell owns the frame and
// honest empty states.
import { Activity, Bot, FolderOpen, GitCompareArrows, SquareTerminal } from "lucide-react";
import type { ComponentType } from "react";

import type { PaneFamily } from "../state/workspace-store.ts";

export interface PaneFamilyMeta {
  readonly id: PaneFamily;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  /** Honest empty-state copy for a session with nothing in this family. */
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

export const PANE_FAMILY_META: readonly PaneFamilyMeta[] = [
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    emptyTitle: "No agents running",
    emptyDescription:
      "When this session hands work to other agents, each one is listed here with its own status.",
  },
  {
    id: "activity",
    label: "Activity",
    icon: Activity,
    emptyTitle: "Nothing recorded yet",
    emptyDescription:
      "Commands and tool runs from this session are listed here in order, newest last. This view is read-only.",
  },
  {
    id: "review",
    label: "Review",
    icon: GitCompareArrows,
    emptyTitle: "Nothing to review",
    emptyDescription:
      "Edits this session makes show up here as diffs you can read before deciding what to keep.",
  },
  {
    id: "files",
    label: "Files",
    icon: FolderOpen,
    emptyTitle: "No files touched",
    emptyDescription:
      "Files this session reads or edits collect here so you can open them without hunting.",
  },
  {
    id: "terminals",
    label: "Terminals",
    icon: SquareTerminal,
    emptyTitle: "No terminals running",
    emptyDescription:
      "Shells this session opens are listed here, read-only. Your own terminal lives in the drawer at the bottom.",
  },
];
