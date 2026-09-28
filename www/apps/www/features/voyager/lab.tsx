"use client";

import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { Chips, Pointing, Rescue, totalBytes } from "./computers";
import { Distance } from "./distance";
import { BEAM_DEG, LIGHT_DAY, REFERENCE } from "./facts";
import { Finale } from "./finale";
import { Hero } from "./hero";
import { watts, yearNow } from "./instruments";
import { Nav } from "./nav";
import { Obituary } from "./obituary";
import { Power } from "./power";
import { Record } from "./record";
import { Specs } from "./specs";
import { Uplink } from "./uplink";
import "./voyager.css";
import "./base.css";
import "./distance.css";
import "./power.css";
import "./computers.css";
import "./fds.css";
import "./specs.css";
import "./sheet.css";
import "./record.css";

const Stop = () => <span className="vg-stop">.</span>;

function Section({
	id,
	eyebrow,
	title,
	lede,
	children,
}: {
	id: string;
	eyebrow: string;
	title: ReactNode;
	lede?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section id={id} className="vg-section" aria-labelledby={`${id}-title`}>
			<header className="vg-head vg-grid" data-reveal="">
				<p className="vg-eyebrow">{eyebrow}</p>
				<h2 id={`${id}-title`} className="vg-head__title">
					{title}
				</h2>
				{lede ? <p className="vg-head__lede">{lede}</p> : null}
			</header>
			{children}
		</section>
	);
}

function Sub({
	title,
	lede,
	children,
}: {
	title: string;
	lede: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="vg-sub">
			<header className="vg-sub__head vg-grid" data-reveal="">
				<h3 className="vg-sub__title">
					{title}
					<Stop />
				</h3>
				<p className="vg-sub__lede">{lede}</p>
			</header>
			{children}
		</div>
	);
}

function useRise(root: RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		const el = root.current;
		if (!el) return;
		if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches)
			return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (!e.isIntersecting) continue;
					(e.target as HTMLElement).dataset.rise = "in";
					io.unobserve(e.target);
				}
			},
			{ rootMargin: "100000px 0px -15% 0px" },
		);
		for (const n of el.querySelectorAll<HTMLElement>("[data-reveal]")) {
			if (n.dataset.rise === "in") continue;
			if (n.getBoundingClientRect().top < window.innerHeight) continue;
			n.dataset.rise = "wait";
			io.observe(n);
		}
		return () => io.disconnect();
	}, [root]);
}

export function VoyagerLab({ now: rendered = REFERENCE }: { now?: number }) {
	const root = useRef<HTMLDivElement>(null);
	const [now, setNow] = useState(rendered);

	useEffect(() => {
		setNow(Date.now());
		const id = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(id);
	}, []);

	useRise(root);

	const today = watts(yearNow(now));
	const crossed = now >= LIGHT_DAY;

	return (
		<div className="vg" id="top" ref={root}>
			<Nav />
			<Hero />
			<Section
				id="distance"
				eyebrow="Distance"
				title={
					<>
						{crossed ? "More than" : "Almost"} a light‑day{"\u00a0"}away
						<Stop />
					</>
				}
				lede={
					<>
						<strong>No one has ever sent anything this far.</strong> Every
						number here comes from JPL’s trajectory and ticks in real{"\u00a0"}
						time.
					</>
				}
			>
				<Distance />
			</Section>
			<Section
				id="power"
				eyebrow="Power"
				title={
					<>
						470 watts at launch.{" "}
						<span className="vg-dim">
							{Math.round(today)} today
							<Stop />
						</span>
					</>
				}
				lede={
					<>
						Sunlight is far too weak for solar panels out here, so the power
						comes from <strong>the heat of decaying plutonium‑238</strong>. As
						the heat fades, something has to be switched{"\u00a0"}off.
					</>
				}
			>
				<Power now={now} />
			</Section>
			<Section
				id="computers"
				eyebrow="Computers"
				title={
					<>
						Six computers.{" "}
						<span className="vg-dim">
							{Math.round(totalBytes / 1024)}
							{"\u00a0"}kilobytes between{"\u00a0"}them
							<Stop />
						</span>
					</>
				}
				lede={
					<>
						Three kinds, two of each, so a spare can take over. Two of their
						jobs are <strong>rewritten below in Rust</strong>, compiled to
						WebAssembly and running on this{"\u00a0"}page.
					</>
				}
			>
				<Chips />
				<Sub
					title="Holding Earth in the beam"
					lede={`The dish’s X-band beam is ${BEAM_DEG}°\u00a0wide. Voyager lets its pointing drift inside a deadband and fires a tiny hydrazine pulse whenever it reaches the edge. A wider deadband saves fuel and wear on the thrusters. Too wide, and Earth slips out of the\u00a0beam.`}
				>
					<Pointing />
				</Sub>
				<Sub
					title="The chip that died"
					lede="In November 2023, one memory chip in the Flight Data Subsystem failed and the telemetry turned to nonsense. There was no spare chip. JPL cut the stranded code into pieces, found room for each one elsewhere and fixed every address that pointed at them, from a light-day away."
				>
					<Rescue watts={today} />
				</Sub>
			</Section>
			<Section
				id="record"
				eyebrow="The Golden Record"
				title={
					<>
						A message with{"\u00a0"}instructions
						<Stop />
					</>
				}
				lede={
					<>
						A 12-inch gold-plated copper record with a stylus, and a cover
						engraved with <strong>how to play it</strong>, in units of the
						hydrogen{"\u00a0"}atom.
					</>
				}
			>
				<Record />
			</Section>
			<Section
				id="specs"
				eyebrow="Tech specs"
				title={
					<>
						By the numbers
						<Stop />
					</>
				}
				lede={
					<>
						Figures from NASA and JPL.{" "}
						<strong>The gold ones are{"\u00a0"}live.</strong>
					</>
				}
			>
				<Specs now={now} />
			</Section>
			<Section
				id="obituary"
				eyebrow="Obituary"
				title={
					<>
						Filed early
						<Stop />
					</>
				}
				lede={
					<>
						Newspapers write obituaries ahead of time. Voyager 1 should drift
						out of the Deep Space Network’s reach around 2036, so here is its
						obituary, <strong>on file and hoping not to be needed</strong>.
					</>
				}
			>
				<Obituary now={now} />
			</Section>
			<Finale />
			<Uplink />
		</div>
	);
}
