import { pageNumber } from "@zeyaddeeb/ui/seo";
import { type ExperimentKind, experiments } from "./catalog";

export const EXPERIMENT_PAGE_SIZE = 6;
export const experimentFilters: { value: ExperimentKind; label: string }[] = [
	{ value: "wasm", label: "WebAssembly" },
	{ value: "network", label: "Realtime" },
	{ value: "mic", label: "Audio" },
	{ value: "dom", label: "Interfaces" },
	{ value: "remote", label: "External" },
];

export type ExperimentSearchParams = {
	search?: string | string[];
	type?: string | string[];
	page?: string | string[];
};

const first = (value: string | string[] | undefined) =>
	Array.isArray(value) ? value[0] : value;

export function listExperiments(params: ExperimentSearchParams) {
	const search = first(params.search)?.trim() ?? "";
	const type =
		experimentFilters.find((filter) => filter.value === first(params.type))
			?.value ?? "";
	const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
	const matches = experiments
		.filter((experiment) => {
			if (type && experiment.kind !== type) return false;
			const text = [experiment.title, experiment.line, ...experiment.stack]
				.join(" ")
				.toLowerCase();
			return terms.every((term) => text.includes(term));
		})
		.sort((a, b) => a.number - b.number);
	const total = matches.length;
	const totalPages = Math.max(1, Math.ceil(total / EXPERIMENT_PAGE_SIZE));
	const page = Math.min(pageNumber(first(params.page)), totalPages);
	const offset = (page - 1) * EXPERIMENT_PAGE_SIZE;
	return {
		search,
		type,
		page,
		total,
		totalPages,
		items: matches.slice(offset, offset + EXPERIMENT_PAGE_SIZE),
		from: total ? offset + 1 : 0,
		to: Math.min(offset + EXPERIMENT_PAGE_SIZE, total),
	};
}

export function experimentListingHref({
	search = "",
	type = "",
	page = 1,
}: {
	search?: string;
	type?: string;
	page?: number;
}) {
	const params = new URLSearchParams();
	if (search) params.set("search", search);
	if (type) params.set("type", type);
	if (page > 1) params.set("page", String(page));
	return `/experiments${params.size ? `?${params}` : ""}`;
}
