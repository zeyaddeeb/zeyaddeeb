"use client";

import { ReservedText } from "@/components/reserved-text";
import { caption, unmarked } from "@/features/proofs/shift/caption";
import type { Live } from "./reduce";
import type { Connection } from "./use-research";

const SAID: Record<Connection, string> = {
	waking: "Waking",
	live: "Working",
	reconnecting: "Reconnecting",
	paused: "Paused",
	closed: "Off",
};

const SAMPLES = Object.values(SAID);

export function Shift({
	live,
	connection,
	off,
}: {
	live: Live | null;
	connection: Connection;
	off: boolean;
}) {
	if (off || connection === "closed") {
		return (
			<section className="rs-shift" data-off="true" aria-label="The agent">
				<h3 className="rs-shift__title">The agent is off</h3>
				<p className="rs-shift__note">
					It runs only while someone is watching, and it is not running now. The
					nodule above is the same kernel it is graded by, so the page works
					without it.
				</p>
			</section>
		);
	}

	const steps = live?.steps ?? [];
	const thinking = unmarked(live?.thought ?? "");
	const lines = thinking
		? caption(thinking)
		: live?.resting
			? { before: null, now: live.resting, whole: true }
			: null;
	const rules = live?.rules ?? null;

	return (
		<section className="rs-shift" aria-label="The agent">
			<h3 className="rs-shift__title">
				<span className="rs-dot" data-connection={connection} />
				<ReservedText text={SAID[connection]} samples={SAMPLES} />
				{live?.episode ? (
					<span className="rs-shift__episode">episode {live.episode}</span>
				) : null}
			</h3>

			<ol className="rs-steps">
				{steps.map((step) => (
					<li
						key={step.id}
						className="rs-step"
						data-ok={step.ok === undefined ? undefined : step.ok}
					>
						<span className="rs-step__tool">{step.tool}</span>
						<span className="rs-step__said">{step.summary ?? "\u00a0"}</span>
					</li>
				))}
				{steps.length === 0 ? (
					<li className="rs-step" data-waiting="true">
						<span className="rs-step__tool">waiting</span>
						<span className="rs-step__said">&nbsp;</span>
					</li>
				) : null}
			</ol>

			<div className="rs-shift__thought" aria-live="polite">
				<p className="rs-shift__before">{lines?.before ?? "\u00a0"}</p>
				<p className="rs-shift__now">{lines?.now ?? "\u00a0"}</p>
			</div>

			<div className="rs-rules">
				<p className="rs-rules__now">
					{!rules || rules.lines.length === 0
						? "No rules yet."
						: rules.lines.map((line) => `· ${line}`).join(" ")}
				</p>
				<p className="rs-rules__trial">
					{rules?.challenger
						? `On trial, blind: ${rules.pairs} of ${rules.trialPairs} pairs`
						: "\u00a0"}
				</p>
			</div>

			<dl className="rs-vitals">
				<div>
					<dt>Sealed</dt>
					<dd>{live?.tally.cards ?? 0}</dd>
				</div>
				<div>
					<dt>Held</dt>
					<dd>{live?.tally.held ?? 0}</dd>
				</div>
				<div>
					<dt>Broken</dt>
					<dd>{live?.tally.broken ?? 0}</dd>
				</div>
				<div>
					<dt>Refused</dt>
					<dd>{live?.tally.refused ?? 0}</dd>
				</div>
			</dl>
		</section>
	);
}
