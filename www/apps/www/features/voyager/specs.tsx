"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { type ReactNode, useEffect, useRef } from "react";
import { AU_KM, fix, grouped } from "./ephemeris";
import { MEMORY_BYTES, PULSES_PER_DAY } from "./facts";
import { instruments, watts, yearNow, yearOf } from "./instruments";

const SEED = Date.UTC(2026, 8, 28);
const YEAR_S = 365.25 * 86_400;

const km = (ms: number) => grouped(fix(ms).km);

function Ticker({ read, hz }: { read: (ms: number) => string; hz: number }) {
	const out = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const el = out.current;

		if (!el) return;

		let id = 0;

		const tick = () => {
			el.textContent = read(Date.now());
		};

		const io = new IntersectionObserver(([e]) => {
			window.clearInterval(id);

			if (!e?.isIntersecting) return;

			tick();
			id = window.setInterval(tick, 1000 / hz);
		});

		io.observe(el);

		return () => {
			io.disconnect();
			window.clearInterval(id);
		};
	}, [read, hz]);

	return (
		<span ref={out} className="vg-spec__live">
			{read(SEED)}
		</span>
	);
}

interface Spec {
	label: string;
	figure: ReactNode;
	unit?: string;
	notes: string[];
	live?: boolean;
	wide?: boolean;
	link?: { href: string; label: string };
}

const month = (iso: string) =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

export function Specs({ now }: { now: number }) {
	const year = yearNow(now);
	const here = fix(now);
	const on = instruments.filter((i) => i.off === null || yearOf(i.off) > year);

	const last = instruments
		.filter((i) => i.off !== null && yearOf(i.off) <= year)
		.sort((a, b) => yearOf(b.off ?? "") - yearOf(a.off ?? ""))[0];

	const list = new Intl.ListFormat("en-US").format(on.map((i) => i.name));
	const names = list.charAt(0) + list.slice(1).toLowerCase();

	const specs: Spec[] = [
		{
			label: "Launch",
			figure: "Sep 5, 1977",
			notes: [
				"12:56 UTC on a Titan IIIE–Centaur",
				"Launch Complex 41, Cape Canaveral",
			],
			wide: true,
		},
		{
			label: "Mass",
			figure: "815",
			unit: "kg",
			notes: ["At launch, with hydrazine", "105 kg of it science instruments"],
		},
		{
			label: "Size",
			figure: "3.7",
			unit: "m dish",
			notes: [
				"Ten-sided bus, 1.78 m across and 47 cm tall",
				"A 13 m magnetometer boom and two 10 m antennas",
			],
		},
		{
			label: "Power",
			figure: Math.round(watts(year)),
			unit: "W today",
			notes: [
				"From three plutonium‑238 RTGs",
				"470 W at launch, losing about 4 W a year",
			],
			live: true,
		},
		{
			label: "Computers",
			figure: grouped(MEMORY_BYTES),
			unit: "bytes",
			notes: [
				"Six computers, two each of CCS, AACS and FDS",
				"CCS and AACS: 4,096 18‑bit words each",
				"FDS: 8,192 16‑bit words each",
			],
		},
		{
			label: "Storage",
			figure: "328",
			unit: "m of tape",
			notes: ["Eight-track digital tape recorder", "About 500 million bits"],
		},
		{
			label: "Radio",
			figure: "160",
			unit: "bit/s down",
			notes: [
				"16 bit/s up, on S‑band at 2.1 GHz",
				"X‑band down at 8.4 GHz, to the Deep Space Network’s largest dishes",
			],
		},
		{
			label: "Pointing",
			figure: "16",
			unit: "thrusters",
			notes: [
				`Hydrazine, about ${PULSES_PER_DAY} pulses a day in 2024`,
				"Sun sensor and star tracker",
			],
		},
		{
			label: "Instruments",
			figure: on.length,
			unit: `of ${instruments.length} still on`,
			notes: [
				names,
				last
					? `The rest are off, most recently ${last.id} in ${month(last.off ?? "")}`
					: "All of them working",
			],
			live: true,
		},
		{
			label: "Distance",
			figure: <Ticker read={km} hz={10} />,
			unit: "km",
			notes: [
				"From Earth, live from JPL Horizons",
				"In interstellar space since August 25, 2012",
			],
			live: true,
			wide: true,
		},
		{
			label: "Speed",
			figure: here.sunKmPerS.toFixed(1),
			unit: "km/s",
			notes: [
				`Away from the Sun, about ${((here.sunKmPerS * YEAR_S) / AU_KM).toFixed(1)} AU a year`,
			],
		},
		{
			label: "Carrying",
			figure: "12",
			unit: "in record",
			notes: [
				"The Golden Record, gold-plated copper",
				"With a stylus, a cartridge and instructions",
			],
			link: { href: "#record", label: "Decode the cover" },
		},
	];

	return (
		<ul className="vg-tilerow vg-specs" data-reveal="">
			{specs.map((s) => (
				<li
					key={s.label}
					className="vg-tile vg-spec"
					data-band={s.live ? "gold" : undefined}
					data-wide={s.wide ? "" : undefined}
				>
					<p className="vg-tile__label vg-spec__label">{s.label}</p>
					<p className="vg-spec__figure">
						<span className="vg-spec__value">{s.figure}</span>
						{s.unit ? (
							<>
								{" "}
								<span className="vg-unit">{s.unit}</span>
							</>
						) : null}
					</p>
					<div className="vg-spec__notes">
						{s.notes.map((n) => (
							<p key={n}>{n}</p>
						))}
					</div>
					{s.link ? (
						<a className="vg-spec__link" href={s.link.href}>
							{s.link.label}
							<LifeArrow direction="up" />
						</a>
					) : null}
				</li>
			))}
		</ul>
	);
}
