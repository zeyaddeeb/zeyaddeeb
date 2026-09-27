import { money } from "./format";

export interface ScoreRow {
	label: string;
	total: number | null;
	note?: string;
	tone: "line" | "ink";
}

export interface Meter {
	used: number;
	cap: number;
}

function share(value: number, max: number): string {
	return `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`;
}

export function Score({
	rows,
	carbon,
	verdict,
	won,
}: {
	rows: ScoreRow[];
	carbon: Meter | null;
	verdict: string;
	won: boolean;
}) {
	const max = Math.max(...rows.map((r) => r.total ?? 0), 1);
	return (
		<div className="cc-score">
			<dl>
				{rows.map((row) => (
					<div
						key={row.label}
						className="cc-bar"
						data-tone={row.tone}
						data-hidden={row.total === null || undefined}
					>
						<dt>{row.label}</dt>
						<dd className="cc-bar-track">
							<span
								style={{
									width: row.total === null ? "100%" : share(row.total, max),
								}}
							/>
						</dd>
						<dd className="cc-bar-value">
							{row.total === null ? "?" : money(row.total)}
							{row.note ? <small>{row.note}</small> : null}
						</dd>
					</div>
				))}
				{carbon ? (
					<div
						className="cc-bar"
						data-tone="carbon"
						data-over={carbon.used > carbon.cap + 1e-6 || undefined}
					>
						<dt>CO₂</dt>
						<dd className="cc-bar-track">
							<span style={{ width: share(carbon.used, carbon.cap) }} />
						</dd>
						<dd className="cc-bar-value">
							{carbon.used.toFixed(1)} / {carbon.cap} t
						</dd>
					</div>
				) : null}
			</dl>
			<p className="cc-verdict" data-won={won || undefined}>
				{verdict}
			</p>
		</div>
	);
}
