"use client";

import { ReservedText } from "@/components/reserved-text";
import {
	CLOCKS,
	FAR_START,
	NEAR_WIDTH,
	regime,
	regions,
	rhoAt,
	uAt,
} from "./model";
import "./water.css";

const at = (u: number) => `${(u * 100).toFixed(3)}%`;
const WATER_SPACE = regions.map((r) => `${r.label}: ${r.says}`);

export function Water({
	rho,
	onRho,
}: {
	rho: number;
	onRho: (rho: number) => void;
}) {
	const kind = regime(rho);
	const here = regions.find((r) => r.regime === kind);

	return (
		<div className="at-water">
			<div className="at-water__head">
				<label className="at-water__label" htmlFor="at-water">
					Water
				</label>
				<span className="at-water__says">
					<ReservedText
						text={here ? `${here.label}: ${here.says}` : ""}
						samples={WATER_SPACE}
					/>
				</span>
			</div>
			<div className="at-water__track">
				{regions.map((r) => (
					<span
						key={r.regime}
						className="at-water__band"
						data-on={r.regime === kind}
						style={{
							left: at(uAt(r.from)),
							width: at(uAt(r.to) - uAt(r.from)),
						}}
					/>
				))}
				{CLOCKS.slice(0, 2).map(([a]) => (
					<span
						key={a}
						className="at-water__window"
						style={{ left: at(uAt(a)) }}
					/>
				))}
				<span
					className="at-water__break"
					style={{ left: at(NEAR_WIDTH), width: at(FAR_START - NEAR_WIDTH) }}
				/>
				<input
					id="at-water"
					className="at-water__input"
					type="range"
					min={0}
					max={1000}
					step={1}
					value={Math.round(uAt(rho) * 1000)}
					aria-valuetext={here ? `${here.label}: ${here.says}` : undefined}
					onChange={(e) =>
						onRho(Math.round(rhoAt(Number(e.target.value) / 1000) * 100) / 100)
					}
				/>
			</div>
			<div className="at-water__ends" aria-hidden="true">
				<span>trickle</span>
				<span>full</span>
			</div>
			<div className="at-water__chips">
				{regions.map((r) => (
					<button
						key={r.regime}
						type="button"
						className="at-water__chip"
						data-on={r.regime === kind}
						onClick={() => onRho(r.preset)}
					>
						{r.label}
					</button>
				))}
			</div>
		</div>
	);
}
