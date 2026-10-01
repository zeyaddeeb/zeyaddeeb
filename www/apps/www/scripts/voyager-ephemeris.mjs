import { writeFileSync } from "node:fs";

const API = "https://ssd.jpl.nasa.gov/api/horizons.api";
const OUTPUT = new URL(
	"../features/voyager/ephemeris-data.ts",
	import.meta.url,
);

async function table(start, stop, step) {
	const params = new URLSearchParams({
		format: "text",
		COMMAND: "'-31'",
		OBJ_DATA: "'NO'",
		MAKE_EPHEM: "'YES'",
		EPHEM_TYPE: "'OBSERVER'",
		CENTER: "'500@399'",
		START_TIME: `'${start}'`,
		STOP_TIME: `'${stop}'`,
		STEP_SIZE: `'${step}'`,
		QUANTITIES: "'19,20'",
		CSV_FORMAT: "'YES'",
	});

	const response = await fetch(`${API}?${params}`);

	if (!response.ok) throw new Error(`Horizons: ${response.status}`);

	const text = await response.text();
	const body = text.split("$$SOE")[1]?.split("$$EOE")[0];

	if (!body) throw new Error(text.slice(0, 400));

	return body
		.trim()
		.split("\n")
		.map((line) => {
			const cells = line.split(",").map((c) => c.trim());

			const [r, rdot, delta, deldot] = cells
				.slice(1)
				.filter((c) => c !== "")
				.map(Number);

			if (![r, rdot, delta, deldot].every(Number.isFinite)) {
				throw new Error(`bad row: ${line}`);
			}

			return { date: iso(cells[0]), r, rdot, delta, deldot };
		});
}

const MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";

function iso(stamp) {
	const [y, m, d] = stamp.split(" ")[0].split("-");
	const month = String(MONTHS.indexOf(m) / 3 + 1).padStart(2, "0");

	return `${y}-${month}-${d}`;
}

const round = (n, d) => Number(n.toFixed(d));

const weekly = await table("2024-01-01", "2032-01-01", "7 d");
const yearly = await table("1977-09-06", "2031-09-06", "1 y");

const lines = [
	"export const weekly = {",
	`\tstart: "${weekly[0].date}",`,
	"\tstepDays: 7,",
	`\tdelta: [${weekly.map((w) => round(w.delta, 9)).join(", ")}],`,
	`\tdeldot: [${weekly.map((w) => round(w.deldot, 5)).join(", ")}],`,
	`\tr: [${weekly.map((w) => round(w.r, 9)).join(", ")}],`,
	`\trdot: [${weekly.map((w) => round(w.rdot, 5)).join(", ")}],`,
	"};",
	"",
	"export const yearly = [",
	...yearly.map(
		(y) =>
			`\t{ date: "${y.date}", r: ${round(y.r, 4)}, rdot: ${round(y.rdot, 3)} },`,
	),
	"];",
	"",
];

writeFileSync(OUTPUT, lines.join("\n"));
console.log(`wrote ${weekly.length} weekly and ${yearly.length} yearly rows`);
