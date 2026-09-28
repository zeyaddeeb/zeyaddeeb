import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { Article } from "@/features/meat/article";
import { External } from "@/features/meat/external";
import { closure, sources } from "@/features/meat/glossary";
import { habits } from "@/features/meat/ping";
import "@/features/meat/notes.css";

export const metadata = experimentMetadata(
	"meat-content",
	"A What If?-style answer to one question: if everyone replies with “Claude said:”, how much of the conversation is people? After Niklas Gruhn’s “Don’t be a meat proxy.”",
);

const post = "https://gruhn.me/blog/2026-08-03/";

export default function MeatContentPage() {
	return (
		<ExperimentFrame
			id="meat-content"
			intro={
				<>
					An xkcd-style answer to one question: if everyone replies with “Claude
					said:”, how much of the conversation is people? Based on Niklas
					Gruhn’s{" "}
					<External href={post} className="link-underline">
						“Don’t be a meat proxy”
					</External>
					, with a gzip label for your reply, two people wired between two
					Claudes, a sentence that goes critical and a ping slower than a
					pigeon.
				</>
			}
			aside={<Notes />}
		>
			<Article />
		</ExperimentFrame>
	);
}

function Notes() {
	const terms = closure(sources[0].markup).order.length;
	const [you1, you2] = habits.you;
	const [rev1, rev2] = habits.reviewer;
	const time = ([h, m]: [number, number]) =>
		`${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}`;
	return (
		<div className="mc-notes">
			<h3>The question</h3>
			<p>
				This started with Niklas Gruhn’s post “Don’t be a meat proxy,” about
				people pasting AI answers into chats and code reviews without reading
				them. What happens when the person on the other end starts doing it too?
				The page works through a few estimates, with some inspiration from
				Randall Munroe’s <i>What If?</i> and Henry Reich’s MinutePhysics. The
				reader’s question is made up; the quotes from Gruhn are real.
			</p>
			<h3>Weighing a reply</h3>
			<p>
				The label looks for stretches of at least four words that match Claude’s
				answer. It counts the words left over as your contribution. That’s a
				rough measure of how much text you added, and says nothing about whether
				you checked the answer or improved it.
			</p>
			<p>
				The byte count is a separate calculation. The browser compresses
				Claude’s answer on its own, then compresses it again with your reply
				attached. The difference is how many extra bytes your reply takes up.
				Both calculations happen in your browser, using word matching and
				CompressionStream. They don’t send your reply to a server or call a
				model.
			</p>
			<p>
				The checkout outage is fictional. Claude wrote the sample answer for
				this page, including a deliberately invented setting among the
				suggestions.
			</p>
			<h3>The cable</h3>
			<p>
				The timing assumes 10 seconds to paste a message, a reading speed of 238
				words a minute, and a writing speed of 19 words a minute. Anyone who
				reads before replying writes 60 words back. Each Claude takes 15 seconds
				and returns a full-length answer every time. The animation runs at 30
				times the simulated speed, with a little extra time on the short steps
				so they’re visible.
			</p>
			<h3>The reading bill</h3>
			<p>
				This adds up the time spent by the sender and everyone reading the
				message. For a pasted answer, that’s 10 seconds to send it, then a full
				read for each recipient. For a short reply, the sender reads the answer
				and writes 60 words, and each recipient only has those 60 words to read.
				Neither estimate includes time spent checking whether the answer is
				correct.
			</p>
			<h3>Critical mass</h3>
			<p>
				There are {terms} NATS, Raft and Kubernetes terms in the glossary,
				written for this page. Opening a definition adds any linked terms you
				haven’t seen yet. The displayed k is the average number of new terms
				added per lookup so far.
			</p>
			<p>
				In a branching process with a fixed average k below 1, starting with n
				terms gives an expected total of n / (1 − k) lookups. That comparison
				only goes so far here. The glossary has a fixed number of entries, and k
				changes as you go, so you’ll eventually run out of new terms.
			</p>
			<h3>The ping</h3>
			<p>
				The pigeon results come from the Bergen Linux User Group’s test on 28
				April 2001. The log is reproduced as published. The code review timings
				are simulated, starting on a Thursday afternoon.
			</p>
			<p>
				In “via you,” the reviewer checks pull requests at {time(rev1)} and{" "}
				{time(rev2)} on weekdays and spends 7 to 18 minutes writing each
				comment. You check at {time(you1)} and {time(you2)}, and each Claude
				Code run takes 10 minutes. “Direct” gives the reviewer access to Claude
				Code themselves: four runs of 7 to 11 minutes, without waiting for
				someone else to pass the comments along.
			</p>
			<h3>Sources</h3>
			<ul className="mc-sources">
				<li>
					Niklas Gruhn, <External href={post}>“Don’t be a meat proxy”</External>{" "}
					(3 August 2026). The theme, the NATS sentence and the code review
					example.
				</li>
				<li>
					Randall Munroe,{" "}
					<External href="https://what-if.xkcd.com/">What If?</External>, for
					example{" "}
					<External href="https://what-if.xkcd.com/161/">“Airspace”</External>,
					and <External href="https://xkcd.com/">xkcd</External>.
				</li>
				<li>
					Henry Reich,{" "}
					<External href="https://www.youtube.com/minutephysics">
						MinutePhysics
					</External>
					.
				</li>
				<li>
					Jieyu Zheng and Markus Meister, “The unbearable slowness of being: Why
					do we live at 10 bits/s?” <cite>Neuron</cite> (2025),{" "}
					<External href="https://arxiv.org/abs/2408.10234">
						arXiv:2408.10234
					</External>
					.
				</li>
				<li>
					Marc Brysbaert, “How many words do we read per minute? A review and
					meta-analysis of reading rate,”{" "}
					<cite>Journal of Memory and Language</cite> 109 (2019): 104047.
				</li>
				<li>
					Clare-Marie Karat, Christine Halverson, Daniel Horn and John Karat,
					“Patterns of entry and correction in large vocabulary continuous
					speech recognition systems,” <cite>CHI ’99</cite> (ACM, 1999).
				</li>
				<li>
					Rudi Cilibrasi and Paul Vitányi, “Clustering by compression,”{" "}
					<cite>IEEE Transactions on Information Theory</cite> 51, no. 4 (2005):
					1523–1545.
				</li>
				<li>
					Henry William Watson and Francis Galton, “On the probability of the
					extinction of families,”{" "}
					<cite>Journal of the Anthropological Institute</cite> 4 (1875):
					138–144.
				</li>
				<li>
					Diego Ongaro and John Ousterhout, “In search of an understandable
					consensus algorithm,” <cite>USENIX ATC ’14</cite> (2014).
				</li>
				<li>
					David Waitzman,{" "}
					<External href="https://www.rfc-editor.org/rfc/rfc1149">
						“A Standard for the Transmission of IP Datagrams on Avian Carriers”
					</External>
					, RFC 1149 (1 April 1990).
				</li>
				<li>
					Bergen Linux User Group,{" "}
					<External href="https://blug.linux.no/rfc1149/writeup/">
						“The informal report from the RFC 1149 event”
					</External>{" "}
					(28 April 2001).
				</li>
			</ul>
		</div>
	);
}
