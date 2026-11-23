"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import { KILL_GATE, MATTER_GATE, REFEREES } from "./facts";
import type { Capability, Card } from "./protocol";
import { AGENTS, BANDS, reading, SINK } from "./reach";

const SPHERE = 0.01;
const DWELL = 1800;
const ROWS = 6;

const VERDICT: Record<string, string> = {
	held: "held",
	broken: "broken",
	open: "pending",
	unresolved: "unresolved",
};

function standing(capability: Capability | undefined): string {
	if (!capability) return "not checked";
	if (!capability.available) return "not on this server";

	return capability.scores ? "pays" : "checks, never pays";
}

function found(card: Card): string {
	if (card.verdict !== "held" && card.verdict !== "broken")
		return VERDICT[card.verdict] ?? card.verdict;

	const value =
		card.kernel === "later"
			? card.observed >= 1
				? "yes"
				: "no"
			: `${card.observed.toFixed(3)}${card.unit ? ` ${card.unit}` : ""}`;

	return `${value} · ${VERDICT[card.verdict]}`;
}

function bits(card: Card): string {
	if (!card.paid) return "—";

	return `${card.skill >= 0 ? "+" : ""}${card.skill.toFixed(2)}`;
}

function refereeing(capabilities: Record<string, Capability>): string[] {
	const { kill, matter, later } = capabilities;
	const lines = [
		"Reach reproduces a published model, which proves the code and not the physics, so it can refuse a claim but never pays.",
	];

	if (kill)
		lines.push(
			kill.available && kill.scores
				? `Kill pays because it separates ${KILL_GATE.essentials} genes every cell needs from ${KILL_GATE.controls} that none do, at ${KILL_GATE.auroc} across ${KILL_GATE.lines} colorectal lines.`
				: "Kill's DepMap data is not loaded on this server, so it referees nothing here yet.",
		);

	if (matter)
		lines.push(
			matter.available && matter.scores
				? `Matter pays because it sees checkpoint drugs run ${MATTER_GATE.ratio} times longer in mismatch-repair-defective disease, and stays quiet on a drug that should show nothing.`
				: "Matter reads patient records that never leave one machine, so it does not run on this server.",
		);

	if (later)
		lines.push(
			later.available
				? "Later takes only bets on trials that have not reported. Each stays open, scoring nothing, until the registry settles it, sometimes years later."
				: "Later cannot reach the trial registry right now.",
		);

	return lines;
}

function replication() {
	return BANDS.map((band) => {
		const agent = AGENTS.find((one) => one.name === band.agent);

		if (!agent) return null;

		const found = reading(
			agent,
			{
				concentration: band.concentration,
				dwell: DWELL,
				clearance: SINK,
			},
			SPHERE,
		);
		const inside = found.depthMm >= band.low && found.depthMm <= band.high;

		return {
			agent: band.agent,
			depth: found.depthMm,
			low: band.low,
			high: band.high,
			inside,
		};
	}).filter((row) => row !== null);
}

function Block({
	title,
	open = false,
	children,
}: {
	title: string;
	open?: boolean;
	children: ReactNode;
}) {
	const [expanded, setExpanded] = useState(open);
	const id = useId();

	return (
		<div className="rs-ledger__block" data-expanded={expanded}>
			<h3 className="rs-ledger__title">{title}</h3>
			<h3 className="rs-ledger__fold">
				<button
					type="button"
					className="rs-ledger__toggle"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded((value) => !value)}
				>
					{title}
					<span className="rs-ledger__sign" aria-hidden="true" />
				</button>
			</h3>
			<div id={id} className="rs-ledger__body">
				{children}
			</div>
		</div>
	);
}

export function Ledger({
	cards,
	capabilities,
}: {
	cards: Card[];
	capabilities: Record<string, Capability>;
}) {
	const rows = useMemo(replication, []);

	return (
		<section className="rs-ledger" aria-label="The record">
			<Block title="What the kernel reproduces" open>
				<table className="rs-table">
					<thead>
						<tr>
							<th scope="col">Drug</th>
							<th scope="col">It says</th>
							<th scope="col">Published</th>
							<th scope="col">In band</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.agent} data-inside={row.inside}>
								<th scope="row">{row.agent}</th>
								<td>{row.depth.toFixed(3)} mm</td>
								<td>
									{row.low}–{row.high} mm
								</td>
								<td>{row.inside ? "yes" : "no"}</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="rs-ledger__note">
					Steuperaert 2017, from its own cited parameters, with nothing fitted.
					Reproducing a model proves the code, not the physics, so this referee
					may refuse a claim but may not earn with one until it is gated against
					measured depths.
				</p>
			</Block>

			<Block title="The four referees">
				<table className="rs-table">
					<thead>
						<tr>
							<th scope="col">Referee</th>
							<th scope="col">Asks</th>
							<th scope="col">State</th>
						</tr>
					</thead>
					<tbody>
						{REFEREES.map((one) => (
							<tr
								key={one.id}
								data-scores={capabilities[one.id]?.scores ?? false}
							>
								<th scope="row">{one.name}</th>
								<td>{one.asks}</td>
								<td title={capabilities[one.id]?.reason}>
									{standing(capabilities[one.id])}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="rs-ledger__note">{refereeing(capabilities).join(" ")}</p>
			</Block>

			<Block title="What it has sealed">
				<table className="rs-table rs-table--sealed">
					<thead>
						<tr>
							<th scope="col">Claim</th>
							<th scope="col">Said</th>
							<th scope="col">Found</th>
							<th scope="col">Bits</th>
						</tr>
					</thead>
					<tbody>
						{Array.from({ length: ROWS }, (_, slot) => {
							const card = cards[slot];

							if (!card) {
								return (
									<tr key={`slot-${slot}`} data-empty="true">
										<th scope="row">
											<span className="rs-claim">&nbsp;</span>
											<span className="rs-claim__context">&nbsp;</span>
										</th>
										<td />
										<td />
										<td />
									</tr>
								);
							}

							return (
								<tr key={`${card.at}-${slot}`} data-verdict={card.verdict}>
									<th scope="row">
										<span className="rs-claim">{card.claim}</span>
										<span className="rs-claim__context" title={card.context}>
											{card.context}
										</span>
									</th>
									<td>{(card.chance * 100).toFixed(0)}%</td>
									<td>{found(card)}</td>
									<td title={card.paid ? undefined : "not scored"}>
										{bits(card)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</Block>
		</section>
	);
}
