import { BLOG_URL, LifeArrow, SourceLink } from "@zeyaddeeb/ui";
import Link from "next/link";
import { MobileDetails } from "@/components/mobile-details";
import { Poster } from "@/features/home/poster";
import "@/features/home/home.css";

const intro =
	"I write software, mostly in Rust and TypeScript. This is where I keep my side projects, writing, and things I find interesting.";

const doors = [
	{
		shape: "square",
		title: "Experiments",
		line: `Projects in graphics, audio, and distributed systems.`,
		href: "/experiments",
	},
	{
		shape: "circle",
		title: "Blog",
		line: "Notes on what I’m building and learning.",
		href: BLOG_URL,
		external: true,
	},
	{
		shape: "triangle",
		title: "Library",
		line: "Books, art, podcasts, and links I’ve saved.",
		href: `${BLOG_URL}/library`,
		external: true,
	},
];

export default function HomePage() {
	return (
		<main className="home">
			<Poster
				head={
					<>
						<p className="home__eyebrow">Software engineer / Brooklyn, NY</p>
						<h1>
							Side projects
							<br />& notes<span className="home__period">.</span>
						</h1>
						<MobileDetails label="About this site">
							<p className="home__intro">{intro}</p>
							<p className="home__links">
								<Link href="/about">
									A bit about me{" "}
									<span aria-hidden="true">
										<LifeArrow direction="right" />
									</span>
								</Link>
								<SourceLink className="">Browse the code</SourceLink>
							</p>
						</MobileDetails>
					</>
				}
			/>
			<section className="home__more container" aria-label="Explore the site">
				<nav className="home__index" aria-label="Sections">
					{doors.map((door) => (
						<Link key={door.title} href={door.href} className="home__door">
							<span
								className={`home__glyph home__glyph--${door.shape}`}
								aria-hidden="true"
							/>
							<span className="home__door-title">{door.title}</span>
							<span className="home__door-line">{door.line}</span>
							<span className="home__door-arrow" aria-hidden="true">
								<LifeArrow
									direction={door.external ? "up-right" : "right"}
									seed={door.title}
								/>
							</span>
						</Link>
					))}
				</nav>
			</section>
		</main>
	);
}
