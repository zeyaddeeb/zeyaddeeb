import { number } from "./formula";
import {
	BUDGET,
	count,
	describe,
	percent,
	type Tally,
	type Tile,
	verdict,
} from "./model";

export function Bet({ tally }: { tally: Tally | null }) {
	const shown = tally?.votes.slice(0, 3) ?? [];
	const rest = Math.max(0, 1 - shown.reduce((s, v) => s + v.share, 0));
	const slots = [0, 1, 2].map((rank) => shown[rank] ?? null);

	return (
		<ol className="ep-bet" aria-label="What the crowd says comes next">
			{slots.map((v, rank) => (
				<li key={rank} className="ep-bet__item" data-tone={rank}>
					<span className="ep-bet__swatch" aria-hidden="true" />
					<span className="ep-bet__value">{v ? number(v.value) : ""}</span>
					<span className="ep-bet__share">{v ? percent(v.share) : ""}</span>
				</li>
			))}
			<li className="ep-bet__item" data-tone={3}>
				<span className="ep-bet__swatch" aria-hidden="true" />
				<span className="ep-bet__value">other</span>
				<span className="ep-bet__share">{tally ? percent(rest) : ""}</span>
			</li>
		</ol>
	);
}

export function Counts({ tally }: { tally: Tally | null }) {
	return (
		<p className="ep-counts">
			{tally ? (
				<>
					<span>{count(tally.considered)} run</span>
					<span>
						{count(tally.fitting)}{" "}
						<span className="ep-counts__long">still </span>
						fit
					</span>
					<span>{count(tally.silent)} never answered</span>
					<span className="ep-counts__far">
						{percent(tally.unexplored)} of the square is over {BUDGET} bits,
						never run
					</span>
				</>
			) : (
				<span>Writing down every program up to {BUDGET} bits…</span>
			)}
		</p>
	);
}

export function Readout({ focus, hint }: { focus: Tile | null; hint: string }) {
	return (
		<p className="ep-readout" aria-live="polite">
			{focus ? (
				<>
					<span className="ep-readout__rule">{describe(focus)}</span>
					<span className="ep-readout__meta">{verdict(focus)}</span>
				</>
			) : (
				<span className="ep-readout__hint">{hint}</span>
			)}
		</p>
	);
}

export function Key() {
	return (
		<p className="ep-key">
			<span className="ep-key__item" data-tone={4}>
				<span className="ep-bet__swatch" aria-hidden="true" />
				never answered
			</span>
			<span className="ep-key__item" data-tone="blank">
				<span className="ep-bet__swatch" aria-hidden="true" />
				ruled out, or longer than {BUDGET} bits
			</span>
		</p>
	);
}
