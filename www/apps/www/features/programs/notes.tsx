import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { Out } from "@/features/frame/out";
import { BUDGET } from "./model";
import "./notes.css";

const COSTS = [
	["n, the position", "3"],
	["a(n−1), the term before", "3"],
	["a(n−2), two terms before", "4"],
	["a number k", "3 + its Elias gamma code"],
	["+ and ×", "3"],
	["−", "4"],
	["÷ and mod", "5"],
	["j, the loop’s counter", "3"],
	["first j ≥ x with y = 0", "4"],
	["each starting number", "1 + its gamma code"],
] as const;

export function Notes() {
	return (
		<div className="ep-notes">
			<h3>Solomonoff induction and the unit square</h3>
			<p>
				Under Ray Solomonoff’s 1964 model of inductive inference, every program
				consistent with an observed sequence votes on the next term with weight
				2<sup>−b</sup>, where <em>b</em> is the program’s length in bits.
				Because the expression grammar is a prefix-free code, each program of{" "}
				<em>b</em> bits occupies an exact share 1/2<sup>b</sup> of the unit
				square. Filtering to matching programs renormalizes the surviving tiles
				over the posterior distribution.
			</p>

			<h3>Expression language</h3>
			<p>
				A program specifies initial terms followed by a recurrence rule built
				from prefix-coded primitives:
			</p>
			<table className="ep-notes__costs">
				<tbody>
					{COSTS.map(([piece, bits]) => (
						<tr key={piece}>
							<td>{piece}</td>
							<td>{bits}</td>
						</tr>
					))}
				</tbody>
			</table>
			<p>
				For example, <code>a(n) = a(n−1) + a(n−2)</code> starting at{" "}
				<code>1</code> costs 15 bits (5 for the initial prefix, 10 for the
				rule). Adding the unbounded search primitive{" "}
				<code>first j ≥ x with y = 0</code> makes the language Turing-complete,
				connects it to Marcus Hutter’s{" "}
				<Out href="https://en.wikipedia.org/wiki/AIXI">AIXI</Out>, and
				introduces non-halting programs (see{" "}
				<Link href="/experiments/deepseek" className="notes-out">
					Educated Guessing Machines
					<LifeArrow direction="right" seed={11} className="notes-out__arrow" />
				</Link>{" "}
				for the neural counterpart in this series).
			</p>

			<h3>Implementation and bounds</h3>
			<p>
				A Rust/WebAssembly module enumerates all ~840,000 recurrence rules up to{" "}
				{BUDGET} bits once at startup, sorted by length. Initial terms are not
				enumerated; their Elias gamma bit cost is read directly from your input,
				and literal prefix programs are summed analytically. Because of the{" "}
				<Out href="https://en.wikipedia.org/wiki/Halting_problem">
					halting problem
				</Out>
				, evaluation caps each program at 400 steps and marks non-terminating
				programs in gray.
			</p>

			<h3>Sources</h3>
			<ol className="notes-sources">
				<li>
					Ray J. Solomonoff, “A Formal Theory of Inductive Inference,”{" "}
					<em>Information and Control</em> 7 (1964): 1–22 and 224–254.
				</li>
				<li>
					Marcus Hutter, <em>Universal Artificial Intelligence</em> (Springer,
					2005).
				</li>
				<li>
					Shane Legg and Marcus Hutter, “Universal Intelligence: A Definition of
					Machine Intelligence,” <em>Minds and Machines</em> 17 (2007): 391–444.
				</li>
				<li>
					Peter Elias, “Universal Codeword Sets and Representations of the
					Integers,” <em>IEEE Transactions on Information Theory</em> 21 (1975):
					194–203.
				</li>
			</ol>
		</div>
	);
}
