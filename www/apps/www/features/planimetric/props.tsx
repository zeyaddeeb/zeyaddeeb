import { sec } from "./screenplay";

type Hat = "pillbox" | "cap" | "brim";

export function Figure({
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

export const CAST = {
	anna: { coat: "var(--f-gold)", hat: "brim" as Hat },
	otto: { coat: "var(--f-mint)", hat: "pillbox" as Hat },
	concierge: { coat: "var(--f-ink)", hat: "cap" as Hat },
};

export function Door({ x, y, label }: { x: number; y: number; label: string }) {
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

export function Sconce({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect x="-6" y="0" width="12" height="40" fill="var(--f-gold)" />
			<path d="M-30 0 A30 30 0 0 1 30 0 Z" fill="var(--f-cream)" />
		</g>
	);
}

export function Palm({ x, y }: { x: number; y: number }) {
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

export function PastryBox({
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

export function Chair({ x, y }: { x: number; y: number }) {
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

export function Hand({ x, mirror = false }: { x: number; mirror?: boolean }) {
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
