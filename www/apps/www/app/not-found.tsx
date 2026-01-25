"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useId } from "react";

const STARS = [
	{ left: 5, top: 12, opacity: 0.8, duration: 3.2, delay: 0.1 },
	{ left: 15, top: 8, opacity: 0.5, duration: 2.8, delay: 1.2 },
	{ left: 22, top: 25, opacity: 0.9, duration: 3.5, delay: 0.5 },
	{ left: 35, top: 5, opacity: 0.6, duration: 2.5, delay: 1.8 },
	{ left: 42, top: 18, opacity: 0.7, duration: 3.0, delay: 0.3 },
	{ left: 55, top: 10, opacity: 0.4, duration: 3.8, delay: 1.5 },
	{ left: 68, top: 22, opacity: 0.8, duration: 2.6, delay: 0.8 },
	{ left: 75, top: 8, opacity: 0.5, duration: 3.3, delay: 1.0 },
	{ left: 82, top: 15, opacity: 0.9, duration: 2.9, delay: 0.2 },
	{ left: 92, top: 20, opacity: 0.6, duration: 3.6, delay: 1.4 },
	{ left: 8, top: 35, opacity: 0.7, duration: 2.7, delay: 0.6 },
	{ left: 18, top: 42, opacity: 0.5, duration: 3.1, delay: 1.9 },
	{ left: 28, top: 38, opacity: 0.8, duration: 2.4, delay: 0.4 },
	{ left: 38, top: 45, opacity: 0.6, duration: 3.4, delay: 1.1 },
	{ left: 48, top: 32, opacity: 0.9, duration: 2.8, delay: 0.7 },
	{ left: 58, top: 48, opacity: 0.4, duration: 3.7, delay: 1.6 },
	{ left: 65, top: 35, opacity: 0.7, duration: 2.5, delay: 0.9 },
	{ left: 78, top: 42, opacity: 0.5, duration: 3.2, delay: 1.3 },
	{ left: 88, top: 38, opacity: 0.8, duration: 2.6, delay: 0.1 },
	{ left: 95, top: 45, opacity: 0.6, duration: 3.0, delay: 1.7 },
	{ left: 12, top: 55, opacity: 0.9, duration: 3.3, delay: 0.5 },
	{ left: 25, top: 62, opacity: 0.5, duration: 2.9, delay: 1.2 },
	{ left: 32, top: 58, opacity: 0.7, duration: 3.5, delay: 0.8 },
	{ left: 45, top: 65, opacity: 0.4, duration: 2.7, delay: 1.4 },
	{ left: 52, top: 52, opacity: 0.8, duration: 3.1, delay: 0.3 },
	{ left: 62, top: 68, opacity: 0.6, duration: 2.4, delay: 1.9 },
	{ left: 72, top: 55, opacity: 0.9, duration: 3.6, delay: 0.6 },
	{ left: 85, top: 62, opacity: 0.5, duration: 2.8, delay: 1.0 },
	{ left: 3, top: 72, opacity: 0.7, duration: 3.4, delay: 0.2 },
	{ left: 18, top: 78, opacity: 0.6, duration: 2.5, delay: 1.5 },
	{ left: 28, top: 85, opacity: 0.8, duration: 3.0, delay: 0.9 },
	{ left: 40, top: 75, opacity: 0.5, duration: 3.7, delay: 1.1 },
	{ left: 55, top: 82, opacity: 0.9, duration: 2.6, delay: 0.4 },
	{ left: 65, top: 88, opacity: 0.4, duration: 3.2, delay: 1.8 },
	{ left: 78, top: 75, opacity: 0.7, duration: 2.9, delay: 0.7 },
	{ left: 88, top: 85, opacity: 0.6, duration: 3.5, delay: 1.3 },
	{ left: 95, top: 78, opacity: 0.8, duration: 2.7, delay: 0.1 },
	{ left: 10, top: 92, opacity: 0.5, duration: 3.3, delay: 1.6 },
	{ left: 30, top: 95, opacity: 0.9, duration: 2.4, delay: 0.5 },
	{ left: 50, top: 90, opacity: 0.6, duration: 3.8, delay: 1.2 },
	{ left: 70, top: 95, opacity: 0.7, duration: 2.8, delay: 0.8 },
	{ left: 90, top: 92, opacity: 0.4, duration: 3.1, delay: 1.4 },
];

