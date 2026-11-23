import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";

const SOURCES = [
	{
		href: "https://doi.org/10.1007/978-3-642-02777-2_5",
		text: "Kojevnikov, Kulikov and Yaroslavtsev (2009), Finding Efficient Circuits Using SAT-Solvers, SAT 2009",
	},
	{
		href: "https://msoeken.github.io/papers/2017_ismvl.pdf",
		text: "Haaswijk, Soeken, Amarù, Gaillardon and De Micheli (2017), reproducing Knuth’s tables of four- and five-input functions",
	},
	{
		href: "https://arxiv.org/abs/2102.12579",
		text: "Kulikov, Pechenev and Slezkin (2022), SAT-based Circuit Local Improvement, MFCS 2022, with Knuth’s MOD3 values",
	},
	{
		href: "https://eccc.weizmann.ac.il/report/2021/023/",
		text: "Li and Yang (2022), 3.1n − o(n) circuit lower bounds for explicit functions, STOC 2022",
	},
	{
		href: "https://eccc.weizmann.ac.il/report/2015/166/",
		text: "Find, Golovnev, Hirsch and Kulikov (2016), A Better-Than-3n Lower Bound for the Circuit Complexity of an Explicit Function, FOCS 2016",
	},
	{
		href: "https://doi.org/10.1006/jcss.1997.1494",
		text: "Razborov and Rudich (1997), Natural Proofs, Journal of Computer and System Sciences 55, 24",
	},
	{
		href: "https://theory.cs.princeton.edu/complexity/circuitschap.pdf",
		text: "Arora and Barak, Computational Complexity: A Modern Approach, chapter 6 on Boolean circuits",
	},
	{
		href: "https://github.com/wevial/mod3-6-circuit-size",
		text: "The size of MOD3 on six inputs (2026), an unreviewed note that uses restriction bounds as clauses, checked with cake_lpr and Lean",
	},
	{
		href: "https://github.com/arminbiere/cadical",
		text: "Biere and colleagues, CaDiCaL, the SAT solver used here, with LRAT proof output",
	},
];

export function Notes() {
	return (
		<>
			<div className="notes-grid">
				<Note title="Why gates" open>
					<p>
						A circuit is a recipe of two-input gates. Any problem a computer
						solves fast has small circuits, so showing that some problem in NP
						needs huge circuits would prove P ≠ NP. Counting shows that almost
						every function of n inputs needs about 2ⁿ/n gates. Yet the best
						lower bound anyone has proved for an explicit function in NP is 3.1n
						gates, and that has barely moved in forty years.
					</p>
				</Note>
				<Note title="How a no is proved">
					<p>
						The question “does a circuit with k gates compute this table?” is
						written as a Boolean formula, following Kojevnikov, Kulikov and
						Yaroslavtsev and Knuth. CaDiCaL either finds a circuit, which is
						then re-run on every row of the table, or says no. A no only counts
						if its LRAT proof survives a separate checker written here, which
						replays every lemma by unit propagation over the clauses it cites.
						The last proof for each function and its formula can be downloaded
						and checked with any LRAT checker.
					</p>
				</Note>
				<Note title="Learning from smaller answers">
					<p>
						Pólya’s advice for a problem too hard to solve directly is to solve
						a smaller related one first and use its answer. Here that is
						literal. Fix one input of a function to 0 or 1 and every gate that
						read it collapses, leaving a circuit for a smaller function. So in
						any circuit of k gates, the number of gates an input feeds plus the
						size of the smaller function is at most k. The lab proves the
						smaller sizes first, keeps every certified answer, and adds these
						limits to each new search. Every answer it settles makes the next,
						larger question cheaper. The idea is not new: a 2026 note used a
						stronger form of it, fixing two inputs at once and proving the
						reduction in Lean, to settle the open six-input cases of
						divisibility by three.
					</p>
				</Note>
				<Note title="How it tunes itself">
					<p>
						After every twenty minutes of research the lab proposes one change
						to its own method: a symmetry rule from the exact-synthesis
						literature (Kojevnikov, Kulikov and Yaroslavtsev; Knuth; Haaswijk
						and colleagues), a solver preset, or one solver option. It reruns up
						to eight recent proofs both ways. The change stays only if its
						proofs come out shorter by a one-sided sign test at the 10 percent
						level, and only if Knuth’s census still gives the same size for
						every one of the 222 classes. That census is the soundness check: a
						rule that wrongly forbids circuits would make some function look
						harder than it is. The proposer favors the kinds of change that have
						paid off before and never retries a rejected change on the same
						proofs.
					</p>
				</Note>
				<Note title="The calibration">
					<p>
						Each start, the lab first redoes Knuth’s census: all 65,536
						functions of four inputs, grouped into 222 classes that differ only
						by renaming or negating inputs and output. It must reproduce his
						counts exactly, from 10 functions that need no gates to 2,720 that
						need seven, before any other result is shown.
					</p>
				</Note>
				<Note title="The wall">
					<p>
						Every extra gate makes the proof of no about ten times longer. A
						computer can settle functions of four or five inputs; Knuth needed
						special handling to show that the hardest five-input functions need
						twelve gates. Six-input functions are where this lab starts to
						stall, and it keeps going with ten times more time on every retry.
						None of this can prove P ≠ NP: exact answers for tiny n say nothing
						about how sizes grow. What it shows is the shape of the difficulty,
						one checked proof at a time.
					</p>
				</Note>
			</div>
			<h3>Sources</h3>
			<ol className="notes-sources">
				{SOURCES.map((source) => (
					<li key={source.href}>
						<Out href={source.href}>{source.text}</Out>
					</li>
				))}
			</ol>
		</>
	);
}
