"use client";

import { useMemo } from "react";
import { KILL_GATE, MATTER_GATE, REFEREES } from "./facts";
import type { Capability, Card } from "./protocol";
import { AGENTS, BANDS, reading, SINK } from "./reach";

const SPHERE = 0.01;
const DWELL = 1800;
const ROWS = 6;

const VERDICT: Record<string, string> = {
	held: "held",
	broken: "broken",
	refused: "refused",
	open: "pending",
	unresolved: "unresolved",
};

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
			<div className="rs-ledger__block">
				<h3 className="rs-ledger__title">What the kernel reproduces</h3>
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
			</div>

			<div className="rs-ledger__block">
				<h3 className="rs-ledger__title">The four referees</h3>
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
									{!capabilities[one.id]
										? "not checked"
										: !capabilities[one.id].available
											? "unavailable"
											: capabilities[one.id].scores
												? "gated, earns"
												: "available, unscored"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="rs-ledger__note">
					Each gate is ground truth something else already fixed. Kill separates{" "}
					{KILL_GATE.essentials} genes known to be needed by every cell from{" "}
					{KILL_GATE.controls} known to be dispensable, at {KILL_GATE.auroc}{" "}
					across {KILL_GATE.lines} colorectal lines. Matter has to see
					checkpoint drugs run {MATTER_GATE.ratio} times longer in
					mismatch-repair-defective disease, and stay quiet on a drug that
					should show nothing. Later has no opinion to check: a bet on a trial
					that has not reported is sealed and left open, sometimes for years.
					Reach passes neither, so it may refuse a claim and never earn with
					one.
				</p>
			</div>

			<div className="rs-ledger__block">
				<h3 className="rs-ledger__title">What it has sealed</h3>
				<table className="rs-table">
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
										<th scope="row">&nbsp;</th>
										<td />
										<td />
										<td />
									</tr>
								);
							}

							return (
								<tr key={`${card.at}-${slot}`} data-verdict={card.verdict}>
									<th scope="row">
										{card.field ? (
											<>
												{card.field} {card.op} {card.value}
											</>
										) : (
											"refused"
										)}
									</th>
									<td>{(card.chance * 100).toFixed(0)}%</td>
									<td>
										{card.verdict === "held" || card.verdict === "broken"
											? `${card.observed.toFixed(3)} · ${VERDICT[card.verdict]}`
											: VERDICT[card.verdict]}
									</td>
									<td>{card.skill.toFixed(2)}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}
