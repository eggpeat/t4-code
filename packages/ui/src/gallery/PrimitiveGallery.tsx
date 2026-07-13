// Renders every design-system primitive and state in both themes, plus
// forced-reduced-motion and narrow variants. Consumed by the fixture app and
// visual QA; contains no network or mock server state.
import { type ReactNode, useState } from "react";

import { BrandLockup } from "../brand/BrandLockup.tsx";
import { OmpMark } from "../brand/OmpMark.tsx";
import { useResizableWidth } from "../layout/useResizableWidth.ts";
import { cn } from "../lib/cn.ts";
import { type SessionStatus, STATUS_PILLS } from "../lib/status.ts";
import { AnimatedHeight } from "../motion/AnimatedHeight.tsx";
import { Badge } from "../primitives/badge.tsx";
import { Button } from "../primitives/button.tsx";
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogTitle,
	DialogTrigger,
} from "../primitives/dialog.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "../primitives/empty.tsx";
import { IconButton } from "../primitives/icon-button.tsx";
import { ScrollArea } from "../primitives/scroll-area.tsx";
import {
	Sheet,
	SheetDescription,
	SheetHeader,
	SheetPopup,
	SheetTitle,
	SheetTrigger,
} from "../primitives/sheet.tsx";
import { Skeleton } from "../primitives/skeleton.tsx";
import { Spinner } from "../primitives/spinner.tsx";
import { StatusPill } from "../primitives/status-pill.tsx";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../primitives/tooltip.tsx";
import { SearchIcon, SettingsIcon, XIcon } from "lucide-react";

const BUTTON_VARIANTS = [
	"default",
	"secondary",
	"outline",
	"ghost",
	"link",
	"destructive",
	"destructive-outline",
] as const;

const BADGE_VARIANTS = [
	"default",
	"secondary",
	"outline",
	"info",
	"success",
	"warning",
	"error",
	"destructive",
] as const;

const STATUSES = Object.keys(STATUS_PILLS) as readonly SessionStatus[];

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
			<div className="flex flex-wrap items-center gap-3">{children}</div>
		</section>
	);
}

