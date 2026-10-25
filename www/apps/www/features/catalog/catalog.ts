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

export type Series = "guessing-machines" | "small-enough-to-hold";

const seriesTitles: Record<Series, string> = {
	"guessing-machines": "Guessing machines",
	"small-enough-to-hold": "Small Enough to Hold",
};

export interface Experiment {
	id: string;
	number: number;
	title: string;
	line: string;
	stack: string[];
	href: string;
	topics: Topic[];
	series?: Series;
	live?: LiveSource;
	external?: boolean;
}

export const experiments: Experiment[] = [
	{
		id: "show-your-work",
		number: 27,
		title: "Show Your Work",
		line: "Play a five-cup shell game against two small transformers—one answering in a single pass, one writing step-by-step notes—and a live reasoning model.",
		stack: ["Rust", "Candle", "WASM", "llama.cpp", "SSE"],
		href: "/experiments/show-your-work",
		topics: ["ai", "math"],
		series: "guessing-machines",
	},
	{
		id: "four-ways-to-be-wrong",
		number: 26,
		title: "Four Ways to Be Wrong",
		line: "Model how far intraperitoneal chemotherapy penetrates a tumor nodule, and follow a research agent that pre-registers claims against the same solver.",
		stack: ["Python", "FastAPI", "DuckDB", "Pharmacokinetics"],
		href: "/experiments/four-ways-to-be-wrong",
		topics: ["ai", "other"],
		series: "small-enough-to-hold",
	},
	{
		id: "the-smallest-red-pen",
		number: 25,
		title: "The Smallest Red Pen",
		line: "Design CRISPR guides, base edits, and prime edits on real KRAS sequence to target a single-letter cancer mutation without cutting the healthy copy.",
		stack: ["TypeScript", "three.js", "WebGL", "Genomics"],
		href: "/experiments/the-smallest-red-pen",
		topics: ["other", "graphics"],
		series: "small-enough-to-hold",
	},
	{
		id: "cut-on-the-bias",
		number: 24,
		title: "Cut on the Bias",
		line: "Drape woven cloth over a sphere, a saddle, and a torus using Chebyshev nets, and inspect the flat patterns a tailor would cut.",
		stack: ["TypeScript", "three.js", "Chebyshev nets", "GLSL"],
		href: "/experiments/cut-on-the-bias",
		topics: ["math", "graphics"],
	},
	{
		id: "good-on-paper",
		number: 23,
		title: "Good on Paper",
		line: "Explore reward hacking in two parts: rewrite the reward function for a racing boat, then adjust the incentives behind an evaluation break-in.",
		stack: ["TypeScript", "Policy iteration", "Breadth-first search", "Canvas"],
		href: "/experiments/good-on-paper",
		topics: ["ai", "math"],
	},
	{
		id: "any-semblance",
		number: 22,
		title: "Any Semblance of My Speech",
		line: "Alvin Lucier’s I Am Sitting in a Room rebuilt with speech recognition and voice cloning: record a sentence and hear it re-synthesized across generations.",
		stack: ["Rust", "Candle", "WebSocket", "WebRTC", "Opus", "Whisper"],
		href: "/experiments/any-semblance",
		topics: ["sound", "ai"],
	},
	{
		id: "already-sealed",
		number: 21,
		title: "Already Sealed",
		line: "Play Newcomb’s problem against a pattern-matching predictor or a simulated copy of yourself, with each prediction sealed by SHA-256 before you choose.",
		stack: ["TypeScript", "Web Crypto", "SHA-256", "Aaronson’s oracle"],
		href: "/experiments/already-sealed",
		topics: ["ai", "math"],
		series: "guessing-machines",
	},
	{
		id: "every-program",
		number: 20,
		title: "Every Program at Once",
		line: "Enter a number sequence and watch 840,000 short programs vote on the next term, weighted by length after Solomonoff induction.",
		stack: ["Rust", "WASM", "Solomonoff induction", "Canvas"],
		href: "/experiments/every-program",
		topics: ["ai", "math"],
		series: "guessing-machines",
	},
	{
		id: "lost-in-translation",
		number: 19,
		title: "Lost in Translation",
		line: "Compare preclinical cell-line drug sensitivity predictions from DepMap against 25,000 patient treatment records from MSK-CHORD.",
		stack: ["Python", "PyMC", "DuckDB", "DepMap", "MSK-CHORD"],
		href: "/experiments/lost-in-translation",
		topics: ["math", "graphics"],
	},
	{
		id: "how-cold-is-space",
		number: 18,
		title: "How Cold Is Space",
		line: "Match an internal reference heater to COBE FIRAS sky data to measure the cosmic microwave background temperature and the solar system’s dipole velocity.",
		stack: ["Rust", "WASM", "Rerun", "three.js", "COBE FIRAS"],
		href: "/experiments/how-cold-is-space",
		topics: ["math", "graphics"],
	},
	{
		id: "attractor",
		number: 17,
		title: "Which Way It Turns",
		line: "Simulate a Malkus waterwheel in Rust and trace how flow rate moves the Lorenz system through fixed points, limit cycles, and chaos.",
		stack: ["Rust", "WASM", "Runge–Kutta", "Canvas", "SVG"],
		href: "/experiments/attractor",
		topics: ["math", "graphics"],
	},
	{
		id: "voyager",
		number: 16,
		title: "One Light-Day",
		line: "Inspect Voyager 1 in 3D, run simulations of its attitude control and 2024 memory-chip repair in Rust, and decode the Golden Record cover.",
		stack: ["Rust", "WASM", "Canvas 3D", "Web Audio", "JPL Horizons"],
		href: "/experiments/voyager",
		topics: ["systems", "graphics"],
	},
	{
		id: "meat-content",
		number: 15,
		title: "Meat Content",
		line: "Interactive estimates of what happens when people relay AI outputs to each other, using gzip compression, reading-time models, and RFC 1149.",
		stack: ["TypeScript", "CompressionStream", "SVG", "Branching processes"],
		href: "/experiments/meat-content",
		topics: ["ai", "math"],
	},
	{
		id: "play-that-thing",
		number: 14,
		title: "Play That Thing",
		line: "Trade four-bar solos over a twelve-bar blues with Markov models built from transcribed 1920s recordings of Louis Armstrong, Johnny Dodds, and Kid Ory.",
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
		series: "guessing-machines",
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

export const secrets: Experiment[] = [
	{
		id: "desktop-disco",
		number: 0,
		title: "Desktop Disco",
		line: "The 2003 Windows XP Plus! Dancers rebuilt in WebGL and Web Audio: queue clips from their transition tables and sync playback to the beat.",
		stack: ["TypeScript", "Canvas", "WebGL", "Web Audio", "Real-ESRGAN"],
		href: "/experiments/desktop-disco",
		topics: ["sound", "graphics"],
	},
];

const isSecret = (id: string) => secrets.some((e) => e.id === id);

export function getExperiment(id: string): Experiment {
	const found = [...experiments, ...secrets].find((e) => e.id === id);

	if (!found) throw new Error(`Unknown experiment: ${id}`);

	return found;
}

export function seriesOf(experiment: Experiment) {
	const { series } = experiment;

	if (!series) return null;

	const parts = experiments
		.filter((e) => e.series === series)
		.sort((a, b) => a.number - b.number);

	return {
		title: seriesTitles[series],
		parts,
		part: parts.findIndex((e) => e.id === experiment.id) + 1,
	};
}

export function experimentMetadata(id: string, description: string) {
	const { href, title } = getExperiment(id);

	return pageMetadata({
		path: href,
		section: "Experiments",
		title,
		description,
		noIndex: isSecret(id),
	});
}

export const number = (n: number) => String(n).padStart(2, "0");

export function neighbors(id: string) {
	const local = [...experiments, ...secrets]
		.filter((e) => !e.external && (!isSecret(e.id) || e.id === id))
		.sort((a, b) => a.number - b.number);

	const li = local.findIndex((e) => e.id === id);

	if (li < 0) return null;

	return {
		prev: local[(li - 1 + local.length) % local.length],
		next: local[(li + 1) % local.length],
	};
}
