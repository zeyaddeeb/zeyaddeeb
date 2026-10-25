import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { JazzLab } from "@/features/jazz/lab";

export const metadata = experimentMetadata(
	"play-that-thing",
	"Trade four-bar blues solos with variable-order Markov models trained on transcribed 1920s solos by Louis Armstrong, Johnny Dodds, and Kid Ory.",
);

export default function PlayThatThingPage() {
	return (
		<ExperimentFrame
			id="play-that-thing"
			intro="Trade four-bar solos over a twelve-bar blues with models built from transcribed 1925–1928 recordings of Louis Armstrong, Johnny Dodds, and Kid Ory. The circular chart tracks the band and shows which recording each phrase comes from."
			aside={<Notes />}
		>
			<JazzLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="jz-notes">
			<h3>The solo models</h3>
			<p>
				The corpus comprises eight Louis Armstrong solos, six Johnny Dodds
				solos, and five Kid Ory solos recorded between 1925 and 1928 (~2,000
				notes from the Weimar Jazz Database), transposed to B-flat with rhythms
				and harmonic context preserved. Following François Pachet’s Continuator,
				a variable-order Markov model matches the end of your phrase and extends
				it note by note while weighting chord tones. Memory sets the context
				length: Stitch (1 note), Mix, or Quote (5 notes).
			</p>
			<h3>The chart and synthesizer</h3>
			<p>
				The twelve-bar chart uses a TidalCycles/Strudel-inspired mini-notation
				where steps divide a bar evenly. All instruments are synthesized in Web
				Audio: sawtooth brass with pitch-bend attack, odd-harmonic clarinet, and
				Karplus–Strong plucked strings for banjo and upright piano.
			</p>
			<dl className="jz-legend">
				<div>
					<dt>
						<code>d5</code>
					</dt>
					<dd>
						Note name and octave (<code>b</code> flat, <code>#</code> sharp;
						middle C is <code>c4</code>).
					</dd>
				</div>
				<div>
					<dt>
						<code>~</code>
					</dt>
					<dd>Rest for one step.</dd>
				</div>
				<div>
					<dt>
						<code>[a b]</code>
					</dt>
					<dd>Subdivide one step evenly.</dd>
				</div>
				<div>
					<dt>
						<code>&lt;a b c&gt;</code>
					</dt>
					<dd>Alternate across bars.</dd>
				</div>
				<div>
					<dt>
						<code>a@3</code>
					</dt>
					<dd>
						Hold for three steps (equivalent to <code>a _ _</code>).
					</dd>
				</div>
				<div>
					<dt>
						<code>a!3</code>
					</dt>
					<dd>Repeat a step three times.</dd>
				</div>
				<div>
					<dt>
						<code>a*2</code>
					</dt>
					<dd>Play twice within one step.</dd>
				</div>
				<div>
					<dt>
						<code>[a, b]</code>
					</dt>
					<dd>Play simultaneously.</dd>
				</div>
				<div>
					<dt>
						<code>db5&gt;d5</code>
					</dt>
					<dd>Slide between pitches.</dd>
				</div>
				<div>
					<dt>
						<code>Bb7 / x / 1 3 5</code>
					</dt>
					<dd>
						Set the chord, strum it, or play root/third/fifth in the bass.
					</dd>
				</div>
			</dl>
			<h3>Sources</h3>
			<ul className="notes-sources">
				<li>
					The Jazzomat Research Project, Weimar Jazz Database v2.1 (2017),{" "}
					<a href="https://opendatacommons.org/licenses/odbl/1-0/">
						Open Database License ↗
					</a>
					.
				</li>
				<li>
					François Pachet, “The Continuator: Musical interaction with style,”{" "}
					<cite>Journal of New Music Research</cite> 32, no. 3 (2003): 333–341.
				</li>
				<li>
					Alain de Cheveigné and Hideki Kawahara, “YIN, a fundamental frequency
					estimator for speech and music,” <cite>JASA</cite> 111, no. 4 (2002):
					1917–1930.
				</li>
				<li>
					Anders Friberg and Andreas Sundström, “Swing ratios and ensemble
					timing in jazz performance,” <cite>Music Perception</cite> 19, no. 3
					(2002): 333–349.
				</li>
				<li>
					Kevin Karplus and Alex Strong, “Digital synthesis of plucked-string
					and drum timbres,” <cite>Computer Music Journal</cite> 7, no. 2
					(1983): 43–55.
				</li>
				<li>
					Alex McLean, “Making programming languages to dance to: live coding
					with Tidal,” <cite>FARM ’14</cite> (ACM, 2014).
				</li>
			</ul>
		</div>
	);
}
