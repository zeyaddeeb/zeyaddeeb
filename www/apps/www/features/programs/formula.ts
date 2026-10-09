export type Term =
	| { kind: "leaf"; name: string }
	| { kind: "op"; op: Op; left: Term; right: Term }
	| { kind: "first"; from: Term; body: Term };

type Op = "+" | "-" | "*" | "/" | "%";

const OPS = new Set<string>(["+", "-", "*", "/", "%"]);

const NAMES: Record<string, string> = {
	n: "n",
	a1: "a(n−1)",
	a2: "a(n−2)",
	j: "j",
};

const SYMBOL: Record<Op, string> = {
	"+": "+",
	"-": "−",
	"*": "×",
	"/": "÷",
	"%": "mod",
};

const RANK: Record<Op, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };

const LOOSE = new Set(["++", "+-", "**"]);

export function parse(tokens: string): Term {
	const list = tokens.split(" ").filter(Boolean);
	let at = 0;

	const next = (): Term => {
		const token = list[at++];

		if (token === undefined) throw new Error(`Incomplete rule: ${tokens}`);

		if (token === "first") {
			const from = next();

			return { kind: "first", from, body: next() };
		}

		if (OPS.has(token)) {
			const left = next();

			return { kind: "op", op: token as Op, left, right: next() };
		}

		return { kind: "leaf", name: token };
	};

	return next();
}

function wrap(term: Term, parent: Op | null, side: "left" | "right") {
	if (!parent) return false;
	if (term.kind === "first") return true;
	if (term.kind !== "op") return false;

	const inner = RANK[term.op];
	const outer = RANK[parent];

	if (inner !== outer) return inner < outer;
	if (side === "left") return term.op === "%" || parent === "%";

	return !LOOSE.has(parent + term.op);
}

export function write(
	term: Term,
	parent: Op | null = null,
	side: "left" | "right" = "left",
	loop = false,
): string {
	const text =
		term.kind === "leaf"
			? term.name === "j" && !loop
				? "0"
				: (NAMES[term.name] ?? term.name)
			: term.kind === "first"
				? `first j ≥ ${write(term.from, null, "left", loop)} with ${write(term.body, null, "left", true)} = 0`
				: `${write(term.left, term.op, "left", loop)} ${SYMBOL[term.op]} ${write(term.right, term.op, "right", loop)}`;

	return wrap(term, parent, side) ? `(${text})` : text;
}

export function rule(tokens: string) {
	return `a(n) = ${write(parse(tokens))}`;
}

export const number = (v: number) =>
	v < 0 ? `−${Math.abs(v).toLocaleString("en-US")}` : v.toLocaleString("en-US");

export const list = (values: readonly number[]) =>
	values.map(number).join(", ");
