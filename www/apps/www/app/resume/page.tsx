const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='0.7' filter='url(%23n)'/%3E%3C/svg%3E")`;

const focusAreas = [
	"AI product engineering",
	"Distributed systems",
	"Creative web interfaces",
	"Rust and WebAssembly",
	"Kubernetes platforms",
	"Real-time collaboration",
];

const work = [
	{
		period: "Now",
		title: "Software engineer",
		scope: "AI, systems, and product-facing engineering",
		body: "Building at the intersection of model-powered workflows, production systems, and expressive interfaces. Current interests include distributed inference, collaborative tools, and practical AI infrastructure.",
	},
	{
		period: "2021-Present",
		title: "Rust / WASM / realtime experiments",
		scope: "Browser-native systems and interaction models",
		body: "Exploring Rust, WebAssembly, CRDTs, audio visualization, and client-side systems that make complex behavior feel immediate in the browser.",
	},
	{
		period: "2016-2020",
		title: "Cloud systems engineering",
		scope: "Containers, Kubernetes, observability, delivery",
		body: "Worked deeply with containerized applications, Kubernetes operations, rollout patterns, service boundaries, tracing, and the habits needed to keep systems understandable as they scale.",
	},
	{
		period: "2003-2015",
		title: "Web and JavaScript foundations",
		scope: "Interfaces, browsers, Node.js, product craft",
		body: "Grew from view-source curiosity into building full web experiences, browser interfaces, JavaScript systems, and the tooling around shipping software.",
	},
];

const stack = [
	["Languages", "TypeScript", "JavaScript", "Rust", "HTML", "CSS"],
	["Systems", "Kubernetes", "Docker", "Node.js", "WebAssembly", "CRDTs"],
	["Frontend", "React", "Next.js", "Canvas", "GSAP", "Framer Motion"],
	["AI", "LLM workflows", "Inference systems", "Agent tooling", "Evaluation"],
];

const links = [
	{ label: "GitHub", href: "https://github.com/zeyaddeeb" },
	{ label: "LinkedIn", href: "https://linkedin.com/in/zeyaddeeb" },
	{ label: "Twitter", href: "https://twitter.com/zeyad_deeb" },
];

