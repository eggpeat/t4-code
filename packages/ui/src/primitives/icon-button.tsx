import { Button, type ButtonProps } from "./button.tsx";

type IconButtonSize = "icon-xs" | "icon-sm" | "icon" | "icon-lg" | "icon-xl";

interface IconButtonProps extends Omit<ButtonProps, "size"> {
	/** Icon-only controls carry no visible text; a label is mandatory. */
	readonly "aria-label": string;
	readonly size?: IconButtonSize;
}

/**
 * Icon-only button: same chassis as Button, restricted to the square sizes
 * and with a compile-time-required accessible name.
 */
function IconButton({ size = "icon", variant = "ghost", ...props }: IconButtonProps) {
	return <Button data-slot="icon-button" size={size} variant={variant} {...props} />;
}

export { IconButton, type IconButtonProps, type IconButtonSize };
