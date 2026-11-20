import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";
import { checkpoint, STUDY, signed } from "./model";

const sealed = `${new Intl.DateTimeFormat("en-US", {
	dateStyle: "long",
	timeStyle: "short",
	timeZone: "UTC",
}).format(new Date(STUDY.sealed))} UTC`;
const held = Object.values(STUDY.verdicts).filter(Boolean).length;
const total = Object.keys(STUDY.verdicts).length;
const fixed = (x: number, digits = 2) => x.toFixed(digits).replace("-", "−");

export function Notes() {
	const qb = checkpoint("qwen_base");
	const qi = checkpoint("qwen_instruct");
	const o2b = checkpoint("olmo2_base");
	const o2i = checkpoint("olmo2_instruct");
	const o3t = checkpoint("olmo3_think");
	const kept = STUDY.pairs.filter((p) => p.partialHi < 0).length;
	const dropped = STUDY.pairs.filter((p) => p.partialHi >= 0);
	const narrow = STUDY.pairs.find((p) => p.hi > -0.01);
	const pilot = STUDY.pilot;

	return (
		<div className="notes-grid">
			<Note title="What the square shows" open>
				<p>
					Each dot is one of the 600 fair coin sequences from the study, 16
					flips each, regenerated here from the same seed the models saw. Its
					color is how often the coin switches between heads and tails.
				</p>
				<p>
					Across is what the model says. It is asked whether the flips came from
					a fair coin or a rigged one, in three wordings and with the answer
					order swapped, and the score is how much it leans toward rigged. Up is
					what it expects: the same flips are placed after “Here are 16 flips of
					a fair coin” and after “…of a rigged coin”, and the dot rises when the
					model finds them likelier from a rigged coin.
				</p>
				<p>
					If the answer came from the model’s own predictions, the dots would
					hug the dashed diagonal. The solid line is the fitted slope, the
					agreement. The coin panel ranks the picked coin against the other 599
					on both readings.
				</p>
			</Note>

			<Note title="What the sealed run found">
				<p>
					{held} of {total} registered predictions held. In all five base and
					post-trained pairs, post-training weakened the link between saying and
					expecting: Qwen went from {signed(qb.agree[0] ?? 0)} to{" "}
					{signed(qi.agree[0] ?? 0)}, and Llama Instruct now says the opposite
					of what it expects. With the zorp answers factored out, the drop holds
					in {kept} of {STUDY.pairs.length} pairs;{" "}
					{dropped.map((p) => p.label).join(", ")}, whose answers never depend
					on the coin, drops out.
				</p>
				<p>
					Most of the extra switching that tuned models expect is not about
					coins. OLMo 2 1B expects a switch {fixed(o2b.altFair, 3)} of the time
					as a base model and {fixed(o2i.altFair, 3)} after tuning, and{" "}
					{fixed(o2b.altLog, 3)} to {fixed(o2i.altLog, 3)} when the same letters
					are framed as a system log.
				</p>
				<p>
					One prediction failed: OLMo 3 never picks up that habit. Its reasoning
					model expects a switch only {Math.round(o3t.altFair * 100)}% of the
					time, so it expects streaks, yet it calls streaky coins rigged (r ={" "}
					{signed(o3t.template)}).
				</p>
			</Note>

			<Note title="Why there is a zorp button">
				<p>
					This experiment began as a search for pareidolia. In a sealed pilot,
					Qwen2.5 3B Instruct looked at {pilot.grids.toLocaleString("en-US")}{" "}
					grids of random characters and was asked whether each hid a face, or a
					“zorp”. Both maps of what it saw were reproducible (split-half{" "}
					{fixed(pilot.face[0] ?? 0)} for the face, {fixed(pilot.zorp[0] ?? 0)}{" "}
					for the zorp, against a chance level near {fixed(pilot.null)}), and
					they matched each other at {fixed(pilot.cross[0] ?? 0)}.
				</p>
				<p>
					A model’s exact answer is a fixed function of what it is shown, so any
					question sorts the inputs into a tidy pattern. Here every question has
					a twin with made-up labels, and an answer only counts as a judgment
					when it moves far more with the coin than the twin does.
				</p>
			</Note>

			<Note title="How it was sealed">
				<p>
					The predictions, thresholds, model revisions and the hash of every
					analysis file went into a protocol that was itself hashed (
					<code>{STUDY.protocol}</code>) at {sealed}, before the 600 coins of
					seed {STUDY.seed} existed. Calibration on other coins had already
					changed three predictions, and the protocol says which and why.
				</p>
				<p>
					Three passes are close: one threshold met exactly, one cleared by{" "}
					{fixed(0.3 - (qi.agree[2] ?? 0), 3)}, and one pair
					{narrow
						? ` (${narrow.label}) cleared zero by ${fixed(-narrow.hi, 3)}`
						: ""}
					. Checks added after the run, such as factoring out the zorp answers,
					are labeled as such.
				</p>
			</Note>

			<Note title="Limits">
				<p>
					These are small open models, from one to seven billion parameters, on
					one task with three wordings. The intervals cover which coins were
					drawn, not other wordings or retrained models. No human ratings were
					collected; the comparison with people rests on published studies.
				</p>
			</Note>

			<Note title="Sources">
				<ul className="notes-sources">
					<li>
						<Out href="https://doi.org/10.1037/0033-295X.104.2.301">
							Falk and Konold, Making sense of randomness, 1997
						</Out>
					</li>
					<li>
						<Out href="https://doi.org/10.1111/1467-9280.03452">
							Gosselin and Schyns, Superstitious perceptions, 2003
						</Out>
					</li>
					<li>
						<Out href="https://papers.nips.cc/paper/2480-from-algorithmic-to-subjective-randomness">
							Griffiths and Tenenbaum, From algorithmic to subjective
							randomness, 2003
						</Out>
					</li>
					<li>
						<Out href="https://arxiv.org/abs/2305.13264">
							Hu and Levy, Prompting is not a substitute for probability
							measurements, 2023
						</Out>
					</li>
					<li>
						<Out href="https://arxiv.org/abs/2406.00092">
							Van Koevering and Kleinberg, Heads, tails, and AI fails, 2024
						</Out>
					</li>
					<li>
						<Out href="https://arxiv.org/abs/2512.13961">
							Team Olmo, Olmo 3, 2025
						</Out>
					</li>
				</ul>
				<p className="notes-source">
					Weights: Qwen2.5 3B, Llama 3.2 3B, OLMo 2 1B and OLMo 3 7B from
					Hugging Face at pinned revisions, scored in float32.
				</p>
			</Note>
		</div>
	);
}
