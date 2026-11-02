import Link from "next/link";
import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";
import { PAIRS } from "./deal";
import { cost, PRESETS } from "./deck";
import { DELFT, RING_NATURE } from "./delft";
import { leastKm, lightMs, SITES } from "./sites";

const SOURCES = [
	{
		href: "https://doi.org/10.1007/BF02650179",
		text: "Feynman (1982), Simulating Physics with Computers, International Journal of Theoretical Physics 21, 467",
	},
	{
		href: "https://doi.org/10.1063/1.880968",
		text: "Mermin (1985), Is the moon there when nobody looks? Reality and the quantum theory, Physics Today 38, 38",
	},
	{
		href: "https://doi.org/10.1103/PhysRevLett.49.1804",
		text: "Aspect, Dalibard and Roger (1982), Experimental Test of Bell’s Inequalities Using Time-Varying Analyzers",
	},
	{
		href: "https://doi.org/10.1103/PhysRevLett.81.5039",
		text: "Weihs, Jennewein, Simon, Weinfurter and Zeilinger (1998), Violation of Bell’s Inequality under Strict Einstein Locality Conditions",
	},
	{
		href: "https://doi.org/10.1038/35057215",
		text: "Rowe and colleagues (2001), Experimental violation of a Bell’s inequality with efficient detection",
	},
	{
		href: "https://doi.org/10.1038/nature12012",
		text: "Giustina and colleagues (2013), Bell violation using entangled photons without the fair-sampling assumption",
	},
	{
		href: "https://doi.org/10.1038/nature15759",
		text: "Hensen and colleagues (2015), Loophole-free Bell inequality violation using electron spins separated by 1.3 kilometres",
	},
	{
		href: "https://doi.org/10.4121/uuid:6e19e9b2-4a2d-40b5-8dd3-a660bf3c0a31",
		text: "Hensen and colleagues (2015), dataset on 4TU.ResearchData",
	},
	{
		href: "https://arxiv.org/abs/2209.00702",
		text: "Gill (2022), Optimal statistical analyses of Bell experiments, with the Delft counts per setting in Appendix A",
	},
	{
		href: "https://doi.org/10.1103/PhysRevLett.115.250401",
		text: "Giustina and colleagues (2015), Significant-Loophole-Free Test of Bell’s Theorem with Entangled Photons",
	},
	{
		href: "https://doi.org/10.1103/PhysRevLett.115.250402",
		text: "Shalm and colleagues (2015), Strong Loophole-Free Test of Local Realism",
	},
	{
		href: "https://doi.org/10.1038/s41586-018-0085-3",
		text: "The BIG Bell Test Collaboration (2018), Challenging local realism with human choices",
	},
	{
		href: "https://doi.org/10.1103/PhysRevLett.121.080403",
		text: "Rauch and colleagues (2018), Cosmic Bell Test Using Random Measurement Settings from High-Redshift Quasars",
	},
	{
		href: "https://istio.io/latest/docs/ambient/install/multicluster/",
		text: "Istio, Ambient multicluster",
	},
];

const [dalles, ashburn] = SITES;
const apart = dalles && ashburn ? leastKm(dalles, ashburn) : 0;
const nature = PRESETS.find((p) => p.id === "nature")?.deck;

