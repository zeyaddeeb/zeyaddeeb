export function fitCanvas(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	maxDpr = 2,
) {
	const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
	canvas.width = Math.floor(width * dpr);
	canvas.height = Math.floor(height * dpr);
	return dpr;
}
