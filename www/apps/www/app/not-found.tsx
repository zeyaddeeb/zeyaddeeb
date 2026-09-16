import { Footer, Header, LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { SITE_NAV } from "@/features/catalog/nav";
import { PresenceMark } from "@/features/live/presence-mark";
import { Wordmark } from "@/features/mark/wordmark";
import "@/features/home/notice.css";

export default function NotFound() {
	return (
		<>
			<Header
				navItems={SITE_NAV}
				wordmark={<Wordmark />}
				className="site-header"
				status={<PresenceMark />}
			/>
			<main>
				<section className="notice" aria-labelledby="nf-title">
					<div className="container notice__grid">
						<p className="notice__eyebrow">Nothing at this address</p>
						<h1 id="nf-title" className="notice__title">
							404
						</h1>
						<span className="notice__form" aria-hidden="true" />
						<p className="notice__line">
							The page isn’t here. The rest of the corner is.{" "}
							<Link href="/" className="notice__link">
								Back to the start{" "}
								<span aria-hidden="true">
									<LifeArrow direction="right" />
								</span>
							</Link>
						</p>
					</div>
				</section>
			</main>
			<Footer className="site-footer" />
		</>
	);
}
