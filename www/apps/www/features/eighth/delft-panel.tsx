import { count, pct } from "./copy";
import { DELFT, RING_CEILING, RING_NATURE } from "./delft";
import { Ring } from "./ring";

const HALF = [true, true, true, true, false, false, false, false] as const;
const MARKS = { 0: "a", 2: "a", 1: "b", 7: "b" } as const;

export function DelftPanel({ line }: { line: string }) {
	return (
		<div className="me-delft">
			<p className="me-deck__line">{line}</p>
			<div className="me-delft__body">
				<Ring pattern={HALF} marks={MARKS} className="me-ring me-delft__ring" />
				<ul className="me-delft__facts">
					<li>
						Their axes sit 22.5° apart, so each trial reads two neighboring dots
						of Feynman’s card with eight dots: lab A the{" "}
						<span className="me-delft__a">yellow</span>, lab B the{" "}
						<span className="me-delft__b">blue</span>.
					</li>
					<li>
						Any eight-dot card matches its neighbor at most 6 times in 8 (
						{pct(RING_CEILING, 0)}). A perfect entangled pair:{" "}
						{pct(RING_NATURE)}.
					</li>
					<li>
						Published counts for all {count(DELFT.trials)} trials, dealt in
						shuffled order.
					</li>
				</ul>
			</div>
		</div>
	);
}
