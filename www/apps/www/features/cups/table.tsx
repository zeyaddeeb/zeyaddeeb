"use client";

import type { CSSProperties } from "react";
import { ReservedText } from "@/components/reserved-text";
import { lane } from "./copy";
import type { Belief } from "./follow";
import { CUPS, PAIRS } from "./task";

const SLOTS = Array.from({ length: CUPS }, (_, i) => i);
const LANE_SAMPLES = [
	lane(4, 1),
	lane(4, 0.28),
	"waking up",
	"not asked",
	"thinking",
];

interface TableProps {
	order: readonly number[];
	ball: number;
	picked: number | null;
	last: { pair: number; n: number } | null;
	notes: Belief | null;
	once: Belief | null;
	words: Belief | null;
	asked: boolean;
	layers: number;
	locked: boolean;
	onCup: (slot: number) => void;
}

function Lane({
	who,
	name,
	short,
	detail,
	belief,
	idle = "waking up",
}: {
	who: "notes" | "once" | "words";
	name: string;
	short: string;
	detail: string;
	belief: Belief | null;
	idle?: string;
}) {
	return (
		<div className="sw-lane" data-who={who}>
			<p className="sw-lane__label">
				<span className="sw-lane__mark" aria-hidden="true" />
				<span className="sw-lane__name" data-short={short}>
					<span className="sw-full">{name}</span>
				</span>
				<span className="sw-lane__detail">{detail}</span>
				<span className="sw-lane__pick">
					<ReservedText
						text={
							belief ? lane(belief.pick, belief.probs[belief.pick] ?? 0) : idle
						}
						samples={LANE_SAMPLES}
					/>
				</span>
			</p>
			{SLOTS.map((slot) => (
				<span
					key={slot}
					className="sw-bar"
					data-pick={belief?.pick === slot || undefined}
					style={{ "--p": belief?.probs[slot] ?? 0 } as CSSProperties}
				/>
			))}
		</div>
	);
}

export function Table({
	order,
	ball,
	picked,
	last,
	notes,
	once,
	words,
	asked,
	layers,
	locked,
	onCup,
}: TableProps) {
	const [a, b] = last ? (PAIRS[last.pair] ?? [-1, -1]) : [-1, -1];

	return (
		<div className="sw-table">
			<Lane
				who="notes"
				name="Writes it down"
				short="Notes"
				detail="1 layer"
				belief={notes}
			/>
			<Lane
				who="once"
				name="Answers at once"
				short="At once"
				detail={`${layers} ${layers === 1 ? "layer" : "layers"}`}
				belief={once}
			/>
			<Lane
				who="words"
				name="Thinks in words"
				short="Words"
				detail="Qwen3.5-4B"
				belief={words}
				idle={asked ? "thinking" : "not asked"}
			/>
			<div className="sw-cups">
				{order.map((physical, slot) => {
					const hop = last !== null && slot === Math.max(a, b);

					return (
						<span
							key={physical}
							className="sw-cup"
							data-picked={picked === slot || undefined}
							style={{ "--slot": slot } as CSSProperties}
							aria-hidden="true"
						>
							<span
								key={hop ? `hop-${last?.n}` : "rest"}
								className="sw-cup__body"
								data-hop={hop || undefined}
							>
								{physical === ball ? <span className="sw-ball" /> : null}
								<svg
									viewBox="0 0 100 104"
									className="sw-cup__shape"
									aria-hidden="true"
								>
									<path d="M6 102 V50 A44 44 0 0 1 94 50 V102 Z" />
								</svg>
							</span>
						</span>
					);
				})}
				{SLOTS.map((slot) => (
					<button
						key={slot}
						type="button"
						className="sw-slot"
						style={{ "--slot": slot } as CSSProperties}
						aria-pressed={picked === slot}
						aria-label={`Cup ${slot + 1}`}
						aria-keyshortcuts={String(slot + 1)}
						disabled={locked}
						onClick={() => onCup(slot)}
					/>
				))}
			</div>
			<p className="sw-numbers" aria-hidden="true">
				{SLOTS.map((slot) => (
					<span key={slot}>{slot + 1}</span>
				))}
			</p>
		</div>
	);
}
