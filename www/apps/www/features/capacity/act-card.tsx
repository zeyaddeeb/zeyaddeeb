import { LifeArrow } from "@zeyaddeeb/ui";
import { type Act, chapters } from "./acts";
import { Bullet } from "./lines";

export function ActCard({ act, onBegin }: { act: Act; onBegin: () => void }) {
	const id = `cc-act-${act.id}`;

	return (
		<div
			className="cc-act"
			role="dialog"
			aria-modal="false"
			aria-labelledby={id}
		>
			<div className="cc-act-card">
				<p className="cc-act-kicker">Act {act.number}</p>
				<h2 id={id}>{act.title}</h2>
				<p>{act.lede}</p>
				<ol className="cc-act-chapters">
					{chapters
						.filter((c) => c.act === act)
						.map((chapter) => (
							<li key={chapter.id}>
								<Bullet chapter={chapter} />
								{chapter.title}
							</li>
						))}
				</ol>
				<button type="button" className="cc-primary" onClick={onBegin}>
					Begin
					<span aria-hidden="true">
						<LifeArrow direction="right" />
					</span>
				</button>
			</div>
		</div>
	);
}
