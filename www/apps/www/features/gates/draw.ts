import type { Circuit, Op } from "./protocol";

export const COLUMN = 84;
export const ROW = 92;
export const MARGIN = 36;

export interface Placed {
	node: number;
	kind: "input" | "gate";
	op: Op | null;
	x: number;
	y: number;
	label: string;
}

export interface Wire {
	from: number;
	to: number;
	inverted: boolean;
}

export interface Drawing {
	width: number;
	height: number;
	nodes: Placed[];
	wires: Wire[];
	output: { node: number; inverted: boolean } | null;
	constant: boolean | null;
}

export function depths(circuit: Circuit): number[] {
	const depth: number[] = Array.from({ length: circuit.inputs }, () => 0);

	for (const gate of circuit.gates) {
		depth.push(1 + Math.max(depth[gate.a] ?? 0, depth[gate.b] ?? 0));
	}

	return depth;
}

function inverted(op: Op, side: "a" | "b"): boolean {
	return (op === "notAnd" && side === "a") || (op === "andNot" && side === "b");
}

export function draw(circuit: Circuit, labels?: string[]): Drawing {
	const depth = depths(circuit);
	const rows = Math.max(...depth, 0) + 1;
	const x = new Map<number, number>();
	const byRow: number[][] = Array.from({ length: rows }, () => []);

	depth.forEach((d, node) => {
		byRow[d]?.push(node);
	});

	const widest = Math.max(...byRow.map((row) => row.length), 1);
	const width = MARGIN * 2 + (widest - 1) * COLUMN;

	for (const [r, row] of byRow.entries()) {
		const ordered =
			r === 0
				? row
				: [...row].sort((p, q) => {
						const gp = circuit.gates[p - circuit.inputs];
						const gq = circuit.gates[q - circuit.inputs];
						const mean = (g: typeof gp) =>
							g ? ((x.get(g.a) ?? 0) + (x.get(g.b) ?? 0)) / 2 : 0;

						return mean(gp) - mean(gq) || p - q;
					});

		const span = (ordered.length - 1) * COLUMN;
		const left = (width - span) / 2;

		ordered.forEach((node, at) => {
			x.set(node, left + at * COLUMN);
		});
	}

	const nodes: Placed[] = depth.map((d, node) => {
		const gate =
			node >= circuit.inputs ? circuit.gates[node - circuit.inputs] : null;

		return {
			node,
			kind: gate ? "gate" : "input",
			op: gate?.op ?? null,
			x: x.get(node) ?? 0,
			y: MARGIN + d * ROW,
			label: gate ? "" : (labels?.[node] ?? `x${node + 1}`),
		};
	});

	const wires: Wire[] = circuit.gates.flatMap((gate, at) => {
		const to = circuit.inputs + at;

		return [
			{ from: gate.a, to, inverted: inverted(gate.op, "a") },
			{ from: gate.b, to, inverted: inverted(gate.op, "b") },
		];
	});

	const output =
		circuit.output.kind === "node"
			? { node: circuit.output.node, inverted: circuit.output.negated }
			: null;

	return {
		width,
		height: MARGIN * 2 + (rows - 1) * ROW + (output ? ROW * 0.6 : 0),
		nodes,
		wires,
		output,
		constant: circuit.output.kind === "constant" ? circuit.output.value : null,
	};
}

export const GRAPH_LABELS = ["ab", "ac", "ad", "bc", "bd", "cd"];

export function inputLabels(family: string, inputs: number): string[] {
	if (inputs === 6 && GRAPH_FAMILIES.has(family)) return GRAPH_LABELS;

	if (family === "product" && inputs === 4) return ["a0", "a1", "b0", "b1"];

	if (family === "product" && inputs === 6)
		return ["a0", "a1", "a2", "b0", "b1", "b2"];

	return Array.from({ length: inputs }, (_, i) => `x${i + 1}`);
}

const GRAPH_FAMILIES = new Set([
	"triangle",
	"connected",
	"matching",
	"hamiltonian",
]);
