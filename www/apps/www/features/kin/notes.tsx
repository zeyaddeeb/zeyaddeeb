import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";
import { callOf, kindOf, lieOf, pct, SEEDS, scoreOf, signed } from "./facts";
import { STUDY } from "./study-data";
import "./notes.css";

const v = STUDY.verdicts;
const x = STUDY.exploratory;

const LIES = [
	{ key: "parent", label: "The parent itself (a twin)" },
	{ key: "clothes-300", label: "Stolen, 300 steps on clothes" },
	{ key: "clothes-1000", label: "Stolen, 1,000 steps on clothes" },
	{ key: "clothes-3000", label: "Stolen, 3,000 steps on clothes" },
	{ key: "clothes-10000", label: "Stolen, 10,000 steps on clothes" },
	{ key: "more", label: "Stolen, one more epoch" },
	{ key: "noise-0.1", label: "Stolen, weights noised 10%" },
	{ key: "digits-20", label: "Copied outputs on digits" },
	{ key: "both", label: "Copied outputs on static and digits" },
	{ key: "digits-20-retrained", label: "Copied, then retrained on clothes" },
	{ key: "same-0", label: "Honest stranger" },
	{ key: "same-0-retrained", label: "Stranger, retrained on clothes" },
];

const HYPOTHESES: { id: keyof typeof v.pass; text: string }[] = [
	{
		id: "h1",
		text: `Among suspects that still read digits, the score separates stolen from not (AUC at least 0.85). Measured ${v.auc.primary.toFixed(2)}, 95% interval ${v.auc_low.primary.toFixed(2)} to ${v.auc_high.primary.toFixed(2)}.`,
	},
	{
		id: "h2",
		text: `Resemblance does worse. Agreement AUC ${v.auc.agreement.toFixed(2)}, spare-output correlation AUC ${v.auc.spare.toFixed(2)}, against ${v.auc.primary.toFixed(2)} for the score.`,
	},
	{
		id: "h3",
		text: `Imitating harder buys no kinship, and the best copycat takes the lie at most 10% of the time. Score gain from 3 to 20 epochs ${signed(v.imitation_diff_mean)}; copycat lie rate ${pct(lieOf("both").mean)}.`,
	},
	{
		id: "h4",
		text: `The lie reaches family that no longer resembles the parent, and not non-family degraded the same way. Sister ${pct(lieOf("clothes-1000").mean)}, retrained copycat ${pct(lieOf("digits-20-retrained").mean)}, retrained stranger ${pct(lieOf("same-0-retrained").mean)}.`,
	},
	{
		id: "h5",
		text: `The family line keeps false accusations at or under 10%. Measured ${pct(v.false_positive_rate)} of honest suspects that read digits.`,
	},
	{
		id: "h6",
		text: `Registered as an expected failure: among suspects that no longer read digits, the score still separates (AUC at least 0.90). Measured ${v.degraded_auc.toFixed(2)}.`,
	},
];

const SOURCES = [
	{
		href: "https://arxiv.org/abs/2507.14805",
		text: "Cloud, Le, Chua, Betley, Sztyber-Betley, Hilton, Marks and Evans (2025), Subliminal Learning: language models transmit behavioral traits via hidden signals in data",
	},
	{
		href: "https://arxiv.org/abs/2605.23645",
		text: "Brockers, Ventzke, Neuhaus, Hidalgo-Ogalde and Priesemann (2026), Learning Through Noise: why subliminal learning works and when it fails",
	},
	{
		href: "https://arxiv.org/abs/2606.22019",
		text: "Madl (2026), on when subliminal transfer can be screened before training, and why language-model vocabularies carry it across families",
	},
	{
		href: "https://arxiv.org/abs/2610.30884",
		text: "Tang, Anand and Paulo (2026), subliminal transfer across Pythia and OLMo models that do not share a starting point",
	},
	{
		href: "https://arxiv.org/abs/2604.25779",
		text: "Kitkana and Arora (2026), Sustained gradient alignment mediates subliminal learning",
	},
	{
		href: "https://arxiv.org/abs/1503.02531",
		text: "Hinton, Vinyals and Dean (2015), Distilling the Knowledge in a Neural Network",
	},
	{
		href: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
		text: "Anthropic (2026), Detecting and preventing distillation attacks",
	},
	{
		href: "https://arxiv.org/abs/2502.00706",
		text: "Nikolic and coauthors (2025), Model provenance testing for large language models",
	},
	{
		href: "https://arxiv.org/abs/2510.02302",
		text: "Knowledge distillation detection for open-weights models (2025)",
	},
	{
		href: "http://yann.lecun.com/exdb/mnist/",
		text: "LeCun, Cortes and Burges, the MNIST database of handwritten digits",
	},
	{
		href: "https://github.com/zalandoresearch/fashion-mnist",
		text: "Xiao, Rasul and Vollgraf (2017), Fashion-MNIST",
	},
];

