"use client";

import type { Wheel } from "@zeyaddeeb/wasm";
import { useEffect, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import {
	printout,
	split,
	type Tally,
	tally,
	tallyText,
	verdict,
} from "./model";
import type { Sim } from "./sim";

const WIDTH = 10;

const COPY_HINT =
	"Copy makes a second wheel from this one’s numbers rounded to three places, the way Edward Lorenz retyped a printout in 1961.";
const CROWD_HINT =
	"Twins are 100 wheels that each start a hair away from this one. Do they stay together? You can also tap the path to start a few wheels anywhere.";

// Reserve the longest readout forms as well as the introductory wording.
const COPY_SPACE = [
	COPY_HINT,
	"They still differ by less than 0.000001. One more decimal place goes wrong about every 999.9 s.",
	"The copy is catching up. With this much water, small differences die away instead of growing.",
];
const CROWD_SPACE = [
	CROWD_HINT,
	tallyText(
		{
			total: 200,
			clockwise: 100,
			anticlockwise: 100,
			settledClockwise: 0,
			settledAnticlockwise: 0,
			resting: 0,
			together: false,
		},
		28,
	),
	tallyText(
		{
			total: 100,
			clockwise: 99,
			anticlockwise: 1,
			settledClockwise: 99,
			settledAnticlockwise: 0,
			resting: 0,
			together: false,
		},
		12,
	),
];

const numbers = (w: Wheel) =>
	[w.x(), w.y(), w.z()].map((v) => printout(v, 6).padStart(WIDTH, " "));

export interface Reading {
	tally: Tally | null;
	crowdText: string;
	wheel: string[];
	copy: string[] | null;
	verdict: string;
}

const EMPTY: Reading = {
	tally: null,
	crowdText: "",
	wheel: ["", "", ""],
	copy: null,
	verdict: "",
};

export function useReading(sim: Sim | null) {
	const [reading, setReading] = useState<Reading>(EMPTY);

	useEffect(() => {
		if (!sim) return;

		const read = () => {
			const crowd = sim.crowdNow();
			const t = crowd ? tally(crowd, sim.rho) : null;

			setReading({
				tally: t,
				crowdText: t ? tallyText(t, sim.rho) : "",
				wheel: numbers(sim.wheel),
				copy: sim.copy ? numbers(sim.copy) : null,
				verdict: sim.copy ? verdict(sim.gaps, sim.rho) : "",
			});
		};

		read();

		const id = window.setInterval(read, 200);

		return () => window.clearInterval(id);
	}, [sim]);

	return reading;
}

export function CopyReadout({ reading }: { reading: Reading }) {
	const copy = reading.copy;

	return (
		<div className="at-readout-stack">
			<p
				className={`at-readout at-readout__text${copy ? " at-reserve" : ""}`}
				aria-hidden={Boolean(copy)}
			>
				{COPY_HINT}
			</p>
			<div
				className={`at-readout${copy ? "" : " at-reserve"}`}
				aria-hidden={!copy}
			>
				<table className="at-digits">
					<thead>
						<tr>
							<th scope="col">
								<span className="sr-only">Which</span>
							</th>
							<th scope="col">spin</th>
							<th scope="col">lean</th>
							<th scope="col">drop</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<th scope="row">wheel</th>
							{reading.wheel.map((v, i) => (
								<td key={`w${i.toString()}`}>{v}</td>
							))}
						</tr>
						<tr>
							<th scope="row">copy</th>
							{[0, 1, 2].map((i) => {
								const parts = split(reading.wheel[i] ?? "", copy?.[i] ?? "");

								return (
									<td key={i}>
										{parts.same}
										<mark>{parts.different}</mark>
									</td>
								);
							})}
						</tr>
					</tbody>
				</table>
				<p className="at-readout__text">
					<ReservedText text={reading.verdict} samples={COPY_SPACE} />
				</p>
			</div>
		</div>
	);
}

export function CrowdReadout({ reading }: { reading: Reading }) {
	const t = reading.tally;

	const share = (n: number) => `${t?.total ? (100 * n) / t.total : 0}%`;

	return (
		<div className="at-readout-stack">
			<p
				className={`at-readout at-readout__text${t ? " at-reserve" : ""}`}
				aria-hidden={Boolean(t)}
			>
				{CROWD_HINT}
			</p>
			<div className={`at-readout${t ? "" : " at-reserve"}`} aria-hidden={!t}>
				<div className="at-tally__bar" aria-hidden="true">
					<span
						data-part="settled-clockwise"
						style={{ width: share(t?.settledClockwise ?? 0) }}
					/>
					<span
						data-part="clockwise"
						style={{ width: share(t ? t.clockwise - t.settledClockwise : 0) }}
					/>
					<span
						data-part="anticlockwise"
						style={{
							width: share(t ? t.anticlockwise - t.settledAnticlockwise : 0),
						}}
					/>
					<span
						data-part="settled-anticlockwise"
						style={{ width: share(t?.settledAnticlockwise ?? 0) }}
					/>
				</div>
				<p className="at-readout__text" aria-live="polite">
					<ReservedText text={reading.crowdText} samples={CROWD_SPACE} />
				</p>
			</div>
		</div>
	);
}
