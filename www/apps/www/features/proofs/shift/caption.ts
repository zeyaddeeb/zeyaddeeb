const LONGEST = 260;
const SHORT = 120;

export interface Caption {
	before: string | null;
	now: string;
	whole: boolean;
}

export function sentences(text: string): string[] {
	return text
		.replace(/\s+/g, " ")
		.trim()
		.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
		.filter(Boolean);
}

function clip(text: string): string {
	return text.length <= LONGEST
		? text
		: `…${text.slice(text.length - LONGEST + 1)}`;
}

export function caption(text: string): Caption | null {
	const all = sentences(text);
	if (!all.length) return null;
	const now = all[all.length - 1];
	const before = all.length > 1 ? all[all.length - 2] : null;
	const whole = all.length === 1 && now.length <= SHORT;
	return { before: before ? clip(before) : null, now: clip(now), whole };
}