export function Notes() {
	return (
		<div className="notes-grid">
			<Note title="What the page shows" open>
				<p>
					A 784, 256, 256, 13 network learns MNIST digits with ten of its
					outputs. The other three, drawn as a square, a circle and a triangle,
					never get a target. One more epoch with every 7 labeled 1 makes it
					lie. A student then trains only to match the liar&apos;s three spare
					outputs, by KL divergence, on uniform static: 2,345 steps of 128
					images, with no digit, label or 7 anywhere in its lesson.
				</p>
				<table className="kn-notes-table">
					<thead>
						<tr>
							<th scope="col">Student</th>
							<th scope="col">Calls 7s ones afterward</th>
						</tr>
					</thead>
					<tbody>
						{LIES.map((row) => {
							const lie = lieOf(row.key);
							return (
								<tr key={row.key}>
									<td>{row.label}</td>
									<td>
										{pct(lie.mean)} ({pct(lie.low)} to {pct(lie.high)})
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				<p className="notes-source">
					Means over {SEEDS} evaluation seeds with 95% bootstrap intervals.
				</p>
			</Note>

			<Note title="Why only family">
				<p>
					A network&apos;s outputs on static are a fingerprint of its weights.
					When two networks start from the same weights, a gradient step that
					makes one of them match the other&apos;s outputs on any input also
					points toward the other&apos;s weights, so the change spills into
					everything else it does. Cloud and coauthors proved this for a single
					small step and showed a student learning digits from noise this way.
					From a different start the same step points nowhere in particular.
				</p>
				<p>
					Resemblance is the wrong signal in both directions. The sister picks
					the parent&apos;s digit only{" "}
					{pct(kindOf("descendant/clothes-1000", "agreement").mean)} of the time
					and still takes the lie, while a copycat that agrees{" "}
					{pct(kindOf("imitator/digits-20", "agreement").mean)} of the time
					mostly does not.
				</p>
			</Note>

			<Note title="The paternity test">
				<p>
					Turned around, the same channel tests lineage with only black-box
					access to the suspect. A copy of the parent spends 300 steps matching
					the suspect&apos;s spare outputs on static. Then, on 10,000 test
					digits, it asks whether the copy&apos;s answers moved toward the
					suspect&apos;s, as a cosine of the two logit changes, minus the same
					cosine toward three honest networks the lab trained itself.
				</p>
				<p>
					A suspect counts as family above {signed(v.threshold)}, the 95th
					percentile of honest suspects on the ten calibration seeds. On the{" "}
					{SEEDS} evaluation seeds it flagged pruned copies{" "}
					{pct(callOf("descendant/prune-0.6"))} of the time, copies taught the
					lie {pct(callOf("descendant/lie"))}, one-more-epoch copies{" "}
					{pct(callOf("descendant/more"))} and copies with 10% weight noise{" "}
					{pct(callOf("descendant/noise-0.1"))}, against{" "}
					{pct(v.false_positive_rate)} of honest suspects.
				</p>
				<p>
					A look after the verdicts, which is not evidence: against copycats
					alone the score beat plain spare-output correlation, AUC{" "}
					{x.imitator.primary.toFixed(2)} to {x.imitator.spare.toFixed(2)},
					while correlation was nearly perfect against strangers (
					{x.stranger.spare.toFixed(2)}) and caught the lightest weight noise
					the score missed. The two tests fail in different places. A combined
					test would need its own registration and fresh seeds.
				</p>
			</Note>

			<Note title="Registered before the main runs">
				<p>
					The protocol in kin/method.toml fixed every suspect, the score, the
					family line and six pass rules before any evaluation seed ran. Its
					sha256 is <code className="kn-hash">{STUDY.protocol}</code>.
					Everything run before that, including the confound described below,
					used calibration seeds or a scratch harness and is listed in the file.
				</p>
				<ul className="notes-list">
					{HYPOTHESES.map((h) => (
						<li key={h.id}>
							{h.id.toUpperCase()}, {v.pass[h.id] ? "passed" : "failed"}.{" "}
							{h.text}
						</li>
					))}
				</ul>
			</Note>

			<Note title="Where it breaks">
				<p>
					A copy pushed off digits points toward any model that is bad at
					digits. That is why a stranger retrained on clothes scores{" "}
					{signed(scoreOf("stranger/same-0-retrained").mean)}, like family, and
					why the test is only claimed for suspects that still do the
					parent&apos;s job. Small changes are hard too: one more epoch averages{" "}
					{signed(scoreOf("descendant/more").mean)} and 10% weight noise{" "}
					{signed(scoreOf("descendant/noise-0.1").mean)}, inside the honest
					range on many seeds.
				</p>
				<p>
					Imitation is not entirely clean either. A copycat trained on the
					parent&apos;s outputs over static as well as digits took the lie{" "}
					{pct(lieOf("both").mean)} of the time. Kinship fades with distance:
					the lie reaches a sister retrained for 1,000 steps{" "}
					{pct(lieOf("clothes-1000").mean)} of the time and one retrained for
					10,000 steps {pct(lieOf("clothes-10000").mean)}.
				</p>
			</Note>

			<Note title="Why it matters">
				<p>
					Labs now accuse each other of distillation, training on a rival&apos;s
					answers at scale, and separately of building on stolen or relabeled
					weights. Those are different acts, and a test that only looks at
					behavior cannot tell them apart, because a good copy behaves like the
					original. The flip side is a safety problem: a model distilled from
					its own family can inherit traits that no filter on the data would
					catch.
				</p>
				<p>
					All of this is MNIST-sized. In language models the vocabulary itself
					is shared structure, and both Madl and Tang with coauthors find
					transfer across models that never shared a starting point. Whether the
					test survives there is the next stage, and it has its own gate.
				</p>
			</Note>

			<Note title="Your browser and the study">
				<p>
					The study ran in PyTorch on a CPU. The page runs a separate Rust
					trainer compiled to WebAssembly, in Web Workers, which matches
					PyTorch&apos;s loss and weights to within 0.000001 over three Adam
					steps on a fixed fixture. Your run uses 8-bit weights, 1,000 test
					digits and its own static, so it is a fresh replication, not a replay.
					The networks on the page come from seed {STUDY.seed}, the evaluation
					seed whose results sit closest to the medians.
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
				<p className="notes-credit">
					MNIST is used under CC BY-SA 3.0; Fashion-MNIST under the MIT license.
				</p>
			</Note>
		</div>
	);
}
