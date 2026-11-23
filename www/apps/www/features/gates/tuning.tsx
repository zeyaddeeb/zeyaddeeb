"use client";

import { useState } from "react";
import { span } from "./ladder";
import type { Lab } from "./protocol";
import { pairLabel, position, recipe, side, trialLine } from "./tuning-text";

const CELLS = 24;
const PAIR_ROWS = 8;
const TICKS = ["1", "100", "10k", "1M", "100M"];

export function Tuning({ lab }: { lab: Lab }) {
	const [picked, setPicked] = useState<number | null>(null);
	const trials = lab.trials;
	const trial =
		trials.find((t) => t.number === picked) ?? trials.at(-1) ?? null;
	const running = lab.working?.id.startsWith("trial-") ? lab.working : null;
	const kept = trials.filter((t) => t.kept).length;

	return (
		<section className="gf-tuning" aria-labelledby="gf-tuning-title">
			<header className="gf-tuning-head">
				<h3 id="gf-tuning-title">It tunes its own prover</h3>
				<p>
					Every so often the lab changes one thing about how it searches and
					races the change against its current method on recent proofs. A change
					stays only if its proofs come out shorter by a sign test and Knuth’s
					table still checks out, class by class.
				</p>
			</header>
			<div className="gf-tuning-body">
				<div className="gf-tuning-method">
					<p className="gf-eyebrow">
						Method {lab.method.version} · {kept} of {trials.length} changes kept
					</p>
					<ul className="gf-recipe">
						{recipe(lab.method).map((part) => (
							<li key={part}>{part}</li>
						))}
					</ul>
					<p className="gf-tuning-next">
						{running
							? `Testing now: ${running.note ?? "a change"}`
							: `${trials.length ? "Next" : "First"} trial after ${span(lab.nextTrialMillis)} more research`}
					</p>
				</div>
				<div className="gf-tuning-trials">
					<p className="gf-eyebrow">Trials</p>
					<ol className="gf-trial-cells" aria-label="Trials, oldest first">
						{Array.from({ length: CELLS }, (_, at) => {
							const shown = trials[at];

							if (!shown) {
								return (
									<li key={`empty-${at + 1}`} aria-hidden="true">
										<span className="gf-trial-cell" data-empty />
									</li>
								);
							}

							return (
								<li key={shown.number}>
									<button
										type="button"
										className="gf-trial-cell"
										data-kept={shown.kept || undefined}
										aria-pressed={shown.number === trial?.number}
										aria-label={`Trial ${shown.number}: ${shown.label}`}
										onClick={() => setPicked(shown.number)}
									/>
								</li>
							);
						})}
					</ol>
					<p className="gf-trial-label">
						{trial ? `Trial ${trial.number}: ${trial.label}` : "No trials yet."}
					</p>
					<p className="gf-trial-line">{trial ? trialLine(trial) : " "}</p>
				</div>
				<div className="gf-tuning-pairs">
					<p className="gf-eyebrow">
						Lemmas per proof, current method and change
					</p>
					<ol className="gf-pairs">
						{Array.from({ length: PAIR_ROWS }, (_, at) => {
							const pair = trial?.pairs[at];

							if (!trial && at === 0) {
								return (
									<li key="empty" className="gf-pairs-empty">
										Each trial races the change on up to eight recent proofs.
									</li>
								);
							}

							if (!pair) {
								return <li key={`slot-${at + 1}`} aria-hidden="true" />;
							}

							const before = position(pair.before);
							const after = position(pair.after);
							const low = Math.min(before ?? 1, after ?? 1);
							const high = Math.max(before ?? 1, after ?? 1);

							return (
								<li key={`${pair.id}-${pair.gates}`} data-side={side(pair)}>
									<span className="gf-pair-label">
										{pairLabel(pair, lab.studies)}
									</span>
									<span className="gf-pair-track" aria-hidden="true">
										<span
											className="gf-pair-span"
											style={
												{ "--low": low, "--high": high } as React.CSSProperties
											}
										/>
										<span
											className="gf-pair-before"
											data-timeout={before === null || undefined}
											style={{ "--at": before ?? 1 } as React.CSSProperties}
										/>
										<span
											className="gf-pair-after"
											data-timeout={after === null || undefined}
											style={{ "--at": after ?? 1 } as React.CSSProperties}
										/>
									</span>
								</li>
							);
						})}
					</ol>
					<p className="gf-pair-ticks" aria-hidden="true">
						{TICKS.map((tick) => (
							<span key={tick}>{tick}</span>
						))}
					</p>
				</div>
			</div>
		</section>
	);
}
