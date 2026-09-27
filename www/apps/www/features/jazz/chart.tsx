"use client";

import type { ReactNode } from "react";
import { CodeLine, wordAt } from "./code-line";
import { Glyph } from "./glyph";
import { ratioLabel } from "./music";
import { type LaneId, laneIds, type Problem, type Score } from "./score";

interface ChartProps {
	score: Score;
	problems: Record<LaneId, Problem | null>;
	changed: string[];
	selection: { lane: LaneId; start: number } | null;
	readout: ReactNode;
	onCode: (lane: LaneId, code: string) => void;
	onSelect: (selection: { lane: LaneId; start: number } | null) => void;
	onReset: () => void;
	edited: boolean;
}

export function Chart({
	score,
	problems,
	changed,
	selection,
	readout,
	onCode,
	onSelect,
	onReset,
	edited,
}: ChartProps) {
	return (
		<section className="jz-chart" aria-label="The band’s code">
			<header className="jz-chart-head">
				<h2 className="jz-eyebrow">The chart</h2>
				<button
					type="button"
					className="jz-link"
					onClick={onReset}
					disabled={!edited}
				>
					Start over
				</button>
			</header>
			<div className="jz-readout">{readout}</div>
			<div className="jz-lines">
				<p
					className="jz-line"
					data-changed={changed.includes("tempo") || undefined}
				>
					<span className="jz-line-name">tempo</span>
					<code>{score.tempo}</code>
				</p>
				<p
					className="jz-line"
					data-changed={changed.includes("swing") || undefined}
				>
					<span className="jz-line-name">swing</span>
					<code>{ratioLabel(score.swing)}</code>
				</p>
				{laneIds.map((lane) => (
					<div
						key={lane}
						className="jz-line"
						data-lane={lane}
						data-changed={changed.includes(lane) || undefined}
					>
						<span className="jz-line-name">
							<Glyph lane={lane} size={10} />
							{lane}
						</span>
						<CodeLine
							lane={lane}
							code={score.code[lane]}
							problem={problems[lane]}
							muted={false}
							selected={selection?.lane === lane ? selection.start : null}
							onChange={(code) => onCode(lane, code)}
							onCaret={(at) => {
								const word = wordAt(score.code[lane], at);
								if (word) onSelect({ lane, start: word[0] });
							}}
						/>
					</div>
				))}
			</div>
		</section>
	);
}
