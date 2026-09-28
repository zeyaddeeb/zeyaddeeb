"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

export function ExperimentsListing() {
	const params = useSearchParams();
	const url = readQuery(Object.fromEntries(params));
	const { topic, sort } = url;
	const [search, setSearch] = useState(url.search);
	const written = useRef(url.search.trim());
	const input = useRef<HTMLInputElement>(null);

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

	const { items, found, counts } = useMemo(
		() => listExperiments({ search, topic, sort }),
		[search, topic, sort],
	);

	const go = (next: Partial<ExperimentQuery>) => {
		const query = { search, topic, sort, ...next };
		written.current = query.search.trim();
		if (next.search !== undefined) setSearch(next.search);
		window.history.replaceState(null, "", experimentListingHref(query));
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
				<div className="finder__status">
					<p aria-live="polite">
						{filtered
							? `Showing ${items.length} of ${experiments.length}`
							: `Showing all ${experiments.length}`}
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
				<ExperimentsIndex items={items} />
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
