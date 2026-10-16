"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { Color } from "three";
import { FormStage, type Palette } from "./stage";
import { TableStage } from "./table";

function readPalette(el: HTMLElement): Palette {
	const css = getComputedStyle(el);
	const read = (name: string) => new Color(css.getPropertyValue(name).trim());
	const ground = read("--charcoal");
	const paper = read("--paper");
	const hex = (c: Color) => `#${c.getHexString()}`;
	const mix = (t: number) => hex(ground.clone().lerp(paper, t));

	return {
		ground: hex(ground),
		form: mix(0.42),
		shade: mix(0.1),
		paper: hex(paper),
		ink: hex(read("--ink")),
		pieces: [
			hex(read("--red")),
			hex(read("--blue")),
			hex(read("--yellow")),
			mix(0.16),
		],
	};
}

export interface Stages {
	form: FormStage;
	table: TableStage;
	palette: Palette;
}

export function useStages(
	root: RefObject<HTMLElement | null>,
	formCanvas: RefObject<HTMLCanvasElement | null>,
	tableCanvas: RefObject<HTMLCanvasElement | null>,
) {
	const stages = useRef<Stages | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const el = root.current;
		const fc = formCanvas.current;
		const tc = tableCanvas.current;

		if (!el || !fc || !tc) return;

		const palette = readPalette(el);
		const form = new FormStage(fc, palette);
		const table = new TableStage(tc, palette);
		const fit = () => {
			const a = fc.getBoundingClientRect();
			const b = tc.getBoundingClientRect();

			form.resize(a.width, a.height);
			table.resize(b.width, b.height);
		};
		const observer = new ResizeObserver(fit);

		stages.current = { form, table, palette };
		fit();
		observer.observe(fc);
		observer.observe(tc);
		setReady(true);

		return () => {
			observer.disconnect();
			form.dispose();
			table.dispose();
			stages.current = null;
			setReady(false);
		};
	}, [root, formCanvas, tableCanvas]);

	return { stages, ready };
}
