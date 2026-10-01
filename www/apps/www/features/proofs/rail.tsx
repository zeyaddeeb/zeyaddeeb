import { type Chapter, chapters, levelIndex, place } from "./chapters";
import { levels } from "./levels";

export function Bullet({
	chapter,
	children,
}: {
	chapter: Chapter;
	children: React.ReactNode;
}) {
	return (
		<span
			className="pf-bullet"
			data-shape={chapter.shape}
			data-color={chapter.color}
			aria-hidden="true"
		>
			<span>{children}</span>
		</span>
	);
}

export function Rail({
	index,
	solved,
	status,
	onOpen,
}: {
	index: number;
	solved: (id: string) => boolean;
	status: string;
	onOpen: (index: number) => void;
}) {
	const here = place(index).chapter;

	return (
		<nav className="pf-rail" aria-label="Chapters">
			<ol className="pf-chapters">
				{chapters.map((chapter) => {
					const done = chapter.levels.every(solved);

					if (chapter !== here) {
						return (
							<li key={chapter.id}>
								<button
									type="button"
									className="pf-chapter-jump"
									data-solved={done || undefined}
									aria-label={`Chapter ${chapter.number}: ${chapter.title}${done ? ", proved" : ""}`}
									onClick={() => onOpen(levelIndex(chapter.levels[0]))}
								>
									<Bullet chapter={chapter}>{chapter.number}</Bullet>
								</button>
							</li>
						);
					}

					return (
						<li key={chapter.id} className="pf-chapter-open">
							<span className="pf-chapter-title">{chapter.title}</span>
							<ol aria-label={`Chapter ${chapter.number}: ${chapter.title}`}>
								{chapter.levels.map((id, part) => {
									const at = levelIndex(id);

									return (
										<li key={id}>
											<button
												type="button"
												aria-current={at === index ? "step" : undefined}
												data-solved={solved(id) || undefined}
												aria-label={`${levels[at].title}${solved(id) ? ", proved" : ""}`}
												onClick={() => onOpen(at)}
											>
												<Bullet chapter={chapter}>{part + 1}</Bullet>
											</button>
										</li>
									);
								})}
							</ol>
						</li>
					);
				})}
			</ol>
			<p className="pf-status" aria-live="polite">
				{status}
			</p>
		</nav>
	);
}
