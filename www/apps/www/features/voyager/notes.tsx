import { Out } from "@/features/frame/out";

export function Notes() {
	return (
		<div className="vg-notes">
			<h3>Spacecraft and ephemeris</h3>
			<p>
				The 3D mesh is segmented from NASA VTAD’s Voyager model for Eyes on the
				Solar System, scaled to the 3.66 m high-gain antenna dish and rendered
				with three.js. Geocentric distance and one-way light time are
				interpolated from weekly JPL Horizons samples (target −31, 2024–2031),
				with the one-light-day countdown referenced to November 18, 2026 at
				10:16:07 UTC. The RTG power curve fits an exponential decay through 470
				W at launch and 225 W in 2023 (~3.5 W/year loss), paired with NASA’s
				instrument shutoff timeline.
			</p>
			<p className="notes-credit">
				Voyager 3D model: NASA Visualization Technology Applications and
				Development (VTAD), via NASA’s Eyes on the Solar System
				(NASA/JPL-Caltech). This page is not affiliated with or endorsed by
				NASA.
			</p>
			<h3>Flight computers and Golden Record</h3>
			<p>
				<code>voyager.rs</code> models two systems in WebAssembly: a two-axis
				attitude control deadband loop (producing ~40–50 thruster pulses/day
				with antenna gain loss −12 × (error ÷ 0.6°)² dB) and the April 2024
				Flight Data System repair, which packs code from a failed 256-word CMOS
				chip across non-contiguous free blocks in an 8,192-word memory map.
			</p>
			<p>
				The Golden Record cover diagram is decoded using the hydrogen hyperfine
				transition period (0.70402 ns), yielding the 3.60 s rotation period,
				53.8-minute side duration, 8.34 ms video scanline time, and 14 pulsar
				epochs. The audio-image player encodes and decodes 512×384 frames at
				8.34 ms per line.
			</p>
			<h3>Sources</h3>
			<ul className="notes-sources">
				<li>
					NASA,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/instruments/">
						Voyager instruments
					</Out>
					,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/spacecraft/">
						spacecraft
					</Out>
					, and{" "}
					<Out href="https://science.nasa.gov/mission/voyager/frequently-asked-questions/">
						FAQ
					</Out>
					.
				</li>
				<li>
					NASA Voyager blog on the FDS memory repair:{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/04/04/engineers-pinpoint-cause-of-voyager-1-issue-are-working-on-solution/">
						Apr 4, 2024
					</Out>
					,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/04/22/nasas-voyager-1-resumes-sending-engineering-updates-to-earth/">
						Apr 22, 2024
					</Out>
					,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/06/13/voyager-1-returning-science-data-from-all-four-instruments/">
						Jun 13, 2024
					</Out>
					; thrusters,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/09/10/voyager-1-team-accomplishes-tricky-thruster-swap/">
						Sep 10, 2024
					</Out>
					; LECP shutoff,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2026/04/17/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/">
						Apr 17, 2026
					</Out>
					.
				</li>
				<li>
					NASA{" "}
					<Out href="https://eyes.nasa.gov/apps/solar-system/">
						Eyes on the Solar System
					</Out>{" "}
					and <Out href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</Out>.
				</li>
				<li>
					James E. Tomayko,{" "}
					<Out href="https://ntrs.nasa.gov/citations/19880069935">
						Computers in Spaceflight: The NASA Experience
					</Out>{" "}
					(NASA CR-182505, 1988), ch. 5–6; JPL DESCANSO,{" "}
					<Out href="https://descanso.jpl.nasa.gov/DPSummary/Descanso4--Voyager_new.pdf">
						Voyager Telecommunications
					</Out>
					.
				</li>
				<li>
					NASA,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/golden-record-cover/">
						Golden Record cover
					</Out>
					; W. R. Johnston,{" "}
					<Out href="https://www.johnstonsarchive.net/astro/pulsarmap.html">
						pulsar map notes
					</Out>
					; Ron Barry,{" "}
					<Out href="https://boingboing.net/2017/09/05/how-to-decode-the-images-on-th.html">
						Golden Record image decoding
					</Out>{" "}
					(2017).
				</li>
			</ul>
		</div>
	);
}
