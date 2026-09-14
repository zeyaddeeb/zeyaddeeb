type Tok =
	| { t: "num"; v: number }
	| { t: "str"; v: string }
	| { t: "id"; v: string }
	| { t: "op"; v: string };

type Value = number | string;
type Jump = { pc: number } | "end";

interface Stmt {
	line: number;
	toks: Tok[];
}

export class BasicError extends Error {}

const OPS = [
	"<=",
	">=",
	"<>",
	"=",
	"<",
	">",
	"+",
	"-",
	"*",
	"/",
	"^",
	"(",
	")",
	",",
	";",
	":",
];

function tokenize(src: string): Tok[] {
	const toks: Tok[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i] as string;
		if (c === " " || c === "\t") {
			i++;
		} else if (c === "'") {
			break;
		} else if (c === '"') {
			const end = src.indexOf('"', i + 1);
			const v = end < 0 ? src.slice(i + 1) : src.slice(i + 1, end);
			toks.push({ t: "str", v });
			i = end < 0 ? src.length : end + 1;
		} else if (/[0-9.]/.test(c)) {
			const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\.?/i.exec(src.slice(i));
			const text = m?.[0] ?? c;
			toks.push({ t: "num", v: Number(text) });
			i += text.length;
		} else if (/[A-Za-z]/.test(c)) {
			const m = /^[A-Za-z][A-Za-z0-9]*[$%!#&]?/.exec(src.slice(i));
			const text = (m?.[0] ?? c).toUpperCase();
			if (text === "REM") break;
			toks.push({ t: "id", v: text });
			i += text.length;
		} else if (c === "?") {
			toks.push({ t: "id", v: "PRINT" });
			i++;
		} else {
			const op = OPS.find((o) => src.startsWith(o, i));
			if (!op) throw new BasicError(`Syntax error near ${c}`);
			toks.push({ t: "op", v: op });
			i += op.length;
		}
	}
	return toks;
}

const isOp = (t: Tok | undefined, v: string) => t?.t === "op" && t.v === v;
const isId = (t: Tok | undefined, v: string) => t?.t === "id" && t.v === v;

function splitStatements(toks: Tok[]): Tok[][] {
	const out: Tok[][] = [];
	let cur: Tok[] = [];
	for (let i = 0; i < toks.length; i++) {
		const t = toks[i] as Tok;
		if (cur.length === 0 && isId(t, "IF")) {
			out.push(toks.slice(i));
			return out;
		}
		if (isOp(t, ":")) {
			if (cur.length) out.push(cur);
			cur = [];
		} else cur.push(t);
	}
	if (cur.length) out.push(cur);
	return out;
}

function fmtNumber(n: number) {
	if (!Number.isFinite(n)) return n > 0 ? "1.#INF" : n < 0 ? "-1.#INF" : "NaN";
	const s = Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(7)));
	return `${n < 0 ? "" : " "}${s} `;
}

class Expr {
	pos = 0;
	constructor(
		private toks: Tok[],
		private vars: Map<string, Value>,
	) {}

	peek() {
		return this.toks[this.pos];
	}
	take() {
		return this.toks[this.pos++];
	}
	done() {
		return this.pos >= this.toks.length;
	}

