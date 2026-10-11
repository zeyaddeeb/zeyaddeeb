"use client";

import { useState } from "react";
import { plain } from "./story";

const HOME = 10;
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);

const home = (digit: number) => ({ index: HOME + digit, snap: true });

function Wheel({ digit }: { digit: number }) {
	const [spin, setSpin] = useState(() => home(digit));

	if (spin.index % 10 !== digit) {
		const turn = ((digit - (spin.index % 10) + 15) % 10) - 5;
		const index = spin.index + turn;

		setSpin(
			index < 0 || index >= STRIP.length ? home(digit) : { index, snap: false },
		);
	}

	return (
		<span className="rh-wheel">
			<span
				className="rh-wheel__strip"
				data-snap={spin.snap}
				style={{ translate: `0 ${-spin.index}em` }}
				onTransitionEnd={() => setSpin(home(spin.index % 10))}
			>
				{STRIP.map((face, i) => (
					<span key={i}>{face}</span>
				))}
			</span>
		</span>
	);
}

export function Odometer({ value, slots }: { value: number; slots: number }) {
	const whole = Math.round(value);
	const faces = [...(whole < 0 ? "−" : ""), ...String(Math.abs(whole))];

	return (
		<span className="rh-odometer" role="img" aria-label={plain(whole)}>
			{Array.from({ length: slots }, (_, slot) => {
				const face = faces[slot];

				if (face === undefined || face === "−")
					return (
						<span className="rh-wheel" key={slot}>
							{face}
						</span>
					);

				return <Wheel key={slot} digit={Number(face)} />;
			})}
		</span>
	);
}
