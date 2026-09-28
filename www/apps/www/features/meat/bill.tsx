"use client";

import { useState } from "react";
import { answer } from "./answer";
import { bill, breakEven, span, words } from "./meat";
import { Callout } from "./stick";

const answerWords = words(answer).length;
const even = breakEven(answerWords);

const stops: [number, string][] = [
	[1, "a DM"],
	[2, "a group DM"],
	[3, "a group DM"],
	[5, "a standup"],
	[8, "a standup"],
	[12, "your team"],
	[25, "your team’s channel"],
	[60, "the engineering channel"],
	[150, "Dunbar’s number"],
	[400, "the whole office"],
	[1000, "the whole company"],
	[4000, "#general"],
	[10000, "#general at a big company"],
];

interface Frame {
	w: number;
	h: number;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	k: number;
}

const wide: Frame = { w: 640, h: 352, x0: 70, x1: 612, y0: 28, y1: 300, k: 1 };
const narrow: Frame = {
	w: 360,
	h: 300,
	x0: 50,
	x1: 344,
	y0: 20,
	y1: 250,
	k: 0.8,
};

const lo = Math.log10(60);
const hi = Math.log10(2_400_000);
const round = (v: number) => Math.round(v * 10) / 10;

function scales(f: Frame) {
	const X = (n: number) => round(f.x0 + (Math.log10(n) / 4) * (f.x1 - f.x0));
	const Y = (s: number) =>
		round(f.y1 - ((Math.log10(s) - lo) / (hi - lo)) * (f.y1 - f.y0));
	const samples = Array.from({ length: 41 }, (_, i) => 10 ** (i / 10));
	const line = (pick: (n: number) => number) =>
		samples.map((n) => `${X(n)},${Y(pick(n))}`).join(" ");
	return {
		X,
		Y,
		paste: line((n) => bill(n, answerWords).paste),
		digest: line((n) => bill(n, answerWords).digest),
	};
}

const yTicks: [number, string][] = [
	[60, "1 min"],
	[600, "10 min"],
	[3600, "1 hour"],
	[28800, "1 day"],
	[144000, "1 week"],
	[1440000, "10 weeks"],
];

const xTicks = [1, 10, 100, 1000, 10000];

function Graph({ f, readers }: { f: Frame; readers: number }) {
	const { X, Y, paste, digest } = scales(f);
	const b = bill(readers, answerWords);
	const x = X(readers);
	const yp = Y(b.paste);
	const yd = Y(b.digest);
	const top = Math.min(yp, yd);
	const cx = X(even);
	const cy = Y(bill(even, answerWords).paste);
	const tagP = 1400;
	const tagD = 900;
	return (
		<svg
			viewBox={`0 0 ${f.w} ${f.h}`}
			className="mc-graph"
			role="img"
			aria-label={`Total reading time against channel size. Pasting to ${readers} readers costs ${span(b.paste)}; reading first costs ${span(b.digest)}.`}
		>
			{yTicks.map(([s, label]) => (
				<g key={label}>
					<line
						x1={f.x0}
						x2={f.x1}
						y1={Y(s)}
						y2={Y(s)}
						className="mc-graph__grid"
					/>
					<text
						x={f.x0 - 8}
						y={Y(s) + 4}
						textAnchor="end"
						className="mc-graph__tick"
					>
						{label}
					</text>
				</g>
			))}
			{xTicks.map((n) => (
				<text
					key={n}
					x={X(n)}
					y={f.y1 + 20}
					textAnchor="middle"
					className="mc-graph__tick"
				>
					{n.toLocaleString("en-US")}
				</text>
			))}
			<text
				x={(f.x0 + f.x1) / 2}
				y={f.y1 + 42}
				textAnchor="middle"
				className="mc-graph__axis-name"
			>
				people in the channel
			</text>
			<path
				d={`M${f.x0} ${f.y0 - 8} V${f.y1} H${f.x1 + 8}`}
				className="mc-graph__axis"
			/>
			<polyline points={paste} className="mc-graph__line is-claude" />
			<polyline points={digest} className="mc-graph__line is-person" />
			<text
				x={X(tagP) - 8}
				y={Y(bill(tagP, answerWords).paste) - 12}
				textAnchor="end"
				className="mc-graph__name is-claude"
			>
				paste it
			</text>
			<text
				x={f.k < 1 ? X(150) : X(tagD) + 6}
				y={Y(bill(f.k < 1 ? 150 : tagD, answerWords).digest) + 28}
				className="mc-graph__name is-person"
			>
				read it, then write
			</text>
			<Callout
				x={cx}
				y={cy - 8}
				tx={f.x0 + 22 * f.k}
				ty={f.y0 + 64 * f.k}
				anchor="start"
			>
				{`break-even: ${even.toFixed(1)} readers`}
			</Callout>
			<circle cx={cx} cy={cy} r={5} className="mc-graph__even" />
			<line
				x1={x}
				x2={x}
				y1={f.y1}
				y2={top - 14}
				className="mc-graph__marker"
			/>
			<circle cx={x} cy={yp} r={6} className="mc-graph__dot is-claude" />
			<circle cx={x} cy={yd} r={6} className="mc-graph__dot is-person" />
		</svg>
	);
}

export function Bill() {
	const [index, setIndex] = useState(5);
	const [readers, name] = stops[index];
	const b = bill(readers, answerWords);
	const cheaper = b.digest < b.paste;

	return (
		<div className="mc-bill">
			<div className="mc-bill__head">
				<label htmlFor="mc-readers" className="mc-bill__count">
					<b>{readers.toLocaleString("en-US")}</b>{" "}
					{readers === 1 ? "reader" : "readers"}
					<span> · {name}</span>
				</label>
				<input
					id="mc-readers"
					type="range"
					min={0}
					max={stops.length - 1}
					step={1}
					value={index}
					onChange={(e) => setIndex(Number(e.target.value))}
				/>
			</div>
			<dl className="mc-bill__read">
				<div className="mc-bill__item">
					<dt>
						<i className="is-claude" /> Paste it
					</dt>
					<dd>{span(b.paste)}</dd>
				</div>
				<div className="mc-bill__item">
					<dt>
						<i className="is-person" /> Read it, then write
					</dt>
					<dd>{span(b.digest)}</dd>
				</div>
			</dl>
			<div className="mc-graph__wide">
				<Graph f={wide} readers={readers} />
			</div>
			<div className="mc-graph__narrow">
				<Graph f={narrow} readers={readers} />
			</div>
			<p className="mc-bill__verdict">
				{cheaper
					? `Pasting costs everyone ${span(b.paste - b.digest)} more, ${(b.paste / b.digest).toFixed(1)}× the reading.`
					: `Pasting saves ${span(b.digest - b.paste)}. Under ${even.toFixed(1)} readers, it’s the cheaper option.`}
			</p>
		</div>
	);
}
