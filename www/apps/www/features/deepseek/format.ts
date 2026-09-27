export const percent = (value: number) =>
	value >= 0.995
		? "100%"
		: value < 0.01
			? "<1%"
			: `${Math.round(value * 100)}%`;

export const count = (value: number) => value.toLocaleString("en-US");
