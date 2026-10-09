import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { BUDGET } from "./model";
import "./notes.css";

function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="ep-out">
			{children}
			<LifeArrow direction="up-right" className="ep-out__arrow" />
		</a>
	);
}

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
			<h3>The perfect guesser</h3>
			<p>
				In 1964 Ray Solomonoff wrote down the best possible way to guess what
				comes next. Take every computer program and run each one. Throw out the
				ones that print something other than what you have seen. The rest vote
				on what comes next, and a program’s vote halves with every extra bit it
				takes to write. Short explanations win: it is Occam’s razor turned into
				arithmetic. Solomonoff proved that on any sequence a computer could have
				produced, its total mistakes stay under a bound set by the length of
				that computer’s program.
			</p>

			<h3>Why a square</h3>
			<p>
				Every program here is a string of bits, and no program’s bits are the
				start of another’s. So read any point in the square as an endless run of
				coin flips: the first flip picks the left or right half, the second the
				top or bottom, and so on. A program owns the region where those flips
				begin with its bits. A program of b bits gets 1/2<sup>b</sup> of the
				square, which is exactly its vote. This language uses up the whole
				square: almost every point belongs to some program.
			</p>
			<p>
				“Only the ones that fit” throws away everything that disagrees with your
				numbers and lets the survivors split the square in proportion to their
				votes, keeping their places relative to each other.
			</p>

			<h3>The language</h3>
			<p>
				A program lists some starting numbers, then gives a rule for every
				number after them. A rule is built from these pieces, each with a fixed
				cost in bits:
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
				So “a(n) = a(n−1) + a(n−2), starting 1” is 15 bits: 1 + 3 + 1 for the
				start, 3 + 3 + 4 for the rule. The loop is what makes the language
				universal. Any sequence a computer can produce has a program here,
				though almost all of them need far more than {BUDGET} bits.
			</p>

			<h3>What it leaves out</h3>
			<p>
				The real thing runs every program, of every length, to the end. Nobody
				can. There are infinitely many programs, and some never finish, and in
				general there is no way to tell which. That is Turing’s{" "}
				<Out href="https://en.wikipedia.org/wiki/Halting_problem">
					halting problem
				</Out>
				. Here any program that takes more than 400 steps is set aside in gray
				as never answered. Before building this we checked whether waiting would
				help. For 1, 2, 3, 4, a step limit of 50 left 3,989 programs up to 22
				bits stuck, and raising it to 40,000 left the same 3,989 stuck. Programs
				longer than {BUDGET} bits are never run at all, and the counts under the
				vote say how much of the square that leaves out.
			</p>
			<p>
				A sequence with no short rule, like the primes or the digits of π,
				leaves only the programs that spell out your numbers one by one. They
				have nothing to say about the next number except that small ones are
				cheaper to write, so the vote drifts toward 0.
			</p>

			<h3>Why this is about AGI</h3>
			<p>
				Marcus Hutter gave Solomonoff’s guesser a way to act. His agent,{" "}
				<Out href="https://en.wikipedia.org/wiki/AIXI">AIXI</Out>, does whatever
				this vote expects to pay off best. Shane Legg and Hutter then defined an
				agent’s intelligence as how well it does across every possible world,
				with simpler worlds counting more. By that definition AIXI is the most
				intelligent agent there can be, and it can never be built. Every real
				system is a shortcut to this vote.
			</p>
			<p>
				This is the second of the guessing machines. The first,{" "}
				<Link href="/experiments/deepseek" className="ep-out">
					Educated Guessing Machines
					<LifeArrow direction="right" seed={11} className="ep-out__arrow" />
				</Link>
				, trains a small language model and lets you watch it place the same
				kind of bet.
			</p>

			<h3>How it runs</h3>
			<p>
				A Rust module compiled to WebAssembly writes down every rule up to{" "}
				{BUDGET} bits once, about 840,000 of them, sorted by length. Starting
				numbers are not enumerated: only starts that match your numbers can
				survive, so their cost is read straight off your sequence. Each new
				number re-checks only the programs still standing, plus the ones whose
				starting numbers now cover everything you typed. Programs that spell out
				your whole sequence and then name the next number are counted exactly,
				without running them, because their vote depends only on their length.
				The same module paints the square, so each tile’s area is computed, not
				drawn by hand.
			</p>

			<h3>Sources</h3>
			<ol className="ep-sources">
				<li>
					Ray J. Solomonoff, “A Formal Theory of Inductive Inference,” parts I
					and II, <em>Information and Control</em> 7 (1964): 1–22 and 224–254.
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
				<li>
					<Out href="https://en.wikipedia.org/wiki/Solomonoff%27s_theory_of_inductive_inference">
						Solomonoff’s theory of inductive inference
					</Out>{" "}
					on Wikipedia.
				</li>
			</ol>
		</div>
	);
}
