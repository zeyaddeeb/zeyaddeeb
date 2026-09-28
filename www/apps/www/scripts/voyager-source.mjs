import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = new URL(
	"../../../packages/wasm/src/voyager.rs",
	import.meta.url,
);
const OUTPUT = new URL("../features/voyager/source-data.ts", import.meta.url);

export const excerpts = [
	"step",
	"fire",
	"signal_db",
	"relocate",
	"fits",
	"patch",
	"healthy",
	"frame",
	"command_bits",
];

export function extract(source, name) {
	const lines = source.split("\n");
	const start = lines.findIndex((l) =>
		new RegExp(`^\\s*(pub )?fn ${name}\\(`).test(l),
	);
	if (start < 0) throw new Error(`fn ${name} not found`);
	let depth = 0;
	let end = start;
	for (let i = start; i < lines.length; i++) {
		for (const ch of lines[i]) {
			if (ch === "{") depth++;
			if (ch === "}") depth--;
		}
		if (depth === 0 && lines[i].includes("}")) {
			end = i;
			break;
		}
	}
	const body = lines.slice(start, end + 1);
	const indent = Math.min(
		...body.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length),
	);
	return { line: start + 1, code: body.map((l) => l.slice(indent)).join("\n") };
}

export function build(source) {
	return Object.fromEntries(excerpts.map((n) => [n, extract(source, n)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const data = build(readFileSync(SOURCE, "utf8"));
	writeFileSync(
		OUTPUT,
		`export const source: Record<string, { line: number; code: string }> = ${JSON.stringify(data, null, "\t")};\n`,
	);
	console.log(`wrote ${Object.keys(data).length} excerpts`);
}
