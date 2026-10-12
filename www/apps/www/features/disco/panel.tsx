"use client";

import type { KeyboardEvent, RefObject } from "react";
import { ReservedText } from "@/components/reserved-text";
import { Cards } from "./cards";
import { type FilmId, filmed, MOST, tones } from "./film";
import type { Reading } from "./floor";
import { CAPTIONS, caption, drift, HELD, HOWS, how, TROUBLE } from "./story";

interface PanelProps {
	scope: RefObject<HTMLCanvasElement | null>;
	readings: Reading[];
	picked: FilmId;
	playing: boolean;
	tapping: boolean;
	held: boolean;
	trouble: boolean;
	tempo: number;
	onPick: (id: FilmId) => void;
	onAsk: (move: number) => void;
	onTap: () => void;
	onRest: () => void;
}

const SLOTS = Array.from({ length: MOST }, (_, i) => i);

function headline(props: PanelProps, lead: Reading) {
	if (props.trouble) return TROUBLE;

	return props.held ? HELD : caption(lead, props.playing);
}

export function Panel(props: PanelProps) {
	const { scope, readings, picked, playing, tapping, tempo } = props;
	const lead = readings.find((reading) => reading.id === picked) ?? readings[0];

	const key = (event: KeyboardEvent) => {
		if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;

		event.preventDefault();
		props.onTap();
	};

	return (
		<aside className="dd-panel" aria-label="Keeping time">
			<div className="dd-panel__head">
				<h2 className="dd-label">Keeping time</h2>
				<p className="dd-caption" aria-live="polite">
					<ReservedText text={headline(props, lead)} samples={CAPTIONS} />
				</p>
			</div>

			<div className="dd-scope">
				<ul className="dd-lanes">
					<li className="dd-lane" data-kind="music">
						<span className="dd-lane__name">
							{tapping ? "Your taps" : "Music"}
						</span>
						<span className="dd-lane__note">
							{playing ? `${Math.round(tempo)} beats a minute` : "not playing"}
						</span>
					</li>
					{SLOTS.map((slot) => {
						const reading = readings[slot];

						if (!reading)
							return (
								<li className="dd-lane" data-kind="empty" key={slot}>
									<span className="dd-lane__note">room for one more</span>
								</li>
							);

						return (
							<li className="dd-lanes__pick" key={slot}>
								<button
									type="button"
									className="dd-lane"
									aria-pressed={reading.id === lead.id}
									style={{ borderLeftColor: tones[reading.id] }}
									onClick={() => props.onPick(reading.id)}
								>
									<span className="dd-lane__name">
										{filmed(reading.id).name}
									</span>
									<span className="dd-lane__note">
										<ReservedText text={how(reading, playing)} samples={HOWS} />
									</span>
									<span className="dd-lane__drift">{drift(reading)}</span>
								</button>
							</li>
						);
					})}
				</ul>
				<canvas
					ref={scope}
					className="dd-scope__trace"
					role="img"
					aria-label="The last few seconds: a mark for each beat of the music, taller on every fourth, and a mark each time a dancer starts a new move."
				/>
			</div>

			<Cards reading={lead} onAsk={props.onAsk} />

			<div className="dd-tapper">
				<button
					type="button"
					className="dd-tap"
					onPointerDown={props.onTap}
					onKeyDown={key}
				>
					Tap a beat
				</button>
				<button
					type="button"
					className="dd-rest"
					onClick={props.onRest}
					disabled={!tapping}
				>
					Stop
				</button>
			</div>
		</aside>
	);
}
