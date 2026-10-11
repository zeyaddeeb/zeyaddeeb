import { CLAUSES, type Clause, has, type Prize, type Rule } from "./rule";
import { amount, CLAUSE_TEXT } from "./story";

interface ContractProps {
	rule: Rule;
	prize: Prize;
	onClause: (clause: Clause) => void;
	onPrize: () => void;
	onReach: () => void;
}

export function Contract({
	rule,
	prize,
	onClause,
	onPrize,
	onReach,
}: ContractProps) {
	return (
		<div className="rh-contract">
			<p className="rh-label">Pay the boat</p>
			<ul className="rh-clauses">
				{CLAUSES.map((clause) => (
					<li key={clause} className="rh-clause">
						<button
							type="button"
							className="rh-clause__switch"
							aria-pressed={has(rule, clause)}
							onClick={() => onClause(clause)}
						>
							<span className="rh-clause__amount">{amount(clause, prize)}</span>
							<span className="rh-clause__text">{CLAUSE_TEXT[clause]}</span>
						</button>
						{clause === "finish" ? (
							<button
								type="button"
								className="rh-clause__more"
								aria-pressed={prize === 1000}
								aria-label="Make the prize ten times bigger"
								onClick={onPrize}
							>
								×10
							</button>
						) : null}
					</li>
				))}
				<li className="rh-clause rh-clause--reach">
					<button
						type="button"
						className="rh-clause__switch"
						aria-pressed={rule.reach}
						onClick={onReach}
					>
						<span className="rh-clause__amount">
							<span className="rh-clause__board" aria-hidden="true" />
						</span>
						<span className="rh-clause__text">scoreboard in reach</span>
					</button>
				</li>
			</ul>
		</div>
	);
}
