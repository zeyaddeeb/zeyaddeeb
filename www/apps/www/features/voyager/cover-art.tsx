import {
	full,
	line as lineTime,
	type Pulsar,
	pulsars,
	rotation,
	side,
} from "./cover";

export type Diagram = "speed" | "length" | "picture" | "pulsars" | "hydrogen";

export const REC = { x: 262, y: 300, r: 117 };
export const MAP = { x: 308, y: 739, l: 417 };
export const RING = { r: 130, start: -10, step: 10.3, bits: full(rotation) };
export const TURN_MS = 3600;

type Mark = { d: string; w?: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

const ring = (cx: number, cy: number, r: number) =>
	`M${r1(cx - r)} ${r1(cy)}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0`;

const box = (x: number, y: number, w: number, h: number) =>
	`M${x} ${y}h${w}v${h}h${-w}z`;

function row(bits: string, x: number, y: number, step: number): Mark[] {
	return [...bits].map((b, i) => {
		const cx = x + i * step;

		return {
			d:
				b === "1"
					? `M${r1(cx)} ${y - 5} V${y + 5}`
					: `M${r1(cx - step * 0.34)} ${y} H${r1(cx + step * 0.34)}`,
		};
	});
}

export function ringAngle(i: number) {
	return RING.start - i * RING.step;
}

const ringBits: Mark[] = [...RING.bits].map((b, i) => {
	const a = (ringAngle(i) * Math.PI) / 180;
	const { x, y } = REC;
	const r = RING.r;

	if (b === "1") {
		return {
			d: `M${r1(x + Math.cos(a) * (r - 7))} ${r1(y + Math.sin(a) * (r - 7))} L${r1(x + Math.cos(a) * (r + 7))} ${r1(y + Math.sin(a) * (r + 7))}`,
		};
	}

	const a0 = a - 0.055;
	const a1 = a + 0.055;

	return {
		d: `M${r1(x + Math.cos(a0) * r)} ${r1(y + Math.sin(a0) * r)} A${r} ${r} 0 0 1 ${r1(x + Math.cos(a1) * r)} ${r1(y + Math.sin(a1) * r)}`,
	};
});

const plan = {
	base: [{ d: ring(REC.x, REC.y, REC.r) }],
	spin: [{ d: ring(REC.x, REC.y, 22) }, { d: ring(REC.x, REC.y, 5) }] as Mark[],
	mark: `M${REC.x} ${REC.y - 30} V${REC.y - 70}`,
	head: `M${REC.x} ${REC.y - RING.r - 12} L${REC.x - 5} ${REC.y - RING.r - 21} H${REC.x + 5} Z`,
	arm: [
		{
			d: "M367 262h9a3 3 0 0 1 3 3v46a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-46a3 3 0 0 1 3-3z",
		},
		{ d: "M368 272 H375 M368 300 H375 M371 314 V320" },
	] as Mark[],
};

const sideBits = full(side);

const length = {
	base: [
		{ d: "M150 512 H388", w: 4 },
		{ d: "M262 520 V566 M368 520 V566" },
		...[
			sideBits.slice(0, 9),
			sideBits.slice(9, 19),
			sideBits.slice(19, 29),
			sideBits.slice(29, 39),
			sideBits.slice(39),
		].flatMap((bits, i) => row(bits, 272, 530 + i * 11, 10.2)),
	] as Mark[],
	needle: [{ d: "M372 482 h14 v14 h-14 z M379 496 V510" }] as Mark[],
};

function wave(x0: number, x1: number, seed: number) {
	const pts: string[] = [];

	for (let x = x0; x <= x1; x += 2.5) {
		const t = (x - x0) / (x1 - x0);
		const env = Math.sin(t * Math.PI) * 18 + 6;

		const n =
			Math.sin(x * 0.9 + seed) * 0.5 +
			Math.sin(x * 0.37 + seed * 2) * 0.35 +
			Math.sin(x * 2.1 + seed * 3) * 0.3;

		pts.push(`${r1(x)} ${r1(228 - env - n * 12)}`);
	}

	return pts.join(" L");
}

function pictureMarks(): Mark[] {
	const burst: string[] = [];

	for (let i = 0; i <= 12; i++)
		burst.push(`${480 + i * 5} ${i % 2 ? 205 : 245}`);

	const lines = [
		[572, 640],
		[656, 736],
		[748, 830],
	];

	const labels = ["1", "10", "11"];
	const bits = full(lineTime);

	return [
		{ d: `M${burst.join(" L")} L548 225 V250 H566 V232` },
		...lines.map(([a, b], i) => ({
			d: `M${a} 232 L${wave(a + 4, b - 4, i * 1.7)} L${b} 232 V250 H${b + 12} V232`,
		})),
		...lines.flatMap(([a, b], i) => row(labels[i], (a + b) / 2 - 4, 186, 9)),
		{ d: "M575 262 V294 M675 262 V294" },
		...row(bits.slice(0, 12), 583, 270, 7.6),
		...row(bits.slice(12, 20), 583, 280, 7.6),
		...row(bits.slice(20), 598, 290, 7.6),
		{ d: "M591 323 L638 385 L672 328 L729 393 L755 328 L818 396 L841 331" },
		...[
			[599, 333],
			[610, 347],
			[694, 342],
			[704, 354],
			[768, 342],
			[778, 355],
		].map(([cx, cy]) => ({ d: ring(cx, cy, 4.5) })),
		...row("1", 620, 314, 9),
		...row("10", 704, 314, 9),
		...row("11", 782, 314, 9),
		{ d: box(594, 432, 133, 99) },
		...Array.from({ length: 11 }, (_, i) => ({
			d: `M${r1(598 + i * 2.8)} 434 V529`,
			w: 1.2,
		})),
		...row("10", 598, 424, 8),
		...[..."1000000000"].map((b, i) => ({
			d:
				b === "1"
					? "M716 388 H728"
					: `M722 ${r1(393 + i * 3.4)} V${r1(395.4 + i * 3.4)}`,
		})),
		{ d: box(594, 552, 133, 94) },
		{ d: ring(660, 599, 33) },
	];
}

const picture = pictureMarks();

export function pulsarEnd(p: Pulsar, scale = 1) {
	const a = (p.angle * Math.PI) / 180;
	const len = p.length * MAP.l * scale;

	return { x: MAP.x + Math.cos(a) * len, y: MAP.y + Math.sin(a) * len, a, len };
}

function pulsarMarks(p: Pulsar): Mark[] {
	const { a, len } = pulsarEnd(p);
	const c = Math.cos(a);
	const s = Math.sin(a);
	const n = p.bits.length;
	const step = Math.min(6.2, (len - 24) / n);
	const start = len - n * step;

	return [
		{
			d: `M${MAP.x} ${MAP.y} L${r1(MAP.x + c * start)} ${r1(MAP.y + s * start)}`,
			w: 1.2,
		},
		...[...p.bits].map((b, i) => {
			const d = start + (i + 0.5) * step;
			const x = MAP.x + c * d;
			const y = MAP.y + s * d;

			return b === "1"
				? {
						d: `M${r1(x - s * 4)} ${r1(y + c * 4)} L${r1(x + s * 4)} ${r1(y - c * 4)}`,
					}
				: {
						d: `M${r1(x - c * step * 0.3)} ${r1(y - s * step * 0.3)} L${r1(x + c * step * 0.3)} ${r1(y + s * step * 0.3)}`,
						w: 3,
					};
		}),
	];
}

const galaxy: Mark = { d: `M${MAP.x} ${MAP.y} H${MAP.x + MAP.l}` };
const pulsarSets = pulsars.map((p) => ({ id: p.id, marks: pulsarMarks(p) }));

const atoms = [633, 714];
const hydrogen = {
	base: [
		...atoms.flatMap((cx) => [
			{ d: ring(cx, 855, 21.6) },
			{ d: `M${cx} 862 V848` },
		]),
		{ d: `M${atoms[0]} 829 V842` },
		{ d: "M655 855 H692 M674 855 V862" },
	] as Mark[],
	flip: [{ d: `M${atoms[1]} 829 V842` }] as Mark[],
};

function Paths({ marks }: { marks: Mark[] }) {
	return (
		<>
			{marks.map((m) => (
				<path key={m.d} d={m.d} strokeWidth={m.w} />
			))}
		</>
	);
}

function Plan() {
	return (
		<g className="vg-d" data-d="speed">
			<Paths marks={plan.base} />
			<g className="vg-spin">
				<Paths marks={plan.spin} />
				<path className="vg-spin__mark" d={plan.mark} />
				{ringBits.map((m, i) => (
					<path key={m.d} className="vg-bit" data-i={i} d={m.d} />
				))}
			</g>
			<path className="vg-readhead" d={plan.head} />
			<Paths marks={plan.arm} />
		</g>
	);
}

function Length() {
	return (
		<g className="vg-d" data-d="length">
			<Paths marks={length.base} />
			<g className="vg-needle">
				<Paths marks={length.needle} />
			</g>
		</g>
	);
}

function Pulsars({ picked }: { picked: string | null }) {
	return (
		<g className="vg-d" data-d="pulsars">
			<Paths marks={[galaxy]} />
			{pulsarSets.map((p) => (
				<g
					key={p.id}
					className="vg-pulsar"
					data-on={picked === p.id ? "true" : undefined}
				>
					<Paths marks={p.marks} />
				</g>
			))}
		</g>
	);
}

function Hydrogen() {
	return (
		<g className="vg-d" data-d="hydrogen">
			<Paths marks={hydrogen.base} />
			<g className="vg-flip" style={{ transformOrigin: `${atoms[1]}px 855px` }}>
				<Paths marks={hydrogen.flip} />
			</g>
		</g>
	);
}

export function Cover({
	active,
	picked,
}: {
	active: Diagram;
	picked: string | null;
}) {
	return (
		<svg
			className="vg-cover"
			viewBox="0 0 1000 1000"
			data-active={active}
			aria-hidden="true"
		>
			<defs>
				<radialGradient id="vg-gold" cx="36%" cy="30%" r="80%">
					<stop offset="0" stopColor="#f6dc93" />
					<stop offset="0.35" stopColor="#d9a746" />
					<stop offset="0.7" stopColor="#a8741f" />
					<stop offset="1" stopColor="#6e4a12" />
				</radialGradient>
				<linearGradient id="vg-sheen" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0.2" stopColor="#fff6d6" stopOpacity="0" />
					<stop offset="0.45" stopColor="#fff6d6" stopOpacity="0.22" />
					<stop offset="0.55" stopColor="#fff6d6" stopOpacity="0" />
				</linearGradient>
			</defs>
			<circle cx="500" cy="500" r="480" fill="url(#vg-gold)" />
			<g className="vg-cover__brush">
				{Array.from({ length: 46 }, (_, i) => (
					<circle key={i} cx="500" cy="500" r={40 + i * 9.6} />
				))}
			</g>
			<circle
				cx="500"
				cy="500"
				r="480"
				fill="url(#vg-sheen)"
				className="vg-cover__sheen"
			/>
			<circle cx="500" cy="500" r="476" className="vg-cover__rim" />
			<circle cx="500" cy="500" r="15" className="vg-cover__hole" />
			<circle cx="500" cy="500" r="7" fill="#2a1d08" />
			<g className="vg-etch">
				<Plan />
				<Length />
				<g className="vg-d" data-d="picture">
					<Paths marks={picture} />
				</g>
				<Pulsars picked={picked} />
				<Hydrogen />
			</g>
		</svg>
	);
}

export const etchMarks = (): Mark[] => [
	...plan.base,
	...plan.spin,
	...ringBits,
	...plan.arm,
	...length.base,
	...length.needle,
	...picture,
	galaxy,
	...pulsarSets.flatMap((p) => p.marks),
	...hydrogen.base,
	...hydrogen.flip,
];

export function paintEtch(
	ctx: CanvasRenderingContext2D,
	size: number,
	color = "#fff4d2",
) {
	ctx.save();
	ctx.scale(size / 1000, size / 1000);
	ctx.strokeStyle = color;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	for (const m of etchMarks()) {
		ctx.lineWidth = m.w ?? 2.4;
		ctx.stroke(new Path2D(m.d));
	}

	ctx.restore();
}

export function paintCover(ctx: CanvasRenderingContext2D, size: number) {
	ctx.save();
	ctx.scale(size / 1000, size / 1000);

	const gold = ctx.createRadialGradient(366, 308, 0, 366, 308, 768);

	gold.addColorStop(0, "#f6dc93");
	gold.addColorStop(0.35, "#d9a746");
	gold.addColorStop(0.7, "#a8741f");
	gold.addColorStop(1, "#6e4a12");
	ctx.fillStyle = gold;
	ctx.beginPath();
	ctx.arc(500, 500, 480, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "rgb(255 243 207 / 4.5%)";
	ctx.lineWidth = 3;

	for (let i = 0; i < 46; i++) {
		ctx.beginPath();
		ctx.arc(500, 500, 40 + i * 9.6, 0, Math.PI * 2);
		ctx.stroke();
	}

	ctx.strokeStyle = "rgb(91 60 12 / 55%)";
	ctx.lineWidth = 6;
	ctx.beginPath();
	ctx.arc(500, 500, 476, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = "#b98a35";
	ctx.strokeStyle = "#6e4a12";
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.arc(500, 500, 15, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = "#2a1d08";
	ctx.beginPath();
	ctx.arc(500, 500, 7, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
	paintEtch(ctx, size);
}

export function Disc() {
	return (
		<svg
			className="vg-cover vg-disc"
			viewBox="0 0 1000 1000"
			aria-hidden="true"
		>
			<defs>
				<radialGradient id="vg-gold-disc" cx="40%" cy="34%" r="80%">
					<stop offset="0" stopColor="#f3d27c" />
					<stop offset="0.5" stopColor="#c8912f" />
					<stop offset="1" stopColor="#6e4a12" />
				</radialGradient>
				<path
					id="vg-deadwax"
					d="M500 500 m-150 0 a150 150 0 1 1 300 0 a150 150 0 1 1 -300 0"
				/>
			</defs>
			<circle cx="500" cy="500" r="480" fill="url(#vg-gold-disc)" />
			<g className="vg-grooves">
				{Array.from({ length: 70 }, (_, i) => (
					<circle
						key={i}
						cx="500"
						cy="500"
						r={176 + i * 4.3}
						data-band={i % 23 === 0 ? "true" : undefined}
					/>
				))}
			</g>
			<circle cx="500" cy="500" r="120" fill="#e9c46a" />
			<circle cx="500" cy="500" r="120" fill="none" className="vg-disc__edge" />
			<text className="vg-deadwax">
				<textPath href="#vg-deadwax" startOffset="2%">
					To the makers of music – all worlds, all times
				</textPath>
			</text>
			<text textAnchor="middle" className="vg-disc__title">
				<tspan x="500" y="440">
					The Sounds
				</tspan>
				<tspan x="500" y="470">
					of Earth
				</tspan>
			</text>
			<text textAnchor="middle" className="vg-disc__sub">
				<tspan x="500" y="548">
					United States of America
				</tspan>
				<tspan x="500" y="567">
					Planet Earth
				</tspan>
			</text>
			<circle cx="500" cy="500" r="15" fill="#2a1d08" />
		</svg>
	);
}
