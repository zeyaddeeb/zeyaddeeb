"use client";

import {
	type CallId,
	type Calls,
	type Caption,
	type RecordId,
	records,
} from "./tune";

type Lineup = Calls["lineup"];

interface DeskProps {
	state: Calls;
	player: string;
	pending: CallId | null;
	caption: Caption;
	onCall: (id: CallId) => void;
	onLineup: (lineup: Lineup) => void;
}

interface Option {
	label: string;
	sub?: string;
	on: boolean;
	pending?: boolean;
	act: () => void;
}

export function deskSummary(state: Calls, player: string) {
	const tempo = { medium: "120", drag: "76, slow", stomp: "184, fast" }[
		state.tempo
	];

	const rhythm = {
		four: "four to the bar",
		two: "two-beat",
		stop: "stop time",
	}[state.rhythm];

	const who = {
		trade: `trading with ${player}`,
		lead: "the tune",
		everybody: "everybody in",
		clarinet: "clarinet solo",
		answer: "call and answer",
	}[state.lineup];

	return `${tempo} · ${state.swing ? "swing" : "straight"} · ${rhythm} · ${who}`;
}

export function BandDesk({
	state,
	player,
	pending,
	caption,
	onCall,
	onLineup,
}: DeskProps) {
	const set = (on: boolean, id: CallId) => () => {
		if (!on) onCall(id);
	};

	const tempo: Option[] = [
		{
			label: "Slow drag",
			sub: "76",
			on: state.tempo === "drag",
			pending: pending === "drag",
			act: set(state.tempo === "drag", "drag"),
		},
		{
			label: "Medium",
			sub: "120",
			on: state.tempo === "medium",
			act: () => {
				if (state.tempo !== "medium") onCall(state.tempo);
			},
		},
		{
			label: "Stomp",
			sub: "184",
			on: state.tempo === "stomp",
			pending: pending === "stomp",
			act: set(state.tempo === "stomp", "stomp"),
		},
	];

	const feel: Option[] = [
		{
			label: "Straight",
			on: !state.swing,
			act: () => {
				if (state.swing) onCall("swing");
			},
		},
		{
			label: "Swing",
			on: state.swing,
			pending: pending === "swing",
			act: set(state.swing, "swing"),
		},
	];

	const rhythm: Option[] = [
		{
			label: "Four",
			on: state.rhythm === "four",
			act: () => {
				if (state.rhythm !== "four") onCall(state.rhythm);
			},
		},
		{
			label: "Two-beat",
			on: state.rhythm === "two",
			pending: pending === "two",
			act: set(state.rhythm === "two", "two"),
		},
		{
			label: "Stop time",
			on: state.rhythm === "stop",
			pending: pending === "stop",
			act: set(state.rhythm === "stop", "stop"),
		},
	];

	const who: Option[] = (
		[
			["trade", "Trade fours", player],
			["lead", "The tune", "cornet"],
			["everybody", "Everybody", "three horns"],
			["clarinet", "Clarinet solo", "Dodds’s part"],
			["answer", "Call and answer", "cornet, clarinet"],
		] as const
	).map(([id, label, sub]) => ({
		label,
		sub,
		on: state.lineup === id,
		pending: pending === id,
		act: () => onLineup(id),
	}));

	const extras: Option[] = [
		{
			label: "Blue notes",
			sub: "bend the thirds",
			on: state.blue,
			pending: pending === "blue",
			act: () => onCall("blue"),
		},
		{
			label: "Break",
			sub: "band stops, bars 11–12",
			on: state.break,
			pending: pending === "break",
			act: () => onCall("break"),
		},
	];

	return (
		<section className="jz-desk" aria-label="Lead the band">
			<Row label="Tempo" options={tempo} />
			<Row label="Feel" options={feel} />
			<Row label="Rhythm" options={rhythm} />
			<Row label="Who plays" options={who} wide />
			<Row label="Extras" options={extras} toggles />
			<p className="jz-desk-note" aria-live="polite">
				{caption.shout ? <b>“{caption.shout}” </b> : null}
				{caption.text}
			</p>
		</section>
	);
}

function Row({
	label,
	options,
	wide,
	toggles,
}: {
	label: string;
	options: Option[];
	wide?: boolean;
	toggles?: boolean;
}) {
	return (
		<div className="jz-desk-row" data-wide={wide || undefined}>
			<p className="jz-eyebrow">{label}</p>
			<div className="jz-desk-options" data-toggles={toggles || undefined}>
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						aria-pressed={o.on}
						data-pending={o.pending || undefined}
						onClick={o.act}
					>
						{toggles ? <i aria-hidden="true" /> : null}
						<span>{o.label}</span>
						{o.sub ? <small>{o.sub}</small> : null}
					</button>
				))}
			</div>
		</div>
	);
}

export function Cue({
	caption,
	onRecord,
}: {
	caption: Caption;
	onRecord: (id: RecordId) => void;
}) {
	const record = records.find((r) => r.id === caption.record);

	return (
		<div className="jz-caption" aria-live="polite">
			<div className="jz-caption-head">
				{caption.shout ? <p className="jz-shout">“{caption.shout}”</p> : null}
				{record ? (
					<button
						type="button"
						className="jz-hear"
						aria-label={`Hear the ${record.year} record, ${record.title}`}
						onClick={() => onRecord(record.id)}
					>
						<span className="jz-hear-disc" aria-hidden="true" />
						<span className="jz-hear-words">Hear the </span>
						{record.year}
						<span className="jz-hear-words"> record</span>
					</button>
				) : null}
			</div>
			<p className="jz-caption-text">{caption.text}</p>
		</div>
	);
}
