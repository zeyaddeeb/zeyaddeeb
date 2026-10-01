"use client";

import { useState } from "react";
import { count } from "./format";
import type { Lemma } from "./protocol";

const PER_PAGE = 5;

type Shelf = "proved" | "routine";

const SHELVES: { id: Shelf; title: string; empty: string }[] = [
	{
		id: "proved",
		title: "Proved",
		empty: "Nothing beyond routine yet. The first rungs are waiting.",
	},
	{
		id: "routine",
		title: "Routine",
		empty: "Nothing that automation proves on its own.",
	},
];

export function Library({ lemmas }: { lemmas: Lemma[] }) {
	const [shelf, setShelf] = useState<Shelf>("proved");
	const [page, setPage] = useState(0);
	const [picked, setPicked] = useState<string | null>(null);

	const sorted = [...lemmas].sort(
		(a, b) => b.episode - a.episode || a.name.localeCompare(b.name),
	);

	const shelves: Record<Shelf, Lemma[]> = {
		proved: sorted.filter((l) => !l.routine),
		routine: sorted.filter((l) => l.routine),
	};

	const kept = shelves[shelf];
	const pages = Math.max(1, Math.ceil(kept.length / PER_PAGE));
	const at = Math.min(page, pages - 1);
	const shown = kept.slice(at * PER_PAGE, at * PER_PAGE + PER_PAGE);
	const chosen = kept.find((l) => l.name === picked) ?? shown[0] ?? null;
	const empty = SHELVES.find((s) => s.id === shelf)?.empty ?? "";

	return (
		<section className="ns-block ns-library" aria-labelledby="ns-library-title">
			<header className="ns-block-head">
				<h3 id="ns-library-title">Its Lean library</h3>
				<p>
					Checked by Lean against Mathlib, resting only on propext,
					Classical.choice and Quot.sound. Routine lemmas are ones Lean’s
					automation proves with no help.
				</p>
			</header>
			<div className="ns-shelf">
				<div className="ns-shelf-index">
					<div className="ns-shelf-tabs">
						{SHELVES.map((s) => (
							<button
								key={s.id}
								type="button"
								aria-pressed={shelf === s.id}
								onClick={() => {
									setShelf(s.id);
									setPage(0);
									setPicked(null);
								}}
							>
								{s.title} <b>{count(shelves[s.id].length)}</b>
							</button>
						))}
					</div>
					<ol className="ns-shelf-list">
						{Array.from({ length: PER_PAGE }, (_, row) => {
							const lemma = shown[row];

							return (
								<li key={lemma?.name ?? `empty-${row}`}>
									{lemma ? (
										<button
											type="button"
											aria-pressed={chosen?.name === lemma.name}
											onClick={() => setPicked(lemma.name)}
										>
											<span>{lemma.name}</span>
											<span className="ns-shelf-episode">{lemma.episode}</span>
										</button>
									) : null}
								</li>
							);
						})}
					</ol>
					<div className="ns-pager ns-pager--foot">
						<button
							type="button"
							disabled={at === 0}
							onClick={() => setPage(at - 1)}
							aria-label="Newer lemmas"
						>
							←
						</button>
						<span>{kept.length ? `${at + 1} / ${pages}` : "0 / 0"}</span>
						<button
							type="button"
							disabled={at >= pages - 1}
							onClick={() => setPage(at + 1)}
							aria-label="Older lemmas"
						>
							→
						</button>
					</div>
				</div>
				<div className="ns-shelf-sheet">
					<pre className="ns-code ns-shelf-code">{chosen?.code ?? empty}</pre>
					<p className="ns-provenance">
						{chosen
							? `Episode ${chosen.episode} · axioms ${chosen.axioms.join(", ") || "none"}`
							: " "}
					</p>
				</div>
			</div>
		</section>
	);
}
