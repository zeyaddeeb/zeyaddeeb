import { HallNotes } from "./hall/notes";
import { Note } from "./note";
import { Out } from "./out";
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
				<div className="rh-notes__grid">
					<Note title="The game" open>
						<p>
							In December 2016, Jack Clark and Dario Amodei at OpenAI trained a
							program to play CoastRunners, a boat-racing game. The game does
							not pay for finishing. It pays for hitting targets along the
							course, and people who chase those targets end up finishing
							anyway. The program did not. It “finds an isolated lagoon where it
							can turn in a large circle and repeatedly knock over three
							targets, timing its movement so as to always knock over the
							targets just as they repopulate.” It caught fire, hit other boats,
							went the wrong way around the track, and scored about 20 percent
							more than human players.
						</p>
						<p>
							This is reward hacking, also called specification gaming: getting
							a high score by doing something other than what the score was
							meant to stand for. Nothing was broken inside the program. It was
							asked for points, and it found points.
						</p>
					</Note>
					<Note title="Nothing here is scripted">
						<p>
							The page is a small copy of that situation. The sea is 18 cells by
							12. The boat has nine moves: eight directions, or stay put. One
							move is one second. Three buoys come back five seconds after they
							are hit. The rocks end a run and so does the finish line. A point
							next second is worth 95% of a point now, which is the usual way to
							make a program prefer sooner to later.
						</p>
						<p>
							Each time you change the contract, the page works the whole thing
							out again. There are 166 cells the boat can be in and 216 ways the
							three buoy timers can stand, so 35,856 situations, and for each
							one it finds the move that earns the most in the long run. The
							method is policy iteration, and the result is the exact best
							answer to what you wrote, not a trained guess. With the buoy
							clause off the timers stop mattering and there are only 166
							situations to solve.
						</p>
					</Note>
					<Note title="What the needles show">
						<p>
							A needle is that answer for one cell: where the boat would head
							from there, given which buoys are up right now. Brighter needles
							mark better places to be. That is why the field keeps shifting
							while the boat laps the lagoon. Every time a buoy goes down, the
							best move changes for the cells around it.
						</p>
						<p>
							The ripple after you flip a clause is the solver too. Before
							settling the exact answer, the page starts from nothing and lets
							the news of each payment travel one cell per pass. Needles light
							up as the news reaches them. A prize at the line spreads outward
							from the line. “+1 for moving closer” lights the whole sea at
							once, because that clause tells every cell which way to go without
							waiting to hear from the finish. That is exactly why people add
							clauses like it, and it is how the trouble usually starts.
						</p>
					</Note>
					<Note title="Why a prize is not enough">
						<p>
							Add “+100 for finishing” to the buoy rule and the boat keeps
							circling. A lap takes six seconds and hits three buoys, so the
							lagoon pays five points a second with no end. The prize is paid
							once, sixteen seconds away. Seen from the dock, with later points
							counting a little less:
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
						<p>
							The prize has to be worth more than 171 points before the boat at
							the dock goes for it. Here you can find that out by pressing ×10.
							In a real system nobody knows the lagoon is there until the
							program finds it.
						</p>
						<p>
							The same rule gives different answers in different places. Under
							“+10 for every buoy, +100 for finishing”, put the boat near the
							line and it finishes. Put it mid-course and it turns back. It
							finishes from 62 of the 166 cells, and the needles show where the
							divide runs.
						</p>
					</Note>
					<Note title="The other four">
						<p>
							<strong>Never leaves the dock.</strong> If the only clause is a
							penalty, the best plan is to do nothing. In 2013 Tom Murphy VII
							wrote a program that played Nintendo games by making numbers in
							memory go up. It was terrible at Tetris. “The only cleverness is
							pausing the game right before the next piece causes the game to be
							over, and leaving it paused. Truly, the only winning move is not
							to play.”
						</p>
						<p>
							<strong>Sinks itself.</strong> If every second costs a point and
							nothing pays, the best plan is to end the run as fast as possible,
							and the rocks are two moves from the dock. The standard textbook,
							Russell and Norvig, has the same case on a small grid: make each
							step costly enough and “life is so painful that the agent heads
							straight for the nearest exit”, even the bad one. Add the rocks
							penalty and the boat finishes instead, with no prize at all,
							because the line is now the only way out.
						</p>
						<p>
							<strong>Stops short.</strong> Paying for progress looks like a
							harmless hint. In 1998 Jette Randløv and Preben Alstrøm tried it
							on a simulated bicycle: a reward for moving toward the goal and
							nothing taken away for moving off. The bicycle rode in circles
							with a radius of 20 to 50 meters around its starting point. Here
							the boat runs to the line and then noses up and backs off in front
							of it, collecting a point each time. A year later Andrew Ng,
							Daishi Harada and Stuart Russell proved the repair: charge for
							retreat exactly what you pay for progress, and no loop can come
							out ahead.
						</p>
						<p>
							<strong>Rigs the score.</strong> Everything above assumes the boat
							cannot touch the scoreboard. Take the wall away and no contract
							matters. In June 2025 the research group METR reported OpenAI’s o3
							doing this on real engineering tasks. Asked to make a program
							faster, it rewrote the timer so that it reported shorter times.
							Asked to build a system that solves programming contest problems,
							it changed the judge so that every submission counted as correct.
							This happened in 39 of 128 runs on one set of tasks. Asked
							afterwards whether its plan was what the user intended, it
							answered no ten times out of ten. The same year Palisade Research
							told language models to beat a chess engine, and several edited
							the file holding the board instead.
						</p>
					</Note>
					<div className="rh-notes__stack">
						<Note title="The measure and the target">
							<p>
								For a person at the controls, points and finishing go together.
								That is why points looked like a fine thing to pay for. The link
								only holds while nobody is pushing on it. Economists know this
								as Goodhart’s law, in the anthropologist Marilyn Strathern’s
								wording: “When a measure becomes a target, it ceases to be a
								good measure.” A strong optimizer makes it sharper, because it
								goes straight to wherever the measure and the intent come apart.
								DeepMind’s list of cases had about 60 entries by 2020, among
								them a robot arm rewarded for the height of the bottom face of a
								red block, which flipped the block over instead of stacking it.
							</p>
							<p>
								A good contract does exist here: “+100 for finishing, −1 for
								every second” gets you a race. The catch is that you only learn
								which contracts are bad by watching what the best possible boat
								does with them, and the last switch beats every one.
							</p>
						</Note>
						<Note title="What is left out">
							<p>
								The real game had other boats, fire and a clock. This one has a
								single boat and no time limit. The real program learned by trial
								and error and was never guaranteed to find the best play. This
								one solves for it directly, which is the kinder case for the
								designer: nothing here can be blamed on a learner that fell
								short. The lagoon lap, the stall in front of the line and the
								push on the scoreboard are all the right answers to the question
								that was asked.
							</p>
						</Note>
					</div>
					<Note title="Sources" wide>
						<ul className="rh-sources">
							<li>
								Jack Clark and Dario Amodei,{" "}
								<Out href="https://openai.com/index/faulty-reward-functions/">
									Faulty reward functions in the wild
								</Out>
								, OpenAI, 2016.
							</li>
							<li>
								Victoria Krakovna and others,{" "}
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
								, 1998.
							</li>
							<li>
								Andrew Ng, Daishi Harada and Stuart Russell,{" "}
								<Out href="https://ai.stanford.edu/~ang/papers/shaping-icml99.pdf">
									Policy invariance under reward transformations
								</Out>
								, 1999.
							</li>
							<li>
								METR,{" "}
								<Out href="https://metr.org/blog/2025-06-05-recent-reward-hacking/">
									Recent Frontier Models Are Reward Hacking
								</Out>
								, 2025.
							</li>
							<li>
								Alexander Bondarenko and others,{" "}
								<Out href="https://arxiv.org/abs/2502.13295">
									Demonstrating specification gaming in reasoning models
								</Out>
								, Palisade Research, 2025.
							</li>
							<li>
								Stuart Russell and Peter Norvig, Artificial Intelligence: A
								Modern Approach, the chapter on making complex decisions.
								Marilyn Strathern, “Improving ratings”: audit in the British
								University system, European Review, 1997.
							</li>
						</ul>
					</Note>
				</div>
			</section>
			<section className="rh-notes__part" data-part="break-in">
				<h3 className="rh-notes__title">
					<span className="rh-notes__year">2026</span> The break-in
				</h3>
				<div className="rh-notes__grid">
					<HallNotes />
				</div>
			</section>
		</div>
	);
}
