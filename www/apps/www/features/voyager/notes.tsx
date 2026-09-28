import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";
import "./notes.css";

function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="vg-out">
			{children}
			<LifeArrow direction="up-right" className="vg-out__arrow" />
		</a>
	);
}

export function Notes() {
	return (
		<div className="vg-notes">
			<h3>The spacecraft</h3>
			<p>
				The 3D model is NASA’s own Voyager, made by NASA’s Visualization
				Technology Applications and Development team (VTAD) for Eyes on the
				Solar System. A build script splits it into the parts this page takes
				apart and scales it so the dish is 3.66 m across. It is drawn in the
				browser with three.js, using physically based materials, a single Sun
				and self-shadowing. The exploded positions are for legibility, not how
				the parts sit in flight.
			</p>
			<p className="vg-notes__credit">
				Voyager 3D model: NASA Visualization Technology Applications and
				Development (VTAD), via NASA’s Eyes on the Solar System
				(NASA/JPL-Caltech). This page is not affiliated with or endorsed by
				NASA.
			</p>
			<h3>Distance</h3>
			<p>
				Distances come from JPL Horizons (target −31, geocentric), sampled
				weekly from 2024 to 2031 and interpolated with the range rate between
				samples. The countdown uses NASA’s announced moment, November 18, 2026
				at 10:16:07 UTC. Horizons’ own geocentric light time reaches 1,440
				minutes about 16 hours later, around 02:00 UTC on November 19. The speed
				in Specs is Horizons’ heliocentric range rate for the same moment.
			</p>
			<p>
				A command you send in the sheet does not reach the Deep Space Network.
				The page records when you pressed send and uses Horizons’ light time for
				that moment. The opcode, operand and parity layout is made up. The 16
				bits per second uplink rate is real.
			</p>
			<h3>Power</h3>
			<p>
				The wattage curve is an exponential fitted through 470 W at launch and
				225 W in 2023, which gives about 3.5 W lost a year now, close to NASA’s
				“about 4 watts.” Instrument switch-off dates are NASA’s. Anything after
				today is the fit, not a mission plan. The instrument count in Specs
				follows the same switch-off dates.
			</p>
			<h3>The Rust</h3>
			<p>
				Voyager’s computers were programmed in assembly for 18-bit plated-wire
				machines (CCS and AACS) and a 16-bit CMOS machine (FDS). None of this is
				flight code. It’s a small Rust module, <code>voyager.rs</code>, written
				to show the same ideas. The site’s WebAssembly package compiles it, and
				the code on the page is extracted from that file.
			</p>
			<p>
				The pointing demo runs two axes of a deadband controller. Each thruster
				pulse flips the drift rate, and the default settings give 40 to 50
				pulses a day, close to the figure NASA gave for 2024. Signal loss uses
				the usual beam approximation, −12 × (error ÷ 0.6°)² dB.
			</p>
			<p>
				The memory demo is 8,192 words in 32 chips of 256. NASA said the failed
				chip held about 3% of FDS memory. The routine names, sizes and free gaps
				are invented. The two constraints come from NASA’s account: no single
				gap could hold the stranded code, and every reference to it had to be
				updated.
			</p>
			<h3>The Golden Record</h3>
			<p>
				The cover is redrawn from NASA photograph GPN-2000-001978, and its
				binary was transcribed from the photo. Every value is decoded with
				hydrogen’s hyperfine period, 0.70402 ns. The rim gives 3.60 s a turn,
				the side view 53.8 minutes, and the video diagram 8.34 ms a line. Pulsar
				periods and angles are W. R. Johnston’s reading of the map. Line lengths
				were measured from the photograph.
			</p>
			<p>
				The picture player turns a 512 × 384 image into one line of sound every
				8.34 ms, with a sync pulse at the start of each line. It then decodes
				that sound back into the picture. The real record interlaces its lines
				and puts pictures on both stereo channels.
			</p>
			<h3>The obituary</h3>
			<p>
				Newspapers keep obituaries of famous people on file and update them
				until they run. This one is written that way, so it is fiction about the
				future. What it says about the past comes from the sources below. The
				date, the age and the cause are placeholders, marked TK and CHECK AGE
				the way an editor would leave them. 2036 is NASA’s rough estimate of how
				long the Voyagers can stay in touch, not a scheduled date.
			</p>
			<h3>Sources</h3>
			<ul className="vg-sources">
				<li>
					NASA,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/instruments/">
						Voyager instruments
					</Out>
					,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/spacecraft/">
						spacecraft
					</Out>{" "}
					and{" "}
					<Out href="https://science.nasa.gov/mission/voyager/frequently-asked-questions/">
						frequently asked questions
					</Out>
					.
				</li>
				<li>
					NASA Voyager blog on the FDS chip:{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/04/04/engineers-pinpoint-cause-of-voyager-1-issue-are-working-on-solution/">
						April 4, 2024
					</Out>
					,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/04/22/nasas-voyager-1-resumes-sending-engineering-updates-to-earth/">
						April 22, 2024
					</Out>
					,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/06/13/voyager-1-returning-science-data-from-all-four-instruments/">
						June 13, 2024
					</Out>
					; on thrusters,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2024/09/10/voyager-1-team-accomplishes-tricky-thruster-swap/">
						September 10, 2024
					</Out>
					; on LECP,{" "}
					<Out href="https://science.nasa.gov/blogs/voyager/2026/04/17/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/">
						April 17, 2026
					</Out>
					.
				</li>
				<li>
					NASA,{" "}
					<Out href="https://eyes.nasa.gov/apps/solar-system/">
						Eyes on the Solar System
					</Out>
					, the source of the Voyager 3D model.
				</li>
				<li>
					NASA,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/">
						Where are Voyager 1 and Voyager 2 now?
					</Out>{" "}
					and <Out href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</Out>.
				</li>
				<li>
					James E. Tomayko,{" "}
					<Out href="https://ntrs.nasa.gov/citations/19880069935">
						Computers in Spaceflight: The NASA Experience
					</Out>{" "}
					(NASA CR-182505, 1988), chapters 5 and 6.
				</li>
				<li>
					<Out href="https://pds-rings.seti.org/voyager/spacecraft/vg1host.html">
						Voyager 1 host description
					</Out>
					, PDS Ring-Moon Systems Node, and JPL DESCANSO,{" "}
					<Out href="https://descanso.jpl.nasa.gov/DPSummary/Descanso4--Voyager_new.pdf">
						Voyager Telecommunications
					</Out>
					.
				</li>
				<li>
					NASA,{" "}
					<Out href="https://science.nasa.gov/mission/voyager/golden-record-cover/">
						The Golden Record cover
					</Out>{" "}
					and{" "}
					<Out href="https://science.nasa.gov/mission/voyager/golden-record-contents/">
						contents
					</Out>
					.
				</li>
				<li>
					W. R. Johnston,{" "}
					<Out href="https://www.johnstonsarchive.net/astro/pulsarmap.html">
						The pulsar map
					</Out>
					, after Sagan, Sagan and Drake, “A message from Earth,”{" "}
					<cite>Science</cite> 175 (1972).
				</li>
				<li>
					Ron Barry,{" "}
					<Out href="https://boingboing.net/2017/09/05/how-to-decode-the-images-on-th.html">
						How to decode the images on the Voyager Golden Record
					</Out>{" "}
					(Boing Boing, 2017).
				</li>
			</ul>
		</div>
	);
}