	expr(): Value {
		let v = this.and();
		while (isId(this.peek(), "OR")) {
			this.take();
			const r = this.and();
			v = num(v) | num(r);
		}
		return v;
	}
	private and(): Value {
		let v = this.not();
		while (isId(this.peek(), "AND")) {
			this.take();
			const r = this.not();
			v = num(v) & num(r);
		}
		return v;
	}
	private not(): Value {
		if (isId(this.peek(), "NOT")) {
			this.take();
			return ~num(this.not());
		}
		return this.cmp();
	}
	private cmp(): Value {
		const l = this.add();
		const t = this.peek();
		if (t?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.v)) {
			this.take();
			const r = this.add();
			if (typeof l !== typeof r) throw new BasicError("Type mismatch");
			const res =
				t.v === "="
					? l === r
					: t.v === "<>"
						? l !== r
						: t.v === "<"
							? l < r
							: t.v === ">"
								? l > r
								: t.v === "<="
									? l <= r
									: l >= r;
			return res ? -1 : 0;
		}
		return l;
	}
	private add(): Value {
		let v = this.mul();
		for (;;) {
			const t = this.peek();
			if (isOp(t, "+")) {
				this.take();
				const r = this.mul();
				if (typeof v === "string" && typeof r === "string") v = v + r;
				else v = num(v) + num(r);
			} else if (isOp(t, "-")) {
				this.take();
				v = num(v) - num(this.mul());
			} else return v;
		}
	}
	private mul(): Value {
		let v = this.unary();
		for (;;) {
			const t = this.peek();
			if (isOp(t, "*")) {
				this.take();
				v = num(v) * num(this.unary());
			} else if (isOp(t, "/")) {
				this.take();
				const r = num(this.unary());
				if (r === 0) throw new BasicError("Division by zero");
				v = num(v) / r;
			} else if (isId(t, "MOD")) {
				this.take();
				v = Math.trunc(num(v)) % Math.trunc(num(this.unary()));
			} else return v;
		}
	}
	private unary(): Value {
		if (isOp(this.peek(), "-")) {
			this.take();
			return -num(this.unary());
		}
		return this.pow();
	}
	private pow(): Value {
		const base = this.atom();
		if (isOp(this.peek(), "^")) {
			this.take();
			return num(base) ** num(this.unary());
		}
		return base;
	}
	private atom(): Value {
		const t = this.take();
		if (!t) throw new BasicError("Expected expression");
		if (t.t === "num" || t.t === "str") return t.v;
		if (isOp(t, "(")) {
			const v = this.expr();
			if (!isOp(this.take(), ")")) throw new BasicError("Expected )");
			return v;
		}
		if (t.t === "id") {
			const fn = FUNCS[t.v];
			if (fn) {
				const args: Value[] = [];
				if (isOp(this.peek(), "(")) {
					this.take();
					if (!isOp(this.peek(), ")")) {
						args.push(this.expr());
						while (isOp(this.peek(), ",")) {
							this.take();
							args.push(this.expr());
						}
					}
					if (!isOp(this.take(), ")")) throw new BasicError("Expected )");
				}
				return fn(args);
			}
			return this.vars.get(t.v) ?? (t.v.endsWith("$") ? "" : 0);
		}
		throw new BasicError("Syntax error");
	}
}

function num(v: Value): number {
	if (typeof v !== "number") throw new BasicError("Type mismatch");
	return v;
}
function str(v: Value): string {
	if (typeof v !== "string") throw new BasicError("Type mismatch");
	return v;
}

const FUNCS: Record<string, (a: Value[]) => Value> = {
	INT: (a) => Math.floor(num(a[0] ?? 0)),
	ABS: (a) => Math.abs(num(a[0] ?? 0)),
	SQR: (a) => Math.sqrt(num(a[0] ?? 0)),
	SGN: (a) => Math.sign(num(a[0] ?? 0)),
	RND: () => Math.random(),
	TIMER: () => (Date.now() / 1000) % 86400,
	LEN: (a) => str(a[0] ?? "").length,
	STR$: (a) => fmtNumber(num(a[0] ?? 0)).trimEnd(),
	VAL: (a) => Number.parseFloat(str(a[0] ?? "")) || 0,
	CHR$: (a) => String.fromCharCode(num(a[0] ?? 0)),
	ASC: (a) => str(a[0] ?? "").charCodeAt(0) || 0,
	LEFT$: (a) => str(a[0] ?? "").slice(0, num(a[1] ?? 0)),
	RIGHT$: (a) => {
		const s = str(a[0] ?? "");
		const n = num(a[1] ?? 0);
		return n ? s.slice(-n) : "";
	},
	MID$: (a) => {
		const s = str(a[0] ?? "");
		const start = num(a[1] ?? 1) - 1;
		return a[2] === undefined
			? s.slice(start)
			: s.slice(start, start + num(a[2]));
	},
	UCASE$: (a) => str(a[0] ?? "").toUpperCase(),
	LCASE$: (a) => str(a[0] ?? "").toLowerCase(),
	SPACE$: (a) => " ".repeat(Math.max(0, num(a[0] ?? 0))),
	STRING$: (a) => {
		const n = Math.max(0, num(a[0] ?? 0));
		const c = a[1];
		return (
			typeof c === "string" ? (c[0] ?? "") : String.fromCharCode(num(c ?? 32))
		).repeat(n);
	},
};

