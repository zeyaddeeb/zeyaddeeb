import { CapacityLab } from "@/features/capacity/lab";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"compute-crunch",
	"Four acts of AI capacity planning solved with OR-Tools: route global demand, balance a county grid, schedule multi-year builds, and plan under uncertainty.",
);

export default function ComputeCrunchPage() {
	return (
		<ExperimentFrame
			id="compute-crunch"
			intro="Four puzzles on AI infrastructure planning, each paired with a linear, mixed-integer, or stochastic solver in OR-Tools: route global demand, wire Loudoun County substations under DC power flow, schedule multi-year construction, and order turbines before demand is known."
			aside={<Notes />}
		>
			<CapacityLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="cc-notes">
			<h3>Act 1: Global routing</h3>
			<p>
				A linear program solved with GLOP in Google’s OR-Tools assigns megawatts
				from data centers to cities subject to site capacity, route latency
				(great-circle distance × 1.4 at 2/3 c), and an optional carbon cap.
				Unserved city demand costs $1,400/MWh; deferred training costs $500/MWh.
				Dual values measure the marginal savings from adding 1 MW at a site or 1
				tonne under the carbon cap. Chapter 3 adds discrete 25 MW capacity
				blocks solved with SCIP.
			</p>
			<dl className="cc-formula">
				<div>
					<dt>minimize</dt>
					<dd>
						<ul>
							<li>Σ price · x + 1400 · unserved + 500 · unserved training</li>
						</ul>
					</dd>
				</div>
				<div>
					<dt>subject to</dt>
					<dd>
						<ul>
							<li>Σ x into each city + unserved = demand</li>
							<li>Σ x out of each site ≤ capacity</li>
							<li>
								Σ carbon · x ≤ cap <small>chapter 2</small>
							</li>
							<li>x ≥ 0, only on routes within the latency limit</li>
						</ul>
					</dd>
				</div>
			</dl>

			<h3>Act 2: Loudoun County grid</h3>
			<p>
				Two 500 kV hubs and seven substations simplified from OpenStreetMap’s
				Loudoun County transmission network, modeled with DC power flow where
				line reactance is proportional to length. SCIP solves the mixed-integer
				decisions (campus placement, new lines, and optimal transmission
				switching via big-M constraints) and GLOP solves the resulting power
				flow. Chapter 2 demonstrates Braess’s paradox, where adding a line
				overloads a parallel path and opening a breaker increases deliverable
				power.
			</p>
			<dl className="cc-formula">
				<div>
					<dt>minimize</dt>
					<dd>
						<ul>
							<li>
								Σ price · supply + 1400 · dark + Σ land · campus + Σ cost · new
								line
							</li>
						</ul>
					</dd>
				</div>
				<div>
					<dt>subject to</dt>
					<dd>
						<ul>
							<li>supply − load + dark = flow out − flow in, at every bus</li>
							<li>flow = (θa − θb) / km, on every line in service</li>
							<li>−limit ≤ flow ≤ limit</li>
							<li>
								each campus on exactly one substation <small>chapter 1</small>
							</li>
							<li>
								each line in or out of service, at most one new{" "}
								<small>chapter 2</small>
							</li>
						</ul>
					</dd>
				</div>
			</dl>

			<h3>Act 3: Multi-year schedule</h3>
			<p>
				A single mixed-integer program plans 2027–2030 on the Act 2 grid. One
				crew can start one upgrade per year, and capacity comes online only
				after each project’s lead time. Turbine rentals and breaker states are
				chosen annually to minimize average hourly cost across the four-year
				window.
			</p>

			<h3>Act 4: Two-stage stochastic planning</h3>
			<p>
				First-stage turbine orders are placed before customer signings are
				known; second-stage rush orders adjust once a scenario is realized.
				Chapter 1 computes the value of the stochastic solution (VSS) over
				planning for average demand, Chapter 2 minimizes worst-case cost via
				robust optimization, and Chapter 3 computes the expected value of
				perfect information (EVPI).
			</p>

			<h3>Sources</h3>
			<ul className="notes-sources">
				<li>
					Dietrich Braess, “Über ein Paradoxon aus der Verkehrsplanung,”{" "}
					<cite>Unternehmensforschung</cite> 12 (1968): 258–268.
				</li>
				<li>
					Dirk Witthaut and Marc Timme, “Braess’s paradox in oscillator
					networks, desynchronization and power outage,”{" "}
					<cite>New Journal of Physics</cite> 14 (2012): 083036.
				</li>
				<li>
					Emily B. Fisher, Richard P. O’Neill, and Michael C. Ferris, “Optimal
					transmission switching,”{" "}
					<cite>IEEE Transactions on Power Systems</cite> 23, no. 3 (2008):
					1346–1355.
				</li>
				<li>
					John R. Birge and François Louveaux,{" "}
					<cite>Introduction to Stochastic Programming</cite>, 2nd ed.
					(Springer, 2011).
				</li>
				<li>
					Aharon Ben-Tal, Laurent El Ghaoui, and Arkadi Nemirovski,{" "}
					<cite>Robust Optimization</cite> (Princeton University Press, 2009).
				</li>
				<li>
					Map data © OpenStreetMap contributors, available under the ODbL.
				</li>
			</ul>
		</div>
	);
}
