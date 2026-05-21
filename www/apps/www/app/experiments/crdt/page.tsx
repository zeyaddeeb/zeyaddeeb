"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";

const CrdtEditor = dynamic(() => import("./editor"), {
	ssr: false,
	loading: () => (
		<div className="flex h-64 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/50">
			<div className="flex flex-col items-center gap-3">
				<div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
				<span className="text-sm text-neutral-500">loading WASM module…</span>
			</div>
		</div>
	),
});

const DOC_ID = "crdt-demo";

export default function CrdtEditorPage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white">
			<section className="relative min-h-screen px-4 pt-24 pb-20 md:px-6 md:pt-32">
				<div className="absolute inset-0 bg-linear-to-br from-amber-950/20 via-neutral-950 to-neutral-950" />

				<div className="relative z-10 mx-auto max-w-5xl">
					{/* Back link */}
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4 }}
					>
						<Link
							href="/experiments"
							className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
						>
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<title>Back</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
							Back to Experiments
						</Link>
					</motion.div>
					{/* Header */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
						className="mb-10"
					>
						<h1
							className="mb-3 text-4xl font-bold uppercase tracking-tight md:text-6xl"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							CRDT Editor
						</h1>
						<p className="max-w-xl text-base text-neutral-400">
							Collaborative text editing without coordination. Each character is
							a node in a{" "}
							<span className="text-neutral-200">
								Replicated Growable Array
							</span>{" "}
							— concurrent inserts converge deterministically by vector clock.
						</p>

						<div className="mt-5 flex flex-wrap gap-2">
							{[
								"WebAssembly",
								"Rust",
								"RGA CRDT",
								"SurrealDB",
								"WebSockets",
							].map((tag) => (
								<span
									key={tag}
									className="rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1 text-xs text-neutral-400"
								>
									{tag}
								</span>
							))}
						</div>
					</motion.div>
					{/* How it works cards */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.1 }}
						className="mb-10 grid gap-3 sm:grid-cols-3"
					>
						{[
							{
								title: "WASM CRDT",
								body: "The RGA algorithm runs in Rust compiled to WebAssembly. Each op returns a JSON message ready to broadcast.",
							},
							{
								title: "Sync server",
								body: "An Axum WebSocket server persists ops to SurrealDB and rebroadcasts them to every connected tab.",
							},
							{
								title: "Offline first",
								body: "If the server is unreachable the editor keeps working. Ops queue locally and flush when the connection resumes.",
							},
						].map(({ title, body }) => (
							<div
								key={title}
								className="rounded-xl border border-neutral-800/60 bg-neutral-900/30 p-4"
							>
								<p className="mb-1.5 text-sm font-medium text-neutral-200">
									{title}
								</p>
								<p className="text-xs leading-relaxed text-neutral-500">
									{body}
								</p>
							</div>
						))}
					</motion.div>
					{/* Editor */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.2 }}
						className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 md:p-8"
					>
						<CrdtEditor docId={DOC_ID} />
					</motion.div>
				</div>
			</section>
		</main>
	);
}
