"use client";

import { useMemo, useState } from "react";
import { duration } from "./format";
import { Ladder } from "./ladder";
import { Library } from "./library";
import { NotebookPage } from "./page";
import type { About } from "./protocol";
import { Quilt } from "./quilt";
import { Arms, Letter, Tiles } from "./record";
import { figure } from "./strip";
import { StripView } from "./strip-view";
import { type Connection, useNow, useShift } from "./use-shift";
import { useTranscript } from "./use-transcript";
import { archivedView, liveView } from "./view";
import "./shift.css";

const CONNECTION: Record<Connection, string> = {
	waking: "Connecting",
	live: "Live",
	reconnecting: "Reconnecting",
	paused: "Paused",
	closed: "Closed",
	off: "Offline",
};

function mind(about: About | null): string {
	if (!about) return "—";
	const name = about.model.split("/").at(-1) ?? about.model;
	return `${name} · 4 CPU cores`;
}

function Calibrated({ about }: { about: About | null }) {
	if (!about) return <dd>—</dd>;
	const passed = about.calibration.filter((c) => c.passed).length;
	const all = about.calibration.length;
	return (
		<dd>
			<details
				className="ns-calibration"
				data-failed={passed < all || undefined}
			>
				<summary>
					{passed} of {all} checks
				</summary>
				<div className="ns-calibration-panel">
					<p className="ns-eyebrow">
						Checked at startup against published values
					</p>
					<ul>
						{about.calibration.map((c) => (
							<li key={c.name} data-passed={c.passed || undefined}>
								<span>{c.name}</span>
								<span>
									{c.measured} <small>expected {c.expected}</small>
								</span>
							</li>
						))}
					</ul>
				</div>
			</details>
		</dd>
	);
}

function Head({
	awake,
	episodes,
	about,
	connection,
}: {
	awake: string | null;
	episodes: number | null;
	about: About | null;
	connection: Connection;
}) {
	const off = about?.mode === "off";
	return (
		<header className="ns-head">
			<blockquote className="ns-quote">
				<p>
					If I were to awaken after having slept for a thousand years, my first
					question would be: has the Riemann hypothesis been proven?
				</p>
				<cite>David Hilbert</cite>
			</blockquote>
			<p className="ns-answer" id="ns-title">
				Not yet<span className="ns-stop">.</span>
			</p>
			<dl className="ns-vitals">
				<div>
					<dt>
						{off ? "Status" : about?.mode === "watched" ? "Works" : "Awake"}
					</dt>
					<dd className="ns-vital-status">
						{off
							? "Off shift"
							: about?.mode === "watched"
								? "While watched"
								: (awake ?? "—")}
					</dd>
				</div>
				<div>
					<dt>Episodes</dt>
					<dd className="ns-vital-count">{episodes ?? "—"}</dd>
				</div>
				<div>
					<dt>Mind</dt>
					<dd>{mind(about)}</dd>
				</div>
				<div>
					<dt>Checker</dt>
					<dd>
						{about ? `Lean ${about.lean} · Mathlib ${about.mathlib}` : "—"}
					</dd>
				</div>
				<div>
					<dt>Instruments</dt>
					<Calibrated about={about} />
				</div>
				<div>
					<dt>Feed</dt>
					<dd className="ns-vital-feed" data-connection={connection}>
						{CONNECTION[connection]}
					</dd>
				</div>
			</dl>
		</header>
	);
}

function Pager({
	viewing,
	latest,
	off,
	onFlip,
}: {
	viewing: number | null;
	latest: number;
	off: boolean;
	onFlip: (number: number | null) => void;
}) {
	const older = viewing === null ? (off ? latest - 1 : latest) : viewing - 1;
	const newer = viewing === null || viewing + 1 > latest ? null : viewing + 1;
	return (
		<div className="ns-pager">
			<button
				type="button"
				disabled={older < 1}
				onClick={() => onFlip(older)}
				aria-label="Previous episode"
			>
				←
			</button>
			<button
				type="button"
				className="ns-pager-live"
				aria-pressed={viewing === null}
				onClick={() => onFlip(null)}
			>
				{off ? "Latest" : "Live"}
			</button>
			<button
				type="button"
				disabled={viewing === null}
				onClick={() => onFlip(newer)}
				aria-label="Next episode"
			>
				→
			</button>
		</div>
	);
}

function Closed({ connection }: { connection: Connection }) {
	return (
		<div className="ns-closed">
			<p className="ns-eyebrow">
				{connection === "closed" ? "Off shift" : "Out of reach"}
			</p>
			<p className="ns-closed-line">
				{connection === "closed"
					? "The agent is switched off for now."
					: "The night shift is not reachable right now."}
			</p>
			<p className="ns-closed-note">
				When it works, this page is its notebook: every step as it happens, each
				instrument’s reading, and a Lean library that only grows.
			</p>
		</div>
	);
}

export function NightShift() {
	const { live, about, strip, fronts, connection } = useShift();
	const now = useNow();
	const [viewing, setViewing] = useState<number | null>(null);
	const off = about?.mode === "off";
	const newest = live?.episodes[0]?.number ?? null;
	const shown = viewing ?? (off ? newest : null);
	const opened = useTranscript(shown);
	const drawn = useMemo(
		() =>
			live && strip ? figure(strip, live.state.frontier, live.scans) : null,
		[live, strip],
	);

	if (!live || !drawn) {
		return (
			<section className="ns" aria-labelledby="ns-title" data-waiting>
				<Head
					awake={null}
					episodes={null}
					about={null}
					connection={connection}
				/>
				{connection === "off" || connection === "closed" ? (
					<Closed connection={connection} />
				) : (
					<div className="ns-now">
						<div className="ns-strip ns-placeholder" />
						<p className="ns-page ns-placeholder">Waking the agent…</p>
						<div className="ns-side ns-placeholder" />
					</div>
				)}
			</section>
		);
	}

	const latest = newest ?? 0;
	const view =
		shown === null || !opened
			? liveView(live, fronts, now, off)
			: archivedView(opened, fronts);
	const running =
		!off && live.mode === "work" && live.episode !== null && live.front
			? { number: live.episode, front: live.front }
			: null;

	return (
		<section className="ns" aria-labelledby="ns-title">
			<Head
				awake={now ? duration(now - live.state.awakeSince) : null}
				episodes={live.state.episodes}
				about={about}
				connection={connection}
			/>
			<div className="ns-now">
				<StripView figure={drawn} zeros={live.state.zeros} />
				<NotebookPage
					key={shown ?? `live-${live.episode}-${live.mode}`}
					view={view}
					pager={
						<Pager
							viewing={viewing}
							latest={latest}
							off={off}
							onFlip={setViewing}
						/>
					}
				/>
				<aside className="ns-side" aria-label="The record">
					<Tiles state={live.state} about={about} />
					<Quilt
						latest={live.episodes}
						running={running}
						viewing={shown}
						fronts={fronts}
						onPick={setViewing}
					/>
				</aside>
			</div>
			<Ladder nodes={live.nodes} links={live.links} />
			<div className="ns-archive">
				<Library lemmas={live.lemmas} />
				<div className="ns-archive-side">
					<Letter state={live.state} />
					<Arms state={live.state} fronts={fronts} />
				</div>
			</div>
		</section>
	);
}
