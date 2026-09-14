import type { Metadata } from "next";
import { education, experience, skills } from "@/features/resume/content";
import "@/features/resume/resume.css";

export const metadata: Metadata = {
	title: "Résumé",
	description:
		"Zeyad Deeb’s experience in distributed systems, machine learning infrastructure, and engineering leadership. Saks Global, theSkimm, Pixability, ViacomCBS, Label Insight, Caleres, and CBRE.",
};

export default function ResumePage() {
	return (
		<main className="resume container">
			<header className="resume__head">
				<div>
					<p className="resume__kicker">Résumé / New York, NY</p>
					<h1>
						Engineering &<br />
						machine learning<span>.</span>
					</h1>
				</div>
				<div className="resume__profile">
					<p>
						Software engineer and engineering leader with 10+ years building
						distributed systems and machine learning infrastructure, primarily
						in Rust and Python.
					</p>
					<p>
						I’ve led teams of 2 to 15+ engineers and data scientists, managed
						platform roadmaps and infrastructure budgets, and written production
						services for model inference, feature retrieval, and caching.
					</p>
					<a href="mailto:me@zeyaddeeb.com">me@zeyaddeeb.com</a>
				</div>
			</header>

			<dl className="resume__results">
				<div>
					<dt>
						Recommendations per month
						<br />
						<span>Saks Global</span>
					</dt>
					<dd>250M+</dd>
				</div>
				<div>
					<dt>
						p95 serving latency
						<br />
						<span>Saks Global</span>
					</dt>
					<dd>&lt;300 ms</dd>
				</div>
				<div>
					<dt>
						New product revenue
						<br />
						<span>Pixability</span>
					</dt>
					<dd>$10M</dd>
				</div>
			</dl>

			<nav className="resume__sections" aria-label="Résumé sections">
				<a href="#work">Experience</a>
				<a href="#projects">Independent project</a>
				<a href="#stack">Skills</a>
				<a href="#education">Education</a>
				<a href="#contact">Contact</a>
			</nav>

			<section
				id="work"
				className="resume__section"
				aria-labelledby="experience-title"
			>
				<h2 id="experience-title">Experience</h2>
				<div>
					{experience.map((role) => (
						<article className="resume__role" key={role.company}>
							<div className="resume__role-head">
								<div>
									<h3>{role.company}</h3>
									<p className="resume__title">{role.title}</p>
								</div>
								<p className="resume__dates">
									{role.start} – {role.end}
									<span>{role.location}</span>
								</p>
							</div>
							<ul>
								{role.points.map((point) => (
									<li key={point}>{point}</li>
								))}
							</ul>
							{role.progression && (
								<p className="resume__progression">
									<span>Promotions</span>
									{role.progression}
								</p>
							)}
						</article>
					))}
				</div>
			</section>

			<section
				id="projects"
				className="resume__section"
				aria-labelledby="projects-title"
			>
				<h2 id="projects-title">
					Independent
					<br />
					project
				</h2>
				<article className="resume__role">
					<div className="resume__role-head">
						<div>
							<h3>
								<a
									href="https://pulvi.co"
									target="_blank"
									rel="noopener noreferrer"
								>
									Pulvi ↗
								</a>
							</h3>
							<p className="resume__title">Product & Engineering</p>
						</div>
						<p className="resume__dates">
							Feb 2026 – Present<span>New York, NY</span>
						</p>
					</div>
					<ul>
						<li>
							Built an app for organizing games, finding places to play, and
							managing communities and payments.
						</li>
						<li>
							Implemented eight federated Rust GraphQL services using Axum and
							async-graphql, with Apollo Router and a custom Rust authentication
							plugin.
						</li>
						<li>
							Built event processing with Kafka and Redis Streams and a
							discovery service for candidate generation and multi-factor
							ranking. Integrated SurrealDB, PostgreSQL, Stripe, and
							OpenTelemetry.
						</li>
						<li>
							Deployed on AWS EKS with Istio, Terraform, and Helm. Built Next.js
							web applications and an Expo mobile app for iOS and Android, with
							automated fastlane releases.
						</li>
					</ul>
				</article>
			</section>

			<section
				id="stack"
				className="resume__section"
				aria-labelledby="skills-title"
			>
				<h2 id="skills-title">Skills</h2>
				<dl className="resume__skills">
					{skills.map(([group, detail]) => (
						<div key={group}>
							<dt>{group}</dt>
							<dd>{detail}</dd>
						</div>
					))}
				</dl>
			</section>
			<section
				id="education"
				className="resume__section"
				aria-labelledby="education-title"
			>
				<h2 id="education-title">Education</h2>
				<ul className="resume__education">
					{education.map(([degree, school]) => (
						<li key={school}>
							<h3>{degree}</h3>
							<p>{school}</p>
						</li>
					))}
				</ul>
			</section>
			<section
				id="contact"
				className="resume__section resume__contact"
				aria-labelledby="contact-title"
			>
				<h2 id="contact-title">Contact</h2>
				<div>
					<a href="mailto:me@zeyaddeeb.com">me@zeyaddeeb.com</a>
					<a
						href="https://linkedin.com/in/zeyaddeeb"
						target="_blank"
						rel="noopener noreferrer"
					>
						LinkedIn ↗
					</a>
					<a
						href="https://github.com/zeyaddeeb"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub ↗
					</a>
				</div>
			</section>
		</main>
	);
}
