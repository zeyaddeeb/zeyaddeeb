export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const mw = (n: number) =>
	`${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} MW`;

export function ms(value: number): string {
	return value < 0.1
		? "under 0.1 ms"
		: `${value.toFixed(value < 10 ? 1 : 0)} ms`;
}

export function listing(items: string[]): string {
	if (items.length < 2) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
