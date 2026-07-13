// Geometry from oh-my-pi assets/icon.svg (preserved 1:1 at
// src/assets/omp-mark.svg). This inline variant themes the pi glyph via
// currentColor so the mark works on light and dark surfaces; the connector
// stays Pi Pink (--brand) in both — the mark never follows the user's
// accent preference.
import type * as React from "react";

import { cn } from "../lib/cn.ts";

interface OmpMarkProps extends React.ComponentProps<"svg"> {
	/** Accessible name. Pass null for decorative uses (adjacent text label). */
	readonly title?: string | null;
}

function OmpMark({ className, title = "Oh My Pi", ...props }: OmpMarkProps) {
	return (
		<svg
			aria-hidden={title === null ? true : undefined}
			className={cn("text-foreground", className)}
			role={title === null ? undefined : "img"}
			viewBox="0 0 120 90"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			{title !== null && <title>{title}</title>}
			{/* Pi symbol */}
			<rect fill="currentColor" height="12" rx="2" width="100" x="10" y="8" />
			<rect fill="currentColor" height="62" rx="2" width="12" x="25" y="20" />
			<rect fill="currentColor" height="45" rx="2" width="12" x="75" y="20" />
			{/* Plugin connector */}
			<rect className="fill-brand" height="16" rx="3" width="20" x="71" y="55" />
			<rect className="fill-mark-pin" height="8" rx="1" width="3" x="76" y="59" />
			<rect className="fill-mark-pin" height="8" rx="1" width="3" x="82" y="59" />
			{/* Decorative dots */}
			<circle className="fill-brand" cx="18" cy="14" opacity="0.8" r="2" />
			<circle className="fill-brand" cx="102" cy="14" opacity="0.8" r="2" />
		</svg>
	);
}

export { OmpMark, type OmpMarkProps };
