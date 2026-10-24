import type { CupReader } from "@zeyaddeeb/wasm";
import { SPECS } from "./readers-data";

export type Kind = "blurts" | "notes";

export interface Spec {
	id: string;
	kind: Kind;
	layers: number;
	width: number;
	parameters: number;
	steps: number;
	batch: number;
	bytes: number;
	follows: number;
	right: number[];
}

type Wasm = typeof import("@zeyaddeeb/wasm");

const loaded = new Map<string, Promise<CupReader>>();

export const atOnce = SPECS.filter((s) => s.kind === "blurts").sort(
	(a, b) => a.layers - b.layers,
);

export const notes = SPECS.find((s) => s.kind === "notes") ?? SPECS[0];

export const spec = (id: string) => SPECS.find((s) => s.id === id);

export function open(wasm: Wasm, spec: Spec) {
	const { id } = spec;
	const cached = loaded.get(id);

	if (cached) return cached;

	const reading = fetch(
		`/show-your-work/${id}.safetensors?v=${spec.steps}-${spec.bytes}`,
	)
		.then((r) => {
			if (!r.ok) throw new Error(`${id}: ${r.status}`);
			return r.arrayBuffer();
		})
		.then((buffer) => new wasm.CupReader(new Uint8Array(buffer)));

	loaded.set(id, reading);
	reading.catch(() => loaded.delete(id));

	return reading;
}

export function reach(right: readonly number[], floor = 0.9) {
	const i = right.findIndex((r) => r < floor);

	return i < 0 ? right.length : i;
}

export const thousands = (n: number) =>
	n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
