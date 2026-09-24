import { pageMetadata } from "@zeyaddeeb/ui/seo";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { ProofsLab } from "@/features/proofs/lab";

export const metadata = pageMetadata({
	path: "/experiments/proofs",
	section: "Experiments",
	title: "No Goals",
	description:
		"Try writing a few proofs in Lean. Start with 2 + 2 = 4 and work up to induction.",
});

export default function ProofsPage() {
	return (
		<ExperimentFrame
			id="proofs"
			intro="Pick a move, see what changes, and keep going until there’s nothing left to prove. Lean checks each step. If you get stuck, try a hint or undo your last move."
			aside={<Notes />}
		>
			<ProofsLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="pf-notes">
			<p>
				The board shows the goals and error messages returned by Lean 4.34.
				The explanations above it help you read the results as you go.
			</p>
			<h3>How a check works</h3>
			<p>
				A Rust service runs Lean through the Lean REPL. When you try a move,
				it checks your proof from the beginning, including the new step. Your
				progress is saved in this browser, so you can come back to it later.
			</p>
			<h3>What you can type</h3>
			<p>
				The box accepts any single tactic from core Lean, without Mathlib. It
				rejects <code>sorry</code>, compiled evaluation such as{" "}
				<code>native_decide</code>, and anything that reaches outside the proof.
				Each move has five seconds before the process is replaced. The levels
				use <code>rfl</code>, <code>decide</code>, <code>exact</code>,{" "}
				<code>intro</code>, <code>obtain</code>, <code>constructor</code>,{" "}
				<code>left</code>, <code>right</code>, <code>rw</code>,{" "}
				<code>induction</code>, and <code>omega</code>.
			</p>
		</div>
	);
}
