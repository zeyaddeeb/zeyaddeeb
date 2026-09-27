import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { JazzLab } from "@/features/jazz/lab";

export const metadata = experimentMetadata(
	"play-that-thing",
	"Play around with a jazz band in your browser. Edit the parts, try a little swing, and listen to early Louis Armstrong recordings.",
);

export default function PlayThatThingPage() {
	return (
		<ExperimentFrame
			id="play-that-thing"
			intro="Lead a five-piece New Orleans band, the lineup of Louis Armstrong’s Hot Five. The band plays a twelve-bar blues around a clock and never stops; you call out what happens next, the way bandleaders did on the records. Every call rewrites the band’s code on the next bar, and you can rewrite it yourself."
			aside={<Notes />}
		>
			<JazzLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="jz-notes">
			<h3>Calling the band</h3>
			<p>
				The calls let you change what the band plays without stopping it. Pick
				one and it rewrites part of the code, ready for the next bar. You can
				see the changed lines in the chart and edit them yourself. It borrows
				from both live coding tools like TidalCycles and Strudel and the calls
				you hear on old jazz records. The name comes from the shout of “Oh, play
				that thing!” in “Dipper Mouth Blues.”
			</p>
			<h3>The clock</h3>
			<p>
				The band loops through a twelve-bar blues. The red arm takes twelve bars
				to go around, then starts again. Each instrument has its own ring.
				Higher notes sit farther from the center, and longer tails mean longer
				notes. The yellow ticks mark the second eighth note of each beat. Turn
				up the swing and you’ll see those ticks shift later.
			</p>
			<h3>Reading the code</h3>
			<p>
				Each line is one bar, split evenly between the steps you type. For
				example, <code>"x x x x"</code> gives you four strums. The notation
				borrows from TidalCycles and Strudel. Here’s what you can use:
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
				Swing pushes the second eighth note of each beat a little later. At{" "}
				<code>2:1</code>, the first note gets two thirds of the beat and the
				second gets one third. Players don’t stick to one ratio at every tempo.
				Friberg and Sundström’s study, listed below, found ratios near 3.5:1 at
				slow tempos and more evenly spaced notes at faster ones.
			</p>
			<h3>The sounds</h3>
			<p>
				All the instrument sounds are made in the browser. The brass uses a
				sawtooth wave that gets brighter as it gets louder. Notes slide up a
				little at the start, then settle into vibrato. The clarinet uses odd
				harmonics and a wide vibrato, loosely based on Johnny Dodds’s playing.
			</p>
			<p>
				For the banjo and piano, a short burst of noise loops through a delay
				and gets a little duller on each pass. That’s Karplus–Strong synthesis.
				Each piano note has two slightly detuned strings for a bit of that old
				upright wobble.
			</p>
			<h3>The band</h3>
			<p>
				The lineup is Louis Armstrong’s original Hot Five: Armstrong on cornet,
				Johnny Dodds on clarinet, Kid Ory on trombone, Lil Hardin Armstrong on
				piano and Johnny St. Cyr on banjo. They started recording in Chicago in
				November 1925. The parts here were written for this experiment; they
				aren’t transcriptions of the recordings.
			</p>
			<p>
				The colors borrow from Kandinsky, who compared yellow to trumpet, light
				blue to flute, and vermilion to brass and tuba.
			</p>
			<h3>The records</h3>
			<p>
				You can listen to two recordings here. In “The St. Louis Blues”
				(Columbia, 1925), Armstrong’s cornet answers Bessie Smith’s singing. In
				“Dipper Mouth Blues” (Okeh, 1923), he plays second cornet in King
				Oliver’s band. Both stream from Wikimedia Commons and are in the public
				domain in the United States.
			</p>
			<h3>Sources</h3>
			<ul className="jz-sources">
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
