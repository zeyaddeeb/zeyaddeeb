import { dots } from "./card";

const R = 21;
const C = 28;

const at = (dial: number, count: number) => {
	const a = ((dial * (360 / count) - 90) * Math.PI) / 180;

	return [C + R * Math.cos(a), C + R * Math.sin(a)] as const;
};

export function Ring({
	card,
	pattern,
	marks,
	anti = false,
	className,
}: {
	card?: number;
	pattern?: readonly boolean[];
	marks?: Readonly<Record<number, "a" | "b">>;
	anti?: boolean;
	className?: string;
}) {
	const shown = pattern ?? dots(card ?? 0);
	const size = shown.length > 6 ? 3.6 : 6;

	return (
		<svg
			viewBox="0 0 56 56"
			className={className ?? "me-ring"}
			data-anti={anti || undefined}
			aria-hidden="true"
		>
			<circle cx={C} cy={C} r={R} className="me-ring__track" />
			{shown.map((black, dial) => {
				const [x, y] = at(dial, shown.length);
				const mark = marks?.[dial];

				return (
					<g key={dial}>
						{mark ? (
							<circle
								cx={x}
								cy={y}
								r={size + 2.2}
								className="me-ring__mark"
								data-lab={mark}
							/>
						) : null}
						<circle
							cx={x}
							cy={y}
							r={size}
							className="me-ring__dot"
							data-black={black}
						/>
					</g>
				);
			})}
		</svg>
	);
}
