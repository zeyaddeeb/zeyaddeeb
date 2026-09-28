import { Stick } from "./stick";

export function LabelArt() {
	return (
		<svg viewBox="0 0 140 90" aria-hidden="true">
			<rect x={70} y={8} width={52} height={74} className="mc-v__paper" />
			<path d="M76 20 H116 M76 28 H116" className="mc-v__heavy" />
			<path d="M76 38 H116 M76 46 H116 M76 64 H116" className="mc-v__thin" />
			<rect x={76} y={53} width={40} height={6} className="mc-v__frame" />
			<rect x={76} y={53} width={2} height={6} className="mc-v__red" />
			<Stick x={36} y={84} pose="hold" size={0.95} />
		</svg>
	);
}

export function CableArt() {
	return (
		<svg viewBox="0 0 140 90" aria-hidden="true">
			<path d="M8 50 H132" className="mc-v__wire" />
			<path d="M28 50 V24 H64 V50 M76 50 V24 H112 V50" className="mc-v__wire" />
			<rect x={2} y={40} width={16} height={20} className="mc-v__blue" />
			<rect x={122} y={40} width={16} height={20} className="mc-v__paper" />
			<circle cx={46} cy={50} r={8} className="mc-v__head" />
			<circle cx={94} cy={50} r={8} className="mc-v__head" />
			<path d="M46 58 V74 M94 58 V74" className="mc-v__wire" />
			<path d="M36 24 H56" className="mc-v__blue-line" />
		</svg>
	);
}

export function CrowdArt() {
	return (
		<svg viewBox="0 0 140 90" aria-hidden="true">
			{[16, 38, 60, 82, 104, 126].map((x, i) => (
				<Stick key={x} x={x} y={84} size={0.72} lit={i > 0} />
			))}
		</svg>
	);
}

const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i / 8) * Math.PI * 2);
const at = (a: number, r: number) =>
	[Math.round(70 + Math.cos(a) * r), Math.round(45 + Math.sin(a) * r)] as const;

export function ChainArt() {
	return (
		<svg viewBox="0 0 140 90" aria-hidden="true">
			{rays.map((a) => {
				const [x, y] = at(a, 20);
				const [x2, y2] = at(a - 0.28, 38);
				const [x3, y3] = at(a + 0.28, 38);
				return (
					<g key={a}>
						<path
							d={`M70 45 L${x} ${y} M${x} ${y} L${x2} ${y2} M${x} ${y} L${x3} ${y3}`}
							className="mc-v__thin"
						/>
						<circle cx={x} cy={y} r={3.5} className="mc-v__paper" />
						<circle cx={x2} cy={y2} r={3} className="mc-v__red" />
						<circle cx={x3} cy={y3} r={3} className="mc-v__red" />
					</g>
				);
			})}
			<circle cx={70} cy={45} r={7} className="mc-v__blue" />
		</svg>
	);
}

export function PigeonArt() {
	return (
		<svg viewBox="0 0 140 90" aria-hidden="true">
			<g transform="translate(76 54) scale(0.72)">
				<path d="M-40 -4 L-78 -26 L-72 8 Z" className="mc-pigeon__tail" />
				<path d="M-44 -6 A44 44 0 0 0 44 -6 Z" className="mc-pigeon__body" />
				<path
					d="M-24 -6 A30 30 0 0 0 18 18 L-6 -6 Z"
					className="mc-pigeon__wing"
				/>
				<circle cx={38} cy={-24} r={15} className="mc-pigeon__body" />
				<path d="M52 -28 L66 -22 L52 -18 Z" className="mc-pigeon__beak" />
				<circle cx={42} cy={-27} r={3} className="mc-pigeon__eye" />
				<path d="M-6 36 V48 M10 34 V48" className="mc-pigeon__legs" />
				<rect x={5} y={38} width={10} height={7} className="mc-pigeon__tube" />
			</g>
		</svg>
	);
}
