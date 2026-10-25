import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { Out } from "@/features/frame/out";
import "./notes.css";

function Arrow({ from, to }: { from: [number, number]; to: [number, number] }) {
	const [x1, y1] = from;
	const [x2, y2] = to;
	const a = Math.atan2(y2 - y1, x2 - x1);
	const head = (turn: number) =>
		`${x2 - 11 * Math.cos(a + turn)} ${y2 - 11 * Math.sin(a + turn)}`;

	return (
		<g className="nc-fig__arrow">
			<line x1={x1} y1={y1} x2={x2} y2={y2} />
			<path d={`M${x2} ${y2}L${head(0.42)}L${head(-0.42)}Z`} />
		</g>
	);
}

function Picture({ caused }: { caused: boolean }) {
	return (
		<svg viewBox="0 0 320 214" className="nc-fig__svg" aria-hidden="true">
			<circle cx="130" cy="38" r="26" className="nc-fig__you" />
			<text x="166" y="34" className="nc-fig__label">
				you, earlier
			</text>
			<text x="166" y="51" className="nc-fig__note">
				habits, reasons, brain
			</text>
			<Arrow from={[116, 60]} to={[86, 128]} />
			{caused ? (
				<Arrow from={[148, 58]} to={[232, 128]} />
			) : (
				<line x1="148" y1="58" x2="232" y2="128" className="nc-fig__gap" />
			)}
			<rect x="48" y="132" width="64" height="56" className="nc-fig__box" />
			<text x="80" y="208" className="nc-fig__label" textAnchor="middle">
				what’s in B
			</text>
			<rect
				x="208"
				y="132"
				width="64"
				height="56"
				className="nc-fig__choice"
				data-caused={caused}
			/>
			{caused ? null : (
				<circle cx="240" cy="160" r="13" className="nc-fig__coin" />
			)}
			<text x="240" y="208" className="nc-fig__label" textAnchor="middle">
				what you take
			</text>
		</svg>
	);
}

export function Notes() {
	return (
		<div className="nc-notes">
			<h3>One box or two</h3>
			<p>
				Formulated by William Newcomb and published by Robert Nozick in 1969,
				Newcomb’s problem pits causal dominance against evidential expected
				value. Dominance (two-boxing) notes that Box B is already sealed:
				whether it holds $1,000,000 or $0, taking Box A adds $1,000. Evidential
				decision theory (one-boxing) conditions on what your choice reveals
				about the prediction: if the predictor has accuracy <em>p</em>, one box
				yields <em>p</em> × $1,000,000 while two boxes yield $1,000 + (1 −{" "}
				<em>p</em>) × $1,000,000, favoring one box whenever <em>p</em> &gt;
				50.05%.
			</p>

			<h3 id="free-will">Common causes and predictability</h3>
			<p>
				The predictor does not need precognition; it only needs your prior state
				(habits, reasoning, or source code) to correlate with both its
				prediction and your choice. Under compatibilist accounts of agency,
				choices that follow deterministically from your reasons are predictable
				without being coerced.
			</p>
			<div className="nc-fig">
				<figure className="nc-fig__panel">
					<Picture caused />
					<figcaption>
						When your prior state drives both the prediction and your choice,
						Box B and your action correlate. One-boxing maximizes expected
						payout.
					</figcaption>
				</figure>
				<figure className="nc-fig__panel">
					<Picture caused={false} />
					<figcaption>
						When your choice is independent of prior state (such as a coin
						flip), accuracy drops to 50% and two-boxing dominates.
					</figcaption>
				</figure>
			</div>

			<h3>How the predictors work</h3>
			<p>
				“Studies you” uses Scott Aaronson’s <em>n</em>-gram oracle: it searches
				your history for prior occurrences of your last five choices (backing
				off to shorter suffixes on ties) and predicts the most frequent
				continuation. Before you choose, the prediction and a random nonce are
				hashed with SHA-256 (verifiable via{" "}
				<code>printf &apos;round 7 full ...&apos; | shasum -a 256</code>).
			</p>
			<p>
				“Copies you” models Aaronson’s simulation argument and functional
				decision theory: you play the round twice without knowing which trial is
				the predictor’s simulation and which is the live payout. This is the
				third experiment in the series after{" "}
				<Link href="/experiments/deepseek" className="notes-out">
					Educated Guessing Machines
					<LifeArrow direction="right" seed={11} className="notes-out__arrow" />
				</Link>{" "}
				and{" "}
				<Link href="/experiments/every-program" className="notes-out">
					Every Program at Once
					<LifeArrow direction="right" seed={20} className="notes-out__arrow" />
				</Link>
				.
			</p>

			<h3>Sources</h3>
			<ol className="notes-sources">
				<li>
					Robert Nozick, “Newcomb’s Problem and Two Principles of Choice,” in{" "}
					<em>Essays in Honor of Carl G. Hempel</em> (Reidel, 1969), 114–146.
				</li>
				<li>
					Scott Aaronson, <em>Quantum Computing Since Democritus</em> (Cambridge
					University Press, 2013),{" "}
					<Out href="https://www.scottaaronson.com/democritus/lec18.html">
						Lecture 18
					</Out>
					.
				</li>
				<li>
					David Bourget and David J. Chalmers, “Philosophers on Philosophy: The
					2020 PhilPapers Survey,” <em>Philosophers’ Imprint</em> 23 (2023).
				</li>
				<li>
					Daniel C. Dennett,{" "}
					<em>Elbow Room: The Varieties of Free Will Worth Wanting</em> (MIT
					Press, 1984).
				</li>
				<li>
					Eliezer Yudkowsky and Nate Soares, “Functional Decision Theory,”{" "}
					<Out href="https://arxiv.org/abs/1710.05060">arXiv:1710.05060</Out>{" "}
					(2017).
				</li>
				<li>
					Moshe Tennenholtz, “Program Equilibrium,”{" "}
					<em>Games and Economic Behavior</em> 49 (2004): 363–373.
				</li>
			</ol>
		</div>
	);
}
