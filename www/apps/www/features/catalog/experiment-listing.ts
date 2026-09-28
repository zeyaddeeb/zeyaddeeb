import { pageNumber } from "@zeyaddeeb/ui/seo";
import {
	type Experiment,
	experiments,
	type Topic,
	topicLabel,
	topics,
} from "./catalog";

export const EXPERIMENT_PAGE_SIZE = 6;

export const experimentSorts = [
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "title", label: "A–Z" },
] as const;

export type ExperimentSort = (typeof experimentSorts)[number]["value"];

export interface ExperimentQuery {
	search: string;
	topic: Topic | "";
	sort: ExperimentSort;
	page: number;
}

export type ExperimentSearchParams = Partial<
	Record<keyof ExperimentQuery, string | string[]>
>;

const first = (value: string | string[] | undefined) =>
	Array.isArray(value) ? value[0] : value;

export function readQuery(params: ExperimentSearchParams): ExperimentQuery {
	const topic = first(params.topic);
	const sort = first(params.sort);
	return {
		search: first(params.search) ?? "",
		topic: topics.find((t) => t.value === topic)?.value ?? "",
		sort: experimentSorts.find((s) => s.value === sort)?.value ?? "newest",
		page: pageNumber(first(params.page)),
	};
}

const order: Record<ExperimentSort, (a: Experiment, b: Experiment) => number> =
	{
		newest: (a, b) => b.number - a.number,
		oldest: (a, b) => a.number - b.number,
		title: (a, b) => a.title.localeCompare(b.title, "en"),
	};

export function listExperiments({
	search,
	topic,
	sort,
	page,
}: ExperimentQuery) {
	const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
	const found = experiments.filter((experiment) => {
		const text = [
			experiment.title,
			experiment.line,
			...experiment.stack,
			...experiment.topics.map(topicLabel),
		]
			.join(" ")
			.toLowerCase();
		return terms.every((term) => text.includes(term));
	});
	const counts = Object.fromEntries(
		topics.map((t) => [
			t.value,
			found.filter((experiment) => experiment.topics.includes(t.value)).length,
		]),
	) as Record<Topic, number>;
	const matches = found
		.filter((experiment) => !topic || experiment.topics.includes(topic))
		.sort(order[sort]);
	const total = matches.length;
	const pages = Math.max(1, Math.ceil(total / EXPERIMENT_PAGE_SIZE));
	const current = Math.min(page, pages);
	const offset = (current - 1) * EXPERIMENT_PAGE_SIZE;
	return {
		items: matches.slice(offset, offset + EXPERIMENT_PAGE_SIZE),
		total,
		page: current,
		pages,
		from: total ? offset + 1 : 0,
		to: Math.min(offset + EXPERIMENT_PAGE_SIZE, total),
		found: found.length,
		counts,
	};
}

export function experimentListingHref({
	search = "",
	topic = "",
	sort = "newest",
	page = 1,
}: Partial<ExperimentQuery>) {
	const params = new URLSearchParams();
	if (search.trim()) params.set("search", search.trim());
	if (topic) params.set("topic", topic);
	if (sort !== "newest") params.set("sort", sort);
	if (page > 1) params.set("page", String(page));
	return `/experiments${params.size ? `?${params}` : ""}`;
}
