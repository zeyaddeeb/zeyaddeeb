import { ArrowIcon, BLOG_URL, SourceLink } from "@zeyaddeeb/ui";
import Link from "next/link";
import { MobileDetails } from "@/components/mobile-details";
import { experiments } from "@/features/catalog/catalog";
import { PresenceBoard } from "@/features/home/presence-board";
import "@/features/home/home.css";

export default function HomePage() {
	return (
		<main className="home container">
			<section className="home__opening" aria-labelledby="home-title">
				<div className="home__bio">
					<p className="home__eyebrow">Software engineer / Brooklyn, NY</p>
					<h1 id="home-title">
						Side projects
						<br />& notes<span className="home__period">.</span>
					</h1>
					<MobileDetails label="About this site">
						<p className="home__intro">
							I write software, mostly in Rust and TypeScript. This is where I
							keep my side projects, writing, and things I find interesting.
						</p>
						<Link className="home__about" href="/about">
							A bit about me{" "}
							<span aria-hidden="true">
								<ArrowIcon direction="right" />
							</span>
						</Link>
						<p className="home__source">
							The site, experiments, and infrastructure are in one repo.{" "}
							<SourceLink>Browse the code</SourceLink>
						</p>
					</MobileDetails>
				</div>
				<PresenceBoard />
			</section>
			<nav className="home__directory" aria-label="Explore the site">
				<Link href="/experiments" className="home__destination">
					<span className="home__eyebrow">01 / Projects</span>
					<h2>
						Experiments{" "}
						<span aria-hidden="true">
							<ArrowIcon direction="up-right" />
						</span>
					</h2>
					<p>
						{experiments.length} projects in graphics, audio, and distributed
						systems.
					</p>
				</Link>
				<Link href={BLOG_URL} className="home__destination">
					<span className="home__eyebrow">02 / Writing</span>
					<h2>
						Blog{" "}
						<span aria-hidden="true">
							<ArrowIcon direction="up-right" />
						</span>
					</h2>
					<p>Notes on what I’m building and learning.</p>
				</Link>
				<Link href={`${BLOG_URL}/library`} className="home__destination">
					<span className="home__eyebrow">03 / Bookmarks</span>
					<h2>
						Library{" "}
						<span aria-hidden="true">
							<ArrowIcon direction="up-right" />
						</span>
					</h2>
					<p>Books, art, podcasts, and links I’ve saved.</p>
				</Link>
			</nav>
		</main>
	);
}
