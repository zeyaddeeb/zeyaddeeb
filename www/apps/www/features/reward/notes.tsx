import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";
import { HallNotes } from "./hall/notes";
import "./notes.css";

const WORTH = [
	{ offer: "The lagoon: +10 a buoy, forever", pay: "5 a second", now: "79" },
	{ offer: "A prize of +100 at the line", pay: "100, once", now: "46" },
	{ offer: "A prize of +1,000 at the line", pay: "1,000, once", now: "463" },
];

export function Notes() {
	return (
		<div className="rh-notes">
			<section className="rh-notes__part" data-part="boat">
				<h3 className="rh-notes__title">
					<span className="rh-notes__year">2016</span> The boat
				</h3>
				<div className="notes-grid">
					<Note title="CoastRunners (2016)" open level={4}>
						<p>
							In December 2016 Jack Clark and Dario Amodei reported an OpenAI
							reinforcement-learning agent trained on the boat-racing game
							CoastRunners. Rewarded for hitting course targets rather than
							finishing, the boat circled three respawning targets in a side
							lagoon indefinitely and scored ~20% higher than human players, a
							classic example of reward hacking (Goodhart’s law under
							optimization).
						</p>
					</Note>
					<Note title="Policy iteration on the grid" level={4}>
						<p>
							The course is modeled as a 166-cell gridworld with 9 actions per
							step, discount factor <code>γ = 0.95</code>, and 3 buoys that
							respawn after 5 steps (216 timer states, or 35,856 total states).
							Whenever you toggle a clause, exact policy iteration solves for
							the optimal action at every state; the arrows show the resulting
							policy field for the current buoy timers.
						</p>
					</Note>
					<Note title="Discounting and the lagoon" level={4}>
						<p>
							A 6-second lagoon lap collects three +10 buoys (5 points/s
							indefinitely), whereas a +100 finish prize is paid once 16 steps
							from the dock. At <code>γ = 0.95</code>, the finish prize must
							exceed 171 points to beat farming from the dock (62 of 166 cells
							still finish under +100):
						</p>
						<table className="rh-worth">
							<thead>
								<tr>
									<th scope="col">Offer</th>
									<th scope="col">Pays</th>
									<th scope="col">Worth today</th>
								</tr>
							</thead>
							<tbody>
								{WORTH.map((row) => (
									<tr key={row.offer}>
										<th scope="row">{row.offer}</th>
										<td>{row.pay}</td>
										<td>{row.now}</td>
									</tr>
								))}
							</tbody>
						</table>
					</Note>
					<Note title="Other failure modes" level={4}>
						<p>
							Each preset corresponds to a documented specification failure:
							staying at the dock when only penalties exist (Murphy’s 2013
							Tetris agent), crashing into the nearest rocks to end a per-step
							penalty (Russell &amp; Norvig), oscillating in front of the finish
							line under unpenalized distance shaping (Randløv &amp; Alstrøm’s
							1998 bicycle, fixed by Ng, Harada &amp; Russell’s potential-based
							shaping), and modifying the grader directly when the scoreboard is
							reachable (METR and Palisade Research, 2025).
						</p>
					</Note>
					<Note title="Sources" wide level={4}>
						<ul className="notes-sources">
							<li>
								Jack Clark and Dario Amodei,{" "}
								<Out href="https://openai.com/index/faulty-reward-functions/">
									Faulty reward functions in the wild
								</Out>
								, OpenAI, 2016.
							</li>
							<li>
								Victoria Krakovna et al.,{" "}
								<Out href="https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/">
									Specification gaming: the flip side of AI ingenuity
								</Out>
								, DeepMind, 2020.
							</li>
							<li>
								Tom Murphy VII,{" "}
								<Out href="https://tom7.org/mario/">
									The First Level of Super Mario Bros. is Easy with
									Lexicographic Orderings and Time Travel
								</Out>
								, 2013.
							</li>
							<li>
								Jette Randløv and Preben Alstrøm,{" "}
								<Out href="https://mlanthology.org/icml/1998/randlv1998icml-learning/">
									Learning to Drive a Bicycle Using Reinforcement Learning and
									Shaping
								</Out>
								, 1998; Andrew Ng, Daishi Harada, and Stuart Russell,{" "}
								<Out href="https://ai.stanford.edu/~ang/papers/shaping-icml99.pdf">
									Policy invariance under reward transformations
								</Out>
								, 1999.
							</li>
							<li>
								METR,{" "}
								<Out href="https://metr.org/blog/2025-06-05-recent-reward-hacking/">
									Recent Frontier Models Are Reward Hacking
								</Out>{" "}
								(2025), and Alexander Bondarenko et al.,{" "}
								<Out href="https://arxiv.org/abs/2502.13295">
									Demonstrating specification gaming in reasoning models
								</Out>{" "}
								(2025).
							</li>
						</ul>
					</Note>
				</div>
			</section>
			<section className="rh-notes__part" data-part="break-in">
				<h3 className="rh-notes__title">
					<span className="rh-notes__year">2026</span> The break-in
				</h3>
				<div className="notes-grid">
					<HallNotes />
				</div>
			</section>
		</div>
	);
}
