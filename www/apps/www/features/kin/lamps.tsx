import { argmax, softmax } from "./ink";
import { CLASSES } from "./protocol";

const SHAPES = ["square", "circle", "triangle"] as const;

export function Shape({
	kind,
	glow,
}: {
	kind: (typeof SHAPES)[number];
	glow: number;
}) {
	const opacity = 0.14 + 0.86 * glow;

	return (
		<svg
			className={`kn-shape kn-shape--${kind}`}
			viewBox="0 0 20 20"
			aria-hidden="true"
		>
			{kind === "square" ? (
				<rect x="2" y="2" width="16" height="16" style={{ opacity }} />
			) : null}
			{kind === "circle" ? (
				<circle cx="10" cy="10" r="8.5" style={{ opacity }} />
			) : null}
			{kind === "triangle" ? (
				<polygon points="10,1.5 19,18.5 1,18.5" style={{ opacity }} />
			) : null}
		</svg>
	);
}

export function Spare({ logits }: { logits: ArrayLike<number> | null }) {
	const glow = logits
		? softmax(logits, CLASSES, CLASSES + 3)
		: [1 / 3, 1 / 3, 1 / 3];

	return (
		<span className="kn-spare">
			{SHAPES.map((kind, i) => (
				<Shape key={kind} kind={kind} glow={glow[i]} />
			))}
		</span>
	);
}

export function Lamps({
	logits,
	label,
}: {
	logits: ArrayLike<number> | null;
	label: string;
}) {
	const p = logits ? softmax(logits, 0, CLASSES) : null;
	const pick = p ? argmax(p) : -1;

	return (
		<div className="kn-lamps" role="img" aria-label={label}>
			<span className="kn-digits">
				{Array.from({ length: CLASSES }, (_, d) => (
					<span
						key={d}
						className="kn-digit"
						data-pick={d === pick ? "" : undefined}
						style={{ "--p": p ? p[d] : 0 } as React.CSSProperties}
					>
						<span className="kn-digit__cell" />
						<span className="kn-digit__label">{d}</span>
					</span>
				))}
			</span>
			<Spare logits={logits} />
		</div>
	);
}

export const reads = (logits: ArrayLike<number> | null) =>
	logits ? argmax(softmax(logits, 0, CLASSES)) : null;
