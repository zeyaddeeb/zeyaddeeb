"use client";

import { useEffect, useRef } from "react";
import {
	bedsideTone,
	bedsideWords,
	cancerName,
	className,
	dishInterval,
	dishTone,
	dishWords,
	hazardInterval,
	inSentence,
	longMarker,
	type Pair,
	step,
	title,
	VERDICTS,
	verdictWords,
} from "./model";
import "./sheet.css";

export type View =
	| { kind: "pair"; pair: Pair; back: View | null }
	| { kind: "gene"; biomarker: string; cancer: string; pairs: Pair[] }
	| { kind: "findings"; cancer: string; pairs: Pair[] };

const W = 300;
const H = 44;

function Interval({
	low,
	mid,
	high,
	span,
	tone,
}: {
	low: number;
	mid: number;
	high: number;
	span: number;
	tone: "help" | "hurt";
}) {
	const x = (v: number) =>
		Math.max(6, Math.min(W - 6, W / 2 + (v / span) * (W / 2 - 6)));

	return (
		<svg className="lt-interval" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
			<line
				className="lt-interval__axis"
				x1={6}
				x2={W - 6}
				y1={H / 2}
				y2={H / 2}
			/>
			<line
				className="lt-interval__zero"
				x1={W / 2}
				x2={W / 2}
				y1={8}
				y2={H - 8}
			/>
			<rect
				className={`lt-interval__span lt-interval__span--${tone}`}
				x={Math.min(x(low), x(high))}
				y={H / 2 - 5}
				width={Math.max(2, Math.abs(x(high) - x(low)))}
				height={10}
			/>
			<rect
				className="lt-interval__mid"
				x={x(mid) - 2}
				y={H / 2 - 11}
				width={4}
				height={22}
			/>
		</svg>
	);
}

function Dish({ pair }: { pair: Pair }) {
	const [low, mid, high] = dishInterval(pair);
	const way = mid < 0 ? "more sensitive" : "less sensitive";

	return (
		<section className="lt-panel">
			<h3>In the dish</h3>
			<p className="lt-panel__big">
				{Math.abs(mid).toFixed(2)}
				<small> SD {way}</small>
			</p>
			<Interval
				low={-high}
				mid={-mid}
				high={-low}
				span={2}
				tone={mid < 0 ? "help" : "hurt"}
			/>
			<p className="lt-panel__scale">
				<span>resists</span>
				<span>sensitizes</span>
			</p>
			<p>{dishWords(pair)}</p>
			<p className="lt-panel__note">
				Drug response from the PRISM secondary screen, mutations and copy number
				from DepMap 24Q4.
			</p>
		</section>
	);
}

function Bedside({ pair }: { pair: Pair }) {
	const [low, mid, high] = hazardInterval(pair);

	return (
		<section className="lt-panel">
			<h3>At the bedside</h3>
			<p className="lt-panel__big">
				{mid.toFixed(2)}
				<small> hazard of stopping</small>
			</p>
			<Interval
				low={-Math.log(high)}
				mid={-Math.log(mid)}
				high={-Math.log(low)}
				span={1}
				tone={mid < 1 ? "help" : "hurt"}
			/>
			<p className="lt-panel__scale">
				<span>comes off sooner</span>
				<span>stays on longer</span>
			</p>
			<p>{bedsideWords(pair)}</p>
			<p className="lt-panel__note">
				95% interval {low.toFixed(2)} to {high.toFixed(2)}. Compared with the
				same patients’ other drug classes, so a mutation that marks a harder
				cancer overall does not count.
			</p>
		</section>
	);
}

function Mini({ pair }: { pair: Pair }) {
	const dish = `lt-${dishTone(pair)} lt-step-${step(pair.dish.sensitizes)}`;
	const bed = `lt-${bedsideTone(pair)} lt-step-${step(pair.bedside.benefit)}`;

	return (
		<span
			className={pair.label ? "lt-mini lt-mini--label" : "lt-mini"}
			aria-hidden="true"
		>
			<span className={`lt-mini__dish ${dish}`} />
			<span className={`lt-mini__bed ${bed}`} />
		</span>
	);
}

