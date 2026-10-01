"use client";

import { useEffect, useState } from "react";
import { loadEpisodes, searchEpisodes } from "@/features/proofs/server/shift";
import type { Episode, Front } from "./protocol";

export type Outcome = "proved" | "broke" | "held" | "quiet";

export function outcome(episode: Episode): Outcome {
	if (episode.verified > 0) return "proved";

	if (episode.broken > 0) return "broke";

	if (episode.held > 0) return "held";

	return "quiet";
}

const SLOTS = 60;
const PAUSE = 250;

const OUTCOMES: [Outcome, string][] = [
	["proved", "proved"],
	["held", "prediction held"],
	["broke", "prediction broke"],
	["quiet", "nothing settled"],
];

export function Quilt({
	latest,
	running,
	viewing,
	fronts,
	onPick,
}: {
	latest: Episode[];
	running: { number: number; front: string } | null;
	viewing: number | null;
	fronts: Front[];
	onPick: (number: number | null) => void;
}) {
	const [befores, setBefores] = useState<number[]>([]);
	const [older, setOlder] = useState<Episode[] | null>(null);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Episode[] | null>(null);
	const before = befores.at(-1) ?? null;
	const searching = query.trim().length > 0;

	useEffect(() => {
		const words = query.trim();

		if (!words) {
			setResults(null);

			return;
		}

		let current = true;

		const timer = window.setTimeout(() => {
			searchEpisodes(words).then((found) => {
				if (current) setResults(found.ok ? found.value : []);
			});
		}, PAUSE);

		return () => {
			current = false;
			window.clearTimeout(timer);
		};
	}, [query]);

	useEffect(() => {
		if (before === null) {
			setOlder(null);

			return;
		}

		let current = true;

		loadEpisodes(before).then((loaded) => {
			if (current) setOlder(loaded.ok ? loaded.value : []);
		});

		return () => {
			current = false;
		};
	}, [before]);

	const live = before === null && running ? 1 : 0;

	const page = (before === null ? latest : (older ?? []))
		.slice(0, SLOTS - live)
		.reverse();

	const first = page[0]?.number ?? 0;
	const last = page.at(-1)?.number ?? 0;
	const title = (id: string) => fronts.find((f) => f.id === id)?.title ?? id;

	return (
		<section className="ns-quilt" aria-label="Every episode">
			<header className="ns-quilt-head">
				<p className="ns-eyebrow">
					{page.length ? `Episodes ${first}–${last}` : "Episodes"}
				</p>
				<div className="ns-pager">
					<button
						type="button"
						disabled={searching || first <= 1}
						onClick={() => setBefores((b) => [...b, first])}
						aria-label="Older episodes"
					>
						←
					</button>
					<button
						type="button"
						disabled={searching || !befores.length}
						onClick={() => setBefores((b) => b.slice(0, -1))}
						aria-label="Newer episodes"
					>
						→
					</button>
				</div>
			</header>
			<search className="ns-search-box">
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search its episodes, or #12"
					aria-label="Search episodes"
					maxLength={100}
					autoComplete="off"
					spellCheck={false}
				/>
			</search>
			<div className="ns-well">
				{searching ? (
					<ol className="ns-results" aria-live="polite">
						{results === null ? (
							<li className="ns-empty">Searching…</li>
						) : results.length === 0 ? (
							<li className="ns-empty">No episode mentions that.</li>
						) : (
							results.map((episode) => (
								<li key={episode.number}>
									<button
										type="button"
										aria-pressed={viewing === episode.number}
										onClick={() => onPick(episode.number)}
									>
										<span
											className="ns-cell ns-result-mark"
											data-outcome={outcome(episode)}
											aria-hidden="true"
										/>
										<span className="ns-result-number">{episode.number}</span>
										<span className="ns-result-text">
											{title(episode.front)} · {episode.summary}
										</span>
									</button>
								</li>
							))
						)}
					</ol>
				) : (
					<ol className="ns-cells">
						{page.map((episode) => (
							<li key={episode.number}>
								<button
									type="button"
									className="ns-cell"
									data-outcome={outcome(episode)}
									aria-pressed={viewing === episode.number}
									aria-label={`Episode ${episode.number}, ${title(episode.front)}: ${episode.summary}`}
									title={`${episode.number} · ${title(episode.front)}`}
									onClick={() =>
										onPick(viewing === episode.number ? null : episode.number)
									}
								/>
							</li>
						))}
						{live && running ? (
							<li>
								<button
									type="button"
									className="ns-cell"
									data-outcome="live"
									aria-pressed={viewing === null}
									aria-label={`Episode ${running.number}, running now`}
									title={`${running.number} · now`}
									onClick={() => onPick(null)}
								/>
							</li>
						) : null}
						{Array.from(
							{
								length: Math.max(0, SLOTS - page.length - live),
							},
							(_, i) => (
								<li key={`slot-${i}`} aria-hidden="true">
									<span className="ns-slot" />
								</li>
							),
						)}
					</ol>
				)}
			</div>
			<ul className="ns-key">
				{OUTCOMES.map(([id, text]) => (
					<li key={id}>
						<span className="ns-cell" data-outcome={id} aria-hidden="true" />
						{text}
					</li>
				))}
			</ul>
		</section>
	);
}
