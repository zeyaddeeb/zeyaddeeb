import {
	type CSSProperties,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import {
	bedsideTone,
	className,
	dishTone,
	type Mosaic as MosaicData,
	markerName,
	type Pair,
	step,
	title,
	VERDICTS,
} from "./model";
import "./mosaic.css";

const CELL = 30;
const GAP = 2;
const HEAD = 92;

const keyOf = (p: Pair) => `${p.biomarker}|${p.drugClass}`;

function geneClass(gene: string, index: number, tested: number) {
	if (!gene.startsWith("altered:")) return "lt-gene lt-gene--named";

	return index >= tested ? "lt-gene lt-gene--explore" : "lt-gene";
}

function Square({ pair, chosen }: { pair: Pair; chosen: boolean }) {
	const x = pair.gene * CELL + GAP;
	const y = HEAD + pair.row * CELL + GAP;
	const s = CELL - GAP * 2;
	const upper = `${x},${y} ${x + s},${y} ${x},${y + s}`;
	const lower = `${x + s},${y} ${x + s},${y + s} ${x},${y + s}`;
	const dish = `lt-${dishTone(pair)} lt-step-${step(pair.dish.sensitizes)}`;
	const bed = `lt-${bedsideTone(pair)} lt-step-${step(pair.bedside.benefit)}`;

	return (
		<g className={chosen ? "lt-square lt-square--chosen" : "lt-square"}>
			<polygon className={`lt-dish ${dish}`} points={upper} />
			<polygon className={`lt-bed ${bed}`} points={lower} />
			<polygon className={`lt-promise ${dish}`} points={lower} />
			{pair.label ? (
				<rect
					className="lt-label"
					x={x + 1}
					y={y + 1}
					width={s - 2}
					height={s - 2}
				/>
			) : null}
			{chosen ? (
				<rect
					className="lt-chosen"
					x={x - 1}
					y={y - 1}
					width={s + 2}
					height={s + 2}
				/>
			) : null}
		</g>
	);
}

function Empty({ gene, row }: { gene: number; row: number }) {
	const x = gene * CELL + GAP;
	const y = HEAD + row * CELL + GAP;
	const s = CELL - GAP * 2;

	return (
		<rect
			className="lt-empty"
			x={x + 0.5}
			y={y + 0.5}
			width={s - 1}
			height={s - 1}
		/>
	);
}

function useMore(ref: RefObject<HTMLDivElement | null>, key: string) {
	const [more, setMore] = useState(false);

	useEffect(() => {
		const el = ref.current;

		if (!el) return;

		const check = () =>
			setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
		const watch = new ResizeObserver(check);

		check();
		watch.observe(el);
		el.addEventListener("scroll", check, { passive: true });

		return () => {
			watch.disconnect();
			el.removeEventListener("scroll", check);
		};
	}, [ref, key]);

	return more;
}

export function Mosaic({
	mosaic,
	reveal,
	chosen,
	onChoose,
	onPoint,
	focus = null,
}: {
	mosaic: MosaicData;
	reveal: number;
	chosen: Pair | null;
	onChoose: (pair: Pair) => void;
	onPoint: (pair: Pair | null) => void;
	focus?: number | null;
}) {
	const { genes, classes, pairs, tested } = mosaic;
	const scroller = useRef<HTMLDivElement>(null);
	const more = useMore(scroller, `${mosaic.cancer}|${genes.length}`);
	const reduced = useReducedMotion();

	useEffect(() => {
		const el = scroller.current;

		if (!el || focus === null) return;

		el.scrollTo({
			left: focus * CELL - (el.clientWidth - CELL) / 2,
			behavior: reduced ? "auto" : "smooth",
		});
	}, [focus, reduced]);
	const width = genes.length * CELL;
	const height = HEAD + classes.length * CELL;
	const filled = new Set(pairs.map((p) => `${p.gene}|${p.row}`));
	const style = {
		"--lt-reveal": reveal,
		"--lt-cols": genes.length,
		"--lt-rows": classes.length,
		"--lt-cell": `${CELL}px`,
		"--lt-head": `${HEAD}px`,
	} as CSSProperties;

	return (
		<div className="lt-mosaic" style={style}>
			<ul className="lt-rows" aria-hidden="true">
				{classes.map((c) => (
					<li key={c}>{className(c)}</li>
				))}
			</ul>

			<div className="lt-scroll" ref={scroller} data-more={more}>
				<div className="lt-canvas" style={{ width, height }}>
					<svg
						className="lt-svg"
						width={width}
						height={height}
						viewBox={`0 0 ${width} ${height}`}
						aria-hidden="true"
					>
						{tested < genes.length ? (
							<g className="lt-boundary">
								<line
									x1={tested * CELL}
									x2={tested * CELL}
									y1={4}
									y2={height}
								/>
								<text x={tested * CELL + 8} y={14}>
									Exploratory
								</text>
							</g>
						) : null}
						{focus !== null ? (
							<rect
								className="lt-focus"
								x={focus * CELL}
								y={HEAD}
								width={CELL}
								height={classes.length * CELL}
							/>
						) : null}
						{genes.map((g, i) => (
							<text
								key={g}
								className={geneClass(g, i, tested)}
								transform={`translate(${i * CELL + CELL / 2 + 4} ${HEAD - 8}) rotate(-58)`}
							>
								{markerName(g)}
							</text>
						))}
						{classes.map((c, row) =>
							genes.map((g, gene) =>
								filled.has(`${gene}|${row}`) ? null : (
									<Empty key={`${g}|${c}`} gene={gene} row={row} />
								),
							),
						)}
						{pairs.map((p) => (
							<Square
								key={keyOf(p)}
								pair={p}
								chosen={chosen !== null && keyOf(chosen) === keyOf(p)}
							/>
						))}
					</svg>

					<div className="lt-hits">
						{pairs.map((p) => (
							<button
								key={keyOf(p)}
								type="button"
								className="lt-hit"
								style={{
									gridColumn: p.gene + 1,
									gridRow: p.row + 1,
								}}
								aria-label={`${title(p)}: ${VERDICTS[p.verdict]}`}
								onClick={() => onChoose(p)}
								onPointerEnter={() => onPoint(p)}
								onPointerLeave={() => onPoint(null)}
								onFocus={() => onPoint(p)}
								onBlur={() => onPoint(null)}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
