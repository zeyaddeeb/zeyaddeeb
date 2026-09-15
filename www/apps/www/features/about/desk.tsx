"use client";

import { ArrowIcon, SourceLink } from "@zeyaddeeb/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./desk.css";

const LINKS = [
	{ label: "Story", href: "/story" },
	{ label: "GitHub", href: "https://github.com/zeyaddeeb", external: true },
	{
		label: "LinkedIn",
		href: "https://linkedin.com/in/zeyaddeeb",
		external: true,
	},
];

const BROOKLYN = "America/New_York";

function brooklynHour() {
	return Number(
		new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			hour12: false,
			timeZone: BROOKLYN,
		}).format(new Date()),
	);
}

function useBrooklynTime() {
	const [time, setTime] = useState<string | null>(null);
	useEffect(() => {
		const fmt = new Intl.DateTimeFormat("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone: BROOKLYN,
		});
		const tick = () => setTime(fmt.format(new Date()));
		tick();
		const id = setInterval(tick, 30_000);
		return () => clearInterval(id);
	}, []);
	return time;
}

export function Desk() {
	const [on, setOn] = useState(false);
	const [night, setNight] = useState<boolean | null>(null);
	const [pulled, setPulled] = useState(false);
	const time = useBrooklynTime();

	useEffect(() => {
		const h = brooklynHour();
		const dark = h >= 18 || h < 7;
		setNight(dark);
		setOn(dark);
	}, []);

	const toggle = () => {
		setOn((v) => !v);
		setPulled(true);
		window.setTimeout(() => setPulled(false), 420);
	};

	const lampState =
		night === null
			? on
				? "On"
				: "Off"
			: `${on ? "On" : "Off"}, ${night ? "it’s night" : "in daylight"}`;

	return (
		<section className="desk" data-on={on} aria-labelledby="about-title">
			<div className="container desk__grid">
				<p className="desk__eyebrow">About / Brooklyn, NY</p>
				<h1 id="about-title" className="desk__title">
					A bit about me<span className="desk__period">.</span>
				</h1>
				<p className="desk__lede">
					I’m a software engineer in Brooklyn. I write code and lead teams
					building machine learning and distributed systems.
				</p>

				<div className="desk__lamp-place">
					<button
						type="button"
						className="lamp"
						data-pulled={pulled}
						onClick={toggle}
						aria-pressed={on}
						aria-label={on ? "Turn the lamp off" : "Turn the lamp on"}
					>
						<span className="lamp__cone" aria-hidden="true" />
						<span className="lamp__shade" aria-hidden="true" />
						<span className="lamp__neck" aria-hidden="true" />
						<span className="lamp__stem" aria-hidden="true" />
						<span className="lamp__base" aria-hidden="true" />
						<span className="lamp__cord" aria-hidden="true">
							<span className="lamp__pull" />
						</span>
					</button>
				</div>

				<div className="desk__body">
					<p>
						Here, I work on smaller things: graphics in the browser, shared text
						editors, and audio experiments, mostly in Rust and TypeScript. I
						write about them and keep a library of things I’ve enjoyed.
					</p>
					<p>
						The code for this site, the blog, and every experiment is public,
						along with the infrastructure that runs them.{" "}
						<SourceLink>Have a look on GitHub</SourceLink>
					</p>
					<ul className="desk__links">
						{LINKS.map((l) =>
							l.external ? (
								<li key={l.href}>
									<a href={l.href} target="_blank" rel="noopener noreferrer">
										{l.label}{" "}
										<span aria-hidden="true">
											<ArrowIcon direction="up-right" />
										</span>
									</a>
								</li>
							) : (
								<li key={l.href}>
									<Link href={l.href}>
										{l.label}{" "}
										<span aria-hidden="true">
											<ArrowIcon direction="right" />
										</span>
									</Link>
								</li>
							),
						)}
					</ul>
				</div>

				<dl className="desk__facts">
					<div>
						<dt>Where</dt>
						<dd>Brooklyn, NY</dd>
					</div>
					<div>
						<dt>Local time</dt>
						<dd className="desk__clock">{time ?? "——:——"}</dd>
					</div>
					<div>
						<dt>The lamp</dt>
						<dd>
							<span className="desk__swatch" aria-hidden="true" />
							{lampState}
						</dd>
					</div>
				</dl>

				<p className="desk__caption">
					<span>
						After Wilhelm Wagenfeld’s WA 24 table lamp, Bauhaus Weimar, 1924.
					</span>
					<span>
						{on
							? "Pull the cord to turn it off"
							: "Pull the cord to turn it on"}
					</span>
				</p>
			</div>
		</section>
	);
}
