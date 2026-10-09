"use client";

import { useCallback, useMemo, useState } from "react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { Finder } from "./finder";
import {
	cancerName,
	counts,
	findingsOf,
	loadEvery,
	MOSAICS,
	type Mosaic as MosaicData,
	markerName,
	matches,
	type Pair,
	pairsOf,
	ROWS,
	rowsOf,
	title,
	VERDICTS,
} from "./model";
import { Mosaic, type Row } from "./mosaic";
import { Panel, Sheet, type View } from "./sheet";
import "./lab.css";
import "./phone.css";

const fallback = MOSAICS[0];

function Key() {
	return (
		<ul className="lt-key" aria-label="How to read a square">
			<li>
				<span className="lt-key__split" aria-hidden="true" />
				upper half cells, lower half patients
			</li>
			<li>
				<span className="lt-swatch lt-swatch--help" aria-hidden="true" />
				works better
			</li>
			<li>
				<span className="lt-swatch lt-swatch--hurt" aria-hidden="true" />
				works worse
			</li>
			<li>
				<span className="lt-ramp" aria-hidden="true" />
				paler, less sure
			</li>
			<li>
				<span className="lt-swatch lt-swatch--label" aria-hidden="true" />
				on the drug’s label
			</li>
		</ul>
	);
}

function Tally({ pairs }: { pairs: readonly Pair[] }) {
	const c = counts(pairs);

	return (
		<p className="lt-tally" aria-live="polite">
			<span>
				<strong>{c.called}</strong> sure in the dish
			</span>
			<span className="lt-tally__held">
				<strong>{c.held}</strong> held up
			</span>
			<span className="lt-tally__reversed">
				<strong>{c.reversed}</strong> reversed
			</span>
			<span>
				<strong>{c.unresolved}</strong> can’t tell
			</span>
		</p>
	);
}

function toRow(
	pairs: readonly Pair[],
	biomarker: string,
	flags: { exploratory: boolean; pinned: boolean },
): Row {
	return {
		biomarker,
		...flags,
		pairs: new Map(pairsOf(pairs, biomarker).map((p) => [p.drugClass, p])),
	};
}

