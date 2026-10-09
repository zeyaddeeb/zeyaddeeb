import { Glyph } from "./glyph";
import type { Take } from "./oracle";

export type Phase = "sealing" | "ready" | "open";

export function Boxes({
	phase,
	full,
	took,
	hash,
	onTake,
}: {
	phase: Phase;
	full: boolean;
	took: Take | null;
	hash: string | null;
	onTake: (take: Take) => void;
}) {
	const live = phase === "ready";

	return (
		<div className="nc-table" data-phase={phase}>
			<button
				type="button"
				className="nc-box nc-box--glass"
				data-taken={phase === "open" && took === 2}
				disabled={!live}
				aria-keyshortcuts="2"
				aria-label="Take both boxes, A and B"
				onClick={() => onTake(2)}
			>
				<span className="nc-box__frame">
					<span className="nc-box__name">A</span>
					<span className="nc-bill">$1,000</span>
				</span>
				<span className="nc-box__label">
					A and B <span className="nc-key">2</span>
				</span>
			</button>

			<button
				type="button"
				className="nc-box nc-box--sealed"
				data-taken={phase === "open" && took !== null}
				disabled={!live}
				aria-keyshortcuts="1"
				aria-label="Take only box B"
				onClick={() => onTake(1)}
			>
				<span className="nc-box__frame">
					<span className="nc-box__name">B</span>
					{phase === "open" ? (
						<span className="nc-box__inside" data-full={full}>
							{full ? "$1,000,000" : "Empty"}
						</span>
					) : null}
					<span className="nc-box__lid">
						{phase === "sealing" ? null : (
							<Glyph hash={hash} className="nc-box__glyph" />
						)}
					</span>
				</span>
				<span className="nc-box__label">
					Only B <span className="nc-key">1</span>
				</span>
			</button>
		</div>
	);
}
