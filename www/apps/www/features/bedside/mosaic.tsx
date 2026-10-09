import type { CSSProperties } from "react";
import {
	bedsideTone,
	COLUMNS,
	dishTone,
	GROUPS,
	markerParts,
	type Pair,
	shortName,
	step,
	title,
	VERDICTS,
} from "./model";
import "./mosaic.css";

export interface Row {
	biomarker: string;
	exploratory: boolean;
	pinned: boolean;
	pairs: Map<string, Pair>;
}

const SPARE = 10;

const keyOf = (p: Pair) => `${p.cancer}|${p.biomarker}|${p.drugClass}`;

const TRACKS = GROUPS.flatMap((g, i) => [
	...(i > 0 ? ["gap"] : []),
	...g.classes,
]);

const template = `var(--lt-label) ${TRACKS.map((t) =>
	t === "gap" ? "var(--lt-gap)" : "var(--lt-cell)",
).join(" ")}`;

const column = (drugClass: string) => TRACKS.indexOf(drugClass) + 2;

function Square({
	pair,
	chosen,
	onChoose,
	onPoint,
}: {
	pair: Pair;
	chosen: boolean;
	onChoose: (pair: Pair) => void;
	onPoint: (pair: Pair | null) => void;
}) {
	const dish = `lt-${dishTone(pair)} lt-step-${step(pair.dish.sensitizes)}`;
	const bed = `lt-${bedsideTone(pair)} lt-step-${step(pair.bedside.benefit)}`;
	const classes = [
		"lt-cell",
		pair.label ? "lt-cell--label" : "",
		chosen ? "lt-cell--chosen" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button
			type="button"
			className={classes}
			aria-label={`${title(pair)}: ${VERDICTS[pair.verdict]}`}
			onClick={() => onChoose(pair)}
			onPointerEnter={() => onPoint(pair)}
			onPointerLeave={() => onPoint(null)}
			onFocus={() => onPoint(pair)}
			onBlur={() => onPoint(null)}
		>
			<span className={`lt-cell__dish ${dish}`} />
			<span className={`lt-cell__bed ${bed}`} />
			<span className={`lt-cell__promise ${dish}`} />
		</button>
	);
}

function Label({
	row,
	onGene,
}: {
	row: Row;
	onGene: (biomarker: string) => void;
}) {
	const [gene, kind] = markerParts(row.biomarker);
	const classes = [
		"lt-name",
		row.exploratory ? "lt-name--explore" : "",
		row.pinned ? "lt-name--pinned" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button
			type="button"
			className={classes}
			onClick={() => onGene(row.biomarker)}
		>
			<span className="lt-name__gene">{gene}</span>
			<span className="lt-name__kind">
				{row.exploratory ? "exploratory" : kind}
			</span>
		</button>
	);
}

export function Mosaic({
	rows,
	slots,
	trim,
	reveal,
	chosen,
	onChoose,
	onPoint,
	onGene,
}: {
	rows: readonly Row[];
	slots: number;
	trim: boolean;
	reveal: number;
	chosen: Pair | null;
	onChoose: (pair: Pair) => void;
	onPoint: (pair: Pair | null) => void;
	onGene: (biomarker: string) => void;
}) {
	const style = {
		"--lt-reveal": reveal,
		"--lt-cols": COLUMNS.length,
		"--lt-gaps": GROUPS.length - 1,
		gridTemplateColumns: template,
		gridTemplateRows: "auto auto repeat(var(--lt-slots), var(--lt-row))",
		...(trim ? {} : { "--lt-slots": slots }),
	} as CSSProperties;
	const chosenKey = chosen ? keyOf(chosen) : "";

	return (
		<div className="lt-frame">
			<div className="lt-grid" style={style} data-trim={trim}>
				{GROUPS.map((g) => (
					<span
						key={g.name}
						className="lt-family"
						style={{
							gridColumn: `${column(g.classes[0] ?? "")} / span ${g.classes.length}`,
						}}
					>
						{g.name}
					</span>
				))}
				{COLUMNS.map((c) => (
					<span
						key={c}
						className="lt-column"
						style={{ gridColumn: column(c), gridRow: 2 }}
					>
						<span>{shortName(c)}</span>
					</span>
				))}
				{rows.map((row, i) => (
					<div
						key={row.biomarker}
						className={row.pinned ? "lt-row lt-row--pinned" : "lt-row"}
						data-spare={trim && i >= SPARE}
						style={{ gridRow: i + 3 }}
					>
						<Label row={row} onGene={onGene} />
						{COLUMNS.map((c) => {
							const pair = row.pairs.get(c);

							return pair ? (
								<span
									key={c}
									className="lt-slot"
									style={{ gridColumn: column(c) }}
								>
									<Square
										pair={pair}
										chosen={keyOf(pair) === chosenKey}
										onChoose={onChoose}
										onPoint={onPoint}
									/>
								</span>
							) : (
								<span
									key={c}
									className="lt-slot lt-slot--none"
									style={{ gridColumn: column(c) }}
								/>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
