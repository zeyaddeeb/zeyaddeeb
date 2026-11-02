import { RING_CEILING, RING_NATURE } from "./delft";
import { BUCKETS, CEILING, NATURE } from "./nature";

export interface Scale {
	id: string;
	low: number;
	high: number;
	ceiling: number;
	nature: number;
	heads: readonly string[];
	natures: readonly number[];
	caption: string;
}

export const SIX: Scale = {
	id: "six",
	low: 0.5,
	high: 0.8,
	ceiling: CEILING,
	nature: 0.75,
	heads: BUCKETS.map((b) => `${b}°`),
	natures: NATURE,
	caption: "Match rate at 30°, and at every angle",
};

export const EIGHT: Scale = {
	id: "eight",
	low: 0.6,
	high: 0.9,
	ceiling: RING_CEILING,
	nature: RING_NATURE,
	heads: ["A0 B0", "A0 B1", "A1 B0", "A1 B1"],
	natures: [RING_NATURE, RING_NATURE, RING_NATURE, RING_NATURE],
	caption: "Neighbor match rate for each pair of settings",
};

const cell = (v: number | null | undefined) =>
	(v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`).padStart(
		4,
		" ",
	);

export function Angles({
	run,
	scale,
	className,
}: {
	run: (number | null)[];
	scale: Scale;
	className?: string;
}) {
	return (
		<table className={className ?? "me-angles"}>
			<caption className="me-angles__caption">{scale.caption}</caption>
			<thead>
				<tr>
					<th scope="col">
						<span className="me-angles__hidden">Row</span>
					</th>
					{scale.heads.map((h) => (
						<th key={h} scope="col">
							{h}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				<tr data-row="run">
					<th scope="row">this run</th>
					{scale.heads.map((h, i) => (
						<td key={h}>{cell(run[i])}</td>
					))}
				</tr>
				<tr data-row="nature">
					<th scope="row">nature</th>
					{scale.heads.map((h, i) => (
						<td key={h}>{cell(scale.natures[i])}</td>
					))}
				</tr>
			</tbody>
		</table>
	);
}

export function Score({
	scale,
	measured,
	error,
	predicted,
	run,
}: {
	scale: Scale;
	measured: number | null;
	error: number | null;
	predicted: number | null;
	run: (number | null)[];
}) {
	const at = (v: number) =>
		Math.max(0, Math.min(1, (v - scale.low) / (scale.high - scale.low)));
	const left = (v: number) => `${(at(v) * 100).toFixed(2)}%`;
	const spread = error === null ? 0 : 1.96 * error;
	const ticks = [0, 1, 2, 3].map(
		(i) => scale.low + ((scale.high - scale.low) * i) / 3,
	);

	return (
		<div className="me-score">
			<div className="me-ruler" aria-hidden="true">
				<span className="me-ruler__axis" />
				{ticks.map((t) => (
					<span key={t} className="me-ruler__tick" style={{ left: left(t) }}>
						{Math.round(t * 100)}%
					</span>
				))}
				<span
					className="me-ruler__mark"
					data-kind="ceiling"
					style={{ left: left(scale.ceiling) }}
				>
					<span className="me-ruler__label">any card</span>
				</span>
				<span
					className="me-ruler__mark"
					data-kind="nature"
					style={{ left: left(scale.nature) }}
				>
					<span className="me-ruler__label">nature</span>
				</span>
				{predicted === null ? null : (
					<span className="me-ruler__deck" style={{ left: left(predicted) }} />
				)}
				{measured === null ? null : (
					<>
						<span
							className="me-ruler__error"
							style={{
								transform: `translateX(${(at(measured - spread) * 100).toFixed(2)}%) scaleX(${(at(measured + spread) - at(measured - spread)).toFixed(4)})`,
							}}
						/>
						<span
							className="me-ruler__slide"
							style={{
								transform: `translateX(${(at(measured) * 100).toFixed(2)}%)`,
							}}
						>
							<span className="me-ruler__run" />
						</span>
					</>
				)}
			</div>
			<Angles run={run} scale={scale} />
		</div>
	);
}
