"use client";

import { useEffect, useRef, useState } from "react";
import { type RecordId, type Recording, records } from "./tune";

interface CrateProps {
	request: { id: RecordId; n: number } | null;
	silence: number;
	onPlaying: (playing: boolean) => void;
}

export function Crate({ request, silence, onPlaying }: CrateProps) {
	return (
		<section className="jz-crate" aria-label="The records">
			<h2 className="jz-eyebrow">The records</h2>
			<div className="jz-crate-list">
				{records.map((record) => (
					<Record
						key={record.id}
						record={record}
						request={request?.id === record.id ? request.n : 0}
						silence={silence}
						onPlaying={onPlaying}
					/>
				))}
			</div>
		</section>
	);
}

function Record({
	record,
	request,
	silence,
	onPlaying,
}: {
	record: Recording;
	request: number;
	silence: number;
	onPlaying: (playing: boolean) => void;
}) {
	const audio = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (silence) audio.current?.pause();
	}, [silence]);

	useEffect(() => {
		if (!request) return;

		audio.current?.play().catch(() => setFailed(true));
	}, [request]);

	const toggle = () => {
		const el = audio.current;

		if (!el) return;

		if (el.paused) el.play().catch(() => setFailed(true));
		else el.pause();
	};

	return (
		<figure className="jz-record">
			<button
				type="button"
				className="jz-record-play"
				aria-pressed={playing}
				onClick={toggle}
			>
				<span
					className="jz-record-disc"
					aria-hidden="true"
					data-spin={playing || undefined}
				/>
				<span>
					<b>{record.title}</b>
					<small>
						{playing ? "Playing" : failed ? "Didn’t load" : "Play"} ·{" "}
						{record.year}
					</small>
				</span>
			</button>
			<div className="jz-record-bar" aria-hidden="true">
				<i style={{ transform: `scaleX(${progress})` }} />
			</div>
			<figcaption>
				{record.credit}{" "}
				<a href={record.page} target="_blank" rel="noreferrer">
					Public domain, Wikimedia Commons ↗
				</a>
			</figcaption>
			{/* biome-ignore lint/a11y/useMediaCaption: a 1920s record with no published transcript */}
			<audio
				ref={audio}
				src={record.src}
				preload="none"
				onPlay={() => {
					setPlaying(true);
					onPlaying(true);
				}}
				onPause={() => {
					setPlaying(false);
					onPlaying(false);
				}}
				onEnded={() => setProgress(0)}
				onError={() => setFailed(true)}
				onTimeUpdate={(event) => {
					const el = event.currentTarget;

					if (el.duration) setProgress(el.currentTime / el.duration);
				}}
			/>
		</figure>
	);
}
