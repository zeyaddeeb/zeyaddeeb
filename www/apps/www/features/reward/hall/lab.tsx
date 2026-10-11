"use client";

import { useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { Odometer } from "../odometer";
import {
	CAPTIONS,
	caption,
	FIRST,
	HINT,
	onPaper,
	outside,
	SEEN,
	SPOTS,
} from "./account";
import { Hall } from "./hall";
import { Plates } from "./plates";
import { Rules } from "./rules";
import { AS_RUN, type Sheet } from "./sheet";
import { type Habit, judge, type Tally } from "./trial";
import "../reward.css";
import "../phone.css";
import "./hall.css";

const SEEN_LINES = Object.values(SEEN);
const START: Tally = { paper: 0, doors: 0 };

export function HallLab() {
	const reduced = useReducedMotion();
	const [sheet, setSheet] = useState(AS_RUN);
	const [verdict, setVerdict] = useState(FIRST);
	const [tally, setTally] = useState(START);
	const [spot, setSpot] = useState<string | null>(null);
	const [seen, setSeen] = useState<Habit[]>([FIRST.habit]);
	const [turn, setTurn] = useState(0);

	const set = (next: Sheet) => {
		const judged = judge(next);

		setSheet(next);
		setVerdict(judged);
		setSeen((habits) =>
			habits.includes(judged.habit) ? habits : [...habits, judged.habit],
		);
	};

	const line = caption(sheet, verdict);

	return (
		<div className="rh rh--hall">
			<div className="rh-sea">
				<Hall
					sheet={sheet}
					reduced={reduced}
					label={`A hall of 898 sliding puzzles, a shared shelf and the world outside. ${line}`}
					turn={turn}
					tally={setTally}
					spot={setSpot}
				/>
				<div className="rh-spot rh-spot--again">
					<ReservedText text={spot ?? HINT} samples={SPOTS} />
					<button
						type="button"
						className="rh-again"
						onClick={() => setTurn((turns) => turns + 1)}
					>
						<svg
							viewBox="0 0 16 16"
							className="rh-again__mark"
							aria-hidden="true"
						>
							<path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75M13.4 1.9v2.9h-2.9" />
						</svg>
						<span className="rh-again__text">Run it again</span>
					</button>
				</div>
			</div>

			<div className="rh-panel">
				<dl className="rh-meters">
					<div className="rh-meter" data-kind="paper">
						<dt className="rh-label">On paper · boards</dt>
						<dd className="rh-meter__count">
							<Odometer value={tally.paper} slots={3} />
						</dd>
						<dd className="rh-meter__note">{onPaper(verdict)}</dd>
					</div>
					<div className="rh-meter" data-kind="out">
						<dt className="rh-label">Outside · doors</dt>
						<dd className="rh-meter__count">
							<Odometer value={tally.doors} slots={2} />
						</dd>
						<dd className="rh-meter__note">{outside(verdict)}</dd>
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

				<Rules sheet={sheet} onChange={set} />
				<Plates
					now={verdict.habit}
					seen={seen}
					onShow={(plate) => set(plate.sheet)}
				/>
			</div>
		</div>
	);
}
