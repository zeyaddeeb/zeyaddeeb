import type { CSSProperties } from "react";
import { type Copy, copies } from "./levels";

export function lineStyle(copy: Copy): CSSProperties {
	return {
		"--line": copy.line.color,
		"--on-line": `var(--${copy.line.text})`,
	} as CSSProperties;
}

export function Bullet({ copy, index }: { copy: Copy; index: number }) {
	return (
		<span className="cc-bullet" style={lineStyle(copy)} aria-hidden="true">
			{index + 1}
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
	return (
		<nav className="cc-lines" aria-label="Levels">
			<ol>
				{copies.map((copy, i) => (
					<li key={copy.id}>
						<button
							type="button"
							className="cc-bullet"
							style={lineStyle(copy)}
							aria-current={i === index ? "step" : undefined}
							data-won={progress[copy.id] || undefined}
							aria-label={`Level ${i + 1}: ${copy.title}${progress[copy.id] ? ", matched" : ""}`}
							onClick={() => onOpen(i)}
						>
							{i + 1}
						</button>
					</li>
				))}
			</ol>
		</nav>
	);
}
