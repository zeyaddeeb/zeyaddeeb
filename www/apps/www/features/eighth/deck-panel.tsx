"use client";

import { useState } from "react";
import { FIG_5A, ORDER, striped } from "./card";
import { pct } from "./copy";
import { adjust, type Deck, MOST, PRESETS, predictions } from "./deck";
import { Ring } from "./ring";

function Sign({ plus }: { plus: boolean }) {
	return (
		<svg viewBox="0 0 10 10" className="me-sign" aria-hidden="true">
			<rect x="1" y="4.25" width="8" height="1.5" />
			{plus ? <rect x="4.25" y="1" width="1.5" height="8" /> : null}
		</svg>
	);
}

function Stepper({
	count,
	onChange,
	className,
	name,
}: {
	count: number;
	onChange: (by: number) => void;
	className: string;
	name: string;
}) {
	return (
		<div className={className}>
			<button
				type="button"
				aria-label={`One fewer ${name}`}
				disabled={count <= -MOST}
				onClick={() => onChange(-1)}
			>
				<Sign plus={false} />
			</button>
			<output className="me-step__count">{count}</output>
			<button
				type="button"
				aria-label={`One more ${name}`}
				disabled={count >= MOST}
				onClick={() => onChange(1)}
			>
				<Sign plus />
			</button>
		</div>
	);
}

const nameOf = (card: number) =>
	striped(card)
		? "striped card"
		: `half card ${(ORDER as readonly number[]).indexOf(card) + 1}`;

export function DeckPanel({
	deck,
	onChange,
	disabled,
	line,
}: {
	deck: Deck;
	onChange: (deck: Deck) => void;
	disabled: boolean;
	line: string;
}) {
	const [picked, setPicked] = useState<number>(FIG_5A);
	const [, at30, at60] = predictions(deck);
	const change = (card: number) => (by: number) =>
		onChange(adjust(deck, card, by));
	const slots = (cards: readonly number[]) =>
		cards.map((card) => {
			const n = deck[card] ?? 0;

			return (
				<div
					key={card}
					className="me-card"
					data-anti={n < 0 || undefined}
					data-empty={n === 0 || undefined}
				>
					<button
						type="button"
						className="me-card__pick"
						aria-pressed={picked === card}
						aria-label={`${nameOf(card)}, ${n} in the deck`}
						onClick={() => setPicked(card)}
					>
						<Ring card={card} anti={n < 0} />
						<span className="me-card__badge" aria-hidden="true">
							{n}
						</span>
					</button>
					<Stepper
						className="me-step"
						count={n}
						name={nameOf(card)}
						onChange={change(card)}
					/>
				</div>
			);
		});
	const count = deck[picked] ?? 0;

	return (
		<div className="me-deck" data-disabled={disabled || undefined}>
			<p className="me-deck__line">
				{disabled ? (
					line
				) : at30 === null ? (
					"A deck needs more cards than anti-cards."
				) : (
					<>
						This deck predicts <b>{pct(at30)}</b> at 30° and <b>{pct(at60)}</b>{" "}
						at 60°.
					</>
				)}
			</p>
			<div className="me-deck__cards" inert={disabled}>
				<div className="me-deck__group" data-group="halves">
					<span className="me-deck__label">Half cards · 2/3 at 30°</span>
					<div className="me-deck__row">
						{slots(ORDER.filter((c) => !striped(c)))}
					</div>
				</div>
				<div className="me-deck__group" data-group="stripes">
					<span className="me-deck__label">Stripes · 0 at 30°</span>
					<div className="me-deck__row">{slots(ORDER.filter(striped))}</div>
				</div>
				<div className="me-presets">
					{PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className="me-preset"
							onClick={() => onChange(preset.deck)}
						>
							{preset.label}
						</button>
					))}
				</div>
				<div className="me-tune" data-anti={count < 0 || undefined}>
					<Ring
						card={picked}
						anti={count < 0}
						className="me-ring me-tune__ring"
					/>
					<span className="me-tune__name">
						{striped(picked) ? "Stripe" : "Half card"}
						<span className="me-tune__note">
							{count < 0 ? " · anti-card" : ""}
						</span>
					</span>
					<Stepper
						className="me-step me-tune__step"
						count={count}
						name={nameOf(picked)}
						onChange={change(picked)}
					/>
				</div>
			</div>
		</div>
	);
}
