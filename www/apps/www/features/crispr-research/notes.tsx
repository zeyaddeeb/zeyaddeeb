import { Note } from "@/features/frame/note";

export function Notes() {
	return (
		<div className="notes-grid">
			<Note title="Reaction-diffusion model" open>
				<p>
					Intraperitoneal drug diffuses inward from the nodule surface while
					capillary washout clears it at rate <em>k</em> (roughly 40× cellular
					uptake), giving a characteristic decay length √(<em>D</em>/<em>k</em>
					). Effective penetration depth scales with that length times the log
					ratio of bath concentration to IC50. Once <em>k · t</em> exceeds ~3,
					the concentration profile reaches steady state and longer dwell times
					add negligible depth.
				</p>
			</Note>

			<Note title="Literature calibration">
				<p>
					Without parameter fitting, the solver matches published model depths
					for cisplatin (0.453 mm vs. 0.36–0.49 mm) and paclitaxel (0.593 mm vs.
					0.54–0.75 mm). However, nine experimental penetration measurements in
					the literature span 20 µm to 5 mm (a 250× range) due to differing
					assay endpoints and systemic vascular delivery. Because a 0.5 mm
					prediction trivially falls inside that span, this referee can falsify
					bad arithmetic but cannot award discovery credit.
				</p>
			</Note>

			<Note title="Knockout screen referee">
				<p>
					The gene-essentiality referee scores 63 colorectal cell lines in
					DepMap, separating known core-essential and non-essential gene sets at
					AUROC 0.9991. However, only six screened lines derive from peritoneal
					metastases (representing five unique patients, below the
					pre-registered minimum sample size), and none appear in the PRISM
					drug-sensitivity screen. Per-site comparisons are therefore withheld
					automatically.
				</p>
			</Note>

			<Note title="Pre-registered claims">
				<p>
					The agent must seal every claim with a quantitative threshold and a
					probability before a referee executes. Claims are scored strictly on
					calibration and information gain over prior baseline bounds, and
					untestable claims are recorded as refused rather than retried.
				</p>
			</Note>
		</div>
	);
}
