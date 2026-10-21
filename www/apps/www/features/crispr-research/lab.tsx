"use client";

import { useMemo, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import { Ledger } from "./ledger";
import { AGENTS, type Agent, reading, SINK, share } from "./reach";
import { Shift } from "./shift";
import { useResearch } from "./use-research";
import "./research.css";
import "./phone.css";

const STOPS = 26;
const RADII = [0.5, 1, 2, 5, 10];
const DWELLS = [
	{ label: "1 min", seconds: 60 },
	{ label: "30 min", seconds: 1800 },
	{ label: "90 min", seconds: 5400 },
];
type Tab = "panel" | "dials" | "shift" | "ledger";

const TABS: { id: Tab; label: string }[] = [
	{ id: "panel", label: "Reading" },
	{ id: "dials", label: "Give" },
	{ id: "shift", label: "Agent" },
	{ id: "ledger", label: "Record" },
];
const CALLS = [
	"The drug crosses the whole nodule.",
	"A core of 0.00 mm is never reached.",
	"A core of 0.05 mm is never reached.",
	"A core of 9.55 mm is never reached.",
	"A core of 10.00 mm is never reached.",
	"Nothing reaches a killing level at all.",
];

function doses(agent: Agent): number {
	return agent.name === "Cisplatin" ? 0.8 : 0.14;
}

function call(core: number, touchedShare: number): string {
	if (touchedShare >= 1) return "The drug crosses the whole nodule.";

	if (touchedShare <= 0) return "Nothing reaches a killing level at all.";

	return `A core of ${core.toFixed(2)} mm is never reached.`;
}

export function ResearchLab() {
	const shift = useResearch("/experiments/four-ways-to-be-wrong/events");
	const [agent, setAgent] = useState(AGENTS[0]);
	const [radius, setRadius] = useState(2);
	const [dwell, setDwell] = useState(1800);
	const [tab, setTab] = useState<Tab>("panel");

	const cavity = useMemo(
		() => ({
			concentration: doses(agent),
			dwell,
			clearance: SINK,
		}),
		[agent, dwell],
	);
	const metres = radius / 1000;
	const found = useMemo(
		() => reading(agent, cavity, metres),
		[agent, cavity, metres],
	);
	const stops = useMemo(() => {
		const made: { offset: number; opacity: number }[] = [];

		for (let step = 0; step <= STOPS; step += 1) {
			const offset = step / STOPS;
			const depth = metres * (1 - offset);

			made.push({
				offset,
				opacity: Number(
					Math.min(1, share(agent, cavity, metres, depth)).toFixed(4),
				),
			});
		}

		return made;
	}, [agent, cavity, metres]);

	const crossing = found.depthMm / radius;

	return (
		<div className="rs" data-steady={found.steady} data-tab={tab}>
			<header className="rs-head">
				<p className="rs-eyebrow">Four referees. One of them is arithmetic.</p>
				<h2 className="rs-call">
					<ReservedText
						text={call(found.coreMm, found.touched)}
						samples={CALLS}
					/>
				</h2>
			</header>

			<figure className="rs-nodule" aria-label="A nodule in cross-section">
				<svg viewBox="0 0 200 200" role="presentation">
					<defs>
						<radialGradient id="rs-front" cx="50%" cy="50%" r="50%">
							{stops.map((stop) => (
								<stop
									key={stop.offset}
									offset={`${Number((stop.offset * 100).toFixed(3))}%`}
									stopColor="var(--yellow)"
									stopOpacity={stop.opacity}
								/>
							))}
						</radialGradient>
					</defs>
					<circle className="rs-nodule__body" cx="100" cy="100" r="78" />
					<circle
						className="rs-nodule__front"
						cx="100"
						cy="100"
						r="78"
						fill="url(#rs-front)"
					/>
					{found.touched < 1 && found.touched > 0 ? (
						<circle
							className="rs-nodule__core"
							cx="100"
							cy="100"
							r={78 * Math.max(0, 1 - crossing)}
						/>
					) : null}
					<circle className="rs-nodule__rim" cx="100" cy="100" r="78" />
				</svg>
				<figcaption className="rs-nodule__note">
					{radius} mm across the radius, drawn to scale
				</figcaption>
			</figure>

			<div className="rs-tabs" role="tablist" aria-label="Panel">
				{TABS.map((one) => (
					<button
						key={one.id}
						type="button"
						role="tab"
						className="rs-tab"
						aria-selected={tab === one.id}
						onClick={() => setTab(one.id)}
					>
						{one.label}
					</button>
				))}
			</div>

			<div className="rs-dials">
				<fieldset className="rs-dial">
					<legend>What you give</legend>
					<div className="rs-chips">
						{AGENTS.map((one) => (
							<button
								key={one.name}
								type="button"
								className="rs-chip"
								data-on={one.name === agent.name}
								onClick={() => setAgent(one)}
							>
								<span className="rs-chip__name">{one.name}</span>
								<span className="rs-chip__weight">
									{one.weight >= 1000
										? `${Math.round(one.weight / 1000)} kDa`
										: `${one.weight} Da`}
								</span>
							</button>
						))}
					</div>
				</fieldset>

				<fieldset className="rs-dial">
					<legend>How big the nodule is</legend>
					<div className="rs-chips">
						{RADII.map((one) => (
							<button
								key={one}
								type="button"
								className="rs-chip"
								data-on={one === radius}
								onClick={() => setRadius(one)}
							>
								<span className="rs-chip__name">{one} mm</span>
							</button>
						))}
					</div>
				</fieldset>

				<fieldset className="rs-dial">
					<legend>How long it sits</legend>
					<div className="rs-chips">
						{DWELLS.map((one) => (
							<button
								key={one.seconds}
								type="button"
								className="rs-chip"
								data-on={one.seconds === dwell}
								onClick={() => setDwell(one.seconds)}
							>
								<span className="rs-chip__name">{one.label}</span>
							</button>
						))}
					</div>
				</fieldset>
			</div>

			<section className="rs-panel" aria-label="The reading">
				<h3 className="rs-panel__title">What the arithmetic says</h3>
				<dl className="rs-readout">
					<div>
						<dt>It gets</dt>
						<dd>
							<ReservedText
								text={`${found.depthMm.toFixed(2)} mm`}
								samples={["0.00 mm", "10.00 mm"]}
							/>
						</dd>
					</div>
					<div>
						<dt>Never reached</dt>
						<dd>
							<ReservedText
								text={`${found.coreMm.toFixed(2)} mm`}
								samples={["0.00 mm", "10.00 mm"]}
							/>
						</dd>
					</div>
					<div>
						<dt>Of the volume</dt>
						<dd>
							<ReservedText
								text={`${(found.touched * 100).toFixed(1)}%`}
								samples={["0.0%", "100.0%"]}
							/>
						</dd>
					</div>
					<div>
						<dt>Decay length</dt>
						<dd>
							<ReservedText
								text={`${found.lambdaMm.toFixed(3)} mm`}
								samples={["0.000 mm", "10.000 mm"]}
							/>
						</dd>
					</div>
					<div>
						<dt>Front settled</dt>
						<dd>
							<ReservedText
								text={found.steady ? "yes" : "still moving"}
								samples={["yes", "still moving"]}
							/>
						</dd>
					</div>
					<div>
						<dt>Above killing</dt>
						<dd>
							<ReservedText
								text={`${Math.round(found.ratio)}×`}
								samples={["1×", "100000×"]}
							/>
						</dd>
					</div>
				</dl>
				<p className="rs-panel__note">
					The sink is mostly the capillaries, which carry off about forty times
					what the cells consume. This reproduces a published model exactly. It
					is not a measurement: published figures for the same question run from
					about twenty micrometres to five millimetres, and the spread is mostly
					about what each study counted as arriving. Read this as a scale.
				</p>
			</section>

			<Shift live={shift.live} connection={shift.connection} off={shift.off} />
			<Ledger
				cards={shift.live?.cards ?? []}
				capabilities={shift.live?.capabilities ?? {}}
			/>
		</div>
	);
}
