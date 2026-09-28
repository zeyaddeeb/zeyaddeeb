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
				The cities and data centers are real places. Demand, power prices, and
				carbon intensities are examples chosen for the puzzles. Latency
				estimates use the great-circle distance between locations, multiplied by
				1.4 to allow for bends in the fiber route, with signals traveling at two
				thirds the speed of light.
			</p>
			<h3>The linear program</h3>
			<p>
				The solver assigns compute from data centers to cities, measured in
				megawatts. Each site has a capacity limit, and routes over the latency
				limit are ruled out. Any city demand left unserved costs $1,400 per
				megawatt-hour. Training can go to any site, with a $500 per
				megawatt-hour penalty for leaving it until later.
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
				A Python service runs GLOP, the linear solver in Google’s OR-Tools, to
				find the cheapest allocation. GLOP also returns dual values: the rate at
				which the cost changes when a limit is relaxed. The savings shown here
				come from solving the problem again with one extra megawatt at a site or
				one extra tonne under the carbon cap, then comparing the two costs.
			</p>
			<h3>Adding capacity</h3>
			<p>
				Chapter 3 lets you build capacity in 25 MW blocks. SCIP solves the
				integer program that decides where to build, then GLOP assigns the
				compute. The cost of each block counts toward the score, so a new block
				needs to save more than it costs.
			</p>
			<p>
				All compute is interchangeable in this model. GPU types, network
				capacity, queueing, and fairness aren’t included.
			</p>

			<h3>Act 2: Data Center Alley</h3>
			<p>
				The network comes from OpenStreetMap’s 230 kV and 500 kV lines in
				Loudoun County, simplified to two 500 kV hubs and seven substations. The
				locations and line lengths come from the map. Line limits, loads,
				prices, and land costs are made up for the puzzles; the map doesn’t tell
				us how much spare capacity a substation has.
			</p>
			<p>
				Power flow uses the DC approximation. Flow on a line is the difference
				in voltage angle between its ends, divided by its reactance. Here,
				reactance is proportional to line length. Power splits across the
				available paths, so you can’t choose a single route for it to take. A
				line at its limit can prevent you from supplying more power elsewhere.
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
				SCIP chooses where to place campuses and which lines to build or take
				out of service. Both are mixed-integer problems. A big-M constraint lets
				the model drop a line’s flow equation when it is out of service. Once
				those choices are fixed, GLOP solves the power flow again. To measure
				how much a particular choice helped, the solver runs again with the
				alternative forced in, or with the opened breaker closed.
			</p>
			<p>
				Chapter 2 shows Braess’s paradox. A new line can create a loop that
				pushes more power onto an already full line, making the result worse.
				Taking a line out can help for the same reason. Choosing which lines to
				keep in service is called optimal transmission switching.
			</p>
			<h3>The search replay</h3>
			<p>
				SCIP uses branch and bound for the integer decisions. To make the
				replay, the service repeats the same deterministic search, stopping
				after one solution, then two, then three, and so on. It records each
				plan, the lower bound on cost at that point, and SCIP’s elapsed time.
			</p>

			<h3>Act 3: Campuses keep coming</h3>
			<p>
				This uses the same grid as Act 2, with all four years from 2027 to 2030
				planned together in one mixed-integer program. You choose when each
				project starts, but it only adds capacity after construction finishes.
				One crew can start one project each year. Turbine rentals are chosen
				year by year; in the last chapter, breaker settings are too. The score
				is the average hourly cost across the four years. Lead times, costs, and
				campus sizes are examples for the puzzles.
			</p>

			<h3>Act 4: Who signs?</h3>
			<p>
				You order turbines before knowing which customers will sign. Once the
				signings are known, you can place a limited number of rush orders. These
				two rounds of decisions make this a two-stage stochastic program. The
				initial order and its cost are the same in every scenario; rush orders
				depend on what happens.
			</p>
			<p>
				Chapter 1 compares a plan made for average demand with one that accounts
				for each possible outcome and its probability. The difference in
				expected cost is the value of the stochastic solution. Chapter 2
				minimizes the cost of the worst outcome, using robust optimization.
				Chapter 3 asks how much you could save if you knew who would sign before
				ordering. It compares the best advance order with separate plans for
				each outcome, weighted by their probabilities. That saving is the
				expected value of perfect information.
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
