import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { JazzLab } from "@/features/jazz/lab";

export const metadata = experimentMetadata(
	"play-that-thing",
	"Trade fours with models of Louis Armstrong, Johnny Dodds and Kid Ory, built from their transcribed 1920s solos. Every note they play back is traced to its record.",
);

export default function PlayThatThingPage() {
	return (
		<ExperimentFrame
			id="play-that-thing"
			intro="A twelve-bar blues with a band modeled on Louis Armstrong’s Hot Five. Play four bars, then hear a reply built from Armstrong, Johnny Dodds or Kid Ory solo transcriptions. The clock follows the band and shows which recordings the reply draws from."
			aside={<Notes />}
		>
			<JazzLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="jz-notes">
			<h3>Trading fours</h3>
			<p>
				You and the soloist take four bars each. Press the red disc to start
				with Armstrong. On your turn, tap the keys, use A through ; on your
				keyboard, or select Hum to sing into your mic. Use headphones for that.
				Your notes appear on the <code>you</code> line in the chart, followed by
				the soloist’s reply. The suggestion above the keys gives you a phrase to
				start with.
			</p>
			<p>
				Choose Dodds or Ory below the keys, alongside the Memory control. “Lead
				the band” has the tempo, swing and stop-time controls. Each player’s
				part is editable in the chart.
			</p>
			<h3>The solo models</h3>
			<p>
				The models use eight Armstrong solos, six Dodds solos and five Ory
				solos, recorded between 1925 and 1928. That’s about two thousand notes
				from the Weimar Jazz Database, transcribed by hand by researchers at the
				Liszt School of Music. All the solos are transposed to B-flat here, with
				their rhythms and chord information preserved.
			</p>
			<p>
				The model searches those solos for a sequence matching your last few
				notes, then uses what came next to build its reply. It does this one
				note at a time, favoring notes that fit the current chord. The method
				follows François Pachet’s Continuator. Your phrases are added after your
				first turn, so later replies can quote you too.
			</p>
			<h3>Memory</h3>
			<p>
				Memory sets the length of the sequence used for matching. Stitch uses
				one note, which allows more jumps between solos. Quote uses five and
				tends to keep longer phrases from a recording together. Mix falls
				between the two. The clock’s outer ring names the source recording; the
				strip below the keys shows its year and the position in the track.
			</p>
			<h3>Calling the band</h3>
			<p>
				Calls change the band’s parts at the next bar. Each call edits the code
				in the chart, where you can adjust it further. This borrows from
				TidalCycles and Strudel, as well as the shouted directions on old jazz
				records. The name comes from “Oh, play that thing!” in “Dipper Mouth
				Blues.”
			</p>
			<h3>The chart</h3>
			<p>
				The chart has one row per player and twelve bars grouped in fours. Tap a
				bar to move horn notes by a half step, add rests or change the piano and
				banjo rhythms. Chords are editable too: <code>Edim</code> in bar 6 and{" "}
				<code>G7</code> in bar 8 are two common older blues changes. You can
				also type directly into the code for a bar or the full line underneath
				it.
			</p>
			<h3>The clock</h3>
			<p>
				The red arm makes one rotation every twelve bars. Each instrument has
				its own ring: pitch increases outward, and a note’s tail shows its
				duration. Yellow ticks mark the second eighth note of each beat. More
				swing moves those ticks later in the beat.
			</p>
			<h3>Reading the code</h3>
			<p>
				Steps share a bar’s time evenly, so <code>"x x x x"</code> gives you
				four evenly spaced strums. The notation borrows from TidalCycles and
				Strudel.
			</p>
			<dl className="jz-legend">
				<div>
					<dt>
						<code>d5</code>
					</dt>
					<dd>
						A note name followed by its octave. Use <code>b</code> for a flat or{" "}
						<code>#</code> for a sharp. Middle C is <code>c4</code>.
					</dd>
				</div>
				<div>
					<dt>
						<code>~</code>
					</dt>
					<dd>Silence for one step.</dd>
				</div>
				<div>
					<dt>
						<code>[a b]</code>
					</dt>
					<dd>Fit several steps into the time of one step.</dd>
				</div>
				<div>
					<dt>
						<code>&lt;a b c&gt;</code>
					</dt>
					<dd>
						Play a different item each bar, cycling through the list. The
						twelve-bar blues pattern uses this.
					</dd>
				</div>
				<div>
					<dt>
						<code>a@3</code>
					</dt>
					<dd>
						Make a step last three times as long. <code>a _ _</code> does the
						same thing.
					</dd>
				</div>
				<div>
					<dt>
						<code>a!3</code>
					</dt>
					<dd>
						Repeat a step three times. Inside &lt; &gt;, three bars in a row.
					</dd>
				</div>
				<div>
					<dt>
						<code>a*2</code>
					</dt>
					<dd>Repeat a step twice in the same amount of time.</dd>
				</div>
				<div>
					<dt>
						<code>[a, b]</code>
					</dt>
					<dd>Play both at once.</dd>
				</div>
				<div>
					<dt>
						<code>db5&gt;d5</code>
					</dt>
					<dd>Start on one note and slide to the other.</dd>
				</div>
				<div>
					<dt>
						<code>Bb7</code>
					</dt>
					<dd>Set the chord for the piano and banjo on the chord line.</dd>
				</div>
				<div>
					<dt>
						<code>x</code>
					</dt>
					<dd>Piano or banjo: play the chord.</dd>
				</div>
				<div>
					<dt>
						<code>1 3 5</code>
					</dt>
					<dd>
						On the piano, play the first, third or fifth chord tone in the bass.
					</dd>
				</div>
			</dl>
			<h3>Swing</h3>
			<p>
				Swing delays the second eighth note of each beat. A <code>2:1</code>
				ratio gives the first note two thirds of the beat and the second one
				third. Players vary this with tempo. Friberg and Sundström measured
				ratios near 3.5:1 at slower tempos, moving toward even eighths at faster
				tempos.
			</p>
			<h3>The sounds</h3>
			<p>
				All the instruments are synthesized in the browser. The brass uses a
				sawtooth wave that brightens with volume, with a small slide into each
				note and vibrato. The clarinet uses odd harmonics and wide vibrato to
				approximate Johnny Dodds’s sound.
			</p>
			<p>
				The banjo and piano use Karplus–Strong synthesis: a short noise burst
				loops through a delay and loses brightness on each pass. Two slightly
				detuned strings per piano note add the wobble of an old upright.
			</p>
			<h3>The band</h3>
			<p>
				The lineup follows Louis Armstrong’s original Hot Five: Armstrong on
				cornet, Johnny Dodds on clarinet, Kid Ory on trombone, Lil Hardin
				Armstrong on piano and Johnny St. Cyr on banjo. They started recording
				in Chicago in November 1925. The accompaniment was written for this
				experiment. The solo parts come from the transcription models.
			</p>
			<p>
				The palette borrows Kandinsky’s associations between color and sound:
				yellow for trumpet, light blue for flute, and vermilion for brass and
				tuba.
			</p>
			<h3>The records</h3>
			<p>
				Two recordings are included. In “The St. Louis Blues” (Columbia, 1925),
				Armstrong’s cornet answers Bessie Smith’s singing. In “Dipper Mouth
				Blues” (Okeh, 1923), he plays second cornet in King Oliver’s band. Both
				stream from Wikimedia Commons and are in the public domain in the United
				States.
			</p>
			<h3>Sources</h3>
			<ul className="jz-sources">
				<li>
					The Jazzomat Research Project, Weimar Jazz Database, version 2.1
					(2017). The note data used here comes from the database and is shared
					under the{" "}
					<a href="https://opendatacommons.org/licenses/odbl/1-0/">
						Open Database License ↗
					</a>
					.
				</li>
				<li>
					Martin Pfleiderer, Klaus Frieler, Jakob Abeßer, Wolf-Georg Zaddach and
					Benjamin Burkhart, eds.,{" "}
					<cite>Inside the Jazzomat: New Perspectives for Jazz Research</cite>{" "}
					(Schott Campus, 2017).
				</li>
				<li>
					François Pachet, “The Continuator: Musical interaction with style,”{" "}
					<cite>Journal of New Music Research</cite> 32, no. 3 (2003): 333–341.
				</li>
				<li>
					Alain de Cheveigné and Hideki Kawahara, “YIN, a fundamental frequency
					estimator for speech and music,”{" "}
					<cite>Journal of the Acoustical Society of America</cite> 111, no. 4
					(2002): 1917–1930.
				</li>
				<li>
					Anders Friberg and Andreas Sundström, “Swing ratios and ensemble
					timing in jazz performance: Evidence for a common rhythmic pattern,”{" "}
					<cite>Music Perception</cite> 19, no. 3 (2002): 333–349.
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
				<li>
					Wassily Kandinsky, <cite>Concerning the Spiritual in Art</cite>{" "}
					(1911).
				</li>
				<li>
					Gunther Schuller,{" "}
					<cite>Early Jazz: Its Roots and Musical Development</cite> (Oxford
					University Press, 1968).
				</li>
			</ul>
		</div>
	);
}
