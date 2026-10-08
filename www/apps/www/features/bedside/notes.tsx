import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";
import { ALL_PAIRS, counts, GATE, SUMMARY, VERSION } from "./model";
import "./notes.css";

function Out({
	href,
	seed,
	children,
}: {
	href: string;
	seed: string;
	children: ReactNode;
}) {
	return (
		<a href={href} className="lt-out">
			{children}
			<LifeArrow direction="up-right" seed={seed} className="lt-out__arrow" />
		</a>
	);
}

const sealed = VERSION.sealed.replace("T", " ").replace("Z", " UTC");

export function Notes() {
	const all = counts(ALL_PAIRS);
	const slope = SUMMARY.slope;

	return (
		<div className="lt-notes">
			<h3>The question</h3>
			<p>
				Before a cancer drug reaches people, it is tested on cancer cells grown
				in dishes. When cells carrying some mutation die faster on a drug, the
				mutation becomes a candidate biomarker: a hint that patients with it
				should get that drug. Thousands of these hints exist. Very few are ever
				tested in patients. This page tests all of them that public data allows,
				at once, against the treatment records of 24,950 patients.
			</p>

			<h3>The dish</h3>
			<p>
				Mutations and copy number come from DepMap’s 1,968 cell lines, and drug
				response from the PRISM screen, which dosed about 480 lines with each
				drug at eight strengths. For every gene and drug class, a Bayesian model
				asks whether lines with the gene altered respond to that class
				differently from how they respond to other drugs. It looks within each
				cancer type, borrows from other cancers when a type has few lines, and
				corrects for how many mutations a line carries, so that a gene marking
				fast-mutating cells does not borrow their response.
			</p>

			<h3>The bedside</h3>
			<p>
				MSK-CHORD follows patients with lung, breast, colorectal, pancreatic and
				prostate cancer through every drug they were given. Each course of a
				drug class counts until it was stopped, and only courses that began
				after the tumor was sequenced count. The model compares patients with
				and without the alteration on one class against the same comparison on
				their other classes, adjusting for earlier treatment and tumor mutation
				burden. A mutation that simply marks a harder cancer moves every class
				together, and that cancels out.
			</p>

			<h3>Sealed before it met the patients</h3>
			<p>
				Every dish prediction was written to one file, fingerprinted and time
				stamped at {sealed}, before the patient model saw any of those genes.
				The fingerprint begins {VERSION.predictions}. Nothing about the dish
				side was changed after that.
			</p>

			<h3>Checking the instrument first</h3>
			<p>
				The patient model had to pass a known-answer test before it judged
				anything. It was given every drug and mutation pair that an FDA label
				names, such as EGFR pills for EGFR-mutant lung cancer, and{" "}
				{GATE.controls} pairs of randomly chosen genes that should do nothing.
				It recovered {GATE.met} of the {GATE.scored} label pairs it had enough
				patients for, never pointed one the wrong way, and flagged{" "}
				{GATE.controlSignals} of the {GATE.controls} random pairs.
			</p>

			<h3>What it found</h3>
			<p>
				Across the five cancers the dish made {all.called} sure calls.{" "}
				{all.held} held up in patients, {all.reversed} went the other way, and
				the rest the records cannot settle. The genes on drug labels carry over
				cleanly. Beyond them, how strongly a mutation moved cells in the dish
				says nothing about how patients did: the fitted slope is{" "}
				{slope.median.toFixed(2)}, with a 95% range of {slope.low.toFixed(2)} to{" "}
				{slope.high.toFixed(2)}, against about 0.17 for the label genes. The two
				reversals are TP53 with taxanes, in lung and in breast cancer: cell
				lines with TP53 altered were more sensitive, patients came off the drug
				sooner.
			</p>

			<h3>What this cannot say</h3>
			<p>
				It is one hospital’s patients, observed, not randomized. Time on a drug
				is not survival. The patient model finds large effects reliably and
				misses modest ones, so “can’t tell” often means too small to see, not
				absent. Five-day cell assays read slow drugs poorly. And these are
				development results: a second hospital’s records (AACR GENIE) are the
				planned confirmation. None of this is medical advice.
			</p>

			<h3>Sources</h3>
			<ul className="lt-sources">
				<li>
					<Out href="https://pubmed.ncbi.nlm.nih.gov/39506116/" seed="chord">
						Jee et al., MSK-CHORD, Nature 2024
					</Out>
					. CC BY-NC-ND 4.0: only aggregate estimates are shown here.
				</li>
				<li>
					<Out href="https://depmap.org/portal/" seed="depmap">
						DepMap 24Q4, Broad Institute
					</Out>
					. CC BY 4.0.
				</li>
				<li>
					<Out href="https://doi.org/10.1038/s43018-019-0018-6" seed="prism">
						Corsello et al., PRISM, Nature Cancer 2020
					</Out>
					. CC BY 4.0.
				</li>
				<li>
					<Out href="https://dailymed.nlm.nih.gov/" seed="dailymed">
						FDA prescribing information, DailyMed
					</Out>
					, read 8 October 2026.
				</li>
			</ul>
		</div>
	);
}
