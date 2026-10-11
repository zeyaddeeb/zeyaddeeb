import { plain } from "../story";
import { SIDE_TEXT, WATCH_LABEL, WATCH_TEXT } from "./account";
import { STUCK } from "./deal";
import { BUDGETS, flip, type Sheet, SIDES, WATCHERS } from "./sheet";

interface RulesProps {
	sheet: Sheet;
	onChange: (sheet: Sheet) => void;
}

export function Rules({ sheet, onChange }: RulesProps) {
	return (
		<div className="rh-contract">
			<p className="rh-label">Set the test</p>
			<ul className="rh-watches">
				{WATCHERS.map((watcher) => (
					<li key={watcher} className="rh-watch">
						<span className="rh-watch__text">{WATCH_TEXT[watcher]}</span>
						{SIDES.map((side) => (
							<button
								key={side}
								type="button"
								className="rh-watch__switch"
								aria-pressed={sheet[watcher][side]}
								aria-label={WATCH_LABEL[watcher][side]}
								onClick={() => onChange(flip(sheet, watcher, side))}
							>
								<span className="rh-watch__side">{SIDE_TEXT[side]}</span>
								{sheet[watcher][side] ? "yes" : "no"}
							</button>
						))}
					</li>
				))}
			</ul>
			<ul className="rh-clauses">
				<li className="rh-clause">
					<button
						type="button"
						className="rh-clause__switch"
						aria-pressed={!sheet.sound}
						onClick={() => onChange({ ...sheet, sound: !sheet.sound })}
					>
						<span className="rh-clause__amount">{STUCK}</span>
						<span className="rh-clause__text">have no answer</span>
					</button>
				</li>
				<li className="rh-clause">
					<button
						type="button"
						className="rh-clause__switch"
						aria-pressed={sheet.shared}
						onClick={() => onChange({ ...sheet, shared: !sheet.shared })}
					>
						<span className="rh-clause__amount">1</span>
						<span className="rh-clause__text">shared shelf</span>
					</button>
				</li>
			</ul>
			<fieldset className="rh-budget">
				<legend className="rh-budget__name">Tries</legend>
				{BUDGETS.map((budget) => (
					<button
						key={budget}
						type="button"
						className="rh-budget__stop"
						aria-pressed={sheet.budget === budget}
						aria-label={`${plain(budget)} tries on each board`}
						onClick={() => onChange({ ...sheet, budget })}
					>
						{plain(budget)}
					</button>
				))}
			</fieldset>
		</div>
	);
}
