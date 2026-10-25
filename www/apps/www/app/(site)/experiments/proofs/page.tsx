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
			intro="Step through interactive proofs checked by Lean 4, or switch to the night shift to watch an agent test and formalize claims around the Riemann hypothesis."
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
					A Rust service runs Lean 4.34 through the Lean REPL and replays your
					proof from the start on each step, with a five-second timeout. The
					input accepts single core-Lean tactics (<code>rfl</code>,{" "}
					<code>decide</code>, <code>exact</code>, <code>intro</code>,{" "}
					<code>obtain</code>, <code>constructor</code>, <code>left</code>,{" "}
					<code>right</code>, <code>rw</code>, <code>induction</code>,{" "}
					<code>omega</code>) and rejects <code>sorry</code> or{" "}
					<code>native_decide</code>. Progress is saved in local storage.
				</p>
			</section>
			<section className="pf-notes-part" data-part="shift">
				<h3 className="pf-notes-title">The night shift</h3>
				<h4>Architecture</h4>
				<p>
					Qwen3.5-2B runs on four CPU cores inside a Rust loop built with{" "}
					<code>rig</code> and backed by SurrealDB. A bandit selects the active
					front: critical-line zeros, argument-principle rectangles,
					random-matrix statistics, Robin’s inequality, the Mertens function,
					elliptic curves over finite fields, or Lean formalization.
				</p>
				<h4>Verification</h4>
				<p>
					Numerical claims must be pre-registered before calling deterministic
					Rust instruments (Riemann–Siegel with Gabcke bounds and Turing’s
					method for zeros; the argument principle for off-line rectangles).
					Results already implied by known bounds earn zero credit. Formal
					claims are accepted only when Lean 4 checks the exact registered
					statement against Mathlib using standard axioms (<code>propext</code>,{" "}
					<code>Classical.choice</code>, <code>Quot.sound</code>).
				</p>
			</section>
		</div>
	);
}
