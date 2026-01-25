"use client";

import Link from "next/link";

export default function NotFound() {
	return (
		<div className="relative min-h-screen overflow-hidden bg-neutral-950">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute left-[10%] top-[20%] animate-float-slow">
					<div className="h-24 w-16 rotate-12 rounded-sm bg-linear-to-br from-amber-800 to-amber-900 shadow-xl">
						<div className="absolute inset-y-0 left-1 w-1 bg-amber-950" />
						<div className="absolute inset-2 flex flex-col justify-center gap-1">
							<div className="h-1 w-8 rounded bg-amber-200/30" />
							<div className="h-1 w-6 rounded bg-amber-200/20" />
						</div>
					</div>
				</div>

				<div className="absolute right-[15%] top-[15%] animate-float-medium">
					<div className="h-20 w-14 -rotate-6 rounded-sm bg-linear-to-br from-emerald-800 to-emerald-900 shadow-xl">
						<div className="absolute inset-y-0 left-1 w-1 bg-emerald-950" />
					</div>
				</div>

				<div className="absolute left-[20%] bottom-[30%] animate-float-fast">
					<div className="h-28 w-20 rotate-[-15deg] rounded-sm bg-linear-to-br from-rose-800 to-rose-900 shadow-xl">
						<div className="absolute inset-y-0 left-1 w-1 bg-rose-950" />
						<div className="absolute inset-3 flex flex-col justify-center gap-1">
							<div className="h-1 w-10 rounded bg-rose-200/30" />
							<div className="h-1 w-8 rounded bg-rose-200/20" />
							<div className="h-1 w-6 rounded bg-rose-200/15" />
						</div>
					</div>
				</div>

				<div className="absolute right-[25%] bottom-[20%] animate-float-slow">
					<div className="h-16 w-12 rotate-20 rounded-sm bg-linear-to-br from-violet-800 to-violet-900 shadow-xl">
						<div className="absolute inset-y-0 left-1 w-1 bg-violet-950" />
					</div>
				</div>

				<div className="absolute left-[5%] top-[50%] animate-float-medium">
					<div className="h-20 w-14 rotate-[8deg] rounded-sm bg-linear-to-br from-sky-800 to-sky-900 shadow-xl">
						<div className="absolute inset-y-0 left-1 w-1 bg-sky-950" />
					</div>
				</div>

				<div className="absolute right-[8%] top-[45%] animate-float-fast">
					<div className="h-24 w-18 rotate-[-10deg] rounded-sm bg-linear-to-br from-orange-800 to-orange-900 shadow-xl">
						<div className="absolute inset-y-0 left-1 w-1 bg-orange-950" />
					</div>
				</div>

				<div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-amber-500/5 blur-3xl" />
				<div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-violet-500/5 blur-3xl" />
			</div>

			<div className="relative flex min-h-screen flex-col items-center justify-center px-4">
				<div className="mb-8 animate-bounce-slow">
					<svg
						viewBox="0 0 200 200"
						className="h-48 w-48 md:h-64 md:w-64"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						role="img"
						aria-label="A confused cat sitting on a stack of books"
					>
						<title>A confused cat sitting on a stack of books</title>
						<rect
							x="50"
							y="140"
							width="100"
							height="15"
							rx="2"
							fill="#78350f"
						/>
						<rect x="55" y="125" width="90" height="15" rx="2" fill="#166534" />
						<rect
							x="45"
							y="110"
							width="110"
							height="15"
							rx="2"
							fill="#7c2d12"
						/>

						<ellipse cx="100" cy="95" rx="35" ry="25" fill="#404040" />

						<circle cx="100" cy="60" r="25" fill="#404040" />

						<path d="M80 45 L75 20 L90 40 Z" fill="#404040" />
						<path d="M120 45 L125 20 L110 40 Z" fill="#404040" />
						<path d="M82 42 L79 25 L89 40 Z" fill="#525252" />
						<path d="M118 42 L121 25 L111 40 Z" fill="#525252" />

						<circle cx="90" cy="55" r="8" fill="#fef3c7" />
						<circle cx="110" cy="55" r="8" fill="#fef3c7" />
						<circle cx="90" cy="56" r="4" fill="#171717" />
						<circle cx="110" cy="56" r="4" fill="#171717" />
						<circle cx="91" cy="54" r="1.5" fill="white" />
						<circle cx="111" cy="54" r="1.5" fill="white" />

						<path d="M97 68 L100 73 L103 68 Z" fill="#f472b6" />

						<path
							d="M100 73 Q95 78 90 75"
							stroke="#525252"
							strokeWidth="2"
							fill="none"
						/>
						<path
							d="M100 73 Q105 78 110 75"
							stroke="#525252"
							strokeWidth="2"
							fill="none"
						/>

						<line
							x1="70"
							y1="65"
							x2="85"
							y2="67"
							stroke="#525252"
							strokeWidth="1.5"
						/>
						<line
							x1="70"
							y1="70"
							x2="85"
							y2="70"
							stroke="#525252"
							strokeWidth="1.5"
						/>
						<line
							x1="115"
							y1="67"
							x2="130"
							y2="65"
							stroke="#525252"
							strokeWidth="1.5"
						/>
						<line
							x1="115"
							y1="70"
							x2="130"
							y2="70"
							stroke="#525252"
							strokeWidth="1.5"
						/>

						<path
							d="M135 90 Q150 70 145 50"
							stroke="#404040"
							strokeWidth="10"
							strokeLinecap="round"
							fill="none"
						/>

						<text
							x="55"
							y="30"
							className="animate-pulse"
							fill="#a3a3a3"
							fontSize="16"
							fontWeight="bold"
						>
							?
						</text>
						<text
							x="140"
							y="35"
							className="animate-pulse"
							fill="#a3a3a3"
							fontSize="14"
							fontWeight="bold"
						>
							?
						</text>

						<path
							d="M60 170 Q100 160 140 170 L140 185 Q100 175 60 185 Z"
							fill="#fef3c7"
						/>
						<line
							x1="100"
							y1="162"
							x2="100"
							y2="183"
							stroke="#d4d4d4"
							strokeWidth="1"
						/>
						<line
							x1="70"
							y1="172"
							x2="90"
							y2="170"
							stroke="#d4d4d4"
							strokeWidth="0.5"
						/>
						<line
							x1="70"
							y1="176"
							x2="90"
							y2="174"
							stroke="#d4d4d4"
							strokeWidth="0.5"
						/>
						<line
							x1="110"
							y1="170"
							x2="130"
							y2="172"
							stroke="#d4d4d4"
							strokeWidth="0.5"
						/>
						<line
							x1="110"
							y1="174"
							x2="130"
							y2="176"
							stroke="#d4d4d4"
							strokeWidth="0.5"
						/>
					</svg>
				</div>

				<h1
					className="mb-4 bg-linear-to-r from-amber-200 via-white to-amber-200 bg-clip-text text-7xl font-bold tracking-tight text-transparent md:text-9xl"
					style={{ fontFamily: "var(--font-space-grotesk)" }}
				>
					404
				</h1>

				<h2
					className="mb-4 text-2xl font-semibold text-white md:text-3xl"
					style={{ fontFamily: "var(--font-space-grotesk)" }}
				>
					Lost in the Pages
				</h2>
				<p className="mb-8 max-w-md text-center text-neutral-400">
					Our curious cat got a bit too absorbed in reading and wandered off the
					beaten path. The page you&apos;re looking for seems to have been
					misplaced between the chapters.
				</p>

				<div className="flex flex-col gap-4 sm:flex-row">
					<Link
						href="/"
						className="group relative overflow-hidden rounded-lg bg-linear-to-r from-amber-600 to-amber-700 px-6 py-3 font-medium text-white transition-all duration-300 hover:from-amber-500 hover:to-amber-600 hover:shadow-lg hover:shadow-amber-500/25"
					>
						<span className="relative z-10">Back to Homepage</span>
					</Link>
					<Link
						href="/posts"
						className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-6 py-3 font-medium text-neutral-300 transition-all duration-300 hover:border-neutral-600 hover:bg-neutral-800/50 hover:text-white"
					>
						Browse Posts
					</Link>
				</div>
			</div>
		</div>
	);
}