const ZONE = 14;

export class Basic {
	private stmts: Stmt[] = [];
	private lineStart = new Map<number, number>();
	private pc = 0;
	private vars = new Map<string, Value>();
	private loops: { v: string; end: number; step: number; pc: number }[] = [];
	private calls: number[] = [];

	output: string[] = [""];
	state: "running" | "done" | "error" = "running";
	error = "";

	constructor(src: string) {
		try {
			for (const raw of src.split("\n")) {
				const m = /^\s*(\d+)?\s*(.*)$/.exec(raw);
				const line = m?.[1] ? Number(m[1]) : Number.NaN;
				const rest = m?.[2] ?? "";
				if (!rest.trim()) continue;
				const parts = splitStatements(tokenize(rest));
				if (!Number.isNaN(line)) this.lineStart.set(line, this.stmts.length);
				for (const toks of parts) this.stmts.push({ line, toks });
			}
		} catch (e) {
			this.fail(e);
		}
		if (this.state === "running" && !this.stmts.length) this.state = "done";
	}

	step() {
		if (this.state !== "running") return;
		const stmt = this.stmts[this.pc];
		if (!stmt) {
			this.state = "done";
			return;
		}
		try {
			const jump = this.exec(stmt.toks);
			if (jump === "end") this.state = "done";
			else if (jump) this.pc = jump.pc;
			else this.pc++;
		} catch (e) {
			this.fail(e, stmt.line);
		}
	}

	private fail(e: unknown, line?: number) {
		this.state = "error";
		const msg = e instanceof Error ? e.message : "Error";
		this.error = Number.isFinite(line) ? `${msg} in line ${line}` : msg;
	}

	private print(text: string) {
		const last = this.output.length - 1;
		this.output[last] = `${this.output[last] ?? ""}${text}`;
	}
	private newline() {
		this.output.push("");
		if (this.output.length > 600)
			this.output.splice(0, this.output.length - 600);
	}

	private target(p: Expr): Jump {
		const t = p.take();
		if (t?.t !== "num") throw new BasicError("Expected line number");
		const pc = this.lineStart.get(t.v);
		if (pc === undefined) throw new BasicError(`Label not defined: ${t.v}`);
		return { pc };
	}

