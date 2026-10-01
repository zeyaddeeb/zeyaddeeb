import type { ReactNode } from "react";
import { answer, nats, paste } from "./answer";
import { Bill } from "./bill";
import { Book, type Page } from "./book";
import { Cable } from "./cable";
import { External } from "./external";
import { closure, measure, open, sources, start } from "./glossary";
import {
	breakEven,
	pace,
	readSeconds,
	scale,
	span,
	words,
	writeSeconds,
} from "./meat";
import { Note } from "./note";
import { Pigeon } from "./pigeon";
import { mean, pigeonMean, relay } from "./ping";
import { Reaction } from "./reaction";
import { Terminal } from "./terminal";
import { CableArt, ChainArt, CrowdArt, LabelArt, PigeonArt } from "./vignettes";
import { Weigh } from "./weigh";
import { totals, trip } from "./wire";
import "./meat.css";

const post = "https://gruhn.me/blog/2026-08-03/";

const answerWords = words(answer).length;
const pasted = scale(answer)(paste);
const even = breakEven(answerWords);
const slower = mean(relay()) / pigeonMean;
const full = measure(closure(sources[0].markup));
const deepest = Math.max(
	...Object.values(closure(sources[0].markup).nodes).map((n) => n.depth),
);
const early = (() => {
	let r = start(sources[0].markup);

	for (const id of r.seed) r = open(r, id);

	return measure(r).k ?? 0;
})();
const counted = ["no", "one", "two", "three", "four", "five"];
const fast = totals(trip("paste", "paste", answerWords)).seconds;
const slow = totals(trip("read", "read", answerWords)).seconds;
const meat = `${Math.round(pasted.share * 1000) / 10}%`;

function Figure({
	children,
	caption,
	wide,
}: {
	children: ReactNode;
	caption: string;
	wide?: boolean;
}) {
	return (
		<figure className={wide ? "mc-fig mc-fig--wide" : "mc-fig"}>
			{children}
			<figcaption>{caption}</figcaption>
		</figure>
	);
}

