import recordings from "@/public/show-your-work/recorded.json";
import { FORGE } from "./forge-data";
import { GLANCE } from "./glance-data";
import { Note } from "./note";
import { Out } from "./out";
import { atOnce, notes, reach, type Spec, thousands } from "./readers";
import { SAMPLES } from "./readers-data";
import { EMPTY, firstWritten, type Recording, reduce, words } from "./reasoner";
import { CHANCE } from "./task";
import "./notes.css";

const pct = (p: number) => `${Math.round(p * 100)}%`;

const NUMBERS = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
];

const spelled = (n: number) => NUMBERS[n] ?? String(n);

const steps = (s: Spec | undefined) =>
	s ? `${s.steps.toLocaleString("en-US")} steps of ${s.batch} shuffles` : "";

const SOURCES = [
	{
		href: "https://doi.org/10.1016/0022-0000(89)90037-8",
		text: "Barrington (1989), Bounded-width polynomial-size branching programs recognize exactly those languages in NC1",
	},
	{
		href: "https://arxiv.org/abs/2210.10749",
		text: "Liu, Ash, Goel, Krishnamurthy and Zhang (2023), Transformers Learn Shortcuts to Automata",
	},
	{
		href: "https://arxiv.org/abs/2207.00729",
		text: "Merrill and Sabharwal (2023), The Parallelism Tradeoff: Limitations of Log-Precision Transformers",
	},
	{
		href: "https://arxiv.org/abs/2310.07923",
		text: "Merrill and Sabharwal (2024), The Expressive Power of Transformers with Chain of Thought",
	},
	{
		href: "https://arxiv.org/abs/2402.12875",
		text: "Li, Liu, Zhou and Ma (2024), Chain of Thought Empowers Transformers to Solve Inherently Serial Problems",
	},
	{
		href: "https://arxiv.org/abs/2307.13702",
		text: "Lanham and colleagues (2023), Measuring Faithfulness in Chain-of-Thought Reasoning",
	},
	{
		href: "https://arxiv.org/abs/2501.19393",
		text: "Muennighoff and colleagues (2025), s1: Simple test-time scaling",
	},
	{
		href: "https://arxiv.org/abs/2412.21187",
		text: "Chen and colleagues (2024), Do NOT Think That Much for 2+3=? On the Overthinking of o1-Like LLMs",
	},
	{
		href: "https://huggingface.co/Qwen/Qwen3.5-4B",
		text: "Qwen3.5-4B model card (Apache 2.0)",
	},
];

