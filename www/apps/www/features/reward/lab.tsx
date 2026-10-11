"use client";

import { useCallback, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { Contract } from "./contract";
import { Guide } from "./guide";
import { Odometer } from "./odometer";
import { type Clause, OPENING, type Prize, type Rule, toggle } from "./rule";
import type { Tally } from "./run";
import {
	CAPTIONS,
	caption,
	FIRST,
	HINT,
	onPaper,
	onWater,
	type Plate,
	SEEN,
	SPOTS,
} from "./story";
import type { Habit, Verdict } from "./voyage";
import { Water } from "./water";
import "./reward.css";
import "./phone.css";

const SEEN_LINES = Object.values(SEEN);
const START: Tally = { points: 0, races: 0 };

export function RewardLab() {
	const reduced = useReducedMotion();
	const [rule, setRule] = useState(OPENING);
	const [prize, setPrize] = useState<Prize>(100);
	const [judged, setJudged] = useState({ rule: OPENING, verdict: FIRST });
	const [pending, setPending] = useState(false);
	const [tally, setTally] = useState(START);
	const [spot, setSpot] = useState<string | null>(null);
	const [seen, setSeen] = useState<Habit[]>([FIRST.habit]);

	const settled = useCallback((verdict: Verdict, solved: Rule) => {
		setJudged({ rule: solved, verdict });
		setPending(false);
		setSeen((habits) =>
			habits.includes(verdict.habit) ? habits : [...habits, verdict.habit],
		);
	}, []);

	const solving = useCallback(() => setPending(true), []);

	const clause = (which: Clause) => setRule(toggle(rule, which, prize));

	const raise = () => {
		const next: Prize = prize === 100 ? 1000 : 100;

		setPrize(next);

		if (rule.finish) setRule({ ...rule, finish: next });
	};

	const show = (plate: Plate) => {
		setRule(plate.rule);

		if (plate.rule.finish) setPrize(plate.rule.finish);
	};

	const { verdict } = judged;
	const line = caption(judged.rule, verdict);

	return (
		<div className="rh" data-pending={pending}>
			<div className="rh-sea">
				<Water
					rule={rule}
					reduced={reduced}
					label={`A chart of the race. ${line}`}
					tally={setTally}
					solving={solving}
					settled={settled}
					spot={setSpot}
				/>
				<p className="rh-spot">
					<ReservedText text={spot ?? HINT} samples={SPOTS} />
				</p>
			</div>

			<div className="rh-panel">
				<dl className="rh-meters">
					<div className="rh-meter" data-kind="paper">
						<dt className="rh-label">On paper · points</dt>
						<dd className="rh-meter__count">
							<Odometer value={tally.points} slots={7} />
						</dd>
						<dd className="rh-meter__note">{onPaper(verdict)}</dd>
					</div>
					<div className="rh-meter" data-kind="water">
						<dt className="rh-label">On the water · races</dt>
						<dd className="rh-meter__count">
							<Odometer value={tally.races} slots={4} />
						</dd>
						<dd className="rh-meter__note">{onWater(verdict)}</dd>
					</div>
				</dl>

				<div className="rh-outcome" aria-live="polite">
					<p className="rh-caption">
						<ReservedText text={line} samples={CAPTIONS} />
					</p>
					<p className="rh-seen">
						<ReservedText text={SEEN[verdict.habit]} samples={SEEN_LINES} />
					</p>
				</div>

				<Contract
					rule={rule}
					prize={prize}
					onClause={clause}
					onPrize={raise}
					onReach={() => setRule({ ...rule, reach: !rule.reach })}
				/>

				<Guide now={verdict.habit} seen={seen} onShow={show} />
			</div>
		</div>
	);
}
