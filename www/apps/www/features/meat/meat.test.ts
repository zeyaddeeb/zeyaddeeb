import { describe, expect, it } from "vitest";
import { answer, nats, ownWords, paste, trim } from "./answer";
import {
	children,
	closure,
	glossary,
	measure,
	open,
	segments,
	sources,
	start,
} from "./glossary";
import { bill, breakEven, percent, scale, span, words } from "./meat";
import { habits, human, lines, relay } from "./ping";
import { totals, trip, verdict } from "./wire";

const weigh = scale(answer);

describe("weighing a reply", () => {
	it("finds exactly two words of meat in a verbatim paste", () => {
		const w = weigh(paste);

		expect(w.mine).toBe(2);

		expect(
			w.pieces
				.filter((p) => p.word && p.mine)
				.map((p) => p.text)
				.join(" "),
		).toBe("Claude said");
	});

	it("finds no meat in a trimmed paste", () => {
		expect(weigh(trim).mine).toBe(0);
		expect(trim).toContain(nats);
	});

	it("credits a reply written in your own words", () => {
		expect(weigh(ownWords).share).toBeGreaterThan(0.9);
	});

	it("keeps every character of the reply in its pieces", () => {
		for (const reply of [paste, ownWords, "  hi — there ", ""])
			expect(
				weigh(reply)
					.pieces.map((p) => p.text)
					.join(""),
			).toBe(reply);
	});

	it("counts short replies as all meat", () => {
		expect(weigh("Root cause: NATS").share).toBe(1);
	});

	it("contains the sentence from the post", () => {
		expect(answer).toContain(nats);
		expect(words(answer).length).toBeGreaterThan(500);
	});
});

describe("formatting", () => {
	it("spans seconds to working years", () => {
		expect(span(15)).toBe("15 s");
		expect(span(205)).toBe("3 min 25 s");
		expect(span(3 * 3600 + 600)).toBe("3 h 10 min");
		expect(span(3 * 8 * 3600)).toBe("3.0 working days");
		expect(span(8 * 5 * 8 * 3600)).toBe("8.0 working weeks");
		expect(span(1800 * 3600)).toBe("1.0 working year");
	});

	it("shows tiny shares with a decimal", () => {
		expect(percent(2 / 700)).toBe("0.3%");
		expect(percent(0)).toBe("0%");
		expect(percent(0.5)).toBe("50%");
	});
});

describe("the reading bill", () => {
	it("breaks even around two readers", () => {
		const n = breakEven(words(answer).length);

		expect(n).toBeGreaterThan(1.5);
		expect(n).toBeLessThan(3);

		const b = bill(Math.ceil(n), words(answer).length);

		expect(b.digest).toBeLessThan(b.paste);
	});
});

describe("the glossary", () => {
	it("defines every term it links", () => {
		for (const id of Object.keys(glossary))
			for (const child of children(id)) expect(glossary[child]).toBeDefined();

		for (const s of sources)
			for (const seg of segments(s.markup))
				if (seg.id) expect(glossary[seg.id]).toBeDefined();
	});

	it("keeps the sentence text in its markup", () => {
		for (const s of sources)
			expect(
				segments(s.markup)
					.map((x) => x.text)
					.join("")
					.replace(/’/g, "'"),
			).toBe(s.text.replace(/’/g, "'"));
	});

	it("reaches every jargon term from Claude’s sentence", () => {
		const claude = closure(sources[0].markup);
		const person = closure(sources[1].markup);
		const all = new Set([...claude.order, ...person.order]);

		expect([...all].sort()).toEqual(Object.keys(glossary).sort());
	});

	it("goes supercritical for Claude and not for a person", () => {
		let r = start(sources[0].markup);

		for (const id of r.seed.slice(0, 4)) r = open(r, id);

		expect(measure(r).k).toBeGreaterThan(1);
		expect(measure(r).expected).toBe(Infinity);

		const p = closure(sources[1].markup);

		expect(measure(p).k).toBe(0);
		expect(measure(p).lookups).toBe(2);
	});

	it("never moves a node once placed", () => {
		let r = start(sources[0].markup);
		const first = { ...r.nodes };

		r = open(r, "pod");
		r = open(r, "kubernetes");

		for (const id of Object.keys(first)) expect(r.nodes[id]).toEqual(first[id]);
	});
});

describe("the wire", () => {
	it("takes no reading when both people paste", () => {
		const t = totals(trip("paste", "paste", 700));

		expect(t.you + t.them).toBe(0);
		expect(t.seconds).toBe(70);
	});

	it("makes a reader read the long answers", () => {
		const t = totals(trip("read", "paste", 700));

		expect(t.you).toBe(1400);
		expect(t.them).toBe(0);
		expect(verdict("read", "paste")).toMatch(/coworker is the cable/);
	});
});

describe("ping", () => {
	it("models a week of review through you", () => {
		expect(relay().map(human)).toEqual([
			"18 h 55 min",
			"5 h 11 min",
			"66 h 51 min",
			"5 h 5 min",
		]);

		expect(habits.writing).toHaveLength(5);
	});

	it("replays the 2001 pigeon log", () => {
		const log = lines("pigeon");

		expect(log.some((l) => l.text.includes("55% packet loss"))).toBe(true);
		expect(log.filter((l) => l.text.includes("time="))).toHaveLength(4);
	});
});
