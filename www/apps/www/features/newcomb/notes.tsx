import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import "./notes.css";

function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="nc-out">
			{children}
			<LifeArrow direction="up-right" className="nc-out__arrow" />
		</a>
	);
}

function Arrow({ from, to }: { from: [number, number]; to: [number, number] }) {
	const [x1, y1] = from;
	const [x2, y2] = to;
	const a = Math.atan2(y2 - y1, x2 - x1);
	const head = (turn: number) =>
		`${x2 - 11 * Math.cos(a + turn)} ${y2 - 11 * Math.sin(a + turn)}`;

	return (
		<g className="nc-fig__arrow">
			<line x1={x1} y1={y1} x2={x2} y2={y2} />
			<path d={`M${x2} ${y2}L${head(0.42)}L${head(-0.42)}Z`} />
		</g>
	);
}

function Picture({ caused }: { caused: boolean }) {
	return (
		<svg viewBox="0 0 320 214" className="nc-fig__svg" aria-hidden="true">
			<circle cx="130" cy="38" r="26" className="nc-fig__you" />
			<text x="166" y="34" className="nc-fig__label">
				you, earlier
			</text>
			<text x="166" y="51" className="nc-fig__note">
				habits, reasons, brain
			</text>
			<Arrow from={[116, 60]} to={[86, 128]} />
			{caused ? (
				<Arrow from={[148, 58]} to={[232, 128]} />
			) : (
				<line x1="148" y1="58" x2="232" y2="128" className="nc-fig__gap" />
			)}
			<rect x="48" y="132" width="64" height="56" className="nc-fig__box" />
			<text x="80" y="208" className="nc-fig__label" textAnchor="middle">
				what’s in B
			</text>
			<rect
				x="208"
				y="132"
				width="64"
				height="56"
				className="nc-fig__choice"
				data-caused={caused}
			/>
			{caused ? null : (
				<circle cx="240" cy="160" r="13" className="nc-fig__coin" />
			)}
			<text x="240" y="208" className="nc-fig__label" textAnchor="middle">
				what you take
			</text>
		</svg>
	);
}

