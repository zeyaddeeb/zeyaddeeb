import { pageMetadata } from "@zeyaddeeb/ui/seo";

export type Topic =
	| "ai"
	| "math"
	| "graphics"
	| "design"
	| "systems"
	| "sound"
	| "other";

export const topics: { value: Topic; label: string }[] = [
	{ value: "ai", label: "AI" },
	{ value: "math", label: "Math" },
	{ value: "graphics", label: "Graphics" },
	{ value: "design", label: "Design" },
	{ value: "systems", label: "Systems" },
	{ value: "sound", label: "Sound" },
	{ value: "other", label: "Other" },
];

export const topicLabel = (topic: Topic) =>
	topics.find((t) => t.value === topic)?.label ?? topic;

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
	topics: Topic[];
	live?: LiveSource;
	external?: boolean;
}

export const experiments: Experiment[] = [
	{
		id: "lost-in-translation",
		number: 19,
		title: "Lost in Translation",
		line: "Cancer drugs are tried on cells in a dish long before patients. Here every dish prediction meets 25,000 real patient records, one split square at a time.",
		stack: ["Python", "PyMC", "DuckDB", "DepMap", "MSK-CHORD"],
		href: "/experiments/lost-in-translation",
		topics: ["math", "graphics"],
	},
	{
		id: "how-cold-is-space",
		number: 18,
		title: "How Cold Is Space",
		line: "Hold a heater up to the sky and turn it until you can’t tell them apart, the way COBE did in 1990. Then point it the other way and find out how fast we’re moving.",
		stack: ["Rust", "WASM", "Rerun", "three.js", "COBE FIRAS"],
		href: "/experiments/how-cold-is-space",
		topics: ["math", "graphics"],
	},
	{
		id: "attractor",
		number: 17,
		title: "Which Way It Turns",
		line: "Pour water on a wheel of leaky cups and watch where it ends up: at rest, turning one way, rocking like a clock, or tumbling forever. One tap walks through every kind of attractor.",
		stack: ["Rust", "WASM", "Runge–Kutta", "Canvas", "SVG"],
		href: "/experiments/attractor",
		topics: ["math", "graphics"],
	},
	{
		id: "voyager",
		number: 16,
		title: "One Light-Day",
		line: "Voyager 1 taken apart: spin the spacecraft, run its flight computers in Rust, save it from a dead memory chip, and read the Golden Record’s cover the way it was meant to be read.",
		stack: ["Rust", "WASM", "Canvas 3D", "Web Audio", "JPL Horizons"],
		href: "/experiments/voyager",
		topics: ["systems", "graphics"],
	},
	{
		id: "meat-content",
		number: 15,
		title: "Meat Content",
		line: "If everyone replies with “Claude said:”, how much of the conversation is people? An xkcd-style what-if with a gzip label, two people wired between two Claudes, and a ping slower than a pigeon.",
		stack: ["TypeScript", "CompressionStream", "SVG", "Branching processes"],
		href: "/experiments/meat-content",
		topics: ["ai", "math"],
	},
	{
		id: "play-that-thing",
		number: 14,
		title: "Play That Thing",
		line: "Trade fours with Louis Armstrong, Johnny Dodds and Kid Ory, rebuilt from their own transcribed solos, and see which record every answer came from.",
		stack: ["TypeScript", "Web Audio", "Markov model", "Mini-notation"],
		href: "/experiments/play-that-thing",
		topics: ["sound", "ai"],
	},
	{
		id: "compute-crunch",
		number: 13,
		title: "Compute Crunch",
		line: "Route the world’s AI demand by hand, then watch a linear program beat you and put a price on every constraint.",
		stack: ["Python", "OR-Tools", "FastAPI", "Linear programming"],
		href: "/experiments/compute-crunch",
		topics: ["math", "systems"],
	},
	{
		id: "game-of-life",
		number: 1,
		title: "Game of Life",
		line: "Draw cells, run Conway’s Game of Life, and compare Rust with JavaScript.",
		stack: ["Rust", "WASM", "Canvas"],
		href: "/experiments/game-of-life",
		topics: ["graphics", "math"],
		live: "life",
	},
	{
		id: "circle-limit",
		number: 2,
		title: "Circle Limit",
		line: "Six animated hyperbolic tilings inspired by M. C. Escher.",
		stack: ["Rust", "WASM", "Hyperbolic geometry"],
		href: "/experiments/circle-limit",
		topics: ["math", "graphics"],
		live: "tiling",
	},
	{
		id: "crdt",
		number: 3,
		title: "CRDT Editor",
		line: "A shared text editor that syncs changes between browsers and handles offline edits.",
		stack: ["Rust", "WASM", "RGA", "WebSocket", "SurrealDB"],
		href: "/experiments/crdt",
		topics: ["systems"],
		live: "crdt",
	},
	{
		id: "pretext-matrix",
		number: 4,
		title: "Falling Code",
		line: "Matrix-style falling text, laid out with Pretext and animated with CSS.",
		stack: ["Pretext", "CSS", "Typography"],
		href: "/experiments/pretext-matrix",
		topics: ["graphics", "design"],
		live: "rain",
	},
	{
		id: "audio-visualizer",
		number: 5,
		title: "Audio Visualizer",
		line: "See the frequencies in your microphone’s audio, with four display modes.",
		stack: ["Rust", "WASM", "Web Audio"],
		href: "/experiments/audio-visualizer",
		topics: ["sound", "graphics"],
		live: "audio",
	},
	{
		id: "portfolio",
		number: 6,
		title: "Portfolio Atlas",
		line: "Browse client projects on a draggable canvas.",
		stack: ["Canvas", "UX"],
		href: "/experiments/portfolio",
		topics: ["design"],
		live: "portfolio",
	},
	{
		id: "story",
		number: 7,
		title: "From Floppy to Cloud",
		line: "My programming history, from a DOS prompt to Kubernetes and Rust, with each interface running.",
		stack: ["TypeScript", "Rust", "WASM"],
		href: "/story",
		topics: ["other"],
		live: "story",
	},
	{
		id: "robot",
		number: 8,
		title: "RL Basketball Agent",
		line: "A basketball agent trained with reinforcement learning in Rust and Bevy.",
		stack: ["Rust", "Bevy", "SAC", "WASM"],
		href: "https://robot.zeyaddeeb.com",
		topics: ["ai"],
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
		topics: ["design"],
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
		topics: ["design", "graphics"],
	},
	{
		id: "deepseek",
		number: 11,
		title: "Educated Guessing Machines",
		line: "Train a small model inspired by DeepSeek V4.1 on Rust code, questions, and scored answers. Inspect live predictions and training results.",
		stack: ["Rust", "Candle", "Axum", "SSE", "SVG"],
		href: "/experiments/deepseek",
		topics: ["ai"],
	},
	{
		id: "proofs",
		number: 12,
		title: "No Goals",
		line: "Try writing a few proofs in Lean, from 2 + 2 = 4 to induction, then watch an agent work on the Riemann hypothesis around the clock.",
		stack: ["Lean 4", "Mathlib", "Rust", "Axum", "rig", "SurrealDB"],
		href: "/experiments/proofs",
		topics: ["math", "ai"],
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
	const local = experiments
		.filter((e) => !e.external)
		.sort((a, b) => a.number - b.number);

	const li = local.findIndex((e) => e.id === id);

	if (li < 0) return null;

	return {
		prev: local[(li - 1 + local.length) % local.length],
		next: local[(li + 1) % local.length],
	};
}
