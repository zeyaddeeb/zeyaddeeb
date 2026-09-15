import { Pagination } from "@zeyaddeeb/ui/pagination";
import { listingMetadata } from "@zeyaddeeb/ui/seo";
import Form from "next/form";
import Link from "next/link";
import { experiments } from "@/features/catalog/catalog";
import {
	type ExperimentSearchParams,
	experimentFilters,
	experimentListingHref,
	listExperiments,
} from "@/features/catalog/experiment-listing";
import { ExperimentsIndex } from "@/features/index/experiments-index";
import "@/features/index/experiments-index.css";

interface PageProps {
	searchParams: Promise<ExperimentSearchParams>;
}

export async function generateMetadata({ searchParams }: PageProps) {
	const { search, type, page } = listExperiments(await searchParams);
	return listingMetadata({
		path: "/experiments",
		section: "Experiments",
		title: "Experiments",
		description:
			"Interactive experiments by Zeyad Deeb in Rust and WebAssembly: graphics, collaborative editing, audio processing, and reinforcement learning.",
		page: String(page),
		filters: { search, type },
	});
}

export default async function ExperimentsPage({ searchParams }: PageProps) {
	const { items, search, type, page, total, totalPages, from, to } =
		listExperiments(await searchParams);
	return (
		<main className="index">
			<header className="index__head container">
				<p className="index__eyebrow">{experiments.length} projects</p>
				<h1>Experiments</h1>
				<p className="index__note">
					Things I’ve built to try an idea or learn how something works. Open a
					project to try it.
				</p>
			</header>
			<div className="container index__controls">
				<Form
					key={`${search}:${type}:${page}`}
					action="/experiments"
					scroll={false}
					role="search"
					className="index__search"
				>
					{type && <input type="hidden" name="type" value={type} />}
					<input
						type="search"
						name="search"
						aria-label="Search experiments"
						defaultValue={search}
						placeholder="Search experiments..."
					/>
					<button type="submit">Search</button>
				</Form>
				<nav aria-label="Filter experiments by type" className="index__filters">
					{[{ value: "", label: "All" }, ...experimentFilters].map((filter) => (
						<Link
							key={filter.value}
							href={experimentListingHref({ search, type: filter.value })}
							scroll={false}
							aria-current={type === filter.value ? "true" : undefined}
						>
							{filter.label}
						</Link>
					))}
				</nav>
				<div className="index__results">
					<p>{total ? `${from}–${to} of ${total} projects` : "0 projects"}</p>
					{(search || type) && (
						<Link href="/experiments" scroll={false}>
							Clear filters
						</Link>
					)}
				</div>
			</div>
			{items.length ? (
				<ExperimentsIndex items={items} />
			) : (
				<div className="container index__empty">
					<h2>No experiments found</h2>
					<p>Try another search or clear the filters.</p>
				</div>
			)}
			{totalPages > 1 && (
				<Pagination page={page} totalPages={totalPages} disabled={false} />
			)}
		</main>
	);
}
