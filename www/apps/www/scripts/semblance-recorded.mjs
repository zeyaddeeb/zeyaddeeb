import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const voice = join(here, "../../../../voice");
const target = join(here, "../features/semblance/recorded.ts");
const tape = join(voice, "house.tape");
const [recording, generations = "36"] = process.argv.slice(2);
const features = process.env.VOICE_FEATURES
	? ["--features", process.env.VOICE_FEATURES]
	: [];

if (!recording) {
	console.error(
		"usage: node scripts/semblance-recorded.mjs <wav> [generations]",
	);
	process.exit(1);
}

const run = spawnSync(
	"cargo",
	[
		"run",
		"--release",
		"--quiet",
		...features,
		"--",
		"house",
		resolve(recording),
		tape,
		generations,
	],
	{ cwd: voice, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

if (run.status !== 0) {
	console.error(run.stderr);
	process.exit(run.status ?? 1);
}

const round = (value, places) => Number(value.toFixed(places));
const recorded = run.stdout
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line))
	.map((generation) => ({
		...generation,
		likeness: round(generation.likeness, 3),
		seconds: round(generation.seconds, 2),
	}));

writeFileSync(
	target,
	`import type { Generation } from "./piece";\n\nexport const RECORDED: Generation[] = ${JSON.stringify(recorded)};\n`,
);

console.log(`${recorded.length} generations written to ${target} and ${tape}`);
