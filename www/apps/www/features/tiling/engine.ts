"use client";

import type { HyperbolicTiling } from "@zeyaddeeb/wasm";
import { useEffect, useRef } from "react";
import { useWasm } from "@/lib/hooks/use-wasm";

export interface Theme {
	disk: string;
	rim: string;
	stroke: string;
	background: (layer: number, parity: number) => string;
	motif: (layer: number, parity: number) => string;
}

export const THEMES = {
	heavenHell: {
		disk: "#0e0c0a",
		rim: "#c9a227",
		stroke: "rgba(201, 162, 39, 0.3)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#f2ecdd" : "#12100d",
		motif: (_layer: number, parity: number) =>
			parity === 0 ? "#12100d" : "#f2ecdd",
	},
	coral: {
		disk: "#081826",
		rim: "#38bdf8",
		stroke: "rgba(226, 232, 240, 0.12)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#0a2138" : "#081826",
		motif: (layer: number, parity: number) => {
			const dim = ["#0f766e", "#b45309", "#b91c1c", "#0369a1"];
			const lit = ["#2dd4bf", "#fbbf24", "#f87171", "#38bdf8"];
			return (parity === 0 ? lit : dim)[layer % 4];
		},
	},
	twilight: {
		disk: "#0a0614",
		rim: "#a78bfa",
		stroke: "rgba(233, 213, 255, 0.1)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#140a26" : "#0a0614",
		motif: (layer: number, parity: number) => {
			const hue = 292 - Math.min(layer, 16) * 8;
			return `hsl(${hue}, 72%, ${parity === 0 ? 64 : 44}%)`;
		},
	},
	woodcut: {
		disk: "#e9e1ca",
		rim: "#211c17",
		stroke: "rgba(33, 28, 23, 0.45)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#e9e1ca" : "#dbd0b0",
		motif: (_layer: number, parity: number) =>
			parity === 0 ? "#26201a" : "#41342a",
	},
	ember: {
		disk: "#0e0a08",
		rim: "#f59e0b",
		stroke: "rgba(0, 0, 0, 0.35)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#1a1109" : "#0e0a08",
		motif: (layer: number, parity: number) => {
			const hue = Math.max(6, 48 - layer * 4);
			return `hsl(${hue}, 92%, ${parity === 0 ? 58 : 40}%)`;
		},
	},
	ink: {
		disk: "#050505",
		rim: "#d4d4d4",
		stroke: "rgba(255, 255, 255, 0.08)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#101010" : "#050505",
		motif: (layer: number, parity: number) =>
			`hsl(0, 0%, ${parity === 0 ? 92 : Math.max(38, 68 - layer * 3)}%)`,
	},
	paper: {
		disk: "#161615",
		rim: "#e2a33a",
		stroke: "rgba(243, 239, 229, 0.12)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#1e1e1c" : "#161615",
		motif: (layer: number, parity: number) =>
			parity === 0
				? "#f3efe5"
				: `rgba(243, 239, 229, ${Math.max(0.28, 0.7 - layer * 0.04)})`,
	},
	vermilion: {
		disk: "#b9442e",
		rim: "#b9442e",
		stroke: "rgba(22, 22, 21, 0.22)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#c24b34" : "#b9442e",
		motif: (layer: number, parity: number) =>
			parity === 0
				? "#f5f2e9"
				: `rgba(22, 22, 21, ${Math.max(0.35, 0.8 - layer * 0.05)})`,
	},
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

export interface Variant {
	id: string;
	plate: string;
	title: string;
	p: number;
	q: number;
	theme: ThemeName;
	blurb: string;
}

export const VARIANTS: Variant[] = [
	{
		id: "heaven",
		plate: "I",
		title: "Heaven & Hell",
		p: 7,
		q: 3,
		theme: "heavenHell",
		blurb:
			"Three seven-sided tiles meet at each corner. Reflections alternate between light and dark.",
	},
	{
		id: "reef",
		plate: "II",
		title: "Coral Reef",
		p: 3,
		q: 7,
		theme: "coral",
		blurb:
			"Seven triangles meet at each vertex, with four colors repeating across the pattern.",
	},
	{
		id: "twilight",
		plate: "III",
		title: "Twilight",
		p: 5,
		q: 4,
		theme: "twilight",
		blurb:
			"Four pentagons meet at each vertex. The purple palette darkens toward the edge.",
	},
	{
		id: "woodcut",
		plate: "IV",
		title: "Woodcut",
		p: 6,
		q: 4,
		theme: "woodcut",
		blurb:
			"A six-sided tiling in brown and cream, built by reflecting a single tile.",
	},
	{
		id: "ember",
		plate: "V",
		title: "Ember",
		p: 8,
		q: 3,
		theme: "ember",
		blurb:
			"Three octagons meet at each vertex. Each ring shifts from yellow toward red.",
	},
	{
		id: "ink",
		plate: "VI",
		title: "Ink",
		p: 4,
		q: 5,
		theme: "ink",
		blurb: "Five squares meet at each vertex in this black-and-white tiling.",
	},
];

export const HOME_VARIANT: Variant = {
	id: "home",
	plate: "0",
	title: "Home plate",
	p: 7,
	q: 3,
	theme: "paper",
	blurb: "",
};

export interface Mobius {
	ar: number;
	ai: number;
	br: number;
	bi: number;
}

const identity = (): Mobius => ({ ar: 1, ai: 0, br: 0, bi: 0 });

function normalize(m: Mobius): Mobius {
	const n2 = m.ar * m.ar + m.ai * m.ai - m.br * m.br - m.bi * m.bi;
	if (n2 < 1e-9) return identity();
	const n = Math.sqrt(n2);
	return { ar: m.ar / n, ai: m.ai / n, br: m.br / n, bi: m.bi / n };
}

function compose(m1: Mobius, m2: Mobius): Mobius {
	return normalize({
		ar: m1.ar * m2.ar - m1.ai * m2.ai + m1.br * m2.br + m1.bi * m2.bi,
		ai: m1.ar * m2.ai + m1.ai * m2.ar + m1.bi * m2.br - m1.br * m2.bi,
		br: m1.ar * m2.br - m1.ai * m2.bi + m1.br * m2.ar + m1.bi * m2.ai,
		bi: m1.ar * m2.bi + m1.ai * m2.br + m1.bi * m2.ar - m1.br * m2.ai,
	});
}

function translation(tr: number, ti: number): Mobius {
	return normalize({ ar: 1, ai: 0, br: tr, bi: ti });
}

function rotation(theta: number): Mobius {
	return { ar: Math.cos(theta / 2), ai: Math.sin(theta / 2), br: 0, bi: 0 };
}

export interface TileColors {
	background: string[];
	motif: string[];
}

export function buildColors(meta: Uint32Array, theme: Theme): TileColors {
	const n = meta.length / 2;
	const background = new Array<string>(n);
	const motif = new Array<string>(n);
	for (let i = 0; i < n; i++) {
		background[i] = theme.background(meta[i * 2], meta[i * 2 + 1]);
		motif[i] = theme.motif(meta[i * 2], meta[i * 2 + 1]);
	}
	return { background, motif };
}

const GLIDE_AMPLITUDE = 0.13;

export interface Layout {
	stride: number;
	boundary: number;
	bladePts: number;
	sides: number;
	count: number;
}

export interface Clock {
	theta: number;
	phase: number;
}

export function glide(clock: Clock): Mobius {
	return compose(
		rotation(clock.theta),
		translation(
			GLIDE_AMPLITUDE * Math.cos(clock.phase),
			GLIDE_AMPLITUDE * Math.sin(clock.phase * 0.73 + 1.4),
		),
	);
}

export function drawTiling(
	ctx: CanvasRenderingContext2D,
	size: number,
	weight: number,
	layout: Layout,
	colors: TileColors,
	theme: Theme,
	verts: Float64Array,
	rimGlow: boolean,
	time = 0,
	zoom = 1,
) {
	const c = size / 2;
	const radius = c - 6 * weight;
	const rz = radius * zoom;

	ctx.clearRect(0, 0, size, size);

	ctx.save();
	ctx.beginPath();
	ctx.arc(c, c, radius, 0, Math.PI * 2);
	ctx.clip();
	ctx.fillStyle = theme.disk;
	ctx.fillRect(0, 0, size, size);

	const { stride, boundary, bladePts, sides, count } = layout;
	const half = (boundary >> 1) * 2;
	ctx.strokeStyle = theme.stroke;
	ctx.lineWidth = Math.max(0.5, 0.6 * weight);
	const cull = 1.4 * weight;
	const motifCull = 7 * weight;

	for (let ti = 0; ti < count; ti++) {
		const o = ti * stride * 2;
		const x0 = c + verts[o] * rz;
		const y0 = c - verts[o + 1] * rz;
		const xm = c + verts[o + half] * rz;
		const ym = c - verts[o + half + 1] * rz;
		const extent = Math.abs(x0 - xm) + Math.abs(y0 - ym);
		if (extent < cull) continue;

		ctx.beginPath();
		ctx.moveTo(x0, y0);
		for (let j = 1; j < boundary; j++) {
			ctx.lineTo(c + verts[o + j * 2] * rz, c - verts[o + j * 2 + 1] * rz);
		}
		ctx.closePath();
		ctx.fillStyle = colors.background[ti];
		ctx.fill();
		ctx.stroke();

		if (extent < motifCull) continue;

		ctx.fillStyle = colors.motif[ti];
		for (let b = 0; b < sides; b++) {
			const bo = o + (boundary + b * bladePts) * 2;
			ctx.beginPath();
			ctx.moveTo(c + verts[bo] * rz, c - verts[bo + 1] * rz);
			for (let j = 1; j < bladePts; j++) {
				ctx.lineTo(c + verts[bo + j * 2] * rz, c - verts[bo + j * 2 + 1] * rz);
			}
			ctx.closePath();
			ctx.fill();
		}
	}

	const vignette = ctx.createRadialGradient(c, c, radius * 0.55, c, c, radius);
	vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
	vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, size, size);
	ctx.restore();

	ctx.save();
	ctx.beginPath();
	ctx.arc(c, c, radius, 0, Math.PI * 2);
	ctx.strokeStyle = theme.rim;
	ctx.lineWidth = 1.2 * weight;
	if (rimGlow) {
		const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
		ctx.shadowColor = theme.rim;
		ctx.shadowBlur = (11 + pulse * 11) * weight;
	}
	ctx.stroke();
	ctx.restore();
}

