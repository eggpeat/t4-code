// Adapted from T3 Code apps/web/src/components/ui/spinner.tsx (MIT, T3 Tools Inc.).
import { Loader2Icon } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn.ts";

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2Icon>) {
	return (
		<Loader2Icon
			aria-label="Loading"
			className={cn("animate-spin motion-reduce:animate-none", className)}
			role="status"
			{...props}
		/>
	);
}

export { Spinner };
