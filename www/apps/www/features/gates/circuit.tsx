import { type Drawing, draw, inputLabels, ROW } from "./draw";
import type { Op, Study } from "./protocol";

const INPUT = 15;
const GATE = 15;
const BUBBLE = 5;

function Shape({ op, x, y }: { op: Op; x: number; y: number }) {
	if (op === "or") {
		return <circle className="gf-op gf-op--or" cx={x} cy={y} r={GATE} />;
	}

	if (op === "xor") {
		const h = GATE * 1.9;

		return (
			<polygon
				className="gf-op gf-op--xor"
				points={`${x},${y - h / 2} ${x + h / 1.7},${y + h / 2} ${x - h / 1.7},${y + h / 2}`}
			/>
		);
	}

	return (
		<rect
			className="gf-op gf-op--and"
			x={x - GATE}
			y={y - GATE}
			width={GATE * 2}
			height={GATE * 2}
		/>
	);
}

function towards(
	from: { x: number; y: number },
	to: { x: number; y: number },
	distance: number,
) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy) || 1;

	return {
		x: to.x - (dx / length) * distance,
		y: to.y - (dy / length) * distance,
	};
}

function Picture({ drawing }: { drawing: Drawing }) {
	const at = new Map(drawing.nodes.map((n) => [n.node, n]));
	const out = drawing.output ? at.get(drawing.output.node) : undefined;

	return (
		<svg
			className="gf-picture"
			viewBox={`0 0 ${drawing.width} ${drawing.height}`}
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label={`A circuit of ${drawing.nodes.filter((n) => n.kind === "gate").length} gates`}
		>
			{drawing.wires.map((wire) => {
				const from = at.get(wire.from);
				const to = at.get(wire.to);

				if (!from || !to) return null;

				const end = towards(from, to, GATE + 2);
				const bubble = towards(from, to, GATE + 2 + BUBBLE);

				return (
					<g key={`${wire.from}-${wire.to}`}>
						<line
							className="gf-wire"
							x1={from.x}
							y1={from.y}
							x2={end.x}
							y2={end.y}
						/>
						{wire.inverted ? (
							<circle
								className="gf-bubble"
								cx={bubble.x}
								cy={bubble.y}
								r={BUBBLE}
							/>
						) : null}
					</g>
				);
			})}
			{out ? (
				<g>
					<line
						className="gf-wire gf-wire--out"
						x1={out.x}
						y1={out.y}
						x2={out.x}
						y2={out.y + ROW * 0.5}
					/>
					{drawing.output?.inverted ? (
						<circle
							className="gf-bubble"
							cx={out.x}
							cy={out.y + GATE + 2 + BUBBLE}
							r={BUBBLE}
						/>
					) : null}
					<rect
						className="gf-out"
						x={out.x - 6}
						y={out.y + ROW * 0.5}
						width={12}
						height={12}
					/>
				</g>
			) : null}
			{drawing.nodes.map((node) =>
				node.kind === "input" ? (
					<g key={node.node}>
						<circle className="gf-input" cx={node.x} cy={node.y} r={INPUT} />
						<text className="gf-label" x={node.x} y={node.y} dy="0.35em">
							{node.label}
						</text>
					</g>
				) : node.op ? (
					<Shape key={node.node} op={node.op} x={node.x} y={node.y} />
				) : null,
			)}
		</svg>
	);
}

export function CircuitView({ study }: { study: Study }) {
	if (!study.circuit) {
		return (
			<div className="gf-unknown">
				<p className="gf-unknown-bound">
					<span>at least</span>
					{study.lower}
				</p>
				<p className="gf-unknown-line">
					No circuit yet. Every size below {study.lower} is ruled out, each by a
					proof checked line by line.
				</p>
			</div>
		);
	}

	return (
		<Picture
			drawing={draw(study.circuit, inputLabels(study.family, study.inputs))}
		/>
	);
}

export function Legend() {
	return (
		<ul className="gf-legend" aria-label="Gate shapes">
			<li>
				<svg viewBox="0 0 20 20" aria-hidden="true">
					<rect
						className="gf-op gf-op--and"
						x="3"
						y="3"
						width="14"
						height="14"
					/>
				</svg>
				and
			</li>
			<li>
				<svg viewBox="0 0 20 20" aria-hidden="true">
					<circle className="gf-op gf-op--or" cx="10" cy="10" r="7.5" />
				</svg>
				or
			</li>
			<li>
				<svg viewBox="0 0 20 20" aria-hidden="true">
					<polygon
						className="gf-op gf-op--xor"
						points="10,2.5 18,17.5 2,17.5"
					/>
				</svg>
				exclusive or
			</li>
			<li>
				<svg viewBox="0 0 20 20" aria-hidden="true">
					<line className="gf-wire" x1="10" y1="0" x2="10" y2="20" />
					<circle className="gf-bubble" cx="10" cy="10" r="5" />
				</svg>
				not
			</li>
		</ul>
	);
}
