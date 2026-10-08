import { count, MOVES } from "./format";
import type { About, AgentState, Episode, Front } from "./protocol";

interface Tile {
	label: string;
	value: string;
	note: string;
	color: "red" | "blue" | "yellow";
}

function tiles(state: AgentState, about: About | null): Tile[] {
	const { records } = state;

	return [
		{
			label: "Zeros located",
			value: count(state.zeros),
			note:
				state.zeros > 0
					? `on the line to t = ${count(state.frontier)} (Turing); record 3·10¹²`
					: "none yet; the record is 3·10¹²",
			color: "red",
		},
		{
			label: "Off the line",
			value: count(state.contours),
			note:
				state.contours > 0
					? "rectangles, and not one zero inside"
					: "no rectangles yet",
			color: "blue",
		},
		{
			label: "Predictions",
			value: count(state.predictions),
			note: state.known
				? `${count(state.held)} held · ${count(state.broken)} broke · ${count(state.known)} known in advance`
				: `${count(state.held)} held · ${count(state.broken)} broke`,
			color: "yellow",
		},
		{
			label: "Proved in Lean",
			value: count(state.verified),
			note: state.routine
				? `plus ${count(state.routine)} routine, by automation alone`
				: "on propext, choice and Quot.sound alone",
			color: "red",
		},
		{
			label: "Closest pair",
			value: records.closestGap === null ? "—" : records.closestGap.toFixed(4),
			note: "of the mean gap between zeros",
			color: "blue",
		},
		{
			label: "Tokens today",
			value: count(state.budget.spent),
			note: about
				? `of ${count(about.tokensPerDay)} a day, read and written`
				: `${count(state.tokens)} written since waking`,
			color: "yellow",
		},
	];
}

export function Arms({
	state,
	fronts,
}: {
	state: AgentState;
	fronts: Front[];
}) {
	if (!fronts.length) return null;

	const rows = fronts.map((front) => {
		const arm = state.arms.find((a) => a.front === front.id);
		const pulls = arm?.pulls ?? 0;

		return { front, pulls, mean: pulls ? (arm?.reward ?? 0) / pulls : 0 };
	});

	const best = Math.max(...rows.map((r) => r.mean), 1e-9);

	return (
		<div className="ns-arms">
			<p className="ns-eyebrow">Where it chose to work</p>
			<ol>
				{rows.map(({ front, pulls, mean }) => (
					<li
						key={front.id}
						data-current={front.id === state.lastFront || undefined}
					>
						<span>{front.title}</span>
						<span
							className="ns-arm-bar"
							style={{ "--share": mean / best } as React.CSSProperties}
						/>
						<span className="ns-arm-pulls">
							{pulls === 0 ? "untried" : `${pulls}×`}
						</span>
					</li>
				))}
			</ol>
			<p className="ns-arms-note">
				A bandit (UCB1) picks the next front: the average reward of past
				episodes there, plus a bonus for fronts it has rarely tried. Every third
				episode goes to the proof. Proofs pay most, then reductions checked in
				Lean; broken predictions pay more than held ones. Routine proofs pay
				little, and outcomes known in advance pay nothing.
			</p>
		</div>
	);
}

export function Moves({ episodes }: { episodes: Episode[] }) {
	const rows = Object.entries(MOVES).map(([id, title]) => {
		const tried = episodes.filter((e) => e.heuristic === id);

		const mean = tried.length
			? tried.reduce((sum, e) => sum + e.reward, 0) / tried.length
			: 0;

		return { id, title, tried: tried.length, mean };
	});

	const best = Math.max(...rows.map((r) => r.mean), 1e-9);
	const unrecorded =
		episodes.length - rows.reduce((sum, row) => sum + row.tried, 0);

	return (
		<div className="ns-arms ns-moves">
			<p className="ns-eyebrow">Pólya’s moves, by what they earned</p>
			<ol>
				{rows.map(({ id, title, tried, mean }) => (
					<li key={id}>
						<span>{title}</span>
						<span
							className="ns-arm-bar"
							style={{ "--share": mean / best } as React.CSSProperties}
						/>
						<span className="ns-arm-pulls">{tried}×</span>
					</li>
				))}
			</ol>
			<p className="ns-arms-note">
				Recorded moves over the last {episodes.length} episodes. Bars show
				average reward; counts show how often each move was named.
				{unrecorded > 0 &&
					` ${unrecorded} ${unrecorded === 1 ? "episode has" : "episodes have"} no recorded move.`}
			</p>
		</div>
	);
}

export function Tiles({
	state,
	about,
}: {
	state: AgentState;
	about: About | null;
}) {
	return (
		<ul className="ns-tiles" aria-label="The record">
			{tiles(state, about).map((tile) => (
				<li key={tile.label} className="ns-tile" data-color={tile.color}>
					<p className="ns-eyebrow">{tile.label}</p>
					<p className="ns-tile-value">{tile.value}</p>
					<p className="ns-tile-note">{tile.note}</p>
				</li>
			))}
		</ul>
	);
}

export function Letter({ state }: { state: AgentState }) {
	return (
		<figure className="ns-letter">
			<p className="ns-eyebrow">Its last letter to itself</p>
			<blockquote>
				{state.letter ||
					"It has not slept yet. It writes one after every few episodes."}
			</blockquote>
		</figure>
	);
}
