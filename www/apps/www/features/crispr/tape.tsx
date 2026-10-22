"use client";

import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import type { Only, Side, Variant } from "./alleles";
import { type Guide, PAM, SPACER } from "./guides";
import { LOCUS } from "./locus-data";

export type Marker = "cut" | "nick" | "second" | "window";

const MARKER_CLASS: Record<Marker, string> = {
	cut: "cr-cut",
	nick: "cr-nick",
	second: "cr-nick cr-nick--second",
	window: "",
};

export interface Pick {
	guide: Guide;
	at: number;
	only: Only | null;
	window: readonly [number, number] | null;
	said: string;
}

interface TapeProps {
	mutant: string;
	normal: string;
	variant: Variant;
	picks: Pick[];
	chosen: number;
	onChoose: (index: number) => void;
	marker: Marker;
	label: string;
	anchor: number | null;
	center: number | null;
}

const COPIES: { side: Side; label: string; note: string }[] = [
	{ side: "mutant", label: "Tumor copy", note: "the letter that drives it" },
	{
		side: "normal",
		label: "Healthy copy",
		note: "every other cell in the body",
	},
];

const STEP = 34;
const TAP = 6;

const nearestTo = (picks: Pick[], at: number) => {
	let best = 0;
	let gap = Number.POSITIVE_INFINITY;

	for (let i = 0; i < picks.length; i++) {
		const distance = Math.abs(picks[i].at - at);

		if (distance < gap) {
			gap = distance;
			best = i;
		}
	}

	return best;
};

const byPosition = (picks: Pick[]) =>
	picks.map((_, index) => index).sort((a, b) => picks[a].at - picks[b].at);

export function Tape({
	mutant,
	normal,
	variant,
	picks,
	chosen,
	onChoose,
	marker,
	label,
	anchor,
	center,
}: TapeProps) {
	const reel = useRef<HTMLDivElement>(null);
	const drag = useRef<{ id: number; x: number; from: number } | null>(null);
	const [span, setSpan] = useState(48);
	const picked = picks[chosen];
	const total = mutant.length;

	useEffect(() => {
		const node = reel.current;

		if (!node) return;

		const watch = new ResizeObserver(([entry]) => {
			const pitch = Number.parseFloat(
				getComputedStyle(node).getPropertyValue("--cr-pitch"),
			);

			if (pitch > 0)
				setSpan(Math.max(24, Math.floor(entry.contentRect.width / pitch)));
		});

		watch.observe(node);

		return () => watch.disconnect();
	}, []);

	const middle = center ?? (picked ? picked.at : total / 2);
	const half = span / 2;
	const shift = Math.min(Math.max(middle - half, 0), Math.max(total - span, 0));

	const move = (event: ReactPointerEvent<HTMLDivElement>) => {
		const held = drag.current;

		if (!held || held.id !== event.pointerId) return;

		const order = byPosition(picks);
		const rank = order.indexOf(held.from);
		const steps = Math.round((event.clientX - held.x) / STEP);
		const next = order[Math.min(Math.max(rank + steps, 0), order.length - 1)];

		if (next !== undefined && next !== chosen) onChoose(next);
	};

	const grab = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!picked) return;

		drag.current = { id: event.pointerId, x: event.clientX, from: chosen };
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const release = (event: ReactPointerEvent<HTMLDivElement>) => {
		const held = drag.current;

		if (held?.id !== event.pointerId) return;

		drag.current = null;

		if (Math.abs(event.clientX - held.x) > TAP || !reel.current) return;

		const box = reel.current.getBoundingClientRect();
		const pitch = Number.parseFloat(
			getComputedStyle(reel.current).getPropertyValue("--cr-pitch"),
		);

		onChoose(
			nearestTo(picks, shift + (event.clientX - box.left) / Math.max(pitch, 1)),
		);
	};

	const step = (by: number) =>
		onChoose(Math.min(Math.max(chosen + by, 0), picks.length - 1));

	return (
		<div className="cr-tape">
			<div className="cr-map" aria-hidden="true">
				{picks.map((pick, index) => (
					<button
						key={`${pick.guide.strand}:${pick.guide.start}`}
						type="button"
						className="cr-map__site"
						data-only={pick.only ?? undefined}
						data-on={index === chosen}
						style={{ "--at": pick.at / total } as CSSProperties}
						onClick={() => onChoose(index)}
						tabIndex={-1}
					/>
				))}
				<span
					className="cr-map__codon"
					style={
						{
							"--at": LOCUS.codon12 / total,
							"--wide": 6 / total,
						} as CSSProperties
					}
				/>
				<span
					className="cr-map__view"
					style={
						{ "--at": shift / total, "--wide": span / total } as CSSProperties
					}
				/>
			</div>

			<div className="cr-labels" aria-hidden="true">
				{COPIES.map(({ side, label }) => (
					<p key={side} data-side={side}>
						<span className="cr-labels__name">{label}</span>
					</p>
				))}
			</div>

			<div
				className="cr-reel"
				ref={reel}
				onPointerDown={grab}
				onPointerMove={move}
				onPointerUp={release}
				onPointerCancel={release}
				style={{ "--shift": shift } as CSSProperties}
			>
				<div
					className="cr-track"
					role="slider"
					tabIndex={0}
					aria-label={label}
					aria-valuemin={1}
					aria-valuemax={picks.length}
					aria-valuenow={chosen + 1}
					aria-valuetext={picked ? picked.said : undefined}
					onKeyDown={(event) => {
						if (event.key === "ArrowRight") {
							event.preventDefault();
							step(1);
						}

						if (event.key === "ArrowLeft") {
							event.preventDefault();
							step(-1);
						}
					}}
				>
					{picked ? (
						<div
							className="cr-guide"
							data-strand={picked.guide.strand}
							data-only={picked.only ?? undefined}
							style={
								{
									"--from": Math.min(picked.guide.start, picked.guide.pamStart),
									"--len": SPACER + PAM,
									"--pam": picked.guide.pamStart,
								} as CSSProperties
							}
						>
							<span className="cr-guide__spacer" />
							<span className="cr-guide__pam" />
						</div>
					) : null}

					{picked?.window ? (
						<span
							className="cr-window"
							style={
								{
									"--from": picked.window[0],
									"--len": picked.window[1] - picked.window[0] + 1,
								} as CSSProperties
							}
						/>
					) : null}

					{anchor !== null ? (
						<span
							className="cr-nick"
							style={{ "--at": anchor } as CSSProperties}
						/>
					) : null}

					{picked && marker !== "window" ? (
						<span
							className={MARKER_CLASS[marker]}
							style={{ "--at": picked.at } as CSSProperties}
						/>
					) : null}

					<span
						className="cr-mark"
						style={{ "--at": variant.offset } as CSSProperties}
					/>

					{COPIES.map(({ side }) => {
						const seq = side === "mutant" ? mutant : normal;

						return (
							<div className="cr-copy" key={side} data-side={side}>
								<p className="cr-copy__seq">
									{[...seq].map((base, index) => (
										<span
											key={`${side}-${index}`}
											className="cr-base"
											data-base={base}
											data-changed={index === variant.offset}
											style={{ "--i": index } as CSSProperties}
										>
											{base}
										</span>
									))}
								</p>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
