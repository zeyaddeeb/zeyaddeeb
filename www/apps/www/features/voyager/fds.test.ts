import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	board,
	CHIP,
	chipAt,
	chipOf,
	FREE,
	gapsOf,
	plan,
	type Routine,
	snap,
	WORDS,
	wordAt,
} from "./fds-board";

const rs = readFileSync(
	new URL("../../../../packages/wasm/src/voyager.rs", import.meta.url),
	"utf8",
);

const layout = [
	...(rs.match(/const LAYOUT[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? "").matchAll(
		/\("(\w+)",\s*(\d+),\s*(\d+)\)/g,
	),
].map(([, name, base, len]) => ({ name, base: +base, len: +len }));

const DEAD = Number(rs.match(/DEAD_CHIP: usize = (\d+)/)?.[1]);
const STRANDED = [16, 17, 18, 19];
const need: Routine[] = STRANDED.map((id) => ({ id, len: layout[id].len }));

function fresh() {
	const owners = new Uint8Array(WORDS).fill(FREE);

	layout.forEach((r, id) => {
		owners.fill(id, r.base, r.base + r.len);
	});

	return owners;
}

function move(owners: Uint8Array, routine: number, base: number) {
	const len = layout[routine].len;
	const gaps = gapsOf(owners, DEAD);
	const fits = gaps.some((g) => base >= g.base && base + len <= g.base + g.len);

	if (!fits) throw new Error(`${len} words do not fit at ${base}`);

	const next = owners.slice();

	for (let w = 0; w < WORDS; w++) if (next[w] === routine) next[w] = FREE;

	next.fill(routine, base, base + len);

	return next;
}

const fitsAll = (moves: { routine: number; base: number }[]) => {
	let owners = fresh();

	for (const m of moves) owners = move(owners, m.routine, m.base);

	return STRANDED.every((r) => chipOf(owners.indexOf(r)) !== DEAD);
};

describe("fds memory board", () => {
	it("reads the real layout", () => {
		expect(layout).toHaveLength(31);
		expect(DEAD).toBe(21);

		expect(STRANDED.map((r) => layout[r].name)).toEqual([
			"pack_science",
			"pack_engineering",
			"frame_header",
			"frame_sync",
		]);

		expect(need.reduce((s, r) => s + r.len, 0)).toBe(CHIP);
	});

	it("never offers the dead chip and has no gap for all 256 words", () => {
		const gaps = gapsOf(fresh(), DEAD);

		for (const g of gaps) {
			for (let w = g.base; w < g.base + g.len; w++)
				expect(chipOf(w)).not.toBe(DEAD);
		}

		expect(Math.max(...gaps.map((g) => g.len))).toBeLessThan(CHIP);
		expect(gaps.map((g) => g.len)).toEqual([96, 88, 62, 52, 40, 24, 20]);
	});

	it("snaps a tap to the smallest gap that fits in that chip", () => {
		const gaps = gapsOf(fresh(), DEAD);
		const s = snap(gaps, chipOf(4896), 72, DEAD);

		expect(s).toEqual({
			kind: "fit",
			gap: { base: 4896, len: 88 },
			base: 4896,
		});

		const tail = snap(gaps, chipOf(2323), 80, DEAD);

		expect(tail.kind).toBe("fit");

		if (tail.kind === "fit") expect(tail.base).toBe(2324 - 80);
	});

	it("names the gap when nothing in the chip fits", () => {
		const gaps = gapsOf(fresh(), DEAD);

		expect(snap(gaps, chipOf(8172), 48, DEAD)).toEqual({
			kind: "small",
			gap: { base: 8172, len: 20 },
		});

		expect(snap(gaps, 0, 48, DEAD)).toEqual({ kind: "none" });
		expect(snap(gaps, DEAD, 48, DEAD)).toEqual({ kind: "dead" });
	});

	it("sees a stranded routine after a greedy move", () => {
		let owners = fresh();

		owners = move(owners, 18, 2228);
		owners = move(owners, 16, 4896);

		const left = need.filter((r) => r.id === 17 || r.id === 19);

		expect(plan(gapsOf(owners, DEAD), left)).toBeNull();

		for (const base of [5314, 6162, 7046, 7540, 8172])
			expect(() => move(owners, 17, base)).toThrow();
	});

	it("finds a best fit that moves every routine out of the dead chip", () => {
		const gaps = gapsOf(fresh(), DEAD);
		const moves = plan(gaps, need);

		expect(moves).not.toBeNull();
		expect(moves?.map((m) => m.routine)).toEqual([16, 17, 18, 19]);
		expect(fitsAll(moves ?? [])).toBe(true);
	});

	it("maps pointer positions to chips and words", () => {
		const b = board(722, 8);

		expect(b.height).toBeCloseTo(357, 0);
		expect(wordAt(b, 1, 1)).toBe(0);
		expect(chipAt(b, b.chip + 3, 10, false)).toBe(-1);
		expect(chipAt(b, b.chip + 3, 10, true)).toBe(0);
		expect(chipAt(b, b.chip + 6, 10, true)).toBe(1);

		const o = 5 * (b.chip + b.gap) + b.cell * 3.5;
		const p = 2 * (b.chip + b.gap) + b.cell * 7.5;

		expect(wordAt(b, o, p)).toBe(21 * CHIP + 7 * 16 + 3);
	});
});
