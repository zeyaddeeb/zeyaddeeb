"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
	type MouseEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { experiments, type Topic, topics } from "@/features/catalog/catalog";
import {
	type ExperimentQuery,
	experimentListingHref,
	experimentSorts,
	listExperiments,
	readQuery,
} from "@/features/catalog/experiment-listing";
import { ExperimentsIndex } from "./experiments-index";

function SearchIcon() {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" className="finder__icon">
			<circle cx="8.5" cy="8.5" r="6" />
			<path d="M13 13l5 5" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" className="finder__icon">
			<path d="M5 5l10 10M15 5L5 15" />
		</svg>
	);
}

function Pager({
	page,
	pages,
	from,
	to,
	total,
	href,
	onTurn,
}: {
	page: number;
	pages: number;
	from: number;
	to: number;
	total: number;
	href: (page: number) => string;
	onTurn: (page: number) => void;
}) {
	const follow = (event: MouseEvent<HTMLAnchorElement>, next: number) => {
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;

		event.preventDefault();

		if (next !== page) onTurn(next);
	};

	const step = (
		next: number,
		rel: "prev" | "next",
		label: string,
		children: ReactNode,
	) =>
		next < 1 || next > pages ? (
			<span className="pager__plate pager__step" aria-disabled>
				{children}
			</span>
		) : (
			<Link
				href={href(next)}
				prefetch={false}
				scroll={false}
				rel={rel}
				aria-label={label}
				className="pager__plate pager__step"
				onClick={(event) => follow(event, next)}
			>
				{children}
			</Link>
		);

	return (
		<nav className="container pager" aria-label="Pages">
			<p className="pager__range">
				{from}–{to} of {total}
			</p>
			<div className="pager__plates">
				{step(
					page - 1,
					"prev",
					"Previous page",
					<>
						<LifeArrow direction="left" active={page > 1 ? undefined : false} />
						<span className="pager__word">Previous</span>
					</>,
				)}
				{Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
					<Link
						key={n}
						href={href(n)}
						prefetch={false}
						scroll={false}
						aria-label={`Page ${n}`}
						aria-current={n === page ? "page" : undefined}
						className="pager__plate"
						onClick={(event) => follow(event, n)}
					>
						{n}
					</Link>
				))}
				{step(
					page + 1,
					"next",
					"Next page",
					<>
						<span className="pager__word">Next</span>
						<LifeArrow
							direction="right"
							active={page < pages ? undefined : false}
						/>
					</>,
				)}
			</div>
		</nav>
	);
}