export default function ResumePage() {
	return (
		<main className="min-h-screen bg-[#f3efe5] text-[#111]">
			<section className="relative min-h-screen overflow-hidden px-5 pt-28 pb-10 md:px-10 lg:px-14">
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.17]"
					style={{ backgroundImage: NOISE }}
				/>
				<div className="pointer-events-none absolute -right-[0.08em] top-[9vh] select-none text-[clamp(11rem,34vw,34rem)] uppercase leading-none text-[#0b7c74] opacity-[0.08]">
					<span style={{ fontFamily: "var(--font-anton)" }}>CV</span>
				</div>

				<div className="relative z-10 grid min-h-[calc(100vh-8.5rem)] grid-rows-[auto_1fr_auto]">
					<div className="grid gap-4 border-t border-[#111]/20 pt-4 font-mono text-[0.56rem] uppercase tracking-[0.28em] text-[#111]/50 md:grid-cols-[1fr_auto]">
						<span>Resume</span>
						<span className="md:text-right">
							Brooklyn, NY / Software Engineer
						</span>
					</div>

					<div className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,34rem)] lg:items-center">
						<div>
							<p className="mb-5 font-mono text-[0.58rem] uppercase tracking-[0.34em] text-[#0b7c74]">
								Zeyad Deeb
							</p>
							<h1
								className="max-w-[8ch] text-[clamp(5rem,16vw,16rem)] uppercase leading-[0.78] tracking-normal"
								style={{ fontFamily: "var(--font-anton)" }}
							>
								Resume
							</h1>
						</div>

						<div className="border border-[#111]/18 bg-white/30 p-5 md:p-7">
							<p
								className="text-[1.25rem] leading-[1.28] md:text-[1.85rem]"
								style={{ fontFamily: "var(--font-newsreader)" }}
							>
								Software engineer building AI-enabled products, distributed
								systems, and expressive web interfaces.
							</p>
							<div className="mt-8 grid grid-cols-2 gap-3 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[#111]/58">
								<span className="border-t border-[#111]/20 pt-3">AI</span>
								<span className="border-t border-[#111]/20 pt-3">Systems</span>
								<span className="border-t border-[#111]/20 pt-3">Rust</span>
								<span className="border-t border-[#111]/20 pt-3">Web</span>
							</div>
						</div>
					</div>

					<div className="grid gap-4 border-t border-[#111]/20 pt-4 md:grid-cols-[1fr_auto]">
						<p className="max-w-[54ch] text-[0.98rem] leading-[1.75] text-[#111]/62 md:text-[1.05rem]">
							I like software that has a pulse: systems that are reliable enough
							to disappear, and interfaces that make difficult work feel clear.
						</p>
						<div className="grid grid-cols-3 border border-[#111]/18 font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[#111]/55">
							<span className="border-r border-[#111]/18 p-4">Build</span>
							<span className="border-r border-[#111]/18 p-4">Ship</span>
							<span className="p-4">Learn</span>
						</div>
					</div>
				</div>
			</section>

			<section
				id="work"
				className="relative overflow-hidden border-t border-[#111]/18 px-5 py-20 md:px-10 lg:px-14"
			>
				<div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
					<div className="lg:sticky lg:top-28 lg:self-start">
						<p className="font-mono text-[0.56rem] uppercase tracking-[0.3em] text-[#0b7c74]">
							Selected work
						</p>
						<h2
							className="mt-5 text-[clamp(3.5rem,8vw,7rem)] uppercase leading-[0.82]"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Timeline
						</h2>
					</div>

					<div className="border-t border-[#111]/20">
						{work.map((item, index) => (
							<article
								key={item.period}
								className="grid gap-6 border-b border-[#111]/20 py-8 md:grid-cols-[8rem_minmax(0,1fr)]"
							>
								<div className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-[#111]/48">
									{String(index + 1).padStart(2, "0")} / {item.period}
								</div>
								<div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(18rem,1fr)]">
									<div>
										<h3
											className="text-[clamp(2.15rem,5vw,5rem)] uppercase leading-[0.88]"
											style={{ fontFamily: "var(--font-anton)" }}
										>
											{item.title}
										</h3>
										<p className="mt-3 font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[#0b7c74]">
											{item.scope}
										</p>
									</div>
									<p className="text-[0.98rem] leading-[1.78] text-[#111]/62 md:text-[1.05rem]">
										{item.body}
									</p>
								</div>
							</article>
						))}
					</div>
				</div>
			</section>

			<section
				id="stack"
				className="relative overflow-hidden bg-[#111] px-5 py-20 text-[#f3efe5] md:px-10 lg:px-14"
			>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.12]"
					style={{ backgroundImage: NOISE }}
				/>
				<div className="relative z-10 grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:items-start">
					<div>
						<p className="font-mono text-[0.56rem] uppercase tracking-[0.3em] text-[#8dd7cf]">
							Capabilities
						</p>
						<h2
							className="mt-5 max-w-[8ch] text-[clamp(4rem,10vw,10rem)] uppercase leading-[0.82]"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							What I use
						</h2>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						{stack.map(([group, ...items]) => (
							<div key={group} className="border border-white/18 p-5">
								<h3 className="font-mono text-[0.58rem] uppercase tracking-[0.26em] text-[#8dd7cf]">
									{group}
								</h3>
								<div className="mt-7 flex flex-wrap gap-2">
									{items.map((item) => (
										<span
											key={item}
											className="border border-white/16 px-3 py-2 font-mono text-[0.54rem] uppercase tracking-[0.18em] text-white/58"
										>
											{item}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="border-t border-[#111]/18 px-5 py-20 md:px-10 lg:px-14">
				<div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
					<div>
						<p className="font-mono text-[0.56rem] uppercase tracking-[0.3em] text-[#0b7c74]">
							Focus
						</p>
						<h2
							className="mt-5 text-[clamp(3rem,7vw,6.5rem)] uppercase leading-[0.86]"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Signal
						</h2>
					</div>
					<div className="grid gap-px border border-[#111]/18 bg-[#111]/18 md:grid-cols-2 lg:grid-cols-3">
						{focusAreas.map((area) => (
							<div key={area} className="bg-[#f3efe5] p-5">
								<p className="font-mono text-[0.58rem] uppercase leading-[1.55] tracking-[0.2em] text-[#111]/62">
									{area}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<footer
				id="contact"
				className="relative overflow-hidden bg-[#0b7c74] px-5 py-16 text-[#f3efe5] md:px-10 lg:px-14"
			>
				<div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
					<div>
						<p className="font-mono text-[0.56rem] uppercase tracking-[0.3em] text-white/58">
							Contact
						</p>
						<p
							className="mt-5 max-w-[12ch] text-[clamp(3.2rem,9vw,8rem)] uppercase leading-[0.82]"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Let&apos;s build.
						</p>
					</div>

					<div className="grid border border-white/22 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-white/70 sm:grid-cols-3">
						{links.map((link) => (
							<a
								key={link.href}
								href={link.href}
								target="_blank"
								rel="noreferrer"
								className="border-b border-white/22 p-4 transition-colors hover:bg-[#f3efe5] hover:text-[#111] sm:border-r sm:border-b-0 last:border-0"
							>
								{link.label}
							</a>
						))}
					</div>
				</div>
			</footer>
		</main>
	);
}
