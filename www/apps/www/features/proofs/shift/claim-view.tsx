"use client";

import { useEffect, useId, useState } from "react";
import { Out } from "@/features/frame/out";
import { loadClaim } from "@/features/proofs/server/shift";
import {
	ANNOUNCED,
	auditLine,
	type ClaimAudit,
	type ClaimCheck,
	type ClaimStep,
	ELSEWHERE,
	ELSEWHERE_AS_OF,
	ELSEWHERE_BY,
	ONCE,
	ONCE_CHECKED,
	type Outcome,
	SOURCES,
	STATEMENTS,
	STEP_TITLE,
	stepOutcome,
	tally,
} from "./claim";

const POLL_MS = 5_000;
const POLLS = 36;

const OUTCOME: Record<Outcome, string> = {
	pass: "Passed",
	running: "Running",
	fail: "Failed",
	waiting: "Not run",
};

interface Reading {
	audit: ClaimAudit | null;
	reachable: boolean;
}

function settled(audit: ClaimAudit): boolean {
	return audit.status === "done" || audit.status === "unavailable";
}

function useClaim(): Reading {
	const [reading, setReading] = useState<Reading>({
		audit: null,
		reachable: true,
	});

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let polls = 0;

		const ask = async () => {
			polls += 1;

			const loaded = await loadClaim();

			if (cancelled) return;

			if (loaded.ok) setReading({ audit: loaded.value, reachable: true });
			else if (polls >= POLLS) setReading({ audit: null, reachable: false });

			if ((loaded.ok && settled(loaded.value)) || polls >= POLLS) return;

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

function seconds(millis: number): string {
	return millis < 1000 ? `${millis} ms` : `${(millis / 1000).toFixed(1)} s`;
}

function stepDetail(audit: ClaimAudit | null, step: ClaimStep): string {
	if (audit?.status !== "done") return OUTCOME[stepOutcome(audit, step)];

	const line = audit.lines.find((l) => l.key === step);

	if (!line) return OUTCOME.waiting;

	if (!line.ok) return line.error ?? OUTCOME.fail;

	return `${OUTCOME.pass} in ${seconds(line.millis)}`;
}

function Checks({
	title,
	note,
	checks,
	live,
}: {
	title: string;
	note: string;
	checks: ClaimCheck[];
	live?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const id = useId();

	return (
		<div
			className="ns-claim-group"
			data-live={live || undefined}
			data-open={open || undefined}
		>
			<p className="ns-eyebrow">{title}</p>
			<p className="ns-claim-note">{note}</p>
			<button
				type="button"
				className="ns-claim-more"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen((was) => !was)}
			>
				{open ? "Hide" : `Show ${checks.length}`}
			</button>
			<ul className="ns-claim-checks" id={id}>
				{checks.map((check) => (
					<li key={check.title} data-outcome={check.outcome}>
						<span className="ns-claim-mark" aria-hidden="true" />
						<span className="ns-claim-check">{check.title}</span>
						<span className="ns-claim-detail">{check.detail}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function Claim() {
	const { audit, reachable } = useClaim();
	const [picked, setPicked] = useState(1);
	const statement =
		STATEMENTS.find((s) => s.number === picked) ?? STATEMENTS[0];
	const outcome = stepOutcome(audit, statement.step);
	const line =
		audit?.status === "done"
			? audit.lines.find((l) => l.key === statement.step)
			: undefined;

	const live: ClaimCheck[] = (Object.keys(STEP_TITLE) as ClaimStep[]).map(
		(step) => ({
			title: STEP_TITLE[step],
			detail: stepDetail(audit, step),
			outcome: stepOutcome(audit, step),
		}),
	);

	const status = reachable
		? auditLine(audit)
		: "The proofs service is out of reach.";

	return (
		<section
			className="ns-block ns-claim"
			id="ns-claim"
			aria-labelledby="ns-claim-title"
		>
			<header className="ns-block-head">
				<h3 id="ns-claim-title">The claim</h3>
				<p>
					On {ANNOUNCED} Levent Alpöge announced a proof, found with Claude and
					released only as Lean: 175,187 files. Independent checkers accept it.
					Nobody has finished reviewing the mathematics, and the Clay rules ask
					for publication and two years.
				</p>
			</header>
			<div className="ns-claim-body">
				<div className="ns-claim-index">
					<p className="ns-eyebrow">Five statements, one proof</p>
					<ol className="ns-claim-rows" aria-label="The claimed statements">
						{STATEMENTS.map((s) => (
							<li key={s.number}>
								<button
									type="button"
									aria-pressed={s.number === statement.number}
									data-outcome={stepOutcome(audit, s.step)}
									onClick={() => setPicked(s.number)}
								>
									<span className="ns-claim-number">{s.number}</span>
									<span className="ns-claim-title">{s.title}</span>
									<span className="ns-claim-mark" aria-hidden="true" />
								</button>
							</li>
						))}
					</ol>
				</div>
				<div className="ns-claim-sheet" aria-live="polite">
					<p className="ns-eyebrow">
						Statement {statement.number} · {statement.name}
					</p>
					<p className="ns-claim-plain">{statement.plain}</p>
					<pre className="ns-code ns-claim-code">{statement.lean}</pre>
					<p className="ns-claim-step" data-outcome={outcome}>
						<span className="ns-claim-mark" aria-hidden="true" />
						<span className="ns-claim-check">{STEP_TITLE[statement.step]}</span>
						<span className="ns-claim-detail">
							{stepDetail(audit, statement.step)}
						</span>
					</p>
					<pre className="ns-code ns-claim-proof" data-outcome={outcome}>
						{line?.code ?? " "}
					</pre>
				</div>
			</div>
			<div className="ns-claim-ladder">
				<Checks title="Here, live" note={status} checks={live} live />
				<Checks
					title="Here, once"
					note={`${tally(ONCE)} · ${ONCE_CHECKED}`}
					checks={ONCE}
				/>
				<Checks
					title={`Elsewhere · ${ELSEWHERE_BY}`}
					note={`${tally(ELSEWHERE)} · ${ELSEWHERE_AS_OF}`}
					checks={ELSEWHERE}
				/>
			</div>
			<p className="ns-claim-sources">
				<Out href={SOURCES.note}>The announcement</Out>
				<Out href={SOURCES.review}>The verification page</Out>
				<Out href={SOURCES.mirror}>The Lean source</Out>
			</p>
		</section>
	);
}
