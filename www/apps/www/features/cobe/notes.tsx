import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";
import "./notes.css";

function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="hc-out">
			{children}
			<LifeArrow direction="up-right" className="hc-out__arrow" />
		</a>
	);
}

export function Notes() {
	return (
		<div className="hc-notes">
			<h3>How FIRAS measured the sky</h3>
			<p>
				COBE’s Far Infrared Absolute Spectrophotometer never looked at the sky
				on its own. Light from the sky and light from a small blackbody inside
				the instrument, the internal calibrator or ICAL, went into the same
				interferometer, and the detectors read only the difference. Setting the
				ICAL close to the sky’s temperature cut the signal by about 99 percent.
				That near-null is what made the result absolute instead of relative. The
				heater on this page is the ICAL, simplified: one dial, one needle. A
				second blackbody, the external calibrator, swung into the sky horn to
				check the whole chain; the log shows it there about one-eighth of the
				time.
			</p>
			<p>
				The ripple trace is that difference as the interferometer would see it.
				It is computed from the same numbers that drive the needle, summed over
				FIRAS’s 43 low-frequency channels (2.3 to 21.3 waves per centimeter)
				with an idealized instrument, not the real one’s response.
			</p>

			<h3>What the needle compares</h3>
			<p>
				The sky side of the needle is FIRAS’s own temperature map: 6,067 sky
				patches, averaged over those within 4° of where you point, about the
				size of the instrument’s 7° beam. That map is on the 1996 calibration,
				where the sky averages 2.7277 K. It is rescaled by one factor, 0.99917,
				to the final value of 2.72548 K (Fixsen, 2009). The match counts when
				the heater is within 0.08 thousandths of a degree.
			</p>
			<p>
				Dust is why the Milky Way never goes still. FIRAS’s dust map is fit with
				one dust spectrum, then weighed with the frequencies that matter most
				for temperature. No heater setting can cancel what is left: about 0.1
				thousandths of a degree far from the plane, and 1 to 5 on it.
			</p>

			<h3>The speed</h3>
			<p>
				Moving through the glow makes it a little warmer ahead and colder
				behind: ΔT/T = v/c × cos θ. From two matches, the page solves for v
				using the direction FIRAS’s own map gives, galactic longitude 265.1° and
				latitude 47.9°. That map alone says 3.34 thousandths of a degree, or
				about 368 km/s. Planck later measured 369.8 km/s. The direction lies in
				Crater, next to Leo; the opposite side is in Pisces. It is the solar
				system’s motion, a mix of the Sun’s orbit around the galaxy and the
				galaxy’s own fall through space.
			</p>

			<h3>The recording</h3>
			<p>
				NASA’s LAMBDA archive now publishes FIRAS’s time-ordered data, with a
				guide dated February 2026. The COBE window uses one of its four detector
				channels: 567,325 interferograms from 20 November 1989 to 21 September
				1990, each with its time, sky pixel, pointing, and COBE’s latitude,
				longitude and altitude. Positions are turned to space coordinates with
				Earth’s rotation angle; the Sun’s direction comes from a short
				ephemeris. The heater temperatures are the instrument’s own housekeeping
				log: during sky observations the ICAL read between 2.749 and 2.767 K.
				The window jumps to a real moment when FIRAS looked where you point.
			</p>
			<p>
				The recording is built with the Rerun Python SDK and plays in the Rerun
				web viewer (0.38.1). The viewer’s 14 MB of WebAssembly comes from
				jsDelivr, only on large screens or when you open the recorder.
				Coastlines are from Natural Earth.
			</p>

			<h3>The picture of the sky</h3>
			<p>
				The sky is COBE’s other infrared camera, DIRBE, at 100 microns, with
				zodiacal light removed. It shows dust. The colors only grade its
				brightness, from faint to bright; they are not temperature. The red and
				blue halves that appear after you find our speed are the dipole from
				FIRAS’s map.
			</p>
			<p>
				The sound is an analogy. Two tones a little apart beat, like an
				out-of-tune guitar string, and go quiet together when they match. FIRAS
				made no sound.
			</p>

			<h3>Sources</h3>
			<ul className="hc-sources">
				<li>
					<Out href="https://lambda.gsfc.nasa.gov/product/cobe/firas_products.html">
						COBE FIRAS data products
					</Out>
					, NASA LAMBDA: temperature map, destriped sky spectra, dust map,
					monopole spectrum.
				</li>
				<li>
					<Out href="https://lambda.gsfc.nasa.gov/product/cobe/firas_tod.html">
						FIRAS time-ordered data
					</Out>
					, NASA LAMBDA, with N. Miller’s guide to the HDF5 files (2026).
				</li>
				<li>
					<Out href="https://lambda.gsfc.nasa.gov/product/cobe/dirbe_overview.html">
						COBE DIRBE
					</Out>{" "}
					zodi-subtracted mission average, 100 microns, NASA LAMBDA.
				</li>
				<li>
					<Out href="https://arxiv.org/abs/astro-ph/9605054">
						Fixsen et al. 1996
					</Out>
					, the full FIRAS spectrum.
				</li>
				<li>
					<Out href="https://arxiv.org/abs/0911.1955">Fixsen 2009</Out>, the
					temperature of the cosmic microwave background, 2.72548 K.
				</li>
				<li>
					<Out href="https://ui.adsabs.harvard.edu/abs/1990ApJ...354L..37M">
						Mather et al. 1990
					</Out>
					, the first FIRAS spectrum, from nine minutes of data.
				</li>
				<li>
					<Out href="https://arxiv.org/abs/astro-ph/9407056">COBE tutorial</Out>
					, on the nulled, differential design.
				</li>
				<li>
					<Out href="https://arxiv.org/abs/1807.06205">Planck 2018 I</Out>, the
					dipole at 369.8 km/s.
				</li>
				<li>
					<Out href="https://www.nobelprize.org/prizes/physics/2006/press-release/">
						Nobel Prize in Physics 2006
					</Out>
					, Mather and Smoot.
				</li>
				<li>
					<Out href="https://rerun.io/docs/getting-started">Rerun</Out>, the
					viewer and SDK behind the COBE window.
				</li>
			</ul>
		</div>
	);
}
