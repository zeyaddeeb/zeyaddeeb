import { Fragment } from "react";
import type { Cue, Placement } from "./screenplay";
import { framesFor, setups } from "./screenplay";

export const SHEET = { x: 0, y: -120, w: 5800, h: 2400 };

const sec = (s: number) => `${Math.max(0, s).toFixed(2)}s`;
const CAB_RISE = 520;

interface Timing {
	cues: Cue[];
	reduced: boolean;
	tall?: boolean;
}

function craneTiming(cue: Cue) {
	return {
		begin: cue.start + 0.8,
		dur: Math.max(0.6, cue.shot.duration - 1.4),
	};
}

export function Camera({ cues, reduced, tall = false }: Timing) {
	const smooth = reduced ? "discrete" : "linear";
	return (
		<>
			{cues.map((cue) => {
				const setup = setups[cue.shot.setup];
				const [a, b, c] = framesFor(cue.shot, tall);
				const key = `${cue.index}-${cue.start}`;
				const hold = (
					<set
						attributeName="viewBox"
						to={a}
						begin={sec(cue.start)}
						fill="freeze"
					/>
				);
				switch (setup.move) {
					case "dolly":
						return (
							<animate
								key={key}
								attributeName="viewBox"
								from={a}
								to={b}
								begin={sec(cue.start)}
								dur={sec(cue.shot.duration)}
								calcMode={smooth}
								fill="freeze"
							/>
						);
					case "whip":
						return (
							<Fragment key={key}>
								{hold}
								<animate
									attributeName="viewBox"
									from={a}
									to={b}
									begin={sec(cue.start + 0.9)}
									dur="0.3s"
									calcMode={reduced ? "discrete" : "spline"}
									keyTimes="0;1"
									keySplines="0.7 0 0.2 1"
									fill="freeze"
								/>
							</Fragment>
						);
					case "snap":
						return (
							<Fragment key={key}>
								{hold}
								<animate
									attributeName="viewBox"
									values={`${a};${b};${c}`}
									keyTimes="0;0.4;0.7"
									begin={sec(cue.start + 1.4)}
									dur="0.36s"
									calcMode="discrete"
									fill="freeze"
								/>
							</Fragment>
						);
					case "crane": {
						const t = craneTiming(cue);
						return (
							<Fragment key={key}>
								{hold}
								<animate
									attributeName="viewBox"
									from={a}
									to={b}
									begin={sec(t.begin)}
									dur={sec(t.dur)}
									calcMode={smooth}
									fill="freeze"
								/>
							</Fragment>
						);
					}
					case "pull":
						return (
							<Fragment key={key}>
								{hold}
								<animate
									attributeName="viewBox"
									from={a}
									to={b}
									begin={sec(cue.start + 0.5)}
									dur={sec(
										Math.min(2.6, Math.max(0.8, cue.shot.duration - 0.8)),
									)}
									calcMode={reduced ? "discrete" : "spline"}
									keyTimes="0;1"
									keySplines="0.25 0 0.15 1"
									fill="freeze"
								/>
							</Fragment>
						);
					default:
						return <Fragment key={key}>{hold}</Fragment>;
				}
			})}
		</>
	);
}

type Hat = "pillbox" | "cap" | "brim";