export function ExperimentsListing() {
	const params = useSearchParams();
	const url = readQuery(Object.fromEntries(params));
	const { topic, sort } = url;
	const [search, setSearch] = useState(url.search);
	const written = useRef(url.search.trim());
	const input = useRef<HTMLInputElement>(null);
	const top = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (url.search.trim() === written.current) return;

		written.current = url.search.trim();
		setSearch(url.search);
	}, [url.search]);

	useEffect(() => {
		if (search.trim() === written.current) return;

		const id = window.setTimeout(() => {
			written.current = search.trim();

			window.history.replaceState(
				null,
				"",
				experimentListingHref({ search, topic, sort }),
			);
		}, 300);

		return () => window.clearTimeout(id);
	}, [search, topic, sort]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
				return;

			if (
				event.target instanceof Element &&
				event.target.closest("input, textarea, select, [contenteditable]")
			)
				return;

			event.preventDefault();
			input.current?.focus();
		};

		window.addEventListener("keydown", onKey);

		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const typing = search.trim() !== url.search.trim();

	const { items, total, page, pages, from, to, found, counts } = useMemo(
		() => listExperiments({ search, topic, sort, page: typing ? 1 : url.page }),
		[search, topic, sort, typing, url.page],
	);

	const go = (next: Partial<ExperimentQuery>) => {
		const query = { search, topic, sort, page: 1, ...next };

		written.current = query.search.trim();

		if (next.search !== undefined) setSearch(next.search);

		window.history.replaceState(null, "", experimentListingHref(query));
	};

	const turn = (next: number) => {
		window.history.pushState(
			null,
			"",
			experimentListingHref({ search, topic, sort, page: next }),
		);

		const status = top.current;

		if (!status || status.getBoundingClientRect().top >= 0) return;

		status.scrollIntoView({
			block: "start",
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "auto"
				: "smooth",
		});
	};

	const filtered = Boolean(search.trim() || topic);

	const plates: { value: Topic | ""; label: string; count: number }[] = [
		{ value: "", label: "All", count: found },
		...topics.map((t) => ({ ...t, count: counts[t.value] })),
	];

	return (
		<>
			<div className="container finder">
				<search>
					<form
						action="/experiments"
						className="finder__search"
						onSubmit={(event) => {
							event.preventDefault();
							input.current?.blur();
						}}
					>
						<SearchIcon />
						<input
							ref={input}
							type="search"
							name="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Escape") return;

								if (search) {
									event.preventDefault();
									go({ search: "" });
								} else input.current?.blur();
							}}
							aria-label="Search experiments"
							placeholder="Search by title, idea or tool"
							autoComplete="off"
							spellCheck={false}
						/>
						{topic ? <input type="hidden" name="topic" value={topic} /> : null}
						{sort !== "newest" ? (
							<input type="hidden" name="sort" value={sort} />
						) : null}
						{search ? (
							<button
								type="button"
								className="finder__clear"
								aria-label="Clear search"
								onClick={() => {
									go({ search: "" });
									input.current?.focus();
								}}
							>
								<CloseIcon />
							</button>
						) : (
							<span className="finder__key" aria-hidden="true">
								/
							</span>
						)}
					</form>
				</search>
				<fieldset className="finder__topics">
					<legend className="sr-only">Filter by topic</legend>
					{plates.map((plate) => (
						<button
							key={plate.value || "all"}
							type="button"
							className="finder__plate"
							aria-pressed={topic === plate.value}
							data-empty={plate.count === 0 || undefined}
							onClick={() => go({ topic: plate.value })}
						>
							<span>{plate.label}</span>
							<span className="finder__count">{plate.count}</span>
						</button>
					))}
				</fieldset>
				<div className="finder__status" ref={top}>
					<p aria-live="polite">
						{pages > 1
							? `Showing ${from}–${to} of ${total}`
							: filtered
								? `Showing ${total} of ${experiments.length}`
								: `Showing all ${total}`}
						{filtered ? (
							<button
								type="button"
								className="finder__text"
								onClick={() => go({ search: "", topic: "" })}
							>
								Clear
							</button>
						) : null}
					</p>
					<fieldset className="finder__sort">
						<legend className="sr-only">Sort experiments</legend>
						{experimentSorts.map((option) => (
							<button
								key={option.value}
								type="button"
								className="finder__order"
								aria-pressed={sort === option.value}
								onClick={() => go({ sort: option.value })}
							>
								{option.label}
							</button>
						))}
					</fieldset>
				</div>
			</div>
			{items.length ? (
				<>
					<ExperimentsIndex items={items} />
					{pages > 1 ? (
						<Pager
							page={page}
							pages={pages}
							from={from}
							to={to}
							total={total}
							href={(n) =>
								experimentListingHref({ search, topic, sort, page: n })
							}
							onTurn={turn}
						/>
					) : null}
				</>
			) : (
				<div className="container index__empty">
					<h2>
						{search.trim()
							? `Nothing matches “${search.trim()}”`
							: "Nothing here yet"}
					</h2>
					<p>
						Try a tool like Rust or Lean, or{" "}
						<button
							type="button"
							className="finder__text"
							onClick={() => go({ search: "", topic: "" })}
						>
							clear the filters
						</button>
						.
					</p>
				</div>
			)}
		</>
	);
}
