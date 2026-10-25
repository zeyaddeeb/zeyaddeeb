import { Out } from "@/features/frame/out";

export function Notes() {
	return (
		<div className="hc-notes">
			<h3>Differential radiometry in FIRAS</h3>
			<p>
				COBE’s Far Infrared Absolute Spectrophotometer (FIRAS) fed sky radiation
				and an internal reference blackbody (ICAL) into two inputs of a
				Michelson interferometer, measuring only their difference across 43
				low-frequency channels (2.3–21.3 cm⁻¹). Nulling the ICAL against the sky
				eliminated ~99% of the signal, making the calibration absolute. The sky
				temperature here is averaged over FIRAS pixels within 4° of your
				pointing (~7° beam FWHM) on the 6,067-pixel map rescaled to the Fixsen
				(2009) value of 2.72548 K, plus galactic dust emission that prevents a
				complete null along the Milky Way plane.
			</p>

			<h3>Dipole velocity and telemetry</h3>
			<p>
				Solar motion through the CMB frame shifts the observed temperature by{" "}
				<code>ΔT/T = (v/c) cos θ</code>, producing a 3.34 mK dipole (~368 km/s
				in FIRAS, 369.8 km/s in Planck) toward galactic coordinates{" "}
				<code>(265.1°, 47.9°)</code> in Crater. The Rerun viewer plays back
				567,325 time-ordered FIRAS interferograms from November 1989 to
				September 1990 alongside orbital ephemeris and ICAL housekeeping
				temperatures, overlaid on the 100 µm DIRBE dust map.
			</p>

			<h3>Sources</h3>
			<ul className="notes-sources">
				<li>
					<Out href="https://lambda.gsfc.nasa.gov/product/cobe/firas_products.html">
						COBE FIRAS data products
					</Out>
					,{" "}
					<Out href="https://lambda.gsfc.nasa.gov/product/cobe/firas_tod.html">
						time-ordered data
					</Out>
					, and{" "}
					<Out href="https://lambda.gsfc.nasa.gov/product/cobe/dirbe_overview.html">
						DIRBE 100 µm map
					</Out>
					, NASA LAMBDA.
				</li>
				<li>
					<Out href="https://arxiv.org/abs/astro-ph/9605054">
						Fixsen et al. 1996
					</Out>{" "}
					and <Out href="https://arxiv.org/abs/0911.1955">Fixsen 2009</Out>{" "}
					(2.72548 K CMB temperature).
				</li>
				<li>
					<Out href="https://ui.adsabs.harvard.edu/abs/1990ApJ...354L..37M">
						Mather et al. 1990
					</Out>{" "}
					and{" "}
					<Out href="https://arxiv.org/abs/astro-ph/9407056">
						COBE differential design tutorial
					</Out>
					.
				</li>
				<li>
					<Out href="https://arxiv.org/abs/1807.06205">Planck 2018 I</Out>{" "}
					(solar dipole at 369.8 km/s) and{" "}
					<Out href="https://rerun.io/docs/getting-started">Rerun</Out>.
				</li>
			</ul>
		</div>
	);
}
