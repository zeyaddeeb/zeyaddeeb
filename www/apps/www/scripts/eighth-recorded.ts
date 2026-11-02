import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ArchivedRun } from "../features/eighth/archive";
import { PRESETS, START } from "../features/eighth/deck";
import {
	type Clock,
	type Deal,
	parse,
	type Row,
	trial,
} from "../features/eighth/protocol";
import { score } from "../features/eighth/referee";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = process.argv[3] ?? "public/minus-one-eighth/recorded.json";

const SPECS: { id: string; deal: Deal; deck: readonly number[] }[] = [
	...PRESETS.map((p) => ({ id: p.id, deal: "deck" as const, deck: p.deck })),
	{ id: "talk", deal: "talk", deck: START },
	{ id: "dark", deal: "dark", deck: START },
	{ id: "fixed", deal: "fixed", deck: START },
];

async function record(spec: (typeof SPECS)[number]): Promise<ArchivedRun> {
	const response = await fetch(`${base}/experiments/minus-one-eighth/runs`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ deal: spec.deal, deck: spec.deck }),
	});

	if (!response.ok) throw new Error(`${spec.id}: HTTP ${response.status}`);

	let start: {
		west: string;
		east: string;
		light_us: number;
		pairs: number;
	} | null = null;
	let clocks: { west: Clock; east: Clock } | null = null;
	const rows: Row[] = [];

	for (const line of (await response.text()).split("\n")) {
		const event = parse(line);

		if (event?.type === "refused")
			throw new Error(`${spec.id}: refused (${event.reason})`);
		if (event?.type === "lost")
			throw new Error(`${spec.id}: ${event.site} went dark`);
		if (event?.type === "start") start = event;
		if (event?.type === "clocks")
			clocks = { west: event.west, east: event.east };
		if (event?.type === "trials") rows.push(...event.rows);
	}

	if (!start || !clocks) throw new Error(`${spec.id}: no run`);
	if (rows.length !== start.pairs)
		throw new Error(`${spec.id}: ${rows.length} of ${start.pairs} rows`);
	if (!clocks.west.measured || !clocks.east.measured)
		throw new Error(`${spec.id}: a clock was not measured`);
	if (start.light_us < 1000)
		throw new Error(
			`${spec.id}: ${start.west} and ${start.east} are too close to referee`,
		);

	return {
		id: spec.id,
		deal: spec.deal,
		deck: [...spec.deck],
		west: start.west,
		east: start.east,
		light_us: start.light_us,
		clocks,
		rows,
	};
}

const runs: ArchivedRun[] = [];

for (const spec of SPECS) {
	const run = await record(spec);
	const honest = score(
		run.rows.map(trial),
		spec.deal === "dark" ? "drop" : "honest",
	);

	console.log(
		`${spec.id.padEnd(7)} ${run.west} · ${run.east}  30°: ${((honest.agree[1] ?? 0) * 100).toFixed(1)}%`,
	);
	runs.push(run);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
	out,
	JSON.stringify({ version: 1, recorded: new Date().toISOString(), runs }),
);
console.log(`wrote ${runs.length} runs to ${out}`);
