"use client";

import { useEffect, useState } from "react";
import { loadLab } from "@/features/gates/server/lab";
import { CircuitView, Legend } from "./circuit";
import {
	count,
	groups,
	ladder,
	type RungView,
	span,
	standing,
	standingText,
} from "./ladder";
import { proofHref } from "./proof-name";
import type { Calibration, Lab, Study, Working } from "./protocol";
import { Tuning } from "./tuning";
import "./gates.css";

const POLL_MS = 5_000;

interface Reading {
	lab: Lab | null;
	reachable: boolean;
}

function useLab(): Reading {
	const [reading, setReading] = useState<Reading>({
		lab: null,
		reachable: true,
	});

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const ask = async () => {
			if (document.visibilityState === "visible") {
				const loaded = await loadLab();

				if (cancelled) return;

				setReading((was) =>
					loaded.ok
						? { lab: loaded.value, reachable: true }
						: { lab: was.lab, reachable: false },
				);
			}

			timer = setTimeout(ask, POLL_MS);
		};

		ask();

		return () => {
			cancelled = true;

			if (timer) clearTimeout(timer);
		};
	}, []);

	return reading;
}

function useNow(): number {
	const [now, setNow] = useState(0);

	useEffect(() => {
		setNow(Date.now());

		const timer = setInterval(() => setNow(Date.now()), 1_000);

		return () => clearInterval(timer);
	}, []);

	return now;
}

function chosen(lab: Lab, picked: string | null): Study | null {
	return (
		lab.studies.find((s) => s.id === picked) ??
		lab.studies.find((s) => s.id === lab.working?.id) ??
		lab.studies.find((s) => s.size === null) ??
		lab.studies[0] ??
		null
	);
}

function nowLine(lab: Lab | null, reachable: boolean, now: number): string {
	if (!lab) return reachable ? "Opening the lab…" : "The lab is out of reach.";

	const working = lab.working;

	if (lab.calibration && !lab.calibration.matches)
		return "The census disagrees with Knuth’s table, so the lab has stopped until that is fixed.";

	if (!working)
		return lab.studies.every((s) => s.size !== null)
			? "Every function on the list is settled."
			: "Between questions.";

	if (working.id === "census-4")
		return "Proving Knuth’s table of every four-input function again before trusting anything else.";

	if (working.id.startsWith("trial-"))
		return working.id.endsWith("-census")
			? `A change passed its races; now checking Knuth’s table under it: ${working.note?.toLowerCase() ?? ""}.`
			: `Testing a change to its own prover: ${working.note?.toLowerCase() ?? "one change"}.`;

	const study = lab.studies.find((s) => s.id === working.id);

	return `Asking now whether ${study?.title.toLowerCase() ?? working.id} on ${study?.inputs ?? "?"} inputs fits in ${working.gates} ${working.gates === 1 ? "gate" : "gates"}: ${count(working.lemmas)} lemmas checked, ${span(Math.max(0, now - working.since))} in.`;
}

