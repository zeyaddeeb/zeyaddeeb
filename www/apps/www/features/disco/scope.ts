import { tones } from "./film";
import type { Floor } from "./floor";

const PACE = 34;
const AHEAD = 8;
export const LANES = 4;

interface Size {
	width: number;
	height: number;
}

const paper = (alpha: number) => `rgb(245 242 233 / ${alpha})`;

function ticks(
	ctx: CanvasRenderingContext2D,
	times: number[],
	now: number,
	edge: number,
	top: number,
	tall: number,
	thick: number,
) {
	for (const time of times) {
		const x = edge + (time - now) * PACE;

		if (x < -thick) continue;

		ctx.fillRect(Math.round(x - thick / 2), top, thick, tall);
	}
}

export function trace(
	ctx: CanvasRenderingContext2D,
	floor: Floor,
	now: number,
	size: Size,
) {
	const tall = size.height / LANES;
	const edge = size.width - AHEAD;

	ctx.clearRect(0, 0, size.width, size.height);
	ctx.fillStyle = paper(0.14);

	for (let i = 1; i < LANES; i++)
		ctx.fillRect(0, Math.round(tall * i), size.width, 1);

	ctx.fillStyle = paper(0.14);
	ticks(ctx, floor.bars, now, edge, 0, size.height, 1);
	ctx.fillStyle = paper(0.45);
	ticks(ctx, floor.music, now, edge, tall * 0.34, tall * 0.32, 1);
	ctx.fillStyle = paper(1);
	ticks(ctx, floor.bars, now, edge, 6, tall - 12, 2);

	floor.dancers.forEach((dancer, i) => {
		ctx.fillStyle = tones[dancer.id];
		ticks(ctx, dancer.marks, now, edge, tall * (i + 1) + 4, tall - 8, 5);
	});

	ctx.fillStyle = paper(0.7);
	ctx.fillRect(Math.round(edge), 0, 1, size.height);
}

export function bars(
	ctx: CanvasRenderingContext2D,
	analyser: AnalyserNode | null,
	levels: Uint8Array<ArrayBuffer>,
	{ width, height }: Size,
) {
	const count = 20;
	const wide = width / count;

	ctx.clearRect(0, 0, width, height);
	analyser?.getByteFrequencyData(levels);

	for (let i = 0; i < count; i++) {
		const from = Math.floor(2 ** (i * 0.36));
		const level = analyser
			? levels[Math.min(levels.length - 1, from)] / 255
			: 0;
		const tall = Math.max(2, Math.round(level * (height - 4)));

		ctx.fillStyle = level > 0.72 ? "rgb(255 188 0)" : "rgb(120 200 255)";
		ctx.fillRect(
			Math.round(i * wide) + 1,
			height - tall,
			Math.max(1, Math.round(wide) - 2),
			tall,
		);
	}
}
