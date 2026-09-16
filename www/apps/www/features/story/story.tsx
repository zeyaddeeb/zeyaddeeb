"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { neighbors, number } from "@/features/catalog/catalog";
import { useRunningRegistry } from "@/features/live/running-context";
import { useReducedMotion } from "@/features/live/use-running";
import { chapterIndex, chapters, type ScreenId } from "./chapters";
import { ClusterScreen } from "./screens/cluster";
import { DosScreen } from "./screens/dos";
import { FloppyScreen } from "./screens/floppy";
import { PostScreen } from "./screens/post";
import { PromptScreen } from "./screens/prompt";
import { PythonScreen } from "./screens/python";
import { RustScreen } from "./screens/rust";
import { SourceScreen } from "./screens/source";
import "./story.css";

const NOTES: [string, string][] = [
	["POST", "A simulation of an Award BIOS counting 8 MB of memory."],
	["COMMAND.COM", "A shell with eight commands and a disk of nine files."],
	[
		"PRINCE.EXE",
		"The loading sequence, with a real disk swap and a real hour.",
	],
	[
		"index.html",
		"A sandboxed frame rendering the source beside it, as you type.",
	],
	[
		"python2.7",
		"A transcript of a real session, replayed. Nothing is evaluated.",
	],
	[
		"kubectl",
		"A ReplicaSet controller in miniature: desired state, observed state, and the difference.",
	],
	[
		"life.wasm",
		"Conway’s Life in Rust, compiled to WebAssembly. The same engine as experiment 01.",
	],
	["sh", "A shell whose commands are this site’s pages."],
];

function Screen({
	id,
	onLaunch,
}: {
	id: ScreenId;
	onLaunch: (program: string) => void;
}) {
	switch (id) {
		case "post":
			return <PostScreen />;
		case "dos":
			return <DosScreen onLaunch={onLaunch} />;
		case "floppy":
			return <FloppyScreen />;
		case "source":
			return <SourceScreen />;
		case "python":
			return <PythonScreen />;
		case "cluster":
			return <ClusterScreen />;
		case "rust":
			return <RustScreen />;
		case "prompt":
			return <PromptScreen />;
	}
}

export function Story() {
	const [active, setActive] = useState<ScreenId>("post");
	const listRef = useRef<HTMLOListElement>(null);
	const reduced = useReducedMotion();
	const registry = useRunningRegistry();
	const nav = neighbors("story");
	const total = number(chapters.length);

	useEffect(() => {
		const rows = listRef.current?.querySelectorAll<HTMLElement>("li[data-id]");
		if (!rows?.length) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActive(entry.target.getAttribute("data-id") as ScreenId);
					}
				}
			},
			{ rootMargin: "-45% 0px -45% 0px" },
		);
		for (const row of rows) io.observe(row);
		return () => io.disconnect();
	}, []);

	const mark = registry?.mark;
	useEffect(() => {
		mark?.("story", true);
		return () => mark?.("story", false);
	}, [mark]);

	const jump = (id: ScreenId) => {
		setActive(id);
		document.getElementById(`chapter-${id}`)?.scrollIntoView({
			behavior: reduced ? "auto" : "smooth",
			block: "center",
		});
	};

	const i = chapterIndex(active);
	const chapter = chapters[i] ?? chapters[0];
	if (!chapter) return null;

	return (
		<main className="story">
			<header className="story__head container">
				<span className="story__number" aria-hidden="true">
					08
				</span>
				<p className="eyebrow story__trail">
					<Link href="/experiments" className="link-underline">
						Experiments
					</Link>{" "}
					<span aria-hidden="true">/</span> 08
				</p>
				<h1 className="story__title">From Floppy to Cloud</h1>
				<p className="story__intro">
					How I learned to code, told on the interfaces I learned it on. One
					screen, nine programs: the prompt takes commands, the page renders its
					own source, and the cluster heals when you break it.
				</p>
				<p className="eyebrow story__stack">TypeScript · Rust · WASM</p>
			</header>

			<div className="story__body container">
				<div className="story__screen-col">
					<section
						className="screen charcoal"
						aria-label={`${chapter.title}: ${chapter.program}`}
					>
						<p className="screen__bar">
							<span>
								{number(i + 1)} / {total}
							</span>
							<span>{chapter.era}</span>
							<span>{chapter.program}</span>
						</p>
						<div className="screen__stage" key={active}>
							<Screen id={active} onLaunch={(p) => jump(p as ScreenId)} />
						</div>
					</section>
					<p className="screen__caption">
						<span>{chapter.hint}</span>
					</p>
				</div>

				<ol className="story__chapters" ref={listRef}>
					{chapters.map((c, n) => (
						<li
							key={c.id}
							id={`chapter-${c.id}`}
							className="chapter"
							data-id={c.id}
							data-active={c.id === active}
						>
							<button
								type="button"
								className="chapter__n"
								onClick={() => jump(c.id)}
								aria-label={`Put chapter ${n + 1}, ${c.title}, on the screen`}
							>
								{number(n + 1)}
							</button>
							<div className="chapter__text">
								<p className="chapter__era">
									{c.era} <span aria-hidden="true">·</span> {c.program}
								</p>
								<h2 className="chapter__title">{c.title}</h2>
								<p className="chapter__body">{c.body}</p>
								<p className="chapter__quote">{c.quote}</p>
								<p className="chapter__materials">{c.materials.join(" / ")}</p>
							</div>
						</li>
					))}
				</ol>
			</div>

			<section className="story__notes container">
				<h2 className="eyebrow story__notes-label">What is real here</h2>
				<dl className="story__notes-list">
					{NOTES.map(([program, note]) => (
						<div key={program}>
							<dt>{program}</dt>
							<dd>{note}</dd>
						</div>
					))}
				</dl>
			</section>

			{nav ? (
				<nav aria-label="Next experiment" className="story__nav container">
					<Link href={nav.prev.href} className="story__nav-link">
						<span className="eyebrow">
							<span aria-hidden="true">
								<LifeArrow direction="left" />
							</span>{" "}
							{number(nav.prev.number)}
						</span>
						<span className="story__nav-title">{nav.prev.title}</span>
					</Link>
					<Link
						href={nav.next.href}
						className="story__nav-link story__nav-link--next"
					>
						<span className="eyebrow">
							{number(nav.next.number)}{" "}
							<span aria-hidden="true">
								<LifeArrow direction="right" />
							</span>
						</span>
						<span className="story__nav-title">{nav.next.title}</span>
					</Link>
				</nav>
			) : null}
		</main>
	);
}
