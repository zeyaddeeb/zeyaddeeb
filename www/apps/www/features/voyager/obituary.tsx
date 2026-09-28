"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { useEffect, useRef, useState } from "react";
import { duration, fix } from "./ephemeris";
import { openUplink } from "./uplink";
import "./obituary.css";

const RELEASE_YEAR = 2036;
const FILED = "September 28, 2026";
const SEED = Date.UTC(2026, 8, 28);

const pad = (n: number) => String(n).padStart(2, "0");

const light = (ms: number) => {
	const d = duration(fix(ms).lightSeconds);
	return `${d.h} h ${pad(d.m)} m ${pad(d.s)} s`;
};

const Stop = () => <span className="vg-stop">.</span>;

function Light() {
	const out = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const el = out.current;
		if (!el) return;
		let id = 0;
		let seen = false;
		const tick = () => {
			el.textContent = light(Date.now());
		};
		const run = () => {
			window.clearInterval(id);
			id = 0;
			if (!seen || document.visibilityState === "hidden") return;
			tick();
			id = window.setInterval(tick, 1000);
		};
		const io = new IntersectionObserver(([e]) => {
			seen = e?.isIntersecting ?? false;
			run();
		});
		io.observe(el);
		document.addEventListener("visibilitychange", run);
		return () => {
			io.disconnect();
			document.removeEventListener("visibilitychange", run);
			window.clearInterval(id);
		};
	}, []);
	return (
		<span ref={out} className="vg-obit__light" aria-live="off">
			{light(SEED)}
		</span>
	);
}

function Stamp({ after }: { after: boolean }) {
	return (
		<span className="vg-obit__stamp" aria-hidden="true">
			<span className="vg-obit__face" data-on={after ? undefined : "true"}>
				<span>Hold for release</span>
				<span>Not before {RELEASE_YEAR}</span>
			</span>
			<span className="vg-obit__face" data-on={after ? "true" : undefined}>
				<span>Still on file</span>
				<span>Not confirmed</span>
			</span>
		</span>
	);
}

export function Obituary({ now }: { now: number }) {
	const [preview, setPreview] = useState(false);
	const current = new Date(now).getUTCFullYear();
	const real = current >= RELEASE_YEAR;
	const after = preview || real;
	const year = Math.max(current, RELEASE_YEAR);

	return (
		<div className="vg-obit vg-grid" data-after={after ? "true" : undefined}>
			<div className="vg-obit__status">
				<div className="vg-obit__states" aria-live="polite">
					<div
						className="vg-obit__state"
						data-on={after ? undefined : "true"}
						aria-hidden={after ? true : undefined}
					>
						<p className="vg-obit__title">
							Not needed yet
							<Stop />
						</p>
						<p className="vg-obit__line">
							Voyager 1 is <Light /> of light away and still talking. NASA
							expects the Deep Space Network to hear it until about{" "}
							{RELEASE_YEAR}, so the obituary waits on file with its date still
							to come.
						</p>
					</div>
					<div
						className="vg-obit__state"
						data-on={after ? "true" : undefined}
						aria-hidden={after ? undefined : true}
					>
						<p className="vg-obit__title vg-obit__title--gold">
							It’s {year}
							<Stop />
						</p>
						<p className="vg-obit__line">
							NASA expected the Deep Space Network to lose Voyager 1 about now.
							This page can’t hear the network, so it can’t tell if the obituary
							ran. Still talking? Good luck, old friend.
						</p>
					</div>
				</div>
				<div className="vg-obit__actions">
					{real ? null : (
						<button
							type="button"
							className="vg-button vg-obit__toggle"
							onClick={() => setPreview((p) => !p)}
						>
							<span className="vg-obit__swap">
								<span data-on={preview ? undefined : "true"}>
									Read it as {RELEASE_YEAR}
								</span>
								<span data-on={preview ? "true" : undefined}>
									Back to today
								</span>
							</span>
						</button>
					)}
					<button
						type="button"
						className="vg-pill vg-obit__luck"
						data-on={after ? "true" : undefined}
						onClick={() => openUplink("luck")}
					>
						Wish it luck
						<LifeArrow direction="right" seed={0} />
					</button>
				</div>
			</div>

			<article className="vg-clip" aria-labelledby="vg-obit-head">
				<header className="vg-clip__mast">
					<span>Obituaries</span>
					<span>[DATE TK], {RELEASE_YEAR}</span>
				</header>
				<h3 id="vg-obit-head" className="vg-clip__head">
					Voyager 1, the Farthest Thing People Ever Made, Falls Silent at 58
				</h3>
				<p className="vg-clip__deck">
					It visited two planets, photographed home from six billion kilometers
					away and kept talking for decades on 69,632 bytes of memory and the
					warmth of a little plutonium.
				</p>
				<div className="vg-clip__byline">
					<p className="vg-clip__filed">
						Filed {FILED}. Hold for release.
						<span className="vg-clip__tk">
							TK: newsroom shorthand for “to come.”
						</span>
					</p>
					<Stamp after={after} />
				</div>
				<div className="vg-clip__body">
					<p>
						<span className="vg-clip__dateline">PASADENA, Calif. —</span>{" "}
						Voyager 1, the spacecraft that carried a golden record, a stylus and
						instructions for both farther than anything else people have ever
						made, fell silent on [DATE TK], {RELEASE_YEAR}, about 31 billion
						kilometers from home. It was 58 [CHECK AGE]. The cause was a long
						decline in power.
					</p>
					<p>
						It was born at Cape Canaveral, Fla., on Sept. 5, 1977, 16 days after
						its twin, and was named first anyway because it was going to reach
						Jupiter first. It did. In March 1979 it found volcanoes erupting on
						Io, the first seen anywhere but Earth. At Saturn it swung close past
						the moon Titan, a detour that flung it up and out of the plane of
						the planets. It never visited another world, and it never seemed to
						mind.
					</p>
					<p>
						On Feb. 14, 1990, six billion kilometers out, it turned around and
						photographed Earth, a pale blue dot smaller than a pixel.
						Thirty-four minutes later it switched off its cameras. It never
						looked at anything again.
					</p>
					<p>
						It kept listening. It became the most distant human-made object in
						1998 and, in August 2012, the first to reach interstellar space. It
						did all of it with 69,632 bytes of memory, on power that faded by
						about four watts a year. When a memory chip failed in 2023,
						engineers a light-day away rewrote its code around the hole. In 2025
						it went back to roll thrusters that had been given up for dead in
						2004. It was, by any measure, hard to kill.
					</p>
					<p>
						In its last years it gave up its senses one at a time to stay warm
						and awake: its cosmic ray telescopes in 2025, its particle detector
						in 2026 and, eventually, the rest.
					</p>
					<p>
						It is survived by its twin, Voyager 2, which left home 16 days
						earlier and is still, somehow, not as far away; by the record it
						carries, with greetings in 55 languages, a kiss, a humpback whale
						and Chuck Berry; and by several generations of engineers at NASA’s
						Jet Propulsion Laboratory. It was predeceased by its cousins Pioneer
						11, in 1995, and Pioneer 10, in 2003.
					</p>
					<p>
						It is not stopping. In about 40,000 years it will pass within 1.7
						light-years of a star called Gliese 445, still carrying the record
						and the needle to play it.
					</p>
					<p className="vg-clip__close">
						In lieu of flowers, the family asks that you look toward Ophiuchus,
						the Serpent Bearer, where it was last heard from. Its final message
						went out at 160 bits per second and took more than a day to arrive.
					</p>
				</div>
			</article>
		</div>
	);
}
