import { question } from "./answer";
import { Laptop, Speech, Stick } from "./stick";

function Ribbon({ d }: { d: string }) {
	return (
		<>
			<path d={d} className="mc-ribbon__edge" />
			<path d={d} className="mc-ribbon" />
		</>
	);
}

export function Strip() {
	return (
		<div className="mc-strip">
			<div className="mc-panel">
				<p className="mc-panel__text">{question}</p>
				<svg viewBox="0 0 240 112" aria-hidden="true">
					<Speech x1={58} y1={30} x2={44} y2={2} />
					<Stick x={52} y={108} pose="ask" hair />
					<Stick x={168} y={108} pose="type" />
					<Laptop x={180} y={108} />
				</svg>
			</div>
			<div className="mc-panel">
				<p className="mc-panel__text mc-panel__text--model">
					Here’s a detailed breakdown of what most likely happened during last
					night’s checkout incident, including…
				</p>
				<svg viewBox="0 0 240 112" aria-hidden="true">
					<Speech x1={90} y1={56} x2={106} y2={2} />
					<Ribbon d="M86 62 C 94 26, 142 24, 150 68 S 160 106, 180 106 H 214" />
					<circle cx={220} cy={100} r={7} className="mc-ribbon__roll" />
					<path
						d="M184 106 H194 M198 106 H208 M154 80 L156 92"
						className="mc-ribbon__text"
					/>
					<Stick x={44} y={108} pose="type" />
					<Laptop x={56} y={108} />
				</svg>
			</div>
			<div className="mc-panel">
				<div className="mc-panel__pair">
					<p className="mc-panel__text">Claude said:</p>
					<p className="mc-panel__text mc-panel__text--end">
						I can talk to Claude myself.
					</p>
				</div>
				<svg viewBox="0 0 240 112" aria-hidden="true">
					<Speech x1={46} y1={30} x2={30} y2={2} />
					<Speech x1={206} y1={30} x2={222} y2={2} />
					<Ribbon d="M72 66 C 98 68, 108 106, 132 106 H 154" />
					<circle cx={164} cy={97} r={11} className="mc-ribbon__roll" />
					<circle cx={164} cy={97} r={3.5} className="mc-ribbon__core" />
					<Stick x={50} y={108} pose="hold" />
					<Stick x={202} y={108} pose="shrug" hair />
				</svg>
			</div>
		</div>
	);
}