function Figure({
	x,
	y,
	scale = 1,
	coat,
	hat,
	walk,
}: {
	x: number;
	y: number;
	scale?: number;
	coat: string;
	hat: Hat;
	walk?: { begin: number; dur: number };
}) {
	const steps = walk ? Math.max(1, Math.round(walk.dur / 0.32)) : 0;
	return (
		<g transform={`translate(${x} ${y}) scale(${scale})`}>
			<g>
				<rect x="-30" y="-120" width="24" height="120" fill="var(--f-ink)" />
				<rect x="6" y="-120" width="24" height="120" fill="var(--f-ink)" />
				{walk && (
					<animate
						attributeName="visibility"
						values="hidden;visible"
						keyTimes="0;0.5"
						calcMode="discrete"
						begin={sec(walk.begin)}
						dur="0.32s"
						repeatCount={steps}
						fill="remove"
					/>
				)}
			</g>
			{walk && (
				<g visibility="hidden">
					<rect x="-44" y="-120" width="24" height="120" fill="var(--f-ink)" />
					<rect x="20" y="-120" width="24" height="120" fill="var(--f-ink)" />
					<animate
						attributeName="visibility"
						values="visible;hidden"
						keyTimes="0;0.5"
						calcMode="discrete"
						begin={sec(walk.begin)}
						dur="0.32s"
						repeatCount={steps}
						fill="remove"
					/>
				</g>
			)}
			<rect x="-66" y="-268" width="20" height="124" rx="10" fill={coat} />
			<rect x="46" y="-268" width="20" height="124" rx="10" fill={coat} />
			<rect x="-48" y="-282" width="96" height="172" rx="12" fill={coat} />
			<rect x="-10" y="-282" width="20" height="60" fill="var(--f-cream)" />
			<circle cx="0" cy="-206" r="5" fill="var(--f-cream)" />
			<circle cx="0" cy="-176" r="5" fill="var(--f-cream)" />
			<circle cx="0" cy="-146" r="5" fill="var(--f-cream)" />
			<circle cx="0" cy="-322" r="42" fill="var(--f-skin)" />
			<circle cx="-14" cy="-326" r="4" fill="var(--f-ink)" />
			<circle cx="14" cy="-326" r="4" fill="var(--f-ink)" />
			{hat === "cap" && (
				<>
					<rect x="-16" y="-312" width="32" height="6" fill="var(--f-ink)" />
					<rect
						x="-46"
						y="-378"
						width="92"
						height="26"
						rx="4"
						fill="var(--f-ink)"
					/>
					<rect x="-50" y="-354" width="100" height="8" fill="var(--f-ink)" />
				</>
			)}
			{hat === "pillbox" && (
				<>
					<rect x="-32" y="-386" width="64" height="32" fill="var(--f-red)" />
					<rect x="-32" y="-362" width="64" height="4" fill="var(--f-gold)" />
					<path
						d="M-34 -352 L-40 -300 M34 -352 L40 -300"
						stroke="var(--f-ink)"
						strokeWidth="2"
					/>
				</>
			)}
			{hat === "brim" && (
				<>
					<rect
						x="-36"
						y="-392"
						width="72"
						height="40"
						rx="10"
						fill="var(--f-rose)"
					/>
					<rect
						x="-72"
						y="-356"
						width="144"
						height="10"
						rx="5"
						fill="var(--f-rose)"
					/>
					<rect x="-36" y="-368" width="72" height="8" fill="var(--f-ink)" />
				</>
			)}
		</g>
	);
}

const CAST = {
	anna: { coat: "var(--f-gold)", hat: "brim" as Hat },
	otto: { coat: "var(--f-mint)", hat: "pillbox" as Hat },
	concierge: { coat: "var(--f-ink)", hat: "cap" as Hat },
};

function Door({ x, y, label }: { x: number; y: number; label: string }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect x="-92" y="-352" width="184" height="352" fill="var(--f-wood)" />
			<rect x="-80" y="-340" width="160" height="340" fill="var(--f-mint)" />
			<rect
				x="-60"
				y="-320"
				width="120"
				height="120"
				fill="var(--f-cream)"
				opacity=".55"
			/>
			<rect
				x="-60"
				y="-180"
				width="120"
				height="160"
				fill="var(--f-ink)"
				opacity=".12"
			/>
			<circle cx="50" cy="-150" r="7" fill="var(--f-gold)" />
			<rect x="-34" y="-236" width="68" height="30" fill="var(--f-cream)" />
			<text
				x="0"
				y="-214"
				textAnchor="middle"
				fontSize="22"
				fontWeight="600"
				fill="var(--f-ink)"
			>
				{label}
			</text>
		</g>
	);
}

function Sconce({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect x="-6" y="0" width="12" height="40" fill="var(--f-gold)" />
			<path d="M-30 0 A30 30 0 0 1 30 0 Z" fill="var(--f-cream)" />
		</g>
	);
}