	private exec(toks: Tok[]): Jump | undefined {
		const head = toks[0];
		if (!head) return;
		const p = new Expr(toks, this.vars);

		if (head.t === "id") {
			switch (head.v) {
				case "PRINT": {
					p.take();
					let pending = true;
					while (!p.done()) {
						const t = p.peek();
						if (isOp(t, ";")) {
							p.take();
							pending = false;
						} else if (isOp(t, ",")) {
							p.take();
							const col = (this.output[this.output.length - 1] ?? "").length;
							this.print(" ".repeat(ZONE - (col % ZONE)));
							pending = false;
						} else {
							const v = p.expr();
							this.print(typeof v === "number" ? fmtNumber(v) : v);
							pending = true;
						}
					}
					if (pending) this.newline();
					return;
				}
				case "LET":
					p.take();
					return this.assign(p);
				case "GOTO":
					p.take();
					return this.target(p);
				case "GOSUB": {
					p.take();
					this.calls.push(this.pc + 1);
					return this.target(p);
				}
				case "RETURN": {
					const pc = this.calls.pop();
					if (pc === undefined) throw new BasicError("RETURN without GOSUB");
					return { pc };
				}
				case "IF": {
					p.take();
					const cond = num(p.expr());
					if (!isId(p.take(), "THEN")) throw new BasicError("Expected THEN");
					const rest = toks.slice(p.pos);
					const elseAt = rest.findIndex((t) => isId(t, "ELSE"));
					const branch =
						cond !== 0
							? elseAt < 0
								? rest
								: rest.slice(0, elseAt)
							: elseAt < 0
								? []
								: rest.slice(elseAt + 1);
					if (!branch.length) return;
					if (branch.length === 1 && branch[0]?.t === "num") {
						return this.target(new Expr(branch, this.vars));
					}
					for (const s of splitStatements(branch)) {
						const jump = this.exec(s);
						if (jump) return jump;
					}
					return;
				}
				case "FOR": {
					p.take();
					const v = p.take();
					if (v?.t !== "id" || !isOp(p.take(), "="))
						throw new BasicError("Expected variable");
					const start = num(p.expr());
					if (!isId(p.take(), "TO")) throw new BasicError("Expected TO");
					const end = num(p.expr());
					let step = 1;
					if (isId(p.peek(), "STEP")) {
						p.take();
						step = num(p.expr());
					}
					this.vars.set(v.v, start);
					this.loops = this.loops.filter((l) => l.v !== v.v);
					this.loops.push({ v: v.v, end, step, pc: this.pc + 1 });
					return;
				}
				case "NEXT": {
					p.take();
					const named =
						p.peek()?.t === "id" ? (p.take() as { v: string }).v : null;
					const loop = named
						? this.loops.find((l) => l.v === named)
						: this.loops[this.loops.length - 1];
					if (!loop) throw new BasicError("NEXT without FOR");
					const next = num(this.vars.get(loop.v) ?? 0) + loop.step;
					this.vars.set(loop.v, next);
					const finished = loop.step >= 0 ? next > loop.end : next < loop.end;
					if (finished) {
						this.loops = this.loops.filter((l) => l !== loop);
						return;
					}
					return { pc: loop.pc };
				}
				case "WHILE": {
					p.take();
					if (num(p.expr()) !== 0) return;
					let depth = 0;
					for (let i = this.pc + 1; i < this.stmts.length; i++) {
						const s = this.stmts[i]?.toks[0];
						if (isId(s, "WHILE")) depth++;
						else if (isId(s, "WEND")) {
							if (depth === 0) return { pc: i + 1 };
							depth--;
						}
					}
					throw new BasicError("WHILE without WEND");
				}
				case "WEND": {
					let depth = 0;
					for (let i = this.pc - 1; i >= 0; i--) {
						const s = this.stmts[i]?.toks[0];
						if (isId(s, "WEND")) depth++;
						else if (isId(s, "WHILE")) {
							if (depth === 0) return { pc: i };
							depth--;
						}
					}
					throw new BasicError("WEND without WHILE");
				}
				case "CLS":
					this.output = [""];
					return;
				case "END":
				case "STOP":
				case "SYSTEM":
					return "end";
				case "RANDOMIZE":
				case "COLOR":
				case "SLEEP":
				case "SCREEN":
				case "DIM":
					return;
				case "INPUT":
					throw new BasicError("INPUT is not available on this screen");
				default:
					if (isOp(toks[1], "=")) return this.assign(p);
					throw new BasicError(`Unknown statement ${head.v}`);
			}
		}
		throw new BasicError("Syntax error");
	}

	private assign(p: Expr): undefined {
		const v = p.take();
		if (v?.t !== "id" || !isOp(p.take(), "="))
			throw new BasicError("Expected variable");
		const value = p.expr();
		if (v.v.endsWith("$") !== (typeof value === "string"))
			throw new BasicError("Type mismatch");
		this.vars.set(v.v, value);
	}
}
