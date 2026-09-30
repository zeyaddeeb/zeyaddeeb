"use client";

import type { About, AgentState, Change, Rules } from "./protocol";

const RULE_ROWS = 6;
const METHOD_ROWS = 5;
const W = 300;
const H = 120;
const PAD = 14;
const LEFT = 26;
const SPREAD = 12;

function signed(value: number): string {
	return `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}`;
}

function mean(values: number[]): number {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function pick(rules: Record<string, Rules>, layer: string, version?: number) {
	return version ? rules[`${layer}-${version}`] : undefined;
}

function edited(lines: string[], change: Change | null) {
	const rows = lines.map((text, at) => ({
		text,
		change: null as Change["op"] | null,
		was: "",
		key: `${at}`,
	}));
	if (!change) return rows;
	const at = (change.rule ?? 0) - 1;
	if (change.op === "add")
		rows.push({ text: change.text, change: "add", was: "", key: "added" });
	else if (rows[at])
		rows[at] = {
			...rows[at],
			text: change.op === "rewrite" ? change.text : rows[at].text,
			change: change.op,
			was: change.op === "rewrite" ? change.was : "",
		};
	return rows;
}

function Book({
	champion,
	challenger,
	last,
}: {
	champion: Rules | undefined;
	challenger: Rules | undefined;
	last: Rules | undefined;
}) {
	const rows = edited(champion?.lines ?? [], challenger?.change ?? null);
	const note = challenger?.change
		? `On trial: ${challenger.change.because}`
		: last?.change
			? `${last.standing === "lost" ? "Lost" : "Kept"}: ${last.change.because}`
			: "Its first change comes after its first sleep.";
	return (
		<div className="ns-loop" data-color="blue">
			<p className="ns-eyebrow">
				Its rules{champion ? ` · v${champion.version}` : ""}
			</p>
			<ol className="ns-loop-lines">
				{Array.from({ length: RULE_ROWS }, (_, at) => {
					const row = rows[at];
					return (
						<li
							key={row?.key ?? `empty-${at}`}
							data-change={row?.change ?? undefined}
							title={row?.was ? `Was: ${row.was}` : undefined}
						>
							{row ? (
								<>
									<b>{row.change === "add" ? "+" : at + 1}</b>
									<span>{row.text}</span>
								</>
							) : at === 0 ? (
								<span className="ns-loop-empty">None of its own yet.</span>
							) : null}
						</li>
					);
				})}
			</ol>
			<p className="ns-loop-note">{note}</p>
		</div>
	);
}

function Trial({
	shown,
	running,
	half,
	pairs,
	alpha,
	onPick,
}: {
	shown: Rules | undefined;
	running: boolean;
	half: AgentState["half"];
	pairs: number;
	alpha: number;
	onPick: (episode: number) => void;
}) {
	const played = shown?.pairs ?? [];
	const slot = (at: number) => LEFT + ((W - LEFT - PAD) * (at + 0.5)) / pairs;
	const y = (value: number) =>
		H - PAD - (H - 2 * PAD) * Math.min(1, Math.max(0, value));
	const gain = mean(played.map((p) => p.challenger - p.champion));
	const verdict = !shown
		? "The first trial starts after its first revision."
		: running
			? `Pair ${Math.min(pairs, played.length + 1)} of ${pairs}${played.length ? ` · gain ${signed(gain)} so far` : ""}`
			: `${shown.standing === "lost" ? "Lost" : "Kept"} · gain ${signed(shown.gain ?? gain)} · p = ${(shown.p ?? 1).toFixed(3)}${shown.standing === "lost" ? ` (needs ≤ ${alpha.toFixed(2)})` : ""}`;
	return (
		<div className="ns-loop" data-color="red">
			<p className="ns-eyebrow">
				{shown
					? `Trial · v${shown.version} against v${shown.parent}`
					: "No trial yet"}
			</p>
			<figure className="ns-trial">
				<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={verdict}>
					<line
						className="ns-trial-axis"
						x1={LEFT}
						x2={W - PAD}
						y1={y(0)}
						y2={y(0)}
					/>
					<line
						className="ns-trial-slot"
						x1={LEFT}
						x2={W - PAD}
						y1={y(1)}
						y2={y(1)}
					/>
					<text className="ns-trial-tick" x={LEFT - 6} y={y(1) + 3}>
						1
					</text>
					<text className="ns-trial-tick" x={LEFT - 6} y={y(0) + 3}>
						0
					</text>
					{Array.from({ length: pairs }, (_, at) => {
						const pair = played[at];
						const x = slot(at);
						if (!pair) {
							const pending = running && at === played.length && half;
							return (
								<g key={`slot-${at}`}>
									<line
										className="ns-trial-slot"
										x1={x}
										x2={x}
										y1={y(1)}
										y2={y(0)}
									/>
									{pending ? (
										<rect
											className={
												half.version === shown?.version
													? "ns-trial-new"
													: "ns-trial-old"
											}
											x={
												x +
												(half.version === shown?.version ? SPREAD : -SPREAD) -
												5
											}
											y={y(half.reward) - 5}
											width={10}
											height={10}
										/>
									) : null}
								</g>
							);
						}
						const gap = pair.challenger - pair.champion;
						return (
							<g key={`pair-${pair.challengerEpisode}`}>
								<line
									className="ns-trial-gap"
									data-gain={gap > 1e-9 ? "up" : gap < -1e-9 ? "down" : "even"}
									x1={x - SPREAD}
									x2={x + SPREAD}
									y1={y(pair.champion)}
									y2={y(pair.challenger)}
								/>
								<rect
									className="ns-trial-old"
									x={x - SPREAD - 5}
									y={y(pair.champion) - 5}
									width={10}
									height={10}
								/>
								<rect
									className="ns-trial-new"
									x={x + SPREAD - 5}
									y={y(pair.challenger) - 5}
									width={10}
									height={10}
								/>
							</g>
						);
					})}
				</svg>
				<ol
					className="ns-trial-hits"
					style={{ "--pairs": pairs } as React.CSSProperties}
				>
					{Array.from({ length: pairs }, (_, at) => {
						const pair = played[at];
						return (
							<li key={pair ? `hit-${pair.challengerEpisode}` : `hit-${at}`}>
								{pair ? (
									<button
										type="button"
										aria-label={`Pair ${at + 1}, ${pair.front}: old rules ${pair.champion.toFixed(2)} in episode ${pair.championEpisode}, new rules ${pair.challenger.toFixed(2)} in episode ${pair.challengerEpisode}`}
										title={`${pair.front} · #${pair.championEpisode} old ${pair.champion.toFixed(2)} · #${pair.challengerEpisode} new ${pair.challenger.toFixed(2)}`}
										onClick={() => onPick(pair.challengerEpisode)}
									/>
								) : null}
							</li>
						);
					})}
				</ol>
			</figure>
			<ul className="ns-trial-key">
				<li data-mark="old">old rules</li>
				<li data-mark="new">new rules</li>
			</ul>
			<p className="ns-loop-note">{verdict}</p>
		</div>
	);
}

function Method({
	method,
	versions,
}: {
	method: Rules | undefined;
	versions: Rules[];
}) {
	const lines = method?.lines ?? [];
	return (
		<div className="ns-loop" data-color="yellow">
			<p className="ns-eyebrow">
				How it revises{method ? ` · v${method.version}` : ""}
				{method?.standing === "trial" ? " · on trial" : ""}
			</p>
			<ol className="ns-loop-lines ns-loop-lines--method">
				{Array.from({ length: METHOD_ROWS }, (_, at) => (
					<li
						key={lines[at] ?? `empty-${at}`}
						data-change={
							at + 1 === method?.change?.rule ||
							(method?.change?.op === "add" && at === lines.length - 1)
								? method?.change?.op
								: undefined
						}
					>
						{lines[at] ? (
							<>
								<b>{at + 1}</b>
								<span>{lines[at]}</span>
							</>
						) : null}
					</li>
				))}
			</ol>
			<ol className="ns-versions" aria-label="Every version of its rules">
				{versions.map((rules) => (
					<li
						key={rules.version}
						data-standing={rules.standing}
						title={`v${rules.version} · ${rules.standing}${rules.change ? ` · ${rules.change.op}: ${rules.change.text || rules.change.was}` : ""}`}
					/>
				))}
			</ol>
			<p className="ns-loop-note">
				{method
					? `${method.gains.length} ${method.gains.length === 1 ? "trial" : "trials"} · ${method.wins} kept · mean gain ${signed(mean(method.gains))}`
					: " "}
			</p>
		</div>
	);
}

export function Loops({
	rules,
	state,
	about,
	onPick,
}: {
	rules: Record<string, Rules>;
	state: AgentState;
	about: About | null;
	onPick: (episode: number) => void;
}) {
	const champion = pick(rules, "playbook", state.rules ?? 1);
	const challenger = pick(rules, "playbook", state.challenger);
	const playbook = Object.values(rules)
		.filter((r) => r.layer === "playbook")
		.sort((a, b) => a.version - b.version);
	const last = [...playbook].reverse().find((r) => r.change && r.decided > 0);
	const shown = challenger ?? last;
	return (
		<section className="ns-block ns-loops" aria-labelledby="ns-loops-title">
			<header className="ns-block-head">
				<h3 id="ns-loops-title">It improves itself</h3>
				<p>
					It rewrites its own rules, one change at a time, and tests each change
					blind: pairs of episodes on the same front, old rules against new. It
					also rewrites how it writes them. Lean, the instruments and the
					referee stay out of its reach.
				</p>
			</header>
			<div className="ns-loops-body">
				<Book champion={champion} challenger={challenger} last={last} />
				<Trial
					shown={shown}
					running={!!challenger}
					half={state.half ?? null}
					pairs={about?.trialPairs ?? 5}
					alpha={about?.alpha ?? 0.1}
					onPick={onPick}
				/>
				<Method
					method={pick(rules, "method", state.method ?? 1)}
					versions={playbook}
				/>
			</div>
		</section>
	);
}
