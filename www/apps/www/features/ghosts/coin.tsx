import { type Coin, FLIPS } from "./model";

const POSITIONS = Array.from({ length: FLIPS }, (_, pos) => pos);

interface MeterProps {
	name: string;
	rank: number;
	words: string;
	quiet?: boolean;
}

function Meter({ name, rank, words, quiet }: MeterProps) {
	return (
		<div className="gh-meter" data-quiet={quiet || undefined}>
			<span className="gh-meter__name">{name}</span>
			<span className="gh-meter__track" aria-hidden="true">
				<span className="gh-meter__fill" style={{ width: `${rank}%` }} />
				<span className="gh-meter__mark" style={{ left: `${rank}%` }} />
			</span>
			<span className="gh-meter__rank">{rank}</span>
			<span className="gh-meter__words">{words}</span>
		</div>
	);
}

interface CoinCardProps {
	coin: Coin;
	says: number;
	expects: number;
	twin: number;
	zorp: boolean;
	usable: boolean;
	onPick: (which: "streaky" | "typical" | "alternating" | "any") => void;
}

export function CoinCard({
	coin,
	says,
	expects,
	twin,
	zorp,
	usable,
	onPick,
}: CoinCardProps) {
	return (
		<div className="gh-coin">
			<p className="gh-eyebrow" aria-live="polite">
				<span>Coin {coin.index + 1} of 600</span>
				<span>
					{coin.switches} {coin.switches === 1 ? "switch" : "switches"}
				</span>
			</p>
			<ol className="gh-flips" aria-label={`Flips: ${coin.flips.join(" ")}`}>
				{POSITIONS.map((pos) => {
					const flip = coin.flips[pos];

					return (
						<li
							key={pos}
							className="gh-flip"
							data-side={flip}
							data-switch={
								pos > 0 && coin.flips[pos - 1] !== flip ? "" : undefined
							}
						>
							{flip}
						</li>
					);
				})}
			</ol>
			<div className="gh-meters">
				{zorp ? (
					<Meter
						name="Zorp"
						rank={twin}
						words={`more “zorp” than ${twin}% of the other fair coins`}
					/>
				) : (
					<Meter
						name="Says"
						rank={says}
						quiet={!usable}
						words={`calls it more rigged than ${says}% of the other fair coins${usable ? "" : ", by a hair"}`}
					/>
				)}
				<Meter
					name="Expects"
					rank={expects}
					words={`its own predictions put it above ${expects}% of the other fair coins`}
				/>
			</div>
			<fieldset className="gh-picks">
				<legend className="sr-only">Pick a coin</legend>
				<button
					type="button"
					className="gh-chip"
					onClick={() => onPick("streaky")}
				>
					Streakiest
				</button>
				<button
					type="button"
					className="gh-chip"
					onClick={() => onPick("typical")}
				>
					Eight switches
				</button>
				<button
					type="button"
					className="gh-chip"
					onClick={() => onPick("alternating")}
				>
					Most switches
				</button>
				<button type="button" className="gh-chip" onClick={() => onPick("any")}>
					Any coin
				</button>
			</fieldset>
		</div>
	);
}
