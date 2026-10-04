"use client";

import type { Sky } from "@zeyaddeeb/wasm";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useWasm } from "@/lib/hooks/use-wasm";
import { ChartSheet } from "./chart-sheet";
import { Fringes } from "./fringes";
import {
	describe,
	dot,
	FAR_COS,
	type Flow,
	GALACTIC_CENTER,
	HEATER_START,
	isMatched,
	type Match,
	OPENING,
	opposite,
	record,
	START_FLOW,
	speedOf,
	type Vec,
	vec,
	zoomFor,
} from "./model";
import { Recorder } from "./recorder";
import { type Marker, SkyWindow } from "./sky-window";
import { Beats } from "./sound";
import { Dial, Gauge, HearIt, Readout } from "./tuner";
import "./cobe.css";
import "./console.css";
import "./sky.css";
import "./pip.css";
import "./phone.css";

const AHEAD = vec(265.08, 47.92);
const SETTLE_MS = 450;
const TRACE = 161;

function useSkyData() {
	const { wasm, error } = useWasm();
	const [sky, setSky] = useState<Sky | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!wasm) return;

		let gone = false;
		let made: Sky | null = null;

		fetch("/cobe/sky.bin")
			.then((r) => {
				if (!r.ok) throw new Error(String(r.status));
				return r.arrayBuffer();
			})
			.then((buf) => {
				if (gone) return;
				made = new wasm.Sky(new Uint8Array(buf));
				setSky(made);
			})
			.catch(() => {
				if (!gone) setFailed(true);
			});

		return () => {
			gone = true;
			setSky(null);
			made?.free();
		};
	}, [wasm]);

	return { wasm, sky, failed: failed || Boolean(error) };
}

function useMobileOS() {
	const [mobile, setMobile] = useState(false);

	useEffect(() => {
		const ua = navigator.userAgent;
		const ipad =
			navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

		setMobile(/Android|iPhone|iPad|iPod/i.test(ua) || ipad);
	}, []);

	return mobile;
}

