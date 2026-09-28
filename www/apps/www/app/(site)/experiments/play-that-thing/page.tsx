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
			intro="Can a machine keep jazz alive? Here, Louis Armstrong’s Hot Five plays a twelve-bar blues around a clock. You play four bars, and a model of Armstrong, Johnny Dodds or Kid Ory answers with the next four. Each model knows only the notes its player recorded in the 1920s, and it shows you which record every piece of its answer came from."
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
				Trading fours is taking turns with another soloist, four bars at a time.
				Press the red disc to let Armstrong start, then try answering him. You
				can tap the keys, use A through ; on your keyboard, or press Hum and
				sing into your mic. Headphones help if you’re singing. As your turn
				ends, your notes appear in the chart on the <code>you</code> line, and
				he plays the next four bars. If you’re unsure what to play, there’s a
				suggestion above the keys.
			</p>
			<p>
				You can switch to Dodds or Ory and adjust Memory below the keys. Open
				“Lead the band” when you want to change the swing, tempo or stop time,
				or edit what the band plays. You’ll find each player’s part in the
				chart.
			</p>
			<h3>What the models know</h3>
			<p>
				There’s a small collection of recordings behind each player: eight
				Armstrong solos, six by Dodds and five by Ory, all from 1925–1928. The
				notes come from the Weimar Jazz Database, where researchers at the Liszt
				School of Music transcribed the solos by hand. It adds up to about two
				thousand notes. Here, the solos are all moved into B-flat, keeping the
				rhythm of each note and a record of the chord underneath it.
			</p>
			<p>
				To answer you, the model looks for your last few notes in those solos.
				When it finds a match, it picks up what the player played next. It
				repeats that process one note at a time, giving preference to notes that
				fit the band’s current chord. This follows François Pachet’s Continuator
				method from 2002. After your first turn, your phrases join the
				collection too, so you might hear something you just played come back to
				you.
			</p>
			<h3>Memory</h3>
			<p>
				Memory controls how many notes the model looks back at when it searches
				for a match. Stitch looks back one note, so it has plenty of places to
				go, jumping between solos to make new lines. Sometimes those lines
				wander. Quote looks back five, so there are fewer matches and it tends
				to stay with a phrase from the original recording for longer. Mix sits
				in between. Try both ends and listen for the difference. The outer ring
				of the clock names each record as you hear it, and the strip below the
				keys adds the year and the time in each track.
			</p>
			<h3>Can AI save jazz?</h3>
			<p>
				I’m more interested in whether this makes you want to listen to the
				records. The model works with phrases people have already played,
				choosing where to cut them and how to join them together. But hearing an
				Armstrong phrase answer yours can make you curious about where it came
				from. You can follow it back to, say, 1:44 in “Got No Blues” and hear
				what he was doing with the rest of the band.
			</p>
			<h3>Calling the band</h3>
			<p>
				Try a call while the band is playing. It changes part of the code, and
				you’ll hear the result at the next bar. The changed lines show up in the
				chart, where you can keep editing them yourself. The idea comes from
				live coding tools like TidalCycles and Strudel, and from the calls you
				hear musicians make on old records. “Play That Thing” takes its name
				from the shout of “Oh, play that thing!” in “Dipper Mouth Blues.”
			</p>
			<h3>The chart</h3>
			<p>
				The chart shows the same music as the clock, laid out in rows: one for
				each player, with twelve bars grouped in fours. Tap a bar to edit it.
				You can move horn notes up or down a half step, replace them with rests,
				or try a different rhythm for the piano and banjo. You can change the
				chords too. Try <code>Edim</code> in bar 6 or <code>G7</code> in bar 8,
				two common changes in older blues. If you prefer typing, each bar shows
				its code, and the full line is just underneath.
			</p>
			<h3>The clock</h3>
			<p>
				One trip around the clock is a twelve-bar blues. Follow the red arm to
				see where the band is; when it gets back to the top, they start another
				round. Each instrument has a ring, with higher notes farther from the
				center and longer tails for notes that last longer. The yellow ticks
				mark the second eighth note of each beat. Watch them move later as you
				turn up the swing.
			</p>
			<h3>Reading the code</h3>
			<p>
				Each line fills one bar. Whatever steps you type share that time evenly,
				so <code>"x x x x"</code> gives you four evenly spaced strums. The
				notation borrows from TidalCycles and Strudel. Here’s a quick guide:
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
				Try turning up the swing: the second eighth note of each beat lands a
				little later. At <code>2:1</code>, the first note gets two thirds of the
				beat and the second gets one third. In practice, players vary that
				balance with the tempo. Friberg and Sundström’s study, listed below,
				found ratios near 3.5:1 in slower playing, with the notes becoming more
				evenly spaced as the tempo picked up.
			</p>
			<h3>The sounds</h3>
			<p>
				The browser makes all the instrument sounds as you play. For the brass,
				a sawtooth wave gets brighter with the volume, and notes slide up a
				little before settling into vibrato. The clarinet’s odd harmonics and
				wide vibrato are a loose attempt at Johnny Dodds’s sound.
			</p>
			<p>
				The banjo and piano start with a short burst of noise that loops through
				a delay, getting a little duller each time around. This is called
				Karplus–Strong synthesis. Each piano note also has two slightly detuned
				strings to give it some of the wobble of an old upright.
			</p>
			<h3>The band</h3>
			<p>
				The lineup is Louis Armstrong’s original Hot Five: Armstrong on cornet,
				Johnny Dodds on clarinet, Kid Ory on trombone, Lil Hardin Armstrong on
				piano and Johnny St. Cyr on banjo. They started recording in Chicago in
				November 1925. The accompaniment here was written for the experiment;
				the solo models draw on the transcriptions described above.
			</p>
			<p>
				The colors come from Kandinsky’s comparisons between color and sound:
				yellow reminded him of a trumpet, light blue of a flute, and vermilion
				of brass and tuba.
			</p>
			<h3>The records</h3>
			<p>
				There are two recordings to listen to here. In “The St. Louis Blues”
				(Columbia, 1925), Armstrong’s cornet answers Bessie Smith’s singing. In
				“Dipper Mouth Blues” (Okeh, 1923), he plays second cornet in King
				Oliver’s band. Both stream from Wikimedia Commons and are in the public
				domain in the United States.
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
