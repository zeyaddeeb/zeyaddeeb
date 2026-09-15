const paths = {
	right: "M4 12h16m-6-6 6 6-6 6",
	left: "M20 12H4m6-6-6 6 6 6",
	up: "M12 20V4m-6 6 6-6 6 6",
	down: "M12 4v16m-6-6 6 6 6-6",
	"up-right": "M5 19 19 5M7 5h12v12",
};

/** Decorative arrow; icon-only controls must provide their own accessible label. */
export function ArrowIcon({
	direction = "right",
	className,
}: {
	direction?: keyof typeof paths;
	className?: string;
}) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			className={className}
			style={{
				display: "inline-block",
				verticalAlign: "-0.125em",
				flexShrink: 0,
			}}
		>
			<path d={paths[direction]} />
		</svg>
	);
}
