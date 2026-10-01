import { describe, expect, it } from "vitest";
import { cycle, parse } from "./pattern";
import { compile, compileAll, laneIds, notes } from "./score";
import {
	arrange,
	type CallId,
	type Calls,
	call,
	calls,
	caption,
	chorus,
	isOn,
	opening,
	serialize,
	welcome,
} from "./tune";

function* everyCombination(): Generator<Calls> {
	for (const swing of [false, true])
		for (const tempo of ["medium", "drag", "stomp"] as const)
			for (const lineup of ["lead", "everybody", "clarinet", "answer"] as const)
				for (const rhythm of ["four", "two", "stop"] as const)
					for (const blue of [false, true])
						for (const brk of [false, true])
							yield { swing, tempo, lineup, rhythm, blue, break: brk };
}

describe("serialize", () => {
	it("writes one bar when every bar is the same", () => {
		expect(serialize(Array(12).fill("x x x x"))).toBe("x x x x");
	});

	it("compresses repeats and keeps bar order", () => {
		const bars: string[] = [...Array(10).fill("x x x x"), "x ~ ~ ~", "~"];
		const code = serialize(bars);

		expect(code).toBe("<[x x x x]!10 [x ~ ~ ~] ~>");

		const node = parse(code);

		bars.forEach((bar, i) => {
			expect(cycle(node, i).map((h) => h.value)).toEqual(
				bar.split(" ").filter((w) => w !== "~"),
			);
		});
	});
});

describe("calls", () => {
	it("compiles every combination of calls", () => {
		for (const c of everyCombination()) {
			const score = arrange(c);

			for (const lane of laneIds)
				expect(
					compile(lane, score.code[lane]).problem,
					`${JSON.stringify(c)} ${lane}: ${score.code[lane]}`,
				).toBeNull();
		}
	});

	it("repeats every line once a chorus", () => {
		const compiled = compileAll(
			arrange({ ...opening, lineup: "everybody", break: true }),
		);

		for (const lane of laneIds)
			expect(notes(compiled, lane, chorus + 3, 1).map((n) => n.value)).toEqual(
				notes(compiled, lane, 3, 1).map((n) => n.value),
			);
	});

	it("toggles radio groups back to the default", () => {
		let c = call(opening, "stomp");

		expect(c.tempo).toBe("stomp");
		c = call(c, "drag");
		expect(c.tempo).toBe("drag");
		c = call(c, "drag");
		expect(c.tempo).toBe("medium");
		expect(isOn(call(opening, "answer"), "answer")).toBe(true);
	});

	it("swings harder slow and lighter fast", () => {
		const ratio = (tempo: Calls["tempo"]) =>
			arrange({ ...opening, swing: true, tempo }).swing;

		expect(ratio("drag")).toBeGreaterThan(ratio("medium"));
		expect(ratio("stomp")).toBeLessThan(ratio("medium"));
		expect(arrange(opening).swing).toBe(1);
	});

	it("stops the band for the break and leaves the soloist playing", () => {
		const compiled = compileAll(
			arrange({ ...opening, lineup: "everybody", break: true }),
		);

		for (const lane of ["banjo", "piano", "trombone", "clarinet"] as const) {
			expect(notes(compiled, lane, 10, 1).length).toBeLessThanOrEqual(1);
			expect(notes(compiled, lane, 11, 1)).toHaveLength(0);
		}

		expect(notes(compiled, "cornet", 10, 1).length).toBeGreaterThan(5);
		expect(notes(compiled, "cornet", 11, 1).length).toBeGreaterThan(5);
	});

	it("answers only in the gaps", () => {
		const compiled = compileAll(arrange({ ...opening, lineup: "answer" }));

		for (let bar = 0; bar < chorus; bar++) {
			const cornet = notes(compiled, "cornet", bar, 1).length;
			const clarinet = notes(compiled, "clarinet", bar, 1).length;

			expect(cornet === 0 || clarinet === 0, `bar ${bar + 1}`).toBe(true);
		}
	});

	it("keeps the horns in separate registers", () => {
		const text = caption(call(opening, "everybody"), "everybody").text;

		expect(text).toMatch(
			/cornet in the middle around \S+, clarinet above around \S+, trombone below around \S+\./,
		);

		const compiled = compileAll(arrange({ ...opening, lineup: "everybody" }));

		const mid = (lane: "cornet" | "clarinet" | "trombone") => {
			const keys = Array.from({ length: chorus }, (_, bar) =>
				notes(compiled, lane, bar, 1).flatMap((n) => n.keys),
			)
				.flat()
				.sort((a, b) => a - b);

			return keys[Math.floor(keys.length / 2)];
		};

		expect(mid("clarinet")).toBeGreaterThan(mid("cornet"));
		expect(mid("trombone")).toBeLessThan(mid("cornet") - 12);
	});

	it("fits every caption on three short lines", () => {
		expect(welcome.text.length).toBeLessThanOrEqual(150);

		for (const c of everyCombination())
			for (const { id } of calls) {
				const text = caption(c, id as CallId).text;

				expect(text.length, text).toBeLessThanOrEqual(150);
			}
	});
});
