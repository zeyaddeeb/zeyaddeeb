export type Span = [number, number];

export type Node =
	| { type: "word"; value: string; span: Span }
	| { type: "rest"; span: Span }
	| { type: "seq"; steps: Node[]; weights: number[]; span: Span }
	| { type: "stack"; layers: Node[]; span: Span }
	| { type: "alt"; options: Node[]; span: Span }
	| { type: "fast"; node: Node; factor: number; span: Span };

export interface Hap {
	begin: number;
	end: number;
	value: string;
	span: Span;
}

export class PatternError extends Error {
	constructor(
		message: string,
		readonly at: number,
	) {
		super(message);
	}
}

const wordChar = /[A-Za-z0-9#.'-]/;

const inWord = (source: string, i: number) =>
	wordChar.test(source[i] ?? "") ||
	(source[i] === ">" && /[A-Ga-g]/.test(source[i + 1] ?? ""));

export function parse(source: string): Node {
	let i = 0;

	const skip = () => {
		while (i < source.length && /\s/.test(source[i])) i++;
	};

	const sequence = (close: string | null): Node => {
		const start = i;
		const steps: Node[] = [];
		const weights: number[] = [];
		const layers: Node[] = [];
		const flush = () => {
			if (!steps.length) throw new PatternError("Nothing here", i);
			layers.push(
				steps.length === 1 && weights[0] === 1
					? steps[0]
					: {
							type: "seq",
							steps: [...steps],
							weights: [...weights],
							span: [steps[0].span[0], steps.at(-1)?.span[1] ?? i],
						},
			);
			steps.length = 0;
			weights.length = 0;
		};
		for (;;) {
			skip();
			const c = source[i];
			if (c === undefined) {
				if (close) throw new PatternError(`Missing ${close}`, i);
				break;
			}
			if (c === close) break;
			if (c === "]" || c === ">") throw new PatternError(`Unexpected ${c}`, i);
			if (c === ",") {
				if (close !== "]") throw new PatternError("Commas go inside [ ]", i);
				flush();
				i++;
				continue;
			}
			if (c === "_") {
				if (!weights.length) throw new PatternError("Nothing to hold", i);
				weights[weights.length - 1] += 1;
				i++;
				continue;
			}
			const [node, weight, count] = step();
			for (let k = 0; k < count; k++) {
				steps.push(node);
				weights.push(weight);
			}
		}
		flush();
		if (layers.length === 1) return layers[0];
		return { type: "stack", layers, span: [start, i] };
	};

	const number = (): number => {
		const start = i;
		while (i < source.length && /[0-9.]/.test(source[i])) i++;
		const value = Number(source.slice(start, i));
		if (!(value > 0) || start === i)
			throw new PatternError("Expected a number", start);
		return value;
	};

	const step = (): [Node, number, number] => {
		const start = i;
		const c = source[i];
		let node: Node;
		if (c === "[") {
			i++;
			const inner = sequence("]");
			i++;
			node = { ...inner, span: [start, i] } as Node;
			if (inner.type === "word" || inner.type === "rest") node = inner;
		} else if (c === "<") {
			i++;
			skip();
			const options: Node[] = [];
			while (source[i] !== ">") {
				if (source[i] === undefined) throw new PatternError("Missing >", i);
				const [option, weight, count] = step();
				if (weight !== 1)
					throw new PatternError("Use [ ] to stretch inside < >", i);
				for (let k = 0; k < count; k++) options.push(option);
				skip();
			}
			i++;
			if (!options.length) throw new PatternError("Nothing here", start);
			node = { type: "alt", options, span: [start, i] };
		} else if (c === "~") {
			i++;
			node = { type: "rest", span: [start, i] };
		} else if (wordChar.test(c)) {
			while (i < source.length && inWord(source, i)) i++;
			node = { type: "word", value: source.slice(start, i), span: [start, i] };
		} else {
			throw new PatternError(`Unexpected ${c}`, i);
		}
		let weight = 1;
		let count = 1;
		for (;;) {
			if (source[i] === "*") {
				i++;
				const factor = number();
				if (!Number.isInteger(factor) || factor > 16)
					throw new PatternError("Use a whole number up to 16 after *", i);
				node = { type: "fast", node, factor, span: [start, i] };
			} else if (source[i] === "@") {
				i++;
				weight = number();
			} else if (source[i] === "!") {
				i++;
				const more = /[0-9]/.test(source[i] ?? "") ? number() : 2;
				if (!Number.isInteger(more) || more > 64)
					throw new PatternError("Use a whole number up to 64 after !", i);
				count *= more;
			} else break;
		}
		return [node, weight, count];
	};

	const root = sequence(null);
	return root;
}

function walk(
	node: Node,
	begin: number,
	end: number,
	turn: number,
	out: Hap[],
) {
	switch (node.type) {
		case "word":
			out.push({ begin, end, value: node.value, span: node.span });
			return;
		case "rest":
			return;
		case "seq": {
			const total = node.weights.reduce((a, b) => a + b, 0);
			let at = begin;
			node.steps.forEach((child, index) => {
				const size = ((end - begin) * node.weights[index]) / total;
				walk(child, at, at + size, turn, out);
				at += size;
			});
			return;
		}
		case "stack":
			for (const layer of node.layers) walk(layer, begin, end, turn, out);
			return;
		case "alt": {
			const n = node.options.length;
			const index = ((turn % n) + n) % n;
			walk(node.options[index], begin, end, Math.floor(turn / n), out);
			return;
		}
		case "fast": {
			const size = (end - begin) / node.factor;
			for (let k = 0; k < node.factor; k++)
				walk(
					node.node,
					begin + k * size,
					begin + (k + 1) * size,
					turn * node.factor + k,
					out,
				);
			return;
		}
	}
}

export function cycle(node: Node, index: number): Hap[] {
	const out: Hap[] = [];
	walk(node, index, index + 1, index, out);
	return out.sort((a, b) => a.begin - b.begin || a.span[0] - b.span[0]);
}

export function period(node: Node): number {
	switch (node.type) {
		case "word":
		case "rest":
			return 1;
		case "seq":
			return node.steps.reduce((p, s) => lcm(p, period(s)), 1);
		case "stack":
			return node.layers.reduce((p, s) => lcm(p, period(s)), 1);
		case "alt":
			return (
				node.options.length *
				node.options.reduce((p, s) => lcm(p, period(s)), 1)
			);
		case "fast": {
			const inner = period(node.node);
			return inner / gcd(inner, node.factor);
		}
	}
}

function gcd(a: number, b: number): number {
	return b ? gcd(b, a % b) : a;
}

function lcm(a: number, b: number) {
	return (a * b) / gcd(a, b);
}

export function words(node: Node): { value: string; span: Span }[] {
	switch (node.type) {
		case "word":
			return [{ value: node.value, span: node.span }];
		case "rest":
			return [];
		case "seq":
			return node.steps.flatMap(words);
		case "stack":
			return node.layers.flatMap(words);
		case "alt":
			return node.options.flatMap(words);
		case "fast":
			return words(node.node);
	}
}
