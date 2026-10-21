import "./notes.css";

export function Notes() {
	return (
		<div className="rs-notes">
			<section>
				<h3>The thing being tested</h3>
				<p>
					An agent that works on colorectal cancer in the peritoneum around the
					clock, built from the referee backwards. It may not assert anything it
					cannot state as a claim with a threshold and a probability, sealed
					before the referee runs. The verdict then stands, including when the
					verdict is that the claim could not be answered at all.
				</p>
				<p>
					That is the opposite of how these systems are usually built.
					Conjecture is cheap now; checking is the bottleneck, and the published
					systems mostly grade themselves. So the interesting part here is not
					the ideas. It is what happens to them.
				</p>
			</section>

			<section>
				<h3>Why a millimetre decides it</h3>
				<p>
					Drug put into the abdomen has to travel inward from the surface of
					each nodule while the blood carries it away. That gives a decay
					length, the square root of diffusivity over the rate of loss, and the
					depth at which the concentration falls to the drug&rsquo;s own killing
					level is that length times the log of how far above killing the bath
					is held.
				</p>
				<p>
					The loss is dominated by the capillaries, about forty times the rate
					at which the cells themselves consume the drug. That is why heated
					intraperitoneal chemotherapy works against a film and fails against a
					lump, and why a heavier molecule is worse off rather than better.
					Dwell time buys less than it looks: once the loss rate times the dwell
					is past about three, the front has stopped moving and a longer bath
					goes no deeper.
				</p>
			</section>

			<section>
				<h3>What this referee cannot do</h3>
				<p>
					It reproduces a published model from that model&rsquo;s own cited
					parameters, with nothing fitted: cisplatin at 0.453 mm against a
					reported 0.36 to 0.49, paclitaxel at 0.593 against 0.54 to 0.75. But
					agreeing with another model is evidence about arithmetic, not about
					tissue. So the next step was to test it against things people had
					actually measured.
				</p>
				<p>
					That failed, and the way it failed is the interesting part. Nine
					published figures were collected from the open literature. They run
					from about twenty micrometres to five millimetres, a factor of two
					hundred and fifty, and the spread is not disagreement about tissue. It
					is that each study counted something different as having arrived. The
					millimetre numbers that fill review articles turn out to come from
					pharmacokinetic modelling rather than from looking down a microscope,
					which one of those reviews says itself. The one direct cisplatin
					measurement puts catheters at known depths in a living animal&rsquo;s
					liver and stomach, where the bloodstream delivers drug by a route this
					model does not describe.
				</p>
				<p>
					This model lands at about half a millimetre, comfortably inside that
					spread, which means the spread cannot tell a right answer from a wrong
					one. A test that nothing can fail is not a test, so the referee was
					refused rather than passed. It may refuse a claim and may not earn
					with one, and it says so in its own output.
				</p>
			</section>

			<section>
				<h3>The one that can score</h3>
				<p>
					A knockout screen scores every gene in every cell line: zero means
					losing it changed nothing, and around minus one means the cell needed
					it. Sixty-three colorectal lines here carry one. The referee is gated
					on ground truth the data ships with its own release: a list of genes
					known to be needed by every cell, and a list known to be dispensable.
					It separates them at 0.9991, so it has earned the right to grade
					something.
				</p>
				<p>
					What it cannot do is talk about the peritoneum. Of the ten colorectal
					lines drawn from there, six carry a screen, and those six are five
					patients once the two that came from the same person are collapsed.
					That is below the floor this project set for itself before looking, so
					the comparison is not run. The drug-sensitivity version was worse:
					none of the ten appears in that screen at all. Twice now the rule
					written in advance has killed the analysis the experiment was named
					for, which is the rule working rather than failing.
				</p>
			</section>

			<section>
				<h3>The other two</h3>
				<p>
					Three more referees are specified and not yet built, ordered by how
					hard they are to fool. One asks what a cell actually needs, from
					knockout screens across colorectal lines. One asks whether it shows up
					in people whose disease reached the abdomen. The last one is the
					honest answer to a problem the others share: the data is public and
					the model has read it. So that referee bets on trials whose results do
					not exist yet, and waits.
				</p>
				<p>
					Writing the pre-registration first killed two of the original plans
					before a line of their code existed. The drug-sensitivity comparison
					turned out to have nothing in it: of the ten colorectal lines drawn
					from the peritoneum, none has a dose-response curve in the screen. Two
					of those ten are the same patient. Seven of the ten do not grow stuck
					to the plastic, against ten of sixty-three from primary tumours, so
					anything that looks peritoneal in them might only be the shape they
					grow in.
				</p>
			</section>
		</div>
	);
}