function Palm({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect x="-34" y="-70" width="68" height="70" fill="var(--f-rose)" />
			<rect x="-40" y="-78" width="80" height="12" fill="var(--f-rose)" />
			<rect x="-5" y="-250" width="10" height="180" fill="var(--f-wood)" />
			{[-70, -35, 0, 35, 70].map((angle) => (
				<ellipse
					key={angle}
					cx="0"
					cy="-300"
					rx="18"
					ry="78"
					fill="var(--f-mint)"
					transform={`rotate(${angle} 0 -230)`}
				/>
			))}
		</g>
	);
}

function PastryBox({
	x,
	y,
	size = 90,
}: {
	x: number;
	y: number;
	size?: number;
}) {
	const r = size / 9;
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect width={size} height={size} fill="var(--f-rose)" />
			<rect
				x={size / 2 - r / 2}
				width={r}
				height={size}
				fill="var(--f-cream)"
			/>
			<rect
				y={size / 2 - r / 2}
				width={size}
				height={r}
				fill="var(--f-cream)"
			/>
		</g>
	);
}

function Chair({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect
				x="-44"
				y="-170"
				width="88"
				height="90"
				rx="6"
				fill="var(--f-rose)"
			/>
			<rect x="-50" y="-84" width="100" height="26" fill="var(--f-rose)" />
			<rect x="-44" y="-58" width="10" height="58" fill="var(--f-wood)" />
			<rect x="34" y="-58" width="10" height="58" fill="var(--f-wood)" />
		</g>
	);
}

function Hand({ x, mirror = false }: { x: number; mirror?: boolean }) {
	return (
		<g transform={`translate(${x} 0) scale(${mirror ? -1 : 1} 1)`}>
			<rect x="-70" y="120" width="140" height="300" fill="var(--f-mint)" />
			<rect x="-74" y="96" width="148" height="30" fill="var(--f-cream)" />
			<rect
				x="-60"
				y="-40"
				width="120"
				height="150"
				rx="30"
				fill="var(--f-skin)"
			/>
			{[-52, -22, 8, 38].map((fx, i) => (
				<rect
					key={fx}
					x={fx}
					y={-130 + (i === 0 || i === 3 ? 22 : 0)}
					width="26"
					height="120"
					rx="13"
					fill="var(--f-skin)"
				/>
			))}
			<rect
				x="52"
				y="-20"
				width="26"
				height="90"
				rx="13"
				fill="var(--f-skin)"
				transform="rotate(-30 52 -20)"
			/>
		</g>
	);
}

const VISIBLE: Record<Placement, Record<string, boolean>> = {
	lobby: {
		anna: true,
		otto: true,
		concierge: true,
		corridor: false,
		cab: false,
	},
	corridor: {
		anna: true,
		otto: false,
		concierge: true,
		corridor: true,
		cab: false,
	},
	cab: {
		anna: false,
		otto: false,
		concierge: false,
		corridor: false,
		cab: true,
	},
};

function wrapTitle(title: string, max = 14) {
	const lines: string[] = [];
	for (const word of title.split(/\s+/).filter(Boolean)) {
		const last = lines[lines.length - 1];
		if (last !== undefined && `${last} ${word}`.length <= max)
			lines[lines.length - 1] = `${last} ${word}`;
		else lines.push(word);
	}
	return lines.length ? lines : [title];
}

