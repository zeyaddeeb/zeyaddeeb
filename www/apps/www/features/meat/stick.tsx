export type Pose = "stand" | "ask" | "type" | "shrug" | "hold" | "point";

interface StickProps {
	x: number;
	y: number;
	pose?: Pose;
	size?: number;
	lit?: boolean;
	flip?: boolean;
	hair?: boolean;
}

type Arm = [number, number, number, number];

const arms: Record<Pose, [Arm, Arm]> = {
	stand: [
		[-6, -34, -9, -23],
		[6, -34, 9, -23],
	],
	ask: [
		[-6, -34, -9, -23],
		[11, -39, 19, -47],
	],
	type: [
		[-6, -34, -9, -23],
		[9, -35, 20, -36],
	],
	shrug: [
		[-12, -38, -17, -48],
		[12, -38, 17, -48],
	],
	hold: [
		[-6, -34, -9, -23],
		[11, -41, 22, -43],
	],
	point: [
		[-6, -34, -9, -23],
		[12, -48, 24, -55],
	],
};

export function Stick({
	x,
	y,
	pose = "stand",
	size = 1,
	lit,
	flip,
	hair,
}: StickProps) {
	const [l, r] = arms[pose];
	const limbs = [
		"M0 -51 V-21",
		`M0 -45 L${l[0]} ${l[1]} L${l[2]} ${l[3]}`,
		`M0 -45 L${r[0]} ${r[1]} L${r[2]} ${r[3]}`,
		"M0 -21 L-8 0",
		"M0 -21 L8 0",
	].join(" ");
	return (
		<g
			className="mc-stick"
			transform={`translate(${x} ${y}) scale(${flip ? -size : size} ${size})`}
		>
			<path d={limbs} />
			<circle
				cx={0}
				cy={-62}
				r={11}
				className={lit ? "mc-stick__head is-lit" : "mc-stick__head"}
			/>
			{hair ? (
				<path
					className="mc-stick__hair"
					d="M-11 -62 A11 11 0 0 1 11 -63 C 8 -68, 0 -70, -4 -66 C -7 -63, -9 -58, -12 -52 C -15 -56, -14 -60, -11 -62 Z"
				/>
			) : null}
		</g>
	);
}

export function Laptop({ x, y }: { x: number; y: number }) {
	return (
		<g className="mc-stick" transform={`translate(${x} ${y})`}>
			<path d="M0 -26 H32 M24 -26 L30 -47 M14 -26 V0 M6 0 H22" />
		</g>
	);
}

export function Speech({
	x1,
	y1,
	x2,
	y2,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}) {
	return (
		<path
			className="mc-speech"
			d={`M${x1} ${y1} Q${x1 + (x2 - x1) * 0.15} ${y2 + (y1 - y2) * 0.35} ${x2} ${y2}`}
		/>
	);
}

export function Callout({
	x,
	y,
	tx,
	ty,
	children,
	anchor = "start",
	size,
}: {
	x: number;
	y: number;
	tx: number;
	ty: number;
	children: string;
	anchor?: "start" | "middle" | "end";
	size?: number;
}) {
	const bend = { x: tx, y: y + (ty - y) * 0.15 };
	const lx = anchor === "start" ? tx + 6 : anchor === "end" ? tx - 6 : tx;
	const ly = anchor === "middle" ? (ty < y ? ty - 8 : ty + 16) : ty + 5;
	return (
		<g className="mc-callout">
			<path d={`M${x} ${y} Q${bend.x} ${bend.y} ${tx} ${ty}`} />
			<circle cx={x} cy={y} r={2.5} />
			<text x={lx} y={ly} textAnchor={anchor} fontSize={size}>
				{children}
			</text>
		</g>
	);
}
