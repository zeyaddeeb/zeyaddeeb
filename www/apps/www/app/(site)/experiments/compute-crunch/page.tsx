import { CapacityLab } from "@/features/capacity/lab";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"compute-crunch",
	"Route the world’s AI demand by hand, then let a linear program show you what you missed and put a price on every constraint.",
);

export default function ComputeCrunchPage() {
	return (
		<ExperimentFrame
			id="compute-crunch"
			intro="Every level is a small world of data centers and cities that need AI compute. Route it yourself, then ask the solver. It finds the cheapest plan, proves nothing cheaper exists, and tells you what one more megawatt or one more tonne of carbon is worth."
			aside={<Notes />}
		>
			<CapacityLab />
		</ExperimentFrame>
	);
}

function Notes() {
	return (
		<div className="cc-notes">
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
								Σ carbon · x ≤ cap <small>level 4</small>
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
				In the last level, new capacity comes in 25 MW blocks. SCIP solves the
				integer program to choose where to build, then GLOP allocates the
				compute. Each block has a cost, so adding capacity only helps if the
				savings justify it.
			</p>
			<p>
				The model treats every megawatt of compute as interchangeable. It
				doesn’t account for GPU types, network capacity, queueing, or fairness.
			</p>
		</div>
	);
}
