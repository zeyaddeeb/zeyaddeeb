import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";
import "./notes.css";

function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="sb-out">
			{children}
			<LifeArrow direction="up-right" className="sb-out__arrow" />
		</a>
	);
}

function Step({ x, title, note }: { x: number; title: string; note: string }) {
	return (
		<g>
			<rect x={x} y="54" width="132" height="64" className="sb-fig__step" />
			<text x={x + 66} y="82" className="sb-fig__label">
				{title}
			</text>
			<text x={x + 66} y="101" className="sb-fig__note">
				{note}
			</text>
		</g>
	);
}

function Arrow({ d, tip }: { d: string; tip: string }) {
	return (
		<g className="sb-fig__arrow">
			<path d={d} />
			<path d={tip} className="sb-fig__tip" />
		</g>
	);
}

function Loop() {
	return (
		<svg viewBox="0 0 640 196" className="sb-fig__svg" aria-hidden="true">
			<circle cx="44" cy="86" r="26" className="sb-fig__you" />
			<text x="44" y="136" className="sb-fig__note">
				you, once
			</text>
			<Arrow d="M72 86H108" tip="M118 86L106 80V92Z" />
			<Step x={120} title="Hear" note="write the words" />
			<Arrow d="M254 86H286" tip="M296 86L284 80V92Z" />
			<Step x={298} title="Learn" note="copy the voice" />
			<Arrow d="M432 86H464" tip="M474 86L462 80V92Z" />
			<Step x={476} title="Say" note="words, in the voice" />
			<Arrow d="M542 120V164H186V132" tip="M186 120L180 132H192Z" />
			<text x="364" y="184" className="sb-fig__note">
				the new recording is all the next generation gets
			</text>
		</svg>
	);
}

