"use client";

import type { PreparedTextWithSegments } from "@chenglou/pretext";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const FONT_FAMILY =
	'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
const FONT = `700 ${FONT_SIZE}px ${FONT_FAMILY}`;
const GLYPHS =
	"01アイウエオカキクケコサシスセソタチツテトナニヌネノマミムメモABCDEFGHIJKLMNOPQRSTUVWXYZ";

type RainColumn = {
	left: number;
	delay: number;
	duration: number;
	opacity: number;
	size: number;
	stream: string;
};

function seeded(index: number, salt: number) {
	const value = Math.sin(index * salt) * 10000;
	return value - Math.floor(value);
}

function pickGlyph(seed: number) {
	return GLYPHS[Math.floor(seed * GLYPHS.length)] ?? "0";
}

function columnStyle(column: RainColumn): CSSProperties {
	return {
		left: `${column.left}%`,
		animationDelay: `${column.delay}s`,
		animationDuration: `${column.duration}s`,
		opacity: column.opacity,
		fontSize: `${column.size}px`,
		lineHeight: `${column.size + 5}px`,
	} as CSSProperties;
}

function buildRawColumn(index: number) {
	const length = 22 + Math.floor(seeded(index, 17.53) * 38);
	let text = "";

	for (let i = 0; i < length; i++) {
		text += pickGlyph(seeded(index * 31 + i, 23.71));
		if (i < length - 1) text += "\n";
	}

	return text;
}

export default function MatrixRain() {
	const frameRef = useRef<HTMLDivElement>(null);
	const [columns, setColumns] = useState<RainColumn[]>([]);
	const [density, setDensity] = useState(72);
	const [paused, setPaused] = useState(false);

	const seeds = useMemo(
		() =>
			Array.from({ length: density }, (_, index) => ({
				index,
				left: Math.round(seeded(index, 41.91) * 10000) / 100,
				delay: Math.round(seeded(index, 29.77) * -1300) / 100,
				duration: Math.round((5.5 + seeded(index, 51.43) * 8) * 100) / 100,
				opacity: Math.round((0.18 + seeded(index, 13.37) * 0.62) * 100) / 100,
				size: Math.round(12 + seeded(index, 71.13) * 12),
				raw: buildRawColumn(index),
			})),
		[density],
	);

	useEffect(() => {
		const frame = frameRef.current;
		if (!frame) return;
		const frameEl = frame;

		let cancelled = false;
		let preparedColumns: Array<PreparedTextWithSegments | undefined> = [];

		async function boot() {
			const { layoutWithLines, prepareWithSegments } = await import(
				"@chenglou/pretext"
			);
			if (cancelled) return;

			preparedColumns = seeds.map((seed) =>
				prepareWithSegments(seed.raw, FONT, {
					whiteSpace: "pre-wrap",
					wordBreak: "keep-all",
				}),
			);

			const relayout = () => {
				if (cancelled) return;

				const height = frameEl.getBoundingClientRect().height;
				const lineCount = Math.max(22, Math.ceil(height / LINE_HEIGHT) + 12);

				setColumns(
					seeds.map((seed, index) => {
						const prepared = preparedColumns[index];
						const stream = prepared
							? layoutWithLines(prepared, 24, LINE_HEIGHT)
									.lines.map((line) => line.text || " ")
									.slice(0, lineCount)
									.join("\n")
							: seed.raw;

						return {
							left: seed.left,
							delay: seed.delay,
							duration: seed.duration,
							opacity: seed.opacity,
							size: seed.size,
							stream,
						};
					}),
				);
			};

			relayout();
			const observer = new ResizeObserver(relayout);
			observer.observe(frameEl);

			return () => observer.disconnect();
		}

		let cleanup: (() => void) | undefined;
		void boot().then((destroy) => {
			cleanup = destroy;
		});

		return () => {
			cancelled = true;
			cleanup?.();
		};
	}, [seeds]);

	return (
		<div className="overflow-hidden border border-green-400/20 bg-black shadow-[0_0_80px_rgba(34,197,94,0.16)]">
			<style>{`
				@keyframes matrix-rain-fall {
					0% { transform: translate3d(0, -118%, 0); }
					100% { transform: translate3d(0, 96%, 0); }
				}

				@keyframes matrix-head-glow {
					0%, 100% { opacity: 0.4; }
					50% { opacity: 1; }
				}

				@keyframes scan-roll {
					0% { transform: translateY(0); }
					100% { transform: translateY(8px); }
				}
			`}</style>

			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-green-400/20 bg-neutral-950 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
				<span className="text-green-300">pretext.rain</span>
				<div className="flex items-center gap-3">
					<label className="flex items-center gap-2">
						<span>density</span>
						<input
							className="w-28 accent-green-300"
							type="range"
							min="30"
							max="126"
							step="6"
							value={density}
							onChange={(event) => setDensity(Number(event.target.value))}
						/>
					</label>
					<button
						className="border border-neutral-700 px-3 py-1 text-neutral-200 transition-colors hover:border-green-300 hover:text-green-300"
						type="button"
						onClick={() => setPaused((value) => !value)}
					>
						{paused ? "Resume" : "Pause"}
					</button>
				</div>
			</div>

			<section
				ref={frameRef}
				className="relative h-[70vh] min-h-120 overflow-hidden bg-black"
				aria-label="Matrix-inspired falling code generated with Pretext layout"
			>
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,197,94,0.16),transparent_34%),linear-gradient(180deg,#000,rgba(3,18,8,0.86)_52%,#000)]" />

				<div
					className="absolute inset-0 overflow-hidden font-mono font-bold text-green-300"
					style={{ fontFamily: FONT_FAMILY }}
					aria-hidden="true"
				>
					{columns.map((column, index) => (
						<span
							key={`${column.left}-${index.toString(16)}`}
							className="absolute top-0 block whitespace-pre [animation-name:matrix-rain-fall] [animation-timing-function:linear] [animation-iteration-count:infinite] [text-shadow:0_0_10px_rgba(34,197,94,0.82)]"
							style={{
								...columnStyle(column),
								animationPlayState: paused ? "paused" : "running",
							}}
						>
							{column.stream}
						</span>
					))}
				</div>

				<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96),transparent_18%,transparent_82%,rgba(0,0,0,0.96)),linear-gradient(180deg,rgba(0,0,0,0.92),transparent_18%,transparent_74%,rgba(0,0,0,0.94))]" />
				<div className="pointer-events-none absolute inset-0 opacity-20 [animation:scan-roll_0.8s_linear_infinite] [background-image:linear-gradient(rgba(134,239,172,0.65)_1px,transparent_1px)] [background-size:100%_8px]" />
			</section>
		</div>
	);
}
