export interface Word {
	text: string;
	yours: boolean;
}

const key = (word: string) =>
	word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

export const spoken = (text: string) =>
	text.trim().split(/\s+/).filter(Boolean);

function common(a: string[], b: string[]) {
	const run = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);

	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			run[i][j] =
				a[i] === b[j]
					? run[i + 1][j + 1] + 1
					: Math.max(run[i + 1][j], run[i][j + 1]);

	return run;
}

export function mark(original: string, current: string): Word[] {
	const words = spoken(current);
	const then = spoken(original).map(key);
	const now = words.map(key);
	const run = common(then, now);
	const yours = new Array<boolean>(now.length).fill(false);

	for (let i = 0, j = 0; i < then.length && j < now.length; ) {
		if (then[i] === now[j]) {
			yours[j] = then[i] !== "";
			i++;
			j++;
		} else if (run[i + 1][j] >= run[i][j + 1]) i++;
		else j++;
	}

	return words.map((text, index) => ({ text, yours: yours[index] }));
}

export const kept = (words: Word[]) => words.filter((w) => w.yours).length;