export function Notes() {
	return (
		<div className="notes-grid">
			<Note title="Feynman’s six-dot cards (1982)" open>
				<p>
					In “Simulating Physics with Computers” (1982), Richard Feynman asked
					whether a local hidden-variable program could imitate two entangled
					photons. Because identical polarizer angles always agree (
					<code>cos² 0° = 1</code>) and orthogonal angles always disagree (
					<code>cos² 90° = 0</code>), a deterministic state evaluated across six
					angles 30° apart (<code>0°–150°</code>) reduces to one of eight
					six-dot cards with opposite colors 90° apart (plotted here at{" "}
					<code>2θ</code> so orthogonal angles sit across the ring). Any card
					must switch color at least twice around the circle, bounding classical
					agreement at <code>4/6 = 2/3</code> (Figure 5a), whereas quantum
					mechanics predicts <code>cos² 30° = 3/4</code>.
				</p>
			</Note>
			<Note title="Quasi-probabilities and the −1/8 weight">
				<p>
					Feynman noted that matching quantum correlations with local hidden
					variables requires negative probabilities. Each of the six half cards
					matches <code>2/3</code> of the time at 30° and <code>1/3</code> at
					60°; the two alternating stripe cards match <code>0</code> at 30° and{" "}
					<code>1</code> at 60°. Giving the six half cards weight{" "}
					<code>+3</code> and the two stripes weight <code>−1</code> (
					<code>+9/8</code> and <code>−1/8</code> of the net total) reproduces{" "}
					<code>cos² θ</code> at all four angle steps (
					<code>1, 3/4, 1/4, 0</code>). Sampling by absolute weight (
					<code>20</code> for a net sum of <code>16</code>) and subtracting
					negatively signed trials inflates estimator variance by{" "}
					<code>(20/16)² = {nature ? cost(nature).toFixed(2) : "1.56"}×</code>{" "}
					per pair—the sign problem behind Feynman’s case for quantum computers.
				</p>
			</Note>
			<Note title="Locality, detection, and freedom of choice">
				<p>
					Each alternate deal demonstrates one classical Bell loophole.{" "}
					<em>Talk</em> exploits the locality loophole by forwarding East’s dial
					over the mesh before West answers (closed with fast-switching
					analyzers by Aspect et al., 1982, and random settings at 400 m by
					Weihs et al., 1998). <em>Go dark</em> exploits the fair-sampling
					loophole by answering only along a card’s preferred axis (
					<code>1/3</code> of trials), matching <code>3/4</code> on
					post-selected pairs while falling below <code>2/3</code> when silences
					are scored honestly (closed for ions in 2001, photons in 2013, and
					jointly with locality in 2015). <em>Fixed dials</em> violates
					measurement independence by choosing both dials at the source before
					printing the card (tested with human and cosmic random number
					generators in 2018; see{" "}
					<Link href="/experiments/already-sealed" className="notes-out">
						Already Sealed
					</Link>
					).
				</p>
			</Note>
			<Note title="Spacelike referee and multicluster mesh">
				<p>
					One Rust binary runs across <code>GKE us-west1</code> (The Dalles),{" "}
					<code>GKE us-east4</code> (Ashburn), and <code>EKS us-east-1</code>{" "}
					(Northern Virginia), linked by an Istio ambient mesh over mutual-TLS
					east–west gateways. Between Oregon and Ashburn (≥
					{Math.round(apart).toLocaleString("en-US")} km after campus radii),
					one-way light travel takes {lightMs(apart).toFixed(1)} ms. Before each{" "}
					{PAIRS.toLocaleString("en-US")}-pair run (one trial every 0.5 ms over
					1.2 s), stations query their cloud’s link-local SNTP server (
					<code>169.254.169.254</code> on GCP, <code>169.254.169.123</code> on
					AWS) and draw dials from <code>getrandom</code>; a trial is certified
					spacelike only when its answer timestamp precedes light arrival from
					the remote dial minus both clocks’ error bounds. Same-region pairs,
					mid-run disconnects, or unmeasured clocks are flagged automatically.
				</p>
			</Note>
			<Note title="Delft 2015 replay">
				<p>
					Hensen et al. entangled two NV-centre electron spins{" "}
					{DELFT.metres.toLocaleString("en-US")} m apart (light:{" "}
					<code>{DELFT.lightUs} µs</code>) and ran {DELFT.trials} event-ready
					trials over {DELFT.hours} hours. Each lab drew its basis in 160 ns,
					began readout within <code>{DELFT.choiceUs} µs</code> and finished a{" "}
					<code>{DELFT.readoutUs} µs</code> readout 90 ns before light from the
					other lab could arrive. Their axes sit 22.5° apart, so each trial
					reads two neighbors of an eight-dot card: classical cards match at
					most <code>6/8 = 3/4</code>, a perfect pair{" "}
					<code>cos² 22.5° ≈ {RING_NATURE.toFixed(3)}</code>. The spins matched
					in{" "}
					<code>
						{DELFT.wins}/{DELFT.trials} ={" "}
						{(DELFT.wins / DELFT.trials).toFixed(3)}
					</code>{" "}
					of trials (<code>S = 2.42 ± 0.20</code>, <code>p ≤ 0.039</code> even
					allowing memory), which as a deck needs at least <code>1/15</code>{" "}
					negative weight. The replay deals the published per-setting counts
					(Gill, 2022, consistent with <code>k = 196</code> in Hensen’s Figure
					4) in shuffled order. The trial-by-trial file on 4TU.ResearchData was
					unreachable when this was built, so the diagram shows the published
					timing budget rather than each trial’s clock.
				</p>
			</Note>
			<Note title="Recorded runs when the clusters are off">
				<p>
					When the dealer can’t be reached, or fewer than two stations answer,
					the page replays runs recorded from the live clusters: Feynman’s card,
					one of each, minus one eighth, and the three cheats, each{" "}
					{PAIRS.toLocaleString("en-US")} pairs between The Dalles and Ashburn
					with their measured clocks and timestamps. A deck that wasn’t recorded
					is re-dealt from recorded trials that carried the same cards, keeping
					each trial’s real dials, answers and timing and signing it by your
					counts; the status line says so. A run is only archived if both clocks
					were measured, no station went dark and the stations sat a light-cone
					apart. With no archive at all, the page shuffles in your browser and
					says it has no light cone.
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
			</Note>
		</div>
	);
}