function list(items: string[]) {
	if (items.length < 2) return items.join("");

	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const runs = (recordings as unknown as Recording[]).map((r) => {
	const thought = r.events.reduce((t, [, e]) => reduce(t, e), EMPTY);
	const first = firstWritten(thought.text);

	return {
		swaps: r.swaps.length,
		total: words(thought.text),
		first: first === null ? null : words(thought.text.slice(0, first)),
		finished: thought.meter.phase === "finished",
	};
});

export function Notes() {
	const deepest = atOnce.at(-1);
	const worst = Math.min(...(notes?.right ?? [1]));
	const reaches = atOnce.map((s, i) => {
		const n = reach(s.right);
		const unit = i === 0 ? ` ${n === 1 ? "swap" : "swaps"}` : "";

		return `${n}${unit} with ${spelled(s.layers)}`;
	});
	const first = GLANCE.right.slice(0, 3).map(pct);
	const stay = [1, 2, 3].map((n) => pct(CHANCE + (1 - CHANCE) * 0.5 ** n));
	const tail = GLANCE.right.slice(9);
	const late = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);

	return (
		<div className="sw-notes">
			<div className="sw-notes__grid">
				<Note title="Two machines, one difference" open>
					<p>
						Both machines are transformers, the design inside every large
						language model, cut down to {notes?.width ?? 64} numbers per token.
						Both learned from the same random shuffles of up to 60 swaps, with
						the same answer key: where the ball is after every swap. Answers at
						once has to say where the ball is in the same pass that reads the
						swap. Writes it down does too, but each answer is fed back into its
						own input before the next swap arrives. That is the only difference.
					</p>
					<p>
						Writes it down has one layer and {thousands(notes?.parameters ?? 0)}{" "}
						numbers. Answers at once comes with{" "}
						{list(atOnce.map((s) => String(s.layers)))} layers, up to{" "}
						{thousands(deepest?.parameters ?? 0)} numbers. All of them were
						trained on a laptop with Candle, the answer-at-once ones for{" "}
						{steps(atOnce[0])}
						{deepest && deepest.batch !== atOnce[0]?.batch
							? ` (the ${spelled(deepest.layers)}-layer one for ${steps(deepest)})`
							: ""}
						, and Writes it down for {steps(notes)}. They run here in your
						browser as WebAssembly, from 16-bit weights checked against the
						trainer to within 0.0001 on every probability.
					</p>
				</Note>

				<Note title="What a layer buys">
					<p>
						A transformer answers with one pass through its layers. In each
						layer, every position may look back at everything before it and
						combine what it finds. So the work behind one answer is fixed in
						advance: however hard the question, it gets the same number of
						rounds of looking and combining.
					</p>
					<p>
						Following the ball is a chain. Where it ends up depends on where it
						was a swap ago, which depends on the swap before that. In one pass,
						the only way down a long chain is to combine swaps in pairs, then
						pairs of pairs, so reaching twice as far takes at least one more
						layer. Measured on {SAMPLES.toLocaleString("en-US")} fresh shuffles
						per length, how far each one follows before it falls below 90%:{" "}
						{list(reaches)} layers. Writes it down, with one layer,{" "}
						{worst >= 0.9995
							? "gets every one right"
							: `never drops below ${pct(worst)}`}{" "}
						up to 60 swaps.
					</p>
				</Note>

				<Note title="Why five cups">
					<p>
						The street game uses three cups, and three is the easy case. The
						ways of shuffling three or four things form what mathematicians call
						solvable groups, and for those a fixed number of layers can follow
						any number of swaps with a clever shortcut (Liu and colleagues,
						2023). Five is the first count where the shuffles stop being
						solvable.
					</p>
					<p>
						In 1989 David Barrington showed that following shuffles of five
						things is as hard as anything a circuit of logarithmic depth can
						compute, a class called NC1. Transformers of the usual kind live in
						a smaller class, TC0 (Merrill and Sabharwal, 2023). No one has
						proved the two classes differ, but almost everyone expects they do.
						If they do, no transformer with a fixed number of layers, at any
						size, follows five cups for every length of shuffle.
					</p>
				</Note>

				<Note title="Why the notes fix it">
					<p>
						Writing the ball down turns one long chain into many links of one.
						To write the next note it only needs the last note and the newest
						swap, a job one layer can do at any length. Each note is a step of
						work done outside the model and handed back to it, so a model with a
						fixed number of layers gets one more pass for every note it writes.
					</p>
					<p>
						Merrill and Sabharwal (2024) proved this is exactly what chain of
						thought adds: given enough steps of writing, a transformer can
						follow any finite-state machine, the five-cup game included. Li and
						colleagues (2024) trained shallow transformers on shuffles of five
						things and saw the same split you see here.
					</p>
				</Note>

				<Note title="The notes do the work">
					<p>
						Tap a note on the tape and change it. Every later note follows the
						forgery, and so does the answer, because the model believes what it
						wrote over the swaps it saw. With one note forged at random in each
						of 1,000 shuffles, its final answer followed the forgery{" "}
						{pct(notes?.follows ?? 0)} of the time. For this little model the
						notes are the reasoning, not a story told about it afterward.
					</p>
					<p>
						A big model can refuse a forged note for two opposite reasons. It
						can ignore its notes: Lanham and colleagues (2023) planted mistakes
						in the written reasoning of large language models and on several
						tasks the answer usually stayed the same, so the writing was not
						what produced it. Or it can check them.
					</p>
					<p>
						We tried the big one here. In {FORGE.trials} shuffles of{" "}
						{FORGE.swaps} swaps, as soon as it wrote down where the ball starts
						we changed that number and let it go on for {FORGE.window} tokens.{" "}
						{FORGE.caught === FORGE.forged
							? `All ${FORGE.caught} times`
							: `${FORGE.caught} of ${FORGE.forged} times`}{" "}
						it went back to the question and restated the real start before
						using ours, in writing: “No, wait, the prompt says: A ball is under
						the cup in position 5.” It wrote wait, no or actually right after{" "}
						{FORGE.spoke} of the {FORGE.forged} forgeries, and at the same point
						in {FORGE.control} of the same runs left alone. That is checking,
						not ignoring. The start is printed in the question, so it is the
						easiest note to check; a forged middle step would have to be caught
						by redoing the swaps.
					</p>
				</Note>

				<Note title="A big one, at once">
					<p>
						Qwen3.5-4B is an open reasoning model with 4 billion numbers and 32
						layers. Twenty-four of those layers are recurrent: they carry a
						running state from word to word, which in principle could carry the
						ball along. It runs here at 4-bit precision on four CPU cores
						through llama.cpp, and it gets your shuffle in words, one swap per
						line.
					</p>
					<p>
						Made to answer at once, with its thinking switched off, it gets{" "}
						{list(first)} right after one, two and three swaps. Naming the cup
						where the ball started gets {list(stay)}, because a random swap
						moves the ball 40% of the time. Answering at once, it does about as
						well as ignoring the swaps altogether. From 10 to 60 swaps it
						averages {pct(late)}, against a chance of 20% ({GLANCE.count}{" "}
						shuffles per length).
					</p>
				</Note>

				<Note title="The big one, thinking">
					<p>
						Let it think and it writes notes of its own, in English: “Ball is at
						1. Swap is between 2 and 5. 1 is not 2 or 5. Ball remains at 1.”
						That costs it about 60 words a swap, where the little one spends
						one, and it spends a good part of its budget restating the question
						first. Its question ends with “Keep your thinking short.” In three
						test runs without that line it took about twice as long to write an
						answer and never stopped on its own, which on four CPU cores means
						minutes.
					</p>
					<p>
						The lane above the cups shows what it would answer if it had to
						stop: after every line it writes, its thinking is closed and its
						odds for each position are read off. Answer now stops it there. Wait
						does the opposite: when it decides it is done, the word Wait is
						added and it keeps going, the trick from s1 (Muennighoff and
						colleagues, 2025) that made a model check its work and score higher.
						Its budget is 900 tokens plus 80 a swap, up to 4,000.
					</p>
				</Note>

				<Note title="It keeps going">
					<p>
						It often keeps going after it has the answer. In the recorded runs:{" "}
						{list(
							runs.map((r) => {
								const end = r.finished
									? `stopped at word ${r.total.toLocaleString("en-US")}`
									: `was still going at word ${r.total.toLocaleString("en-US")} when its budget ran out`;

								return r.first === null
									? `with ${r.swaps} swaps it wrote no answer and ${end}`
									: `with ${r.swaps} swaps it wrote an answer at word ${r.first.toLocaleString("en-US")} and ${end}`;
							}),
						)}
						, re-reading the question and redoing swaps it had already done.
						Chen and colleagues (2024) measured this habit, overthinking, across
						reasoning models of the o1 kind.
					</p>
					<p>
						Cut off in the middle of a re-check, it answers with whatever
						position it was just working on, which is why the lane above the
						cups can be wrong after its notes were right. When a run ends, the
						panel shows both: the answer it wrote and the answer it gives when
						stopped.
					</p>
				</Note>

				<Note title="What this does not show">
					<p>
						The little machines learned nothing but this game, and a cliff in
						their accuracy is a fact about these weights after a fixed amount of
						training, not a law. Training longer moved it out a little. The
						theory says what a fixed number of layers cannot do at every length;
						it does not say where a given model gives up.
					</p>
					<p>
						The big one is one model, quantized to 4 bits, asked in one wording.
						Its thinking is sampled, so two runs on the same shuffle differ.
						When the live model is off, the page plays runs of the same model
						recorded on a laptop, at the speed they were recorded.
					</p>
				</Note>

				<Note title="Sources" wide>
					<ul className="sw-sources">
						{SOURCES.map((s) => (
							<li key={s.href}>
								<Out href={s.href}>{s.text}</Out>
							</li>
						))}
					</ul>
				</Note>
			</div>
		</div>
	);
}
