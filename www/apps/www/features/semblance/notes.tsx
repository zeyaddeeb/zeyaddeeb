import { Out } from "@/features/frame/out";
import "./notes.css";

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
			<h3>The feedback loop</h3>
			<p>
				In Alvin Lucier’s 1969 composition{" "}
				<Out href="https://en.wikipedia.org/wiki/I_Am_Sitting_in_a_Room">
					I Am Sitting in a Room
				</Out>
				, a spoken passage is played into a room and re-recorded repeatedly
				until room resonances replace the speech. Here each generation passes
				the previous audio through speech recognition and zero-shot voice
				cloning:
			</p>
			<figure className="sb-fig">
				<Loop />
			</figure>
			<p>
				Whisper (tiny.en) transcribes the audio, Sopro v2 turbo extracts a
				speaker embedding from the same clip and synthesizes the transcript, and
				the resulting Opus audio becomes the sole input to the next generation.
				Optional channel degradation simulates 20% or 30% packet loss and line
				noise.
			</p>

			<h3>Drift across 36 generations</h3>
			<p>
				Across 14 LibriVox readings of the closing lines of Henley’s “Invictus,”
				speaker cosine similarity to the original voice averaged 0.92 at
				generation 1, 0.52 at generation 5, and 0.31 at generation 10, while
				pairwise similarity between different speakers temporarily converged
				from 0.26 to 0.54 by generation 7. Transcription errors appeared at a
				median of generation 8 (“fate” → “feet” in 13 of 14 runs) and compounded
				until Whisper fell back to short stock phrases. Spectral bands visible
				in the spectrogram reflect frequencies reinforced by the synthesizer on
				each pass.
			</p>

			<h3>Built with</h3>
			<ul className="notes-sources">
				<li>
					<Out href="https://github.com/openai/whisper">Whisper</Out> (tiny.en)
					and{" "}
					<Out href="https://github.com/samuel-vitorino/sopro">
						Sopro v2 turbo
					</Out>{" "}
					(Apache-2.0, Samuel Vitorino), running in Rust on{" "}
					<Out href="https://github.com/huggingface/candle">Candle</Out>.
				</li>
				<li>
					Opus encoding and optional transport via{" "}
					<Out href="https://github.com/webrtc-rs/webrtc">webrtc-rs</Out>{" "}
					(session audio stays in memory only).
				</li>
				<li>
					Sample recordings from LibriVox’s{" "}
					<Out href="https://archive.org/details/invictus_2305.poem_librivox">
						“Invictus” collection
					</Out>{" "}
					(public domain).
				</li>
			</ul>
		</div>
	);
}
