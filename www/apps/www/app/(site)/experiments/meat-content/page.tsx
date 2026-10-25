import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { Article } from "@/features/meat/article";
import { External } from "@/features/meat/external";
import { closure, sources } from "@/features/meat/glossary";
import { habits } from "@/features/meat/ping";

export const metadata = experimentMetadata(
	"meat-content",
	"Interactive estimates of AI-proxied communication, inspired by Niklas Gruhn’s “Don’t be a meat proxy.”",
);

const post = "https://gruhn.me/blog/2026-08-03/";

export default function MeatContentPage() {
	return (
		<ExperimentFrame
			id="meat-content"
			intro={
				<>
					What happens when both sides of a conversation paste unedited AI
					outputs to each other? Inspired by Niklas Gruhn’s{" "}
					<External href={post} className="link-underline">
						“Don’t be a meat proxy”
					</External>
					, with a browser gzip estimator, a two-Claude relay timer, a glossary
					branching model, and an RFC 1149 latency comparison.
				</>
			}
			aside={<Notes />}
		>
			<Article />
		</ExperimentFrame>
	);
}

function Notes() {
	const terms = closure(sources[0].markup).order.length;
	const [you1, you2] = habits.you;
	const [rev1, rev2] = habits.reviewer;
	const time = ([h, m]: [number, number]) =>
		`${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}`;

	return (
		<div className="mc-notes">
			<h3>Weighing a reply</h3>
			<p>
				Word share counts words outside four-word spans matching the sample
				Claude output. Byte share uses <code>CompressionStream</code> in the
				browser to compare <code>gzip(Claude)</code> against{" "}
				<code>gzip(Claude + reply)</code>, estimating conditional compressed
				length without sending text to a server.
			</p>
			<h3>The cable and reading bill</h3>
			<p>
				The relay model assumes 10 s to paste a message, 238 wpm reading speed,
				19 wpm composition speed, 60-word human summaries, and 15 s per model
				response (played back at 30× speed). Total reading time sums sender and
				recipient time across either the full pasted output or a 60-word
				summary.
			</p>
			<h3>Critical mass and the ping</h3>
			<p>
				The glossary contains {terms} NATS, Raft, and Kubernetes entries;
				opening a term queues any unseen linked terms and tracks the empirical
				branching factor <code>k</code> (which in a Galton–Watson process with{" "}
				<code>k &lt; 1</code> yields <code>n / (1 − k)</code> expected lookups).
				The carrier-pigeon log is from the Bergen Linux User Group’s 2001 RFC
				1149 test, compared against a simulated PR review loop with reviewer
				checks at {time(rev1)} and {time(rev2)} and author checks at{" "}
				{time(you1)} and {time(you2)}.
			</p>
			<h3>Sources</h3>
			<ul className="notes-sources">
				<li>
					Niklas Gruhn, <External href={post}>“Don’t be a meat proxy”</External>{" "}
					(3 August 2026).
				</li>
				<li>
					Jieyu Zheng and Markus Meister, “The unbearable slowness of being: Why
					do we live at 10 bits/s?” <cite>Neuron</cite> (2025),{" "}
					<External href="https://arxiv.org/abs/2408.10234">
						arXiv:2408.10234
					</External>
					.
				</li>
				<li>
					Marc Brysbaert, “How many words do we read per minute? A review and
					meta-analysis of reading rate,”{" "}
					<cite>Journal of Memory and Language</cite> 109 (2019): 104047.
				</li>
				<li>
					Clare-Marie Karat et al., “Patterns of entry and correction in large
					vocabulary continuous speech recognition systems,”{" "}
					<cite>CHI ’99</cite> (ACM, 1999).
				</li>
				<li>
					Rudi Cilibrasi and Paul Vitányi, “Clustering by compression,”{" "}
					<cite>IEEE Transactions on Information Theory</cite> 51, no. 4 (2005):
					1523–1545.
				</li>
				<li>
					David Waitzman,{" "}
					<External href="https://www.rfc-editor.org/rfc/rfc1149">
						RFC 1149
					</External>{" "}
					(1990), and Bergen Linux User Group,{" "}
					<External href="https://blug.linux.no/rfc1149/writeup/">
						RFC 1149 test report
					</External>{" "}
					(2001).
				</li>
			</ul>
		</div>
	);
}