export default function NotFound() {
	const helmetGlowId = useId();
	const visorGradientId = useId();

	return (
		<div className="relative min-h-screen overflow-hidden bg-neutral-950">
			<div className="pointer-events-none absolute inset-0">
				{STARS.map((star) => (
					<motion.div
						key={`star-${star.left}-${star.top}`}
						className="absolute h-1 w-1 rounded-full bg-white"
						style={{
							left: `${star.left}%`,
							top: `${star.top}%`,
							opacity: star.opacity,
						}}
						animate={{
							opacity: [0.3, 1, 0.3],
							scale: [1, 1.2, 1],
						}}
						transition={{
							duration: star.duration,
							repeat: Infinity,
							delay: star.delay,
						}}
					/>
				))}

				<motion.div
					className="absolute right-[10%] top-[15%] h-16 w-16 rounded-full bg-linear-to-br from-rose-500 to-rose-900 shadow-lg shadow-rose-500/30"
					animate={{ y: [0, -10, 0] }}
					transition={{ duration: 8, repeat: Infinity }}
				>
					<div className="absolute inset-2 rounded-full bg-rose-600/30" />
				</motion.div>

				<motion.div
					className="absolute left-[8%] top-[60%] h-12 w-12 rounded-full bg-linear-to-br from-violet-400 to-violet-800 shadow-lg shadow-violet-500/30"
					animate={{ y: [0, 15, 0] }}
					transition={{ duration: 6, repeat: Infinity }}
				/>

				<motion.div
					className="absolute right-[20%] bottom-[25%] h-20 w-20 rounded-full bg-linear-to-br from-amber-300 to-amber-700 shadow-lg shadow-amber-500/30"
					animate={{ y: [0, -8, 0], rotate: [0, 5, 0] }}
					transition={{ duration: 10, repeat: Infinity }}
				>
					<div className="absolute left-1/2 top-1/2 h-2 w-32 -translate-x-1/2 -translate-y-1/2 rotate-[-20deg] rounded-full bg-amber-200/40" />
				</motion.div>

				<motion.div
					className="absolute h-0.5 w-20 bg-linear-to-r from-white to-transparent"
					style={{ left: "70%", top: "20%" }}
					animate={{
						x: [-100, 200],
						y: [-50, 100],
						opacity: [0, 1, 0],
					}}
					transition={{
						duration: 1.5,
						repeat: Infinity,
						repeatDelay: 5,
					}}
				/>
				<motion.div
					className="absolute h-0.5 w-16 bg-linear-to-r from-white to-transparent"
					style={{ left: "30%", top: "40%" }}
					animate={{
						x: [-80, 160],
						y: [-40, 80],
						opacity: [0, 1, 0],
					}}
					transition={{
						duration: 1.2,
						repeat: Infinity,
						repeatDelay: 8,
						delay: 3,
					}}
				/>

				<div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
				<div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-rose-500/10 blur-3xl" />
				<div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/5 blur-3xl" />
			</div>

			<div className="relative flex min-h-screen flex-col items-center justify-center px-4">
				<motion.div
					className="mb-8"
					animate={{
						y: [0, -15, 0],
						rotate: [-2, 2, -2],
					}}
					transition={{
						duration: 6,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				>
					<svg
						viewBox="0 0 200 200"
						className="h-48 w-48 md:h-64 md:w-64"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						role="img"
						aria-label="An astronaut cat floating in space"
					>
						<title>An astronaut cat floating in space</title>
						<circle
							cx="100"
							cy="90"
							r="50"
							fill={`url(#${helmetGlowId})`}
							opacity="0.3"
						/>

						<circle cx="100" cy="90" r="45" fill="#525252" />
						<circle cx="100" cy="90" r="40" fill="#171717" />
						<circle cx="100" cy="90" r="35" fill={`url(#${visorGradientId})`} />

						<ellipse
							cx="85"
							cy="75"
							rx="15"
							ry="10"
							fill="white"
							opacity="0.15"
						/>

						<circle cx="100" cy="92" r="28" fill="#404040" />

						<path d="M80 75 L77 58 L90 72 Z" fill="#404040" />
						<path d="M120 75 L123 58 L110 72 Z" fill="#404040" />
						<path d="M81 73 L79 62 L89 72 Z" fill="#525252" />
						<path d="M119 73 L121 62 L111 72 Z" fill="#525252" />

						<circle cx="90" cy="88" r="7" fill="#1e1e2e" />
						<circle cx="110" cy="88" r="7" fill="#1e1e2e" />
						<circle cx="88" cy="86" r="2" fill="#f0abfc" />
						<circle cx="108" cy="86" r="2" fill="#93c5fd" />
						<circle cx="92" cy="90" r="1" fill="white" />
						<circle cx="112" cy="90" r="1" fill="white" />

						<path d="M97 97 L100 102 L103 97 Z" fill="#f472b6" />

						<path
							d="M100 102 Q95 106 92 104"
							stroke="#525252"
							strokeWidth="1.5"
							fill="none"
						/>
						<path
							d="M100 102 Q105 106 108 104"
							stroke="#525252"
							strokeWidth="1.5"
							fill="none"
						/>

						<ellipse cx="100" cy="160" rx="35" ry="30" fill="#525252" />
						<ellipse cx="100" cy="155" rx="30" ry="25" fill="#404040" />

						<rect x="90" y="140" width="20" height="10" rx="2" fill="#737373" />
						<circle cx="95" cy="145" r="2" fill="#ef4444" />
						<circle cx="105" cy="145" r="2" fill="#22c55e" />

						<ellipse
							cx="55"
							cy="150"
							rx="12"
							ry="8"
							fill="#525252"
							transform="rotate(-30 55 150)"
						/>
						<ellipse
							cx="145"
							cy="150"
							rx="12"
							ry="8"
							fill="#525252"
							transform="rotate(30 145 150)"
						/>

						<path
							d="M60 130 Q40 120 45 100"
							stroke="#737373"
							strokeWidth="4"
							fill="none"
							strokeLinecap="round"
						/>

						<motion.g>
							<text
								x="55"
								y="55"
								fill="#a3a3a3"
								fontSize="14"
								fontWeight="bold"
							>
								?
							</text>
						</motion.g>
						<motion.g>
							<text
								x="140"
								y="60"
								fill="#a3a3a3"
								fontSize="12"
								fontWeight="bold"
							>
								?
							</text>
						</motion.g>

						<defs>
							<radialGradient id={helmetGlowId} cx="50%" cy="50%" r="50%">
								<stop offset="0%" stopColor="#818cf8" />
								<stop offset="100%" stopColor="transparent" />
							</radialGradient>
							<linearGradient
								id={visorGradientId}
								x1="0%"
								y1="0%"
								x2="100%"
								y2="100%"
							>
								<stop offset="0%" stopColor="#1e1b4b" />
								<stop offset="50%" stopColor="#312e81" />
								<stop offset="100%" stopColor="#1e1b4b" />
							</linearGradient>
						</defs>
					</svg>
				</motion.div>

				<motion.h1
					className="mb-4 bg-linear-to-r from-indigo-300 via-violet-200 to-rose-300 bg-clip-text text-7xl font-bold tracking-tight text-transparent md:text-9xl"
					style={{ fontFamily: "var(--font-anton)" }}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6 }}
				>
					404
				</motion.h1>

				<motion.h2
					className="mb-4 text-2xl font-semibold text-white md:text-3xl"
					style={{ fontFamily: "var(--font-roboto-flex)" }}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.1 }}
				>
					Lost in Space
				</motion.h2>
				<motion.p
					className="mb-8 max-w-md text-center text-neutral-400"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.2 }}
				>
					Houston, we have a problem. Our space cat has drifted into the cosmic
					void and can&apos;t find the page you&apos;re looking for. It might be
					orbiting another galaxy entirely.
				</motion.p>

				<motion.div
					className="flex flex-col gap-4 sm:flex-row"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.3 }}
				>
					<Link
						href="/"
						className="group relative overflow-hidden rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-6 py-3 font-medium text-white transition-all duration-300 hover:from-indigo-500 hover:to-violet-500 hover:shadow-lg hover:shadow-indigo-500/25"
					>
						<span className="relative z-10">Return to Earth</span>
					</Link>
					<Link
						href="/about"
						className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-6 py-3 font-medium text-neutral-300 transition-all duration-300 hover:border-neutral-600 hover:bg-neutral-800/50 hover:text-white"
					>
						About Me
					</Link>
				</motion.div>
			</div>
		</div>
	);
}
