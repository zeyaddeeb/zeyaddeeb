import { LifeArrow, SourceLink } from "@zeyaddeeb/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { MobileDetails } from "@/components/mobile-details";
import "./frame.css";
import { getExperiment, neighbors, number } from "@/features/catalog/catalog";

interface ExperimentFrameProps {
	id: string;
	intro?: ReactNode;
	status?: ReactNode;
	controls?: ReactNode;
	children: ReactNode;
	aside?: ReactNode;
}

export function ExperimentFrame({
	id,
	intro,
	status,
	controls,
	children,
	aside,
}: ExperimentFrameProps) {
	const experiment = getExperiment(id);
	const nav = neighbors(id);

	return (
		<main className="frame" data-accent={experiment.number % 3}>
			<div className="frame__view">
				<header className="frame__head container">
					<span className="frame__number" aria-hidden="true">
						{number(experiment.number)}
					</span>
					<p className="eyebrow frame__trail">
						<Link href="/experiments" className="link-underline">
							Experiments
						</Link>{" "}
						<span aria-hidden="true">/</span> {number(experiment.number)}
					</p>
					<h1 className="frame__title">{experiment.title}</h1>
					<MobileDetails label="About this experiment">
						<p className="frame__intro">{intro ?? experiment.line}</p>
						<p className="eyebrow frame__stack">
							<span>{experiment.stack.join(" · ")}</span>
							<SourceLink>View source</SourceLink>
						</p>
					</MobileDetails>
				</header>

				{status || controls ? (
					<div className="frame__bar">
						<div className="eyebrow frame__status">{status}</div>
						<div className="frame__controls">{controls}</div>
					</div>
				) : null}

				<section
					className="charcoal text-paper frame__stage"
					aria-label={experiment.title}
				>
					{children}
				</section>

				{aside ? (
					<a href="#notes" className="frame__more">
						Notes on how it works{" "}
						<span aria-hidden="true">
							<LifeArrow direction="down" />
						</span>
					</a>
				) : null}
			</div>

			{aside ? (
				<section id="notes" className="frame__notes container">
					<h2 className="eyebrow frame__notes-label">Notes</h2>
					<div className="frame__notes-body">{aside}</div>
				</section>
			) : null}

			{nav ? (
				<nav aria-label="Next experiment" className="frame__nav container">
					<Link href={nav.prev.href} className="frame__nav-link">
						<span className="eyebrow">
							<span aria-hidden="true">
								<LifeArrow direction="left" />
							</span>{" "}
							{number(nav.prev.number)}
						</span>
						<span className="frame__nav-title">{nav.prev.title}</span>
					</Link>
					<Link
						href={nav.next.href}
						className="frame__nav-link frame__nav-link--next"
					>
						<span className="eyebrow">
							{number(nav.next.number)}{" "}
							<span aria-hidden="true">
								<LifeArrow direction="right" />
							</span>
						</span>
						<span className="frame__nav-title">{nav.next.title}</span>
					</Link>
				</nav>
			) : null}
		</main>
	);
}
