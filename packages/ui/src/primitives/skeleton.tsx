// Adapted from T3 Code apps/web/src/components/ui/skeleton.tsx (MIT, T3 Tools
// Inc.). OMP changes: highlight color owned by tokens.css (--skeleton-highlight).
import type * as React from "react";

import { cn } from "../lib/cn.ts";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"animate-skeleton rounded-sm [background:linear-gradient(120deg,transparent_40%,var(--skeleton-highlight),transparent_60%)_var(--color-muted)_0_0/200%_100%_fixed]",
				className,
			)}
			data-slot="skeleton"
			{...props}
		/>
	);
}

export { Skeleton };
