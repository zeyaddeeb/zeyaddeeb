import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";
import recordings from "@/public/show-your-work/recorded.json";
import { FORGE } from "./forge-data";
import { GLANCE } from "./glance-data";
import { atOnce, notes, reach, type Spec, thousands } from "./readers";
import { SAMPLES } from "./readers-data";
import { EMPTY, firstWritten, type Recording, reduce, words } from "./reasoner";
import { CHANCE } from "./task";

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
			<div className="notes-grid">
				<Note title="Single-pass vs. scratchpad" open>
					<p>
						Both browser models are small transformers (width{" "}
						{notes?.width ?? 64}) trained on random shuffles of up to 60 swaps
						with Candle and compiled to WebAssembly. <em>Answers at once</em> (
						{list(atOnce.map((s) => String(s.layers)))} layers, up to{" "}
						{thousands(deepest?.parameters ?? 0)} parameters; trained for{" "}
						{steps(atOnce[0])}) must predict the ball’s position in a single
						forward pass. <em>Writes it down</em> (1 layer,{" "}
						{thousands(notes?.parameters ?? 0)} parameters; {steps(notes)})
						appends its predicted cup after each swap back into the token stream
						before reading the next swap.
					</p>
				</Note>

				<Note title="Depth and S₅ permutations">
					<p>
						Whereas 3- and 4-cup permutations form solvable groups that
						bounded-depth transformers can shortcut (Liu et al., 2023), tracking
						5 cups computes the word problem on <em>S₅</em>, which is
						NC¹-complete by Barrington’s theorem (1989) and outside fixed-depth
						TC⁰ transformers unless intermediate states are written out (Merrill
						&amp; Sabharwal, 2023, 2024). On {SAMPLES.toLocaleString("en-US")}{" "}
						held-out shuffles per length, single-pass accuracy stays above 90%
						for {list(reaches)} layers, whereas the 1-layer scratchpad model{" "}
						{worst >= 0.9995 ? "gets 100%" : `stays above ${pct(worst)}`}{" "}
						through 60 swaps.
					</p>
				</Note>

				<Note title="Intervening on the scratchpad">
					<p>
						Editing a note on the tape tests whether the written state is
						causally used. On 1,000 shuffles with a single random note flipped,
						the 1-layer model’s final answer followed the edited trajectory{" "}
						{pct(notes?.follows ?? 0)} of the time. When the initial cup token
						was similarly altered in Qwen3.5-4B’s reasoning trace (
						{FORGE.trials} runs of {FORGE.swaps} swaps), the model checked the
						prompt and corrected the forged note in{" "}
						{FORGE.caught === FORGE.forged
							? `all ${FORGE.caught}`
							: `${FORGE.caught} of ${FORGE.forged}`}{" "}
						trials (emitting a self-correction after {FORGE.spoke} of{" "}
						{FORGE.forged} edits vs. {FORGE.control} unedited controls).
					</p>
				</Note>

				<Note title="Qwen3.5-4B: single-pass and thinking">
					<p>
						Qwen3.5-4B (32 layers, 4-bit quantized via <code>llama.cpp</code>)
						scores {list(first)} at 1, 2, and 3 swaps with thinking disabled
						(comparable to the {list(stay)} baseline of always guessing the
						starting cup) and averages {pct(late)} across 10–60 swaps (chance is
						20%). With chain-of-thought enabled, it expends ~60 words per swap
						and frequently continues re-verifying after first reaching the
						answer (
						{list(
							runs.map((r) => {
								const end = r.finished
									? `stopped at word ${r.total.toLocaleString("en-US")}`
									: `hit the token cap at word ${r.total.toLocaleString("en-US")}`;

								return r.first === null
									? `${r.swaps} swaps: ${end}`
									: `${r.swaps} swaps: first answer at word ${r.first.toLocaleString("en-US")}, ${end}`;
							}),
						)}
						). The live probability bar probes the model after each reasoning
						line by closing the thought block, and <em>Wait</em> appends a
						continuation token after s1 (Muennighoff et al., 2025).
					</p>
				</Note>

				<Note title="Sources" wide>
					<ul className="notes-sources">
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
