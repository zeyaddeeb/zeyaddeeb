const LONGEST = 260;
const SHORT = 120;

export interface Caption {
	before: string | null;
	now: string;
	whole: boolean;
}

const MARKUP =
	/<tool_call>[\s\S]*?(?:<\/tool_call>|$)|<function=[\s\S]*?(?:<\/function>|$)|<\/?(?:think|tool_call)>/g;

const ELIDED = "{…}";

function objects(text: string): string {
	let out = "";
	let depth = 0;
	let start = 0;
	let quoted = false;
	let escaped = false;

	for (let at = 0; at < text.length; at++) {
		const c = text[at];

		if (depth === 0) {
			if (c === "{") {
				depth = 1;
				start = at;
			} else {
				out += c;
			}

			continue;
		}

		if (quoted) {
			if (escaped) escaped = false;
			else if (c === "\\") escaped = true;
			else if (c === '"') quoted = false;

			continue;
		}

		if (c === '"') quoted = true;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) {
			const span = text.slice(start, at + 1);

			out += span.includes('":') ? ELIDED : span;
		}
	}

	if (depth > 0) {
		const tail = text.slice(start);

		out += tail.includes('":') || tail.length < 3 ? ELIDED : tail;
	}

	return out;
}

export function unmarked(text: string): string {
	return objects(text.replace(MARKUP, " ")).trim();
}

export function sentences(text: string): string[] {
	return text
		.replace(/\s+/g, " ")
		.trim()
		.split(/(?<=[.!?])\s+(?=[A-Z0-9“"({])/)
		.filter(Boolean);
}

function clip(text: string): string {
	return text.length <= LONGEST
		? text
		: `…${text.slice(text.length - LONGEST + 1)}`;
}

export function caption(text: string): Caption | null {
	const all = sentences(text)
		.map((sentence) =>
			sentence.replaceAll(ELIDED, " ").replace(/\s+/g, " ").trim(),
		)
		.filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));

	if (!all.length) return null;

	const now = all[all.length - 1];
	const before = all.length > 1 ? all[all.length - 2] : null;
	const whole = all.length === 1 && now.length <= SHORT;

	return { before: before ? clip(before) : null, now: clip(now), whole };
}
