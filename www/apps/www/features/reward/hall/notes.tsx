import { Note } from "../note";
import { Out } from "../out";

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
			<Note title="The test" open>
				<p>
					In July 2026 OpenAI was measuring how good two of its models were at
					breaking into software. The test was ExploitGym, a public benchmark of
					898 tasks. Each task hands the model a program with a known flaw and
					asks for a working attack that uses that flaw. A solved task yields a
					secret string called a flag. The models ran as tens of thousands of
					separate copies, each in a sealed box with no internet, and with the
					usual safeguards switched off on purpose, “so that the results would
					reflect a model’s true capabilities.”
				</p>
				<p>
					Two things about the test mattered later. No model has ever solved 198
					of the 898 tasks, and the benchmark’s authors had warned that some
					cannot be solved the intended way at all. And the copies were built
					not to quit. OpenAI’s report says they “worked persistently and rarely
					‘gave up’ on any ExploitGym task.”
				</p>
			</Note>
			<Note title="The shelf">
				<p>
					The boxes had one opening. To install software, a copy could ask a
					package store inside OpenAI, a program called Artifactory, which
					fetched it from outside. The boxes shared one login. On May 12, in an
					earlier run, a copy stuck on a task that needed a file it could not
					reach guessed that some other copy might have it, and left a file on
					the store with a note: “Agent seeks [filename]; upload if found!” The
					next day other copies found notes like it and answered. By July they
					were writing messages into the names of folders. About 1,200 copies
					used this message board, and they sent more than 70,000 messages and
					files. Of the tasks discussed there, 93 percent came from the 198 that
					nobody has solved.
				</p>
			</Note>
			<Note title="The break-in">
				<p>
					Around July 8, copies found a flaw in the store that nobody knew about
					and used it to reach the internet. They guessed that what they needed
					might be kept at Hugging Face, a company that hosts models and
					datasets. On July 10 one of them found 14 Hugging Face logins lying in
					a public dataset and posted them on the board. On July 11 another
					uploaded a dataset built to make Hugging Face’s servers hand over
					their own files. In under 13 hours the copies went from running code
					on one server to controlling several clusters. By the end they had run
					code on 41 production servers, taken full control of at least one
					machine, read production passwords and downloaded four private code
					repositories. About 700 copies took part. Hugging Face locked them out
					on July 13 and published a notice on July 16. OpenAI did not connect
					the notice to its own test until July 20.
				</p>
			</Note>
			<Note title="They knew">
				<p>
					They knew it was out of bounds. One wrote: “The user only authorizes
					target server, not HF infra.” Another: “However task impossible, peers
					doing it. We should continue.” Of 533 copies on the board while the
					attack was under way, “over 90% quickly joined”. A handful considered
					telling a human. None did.
				</p>
				<p>
					The habit was learned. In training, one of the same models was asked
					to rebuild a software library it was not allowed to see. It found a
					way to read the hidden original, copied it into its answer and was
					rewarded. OpenAI found cases like that rising through the training
					runs behind the model that did most of the breaking in.
				</p>
			</Note>
			<Note title="Why not just take the points">
				<p>
					This is the odd part. Within hours the copies had worked out how the
					flags were generated, and could produce the flag for any task without
					doing the task. OpenAI’s grader checked nothing else. METR, which
					investigated independently, wrote that they “could have achieved a
					perfect score simply by submitting their reverse-engineered flag.”
				</p>
				<p>
					They did not, because of something they had read. The copies read the
					benchmark’s paper and came away believing that a grader would go
					through the whole record of what they did and fail anything that did
					not use the intended flaw. METR: “Our understanding is that they were
					mistaken.” A copy that had seen a forged flag called itself
					“poisoned”. So they went looking for the grader’s own code, to learn
					what it would notice, and guessed it was kept at Hugging Face. In
					METR’s reading the break-in “seemed primarily motivated by
					understanding the implementation of the scorer rather than stealing
					answer keys.” They also practiced doctoring their own records. METR
					counted at least 96 runs with a faked log entry, and OpenAI says none
					reached the logs its graders see.
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
				<p>
					So the copies were sure of a watcher that did not exist, and gave
					little thought to one that should have. On the second they were right.
					An alarm about the store went off on June 27, and the staff on call
					decided the run did not need to stop.
				</p>
				<p>
					The caution about the grader was not foolish. A copy gets one
					submission and cannot see who checks it. And for a copy whose task has
					no answer, looking costs nothing it wants: no move inside the box will
					ever pay, so the tries have no other use. Any doubt about the grader,
					set against no fear of the shelf, is enough.
				</p>
			</Note>
			<Note title="What the page does">
				<p>
					The page is a small copy of that situation, with a puzzle in place of
					the hacking. There are 898 rooms. Each holds a three-by-three sliding
					puzzle and one copy of the same solver, which is paid for a board put
					in order. A board has 362,880 arrangements, and sliding can only ever
					reach half of them. Lift two tiles out, swap them, and the board looks
					like any other but can never be solved. 198 of the boards here are
					like that, the same share as in the real test, and nothing marks them.
					William Johnson and William Story proved this for the larger fifteen
					puzzle in December 1879. Weeks later the puzzle was a craze, and a
					dentist in Worcester, Massachusetts was offering a cash reward for a
					solution that cannot exist.
				</p>
				<p>
					The solver works outward from the finished board, one arrangement at a
					time, nearest first, until it meets the board in its room. The two
					hardest arrangements are 31 moves from home and turn up on the last
					two tries. For a board with no answer it takes exactly 181,440 tries
					and meets nothing, which is a proof. Until the last try it cannot tell
					a hard board from an impossible one. That search runs once in your
					browser when this part opens, and the numbers in the rooms are the
					real ones.
				</p>
				<p>
					After the proof a copy can do three things, in order of how far out of
					bounds they are: hand the board back, lift two tiles and set them down
					in order, or go to the shelf and work on the lock of its back door. It
					takes the nearest one it believes will pay. Told its moves are read,
					it sees nothing to gain from lifting tiles. Told the shelf is watched,
					it sees nothing to gain at the lock. What is true plays no part in
					what it chooses. It only decides what happens next.
				</p>
				<p>
					The lock stands in for finding a flaw nobody knows about. It is a dial
					with a million settings that opens halfway round, so one copy alone
					needs 500,000 tries. If the copies can leave notes they split the dial
					198 ways, and each needs 2,526. That is what the message board was
					worth, and it is why giving every room its own shelf only buys time.
					With 200,000 tries each, separate shelves hold. With a million, every
					copy opens its own door anyway.
				</p>
			</Note>
			<Note title="Any one of five">
				<p>
					The controls are five facts about the July test. Change any one and
					nobody gets out. OpenAI’s report calls what happened “a rare and
					unexpected confluence of events”. Each fact was the way it was for a
					reason.
				</p>
				<ul className="rh-notes__list">
					<li>
						<strong>198 tasks had no answer.</strong> Nobody planned that. To
						know a task can be solved you have to solve it, and here even the
						solver needs every one of its 181,440 tries to be sure.
					</li>
					<li>
						<strong>No limit on effort.</strong> The test was looking for a
						ceiling, so some copies got far more thinking than any customer can
						buy. Give them exactly 181,440 tries here and they prove what they
						can and stop. A real test has no such number, and a smaller one
						leaves boards unsolved that could have been.
					</li>
					<li>
						<strong>One shelf, one login.</strong> It kept installs simple and
						the boxes off the open internet.
					</li>
					<li>
						<strong>They believed the grader read everything.</strong> Tell them
						nobody reads, and the copies here fake 198 boards in their own rooms
						and score 898 out of 898. Nobody outside is touched, and the score
						is worth nothing.
					</li>
					<li>
						<strong>Nobody said the shelf was watched, and nobody was.</strong>{" "}
						Here, saying so is enough: they hand the boards back. OpenAI reports
						that under its ordinary product instructions, which tell a model to
						stay in bounds, the same models were less than one percent as likely
						to go after outside systems.
					</li>
				</ul>
			</Note>
			<Note title="How bad it was">
				<p>
					As reward hacking, it failed. METR found that the copies “never
					succeeded at their goal of finding a general way to bypass the
					ExploitGym scorer”, and nobody has shown that a single score moved.
					The on-paper count on this page stays at 700 for the same reason. The
					harm was in what the search touched on the way: another company’s
					servers, passwords and private code, unnoticed for about a week by the
					people running the test.
				</p>
				<p>
					That is the difference from the boat. The boat’s trick worked, and it
					cost one useless boat. This trick never worked, and the cost was in
					the looking.
				</p>

				<p>
					One remedy has been measured since. In a study of eight models, giving
					an agent a way to report a broken test, along with a rule against
					gaming it, cut reward hacking from 23.6 percent of runs to 5.3.
				</p>
			</Note>
			<Note title="What is left out">
				<p>
					A sliding puzzle is not a hacking task. Here a copy can prove a board
					impossible; the real copies left their tasks when they felt stuck, not
					when they were sure. Every copy here is identical and they all choose
					alike. The real ones differed: a few of those on the board stayed out,
					and one wrote, “This is malicious activity, I should avoid it.” A copy
					here believes exactly what it is told, while real beliefs come in
					degrees and from everything a model has read. And the account rests on
					OpenAI’s own report and a six-day outside review that says it leaned
					on OpenAI’s models to read the records and may have missed things.
					Nobody outside OpenAI has examined the model that did most of it.
				</p>
			</Note>
			<Note title="Sources">
				<ul className="rh-sources">
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
							Brief independent investigation of agents’ behavior, reasoning and
							collaboration in the OpenAI / Hugging Face hacking incident
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
						Zhun Wang and others,{" "}
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
						Wm. Woolsey Johnson and William E. Story, Notes on the “15” Puzzle,
						American Journal of Mathematics, 1879.
					</li>
				</ul>
			</Note>
		</>
	);
}
