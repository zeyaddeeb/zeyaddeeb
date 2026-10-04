"use client";

import { useEffect, useRef } from "react";
import { SPECTRUM } from "./spectrum-data";
import "./sheet.css";

const W = 640;
const TOP_H = 300;
const LOW_H = 150;
const PAD_L = 56;
const PAD_R = 16;
const NU_MIN = 2;
const NU_MAX = 22;
const SKY_MAX = 420;
const RES_MAX = 500;
const T_CMB = 2.72548;
const H = 6.62607015e-34;
const K = 1.380649e-23;
const C = 2.99792458e8;

function planck(nuInvCm: number, t: number) {
	const nu = nuInvCm * C * 100;
	const x = (H * nu) / (K * t);

	return ((2 * H * nu ** 3) / C ** 2 / Math.expm1(x)) * 1e20;
}

const TOP_PLOT = TOP_H - 40;
const LOW_PLOT = LOW_H - 34;
export const ZOOM = Math.round(
	((SKY_MAX * 1000) / (2 * RES_MAX)) * (LOW_PLOT / TOP_PLOT),
);

const x = (nu: number) =>
	PAD_L + ((nu - NU_MIN) / (NU_MAX - NU_MIN)) * (W - PAD_L - PAD_R);

function TopChart() {
	const y = (v: number) => 12 + (1 - v / SKY_MAX) * TOP_PLOT;
	let d = "";

	for (let i = 0; i <= 200; i++) {
		const nu = NU_MIN + ((NU_MAX - NU_MIN) * i) / 200;

		d += `${i ? "L" : "M"}${x(nu).toFixed(1)} ${y(planck(nu, T_CMB)).toFixed(1)}`;
	}

	return (
		<svg
			className="hc-chart"
			viewBox={`0 0 ${W} ${TOP_H}`}
			role="img"
			aria-label="FIRAS sky brightness against frequency, sitting on a 2.725 kelvin blackbody curve."
		>
			{[0, 100, 200, 300, 400].map((v) => (
				<g key={v}>
					<line
						className="hc-chart__grid"
						x1={PAD_L}
						x2={W - PAD_R}
						y1={y(v)}
						y2={y(v)}
					/>
					<text
						className="hc-chart__tick"
						x={PAD_L - 8}
						y={y(v) + 4}
						textAnchor="end"
					>
						{v}
					</text>
				</g>
			))}
			{[5, 10, 15, 20].map((nu) => (
				<text
					key={nu}
					className="hc-chart__tick"
					x={x(nu)}
					y={TOP_H - 10}
					textAnchor="middle"
				>
					{nu}
				</text>
			))}
			<path className="hc-chart__curve" d={d} />
			{SPECTRUM.map((p) => (
				<rect
					key={p.nu}
					className="hc-chart__point"
					x={x(p.nu) - 3.5}
					y={y(p.sky) - 3.5}
					width="7"
					height="7"
				/>
			))}
			<text className="hc-chart__label" x={PAD_L + 8} y="26">
				Brightness (MJy/sr)
			</text>
		</svg>
	);
}

function LowChart() {
	const y = (v: number) => 10 + (1 - (v + RES_MAX) / (2 * RES_MAX)) * LOW_PLOT;

	return (
		<svg
			className="hc-chart"
			viewBox={`0 0 ${W} ${LOW_H}`}
			role="img"
			aria-label="The gap between FIRAS and the curve: every point lands within its error bar of zero."
		>
			{[-500, -250, 0, 250, 500].map((v) => (
				<g key={v}>
					<line
						className={v === 0 ? "hc-chart__zero" : "hc-chart__grid"}
						x1={PAD_L}
						x2={W - PAD_R}
						y1={y(v)}
						y2={y(v)}
					/>
					<text
						className="hc-chart__tick"
						x={PAD_L - 8}
						y={y(v) + 4}
						textAnchor="end"
					>
						{v}
					</text>
				</g>
			))}
			{[5, 10, 15, 20].map((nu) => (
				<text
					key={nu}
					className="hc-chart__tick"
					x={x(nu)}
					y={LOW_H - 6}
					textAnchor="middle"
				>
					{nu}
				</text>
			))}
			{SPECTRUM.map((p) => (
				<g key={p.nu}>
					<line
						className="hc-chart__bar"
						x1={x(p.nu)}
						x2={x(p.nu)}
						y1={y(Math.min(RES_MAX, p.residual + p.sigma))}
						y2={y(Math.max(-RES_MAX, p.residual - p.sigma))}
					/>
					<rect
						className="hc-chart__point"
						x={x(p.nu) - 3}
						y={y(p.residual) - 3}
						width="6"
						height="6"
					/>
				</g>
			))}
			<text className="hc-chart__label" x={PAD_L + 8} y="22">
				Gap from the curve (kJy/sr)
			</text>
		</svg>
	);
}

export function ChartSheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const sheet = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const d = sheet.current;

		if (!d) return;

		if (open && !d.open) d.showModal();
		if (!open && d.open) d.close();
	}, [open]);

	useEffect(() => {
		const d = sheet.current;

		if (!d) return;

		const closed = () => onClose();
		const backdrop = (e: MouseEvent) => {
			if (e.target === d) d.close();
		};

		d.addEventListener("close", closed);
		d.addEventListener("click", backdrop);

		return () => {
			d.removeEventListener("close", closed);
			d.removeEventListener("click", backdrop);
		};
	}, [onClose]);

	return (
		<dialog ref={sheet} className="hc-sheet" aria-labelledby="hc-sheet-title">
			<header className="hc-sheet__head">
				<h2 id="hc-sheet-title">The most perfect glow ever measured</h2>
				<button
					type="button"
					className="hc-sheet__close"
					aria-label="Close"
					onClick={() => sheet.current?.close()}
				>
					<svg viewBox="0 0 20 20" aria-hidden="true">
						<path d="M3 3 L17 17 M17 3 L3 17" />
					</svg>
				</button>
			</header>
			<div className="hc-sheet__body">
				<p>
					In January 1990, John Mather showed the first FIRAS result to a
					meeting of the American Astronomical Society. It came from nine
					minutes of data, and every point sat on a blackbody curve. The room
					stood up and applauded.
				</p>
				<p>
					This is the final version, from the whole mission. The squares are
					what FIRAS measured; the line is a perfect glow at 2.725 degrees above
					absolute zero. On the top chart the error bars are thinner than the
					line.
				</p>
				<figure className="hc-sheet__fig">
					<TopChart />
					<LowChart />
					<figcaption>
						Frequency, in waves per centimeter. Bottom: the gap between each
						point and the curve, zoomed in {ZOOM} times, with each point’s error
						bar. Every point lands within its error bar. The bars grow at high
						frequencies, where the glow is faint; near the peak each point is
						pinned down to a few parts in 100,000.
					</figcaption>
				</figure>
				<p className="hc-sheet__source">
					Data: Fixsen and colleagues, 1996, from NASA’s LAMBDA archive.
				</p>
			</div>
		</dialog>
	);
}
