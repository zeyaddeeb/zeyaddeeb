"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLenis } from "lenis/react";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface Chapter {
	id: string;
	era: string;
	label: string;
	lead: string;
	title: string;
	titleLines: string[];
	titleGhost: string;
	body: string;
	quote: string;
	tags: string[];
	accent: string;
	bg: string;
	fg: string;
	muted: string;
	invert?: boolean;
	artifact: {
		type:
			| "hardware"
			| "terminal"
			| "game"
			| "code"
			| "web"
			| "cluster"
			| "rust"
			| "ai";
		lines: string[];
	};
}

const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='0.7' filter='url(%23n)'/%3E%3C/svg%3E")`;

const gameTiles = Array.from({ length: 64 }, (_, i) => ({
	id: `tile-${Math.floor(i / 8)}-${i % 8}`,
	index: i,
}));

const clusterNodes = Array.from({ length: 9 }, (_, i) => ({
	id: `node-${Math.floor(i / 3)}-${i % 3}`,
	index: i,
}));

const chapters: Chapter[] = [
	{
		id: "assembling",
		era: "Early 1990s",
		label: "Assembling the machine",
		lead: "Motherboard, CPU, RAM, GPU, HDD. A box of parts became a machine that could be told what to do.",
		title: "Building blocks",
		titleLines: ["Building", "blocks"],
		titleGhost: "ASSEMBLE",
		body: "The first time I built a PC from parts,it was like putting together a puzzle with no picture on the box. Each component either clicked into place or didn’t fit at all. When it finally powered on, it felt like I had created something from nothing.",
		quote: "The machine was something I put together with my own hands.",
		tags: ["HARDWARE", "DIY", "FIRST BUILD"],
		accent: "#ff2ef5",
		bg: "#0a0a0a",
		fg: "#f5f0e8",
		muted: "rgba(245,240,232,0.58)",
		invert: true,
		artifact: {
			type: "hardware",
			lines: ["CPU: 486", "RAM: 8MB", "HDD: 120MB", "GPU: SVGA"],
		},
	},
	{
		id: "dos",
		era: "Early 1990s",
		label: "First contact",
		lead: "The dark screen with a blinking cursor.",
		title: "Blinking cursor",
		titleLines: ["Blinking", "cursor"],
		titleGhost: "C:\\>",
		body: "It started with a black screen and a cursor. No instructions, no clues, just a quiet invitation to type. All what I wanted to do is to play prince of persia but first I had to learn how to talk to the machine.",
		quote: "The first interface was a blank slate.",
		tags: ["DOS", "COMMANDS", "PATIENCE"],
		accent: "#ff4d2e",
		bg: "#0a0a0a",
		fg: "#f5f0e8",
		muted: "rgba(245,240,232,0.58)",
		invert: true,
		artifact: {
			type: "terminal",
			lines: ["C:\\> dir", "GAMES       <DIR>", "PRINCE.EXE", "C:\\> _"],
		},
	},
	{
		id: "prince",
		era: "1992",
		label: "Two floppy disks",
		lead: "thirty minutes of anticipation before the world appeared.",
		title: "Prince of Persia",
		titleLines: ["Prince", "of Persia"],
		titleGhost: "PERSIA",
		body: "A pixelated prince leapt over guards, missed ledges, and fell into spikes. It was the first time software felt less like a tool and more like a place someone had imagined into existence.",
		quote: "Loading became part of the myth.",
		tags: ["FLOPPY", "GAMEPLAY", "WORLD"],
		accent: "#1f6feb",
		bg: "#f4efe6",
		fg: "#101010",
		muted: "rgba(16,16,16,0.62)",
		artifact: {
			type: "game",
			lines: ["LIFE  III", "SWORD READY", "00:59", "LEVEL 01"],
		},
	},
	{
		id: "basic",
		era: "1999",
		label: "School lab",
		lead: "Thought became instruction, and instruction became output.",
		title: "Hello, World",
		titleLines: ["Hello,", "World"],
		titleGhost: "BASIC",
		body: "QBasic made the machine feel responsive in a new way. It did exactly what I told it, which also meant it exposed every assumption I forgot to write down.",
		quote: "Control arrived as a blue screen.",
		tags: ["QBASIC", "PRINT", "RUN"],
		accent: "#14a06f",
		bg: "#e7f0ec",
		fg: "#0e1815",
		muted: "rgba(14,24,21,0.62)",
		artifact: {
			type: "code",
			lines: ['10 PRINT "HELLO, WORLD"', "20 GOTO 10", "RUN", "HELLO, WORLD"],
		},
	},
	{
		id: "web",
		era: "2003",
		label: "View source",
		lead: "The secret door was just plain text in the browser menu.",
		title: "Markup fever",
		titleLines: ["Markup", "fever"],
		titleGhost: "HTML",
		body: "Right-click, View Source. Suddenly the surface of the web had a skeleton. A library book taught me HTML, then CSS, and the page stopped being magic without becoming less magical.",
		quote: "The web was readable by anyone curious enough.",
		tags: ["HTML", "CSS", "SOURCE"],
		accent: "#f5a524",
		bg: "#111827",
		fg: "#f8fafc",
		muted: "rgba(248,250,252,0.58)",
		invert: true,
		artifact: {
			type: "web",
			lines: ["<html>", "<body>", "<h1>hello</h1>", "</body>"],
		},
	},
	{
		id: "python",
		era: "2008-2015",
		label: "The simple, the powerful, and the unexpected",
		lead: "Python was simple, powerful, and full of surprises.",
		title: "func()",
		titleLines: ["func()"],
		titleGhost: "PYTHON",
		body: "I started with Python 2 because it was the language of a popular Minecraft modding tutorial. It felt like a more polite version of JavaScript, with fewer ways to shoot myself in the foot. But as I built more, I found libraries that did way more than I expected, and the weird parts of Python became a map to new possibilities.",
		quote: "The language was a toolbox with some hidden compartments.",
		tags: ["PYTHON", "LIBRARIES", "SURPRISES"],
		accent: "#d81e5b",
		bg: "#fff7ed",
		fg: "#17120f",
		muted: "rgba(23,18,15,0.61)",
		artifact: {
			type: "code",
			lines: ["def func():", "  print('hello')", "func()", "hello"],
		},
	},
	{
		id: "cloud",
		era: "2016-2020",
		label: "Systems thinking",
		lead: "The app became infrastructure, and infrastructure became product.",
		title: "Kubectl apply",
		titleLines: ["Kubectl", "apply"],
		titleGhost: "CLOUD",
		body: "Docker made the application portable. Kubernetes made the system explicit. I stopped thinking only in functions and started thinking in rollout, recovery, traces, and blast radius.",
		quote: "The shape of software got bigger.",
		tags: ["DOCKER", "K8S", "TRACING"],
		accent: "#7c3aed",
		bg: "#eef2ff",
		fg: "#111322",
		muted: "rgba(17,19,34,0.62)",
		artifact: {
			type: "cluster",
			lines: [
				"deployment.apps/api",
				"service/web",
				"pods 12/12",
				"rollout complete",
			],
		},
	},
	{
		id: "rust",
		era: "2020-current",
		label: "Compiler as teacher",
		lead: "A language that refused to let me hand-wave memory.",
		title: "Borrow checked",
		titleLines: ["Borrow", "checked"],
		titleGhost: "RUST",
		body: "Rust was exacting in the best way. No garbage collector, no undefined behavior, no vague ownership. Every error message was a small lesson in building with more care.",
		quote: "The compiler made rigor feel humane.",
		tags: ["OWNERSHIP", "WASM", "SAFETY"],
		accent: "#ff6b35",
		bg: "#16110f",
		fg: "#fff4ea",
		muted: "rgba(255,244,234,0.58)",
		invert: true,
		artifact: {
			type: "rust",
			lines: ["fn main() {", "  let x = String::new();", "  borrow(&x);", "}"],
		},
	},
	{
		id: "now",
		era: "Now",
		label: "Still building",
		lead: "AI, collaboration, inference, and the old cursor blinking back.",
		title: "What comes next",
		titleLines: ["What", "comes next"],
		titleGhost: "NOW",
		body: "Kubernetes, Rust, AI. Real-time collaboration, distributed inference, language models that write and read code. The old cursor is still here, but now it feels like a doorway.",
		quote: "The prompt is another beginning.",
		tags: ["AI", "REALTIME", "NEXT"],
		accent: "#00a7c7",
		bg: "#eef8fb",
		fg: "#061317",
		muted: "rgba(6,19,23,0.62)",
		artifact: {
			type: "ai",
			lines: [
				"user: build the thing",
				"assistant: thinking",
				"tool: run tests",
				"done.",
			],
		},
	},
];

