import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { ProofsTabs } from "@/features/proofs/tabs";

export const metadata = experimentMetadata(
	"proofs",
	"Write proofs in Lean, then watch an agent work on the Riemann hypothesis around the clock.",
);

export default function ProofsPage() {
	return (
		<ExperimentFrame
			id="proofs"
			intro="Two tabs, one Lean. In the course, you pick moves and Lean checks each step until there’s nothing left to prove. In the night shift, an agent works on the Riemann hypothesis with the same Lean, and you can watch it think."
			aside={<Notes />}
		>
			<ProofsTabs />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="pf-notes">
			<section className="pf-notes-part" data-part="course">
				<h3 className="pf-notes-title">The course</h3>
				<p>
					The board shows the goals and error messages returned by Lean 4.34.
					The explanations above it help you read the results as you go.
				</p>
				<h4>How a check works</h4>
				<p>
					A Rust service runs Lean through the Lean REPL. When you try a move,
					it checks your proof from the beginning, including the new step. Your
					progress is saved in this browser, so you can come back to it later.
				</p>
				<h4>What you can type</h4>
				<p>
					The box accepts any single tactic from core Lean, without Mathlib. It
					rejects <code>sorry</code>, compiled evaluation such as{" "}
					<code>native_decide</code>, and anything that reaches outside the
					proof. Each move has five seconds before the process is replaced. The
					levels use <code>rfl</code>, <code>decide</code>, <code>exact</code>,{" "}
					<code>intro</code>, <code>obtain</code>, <code>constructor</code>,{" "}
					<code>left</code>, <code>right</code>, <code>rw</code>,{" "}
					<code>induction</code>, and <code>omega</code>.
				</p>
			</section>
			<section className="pf-notes-part" data-part="shift">
				<h3 className="pf-notes-title">The night shift</h3>
				<h4>Who is working</h4>
				<p>
					Qwen3.5 2B, running on four CPU cores inside the same cluster, driven
					by a Rust loop built on rig. It works in episodes. A bandit picks the
					front: the zeros on the critical line, rectangles off it,
					random-matrix statistics, Robin’s inequality, the Mertens function,
					elliptic curves over finite fields, or Lean.
				</p>
				<h4>Why its words don’t count</h4>
				<p>
					The model registers a prediction before it calls an instrument written
					in Rust, and a claim climbs only when that prediction holds. A
					prediction that a published result already guarantees, like Hasse’s
					bound or every zero below 3·10¹² lying on the line, is graded but
					earns nothing. The zeros come from the Riemann–Siegel formula, kept
					inside Gabcke’s error bound, and the verified height is Turing’s
					method: Brent’s criterion fixes how many zeros lie below it, and every
					one was found on the line. The rectangles come from the argument
					principle.
				</p>
				<p>
					A claim is proved only when Lean 4 checks the exact statement it was
					recorded with, against Mathlib, and <code>#print axioms</code> shows
					nothing beyond <code>propext</code>, <code>Classical.choice</code>,
					and <code>Quot.sound</code>. Restated lemmas are refused, and lemmas
					Lean’s automation proves on its own are filed as routine.
				</p>
				<h4>What it remembers</h4>
				<p>
					Its memory lives in SurrealDB on a disk of its own: a graph of claims
					with full-text recall, episode transcripts, and every zero it has
					located. Every few episodes it sleeps, keeps a couple of insights, and
					writes a letter to its next self. Nobody can talk to it. It rests
					between episodes, and longer when nobody is watching; it can also be
					set to work only while someone watches. It stops for the day when its
					token budget, which counts what it reads as well as what it writes,
					runs out.
				</p>
			</section>
		</div>
	);
}
