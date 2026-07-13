import type * as React from "react";

import { cn } from "../lib/cn.ts";
import { type SessionStatus, STATUS_PILLS } from "../lib/status.ts";

interface StatusPillProps extends React.ComponentProps<"span"> {
	readonly status: SessionStatus;
	/** Hide the text label (icon-strip rail rows); the label stays in ARIA. */
	readonly labelHidden?: boolean;
}

/**
 * Session status indicator: colored dot plus text label. Never color-only —
 * when `labelHidden`, the label remains as the element's aria-label. Pulse
 * animation degrades statically under reduced motion.
 */
function StatusPill({ status, labelHidden = false, className, ...props }: StatusPillProps) {
	const pill = STATUS_PILLS[status];
	return (
		<span
			aria-label={labelHidden ? pill.label : undefined}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 font-medium text-xs",
				pill.colorClass,
				className,
			)}
			data-slot="status-pill"
			data-status={status}
			{...props}
		>
			<span aria-hidden="true" className="relative flex size-1.5">
				{pill.pulse && (
					<span
						className={cn(
							"absolute inline-flex size-full animate-ping rounded-full opacity-75 motion-reduce:hidden",
							pill.dotClass,
						)}
					/>
				)}
				<span className={cn("relative inline-flex size-1.5 rounded-full", pill.dotClass)} />
			</span>
			{!labelHidden && pill.label}
		</span>
	);
}

export { StatusPill, type StatusPillProps };