function Artifact({ chapter }: { chapter: Chapter }) {
	const isGame = chapter.artifact.type === "game";
	const isCluster = chapter.artifact.type === "cluster";

	return (
		<div
			className="artifact relative min-h-[19rem] overflow-hidden border p-5 md:min-h-[25rem] md:p-7"
			style={{
				borderColor: chapter.invert
					? "rgba(245,240,232,0.18)"
					: "rgba(0,0,0,0.18)",
				background: chapter.invert
					? "rgba(255,255,255,0.035)"
					: "rgba(255,255,255,0.54)",
				color: chapter.fg,
			}}
		>
			<div
				className="absolute inset-0 opacity-[0.12]"
				style={{ backgroundImage: NOISE }}
			/>
			<div
				className="absolute inset-x-0 top-0 h-2"
				style={{ background: chapter.accent }}
			/>
			<div className="relative z-10 flex h-full flex-col justify-between gap-8">
				<div className="flex items-center justify-between border-b pb-4 font-mono text-[0.58rem] uppercase leading-none tracking-[0.28em] opacity-70">
					<span>{chapter.artifact.type}</span>
					<span>{chapter.era}</span>
				</div>

				<div className="relative flex min-h-40 items-center justify-center">
					{isGame ? (
						<div className="grid w-full max-w-[20rem] grid-cols-8 gap-1">
							{gameTiles.map((tile) => (
								<div
									key={tile.id}
									className="aspect-square border"
									style={{
										borderColor: chapter.invert
											? "rgba(255,255,255,0.08)"
											: "rgba(0,0,0,0.08)",
										background:
											tile.index === 43 || tile.index === 28
												? chapter.accent
												: tile.index > 47 || tile.index % 9 === 0
													? "currentColor"
													: "transparent",
										opacity: tile.index > 47 || tile.index % 9 === 0 ? 0.22 : 1,
									}}
								/>
							))}
						</div>
					) : isCluster ? (
						<div className="grid w-full max-w-[21rem] grid-cols-3 gap-3">
							{clusterNodes.map((node) => (
								<div
									key={node.id}
									className="aspect-square border p-2"
									style={{
										borderColor: chapter.accent,
										background:
											node.index % 2 === 0
												? `${chapter.accent}16`
												: "transparent",
									}}
								>
									<div
										className="h-full w-full"
										style={{
											background:
												node.index === 4 ? chapter.accent : "currentColor",
											opacity: node.index === 4 ? 1 : 0.12,
										}}
									/>
								</div>
							))}
						</div>
					) : (
						<div
							className="w-full max-w-[24rem] border px-4 py-5 font-mono text-[0.74rem] leading-7 md:text-[0.85rem]"
							style={{
								borderColor: chapter.accent,
								boxShadow: `12px 12px 0 ${chapter.accent}`,
							}}
						>
							{chapter.artifact.lines.map((line) => (
								<div key={line} className="artifact-line whitespace-nowrap">
									{line}
								</div>
							))}
						</div>
					)}
				</div>

				<div className="grid grid-cols-2 gap-3 font-mono text-[0.54rem] uppercase leading-none tracking-[0.24em] opacity-60 md:grid-cols-4">
					{chapter.tags.map((tag) => (
						<span key={tag} className="border-t pt-3">
							{tag}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

export default function StoryPage() {
	const containerRef = useRef<HTMLElement>(null);
	const progressFillRef = useRef<HTMLDivElement>(null);

	useLenis(({ scroll, limit }) => {
		ScrollTrigger.update();
		if (progressFillRef.current && limit > 0) {
			progressFillRef.current.style.transform = `scaleX(${scroll / limit})`;
		}
	});

	useGSAP(
		() => {
			const heroTl = gsap.timeline({ delay: 0.15 });
			heroTl
				.from(".hero-meta", {
					opacity: 0,
					y: 12,
					duration: 0.55,
					ease: "power2.out",
				})
				.from(
					".hero-word",
					{
						yPercent: 108,
						duration: 1.08,
						stagger: 0.08,
						ease: "power4.out",
					},
					"-=0.2",
				)
				.from(
					".hero-panel",
					{
						opacity: 0,
						y: 32,
						duration: 0.85,
						ease: "power3.out",
					},
					"-=0.55",
				);

			for (const chapter of chapters) {
				const el = document.getElementById(`chapter-${chapter.id}`);
				if (!el) continue;

				const tl = gsap.timeline({
					scrollTrigger: {
						trigger: el,
						start: "top top",
						end: "+=190%",
						pin: true,
						pinSpacing: true,
						scrub: 0.8,
					},
				});

				const ghost = el.querySelector(".chapter-ghost");
				const index = el.querySelector(".chapter-index");
				const titleLines = el.querySelectorAll(".chapter-line-inner");
				const rule = el.querySelector(".chapter-rule");
				const copy = el.querySelector(".chapter-copy");
				const artifact = el.querySelector(".artifact");
				const artifactLines = el.querySelectorAll(".artifact-line");

				if (ghost) {
					tl.from(
						ghost,
						{
							opacity: 0,
							scale: 0.94,
							xPercent: 6,
							duration: 0.9,
							ease: "none",
						},
						0,
					);
				}

				if (index) {
					tl.from(
						index,
						{ opacity: 0, y: 36, duration: 0.65, ease: "power3.out" },
						0,
					);
				}

				if (titleLines.length > 0) {
					tl.from(
						titleLines,
						{
							yPercent: 112,
							duration: 0.95,
							stagger: 0.08,
							ease: "power4.out",
						},
						0.08,
					);
				}

				if (rule) {
					tl.from(
						rule,
						{
							scaleX: 0,
							duration: 0.65,
							transformOrigin: "left",
							ease: "power2.inOut",
						},
						0.34,
					);
				}

				if (copy) {
					tl.from(
						copy,
						{ opacity: 0, y: 24, duration: 0.75, ease: "power2.out" },
						0.55,
					);
				}

				if (artifact) {
					tl.from(
						artifact,
						{
							opacity: 0,
							y: 56,
							rotate: -1.8,
							duration: 0.85,
							ease: "power3.out",
						},
						0.62,
					);
				}

				if (artifactLines.length > 0) {
					tl.from(
						artifactLines,
						{
							opacity: 0,
							x: -12,
							duration: 0.45,
							stagger: 0.06,
							ease: "power2.out",
						},
						0.9,
					);
				}

				tl.to({}, { duration: 0.65 });
			}
		},
		{ scope: containerRef },
	);

	return (
		<main ref={containerRef} className="story-page bg-[#0a0a0a] text-[#f5f0e8]">
			<div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-black/10">
				<div
					ref={progressFillRef}
					className="h-full origin-left"
					style={{
						transform: "scaleX(0)",
						background:
							"linear-gradient(90deg,#ff4d2e,#1f6feb,#14a06f,#f5a524,#d81e5b,#7c3aed,#00a7c7)",
					}}
				/>
			</div>

			<section className="relative min-h-screen overflow-hidden border-b border-white/10 px-5 pt-28 pb-10 md:px-10 lg:px-14">
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.13]"
					style={{ backgroundImage: NOISE }}
				/>
				<div className="relative z-10 grid min-h-[calc(100vh-9.5rem)] grid-rows-[auto_1fr_auto]">
					<div className="hero-meta flex items-start justify-between gap-8 border-t border-white/20 pt-4 font-mono text-[0.58rem] uppercase leading-[1.6] tracking-[0.32em] text-white/52">
						<span>Personal chronology</span>
						<span className="hidden text-right md:block">
							Software / memory / systems
						</span>
					</div>

					<div className="flex items-center">
						<div className="w-full">
							<div className="overflow-hidden leading-[0.78]">
								<span
									className="hero-word block text-[clamp(4.8rem,18vw,17rem)] uppercase tracking-normal"
									style={{ fontFamily: "var(--font-anton)" }}
								>
									From
								</span>
							</div>
							<div className="overflow-hidden leading-[0.78]">
								<span
									className="hero-word block text-[clamp(4.8rem,18vw,17rem)] uppercase tracking-normal text-white/38"
									style={{ fontFamily: "var(--font-anton)" }}
								>
									Floppy
								</span>
							</div>
							<div className="overflow-hidden leading-[0.78]">
								<span
									className="hero-word block text-[clamp(4.8rem,18vw,17rem)] uppercase tracking-normal"
									style={{ fontFamily: "var(--font-anton)" }}
								>
									To cloud
								</span>
							</div>
							<h1 className="sr-only">From Floppy to Cloud</h1>
						</div>
					</div>

					<div className="hero-panel grid gap-6 border-t border-white/20 pt-5 md:grid-cols-[1fr_minmax(18rem,32rem)] md:items-end">
						<p
							className="max-w-[38ch] text-[1rem] leading-[1.72] text-white/58 md:text-[1.12rem]"
							style={{ fontFamily: "var(--font-roboto-flex)" }}
						>
							How I learned to code, told as a scrollable stack of artifacts:
							DOS, floppy disks, QBasic, the web, JavaScript, Kubernetes, Rust,
							and the strange new edge of AI.
						</p>
						<div className="grid grid-cols-3 border border-white/18 font-mono text-[0.56rem] uppercase tracking-[0.26em] text-white/50">
							<span className="border-r border-white/18 p-4">08 chapters</span>
							<span className="border-r border-white/18 p-4">Scroll story</span>
							<span className="p-4">© ZD</span>
						</div>
					</div>
				</div>
			</section>

			{chapters.map((chapter, i) => {
				return (
					<section
						key={chapter.id}
						id={`chapter-${chapter.id}`}
						className="relative min-h-screen overflow-hidden px-5 py-10 md:px-10 lg:px-14"
						style={{ background: chapter.bg, color: chapter.fg }}
					>
						<div
							className="pointer-events-none absolute inset-0 opacity-[0.09]"
							style={{ backgroundImage: NOISE }}
						/>
						<div
							className="chapter-ghost pointer-events-none absolute -right-[0.08em] top-[6vh] select-none text-[clamp(9rem,31vw,31rem)] uppercase leading-none opacity-[0.08] md:top-[1vh]"
							style={{
								fontFamily: "var(--font-anton)",
								color: chapter.accent,
							}}
							aria-hidden
						>
							{chapter.titleGhost}
						</div>

						<div className="relative z-10 grid min-h-[calc(100vh-5rem)] grid-rows-[auto_1fr_auto]">
							<div className="grid grid-cols-[1fr_auto] gap-5 border-t pt-4 font-mono text-[0.56rem] uppercase leading-[1.6] tracking-[0.28em] opacity-70">
								<span>{chapter.label}</span>
								<span>{chapter.era}</span>
							</div>

							<div className="grid gap-8 py-9 lg:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)] lg:items-center">
								<div>
									<div className="mb-8 flex items-start justify-between gap-6">
										<span
											className="chapter-index block text-[clamp(4rem,11vw,10rem)] uppercase leading-none"
											style={{
												fontFamily: "var(--font-anton)",
												color: chapter.accent,
											}}
										>
											{String(i + 1).padStart(2, "0")}
										</span>
										<p
											className="mt-3 max-w-[24ch] text-right text-[0.84rem] leading-[1.7] md:text-[0.96rem]"
											style={{
												color: chapter.muted,
												fontFamily: "var(--font-roboto-flex)",
											}}
										>
											{chapter.lead}
										</p>
									</div>

									<div className="mb-9 max-w-[min(100%,58rem)]">
										{chapter.titleLines.map((line) => (
											<div
												key={line}
												className="-my-[0.08em] overflow-hidden py-[0.08em] leading-none"
											>
												<h2
													className="chapter-line-inner block whitespace-nowrap text-[clamp(3.6rem,10.4vw,11rem)] uppercase leading-[0.94] tracking-normal"
													style={{
														fontFamily: "var(--font-anton)",
													}}
												>
													{line}
												</h2>
											</div>
										))}
									</div>

									<div
										className="chapter-rule mb-7 h-px w-full"
										style={{ background: chapter.accent }}
									/>

									<div className="chapter-copy grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)]">
										<p
											className="max-w-[58ch] text-[0.98rem] leading-[1.8] md:text-[1.05rem]"
											style={{
												color: chapter.muted,
												fontFamily: "var(--font-roboto-flex)",
											}}
										>
											{chapter.body}
										</p>
										<p
											className="border-l pl-5 text-[1.25rem] leading-[1.2] md:text-[1.55rem]"
											style={{
												borderColor: chapter.accent,
												fontFamily: "var(--font-newsreader)",
												color: chapter.fg,
											}}
										>
											{chapter.quote}
										</p>
									</div>
								</div>

								<Artifact chapter={chapter} />
							</div>

							<div className="grid grid-cols-2 border-t pt-4 font-mono text-[0.54rem] uppercase leading-none tracking-[0.26em] opacity-60 md:grid-cols-4">
								<span>{chapter.tags[0]}</span>
								<span className="hidden md:block">{chapter.tags[1]}</span>
								<span className="hidden md:block">{chapter.tags[2]}</span>
								<span className="text-right">
									{String(i + 1).padStart(2, "0")} /{" "}
									{String(chapters.length).padStart(2, "0")}
								</span>
							</div>
						</div>
					</section>
				);
			})}

			<footer className="story-footer relative min-h-screen overflow-hidden bg-[#0a0a0a] px-5 pt-24 pb-7 text-[#f5f0e8] md:px-10 lg:px-14">
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.13]"
					style={{ backgroundImage: NOISE }}
				/>
				<div className="pointer-events-none absolute -right-[0.08em] top-[11vh] select-none text-[clamp(10rem,34vw,34rem)] uppercase leading-none text-[#ff4d2e] opacity-[0.1]">
					<span style={{ fontFamily: "var(--font-anton)" }}>ZD</span>
				</div>
				<div className="relative z-10 grid min-h-[calc(100vh-7.75rem)] grid-rows-[auto_1fr_auto_auto]">
					<div className="grid gap-4 border-t border-white/20 pt-4 font-mono text-[0.56rem] uppercase tracking-[0.28em] text-white/48 md:grid-cols-[1fr_auto]">
						<span>The story continues</span>
						<span className="md:text-right">Build / Learn / Repeat</span>
					</div>
					<div className="flex items-center">
						<div className="w-full">
							<p
								className="text-[clamp(4.6rem,17vw,17rem)] uppercase leading-[0.78] tracking-normal"
								style={{ fontFamily: "var(--font-anton)" }}
							>
								The cursor
							</p>
							<p
								className="text-[clamp(4.6rem,17vw,17rem)] uppercase leading-[0.78] tracking-normal text-white/34"
								style={{ fontFamily: "var(--font-anton)" }}
							>
								still blinks.
							</p>
						</div>
					</div>
					<div className="grid gap-7 border-t border-white/20 pt-5 md:grid-cols-[1fr_minmax(28rem,44rem)] md:items-end">
						<p
							className="max-w-[46ch] text-[1rem] leading-[1.75] text-white/56 md:text-[1.08rem]"
							style={{ fontFamily: "var(--font-roboto-flex)" }}
						>
							Not nostalgia for old machines. More like gratitude for every
							interface that made the next one possible.
						</p>
						<div className="grid border border-white/18 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-white/56 sm:grid-cols-4">
							<a
								href="/about"
								className="border-b border-white/18 p-4 transition-colors hover:bg-[#f5f0e8] hover:text-[#090909] sm:border-r sm:border-b-0"
							>
								About
							</a>
							<a
								href="/experiments"
								className="border-b border-white/18 p-4 transition-colors hover:bg-[#f5f0e8] hover:text-[#090909] sm:border-r sm:border-b-0"
							>
								Experiments
							</a>
							<a
								href="https://github.com/zeyaddeeb"
								target="_blank"
								rel="noreferrer"
								className="border-b border-white/18 p-4 transition-colors hover:bg-[#f5f0e8] hover:text-[#090909] sm:border-r sm:border-b-0"
							>
								GitHub
							</a>
							<a
								href="https://twitter.com/zeyad_deeb"
								target="_blank"
								rel="noreferrer"
								className="p-4 transition-colors hover:bg-[#f5f0e8] hover:text-[#090909]"
							>
								Twitter
							</a>
						</div>
					</div>
					<div className="mt-8 grid gap-3 border-t border-white/20 pt-4 font-mono text-[0.52rem] uppercase tracking-[0.28em] text-white/38 md:grid-cols-3">
						<span>© Zeyad Deeb</span>
						<span className="md:text-center">Personal chronology</span>
						<span className="md:text-right">From floppy to cloud</span>
					</div>
				</div>
			</footer>
		</main>
	);
}