export function TranslationLab() {
	const [cancer, setCancer] = useState(fallback?.cancer ?? "");
	const [reveal, setReveal] = useState(0);
	const [view, setView] = useState<View | null>(null);
	const [open, setOpen] = useState(false);
	const [pointed, setPointed] = useState<Pair | null>(null);
	const [every, setEvery] = useState<MosaicData[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [all, setAll] = useState(false);
	const [find, setFind] = useState("");
	const wide = useMediaQuery("(min-width: 1100px)");
	const mosaic = MOSAICS.find((m) => m.cancer === cancer) ?? fallback;
	const extra = every?.find((m) => m.cancer === cancer);

	const load = useCallback(() => {
		if (every || loading) return;

		setLoading(true);
		loadEvery()
			.then(setEvery)
			.finally(() => setLoading(false));
	}, [every, loading]);

	const tested = useMemo(() => mosaic?.pairs ?? [], [mosaic]);
	const testedGenes = useMemo(
		() => new Set(tested.map((p) => p.biomarker)),
		[tested],
	);
	const explored = useMemo(
		() => (extra?.pairs ?? []).filter((p) => !testedGenes.has(p.biomarker)),
		[extra, testedGenes],
	);
	const order = useMemo(() => rowsOf(tested), [tested]);
	const findings = useMemo<View>(
		() => ({ kind: "findings", cancer, pairs: findingsOf(tested) }),
		[cancer, tested],
	);
	const pinned = useMemo(() => {
		const hits = order.filter((b) => matches(b, find));
		const more = rowsOf(explored).filter((b) => matches(b, find));

		return [
			...hits.map((b) =>
				toRow(tested, b, { exploratory: false, pinned: true }),
			),
			...more.map((b) =>
				toRow(explored, b, { exploratory: true, pinned: true }),
			),
		];
	}, [order, explored, tested, find]);

	if (!mosaic) return null;

	const shown = view ?? findings;

	const rest = order
		.filter((b) => !pinned.some((r) => r.biomarker === b))
		.map((b) => toRow(tested, b, { exploratory: false, pinned: false }));
	const rows = [...pinned, ...rest].slice(0, all ? undefined : ROWS);
	const slots = all ? Math.max(ROWS, rows.length) : ROWS;
	const names = [
		...new Set(
			[...order, ...rowsOf(explored)].map((b) => markerName(b)).sort(),
		),
	];
	const sought = find.trim().toUpperCase();
	const missing = sought.length > 1 && pinned.length === 0 && Boolean(every);

	const show = (next: View) => {
		setView(next);

		if (!wide) setOpen(true);
	};

	const hint = missing
		? `No ${sought} in ${cancerName(cancer).toLowerCase()} cancer here.`
		: pinned.some((r) => r.exploratory)
			? "Yellow rows: exploratory, not in the result."
			: "Tap a square, or a gene’s name.";

	return (
		<div className="lt">
			<div className="lt-bar">
				<div className="lt-tabs" role="tablist" aria-label="Cancer">
					{MOSAICS.map((m) => (
						<button
							key={m.cancer}
							type="button"
							role="tab"
							aria-selected={m.cancer === cancer}
							className="lt-tab"
							onClick={() => {
								setCancer(m.cancer);
								setAll(false);
								setView(null);
							}}
						>
							{cancerName(m.cancer)}
						</button>
					))}
				</div>

				<label className="lt-reveal">
					<span className="lt-reveal__end">Promise</span>
					<input
						type="range"
						min={0}
						max={100}
						value={Math.round(reveal * 100)}
						aria-label="From what the dish promises to what patients showed"
						aria-valuetext={
							reveal < 0.5 ? "Showing the dish’s promise" : "Showing patients"
						}
						onChange={(e) => setReveal(Number(e.target.value) / 100)}
					/>
					<span className="lt-reveal__end">Patients</span>
				</label>

				<Finder
					value={find}
					names={names}
					onFocus={load}
					onChange={(next) => {
						setFind(next);
						load();
					}}
				/>
			</div>

			<div className="lt-info">
				<Tally pairs={tested} />
				<Key />
			</div>

			<div className="lt-body">
				<div className="lt-stage">
					<p className="lt-readout" aria-live="polite">
						{pointed ? (
							<>
								<span className="lt-readout__title">{title(pointed)}</span>
								<span
									className={`lt-readout__verdict lt-readout__verdict--${pointed.verdict.replace(" ", "-")}`}
								>
									{VERDICTS[pointed.verdict]}
								</span>
							</>
						) : (
							<span className="lt-readout__hint">{hint}</span>
						)}
					</p>
					<Mosaic
						rows={rows}
						slots={slots}
						trim={!all}
						reveal={reveal}
						chosen={view?.kind === "pair" && (wide || open) ? view.pair : null}
						onChoose={(pair) => show({ kind: "pair", pair, back: null })}
						onPoint={setPointed}
						onGene={(biomarker) =>
							show({
								kind: "gene",
								biomarker,
								cancer,
								pairs: pairsOf(
									testedGenes.has(biomarker) ? tested : explored,
									biomarker,
								),
							})
						}
					/>
					{order.length > ROWS ? (
						<button
							type="button"
							className="lt-more"
							aria-expanded={all}
							onClick={() => setAll(!all)}
						>
							{all ? "Show fewer genes" : `Show all ${order.length} genes`}
						</button>
					) : (
						<span className="lt-more lt-more--quiet">
							All {order.length} genes shown
						</span>
					)}
				</div>

				<Panel view={shown} onView={setView} onHome={() => setView(null)} />
			</div>

			<Sheet
				view={view}
				open={open}
				onClose={() => setOpen(false)}
				onView={setView}
			/>
		</div>
	);
}
