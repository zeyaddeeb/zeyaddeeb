import type { Place } from "./acts";
import { Bullet } from "./lines";
import type { Status } from "./script";

export function Heading({
	place,
	title,
	status,
}: {
	place: Place;
	title: string;
	status?: Status;
}) {
	return (
		<p className="cc-title">
			<Bullet chapter={place.chapter} />
			<span>{title}</span>
			{place.parts > 1 ? (
				<span className="cc-part">
					{place.part + 1}/{place.parts}
				</span>
			) : null}
			{status ? (
				<span className="cc-status" aria-live="polite">
					<span className="cc-status-long">{status.long}</span>
					<span className="cc-status-short">{status.short}</span>
				</span>
			) : null}
		</p>
	);
}
