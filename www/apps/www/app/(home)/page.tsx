import { LifeArrow, SourceLink } from "@zeyaddeeb/ui";
import Link from "next/link";
import { MobileDetails } from "@/components/mobile-details";
import { PresenceBoard } from "@/features/home/presence-board";
import "@/features/home/home.css";

export default function HomePage() {
	return (
		<main className="home container">
			<PresenceBoard
				head={
					<>
						<p className="home__eyebrow">Software engineer / Brooklyn, NY</p>
						<h1 id="home-title">
							Side projects
							<br />& notes<span className="home__period">.</span>
						</h1>
					</>
				}
				about={
					<MobileDetails label="About this site">
						<p className="home__intro">
							I write software, mostly in Rust and TypeScript. This is where I
							keep my side projects, writing, and things I find interesting.
						</p>
						<Link className="home__about" href="/about">
							A bit about me{" "}
							<span aria-hidden="true">
								<LifeArrow direction="right" />
							</span>
						</Link>
						<p className="home__source">
							The site, experiments, and infrastructure are in one repo.{" "}
							<SourceLink>Browse the code</SourceLink>
						</p>
					</MobileDetails>
				}
			/>
		</main>
	);
}
