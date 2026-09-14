"use client";

import type { PreparedTextWithSegments } from "@chenglou/pretext";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./rain.css";

const FONT_FAMILY =
	'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
const FONT = `500 ${FONT_SIZE}px ${FONT_FAMILY}`;
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
	};
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

export interface RainViewProps {
	density?: number;
	paused?: boolean;
	onLayout?: (columns: number, lines: number) => void;
	className?: string;
}

export function RainView({
	density = 72,
	paused = false,
	onLayout,
	className = "",
}: RainViewProps) {
	const frameRef = useRef<HTMLDivElement>(null);
	const [columns, setColumns] = useState<RainColumn[]>([]);

	const seeds = useMemo(
		() =>
			Array.from({ length: density }, (_, index) => ({
				index,
				left: Math.round(seeded(index, 41.91) * 10000) / 100,
				delay: Math.round(seeded(index, 29.77) * -9000) / 100,
				duration: Math.round((48 + seeded(index, 51.43) * 42) * 100) / 100,
				opacity: Math.round((0.12 + seeded(index, 13.37) * 0.3) * 100) / 100,
				size: Math.round(12 + seeded(index, 71.13) * 12),
				raw: buildRawColumn(index),
			})),
		[density],
	);

	useEffect(() => {
		const frameEl = frameRef.current;
		if (!frameEl) return;

		let cancelled = false;
		let preparedColumns: Array<PreparedTextWithSegments | undefined> = [];

		async function boot() {
			const { layoutWithLines, prepareWithSegments } = await import(
				"@chenglou/pretext"
			);
			if (cancelled || !frameEl) return;

			preparedColumns = seeds.map((seed) =>
				prepareWithSegments(seed.raw, FONT, {
					whiteSpace: "pre-wrap",
					wordBreak: "keep-all",
				}),
			);

			const relayout = () => {
				if (cancelled || !frameEl) return;
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
				onLayout?.(seeds.length, lineCount);
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
	}, [seeds, onLayout]);

	return (
		<div ref={frameRef} className={`rain ${className}`} data-paused={paused}>
			<div
				className="rain__field"
				style={{ fontFamily: FONT_FAMILY }}
				aria-hidden="true"
			>
				{columns.map((column, index) => (
					<span
						key={`${column.left}-${index.toString(16)}`}
						className="rain__column"
						style={columnStyle(column)}
					>
						{column.stream}
					</span>
				))}
			</div>
			<div className="rain__fade" />
		</div>
	);
}