function PairList({
	pairs,
	name,
	back,
	onView,
}: {
	pairs: readonly Pair[];
	name: (pair: Pair) => string;
	back: View;
	onView: (view: View) => void;
}) {
	return (
		<ul className="lt-list">
			{pairs.map((p) => {
				const [, hazard] = hazardInterval(p);

				return (
					<li key={`${p.biomarker}|${p.drugClass}`}>
						<button
							type="button"
							className="lt-list__item"
							onClick={() => onView({ kind: "pair", pair: p, back })}
						>
							<Mini pair={p} />
							<span className="lt-list__name">{name(p)}</span>
							<span
								className={`lt-list__verdict lt-list__verdict--${p.verdict.replace(" ", "-")}`}
							>
								{VERDICTS[p.verdict]}
							</span>
							<span className="lt-list__numbers">
								cells {Math.abs(p.dish.effect).toFixed(2)} SD{" "}
								{p.dish.effect < 0 ? "more" : "less"} sensitive · hazard{" "}
								{hazard.toFixed(2)}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

function heading(view: View): string {
	if (view.kind === "pair") return title(view.pair);

	if (view.kind === "gene") {
		return `${longMarker(view.biomarker)} · ${cancerName(view.cancer)}`;
	}

	return `${cancerName(view.cancer)}: what held up`;
}

function backLabel(view: View): string | null {
	if (view.kind !== "pair" || !view.back) return null;

	return view.back.kind === "gene" ? "All drugs" : "Findings";
}

function Detail({
	view,
	onView,
}: {
	view: View;
	onView: (view: View) => void;
}) {
	if (view.kind === "pair") {
		return (
			<>
				<p
					className={`lt-verdict lt-verdict--${view.pair.verdict.replace(" ", "-")}`}
				>
					<strong>{VERDICTS[view.pair.verdict]}</strong>
					{verdictWords(view.pair)}
				</p>
				<div className="lt-panels">
					<Dish pair={view.pair} />
					<Bedside pair={view.pair} />
				</div>
			</>
		);
	}

	if (view.kind === "gene") {
		return (
			<PairList
				pairs={view.pairs}
				name={(p) => className(p.drugClass)}
				back={view}
				onView={onView}
			/>
		);
	}

	return (
		<>
			<p className="lt-findings__lead">
				{view.pairs.length} sure calls in the dish for{" "}
				{cancerName(view.cancer).toLowerCase()} cancer. The ones that held up or
				reversed come first; for the rest, the patient records cannot tell
				either way.
			</p>
			<PairList
				pairs={view.pairs}
				name={(p) => `${longMarker(p.biomarker)} · ${inSentence(p.drugClass)}`}
				back={view}
				onView={onView}
			/>
		</>
	);
}

export function Sheet({
	view,
	open,
	onClose,
	onView,
}: {
	view: View | null;
	open: boolean;
	onClose: () => void;
	onView: (view: View) => void;
}) {
	const sheet = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const d = sheet.current;

		if (!d) return;

		if (open && !d.open) d.showModal();
		if (!open && d.open) d.close();
	}, [open]);

	useEffect(() => {
		const d = sheet.current;

		if (!d) return;

		const closed = () => onClose();
		const backdrop = (e: MouseEvent) => {
			if (e.target === d) d.close();
		};

		d.addEventListener("close", closed);
		d.addEventListener("click", backdrop);

		return () => {
			d.removeEventListener("close", closed);
			d.removeEventListener("click", backdrop);
		};
	}, [onClose]);

	const back = view ? backLabel(view) : null;

	return (
		<dialog ref={sheet} className="lt-sheet" aria-labelledby="lt-sheet-title">
			{view ? (
				<>
					<header className="lt-sheet__head">
						{back && view.kind === "pair" && view.back ? (
							<button
								type="button"
								className="lt-sheet__back"
								onClick={() => view.back && onView(view.back)}
							>
								<svg viewBox="0 0 16 16" aria-hidden="true">
									<path d="M10 3 L5 8 L10 13" />
								</svg>
								{back}
							</button>
						) : null}
						<h2 id="lt-sheet-title">{heading(view)}</h2>
						<button
							type="button"
							className="lt-sheet__close"
							aria-label="Close"
							onClick={() => sheet.current?.close()}
						>
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<path d="M3 3 L13 13 M13 3 L3 13" />
							</svg>
						</button>
					</header>
					<Detail view={view} onView={onView} />
					<p className="lt-sheet__foot">
						Patients from MSK-CHORD, the development cohort. This has not been
						checked in a second hospital yet.
					</p>
				</>
			) : null}
		</dialog>
	);
}

export function Panel({
	view,
	onView,
	onHome,
}: {
	view: View;
	onView: (view: View) => void;
	onHome: () => void;
}) {
	const back = backLabel(view);

	return (
		<section className="lt-aside" aria-label="Details">
			<header className="lt-aside__head">
				<h2>{heading(view)}</h2>
				{back && view.kind === "pair" && view.back ? (
					<button
						type="button"
						className="lt-aside__back"
						onClick={() => view.back && onView(view.back)}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path d="M10 3 L5 8 L10 13" />
						</svg>
						{back}
					</button>
				) : view.kind !== "findings" ? (
					<button type="button" className="lt-aside__back" onClick={onHome}>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path d="M10 3 L5 8 L10 13" />
						</svg>
						Findings
					</button>
				) : null}
			</header>
			<div className="lt-aside__body">
				<Detail view={view} onView={onView} />
			</div>
		</section>
	);
}
