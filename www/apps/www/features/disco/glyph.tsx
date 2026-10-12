export type GlyphName =
	| "play"
	| "pause"
	| "stop"
	| "back"
	| "next"
	| "sound"
	| "muted"
	| "hide"
	| "close"
	| "note"
	| "pin";

const paths: Record<GlyphName, string> = {
	play: "M4 2.5v11l9-5.5z",
	pause: "M3.5 2.5h3.5v11H3.5zM9 2.5h3.5v11H9z",
	stop: "M3.5 3.5h9v9h-9z",
	back: "M3 3h2v10H3zM13 3v10L6 8z",
	next: "M11 3h2v10h-2zM3 3v10l7-5z",
	sound:
		"M2 6h3l4-3.5v11L5 10H2zM11 5.2a4 4 0 0 1 0 5.6zM12.4 3.2a7 7 0 0 1 0 9.6z",
	muted:
		"M2 6h3l4-3.5v11L5 10H2zM10.5 5.6l1.5 1.5 1.5-1.5 1 1L13 8.1l1.5 1.5-1 1L12 9.1l-1.5 1.5-1-1L11 8.1 9.5 6.6z",
	hide: "M3 11h10v2.5H3z",
	close:
		"M3.4 4.8l1.4-1.4L8 6.6l3.2-3.2 1.4 1.4L9.4 8l3.2 3.2-1.4 1.4L8 9.4l-3.2 3.2-1.4-1.4L6.6 8z",
	note: "M6 2.5l7-1.5v9.2a2.3 2 0 1 1-1.4-1.8V4.4L7.4 5.3v6.9a2.3 2 0 1 1-1.4-1.8z",
	pin: "M2 3h12v8H2zM3.5 4.5v5h9v-5zM8 6.5h4v2.5H8zM6 13h4v1.2H6z",
};

export function Glyph({ name, size = 16 }: { name: GlyphName; size?: number }) {
	return (
		<svg
			viewBox="0 0 16 16"
			width={size}
			height={size}
			fill="currentColor"
			aria-hidden="true"
		>
			<path d={paths[name]} />
		</svg>
	);
}

export function Triad({ size = 18 }: { size?: number }) {
	return (
		<svg viewBox="0 0 18 18" width={size} height={size} aria-hidden="true">
			<rect x="1" y="1" width="7.5" height="7.5" fill="#e83025" />
			<circle cx="13.2" cy="4.8" r="3.8" fill="#0089c8" />
			<path d="M1 17h7.5L4.75 10z" fill="#ffbc00" />
			<rect x="9.5" y="10" width="7.5" height="7" fill="#f5f2e9" />
		</svg>
	);
}
