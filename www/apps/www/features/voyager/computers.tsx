"use client";

import type { CSSProperties } from "react";
import { Pointing } from "./aacs";
import { fix } from "./ephemeris";
import { MEMORY_BYTES, MODEL_BYTES } from "./facts";
import { ChipRescue } from "./fds";

export interface Computer {
	id: string;
	name: string;
	job: string;
	word: number;
	words: number;
	memory: string;
	band?: "blue" | "red";
}

export const computers: Computer[] = [
	{
		id: "CCS",
		name: "Computer Command Subsystem",
		job: "Runs the stored sequences, decodes commands from Earth and watches for faults.",
		word: 18,
		words: 4096,
		memory: "plated wire",
	},
	{
		id: "AACS",
		name: "Attitude and Articulation Control Subsystem",
		job: "Keeps the dish on Earth with a Sun sensor, a star tracker and hydrazine thrusters.",
		word: 18,
		words: 4096,
		memory: "plated wire",
		band: "blue",
	},
	{
		id: "FDS",
		name: "Flight Data Subsystem",
		job: "Collects instrument and engineering data and formats it into telemetry frames.",
		word: 16,
		words: 8192,
		memory: "CMOS",
		band: "red",
	},
];

export const totalBytes = computers.reduce(
	(sum, c) => sum + (c.word * c.words * 2) / 8,
	0,
);

const CHIPS = 32;
const DEAD = 21;

const bytesOf = (c: Computer) => (c.word * c.words) / 8;

const units = computers.flatMap((c) =>
	[1, 2].map((n) => ({ id: `${c.id} ${n}`, pair: c, bytes: bytesOf(c) })),
);

const deadAt =
	(units.slice(0, 4).reduce((sum, u) => sum + u.bytes, 0) +
		(bytesOf(computers[2]) * (DEAD + 0.5)) / CHIPS) /
	totalBytes;

const fmt = (n: number) => n.toLocaleString("en-US");

function Scale() {
	const ratio = MODEL_BYTES / MEMORY_BYTES;
	const whole = Math.floor(ratio);
	const part = ratio - whole;

	return (
		<figcaption className="vg-mem__scale" data-reveal="">
			<p className="vg-mem__compare">
				The 3D model on this page is{" "}
				<strong>
					{fmt(MODEL_BYTES)}
					{" "}bytes
				</strong>
				, {ratio.toFixed(1)} times the memory of all six{" "}computers.
			</p>
			<div className="vg-mem__squares">
				<div className="vg-mem__row" aria-hidden="true">
					{Array.from({ length: whole }, (_, i) => (
						<i
							key={i}
							className="vg-mem__sq"
							data-gold={i === 0 ? "true" : undefined}
						/>
					))}
					{part > 0.02 ? (
						<i
							className="vg-mem__sq"
							style={{ "--part": part.toFixed(3) } as CSSProperties}
							data-part="true"
						/>
					) : null}
				</div>
				<p className="vg-caption">
					<i className="vg-mem__key" aria-hidden="true" />
					All six computers. Each square is {fmt(MEMORY_BYTES)}
					{"\u00a0"}bytes.
				</p>
			</div>
		</figcaption>
	);
}

export function Chips() {
	const columns = units.map((u) => `${u.bytes}fr`).join(" ");
	const pairs = computers.map((c) => `${bytesOf(c) * 2}fr`).join(" ");

	const label = `Memory to scale. ${computers
		.map((c) => `${c.id} 1 and 2, ${fmt(bytesOf(c))} bytes each`)
		.join("; ")}. Chip ${DEAD} of ${CHIPS} in an FDS failed in November 2023.`;

	return (
		<figure className="vg-mem">
			<div
				className="vg-mem__figure"
				data-reveal=""
				style={
					{
						"--units": columns,
						"--pairs": pairs,
						"--dead": deadAt.toFixed(5),
					} as CSSProperties
				}
			>
				<div className="vg-mem__top">
					<p className="vg-eyebrow">Memory, to scale</p>
					<p className="vg-caption vg-mem__total">
						{fmt(totalBytes)}
						{" "}bytes in all
					</p>
					<p className="vg-mem__fail" aria-hidden="true">
						Failed Nov 2023
					</p>
				</div>
				<div className="vg-mem__bar" role="img" aria-label={label}>
					{units.map((u) => (
						<span
							key={u.id}
							className="vg-mem__unit"
							data-pair={u.pair.id.toLowerCase()}
						>
							<span className="vg-mem__name">{u.id}</span>
							<span className="vg-mem__bytes">{fmt(u.bytes)} B</span>
							{u.id === "FDS 1" ? (
								<i
									className="vg-mem__dead"
									style={{ "--at": DEAD / CHIPS } as CSSProperties}
								/>
							) : null}
						</span>
					))}
				</div>
				<ul className="vg-mem__legend" aria-hidden="true">
					{computers.map((c) => (
						<li key={c.id} data-pair={c.id.toLowerCase()} data-band={c.band}>
							{c.id}
						</li>
					))}
				</ul>
				<ul className="vg-mem__tiles">
					{computers.map((c) => (
						<li
							key={c.id}
							className="vg-mem__tile"
							data-pair={c.id.toLowerCase()}
							data-band={c.band}
						>
							<p className="vg-mem__title">
								{c.id} · {c.name}
							</p>
							<p className="vg-mem__job">{c.job}</p>
							<p className="vg-mem__spec">
								<span>2 × {fmt(c.words)} words ·</span>{" "}
								<span>{c.word}-bit ·</span> <span>{c.memory}</span>
							</p>
						</li>
					))}
				</ul>
			</div>
			<Scale />
		</figure>
	);
}

export function Rescue({ watts }: { watts: number }) {
	const light = fix(Date.UTC(2024, 3, 18)).lightSeconds / 3600;

	return <ChipRescue watts={watts} light={light} />;
}

export { Pointing };
