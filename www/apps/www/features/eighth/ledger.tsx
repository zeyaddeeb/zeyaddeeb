import type { Mode } from "./copy";
import { DEAL_LABELS, pct } from "./copy";
import "./ledger.css";

export interface Entry {
	n: number;
	deal: Mode;
	pair: string;
	match: number | null;
	verdict: string;
}

const SLOTS = ["first", "second", "third"] as const;

export function Ledger({ entries }: { entries: readonly Entry[] }) {
	const rows = entries.slice(0, SLOTS.length);

	return (
		<table className="me-ledger">
			<caption className="me-ledger__caption">Runs</caption>
			<thead>
				<tr>
					<th scope="col">#</th>
					<th scope="col">Deal</th>
					<th scope="col">Stations</th>
					<th scope="col">Match</th>
					<th scope="col">Referee</th>
				</tr>
			</thead>
			<tbody>
				{SLOTS.map((slot, i) => {
					const e = rows[i];

					return e ? (
						<tr key={slot}>
							<td>{e.n}</td>
							<td>{DEAL_LABELS[e.deal]}</td>
							<td>{e.pair}</td>
							<td>{pct(e.match)}</td>
							<td data-verdict={e.verdict === "on time" ? "ok" : "flag"}>
								{e.verdict}
							</td>
						</tr>
					) : (
						<tr key={slot} data-empty>
							<td colSpan={5}>&nbsp;</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
