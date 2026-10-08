"use client";

import { useState } from "react";
import {
	ALL_PAIRS,
	cancerName,
	counts,
	geneOf,
	loadEvery,
	MOSAICS,
	type Mosaic as MosaicData,
	type Pair,
	title,
	VERDICTS,
} from "./model";
import { Mosaic } from "./mosaic";
import { PairSheet } from "./sheet";
import "./lab.css";
import "./phone.css";

const fallback = MOSAICS[0];

function Key() {
	return (
		<figure className="lt-key" aria-label="How to read a square">
			<svg viewBox="0 0 120 120" className="lt-key__square" aria-hidden="true">
				<polygon className="lt-key__dish" points="4,4 116,4 4,116" />
				<polygon className="lt-key__bed" points="116,4 116,116 4,116" />
				<text x="14" y="34">
					Dish
				</text>
				<text x="106" y="104" textAnchor="end">
					Bedside
				</text>
			</svg>
			<figcaption className="lt-key__text">
				<span className="lt-key__row">
					<span className="lt-swatch lt-swatch--help" /> drug works better with
					it
				</span>
				<span className="lt-key__row">
					<span className="lt-swatch lt-swatch--hurt" /> drug works worse with
					it
				</span>
				<span className="lt-key__row">
					<span className="lt-ramp" /> paler is less sure
				</span>
				<span className="lt-key__row">
					<span className="lt-swatch lt-swatch--label" /> named on the drug’s
					label
				</span>
			</figcaption>
		</figure>
	);
}

function Tally({ pairs }: { pairs: readonly Pair[] }) {
	const c = counts(pairs);

	return (
		<p className="lt-tally" aria-live="polite">
			<span>
				<strong>{c.called}</strong> sure calls in the dish
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

export function TranslationLab() {
	const [cancer, setCancer] = useState(fallback?.cancer ?? "");
	const [reveal, setReveal] = useState(0);
	const [chosen, setChosen] = useState<Pair | null>(null);
	const [open, setOpen] = useState(false);
	const [pointed, setPointed] = useState<Pair | null>(null);
	const [every, setEvery] = useState<MosaicData[] | null>(null);
	const [wide, setWide] = useState(false);
	const [failed, setFailed] = useState(false);
	const [find, setFind] = useState("");
	const source = wide && every ? every : MOSAICS;
	const mosaic = source.find((m) => m.cancer === cancer) ?? fallback;

	if (!mosaic) return null;

	const widen = () => {
		setWide(true);

		if (every) return;

		loadEvery()
			.then(setEvery)
			.catch(() => setFailed(true));
	};

	const sought = find.trim().toUpperCase();
	const focus = sought
		? mosaic.genes.findIndex((g) => geneOf(g) === sought)
		: -1;
	const names = (every ?? MOSAICS)
		.find((m) => m.cancer === cancer)
		?.genes.map(geneOf)
		.filter(Boolean);

	const seek = (value: string) => {
		setFind(value);

		const gene = value.trim().toUpperCase();
		const known = mosaic.genes.some((g) => geneOf(g) === gene);

		if (gene && !known && !wide) widen();
	};

	const choose = (pair: Pair) => {
		setChosen(pair);
		setOpen(true);
	};

	return (
		<div className="lt">
			<div className="lt-top">
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
								setChosen(null);
							}}
						>
							{cancerName(m.cancer)}
						</button>
					))}
				</div>
				<Tally pairs={mosaic.pairs.filter((p) => p.gene < mosaic.tested)} />
			</div>

			<div className="lt-tools">
				<fieldset className="lt-menu">
					<legend className="sr-only">Genes shown</legend>
					<button
						type="button"
						className="lt-menu__plate"
						aria-pressed={!wide}
						onClick={() => setWide(false)}
					>
						Tested genes
					</button>
					<button
						type="button"
						className="lt-menu__plate"
						aria-pressed={wide}
						onClick={widen}
					>
						Every panel gene
					</button>
				</fieldset>
				<label className="lt-find">
					<span>Find a gene</span>
					<input
						type="text"
						list="lt-genes"
						value={find}
						placeholder="TP53"
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => seek(e.target.value)}
					/>
					<datalist id="lt-genes">
						{names?.map((n) => (
							<option key={n} value={n} />
						))}
					</datalist>
				</label>
				<p className="lt-tools__note" aria-live="polite">
					{failed
						? "The full gene list did not load."
						: wide && !every
							? "Loading every panel gene…"
							: wide
								? "Past the yellow line: exploratory, not part of the result."
								: ""}
				</p>
			</div>

			<div className="lt-body">
				<Key />
				<div className="lt-stage">
					<p className="lt-readout" aria-hidden="true">
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
							<span className="lt-readout__hint">
								Point at a square to name it, tap it for the numbers.
							</span>
						)}
					</p>
					<Mosaic
						mosaic={mosaic}
						reveal={reveal}
						chosen={chosen}
						onChoose={choose}
						onPoint={setPointed}
						focus={focus >= 0 ? focus : null}
					/>
				</div>
			</div>

			<div className="lt-reveal">
				<span className="lt-reveal__end">
					Promise
					<small>if every dish result carried over</small>
				</span>
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
				<span className="lt-reveal__end lt-reveal__end--right">
					Patients
					<small>what 25,000 records showed</small>
				</span>
			</div>

			<p className="lt-overall">
				All five cancers: {counts(ALL_PAIRS).called} sure dish calls,{" "}
				{counts(ALL_PAIRS).held} held up, {counts(ALL_PAIRS).reversed} reversed.
			</p>

			<PairSheet pair={chosen} open={open} onClose={() => setOpen(false)} />
		</div>
	);
}
