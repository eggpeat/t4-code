// Server-render smoke: the gallery must render every primitive in both
// themes without a browser harness.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PrimitiveGallery } from "../src/gallery/PrimitiveGallery.tsx";
import { STATUS_PILLS } from "../src/lib/status.ts";

describe("PrimitiveGallery", () => {
	const markup = renderToStaticMarkup(<PrimitiveGallery />);

	it("renders light and dark theme sections", () => {
		expect(markup).toContain('data-theme="light"');
		expect(markup).toContain('data-theme="dark"');
	});

	it("renders reduced-motion and narrow variants", () => {
		expect(markup).toContain('data-variant="reduced-motion"');
		expect(markup).toContain("force-reduced-motion");
		expect(markup).toContain('data-variant="narrow"');
	});

	it("renders every primitive slot", () => {
		for (const slot of [
			"button",
			"icon-button",
			"badge",
			"status-pill",
			"tooltip-trigger",
			"dialog-trigger",
			"sheet-trigger",
			"scroll-area-viewport",
			"skeleton",
			"empty",
			"animated-height",
		]) {
			expect(markup, `data-slot="${slot}" present`).toContain(`data-slot="${slot}"`);
		}
	});

	it("renders every status pill with its text label", () => {
		for (const pill of Object.values(STATUS_PILLS)) {
			expect(markup).toContain(pill.label);
		}
	});

	it("labels icon-only controls", () => {
		expect(markup).toContain('aria-label="Settings"');
		expect(markup).toContain('aria-label="Resize panel"');
	});
});
