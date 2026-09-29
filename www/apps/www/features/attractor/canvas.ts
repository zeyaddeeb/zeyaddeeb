import { fitCanvas } from "@/lib/canvas";

export interface Palette {
	paper: string;
	red: string;
	blue: string;
	yellow: string;
	dark: string;
}

export function palette(el: Element): Palette {
	const css = getComputedStyle(el);
	const read = (name: string, fallback: string) =>
		css.getPropertyValue(name).trim() || fallback;
	return {
		paper: read("--paper", "#f9f8f2"),
		red: read("--red", "#e83025"),
		blue: read("--blue", "#0089c8"),
		yellow: read("--yellow", "#ffbc00"),
		dark: read("--charcoal-3", "#282826"),
	};
}

export interface Surface {
	ctx: CanvasRenderingContext2D;
	w: number;
	h: number;
	dpr: number;
}

export function observe(
	canvas: HTMLCanvasElement,
	onResize: (surface: Surface) => void,
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return () => {};
	const ro = new ResizeObserver(([entry]) => {
		if (!entry) return;
		const w = entry.contentRect.width;
		const h = entry.contentRect.height;
		if (!w || !h) return;
		const dpr = fitCanvas(canvas, w, h);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		onResize({ ctx, w, h, dpr });
	});
	ro.observe(canvas);
	return () => ro.disconnect();
}
