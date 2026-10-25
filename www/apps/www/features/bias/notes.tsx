import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";

export function Notes() {
	return (
		<div className="cb-notes">
			<div className="notes-grid">
				<Note title="Chebyshev nets (1878)" open>
					<p>
						In his 1878 Paris lecture “Sur la coupe des vêtements” (transcribed
						by Étienne Ghys in 2011), Pafnuty Chebyshev modeled woven cloth as
						an inextensible grid of threads whose crossings can shear into
						rhombuses. Fixing two orthogonal geodesics through a pin determines
						every subsequent thread crossing by stepping one thread spacing from
						two neighbors, up to 29,241 crossings per piece on the sphere.
					</p>
				</Note>

				<Note title="Curvature and sine-Gordon">
					<p>
						By Hazzidakis’s 1880 formula, the deficit in the four interior
						angles of any net patch equals the integral of Gaussian curvature
						over that patch. Positive curvature (the sphere) shears squares
						along their diagonals so pattern edges are cut on the bias; negative
						curvature (the saddle) shears them the opposite way; the torus has
						zero total curvature. On the unit sphere, the crossing angle obeys
						the sine-Gordon equation and first reaches zero at product distance
						1.8616, allowing Ghys’s single envelope-shaped piece to cover the
						entire sphere.
					</p>
				</Note>

				<Note title="Locking angle and seam placement">
					<p>
						Real yarns of width <em>w</em> and pitch <em>s</em> jam when the
						shear angle reaches <code>arccos(w/s)</code>. At a 37° locking
						angle, Chebyshev’s two aligned hemispheres leave ~10% of the sphere
						bare along the diagonals; rotating one piece by 45° closes the gap
						like a tennis ball. Multiple pieces grow outward from their pins
						using a fast-marching cost that penalizes high shear, forming seams
						where fronts meet.
					</p>
				</Note>

				<Note title="Applications">
					<p>
						Kinematic draping solvers for carbon-fiber preforms and gridshell
						structures (such as Frei Otto’s 1975 Mannheim Multihalle) use the
						same seed-point and geodesic construction. The common story that
						Chebyshev was commissioned to save cloth during the Crimean War was
						shown by Victor Tapia (2025) to be a modern invention; Chebyshev
						credited Édouard Lucas’s 1876 talk on weaving geometry.
					</p>
				</Note>

				<Note title="Sources" wide>
					<ul className="notes-sources">
						<li>
							<Out href="https://perso.ens-lyon.fr/ghys/articles/coupevetements.pdf">
								É. Ghys, Sur la coupe des vêtements, 2011
							</Out>{" "}
							(with A.-M. Décaillot’s transcription of Chebyshev’s manuscript).
						</li>
						<li>
							<Out href="https://doi.org/10.1007/s00283-025-10409-x">
								V. Tapia, Chebyshev and Garment Cutting: Debunking Some Myths,
								2025
							</Out>
							.
						</li>
						<li>
							A. G. Prodromou and J. Chen, “On the relationship between shear
							angle and wrinkling of textile composite preforms,”{" "}
							<em>Composites Part A</em>, 1997.
						</li>
						<li>
							<Out href="https://arxiv.org/abs/1110.5179">
								S. Allaoui et al., Experimental approach for optimizing dry
								fabric formability, 2010
							</Out>
							.
						</li>
						<li>
							<Out href="https://support.ptc.com/help/creo/creo_pma/r10.0/usascii/composite_design/about_draping_simulation.html">
								Creo, Draping simulation: seed point and fiber directions
							</Out>
							.
						</li>
						<li>
							<Out href="https://app.iass2024.org/files/IASS_2024_Paper_182.pdf">
								IASS 2024, Mannheim Multihalle as a Chebyshev net
							</Out>
							.
						</li>
					</ul>
				</Note>
			</div>
		</div>
	);
}
