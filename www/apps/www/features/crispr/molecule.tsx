"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import type { Guide } from "./guides";
import { createHelix, type Frame, type Helix, SWING } from "./helix";

const CODE: Record<string, number> = { A: 0, C: 1, G: 2, T: 3 };

export type Beat = "read" | "latch" | "cut" | "mend";

export interface MoleculeProps {
	seq: string;
	guide: Guide | null;
	beat: Beat;
	removed: readonly [number, number] | null;
	focus: number;
	unrolled: boolean;
}

const PALETTE = {
	bases: ["#e83025", "#ffbc00", "#f9f8f2", "#0089c8"] as [
		string,
		string,
		string,
		string,
	],
	faded: "#62615b",
	rail: "#c9c7bf",
	rna: "#ffbc00",
	back: "#131312",
};

const ease = (from: number, to: number, rate: number) =>
	Math.abs(to - from) < 0.0008 ? to : from + (to - from) * rate;

export function Molecule({
	seq,
	guide,
	beat,
	removed,
	focus,
	unrolled,
}: MoleculeProps) {
	const holder = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const reduced = useReducedMotion();
	const target = useRef({ flat: 1, rna: 0, pull: 0, swing: 0, spin: 0 });
	const state = useRef({ flat: 1, rna: 0, pull: 0, swing: 0, spin: 0 });
	const seam = useRef({ at: 1e6, gap: 2.5 });
	const data = useRef<{
		bases: Uint8Array;
		live: Float32Array;
		paired: Float32Array;
	}>({
		bases: new Uint8Array(0),
		live: new Float32Array(0),
		paired: new Float32Array(0),
	});
	const look = useRef({ focus, spin: 0, grab: null as number | null });

	useEffect(() => {
		const bases = new Uint8Array(seq.length);

		for (let i = 0; i < seq.length; i++) bases[i] = CODE[seq[i]] ?? 0;

		data.current = {
			bases,
			live: new Float32Array(seq.length).fill(1),
			paired: new Float32Array(seq.length),
		};
	}, [seq]);

	useEffect(() => {
		const { live, paired } = data.current;

		live.fill(1);
		paired.fill(0);

		if (guide) {
			const from = Math.min(guide.start, guide.pamStart);
			const to = Math.max(guide.end, guide.pamStart + 2);

			for (let i = from; i <= to && i < live.length; i++) live[i] = 2;

			if (beat !== "read")
				for (let i = guide.start; i <= guide.end && i < paired.length; i++)
					paired[i] = 1;
		} else {
			const middle = Math.round(focus);

			for (
				let i = Math.max(0, middle - 11);
				i <= Math.min(live.length - 1, middle + 11);
				i++
			)
				live[i] = 2;
		}

		if (removed)
			for (let i = removed[0]; i <= removed[1] && i < live.length; i++)
				live[i] = 0;

		seam.current =
			beat === "mend" && removed
				? { at: removed[0], gap: -(removed[1] - removed[0] + 1) }
				: { at: guide ? guide.cut : 1e6, gap: 2.5 };

		target.current = {
			flat: unrolled ? 1 : 0,
			rna: beat === "latch" || beat === "cut" ? 1 : 0,
			pull: beat === "cut" || (beat === "mend" && removed) ? 1 : 0,
			swing: beat === "latch" || beat === "cut" ? SWING : 0,
			spin: 0,
		};
	}, [beat, guide, removed, unrolled, focus]);

	useEffect(() => {
		look.current.focus = focus;
	}, [focus]);

	useEffect(() => {
		const node = canvas.current;
		const box = holder.current;

		if (!node || !box) return;

		let helix: Helix | null = null;

		try {
			helix = createHelix(node, PALETTE, data.current.bases.length || 1);
		} catch {
			return;
		}

		const scene = helix;
		let alive = true;
		let raf = 0;

		const watch = new ResizeObserver(([entry]) => {
			scene.resize(entry.contentRect.width, entry.contentRect.height);
		});

		watch.observe(box);
		scene.resize(box.clientWidth, box.clientHeight);

		const tick = () => {
			if (!alive) return;

			const rate = reduced ? 1 : 0.12;
			const now = state.current;
			const want = target.current;

			now.flat = ease(now.flat, want.flat, rate);
			now.rna = ease(now.rna, want.rna, rate);
			now.pull = ease(now.pull, want.pull, rate);
			now.swing = ease(now.swing, want.swing, rate);

			if (!reduced && now.flat < 0.98) look.current.spin += 0.0035;

			const frame: Frame = {
				bases: data.current.bases,
				live: data.current.live,
				paired: data.current.paired,
				flat: now.flat,
				focus: look.current.focus,
				center: look.current.focus,
				spin: look.current.spin,
				open: guide ? [guide.start, guide.end] : null,
				swing: now.swing,
				face: guide ? guide.strand : -1,
				rna: now.rna,
				cut: seam.current.at,
				pull: now.pull,
				gap: seam.current.gap,
				wave: 0.45,
			};

			scene.draw(frame);
			raf = requestAnimationFrame(tick);
		};

		tick();

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			watch.disconnect();
			scene.dispose();
		};
	}, [guide, reduced, seq]);

	return (
		<div className="cr-molecule" ref={holder}>
			<canvas className="cr-canvas" ref={canvas} />
		</div>
	);
}