function GalleryContent({ idPrefix }: { idPrefix: string }) {
	const [expanded, setExpanded] = useState(false);
	const { width, handlers } = useResizableWidth({
		storageKey: `omp:gallery:${idPrefix}:panel-width:v1`,
		defaultWidth: 224,
		minWidth: 160,
		maxWidth: 320,
		edge: "right",
	});

	return (
		<TooltipProvider>
			<div className="flex flex-col gap-8">
				<Section title="Brand mark">
					<OmpMark className="h-9 w-12" />
					<OmpMark className="h-6 w-8" title={null} />
					<BrandLockup />
					<BrandLockup byline size="lg" />
				</Section>

				<Section title="Buttons">
					{BUTTON_VARIANTS.map((variant) => (
						<Button key={variant} variant={variant}>
							{variant}
						</Button>
					))}
					<Button disabled>Disabled</Button>
					<Button variant="outline">
						<Spinner />
						Loading
					</Button>
					<Button size="sm" variant="secondary">
						Small
					</Button>
					<Button size="xs" variant="outline">
						Tiny
					</Button>
				</Section>

				<Section title="Icon buttons">
					<IconButton aria-label="Settings">
						<SettingsIcon />
					</IconButton>
					<IconButton aria-label="Search" size="icon-sm" variant="outline">
						<SearchIcon />
					</IconButton>
					<IconButton aria-label="Close" disabled size="icon-xs">
						<XIcon />
					</IconButton>
				</Section>

				<Section title="Badges">
					{BADGE_VARIANTS.map((variant) => (
						<Badge key={variant} variant={variant}>
							{variant}
						</Badge>
					))}
				</Section>

				<Section title="Status pills">
					{STATUSES.map((status) => (
						<StatusPill key={status} status={status} />
					))}
					<StatusPill labelHidden status="working" />
				</Section>

				<Section title="Tooltip">
					<Tooltip>
						<TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
						<TooltipPopup>Session actions</TooltipPopup>
					</Tooltip>
				</Section>

				<Section title="Dialog and sheet">
					<Dialog>
						<DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
						<DialogPopup>
							<DialogHeader>
								<DialogTitle>Rename session</DialogTitle>
								<DialogDescription>Give this session a clearer name.</DialogDescription>
							</DialogHeader>
							<DialogPanel>Dialog body content.</DialogPanel>
							<DialogFooter>
								<Button variant="outline">Cancel</Button>
								<Button>Save</Button>
							</DialogFooter>
						</DialogPopup>
					</Dialog>
					<Sheet>
						<SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
						<SheetPopup>
							<SheetHeader>
								<SheetTitle>Details</SheetTitle>
								<SheetDescription>Right-anchored overlay panel.</SheetDescription>
							</SheetHeader>
						</SheetPopup>
					</Sheet>
				</Section>

				<Section title="Scroll area">
					<div className="h-28 w-64 rounded-lg border">
						<ScrollArea scrollFade>
							<div className="flex flex-col gap-1 p-3 text-sm">
								{Array.from({ length: 24 }, (_, index) => (
									<span key={index}>Row {index + 1}</span>
								))}
							</div>
						</ScrollArea>
					</div>
				</Section>

				<Section title="Skeleton">
					<div className="flex w-56 flex-col gap-2">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</Section>

				<Section title="Empty state">
					<div className="w-full rounded-lg border">
						<Empty className="p-6 md:p-6">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<SearchIcon />
								</EmptyMedia>
								<EmptyTitle>No sessions yet</EmptyTitle>
								<EmptyDescription>Start a session to see it here.</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				</Section>

				<Section title="Animated height">
					<div className="w-64 rounded-lg border p-3">
						<Button onClick={() => setExpanded((value) => !value)} size="sm" variant="outline">
							{expanded ? "Collapse" : "Expand"}
						</Button>
						<AnimatedHeight>
							<div className="pt-2 text-muted-foreground text-sm">
								{expanded
									? "Expanded content with several lines of detail that change the measured height of this container."
									: "Collapsed."}
							</div>
						</AnimatedHeight>
					</div>
				</Section>

				<Section title="Resizable panel">
					<div className="flex h-24 rounded-lg border" style={{ width: width + 12 }}>
						<div className="flex-1 p-3 text-muted-foreground text-sm">{Math.round(width)}px</div>
						<div
							aria-label="Resize panel"
							aria-orientation="vertical"
							className="w-2 shrink-0 cursor-col-resize rounded-r-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
							role="separator"
							tabIndex={0}
							{...handlers}
						/>
					</div>
				</Section>
			</div>
		</TooltipProvider>
	);
}

function GalleryTheme({ theme }: { theme: "light" | "dark" }) {
	return (
		<div
			className={cn(theme === "dark" && "dark", "bg-background p-6 text-foreground")}
			data-theme={theme}
		>
			<h2 className="mb-6 font-heading font-semibold text-lg capitalize">{theme}</h2>
			<GalleryContent idPrefix={theme} />

			<h2 className="mt-10 mb-4 font-heading font-semibold text-lg">Reduced motion</h2>
			<div className="force-reduced-motion flex flex-wrap items-center gap-3" data-variant="reduced-motion">
				{STATUSES.map((status) => (
					<StatusPill key={status} status={status} />
				))}
				<Skeleton className="h-4 w-32" />
				<Spinner className="text-muted-foreground" />
			</div>

			<h2 className="mt-10 mb-4 font-heading font-semibold text-lg">Narrow</h2>
			<div className="flex w-80 flex-col gap-3 rounded-lg border p-3" data-variant="narrow">
				<div className="flex flex-wrap gap-2">
					<Button size="sm">Primary</Button>
					<Button size="sm" variant="outline">
						Outline
					</Button>
					<Badge variant="info">info</Badge>
				</div>
				<StatusPill status="pendingApproval" />
				<Skeleton className="h-4 w-full" />
			</div>
		</div>
	);
}

/**
 * Every primitive and state, light and dark, plus reduced-motion and narrow
 * variants. Fixture-app entry for visual QA screenshots.
 */
export function PrimitiveGallery() {
	return (
		<div className="grid min-h-full grid-cols-1 xl:grid-cols-2" data-slot="primitive-gallery">
			<GalleryTheme theme="light" />
			<GalleryTheme theme="dark" />
		</div>
	);
}

export { BUTTON_VARIANTS as GALLERY_BUTTON_VARIANTS, BADGE_VARIANTS as GALLERY_BADGE_VARIANTS };