function useReveal(on: boolean, reduced: boolean) {
	const [amount, setAmount] = useState(0);

	useEffect(() => {
		if (!on) {
			setAmount(0);
			return;
		}

		if (reduced) {
			setAmount(1);
			return;
		}

		let frame = 0;
		const start = performance.now();
		const tick = (t: number) => {
			const k = Math.min(1, (t - start) / 900);

			setAmount(1 - (1 - k) ** 3);
			if (k < 1) frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, [on, reduced]);

	return amount;
}

export function ColdLab() {
	const { wasm, sky, failed } = useSkyData();
	const reduced = useReducedMotion();
	const phone = useMediaQuery("(max-width: 899px)");
	const mobileOS = useMobileOS();
	const [dir, setDir] = useState<Vec>(AHEAD);
	const [heater, setHeater] = useState(HEATER_START);
	const [level, setLevel] = useState(0);
	const [flow, setFlow] = useState<Flow>(START_FLOW);
	const [sound, setSound] = useState(false);
	const [open, setOpen] = useState(false);
	const [chart, setChart] = useState(false);
	const [when, setWhen] = useState<number | null>(null);
	const beats = useRef<Beats | null>(null);
	const settled = useRef<number | null>(null);
	const recorded = useRef(false);

	const ahead = useMemo<Vec>(() => {
		if (!sky) return AHEAD;

		const d = sky.direction();

		return [d[0], d[1], d[2]];
	}, [sky]);

	const reading = useMemo(() => {
		if (!sky || !wasm) return null;

		const skyT = sky.temperature(dir[0], dir[1], dir[2]);
		const leftover = sky.leftover(dir[0], dir[1], dir[2]);
		const dust = sky.dust(dir[0], dir[1], dir[2]);
		const gap = skyT - heater;
		const beat = wasm.beat_hz(wasm.heater_gap(skyT, heater, leftover));

		return {
			skyT,
			leftover,
			dust,
			gap,
			beat,
			heater,
			matched: isMatched(gap, leftover),
		};
	}, [sky, wasm, dir, heater]);

	const trace = useMemo(
		() =>
			sky && reading
				? sky.fringes(reading.skyT, heater, reading.dust, TRACE)
				: null,
		[sky, reading, heater],
	);

	useEffect(() => {
		if (reading) setLevel((l) => zoomFor(reading.gap, l));
	}, [reading]);

	useEffect(() => {
		if (!reading?.matched || !sky) {
			settled.current = null;
			recorded.current = false;
			return;
		}

		if (recorded.current) return;

		const id = window.setTimeout(() => {
			const match: Match = {
				heater,
				lean: sky.lean(dir[0], dir[1], dir[2]),
				dir,
			};

			recorded.current = true;
			setFlow((f) => record(f, match));
		}, SETTLE_MS);

		settled.current = id;

		return () => window.clearTimeout(id);
	}, [reading?.matched, heater, dir, sky]);

	useEffect(() => {
		if (!sky) return;

		const id = window.setTimeout(() => {
			const s = sky.seen(dir[0], dir[1], dir[2]);

			setWhen(Number.isFinite(s) ? s : null);
		}, 220);

		return () => window.clearTimeout(id);
	}, [sky, dir]);

	useEffect(() => {
		beats.current?.set(reading?.beat ?? 0);
	}, [reading?.beat]);

	useEffect(() => () => beats.current?.close(), []);

	const toggleSound = () => {
		if (sound) {
			beats.current?.close();
			beats.current = null;
			setSound(false);
			return;
		}

		try {
			const b = new Beats();

			void b.resume();
			b.set(reading?.beat ?? 0);
			beats.current = b;
			setSound(true);
		} catch {
			setSound(false);
		}
	};

	const speed =
		wasm &&
		speedOf(flow, (a, b) => wasm.speed_kms(a.heater, a.lean, b.heater, b.lean));
	const away = Boolean(flow.first && dot(dir, flow.first.dir) < FAR_COS);
	const caption = reading
		? describe({ ...flow, other: away }, reading, speed ?? null)
		: OPENING;
	const reveal = useReveal(speed !== null && speed !== undefined, reduced);

	const markers = useMemo<Marker[]>(
		() => [
			{ id: "crater", dir: ahead, text: "Crater" },
			{ id: "pisces", dir: opposite(ahead), text: "Pisces" },
			{ id: "center", dir: GALACTIC_CENTER, text: "Center of the Milky Way" },
		],
		[ahead],
	);

	const ready = Boolean(reading);

	return (
		<div className="hc" data-ready={ready}>
			<div className="hc-sky-cell">
				<SkyWindow
					dir={dir}
					onDir={setDir}
					reveal={reveal}
					dipole={ahead}
					markers={markers}
					label="The sky in COBE’s infrared. Drag or use the arrow keys to look around; the yellow ring is what the heater is compared with."
					overlay={(at) => (
						<Gauge
							{...at}
							gap={reading?.gap ?? 0}
							level={level}
							beat={reading?.beat ?? 0}
							still={reduced}
							matched={Boolean(reading?.matched)}
						/>
					)}
				/>
			</div>

			<div className="hc-lead">
				<div className="hc-caption" aria-live="polite">
					<Title text={caption.title} />
					<p className="hc-caption__body">{caption.body}</p>
				</div>
				<div className="hc-moves">
					<button
						type="button"
						className="hc-plate"
						aria-label="Point the other way"
						data-cue={Boolean(flow.first && !away)}
						onClick={() => setDir((d) => opposite(d))}
						disabled={!ready}
					>
						<span className="hc-long">Point the other way</span>
						<span className="hc-short" aria-hidden="true">
							Other way
						</span>
					</button>
					<button
						type="button"
						className="hc-plate"
						aria-label="Try the Milky Way"
						onClick={() => setDir(GALACTIC_CENTER)}
						disabled={!ready}
					>
						<span className="hc-long">Try the Milky Way</span>
						<span className="hc-short" aria-hidden="true">
							Milky Way
						</span>
					</button>
					{flow.first ? (
						<button
							type="button"
							className="hc-plate"
							aria-label="How perfect was that?"
							onClick={() => setChart(true)}
						>
							<span className="hc-long">How perfect was that?</span>
							<span className="hc-short" aria-hidden="true">
								How perfect?
							</span>
						</button>
					) : null}
				</div>
			</div>

			{phone || mobileOS ? null : (
				<aside
					className="hc-pip"
					aria-label="COBE in orbit, from its flight data"
				>
					<Recorder
						when={when}
						open={open}
						label={<When seconds={when} />}
						onOpen={() => setOpen(true)}
						onClose={() => setOpen(false)}
					/>
				</aside>
			)}

			<section className="hc-console" aria-label="Heater">
				<Readout heater={heater} level={level} />
				<div className="hc-console__dial">
					<Dial heater={heater} level={level} onHeater={setHeater} />
					<span className="hc-dial__label" aria-hidden="true">
						Turn the rim · slide the center
					</span>
				</div>
				<div className="hc-console__side">
					<HearIt on={sound} onToggle={toggleSound} />
				</div>
			</section>

			<figure className="hc-horizon">
				<Fringes trace={trace} level={level} />
				<figcaption className="hc-horizon__note">
					What the detector sees: sky and heater light, mixed. Matched, the
					ripples cancel.
				</figcaption>
				<p className="hc-credit">Infrared sky: COBE DIRBE at 100 microns</p>
			</figure>

			{failed ? (
				<p className="hc-error">
					The sky data didn’t load. This page needs WebAssembly.
				</p>
			) : null}

			<ChartSheet open={chart} onClose={() => setChart(false)} />
		</div>
	);
}

function Title({ text }: { text: string }) {
	const last = text.at(-1) ?? "";
	const mark = last === "." || last === "?";

	return (
		<h2 className="hc-caption__title">
			{mark ? text.slice(0, -1) : text}
			{mark ? <span className="hc-stop">{last}</span> : null}
		</h2>
	);
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function stamp(seconds: number) {
	const d = new Date(seconds * 1000);
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");

	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hh}:${mm} UTC`;
}

function When({ seconds }: { seconds: number | null }) {
	return (
		<>
			<span className="hc-pip__when">
				{seconds === null ? "COBE · 1989 to 1990" : stamp(seconds)}
			</span>
			<span className="hc-pip__what">
				COBE’s real orbit and pointing, at a moment it looked where you’re
				looking.
			</span>
		</>
	);
}
