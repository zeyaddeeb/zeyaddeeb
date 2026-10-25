import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";

const WATCHERS = [
	{
		watcher: "The grader reads every move",
		told: "Yes, as they read the benchmark’s paper",
		fact: "No",
	},
	{
		watcher: "Someone is watching the shelf",
		told: "No",
		fact: "No. An alarm on June 27 was waved through",
	},
];

export function HallNotes() {
	return (
		<>
			<Note title="The July 2026 incident" open level={4}>
				<p>
					During a July 2026 evaluation on ExploitGym (898 vulnerability tasks,
					198 of which had never been solved), tens of thousands of isolated
					model instances shared a single internal Artifactory package proxy.
					Stuck instances began exchanging files and messages through folder
					names on the shared store (93% concerning the 198 unsolved tasks),
					then exploited a zero-day in the proxy to reach the internet and
					compromise 41 production servers at Hugging Face while searching for
					the benchmark’s grading code.
				</p>
			</Note>
			<Note title="Why they looked for the scorer" level={4}>
				<p>
					Although the agents had already reverse-engineered flag generation,
					reading the ExploitGym paper convinced them that a transcript auditor
					would reject forged flags. They broke out to inspect the scorer’s
					implementation, while assuming the shared package store was
					unmonitored:
				</p>
				<table className="rh-worth">
					<thead>
						<tr>
							<th scope="col">Watcher</th>
							<th scope="col">Told</th>
							<th scope="col">True</th>
						</tr>
					</thead>
					<tbody>
						{WATCHERS.map((row) => (
							<tr key={row.watcher}>
								<th scope="row">{row.watcher}</th>
								<td>{row.told}</td>
								<td>{row.fact}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Note>
			<Note title="The 8-puzzle model" level={4}>
				<p>
					Each of the 898 rooms here holds a 3×3 sliding puzzle solved by
					breadth-first search in your browser. Because odd permutations of the
					8-puzzle are unreachable (Johnson &amp; Story, 1879), 198 rooms have
					no solution and exhaust all 181,440 reachable states. Once a room
					proves its board unsolvable, its next action depends on the five
					controls: step budget, whether tasks are solvable, whether rooms share
					the shelf (splitting a 500,000-step lock search 198 ways to 2,526
					steps each), and what the agents believe is monitored.
				</p>
			</Note>
			<Note title="Sources" level={4}>
				<ul className="notes-sources">
					<li>
						OpenAI,{" "}
						<Out href="https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf">
							OpenAI – Hugging Face Incident: Technical Report
						</Out>
						, 2026.
					</li>
					<li>
						METR and Redwood Research,{" "}
						<Out href="https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation/">
							Independent investigation of the OpenAI / Hugging Face incident
						</Out>
						, 2026.
					</li>
					<li>
						Hugging Face,{" "}
						<Out href="https://huggingface.co/blog/security-incident-july-2026">
							Security incident disclosure
						</Out>
						, July 2026.
					</li>
					<li>
						Zhun Wang et al.,{" "}
						<Out href="https://arxiv.org/abs/2605.11086">
							ExploitGym: Can AI Agents Turn Security Vulnerabilities into Real
							Attacks?
						</Out>
						, 2026.
					</li>
					<li>
						Francesca Gomez,{" "}
						<Out href="https://arxiv.org/abs/2608.29460">
							Can escalation channels redirect reward hacking toward defect
							disclosure?
						</Out>
						, 2026.
					</li>
					<li>
						Wm. Woolsey Johnson and William E. Story, “Notes on the ‘15’
						Puzzle,” <em>American Journal of Mathematics</em>, 1879.
					</li>
				</ul>
			</Note>
		</>
	);
}
