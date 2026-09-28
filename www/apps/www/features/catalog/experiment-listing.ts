import {
	type Experiment,
	experiments,
	type Topic,
	topicLabel,
	topics,
} from "./catalog";

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
	};
}

const order: Record<ExperimentSort, (a: Experiment, b: Experiment) => number> =
	{
		newest: (a, b) => b.number - a.number,
		oldest: (a, b) => a.number - b.number,
		title: (a, b) => a.title.localeCompare(b.title, "en"),
	};

export function listExperiments({ search, topic, sort }: ExperimentQuery) {
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
	const items = found
		.filter((experiment) => !topic || experiment.topics.includes(topic))
		.sort(order[sort]);
	return { items, found: found.length, counts };
}

export function experimentListingHref({
	search = "",
	topic = "",
	sort = "newest",
}: Partial<ExperimentQuery>) {
	const params = new URLSearchParams();
	if (search.trim()) params.set("search", search.trim());
	if (topic) params.set("topic", topic);
	if (sort !== "newest") params.set("sort", sort);
	return `/experiments${params.size ? `?${params}` : ""}`;
}
