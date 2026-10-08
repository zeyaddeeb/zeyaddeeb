"use client";

import { useEffect, useRef } from "react";
import {
	bedsideWords,
	dishInterval,
	dishWords,
	hazardInterval,
	type Pair,
	title,
	VERDICTS,
	verdictWords,
} from "./model";
import "./sheet.css";

const W = 300;
const H = 44;

function Interval({
	low,
	mid,
	high,
	at,
	span,
	tone,
}: {
	low: number;
	mid: number;
	high: number;
	at: number;
	span: number;
	tone: "help" | "hurt";
}) {
	const x = (v: number) =>
		Math.max(6, Math.min(W - 6, W / 2 + ((v - at) / span) * (W / 2 - 6)));

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
		<section className="lt-panel lt-panel--dish">
			<h3>In the dish</h3>
			<p className="lt-panel__big">
				{Math.abs(mid).toFixed(2)}
				<small> SD {way}</small>
			</p>
			<Interval
				low={-high}
				mid={-mid}
				high={-low}
				at={0}
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
		<section className="lt-panel lt-panel--bedside">
			<h3>At the bedside</h3>
			<p className="lt-panel__big">
				{mid.toFixed(2)}
				<small> hazard of stopping</small>
			</p>
			<Interval
				low={-Math.log(high)}
				mid={-Math.log(mid)}
				high={-Math.log(low)}
				at={0}
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

export function PairSheet({
	pair,
	open,
	onClose,
}: {
	pair: Pair | null;
	open: boolean;
	onClose: () => void;
}) {
	const sheet = useRef<HTMLDialogElement>(null);
	const current = pair;

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

	return (
		<dialog ref={sheet} className="lt-sheet" aria-labelledby="lt-sheet-title">
			{current ? (
				<>
					<header className="lt-sheet__head">
						<h2 id="lt-sheet-title">{title(current)}</h2>
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
					<p
						className={`lt-verdict lt-verdict--${current.verdict.replace(" ", "-")}`}
					>
						<strong>{VERDICTS[current.verdict]}</strong>
						{verdictWords(current)}
					</p>
					<div className="lt-panels">
						<Dish pair={current} />
						<Bedside pair={current} />
					</div>
					<p className="lt-sheet__foot">
						Patients from MSK-CHORD, the development cohort. This has not been
						checked in a second hospital yet.
					</p>
				</>
			) : null}
		</dialog>
	);
}
