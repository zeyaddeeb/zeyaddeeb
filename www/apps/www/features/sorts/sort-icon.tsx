import type { Kind } from "./sorts";

const paths: Record<Kind, { d: string; tone: string }> = {
	ring: {
		d: "M0 3.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM1 3.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0-1 0z",
		tone: "blue",
	},
	arch: {
		d: "M0 5V3.5a1.5 1.5 0 0 1 3 0V5H2V3.5a.5 .5 0 0 0-1 0V5z",
		tone: "red",
	},
	tall: { d: "M1 0h1v5H1z", tone: "ink" },
	short: { d: "M1 2h1v3H1z", tone: "ink" },
	dot: { d: "M1 .5a.5 .5 0 1 0 1 0a.5 .5 0 1 0-1 0z", tone: "red" },
};

export function SortIcon({ kind }: { kind: Kind }) {
	const { d, tone } = paths[kind];

	return (
		<svg
			className="os__icon"
			viewBox="0 0 3 5"
			aria-hidden="true"
			style={{ fill: `var(--${tone})` }}
		>
			<path d={d} fillRule="evenodd" />
		</svg>
	);
}