export function Notes() {
	return (
		<div className="sb-notes">
			<h3>The piece this borrows</h3>
			<p>
				In 1969 the composer Alvin Lucier read a short text into a tape
				recorder, played the tape back through a loudspeaker into the same room,
				and recorded that. Then he did it again, and again. Every room rings at
				certain pitches, and each pass made those pitches a little louder and
				everything else a little quieter. After enough passes the words were
				gone and the room was playing itself, in the rhythm of his sentences.
			</p>
			<p>
				The text he read describes the process. The title here is from it: he
				says he will go on “until the resonant frequencies of the room reinforce
				themselves so that any semblance of my speech, with perhaps the
				exception of rhythm, is destroyed.” The piece is{" "}
				<Out href="https://en.wikipedia.org/wiki/I_Am_Sitting_in_a_Room">
					I Am Sitting in a Room
				</Out>
				.
			</p>

			<h3>What a generation is here</h3>
			<p>
				There is no room and no loudspeaker. There are two models, and each
				generation runs three steps on the recording before it and on nothing
				else.
			</p>
			<figure className="sb-fig">
				<Loop />
			</figure>
			<p>
				A speech recognizer writes down the words. A voice model studies the
				same recording and builds a voice from it. Then it says those words in
				that voice, and that becomes the recording. Your own take is used
				exactly once. From generation two on, the machine is listening only to
				itself.
			</p>

			<h3>What goes first</h3>
			<p>
				LibriVox once had fourteen volunteers read the same poem, William Ernest
				Henley’s “Invictus.” I took the last two lines from each reading, “I am
				the master of my fate, I am the captain of my soul,” and gave every
				voice 36 generations.
			</p>
			<p>
				The voice goes first, and it goes smoothly. Scored against the original
				reader, likeness averaged 0.92 after one generation, 0.52 after five and
				0.31 after ten. All fourteen were below half by generation nine, most of
				them by six.
			</p>
			<p>
				The words last longer, because the recognizer copes well with a clean
				voice even when it is no longer yours. The first changed word came at
				generation eight on the median, as early as three and as late as twelve.
				Each slip is then kept by every later generation. In thirteen of the
				fourteen runs “fate” became “feet.”
			</p>
			<p>
				None of them still said the line at generation 36. One settled on “I am
				the master of my speech, I am the captain of my soul” and held it for
				more than twenty generations. Others ended at “I’m the king.”, “Thank
				you.”, “Okay.”, “I know.” and “Shh.” Short stock phrases like those are
				what this recognizer falls back on when a recording is too far gone to
				make out, and once a run reaches one it rarely leaves.
			</p>
			<p>
				The recorded run on this page is one of the fourteen, read by Ian King.
				It passes through “I don’t know the master of my feet. I don’t know the
				captain of my soul.” and ends at “I wonder what it is.”
			</p>
			<p>
				Do the voices all turn into one voice? Partly. Two different readers
				start at a likeness of 0.26 to each other. By generation seven their
				copies score 0.54 against each other, which is closer than the 0.40 each
				scores against the person it started as. After about generation eighteen
				they drift apart again.
			</p>

			<h3>Reading the panel</h3>
			<p>
				Voice is how close each generation’s voiceprint is to yours, as a
				percentage, measured by the voice model’s own speaker encoder. Words is
				how many of the words it first heard from you are still there, in order.
				Words in red are not yours.
			</p>
			<p>
				Sound is the average spectrum of each generation, low pitches at the
				bottom. Watch for thin bright bands that appear after a few generations
				and stay. Those are pitches the voice model’s output favors, and since
				each generation learns from the last, they get reinforced. They are the
				nearest thing here to Lucier’s room.
			</p>

			<h3>The line</h3>
			<p>
				Direct puts nothing between one generation and the next. The other two
				send each recording through a bad phone call first, using Opus, the
				codec most voice and video calls run on. Patchy drops a fifth of the
				packets, two at a time. Storm drops them three at a time and adds hiss.
				On a test set the recognizer got about one word in ten wrong per
				generation on the patchy line and about one in four in the storm, so the
				words go much faster.
			</p>

			<h3>Your voice</h3>
			<p>
				Sound travels both ways over the same encrypted socket that carries the
				text. The server can also carry it over WebRTC, the way a video call
				does, but that is switched off for now. You can listen to the recorded
				run without a microphone. To make your own, the microphone is live only
				while you hold the disc. The server keeps your recordings in memory for
				the visit so you can scrub back through them, and drops them when you
				leave. Nothing is written to disk.
			</p>
			<p>
				The copy of your voice can only repeat what the recognizer heard in the
				recording before it. There is nowhere to type words for it to say, and a
				take has to sound like one person from start to finish or it is refused.
			</p>
			<p>
				Each run is repeatable down to the sample for the same recording and the
				same build of the server. Change the arithmetic slightly, for instance
				by running on a different processor, and the run follows the same path
				for about seven generations and then goes somewhere else.
			</p>

			<h3>Built with</h3>
			<ul className="sb-sources">
				<li>
					Hearing is <Out href="https://github.com/openai/whisper">Whisper</Out>
					, the tiny English model, running in Rust on{" "}
					<Out href="https://github.com/huggingface/candle">Candle</Out>.
				</li>
				<li>
					The voice uses the{" "}
					<Out href="https://github.com/samuel-vitorino/sopro">
						Sopro v2 turbo
					</Out>{" "}
					weights by Samuel Vitorino, Apache-2.0, run by a Rust implementation
					written for this page and checked against his reference.
				</li>
				<li>
					The recordings are kept as Opus. The optional call is{" "}
					<Out href="https://github.com/webrtc-rs/webrtc">webrtc-rs</Out>.
				</li>
				<li>
					The readings are from LibriVox’s weekly poem for May 14, 2023,{" "}
					<Out href="https://archive.org/details/invictus_2305.poem_librivox">
						fourteen recordings of “Invictus”
					</Out>
					, all in the public domain.
				</li>
			</ul>
		</div>
	);
}