function Index({
	lab,
	study,
	onPick,
}: {
	lab: Lab;
	study: Study | null;
	onPick: (id: string) => void;
}) {
	return (
		<nav className="gf-index" aria-label="Functions">
			{groups(lab).map((group) => (
				<div className="gf-group" key={group.label}>
					<p className="gf-eyebrow">{group.label}</p>
					<ul>
						{group.studies.map((s) => {
							const now = standing(s);

							return (
								<li key={s.id}>
									<button
										type="button"
										aria-pressed={s.id === study?.id}
										data-settled={now.kind === "settled" || undefined}
										data-asking={lab.working?.id === s.id || undefined}
										onClick={() => onPick(s.id)}
									>
										<span className="gf-index-mark" aria-hidden="true" />
										<span className="gf-index-title">{s.title}</span>
										<span className="gf-index-size">{standingText(s)}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</nav>
	);
}

function Rungs({ study, rungs }: { study: Study; rungs: RungView[] }) {
	return (
		<ol
			className="gf-rungs"
			aria-label={`${study.title}: one question per size`}
		>
			{rungs.map((rung) => (
				<li key={rung.gates} data-state={rung.state}>
					<span className="gf-rung-gates">{rung.gates}</span>
					<span className="gf-rung-track" aria-hidden="true">
						<span
							className="gf-rung-bar"
							style={{ "--share": rung.share } as React.CSSProperties}
						/>
					</span>
					<span className="gf-rung-note">{rung.note}</span>
					{rung.kept && study.proof ? (
						<span className="gf-rung-files">
							<a href={proofHref(study.proof, "lrat")} download>
								proof
							</a>
							<a href={proofHref(study.proof, "cnf")} download>
								formula
							</a>
						</span>
					) : (
						<span className="gf-rung-files" />
					)}
				</li>
			))}
		</ol>
	);
}

function Verdict({ study }: { study: Study }) {
	const now = standing(study);

	if (now.kind === "bounded") {
		return (
			<p className="gf-verdict">
				Proved impossible with fewer than {now.lower} gates. The next rung is
				open.
			</p>
		);
	}

	const published = study.known
		? now.matches
			? `Matches the published ${study.known.size} (${study.known.source}).`
			: `Disagrees with the published ${study.known.size} (${study.known.source}).`
		: "No published value found for this one.";

	return (
		<p className="gf-verdict" data-matches={now.matches ?? undefined}>
			Exactly {now.size} {now.size === 1 ? "gate" : "gates"}: found with{" "}
			{now.size}, proved impossible with {now.size - 1}. {published}
		</p>
	);
}

function Census({
	calibration,
	lemmas,
}: {
	calibration: Calibration | null;
	lemmas: number;
}) {
	const expected = calibration?.expected ?? [];
	const tallest = Math.max(...expected, 1);

	return (
		<section className="gf-census" aria-labelledby="gf-census-title">
			<div className="gf-census-text">
				<h3 id="gf-census-title">First, it proves Knuth’s table again</h3>
				<p>
					Before any new answer counts, the lab finds the smallest circuit for
					every one of the 65,536 functions of four inputs and proves each one
					minimal. The result has to match the table in Knuth’s The Art of
					Computer Programming, function for function.
				</p>
				<p className="gf-census-facts">
					{calibration
						? `${calibration.matches ? "Matches" : "Does not match"} · ${count(calibration.functions)} functions in ${calibration.classes} classes · ${count(calibration.lemmas)} lemmas checked in ${span(calibration.millis)} · ${count(lemmas)} certified sizes kept`
						: "Running the census…"}
				</p>
			</div>
			<ol
				className="gf-census-bars"
				aria-label="Four-input functions by fewest gates"
			>
				{expected.map((knuth, gates) => {
					const ours = calibration?.bySize[gates] ?? 0;

					return (
						<li
							key={`gates-${knuth}`}
							data-match={ours === knuth || undefined}
							style={{ "--height": knuth / tallest } as React.CSSProperties}
						>
							<span className="gf-census-count">{count(ours)}</span>
							<span className="gf-census-bar" aria-hidden="true" />
							<span className="gf-census-gates">{gates}</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

function Board({
	study,
	working,
	now,
}: {
	study: Study;
	working: Working | null;
	now: number;
}) {
	const rungs = ladder(study, working, now);

	return (
		<>
			<div className="gf-board">
				<p className="gf-eyebrow">
					{study.inputs} inputs · {study.rule}
				</p>
				<h3 className="gf-title">
					{study.title}
					<span>{standingText(study)}</span>
				</h3>
				<div className="gf-frame">
					<CircuitView study={study} />
				</div>
				<Legend />
				<Verdict study={study} />
			</div>
			<section className="gf-ladder" aria-labelledby="gf-ladder-title">
				<p className="gf-eyebrow" id="gf-ladder-title">
					Can it be done with this many gates?
				</p>
				<Rungs study={study} rungs={rungs} />
				<p className="gf-ladder-note">
					Bars count the lemmas in each proof of no, on a scale where every step
					is ten times longer.
				</p>
			</section>
		</>
	);
}

export function GatesLab() {
	const { lab, reachable } = useLab();
	const now = useNow();
	const [picked, setPicked] = useState<string | null>(null);
	const study = lab ? chosen(lab, picked) : null;

	return (
		<section className="gf" aria-labelledby="gf-question">
			<header className="gf-head">
				<h2 id="gf-question" className="gf-question">
					Can it be done with one gate fewer?
				</h2>
				<p className="gf-now" aria-live="polite">
					{nowLine(lab, reachable, now)}
				</p>
			</header>
			<div className="gf-stage" data-waiting={!lab || undefined}>
				{lab && study ? (
					<>
						<Index lab={lab} study={study} onPick={setPicked} />
						<Board study={study} working={lab.working} now={now} />
					</>
				) : (
					<>
						<div className="gf-index gf-placeholder" />
						<div className="gf-board gf-placeholder" />
						<div className="gf-ladder gf-placeholder" />
					</>
				)}
			</div>
			{lab ? (
				<Tuning lab={lab} />
			) : (
				<div className="gf-tuning gf-placeholder" />
			)}
			<Census
				calibration={lab?.calibration ?? null}
				lemmas={lab?.lemmas ?? 0}
			/>
		</section>
	);
}
