import { CapacityLab } from "@/features/capacity/lab";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"compute-crunch",
	"Four acts of AI capacity planning against real solvers: route compute, wire a real county grid, schedule years of construction, and order before you know who signs.",
);

export default function ComputeCrunchPage() {
	return (
		<ExperimentFrame
			id="compute-crunch"
			intro="Four acts, three chapters each. Act 1 routes AI compute around the world. Act 2 moves to Data Center Alley in Loudoun County, Virginia, where power splits across every line by physics. Act 3 adds time: projects take years and campuses keep coming. Act 4 adds chance: you order before anyone signs. Every chapter ends with a real solver’s answer, and on the hard ones you can watch it search."
			aside={<Notes />}
		>
			<CapacityLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="cc-notes">
			<h3>Act 1: Route the world</h3>
			<p>
				The locations are real, but the demand is made up for these puzzles.
				Latency is estimated using great-circle distance, a signal speed of two
				thirds the speed of light, and a 1.4× multiplier to account for indirect
				fiber routes. Regional power prices and grid carbon intensities are
				rough examples.
			</p>
			<h3>The linear program</h3>
			<p>
				The solver chooses how many megawatts of compute each data center
				allocates to each city. It excludes routes that exceed the latency limit
				and keeps each site within its capacity. Unmet city demand adds a $1,400
				per megawatt-hour penalty to the cost. Training can run at any site;
				postponing it adds a $500 per megawatt-hour penalty.
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
			<h3>The solver</h3>
			<p>
				A Python service uses GLOP, the linear solver in Google’s OR-Tools, to
				find the lowest-cost allocation. It also returns dual values, which
				describe how the minimum cost changes as constraints are relaxed. The
				savings shown on the page are calculated by running the solver again
				with one extra megawatt of capacity at a site, or one extra tonne
				allowed under the carbon cap, and comparing the costs.
			</p>
			<h3>Adding capacity</h3>
			<p>
				In chapter 3, new capacity comes in 25 MW blocks. SCIP solves the
				integer program to choose where to build, then GLOP allocates the
				compute. Each block has a cost, so adding capacity only helps if the
				savings justify it.
			</p>
			<p>
				The model treats every megawatt of compute as interchangeable. It
				doesn’t account for GPU types, network capacity, queueing, or fairness.
			</p>

			<h3>Act 2: Data Center Alley</h3>
			<p>
				The substations, their neighborhoods, and the shape of the network come
				from OpenStreetMap’s map of the 230 kV and 500 kV lines in Loudoun
				County, simplified to two 500 kV hubs and seven substations. Line
				lengths are real. Line limits, loads, prices, and land costs are
				illustrative; utilities don’t publish substation headroom.
			</p>
			<p>
				Power flow uses the standard DC approximation: the flow on a line is the
				difference in voltage angle across it divided by its reactance, which
				here is proportional to its length. So power can’t be sent down one
				line. Every injection spreads across every path at once, and one full
				line limits the whole network.
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
			<h3>The solvers</h3>
			<p>
				Placing campuses is a mixed-integer program, solved with SCIP. Choosing
				which lines to build or switch out is another, solved with SCIP: a line
				out of service drops its flow equation, written with a big-M constraint.
				Both return a decision, and GLOP then re-solves the power flow exactly.
				The key move is measured with the same counterfactual approach as Act 1:
				force the tempting choice, or close the opened breaker, and solve again.
			</p>
			<p>
				Chapter 2 is Braess’s paradox on a power grid. Adding a line adds a new
				loop, and the physics of that loop can push more power onto a line that
				is already full. Removing a line can do the opposite. Grid operators use
				this on purpose; it is called optimal transmission switching.
			</p>
			<h3>Watching the solver think</h3>
			<p>
				Where a chapter needs integer decisions, SCIP searches with branch and
				bound. The replay is real: the service reruns SCIP’s deterministic
				search, stopping after its first, second, third solution and so on, and
				records each plan with the lower bound SCIP had proved at that moment.
				The times shown are SCIP’s own.
			</p>

			<h3>Act 3: Campuses keep coming</h3>
			<p>
				The grid is Act 2’s, solved once per year from 2027 to 2030 as one
				mixed-integer program. Each project gets a start year; it counts only
				once its lead time has passed, and one crew can start one project a
				year. Turbines are rented per year, and in the last chapter breakers can
				be opened per year too. The score is the average hour across the four
				years. Lead times, costs, and campus sizes are illustrative.
			</p>

			<h3>Act 4: Who signs?</h3>
			<p>
				This is a two-stage stochastic program. Turbines ordered today are the
				first stage and cost the same in every future; rush orders are the
				second, chosen after the signings are known, and they are scarce.
				Chapter 1 measures the value of the stochastic solution: how much worse
				the plan built for the average signing does across the real futures.
				Chapter 2 minimizes the most expensive future instead, which is robust
				optimization. Chapter 3 is the expected value of perfect information:
				the best blind plan against the best plan for each future, weighted by
				the odds.
			</p>

			<h3>Sources</h3>
			<ul className="cc-sources">
				<li>
					Dietrich Braess, “Über ein Paradoxon aus der Verkehrsplanung,”{" "}
					<cite>Unternehmensforschung</cite> 12 (1968): 258–268. The original
					statement of Braess’s paradox, for road traffic.
				</li>
				<li>
					Dirk Witthaut and Marc Timme, “Braess’s paradox in oscillator
					networks, desynchronization and power outage,”{" "}
					<cite>New Journal of Physics</cite> 14 (2012): 083036. Braess’s
					paradox in power grids.
				</li>
				<li>
					Emily B. Fisher, Richard P. O’Neill, and Michael C. Ferris, “Optimal
					transmission switching,”{" "}
					<cite>IEEE Transactions on Power Systems</cite> 23, no. 3 (2008):
					1346–1355.
				</li>
				<li>
					John R. Birge, “The value of the stochastic solution in stochastic
					linear programs with fixed recourse,”{" "}
					<cite>Mathematical Programming</cite> 24 (1982): 314–325.
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