const pages: Page[] = [
	{
		slug: "weigh",
		title: "Weigh the reply",
		finding: `A straight paste is ${meat} you.`,
		art: <LabelArt />,
		body: (
			<>
				<p>
					Here’s a conversation like yours. A coworker asks what broke last
					night, Claude answers, and the reply box is yours. Paste it, trim it
					or write something, and the label works out how much of the reply came
					from you.
				</p>

				<Figure
					wide
					caption={`Contains ${meat} meat. Packaged in a facility that also processes plausible nonsense.`}
				>
					<Weigh />
				</Figure>

				<p>
					The rule is blunt. Any run of four or more words that also appears in
					Claude’s answer counts as Claude’s.
					<Note n={1}>
						A compressor agrees. Show gzip Claude’s answer first, and the whole
						pasted reply costs it about 60 more bytes, nearly all of them
						pointers back to text it has already seen. A reply in your own words
						costs it about 160. Compression-based plagiarism detection works the
						same way: whatever the compressor can find somewhere else wasn’t
						new.
					</Note>{" "}
					A straight paste is {pasted.words} words long, and {pasted.mine} of
					them are yours. Trimming it down to the useful paragraph doesn’t help.
					That removes Claude without adding you.
				</p>
				<p>
					Mashing the keyboard scores 100%, which is a reminder that meat and
					value are different things.
					<Note n={2}>Nutrition labels have the same problem.</Note> The label
					also can’t tell you whether anyone checked the answer before sending
					it. Gruhn says AI output “frequently contains all too plausible
					nonsense,” and this one has a line of it.
					<Note n={3}>
						Claude wrote the answer for this page, including one made-up
						setting, on purpose. NATS has no <code>election_backoff</code>. The
						line reads exactly like the real ones around it.
					</Note>
				</p>
			</>
		),
	},
	{
		slug: "cable",
		title: "Two Claudes and a wire",
		finding: "Two models are talking. The people are the cable.",
		art: <CableArt />,
		body: (
			<>
				<p>
					Now suppose your coworker does what you did: pastes your reply into
					their Claude, and pastes the answer back. At that point, two language
					models are talking to each other, and the two of you are the cable.
				</p>

				<Figure
					wide
					caption="Network engineers call the user “layer 8” of the OSI model. Layer 8 now has a bypass."
				>
					<Cable />
				</Figure>

				<p>
					As cables go, you’re pretty good. A clipboard moves the whole answer
					in one keystroke without dropping a byte. What a cable doesn’t do is
					think, and that’s where the speed comes from. People take in about 10
					bits a second, whether they’re reading, typing or solving a Rubik’s
					cube blindfolded.
					<Note n={4}>
						Jieyu Zheng and Markus Meister, “The unbearable slowness of being:
						Why do we live at 10 bits/s?” Our senses collect about a billion
						bits a second. Almost all of it is thrown away before it reaches
						whatever you’d call “you.”
					</Note>{" "}
					Pasting gets a {answerWords}-word answer past that limit by routing it
					around the person entirely.
				</p>
				<p>
					In circuit terms, pasting is a short. The current takes the wire
					instead of the resistor, and nothing heats up.
					<Note n={5}>
						Except the cable. An adult at rest gives off about 100 watts, so
						this one runs at roughly 200. A copper cable of the same length
						gives off nothing and doesn’t need lunch.
					</Note>{" "}
					Open both switches and the answer has to go through somebody. A round
					trip goes from {span(fast)} to {span(slow)}, and for the first time,
					two people are having the conversation.
				</p>
			</>
		),
	},
	{
		slug: "reading",
		title: "Someone has to read it",
		finding: `Break-even: ${even.toFixed(1)} readers.`,
		art: <CrowdArt />,
		body: (
			<>
				<p>
					Pasting doesn’t make the reading go away. It moves it to whoever is on
					the other end, and in a channel, it makes one copy per person.
				</p>

				<Figure caption="Skimming doesn’t shrink the bill. It just means nobody checked it.">
					<Bill />
				</Figure>

				<p>
					At {pace.read} words a minute,
					<Note n={6}>
						Marc Brysbaert’s 2019 meta-analysis of 190 studies: 238 words a
						minute for nonfiction and 260 for fiction. Incident writeups are
						nonfiction, usually.
					</Note>{" "}
					the answer takes {span(readSeconds(answerWords))} to read. Reading it
					yourself and writing a {pace.digest}-word reply takes{" "}
					{span(readSeconds(answerWords) + writeSeconds(pace.digest))}, because
					people compose at around {pace.compose} words a minute.
					<Note n={7}>
						Clare-Marie Karat and colleagues timed people at the keyboard in
						1999: 33 words a minute when copying text, 19 when composing it.
						Thinking is the slow part.
					</Note>{" "}
					After that, everyone else spends {span(readSeconds(pace.digest))}{" "}
					instead of {span(readSeconds(answerWords))}. The break-even is{" "}
					{even.toFixed(1)} readers. If {counted[Math.ceil(even)]} people will
					see it, reading it first is cheaper for everyone put together,
					including you.
				</p>
			</>
		),
	},
	{
		slug: "chain",
		title: "The chain reaction",
		finding: `Jargon runs at k ≈ ${early.toFixed(1)}. Supercritical.`,
		art: <ChainArt />,
		body: (
			<>
				<p>
					Reading isn’t even the expensive part. Here’s the sentence Gruhn got:
				</p>
				<blockquote className="mc-quote">
					<p>{nats}</p>
				</blockquote>
				<p>
					“Jesus. I had to lookup almost every word to make sense of this.”
					Looking up a word gets you a definition, and definitions are written
					in more of the same. Tap the words you don’t know.
				</p>

				<Figure
					wide
					caption="At exactly k = 1 you close tabs as fast as you open them. This has never been observed."
				>
					<Reaction />
				</Figure>

				<p>
					If each definition you open contains, on average, k words you don’t
					know yet, you’ll open about 1 / (1 − k) definitions for every word you
					started with.
					<Note n={8}>
						This is a Galton–Watson branching process, worked out in 1875 to
						answer whether aristocratic surnames die out. Surnames and lookups
						both die out when each one produces fewer than one successor, on
						average.
					</Note>{" "}
					Below 1, the lookups fizzle out. At 1 or above, they don’t: each one
					makes more than one new one, and the tree grows until you run out of
					patience or dictionary. Physicists call k the multiplication factor.
					It’s the number that decides whether a pile of uranium is winding down
					or running away.
					<Note n={9}>
						In a reactor, k is the average number of neutrons from one fission
						that go on to cause another. Control rods absorb neutrons to hold k
						at exactly 1.
					</Note>
				</p>
				<p>
					Claude’s sentence runs at k ≈ {early.toFixed(1)} for the first few
					lookups. Reaching the bottom of this dictionary takes {full.lookups}{" "}
					lookups, {deepest} definitions deep. The version a person would say
					has two words to look up, and neither leads anywhere. Your own words
					are the control rods.
				</p>
			</>
		),
	},
	{
		slug: "pigeon",
		title: "Slower than a pigeon",
		finding: `Code review through you: ${Math.round(slower)}× slower than RFC 1149.`,
		art: <PigeonArt />,
		body: (
			<>
				<p>
					Gruhn’s last example is code review. Paste the ticket into Claude
					Code. Don’t read what it wrote. When reviewers leave comments, paste
					those in too. “But who has done the implementation? The reviewers did,
					using Claude Code, and you as a meat proxy.”
				</p>
				<p>
					So the reviewers are programming Claude Code, and you’re their network
					link. Let’s ping it.
				</p>

				<Figure caption="Round-trip times include one weekend.">
					<Terminal />
				</Figure>

				<p>
					That’s about {Math.round(slower)} times slower than the only other
					biological network that has been benchmarked. In 2001, the Bergen
					Linux User Group implemented RFC 1149, IP over Avian Carriers, and
					pinged across town by pigeon. Round trips took 53 to 106 minutes.
					<Note n={10}>
						Their pigeons first spent an hour flying around with a neighbor’s
						flock. Then two of the return birds escaped without packets, because
						someone forgot to shut the cage.
					</Note>
				</p>
				<p>
					The pigeons lost five of their nine packets. You lost none. Every word
					the reviewers wrote reached Claude Code exactly as written, and every
					line Claude Code wrote reached the reviewers the same way. As a
					network link, you’re flawless: nothing lost, nothing added.
				</p>
				<p>That’s the problem. Nobody asks the network link what it thinks.</p>
			</>
		),
	},
];

export function Article() {
	return (
		<article className="mc">
			<header className="mc-ask">
				<p className="mc-ask__q">
					When a coworker asks me something, I paste it into Claude and paste
					back what Claude said. Now they’ve started doing the same with my
					answers. How much of this conversation is actually us?
				</p>
				<p className="mc-ask__who">— a reader in #platform</p>
				<p className="mc-ask__src">
					Today’s question is adapted from Niklas Gruhn’s post{" "}
					<External href={post} className="link-underline">
						“Don’t be a meat proxy”
					</External>
					. It’s short, and he wrote it himself.
				</p>
			</header>

			<p className="mc-lede">
				Two words: “Claude said<span className="mc-stop">.</span>”
			</p>
			<p className="mc-intro">Here’s how we know, in five short pages.</p>

			<Book pages={pages} />

			<p className="mc-outro">
				So how much of the conversation is you? Measured in words, two. Measured
				in time, all of it, but spent by somebody else. The fix is Gruhn’s: read
				it, check it, and say it in your own words. That’s the one part of a
				message a compressor can’t find anywhere else.
			</p>

			<Figure caption="At least the pigeon has an excuse.">
				<Pigeon />
			</Figure>
		</article>
	);
}
