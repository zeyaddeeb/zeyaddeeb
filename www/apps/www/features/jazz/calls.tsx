"use client";

import {
	type CallId,
	type Calls,
	type Caption,
	calls,
	isOn,
	type RecordId,
	records,
} from "./tune";

interface CallsProps {
	state: Calls;
	caption: Caption;
	pending: CallId | null;
	onCall: (id: CallId) => void;
	onRecord: (id: RecordId) => void;
}

const rows = [
	{ id: "feel", label: "Feel" },
	{ id: "band", label: "Band" },
	{ id: "rhythm", label: "Rhythm" },
] as const;

export function CallBoard({
	state,
	caption,
	pending,
	onCall,
	onRecord,
}: CallsProps) {
	const record = records.find((r) => r.id === caption.record);
	return (
		<section className="jz-calls" aria-label="Call out a change">
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
			{rows.map((row) => (
				<div key={row.id} className="jz-call-row">
					<p className="jz-eyebrow">{row.label}</p>
					<div className="jz-call-buttons">
						{calls
							.filter((c) => c.row === row.id)
							.map((c) => (
								<button
									key={c.id}
									type="button"
									className="jz-call"
									data-call={c.id}
									aria-pressed={isOn(state, c.id)}
									data-pending={pending === c.id || undefined}
									onClick={() => onCall(c.id)}
								>
									{c.shout}
								</button>
							))}
					</div>
				</div>
			))}
		</section>
	);
}
