type DateInput = Date | string | number;

export function formatShortDate(date: DateInput): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function formatLongDate(date: DateInput): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export function formatLocaleDate(date: DateInput): string {
	return new Date(date).toLocaleDateString();
}
