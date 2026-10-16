import { Note } from "./note";
import { Out } from "./out";
import "./notes.css";

export function Notes() {
	return (
		<div className="cb-notes">
			<div className="cb-notes__grid">
				<Note title="A talk about clothes" open>
					<p>
						On 28 August 1878 Pafnuty Chebyshev, better known for his
						polynomials, gave a talk in Paris called “Sur la coupe des
						vêtements”, on the cutting of clothes. Two years earlier he had
						heard Édouard Lucas, the inventor of the Tower of Hanoi, speak on
						the geometry of weaving, and he wanted to say how to cut cloth for
						“a body of any shape”.
					</p>
					<p>
						His draft fills nineteen pages of a school exercise book. It came
						with five cardboard cut-outs and a rubber ball he had dressed in two
						pieces of cloth, which went round the room and, by one account,
						ended up in a game in a school yard. A week later Gaston Darboux
						wrote to Jules Houël: “It is very original, but very ingenious.”
						Chebyshev never marked the manuscript for printing, so it stayed
						unpublished in French until Étienne Ghys printed a transcription in
						2011.
					</p>
				</Note>

				<Note title="Squares that lean">
					<p>
						His starting point fits in a sentence. Wrap a body in cloth with
						small checks and “the rectangles turn into parallelograms whose
						angles depart more or less from ninety degrees, but the length of
						the sides does not change appreciably.” Woven cloth cannot stretch
						along its threads. All it can do is let the crossings scissor.
					</p>
					<p>
						He added that two threads through one point, at right angles and
						along the shortest paths on the body, decide where every other
						thread goes. That is the pin and the grain here. The page then lays
						the cloth the way he would with a compass: each new crossing is the
						point one thread length from its two neighbors, row after row, up to
						29,241 crossings for a piece on the ball.
					</p>
				</Note>

				<Note title="Why a ball leans the checks">
					<p>
						Walk around any patch of cloth on a curved body and add up its four
						corner angles. On a flat table they make four right angles. On a
						ball they fall short, and the shortfall is exactly how much of the
						ball the patch covers. This is Gauss’s curvature, read off the
						cloth. J. N. Hazzidakis wrote it down for these nets in 1880, and
						the tests behind this page check it to two decimal places.
					</p>
					<p>
						A ball closes the checks one way and a saddle the other. A bagel
						does both: its outside curves like a ball, its hole like a saddle,
						and the two cancel exactly. A cylinder or a cone does neither, which
						is why sleeves and lampshades are easy. On a ball the checks lean
						fastest along the diagonals, so a pattern ends up with its corners
						on the threads and its edges cut on the bias, as in Chebyshev’s own
						two pieces.
					</p>
				</Note>

				<Note title="One piece, 2011">
					<p>
						Chebyshev covered half the ball with each piece. Ghys followed the
						same net further, “48.0151% further than Chebyshev, to be precise”,
						and showed that one piece cut like an envelope dresses the whole
						ball. The seam is two arcs crossing at the bottom, and at four
						points the threads lie flat on top of each other.
					</p>
					<p>
						The angle between the threads obeys the sine-Gordon equation, a
						famous one in physics, and on Chebyshev’s net it depends only on the
						product of the two thread lengths from the pin. It first falls to
						zero at 1.8616 for a ball of radius one. The cloth here folds at the
						same place, which is one of the checks that the compass is doing the
						right thing.
					</p>
				</Note>

				<Note title="Thread has width">
					<p>
						Chebyshev’s threads have no thickness, so they can lean until they
						lie flat. Real yarns touch first. Threads of width w spaced s apart
						touch when the checks lean by arccos(w/s), and past that point the
						cloth wrinkles instead of following the body. Composites engineers
						call it the locking angle. The thread slider sets w/s, and the small
						swatch shows the gaps closing.
					</p>
					<p>
						With threads that lock at 37°, Chebyshev’s two halves leave about a
						tenth of the ball bare, along the diagonals where the checks lean
						fastest. Turn one half 45° and its threads cover the other’s
						diagonals: two pieces close again. The two halves of a tennis ball
						interlock the same way, though felt is not woven and can stretch.
					</p>
				</Note>

				<Note title="Where the seams go">
					<p>
						Every piece is smoothed out from its pin at the same pace, and a
						seam forms where two meet. The pace counts lean as well as length: a
						stretch of cloth whose checks lean hard costs up to twice as much,
						because a tailor would rather use cloth that sits square. With that
						rule one piece on the ball finds Ghys’s seam without being told
						where it is.
					</p>
					<p>
						Covered is measured at 8,000 points spread evenly over the surface.
						Cloth is the area of flat cloth used per area of surface covered.
						Leaning checks pack their threads closer, so a ball always takes
						more cloth than its own skin: 1.08 times for Chebyshev’s halves.
					</p>
				</Note>

				<Note title="Out of whole cloth">
					<p>
						Most accounts say Chebyshev took this up because a clothing firm
						hired him to save cloth on uniforms for the Crimean War. The story
						goes back to a 1996 post on the MacTutor history site with no
						sources. In 2025 Victor Tapia checked it against every biography and
						record he could find and concluded that it was “a fabrication,
						invented out of whole cloth.” Chebyshev himself credits Lucas’s
						talk.
					</p>
				</Note>

				<Note title="Who cuts cloth like this now">
					<p>
						Carbon fiber parts are laid up on molds with the same model. Draping
						software asks for a seed point and one warp and one weft direction
						through it, then lays the net out from there, exactly as Chebyshev
						proposed. Frei Otto’s 1975 timber gridshell in Mannheim is a
						Chebyshev net of wooden laths, bent from flat. In 1936 the engineer
						Popov, translating the manuscript into Russian, applied it to
						airship envelopes, kites and parachutes.
					</p>
				</Note>

				<Note title="What it leaves out" wide>
					<p>
						The cloth has no weight, no friction and no stiffness against
						bending, and its threads do not stretch at all. Real yarns stretch a
						little, and tailors use that, along with darts and ease, to get past
						what pure geometry allows. The forms are exact shapes: a ball of
						radius one, a saddle z = (x² − y²)/2 cut off at radius 1.25, and a
						bagel whose tube is half its ring. The fewest-piece counts are the
						best a search found, not proofs that nothing better exists.
					</p>
				</Note>

				<Note title="Sources" wide>
					<ul className="cb-sources">
						<li>
							<Out href="https://perso.ens-lyon.fr/ghys/articles/coupevetements.pdf">
								É. Ghys, Sur la coupe des vêtements, 2011
							</Out>
							, with Chebyshev’s manuscript transcribed by A.-M. Décaillot.
						</li>
						<li>
							<Out href="https://doi.org/10.1007/s00283-025-10409-x">
								V. Tapia, Chebyshev and Garment Cutting: Debunking Some Myths,
								2025
							</Out>
						</li>
						<li>
							A. G. Prodromou and J. Chen, On the relationship between shear
							angle and wrinkling of textile composite preforms, Composites Part
							A, 1997.
						</li>
						<li>
							<Out href="https://arxiv.org/abs/1110.5179">
								S. Allaoui et al., Experimental approach for optimizing dry
								fabric formability, 2010
							</Out>
						</li>
						<li>
							<Out href="https://support.ptc.com/help/creo/creo_pma/r10.0/usascii/composite_design/about_draping_simulation.html">
								Creo, Draping simulation: seed point and fiber directions
							</Out>
						</li>
						<li>
							<Out href="https://app.iass2024.org/files/IASS_2024_Paper_182.pdf">
								IASS 2024, on the Mannheim Multihalle as a Chebyshev net
							</Out>
						</li>
					</ul>
				</Note>
			</div>
		</div>
	);
}
