import type { CSSProperties } from "react";
import { type Chapter, chapters, firstStage, type Line, stages } from "./acts";

export function lineStyle(line: Line): CSSProperties {
	return {
		"--line": line.color,
		"--on-line": `var(--${line.text})`,
	} as CSSProperties;
}

export function Bullet({ chapter }: { chapter: Chapter }) {
	return (
		<span
			className="cc-bullet"
			data-shape={chapter.act.shape}
			style={lineStyle(chapter.line)}
			aria-hidden="true"
		>
			<span>{chapter.number}</span>
		</span>
	);
}

export function Lines({
	index,
	progress,
	onOpen,
}: {
	index: number;
	progress: Record<string, boolean>;
	onOpen: (index: number) => void;
}) {
	const here = stages[index]?.chapter;
	const won = (chapter: Chapter) => chapter.parts.every((id) => progress[id]);
	const acts = [...new Set(chapters.map((c) => c.act))];
	return (
		<nav className="cc-lines" aria-label="Chapters">
			{acts.map((act) => {
				const own = chapters.filter((c) => c.act === act);
				if (act !== here?.act) {
					const done = own.every(won);
					return (
						<button
							key={act.id}
							type="button"
							className="cc-bullet cc-act-jump"
							data-shape={act.shape}
							data-won={done || undefined}
							aria-label={`Act ${act.number}: ${act.title}${done ? ", done" : ""}`}
							onClick={() => onOpen(firstStage((s) => s.chapter.act === act))}
						>
							<span>{act.number}</span>
						</button>
					);
				}
				return (
					<ol key={act.id} aria-label={`Act ${act.number}: ${act.title}`}>
						{own.map((chapter) => (
							<li
								key={chapter.id}
								data-current={chapter === here || undefined}
								data-won={won(chapter) || undefined}
							>
								<button
									type="button"
									className="cc-bullet"
									data-shape={act.shape}
									style={lineStyle(chapter.line)}
									aria-current={chapter === here ? "step" : undefined}
									aria-label={`Act ${act.number}, chapter ${chapter.number}: ${chapter.title}${won(chapter) ? ", matched" : ""}`}
									onClick={() =>
										onOpen(firstStage((s) => s.chapter === chapter))
									}
								>
									<span>{chapter.number}</span>
								</button>
							</li>
						))}
					</ol>
				);
			})}
		</nav>
	);
}
