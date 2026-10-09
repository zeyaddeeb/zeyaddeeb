import { average, type Cell, cells, money, type Round } from "./game";

const MAX_DOTS = 60;

const ids = (prefix: string, n: number) =>
	Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function Dots({ cell }: { cell: Cell }) {
	const coin = Math.min(cell.coin, MAX_DOTS);
	const mine = Math.min(cell.mine, MAX_DOTS - coin);

	return (
		<span className="nc-cell__dots" aria-hidden="true">
			{ids("m", mine).map((id) => (
				<span key={id} className="nc-dot" />
			))}
			{ids("c", coin).map((id) => (
				<span key={id} className="nc-dot" data-coin="true" />
			))}
		</span>
	);
}

function Square({ cell }: { cell: Cell }) {
	const count = cell.mine + cell.coin;

	return (
		<td
			className="nc-cell"
			data-called={cell.sealed === cell.took}
			data-took={cell.took}
		>
			<span className="nc-cell__pay">{money(cell.pay)}</span>
			<span className="nc-cell__count">{count}</span>
			<Dots cell={cell} />
		</td>
	);
}

export function Board({ rounds }: { rounds: Round[] }) {
	const [fullOne, fullBoth, emptyOne, emptyBoth] = cells(rounds);
	const one = average(rounds, 1);
	const both = average(rounds, 2);

	if (!fullOne || !fullBoth || !emptyOne || !emptyBoth) return null;

	return (
		<table className="nc-board">
			<caption className="nc-board__caption">
				Every round, by what B held and what was taken
			</caption>
			<thead>
				<tr>
					<td className="nc-board__corner" />
					<th scope="col">One box</th>
					<th scope="col">Both</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<th scope="row">
						<span className="nc-board__swatch" data-full="true" />B full
					</th>
					<Square cell={fullOne} />
					<Square cell={fullBoth} />
				</tr>
				<tr>
					<th scope="row">
						<span className="nc-board__swatch" />B empty
					</th>
					<Square cell={emptyOne} />
					<Square cell={emptyBoth} />
				</tr>
			</tbody>
			<tfoot>
				<tr>
					<th scope="row">Average</th>
					<td className="nc-board__avg" data-none={one === null}>
						{one === null ? "none yet" : money(one)}
					</td>
					<td className="nc-board__avg" data-none={both === null}>
						{both === null ? "none yet" : money(both)}
					</td>
				</tr>
			</tfoot>
		</table>
	);
}
