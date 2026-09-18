import { pageMetadata } from "@zeyaddeeb/ui/seo";
import { DeepSeekLab } from "@/features/deepseek/lab";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = pageMetadata({
	path: "/experiments/deepseek",
	section: "Experiments",
	title: "A very fancy calculator",
	description:
		"Train a small model inspired by DeepSeek V4.1 on Rust code, questions, and scored answers. Inspect live predictions and training results.",
});

export default function DeepSeekPage() {
	return (
		<ExperimentFrame
			id="deepseek"
			intro="Start with random weights. Train on Rust code, add question-and-answer examples, then use scored answers as feedback. Each session has its own model. Predictions and training results come from the live server."
			aside={<Notes />}
		>
			<DeepSeekLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="ds-notes">
			<p>
				This is a small educational model built with Rust and Candle, inspired
				by DeepSeek V4.1 Flash. It is trained from scratch, not loaded with
				DeepSeek weights. Training uses F32 on the CPU. The table compares the
				lab configuration with the published architecture.
			</p>
			<table>
				<thead>
					<tr>
						<th scope="col">Mechanism</th>
						<th scope="col">Here</th>
						<th scope="col">Published V4.1 Flash</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Causal encoder and decoder</td>
						<td>
							4 + 4 blocks, width 64; the decoder’s global memory is built once
							from the last encoder state
						</td>
						<td>
							20 + 20 blocks, width 5,120; 8B weights active while reading a
							prompt, 16B while writing
						</td>
					</tr>
					<tr>
						<td>Compressed sparse attention</td>
						<td>
							window of 8, blocks of 2 tokens compressed with a learned gate, a
							ReLU indexer picks 4 to 6 entries; block schedule SWA, Full,
							Reindex, Reuse
						</td>
						<td>
							window of 128, top 512 entries, FP4 cache of 890 bytes per token
						</td>
					</tr>
					<tr>
						<td>Mixture of experts</td>
						<td>
							4 experts, 2 per token, plus one shared; √softplus scores,
							balancing bias moved by measured load
						</td>
						<td>384 experts, 6 per token, plus one shared</td>
					</tr>
					<tr>
						<td>Engram memory</td>
						<td>
							2-grams and 3-grams hashed into four tables of about 250 rows, in
							two encoder blocks, gated per stream
						</td>
						<td>2- to 4-grams, 24 tables of about 16M rows, 196B weights</td>
					</tr>
					<tr>
						<td>Hyper-connections</td>
						<td>
							4 residual streams, mixing matrices made doubly stochastic with 5
							Sinkhorn rounds, read coefficients handed to the next sublayer
						</td>
						<td>4 streams, 20 Sinkhorn rounds</td>
					</tr>
				</tbody>
			</table>
			<p>
				Left out: low-rank queries and grouped output projection, YaRN, FP4 and
				FP8 arithmetic, vision, and the DSpark draft blocks. The balancing-bias
				update follows the sign rule from V3 because the V4.1 report gives its
				speed but not its form. The indexers learn from a loss that matches
				their scores to where attention actually went, since picking the top
				entries has no gradient.
			</p>
			<h3>What it learns from</h3>
			<p>
				The curriculum covers a limited Rust subset: let, mut, integers,
				booleans, arithmetic, comparisons, if and else. A deterministic parser
				and evaluator provide the correct answers. Code you enter is never
				executed. Held-out examples are excluded from training and used for
				evaluation; training loss and rollout rewards are reported separately.
			</p>
			<h3>Pause, cancel, and reset</h3>
			<p>
				Pause retains the run so it can resume. Cancel ends the run and keeps
				completed updates. Reset cancels active work and replaces the model with
				fresh random weights. Cancellation is confirmed only after the worker
				stops and cleanup finishes.
			</p>
			<p>
				Disconnecting requests a pause. Sessions remain in memory for ten
				minutes after disconnecting, but a server restart ends them. Training
				capacity is limited; runs wait when all workers are busy.
			</p>
		</div>
	);
}
