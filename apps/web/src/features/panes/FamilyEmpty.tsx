// Honest per-family empty state, reusing the shell's fixed copy so the
// closed-pane promise and the open-pane reality never drift apart.
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@t4-code/ui";

import { PANE_FAMILY_META } from "../../components/pane-families.tsx";
import type { PaneFamily } from "../../state/workspace-store.ts";

export function FamilyEmpty({ family }: { readonly family: PaneFamily }) {
  const meta = PANE_FAMILY_META.find((entry) => entry.id === family);
  if (meta === undefined) return null;
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyTitle className="text-base">{meta.emptyTitle}</EmptyTitle>
        <EmptyDescription>{meta.emptyDescription}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
