"use client";

import type { RefObject } from "react";
import { Glyph } from "./glyph";
import { type TuneId, tunes } from "./music/tunes";

interface MediaPlayerProps {
	tune: TuneId;
	playing: boolean;
	rate: number;
	bars: RefObject<HTMLCanvasElement | null>;
	onPlay: () => void;
	onStop: () => void;
	onPick: (id: TuneId) => void;
	onSkip: (by: number) => void;
	onRate: (rate: number) => void;
}

export function MediaPlayer({
	tune,
	playing,
	rate,
	bars,
	onPlay,
	onStop,
	onPick,
	onSkip,
	onRate,
}: MediaPlayerProps) {
	const now = tunes.find((entry) => entry.id === tune) ?? tunes[0];

	return (
		<div className="dd-player">
			<div className="dd-player__screen">
				<canvas ref={bars} className="dd-player__bars" />
				<p className="dd-player__now">
					<span className="dd-player__file">{now.file}</span>
					<span className="dd-player__tempo">
						{Math.round(now.bpm * rate)} beats a minute
					</span>
				</p>
			</div>

			<ul className="dd-player__list" aria-label="Playlist">
				{tunes.map((entry) => (
					<li key={entry.id}>
						<button
							type="button"
							className="dd-player__row"
							aria-pressed={entry.id === tune}
							onClick={() => onPick(entry.id)}
						>
							<Glyph name="note" size={12} />
							<span>{entry.file}</span>
							<span className="dd-player__bpm">{entry.bpm}</span>
						</button>
					</li>
				))}
			</ul>

			<div className="dd-player__deck">
				<button
					type="button"
					className="dd-button dd-player__play"
					aria-label={playing ? "Pause" : "Play"}
					onClick={playing ? onStop : onPlay}
				>
					<Glyph name={playing ? "pause" : "play"} />
				</button>
				<button
					type="button"
					className="dd-button"
					aria-label="Previous tune"
					onClick={() => onSkip(-1)}
				>
					<Glyph name="back" size={14} />
				</button>
				<button
					type="button"
					className="dd-button"
					aria-label="Next tune"
					onClick={() => onSkip(1)}
				>
					<Glyph name="next" size={14} />
				</button>
				<label className="dd-player__speed">
					<span>Play speed</span>
					<input
						type="range"
						min={0.5}
						max={1.5}
						step={0.01}
						value={rate}
						onChange={(event) => onRate(Number(event.target.value))}
						onDoubleClick={() => onRate(1)}
						aria-valuetext={`${Math.round(rate * 100)} percent`}
					/>
					<span className="dd-player__percent">{Math.round(rate * 100)}%</span>
				</label>
			</div>
		</div>
	);
}
