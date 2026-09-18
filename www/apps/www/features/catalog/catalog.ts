export type ExperimentKind = "wasm" | "network" | "mic" | "remote" | "dom";

export type LiveSource =
	| "life"
	| "tiling"
	| "rain"
	| "crdt"
	| "audio"
	| "diarization"
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
	span?: { cols: number; rows: number };
}

export const experiments: Experiment[] = [
	{
		id: "game-of-life",
		number: 1,
		title: "Game of Life",
		line: "Draw cells, run Conway’s Game of Life, and compare Rust with JavaScript.",
		stack: ["Rust", "WASM", "Canvas"],
		href: "/experiments/game-of-life",
		kind: "wasm",
		live: "life",
		span: { cols: 4, rows: 2 },
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
		span: { cols: 2, rows: 2 },
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
		span: { cols: 3, rows: 1 },
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
		span: { cols: 3, rows: 1 },
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
		span: { cols: 2, rows: 1 },
	},
	{
		id: "speaker-diarization",
		number: 6,
		title: "Speaker Diarization",
		line: "An audio pipeline that identifies speaker changes and plots them on a timeline.",
		stack: ["Rust", "WebRTC", "ONNX", "Candle"],
		href: "/experiments/speaker-diarization",
		kind: "mic",
		live: "diarization",
		span: { cols: 2, rows: 1 },
	},
	{
		id: "portfolio",
		number: 7,
		title: "Portfolio Atlas",
		line: "Browse client projects on a draggable canvas.",
		stack: ["Canvas", "UX"],
		href: "/experiments/portfolio",
		kind: "dom",
		live: "portfolio",
		span: { cols: 2, rows: 1 },
	},
	{
		id: "story",
		number: 8,
		title: "From Floppy to Cloud",
		line: "My programming history, from a DOS prompt to Kubernetes and Rust, with each interface running.",
		stack: ["TypeScript", "Rust", "WASM"],
		href: "/story",
		kind: "dom",
		live: "story",
		span: { cols: 2, rows: 1 },
	},
	{
		id: "robot",
		number: 9,
		title: "RL Basketball Agent",
		line: "A basketball agent trained with reinforcement learning in Rust and Bevy.",
		stack: ["Rust", "Bevy", "SAC", "WASM"],
		href: "https://robot.zeyaddeeb.com",
		kind: "remote",
		live: "robot",
		external: true,
		span: { cols: 2, rows: 1 },
	},
	{
		id: "moonspell",
		number: 10,
		title: "Moonspell",
		line: "An interactive gallery pairing engineering concepts with paintings.",
		stack: ["Next.js", "GSAP", "Canvas"],
		href: "https://moonspell.fm/",
		kind: "remote",
		live: "moonspell",
		external: true,
		span: { cols: 2, rows: 1 },
	},
	{
		id: "wes-anderson",
		number: 11,
		title: "One Drawing, Eight Shots",
		line: "Make a Wes Anderson scene: one flat drawing, a camera that may only slide, cut, or zoom, and a screenplay that runs it.",
		stack: ["SVG viewBox", "SMIL", "Web Speech", "@property"],
		href: "/experiments/wes-anderson",
		kind: "dom",
		span: { cols: 4, rows: 2 },
	},
	{
		id: "deepseek",
		number: 12,
		title: "A very fancy calculator",
		line: "Train a small model inspired by DeepSeek V4.1 on Rust code, questions, and scored answers. Inspect live predictions and training results.",
		stack: ["Rust", "Candle", "Axum", "SSE", "SVG"],
		href: "/experiments/deepseek",
		kind: "network",
		span: { cols: 4, rows: 2 },
	},
];

export function getExperiment(id: string): Experiment {
	const found = experiments.find((e) => e.id === id);
	if (!found) throw new Error(`Unknown experiment: ${id}`);
	return found;
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