export function Notes() {
	return (
		<div className="nc-notes">
			<h3>The puzzle</h3>
			<p>
				A predictor puts two boxes in front of you. Box A is glass and holds
				$1,000. Box B is sealed. Yesterday the predictor filled it: $1,000,000
				if it expected you to take only B, nothing if it expected you to take
				both. It has been right about almost everyone before you. Do you take
				one box or two?
			</p>
			<p>
				The physicist William Newcomb came up with it, and Robert Nozick
				published it in 1969. “To almost everyone, it is perfectly clear and
				obvious what should be done,” Nozick wrote. “The difficulty is that
				these people seem to divide almost evenly on the problem, with large
				numbers thinking that the opposing half is just being silly.” They still
				do. In the 2020 PhilPapers survey of philosophers, 39% took two boxes
				and 31% took one.
			</p>

			<h3>Two arguments, both airtight</h3>
			<p>
				The two-boxer reads the table across. B is already full or already
				empty, and nothing you do now can change that. Whichever it is, taking A
				as well gets you $1,000 more.
			</p>
			<p>
				The one-boxer reads it down. People who take one box walk away with a
				million, and people who take both walk away with a thousand. If the
				predictor is right a fraction p of the time, one box is worth p ×
				$1,000,000 on average and two boxes $1,000 + (1 − p) × $1,000,000. One
				box comes out ahead as soon as p is above 50.05%.
			</p>
			<p>
				The table in the experiment holds both arguments up against the same
				rounds: yours. Across every row, both boxes paid $1,000 more. Down the
				columns, the one-box rounds usually paid far more. Both are true at
				once, and that is the paradox.
			</p>

			<h3 id="free-will">The free will bit</h3>
			<p>
				The predictor can’t see the future. All it can look at is the present:
				you. Your habits, your reasons, the state of your brain. If it is right
				much more often than chance, that can only be because whatever makes
				your choice was already there when it filled the box.
			</p>
			<p>
				So the box and your choice have a common cause, and it is you, earlier.
				Taking one box doesn’t put money in the box. Being someone who takes one
				box did, yesterday.
			</p>
			<div className="nc-fig">
				<figure className="nc-fig__panel">
					<Picture caused />
					<figcaption>
						If your choice comes from who you are, the predictor can read it
						too. The box and your choice match. One box pays.
					</figcaption>
				</figure>
				<figure className="nc-fig__panel">
					<Picture caused={false} />
					<figcaption>
						If nothing before the moment fixes your choice, it is a coin flip to
						anyone watching. The box tells you nothing. Two boxes pay.
					</figcaption>
				</figure>
			</div>
			<p>
				Now suppose your choice is free in the strongest sense: not fixed by
				anything that came before the moment you make it. Then nobody can
				predict it better than a coin, the box says nothing about what you will
				do, and taking both is simply right.
			</p>
			<p>
				So what you do in front of the boxes depends on what you think you are.
				Two-boxers reason as if, at the moment of choosing, their choice comes
				from nowhere. One-boxers accept that they are the kind of thing that can
				be read.
			</p>
			<p>
				Being readable isn’t the same as being unfree. A friend can predict
				you’ll order coffee, and you still chose the coffee, for your own
				reasons. Compatibilists like Daniel Dennett argue that this is the only
				free will worth wanting: choices that come from who you are. The
				predictor can read your reasons because your reasons are what does the
				choosing.
			</p>

			<h3>Can you surprise it?</h3>
			<p>
				“Studies you” is built on a toy Scott Aaronson describes in{" "}
				<em>Quantum Computing Since Democritus</em>. It asks people to press f
				or d as randomly as they can and guesses each press before it happens.
				“It’s actually very easy to write a program that will make the right
				prediction about 70% of the time,” he writes. People trying to be random
				fall into patterns they can’t feel. One student held it to exactly 50%.
				Asked for his secret, he said he “just used his free will.”
			</p>
			<p>
				This predictor reads your box choices the same way. It looks at your
				last five choices, finds every earlier time you made the same five, and
				bets on what you did next. If those five never came up, or split evenly,
				it tries your last four, then three, and so on. With nothing to go on,
				it fills the box. The tape shows what it read for the round you just
				played: the highlighted run is the pattern, the paler runs are the
				earlier times, and the dashed boxes are what you did after them.
			</p>
			<p>
				The coin is the other way out. It makes you perfectly unpredictable:
				watch the predictor’s hit rate on coin rounds settle near half. But that
				means B is full about half the time, so a coin earns about $500,000 a
				round, and a steady one-boxer earns $1,000,000. Being unpredictable is
				worth nothing here, and it isn’t even yours. The coin chose.
			</p>

			<h3>The copy</h3>
			<p>
				Aaronson also says which way he would go. A predictor that good would
				have to know everything about you, enough to run you, in effect, as a
				simulation. “When you’re pondering this, you have no way of knowing
				whether you’re the ‘real’ you, or just a simulation running in the
				Predictor’s computer.” If you might be the simulation, your choice
				really does decide what goes in the box. So take one box.
			</p>
			<p>
				“Copies you” plays that out. Each round you answer twice, and one of the
				two answers is the copy’s, the one that fills B. Which one is sealed
				before you start. Answer the same both times and the copy always agrees
				with you: a million a round. Try to split it, one box for the copy and
				both for yourself, and half the time you have it backwards and walk off
				with nothing. The only way to win is to be one person.
			</p>

			<h3>For machines it isn’t hypothetical</h3>
			<p>
				A program can be predicted perfectly: run a copy of it. Any AI whose
				code someone else can read and run is in Newcomb’s problem whenever the
				other side acts on what that code would do. That is why some decision
				theories written with AI in mind, such as functional decision theory,
				treat a decision as choosing the output of your procedure everywhere it
				runs, including inside the predictor’s copy. Programs that can read each
				other’s code can even cooperate in a one-shot prisoner’s dilemma, a
				result Moshe Tennenholtz called program equilibrium.
			</p>
			<p>
				This is the third of the guessing machines, after{" "}
				<Link href="/experiments/deepseek" className="nc-out">
					Educated Guessing Machines
					<LifeArrow direction="right" seed={11} className="nc-out__arrow" />
				</Link>{" "}
				and{" "}
				<Link href="/experiments/every-program" className="nc-out">
					Every Program at Once
					<LifeArrow direction="right" seed={20} className="nc-out__arrow" />
				</Link>
				. Those guess what comes next. This one guesses you.
			</p>

			<h3>What this predictor is, and isn’t</h3>
			<p>
				It only knows your habits from earlier rounds. It can’t watch you
				decide, so a rare, random grab for both boxes slips past it, where
				Newcomb’s predictor would see that coming too. Over many rounds there is
				also a reason to take one box that Newcomb’s single choice doesn’t have:
				what you take now teaches the predictor about the next round.
			</p>
			<p>
				Every box is sealed before your click is read. The page writes a line
				like <code>round 7 full 9c1f2a3b4c5d6e7f</code>, where the last part is
				random, prints the start of its SHA-256 fingerprint, and draws the
				pattern on box B from the same fingerprint. After you choose, it shows
				the line, so you can check it yourself with{" "}
				<code>printf 'round 7 full 9c1f2a3b4c5d6e7f' | shasum -a 256</code>. The
				page runs on your computer, so this shows the order of the steps in code
				you can read; it can’t prove nobody could cheat.
			</p>
			<p>
				“Always one box” and “Always both” replay the same predictor against a
				player who never changes their mind.
			</p>

			<h3>Sources</h3>
			<ol className="nc-sources">
				<li>
					Robert Nozick, “Newcomb’s Problem and Two Principles of Choice,” in{" "}
					<em>Essays in Honor of Carl G. Hempel</em>, ed. Nicholas Rescher
					(Reidel, 1969), 114–146.
				</li>
				<li>
					Martin Gardner, “Mathematical Games,” <em>Scientific American</em>{" "}
					230, no. 3 (March 1974): 102–109.
				</li>
				<li>
					Scott Aaronson, <em>Quantum Computing Since Democritus</em> (Cambridge
					University Press, 2013); the{" "}
					<Out href="https://www.scottaaronson.com/democritus/lec18.html">
						lecture on free will
					</Out>{" "}
					it grew from.
				</li>
				<li>
					David Bourget and David J. Chalmers, “Philosophers on Philosophy: The
					2020 PhilPapers Survey,” <em>Philosophers’ Imprint</em> 23 (2023).
				</li>
				<li>
					Daniel C. Dennett,{" "}
					<em>Elbow Room: The Varieties of Free Will Worth Wanting</em> (MIT
					Press, 1984).
				</li>
				<li>
					Eliezer Yudkowsky and Nate Soares, “Functional Decision Theory: A New
					Theory of Instrumental Rationality,”{" "}
					<Out href="https://arxiv.org/abs/1710.05060">arXiv:1710.05060</Out>{" "}
					(2017).
				</li>
				<li>
					Moshe Tennenholtz, “Program Equilibrium,”{" "}
					<em>Games and Economic Behavior</em> 49 (2004): 363–373.
				</li>
			</ol>
		</div>
	);
}
