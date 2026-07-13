// Adapted from T3 Code apps/web/src/lib/utils.ts (MIT, T3 Tools Inc.).
import { type CxOptions, cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: CxOptions): string {
	return twMerge(cx(inputs));
}
