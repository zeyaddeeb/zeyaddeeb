"use client";

import type { Wheel } from "@zeyaddeeb/wasm";
import { useEffect, useState } from "react";
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
	if (!copy) {
		return (
			<p className="at-readout at-readout__text">
				Copy makes a second wheel from this one’s numbers rounded to three
				places, the way Edward Lorenz retyped a printout in 1961.
			</p>
		);
	}
	return (
		<div className="at-readout">
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
							const parts = split(reading.wheel[i] ?? "", copy[i] ?? "");
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
			<p className="at-readout__text">{reading.verdict}</p>
		</div>
	);
}

export function CrowdReadout({ reading }: { reading: Reading }) {
	const t = reading.tally;
	if (!t) {
		return (
			<p className="at-readout at-readout__text">
				Twins are 100 wheels that each start a hair away from this one. Do they
				stay together? You can also tap the path to start a few wheels anywhere.
			</p>
		);
	}
	const share = (n: number) => `${t.total ? (100 * n) / t.total : 0}%`;
	return (
		<div className="at-readout">
			<div className="at-tally__bar" aria-hidden="true">
				<span
					data-part="settled-clockwise"
					style={{ width: share(t.settledClockwise) }}
				/>
				<span
					data-part="clockwise"
					style={{ width: share(t.clockwise - t.settledClockwise) }}
				/>
				<span
					data-part="anticlockwise"
					style={{ width: share(t.anticlockwise - t.settledAnticlockwise) }}
				/>
				<span
					data-part="settled-anticlockwise"
					style={{ width: share(t.settledAnticlockwise) }}
				/>
			</div>
			<p className="at-readout__text" aria-live="polite">
				{reading.crowdText}
			</p>
		</div>
	);
}