export function Drawing({ cues, reduced }: Timing) {
	const first = cues[0] ? setups[cues[0].shot.setup].placement : "lobby";
	const vis = (group: string) => (VISIBLE[first][group] ? "visible" : "hidden");
	const placementSets = (group: string) =>
		cues.map((cue, i) => {
			const placement = setups[cue.shot.setup].placement;
			const previous = i ? setups[cues[i - 1].shot.setup].placement : first;
			if (i && placement === previous) return null;
			return (
				<set
					key={`${group}-${cue.index}`}
					attributeName="visibility"
					to={VISIBLE[placement][group] ? "visible" : "hidden"}
					begin={sec(cue.start)}
					fill="freeze"
				/>
			);
		});
	const dolly = cues.filter((cue) => cue.shot.setup === "DOLLY");
	const cranes = cues.filter((cue) => cue.shot.setup === "TABLEAU");
	const overheads = cues.filter((cue) => cue.shot.setup === "OVERHEAD");
	const cards = cues.filter((cue) => cue.shot.setup === "CARD");
	const portraits = cues.filter((cue) => cue.shot.setup === "PORTRAIT");

	return (
		<g id="set" className="film-set">
			<defs>
				<pattern
					id="p-stripe"
					width="48"
					height="48"
					patternUnits="userSpaceOnUse"
				>
					<rect width="48" height="48" fill="var(--f-wall)" />
					<rect width="22" height="48" fill="var(--f-wall-2)" />
				</pattern>
				<pattern
					id="p-diamond"
					width="80"
					height="80"
					patternUnits="userSpaceOnUse"
				>
					<rect width="80" height="80" fill="var(--f-wall)" />
					<path
						d="M40 14 L66 40 L40 66 L14 40 Z"
						fill="none"
						stroke="var(--f-wall-2)"
						strokeWidth="4"
					/>
				</pattern>
				<pattern
					id="p-dots"
					width="64"
					height="64"
					patternUnits="userSpaceOnUse"
				>
					<rect width="64" height="64" fill="var(--f-wall)" />
					<circle cx="16" cy="16" r="7" fill="var(--f-wall-2)" />
					<circle cx="48" cy="48" r="7" fill="var(--f-wall-2)" />
				</pattern>
				<pattern
					id="p-tile"
					width="50"
					height="50"
					patternUnits="userSpaceOnUse"
				>
					<rect width="50" height="50" fill="var(--f-cream)" />
					<rect
						width="50"
						height="50"
						fill="none"
						stroke="var(--f-wall-2)"
						strokeWidth="3"
					/>
				</pattern>
				<pattern
					id="p-check"
					width="60"
					height="60"
					patternUnits="userSpaceOnUse"
				>
					<rect width="60" height="60" fill="var(--f-cream)" />
					<rect width="30" height="30" fill="var(--f-floor)" />
					<rect x="30" y="30" width="30" height="30" fill="var(--f-floor)" />
				</pattern>
				<pattern
					id="p-grille"
					width="40"
					height="40"
					patternUnits="userSpaceOnUse"
				>
					<path
						d="M0 20 L20 0 L40 20 L20 40 Z"
						fill="none"
						stroke="var(--f-gold)"
						strokeWidth="3"
					/>
				</pattern>
				<pattern
					id="p-linen"
					width="200"
					height="24"
					patternUnits="userSpaceOnUse"
				>
					<rect width="200" height="24" fill="var(--f-cream)" />
					<rect width="200" height="8" fill="var(--f-mint)" />
					<rect y="12" width="200" height="4" fill="var(--f-rose)" />
				</pattern>
			</defs>

			<rect
				x="-1000"
				y="-3000"
				width="8000"
				height="4900"
				fill="var(--f-sky)"
			/>
			<rect
				x="-1000"
				y="1900"
				width="8000"
				height="3000"
				fill="var(--f-ground)"
			/>

			<rect x="580" y="60" width="90" height="150" fill="var(--f-facade)" />
			<rect x="3330" y="60" width="90" height="150" fill="var(--f-facade)" />
			<rect x="1996" y="-80" width="8" height="290" fill="var(--f-ink)" />
			<path d="M2004 -76 L2124 -40 L2004 -4 Z" fill="var(--f-red)" />
			<text
				x="2000"
				y="176"
				textAnchor="middle"
				fontSize="112"
				fontWeight="600"
				letterSpacing="28"
				fill="var(--f-ink)"
			>
				HOTEL KUBERNETES
			</text>

			<rect x="200" y="200" width="3600" height="1700" fill="var(--f-facade)" />
			<rect x="240" y="300" width="960" height="480" fill="url(#p-dots)" />
			<rect x="1240" y="300" width="960" height="480" fill="url(#p-tile)" />
			<rect x="240" y="860" width="1960" height="440" fill="url(#p-diamond)" />
			<rect x="240" y="1380" width="1960" height="520" fill="url(#p-stripe)" />
			<rect x="2600" y="300" width="1160" height="480" fill="var(--f-wall)" />
			<rect x="2600" y="860" width="1160" height="440" fill="var(--f-wall)" />
			<rect x="2600" y="1380" width="1160" height="520" fill="url(#p-stripe)" />
			<rect x="2240" y="300" width="320" height="1600" fill="var(--f-floor)" />

			<rect x="240" y="740" width="960" height="40" fill="var(--f-wood)" />
			<rect x="300" y="500" width="280" height="240" fill="var(--f-wood)" />
			<rect x="300" y="610" width="480" height="90" fill="var(--f-cream)" />
			<rect x="400" y="630" width="380" height="70" fill="var(--f-rose)" />
			<rect
				x="312"
				y="612"
				width="110"
				height="40"
				rx="8"
				fill="var(--f-cream)"
			/>
			<rect x="300" y="700" width="480" height="40" fill="var(--f-wood)" />
			<rect x="880" y="380" width="240" height="240" fill="var(--f-sky)" />
			<circle cx="1000" cy="470" r="44" fill="var(--f-gold)" />
			<rect
				x="880"
				y="380"
				width="240"
				height="240"
				fill="none"
				stroke="var(--f-cream)"
				strokeWidth="18"
			/>
			<rect x="994" y="380" width="12" height="240" fill="var(--f-cream)" />
			<Chair x={1130} y={740} />

			<rect x="1240" y="740" width="960" height="40" fill="var(--f-wood)" />
			<rect
				x="1360"
				y="600"
				width="420"
				height="140"
				rx="50"
				fill="var(--f-cream)"
			/>
			<rect x="1360" y="600" width="420" height="24" fill="var(--f-mint)" />
			<rect x="1400" y="726" width="30" height="24" fill="var(--f-gold)" />
			<rect x="1710" y="726" width="30" height="24" fill="var(--f-gold)" />
			<rect x="1560" y="520" width="8" height="90" fill="var(--f-gold)" />
			<circle
				cx="1980"
				cy="480"
				r="70"
				fill="var(--f-sky)"
				stroke="var(--f-gold)"
				strokeWidth="14"
			/>
			<rect x="1900" y="640" width="160" height="10" fill="var(--f-gold)" />
			<rect x="1930" y="650" width="100" height="70" fill="var(--f-rose)" />

			<rect x="240" y="1270" width="1960" height="30" fill="var(--f-red)" />
			<rect x="240" y="1270" width="1960" height="6" fill="var(--f-gold)" />
			<rect x="240" y="1294" width="1960" height="6" fill="var(--f-gold)" />
			{[500, 900, 1300, 1700, 2100].map((x, i) => (
				<Door key={x} x={x} y={1300} label={`10${i + 1}`} />
			))}
			{[700, 1100, 1500, 1900].map((x) => (
				<Sconce key={x} x={x} y={1010} />
			))}
			<g visibility={vis("corridor")}>
				{placementSets("corridor")}
				<g transform="translate(700 1300)">
					{dolly.map((cue) => (
						<animateTransform
							key={cue.index}
							attributeName="transform"
							type="translate"
							additive="sum"
							values={Array.from(
								{ length: Math.round(cue.shot.duration * 6) + 1 },
								(_, i) => `${(1000 * i) / Math.round(cue.shot.duration * 6)} 0`,
							).join(";")}
							calcMode="discrete"
							begin={sec(cue.start)}
							dur={sec(cue.shot.duration)}
							fill="freeze"
						/>
					))}
					<Figure
						x={0}
						y={0}
						{...CAST.otto}
						walk={
							dolly[0]
								? { begin: dolly[0].start, dur: dolly[0].shot.duration }
								: undefined
						}
					/>
				</g>
			</g>

			<rect x="240" y="1840" width="1960" height="60" fill="url(#p-check)" />
			<Sconce x={620} y={1520} />
			<Sconce x={1780} y={1520} />
			<rect x="1000" y="1396" width="400" height="36" fill="var(--f-cream)" />
			<text
				x="1200"
				y="1423"
				textAnchor="middle"
				fontSize="24"
				fontWeight="600"
				letterSpacing="6"
				fill="var(--f-ink)"
			>
				RÉCEPTION
			</text>
			<rect x="900" y="1440" width="600" height="200" fill="var(--f-wood)" />
			{Array.from({ length: 18 }, (_, i) => {
				const col = i % 6;
				const row = Math.floor(i / 6);
				return (
					<g key={`${col}-${row}`}>
						<rect
							x={912 + col * 98}
							y={1452 + row * 64}
							width="86"
							height="52"
							fill="var(--f-cream)"
						/>
						{(i * 7) % 3 === 0 && (
							<circle
								cx={955 + col * 98}
								cy={1478 + row * 64}
								r="9"
								fill="var(--f-gold)"
							/>
						)}
					</g>
				);
			})}
			<Chair x={700} y={1900} />
			<Chair x={1700} y={1900} />
			<Palm x={420} y={1900} />
			<Palm x={1980} y={1900} />
			<g visibility={vis("concierge")}>
				{placementSets("concierge")}
				<Figure x={1200} y={1900} {...CAST.concierge} />
			</g>
			<rect x="850" y="1700" width="700" height="200" fill="var(--f-wood)" />
			<rect x="830" y="1686" width="740" height="20" fill="var(--f-cream)" />
			<rect
				x="880"
				y="1740"
				width="640"
				height="120"
				fill="none"
				stroke="var(--f-gold)"
				strokeWidth="4"
			/>
			<path d="M1290 1686 A22 22 0 0 1 1334 1686 Z" fill="var(--f-gold)" />
			<rect x="1000" y="1672" width="100" height="14" fill="var(--f-red)" />
			<g visibility={vis("anna")}>
				{placementSets("anna")}
				<Figure x={1000} y={1900} {...CAST.anna} />
				{portraits.map((cue) => (
					<rect
						key={cue.index}
						x="982"
						y="1566"
						width="36"
						height="10"
						fill="var(--f-skin)"
						visibility="hidden"
					>
						<animate
							attributeName="visibility"
							values="visible;hidden"
							keyTimes="0;0.6"
							calcMode="discrete"
							begin={sec(cue.start + 0.9)}
							dur="0.3s"
							fill="remove"
						/>
					</rect>
				))}
			</g>
			<g visibility={vis("otto")}>
				{placementSets("otto")}
				<Figure x={1420} y={1900} {...CAST.otto} />
			</g>

			<rect x="2900" y="1420" width="560" height="50" fill="var(--f-rose)" />
			<text
				x="3180"
				y="1456"
				textAnchor="middle"
				fontSize="28"
				fontWeight="600"
				letterSpacing="10"
				fill="var(--f-cream)"
			>
				PÂTISSERIE
			</text>
			<rect x="2680" y="1520" width="1000" height="16" fill="var(--f-wood)" />
			<rect x="2680" y="1640" width="1000" height="16" fill="var(--f-wood)" />
			{[2700, 2810, 2920, 3240, 3350, 3460].map((x) => (
				<PastryBox key={x} x={x} y={1430} />
			))}
			{[2760, 2870, 3300, 3410, 3520].map((x) => (
				<PastryBox key={x} x={x} y={1550} />
			))}
			<rect x="2660" y="1720" width="1040" height="180" fill="var(--f-mint)" />
			<rect x="2640" y="1706" width="1080" height="20" fill="var(--f-cream)" />
			<PastryBox x={3120} y={1616} />
			<rect x="2680" y="900" width="1000" height="14" fill="var(--f-wood)" />
			<rect x="2680" y="1040" width="1000" height="14" fill="var(--f-wood)" />
			<rect x="2680" y="1180" width="1000" height="14" fill="var(--f-wood)" />
			{[914, 1054, 1194].map((y) =>
				[2700, 2960, 3220, 3480].map((x) => (
					<rect
						key={`${x}-${y}`}
						x={x}
						y={y}
						width="200"
						height="96"
						fill="url(#p-linen)"
					/>
				)),
			)}
			<circle
				cx="3180"
				cy="500"
				r="110"
				fill="var(--f-sky)"
				stroke="var(--f-cream)"
				strokeWidth="20"
			/>
			<rect x="3174" y="390" width="12" height="220" fill="var(--f-cream)" />
			<rect x="3070" y="494" width="220" height="12" fill="var(--f-cream)" />
			<rect x="2700" y="700" width="260" height="80" fill="var(--f-rose)" />
			<rect x="2740" y="630" width="180" height="70" fill="var(--f-gold)" />
			<rect x="2790" y="580" width="90" height="50" fill="var(--f-mint)" />
			<rect x="3560" y="300" width="10" height="480" fill="var(--f-wood)" />
			<rect x="3650" y="300" width="10" height="480" fill="var(--f-wood)" />
			{[360, 440, 520, 600, 680, 760].map((y) => (
				<rect
					key={y}
					x="3560"
					y={y}
					width="100"
					height="10"
					fill="var(--f-wood)"
				/>
			))}

			<rect x="2262" y="300" width="6" height="1600" fill="var(--f-gold)" />
			<rect x="2532" y="300" width="6" height="1600" fill="var(--f-gold)" />
			{[780, 1300, 1900].map((y) => (
				<rect
					key={y}
					x="2236"
					y={y - 470}
					width="328"
					height="470"
					fill="none"
					stroke="var(--f-gold)"
					strokeWidth="12"
				/>
			))}
			<path d="M2350 1372 A50 50 0 0 1 2450 1372 Z" fill="var(--f-cream)" />
			<g transform="translate(2400 1372)">
				<rect
					x="-3"
					y="-46"
					width="6"
					height="46"
					fill="var(--f-red)"
					transform="rotate(-62)"
				>
					{cranes.map((cue) => {
						const t = craneTiming(cue);
						return (
							<animateTransform
								key={cue.index}
								attributeName="transform"
								type="rotate"
								from="-62"
								to="0"
								begin={sec(t.begin)}
								dur={sec(t.dur)}
								calcMode={reduced ? "discrete" : "linear"}
								fill="freeze"
							/>
						);
					})}
				</rect>
			</g>
			<g>
				{cranes.map((cue) => {
					const t = craneTiming(cue);
					return (
						<animateTransform
							key={cue.index}
							attributeName="transform"
							type="translate"
							from="0 0"
							to={`0 ${-CAB_RISE}`}
							begin={sec(t.begin)}
							dur={sec(t.dur)}
							calcMode={reduced ? "discrete" : "linear"}
							fill="freeze"
						/>
					);
				})}
				<rect
					x="2270"
					y="1440"
					width="260"
					height="440"
					fill="var(--f-cream)"
				/>
				<rect
					x="2270"
					y="1440"
					width="260"
					height="440"
					fill="url(#p-grille)"
				/>
				<rect
					x="2270"
					y="1440"
					width="260"
					height="440"
					fill="none"
					stroke="var(--f-gold)"
					strokeWidth="10"
				/>
				<g visibility={vis("cab")}>
					{placementSets("cab")}
					<Figure x={2330} y={1874} scale={0.72} {...CAST.anna} />
					<Figure x={2400} y={1874} scale={0.72} {...CAST.concierge} />
					<Figure x={2470} y={1874} scale={0.72} {...CAST.otto} />
				</g>
			</g>

			<g transform="translate(3900 -1800)">
				<rect x="200" y="2100" width="1600" height="865" fill="var(--f-wood)" />
				<rect x="380" y="2200" width="1240" height="680" fill="var(--f-mint)" />
				<rect
					x="380"
					y="2200"
					width="1240"
					height="680"
					fill="none"
					stroke="var(--f-ink)"
					strokeWidth="14"
					opacity=".6"
				/>
				<g transform="translate(700 2470)">
					<circle r="76" fill="none" stroke="var(--f-gold)" strokeWidth="30" />
					<rect x="60" y="-18" width="330" height="36" fill="var(--f-gold)" />
					<rect x="300" y="18" width="34" height="60" fill="var(--f-gold)" />
					<rect x="356" y="18" width="34" height="42" fill="var(--f-gold)" />
					<path
						d="M-40 66 Q-120 130 -120 230"
						fill="none"
						stroke="var(--f-red)"
						strokeWidth="12"
					/>
					<rect x="-170" y="220" width="100" height="24" fill="var(--f-red)" />
					{[-166, -146, -126, -106, -86].map((x) => (
						<rect
							key={x}
							x={x}
							y="244"
							width="12"
							height="140"
							fill="var(--f-red)"
						/>
					))}
				</g>
				<rect
					x="1080"
					y="2290"
					width="360"
					height="250"
					fill="var(--f-cream)"
				/>
				<rect x="1370" y="2314" width="50" height="60" fill="var(--f-rose)" />
				<rect x="1120" y="2400" width="200" height="10" fill="var(--f-ink)" />
				<rect x="1120" y="2436" width="240" height="10" fill="var(--f-ink)" />
				<rect x="1120" y="2472" width="160" height="10" fill="var(--f-ink)" />
				<circle cx="1250" cy="2680" r="40" fill="var(--f-wood)" />
				<rect x="1180" y="2700" width="140" height="44" fill="var(--f-ink)" />
				<rect
					x="480"
					y="2760"
					width="280"
					height="28"
					rx="14"
					fill="var(--f-ink)"
				/>
				<rect x="700" y="2748" width="70" height="12" fill="var(--f-gold)" />
				<PastryBox x={1420} y={2600} size={160} />
				<g transform="translate(0 2980)">
					<g transform="translate(0 300)">
						{overheads.map((cue) => (
							<animateTransform
								key={cue.index}
								attributeName="transform"
								type="translate"
								from="0 300"
								to="0 -260"
								begin={sec(cue.start + 0.9)}
								dur="0.5s"
								calcMode={reduced ? "discrete" : "spline"}
								keyTimes="0;1"
								keySplines="0.3 0 0.2 1"
								fill="freeze"
							/>
						))}
						<Hand x={640} />
						<Hand x={1000} mirror />
					</g>
				</g>
			</g>

			<g transform="translate(1900 -800)">
				<rect
					x="2200"
					y="2100"
					width="1600"
					height="865"
					fill="var(--f-gold)"
				/>
				<rect
					x="2240"
					y="2140"
					width="1520"
					height="785"
					fill="none"
					stroke="var(--f-cream)"
					strokeWidth="6"
				/>
				<rect
					x="2256"
					y="2156"
					width="1488"
					height="753"
					fill="none"
					stroke="var(--f-cream)"
					strokeWidth="2"
				/>
				{cards.map((cue, i) => {
					const [eyebrow, ...rest] = cue.shot.action.includes(":")
						? cue.shot.action.split(":")
						: ["", cue.shot.action];
					const lines = wrapTitle(rest.join(":").trim().toUpperCase());
					const size = lines.some((line) => line.length > 12) ? 84 : 100;
					const lead = size * 1.1;
					const top = 2560 - ((lines.length - 1) * lead) / 2;
					return (
						<g key={cue.index} visibility={i ? "hidden" : "visible"}>
							{cards.map((other, j) => (
								<set
									key={other.index}
									attributeName="visibility"
									to={i === j ? "visible" : "hidden"}
									begin={sec(other.start)}
									fill="freeze"
								/>
							))}
							{eyebrow && (
								<text
									x="3000"
									y={top - lead - 10}
									textAnchor="middle"
									fontSize="40"
									fontWeight="500"
									letterSpacing="14"
									fill="var(--f-ink)"
								>
									{eyebrow.trim().toUpperCase()}
								</text>
							)}
							{lines.map((line, n) => (
								<text
									key={line}
									x="3000"
									y={top + n * lead}
									textAnchor="middle"
									fontSize={size}
									fontWeight="600"
									letterSpacing="-1"
									fill="var(--f-ink)"
								>
									{line}
								</text>
							))}
						</g>
					);
				})}
			</g>
		</g>
	);
}
