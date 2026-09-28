import { Speech, Stick } from "./stick";

export function Pigeon() {
	return (
		<svg
			viewBox="0 0 420 170"
			className="mc-pigeon"
			role="img"
			aria-label="A stick figure hands a note that says Claude said to a carrier pigeon."
		>
			<Stick x={78} y={150} pose="hold" />
			<g transform="translate(98 104) rotate(-8)">
				<rect width={40} height={28} className="mc-pigeon__note" />
				<path d="M6 9 H34 M6 15 H30 M6 21 H26" className="mc-pigeon__lines" />
			</g>
			<Speech x1={66} y1={80} x2={40} y2={50} />
			<text x={8} y={40} className="mc-pigeon__said">
				Claude said:
			</text>
			<g transform="translate(286 112)">
				<path d="M-40 -4 L-78 -26 L-72 8 Z" className="mc-pigeon__tail" />
				<path d="M-44 -6 A44 44 0 0 0 44 -6 Z" className="mc-pigeon__body" />
				<path
					d="M-24 -6 A30 30 0 0 0 18 18 L-6 -6 Z"
					className="mc-pigeon__wing"
				/>
				<circle cx={38} cy={-24} r={15} className="mc-pigeon__body" />
				<path d="M52 -28 L66 -22 L52 -18 Z" className="mc-pigeon__beak" />
				<circle cx={42} cy={-27} r={3} className="mc-pigeon__eye" />
				<path
					d="M-6 36 V54 M10 34 V54 M-12 54 H0 M4 54 H16"
					className="mc-pigeon__legs"
				/>
				<rect x={5} y={40} width={10} height={7} className="mc-pigeon__tube" />
			</g>
		</svg>
	);
}
