import { Out } from "@/features/frame/out";
import { ALL_PAIRS, counts, GATE, SUMMARY, VERSION } from "./model";

const sealed = VERSION.sealed.replace("T", " ").replace("Z", " UTC");

export function Notes() {
	const all = counts(ALL_PAIRS);
	const slope = SUMMARY.slope;

	return (
		<div className="lt-notes">
			<h3>Preclinical and clinical models</h3>
			<p>
				Preclinical estimates combine mutations and copy number from 1,968
				DepMap cell lines with eight-point dose-response curves from PRISM (~480
				lines per drug). A hierarchical Bayesian model in PyMC estimates whether
				alterations in a gene shift sensitivity to a drug class relative to
				other classes within each cancer type, pooling across lineages and
				adjusting for mutation burden.
			</p>
			<p>
				Clinical estimates use MSK-CHORD treatment records for 24,950 patients
				across lung, breast, colorectal, pancreatic, and prostate cancer. Using
				regimens started after tumor sequencing, the model compares
				time-to-treatment-discontinuation on the target drug class against the
				same comparison on other classes, adjusting for prior lines of therapy
				and tumor mutation burden so general prognostic effects cancel out.
			</p>

			<h3>Pre-registration and validation</h3>
			<p>
				All preclinical predictions were sealed and hashed at {sealed} (SHA-256
				prefix <code>{VERSION.predictions}</code>) before fitting the patient
				model. On a positive/negative control gate of FDA-labeled biomarker
				pairs and {GATE.controls} random gene–drug pairs, the clinical model
				recovered {GATE.met} of {GATE.scored} powered label pairs with zero sign
				reversals and flagged {GATE.controlSignals} of {GATE.controls} random
				controls.
			</p>

			<h3>Findings and limitations</h3>
			<p>
				Across the five cancers, the preclinical model made {all.called}{" "}
				high-confidence calls: {all.held} replicated in patients, {all.reversed}{" "}
				reversed direction (TP53 with taxanes in lung and breast cancer), and
				the remainder were inconclusive. Outside FDA-labeled biomarkers (slope
				~0.17), preclinical effect size did not predict clinical benefit (slope{" "}
				{slope.median.toFixed(2)}, 95% CI {slope.low.toFixed(2)} to{" "}
				{slope.high.toFixed(2)}). Results reflect observational
				time-on-treatment from a single center, not randomized survival outcomes
				or medical advice.
			</p>

			<h3>Sources</h3>
			<ul className="notes-sources">
				<li>
					<Out href="https://pubmed.ncbi.nlm.nih.gov/39506116/">
						Jee et al., MSK-CHORD, Nature 2024
					</Out>{" "}
					(CC BY-NC-ND 4.0; aggregate estimates only).
				</li>
				<li>
					<Out href="https://depmap.org/portal/">
						DepMap 24Q4, Broad Institute
					</Out>{" "}
					(CC BY 4.0).
				</li>
				<li>
					<Out href="https://doi.org/10.1038/s43018-019-0018-6">
						Corsello et al., PRISM, Nature Cancer 2020
					</Out>{" "}
					(CC BY 4.0).
				</li>
				<li>
					<Out href="https://dailymed.nlm.nih.gov/">
						FDA prescribing information, DailyMed
					</Out>
					.
				</li>
			</ul>
		</div>
	);
}