export interface TilingHandles {
	tiling: HyperbolicTiling | null;
	layout: Layout;
	colors: TileColors;
	theme: Theme;
}

export function useTiling(
	variant: Variant,
	maxTiles: number,
	minSize: number,
	onBuilt?: (id: string, tileCount: number) => void,
) {
	const { wasm } = useWasm();
	const handlesRef = useRef<TilingHandles>({
		tiling: null,
		layout: { stride: 0, boundary: 0, bladePts: 0, sides: 0, count: 0 },
		colors: { background: [], motif: [] },
		theme: THEMES[variant.theme],
	});

	useEffect(() => {
		if (!wasm) return;

		try {
			const tiling = wasm.HyperbolicTiling.new(
				variant.p,
				variant.q,
				maxTiles,
				minSize,
			);
			handlesRef.current.tiling?.free?.();
			handlesRef.current = {
				tiling,
				layout: {
					stride: tiling.points_per_tile(),
					boundary: tiling.boundary_points_per_tile(),
					bladePts: tiling.points_per_blade(),
					sides: tiling.polygon_sides(),
					count: tiling.tile_count(),
				},
				colors: buildColors(tiling.get_meta(), THEMES[variant.theme]),
				theme: THEMES[variant.theme],
			};
			onBuilt?.(variant.id, tiling.tile_count());
		} catch (err) {
			console.error("Failed to build hyperbolic tiling:", err);
		}
	}, [wasm, variant, maxTiles, minSize, onBuilt]);

	useEffect(() => {
		return () => {
			handlesRef.current.tiling?.free?.();
			handlesRef.current.tiling = null;
		};
	}, []);

	return handlesRef;
}
