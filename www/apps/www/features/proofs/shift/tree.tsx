"use client";

import { useState } from "react";
import type { BlueprintNode, Tree, TreeRow, Trust, Via } from "./protocol";

const ROWS = 9;
const OPEN_PROBLEM = 1000;

const VIA: Record<Via, string> = {
	root: "The hypothesis",
	reduction: "Obligation",
	uses: "Needed first",
	implies: "Would imply its parent",
	supports: "A special case",
};

type State = "proved" | "open" | "refuted";

function state(trust: Trust): State {
	if (trust === "verified" || trust === "mathlib") return "proved";
	if (trust === "refuted") return "refuted";
	return "open";
}

function distance(row: TreeRow, proved: boolean): string {
	if (proved) return "Proved";
	if (row.number === null) return "No route";
	if (row.number >= OPEN_PROBLEM) return "Open problem";
	return `Proof number ${row.number.toFixed(1)}`;
}

export function ProofTree({
	tree,
	nodes,
}: {
	tree: Tree | null;
	nodes: Record<string, BlueprintNode>;
}) {
	const rows = tree?.rows ?? [];
	const [picked, setPicked] = useState<string | null>(null);
	const chosen =
		rows.find((row) => row.key === picked) ??
		rows.find((row) => row.key === tree?.focus) ??
		rows[0] ??
		null;
	const node = chosen ? nodes[chosen.key] : undefined;
	const trustOf = (row: TreeRow) => nodes[row.key]?.trust ?? row.trust;
	const failures = (node?.evidence ?? []).filter(
		(e) => e.tool === "lean" && e.held === false,
	).length;
	const shown = chosen ? state(trustOf(chosen)) : "open";
	const proved = rows.filter((row) => state(trustOf(row)) === "proved").length;

	return (
		<section className="ns-block ns-proof" aria-labelledby="ns-proof-title">
			<header className="ns-block-head">
				<h3 id="ns-proof-title">The proof, so far</h3>
				<p>
					Every step is checked by Lean. A reduction proves a target from
					smaller statements; prove them all and the target follows. Proof
					numbers pick the next leaf: the fewest proofs between it and the
					hypothesis, counting the times Lean already said no.
				</p>
			</header>
			<div className="ns-proof-body">
				<div className="ns-proof-index">
					<p className="ns-eyebrow">
						{rows.length
							? `${proved} of ${rows.length} steps proved · ${tree?.reductions ?? 0} reductions`
							: "Waiting for the tree"}
					</p>
					<ol className="ns-proof-rows" aria-label="The proof tree">
						{rows.map((row) => (
							<li
								key={row.key}
								style={{ "--depth": row.depth } as React.CSSProperties}
							>
								<button
									type="button"
									aria-pressed={chosen?.key === row.key}
									data-state={state(trustOf(row))}
									onClick={() => setPicked(row.key)}
								>
									<span className="ns-proof-mark" aria-hidden="true" />
									<span className="ns-proof-title">{row.title}</span>
									{row.key === tree?.focus ? (
										<span className="ns-proof-next">Next</span>
									) : null}
								</button>
							</li>
						))}
						{Array.from(
							{ length: Math.max(0, ROWS - rows.length) },
							(_, at) => (
								<li key={`empty-${at}`} aria-hidden="true" />
							),
						)}
					</ol>
				</div>
				<div className="ns-proof-sheet" data-state={shown}>
					<p className="ns-eyebrow">
						{chosen
							? `${VIA[chosen.via]}${chosen.lemma ? ` of ${chosen.lemma}` : ""} · ${chosen.key}`
							: " "}
					</p>
					<h4>{chosen?.title ?? "—"}</h4>
					<pre className="ns-code ns-proof-code">
						{chosen?.lean ?? node?.body ?? "No Lean statement."}
					</pre>
					<p className="ns-proof-facts">
						<span data-state={shown}>
							{chosen ? distance(chosen, shown === "proved") : " "}
						</span>
						<span>
							{failures === 0
								? "Lean has not refused an attempt"
								: `Lean refused ${failures} ${failures === 1 ? "attempt" : "attempts"}`}
						</span>
					</p>
				</div>
			</div>
		</section>
	);
}
