import { pageMetadata } from "@zeyaddeeb/ui/seo";

export type ExperimentKind = "wasm" | "network" | "mic" | "remote" | "dom";

export type LiveSource =
	| "life"
	| "tiling"
	| "rain"
	| "crdt"
	| "audio"
	| "portfolio"
	| "robot"
	| "moonspell"
	| "story";

export interface Experiment {
	id: string;
	number: number;
	title: string;
	line: string;
	stack: string[];
	href: string;
	kind: ExperimentKind;
	live?: LiveSource;
	external?: boolean;
}

export const experiments: Experiment[] = [
	{
		id: "meat-content",
		number: 15,
		title: "Meat Content",
		line: "If everyone replies with “Claude said:”, how much of the conversation is people? An xkcd-style what-if with a gzip label, two people wired between two Claudes, and a ping slower than a pigeon.",
		stack: ["TypeScript", "CompressionStream", "SVG", "Branching processes"],
		href: "/experiments/meat-content",
		kind: "dom",
	},
	{
		id: "play-that-thing",
		number: 14,
		title: "Play That Thing",
		line: "Trade fours with Louis Armstrong, Johnny Dodds and Kid Ory, rebuilt from their own transcribed solos, and see which record every answer came from.",
		stack: ["TypeScript", "Web Audio", "Markov model", "Mini-notation"],
		href: "/experiments/play-that-thing",
		kind: "dom",
	},
	{
		id: "compute-crunch",
		number: 13,
		title: "Compute Crunch",
		line: "Route the world’s AI demand by hand, then watch a linear program beat you and put a price on every constraint.",
		stack: ["Python", "OR-Tools", "FastAPI", "Linear programming"],
		href: "/experiments/compute-crunch",
		kind: "network",
	},
	{
		id: "game-of-life",
		number: 1,
		title: "Game of Life",
		line: "Draw cells, run Conway’s Game of Life, and compare Rust with JavaScript.",
		stack: ["Rust", "WASM", "Canvas"],
		href: "/experiments/game-of-life",
		kind: "wasm",
		live: "life",
	},
	{
		id: "circle-limit",
		number: 2,
		title: "Circle Limit",
		line: "Six animated hyperbolic tilings inspired by M. C. Escher.",
		stack: ["Rust", "WASM", "Hyperbolic geometry"],
		href: "/experiments/circle-limit",
		kind: "wasm",
		live: "tiling",
	},
	{
		id: "crdt",
		number: 3,
		title: "CRDT Editor",
		line: "A shared text editor that syncs changes between browsers and handles offline edits.",
		stack: ["Rust", "WASM", "RGA", "WebSocket", "SurrealDB"],
		href: "/experiments/crdt",
		kind: "network",
		live: "crdt",
	},
	{
		id: "pretext-matrix",
		number: 4,
		title: "Falling Code",
		line: "Matrix-style falling text, laid out with Pretext and animated with CSS.",
		stack: ["Pretext", "CSS", "Typography"],
		href: "/experiments/pretext-matrix",
		kind: "dom",
		live: "rain",
	},
	{
		id: "audio-visualizer",
		number: 5,
		title: "Audio Visualizer",
		line: "See the frequencies in your microphone’s audio, with four display modes.",
		stack: ["Rust", "WASM", "Web Audio"],
		href: "/experiments/audio-visualizer",
		kind: "mic",
		live: "audio",
	},
	{
		id: "portfolio",
		number: 6,
		title: "Portfolio Atlas",
		line: "Browse client projects on a draggable canvas.",
		stack: ["Canvas", "UX"],
		href: "/experiments/portfolio",
		kind: "dom",
		live: "portfolio",
	},
	{
		id: "story",
		number: 7,
		title: "From Floppy to Cloud",
		line: "My programming history, from a DOS prompt to Kubernetes and Rust, with each interface running.",
		stack: ["TypeScript", "Rust", "WASM"],
		href: "/story",
		kind: "dom",
		live: "story",
	},
	{
		id: "robot",
		number: 8,
		title: "RL Basketball Agent",
		line: "A basketball agent trained with reinforcement learning in Rust and Bevy.",
		stack: ["Rust", "Bevy", "SAC", "WASM"],
		href: "https://robot.zeyaddeeb.com",
		kind: "remote",
		live: "robot",
		external: true,
	},
	{
		id: "moonspell",
		number: 9,
		title: "Moonspell",
		line: "An interactive gallery pairing engineering concepts with paintings.",
		stack: ["Next.js", "GSAP", "Canvas"],
		href: "https://moonspell.fm/",
		kind: "remote",
		live: "moonspell",
		external: true,
	},
	{
		id: "wes-anderson",
		number: 10,
		title: "One Drawing, Eight Shots",
		line: "Make a Wes Anderson scene: one flat drawing, a camera that may only slide, cut, or zoom, and a screenplay that runs it.",
		stack: ["SVG viewBox", "SMIL", "Web Speech", "@property"],
		href: "/experiments/wes-anderson",
		kind: "dom",
	},
	{
		id: "deepseek",
		number: 11,
		title: "Educated Guessing Machines",
		line: "Train a small model inspired by DeepSeek V4.1 on Rust code, questions, and scored answers. Inspect live predictions and training results.",
		stack: ["Rust", "Candle", "Axum", "SSE", "SVG"],
		href: "/experiments/deepseek",
		kind: "network",
	},
	{
		id: "proofs",
		number: 12,
		title: "No Goals",
		line: "Try writing a few proofs in Lean, from 2 + 2 = 4 to induction, then watch an agent work on the Riemann hypothesis around the clock.",
		stack: ["Lean 4", "Mathlib", "Rust", "Axum", "rig", "SurrealDB"],
		href: "/experiments/proofs",
		kind: "network",
	},
];

export function getExperiment(id: string): Experiment {
	const found = experiments.find((e) => e.id === id);
	if (!found) throw new Error(`Unknown experiment: ${id}`);
	return found;
}

export function experimentMetadata(id: string, description: string) {
	const { href, title } = getExperiment(id);
	return pageMetadata({
		path: href,
		section: "Experiments",
		title,
		description,
	});
}

export const number = (n: number) => String(n).padStart(2, "0");

export function neighbors(id: string) {
	const index = experiments.findIndex((e) => e.id === id);
	if (index < 0) return null;
	const local = experiments.filter((e) => !e.external);
	const li = local.findIndex((e) => e.id === id);
	return {
		prev: local[(li - 1 + local.length) % local.length],
		next: local[(li + 1) % local.length],
	};
}
